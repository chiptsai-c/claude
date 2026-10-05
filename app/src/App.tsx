import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { showcase } from './content';
import { Bus } from './engine/bus';
import { Cancelled, newLineId, runScript, sleep, type RunContext } from './engine/runner';
import { initialStage, stageReducer } from './engine/state';
import type { FocusTarget } from './engine/types';
import { play, setSoundEnabled } from './lib/sound';
import { load, save } from './lib/storage';
import { Console } from './components/Console';
import { Payoff } from './components/Payoff';
import { Phone } from './components/Phone';

const N = showcase.scenes.length;
const INTRO = 0;
const OUTRO = N + 1;
const SLOTS = N + 2;
const KIOSK_IDLE_MS = 45_000;
/** After someone scrolls by hand, Director's Cut leaves the page position alone for this long. */
const USER_SCROLL_GRACE_MS = 8_000;

const copyMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const, staggerChildren: 0.06 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
const child = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export function App() {
  const reduced = useReducedMotion() ?? false;
  const kiosk = useMemo(() => location.hash === '#kiosk', []);
  const [slot, setSlot] = useState(INTRO);
  const [runKey, setRunKey] = useState(0);
  const [auto, setAuto] = useState(kiosk);
  const [soundOn, setSoundOn] = useState(false);
  const [bugCount, setBugCount] = useState(() => Number(load('ptp.bugs', '0')) || 0);
  const [stage, dispatch] = useReducer(stageReducer, initialStage);
  const bus = useMemo(() => new Bus(), []);

  const autoRef = useRef(auto);
  autoRef.current = auto;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const scene = slot >= 1 && slot <= N ? showcase.scenes[slot - 1] : null;

  // Director's Cut camera: scroll to the area that matters right now and give it a brief highlight.
  const userScrolledAt = useRef(0);
  const focus = useCallback((target: FocusTarget) => {
    if (Date.now() - userScrolledAt.current < USER_SCROLL_GRACE_MS) return;
    // Wait a frame so anything the script just added (like the payoff) is on the page.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus-target="${target}"]`);
      if (!el) return;
      if (target !== 'copy') {
        el.classList.remove('attn');
        void el.offsetWidth;
        el.classList.add('attn');
      }
      const navH = document.querySelector('nav')?.getBoundingClientRect().height ?? 0;
      const visibleH = innerHeight - navH;
      const r = el.getBoundingClientRect();
      const fullyVisible = r.top >= 0 && r.bottom <= visibleH;
      const tallAndTopVisible = r.height > visibleH && Math.abs(r.top) < 40;
      if (fullyVisible || tallAndTopVisible) return;
      el.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: r.height > visibleH * 0.85 ? 'start' : 'center' });
    }));
  }, [reduced]);

  useEffect(() => {
    const mark = () => { userScrolledAt.current = Date.now(); };
    addEventListener('wheel', mark, { passive: true });
    addEventListener('touchmove', mark, { passive: true });
    return () => { removeEventListener('wheel', mark); removeEventListener('touchmove', mark); };
  }, []);

  // Run the current slot's script. A new slot or a replay aborts the previous run.
  useEffect(() => {
    const ctrl = new AbortController();
    const ctx: RunContext = {
      dispatch, bus, reduced, sound: play, signal: ctrl.signal,
      getPhone: () => stageRef.current.phone,
      auto: autoRef.current,
      focus,
    };
    if (autoRef.current) focus('copy');
    const run = async () => {
      let hold: number;
      if (slot === INTRO) {
        dispatch({ type: 'reset' });
        hold = 4500;
      } else if (slot === OUTRO) {
        dispatch({ type: 'reset', phone: { build: 4, notified: true } });
        for (const text of [
          '{ok:✓} Plan approved by you',
          '{ok:✓} 3 subagents wrote 14 files',
          '{ok:✓} 1 bug found and fixed · 12/12 tests',
          '{ok:✓} Push approved by you · CI green',
        ]) {
          dispatch({ type: 'add', line: { id: newLineId(), kind: 'text', text } });
          await sleep(ctx, 250);
        }
        dispatch({ type: 'payoff' });
        if (autoRef.current) {
          await sleep(ctx, 3500);
          focus('payoff');
        }
        hold = 9000;
      } else {
        dispatch({ type: 'reset' });
        await runScript(showcase.scenes[slot - 1].script, ctx);
        hold = slot === N ? 4500 : 2800;
      }
      if (!autoRef.current) return;
      await sleep(ctx, hold);
      if (autoRef.current) setSlot(s => (s + 1) % SLOTS);
    };
    run().catch(e => { if (!(e instanceof Cancelled)) console.error(e); });
    return () => ctrl.abort();
  }, [slot, runKey, bus, reduced, focus]);

  const go = useCallback((target: number, keepAuto = false) => {
    if (!keepAuto) setAuto(false);
    setSlot(((target % SLOTS) + SLOTS) % SLOTS);
    setRunKey(k => k + 1);
  }, []);

  const startDirectorsCut = useCallback(() => {
    userScrolledAt.current = 0;
    setAuto(true);
    autoRef.current = true;
    go(INTRO, true);
  }, [go]);

  const togglePlay = () => (auto ? setAuto(false) : startDirectorsCut());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) play('pop');
  };

  const onSquash = () => {
    const { phone } = stageRef.current;
    if (!phone.bug || phone.squashed) return;
    dispatch({ type: 'phone', patch: { squashed: 'user' } });
    play('splat');
    try { navigator.vibrate?.(35); } catch { /* not supported */ }
    setBugCount(c => { save('ptp.bugs', String(c + 1)); return c + 1; });
    bus.emit('bug');
  };

  // Keyboard and swipe navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(slot + 1);
      if (e.key === 'ArrowLeft') go(slot - 1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [slot, go]);
  const touchX = useRef<number | null>(null);

  // Kiosk mode: after a period with no interaction, restart the Director's Cut.
  useEffect(() => {
    if (!kiosk) return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => { if (!autoRef.current) startDirectorsCut(); }, KIOSK_IDLE_MS);
    };
    arm();
    addEventListener('pointerdown', arm);
    addEventListener('keydown', arm);
    return () => { clearTimeout(t); removeEventListener('pointerdown', arm); removeEventListener('keydown', arm); };
  }, [kiosk, startDirectorsCut]);

  const counter = slot === INTRO ? 'Intro' : slot === OUTRO ? 'Wrap-up' : `Scene ${slot} of ${N} · ${scene!.name}`;
  const squashedByUser = stage.phone.squashed === 'user';

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <div className="mark" aria-hidden="true">›_</div>
          <div><b>{showcase.title}</b><small>{showcase.tagline}{kiosk ? ' · kiosk' : ''}</small></div>
        </div>
        <div className="head-right">
          <span className="counter">{counter}</span>
          <button type="button" className="sound" aria-pressed={soundOn} onClick={toggleSound}>
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </header>

      <main
        className="stage"
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) go(slot + (dx < 0 ? 1 : -1));
        }}
      >
        <section className="copy" aria-live="polite" data-focus-target="copy">
          <AnimatePresence mode="wait">
            <motion.div key={slot + ':' + runKey} className="copy-in" {...copyMotion}>
              {slot === INTRO && (
                <>
                  <motion.div variants={child} className="eyebrow">{showcase.intro.kicker}</motion.div>
                  <motion.h1 variants={child}>{showcase.intro.title}</motion.h1>
                  <motion.p variants={child} className="lede">{showcase.intro.lede}</motion.p>
                  <motion.div variants={child} className="cta-row">
                    <button type="button" className="btn-primary" onClick={() => go(1)}>Start the demo</button>
                    <button type="button" onClick={startDirectorsCut}>Play Director's Cut</button>
                  </motion.div>
                </>
              )}
              {scene && (
                <>
                  <motion.div variants={child} className="eyebrow">{scene.eyebrow}</motion.div>
                  <motion.h1 variants={child}>{scene.title}</motion.h1>
                  <motion.p variants={child} className="lede">{scene.lede}</motion.p>
                  <motion.div variants={child} className="note"><span>In practice</span>{scene.note}</motion.div>
                  {scene.hint && (
                    <motion.div variants={child} className={'hint' + (squashedByUser ? ' done' : '')}>
                      {squashedByUser
                        ? `Squashed! ${bugCount} ${bugCount === 1 ? 'bug' : 'bugs'} squashed on this device.`
                        : scene.hint}
                    </motion.div>
                  )}
                </>
              )}
              {slot === OUTRO && (
                <>
                  <motion.div variants={child} className="eyebrow">Wrap-up</motion.div>
                  <motion.h1 variants={child}>{showcase.outro.title}</motion.h1>
                  <motion.p variants={child} className="lede">{showcase.outro.lede}</motion.p>
                  <motion.ol variants={child} className="recap">
                    {showcase.scenes.map((s, i) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => go(i + 1)}>
                          <span>{s.eyebrow}</span>{s.title}
                        </button>
                      </li>
                    ))}
                  </motion.ol>
                  <motion.p variants={child} className="cta">{showcase.outro.cta}</motion.p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {stage.payoff && <Payoff label={showcase.payoff.label} stats={showcase.payoff.stats} reduced={reduced} />}
        </section>

        <div className="phone-col" data-focus-target="phone">
          <Phone phone={stage.phone} onSquash={onSquash} />
        </div>

        <Console lines={stage.lines} bus={bus} idle={slot === INTRO ? 'Describe the app you want…' : undefined} />
      </main>

      <nav aria-label="Scenes">
        <button type="button" onClick={() => go(slot - 1)}>Back</button>
        <div className="dots">
          {showcase.scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="dot"
              aria-label={`Scene ${i + 1}: ${s.name}`}
              aria-current={slot === i + 1}
              onClick={() => go(i + 1)}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(slot, auto)}>Replay<span className="long"> scene</span></button>
        <button type="button" className="btn-primary" onClick={togglePlay}>
          {auto ? 'Pause' : <>Play<span className="long"> Director's Cut</span></>}
        </button>
        <button type="button" onClick={() => go(slot + 1)}>Next</button>
      </nav>
    </div>
  );
}
