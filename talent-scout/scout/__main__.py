import argparse
import sys
from datetime import date
from pathlib import Path

import anthropic

from . import agent, digest
from .config import load_config
from .scoring import rank
from .state import SeenStore

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Find, rank and email today's candidates.")
    parser.add_argument("--config", type=Path, default=ROOT / "config.toml")
    parser.add_argument("--state", type=Path, default=ROOT / "state" / "seen.json")
    parser.add_argument("--dry-run", action="store_true", help="write the email to output/ instead of sending it")
    args = parser.parse_args()

    today = date.today()
    config = load_config(args.config)
    seen = SeenStore(args.state, today)
    client = anthropic.Anthropic()

    try:
        notes = agent.research(client, config, exclude=seen.urls())
        candidates = agent.structure(client, config, notes)
    except agent.ScoutError as e:
        print(f"Scout failed: {e}", file=sys.stderr)
        return 1

    fresh = [c for c in candidates if c.profile_url not in seen]
    ranked = rank(fresh, config.rubric, config.minimum_score, config.candidates_per_day, config.location_terms)
    html = digest.render_html(config, today, ranked)
    print(f"Found {len(candidates)}, new {len(fresh)}, shortlisted {len(ranked)}")

    if args.dry_run:
        out = ROOT / "output" / f"digest-{today.isoformat()}.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"Dry run: wrote {out}")
        return 0

    digest.send(config, today, html, len(ranked))
    for r in ranked:
        seen.add(r.candidate.profile_url)
    seen.save()
    print("Email sent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
