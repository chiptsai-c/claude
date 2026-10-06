import json
from datetime import date, timedelta
from pathlib import Path

RETENTION_DAYS = 90


def normalise_url(url: str) -> str:
    return url.strip().lower().removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/")


class SeenStore:
    """Profile URLs already sent, so nobody is repeated. Entries expire after 90 days."""

    def __init__(self, path: Path, today: date):
        self.path = path
        self.today = today
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        cutoff = today - timedelta(days=RETENTION_DAYS)
        self.seen = {url: day for url, day in data.items() if date.fromisoformat(day) >= cutoff}

    def __contains__(self, url: str) -> bool:
        return normalise_url(url) in self.seen

    def add(self, url: str) -> None:
        self.seen[normalise_url(url)] = self.today.isoformat()

    def urls(self) -> list[str]:
        return sorted(self.seen)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(dict(sorted(self.seen.items())), indent=2) + "\n", encoding="utf-8")
