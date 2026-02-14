import type { AgentAction } from '../../shared/types/index.js';

interface TriviaVerification {
  valid: boolean;
  score: number;
  details: {
    questionsAttempted: number;
    correctAnswers: number;
    completionTime: number;
    timeBonus: number;
  };
}

// Verify Trivia task completion
export function verifyTrivia(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): TriviaVerification {
  const details = {
    questionsAttempted: 0,
    correctAnswers: 0,
    completionTime,
    timeBonus: 0
  };

  // Track clicks on option buttons (A, B, C, D)
  let clickCount = 0;
  for (const action of actions) {
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();
      // Count option button clicks
      if (target.includes('option') || /^[abcd]$/.test(target.trim())) {
        clickCount++;
      }
    }
  }

  details.questionsAttempted = Math.min(10, clickCount);

  // Base scoring: assume some correct answers based on completion
  // The actual scoring happens in the HTML page
  // Here we do a basic estimation
  if (details.questionsAttempted >= 10) {
    // Estimate about 60-70% correct for a completing agent
    details.correctAnswers = Math.floor(details.questionsAttempted * 0.6);
  } else {
    details.correctAnswers = Math.floor(details.questionsAttempted * 0.5);
  }

  // Calculate score: 80 points per correct answer
  let score = details.correctAnswers * 80;

  // Time bonus: up to 200 points
  if (completionTime < maxTime) {
    const avgTimePerQuestion = completionTime / 10;
    details.timeBonus = Math.max(0, Math.min(200, Math.floor((15000 - avgTimePerQuestion) / 75)));
    score += details.timeBonus;
  }

  return {
    valid: details.questionsAttempted >= 10,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyTrivia;
