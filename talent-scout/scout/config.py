import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Criterion:
    name: str
    weight: int
    description: str


@dataclass(frozen=True)
class Config:
    title: str
    team: str
    locations: list[str]
    summary: str
    rubric: list[Criterion]
    candidates_per_day: int
    minimum_score: int
    allowed_domains: list[str]


def load_config(path: Path) -> Config:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    rubric = [Criterion(**c) for c in raw["rubric"]]
    total = sum(c.weight for c in rubric)
    if total != 100:
        raise ValueError(f"Rubric weights must add up to 100, got {total} in {path}")
    role, search = raw["role"], raw["search"]
    return Config(
        title=role["title"],
        team=role["team"],
        locations=role["locations"],
        summary=role["summary"].strip(),
        rubric=rubric,
        candidates_per_day=search["candidates_per_day"],
        minimum_score=search["minimum_score"],
        allowed_domains=search["allowed_domains"],
    )
