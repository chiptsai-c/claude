# AI Daily Brief: open-model edition (Qwen 3.5 on Hugging Face)

A daily AI news briefing for SEA IT, written by **Qwen 3.5** running on your own Hugging Face GPU job. It is the open-model twin of the Claude routine: same sections, same "sources only from feeds" rule, emailed to you at 07:52 Singapore time.

```
HF Scheduled Job (GPU, once a day)
  ① collect   Google News + RSS feeds (sources.yaml), last 24 hours, incl. Thai/Bahasa/Vietnamese
  ② dedupe    drop stories already sent (history.json) and merge the same story across outlets
  ③ rank      Qwen scores every story 1–10 and sorts it into Act on / Know / SEA / Governance
  ④ write     Qwen summarises the top stories, using only the fetched text
  ⑤ deliver   Gmail email + HTML archive in your private HF dataset repo
```

Links, dates and publisher names always come from the feeds, never from the model. A "one number" statistic is dropped unless it really appears in its source.

## Files

| File | Purpose |
|---|---|
| `brief.py` | The whole pipeline. One self-contained script that `uv` runs with its dependencies. |
| `sources.yaml` | News sources. Upload it to the state repo, then edit it there without redeploying. |
| `test_brief.py` | Tests for the parts that don't need a model. |

## One-time setup (about 30 minutes)

1. **Hugging Face PRO.** Jobs need a PRO, Team or Enterprise plan. Upgrade at huggingface.co/subscribe/pro.
2. **Access token.** Settings → Access Tokens → *Fine-grained*, with **Jobs** (start/manage) and **write** access to your repos. On your computer:
   ```bash
   pip install -U huggingface_hub   # gives the `hf` command
   hf auth login                    # paste the token
   ```
3. **Gmail App Password.** Google Account → Security → 2-Step Verification (must be on) → App passwords → create one called "AI brief". Copy the 16 characters.
4. **State repo and sources.** Replace `YOUR_HF_USERNAME` throughout:
   ```bash
   hf repo create YOUR_HF_USERNAME/ai-daily-brief-state --repo-type dataset --private
   hf upload YOUR_HF_USERNAME/ai-daily-brief-state sources.yaml sources.yaml --repo-type dataset
   ```

## Test run (about 15 minutes, about US$0.45)

```bash
cd ai-daily-brief
export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"

hf jobs uv run brief.py \
  --flavor l40sx1 --timeout 45m --with "vllm>=0.17" \
  --secrets HF_TOKEN --secrets GMAIL_APP_PASSWORD \
  --env BRIEF_STATE_REPO=YOUR_HF_USERNAME/ai-daily-brief-state \
  --env BRIEF_EMAIL_TO=chipchai@gmail.com --env GMAIL_USER=chipchai@gmail.com
```

The command streams the job's logs, and the full brief is printed at the end. Your email should arrive in about 10–15 minutes: roughly 2 minutes to install, 3–5 to download and load the model, then the writing. Every run is listed at huggingface.co/jobs.

## Schedule it daily at 07:52 Singapore time

Hugging Face schedules in **UTC**: 07:52 SGT is 23:52 UTC the previous day.

```bash
hf jobs scheduled uv run "52 23 * * *" brief.py \
  --flavor l40sx1 --timeout 45m --with "vllm>=0.17" \
  --secrets HF_TOKEN --secrets GMAIL_APP_PASSWORD \
  --env BRIEF_STATE_REPO=YOUR_HF_USERNAME/ai-daily-brief-state \
  --env BRIEF_EMAIL_TO=chipchai@gmail.com --env GMAIL_USER=chipchai@gmail.com
```

Manage it with `hf jobs scheduled ps`, `suspend <id>`, `resume <id>` and `delete <id>`.

## Settings (`--env`)

| Variable | Default | Notes |
|---|---|---|
| `BRIEF_MODEL` | `Qwen/Qwen3.5-9B` | Any Qwen 3.5 model that fits the GPU |
| `BRIEF_BACKEND` | `vllm` | `vllm` (model runs on the job's GPU), `hf-api` (Inference Providers, CPU job, no `--with vllm`), `mock` (testing) |
| `BRIEF_STATE_REPO` | none | Private dataset repo for history, sources and the archive. Without it, nothing is remembered between runs. |
| `BRIEF_WINDOW_HOURS` | `24` | How far back to look for news |
| `BRIEF_QUANTIZATION` | none | Set `fp8` to halve model memory, for example on the cheaper `l4x1` GPU |
| `BRIEF_MAX_MODEL_LEN` | `16384` | Context length; lower it if the GPU runs out of memory |

## Choosing the GPU

| Flavor | GPU memory | About | Run time | Per month (daily) | Use when |
|---|---|---|---|---|---|
| `l40sx1` | 48 GB | US$1.80/h | ~12 min | ~US$11 | **Default.** 9B fits with room to spare |
| `l4x1` | 24 GB | US$0.80/h | ~15 min | ~US$6 | Cheapest; add `--env BRIEF_QUANTIZATION=fp8` |
| `cpu-basic` + `hf-api` | none | ~US$0.01/h | ~5 min | ~US$1–2 | Option A: bigger Qwen through the API, not run on your own GPU |

Prices are from the Hugging Face Jobs hardware list; check `hf jobs hardware` for current rates.

## Changing the news sources

Edit `sources.yaml` in the state repo on huggingface.co (or upload a new copy). The next run picks it up. Feeds that fail are listed in the email's coverage notes instead of stopping the run.

**Known limit:** Google News items carry only a headline and the publisher's name, so their summaries are short. Direct RSS feeds include article text and give richer summaries. A news-search API (Tavily, Brave) is the next upgrade if coverage feels thin.

## Testing without a GPU

```bash
uv run brief.py --backend mock --no-email --sources sources.yaml --out .
uv run --no-project --with pytest --with feedparser --with httpx --with jinja2 --with pyyaml python -m pytest -q
```

## When something goes wrong

| Symptom | Fix |
|---|---|
| Email says **FAILED** | The email contains the error. Most often it is a Gmail password typo: re-export it and recreate the schedule. |
| `CUDA out of memory` | Use `l40sx1`, or add `BRIEF_QUANTIZATION=fp8`, or lower `BRIEF_MAX_MODEL_LEN` |
| `Model architecture not supported` | Raise the vLLM pin: `--with "vllm>=0.31"` |
| No email at all | `hf jobs ps -a` lists runs; `hf jobs logs <id>` shows what happened. "Nothing new today" means every story was already sent. |
