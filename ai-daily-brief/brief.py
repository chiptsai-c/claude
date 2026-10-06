# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "feedparser>=6.0",
#     "httpx>=0.27",
#     "jinja2>=3.1",
#     "pyyaml>=6.0",
#     "huggingface_hub>=0.34",
#     "trafilatura>=1.12",
# ]
# ///
"""AI Daily Brief, open-model edition.

Collects AI news from RSS feeds, ranks and summarises it with Qwen 3.5 running
on a Hugging Face Jobs GPU (vLLM), then emails the briefing and archives it to a
private Hugging Face dataset repo.

Design rule: every link, date and source name comes from the feeds. The model
only scores and summarises the text it is given, so it cannot invent sources.

Backends (BRIEF_BACKEND or --backend):
  vllm    run the model on the job's GPU (default; add `--with "vllm>=0.17"` to the job)
  hf-api  call the model through Hugging Face Inference Providers (no GPU needed)
  mock    canned answers, for testing the pipeline without a model
"""

from __future__ import annotations

import argparse
import calendar
import difflib
import html
import json
import os
import re
import smtplib
import sys
import tempfile
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import feedparser
import httpx
import yaml
from jinja2 import Environment

READER = (
    "a Senior Manager in SEA (Southeast Asia) IT whose focus is AI adoption, AI governance, "
    "automation/RPA, Microsoft 365 Copilot, Copilot Studio, Power Platform, ServiceNow, "
    "SharePoint and operational excellence across Singapore, Malaysia, Thailand, Indonesia, "
    "Vietnam and the Philippines"
)
BUCKETS = ("act", "know", "sea", "gov", "skip")
SEA_COUNTRIES = {"SG": "Singapore", "MY": "Malaysia", "TH": "Thailand",
                 "ID": "Indonesia", "VN": "Vietnam", "PH": "Philippines"}
USER_AGENT = "Mozilla/5.0 (compatible; ai-daily-brief/1.0)"
HISTORY_DAYS = 21


@dataclass
class Item:
    id: int
    title: str
    link: str
    source: str
    published: datetime
    group: str
    country: str | None = None
    snippet: str = ""
    text: str = ""
    score: int = 0
    bucket: str = "skip"
    writeup: dict = field(default_factory=dict)


@dataclass
class Config:
    backend: str
    model: str
    state_repo: str | None
    email_to: str | None
    gmail_user: str | None
    gmail_password: str | None
    window_hours: int
    tz: ZoneInfo
    sources_path: str | None
    out_dir: Path
    send: bool
    max_model_len: int
    quantization: str | None


# ---------------------------------------------------------------- collection

def google_news_url(query: str, edition: str = "SG:en") -> str:
    country, lang = edition.split(":")
    hl = lang if lang != "en" else f"en-{country}"
    return (f"https://news.google.com/rss/search?q={quote_plus(f'({query}) when:1d')}"
            f"&hl={hl}&gl={country}&ceid={country}:{lang}")


def fetch(url: str) -> bytes:
    if not url.startswith(("http://", "https://")):
        return Path(url).read_bytes()
    resp = httpx.get(url, timeout=20, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return resp.content


def strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", text or "")).strip()


def clean_title(title: str, source: str) -> str:
    # Google News appends " - Publisher" to every headline.
    if source and title.endswith(f" - {source}"):
        title = title[: -len(source) - 3]
    return re.sub(r"\s+", " ", title).strip()


def entry_time(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        if entry.get(key):
            return datetime.fromtimestamp(calendar.timegm(entry[key]), tz=timezone.utc)
    return None


def collect(sources: dict, window_hours: int) -> tuple[list[Item], list[str]]:
    feeds = [
        {**q, "url": google_news_url(q["query"], q.get("edition", "SG:en")), "name": f"Google News: {q['query']}"}
        for q in sources.get("google_news", [])
    ] + [{**f, "name": f.get("name", f["url"])} for f in sources.get("feeds", [])]

    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    items: list[Item] = []
    failed: list[str] = []
    for feed in feeds:
        try:
            parsed = feedparser.parse(fetch(feed["url"]))
        except Exception as exc:  # one bad feed must not stop the run
            failed.append(f"{feed['name']} ({type(exc).__name__})")
            continue
        if parsed.bozo and not parsed.entries:
            failed.append(f"{feed['name']} (unreadable)")
            continue
        for entry in parsed.entries:
            published = entry_time(entry)
            if not published or published < cutoff or not entry.get("link"):
                continue
            source = (entry.get("source") or {}).get("title") or parsed.feed.get("title", feed["name"])
            items.append(Item(
                id=len(items),
                title=clean_title(entry.get("title", ""), source),
                link=entry["link"],
                source=source,
                published=published,
                group=feed.get("group", "general"),
                country=feed.get("country"),
                snippet=strip_tags(entry.get("summary", ""))[:600],
            ))
    return items, failed


def title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", title.lower())


def dedupe(items: list[Item], history: dict) -> list[Item]:
    """Drop stories already emailed, and merge the same story from several outlets."""
    sent_links = set(history.get("links", {}))
    sent_titles = list(history.get("titles", {}))
    kept: list[Item] = []
    for item in sorted(items, key=lambda i: i.published, reverse=True):
        key = title_key(item.title)
        if item.link in sent_links or not key:
            continue
        if any(difflib.SequenceMatcher(None, key, t).ratio() > 0.8 for t in sent_titles):
            continue
        if any(difflib.SequenceMatcher(None, key, title_key(k.title)).ratio() > 0.8 for k in kept):
            continue
        kept.append(item)
    for new_id, item in enumerate(kept):
        item.id = new_id
    return kept


def enrich(items: list[Item], limit: int = 25) -> None:
    """Pull article text for direct publisher links (Google News links are redirects)."""
    import trafilatura

    for item in items[:limit]:
        if "news.google.com" in item.link:
            continue
        try:
            item.text = (trafilatura.extract(fetch(item.link).decode("utf-8", "ignore")) or "")[:3000]
        except Exception:
            pass


# ---------------------------------------------------------------- models

def strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


class VLLMBackend:
    def __init__(self, cfg: Config):
        from vllm import LLM, SamplingParams

        self._params = SamplingParams
        self.llm = LLM(
            model=cfg.model,
            max_model_len=cfg.max_model_len,
            gpu_memory_utilization=0.90,
            enforce_eager=True,  # skips graph capture: faster start for a once-a-day run
            limit_mm_per_prompt={"image": 0, "video": 0},  # text only; frees vision memory
            quantization=cfg.quantization,
        )

    def chat(self, conversations: list[list[dict]], max_tokens: int) -> list[str]:
        params = self._params(temperature=0.2, top_p=0.9, max_tokens=max_tokens)
        outputs = self.llm.chat(conversations, params, use_tqdm=False,
                                chat_template_kwargs={"enable_thinking": False})
        return [strip_thinking(o.outputs[0].text) for o in outputs]


class HFAPIBackend:
    def __init__(self, cfg: Config):
        from huggingface_hub import InferenceClient

        self.client = InferenceClient(model=cfg.model)

    def chat(self, conversations: list[list[dict]], max_tokens: int) -> list[str]:
        return [
            strip_thinking(self.client.chat_completion(messages=c, max_tokens=max_tokens,
                                                       temperature=0.2).choices[0].message.content)
            for c in conversations
        ]


class MockBackend:
    """Deterministic stand-in so the pipeline can be tested on any machine."""

    def __init__(self, cfg: Config):
        pass

    def chat(self, conversations: list[list[dict]], max_tokens: int) -> list[str]:
        answers = []
        for conv in conversations:
            task, user = conv[0]["content"], conv[-1]["content"]
            if "TASK: RANK" in task:
                ids = [int(i) for i in re.findall(r"^\[(\d+)\]", user, flags=re.M)]
                answers.append(json.dumps([
                    {"id": i, "score": 9 - i % 5, "bucket": ("act", "know", "sea", "gov", "know")[i % 5]}
                    for i in ids
                ]))
            elif "TASK: WRITE ITEM" in task:
                title = re.search(r"Headline: (.*)", user).group(1)
                answers.append(json.dumps({"headline": title, "summary": f"Mock summary of: {title}.",
                                           "why": "Mock relevance note.", "action": "Mock action."}))
            else:
                first = int(re.search(r"^\[(\d+)\]", user, flags=re.M).group(1))
                answers.append(json.dumps({
                    "exec_summary": ["Mock point one.", "Mock point two.", "Mock point three."],
                    "opportunity": {"idea": "Mock idea", "value": "Mock value", "effort": "S",
                                    "first_step": "Mock step"},
                    "one_number": {"figure": "42", "text": "Mock statistic", "item_id": first},
                }))
        return answers


BACKENDS = {"vllm": VLLMBackend, "hf-api": HFAPIBackend, "mock": MockBackend}


def parse_json(text: str):
    """Return the first JSON object or array in a model reply, or None."""
    for start, ch in enumerate(text):
        if ch in "[{":
            try:
                return json.JSONDecoder().raw_decode(text[start:])[0]
            except json.JSONDecodeError:
                continue
    return None


# ---------------------------------------------------------------- ranking and writing

RANK_SYSTEM = f"""TASK: RANK
You rank AI news for {READER}.
For every story, return a score from 1 to 10 and one bucket:
- act: affects their roadmap, licensing, cost, security risk or compliance
- sea: news about one of the six SEA countries or ASEAN
- gov: AI regulation, governance or standards
- know: useful awareness only
- skip: consumer gadgets, hype, rumours, or off-topic
Microsoft, ServiceNow, AI governance and SEA news score higher.
Answer with JSON only: [{{"id": <id>, "score": <1-10>, "bucket": "<bucket>"}}, ...] covering every id."""

WRITE_SYSTEM = f"""TASK: WRITE ITEM
You write one item of a daily AI briefing for {READER}.
Use ONLY the facts in the text provided. Never add numbers, names or dates that are not in it.
If the text is thin, keep the summary short rather than guessing. Write in English even if the source is not.
Answer with JSON only:
{{"headline": "<max 12 words>", "summary": "<1-2 sentences>",
  "why": "<why it matters to SEA IT, 1 sentence>", "action": "<suggested action, 1 sentence, or empty>"}}"""

OVERVIEW_SYSTEM = f"""TASK: OVERVIEW
You write the top of a daily AI briefing for {READER}, from the numbered items given.
Use ONLY those items. Answer with JSON only:
{{"exec_summary": ["<3 bullets a director reads in 20 seconds>"],
  "opportunity": {{"idea": "<one automation or AI idea for SEA IT inspired by today's news>",
                  "value": "<business value>", "effort": "S|M|L", "first_step": "<first step>"}},
  "one_number": {{"figure": "<a number that appears in an item>", "text": "<what it measures>", "item_id": <id>}}
}}
If no item contains a quotable number, set "one_number" to null."""


def describe(item: Item, with_text: bool = False) -> str:
    where = f" | {SEA_COUNTRIES.get(item.country, item.country)}" if item.country else ""
    body = item.text if with_text and item.text else item.snippet
    return (f"[{item.id}] {item.title}\nSource: {item.source} | {item.published:%d %b %Y}"
            f" | topic: {item.group}{where}\n{body[:400 if not with_text else 3000]}")


def rank(items: list[Item], llm, chunk: int = 30) -> None:
    batches = [items[i:i + chunk] for i in range(0, len(items), chunk)]
    convs = [[{"role": "system", "content": RANK_SYSTEM},
              {"role": "user", "content": "\n\n".join(describe(i) for i in batch)}] for batch in batches]
    by_id = {i.id: i for i in items}
    for reply in llm.chat(convs, max_tokens=4000):
        for row in parse_json(reply) or []:
            item = by_id.get(row.get("id")) if isinstance(row, dict) else None
            if item:
                try:
                    item.score = max(0, min(10, int(row.get("score", 0))))
                except (TypeError, ValueError):
                    item.score = 0
                item.bucket = row.get("bucket") if row.get("bucket") in BUCKETS else "know"
    for item in items:  # country-tagged stories land in the SEA section unless they need action
        if item.country and item.bucket == "know" and item.score >= 5:
            item.bucket = "sea"


def select(items: list[Item]) -> dict[str, list[Item]]:
    ranked = sorted(items, key=lambda i: i.score, reverse=True)
    limits = {"act": (8, 4), "sea": (5, 5), "gov": (6, 3), "know": (6, 6)}
    return {b: [i for i in ranked if i.bucket == b and i.score >= floor][:cap]
            for b, (floor, cap) in limits.items()}


def write(sections: dict[str, list[Item]], llm) -> dict:
    chosen = [i for items in sections.values() for i in items]
    convs = [[{"role": "system", "content": WRITE_SYSTEM},
              {"role": "user", "content": f"Headline: {i.title}\n{describe(i, with_text=True)}"}] for i in chosen]
    for item, reply in zip(chosen, llm.chat(convs, max_tokens=400)):
        data = parse_json(reply)
        item.writeup = data if isinstance(data, dict) else {"headline": item.title, "summary": "", "why": "", "action": ""}
    if not chosen:
        return {}
    listing = "\n".join(f"[{i.id}] {i.writeup.get('headline', i.title)}: {i.writeup.get('summary', '')}" for i in chosen)
    overview = parse_json(llm.chat([[{"role": "system", "content": OVERVIEW_SYSTEM},
                                     {"role": "user", "content": listing}]], max_tokens=800)[0]) or {}
    number = overview.get("one_number")
    if isinstance(number, dict):  # a number only counts if it really appears in that item
        source = next((i for i in chosen if i.id == number.get("item_id")), None)
        haystack = f"{source.title} {source.snippet} {source.text}" if source else ""
        if not source or str(number.get("figure", "")).strip() not in haystack:
            overview["one_number"] = None
        else:
            number["item"] = source
    return overview


# ---------------------------------------------------------------- output

TEMPLATE = """<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:740px">
<h1 style="font-size:20px;margin-bottom:2px">AI Daily Brief: {{ date }}</h1>
<p style="color:#666;margin-top:0">Open-model edition · {{ model }} · {{ total }} stories scanned</p>
{% if overview.exec_summary %}<h2>Executive summary</h2><ul>{% for b in overview.exec_summary %}<li>{{ b }}</li>{% endfor %}</ul>{% endif %}
{% for key, title in headings %}{% if sections[key] %}<h2>{{ title }}</h2>
{% for i in sections[key] %}<p><b>{% if i.country %}[{{ countries.get(i.country, i.country) }}] {% endif %}{{ i.writeup.headline or i.title }}</b>
<span style="color:#666">({{ i.published.strftime('%d %b') }}, {{ i.source }})</span><br>
{% if i.writeup.summary %}{{ i.writeup.summary }}<br>{% endif %}
{% if key in ('act', 'sea', 'gov') and i.writeup.why %}<b>Why it matters to SEA IT:</b> {{ i.writeup.why }}<br>{% endif %}
{% if key == 'act' and i.writeup.action %}<b>Suggested action:</b> {{ i.writeup.action }}<br>{% endif %}
<a href="{{ i.link }}">Source</a></p>{% endfor %}{% endif %}{% endfor %}
{% if overview.opportunity %}<h2>💡 Opportunity of the day</h2>
<p><b>{{ overview.opportunity.idea }}</b><br>Value: {{ overview.opportunity.value }} · Effort: {{ overview.opportunity.effort }} · First step: {{ overview.opportunity.first_step }}</p>{% endif %}
{% if overview.one_number %}<h2>📊 One number</h2><p><b>{{ overview.one_number.figure }}</b>: {{ overview.one_number.text }} (<a href="{{ overview.one_number.item.link }}">{{ overview.one_number.item.source }}</a>)</p>{% endif %}
<p style="color:#666;font-size:12px"><b>Coverage notes:</b> {{ coverage }}<br>
Generated automatically by {{ model }} from linked sources. Summaries can be wrong; verify before external use.</p>
</div>"""

HEADINGS = [("act", "🔴 Act on"), ("know", "🟡 Know"), ("sea", "🌏 SEA markets"),
            ("gov", "🧭 Governance & regulatory watch")]


def render(cfg: Config, sections, overview, total: int, coverage: str) -> tuple[str, str, str]:
    today = datetime.now(cfg.tz)
    date = f"{today:%a} {today.day} {today:%b %Y}"
    page = Environment(autoescape=True).from_string(TEMPLATE).render(
        date=date, model=cfg.model.split("/")[-1], total=total, overview=overview, sections=sections,
        headings=HEADINGS, countries=SEA_COUNTRIES, coverage=coverage)
    subject = (f"[Qwen] AI Daily Brief — {date} | {len(sections['act'])} to act on, "
               f"{len(sections['know']) + len(sections['sea']) + len(sections['gov'])} to know")
    lines = [subject, ""]
    for key, title in HEADINGS:
        for i in sections[key]:
            lines.append(f"- [{title}] {i.writeup.get('headline') or i.title} ({i.source}) {i.link}")
    return subject, page, "\n".join(lines)


def send_email(cfg: Config, subject: str, page: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, cfg.gmail_user, cfg.email_to
    msg.set_content(text)
    msg.add_alternative(page, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(cfg.gmail_user, cfg.gmail_password)
        smtp.send_message(msg)


# ---------------------------------------------------------------- state (HF dataset repo)

def load_state(cfg: Config) -> tuple[dict, dict]:
    """Return (history, sources). Sources come from --sources, else the state repo."""
    history: dict = {}
    sources_text = Path(cfg.sources_path).read_text() if cfg.sources_path else None
    if cfg.state_repo:
        from huggingface_hub import create_repo, hf_hub_download
        from huggingface_hub.errors import EntryNotFoundError

        create_repo(cfg.state_repo, repo_type="dataset", private=True, exist_ok=True)
        for name in ("history.json", "sources.yaml"):
            try:
                path = hf_hub_download(cfg.state_repo, name, repo_type="dataset")
            except EntryNotFoundError:
                continue
            if name == "history.json":
                history = json.loads(Path(path).read_text())
            elif sources_text is None:
                sources_text = Path(path).read_text()
    if sources_text is None:
        local = Path(__file__).with_name("sources.yaml")
        if not local.exists():
            raise FileNotFoundError("No sources.yaml: upload it to the state repo or pass --sources")
        sources_text = local.read_text()
    return history, yaml.safe_load(sources_text)


def save_state(cfg: Config, history: dict, sent: list[Item], page: str) -> None:
    today = datetime.now(cfg.tz).date()
    floor = (today - timedelta(days=HISTORY_DAYS)).isoformat()
    for kind, values in (("links", [i.link for i in sent]), ("titles", [title_key(i.title) for i in sent])):
        kept = {k: d for k, d in history.get(kind, {}).items() if d >= floor}
        kept.update(dict.fromkeys(values, today.isoformat()))
        history[kind] = kept
    if not cfg.state_repo:
        return
    from huggingface_hub import CommitOperationAdd, HfApi

    HfApi().create_commit(
        cfg.state_repo, repo_type="dataset", commit_message=f"Brief {today}",
        operations=[CommitOperationAdd("history.json", json.dumps(history, indent=1).encode()),
                    CommitOperationAdd(f"archive/{today}.html", page.encode())])


# ---------------------------------------------------------------- main

def config_from(args) -> Config:
    env = os.environ.get
    return Config(
        backend=args.backend or env("BRIEF_BACKEND", "vllm"),
        model=env("BRIEF_MODEL", "Qwen/Qwen3.5-9B"),
        state_repo=env("BRIEF_STATE_REPO"),
        email_to=env("BRIEF_EMAIL_TO"),
        gmail_user=env("GMAIL_USER"),
        gmail_password=env("GMAIL_APP_PASSWORD"),
        window_hours=args.window_hours or int(env("BRIEF_WINDOW_HOURS", "24")),
        tz=ZoneInfo(env("BRIEF_TZ", "Asia/Singapore")),
        sources_path=args.sources,
        out_dir=Path(args.out or tempfile.gettempdir()),
        send=not args.no_email,
        max_model_len=int(env("BRIEF_MAX_MODEL_LEN", "16384")),
        quantization=env("BRIEF_QUANTIZATION") or None,
    )


def run(cfg: Config) -> None:
    history, sources = load_state(cfg)
    items, failed = collect(sources, cfg.window_hours)
    total = len(items)
    items = dedupe(items, history)
    print(f"Collected {total} stories, {len(items)} new after de-duplication, {len(failed)} feeds failed")
    if not items:
        print("Nothing new today; no email sent.")
        return

    llm = BACKENDS[cfg.backend](cfg)
    rank(items, llm)
    sections = select(items)
    chosen = [i for v in sections.values() for i in v]
    enrich(chosen)
    overview = write(sections, llm)

    empty = [n for c, n in SEA_COUNTRIES.items() if not any(i.country == c for i in sections["sea"])]
    coverage = "; ".join(filter(None, [
        f"no SEA items for {', '.join(empty)}" if empty else "",
        f"feeds failed: {', '.join(failed)}" if failed else "",
    ])) or "all feeds read"
    subject, page, text = render(cfg, sections, overview, total, coverage)

    out = cfg.out_dir / f"brief-{datetime.now(cfg.tz):%Y-%m-%d}.html"
    out.write_text(page)
    print(f"\n{text}\n\nSaved {out}")
    if cfg.send:
        send_email(cfg, subject, page, text)
        print(f"Emailed {cfg.email_to}")
    save_state(cfg, history, chosen, page)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--backend", choices=sorted(BACKENDS))
    parser.add_argument("--sources", help="sources.yaml to use instead of the one in the state repo")
    parser.add_argument("--window-hours", type=int)
    parser.add_argument("--out", help="folder for the HTML copy (default: temp folder)")
    parser.add_argument("--no-email", action="store_true", help="build the brief but do not send it")
    cfg = config_from(parser.parse_args())
    if cfg.send and not (cfg.email_to and cfg.gmail_user and cfg.gmail_password):
        parser.error("set BRIEF_EMAIL_TO, GMAIL_USER and GMAIL_APP_PASSWORD, or pass --no-email")
    try:
        run(cfg)
    except Exception:
        error = traceback.format_exc()
        print(error, file=sys.stderr)
        if cfg.send:
            try:
                send_email(cfg, "[Qwen] AI Daily Brief FAILED", f"<pre>{html.escape(error)}</pre>", error)
            except Exception:
                pass
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
