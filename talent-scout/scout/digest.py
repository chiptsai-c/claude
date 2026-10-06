import os
import smtplib
from datetime import date
from email.message import EmailMessage
from html import escape

from .config import Config
from .models import RankedCandidate


def subject(config: Config, today: date, count: int) -> str:
    return f"[Talent Scout] {config.title}: {count} new candidate{'s' if count != 1 else ''} – {today:%d %b %Y}"


def _link(url: str, text: str | None = None) -> str:
    safe = escape(url, quote=True)
    if not safe.startswith(("https://", "http://")):
        return escape(text or url)
    return f'<a href="{safe}">{escape(text or url)}</a>'


def render_html(config: Config, today: date, ranked: list[RankedCandidate]) -> str:
    if not ranked:
        body = "<p>No new candidates met the bar today. The search will run again tomorrow.</p>"
    else:
        rows = []
        for i, r in enumerate(ranked, 1):
            c = r.candidate
            scores = "".join(
                f"<li><b>{escape(s.criterion)}</b> {max(0, min(5, s.score))}/5 – {escape(s.reason)}</li>"
                for s in c.criterion_scores
            )
            evidence = "".join(
                f"<li>{_link(e) if e.startswith('http') else escape(e)}</li>" for e in c.evidence
            )
            rows.append(f"""
<tr><td style="padding:16px 0;border-top:1px solid #ddd">
  <div style="font-size:16px"><b>{i}. {_link(c.profile_url, c.name)}</b>
    <span style="float:right;background:#0b5cad;color:#fff;border-radius:12px;padding:2px 10px">{r.score}/100</span></div>
  <div style="color:#555">{escape(c.headline)} · {escape(c.location)}</div>
  <div style="margin-top:8px"><i>Outreach idea:</i> {escape(c.outreach_hook)}</div>
  <details open><summary>Scores</summary><ul>{scores}</ul></details>
  <details><summary>Evidence</summary><ul>{evidence}</ul></details>
</td></tr>""")
        body = f'<table width="100%" cellspacing="0">{"".join(rows)}</table>'

    return f"""<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:auto;color:#222">
<h2 style="margin-bottom:4px">{escape(config.title)} – daily shortlist</h2>
<div style="color:#555">{today:%A %d %B %Y} · {escape(config.team)} · {escape(", ".join(config.locations))}</div>
{body}
<p style="font-size:12px;color:#777;border-top:1px solid #ddd;padding-top:8px">
AI-generated from public professional sources. Verify every profile before contacting anyone;
scores are a starting point, not a hiring decision. Handle under your local data-protection law (e.g. PDPA).
</p></body></html>"""


def send(config: Config, today: date, html: str, count: int) -> None:
    """Send through SMTP. Works with Microsoft 365 (smtp.office365.com:587) or Gmail with an app password."""
    msg = EmailMessage()
    msg["Subject"] = subject(config, today, count)
    msg["From"] = os.environ["EMAIL_FROM"]
    msg["To"] = os.environ["EMAIL_TO"]  # comma-separated for several people
    msg.set_content("This digest is HTML; open it in an email client that shows HTML.")
    msg.add_alternative(html, subtype="html")

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=60) as smtp:
        smtp.starttls()
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)
