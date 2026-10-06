// Plays three days of Daily Quests on the Responsible AI pack with a simulated player,
// showing each pick, the engine's "Why this question?" reason and the mastery map.
// Usage: npm run demo
import { readFileSync } from 'node:fs';
import { createRng, DAY_MS, indexContent, LearnerModel, selectNext } from '../src/adaptive/index.ts';
import type { ContentPack } from '../src/content/pack.ts';

const pack = JSON.parse(readFileSync(new URL('../src/content/packs/responsible-ai.en.json', import.meta.url), 'utf8')) as ContentPack;
const model = new LearnerModel(indexContent(pack.skills, pack.items));
const rng = createRng(2026);
const start = Date.UTC(2026, 9, 6, 9);
// The simulated player knows the basics, is shakier on data handling, and improves as they play.
const ability: Record<string, number> = { 'ai-basics': 0.8, 'know-your-data': -0.3, 'safe-prompting': -0.5, 'check-before-trust': 0, 'copilot-in-flow': 0.2 };

const bar = (x: number) => '█'.repeat(Math.round(x * 20)).padEnd(20, '░');

for (const day of [0, 1, 4]) {
  console.log(`\n━━ Daily Quest, day ${day + 1} ━━`);
  const served = new Set<string>();
  const outcomes: number[] = [];
  for (let q = 0; q < 6; q++) {
    const now = start + day * DAY_MS + q * 45_000;
    const pick = selectNext(model, now, { servedItemIds: served, recentOutcomes: outcomes })!;
    const p = 1 / (1 + Math.exp(-(ability[pick.item.skillId]! - pick.item.difficulty)));
    const outcome = rng() < p ? 1 : 0;
    ability[pick.item.skillId]! += 0.25;
    model.apply({ id: `${day}-${q}`, at: now, itemId: pick.item.id, outcome, ms: 9_000 });
    served.add(pick.item.id);
    outcomes.push(outcome);
    const item = pack.items.find(i => i.id === pick.item.id)!;
    console.log(`${outcome ? '✔' : '✘'} ${item.prompt}`);
    console.log(`   Why this question? ${pick.why}`);
  }
}

console.log('\n━━ Mastery map ━━');
for (const s of pack.skills) {
  const status = model.isMastered(s.id) ? 'mastered' : model.isUnlocked(s.id) ? '' : 'locked';
  console.log(`${s.name.padEnd(36)} ${bar(model.mastery(s.id))} ${(model.mastery(s.id) * 100).toFixed(0).padStart(3)}% ${status}`);
}
