import type { AgentAction } from '../../shared/types/index.js';

interface CaptchaGauntletVerification {
  valid: boolean;
  score: number;
  details: {
    challengesAttempted: number;
    answersSubmitted: string[];
    completionTime: number;
  };
}

// Expected answers for the 5 challenges
const CORRECT_ANSWERS = [
  '162',        // Sequence: 2, 6, 18, 54, 162 (multiply by 3)
  'EGNARO',     // Word logic: ORANGE reversed
  '270',        // Math: (60*2.5) + (80*1.5) = 150 + 120 = 270
  'Alice',      // Logic grid: Alice has the cat
  'HELLO WORLD' // Caesar cipher: KHOOR ZRUOG shifted back 3
];

// Verify Captcha Gauntlet task completion
export function verifyCaptchaGauntlet(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): CaptchaGauntletVerification {
  const details = {
    challengesAttempted: 0,
    answersSubmitted: [] as string[],
    completionTime
  };

  // Track answers from type actions
  for (const action of actions) {
    if (action.type === 'type' && action.success && action.value) {
      details.answersSubmitted.push(action.value);
    }

    // Track clicks on options or submit buttons
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();
      // Track option selections for multiple choice
      if (target.includes('alice') || target.includes('bob') || target.includes('carol')) {
        details.answersSubmitted.push(action.target || '');
      }
      // Track submissions
      if (target.includes('submit')) {
        details.challengesAttempted++;
      }
    }
  }

  // Calculate score based on answers (basic verification)
  // Full scoring happens in the HTML page
  let score = 0;
  const attemptedCount = Math.max(details.challengesAttempted, details.answersSubmitted.length);

  if (attemptedCount > 0) {
    // Check how many answers might be correct
    let potentialCorrect = 0;
    for (const answer of details.answersSubmitted) {
      const normalizedAnswer = answer.toUpperCase().trim();
      for (const correctAnswer of CORRECT_ANSWERS) {
        if (normalizedAnswer === correctAnswer.toUpperCase()) {
          potentialCorrect++;
          break;
        }
      }
    }

    // 180 pts per correct answer
    score = potentialCorrect * 180;

    // Perfect bonus
    if (potentialCorrect === 5) {
      score += 100;
    }
  }

  return {
    valid: details.challengesAttempted >= 5 || details.answersSubmitted.length >= 5,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyCaptchaGauntlet;
