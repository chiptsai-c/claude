import { describe, expect, it } from 'vitest';
import {
  DAY_MS, gradeFromAnswer, indexContent, intervalDays, isMastered, kFactor, LearnerModel, MASTERY_THETA,
  newCard, newSkillState, pCorrect, retrievability, retrievabilityAfter, reviewCard, updateSkill,
  type AnswerEvent, type ItemDef, type SkillDef,
} from '../src/adaptive/index.ts';

describe('Elo skill model', () => {
  it('predicts 50% when ability equals difficulty and rises with ability', () => {
    expect(pCorrect(0, 0)).toBeCloseTo(0.5);
    expect(pCorrect(1, 0)).toBeGreaterThan(pCorrect(0, 0));
  });

  it('moves ability up on a correct answer and down on a wrong one, more when surprised', () => {
    const s = newSkillState('x', 0);
    expect(updateSkill(s, 0, 1, 1).theta).toBeGreaterThan(0);
    expect(updateSkill(s, 0, 0, 1).theta).toBeLessThan(0);
    const easyWin = updateSkill(s, -2, 1, 1).theta;
    const hardWin = updateSkill(s, 2, 1, 1).theta;
    expect(hardWin).toBeGreaterThan(easyWin);
  });

  it('takes smaller steps as evidence grows, but never below the floor', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(20));
    expect(kFactor(10_000)).toBeGreaterThan(0);
  });

  it('needs both ability and enough evidence for mastery', () => {
    expect(isMastered({ skillId: 'x', theta: MASTERY_THETA + 1, evidence: 2, lastPracticedAt: 0 })).toBe(false);
    expect(isMastered({ skillId: 'x', theta: MASTERY_THETA + 1, evidence: 10, lastPracticedAt: 0 })).toBe(true);
  });
});

describe('FSRS spaced repetition', () => {
  it('has 90% recall at t = stability and decays over time', () => {
    expect(retrievabilityAfter(5, 5)).toBeCloseTo(0.9, 5);
    expect(retrievabilityAfter(10, 5)).toBeLessThan(retrievabilityAfter(2, 5));
  });

  it('schedules the first review further out for better first answers', () => {
    const again = newCard('i', 1, 0), good = newCard('i', 3, 0), easy = newCard('i', 4, 0);
    expect(again.dueAt).toBeLessThan(good.dueAt);
    expect(good.dueAt).toBeLessThan(easy.dueAt);
  });

  it('grows stability on recall and shrinks it on a lapse', () => {
    const c = newCard('i', 3, 0);
    const later = c.dueAt;
    expect(reviewCard(c, 3, later).stability).toBeGreaterThan(c.stability);
    const lapsed = reviewCard(reviewCard(c, 3, later), 1, later + 30 * DAY_MS);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(reviewCard(c, 3, later).stability);
  });

  it('gives shorter intervals when higher retention is wanted', () => {
    expect(intervalDays(10, 0.95)).toBeLessThan(intervalDays(10, 0.9));
  });

  it('maps answers to grades', () => {
    expect(gradeFromAnswer(0)).toBe(1);
    expect(gradeFromAnswer(1, { hintUsed: true })).toBe(2);
    expect(gradeFromAnswer(0.6)).toBe(2);
    expect(gradeFromAnswer(1)).toBe(3);
    expect(gradeFromAnswer(1, { fast: true })).toBe(4);
  });
});

describe('Learner model (event-sourced)', () => {
  const skills: SkillDef[] = [
    { id: 'a', name: 'A', prerequisites: [] },
    { id: 'b', name: 'B', prerequisites: ['a'] },
  ];
  const items: ItemDef[] = [
    { id: 'a1', skillId: 'a', difficulty: -1 }, { id: 'a2', skillId: 'a', difficulty: 0 }, { id: 'a3', skillId: 'a', difficulty: 1 },
    { id: 'b1', skillId: 'b', difficulty: 0 },
  ];
  const content = indexContent(skills, items);
  const events: AnswerEvent[] = Array.from({ length: 12 }, (_, i) => ({
    id: `e${i}`, at: i * 60_000, itemId: `a${(i % 3) + 1}`, outcome: i % 4 === 0 ? 0 : 1,
  }));

  it('gives the same state whatever order events arrive in, ignoring duplicates', () => {
    const inOrder = LearnerModel.replay(content, events);
    const messy = LearnerModel.replay(content, [...events].reverse().concat(events.slice(0, 5)));
    expect(messy.state).toEqual(inOrder.state);
    expect(messy.state.answered).toBe(12);
  });

  it('ignores events for items that are not in the content', () => {
    const m = new LearnerModel(content);
    expect(m.apply({ id: 'x', at: 0, itemId: 'nope', outcome: 1 })).toBe(false);
    expect(m.state.answered).toBe(0);
  });

  it('locks a skill until its prerequisite is reasonably known', () => {
    const m = new LearnerModel(content);
    expect(m.isUnlocked('a')).toBe(true);
    expect(m.isUnlocked('b')).toBe(false);
    for (let i = 0; i < 6; i++) m.apply({ id: `w${i}`, at: i, itemId: 'a3', outcome: 1 });
    expect(m.isUnlocked('b')).toBe(true);
  });

  it('tracks recall per item after answering', () => {
    const m = LearnerModel.replay(content, events);
    const card = m.state.cards['a1']!;
    expect(retrievability(card, card.lastReviewAt)).toBeCloseTo(1);
  });
});
