// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../web/src/App.tsx';
import { itemById, pack, QUEST_LENGTH } from '../web/src/game.ts';

/** Answers whatever question is on screen correctly, using the pack's answer key. */
function answerCorrectly() {
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
    case 'order': {
      const pool = within(screen.getByRole('group', { name: 'Steps to place' }));
      item.options.forEach(o => fireEvent.click(pool.getByRole('button', { name: o })));
      fireEvent.click(screen.getByRole('button', { name: 'Check order' }));
    }
  }
  return item.id;
}

describe('Skill Quest web app', () => {
  beforeEach(() => { localStorage.clear(); window.scrollTo = () => {}; });
  afterEach(cleanup);

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

  it('asks before erasing progress', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(screen.getByText('Erase all progress on this device?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText('Erase all progress on this device?')).toBeNull();
  });
});
