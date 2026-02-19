/**
 * Trivia Puzzle Generator (Open Trivia DB API)
 */

import { createLogger } from '../../../shared/utils/logger.js';
import { circuits, CircuitOpenError } from '../../../shared/utils/circuit-breaker.js';
import type { Difficulty, PuzzleWithAnswer } from '../types.js';
import { shuffle, decodeHtml, difficultyPoints } from '../utils.js';

const log = createLogger('TriviaGenerator');

interface OpenTriviaQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export async function fetchTriviaQuestions(difficulty: Difficulty, amount: number = 10): Promise<PuzzleWithAnswer[]> {
  try {
    return await circuits.opentdb.execute(async () => {
      const difficultyMap: Record<Difficulty, string> = {
        easy: 'easy',
        medium: 'medium',
        hard: 'hard'
      };

      const response = await fetch(
        `https://opentdb.com/api.php?amount=${amount}&difficulty=${difficultyMap[difficulty]}&type=multiple`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch trivia questions');
      }

      const data = await response.json();

      if (data.response_code !== 0) {
        throw new Error('Open Trivia DB returned error');
      }

      return data.results.map((q: OpenTriviaQuestion, index: number) => {
        const allAnswers = [q.correct_answer, ...q.incorrect_answers];
        const shuffled = shuffle(allAnswers);

        return {
          id: `trivia-${Date.now()}-${index}`,
          game_type: 'trivia' as const,
          difficulty,
          question: decodeHtml(q.question),
          options: shuffled.map((ans, i) => ({
            id: String.fromCharCode(65 + i),
            text: decodeHtml(ans)
          })),
          correct_answer: String.fromCharCode(65 + shuffled.indexOf(q.correct_answer)),
          points: difficultyPoints(difficulty),
          time_limit_seconds: 30
        };
      });
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      log.warn('OpenTDB circuit open, skipping', { error: error.message });
    } else {
      log.error('Error fetching trivia questions', { error: String(error) });
    }
    return [];
  }
}
