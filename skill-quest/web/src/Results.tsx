import { useEffect } from 'react';
import { confetti, play } from './fx.ts';
import { BADGES, itemById, pack, type Profile } from './game.ts';

export type QuestSummary = {
  xp: number;
  outcomes: number[];
  items: string[];
  masteryBefore: Record<string, number>;
  newBadges: string[];
};

export function Results({ summary, profile, onHome }: { summary: QuestSummary; profile: Profile; onHome: () => void }) {
  const correct = summary.outcomes.filter(o => o === 1).length;
  const practised = [...new Set(summary.items.map(id => itemById.get(id)!.skillId))];
  const celebrate = correct === summary.outcomes.length || summary.newBadges.length > 0;
  useEffect(() => { if (celebrate) { confetti(); play('combo'); } }, [celebrate]);
  const headline = correct === summary.outcomes.length ? 'Perfect run!' : correct >= summary.outcomes.length - 2 ? 'Strong quest' : 'Quest complete';

  return (
    <div className="results">
      <p className="eyebrow">Daily Quest complete</p>
      <h1>{headline}</h1>
      <dl className="stats big">
        <div><dt>XP earned</dt><dd>+{summary.xp}</dd></div>
        <div><dt>Fully correct</dt><dd>{correct} / {summary.outcomes.length}</dd></div>
        <div><dt>Streak</dt><dd>{profile.streak} {profile.streak === 1 ? 'day' : 'days'}</dd></div>
      </dl>

      {summary.newBadges.length > 0 && (
        <section aria-labelledby="new-badges">
          <h2 id="new-badges" className="section-h">New badges</h2>
          <ul className="badges">
            {summary.newBadges.map(id => {
              const b = BADGES.find(x => x.id === id)!;
              return (
                <li key={id} className="earned pop">
                  <span className="medal" aria-hidden="true">{b.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
                  <span><b>{b.name}</b><small>{b.description}</small></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="moved">
        <h2 id="moved" className="section-h">Skills you practised</h2>
        <ul className="skills">
          {practised.map(id => {
            const s = pack.skills.find(x => x.id === id)!;
            const before = summary.masteryBefore[id] ?? 0;
            const after = profile.model.mastery(id);
            const delta = Math.round((after - before) * 100);
            return (
              <li key={id} className="skill">
                <div className="skill-top">
                  <span className="skill-name">{s.name}</span>
                  <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta} pts</span>
                </div>
                <div className="meter two" aria-hidden="true">
                  <span className="after" style={{ width: `${after * 100}%` }} />
                  <span className="before" style={{ width: `${Math.min(before, after) * 100}%` }} />
                </div>
                <p className="skill-note">{Math.round(before * 100)}% → {Math.round(after * 100)}%{profile.model.isMastered(id) ? ' · Mastered' : ''}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="next-up">
        {profile.dueCount > 0
          ? `${profile.dueCount} ${profile.dueCount === 1 ? 'question is' : 'questions are'} due for a refresher now.`
          : 'Your refreshers are scheduled. Come back tomorrow to keep your streak going.'}
      </p>
      <button className="primary big" onClick={onHome}>Back to map</button>
    </div>
  );
}
