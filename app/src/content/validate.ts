import type { Showcase, Step } from '../engine/types';

const STEP_KEYS: Record<Step['do'], string[]> = {
  wait: ['ms'], phone: [], type: ['text'], line: ['text'], lines: ['items', 'gapMs'],
  ask: ['question', 'answer'], lanes: ['lanes', 'ticks', 'tickMs', 'events'], diff: ['lines'],
  awaitBug: ['timeoutMs'], squish: [], permission: ['command', 'deniedText'],
  checks: ['items', 'gapMs'], payoff: [], sound: ['name'], focus: ['target'],
};

/** Returns a list of problems in the content file; empty means valid. */
export function validateShowcase(data: Showcase): string[] {
  const errors: string[] = [];
  const checkSteps = (steps: Step[], where: string) => {
    steps.forEach((s, i) => {
      const at = `${where} step ${i + 1}`;
      const required = STEP_KEYS[s.do];
      if (!required) { errors.push(`${at}: unknown step "${(s as { do: string }).do}"`); return; }
      for (const k of required) if (!(k in s)) errors.push(`${at}: "${s.do}" needs "${k}"`);
      if (s.do === 'lanes') for (const [tick, ev] of Object.entries(s.events)) checkSteps(ev, `${at} tick ${tick}`);
    });
  };
  if (!data.scenes?.length) errors.push('No scenes');
  const ids = new Set<string>();
  data.scenes?.forEach(sc => {
    if (ids.has(sc.id)) errors.push(`Duplicate scene id "${sc.id}"`);
    ids.add(sc.id);
    for (const k of ['name', 'eyebrow', 'title', 'lede', 'note'] as const) if (!sc[k]) errors.push(`Scene "${sc.id}" is missing ${k}`);
    checkSteps(sc.script ?? [], `Scene "${sc.id}"`);
  });
  return errors;
}
