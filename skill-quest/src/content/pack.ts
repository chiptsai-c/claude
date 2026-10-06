import type { SkillDef } from '../adaptive/types.ts';

/** Challenge formats. Each item is one of these plus the shared fields in PackItem. */
export type Challenge =
  | { type: 'choice'; options: string[]; answer: number }
  | { type: 'multi'; options: string[]; answer: number[] }
  | { type: 'truefalse'; answer: boolean }
  /** Options are listed in the correct order; the app shuffles them before showing. */
  | { type: 'order'; options: string[] };

export type PackItem = Challenge & {
  id: string;
  skillId: string;
  /** −3 (very easy) … +3 (very hard). Authors seed it; it is re-calibrated from play data later. */
  difficulty: number;
  prompt: string;
  explanation: string;
  hint?: string;
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

/** What the player submitted: an option index, several indices, true/false, or option indices in their chosen order. */
export type Response = number | number[] | boolean;
