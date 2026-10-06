import { createRng, DAY_MS, indexContent, LearnerModel, type AnswerEvent } from '../../src/adaptive/index.ts';
import type { ContentPack, PackItem } from '../../src/content/pack.ts';
import packJson from '../../src/content/packs/responsible-ai.en.json' with { type: 'json' };

/**
 * Game rules on top of the adaptive engine. Everything the player sees (XP, level, streak, badges,
 * mastery) is derived from the stored answer events, the same way the engine derives skill state.
 */

export const pack = packJson as ContentPack;
export const content = indexContent(pack.skills, pack.items);
export const itemById = new Map(pack.items.map(i => [i.id, i]));
export const QUEST_LENGTH = 6;

export type PlayEvent = AnswerEvent & { sessionId: string; hintUsed: boolean };
export type Saved = { v: 1; events: PlayEvent[]; clockOffsetDays: number };

const STORE_KEY = 'skill-quest:v1';
export const emptySave = (): Saved => ({ v: 1, events: [], clockOffsetDays: 0 });

export function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? (JSON.parse(raw) as Saved) : null;
    return data?.v === 1 && Array.isArray(data.events) ? data : emptySave();
  } catch {
    return emptySave();
  }
}

export function save(data: Saved): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode: play still works, progress isn't kept */ }
}

// XP ---------------------------------------------------------------------------

/** Harder questions are worth more; hints halve the reward; every third correct answer in a row adds a combo bonus. */
export function xpFor(item: PackItem, outcome: number, hintUsed: boolean, comboAfter: number): number {
  const base = 10 + 5 * Math.round(Math.min(3, Math.max(0, item.difficulty + 1)));
  const earned = Math.round(base * outcome * (hintUsed ? 0.5 : 1));
  return earned + (outcome === 1 && comboAfter > 0 && comboAfter % 3 === 0 ? COMBO_BONUS : 0);
}
export const COMBO_BONUS = 10;

const LEVEL_NAMES = ['Rookie', 'Explorer', 'Practitioner', 'Guardian', 'Champion'];
/** XP needed to reach a level: 0, 100, 300, 600, 1000, … */
const levelThreshold = (level: number) => 50 * (level - 1) * level;

export function levelFor(xp: number) {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level++;
  const from = levelThreshold(level);
  const to = levelThreshold(level + 1);
  return { level, name: LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1]!, into: xp - from, span: to - from };
}

// Days and streaks ---------------------------------------------------------------

const dayKey = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
};

function streaks(events: PlayEvent[], now: number) {
  const days = [...new Set(events.map(e => dayKey(e.at)))].sort((a, b) => a - b);
  let longest = 0, run = 0;
  days.forEach((d, i) => { run = i > 0 && d === days[i - 1]! + 1 ? run + 1 : 1; longest = Math.max(longest, run); });
  const today = dayKey(now);
  const played = new Set(days);
  let current = 0;
  for (let d = played.has(today) ? today : today - 1; played.has(d); d--) current++;
  return { current, longest, playedToday: played.has(today) };
}

// Badges ------------------------------------------------------------------------

export type Badge = { id: string; name: string; description: string };
export const BADGES: Badge[] = [
  { id: 'first-quest', name: 'First Quest', description: 'Finish your first Daily Quest' },
  { id: 'hat-trick', name: 'Hat-trick', description: 'Three fully correct answers in a row' },
  { id: 'perfect-run', name: 'Perfect Run', description: 'Every answer in a quest fully correct' },
  { id: 'streak-3', name: 'Three-day Streak', description: 'Play on three days in a row' },
  { id: 'data-guardian', name: 'Data Guardian', description: 'Master “Know your data”' },
  { id: 'safe-prompter', name: 'Safe Prompter', description: 'Master “Safe prompting”' },
  { id: 'trailblazer', name: 'Trailblazer', description: 'Unlock every skill' },
];

// Profile -----------------------------------------------------------------------

export type Profile = {
  model: LearnerModel;
  xp: number;
  level: ReturnType<typeof levelFor>;
  streak: number;
  longestStreak: number;
  playedToday: boolean;
  quests: number;
  badges: Set<string>;
  dueCount: number;
};

export function deriveProfile(events: PlayEvent[], now: number): Profile {
  const model = LearnerModel.replay(content, events);
  const bySession = new Map<string, PlayEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
    bySession.get(e.sessionId)!.push(e);
  }

  let xp = 0, quests = 0, hatTrick = false, perfect = false;
  for (const session of bySession.values()) {
    let combo = 0;
    for (const e of session) {
      combo = e.outcome === 1 ? combo + 1 : 0;
      if (combo >= 3) hatTrick = true;
      const item = itemById.get(e.itemId);
      if (item) xp += xpFor(item, e.outcome, e.hintUsed, combo);
    }
    if (session.length >= QUEST_LENGTH) {
      quests++;
      if (session.every(e => e.outcome === 1)) perfect = true;
    }
  }

  const s = streaks(events, now);
  const badges = new Set<string>();
  if (quests > 0) badges.add('first-quest');
  if (hatTrick) badges.add('hat-trick');
  if (perfect) badges.add('perfect-run');
  if (s.longest >= 3) badges.add('streak-3');
  if (model.isMastered('know-your-data')) badges.add('data-guardian');
  if (model.isMastered('safe-prompting')) badges.add('safe-prompter');
  if (pack.skills.every(sk => model.isUnlocked(sk.id))) badges.add('trailblazer');

  const dueCount = Object.values(model.state.cards).filter(c => c.dueAt <= now).length;
  return { model, xp, level: levelFor(xp), streak: s.current, longestStreak: s.longest, playedToday: s.playedToday, quests, badges, dueCount };
}

/** Shuffle for ordering questions: stable per item, and never already in the right order. */
export function shuffledOrder(item: PackItem): number[] {
  const n = item.type === 'order' ? item.options.length : 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  const rng = createRng([...item.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  if (idx.every((v, i) => v === i)) idx.push(idx.shift()!);
  return idx;
}
