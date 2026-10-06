from pydantic import BaseModel


class CriterionScore(BaseModel):
    criterion: str
    score: int  # 0-5
    reason: str


class Candidate(BaseModel):
    name: str
    headline: str
    location: str
    profile_url: str
    evidence: list[str]  # public links or facts backing the scores
    criterion_scores: list[CriterionScore]
    outreach_hook: str  # one line a recruiter could open a message with


class Shortlist(BaseModel):
    candidates: list[Candidate]


class RankedCandidate(BaseModel):
    candidate: Candidate
    score: int  # weighted, 0-100
