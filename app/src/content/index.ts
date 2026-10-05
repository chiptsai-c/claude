import raw from './showcase.json';
import type { Showcase } from '../engine/types';
import { validateShowcase } from './validate';

export const showcase = raw as Showcase;

const problems = validateShowcase(showcase);
if (problems.length) console.warn('showcase.json problems:\n' + problems.join('\n'));
