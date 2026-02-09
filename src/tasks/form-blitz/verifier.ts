import type { AgentAction } from '../../shared/types/index.js';

interface FormBlitzVerification {
  valid: boolean;
  score: number;
  details: {
    formSubmitted: boolean;
    allFieldsFilled: boolean;
    validEmail: boolean;
    validPassword: boolean;
    completionTime: number;
  };
}

// Verify Form Blitz task completion
export function verifyFormBlitz(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 120000
): FormBlitzVerification {
  const details = {
    formSubmitted: false,
    allFieldsFilled: false,
    validEmail: false,
    validPassword: false,
    completionTime
  };

  // Check for submit action
  const submitAction = actions.find(a => a.type === 'submit' && a.success);
  details.formSubmitted = !!submitAction;

  // Check for field fills
  const typeActions = actions.filter(a => a.type === 'type' && a.success);
  const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'password'];

  // Check if we have type actions for required fields
  const filledFields = new Set<string>();
  for (const action of typeActions) {
    const target = (action.target || '').toLowerCase();
    for (const field of requiredFields) {
      if (target.includes(field.toLowerCase()) || target.includes(field)) {
        filledFields.add(field);
      }
    }
  }

  // Check for select action (country)
  const selectAction = actions.find(a => a.type === 'select' && a.success);
  if (selectAction) {
    filledFields.add('country');
  }

  details.allFieldsFilled = filledFields.size >= requiredFields.length;

  // Check email format (from action value if available)
  const emailAction = typeActions.find(a =>
    (a.target || '').toLowerCase().includes('email')
  );
  if (emailAction && emailAction.value) {
    details.validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAction.value);
  }

  // Check password requirements
  const passwordAction = typeActions.find(a =>
    (a.target || '').toLowerCase().includes('password')
  );
  if (passwordAction && passwordAction.value) {
    const pw = passwordAction.value;
    details.validPassword = pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
  }

  // Calculate score
  let score = 0;
  if (details.formSubmitted && details.allFieldsFilled) {
    // Base score for completion
    score = 500;

    // Bonus for valid email
    if (details.validEmail) score += 100;

    // Bonus for valid password
    if (details.validPassword) score += 100;

    // Time bonus (faster = more points)
    const timeRatio = 1 - (completionTime / maxTime);
    score += Math.round(timeRatio * 300);
  }

  return {
    valid: details.formSubmitted && details.allFieldsFilled,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyFormBlitz;
