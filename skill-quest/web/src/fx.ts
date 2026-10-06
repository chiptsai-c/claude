/**
 * Game feel: generated sound effects, phone haptics and confetti. All optional and offline:
 * no audio or image files. Sound is off until the player turns it on.
 */

export type Sfx = 'tap' | 'correct' | 'partial' | 'wrong' | 'combo' | 'levelup' | 'deal';

const SOUND_KEY = 'skill-quest:sound';
let ctx: AudioContext | null = null;
let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; } })();

export const isSoundOn = () => soundOn;

export function setSoundOn(on: boolean): void {
  soundOn = on;
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* not kept */ }
  if (on) play('tap');
}

const NOTES: Record<Sfx, [number, number, OscillatorType][]> = {
  // [frequency Hz, start offset s, wave]
  tap: [[660, 0, 'triangle']],
  deal: [[420, 0, 'triangle'], [560, 0.05, 'triangle']],
  correct: [[660, 0, 'triangle'], [990, 0.09, 'triangle']],
  partial: [[523, 0, 'triangle'], [587, 0.1, 'triangle']],
  wrong: [[196, 0, 'sine'], [147, 0.12, 'sine']],
  combo: [[523, 0, 'triangle'], [659, 0.07, 'triangle'], [784, 0.14, 'triangle'], [1047, 0.21, 'triangle']],
  levelup: [[392, 0, 'square'], [523, 0.12, 'square'], [659, 0.24, 'square'], [784, 0.36, 'square'], [1047, 0.5, 'triangle']],
};

export function play(name: Sfx): void {
  if (!soundOn) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, wave] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      const vol = wave === 'square' ? 0.05 : 0.12;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(vol, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.25);
    }
  } catch { /* audio unavailable */ }
}

export function buzz(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

export const reducedMotion = () => !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A short burst of confetti over the page, in the game's colours. */
export function confetti(pieces = 140): void {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  g.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const colors = ['--marigold', '--ok', '--bad', '--ink', '--part'].map(v => css.getPropertyValue(v).trim() || '#f5b324');
  const parts = Array.from({ length: pieces }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    s: 5 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const start = performance.now();
  const frame = (t: number) => {
    const life = (t - start) / 1800;
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - life * life); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    if (life < 1) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}
