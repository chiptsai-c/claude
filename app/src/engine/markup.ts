import type { Tone } from './types';

export interface Segment { tone?: Tone; text: string }

const TONES = new Set<Tone>(['ok', 'bad', 'warn', 'acc', 'dim', 'pr', 'add', 'tag']);

/** Parses "{ok:✓ Done.} Starting work." into styled segments. Unknown tones render as plain text. */
export function parseMarkup(src: string): Segment[] {
  const out: Segment[] = [];
  const re = /\{([a-z]+):([^}]*)\}/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    const tone = m[1] as Tone;
    out.push(TONES.has(tone) ? { tone, text: m[2] } : { text: m[0] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}
