import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_MS, selectNext, type Pick } from '../../src/adaptive/index.ts';
import type { Response } from '../../src/content/pack.ts';
import { scoreAnswer } from '../../src/game/score.ts';
import { Boss } from './Boss.tsx';
import { Challenge } from './Challenge.tsx';
import { buzz, confetti, isSoundOn, play, setSoundOn } from './fx.ts';
import { deriveProfile, emptySave, itemById, levelFor, load, pack, QUEST_LENGTH, save, xpFor, type PlayEvent, type Saved } from './game.ts';
import { Home } from './Home.tsx';
import { Flame, Speaker, Star } from './icons.tsx';
import { Results, type QuestSummary } from './Results.tsx';

export type Answered = { response: Response | null; outcome: number; xp: number; timedOut?: boolean };

type Quest = {
  sessionId: string;
  pick: Pick;
  served: string[];
  outcomes: number[];
  shownAt: number;
  hintUsed: boolean;
  answered: Answered | null;
  xp: number;
  masteryBefore: Record<string, number>;
  badgesBefore: Set<string>;
};

export function App() {
  const [saved, setSaved] = useState<Saved>(load);
  const [clock, setClock] = useState(() => Date.now());
  const now = clock + saved.clockOffsetDays * DAY_MS;
  const profile = useMemo(() => deriveProfile(saved.events, now), [saved.events, now]);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [summary, setSummary] = useState<QuestSummary | null>(null);
  const [sound, setSound] = useState(isSoundOn);
  const [levelUp, setLevelUp] = useState<ReturnType<typeof levelFor> | null>(null);
  const [bossOpen, setBossOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const update = (next: Saved) => { setSaved(next); save(next); };

  /** Saves an answer and celebrates if the XP it earned crosses into a new level. */
  function record(event: PlayEvent, xpGained: number) {
    setSaved(prev => {
      const next = { ...prev, events: [...prev.events, event] };
      save(next);
      return next;
    });
    const after = levelFor(profile.xp + xpGained);
    if (after.level > profile.level.level) {
      setLevelUp(after);
      setTimeout(() => { play('levelup'); confetti(); }, 350);
    }
  }
  const tick = () => setClock(Date.now());

  useEffect(() => { mainRef.current?.focus(); window.scrollTo?.({ top: 0 }); }, [quest?.pick.item.id, summary, quest === null, bossOpen]);

  function startQuest() {
    tick();
    const pick = selectNext(profile.model, now, { servedItemIds: new Set(), recentOutcomes: [] });
    if (!pick) return;
    const masteryBefore = Object.fromEntries(pack.skills.map(s => [s.id, profile.model.mastery(s.id)]));
    setSummary(null);
    setQuest({ sessionId: `q${now.toString(36)}`, pick, served: [pick.item.id], outcomes: [], shownAt: Date.now(), hintUsed: false, answered: null, xp: 0, masteryBefore, badgesBefore: new Set(profile.badges) });
  }

  function answer(response: Response) {
    if (!quest || quest.answered) return;
    const item = itemById.get(quest.pick.item.id)!;
    const outcome = scoreAnswer(item, response);
    let combo = 0;
    for (const o of [...quest.outcomes, outcome]) combo = o === 1 ? combo + 1 : 0;
    const xp = xpFor(item, outcome, quest.hintUsed, combo);
    const event: PlayEvent = {
      id: `${quest.sessionId}-${quest.outcomes.length}`, at: now, itemId: item.id, outcome,
      hintUsed: quest.hintUsed, ms: Date.now() - quest.shownAt, sessionId: quest.sessionId,
    };
    record(event, xp);
    setQuest({ ...quest, outcomes: [...quest.outcomes, outcome], answered: { response, outcome, xp }, xp: quest.xp + xp });

    // Feedback you can hear and feel. Combos and level-ups get a celebration.
    const comboHit = outcome === 1 && combo > 0 && combo % 3 === 0;
    play(outcome === 1 ? (comboHit ? 'combo' : 'correct') : outcome > 0 ? 'partial' : 'wrong');
    buzz(outcome === 1 ? 30 : outcome > 0 ? [20, 40, 20] : [60, 50, 60]);
    if (comboHit) confetti(60);
  }

  function next() {
    if (!quest) return;
    if (quest.outcomes.length >= QUEST_LENGTH) {
      setSummary({
        xp: quest.xp,
        outcomes: quest.outcomes,
        items: quest.served,
        masteryBefore: quest.masteryBefore,
        newBadges: [...profile.badges].filter(b => !quest.badgesBefore.has(b)),
      });
      setQuest(null);
      return;
    }
    const at = now + 1;
    const pick = selectNext(profile.model, at, { servedItemIds: new Set(quest.served), recentOutcomes: quest.outcomes })!;
    setQuest({ ...quest, pick, served: [...quest.served, pick.item.id], shownAt: Date.now(), hintUsed: false, answered: null });
  }

  const combo = (() => { let c = 0; for (const o of quest?.outcomes ?? []) c = o === 1 ? c + 1 : 0; return c; })();

  return (
    <div className="shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => { setQuest(null); setSummary(null); setBossOpen(false); tick(); }} aria-label="Skill Quest home">
          <span className="glyph" aria-hidden="true">SQ</span>
          <span><b>Skill Quest</b><small>{pack.title}</small></span>
        </button>
        <div className="chips" aria-label="Your progress">
          <button className="chip sound" aria-pressed={sound} aria-label={sound ? 'Sound on' : 'Sound off'} title={sound ? 'Sound on' : 'Sound off'} onClick={() => { setSoundOn(!sound); setSound(!sound); }}><Speaker on={sound} /></button>
          <span className="chip" title="Day streak"><Flame /> {profile.streak}</span>
          <span className="chip" title="Total XP"><Star /> {profile.xp}</span>
        </div>
      </header>

      <main ref={mainRef} tabIndex={-1}>
        {bossOpen ? (
          <Boss profile={profile} now={now} onRecord={record} onExit={() => { setBossOpen(false); tick(); }} />
        ) : quest ? (
          <section className="quest" aria-labelledby="q-prompt">
            <div className="quest-head">
              <ol className="dots" aria-label={`Question ${quest.served.length} of ${QUEST_LENGTH}`}>
                {Array.from({ length: QUEST_LENGTH }, (_, i) => {
                  const o = quest.outcomes[i];
                  const state = o === undefined ? (i === quest.served.length - 1 ? 'now' : 'todo') : o === 1 ? 'ok' : o > 0 ? 'part' : 'bad';
                  return <li key={i} className={`dot ${state}`} />;
                })}
              </ol>
              <span className="quest-xp">+{quest.xp} XP{combo >= 2 && <em className="combo">Combo ×{combo}</em>}</span>
            </div>
            <Challenge
              key={quest.pick.item.id}
              item={itemById.get(quest.pick.item.id)!}
              skillName={pack.skills.find(s => s.id === quest.pick.item.skillId)!.name}
              why={quest.pick.why}
              hintUsed={quest.hintUsed}
              onHint={() => setQuest({ ...quest, hintUsed: true })}
              answered={quest.answered}
              onAnswer={answer}
              onNext={next}
              last={quest.outcomes.length >= QUEST_LENGTH}
            />
          </section>
        ) : summary ? (
          <Results summary={summary} profile={profile} onHome={() => { setSummary(null); tick(); }} />
        ) : (
          <Home
            profile={profile}
            clockOffsetDays={saved.clockOffsetDays}
            onStart={startQuest}
            onBoss={() => { tick(); setBossOpen(true); }}
            onSkipDay={() => { update({ ...saved, clockOffsetDays: saved.clockOffsetDays + 1 }); tick(); }}
            onReset={() => { update(emptySave()); tick(); }}
          />
        )}
      </main>

      {levelUp && (
        <div className="levelup" role="dialog" aria-modal="true" aria-labelledby="lu-title">
          <div className="levelup-card">
            <div className="level-badge huge" aria-hidden="true">{levelUp.level}</div>
            <p className="eyebrow">Level up!</p>
            <h2 id="lu-title">You've reached {levelUp.name}</h2>
            <p>{levelUp.span} XP to the next level. Keep the streak going.</p>
            <button className="primary big" autoFocus onClick={() => setLevelUp(null)}>Keep going</button>
          </div>
        </div>
      )}
    </div>
  );
}
