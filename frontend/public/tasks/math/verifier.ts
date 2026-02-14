import type { AgentAction } from '../../shared/types/index.js';

interface MathVerification {
  valid: boolean;
  score: number;
  details: {
    problemsAttempted: number;
    correctAnswers: number;
    completionTime: number;
  };
}

// Verify Math task completion
export function verifyMath(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): MathVerification {
  const details = {
    problemsAttempted: 0,
    correctAnswers: 0,
    completionTime
  };

  // Track type actions (numerical answers) and submit clicks
  let answerCount = 0;
  for (const action of actions) {
    if (action.type === 'type' && action.success && action.value) {
      // Check if the typed value is a number
      if (!isNaN(parseFloat(action.value))) {
        answerCount++;
      }
    }
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();
      if (target.includes('submit')) {
        details.problemsAttempted++;
      }
    }
  }

  // Use the higher of answer count or submit count
  details.problemsAttempted = Math.max(details.problemsAttempted, Math.min(10, answerCount));

  // Estimate correct answers (actual scoring in HTML)
  if (details.problemsAttempted >= 10) {
    details.correctAnswers = Math.floor(details.problemsAttempted * 0.6);
  } else {
    details.correctAnswers = Math.floor(details.problemsAttempted * 0.5);
  }

  // Calculate score: 100 points per correct answer with time bonus
  let score = details.correctAnswers * 100;

  // Time bonus multiplier
  if (completionTime < maxTime && details.problemsAttempted > 0) {
    const avgTime = completionTime / details.problemsAttempted;
    const timeMultiplier = Math.max(1, 2 - (avgTime / 60000));
    score = Math.floor(score * timeMultiplier);
  }

  return {
    valid: details.problemsAttempted >= 10,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyMath;
