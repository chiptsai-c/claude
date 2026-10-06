import { MASTERY_THETA, pCorrect } from './elo.ts';
import { indexContent, LearnerModel, type ContentIndex } from './learner.ts';
import { createRng, normal, type Rng } from './rng.ts';
import { selectNext } from './selector.ts';
import { DAY_MS, type ItemDef, type SkillDef } from './types.ts';

/**
 * Synthetic learners for tuning and regression-testing the adaptive engine.
 * Each learner has a hidden "true" ability per skill that grows with practice and decays without it.
 * Policies are compared on the same population (common random numbers), so differences come from the policy.
 */

export type Policy = 'adaptive' | 'linear' | 'random';

export type SimConfig = {
  learners: number;
  days: number;
  itemsPerSession: number;
  /** Chance a learner plays on any given day. */
  playProbability: number;
  seed: number;
};

export const DEFAULT_SIM: SimConfig = { learners: 1000, days: 30, itemsPerSession: 8, playProbability: 0.75, seed: 42 };

export type SimReport = {
  policy: Policy;
  learners: number;
  answers: number;
  /** Mean true chance of answering a benchmark item, at the start and the end. */
  startMastery: number;
  endMastery: number;
  /** Fraction of (learner, skill) pairs truly mastered at the end. */
  skillsMastered: number;
  /** Observed fraction of correct answers. */
  successRate: number;
  /** Fraction of sessions containing three or more wrong answers in a row. */
  frustrationRate: number;
  /** Adaptive only: correlation between the engine's ability estimate and the hidden truth. */
  estimateCorrelation: number | null;
  /** Adaptive only: |mean predicted success − observed success|. */
  calibrationError: number | null;
};

// Hidden learner dynamics.
const LEARN_RATE = 0.12;
const FORGET_RATE = 0.03;
const PREREQ_PENALTY = 0.4; // learning is slower while prerequisites are weak

/** A synthetic content bank: 8 skills in a prerequisite graph, 25 items each, difficulty −2.5…+2.5. */
export function syntheticContent(seed = 7, itemsPerSkill = 25): ContentIndex {
  const prereqs: string[][] = [[], [], ['s0'], ['s1'], ['s2', 's3'], ['s4'], ['s4'], ['s5', 's6']];
  const skills: SkillDef[] = prereqs.map((p, i) => ({ id: `s${i}`, name: `Skill ${i}`, prerequisites: p, mandatory: i === 1 }));
  const rng = createRng(seed);
  const items: ItemDef[] = [];
  for (const s of skills)
    for (let i = 0; i < itemsPerSkill; i++) items.push({ id: `${s.id}-i${i}`, skillId: s.id, difficulty: -2.5 + 5 * rng() });
  return indexContent(skills, items);
}

type Truth = { theta: number[]; base: number[]; rate: number; practice: number[] };

function makeLearner(rng: Rng, content: ContentIndex): Truth {
  const depth = content.skillList.map(function d(s): number {
    return s.prerequisites.length ? 1 + Math.max(...s.prerequisites.map(p => d(content.skills.get(p)!))) : 0;
  });
  const mu = normal(rng, -0.8, 0.6);
  const base = depth.map(dp => mu - 0.2 * dp + normal(rng, 0, 0.5));
  return { theta: [...base], base, rate: 0.6 + 0.8 * rng(), practice: base.map(() => 0) };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

export function simulate(policy: Policy, config: Partial<SimConfig> = {}, content = syntheticContent()): SimReport {
  const cfg = { ...DEFAULT_SIM, ...config };
  const skillIdx = new Map(content.skillList.map((s, i) => [s.id, i]));
  const prereqIdx = content.skillList.map(s => s.prerequisites.map(p => skillIdx.get(p)!));
  const linearOrder = content.skillList.flatMap(s => [...content.itemsBySkill.get(s.id)!].sort((a, b) => a.difficulty - b.difficulty));
  const benchmark = (t: number) => pCorrect(t, 0);

  let answers = 0, correct = 0, sessions = 0, frustrated = 0, predictedSum = 0;
  let startSum = 0, endSum = 0, masteredCount = 0, pairs = 0;
  const est: number[] = [], tru: number[] = [];

  for (let l = 0; l < cfg.learners; l++) {
    const learner = makeLearner(createRng(cfg.seed * 1_000_003 + l), content);
    const world = createRng(cfg.seed * 7_919 + l); // answers and play days
    const pickRng = createRng(cfg.seed * 104_729 + l);
    const model = new LearnerModel(content);
    let cursor = 0;
    startSum += learner.theta.reduce((a, t) => a + benchmark(t), 0);

    for (let day = 0; day < cfg.days; day++) {
      // Forgetting: drift back towards the starting level, slower for well-practised skills.
      learner.theta.forEach((t, s) => { learner.theta[s] = t - (FORGET_RATE * (t - learner.base[s]!)) / (1 + 0.25 * learner.practice[s]!); });
      if (world() >= cfg.playProbability) continue;

      sessions++;
      const served = new Set<string>();
      const outcomes: number[] = [];
      let wrongRun = 0, hadFrustration = false;

      for (let q = 0; q < cfg.itemsPerSession; q++) {
        const now = day * DAY_MS + 9 * 3_600_000 + q * 40_000;
        let item: ItemDef;
        if (policy === 'adaptive') {
          const pick = selectNext(model, now, { servedItemIds: served, recentOutcomes: outcomes }, { rng: pickRng });
          if (!pick) break;
          item = pick.item;
          predictedSum += pick.predicted;
        } else if (policy === 'linear') {
          item = linearOrder[cursor++ % linearOrder.length]!;
        } else {
          item = content.itemList[Math.floor(pickRng() * content.itemList.length)]!;
        }

        const s = skillIdx.get(item.skillId)!;
        const p = pCorrect(learner.theta[s]!, item.difficulty);
        const outcome = world() < p ? 1 : 0;
        const prereqOk = prereqIdx[s]!.every(i => learner.theta[i]! >= 0);
        learner.theta[s]! += LEARN_RATE * learner.rate * 4 * p * (1 - p) * (prereqOk ? 1 : PREREQ_PENALTY);
        learner.practice[s]! += 1;

        model.apply({ id: `${l}-${day}-${q}`, at: now, itemId: item.id, outcome, ms: 4_000 + (1 - p) * 16_000 });
        served.add(item.id);
        outcomes.push(outcome);
        answers++;
        correct += outcome;
        wrongRun = outcome ? 0 : wrongRun + 1;
        if (wrongRun >= 3) hadFrustration = true;
      }
      if (hadFrustration) frustrated++;
    }

    learner.theta.forEach((t, s) => {
      endSum += benchmark(t);
      if (t >= MASTERY_THETA) masteredCount++;
      pairs++;
      const st = model.skill(content.skillList[s]!.id);
      if (st && st.evidence >= 3) { est.push(st.theta); tru.push(t); }
    });
  }

  const adaptive = policy === 'adaptive';
  return {
    policy,
    learners: cfg.learners,
    answers,
    startMastery: startSum / pairs,
    endMastery: endSum / pairs,
    skillsMastered: masteredCount / pairs,
    successRate: answers ? correct / answers : 0,
    frustrationRate: sessions ? frustrated / sessions : 0,
    estimateCorrelation: adaptive ? pearson(est, tru) : null,
    calibrationError: adaptive && answers ? Math.abs(predictedSum / answers - correct / answers) : null,
  };
}

/**
 * Quality gates the adaptive engine must pass. Returns problems; empty means pass.
 * Depth (skills truly mastered) and experience (frustration, flow) are gated. Breadth — average partial
 * knowledge across every skill — is reported but not gated: a linear course touches every skill, the
 * adaptive engine holds back skills whose prerequisites aren't there yet. That trade-off is deliberate.
 */
export function checkGates(reports: SimReport[]): string[] {
  const a = reports.find(r => r.policy === 'adaptive');
  if (!a) return ['No adaptive report'];
  const problems: string[] = [];
  const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const other of reports.filter(r => r.policy !== 'adaptive')) {
    if (a.skillsMastered < other.skillsMastered * 1.2)
      problems.push(`Skills mastered ${pc(a.skillsMastered)} is not at least 20% above ${other.policy} (${pc(other.skillsMastered)})`);
    if (a.frustrationRate >= other.frustrationRate)
      problems.push(`Frustrated sessions ${pc(a.frustrationRate)} is not below ${other.policy} (${pc(other.frustrationRate)})`);
  }
  const random = reports.find(r => r.policy === 'random');
  if (random && a.endMastery - a.startMastery <= random.endMastery - random.startMastery)
    problems.push(`Learning gain does not beat random practice`);
  if (a.successRate < 0.65 || a.successRate > 0.9) problems.push(`Success rate ${pc(a.successRate)} is outside the 65–90% flow band`);
  if (a.frustrationRate > 0.1) problems.push(`Frustrated sessions ${pc(a.frustrationRate)} is above 10%`);
  if ((a.estimateCorrelation ?? 0) < 0.8) problems.push(`Ability estimate correlation ${a.estimateCorrelation?.toFixed(2)} is below 0.80`);
  if ((a.calibrationError ?? 1) > 0.1) problems.push(`Calibration error ${pc(a.calibrationError ?? 1)} is above 10%`);
  return problems;
}
