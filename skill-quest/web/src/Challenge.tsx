import { useEffect, useRef, useState } from 'react';
import type { PackItem, Response } from '../../src/content/pack.ts';
import type { Answered } from './App.tsx';
import { play, reducedMotion } from './fx.ts';
import { shuffledOrder } from './game.ts';
import { Scene } from './Scene.tsx';

type Props = {
  item: PackItem;
  skillName: string;
  why: string;
  hintUsed: boolean;
  onHint: () => void;
  answered: Answered | null;
  onAnswer: (r: Response) => void;
  onNext: () => void;
  last: boolean;
};

export function Challenge({ item, skillName, why, hintUsed, onHint, answered, onAnswer, onNext, last }: Props) {
  const [picked, setPicked] = useState<number[]>([]);
  const [sceneDone, setSceneDone] = useState(!item.scene);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const done = answered !== null;

  useEffect(() => { if (done) feedbackRef.current?.focus(); }, [done]);

  const toggle = (i: number) => { play('tap'); setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : [...p, i])); };

  return (
    <div className="challenge">
      <p className="eyebrow">{skillName}</p>
      {item.scene && <Scene scene={item.scene} onDone={() => setSceneDone(true)} />}
      {sceneDone && (
        <>
        <h1 id="q-prompt" className="prompt">{item.prompt}</h1>
        <details className="why">
          <summary>Why this question?</summary>
          <p>{why}</p>
        </details>

        {item.type === 'choice' && (
          <div className="options" role="group" aria-label="Choose one answer">
            {item.options.map((o, i) => (
              <button key={i} className={optionClass(done, i === item.answer, answered?.response === i)} disabled={done} onClick={() => onAnswer(i)}>
                <span className="key" aria-hidden="true">{String.fromCharCode(65 + i)}</span>{o}
              </button>
            ))}
          </div>
        )}

        {item.type === 'truefalse' && (
          <div className="options tf" role="group" aria-label="True or false">
            {[true, false].map(v => (
              <button key={String(v)} className={optionClass(done, v === item.answer, answered?.response === v)} disabled={done} onClick={() => onAnswer(v)}>
                {v ? 'True' : 'False'}
              </button>
            ))}
          </div>
        )}

        {item.type === 'multi' && (
          <>
            <p className="instruction">Select all that apply, then check.</p>
            <div className="options" role="group" aria-label="Select all that apply">
              {item.options.map((o, i) => (
                <button
                  key={i}
                  aria-pressed={picked.includes(i)}
                  className={`${optionClass(done, item.answer.includes(i), picked.includes(i))} ${picked.includes(i) ? 'picked' : ''}`}
                  disabled={done}
                  onClick={() => toggle(i)}
                >
                  <span className="box" aria-hidden="true" />{o}
                </button>
              ))}
            </div>
            {!done && <button className="primary" disabled={!picked.length} onClick={() => onAnswer(picked)}>Check answer</button>}
          </>
        )}

        {item.type === 'order' && <OrderChallenge item={item} done={done} onAnswer={onAnswer} />}

        {item.type === 'spot' && <SpotChallenge item={item} answered={answered} onAnswer={onAnswer} />}

        {item.type === 'classify' && <ClassifyChallenge item={item} answered={answered} onAnswer={onAnswer} />}

        {!done && item.hint && (
          hintUsed
            ? <p className="hint"><b>Hint</b>{item.hint}</p>
            : <button className="ghost" onClick={onHint}>Show a hint <small>(half XP)</small></button>
        )}

        {answered && (
          <div className={`feedback ${verdict(answered.outcome).cls}`} ref={feedbackRef} tabIndex={-1} aria-live="polite">
            <div className="feedback-head">
              <strong>{verdict(answered.outcome).label}</strong>
              <span className="gain">+{answered.xp} XP</span>
            </div>
            <p>{item.explanation}</p>
            <p className="source">Explanation written by the course authors.</p>
            <button className="primary" onClick={onNext}>{last ? 'See results' : 'Next question'}</button>
          </div>
        )}
        </>
      )}
    </div>
  );
}

function OrderChallenge({ item, done, onAnswer }: { item: Extract<PackItem, { type: 'order' }>; done: boolean; onAnswer: (r: Response) => void }) {
  const [placed, setPlaced] = useState<number[]>([]);
  const pool = shuffledOrder(item).filter(i => !placed.includes(i));
  return (
    <>
      <p className="instruction">Tap the steps in the right order. Tap a placed step to take it back.</p>
      <ol className="order-slots" aria-label="Your order">
        {item.options.map((_, slot) => {
          const i = placed[slot];
          return (
            <li key={slot} className={i === undefined ? 'empty' : done ? (i === slot ? 'right' : 'wrong') : ''}>
              {i === undefined ? <span className="slot-label">Step {slot + 1}</span> : (
                <button disabled={done} onClick={() => setPlaced(p => p.filter(x => x !== i))}>{item.options[i]}</button>
              )}
            </li>
          );
        })}
      </ol>
      {!done && (
        <div className="options pool" role="group" aria-label="Steps to place">
          {pool.map(i => <button key={i} className="option" onClick={() => setPlaced(p => [...p, i])}>{item.options[i]}</button>)}
        </div>
      )}
      {!done && <button className="primary" disabled={placed.length < item.options.length} onClick={() => onAnswer(placed)}>Check order</button>}
      {done && placed.some((v, i) => v !== i) && (
        <div className="correct-order">
          <p className="instruction">Correct order</p>
          <ol>{item.options.map((o, i) => <li key={i}>{o}</li>)}</ol>
        </div>
      )}
    </>
  );
}

function SpotChallenge({ item, answered, onAnswer }: { item: Extract<PackItem, { type: 'spot' }>; answered: Answered | null; onAnswer: (r: Response) => void }) {
  const [tapped, setTapped] = useState<number[]>([]);
  const done = answered !== null;
  const toggle = (i: number) => { play('tap'); setTapped(t => (t.includes(i) ? t.filter(x => x !== i) : [...t, i])); };
  const segClass = (i: number) => {
    const isRisky = item.risky.includes(i), isTapped = tapped.includes(i);
    if (!done) return isTapped ? 'seg marked' : 'seg';
    if (isRisky) return isTapped ? 'seg found' : 'seg missed';
    return isTapped ? 'seg false' : 'seg';
  };
  return (
    <>
      <p className="instruction">Tap each risky part. Tap again to unmark it.</p>
      <div className={`mock ${item.frame}`}>
        <div className="mock-head">{item.frame === 'email' ? 'Email' : 'Chat'} · {item.heading}</div>
        <p className="mock-body" role="group" aria-label="Message to check">
          {item.segments.map((seg, i) => (
            <button key={i} className={segClass(i)} aria-pressed={tapped.includes(i)} disabled={done} onClick={() => toggle(i)}>{seg}</button>
          ))}
        </p>
      </div>
      {done && item.risky.some(r => !tapped.includes(r)) && <p className="instruction legend"><span className="seg missed">Dashed</span> = risky parts you missed.</p>}
      {!done && <button className="primary" disabled={!tapped.length} onClick={() => onAnswer(tapped)}>Check ({tapped.length} marked)</button>}
    </>
  );
}

function ClassifyChallenge({ item, answered, onAnswer }: { item: Extract<PackItem, { type: 'classify' }>; answered: Answered | null; onAnswer: (r: Response) => void }) {
  const [placed, setPlaced] = useState<number[]>([]);
  const [flying, setFlying] = useState<number | null>(null);
  const done = answered !== null;
  const current = placed.length;

  const drop = (bucket: number) => {
    if (flying !== null || current >= item.cards.length) return;
    play('deal');
    // Let the card fly towards its bucket, then deal the next one. Answers once the deck is empty.
    const commit = () => {
      const next = [...placed, bucket];
      setPlaced(next);
      setFlying(null);
      if (next.length === item.cards.length) onAnswer(next);
    };
    if (reducedMotion()) { commit(); return; }
    setFlying(bucket);
    setTimeout(commit, 260);
  };

  if (done) {
    const response = answered.response as number[];
    return (
      <ul className="sorted">
        {item.cards.map((c, i) => {
          const ok = response[i] === c.bucket;
          return (
            <li key={i} className={ok ? 'right' : 'wrong'}>
              <span>{c.text}</span>
              <span className="sorted-to">{ok ? item.buckets[c.bucket] : <>{item.buckets[response[i]!]} → <b>{item.buckets[c.bucket]}</b></>}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  const card = item.cards[current];
  return (
    <>
      <div className="deck" aria-live="polite">
        <span className="deck-count">Card {Math.min(current + 1, item.cards.length)} of {item.cards.length}</span>
        {card && <div key={current} className={`card ${flying !== null ? `fly-${flying % 3}` : 'deal'}`}>{card.text}</div>}
        {current + 1 < item.cards.length && <div className="card under" aria-hidden="true" />}
      </div>
      <div className="buckets" role="group" aria-label="Choose where this card goes" style={{ gridTemplateColumns: `repeat(${item.buckets.length}, minmax(0, 1fr))` }}>
        {item.buckets.map((b, i) => (
          <button key={i} className="bucket" disabled={!card || flying !== null} onClick={() => drop(i)}>
            <b>{b}</b>
            <small>{placed.filter(x => x === i).length} sorted</small>
          </button>
        ))}
      </div>
      {current > 0 && flying === null && <button className="ghost" onClick={() => setPlaced(p => p.slice(0, -1))}>Undo last card</button>}
    </>
  );
}

function optionClass(done: boolean, isCorrect: boolean, isPicked: boolean): string {
  if (!done) return 'option';
  if (isCorrect) return 'option right';
  return isPicked ? 'option wrong' : 'option dim';
}

function verdict(outcome: number) {
  if (outcome === 1) return { label: 'Correct', cls: 'ok' };
  if (outcome > 0) return { label: `Partly right (${Math.round(outcome * 100)}%)`, cls: 'part' };
  return { label: 'Not quite', cls: 'bad' };
}
