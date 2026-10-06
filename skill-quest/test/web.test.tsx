// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../web/src/App.tsx';
import { BOSS, itemById, pack, QUEST_LENGTH, type PlayEvent } from '../web/src/game.ts';

/** Lets card animations finish when a test runs with fake timers (normal-motion device). */
const flush = () => { if (vi.isFakeTimers()) act(() => { vi.advanceTimersByTime(400); }); };

/** Answers whatever question is on screen correctly, using the pack's answer key. */
function answerCorrectly() {
  const skip = screen.queryByRole('button', { name: 'Skip scene' });
  if (skip) fireEvent.click(skip);
  const prompt = screen.getByRole('heading', { level: 1 }).textContent!;
  const item = pack.items.find(i => i.prompt === prompt)!;
  // Choice buttons are named with their letter key first, e.g. "BThe assistant made up…".
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^(?:[A-Z])?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }));
  switch (item.type) {
    case 'choice': click(item.options[item.answer]!); break;
    case 'truefalse': click(item.answer ? 'True' : 'False'); break;
    case 'multi':
      item.answer.forEach(i => click(item.options[i]!));
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      break;
    case 'spot': {
      const msg = within(screen.getByRole('group', { name: 'Message to check' }));
      item.risky.forEach(i => fireEvent.click(msg.getByRole('button', { name: item.segments[i]!.trim() })));
      fireEvent.click(screen.getByRole('button', { name: /^Check \(/ }));
      break;
    }
    case 'classify':
      item.cards.forEach(c => { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${item.buckets[c.bucket]}`) })); flush(); });
      break;
    case 'order': {
      const pool = within(screen.getByRole('group', { name: 'Steps to place' }));
      item.options.forEach(o => fireEvent.click(pool.getByRole('button', { name: o })));
      fireEvent.click(screen.getByRole('button', { name: 'Check order' }));
    }
  }
  return item.id;
}

/** Saves two strong Daily Quests on this device so the Boss Battle is unlocked. */
function seedUnlockedBoss() {
  const at = Date.now() - 3_600_000;
  const a = ['basics-1', 'basics-2', 'basics-3', 'basics-4', 'data-1', 'data-2'];
  const b = ['data-3', 'data-4', 'spot-email', 'sort-labels', 'basics-3', 'data-4'];
  const events: PlayEvent[] = [...a.map((id, n) => ['qa', n, id] as const), ...b.map((id, n) => ['qb', n + 10, id] as const)]
    .map(([sessionId, n, itemId]) => ({ id: `${sessionId}-${n}`, at: at + n * 1000, itemId, outcome: 1, hintUsed: false, sessionId }));
  localStorage.setItem('skill-quest:v1', JSON.stringify({ v: 1, events, clockOffsetDays: 0 }));
}

describe('Skill Quest web app', () => {
  beforeEach(() => { localStorage.clear(); window.scrollTo = () => {}; });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('plays a full Daily Quest and shows results, XP and new badges', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Rookie' })).toBeTruthy();
    expect(screen.getByText('Mastery map')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Daily Quest' }));

    const seen = new Set<string>();
    for (let q = 0; q < QUEST_LENGTH; q++) {
      expect(screen.getByText('Why this question?')).toBeTruthy();
      seen.add(answerCorrectly());
      expect(screen.getByText('Correct')).toBeTruthy();
      const keep = screen.queryByRole('button', { name: 'Keep going' });
      if (keep) fireEvent.click(keep);
      fireEvent.click(screen.getByRole('button', { name: q === QUEST_LENGTH - 1 ? 'See results' : 'Next question' }));
    }
    expect(seen.size).toBe(QUEST_LENGTH);
    expect(screen.getByRole('heading', { name: 'Perfect run!' })).toBeTruthy();
    expect(screen.getByText(`${QUEST_LENGTH} / ${QUEST_LENGTH}`)).toBeTruthy();
    expect(screen.getByText('First Quest')).toBeTruthy();
    expect(screen.getByText('Perfect Run')).toBeTruthy();

    // Progress is kept on the device.
    cleanup();
    render(<App />);
    expect(screen.getByText('Quests').nextSibling?.textContent).toBe('1');
  });

  it('plays a scene like a clip, and the question appears after it ends or is skipped', () => {
    // A device without reduced motion: scenes play over time instead of appearing at once.
    vi.useFakeTimers();
    window.matchMedia = ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Daily Quest' }));
    // Answer until a question with a scene comes up (safe prompting unlocks during the first quests).
    for (let guard = 0; guard < 40 && !screen.queryByRole('button', { name: 'Skip scene' }); guard++) {
      answerCorrectly();
      const next = screen.queryByRole('button', { name: 'Next question' }) ?? screen.queryByRole('button', { name: 'See results' });
      if (next) fireEvent.click(next);
      const back = screen.queryByRole('button', { name: 'Back to map' });
      if (back) { fireEvent.click(back); fireEvent.click(screen.getByRole('button', { name: 'Start Daily Quest' })); }
      const keep = screen.queryByRole('button', { name: 'Keep going' });
      if (keep) fireEvent.click(keep);
    }
    expect(screen.getByRole('figure', { name: /^Scene:/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getAllByRole('listitem').some(li => li.className.startsWith('msg'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Skip scene' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
  });

  it('marks a wrong answer and shows the explanation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Daily Quest' }));
    const prompt = screen.getByRole('heading', { level: 1 }).textContent!;
    const item = pack.items.find(i => i.prompt === prompt)!;
    if (item.type === 'truefalse') fireEvent.click(screen.getByRole('button', { name: item.answer ? 'False' : 'True' }));
    else if (item.type === 'choice') fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.endsWith(item.options[(item.answer + 1) % item.options.length]!))!);
    else throw new Error(`First question unexpectedly has type ${item.type}`);
    expect(screen.getByText('Not quite')).toBeTruthy();
    expect(screen.getByText(itemById.get(item.id)!.explanation)).toBeTruthy();
  });

  it('keeps the boss locked until the requirements are met', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: BOSS.name })).toBeTruthy();
    expect(screen.getByText(/Locked\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start battle' })).toBeNull();
  });

  it('fights and beats the boss with the timer off', () => {
    seedUnlockedBoss();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));
    fireEvent.click(screen.getByLabelText(/No timer/));
    fireEvent.click(screen.getByRole('button', { name: 'Start battle' }));
    expect(screen.queryByRole('timer')).toBeNull();
    for (let q = 0; q < BOSS.questions && !screen.queryByRole('button', { name: 'See the result' }); q++) {
      answerCorrectly();
      expect(screen.getByText(/You hit The Oversharer/)).toBeTruthy();
      const keep = screen.queryByRole('button', { name: 'Keep going' });
      if (keep) fireEvent.click(keep);
      const next = screen.queryByRole('button', { name: 'Next attack' });
      if (next) fireEvent.click(next);
    }
    fireEvent.click(screen.getByRole('button', { name: 'See the result' }));
    expect(screen.getByRole('heading', { name: `${BOSS.name} is beaten!` })).toBeTruthy();
    expect(screen.getByText(/New badge/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }));
    expect(screen.getByText(/beaten 1×/)).toBeTruthy();
    // A boss battle is not counted as a Daily Quest.
    expect(screen.getByText('Quests').nextSibling?.textContent).toBe('2');
  });

  it('counts running out of time as a lost heart', () => {
    seedUnlockedBoss();
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));
    fireEvent.click(screen.getByLabelText(/Standard/));
    fireEvent.click(screen.getByRole('button', { name: 'Start battle' }));
    expect(screen.getByRole('timer')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText("Time's up")).toBeTruthy();
    expect(screen.getByLabelText(`${BOSS.hearts - 1} of ${BOSS.hearts} hearts left`)).toBeTruthy();
  });

  it('asks before erasing progress', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(screen.getByText('Erase all progress on this device?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText('Erase all progress on this device?')).toBeNull();
  });
});
