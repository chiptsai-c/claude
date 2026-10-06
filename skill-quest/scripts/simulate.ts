// Runs the simulated-learner comparison and fails (exit 1) if the adaptive engine misses a quality gate.
// Usage: npm run simulate -- --learners 10000 --days 30 --seed 42
import { checkGates, simulate, type Policy, type SimConfig } from '../src/adaptive/index.ts';

const args = process.argv.slice(2);
const num = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const config: Partial<SimConfig> = Object.fromEntries(
  Object.entries({ learners: num('--learners'), days: num('--days'), seed: num('--seed'), itemsPerSession: num('--items') }).filter(([, v]) => v !== undefined),
);

const pct = (x: number | null) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);
const started = Date.now();
const reports = (['adaptive', 'linear', 'random'] as Policy[]).map(p => simulate(p, config));

console.log(`Simulated ${reports[0]!.learners.toLocaleString()} learners per policy in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
console.table(
  Object.fromEntries(reports.map(r => [r.policy, {
    'start mastery': pct(r.startMastery),
    'end mastery': pct(r.endMastery),
    'skills mastered': pct(r.skillsMastered),
    'success rate': pct(r.successRate),
    'frustrated sessions': pct(r.frustrationRate),
    'estimate r': r.estimateCorrelation?.toFixed(2) ?? '–',
    'calibration err': pct(r.calibrationError),
  }])),
);

const problems = checkGates(reports);
if (problems.length) {
  console.error('\nQuality gates FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('\nAll quality gates passed.');
