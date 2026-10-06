import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/adaptive/index.ts';
import { COMBO_BONUS, deriveProfile, itemById, levelFor, pack, QUEST_LENGTH, shuffledOrder, xpFor, type PlayEvent } from '../web/src/game.ts';

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
