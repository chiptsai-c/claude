import { useState } from 'react';
import { Flame, Star } from './icons.tsx';
import { Monster } from './Boss.tsx';
import { BADGES, BOSS, bossRequirements, pack, QUEST_LENGTH, type Profile } from './game.ts';

type Props = {
  profile: Profile;
  clockOffsetDays: number;
  onStart: () => void;
  onBoss: () => void;
  onSkipDay: () => void;
  onReset: () => void;
};

export function Home({ profile, clockOffsetDays, onStart, onBoss, onSkipDay, onReset }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const { level, model } = profile;
  const bossReqs = bossRequirements(profile);
  const bossReady = bossReqs.every(r => r.done);

  return (
    <div className="home">
      <section className="player" aria-label="Your level">
        <div className="level-row">
          <div className="level-badge" aria-hidden="true">{level.level}</div>
          <div className="level-text">
            <p className="eyebrow">Level {level.level}</p>
            <h1>{level.name}</h1>
          </div>
        </div>
        <div className="xpbar" role="progressbar" aria-label="XP to next level" aria-valuemin={0} aria-valuemax={level.span} aria-valuenow={level.into}>
          <span style={{ width: `${(level.into / level.span) * 100}%` }} />
        </div>
        <p className="xp-caption">{level.into} / {level.span} XP to level {level.level + 1}</p>
        <dl className="stats">
          <div><dt><Flame /> Streak</dt><dd>{profile.streak} {profile.streak === 1 ? 'day' : 'days'}</dd></div>
          <div><dt><Star /> Total XP</dt><dd>{profile.xp}</dd></div>
          <div><dt>Quests</dt><dd>{profile.quests}</dd></div>
        </dl>
      </section>

      <section className="start">
        <div>
          <h2>{profile.playedToday ? 'Go again' : "Today's quest"}</h2>
          <p>
            {QUEST_LENGTH} questions picked for you · about 4 minutes
            {profile.dueCount > 0 && <> · <b className="due">{profile.dueCount} {profile.dueCount === 1 ? 'refresher' : 'refreshers'} due</b></>}
          </p>
        </div>
        <button className="primary big" onClick={onStart}>Start Daily Quest</button>
      </section>

      <section className={`boss-card ${bossReady ? 'ready' : 'locked'}`} aria-labelledby="boss-h">
        <Monster mood="idle" small />
        <div className="boss-card-text">
          <p className="eyebrow">Boss Battle{profile.bossWins > 0 ? ` · beaten ${profile.bossWins}×` : ''}</p>
          <h2 id="boss-h">{BOSS.name}</h2>
          <p>{bossReady ? `${BOSS.questions} mixed questions, ${BOSS.hearts} hearts, double XP.` : bossReqs.filter(r => !r.done).map(r => r.label + (r.progress ? ` (${r.progress})` : '')).join(' · ')}</p>
        </div>
        <button className={bossReady ? 'primary' : 'ghost'} onClick={onBoss}>{bossReady ? 'Fight' : 'Preview'}</button>
      </section>

      <section aria-labelledby="map-h">
        <h2 id="map-h" className="section-h">Mastery map</h2>
        <ul className="skills">
          {pack.skills.map(s => {
            const m = model.mastery(s.id);
            const unlocked = model.isUnlocked(s.id);
            const st = model.skill(s.id);
            const status = !unlocked ? 'Locked' : model.isMastered(s.id) ? 'Mastered' : st ? 'In progress' : 'New';
            const needs = s.prerequisites.map(p => pack.skills.find(x => x.id === p)!.name).join(' and ');
            return (
              <li key={s.id} className={`skill ${status.toLowerCase().replace(' ', '-')}`}>
                <div className="skill-top">
                  <span className="skill-name">{s.name}{s.mandatory && <em className="req">Required</em>}</span>
                  <span className="status">{status}</span>
                </div>
                <div className="meter" aria-hidden="true"><span style={{ width: `${unlocked ? m * 100 : 0}%` }} /></div>
                <p className="skill-note">{unlocked ? `${Math.round(m * 100)}% · ${s.description}` : `Unlocks after ${needs}`}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="badges-h">
        <h2 id="badges-h" className="section-h">Badges <small>{profile.badges.size} of {BADGES.length}</small></h2>
        <ul className="badges">
          {BADGES.map(b => {
            const earned = profile.badges.has(b.id);
            return (
              <li key={b.id} className={earned ? 'earned' : 'locked'}>
                <span className="medal" aria-hidden="true">{b.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
                <span><b>{b.name}</b><small>{earned ? 'Earned' : b.description}</small></span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="how" aria-labelledby="how-h">
        <h2 id="how-h" className="section-h">How it works</h2>
        <ul>
          <li><b>Picked for you.</b> The engine aims for questions you have about a 70% chance of getting right. Tap “Why this question?” to see its reason.</li>
          <li><b>Refreshers before you forget.</b> Questions come back on a spaced-repetition schedule.</li>
          <li><b>Fair scoring.</b> Answers are scored by fixed rules. Required topics unlock the rest of the map.</li>
          <li><b>Works offline.</b> Everything runs on this device, and progress is saved only here.</li>
        </ul>
      </section>

      <section className="demo" aria-labelledby="demo-h">
        <h2 id="demo-h" className="section-h">Demo controls</h2>
        <p>Jump ahead to see refreshers come due{clockOffsetDays > 0 && <> (game clock is {clockOffsetDays} {clockOffsetDays === 1 ? 'day' : 'days'} ahead)</>}.</p>
        <div className="demo-actions">
          <button className="ghost" onClick={onSkipDay}>Jump ahead 1 day</button>
          {confirmReset ? (
            <span className="confirm">
              Erase all progress on this device?
              <button className="ghost danger" onClick={() => { onReset(); setConfirmReset(false); }}>Erase</button>
              <button className="ghost" onClick={() => setConfirmReset(false)}>Keep</button>
            </span>
          ) : (
            <button className="ghost" onClick={() => setConfirmReset(true)}>Reset progress</button>
          )}
        </div>
      </section>

      <p className="footnote">Prototype with sample content. Check the questions against your company's AI and data policies before real use.</p>
    </div>
  );
}
