import type { SkillDef } from '../adaptive/types.ts';

/** Challenge formats. Each item is one of these plus the shared fields in PackItem. */
export type Challenge =
  | { type: 'choice'; options: string[]; answer: number }
  | { type: 'multi'; options: string[]; answer: number[] }
  | { type: 'truefalse'; answer: boolean }
  /** Options are listed in the correct order; the app shuffles them before showing. */
  | { type: 'order'; options: string[] }
  /** A mock message split into segments; the player taps every risky one. */
  | { type: 'spot'; frame: 'chat' | 'email'; heading: string; segments: string[]; risky: number[] }
  /** Cards dealt one at a time into buckets (e.g. Public / Internal / Confidential). */
  | { type: 'classify'; buckets: string[]; cards: { text: string; bucket: number }[] };

/** A short animated scene played before the question, like a captioned video clip but tiny and offline. */
export type Scene = {
  title: string;
  lines: { who: string; text: string; side: 'left' | 'right' | 'system' }[];
};

export type PackItem = Challenge & {
  id: string;
  skillId: string;
  /** −3 (very easy) … +3 (very hard). Authors seed it; it is re-calibrated from play data later. */
  difficulty: number;
  prompt: string;
  explanation: string;
  hint?: string;
  scene?: Scene;
};

export type PackSkill = SkillDef & { description: string };

export type ContentPack = {
  id: string;
  version: string;
  locale: string;
  title: string;
  skills: PackSkill[];
  items: PackItem[];
};

/**
 * What the player submitted: an option index; several indices (multi, spot); true/false;
 * option indices in their chosen order (order); or the bucket picked for each card (classify).
 */
export type Response = number | number[] | boolean;
