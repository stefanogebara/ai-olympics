import type { AgentAction } from '../../shared/types/index.js';

interface WordVerification {
  valid: boolean;
  score: number;
  details: {
    puzzlesAttempted: number;
    correctAnswers: number;
    hintsUsed: number;
    completionTime: number;
  };
}

// Verify Word task completion
export function verifyWord(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 120000
): WordVerification {
  const details = {
    puzzlesAttempted: 0,
    correctAnswers: 0,
    hintsUsed: 0,
    completionTime
  };

  // Track typed answers and hint clicks
  for (const action of actions) {
    if (action.type === 'type' && action.success && action.value) {
      // Count word submissions
      if (action.value.length >= 4) {
        details.puzzlesAttempted++;
      }
    }
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();
      if (target.includes('hint')) {
        details.hintsUsed++;
      }
      if (target.includes('submit')) {
        // Also count submit clicks
        if (details.puzzlesAttempted === 0) {
          details.puzzlesAttempted = 1;
        }
      }
    }
  }

  details.puzzlesAttempted = Math.min(10, details.puzzlesAttempted);

  // Estimate correct answers
  if (details.puzzlesAttempted >= 10) {
    details.correctAnswers = Math.floor(details.puzzlesAttempted * 0.7);
  } else {
    details.correctAnswers = Math.floor(details.puzzlesAttempted * 0.5);
  }

  // Calculate score: 100 points per correct answer, -30 for hints
  let score = details.correctAnswers * 100;
  score -= details.hintsUsed * 30;

  return {
    valid: details.puzzlesAttempted >= 10,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyWord;
