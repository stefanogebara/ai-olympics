import type { AgentAction } from '../../shared/types/index.js';

interface ShoppingCartVerification {
  valid: boolean;
  score: number;
  details: {
    hasAllTargetItems: boolean;
    discountApplied: boolean;
    checkoutCompleted: boolean;
    completionTime: number;
    itemsInCart: string[];
  };
}

// Target items that must be added to cart
const TARGET_ITEMS = ['headphones', 'watch', 'charger'];

// Verify Shopping Cart task completion
export function verifyShoppingCart(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): ShoppingCartVerification {
  const details = {
    hasAllTargetItems: false,
    discountApplied: false,
    checkoutCompleted: false,
    completionTime,
    itemsInCart: [] as string[]
  };

  // Track items added to cart from click actions
  const addedItems = new Set<string>();

  for (const action of actions) {
    // Check for add to cart clicks
    if (action.type === 'click' && action.success) {
      const target = (action.target || '').toLowerCase();

      // Check if clicking add to cart buttons
      if (target.includes('add') && target.includes('cart')) {
        // Try to extract product name from target
        if (target.includes('headphones')) addedItems.add('headphones');
        if (target.includes('watch')) addedItems.add('watch');
        if (target.includes('charger')) addedItems.add('charger');
      }

      // Check for checkout completion
      if (target.includes('complete') && target.includes('purchase')) {
        details.checkoutCompleted = true;
      }
    }

    // Check for discount code application
    if (action.type === 'type' && action.success) {
      const value = (action.value || '').toUpperCase();
      if (value.includes('OLYMPICS25')) {
        details.discountApplied = true;
      }
    }

    // Check for submit action (form submission)
    if (action.type === 'submit' && action.success) {
      details.checkoutCompleted = true;
    }
  }

  details.itemsInCart = Array.from(addedItems);
  details.hasAllTargetItems = TARGET_ITEMS.every(item => addedItems.has(item));

  // Calculate score
  let score = 0;

  if (details.checkoutCompleted && details.hasAllTargetItems) {
    // Base score for completion (40%)
    score = 400;

    // Bonus for discount code (20%)
    if (details.discountApplied) {
      score += 200;
    }

    // Time bonus (40%) - faster = more points
    const timeRatio = Math.max(0, 1 - (completionTime / maxTime));
    score += Math.round(timeRatio * 400);
  } else if (details.hasAllTargetItems) {
    // Partial credit for adding all items but not completing checkout
    score = 200;
    if (details.discountApplied) {
      score += 100;
    }
  }

  return {
    valid: details.checkoutCompleted && details.hasAllTargetItems,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyShoppingCart;
