import type { AgentAction } from '../../shared/types/index.js';

interface DataExtractionVerification {
  valid: boolean;
  score: number;
  details: {
    answersSubmitted: boolean;
    completionTime: number;
    submittedValues: Record<string, string | number>;
  };
}

// Verify Data Extraction task completion
export function verifyDataExtraction(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 150000
): DataExtractionVerification {
  const details = {
    answersSubmitted: false,
    completionTime,
    submittedValues: {} as Record<string, string | number>
  };

  // Track form submissions
  for (const action of actions) {
    // Check for type actions (filling in form fields)
    if (action.type === 'type' && action.success && action.value) {
      const target = (action.target || '').toLowerCase();
      const value = action.value;

      if (target.includes('total') && target.includes('revenue')) {
        details.submittedValues.totalRevenue = value;
      }
      if (target.includes('top') && target.includes('performer')) {
        details.submittedValues.topPerformer = value;
      }
      if (target.includes('avg') || target.includes('average') || target.includes('deal')) {
        details.submittedValues.avgDealSize = value;
      }
      if (target.includes('region') && target.includes('exceed')) {
        details.submittedValues.regionsExceeded = value;
      }
    }

    // Check for submit action
    if ((action.type === 'submit' || action.type === 'click') && action.success) {
      const target = (action.target || '').toLowerCase();
      if (target.includes('submit') || target.includes('answer')) {
        details.answersSubmitted = true;
      }
    }
  }

  // Calculate score
  // The actual accuracy scoring happens in the HTML page
  // Here we just verify the task was attempted
  let score = 0;

  if (details.answersSubmitted) {
    // Base score for attempting submission
    score = 400;

    // Check if all fields were filled
    const fieldsFilledCount = Object.keys(details.submittedValues).length;
    score += fieldsFilledCount * 100; // Up to 400 more points

    // Time bonus (200 max)
    const timeRatio = Math.max(0, 1 - (completionTime / maxTime));
    score += Math.round(timeRatio * 200);
  }

  return {
    valid: details.answersSubmitted && Object.keys(details.submittedValues).length >= 3,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyDataExtraction;
