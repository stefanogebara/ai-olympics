/**
 * Prediction Market Task Verifier
 * Scoring: 60% profit/loss + 25% Brier score + 15% activity
 */

import type { AgentAction } from '../../shared/types/index.js';

interface PredictionMarketVerification {
  valid: boolean;
  score: number;
  details: {
    profitScore: number;
    brierScore: number;
    brierScorePoints: number;
    activityScore: number;
    startingBalance: number;
    finalBalance: number;
    totalProfit: number;
    profitPercent: number;
    totalBets: number;
    completionTime: number;
  };
}

interface PortfolioData {
  startingBalance: number;
  finalBalance: number;
  bets: BetData[];
}

interface BetData {
  marketId: string;
  outcome: string;
  amount: number;
  shares: number;
  probabilityAtBet: number;
  resolved: boolean;
  resolution?: string;
  payout?: number;
}

/**
 * Verify prediction market task completion and calculate score
 */
export function verifyPredictionMarket(
  actions: AgentAction[],
  portfolio: PortfolioData,
  completionTime: number,
  maxTime: number = 300000 // 5 minutes
): PredictionMarketVerification {
  const details = {
    profitScore: 0,
    brierScore: 0.25, // Default (maximum uncertainty)
    brierScorePoints: 0,
    activityScore: 0,
    startingBalance: portfolio.startingBalance || 10000,
    finalBalance: portfolio.finalBalance || 10000,
    totalProfit: 0,
    profitPercent: 0,
    totalBets: portfolio.bets?.length || 0,
    completionTime,
  };

  // Calculate profit
  details.totalProfit = details.finalBalance - details.startingBalance;
  details.profitPercent = (details.totalProfit / details.startingBalance) * 100;

  // ============================================================================
  // PROFIT SCORE (60% weight, max 600 points)
  // Normalized: +50% gain = 600pts, 0% = 300pts, -50% = 0pts
  // ============================================================================
  const normalizedProfit = Math.max(-50, Math.min(50, details.profitPercent));
  details.profitScore = Math.round(((normalizedProfit + 50) / 100) * 600);

  // ============================================================================
  // BRIER SCORE (25% weight, max 250 points)
  // Measures calibration: lower is better
  // 0.00 = 250 points (perfect calibration)
  // 0.25 = 0 points (random guessing)
  // ============================================================================
  if (portfolio.bets && portfolio.bets.length > 0) {
    const resolvedBets = portfolio.bets.filter(b => b.resolved && b.resolution);

    if (resolvedBets.length > 0) {
      let sumSquaredError = 0;

      for (const bet of resolvedBets) {
        // outcome = 1 if bet was correct, 0 if not
        const actualOutcome = bet.outcome === bet.resolution ? 1 : 0;
        // forecast = probability at time of bet
        const forecast = bet.probabilityAtBet;
        // squared error
        sumSquaredError += Math.pow(forecast - actualOutcome, 2);
      }

      details.brierScore = sumSquaredError / resolvedBets.length;
    }
  }

  // Convert Brier score to points (0.00 = 250pts, 0.25 = 0pts)
  details.brierScorePoints = Math.round(((0.25 - details.brierScore) / 0.25) * 250);
  details.brierScorePoints = Math.max(0, details.brierScorePoints);

  // ============================================================================
  // ACTIVITY SCORE (15% weight, max 150 points)
  // 15 points per bet, max 150 (10 bets)
  // ============================================================================
  details.activityScore = Math.min(150, details.totalBets * 15);

  // ============================================================================
  // TOTAL SCORE
  // ============================================================================
  const totalScore = details.profitScore + details.brierScorePoints + details.activityScore;

  // Validation: task is valid if agent placed at least 1 bet
  const valid = details.totalBets >= 1;

  return {
    valid,
    score: Math.max(0, Math.min(1000, totalScore)),
    details,
  };
}

/**
 * Calculate score breakdown for display
 */
export function getScoreBreakdown(verification: PredictionMarketVerification): string {
  const { details } = verification;

  const lines = [
    '=== Prediction Market Score Breakdown ===',
    '',
    `Total Score: ${verification.score}/1000`,
    '',
    `--- Profit/Loss (60%) ---`,
    `Starting Balance: M$${details.startingBalance.toLocaleString()}`,
    `Final Balance: M$${details.finalBalance.toLocaleString()}`,
    `Profit: M$${details.totalProfit.toLocaleString()} (${details.profitPercent.toFixed(1)}%)`,
    `Profit Score: ${details.profitScore}/600`,
    '',
    `--- Calibration (25%) ---`,
    `Brier Score: ${details.brierScore.toFixed(4)}`,
    `Calibration Score: ${details.brierScorePoints}/250`,
    '',
    `--- Activity (15%) ---`,
    `Total Bets: ${details.totalBets}`,
    `Activity Score: ${details.activityScore}/150`,
    '',
    `--- Summary ---`,
    `Valid: ${verification.valid ? 'Yes' : 'No'}`,
    `Completion Time: ${(details.completionTime / 1000).toFixed(1)}s`,
  ];

  return lines.join('\n');
}

/**
 * Extract portfolio data from agent actions
 * Used when portfolio data is not directly available
 */
export function extractPortfolioFromActions(
  actions: AgentAction[],
  startingBalance: number = 10000
): PortfolioData {
  const bets: BetData[] = [];
  let currentBalance = startingBalance;

  for (const action of actions) {
    // Look for bet-related actions in metadata
    if (action.metadata && action.type === 'submit') {
      const meta = action.metadata as Record<string, unknown>;

      if (meta.betPlaced && typeof meta.amount === 'number') {
        const betAmount = meta.amount as number;
        const outcome = meta.outcome as string || 'YES';
        const marketId = meta.marketId as string || 'unknown';
        const shares = meta.shares as number || betAmount;
        const probability = meta.probability as number || 0.5;

        bets.push({
          marketId,
          outcome,
          amount: betAmount,
          shares,
          probabilityAtBet: probability,
          resolved: false,
        });

        currentBalance -= betAmount;
      }
    }

    // Look for console logs indicating bets
    if (action.type === 'done' && action.metadata) {
      const meta = action.metadata as Record<string, unknown>;

      if (meta.portfolio) {
        const portfolioMeta = meta.portfolio as Record<string, unknown>;
        if (typeof portfolioMeta.finalBalance === 'number') {
          currentBalance = portfolioMeta.finalBalance;
        }
      }
    }
  }

  return {
    startingBalance,
    finalBalance: currentBalance,
    bets,
  };
}

export default verifyPredictionMarket;
