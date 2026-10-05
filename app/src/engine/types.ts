/** Inline markup used in content text: "{ok:✓ Done.} Starting work." */
export type Tone = 'ok' | 'bad' | 'warn' | 'acc' | 'dim' | 'pr' | 'add' | 'tag';

export interface Lane { name: string; desc: string; speed: number }
export interface DiffLine { op: ' ' | '+' | '-'; text: string }

/** One step of a scene script. Scripts live in content/showcase.json. */
export type Step =
  | { do: 'wait'; ms: number }
  | { do: 'phone'; build?: number; bug?: boolean; launched?: boolean; notified?: boolean }
  | { do: 'type'; text: string }
  | { do: 'line'; text: string; style?: LineStyle }
  | { do: 'lines'; items: string[]; gapMs: number; style?: LineStyle }
  | { do: 'ask'; question: string; answer: string }
  | { do: 'lanes'; lanes: Lane[]; ticks: number; tickMs: number; events: Record<string, Step[]> }
  | { do: 'diff'; lines: DiffLine[] }
  | { do: 'awaitBug'; timeoutMs: number }
  | { do: 'squish' }
  | { do: 'permission'; command: string; deniedText: string }
  | { do: 'checks'; items: string[]; gapMs: number }
  | { do: 'payoff' }
  | { do: 'sound'; name: SoundName };

export type LineStyle = 'head' | 'plan';
export type SoundName = 'tick' | 'chime' | 'splat' | 'whoosh' | 'pop';

export type Line =
  | { id: number; kind: 'text'; text: string; style?: LineStyle }
  | { id: number; kind: 'prompt'; text: string; typing: boolean }
  | { id: number; kind: 'ask'; question: string; answer: string; pressed: boolean }
  | { id: number; kind: 'lane'; lane: Lane; pct: number }
  | { id: number; kind: 'diff'; lines: DiffLine[] }
  | { id: number; kind: 'perm'; command: string; state: 'waiting' | 'pressed' | 'approved' }
  | { id: number; kind: 'check'; text: string; done: boolean };

export interface PhoneState {
  build: number;
  bug: boolean;
  squashed: false | 'user' | 'auto';
  launched: boolean;
  notified: boolean;
}

export interface SceneContent {
  id: string;
  name: string;
  eyebrow: string;
  title: string;
  lede: string;
  note: string;
  hint?: string;
  script: Step[];
}

export interface Showcase {
  title: string;
  tagline: string;
  intro: { kicker: string; title: string; lede: string };
  outro: { title: string; lede: string; cta: string };
  payoff: { label: string; stats: { value: number; label: string }[] };
  scenes: SceneContent[];
}
