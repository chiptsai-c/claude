import { describe, expect, it } from 'vitest';
import { createRng, DAY_MS, indexContent, LearnerModel, selectNext, type ItemDef, type SkillDef } from '../src/adaptive/index.ts';

const skills: SkillDef[] = [
  { id: 'a', name: 'Basics', prerequisites: [] },
  { id: 'b', name: 'Advanced', prerequisites: ['a'] },
];
const items: ItemDef[] = [
  // Difficulties −3…+3 in steps of 0.25: a fine grid so target shifts change the pick.
  ...Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, skillId: 'a', difficulty: -3 + i * 0.25 })),
  { id: 'b0', skillId: 'b', difficulty: 0 },
];
const content = indexContent(skills, items);
const fresh = () => ({ servedItemIds: new Set<string>(), recentOutcomes: [] as number[] });

describe('selector', () => {
  it('never picks from a locked skill', () => {
    const pick = selectNext(new LearnerModel(content), 0, fresh())!;
    expect(pick.item.skillId).toBe('a');
    expect(pick.reason).toBe('new_skill');
  });

  it('aims for the flow zone (about 70% predicted success)', () => {
    const m = new LearnerModel(content);
    m.apply({ id: 'e0', at: 0, itemId: 'a12', outcome: 1 });
    const pick = selectNext(m, 1000, { servedItemIds: new Set(['a12']), recentOutcomes: [1] })!;
    expect(pick.predicted).toBeGreaterThan(0.55);
    expect(pick.predicted).toBeLessThan(0.9);
    expect(pick.why).toMatch(/chance you'll get it/);
  });

  it('eases off after two misses in a row', () => {
    const m = new LearnerModel(content);
    m.apply({ id: 'e0', at: 0, itemId: 'a12', outcome: 1 });
    const normal = selectNext(m, 1000, { servedItemIds: new Set(['a12']), recentOutcomes: [1] })!;
    const eased = selectNext(m, 1000, { servedItemIds: new Set(['a12']), recentOutcomes: [0, 0] })!;
    expect(eased.reason).toBe('easing_off');
    expect(eased.predicted).toBeGreaterThan(normal.predicted);
  });

  it('brings back an item when its recall has dropped', () => {
    const m = new LearnerModel(content);
    m.apply({ id: 'e0', at: 0, itemId: 'a12', outcome: 1 });
    const pick = selectNext(m, 60 * DAY_MS, fresh())!;
    expect(pick.item.id).toBe('a12');
    expect(pick.reason).toBe('review_due');
    expect(pick.why).toMatch(/refresher/);
  });

  it('does not repeat items within a session until everything has been served', () => {
    const m = new LearnerModel(content);
    const served = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const pick = selectNext(m, i, { servedItemIds: served, recentOutcomes: [] })!;
      expect(served.has(pick.item.id)).toBe(false);
      served.add(pick.item.id);
    }
    expect(selectNext(m, 26, { servedItemIds: served, recentOutcomes: [] })!.reason).toBe('bonus_round');
  });

  it('is reproducible with the same seed', () => {
    const run = () => {
      const m = new LearnerModel(content);
      const rng = createRng(9);
      return Array.from({ length: 5 }, (_, i) => selectNext(m, i, fresh(), { rng })!.item.id);
    };
    expect(run()).toEqual(run());
  });
});
