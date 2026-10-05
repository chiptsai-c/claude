import type { Action } from './state';
import type { Bus, BusEvent } from './bus';
import type { FocusTarget, Line, PhoneState, SoundName, Step } from './types';

export class Cancelled extends Error {
  constructor() { super('Scene cancelled'); }
}

export interface RunContext {
  dispatch: (action: Action) => void;
  getPhone: () => PhoneState;
  bus: Bus;
  signal: AbortSignal;
  /** Director's Cut: approvals happen on their own. */
  auto: boolean;
  /** Reduced motion: no typing or waiting, jump to end states. */
  reduced: boolean;
  sound: (name: SoundName) => void;
  /** Director's Cut camera: bring an area of the page into view. */
  focus?: (target: FocusTarget) => void;
  /** Milliseconds per typed character. */
  typeMs?: number;
}

export function sleep(ctx: RunContext, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(new Cancelled());
    const t = setTimeout(() => {
      ctx.signal.removeEventListener('abort', onAbort);
      resolve();
    }, ctx.reduced ? 0 : ms);
    const onAbort = () => { clearTimeout(t); reject(new Cancelled()); };
    ctx.signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function once(ctx: RunContext, event: BusEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(new Cancelled());
    const off = ctx.bus.on(event, () => { off(); ctx.signal.removeEventListener('abort', onAbort); resolve(); });
    const onAbort = () => { off(); reject(new Cancelled()); };
    ctx.signal.addEventListener('abort', onAbort, { once: true });
  });
}

let nextId = 1;
export const newLineId = () => nextId++;
type NewLine = Line extends infer L ? (L extends Line ? Omit<L, 'id'> : never) : never;
const add = (ctx: RunContext, line: NewLine): number => {
  const id = newLineId();
  ctx.dispatch({ type: 'add', line: { ...line, id } as Line });
  return id;
};
const patch = (ctx: RunContext, id: number, p: Partial<Line>) => ctx.dispatch({ type: 'patch', id, patch: p });

export async function runScript(steps: Step[], ctx: RunContext): Promise<void> {
  for (const step of steps) {
    if (ctx.signal.aborted) throw new Cancelled();
    await runStep(step, ctx);
  }
}

async function runStep(step: Step, ctx: RunContext): Promise<void> {
  switch (step.do) {
    case 'wait':
      return sleep(ctx, step.ms);

    case 'phone': {
      const { do: _, ...p } = step;
      ctx.dispatch({ type: 'phone', patch: p });
      if (step.launched) ctx.sound('whoosh');
      if (step.notified) ctx.sound('chime');
      return;
    }

    case 'type': {
      const id = add(ctx, { kind: 'prompt', text: '', typing: true });
      if (!ctx.reduced) {
        for (let i = 1; i <= step.text.length; i++) {
          patch(ctx, id, { text: step.text.slice(0, i) });
          if (i % 3 === 0) ctx.sound('tick');
          await sleep(ctx, ctx.typeMs ?? 24);
        }
      }
      patch(ctx, id, { text: step.text, typing: false });
      return;
    }

    case 'line':
      add(ctx, { kind: 'text', text: step.text, style: step.style });
      return;

    case 'lines':
      for (const text of step.items) {
        add(ctx, { kind: 'text', text, style: step.style });
        await sleep(ctx, step.gapMs);
      }
      return;

    case 'ask': {
      const id = add(ctx, { kind: 'ask', question: step.question, answer: step.answer, pressed: false });
      await sleep(ctx, 1100);
      patch(ctx, id, { pressed: true });
      ctx.sound('pop');
      return sleep(ctx, 400);
    }

    case 'lanes': {
      const ids = step.lanes.map(lane => add(ctx, { kind: 'lane', lane, pct: 0 }));
      for (let t = 1; t <= step.ticks; t++) {
        step.lanes.forEach((lane, i) => patch(ctx, ids[i], { pct: Math.min(100, Math.round(t * lane.speed)) }));
        const events = step.events[String(t)];
        if (events) await runScript(events, ctx);
        await sleep(ctx, step.tickMs);
      }
      return;
    }

    case 'diff':
      add(ctx, { kind: 'diff', lines: step.lines });
      return;

    case 'awaitBug':
      if (ctx.getPhone().squashed) return;
      return Promise.race([sleep(ctx, step.timeoutMs), once(ctx, 'bug')]);

    case 'squish':
      if (!ctx.getPhone().squashed) {
        ctx.dispatch({ type: 'phone', patch: { squashed: 'auto' } });
        ctx.sound('splat');
      }
      return;

    case 'permission': {
      const id = add(ctx, { kind: 'perm', command: step.command, state: 'waiting' });
      let denied = false;
      const offDeny = ctx.bus.on('deny', () => {
        if (denied) return;
        denied = true;
        add(ctx, { kind: 'text', text: step.deniedText });
      });
      try {
        const waits = [once(ctx, 'approve')];
        if (ctx.auto) {
          waits.push(sleep(ctx, 2200).then(() => {
            patch(ctx, id, { state: 'pressed', simulated: true, autoNote: step.autoNote });
            return sleep(ctx, 350);
          }));
        }
        await Promise.race(waits);
      } finally {
        offDeny();
      }
      patch(ctx, id, { state: 'approved' });
      ctx.sound('chime');
      return;
    }

    case 'checks': {
      const ids = step.items.map(text => add(ctx, { kind: 'check', text, done: false }));
      for (const id of ids) {
        await sleep(ctx, step.gapMs);
        patch(ctx, id, { done: true });
        ctx.sound('tick');
      }
      return;
    }

    case 'payoff':
      ctx.dispatch({ type: 'payoff' });
      return;

    case 'sound':
      ctx.sound(step.name);
      return;

    case 'focus':
      if (!ctx.auto) return;
      if (step.autoHoldMs) await sleep(ctx, step.autoHoldMs);
      ctx.focus?.(step.target);
      return;
  }
}
