import { pCorrect } from './elo.ts';
import { retrievability } from './fsrs.ts';
import type { LearnerModel } from './learner.ts';
import type { Rng } from './rng.ts';
import type { ItemDef } from './types.ts';

export type ReasonCode = 'review_due' | 'easing_off' | 'new_skill' | 'flow' | 'bonus_round';

export type Pick = {
  item: ItemDef;
  /** Predicted chance of a correct answer, 0..1. */
  predicted: number;
  score: number;
  reason: ReasonCode;
  /** Plain-language answer to "Why this question?". */
  why: string;
};

export type Weights = {
  flow: number; // closeness to the target success rate
  review: number; // how overdue the item is for review
  priority: number; // mandatory and not-yet-mastered skills
  novelty: number; // items never seen before
  mastered: number; // penalty for drilling skills already mastered
};

export const DEFAULT_WEIGHTS: Weights = { flow: 1, review: 1.2, priority: 0.35, novelty: 0.25, mastered: 0.6 };
/** The "flow zone": hard enough to learn from, easy enough to keep going. */
export const DEFAULT_TARGET = 0.7;
/** After two misses in a row the target rises by this much, so the next item is easier. */
const EASE_OFF = 0.1;
/** How sharply the flow score falls away from the target. */
const FLOW_WIDTH = 0.15;

export type SessionContext = {
  servedItemIds: ReadonlySet<string>;
  /** Outcomes so far this session, oldest first. */
  recentOutcomes: number[];
};

export type SelectorOptions = {
  targetSuccess?: number;
  weights?: Partial<Weights>;
  /** Seeded randomness for small tie-breaking variety; omit for fully deterministic picks. */
  rng?: Rng;
  jitter?: number;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Picks the next challenge and explains why. Returns null only when no skill is playable. */
export function selectNext(model: LearnerModel, now: number, session: SessionContext, opts: SelectorOptions = {}): Pick | null {
  return pickBest(model, now, session, opts, false) ?? pickBest(model, now, session, opts, true);
}

function pickBest(model: LearnerModel, now: number, session: SessionContext, opts: SelectorOptions, allowRepeats: boolean): Pick | null {
  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const recent = session.recentOutcomes;
  const easing = recent.length >= 2 && recent.slice(-2).every(o => o < 0.5);
  const target = Math.min(0.92, (opts.targetSuccess ?? DEFAULT_TARGET) + (easing ? EASE_OFF : 0));
  const retention = model.retention;

  let best: Pick | null = null;
  for (const skill of model.content.skillList) {
    if (!model.isUnlocked(skill.id)) continue;
    const st = model.skill(skill.id);
    const theta = st?.theta ?? 0;
    const mastered = model.isMastered(skill.id);
    const priority = (skill.mandatory ? 0.5 : 0) + (mastered ? 0 : 0.5);

    for (const item of model.content.itemsBySkill.get(skill.id) ?? []) {
      if (!allowRepeats && session.servedItemIds.has(item.id)) continue;
      const p = pCorrect(theta, item.difficulty);
      const flow = Math.exp(-(((p - target) / FLOW_WIDTH) ** 2));

      const card = model.state.cards[item.id];
      let review = 0;
      let due = false;
      let recall = 1;
      if (card) {
        recall = retrievability(card, now);
        due = recall < retention;
        // Overdue items score up to +1; fresh ones are mildly discouraged so practice spreads out.
        review = due ? 0.5 + 0.5 * clamp01((retention - recall) / (retention - 0.5)) : -0.5 * clamp01((recall - retention) / (1 - retention));
      }

      const score =
        w.flow * flow +
        w.review * review +
        w.priority * priority +
        w.novelty * (card ? 0 : 1) -
        (mastered && !due ? w.mastered : 0) +
        (opts.rng ? (opts.jitter ?? 0.05) * opts.rng() : 0);

      if (!best || score > best.score || (score === best.score && item.id < best.item.id)) {
        let reason: ReasonCode;
        let why: string;
        if (allowRepeats) {
          reason = 'bonus_round';
          why = 'Bonus round: revisiting a question from earlier in this session.';
        } else if (due && w.review * review >= w.flow * flow) {
          reason = 'review_due';
          why = `Time for a refresher: your chance of remembering this is down to about ${pct(recall)}.`;
        } else if (easing) {
          reason = 'easing_off';
          why = `Easing off after a tough run: about ${pct(p)} chance you'll get this one.`;
        } else if (!st) {
          reason = 'new_skill';
          why = `New skill unlocked: ${skill.name}.`;
        } else {
          // Say honestly when the best available item is outside the flow zone (small packs run out).
          reason = 'flow';
          const kind = p < target - 0.2 ? 'Stretch question' : p > target + 0.15 ? 'Warm-up' : 'Right-sized challenge';
          why = `${kind} for ${skill.name}: about ${pct(p)} chance you'll get it.${skill.mandatory ? ' Required topic.' : ''}`;
        }
        best = { item, predicted: p, score, reason, why };
      }
    }
  }
  return best;
}
