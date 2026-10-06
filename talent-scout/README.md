# Talent Scout – AI Associate

An agent that runs every weekday morning. It searches public professional sources for **AI Associate** candidates across SEA, scores each one against a weighted skills rubric, and emails a ranked shortlist of up to 10 new people.

## How it works
| Step | What happens |
|---|---|
| 1. Search | Claude searches the web (up to 25 searches) and opens candidate profiles (up to 40) to confirm location and seniority. Both are limited to the sites in `config.toml`. It skips anyone already sent in the last 90 days. |
| 2. Structure | The findings are turned into validated records: name, profile, evidence links, a 0–5 score per criterion, and an outreach idea. |
| 3. Rank | The code (not the model) drops anyone whose stated location isn't in a target country, computes the weighted 0–100 score, drops anyone below `minimum_score`, and keeps the top 10. |
| 4. Email | An HTML digest goes out by SMTP. The URLs that were sent are saved in `state/seen.json` so nobody repeats. |

## Set up (about 15 minutes)
1. **API key:** create one at console.anthropic.com and add it as the repo secret `ANTHROPIC_API_KEY`.
2. **Email:** add these repo secrets (Settings → Secrets and variables → Actions):

   | Secret | Microsoft 365 example | Gmail example |
   |---|---|---|
   | `SMTP_HOST` | `smtp.office365.com` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` | `587` |
   | `SMTP_USER` / `EMAIL_FROM` | a service mailbox | your address |
   | `SMTP_PASSWORD` | mailbox password (SMTP AUTH must be enabled for it) | an [app password](https://myaccount.google.com/apppasswords) |
   | `EMAIL_TO` | `you@company.com, hiring.manager@company.com` | |
3. **Test it:** Actions → Talent Scout → Run workflow → tick **dry run**. The email is attached to the run as a downloadable artifact, and nothing is sent.
4. Run it again without dry run to send it for real. After that it runs on its own at 08:52 SGT, Monday to Friday.

## Change what it looks for
Edit `config.toml`: the role summary, the countries and cities, the rubric (weights must add up to 100), candidates per day, the minimum score, and the allowed sites. No code changes are needed. Every allowed site must accept Claude's crawler; `stackoverflow.com`, for example, does not, and makes the run fail.

## Run locally
```bash
cd talent-scout
pip install -r requirements.txt pytest
python -m pytest -q                 # offline tests
export ANTHROPIC_API_KEY=...
python -m scout --dry-run           # writes output/digest-<date>.html
```

## Guardrails built in
- **Public, professional sources only.** LinkedIn is excluded because its terms prohibit automated collection; use Recruiter by hand for that channel.
- **No sensitive data.** The agent is told not to collect personal emails, phone numbers or photos, and never to consider age, gender, ethnicity, religion, nationality, health or appearance.
- **No invented people.** Every candidate needs a profile URL found in search results. The email links to the evidence so a person can check it.
- **Human in the loop.** The digest is a starting point. A recruiter verifies each profile before any outreach.
- **Data minimisation.** Only profile URLs are kept, and they are removed after 90 days.

## Cost
Roughly US$0.50–2 per run, depending on how much it searches (25 searches at $10 per 1,000, plus model tokens). That works out to about US$10–40 a month on weekdays.
