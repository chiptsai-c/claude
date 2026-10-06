from datetime import date
from pathlib import Path

import pytest

from scout.config import load_config
from scout.digest import render_html, subject
from scout.models import Candidate, CriterionScore
from scout.scoring import rank, weighted_score
from scout.state import SeenStore

CONFIG = load_config(Path(__file__).resolve().parent.parent / "config.toml")


def make(name: str, score: int, url: str | None = None) -> Candidate:
    return Candidate(
        name=name,
        headline="Automation engineer",
        location="Singapore",
        profile_url=url or f"https://github.com/{name.lower()}",
        evidence=["https://github.com/example/repo", "Speaker at Power Platform meetup"],
        criterion_scores=[CriterionScore(criterion=c.name, score=score, reason="ok") for c in CONFIG.rubric],
        outreach_hook="Loved your Copilot Studio demo.",
    )


def test_config_weights_add_up():
    assert sum(c.weight for c in CONFIG.rubric) == 100


def test_bad_weights_rejected(tmp_path):
    bad = Path(__file__).resolve().parent.parent.joinpath("config.toml").read_text().replace("weight = 25", "weight = 30")
    p = tmp_path / "c.toml"
    p.write_text(bad)
    with pytest.raises(ValueError, match="add up to 100"):
        load_config(p)


def test_weighted_score_bounds_and_clamping():
    assert weighted_score(make("Top", 5), CONFIG.rubric) == 100
    assert weighted_score(make("Zero", 0), CONFIG.rubric) == 0
    assert weighted_score(make("Over", 9), CONFIG.rubric) == 100  # clamped to 5


def test_missing_criteria_count_as_zero():
    c = make("Partial", 5)
    c.criterion_scores = c.criterion_scores[:1]  # only the 25% criterion
    assert weighted_score(c, CONFIG.rubric) == 25


def test_rank_filters_sorts_and_limits():
    ranked = rank([make("Low", 1), make("Mid", 3), make("High", 5)], CONFIG.rubric, 55, 1, CONFIG.location_terms)
    assert [r.candidate.name for r in ranked] == ["High"]


def test_seen_store_dedupes_and_expires(tmp_path):
    path = tmp_path / "seen.json"
    old = SeenStore(path, date(2026, 1, 1))
    old.add("https://GitHub.com/Alice/")
    old.save()
    assert "http://github.com/alice" in SeenStore(path, date(2026, 2, 1))
    assert "https://github.com/alice" not in SeenStore(path, date(2026, 6, 1))  # past 90 days


def test_digest_escapes_untrusted_text():
    c = make("Eve", 5)
    c.headline = "<script>alert(1)</script>"
    c.profile_url = "javascript:alert(1)"
    html = render_html(CONFIG, date(2026, 10, 6), rank([c], CONFIG.rubric, 0, 10, CONFIG.location_terms))
    assert "<script>" not in html
    assert 'href="javascript:' not in html


def test_empty_digest_and_subject():
    assert "No new candidates" in render_html(CONFIG, date(2026, 10, 6), [])
    assert subject(CONFIG, date(2026, 10, 6), 1) == "[Talent Scout] AI Associate: 1 new candidate – 06 Oct 2026"


@pytest.mark.parametrize(
    "location, kept",
    [("Singapore", True), ("Kuala Lumpur, MY", True), ("Makati City", True), ("Ho Chi Minh City", True),
     ("Australia", False), ("Not specified", False), ("", False)],
)
def test_rank_keeps_only_target_locations(location, kept):
    c = make("Loc", 5)
    c.location = location
    assert bool(rank([c], CONFIG.rubric, 0, 10, CONFIG.location_terms)) is kept
