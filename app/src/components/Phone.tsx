import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PhoneState } from '../engine/types';

interface Props {
  phone: PhoneState;
  onSquash: () => void;
}

const piece = (delay = 0) => ({
  off: { opacity: 0, y: 14, scale: 0.97 },
  on: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 22, delay } },
});

function Piece({ at, build, delay, className, children }: { at: number; build: number; delay?: number; className: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={piece(delay)} initial="off" animate={build >= at ? 'on' : 'off'}>
      {children}
    </motion.div>
  );
}

export function Phone({ phone, onSquash }: Props) {
  const { build, bug, squashed, launched, notified } = phone;
  const screenRef = useRef<HTMLDivElement>(null);
  const broken = bug && !squashed;
  const badgeBroken = bug;
  // The bug stays mounted after the fix so its splat can finish playing.

  return (
    <div className="phone" data-build={build}>
      <div className={'screen' + (squashed === 'user' ? ' shake' : '')} ref={screenRef}>
        <div className="in">
          <div className="notch" />
          <div className="sb"><span>9:41</span><span>5G ▮</span></div>
          <div className={'empty' + (build > 0 ? ' gone' : '')}>
            <b>Empty project</b><span>Waiting for a plan</span>
          </div>
          <Piece at={1} build={build} className="appbar">
            <div><small>IT Help</small><strong>My requests</strong></div>
            <span className="avatar">AL</span>
          </Piece>
          <Piece at={2} build={build} className="chips">
            <span className="chip on">All</span><span className="chip">Open</span><span className="chip">Resolved</span>
          </Piece>
          <div className="list">
            <Piece at={3} build={build} className="card">
              <div className="ic a">LAP</div><b>Laptop replacement</b>
              <div className="meta"><span>REQ0012841</span><span className="badge info">In progress</span></div>
            </Piece>
            <Piece at={3} build={build} delay={0.14} className="card">
              <div className="ic b">VPN</div><b>VPN access for vendor</b>
              <div className="meta">
                <span>REQ0012867</span>
                <motion.span
                  key={badgeBroken ? 'broken' : 'fixed'}
                  className={'badge ' + (badgeBroken ? 'broken' : 'warn')}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                >
                  {badgeBroken ? 'status.pending_approval' : 'Pending approval'}
                </motion.span>
              </div>
            </Piece>
            <Piece at={3} build={build} delay={0.28} className="card">
              <div className="ic c">MON</div><b>Second monitor</b>
              <div className="meta"><span>REQ0012790</span><span className="badge ok">Resolved</span></div>
            </Piece>
          </div>
          <Piece at={4} build={build} className="fab">+ New request</Piece>
          <Piece at={4} build={build} className="tabbar">
            <span className="on">Requests</span><span>Approvals</span><span>Profile</span>
          </Piece>
        </div>

        {(bug || squashed) && <Bug key="bug" squashed={squashed} active={broken} onSquash={onSquash} screenRef={screenRef} />}

        <AnimatePresence>
          {notified && (
            <motion.div
              className="toast"
              initial={{ y: '-160%' }}
              animate={{ y: 0 }}
              exit={{ y: '-160%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            >
              <small><span>IT HELP</span><span>now</span></small>
              <div>Your VPN access request was approved.</div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {launched && (
            <motion.div className="launch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div>
                <Rocket />
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
                  <b>Shipped</b>Tests green. Ready for internal testing.
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface Splat { x: number; y: number; powX: number; path: string; blobs: { cx: number; cy: number; r: number }[]; drops: { a: number; d: number }[] }

function makeSplat(x: number, y: number, width: number): Splat {
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = (i % 2 ? 22 : 34) + Math.random() * 12;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const mid = (p: [number, number], q: [number, number]) => `${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`;
  const path = 'M' + mid(pts[pts.length - 1], pts[0]) +
    pts.map((p, i) => ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mid(p, pts[(i + 1) % pts.length])}`).join('') + 'Z';
  const blobs = [0, 1, 2].map(() => {
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 10;
    return { cx: Math.cos(a) * d, cy: Math.sin(a) * d, r: 3 + Math.random() * 4 };
  });
  const drops = Array.from({ length: 9 }, (_, i) => ({ a: i * 40 + Math.random() * 20, d: 10 + Math.random() * 9 }));
  // Keep the "SQUASHED!" label on screen even when the bug is near an edge.
  const powX = Math.min(Math.max(x, width * 0.3), width * 0.7) - x;
  return { x, y, powX, path, blobs, drops };
}

function Bug({ squashed, active, onSquash, screenRef }: {
  squashed: PhoneState['squashed'];
  active: boolean;
  onSquash: () => void;
  screenRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [frozen, setFrozen] = useState<{ left: string; top: string; rotate: string } | null>(null);
  const [splat, setSplat] = useState<Splat | null>(null);

  // Freeze the bug where it was hit, or it jumps when the crawl animation stops.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!squashed || !el || frozen) return;
    const cs = getComputedStyle(el);
    setFrozen({ left: cs.left, top: cs.top, rotate: cs.rotate });
    setSplat(makeSplat(el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2, screenRef.current?.clientWidth ?? 300));
    const t = setTimeout(() => setSplat(null), 2200);
    return () => clearTimeout(t);
  }, [squashed, frozen, screenRef]);

  return (
    <>
      {splat && (
        <div className="splat" style={{ left: splat.x, top: splat.y }} aria-hidden="true">
          <svg className="goo" viewBox="-50 -50 100 100">
            <path d={splat.path} />
            {splat.blobs.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r={b.r} />)}
          </svg>
          {splat.drops.map((d, i) => (
            <i key={i} className="drop" style={{ '--a': `${d.a}deg`, '--dist': `${d.d}cqi` } as React.CSSProperties} />
          ))}
          {squashed === 'user' && <b className="pow" style={{ left: splat.powX }}>SQUASHED!</b>}
        </div>
      )}
      <button
        ref={ref}
        className={'bug' + (squashed ? ' squashed' : '')}
        style={frozen ?? undefined}
        aria-label="Squash the bug"
        disabled={!active}
        onClick={onSquash}
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <g stroke="#2b1a1a" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M12 16 4 12M12 22H3M12 28 4 33M28 16l8-4M28 22h9M28 28l8 5M17 7l-3-4M23 7l3-4" />
          </g>
          <ellipse cx="20" cy="24" rx="9" ry="12" fill="#d0263a" />
          <circle cx="20" cy="10" r="5" fill="#2b1a1a" />
          <path d="M20 13v23" stroke="#2b1a1a" strokeWidth="1.6" />
          <circle cx="16" cy="21" r="2" fill="#2b1a1a" /><circle cx="24" cy="27" r="2" fill="#2b1a1a" /><circle cx="16" cy="30" r="1.6" fill="#2b1a1a" />
        </svg>
      </button>
    </>
  );
}

function Rocket() {
  return (
    <svg className="rocket" viewBox="0 0 60 100" aria-hidden="true">
      <path d="M30 4C44 16 46 40 42 62H18C14 40 16 16 30 4Z" fill="#e9ecf6" />
      <circle cx="30" cy="34" r="7" fill="#7aa2ff" stroke="#11162a" strokeWidth="3" />
      <path d="M18 50 6 66v10l14-8ZM42 50l12 16v10l-14-8Z" fill="#ee8a5e" />
      <path d="M22 64h16l-3 10h-10Z" fill="#9aa3c2" />
      <path d="M24 74c0 10 6 20 6 20s6-10 6-20Z" fill="#f3bd55" />
    </svg>
  );
}
