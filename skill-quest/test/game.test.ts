import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/adaptive/index.ts';
import {
  BOSS, bossReplay, bossRequirements, bossSeconds, COMBO_BONUS, deriveProfile, itemById, levelFor, pack, pickBossItems,
  QUEST_LENGTH, shuffledOrder, xpFor, type PlayEvent,
} from '../web/src/game.ts';

const day0 = new Date(2026, 9, 6, 9).getTime();
const ev = (session: string, n: number, itemId: string, outcome: number, dayOffset = 0, hintUsed = false): PlayEvent => ({
  id: `${session}-${n}`, at: day0 + dayOffset * DAY_MS + n * 30_000, itemId, outcome, hintUsed, sessionId: session,
});
const easy = itemById.get('data-1')!;

describe('game rules', () => {
  it('pays more for harder questions, half for hints, and a bonus on every third in a row', () => {
    expect(xpFor(itemById.get('basics-4')!, 1, false, 1)).toBeGreaterThan(xpFor(easy, 1, false, 1));
    expect(xpFor(easy, 1, true, 1)).toBe(Math.round(xpFor(easy, 1, false, 1) / 2));
    expect(xpFor(easy, 1, false, 3)).toBe(xpFor(easy, 1, false, 1) + COMBO_BONUS);
    expect(xpFor(easy, 0, false, 0)).toBe(0);
  });

  it('levels up at 100, 300 and 600 XP', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: 'Rookie', into: 0, span: 100 });
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(600)).toMatchObject({ level: 4, name: 'Guardian' });
  });

  it('derives XP, quests, streaks and badges from events alone', () => {
    const quest = (s: string, d: number) => Array.from({ length: QUEST_LENGTH }, (_, n) => ev(s, n, pack.items[n]!.id, 1, d));
    const events = [...quest('a', 0), ...quest('b', 1), ...quest('c', 2)];
    const p = deriveProfile(events, day0 + 2 * DAY_MS);
    expect(p.quests).toBe(3);
    expect(p.streak).toBe(3);
    expect(p.playedToday).toBe(true);
    expect([...p.badges]).toEqual(expect.arrayContaining(['first-quest', 'hat-trick', 'perfect-run', 'streak-3']));
    expect(p.xp).toBeGreaterThan(0);
    // Same events in another order give the same profile.
    expect(deriveProfile([...events].reverse(), day0 + 2 * DAY_MS).xp).toBe(p.xp);
  });

  it('keeps the streak until a full day is missed', () => {
    const events = [ev('a', 0, 'data-1', 1, 0)];
    expect(deriveProfile(events, day0 + DAY_MS).streak).toBe(1);
    expect(deriveProfile(events, day0 + 2 * DAY_MS).streak).toBe(0);
  });

  it('counts questions due for a refresher', () => {
    const events = [ev('a', 0, 'data-1', 1, 0)];
    expect(deriveProfile(events, day0).dueCount).toBe(0);
    expect(deriveProfile(events, day0 + 30 * DAY_MS).dueCount).toBe(1);
  });

  it('shuffles ordering questions the same way every time, never already solved', () => {
    for (const item of pack.items.filter(i => i.type === 'order')) {
      const s = shuffledOrder(item);
      expect(s).toEqual(shuffledOrder(item));
      expect([...s].sort()).toEqual(item.type === 'order' ? item.options.map((_, i) => i) : []);
      expect(s.every((v, i) => v === i)).toBe(false);
    }
  });
});

describe('Boss Battle rules', () => {
  it('wins when good answers take the boss to zero, loses on three poor answers', () => {
    expect(bossReplay([1, 1, 1, 1, 1, 1])).toMatchObject({ won: true, over: true, hearts: 3 });
    expect(bossReplay([1, 1, 0, 1, 1, 0.5, 1, 1])).toMatchObject({ won: true });
    expect(bossReplay([0, 1, 0, 0])).toMatchObject({ lost: true, hearts: 0, answered: 4 });
    expect(bossReplay([1, 0.6, 1, 1, 0, 1, 0, 0.6])).toMatchObject({ lost: true, over: true, answered: 8 });
    expect(bossReplay([1, 1])).toMatchObject({ over: false, hp: BOSS.hp - 2 * BOSS.damage });
  });

  it('ignores answers after the battle is decided', () => {
    expect(bossReplay([0, 0, 0, 1, 1])).toMatchObject({ answered: 3, hp: BOSS.hp });
  });

  it('gives more time for formats that take longer, and none with the timer off', () => {
    expect(bossSeconds(itemById.get('data-1')!, 'standard')).toBe(30);
    expect(bossSeconds(itemById.get('sort-labels')!, 'standard')).toBe(60);
    expect(bossSeconds(itemById.get('data-1')!, 'relaxed')).toBe(60);
    expect(bossSeconds(itemById.get('data-1')!, 'off')).toBe(Infinity);
  });

  it('picks distinct questions that cover every unlocked skill', () => {
    const model = deriveProfile(unlockEvents(), day0).model;
    const ids = pickBossItems(model);
    expect(ids).toHaveLength(BOSS.questions);
    expect(new Set(ids).size).toBe(ids.length);
    const skills = new Set(ids.map(id => itemById.get(id)!.skillId));
    for (const s of pack.skills) if (model.isUnlocked(s.id)) expect(skills.has(s.id)).toBe(true);
  });

  it('unlocks after two quests and Safe prompting; a win gives XP, a badge and is not a Daily Quest', () => {
    const before = deriveProfile([], day0);
    expect(bossRequirements(before).every(r => r.done)).toBe(false);
    const events = unlockEvents();
    const ready = deriveProfile(events, day0);
    expect(bossRequirements(ready).every(r => r.done)).toBe(true);
    const battle = pickBossItems(ready.model).slice(0, 6).map((id, n) => ({ ...ev('boss1', n, id, 1, 0), mode: 'boss' as const }));
    const after = deriveProfile([...events, ...battle], day0);
    expect(after.bossWins).toBe(1);
    expect(after.quests).toBe(ready.quests);
    expect(after.badges.has('boss-slayer')).toBe(true);
    expect(after.xp).toBeGreaterThan(ready.xp + BOSS.winXp);
  });
});

/** Two full Daily Quests with strong basics and data answers: enough to unlock Safe prompting and the boss. */
function unlockEvents(): PlayEvent[] {
  const a = ['basics-1', 'basics-2', 'basics-3', 'basics-4', 'data-1', 'data-2'];
  const b = ['data-3', 'data-4', 'spot-email', 'sort-labels', 'basics-3', 'data-4'];
  return [...a.map((id, n) => ev('qa', n, id, 1, 0)), ...b.map((id, n) => ev('qb', n + 10, id, 1, 0))];
}
