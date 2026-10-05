import { describe, expect, it } from 'vitest';
import { showcase } from '../content';
import { validateShowcase } from '../content/validate';
import { Bus } from '../engine/bus';
import { parseMarkup } from '../engine/markup';
import { Cancelled, runScript, type RunContext } from '../engine/runner';
import { initialStage, stageReducer, type StageState } from '../engine/state';
import type { Showcase, SoundName, Step } from '../engine/types';

function harness(opts: { auto?: boolean } = {}) {
  let state: StageState = initialStage;
  const bus = new Bus();
  const ctrl = new AbortController();
  const sounds: SoundName[] = [];
  const ctx: RunContext = {
    dispatch: a => { state = stageReducer(state, a); },
    getPhone: () => state.phone,
    bus, signal: ctrl.signal, auto: opts.auto ?? false, reduced: true,
    sound: n => { sounds.push(n); },
  };
  return { ctx, bus, ctrl, sounds, get state() { return state; } };
}

const scene = (id: string) => showcase.scenes.find(s => s.id === id)!.script;
const texts = (s: StageState) => s.lines.map(l => ('text' in l ? l.text : l.kind));
const tick = () => new Promise(r => setTimeout(r, 5));

describe('markup', () => {
  it('splits toned segments from plain text', () => {
    expect(parseMarkup('{ok:✓ Done.} Starting work.')).toEqual([{ tone: 'ok', text: '✓ Done.' }, { text: ' Starting work.' }]);
  });
  it('leaves unknown tones as plain text', () => {
    expect(parseMarkup('{nope:x}')).toEqual([{ text: '{nope:x}' }]);
  });
});

describe('content', () => {
  it('showcase.json is valid', () => {
    expect(validateShowcase(showcase)).toEqual([]);
  });
  it('reports unknown steps and missing fields', () => {
    const bad = { ...showcase, scenes: [{ ...showcase.scenes[0], script: [{ do: 'dance' }, { do: 'wait' }] as unknown as Step[] }] } as Showcase;
    expect(validateShowcase(bad)).toEqual(['Scene "plan" step 1: unknown step "dance"', 'Scene "plan" step 2: "wait" needs "ms"']);
  });
});

describe('stage reducer', () => {
  it('a new bug is never already squashed', () => {
    let s = stageReducer(initialStage, { type: 'phone', patch: { squashed: 'user' } });
    s = stageReducer(s, { type: 'phone', patch: { bug: true } });
    expect(s.phone.squashed).toBe(false);
  });
});

describe('runner', () => {
  it('plan scene types the prompt and lists the plan', async () => {
    const h = harness();
    await runScript(scene('plan'), h.ctx);
    const t = texts(h.state);
    expect(h.state.lines[0]).toMatchObject({ kind: 'prompt', typing: false, text: expect.stringContaining('IT service requests') });
    expect(t).toContain('Scaffold an Expo app with 3 screens');
    expect(h.state.lines.find(l => l.kind === 'ask')).toMatchObject({ pressed: true });
  });

  it('subagents scene builds the whole phone and finishes every lane', async () => {
    const h = harness();
    await runScript(scene('subagents'), h.ctx);
    expect(h.state.phone.build).toBe(4);
    expect(h.state.lines.filter(l => l.kind === 'lane').map(l => (l.kind === 'lane' ? l.pct : 0))).toEqual([100, 100, 100]);
  });

  it('self-heal squashes the bug itself when nobody taps it', async () => {
    const h = harness();
    await runScript(scene('self-heal'), h.ctx);
    expect(h.state.phone).toMatchObject({ bug: false, squashed: 'auto' });
    expect(h.sounds).toContain('splat');
    expect(texts(h.state).at(-1)).toContain('12 passed');
  });

  it('a tapped bug is not squashed twice', async () => {
    const h = harness();
    h.ctx.dispatch({ type: 'phone', patch: { bug: true } });
    h.ctx.dispatch({ type: 'phone', patch: { squashed: 'user' } });
    await runScript([{ do: 'awaitBug', timeoutMs: 99999 }, { do: 'squish' }], h.ctx);
    expect(h.state.phone.squashed).toBe('user');
    expect(h.sounds).not.toContain('splat');
  });

  it('permission waits for approval and reports a deny once', async () => {
    const h = harness();
    let done = false;
    const run = runScript([{ do: 'permission', command: 'git push', deniedText: 'Denied.' }], h.ctx).then(() => { done = true; });
    await tick();
    h.bus.emit('deny');
    h.bus.emit('deny');
    await tick();
    expect(done).toBe(false);
    expect(texts(h.state).filter(t => t === 'Denied.')).toHaveLength(1);
    h.bus.emit('approve');
    await run;
    expect(h.state.lines[0]).toMatchObject({ kind: 'perm', state: 'approved' });
  });

  it("permission approves itself in Director's Cut", async () => {
    const h = harness({ auto: true });
    await runScript([{ do: 'permission', command: 'git push', deniedText: 'Denied.' }], h.ctx);
    expect(h.state.lines[0]).toMatchObject({ state: 'approved' });
  });

  it('ship scene ends with the notification and payoff', async () => {
    const h = harness({ auto: true });
    await runScript(scene('ship'), h.ctx);
    expect(h.state.phone).toMatchObject({ notified: true, launched: false });
    expect(h.state.payoff).toBe(true);
  });

  it("focus steps only move the camera in Director's Cut", async () => {
    for (const auto of [false, true]) {
      const h = harness({ auto });
      const seen: string[] = [];
      h.ctx.focus = t => { seen.push(t); };
      const run = runScript(scene('ship'), h.ctx);
      if (!auto) { await tick(); h.bus.emit('approve'); }
      await run;
      expect(seen).toEqual(auto ? ['console', 'phone', 'payoff'] : []);
    }
  });

  it('a simulated approval is labelled as simulated', async () => {
    const h = harness({ auto: true });
    await runScript([{ do: 'permission', command: 'git push', deniedText: 'Denied.', autoNote: 'Simulated.' }], h.ctx);
    expect(h.state.lines[0]).toMatchObject({ state: 'approved', simulated: true, autoNote: 'Simulated.' });
  });

  it('a real approval is not labelled as simulated', async () => {
    const h = harness();
    const run = runScript([{ do: 'permission', command: 'git push', deniedText: 'Denied.', autoNote: 'Simulated.' }], h.ctx);
    await tick();
    h.bus.emit('approve');
    await run;
    expect(h.state.lines[0]).not.toHaveProperty('simulated');
  });

  it('aborting a scene rejects with Cancelled', async () => {
    const h = harness();
    const run = runScript([{ do: 'permission', command: 'x', deniedText: 'y' }], h.ctx);
    h.ctrl.abort();
    await expect(run).rejects.toBeInstanceOf(Cancelled);
  });
});
