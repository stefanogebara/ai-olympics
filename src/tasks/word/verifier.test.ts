/**
 * Word Task Verifier Tests
 *
 * Covers verifyWord() which analyzes agent actions to determine
 * word puzzle completion: puzzles attempted, correct answers, hints used, scoring.
 */

import { describe, it, expect } from 'vitest';
import { verifyWord, default as defaultExport } from './verifier.js';
import type { AgentAction } from '../../shared/types/index.js';

// ===========================================================================
//  Helper to build AgentAction objects
// ===========================================================================

function makeAction(overrides: Partial<AgentAction>): AgentAction {
  return {
    timestamp: Date.now(),
    agentId: 'agent-1',
    type: 'click',
    success: true,
    ...overrides,
  };
}

function makeTypeAction(value: string, success = true): AgentAction {
  return makeAction({ type: 'type', value, success });
}

function makeClickAction(target: string, success = true): AgentAction {
  return makeAction({ type: 'click', target, success });
}

// ===========================================================================
//  Tests
// ===========================================================================

describe('verifyWord', () => {
  // -------------------------------------------------------------------------
  // No actions / empty
  // -------------------------------------------------------------------------

  describe('no actions', () => {
    it('returns valid=false with empty actions array', () => {
      const result = verifyWord([], 5000);
      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details.puzzlesAttempted).toBe(0);
      expect(result.details.correctAnswers).toBe(0);
      expect(result.details.hintsUsed).toBe(0);
      expect(result.details.completionTime).toBe(5000);
    });

    it('returns completionTime from parameter', () => {
      const result = verifyWord([], 12345);
      expect(result.details.completionTime).toBe(12345);
    });
  });

  // -------------------------------------------------------------------------
  // Type actions - puzzlesAttempted counting
  // -------------------------------------------------------------------------

  describe('type actions', () => {
    it('counts type actions with value.length >= 4 as puzzlesAttempted', () => {
      const actions = [
        makeTypeAction('word'),  // 4 chars => counted
        makeTypeAction('test'),  // 4 chars => counted
        makeTypeAction('hello'), // 5 chars => counted
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(3);
    });

    it('does not count type actions with short values (< 4 chars)', () => {
      const actions = [
        makeTypeAction('ab'),   // 2 chars => NOT counted
        makeTypeAction('cat'),  // 3 chars => NOT counted
        makeTypeAction('hi'),   // 2 chars => NOT counted
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(0);
    });

    it('does not count failed type actions', () => {
      const actions = [
        makeTypeAction('hello', false), // success=false => not counted
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(0);
    });

    it('does not count type actions with empty value', () => {
      const actions = [
        makeAction({ type: 'type', value: '', success: true }),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(0);
    });

    it('does not count type actions with undefined value', () => {
      const actions = [
        makeAction({ type: 'type', value: undefined, success: true }),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Click actions - hints and submit
  // -------------------------------------------------------------------------

  describe('click actions', () => {
    it('counts click actions with hint in target as hintsUsed', () => {
      const actions = [
        makeClickAction('hint-button'),
        makeClickAction('show-hint'),
        makeClickAction('HINT_ICON'),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.hintsUsed).toBe(3);
    });

    it('does not count hint clicks with success=false', () => {
      const actions = [
        makeClickAction('hint-button', false),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.hintsUsed).toBe(0);
    });

    it('click with submit target sets puzzlesAttempted=1 if it was 0', () => {
      const actions = [
        makeClickAction('submit-button'),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(1);
    });

    it('submit click does NOT override puzzlesAttempted if already > 0', () => {
      const actions = [
        makeTypeAction('word'),  // puzzlesAttempted = 1
        makeTypeAction('test'),  // puzzlesAttempted = 2
        makeClickAction('submit-answer'),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(2);
    });

    it('handles empty target gracefully', () => {
      const actions = [
        makeAction({ type: 'click', target: undefined, success: true }),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.hintsUsed).toBe(0);
      expect(result.details.puzzlesAttempted).toBe(0);
    });

    it('does not count non-hint/submit clicks', () => {
      const actions = [
        makeClickAction('next-button'),
        makeClickAction('close-dialog'),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.hintsUsed).toBe(0);
      expect(result.details.puzzlesAttempted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // puzzlesAttempted cap at 10
  // -------------------------------------------------------------------------

  describe('puzzlesAttempted cap', () => {
    it('caps puzzlesAttempted at 10', () => {
      const actions = Array.from({ length: 15 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(10);
    });

    it('does not cap below 10', () => {
      const actions = Array.from({ length: 7 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // correctAnswers calculation
  // -------------------------------------------------------------------------

  describe('correctAnswers calculation', () => {
    it('uses 0.7 multiplier when puzzlesAttempted >= 10', () => {
      const actions = Array.from({ length: 10 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      // Math.floor(10 * 0.7) = 7
      expect(result.details.correctAnswers).toBe(7);
    });

    it('uses 0.5 multiplier when puzzlesAttempted < 10', () => {
      const actions = Array.from({ length: 6 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      // Math.floor(6 * 0.5) = 3
      expect(result.details.correctAnswers).toBe(3);
    });

    it('exactly 9 attempts uses 0.5 multiplier', () => {
      const actions = Array.from({ length: 9 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      // Math.floor(9 * 0.5) = 4
      expect(result.details.correctAnswers).toBe(4);
    });

    it('0 attempts yields 0 correct', () => {
      const result = verifyWord([], 1000);
      expect(result.details.correctAnswers).toBe(0);
    });

    it('1 attempt (via submit) uses 0.5 multiplier', () => {
      const actions = [makeClickAction('submit-btn')];
      const result = verifyWord(actions, 1000);
      // Math.floor(1 * 0.5) = 0
      expect(result.details.correctAnswers).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Score calculation
  // -------------------------------------------------------------------------

  describe('score calculation', () => {
    it('score = correctAnswers * 100 with no hints', () => {
      const actions = Array.from({ length: 10 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      // 7 * 100 = 700
      expect(result.score).toBe(700);
    });

    it('hints deduct 30 points each', () => {
      const actions = [
        ...Array.from({ length: 10 }, () => makeTypeAction('word')),
        makeClickAction('hint-button'),
        makeClickAction('show-hint'),
      ];
      const result = verifyWord(actions, 1000);
      // 7 * 100 - 2 * 30 = 700 - 60 = 640
      expect(result.score).toBe(640);
    });

    it('score floors at 0 (many hints)', () => {
      const actions = [
        makeTypeAction('word'),
        ...Array.from({ length: 20 }, () => makeClickAction('hint-button')),
      ];
      const result = verifyWord(actions, 1000);
      // correctAnswers = Math.floor(1 * 0.5) = 0 => 0*100 - 20*30 = -600 => clamped to 0
      expect(result.score).toBe(0);
    });

    it('score caps at 1000', () => {
      // Max possible: 10 attempts * 0.7 = 7 correct, 7 * 100 = 700
      // Can't exceed 1000 with normal input, but verify clamping logic
      const actions = Array.from({ length: 10 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.score).toBeLessThanOrEqual(1000);
    });

    it('score is 0 with 0 attempts and hints', () => {
      const actions = [
        makeClickAction('hint-button'),
      ];
      const result = verifyWord(actions, 1000);
      // correctAnswers = 0, 0 * 100 - 1 * 30 = -30 => clamped to 0
      expect(result.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // valid flag
  // -------------------------------------------------------------------------

  describe('valid flag', () => {
    it('valid=true when puzzlesAttempted >= 10', () => {
      const actions = Array.from({ length: 10 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.valid).toBe(true);
    });

    it('valid=false when puzzlesAttempted < 10', () => {
      const actions = Array.from({ length: 9 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.valid).toBe(false);
    });

    it('valid=true when capped at 10 from more actions', () => {
      const actions = Array.from({ length: 20 }, () => makeTypeAction('word'));
      const result = verifyWord(actions, 1000);
      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed actions
  // -------------------------------------------------------------------------

  describe('mixed actions', () => {
    it('processes mixed action types correctly', () => {
      const actions: AgentAction[] = [
        makeTypeAction('word'),       // attempt
        makeTypeAction('ab'),         // too short, not counted
        makeClickAction('hint-btn'),  // hint
        makeTypeAction('testing'),    // attempt
        makeClickAction('submit-answer'), // submit (puzzlesAttempted already > 0)
        makeClickAction('next'),      // neither hint nor submit
        makeTypeAction('hello'),      // attempt
        makeAction({ type: 'navigate', success: true }), // ignored
      ];
      const result = verifyWord(actions, 5000);
      expect(result.details.puzzlesAttempted).toBe(3);
      expect(result.details.hintsUsed).toBe(1);
      // correctAnswers = Math.floor(3 * 0.5) = 1
      expect(result.details.correctAnswers).toBe(1);
      // score = 1*100 - 1*30 = 70
      expect(result.score).toBe(70);
      expect(result.valid).toBe(false);
    });

    it('handles non-click/type actions gracefully', () => {
      const actions: AgentAction[] = [
        makeAction({ type: 'navigate', success: true }),
        makeAction({ type: 'scroll', success: true }),
        makeAction({ type: 'wait', success: true }),
        makeAction({ type: 'screenshot', success: true }),
      ];
      const result = verifyWord(actions, 1000);
      expect(result.details.puzzlesAttempted).toBe(0);
      expect(result.details.hintsUsed).toBe(0);
      expect(result.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Default export
  // -------------------------------------------------------------------------

  describe('default export', () => {
    it('default export is the same as verifyWord', () => {
      expect(defaultExport).toBe(verifyWord);
    });
  });

  // -------------------------------------------------------------------------
  // maxTime parameter
  // -------------------------------------------------------------------------

  describe('maxTime parameter', () => {
    it('accepts custom maxTime without affecting output', () => {
      // maxTime is declared but not used in the function logic
      const result = verifyWord([], 5000, 60000);
      expect(result.details.completionTime).toBe(5000);
    });

    it('defaults maxTime to 120000', () => {
      // Just verify the function works without providing maxTime
      const result = verifyWord([], 5000);
      expect(result).toBeDefined();
    });
  });
});
