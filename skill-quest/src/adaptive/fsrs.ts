import { DAY_MS, type Grade, type ReviewCard } from './types.ts';

/**
 * Spaced repetition using the FSRS-4.5 memory model with its published default parameters.
 * Stability S = days until recall probability falls to 90%.
 */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;
const w = (i: number): number => W[i]!;

const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(t = S) = 0.9
export const DEFAULT_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 365;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Probability the player still remembers the item `elapsedDays` after the last review. */
export function retrievabilityAfter(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function retrievability(card: ReviewCard, now: number): number {
  return retrievabilityAfter((now - card.lastReviewAt) / DAY_MS, card.stability);
}

/** Days until recall falls to the desired retention. */
export function intervalDays(stability: number, retention = DEFAULT_RETENTION): number {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(days, 0.01, MAX_INTERVAL_DAYS);
}

const initDifficulty = (g: Grade) => clamp(w(4) - (g - 3) * w(5), 1, 10);

function nextDifficulty(d: number, g: Grade): number {
  const moved = d - w(6) * (g - 3);
  return clamp(w(7) * initDifficulty(3) + (1 - w(7)) * moved, 1, 10); // mean reversion
}

function stabilityAfterRecall(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? w(15) : 1;
  const easy = g === 4 ? w(16) : 1;
  return s * (Math.exp(w(8)) * (11 - d) * Math.pow(s, -w(9)) * (Math.exp(w(10) * (1 - r)) - 1) * hard * easy + 1);
}

function stabilityAfterLapse(d: number, s: number, r: number): number {
  const sf = w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  return Math.min(sf, s); // forgetting never makes memory stronger
}

export function newCard(itemId: string, g: Grade, now: number, retention = DEFAULT_RETENTION): ReviewCard {
  const stability = w(g - 1);
  return {
    itemId,
    stability,
    difficulty: initDifficulty(g),
    lastReviewAt: now,
    dueAt: now + intervalDays(stability, retention) * DAY_MS,
    reps: 1,
    lapses: g === 1 ? 1 : 0,
  };
}

export function reviewCard(card: ReviewCard, g: Grade, now: number, retention = DEFAULT_RETENTION): ReviewCard {
  const r = retrievability(card, now);
  const stability = Math.max(0.01, g === 1
    ? stabilityAfterLapse(card.difficulty, card.stability, r)
    : stabilityAfterRecall(card.difficulty, card.stability, r, g));
  return {
    itemId: card.itemId,
    stability,
    difficulty: nextDifficulty(card.difficulty, g),
    lastReviewAt: now,
    dueAt: now + intervalDays(stability, retention) * DAY_MS,
    reps: card.reps + 1,
    lapses: card.lapses + (g === 1 ? 1 : 0),
  };
}

/** Turns a scored answer into an FSRS rating. Fast is decided by the caller (e.g. under the item's median time). */
export function gradeFromAnswer(outcome: number, opts: { hintUsed?: boolean; fast?: boolean } = {}): Grade {
  if (outcome < 0.5) return 1;
  if (opts.hintUsed || outcome < 0.8) return 2;
  if (opts.fast && outcome >= 1) return 4;
  return 3;
}
