import { useEffect, useRef, useState } from 'react';
import type { Response } from '../../src/content/pack.ts';
import { scoreAnswer } from '../../src/game/score.ts';
import type { Answered } from './App.tsx';
import { Challenge } from './Challenge.tsx';
import { buzz, confetti, play } from './fx.ts';
import {
  BOSS, bossReplay, bossRequirements, bossSeconds, itemById, pack, pickBossItems, xpFor,
  type BossPace, type PlayEvent, type Profile,
} from './game.ts';

const PACE_KEY = 'skill-quest:boss-pace';
const PACES: { id: BossPace; label: string; note: string }[] = [
  { id: 'standard', label: 'Standard', note: '30–60 s a question' },
  { id: 'relaxed', label: 'Relaxed', note: 'Double time' },
  { id: 'off', label: 'No timer', note: 'Take your time' },
];

const TAUNTS = [
  'I forward everything to everyone. What could go wrong?',
  'Paste it all into a public chatbot. It’s faster!',
  'Passwords are just secrets you haven’t shared yet.',
];

type Battle = {
  sessionId: string;
  items: string[];
  outcomes: number[];
  answered: Answered | null;
  shownAt: number;
  xp: number;
  reaction: 'hit' | 'attack' | null;
};

type Props = {
  profile: Profile;
  now: number;
  onRecord: (event: PlayEvent, xp: number) => void;
  onExit: () => void;
};

export function Boss({ profile, now, onRecord, onExit }: Props) {
  const [pace, setPace] = useState<BossPace>(() => {
    try { return (localStorage.getItem(PACE_KEY) as BossPace) || 'standard'; } catch { return 'standard'; }
  });
  const [battle, setBattle] = useState<Battle | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [badgesBefore, setBadgesBefore] = useState<Set<string>>(new Set());
  const nextRef = useRef(0);

  const state = bossReplay(battle?.outcomes ?? []);
  const itemId = battle ? battle.items[battle.outcomes.length - (battle.answered ? 1 : 0)] : undefined;
  const item = itemId ? itemById.get(itemId) : undefined;
  const limit = item ? bossSeconds(item, pace) : Infinity;

  // Countdown. Running out of time counts as a wrong answer.
  useEffect(() => {
    if (!battle || battle.answered || !item || !Number.isFinite(limit)) return;
    const tickTimer = () => {
      const left = limit - (Date.now() - battle.shownAt) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) answer(null);
      else if (left <= 5 && Math.ceil(left) !== nextRef.current) { nextRef.current = Math.ceil(left); play('tap'); }
    };
    tickTimer();
    const t = setInterval(tickTimer, 200);
    return () => clearInterval(t);
  });

  function choosePace(p: BossPace) {
    setPace(p);
    try { localStorage.setItem(PACE_KEY, p); } catch { /* not kept */ }
  }

  function start() {
    setBadgesBefore(new Set(profile.badges));
    setBattle({ sessionId: `b${now.toString(36)}`, items: pickBossItems(profile.model), outcomes: [], answered: null, shownAt: Date.now(), xp: 0, reaction: null });
  }

  function answer(response: Response | null) {
    if (!battle || battle.answered || !item) return;
    const timedOut = response === null;
    const outcome = timedOut ? 0 : scoreAnswer(item, response);
    let combo = 0;
    for (const o of [...battle.outcomes, outcome]) combo = o === 1 ? combo + 1 : 0;
    const xp = xpFor(item, outcome, false, combo) * BOSS.xpMultiplier;
    const outcomes = [...battle.outcomes, outcome];
    const after = bossReplay(outcomes);
    const bonus = after.won ? BOSS.winXp : 0;
    onRecord({
      id: `${battle.sessionId}-${battle.outcomes.length}`, at: now + battle.outcomes.length, itemId: item.id, outcome,
      hintUsed: false, ms: Date.now() - battle.shownAt, sessionId: battle.sessionId, mode: 'boss',
    }, xp + bonus);

    const hit = outcome >= 0.5;
    play(hit ? 'correct' : 'wrong');
    buzz(hit ? 40 : [80, 40, 80]);
    if (after.won) setTimeout(() => { play('levelup'); confetti(); }, 400);
    setBattle({ ...battle, outcomes, answered: { response, outcome, xp, timedOut }, xp: battle.xp + xp + bonus, reaction: hit ? 'hit' : 'attack' });
    setTimeout(() => setBattle(b => (b ? { ...b, reaction: null } : b)), 650);
  }

  function next() {
    if (!battle) return;
    nextRef.current = 0;
    setBattle({ ...battle, answered: null, shownAt: Date.now(), reaction: null });
  }

  // Lair: rules, timer choice and unlock requirements.
  if (!battle) {
    const reqs = bossRequirements(profile);
    const unlocked = reqs.every(r => r.done);
    return (
      <div className="boss-lair">
        <p className="eyebrow">Boss Battle · Chapter 1</p>
        <Monster mood="idle" />
        <h1>{BOSS.name}</h1>
        <p className="taunt">“{TAUNTS[profile.quests % TAUNTS.length]}”</p>
        <ul className="rules">
          <li><b>{BOSS.questions} questions</b> across every skill you've unlocked, mixed formats, no hints.</li>
          <li><b>Good answers hit the boss.</b> Get its {BOSS.hp} HP to zero to win.</li>
          <li><b>Poor answers cost a heart.</b> Lose all {BOSS.hearts} and the boss wins this round.</li>
          <li><b>Double XP</b>, plus {BOSS.winXp} XP and the Boss Slayer badge for a win.</li>
        </ul>
        {unlocked ? (
          <>
            <fieldset className="pace">
              <legend>Timer</legend>
              {PACES.map(p => (
                <label key={p.id} className={pace === p.id ? 'on' : ''}>
                  <input type="radio" name="pace" id={`pace-${p.id}`} checked={pace === p.id} onChange={() => choosePace(p.id)} />
                  <b>{p.label}</b><small>{p.note}</small>
                </label>
              ))}
            </fieldset>
            <button className="primary big boss-go" onClick={start}>Start battle</button>
          </>
        ) : (
          <div className="locked-box">
            <p><b>Locked.</b> To face the boss:</p>
            <ul>
              {reqs.map(r => <li key={r.label} className={r.done ? 'done' : ''}>{r.done ? '✓' : '○'} {r.label}{r.progress && !r.done ? ` (${r.progress})` : ''}</li>)}
            </ul>
          </div>
        )}
        <button className="ghost" onClick={onExit}>Back to map</button>
      </div>
    );
  }

  // Battle over: victory or defeat.
  if (state.over && !battle.answered) {
    const correct = battle.outcomes.filter(o => o === 1).length;
    const newBadges = [...profile.badges].filter(b => !badgesBefore.has(b));
    return (
      <div className={`boss-end ${state.won ? 'won' : 'lost'}`}>
        <Monster mood={state.won ? 'defeated' : 'gloat'} />
        <p className="eyebrow">{state.won ? 'Victory' : 'Defeat'}</p>
        <h1>{state.won ? `${BOSS.name} is beaten!` : `${BOSS.name} wins this round`}</h1>
        <p className="lede">
          {state.won
            ? `You won with ${state.hearts} ${state.hearts === 1 ? 'heart' : 'hearts'} left. Chapter cleared.`
            : `The boss had ${state.hp} HP left. Your Daily Quests will now focus on what tripped you up.`}
        </p>
        <dl className="stats big">
          <div><dt>XP earned</dt><dd>+{battle.xp}</dd></div>
          <div><dt>Fully correct</dt><dd>{correct} / {battle.outcomes.length}</dd></div>
          <div><dt>Hearts left</dt><dd>{state.hearts} / {BOSS.hearts}</dd></div>
        </dl>
        {newBadges.includes('boss-slayer') && <p className="badge-flash"><span className="medal" aria-hidden="true">BS</span> New badge: <b>Boss Slayer</b></p>}
        <p className="footnote">Practice battle on this device. In the full app, chapter certification needs an online Boss Battle.</p>
        <div className="end-actions">
          <button className="primary big" onClick={start}>{state.won ? 'Battle again' : 'Try again'}</button>
          <button className="ghost" onClick={onExit}>Back to map</button>
        </div>
      </div>
    );
  }

  // In battle.
  const timed = Number.isFinite(limit);
  const urgent = timed && !battle.answered && remaining <= 5;
  const skill = pack.skills.find(s => s.id === item!.skillId)!;
  const extra = battle.answered && (
    battle.answered.outcome >= 0.5
      ? <p className="dmg hit">You hit {BOSS.name} for {Math.round(BOSS.damage * battle.answered.outcome)} damage.</p>
      : <p className="dmg ouch">{BOSS.name} strikes back. You lose a heart.</p>
  );
  return (
    <section className={`arena ${battle.reaction === 'attack' ? 'shake' : ''}`} aria-labelledby="q-prompt">
      <div className="arena-head">
        <Monster mood={battle.reaction === 'hit' ? 'hit' : 'idle'} small />
        <div className="arena-stats">
          <div className="boss-name"><b>{BOSS.name}</b><span>{state.hp} HP</span></div>
          <div className="hp" role="meter" aria-label="Boss health" aria-valuemin={0} aria-valuemax={BOSS.hp} aria-valuenow={state.hp}>
            <span style={{ width: `${(state.hp / BOSS.hp) * 100}%` }} />
          </div>
          <div className="arena-row">
            <span className="hearts" aria-label={`${state.hearts} of ${BOSS.hearts} hearts left`}>
              {Array.from({ length: BOSS.hearts }, (_, i) => <Heart key={i} full={i < state.hearts} />)}
            </span>
            <span className="round">Q{Math.min(battle.outcomes.length + (battle.answered ? 0 : 1), BOSS.questions)}/{BOSS.questions}</span>
          </div>
        </div>
      </div>
      {timed && (
        <div className={`timer ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`${Math.ceil(remaining)} seconds left`}>
          <span style={{ width: `${battle.answered ? 0 : (remaining / limit) * 100}%` }} />
          <em aria-hidden="true">{battle.answered ? '—' : `${Math.ceil(remaining)}s`}</em>
        </div>
      )}
      <Challenge
        key={item!.id}
        item={{ ...item!, scene: undefined }}
        skillName={skill.name}
        why={`Boss Battle: testing ${skill.name} at a stretch level (about a 60% chance).`}
        hintUsed={false}
        onHint={() => {}}
        allowHint={false}
        answered={battle.answered}
        onAnswer={answer}
        onNext={next}
        last={false}
        feedbackExtra={extra}
        nextLabel={bossReplay(battle.outcomes).over ? 'See the result' : 'Next attack'}
      />
    </section>
  );
}

function Heart({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" className={full ? 'heart' : 'heart lost'} aria-hidden="true">
      <path d="M8 14.2 1.9 8.4A3.7 3.7 0 0 1 8 3.6a3.7 3.7 0 0 1 6.1 4.8Z" />
    </svg>
  );
}

/** "The Oversharer": a blob with a megaphone, leaking documents. Drawn in code so it costs nothing to download. */
export function Monster({ mood, small }: { mood: 'idle' | 'hit' | 'defeated' | 'gloat'; small?: boolean }) {
  const ko = mood === 'defeated';
  return (
    <svg viewBox="0 0 180 150" className={`monster ${mood} ${small ? 'small' : ''}`} role="img" aria-label={`${BOSS.name}${ko ? ', defeated' : ''}`}>
      <g className="papers">
        <rect x="128" y="18" width="22" height="28" rx="3" transform="rotate(18 139 32)" />
        <rect x="146" y="58" width="20" height="26" rx="3" transform="rotate(-12 156 71)" />
        <rect x="18" y="20" width="20" height="26" rx="3" transform="rotate(-20 28 33)" />
      </g>
      <g className="body">
        <path className="blob" d="M90 22c34 0 52 26 52 58 0 34-20 56-52 56s-54-20-54-54c0-34 20-60 54-60Z" />
        <path className="megaphone" d="M128 86l30-16v40l-30-12Z" />
        <rect className="megaphone" x="120" y="84" width="12" height="16" rx="3" />
        {ko ? (
          <g className="eyes-ko">
            <path d="m64 66 14 14m0-14-14 14M102 66l14 14m0-14-14 14" />
          </g>
        ) : (
          <g>
            <circle className="eye" cx="71" cy="72" r="12" />
            <circle className="eye" cx="109" cy="72" r="12" />
            <circle className="pupil" cx={mood === 'gloat' ? 70 : 74} cy="74" r="5" />
            <circle className="pupil" cx={mood === 'gloat' ? 108 : 112} cy="74" r="5" />
            <path className="brow" d="M58 54l24 8M122 54l-24 8" />
          </g>
        )}
        <path className="mouth" d={ko ? 'M74 108q16-8 32 0' : 'M70 100q20 20 40 0Z'} />
      </g>
    </svg>
  );
}
