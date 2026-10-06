/** Minimal views of content the adaptive engine needs. Packs carry more (text, options, hints). */
export type SkillDef = {
  id: string;
  name: string;
  prerequisites: string[];
  mandatory?: boolean;
};

export type ItemDef = {
  id: string;
  skillId: string;
  /** Item difficulty on the same logit scale as player ability (roughly -3 easy … +3 hard). */
  difficulty: number;
};

/** One player's ability estimate for one skill (Elo / 1-parameter IRT). */
export type SkillState = {
  skillId: string;
  theta: number;
  /** Number of answers that informed theta; shrinks the update step as it grows. */
  evidence: number;
  lastPracticedAt: number;
};

/** Spaced-repetition memory for one item (FSRS). Times are epoch ms. */
export type ReviewCard = {
  itemId: string;
  stability: number; // days until recall drops to 90%
  difficulty: number; // 1 (easy) … 10 (hard), FSRS memory difficulty
  lastReviewAt: number;
  dueAt: number;
  reps: number;
  lapses: number;
};

/** The only event the engine learns from. Stored immutably; state is replayed from these. */
export type AnswerEvent = {
  id: string; // unique per event (ULID in the app); duplicates are ignored
  at: number; // epoch ms
  itemId: string;
  /** 0..1 from the deterministic scorer: 1 correct, 0 wrong, in between for partial credit. */
  outcome: number;
  hintUsed?: boolean;
  ms?: number; // response time
};

export type LearnerState = {
  skills: Record<string, SkillState>;
  cards: Record<string, ReviewCard>;
  answered: number;
  correctSum: number;
};

/** FSRS rating: 1 again (forgot), 2 hard, 3 good, 4 easy. */
export type Grade = 1 | 2 | 3 | 4;

export const DAY_MS = 86_400_000;
