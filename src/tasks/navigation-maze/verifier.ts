import type { AgentAction } from '../../shared/types/index.js';

interface NavigationMazeVerification {
  valid: boolean;
  score: number;
  details: {
    reachedGoal: boolean;
    clickCount: number;
    optimalClicks: number;
    completionTime: number;
    pathTaken: string[];
  };
}

// Optimal path: Home -> Services -> Special Packages -> Enterprise -> Golden Achievement
const OPTIMAL_CLICKS = 4;
const GOAL_PAGE = 'golden-achievement';

// Verify Navigation Maze task completion
export function verifyNavigationMaze(
  actions: AgentAction[],
  completionTime: number,
  maxTime: number = 180000
): NavigationMazeVerification {
  const details = {
    reachedGoal: false,
    clickCount: 0,
    optimalClicks: OPTIMAL_CLICKS,
    completionTime,
    pathTaken: [] as string[]
  };

  // Track navigation and clicks
  for (const action of actions) {
    if (action.type === 'navigate' && action.success) {
      const url = (action.target || '').toLowerCase();
      details.pathTaken.push(url);

      // Check if reached goal page
      if (url.includes(GOAL_PAGE)) {
        details.reachedGoal = true;
      }
    }

    if (action.type === 'click' && action.success) {
      details.clickCount++;
      const target = (action.target || '').toLowerCase();

      // Track path from click targets
      if (target.includes('golden') || target.includes('achievement')) {
        details.reachedGoal = true;
      }
    }
  }

  // Calculate score
  let score = 0;

  if (details.reachedGoal) {
    // Completion: 40%
    score += 400;

    // Path efficiency: 30% - Optimal is 4 clicks
    const clickDiff = Math.abs(details.clickCount - OPTIMAL_CLICKS);
    const pathEfficiency = Math.max(0, 1 - clickDiff / OPTIMAL_CLICKS);
    score += Math.round(pathEfficiency * 300);

    // Time bonus: 30%
    const timeRatio = Math.max(0, 1 - (completionTime / maxTime));
    score += Math.round(timeRatio * 300);
  }

  return {
    valid: details.reachedGoal,
    score: Math.max(0, Math.min(1000, score)),
    details
  };
}

export default verifyNavigationMaze;
