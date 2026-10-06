import { useEffect, useState } from 'react';
import type { Scene as SceneData } from '../../src/content/pack.ts';
import { play, reducedMotion } from './fx.ts';

/**
 * Plays a short scene like a captioned video clip: messages arrive one by one with a typing indicator.
 * Tiny, offline and translatable, because the "footage" is just text in the content pack.
 */
export function Scene({ scene, onDone }: { scene: SceneData; onDone: () => void }) {
  const instant = reducedMotion();
  const [shown, setShown] = useState(instant ? scene.lines.length : 0);
  const [typing, setTyping] = useState(false);
  const [run, setRun] = useState(0);
  const done = shown >= scene.lines.length;

  useEffect(() => {
    if (done) { onDone(); return; }
    const line = scene.lines[shown]!;
    const typeMs = Math.min(1700, 450 + line.text.length * 16);
    setTyping(true);
    const t1 = setTimeout(() => { setTyping(false); setShown(n => n + 1); play('tap'); }, typeMs + (shown === 0 ? 300 : 500));
    return () => clearTimeout(t1);
  }, [shown, done, run]);

  const next = scene.lines[shown];
  return (
    <figure className="scene" aria-label={`Scene: ${scene.title}`}>
      <figcaption className="scene-bar">
        <span className={`rec ${done ? 'stopped' : ''}`} aria-hidden="true" />
        <span className="scene-title">{scene.title}</span>
        <span className="scene-progress" aria-hidden="true"><span style={{ width: `${(shown / scene.lines.length) * 100}%` }} /></span>
        {done
          ? <button className="scene-btn" onClick={() => { setShown(0); setRun(r => r + 1); }}>Replay</button>
          : <button className="scene-btn" onClick={() => { setTyping(false); setShown(scene.lines.length); }}>Skip scene</button>}
      </figcaption>
      <ol className="thread" aria-live="polite">
        {scene.lines.slice(0, shown).map((l, i) => (
          <li key={`${run}-${i}`} className={`msg ${l.side}`}>
            <span className="who">{l.who}{l.side === 'system' && <em className="ai-tag">AI</em>}</span>
            <span className="bubble">{l.text}</span>
          </li>
        ))}
        {typing && next && (
          <li className={`msg ${next.side} typing`} aria-label={`${next.who} is typing`}>
            <span className="who">{next.who}</span>
            <span className="bubble"><i /><i /><i /></span>
          </li>
        )}
      </ol>
      <p className="scene-note">Fictional scene for training.</p>
    </figure>
  );
}
