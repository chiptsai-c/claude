import { isMastered, mastery, newSkillState, UNLOCK_THETA, updateSkill } from './elo.ts';
import { DEFAULT_RETENTION, gradeFromAnswer, newCard, reviewCard } from './fsrs.ts';
import type { AnswerEvent, ItemDef, LearnerState, SkillDef, SkillState } from './types.ts';

/** Answers quicker than this count as "fast" (an FSRS "easy" when fully correct). */
const FAST_MS = 8_000;
/** Answers needed on a prerequisite before its estimate is trusted for unlocking. */
const UNLOCK_MIN_EVIDENCE = 3;

export type ContentIndex = {
  skills: Map<string, SkillDef>;
  items: Map<string, ItemDef>;
  itemsBySkill: Map<string, ItemDef[]>;
  skillList: SkillDef[];
  itemList: ItemDef[];
};

export function indexContent(skills: SkillDef[], items: ItemDef[]): ContentIndex {
  const itemsBySkill = new Map<string, ItemDef[]>(skills.map(s => [s.id, []]));
  for (const it of items) itemsBySkill.get(it.skillId)?.push(it);
  return {
    skills: new Map(skills.map(s => [s.id, s])),
    items: new Map(items.map(i => [i.id, i])),
    itemsBySkill,
    skillList: skills,
    itemList: items,
  };
}

export const emptyState = (): LearnerState => ({ skills: {}, cards: {}, answered: 0, correctSum: 0 });

/**
 * One player's learner model, derived entirely from answer events.
 * The stored event log is the source of truth; `replay` rebuilds the same state on any device.
 */
export class LearnerModel {
  readonly state: LearnerState = emptyState();
  private applied = new Set<string>();
  readonly content: ContentIndex;
  readonly retention: number;

  constructor(content: ContentIndex, retention = DEFAULT_RETENTION) {
    this.content = content;
    this.retention = retention;
  }

  /** Rebuilds state from events in any order, with duplicates (e.g. from re-sent syncs) ignored. */
  static replay(content: ContentIndex, events: AnswerEvent[], retention = DEFAULT_RETENTION): LearnerModel {
    const m = new LearnerModel(content, retention);
    const sorted = [...events].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const e of sorted) m.apply(e);
    return m;
  }

  /** Applies one answer. Returns false for duplicates and items not in the content. */
  apply(e: AnswerEvent): boolean {
    if (this.applied.has(e.id)) return false;
    const item = this.content.items.get(e.itemId);
    if (!item) return false;
    this.applied.add(e.id);

    const outcome = Math.min(1, Math.max(0, e.outcome));
    const s = this.state;
    const prev = s.skills[item.skillId] ?? newSkillState(item.skillId, e.at);
    s.skills[item.skillId] = updateSkill(prev, item.difficulty, outcome, e.at);

    const grade = gradeFromAnswer(outcome, { hintUsed: e.hintUsed, fast: e.ms !== undefined && e.ms < FAST_MS });
    const card = s.cards[item.id];
    s.cards[item.id] = card ? reviewCard(card, grade, e.at, this.retention) : newCard(item.id, grade, e.at, this.retention);

    s.answered += 1;
    s.correctSum += outcome;
    return true;
  }

  skill(skillId: string): SkillState | undefined {
    return this.state.skills[skillId];
  }

  mastery(skillId: string): number {
    return mastery(this.skill(skillId));
  }

  isMastered(skillId: string): boolean {
    return isMastered(this.skill(skillId));
  }

  /** A skill is playable once every prerequisite is reasonably well known. */
  isUnlocked(skillId: string): boolean {
    const def = this.content.skills.get(skillId);
    if (!def) return false;
    return def.prerequisites.every(p => {
      const st = this.skill(p);
      return isMastered(st) || (!!st && st.theta >= UNLOCK_THETA && st.evidence >= UNLOCK_MIN_EVIDENCE);
    });
  }
}
