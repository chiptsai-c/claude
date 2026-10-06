import { describe, expect, it } from 'vitest';
import { checkGates, simulate } from '../src/adaptive/index.ts';

describe('simulated learners', () => {
  it('meets every quality gate against linear and random practice', () => {
    const reports = (['adaptive', 'linear', 'random'] as const).map(p => simulate(p, { learners: 1000 }));
    expect(checkGates(reports)).toEqual([]);
  }, 60_000);

  it('is deterministic for a given seed', () => {
    expect(simulate('adaptive', { learners: 20, seed: 3 })).toEqual(simulate('adaptive', { learners: 20, seed: 3 }));
  });

  it('flags an engine that does worse than the baselines', () => {
    const reports = (['adaptive', 'linear', 'random'] as const).map(p => simulate(p, { learners: 50 }));
    const broken = reports.map(r => (r.policy === 'adaptive' ? { ...r, skillsMastered: 0, frustrationRate: 0.9 } : r));
    expect(checkGates(broken).length).toBeGreaterThan(0);
  });
});
