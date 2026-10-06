from .config import Criterion
from .models import Candidate, RankedCandidate


def weighted_score(candidate: Candidate, rubric: list[Criterion]) -> int:
    """Weighted 0-100 score, computed here rather than trusting the model's arithmetic.

    Criteria the model did not score count as 0.
    """
    by_name = {s.criterion.strip().lower(): max(0, min(5, s.score)) for s in candidate.criterion_scores}
    total = sum(c.weight * by_name.get(c.name.lower(), 0) / 5 for c in rubric)
    return round(total)


def rank(
    candidates: list[Candidate], rubric: list[Criterion], minimum_score: int, limit: int
) -> list[RankedCandidate]:
    ranked = [RankedCandidate(candidate=c, score=weighted_score(c, rubric)) for c in candidates]
    ranked = [r for r in ranked if r.score >= minimum_score]
    ranked.sort(key=lambda r: r.score, reverse=True)
    return ranked[:limit]
