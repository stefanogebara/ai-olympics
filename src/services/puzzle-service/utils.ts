/**
 * Puzzle Service Utilities
 */

import { randomUUID } from 'node:crypto';

/** Fisher-Yates shuffle -- unbiased random permutation */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Decode HTML entities from Open Trivia DB */
export function decodeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Generate a unique puzzle ID */
export function puzzleId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** Get point values for a difficulty level */
export function difficultyPoints(difficulty: 'easy' | 'medium' | 'hard'): number {
  return difficulty === 'easy' ? 50 : difficulty === 'medium' ? 150 : 400;
}
