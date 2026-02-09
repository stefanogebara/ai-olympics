import type { AgentAction } from '../../shared/types/index.js';

interface LogicVerification {
  valid: boolean;
  score: number;
  details: {
    puzzlesAttempted: number;
    correctAnswers: number;
    completionTime: number;
  };
}

// Verify Logic task completion
export function verifyLogic(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): LogicVerification {
  const details = {
    puzzlesAttempted: 0,
    correctAnswers: 0,
    completionTime
  };

  // Track option clicks
  for (const action of actions) {
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();
      // Count option button clicks (answers)
      if (
        target.includes('true') ||
        target.includes('false') ||
        target.includes('cannot') ||
        /^\d+$/.test(target.trim()) ||
        target.length <= 3 // Short answers like K, 64, etc.
      ) {
        details.puzzlesAttempted++;
      }
    }
  }

  details.puzzlesAttempted = Math.min(5, details.puzzlesAttempted);

  // Estimate correct answers
  if (details.puzzlesAttempted >= 5) {
    details.correctAnswers = Math.floor(details.puzzlesAttempted * 0.6);
  } else {
    details.correctAnswers = Math.floor(details.puzzlesAttempted * 0.4);
  }

  // Calculate score: 200 points per correct answer
  const score = details.correctAnswers * 200;

  return {
    valid: details.puzzlesAttempted >= 5,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyLogic;
