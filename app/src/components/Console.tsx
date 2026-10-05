import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Line } from '../engine/types';
import type { Bus } from '../engine/bus';
import { Rich } from './Rich';

export function Console({ lines, bus, idle }: { lines: Line[]; bus: Bus; idle?: string }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className="console" aria-label="Claude Code session" data-focus-target="console">
      <div className="con-bar"><i /><i /><i /><span>~/it-help-app · claude</span></div>
      <div className="con-body" ref={body}>
        {lines.length === 0 && idle && (
          <div className="ln"><span className="pr">&gt;</span> <span className="dim">{idle}</span><span className="caret" /></div>
        )}
        {lines.map(line => (
          <motion.div
            key={line.id}
            className={'ln ' + lineClass(line)}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28 }}
          >
            <LineBody line={line} bus={bus} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function lineClass(line: Line): string {
  if (line.kind === 'text') return line.style ?? '';
  // perm and diff draw their own box inside the line, so the wrapper must not repeat it.
  if (line.kind === 'perm' || line.kind === 'diff') return 'ln-' + line.kind;
  return line.kind;
}

function LineBody({ line, bus }: { line: Line; bus: Bus }) {
  switch (line.kind) {
    case 'text':
      return line.style === 'plan'
        ? <><span className="box" /><span><Rich text={line.text} /></span></>
        : <Rich text={line.text} />;
    case 'prompt':
      return <><span className="pr">&gt;</span> {line.text}{line.typing && <span className="caret" />}</>;
    case 'ask':
      return <><span className="dim">{line.question}</span> <span className={'pill' + (line.pressed ? ' pressed' : '')}>{line.answer}</span></>;
    case 'lane':
      return (
        <>
          <span className="lane-n">{line.lane.name}</span>
          <span className="lane-d">{line.lane.desc}</span>
          <span className="pct">{line.pct}%</span>
          <span className="bar"><i style={{ width: line.pct + '%' }} /></span>
        </>
      );
    case 'diff':
      return (
        <pre className="diff">
          {line.lines.map((d, i) => <span key={i} className={d.op === '+' ? 'p' : d.op === '-' ? 'm' : 'c'}>{d.op} {d.text}</span>)}
        </pre>
      );
    case 'perm':
      return (
        <div className={'perm' + (line.state === 'approved' ? ' done' : '')}>
          <div className="perm-t">Claude wants to run</div>
          <code>{line.command}</code>
          {line.state === 'approved' ? (
            <div className="perm-ok">{line.simulated ? '✓ Approved (simulated for the demo loop)' : '✓ Approved by you'}</div>
          ) : (
            <div className="perm-b">
              <button type="button" className={'btn-ok' + (line.state === 'pressed' ? ' pressed' : '')} onClick={() => bus.emit('approve')}>Approve</button>
              <button type="button" className="btn-no" onClick={() => bus.emit('deny')}>Deny</button>
            </div>
          )}
          {line.simulated && line.autoNote && <div className="perm-note">{line.autoNote}</div>}
        </div>
      );
    case 'check':
      return <>{line.done ? <span className="tick">✓</span> : <span className="spin" />}<span>{line.text}</span></>;
  }
}
