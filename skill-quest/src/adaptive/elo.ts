import type { SkillState } from './types.ts';

/**
 * Starting step size, how fast it shrinks with evidence, and the floor that keeps the model responsive.
 * Tuned with the simulator: a lower floor lagged behind players who were still improving, so the
 * engine kept drilling skills they had already learned.
 */
const K_START = 1.0;
const K_DECAY = 0.05;
const K_MIN = 0.4;

/** A skill counts as mastered when a benchmark item (difficulty 0) is answered correctly 85% of the time… */
export const MASTERY_P = 0.85;
export const MASTERY_THETA = Math.log(MASTERY_P / (1 - MASTERY_P)); // ≈ 1.73
/** …with at least this many answers behind the estimate. */
export const MASTERY_MIN_EVIDENCE = 6;
/** Skills unlock once every prerequisite reaches this ability (≈ 62% on the benchmark item). */
export const UNLOCK_THETA = 0.5;

/** Predicted probability of a correct answer. */
export function pCorrect(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

export function kFactor(evidence: number): number {
  return Math.max(K_MIN, K_START / (1 + evidence * K_DECAY));
}

export function newSkillState(skillId: string, at: number): SkillState {
  return { skillId, theta: 0, evidence: 0, lastPracticedAt: at };
}

/** Elo update: move ability towards the evidence, by more when the answer was surprising. */
export function updateSkill(s: SkillState, difficulty: number, outcome: number, at: number): SkillState {
  const p = pCorrect(s.theta, difficulty);
  return {
    skillId: s.skillId,
    theta: s.theta + kFactor(s.evidence) * (outcome - p),
    evidence: s.evidence + 1,
    lastPracticedAt: Math.max(s.lastPracticedAt, at),
  };
}

/** 0..1 mastery for the mastery map: chance of answering the benchmark item. */
export function mastery(s: SkillState | undefined): number {
  return s ? pCorrect(s.theta, 0) : 0;
}

export function isMastered(s: SkillState | undefined): boolean {
  return !!s && s.theta >= MASTERY_THETA && s.evidence >= MASTERY_MIN_EVIDENCE;
}
