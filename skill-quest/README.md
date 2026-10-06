# Skill Quest — adaptive engine

The offline learning engine behind Skill Quest (design: [`docs/skill-quest-design.md`](../docs/skill-quest-design.md)). Pure TypeScript with no runtime dependencies. It runs on the phone, decides which question comes next, explains why, and schedules reviews before players forget.

| Part | File | What it does |
|---|---|---|
| Skill model | `src/adaptive/elo.ts` | Elo / 1-parameter IRT ability per skill; mastery and unlock rules |
| Memory model | `src/adaptive/fsrs.ts` | FSRS-4.5 spaced repetition: recall probability and next review date per question |
| Learner model | `src/adaptive/learner.ts` | Builds state from answer events. Any order, duplicates ignored, so sync never conflicts |
| Selector | `src/adaptive/selector.ts` | Picks the next question (flow zone, review due, required topics, novelty) and writes "Why this question?" |
| Simulator | `src/adaptive/simulate.ts` | Synthetic learners compare adaptive vs a linear course vs random practice, with quality gates |
| Scoring | `src/game/score.ts` | Deterministic 0–1 scoring with partial credit. AI never changes a score |
| Content | `src/content/` | Pack types, author-friendly validator, sample pack *Responsible AI & Copilot Essentials* |

## Play it (web prototype)
`web/` is a clickable Daily Quest built on the engine: 6 questions picked for you, "Why this question?", hints, XP, combos, levels, streaks, 7 badges, a mastery map with locked skills, and a results screen. Everything (XP, streak, badges) is derived from the answer log saved on the device. **Demo controls** at the bottom of the home screen jump the clock forward a day so refreshers come due.

```bash
npm run dev               # open the local URL on your laptop or phone (same Wi-Fi)
npm run build             # web/dist: deploy to Azure Static Web Apps; installable, works offline (service worker)
npm run build:artifact    # web/artifact/index.html: one self-contained page to share as a single link
```

## Run it
Needs Node 22.18 or later (runs TypeScript directly).
```bash
cd skill-quest
npm install
npm test                                  # 37 engine, content, game-rule, simulation and UI tests
npm run simulate -- --learners 10000      # policy comparison + quality gates (~30 s)
npm run demo                              # three Daily Quests on the sample pack, in the terminal
```

## Simulation results (10,000 learners per policy, 30 days, 8 questions a session)

| Policy | Skills truly mastered | Avg. mastery gain | Success rate | Frustrated sessions* |
|---|---|---|---|---|
| **Adaptive engine** | **38.5%** | +30.6 pts | 74.8% | **4.2%** |
| Linear course | 30.9% | +36.8 pts | 47.9% | 48.6% |
| Random practice | 6.8% | +20.4 pts | 36.8% | 65.0% |

\*Sessions with three or more wrong answers in a row. Ability estimates correlate 0.91 with the hidden truth.

**How to read it:** the adaptive engine produces about **25% more fully mastered skills** than a linear course, with **one-tenth of the frustration**. A linear course spreads partial knowledge more widely, because it walks every player through every topic even when they lack the basics, so it scores higher on average mastery. That trade-off is deliberate: depth and experience are gated, breadth is reported. The simulation doesn't model drop-out yet. In real life, half of all sessions going badly would cost the linear course players.

**Tuning dial:** the target success rate (`DEFAULT_TARGET`, now 70%) trades learning against comfort:

| Target | Skills mastered | Frustrated sessions |
|---|---|---|
| 55% | 46.9% | 12.3% |
| 62% | 43.1% | 7.9% |
| **70% (default)** | **38.3%** | **4.3%** |
| 78% | 33.0% | 3.1% |
| 85% | 28.3% | 4.2% |

(500-learner sweep.) Validate it with pilot data before changing it.

## Quality gates (`npm run simulate` exits 1 if any fail; CI runs 10,000 learners)
- Skills mastered at least 20% above both linear and random practice
- Fewer frustrated sessions than both, and no more than 10%
- Learning gain beats random practice
- Success rate within the 65–90% flow band
- Ability estimate correlation of 0.80 or more; calibration error of 10% or less

## Authoring content
Packs are JSON (`src/content/packs/*.json`) and are checked by `npm test`. Question types: `choice`, `multi`, `truefalse`, `order` (list the steps in the correct order; the app shuffles them). Difficulty runs from −3 (very easy) to +3 (very hard).

**Aim for 10–15 questions per skill**, spread across difficulties. The validator's minimum is 3, but with only 4 per skill (as in the sample pack) the engine runs out of well-matched questions and has to serve warm-ups or stretch questions, as `npm run demo` shows.

## Known limits / next steps
- Simulated learners are a model, not people. Re-tune `DEFAULT_TARGET` and the step-size constants in `elo.ts` from pilot data.
- Predictions run about 8 points below actual success, because players improve faster than estimates catch up. That's within the gate, and a learning-drift term could close it.
- Item difficulties are author estimates until re-calibrated from aggregated play data.
