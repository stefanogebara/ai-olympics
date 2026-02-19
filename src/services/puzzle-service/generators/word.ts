/**
 * Word Puzzle Generator (Anagrams, Analogies, Hidden Words)
 */

import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { shuffle, puzzleId, difficultyPoints } from '../utils.js';

const EASY_WORDS = [
  'APPLE', 'HOUSE', 'WATER', 'MUSIC', 'PAPER', 'LIGHT', 'HAPPY', 'BEACH',
  'DREAM', 'STONE', 'FLAME', 'RIVER', 'CLOUD', 'TIGER', 'SMILE', 'BREAD',
  'DANCE', 'GREEN', 'CHAIR', 'BRAIN', 'PLANT', 'TRUCK', 'OCEAN', 'CANDY',
  'GRAPE', 'SPACE', 'PAINT', 'CLOCK', 'TRAIN', 'SWORD', 'TOWER', 'ANGEL',
  'HEART', 'STORM', 'PEARL', 'MAGIC', 'CORAL', 'PIANO', 'ROBIN', 'LEMON',
  'MAPLE', 'SOLAR', 'FROST', 'PLUME', 'SCOUT', 'DELTA', 'BLOOM', 'CRANE',
  'GLOBE', 'PRIZE', 'QUEST', 'VINYL',
];

const MEDIUM_WORDS = [
  'CRYSTAL', 'THUNDER', 'MYSTERY', 'FANTASY', 'BALANCE', 'HARMONY', 'JOURNEY',
  'VOLCANO', 'LIBRARY', 'FORTUNE', 'CAPTAIN', 'DOLPHIN', 'PHOENIX', 'CHAPTER',
  'MONSTER', 'DIAMOND', 'GATEWAY', 'CLIMATE', 'VOLTAGE', 'ORBITAL', 'TRUMPET',
  'BLANKET', 'COMPASS', 'KINGDOM', 'MISSILE', 'PARADOX', 'REACTOR', 'SHELTER',
  'TANTRUM', 'UPGRADE', 'WHISPER', 'ZEALOUS', 'LANTERN', 'CABINET', 'BLISTER',
  'ENCHANT', 'FICTION', 'GRAVITY', 'HABITAT', 'IMPULSE', 'JUSTICE', 'KINETIC',
  'MERCURY', 'NUCLEUS', 'OPTICAL', 'PILGRIM', 'QUANTUM', 'RIPPLED', 'SOARING',
];

const HARD_WORDS = [
  'SYMPHONY', 'ELOQUENT', 'PARADIGM', 'ALGORITHM', 'CRYPTOGRAPHY', 'DICHOTOMY',
  'LABYRINTH', 'EPHEMERAL', 'Byzantine', 'CHRONICLE', 'DYSTOPIAN', 'EXCALIBUR',
  'GROTESQUE', 'HYPERBOLE', 'INTRICATE', 'JUXTAPOSE', 'KILOMETER', 'LUXURIANT',
  'MAELSTROM', 'NEOPHYTE', 'OSCILLATE', 'PNEUMATIC', 'QUADRATIC', 'RESERVOIR',
  'SYCOPHANT', 'THRESHOLD', 'UNCHARTED', 'VORACIOUS', 'WANDERLUST', 'XYLOPHONE',
  'ALCHEMIST', 'BIOGRAPHY', 'CALCULATE', 'DEPRECATE', 'ELABORATE', 'FREQUENCY',
  'GALVANIZE', 'HARMONIZE', 'IDIOMATIC', 'JUGGERNAUT', 'KINEMATIC', 'LUMINANCE',
  'MECHANISM', 'NOSTALGIA', 'OBLIVIOUS', 'PERPETUAL', 'QUANDARY', 'RENAISSANCE',
];

const ANALOGIES = [
  { q: 'Hot is to Cold as Light is to ___', a: 'DARK' },
  { q: 'Bird is to Nest as Bee is to ___', a: 'HIVE' },
  { q: 'Fish is to Water as Bird is to ___', a: 'AIR' },
  { q: 'Day is to Night as Summer is to ___', a: 'WINTER' },
  { q: 'Pen is to Writer as Brush is to ___', a: 'PAINTER' },
  { q: 'Eye is to See as Ear is to ___', a: 'HEAR' },
  { q: 'Book is to Read as Song is to ___', a: 'LISTEN' },
  { q: 'Cat is to Kitten as Dog is to ___', a: 'PUPPY' },
  { q: 'Hand is to Glove as Foot is to ___', a: 'SHOE' },
  { q: 'Hunger is to Eat as Thirst is to ___', a: 'DRINK' },
  { q: 'Teacher is to Student as Doctor is to ___', a: 'PATIENT' },
  { q: 'Fire is to Ash as Ice is to ___', a: 'WATER' },
];

const HIDDEN_WORDS = [
  { sentence: 'The **cat**astrophe was terrible', answer: 'CAT' },
  { sentence: 'She could **hear**t the music', answer: 'HEAR' },
  { sentence: 'The **ant**agonist appeared', answer: 'ANT' },
  { sentence: 'They **arm**ored the vehicle', answer: 'ARM' },
  { sentence: 'A **ban**ner flew overhead', answer: 'BAN' },
  { sentence: 'The **car**ousel spun fast', answer: 'CAR' },
  { sentence: 'He was **old**er than expected', answer: 'OLD' },
  { sentence: 'The p**art**y was amazing', answer: 'ART' },
  { sentence: 'The **pal**ace was gorgeous', answer: 'PAL' },
  { sentence: 'The **win**dow was cracked', answer: 'WIN' },
];

export function generateWordPuzzle(difficulty: Difficulty): PuzzleWithAnswer {
  const uid = puzzleId('word');
  const points = difficultyPoints(difficulty);
  const timeLimit = difficulty === 'easy' ? 30 : difficulty === 'medium' ? 45 : 60;

  // Randomly pick puzzle type: anagram (60%), analogy (20%), hidden word (20%)
  const puzzleType = Math.random();

  if (puzzleType < 0.6) {
    // Anagram
    const wordList = difficulty === 'easy' ? EASY_WORDS : difficulty === 'medium' ? MEDIUM_WORDS : HARD_WORDS;
    const word = wordList[Math.floor(Math.random() * wordList.length)].toUpperCase();
    // Retry until the scrambled form differs from the original
    let scrambled: string;
    do {
      scrambled = shuffle(word.split('')).join('');
    } while (scrambled === word && word.length > 1);
    return {
      id: uid, game_type: 'word', difficulty,
      question: `Unscramble this word: ${scrambled}`,
      correct_answer: word,
      hint: `The word has ${word.length} letters and starts with ${word[0]}`,
      points, time_limit_seconds: timeLimit,
    };
  }

  if (puzzleType < 0.8) {
    // Analogy
    const analogy = ANALOGIES[Math.floor(Math.random() * ANALOGIES.length)];
    return {
      id: uid, game_type: 'word', difficulty,
      question: analogy.q,
      correct_answer: analogy.a,
      hint: `The answer has ${analogy.a.length} letters`,
      points, time_limit_seconds: timeLimit,
    };
  }

  // Hidden word
  const hw = HIDDEN_WORDS[Math.floor(Math.random() * HIDDEN_WORDS.length)];
  return {
    id: uid, game_type: 'word', difficulty,
    question: `Find the hidden word: ${hw.sentence}`,
    correct_answer: hw.answer,
    hint: `The hidden word has ${hw.answer.length} letters`,
    points, time_limit_seconds: timeLimit,
  };
}
