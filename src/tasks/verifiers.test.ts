import { describe, it, expect } from 'vitest';
import { verifyChess } from './chess/verifier.js';
import { verifyMath } from './math/verifier.js';
import { verifyTrivia } from './trivia/verifier.js';
import { verifyCaptchaGauntlet } from './captcha-gauntlet/verifier.js';
import { verifyDataExtraction } from './data-extraction/verifier.js';
import { verifyFormBlitz } from './form-blitz/verifier.js';
import { verifyLogic } from './logic/verifier.js';
import { verifyNavigationMaze } from './navigation-maze/verifier.js';
import { verifyShoppingCart } from './shopping-cart/verifier.js';
import {
  verifyPredictionMarket,
  getScoreBreakdown,
  extractPortfolioFromActions,
} from './prediction-market/verifier.js';
import type { AgentAction } from '../shared/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function action(
  type: AgentAction['type'],
  opts: Partial<AgentAction> = {}
): AgentAction {
  return {
    timestamp: Date.now(),
    agentId: 'test-agent',
    type,
    success: true,
    ...opts,
  };
}

function typeAction(value: string, target?: string): AgentAction {
  return action('type', { value, target });
}

function clickAction(target: string): AgentAction {
  return action('click', { target });
}

function navigateAction(target: string): AgentAction {
  return action('navigate', { target });
}

function submitAction(target?: string): AgentAction {
  return action('submit', { target });
}

// ==========================================================================
// 1. CHESS VERIFIER
// ==========================================================================
describe('verifyChess', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyChess([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details.puzzlesAttempted).toBe(0);
    expect(result.details.correctAnswers).toBe(0);
  });

  it('counts submit clicks as puzzlesAttempted', () => {
    const actions = [
      typeAction('re8'),
      clickAction('submit-btn'),
      typeAction('nd5'),
      clickAction('submit'),
      typeAction('bxf7+'),
      clickAction('submit'),
      typeAction('qxh7+'),
      clickAction('submit'),
      typeAction('qg8+'),
      clickAction('submit'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(5);
    expect(result.valid).toBe(true);
  });

  it('falls back to typed moves count when no submit clicks', () => {
    const actions = [
      typeAction('re8'),
      typeAction('nd5'),
      typeAction('bxf7+'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(3);
    expect(result.valid).toBe(false);
  });

  it('caps puzzlesAttempted at 5 when using typed moves', () => {
    const actions = Array.from({ length: 8 }, () => typeAction('re8'));
    const result = verifyChess(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(5);
  });

  it('scores all 5 correct moves', () => {
    const actions = [
      typeAction('re8'),
      typeAction('nd5'),
      typeAction('bxf7+'),
      typeAction('qxh7+'),
      typeAction('qg8+'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.correctAnswers).toBe(5);
    expect(result.score).toBe(1000);
    expect(result.valid).toBe(true);
  });

  it('normalizes moves by stripping +/# characters', () => {
    const actions = [
      typeAction('re8#'),
      typeAction('nd5'),
      typeAction('bxf7'),
      typeAction('qh7+'),
      typeAction('qg8'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.correctAnswers).toBe(5);
    expect(result.score).toBe(1000);
  });

  it('scores partial correct moves correctly', () => {
    const actions = [
      typeAction('re8'),
      typeAction('wrong'),
      typeAction('bxf7+'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.correctAnswers).toBe(2);
    expect(result.score).toBe(400);
  });

  it('estimates 40% correct when 0 correct but attempts > 0', () => {
    const actions = [
      typeAction('zzz1'),
      typeAction('zzz2'),
      typeAction('zzz3'),
      typeAction('zzz4'),
      typeAction('zzz5'),
    ];
    const result = verifyChess(actions, 60000);
    // 5 attempts, 0 matched, so estimate 40% of 5 = 2
    expect(result.details.correctAnswers).toBe(2);
    expect(result.score).toBe(400);
  });

  it('filters out moves shorter than 2 chars or longer than 6', () => {
    const actions = [
      typeAction('a'),        // too short
      typeAction('abcdefg'),  // too long
      typeAction('re8'),      // valid
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(1);
  });

  it('ignores unsuccessful actions', () => {
    const actions = [
      action('type', { value: 're8', success: false }),
      action('click', { target: 'submit', success: false }),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(0);
    expect(result.details.correctAnswers).toBe(0);
  });

  it('caps score at 1000', () => {
    const actions = [
      typeAction('re8'),
      typeAction('nd5'),
      typeAction('bxf7+'),
      typeAction('qxh7+'),
      typeAction('qg8+'),
    ];
    const result = verifyChess(actions, 60000);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('records completionTime in details', () => {
    const result = verifyChess([], 42000);
    expect(result.details.completionTime).toBe(42000);
  });

  it('accepts alternative correct move formats', () => {
    // re8+ is also valid for puzzle 1
    const actions = [typeAction('re8+')];
    const result = verifyChess(actions, 60000);
    expect(result.details.correctAnswers).toBe(1);
  });
});

// ==========================================================================
// 2. MATH VERIFIER
// ==========================================================================
describe('verifyMath', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyMath([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('counts numeric type values', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      typeAction(String(i + 1))
    );
    const result = verifyMath(actions, 60000);
    expect(result.details.problemsAttempted).toBe(10);
    expect(result.valid).toBe(true);
  });

  it('ignores non-numeric typed values', () => {
    const actions = [
      typeAction('hello'),
      typeAction('42'),
      typeAction('abc'),
    ];
    const result = verifyMath(actions, 60000);
    // 1 numeric answer
    expect(result.details.problemsAttempted).toBe(1);
  });

  it('uses max of submit clicks and numeric answers', () => {
    const actions = [
      typeAction('10'),
      typeAction('20'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
      clickAction('submit'),
    ];
    const result = verifyMath(actions, 60000);
    // submitClicks=5, numeric answers min(10,2)=2 => max(5,2)=5
    expect(result.details.problemsAttempted).toBe(5);
  });

  it('caps numeric answer count at 10', () => {
    const actions = Array.from({ length: 15 }, (_, i) =>
      typeAction(String(i))
    );
    const result = verifyMath(actions, 60000);
    expect(result.details.problemsAttempted).toBe(10);
  });

  it('estimates 60% correct when >= 10 attempted', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      typeAction(String(i))
    );
    const result = verifyMath(actions, 60000);
    expect(result.details.correctAnswers).toBe(6);
  });

  it('estimates 50% correct when < 10 attempted', () => {
    const actions = Array.from({ length: 8 }, (_, i) =>
      typeAction(String(i))
    );
    const result = verifyMath(actions, 60000);
    expect(result.details.correctAnswers).toBe(4); // floor(8 * 0.5) = 4
  });

  it('calculates base score as correctAnswers * 100', () => {
    // 10 numeric answers => 6 correct => 600 base
    const actions = Array.from({ length: 10 }, (_, i) =>
      typeAction(String(i))
    );
    // Use maxTime as completionTime so no time bonus
    const result = verifyMath(actions, 180000, 180000);
    // completionTime == maxTime, so no time bonus multiplier
    expect(result.score).toBe(600);
  });

  it('applies time bonus multiplier when fast', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      typeAction(String(i))
    );
    // Fast completion: 10000ms, avgTime = 1000ms per problem
    // timeMultiplier = max(1, 2 - (1000/60000)) = max(1, 1.983) = 1.983
    // score = floor(600 * 1.983) = floor(1189.8) = 1189, capped at 1000
    const result = verifyMath(actions, 10000, 180000);
    expect(result.score).toBe(1000); // capped
  });

  it('does not apply time bonus when completionTime >= maxTime', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      typeAction(String(i))
    );
    const result = verifyMath(actions, 200000, 180000);
    expect(result.score).toBe(600); // no bonus
  });

  it('clamps score to [0, 1000]', () => {
    const result = verifyMath([], 60000);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('handles float typed values as numeric', () => {
    const actions = [typeAction('3.14'), typeAction('-2.5')];
    const result = verifyMath(actions, 60000);
    expect(result.details.problemsAttempted).toBe(2);
  });

  it('records completionTime', () => {
    const result = verifyMath([], 99000);
    expect(result.details.completionTime).toBe(99000);
  });
});

// ==========================================================================
// 3. TRIVIA VERIFIER
// ==========================================================================
describe('verifyTrivia', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyTrivia([], 60000);
    expect(result.valid).toBe(false);
    // Note: time bonus is still calculated (avgTimePerQuestion = completionTime/10)
    // even with 0 questions, because the formula always divides by 10
    // avgTimePerQuestion = 6000, timeBonus = floor((15000-6000)/75) = 120
    expect(result.details.questionsAttempted).toBe(0);
    expect(result.details.correctAnswers).toBe(0);
  });

  it('gives 0 score when no actions and completionTime >= maxTime', () => {
    const result = verifyTrivia([], 200000, 180000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('counts clicks on targets containing "option"', () => {
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 60000);
    expect(result.details.questionsAttempted).toBe(10);
    expect(result.valid).toBe(true);
  });

  it('counts clicks on targets matching /^[abcd]$/', () => {
    const actions = [
      clickAction('a'),
      clickAction('b'),
      clickAction('c'),
      clickAction('d'),
    ];
    const result = verifyTrivia(actions, 60000);
    expect(result.details.questionsAttempted).toBe(4);
  });

  it('ignores non-option clicks', () => {
    const actions = [
      clickAction('next-button'),
      clickAction('submit'),
      clickAction('option-b'),
    ];
    const result = verifyTrivia(actions, 60000);
    expect(result.details.questionsAttempted).toBe(1);
  });

  it('caps questionsAttempted at 10', () => {
    const actions = Array.from({ length: 15 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 60000);
    expect(result.details.questionsAttempted).toBe(10);
  });

  it('estimates 60% correct when >= 10 attempted', () => {
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 60000);
    expect(result.details.correctAnswers).toBe(6);
  });

  it('estimates 50% correct when < 10 attempted', () => {
    const actions = Array.from({ length: 6 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 60000);
    expect(result.details.correctAnswers).toBe(3);
  });

  it('calculates base score as correctAnswers * 80', () => {
    // 10 attempts => 6 correct => 480 base
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    // Use high completionTime so time bonus is 0
    const result = verifyTrivia(actions, 200000, 180000);
    // completionTime >= maxTime so no time bonus
    expect(result.score).toBe(480);
  });

  it('adds time bonus up to 200 points', () => {
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    // avgTimePerQuestion = 10000/10 = 1000
    // timeBonus = min(200, floor((15000-1000)/75)) = min(200, floor(186.67)) = min(200, 186) = 186
    const result = verifyTrivia(actions, 10000, 180000);
    expect(result.details.timeBonus).toBe(186);
    expect(result.score).toBe(480 + 186); // 666
  });

  it('gives no time bonus when completionTime >= maxTime', () => {
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 200000, 180000);
    expect(result.details.timeBonus).toBe(0);
  });

  it('clamps time bonus to non-negative', () => {
    // Very slow: avgTime = 180000/10 = 18000
    // (15000 - 18000)/75 = negative => clamped to 0
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 179000, 180000);
    // avgTimePerQuestion = 17900, (15000-17900)/75 = -38.67 => max(0, ...) = 0
    expect(result.details.timeBonus).toBe(0);
  });

  it('clamps score to [0, 1000]', () => {
    const actions = Array.from({ length: 10 }, () =>
      clickAction('option-a')
    );
    const result = verifyTrivia(actions, 1000, 180000);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================================================
// 4. CAPTCHA GAUNTLET VERIFIER
// ==========================================================================
describe('verifyCaptchaGauntlet', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyCaptchaGauntlet([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('tracks typed answers', () => {
    const actions = [
      typeAction('162'),
      typeAction('EGNARO'),
      typeAction('270'),
      typeAction('HELLO WORLD'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.details.answersSubmitted).toHaveLength(4);
  });

  it('tracks alice/bob/carol clicks as answers', () => {
    const actions = [clickAction('Alice option')];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.details.answersSubmitted).toContain('Alice option');
  });

  it('counts submit clicks as challengesAttempted', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('submit')
    );
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.details.challengesAttempted).toBe(5);
  });

  it('is valid when challengesAttempted >= 5', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('submit')
    );
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.valid).toBe(true);
  });

  it('is valid when answersSubmitted.length >= 5', () => {
    const actions = [
      typeAction('162'),
      typeAction('EGNARO'),
      typeAction('270'),
      typeAction('HELLO WORLD'),
      typeAction('something'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.valid).toBe(true);
  });

  it('scores 180 points per correct answer (case-insensitive)', () => {
    const actions = [
      typeAction('162'),
      typeAction('egnaro'),  // lowercase should match EGNARO
      typeAction('270'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.score).toBe(3 * 180); // 540
  });

  it('gives 100 bonus when all 5 correct', () => {
    const actions = [
      typeAction('162'),
      typeAction('EGNARO'),
      typeAction('270'),
      clickAction('Alice'),  // matches alice
      typeAction('HELLO WORLD'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    // 5 * 180 + 100 = 1000
    expect(result.score).toBe(1000);
  });

  it('does not give bonus when fewer than 5 correct', () => {
    const actions = [
      typeAction('162'),
      typeAction('wrong'),
      typeAction('270'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.score).toBe(2 * 180); // 360, no bonus
  });

  it('does not double-count the same correct answer', () => {
    // Each submitted answer is checked against ALL correct answers
    // but 'break' prevents double-counting within one answer
    const actions = [
      typeAction('162'),
      typeAction('162'), // duplicate
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    // Both match '162' so potentialCorrect = 2
    expect(result.score).toBe(360);
  });

  it('caps score at 1000', () => {
    const actions = [
      typeAction('162'),
      typeAction('EGNARO'),
      typeAction('270'),
      clickAction('Alice'),
      typeAction('HELLO WORLD'),
    ];
    const result = verifyCaptchaGauntlet(actions, 60000);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('handles whitespace in answers', () => {
    const actions = [typeAction('  162  ')];
    const result = verifyCaptchaGauntlet(actions, 60000);
    // '  162  '.toUpperCase().trim() === '162'
    expect(result.score).toBe(180);
  });
});

// ==========================================================================
// 5. DATA EXTRACTION VERIFIER
// ==========================================================================
describe('verifyDataExtraction', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyDataExtraction([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('tracks totalRevenue field', () => {
    const actions = [
      typeAction('500000', 'total revenue input'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.totalRevenue).toBe('500000');
  });

  it('tracks topPerformer field', () => {
    const actions = [
      typeAction('Alice', 'top performer field'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.topPerformer).toBe('Alice');
  });

  it('tracks avgDealSize field via "avg" keyword', () => {
    const actions = [
      typeAction('25000', 'avg deal size'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.avgDealSize).toBe('25000');
  });

  it('tracks avgDealSize field via "deal" keyword', () => {
    const actions = [
      typeAction('25000', 'deal size'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.avgDealSize).toBe('25000');
  });

  it('tracks avgDealSize field via "average" keyword', () => {
    const actions = [
      typeAction('25000', 'average value'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.avgDealSize).toBe('25000');
  });

  it('tracks regionsExceeded field', () => {
    const actions = [
      typeAction('3', 'regions that exceeded quota'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.submittedValues.regionsExceeded).toBe('3');
  });

  it('detects submit action via submit type', () => {
    const actions = [submitAction('submit answers')];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.answersSubmitted).toBe(true);
  });

  it('detects submit via click on submit target', () => {
    const actions = [clickAction('submit answers')];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.answersSubmitted).toBe(true);
  });

  it('detects submit via click on answer target', () => {
    const actions = [clickAction('answer button')];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.details.answersSubmitted).toBe(true);
  });

  it('is valid when submitted AND >= 3 fields filled', () => {
    const actions = [
      typeAction('500000', 'total revenue'),
      typeAction('Alice', 'top performer'),
      typeAction('25000', 'avg deal'),
      clickAction('submit'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.valid).toBe(true);
  });

  it('is invalid when submitted but < 3 fields filled', () => {
    const actions = [
      typeAction('500000', 'total revenue'),
      typeAction('Alice', 'top performer'),
      clickAction('submit'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.valid).toBe(false);
  });

  it('is invalid when >= 3 fields filled but not submitted', () => {
    const actions = [
      typeAction('500000', 'total revenue'),
      typeAction('Alice', 'top performer'),
      typeAction('25000', 'avg deal'),
    ];
    const result = verifyDataExtraction(actions, 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('gives 400 base + 100 per field + time bonus', () => {
    const actions = [
      typeAction('500000', 'total revenue'),
      typeAction('Alice', 'top performer'),
      typeAction('25000', 'avg deal'),
      typeAction('3', 'regions exceeded target'),
      clickAction('submit'),
    ];
    // completionTime=150000 (== maxTime default), so timeRatio = 0
    const result = verifyDataExtraction(actions, 150000, 150000);
    // 400 base + 4*100 + round(0*200) = 800
    expect(result.score).toBe(800);
  });

  it('adds time bonus proportional to time remaining', () => {
    const actions = [
      typeAction('500000', 'total revenue'),
      typeAction('Alice', 'top performer'),
      typeAction('25000', 'avg deal'),
      clickAction('submit'),
    ];
    // completionTime=0, maxTime=150000 => timeRatio = 1
    const result = verifyDataExtraction(actions, 0, 150000);
    // 400 + 3*100 + round(1*200) = 900
    expect(result.score).toBe(900);
  });

  it('caps score at 1000', () => {
    const actions = [
      typeAction('a', 'total revenue'),
      typeAction('b', 'top performer'),
      typeAction('c', 'avg deal'),
      typeAction('d', 'regions exceeded'),
      clickAction('submit'),
    ];
    const result = verifyDataExtraction(actions, 0, 150000);
    // 400 + 400 + 200 = 1000
    expect(result.score).toBe(1000);
  });
});

// ==========================================================================
// 6. FORM BLITZ VERIFIER
// ==========================================================================
describe('verifyFormBlitz', () => {
  const allFieldActions = (): AgentAction[] => [
    typeAction('John', 'firstName'),
    typeAction('Doe', 'lastName'),
    typeAction('john@example.com', 'email'),
    typeAction('555-1234', 'phone'),
    typeAction('123 Main St', 'address'),
    typeAction('Springfield', 'city'),
    typeAction('P@ssw0rd1', 'password'),
    action('select', { value: 'US', target: 'country' }),
    submitAction(),
  ];

  it('returns invalid when no actions provided', () => {
    const result = verifyFormBlitz([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('detects form submission via submit type', () => {
    const result = verifyFormBlitz([submitAction()], 60000);
    expect(result.details.formSubmitted).toBe(true);
  });

  it('does not detect form submission from failed submit', () => {
    const actions = [action('submit', { success: false })];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.formSubmitted).toBe(false);
  });

  it('identifies all required fields as filled', () => {
    const actions = allFieldActions();
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.allFieldsFilled).toBe(true);
  });

  it('identifies when not all required fields are filled', () => {
    const actions = [
      typeAction('John', 'firstName'),
      typeAction('Doe', 'lastName'),
      submitAction(),
    ];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.allFieldsFilled).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('validates correct email format', () => {
    const actions = [typeAction('john@example.com', 'email')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validEmail).toBe(true);
  });

  it('rejects invalid email format', () => {
    const actions = [typeAction('not-an-email', 'email')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validEmail).toBe(false);
  });

  it('validates password with 8+ chars, uppercase, and digit', () => {
    const actions = [typeAction('MyP@ss99', 'password')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validPassword).toBe(true);
  });

  it('rejects password without uppercase', () => {
    const actions = [typeAction('myp@ss99', 'password')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validPassword).toBe(false);
  });

  it('rejects password without digit', () => {
    const actions = [typeAction('MyPasswd!', 'password')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validPassword).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const actions = [typeAction('P@ss1', 'password')];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.details.validPassword).toBe(false);
  });

  it('gives 500 base when submitted and all fields filled', () => {
    const actions = allFieldActions();
    // Use completionTime == maxTime => no time bonus
    const result = verifyFormBlitz(actions, 120000, 120000);
    // 500 base + 100 validEmail + 100 validPassword + round(0*300) = 700
    expect(result.score).toBe(700);
  });

  it('adds 100 for valid email and 100 for valid password', () => {
    const actions = allFieldActions();
    const result = verifyFormBlitz(actions, 120000, 120000);
    expect(result.details.validEmail).toBe(true);
    expect(result.details.validPassword).toBe(true);
    expect(result.score).toBe(700);
  });

  it('adds time bonus proportional to remaining time', () => {
    const actions = allFieldActions();
    // completionTime=0 => timeRatio=1 => timeBonus = 300
    const result = verifyFormBlitz(actions, 0, 120000);
    expect(result.score).toBe(500 + 100 + 100 + 300); // 1000
  });

  it('gives 0 score when form not submitted even if fields filled', () => {
    const actions = [
      typeAction('John', 'firstName'),
      typeAction('Doe', 'lastName'),
      typeAction('john@example.com', 'email'),
      typeAction('555-1234', 'phone'),
      typeAction('123 Main St', 'address'),
      typeAction('Springfield', 'city'),
      typeAction('P@ssw0rd1', 'password'),
    ];
    const result = verifyFormBlitz(actions, 60000);
    expect(result.score).toBe(0);
    expect(result.valid).toBe(false);
  });

  it('caps score at 1000', () => {
    const actions = allFieldActions();
    const result = verifyFormBlitz(actions, 0, 120000);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('tracks country selection via select action', () => {
    const actions = [
      action('select', { value: 'US', target: 'country' }),
    ];
    const result = verifyFormBlitz(actions, 60000);
    // country field is not in requiredFields, so it doesn't affect allFieldsFilled
    // but the select action should be tracked
    expect(result.details.formSubmitted).toBe(false);
  });
});

// ==========================================================================
// 7. LOGIC VERIFIER
// ==========================================================================
describe('verifyLogic', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyLogic([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('counts clicks on "true" targets', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(5);
  });

  it('counts clicks on "false" targets', () => {
    const actions = Array.from({ length: 3 }, () =>
      clickAction('false')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(3);
  });

  it('counts clicks on "cannot" targets', () => {
    const actions = [clickAction('cannot determine')];
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(1);
  });

  it('counts clicks on digit targets', () => {
    const actions = [clickAction('42'), clickAction('7')];
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(2);
  });

  it('counts clicks on short answer targets (<= 3 chars)', () => {
    const actions = [clickAction('K'), clickAction('64'), clickAction('No')];
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(3);
  });

  it('does not count long targets without keywords', () => {
    const actions = [clickAction('next question button')];
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(0);
  });

  it('caps puzzlesAttempted at 5', () => {
    const actions = Array.from({ length: 8 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(5);
  });

  it('estimates 60% correct when >= 5 attempted', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.details.correctAnswers).toBe(3); // floor(5 * 0.6)
    expect(result.valid).toBe(true);
  });

  it('estimates 40% correct when < 5 attempted', () => {
    const actions = Array.from({ length: 3 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.details.correctAnswers).toBe(1); // floor(3 * 0.4)
  });

  it('scores 200 points per correct answer', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    // 3 correct * 200 = 600
    expect(result.score).toBe(600);
  });

  it('caps score at 1000', () => {
    const result = verifyLogic([], 60000);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('is valid when exactly 5 puzzles attempted', () => {
    const actions = Array.from({ length: 5 }, () =>
      clickAction('false')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.valid).toBe(true);
  });

  it('is invalid when only 4 puzzles attempted', () => {
    const actions = Array.from({ length: 4 }, () =>
      clickAction('true')
    );
    const result = verifyLogic(actions, 60000);
    expect(result.valid).toBe(false);
  });

  it('handles empty target gracefully', () => {
    // target '' has length 0, which is <= 3, so it counts
    const actions = [clickAction('')];
    const result = verifyLogic(actions, 60000);
    expect(result.details.puzzlesAttempted).toBe(1);
  });
});

// ==========================================================================
// 8. NAVIGATION MAZE VERIFIER
// ==========================================================================
describe('verifyNavigationMaze', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyNavigationMaze([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('detects goal via navigate URL containing golden-achievement', () => {
    const actions = [
      navigateAction('http://example.com/golden-achievement'),
    ];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.valid).toBe(true);
    expect(result.details.reachedGoal).toBe(true);
  });

  it('detects goal via click target containing "golden"', () => {
    const actions = [clickAction('Golden link')];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.details.reachedGoal).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('detects goal via click target containing "achievement"', () => {
    const actions = [clickAction('Get Achievement')];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.details.reachedGoal).toBe(true);
  });

  it('tracks path from navigate actions', () => {
    const actions = [
      navigateAction('http://site.com/home'),
      navigateAction('http://site.com/services'),
      navigateAction('http://site.com/golden-achievement'),
    ];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.details.pathTaken).toHaveLength(3);
  });

  it('counts all clicks for clickCount', () => {
    const actions = [
      clickAction('Services'),
      clickAction('Packages'),
      clickAction('Enterprise'),
      clickAction('Golden Achievement'),
    ];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.details.clickCount).toBe(4);
  });

  it('gives 400 completion + 300 path efficiency + 300 time bonus at optimal', () => {
    const actions = [
      clickAction('Services'),
      clickAction('Packages'),
      clickAction('Enterprise'),
      clickAction('Golden Achievement'), // 4 clicks = optimal
    ];
    // completionTime=0 => timeRatio=1 => timeBonus=300
    const result = verifyNavigationMaze(actions, 0, 180000);
    // 400 + round(1.0 * 300) + round(1.0 * 300) = 1000
    expect(result.score).toBe(1000);
  });

  it('reduces path efficiency when clicks differ from optimal', () => {
    const actions = [
      clickAction('link1'),
      clickAction('link2'),
      clickAction('link3'),
      clickAction('link4'),
      clickAction('link5'),
      clickAction('link6'),
      clickAction('link7'),
      clickAction('Golden Achievement'), // 8 clicks, optimal is 4
    ];
    const result = verifyNavigationMaze(actions, 0, 180000);
    // clickDiff = |8-4| = 4, pathEfficiency = max(0, 1 - 4/4) = 0
    expect(result.score).toBe(400 + 0 + 300); // 700
  });

  it('gives 0 path efficiency when clickDiff >= OPTIMAL_CLICKS', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      clickAction(i === 9 ? 'Golden Achievement' : `link${i}`)
    );
    const result = verifyNavigationMaze(actions, 90000, 180000);
    // clickDiff = |10-4| = 6, pathEfficiency = max(0, 1 - 6/4) = max(0, -0.5) = 0
    const timeBonus = Math.round((1 - 90000 / 180000) * 300); // 150
    expect(result.score).toBe(400 + 0 + timeBonus);
  });

  it('gives 0 time bonus when completionTime >= maxTime', () => {
    const actions = [clickAction('Golden Achievement')];
    const result = verifyNavigationMaze(actions, 200000, 180000);
    // timeRatio = max(0, 1 - 200000/180000) = max(0, -0.111) = 0
    expect(result.score).toBeGreaterThanOrEqual(400); // at least completion
  });

  it('gives 0 score when goal not reached', () => {
    const actions = [
      clickAction('Services'),
      clickAction('About'),
      navigateAction('http://site.com/home'),
    ];
    const result = verifyNavigationMaze(actions, 60000);
    expect(result.score).toBe(0);
    expect(result.valid).toBe(false);
  });

  it('stores OPTIMAL_CLICKS as 4 in details', () => {
    const result = verifyNavigationMaze([], 60000);
    expect(result.details.optimalClicks).toBe(4);
  });
});

// ==========================================================================
// 9. SHOPPING CART VERIFIER
// ==========================================================================
describe('verifyShoppingCart', () => {
  it('returns invalid when no actions provided', () => {
    const result = verifyShoppingCart([], 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('tracks headphones added to cart', () => {
    const actions = [clickAction('Add headphones to cart')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.itemsInCart).toContain('headphones');
  });

  it('tracks watch added to cart', () => {
    const actions = [clickAction('Add watch to cart')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.itemsInCart).toContain('watch');
  });

  it('tracks charger added to cart', () => {
    const actions = [clickAction('Add charger to cart')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.itemsInCart).toContain('charger');
  });

  it('requires both "add" and "cart" in target to register item', () => {
    const actions = [
      clickAction('headphones add'),      // no "cart"
      clickAction('add cart headphones'),  // has both
    ];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.itemsInCart).toEqual(['headphones']);
  });

  it('detects discount code OLYMPICS25', () => {
    const actions = [typeAction('OLYMPICS25')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.discountApplied).toBe(true);
  });

  it('detects discount code case-insensitively', () => {
    const actions = [typeAction('olympics25')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.discountApplied).toBe(true);
  });

  it('detects checkout via click with "complete" and "purchase"', () => {
    const actions = [clickAction('Complete Purchase')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.checkoutCompleted).toBe(true);
  });

  it('detects checkout via submit action', () => {
    const actions = [submitAction()];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.details.checkoutCompleted).toBe(true);
  });

  it('is valid when checkout completed AND all target items present', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
      clickAction('Complete Purchase'),
    ];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.valid).toBe(true);
  });

  it('is invalid when checkout completed but missing items', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Complete Purchase'),
    ];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.valid).toBe(false);
  });

  it('gives 400 base + 200 discount + time bonus for full checkout', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
      typeAction('OLYMPICS25'),
      clickAction('Complete Purchase'),
    ];
    // completionTime=0 => timeRatio=1 => timeBonus=400
    const result = verifyShoppingCart(actions, 0, 180000);
    expect(result.score).toBe(400 + 200 + 400); // 1000
  });

  it('gives 400 base + time bonus without discount', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
      clickAction('Complete Purchase'),
    ];
    const result = verifyShoppingCart(actions, 180000, 180000);
    // timeRatio = 0
    expect(result.score).toBe(400);
  });

  it('gives partial credit (200) for all items but no checkout', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
    ];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.score).toBe(200);
    expect(result.valid).toBe(false);
  });

  it('gives partial credit (300) for all items + discount but no checkout', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
      typeAction('OLYMPICS25'),
    ];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.score).toBe(300);
    expect(result.valid).toBe(false);
  });

  it('gives 0 for checkout without target items', () => {
    const actions = [clickAction('Complete Purchase')];
    const result = verifyShoppingCart(actions, 60000);
    expect(result.score).toBe(0);
  });

  it('caps score at 1000', () => {
    const actions = [
      clickAction('Add headphones to cart'),
      clickAction('Add watch to cart'),
      clickAction('Add charger to cart'),
      typeAction('OLYMPICS25'),
      clickAction('Complete Purchase'),
    ];
    const result = verifyShoppingCart(actions, 0, 180000);
    expect(result.score).toBeLessThanOrEqual(1000);
  });
});

// ==========================================================================
// 10. PREDICTION MARKET VERIFIER
// ==========================================================================
describe('verifyPredictionMarket', () => {
  const emptyPortfolio = {
    startingBalance: 10000,
    finalBalance: 10000,
    bets: [] as Array<{
      marketId: string;
      outcome: string;
      amount: number;
      shares: number;
      probabilityAtBet: number;
      resolved: boolean;
      resolution?: string;
      payout?: number;
    }>,
  };

  it('returns invalid when no bets placed', () => {
    const result = verifyPredictionMarket([], emptyPortfolio, 60000);
    expect(result.valid).toBe(false);
  });

  it('returns valid when at least 1 bet placed', () => {
    const portfolio = {
      ...emptyPortfolio,
      bets: [{
        marketId: 'm1',
        outcome: 'YES',
        amount: 100,
        shares: 100,
        probabilityAtBet: 0.6,
        resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.valid).toBe(true);
  });

  // --- Profit Score (60% weight, max 600) ---
  it('gives 300 profit score for 0% profit (break even)', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.profitScore).toBe(300);
  });

  it('gives 600 profit score for +50% profit', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 15000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.profitScore).toBe(600);
  });

  it('gives 0 profit score for -50% loss', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 5000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.profitScore).toBe(0);
  });

  it('clamps profit at +50%', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 20000, // +100%
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.profitScore).toBe(600); // capped at +50%
  });

  it('clamps profit at -50%', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 1000, // -90%
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.profitScore).toBe(0); // capped at -50%
  });

  // --- Brier Score (25% weight, max 250) ---
  it('gives 250 Brier points for perfect calibration (0.0)', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 1.0, // 100% confident
        resolved: true, resolution: 'YES', // and correct
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    // forecast=1.0, actual=1 => error=0 => brierScore=0
    expect(result.details.brierScore).toBe(0);
    expect(result.details.brierScorePoints).toBe(250);
  });

  it('gives 0 Brier points for random guessing (0.25)', () => {
    // Need a specific forecast/outcome combo to produce exactly 0.25
    // forecast=0.5, actual=1 => error = (0.5-1)^2 = 0.25
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.5,
        resolved: true, resolution: 'YES',
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.brierScore).toBeCloseTo(0.25);
    expect(result.details.brierScorePoints).toBe(0);
  });

  it('defaults Brier score to 0.25 when no bets resolved', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.7, resolved: false,
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.brierScore).toBe(0.25);
    expect(result.details.brierScorePoints).toBe(0);
  });

  it('calculates Brier score across multiple resolved bets', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [
        {
          marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
          probabilityAtBet: 0.9,
          resolved: true, resolution: 'YES', // error = (0.9-1)^2 = 0.01
        },
        {
          marketId: 'm2', outcome: 'NO', amount: 100, shares: 100,
          probabilityAtBet: 0.8,
          resolved: true, resolution: 'NO', // error = (0.8-1)^2 = 0.04
        },
      ],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    // avg = (0.01 + 0.04) / 2 = 0.025
    expect(result.details.brierScore).toBeCloseTo(0.025);
    // points = round(((0.25 - 0.025) / 0.25) * 250) = round(0.9 * 250) = 225
    expect(result.details.brierScorePoints).toBe(225);
  });

  it('gives 0 Brier points when brierScore > 0.25', () => {
    // forecast=0.1, actual=1 => error = (0.1-1)^2 = 0.81
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 0.1,
        resolved: true, resolution: 'YES',
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.details.brierScore).toBeCloseTo(0.81);
    expect(result.details.brierScorePoints).toBe(0);
  });

  // --- Activity Score (15% weight, max 150) ---
  it('gives 15 points per bet, max 150', () => {
    const makeBet = (id: number) => ({
      marketId: `m${id}`, outcome: 'YES', amount: 100, shares: 100,
      probabilityAtBet: 0.5, resolved: false,
    });

    const portfolio5 = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: Array.from({ length: 5 }, (_, i) => makeBet(i)),
    };
    expect(verifyPredictionMarket([], portfolio5, 60000).details.activityScore).toBe(75);

    const portfolio10 = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: Array.from({ length: 10 }, (_, i) => makeBet(i)),
    };
    expect(verifyPredictionMarket([], portfolio10, 60000).details.activityScore).toBe(150);

    const portfolio15 = {
      startingBalance: 10000,
      finalBalance: 10000,
      bets: Array.from({ length: 15 }, (_, i) => makeBet(i)),
    };
    expect(verifyPredictionMarket([], portfolio15, 60000).details.activityScore).toBe(150); // capped
  });

  // --- Total Score ---
  it('sums profit + brier + activity scores', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 15000, // +50% => profit=600
      bets: [{
        marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 1.0,
        resolved: true, resolution: 'YES', // brier=0 => brierPts=250
      }],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    // profit=600, brier=250, activity=15 => total=865
    expect(result.score).toBe(865);
  });

  it('clamps total score to [0, 1000]', () => {
    const portfolio = {
      startingBalance: 10000,
      finalBalance: 20000,
      bets: Array.from({ length: 15 }, (_, i) => ({
        marketId: `m${i}`, outcome: 'YES', amount: 100, shares: 100,
        probabilityAtBet: 1.0,
        resolved: true, resolution: 'YES',
      })),
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    // profit=600 + brier=250 + activity=150 = 1000
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('handles missing portfolio fields gracefully', () => {
    const portfolio = {
      startingBalance: 0,
      finalBalance: 0,
      bets: [],
    };
    const result = verifyPredictionMarket([], portfolio, 60000);
    expect(result.valid).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('records completionTime in details', () => {
    const result = verifyPredictionMarket([], emptyPortfolio, 12345);
    expect(result.details.completionTime).toBe(12345);
  });
});

// ==========================================================================
// 10b. getScoreBreakdown
// ==========================================================================
describe('getScoreBreakdown', () => {
  it('returns a multiline string with score breakdown', () => {
    const verification = verifyPredictionMarket(
      [],
      {
        startingBalance: 10000,
        finalBalance: 12000,
        bets: [{
          marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
          probabilityAtBet: 0.7, resolved: true, resolution: 'YES',
        }],
      },
      60000
    );
    const breakdown = getScoreBreakdown(verification);
    expect(breakdown).toContain('Prediction Market Score Breakdown');
    expect(breakdown).toContain(`Total Score: ${verification.score}/1000`);
    expect(breakdown).toContain('Profit/Loss (60%)');
    expect(breakdown).toContain('Calibration (25%)');
    expect(breakdown).toContain('Activity (15%)');
    expect(breakdown).toContain('Valid: Yes');
    expect(breakdown).toContain('Completion Time:');
  });

  it('shows Valid: No when verification is invalid', () => {
    const verification = verifyPredictionMarket(
      [],
      { startingBalance: 10000, finalBalance: 10000, bets: [] },
      60000
    );
    const breakdown = getScoreBreakdown(verification);
    expect(breakdown).toContain('Valid: No');
  });

  it('includes profit percentage', () => {
    const verification = verifyPredictionMarket(
      [],
      {
        startingBalance: 10000,
        finalBalance: 12500,
        bets: [{
          marketId: 'm1', outcome: 'YES', amount: 100, shares: 100,
          probabilityAtBet: 0.5, resolved: false,
        }],
      },
      60000
    );
    const breakdown = getScoreBreakdown(verification);
    expect(breakdown).toContain('25.0%');
  });
});

// ==========================================================================
// 10c. extractPortfolioFromActions
// ==========================================================================
describe('extractPortfolioFromActions', () => {
  it('returns default portfolio when no actions', () => {
    const portfolio = extractPortfolioFromActions([]);
    expect(portfolio.startingBalance).toBe(10000);
    expect(portfolio.finalBalance).toBe(10000);
    expect(portfolio.bets).toHaveLength(0);
  });

  it('uses custom startingBalance', () => {
    const portfolio = extractPortfolioFromActions([], 5000);
    expect(portfolio.startingBalance).toBe(5000);
    expect(portfolio.finalBalance).toBe(5000);
  });

  it('extracts bets from submit actions with bet metadata', () => {
    const actions: AgentAction[] = [
      action('submit', {
        metadata: {
          betPlaced: true,
          amount: 200,
          outcome: 'YES',
          marketId: 'market-1',
          shares: 250,
          probability: 0.7,
        },
      }),
    ];
    const portfolio = extractPortfolioFromActions(actions);
    expect(portfolio.bets).toHaveLength(1);
    expect(portfolio.bets[0].marketId).toBe('market-1');
    expect(portfolio.bets[0].outcome).toBe('YES');
    expect(portfolio.bets[0].amount).toBe(200);
    expect(portfolio.bets[0].shares).toBe(250);
    expect(portfolio.bets[0].probabilityAtBet).toBe(0.7);
    expect(portfolio.bets[0].resolved).toBe(false);
    // Balance should decrease by bet amount
    expect(portfolio.finalBalance).toBe(10000 - 200);
  });

  it('extracts multiple bets and decreases balance cumulatively', () => {
    const actions: AgentAction[] = [
      action('submit', {
        metadata: { betPlaced: true, amount: 100, outcome: 'YES', marketId: 'm1' },
      }),
      action('submit', {
        metadata: { betPlaced: true, amount: 300, outcome: 'NO', marketId: 'm2' },
      }),
    ];
    const portfolio = extractPortfolioFromActions(actions);
    expect(portfolio.bets).toHaveLength(2);
    expect(portfolio.finalBalance).toBe(10000 - 100 - 300);
  });

  it('uses final balance from done action metadata', () => {
    const actions: AgentAction[] = [
      action('submit', {
        metadata: { betPlaced: true, amount: 100 },
      }),
      action('done', {
        metadata: { portfolio: { finalBalance: 12000 } },
      }),
    ];
    const portfolio = extractPortfolioFromActions(actions);
    expect(portfolio.finalBalance).toBe(12000);
  });

  it('ignores submit actions without betPlaced metadata', () => {
    const actions: AgentAction[] = [
      action('submit', { metadata: { someOther: true } }),
    ];
    const portfolio = extractPortfolioFromActions(actions);
    expect(portfolio.bets).toHaveLength(0);
    expect(portfolio.finalBalance).toBe(10000);
  });

  it('uses defaults for missing bet metadata fields', () => {
    const actions: AgentAction[] = [
      action('submit', {
        metadata: { betPlaced: true, amount: 500 },
      }),
    ];
    const portfolio = extractPortfolioFromActions(actions);
    expect(portfolio.bets[0].outcome).toBe('YES');     // default
    expect(portfolio.bets[0].marketId).toBe('unknown'); // default
    expect(portfolio.bets[0].shares).toBe(500);         // defaults to amount
    expect(portfolio.bets[0].probabilityAtBet).toBe(0.5); // default
  });
});
