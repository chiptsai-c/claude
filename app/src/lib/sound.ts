import type { SoundName } from '../engine/types';

/** All sounds are synthesised with Web Audio, so the app ships no audio files. */
let ac: AudioContext | null = null;
let enabled = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) return;
  try {
    ac ??= new AudioContext();
    void ac.resume();
  } catch {
    enabled = false;
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, to: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const o = ac!.createOscillator(), g = ac!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  o.frequency.exponentialRampToValueAtTime(to, start + dur);
  env(g, start, peak, 0.005, dur);
  o.connect(g).connect(ac!.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(start: number, dur: number, peak: number, filter: BiquadFilterType, from: number, to: number) {
  const len = Math.ceil(ac!.sampleRate * dur);
  const buf = ac!.createBuffer(1, len, ac!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac!.createBufferSource(), f = ac!.createBiquadFilter(), g = ac!.createGain();
  src.buffer = buf;
  f.type = filter;
  f.frequency.setValueAtTime(from, start);
  f.frequency.exponentialRampToValueAtTime(to, start + dur);
  env(g, start, peak, dur * 0.3, dur * 0.7);
  src.connect(f).connect(g).connect(ac!.destination);
  src.start(start);
}

export function play(name: SoundName): void {
  if (!enabled || !ac) return;
  const t = ac.currentTime;
  switch (name) {
    case 'tick': return tone(1400, 1300, t, 0.03, 0.02, 'square');
    case 'pop': return tone(500, 1200, t, 0.09, 0.12);
    case 'chime': tone(880, 880, t, 0.35, 0.08); return tone(1320, 1320, t + 0.09, 0.45, 0.07);
    case 'splat': tone(140, 45, t, 0.18, 0.25); return noise(t, 0.25, 0.25, 'lowpass', 1500, 200);
    case 'whoosh': return noise(t, 1.6, 0.18, 'bandpass', 250, 3200);
  }
}
