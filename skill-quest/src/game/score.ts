import type { PackItem, Response } from '../content/pack.ts';

/**
 * Deterministic scoring: "the engine decides". Returns 0..1. Generative AI never changes this number.
 * Anything malformed scores 0.
 */
export function scoreAnswer(item: PackItem, response: Response): number {
  switch (item.type) {
    case 'choice':
      return response === item.answer ? 1 : 0;
    case 'truefalse':
      return response === item.answer ? 1 : 0;
    case 'multi': {
      if (!Array.isArray(response)) return 0;
      const picked = new Set(response);
      const right = item.answer.filter(a => picked.has(a)).length;
      const wrong = picked.size - right;
      return Math.max(0, (right - wrong) / item.answer.length);
    }
    case 'order': {
      // response lists option indices in the player's order; the correct order is 0, 1, 2, …
      const n = item.options.length;
      if (!Array.isArray(response) || response.length !== n || new Set(response).size !== n || response.some(i => i < 0 || i >= n)) return 0;
      let inOrder = 0;
      for (let i = 0; i < n - 1; i++) if (response[i]! < response[i + 1]!) inOrder++;
      return inOrder / (n - 1);
    }
  }
}
