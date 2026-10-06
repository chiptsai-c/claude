import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexContent, LearnerModel, selectNext } from '../src/adaptive/index.ts';
import type { ContentPack, PackItem } from '../src/content/pack.ts';
import { validatePack } from '../src/content/validate.ts';
import { scoreAnswer } from '../src/game/score.ts';

const load = (name: string): ContentPack =>
  JSON.parse(readFileSync(new URL(`../src/content/packs/${name}`, import.meta.url), 'utf8')) as ContentPack;
const pack = load('responsible-ai.en.json');
const byId = (id: string) => pack.items.find(i => i.id === id)!;

describe('content packs', () => {
  it('ships a valid Responsible AI pack', () => {
    expect(validatePack(pack)).toEqual([]);
  });

  it('reports author-friendly problems', () => {
    const broken: ContentPack = {
      ...pack,
      version: 'v1',
      skills: [...pack.skills, { id: 'loop', name: 'Loop', description: 'x', prerequisites: ['loop'] }],
      items: [...pack.items, { ...pack.items[0]!, id: 'basics-1', difficulty: 9 } as PackItem, { ...pack.items[1]!, id: 'bad', answer: 7 } as PackItem],
    };
    const problems = validatePack(broken).join('\n');
    expect(problems).toMatch(/version "v1"/);
    expect(problems).toMatch(/Prerequisite cycle: loop → loop/);
    expect(problems).toMatch(/Duplicate item id "basics-1"/);
    expect(problems).toMatch(/difficulty must be a number from -3 to 3/);
    expect(problems).toMatch(/Item "bad" answer must be an option index/);
    expect(problems).toMatch(/Skill "loop" has 0 items/);

    const badSpot = { ...pack, items: [...pack.items, { ...byId('spot-prompt'), id: 'all-risky', risky: [0, 1, 2, 3, 4, 5, 6] } as PackItem] };
    expect(validatePack(badSpot).join()).toMatch(/at least one safe segment/);
    const badScene = { ...pack, items: [...pack.items, { ...byId('prompt-1'), id: 'bad-scene', scene: { title: 'x', lines: [{ who: '', text: 'hi', side: 'left' }] } } as PackItem] };
    expect(validatePack(badScene).join()).toMatch(/scene needs a title and lines/);
  });

  it('plays with the adaptive engine: starts on unlocked skills and explains the pick', () => {
    const model = new LearnerModel(indexContent(pack.skills, pack.items));
    const pick = selectNext(model, Date.now(), { servedItemIds: new Set(), recentOutcomes: [] })!;
    expect(['ai-basics', 'know-your-data']).toContain(pick.item.skillId);
    expect(pick.why.length).toBeGreaterThan(10);
  });
});

describe('scoring (the engine decides)', () => {
  const byType = (t: PackItem['type']) => pack.items.find(i => i.type === t)!;

  it('scores choice and true/false exactly', () => {
    const choice = byType('choice');
    if (choice.type !== 'choice') throw new Error();
    expect(scoreAnswer(choice, choice.answer)).toBe(1);
    expect(scoreAnswer(choice, (choice.answer + 1) % choice.options.length)).toBe(0);
    const tf = byType('truefalse');
    if (tf.type !== 'truefalse') throw new Error();
    expect(scoreAnswer(tf, tf.answer)).toBe(1);
    expect(scoreAnswer(tf, !tf.answer)).toBe(0);
  });

  it('gives partial credit on multi-select, minus wrong picks', () => {
    const multi = byType('multi');
    if (multi.type !== 'multi') throw new Error();
    expect(scoreAnswer(multi, multi.answer)).toBe(1);
    expect(scoreAnswer(multi, multi.answer.slice(1))).toBeCloseTo(2 / 3);
    const wrong = multi.options.findIndex((_, i) => !multi.answer.includes(i));
    expect(scoreAnswer(multi, [...multi.answer, wrong])).toBeCloseTo(2 / 3);
    expect(scoreAnswer(multi, [wrong])).toBe(0);
  });

  it('scores spot-the-risk like select-all, and sorting by cards placed correctly', () => {
    const spot = byType('spot');
    if (spot.type !== 'spot') throw new Error();
    expect(scoreAnswer(spot, spot.risky)).toBe(1);
    const safe = spot.segments.findIndex((_, i) => !spot.risky.includes(i));
    expect(scoreAnswer(spot, [...spot.risky, safe])).toBeCloseTo(1 - 1 / spot.risky.length);
    const sort = byType('classify');
    if (sort.type !== 'classify') throw new Error();
    const perfect = sort.cards.map(c => c.bucket);
    expect(scoreAnswer(sort, perfect)).toBe(1);
    expect(scoreAnswer(sort, perfect.map((b, i) => (i === 0 ? (b + 1) % sort.buckets.length : b)))).toBeCloseTo(1 - 1 / sort.cards.length);
    expect(scoreAnswer(sort, perfect.slice(1))).toBe(0);
  });

  it('scores ordering by adjacent pairs in the right order, and malformed input as 0', () => {
    const order = byType('order');
    expect(scoreAnswer(order, [0, 1, 2, 3])).toBe(1);
    expect(scoreAnswer(order, [1, 0, 2, 3])).toBeCloseTo(2 / 3);
    expect(scoreAnswer(order, [3, 2, 1, 0])).toBe(0);
    expect(scoreAnswer(order, [0, 0, 1, 2])).toBe(0);
    expect(scoreAnswer(order, 2)).toBe(0);
  });
});
