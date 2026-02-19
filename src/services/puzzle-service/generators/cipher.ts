/**
 * Cipher Puzzle Generator
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { puzzleId, difficultyPoints } from '../utils.js';

export function caesarShift(text: string, shift: number): string {
  return text.split('').map(ch => {
    if (ch >= 'A' && ch <= 'Z') {
      return String.fromCharCode(((ch.charCodeAt(0) - 65 + shift + 26) % 26) + 65);
    }
    return ch;
  }).join('');
}

export function generateCipherPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('cipher');

  if (difficulty === 'easy') {
    // Caesar cipher with known shift
    const phrases = ['HELLO WORLD', 'GOOD MORNING', 'OPEN SESAME', 'HIDDEN MESSAGE', 'SECRET CODE'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const shift = Math.floor(Math.random() * 10) + 1;
    const encrypted = caesarShift(phrase, shift);
    return {
      id: uid, game_type: 'cipher', difficulty,
      question: `Decode this Caesar cipher (shift +${shift}): ${encrypted}`,
      correct_answer: phrase,
      explanation: `Shift each letter back by ${shift} positions`,
      hint: `The first letter of the answer is ${phrase[0]}`,
      points: 50, time_limit_seconds: 60,
    };
  }

  if (difficulty === 'medium') {
    const mediumType = Math.floor(Math.random() * 3);
    if (mediumType === 0) {
      // Caesar cipher with unknown shift
      const phrases = ['ATTACK AT DAWN', 'HELLO WORLD', 'SECRET MESSAGE', 'CODE BREAKER'];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const shift = Math.floor(Math.random() * 20) + 3;
      const encrypted = caesarShift(phrase, shift);
      return {
        id: uid, game_type: 'cipher', difficulty,
        question: `Decode this Caesar cipher (unknown shift): ${encrypted}`,
        correct_answer: phrase,
        explanation: `The shift was ${shift}`,
        hint: `Try different shifts. The message is in English.`,
        points: difficultyPoints('medium'), time_limit_seconds: 90,
      };
    }
    if (mediumType === 1) {
      // ROT13
      const phrases = ['HELLO WORLD', 'PUZZLE SOLVED', 'NICE WORK'];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const encrypted = caesarShift(phrase, 13);
      return {
        id: uid, game_type: 'cipher', difficulty,
        question: `Decode this ROT13 cipher: ${encrypted}`,
        correct_answer: phrase,
        explanation: 'ROT13 shifts each letter by 13 positions',
        points: difficultyPoints('medium'), time_limit_seconds: 90,
      };
    }
    // Reversed text
    const phrases = ['HELLO WORLD', 'MIRROR IMAGE', 'BACKWARDS TEXT'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const reversed = phrase.split('').reverse().join('');
    return {
      id: uid, game_type: 'cipher', difficulty,
      question: `Decode this reversed text: ${reversed}`,
      correct_answer: phrase,
      explanation: 'The text is simply reversed',
      points: difficultyPoints('medium'), time_limit_seconds: 90,
    };
  }

  // Hard
  const hardType = Math.floor(Math.random() * 3);
  if (hardType === 0) {
    // Number-to-letter (A=1, B=2, ...)
    const words = ['HELLO', 'CIPHER', 'SECRET', 'PUZZLE', 'DECODE'];
    const word = words[Math.floor(Math.random() * words.length)];
    const encoded = word.split('').map(c => c.charCodeAt(0) - 64).join('-');
    return {
      id: uid, game_type: 'cipher', difficulty,
      question: `A=1, B=2, ..., Z=26. Decode: ${encoded}`,
      correct_answer: word,
      explanation: 'Each number maps to the corresponding letter of the alphabet',
      points: difficultyPoints('hard'), time_limit_seconds: 120,
    };
  }
  if (hardType === 1) {
    // Atbash cipher (A<->Z, B<->Y, ...)
    const words = ['HELLO', 'WORLD', 'AGENT', 'BRAIN'];
    const word = words[Math.floor(Math.random() * words.length)];
    const atbash = word.split('').map(c => String.fromCharCode(155 - c.charCodeAt(0))).join('');
    return {
      id: uid, game_type: 'cipher', difficulty,
      question: `Decode this Atbash cipher (A<->Z, B<->Y, ...): ${atbash}`,
      correct_answer: word,
      explanation: 'Atbash replaces each letter with its reverse: A<->Z, B<->Y, C<->X, etc.',
      points: difficultyPoints('hard'), time_limit_seconds: 120,
    };
  }
  // Mixed substitution with partial key given
  const words = ['DECODE', 'CYPHER', 'HIDDEN'];
  const word = words[Math.floor(Math.random() * words.length)];
  const shift = Math.floor(Math.random() * 15) + 5;
  const encrypted = caesarShift(word, shift);
  const firstChar = word[0];
  const firstEncrypted = encrypted[0];
  return {
    id: uid, game_type: 'cipher', difficulty,
    question: `Decode with partial key (${firstEncrypted}->${firstChar}): ${encrypted}`,
    correct_answer: word,
    explanation: `The shift is ${shift} (deduced from ${firstEncrypted}->${firstChar})`,
    points: difficultyPoints('hard'), time_limit_seconds: 120,
  };
}
