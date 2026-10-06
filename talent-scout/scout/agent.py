from contextlib import contextmanager

import anthropic

from .config import Config
from .models import Candidate, Shortlist

MODEL = "claude-opus-5-5"
# Server-side fallback: if a safety classifier declines, the API re-runs the
# request on Anthropic's recommended fallback model instead of returning a refusal.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_CONTINUATIONS = 5

GUARDRAILS = """\
Rules you must follow:
- Use only public, professional information (portfolios, code, talks, articles, certifications).
- Do not collect personal email addresses, phone numbers, home addresses or photos.
- Never consider or mention age, gender, ethnicity, religion, nationality, marital status,
  health, or physical appearance. Judge only skills and evidence of work.
- Only include real people with a public profile URL you actually found in search results.
  Never invent a person, a link or a fact. Fewer good candidates beats a padded list.
- This is an associate role: skip anyone with more than about 5 years' experience or a
  lead, manager or architect title.
- Open each candidate's profile with web_fetch before including them. Include someone only
  if the profile itself states a location in one of the target countries; report that
  location exactly as written. Search snippets alone are not enough."""


class ScoutError(RuntimeError):
    pass


def _research_prompt(config: Config, exclude: list[str]) -> str:
    rubric = "\n".join(f"- {c.name} ({c.weight}%): {c.description}" for c in config.rubric)
    excluded = "\n".join(f"- {u}" for u in exclude) or "- (none)"
    return f"""You are a technical sourcer for the {config.team} team.

Find up to {config.candidates_per_day * 2} promising candidates for this role:

Role: {config.title}
Locations: {", ".join(config.locations)}
{config.summary}

Scoring rubric (score each criterion 0-5 from evidence you found):
{rubric}

Search broadly: vary queries by skill, tool, country and source, and include country or
city names (e.g. "Kuala Lumpur", "Manila", "Bangkok") and local community groups
(Power Platform user groups, Microsoft Student Ambassadors) in your queries. For each candidate give
name, headline, location, profile URL, 2-4 pieces of public evidence (with links), a 0-5
score and one-line reason per rubric criterion, and a one-line personalised outreach hook
that references their actual work.

Already sent on earlier days, so do not include:
{excluded}

{GUARDRAILS}"""


@contextmanager
def _api_errors(stage: str):
    try:
        yield
    except anthropic.APIStatusError as e:
        raise ScoutError(f"{stage}: API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ScoutError(f"{stage}: could not reach the API: {e}") from e


def _check_stop(message, stage: str) -> None:
    if message.stop_reason == "refusal":
        raise ScoutError(f"{stage}: the model declined the request")
    if message.stop_reason == "max_tokens":
        raise ScoutError(f"{stage}: output was cut off at max_tokens")


def research(client: anthropic.Anthropic, config: Config, exclude: list[str]) -> str:
    """Search the web and return free-text research notes on candidates."""
    messages = [{"role": "user", "content": _research_prompt(config, exclude)}]
    tools = [
        {
            "type": "web_search_20260209",
            "name": "web_search",
            "max_uses": 25,
            "allowed_domains": config.allowed_domains,
        },
        {
            # Opens candidate profiles to confirm location and seniority.
            "type": "web_fetch_20260209",
            "name": "web_fetch",
            "max_uses": 40,
            "allowed_domains": config.allowed_domains,
        },
    ]
    for _ in range(MAX_CONTINUATIONS + 1):
        with _api_errors("research"), client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            output_config={"effort": "high"},
            betas=[FALLBACK_BETA],
            fallbacks="default",
            tools=tools,
            messages=messages,
        ) as stream:
            message = stream.get_final_message()
        if message.stop_reason != "pause_turn":
            break
        # A long server-tool turn paused; send it back so the model resumes it.
        messages.append({"role": "assistant", "content": message.content})
    else:
        raise ScoutError("research: search turn still paused after retries")

    _check_stop(message, "research")
    notes = "\n".join(block.text for block in message.content if block.type == "text").strip()
    if not notes:
        raise ScoutError("research: no findings returned")
    return notes


def structure(client: anthropic.Anthropic, config: Config, notes: str) -> list[Candidate]:
    """Turn research notes into validated candidate records."""
    criteria = ", ".join(f'"{c.name}"' for c in config.rubric)
    with _api_errors("structure"):
        message = _parse(client, criteria, notes)
    _check_stop(message, "structure")
    return message.parsed_output.candidates


def _parse(client: anthropic.Anthropic, criteria: str, notes: str):
    return client.beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": "low"},
        betas=[FALLBACK_BETA],
        fallbacks="default",
        output_format=Shortlist,
        messages=[
            {
                "role": "user",
                "content": f"""Convert these sourcing notes into structured records.
Copy facts and URLs exactly; do not add anything that is not in the notes.
Drop any candidate without a profile URL. Use exactly these criterion names: {criteria}.

<notes>
{notes}
</notes>""",
            }
        ],
    )
