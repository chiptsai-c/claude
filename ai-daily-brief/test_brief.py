"""Tests for the model-independent parts of brief.py.

Run: uv run --with pytest --with feedparser --with httpx --with jinja2 --with pyyaml pytest -q
"""

from datetime import datetime, timedelta, timezone

import brief
from brief import Item

NOW = datetime.now(timezone.utc)


def item(i, title, link=None, hours=1, **kw):
    return Item(id=i, title=title, link=link or f"https://example.com/{i}", source="S",
                published=NOW - timedelta(hours=hours), group="g", **kw)


def test_parse_json_ignores_thinking_and_prose():
    reply = brief.strip_thinking('<think>{"bad": 1}</think>Sure! Here it is: [{"id": 0, "score": 7}] done')
    assert brief.parse_json(reply) == [{"id": 0, "score": 7}]
    assert brief.parse_json("no json here") is None


def test_dedupe_merges_near_duplicates_and_skips_history():
    items = [
        item(0, "Microsoft sets $10 default Copilot spend limit"),
        item(1, "Microsoft sets US$10 default Copilot spend limit", hours=2),
        item(2, "Malaysia tables AI Governance Bill", link="https://example.com/sent"),
        item(3, "Thailand opens AI sandbox"),
    ]
    kept = brief.dedupe(items, {"links": {"https://example.com/sent": "2026-10-01"}})
    assert [k.title for k in kept] == ["Microsoft sets $10 default Copilot spend limit", "Thailand opens AI sandbox"]
    assert [k.id for k in kept] == [0, 1]


def test_google_news_title_suffix_removed():
    assert brief.clean_title("Copilot gets cheaper - The Verge", "The Verge") == "Copilot gets cheaper"


def test_one_number_must_appear_in_its_source():
    class FakeLLM:
        def __init__(self, figure):
            self.figure = figure

        def chat(self, convs, max_tokens):
            if "TASK: WRITE ITEM" in convs[0][0]["content"]:
                return ['{"headline": "h", "summary": "s", "why": "w", "action": "a"}'] * len(convs)
            return ['{"exec_summary": ["a"], "one_number": {"figure": "%s", "text": "t", "item_id": 0}}' % self.figure]

    sections = {"act": [item(0, "Copilot reaches 30 million paid seats")], "know": [], "sea": [], "gov": []}
    assert brief.write(sections, FakeLLM("30 million"))["one_number"]["item"].id == 0
    assert brief.write(sections, FakeLLM("45 million"))["one_number"] is None


def test_select_respects_floors_and_caps():
    items = [item(i, f"t{i}", score=10 - i % 3, bucket="act") for i in range(10)]
    chosen = brief.select(items)["act"]
    assert len(chosen) == 4 and all(i.score >= 8 for i in chosen)


def test_history_is_pruned(monkeypatch):
    cfg = brief.Config(backend="mock", model="m", state_repo=None, email_to=None, gmail_user=None,
                       gmail_password=None, window_hours=24, tz=brief.ZoneInfo("Asia/Singapore"),
                       sources_path=None, out_dir=None, send=False, max_model_len=0, quantization=None)
    history = {"links": {"https://old": "2020-01-01"}, "titles": {}}
    brief.save_state(cfg, history, [item(0, "New story")], "<p></p>")
    assert "https://old" not in history["links"] and "https://example.com/0" in history["links"]
