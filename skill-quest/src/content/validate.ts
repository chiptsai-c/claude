import type { ContentPack } from './pack.ts';

const MIN_ITEMS_PER_SKILL = 3;

/** Returns a list of problems in a content pack; empty means valid. Messages are written for content authors. */
export function validatePack(pack: ContentPack): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('Pack is missing id');
  if (!/^\d+\.\d+\.\d+$/.test(pack.version ?? '')) errors.push(`Pack version "${pack.version}" must look like 1.0.0`);
  if (!pack.locale) errors.push('Pack is missing locale');
  if (!pack.title) errors.push('Pack is missing title');
  if (!pack.skills?.length) errors.push('Pack has no skills');
  if (!pack.items?.length) errors.push('Pack has no items');

  const skillIds = new Set<string>();
  for (const s of pack.skills ?? []) {
    if (skillIds.has(s.id)) errors.push(`Duplicate skill id "${s.id}"`);
    skillIds.add(s.id);
    if (!s.name || !s.description) errors.push(`Skill "${s.id}" needs a name and description`);
  }
  for (const s of pack.skills ?? [])
    for (const p of s.prerequisites ?? []) if (!skillIds.has(p)) errors.push(`Skill "${s.id}" has unknown prerequisite "${p}"`);

  // Prerequisite cycles would lock skills forever.
  const prereqs = new Map((pack.skills ?? []).map(s => [s.id, s.prerequisites ?? []]));
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') { errors.push(`Prerequisite cycle: ${[...path, id].join(' → ')}`); return; }
    state.set(id, 'visiting');
    for (const p of prereqs.get(id) ?? []) if (prereqs.has(p)) visit(p, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of prereqs.keys()) visit(id, []);

  const itemIds = new Set<string>();
  const perSkill = new Map<string, number>();
  for (const it of pack.items ?? []) {
    const at = `Item "${it.id}"`;
    if (itemIds.has(it.id)) errors.push(`Duplicate item id "${it.id}"`);
    itemIds.add(it.id);
    if (!skillIds.has(it.skillId)) errors.push(`${at} has unknown skill "${it.skillId}"`);
    perSkill.set(it.skillId, (perSkill.get(it.skillId) ?? 0) + 1);
    if (typeof it.difficulty !== 'number' || it.difficulty < -3 || it.difficulty > 3) errors.push(`${at} difficulty must be a number from -3 to 3`);
    if (!it.prompt?.trim()) errors.push(`${at} needs a prompt`);
    if (!it.explanation?.trim()) errors.push(`${at} needs an explanation`);

    if (it.scene && (!it.scene.title || !it.scene.lines?.length || it.scene.lines.some(l => !l.who || !l.text || !['left', 'right', 'system'].includes(l.side))))
      errors.push(`${at} scene needs a title and lines with who, text and side (left, right or system)`);

    switch (it.type) {
      case 'choice':
        if (it.options.length < 2) errors.push(`${at} needs at least 2 options`);
        if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.options.length) errors.push(`${at} answer must be an option index`);
        break;
      case 'multi':
        if (it.options.length < 3) errors.push(`${at} needs at least 3 options`);
        if (!it.answer.length || new Set(it.answer).size !== it.answer.length || it.answer.some(a => !Number.isInteger(a) || a < 0 || a >= it.options.length))
          errors.push(`${at} answer must be a list of distinct option indices`);
        break;
      case 'truefalse':
        if (typeof it.answer !== 'boolean') errors.push(`${at} answer must be true or false`);
        break;
      case 'order':
        if (it.options.length < 3) errors.push(`${at} needs at least 3 steps to order`);
        break;
      case 'spot':
        if (!it.heading || it.segments.length < 3) errors.push(`${at} needs a heading and at least 3 segments`);
        if (!it.risky.length || new Set(it.risky).size !== it.risky.length || it.risky.some(r => !Number.isInteger(r) || r < 0 || r >= it.segments.length))
          errors.push(`${at} risky must be a list of distinct segment indices`);
        else if (it.risky.length === it.segments.length) errors.push(`${at} must have at least one safe segment`);
        break;
      case 'classify':
        if (it.buckets.length < 2) errors.push(`${at} needs at least 2 buckets`);
        if (it.cards.length < 3) errors.push(`${at} needs at least 3 cards`);
        it.cards.forEach((c, i) => {
          if (!c.text || !Number.isInteger(c.bucket) || c.bucket < 0 || c.bucket >= it.buckets.length) errors.push(`${at} card ${i + 1} needs text and a valid bucket`);
        });
        break;
      default:
        errors.push(`${at} has unknown type "${(it as { type: string }).type}"`);
    }
  }
  for (const id of skillIds) {
    const n = perSkill.get(id) ?? 0;
    if (n < MIN_ITEMS_PER_SKILL) errors.push(`Skill "${id}" has ${n} items; it needs at least ${MIN_ITEMS_PER_SKILL}`);
  }
  return errors;
}
