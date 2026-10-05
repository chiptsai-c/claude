import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

beforeAll(() => {
  // Run scripts instantly: jsdom has no layout or motion, so treat it as reduced motion.
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  }));
});
afterEach(cleanup);

const settle = () => act(() => new Promise(r => setTimeout(r, 60)));

describe('App', () => {
  it('opens on the intro and starts the demo', async () => {
    render(<App />);
    expect(screen.getByText('Watch one sentence become a mobile app.')).toBeTruthy();
    fireEvent.click(screen.getByText('Start the demo'));
    await settle();
    expect(screen.getByText(/Scene 1 of 4/)).toBeTruthy();
    expect(screen.getByText('Scaffold an Expo app with 3 screens')).toBeTruthy();
  });

  it('waits for a human to approve the push in scene 4', async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Scene 4: Ship'));
    await settle();
    expect(screen.getByText('Claude wants to run')).toBeTruthy();
    fireEvent.click(screen.getByText('Approve'));
    await settle();
    expect(screen.getByText('✓ Approved by you')).toBeTruthy();
  });
});
