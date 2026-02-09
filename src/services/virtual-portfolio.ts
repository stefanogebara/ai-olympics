/**
 * Virtual Portfolio Manager
 * Manages virtual portfolios for sandbox prediction market competitions
 */

import { createLogger } from '../shared/utils/logger.js';
import { calculateShares, getImpliedProbability, ManifoldMarket } from './manifold-client.js';

const log = createLogger('VirtualPortfolio');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface VirtualPortfolio {
  id: string;
  agentId: string;
  competitionId: string;
  startingBalance: number;
  currentBalance: number;
  positions: VirtualPosition[];
  bets: VirtualBet[];
  totalProfit: number;
  createdAt: number;
}

export interface VirtualPosition {
  marketId: string;
  marketQuestion: string;
  outcome: string;
  shares: number;
  averageCost: number;
  currentValue: number;
  unrealizedPnL: number;
}

export interface VirtualBet {
  id: string;
  portfolioId: string;
  marketId: string;
  marketQuestion: string;
  outcome: string;
  amount: number;
  shares: number;
  probabilityAtBet: number;
  timestamp: number;
  resolved: boolean;
  payout?: number;
  resolution?: string;
}

export interface PlaceBetResult {
  success: boolean;
  bet?: VirtualBet;
  error?: string;
  newBalance?: number;
}

export interface ScoreResult {
  agentId: string;
  portfolioId: string;
  totalScore: number;
  profitScore: number;
  brierScore: number;
  brierScorePoints: number;
  activityScore: number;
  details: {
    startingBalance: number;
    finalBalance: number;
    totalProfit: number;
    profitPercent: number;
    totalBets: number;
    resolvedBets: number;
    unresolvedBets: number;
  };
}

// ============================================================================
// VIRTUAL PORTFOLIO MANAGER
// ============================================================================

export class VirtualPortfolioManager {
  private portfolios: Map<string, VirtualPortfolio> = new Map();
  private portfoliosByAgent: Map<string, Map<string, string>> = new Map(); // agentId -> competitionId -> portfolioId

  /**
   * Create a new virtual portfolio for an agent in a competition
   */
  createPortfolio(
    agentId: string,
    competitionId: string,
    startingBalance: number = 10000
  ): VirtualPortfolio {
    // Check if portfolio already exists
    const existingId = this.getPortfolioId(agentId, competitionId);
    if (existingId) {
      const existing = this.portfolios.get(existingId);
      if (existing) {
        log.info(`Portfolio already exists for agent ${agentId} in competition ${competitionId}`);
        return existing;
      }
    }

    const portfolio: VirtualPortfolio = {
      id: `vp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      competitionId,
      startingBalance,
      currentBalance: startingBalance,
      positions: [],
      bets: [],
      totalProfit: 0,
      createdAt: Date.now(),
    };

    this.portfolios.set(portfolio.id, portfolio);

    // Index by agent
    if (!this.portfoliosByAgent.has(agentId)) {
      this.portfoliosByAgent.set(agentId, new Map());
    }
    this.portfoliosByAgent.get(agentId)!.set(competitionId, portfolio.id);

    log.info(`Created portfolio ${portfolio.id} for agent ${agentId} with M$${startingBalance}`);
    return portfolio;
  }

  /**
   * Get portfolio by ID
   */
  getPortfolio(portfolioId: string): VirtualPortfolio | undefined {
    return this.portfolios.get(portfolioId);
  }

  /**
   * Get portfolio ID for an agent in a competition
   */
  getPortfolioId(agentId: string, competitionId: string): string | undefined {
    return this.portfoliosByAgent.get(agentId)?.get(competitionId);
  }

  /**
   * Get or create portfolio for agent
   */
  getOrCreatePortfolio(
    agentId: string,
    competitionId: string,
    startingBalance: number = 10000
  ): VirtualPortfolio {
    const existingId = this.getPortfolioId(agentId, competitionId);
    if (existingId) {
      const existing = this.portfolios.get(existingId);
      if (existing) return existing;
    }
    return this.createPortfolio(agentId, competitionId, startingBalance);
  }

  /**
   * Place a virtual bet
   */
  placeBet(
    portfolioId: string,
    market: ManifoldMarket,
    outcome: string,
    amount: number,
    maxBetSize: number = 1000
  ): PlaceBetResult {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      return { success: false, error: 'Portfolio not found' };
    }

    // Validate amount
    if (amount <= 0) {
      return { success: false, error: 'Bet amount must be positive' };
    }

    if (amount > maxBetSize) {
      return { success: false, error: `Bet amount exceeds maximum of M$${maxBetSize}` };
    }

    if (amount > portfolio.currentBalance) {
      return { success: false, error: `Insufficient balance. Available: M$${portfolio.currentBalance.toFixed(2)}` };
    }

    // Validate outcome
    const validOutcomes = this.getValidOutcomes(market);
    if (!validOutcomes.includes(outcome.toUpperCase())) {
      return { success: false, error: `Invalid outcome. Valid options: ${validOutcomes.join(', ')}` };
    }

    // Calculate shares
    const normalizedOutcome = outcome.toUpperCase() as 'YES' | 'NO';
    const shares = calculateShares(market.pool, amount, normalizedOutcome);
    const probability = getImpliedProbability(market);

    // Create bet record
    const bet: VirtualBet = {
      id: `vb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      portfolioId,
      marketId: market.id,
      marketQuestion: market.question,
      outcome: normalizedOutcome,
      amount,
      shares,
      probabilityAtBet: normalizedOutcome === 'YES' ? probability : 1 - probability,
      timestamp: Date.now(),
      resolved: false,
    };

    // Update portfolio
    portfolio.currentBalance -= amount;
    portfolio.bets.push(bet);

    // Update or create position
    this.updatePosition(portfolio, market, normalizedOutcome, amount, shares);

    // Recalculate profit
    portfolio.totalProfit = portfolio.currentBalance - portfolio.startingBalance +
      portfolio.positions.reduce((sum, p) => sum + p.currentValue, 0);

    log.info(`Bet placed: ${amount} on ${normalizedOutcome} for "${market.question}" - ${shares.toFixed(2)} shares`);

    return {
      success: true,
      bet,
      newBalance: portfolio.currentBalance,
    };
  }

  /**
   * Get valid outcomes for a market
   */
  private getValidOutcomes(market: ManifoldMarket): string[] {
    if (market.outcomeType === 'BINARY') {
      return ['YES', 'NO'];
    }
    if (market.outcomeType === 'MULTIPLE_CHOICE' && market.answers) {
      return market.answers.map(a => a.id);
    }
    return ['YES', 'NO'];
  }

  /**
   * Update or create a position
   */
  private updatePosition(
    portfolio: VirtualPortfolio,
    market: ManifoldMarket,
    outcome: string,
    amount: number,
    shares: number
  ): void {
    const existingIndex = portfolio.positions.findIndex(
      p => p.marketId === market.id && p.outcome === outcome
    );

    if (existingIndex >= 0) {
      const position = portfolio.positions[existingIndex];
      const totalCost = position.averageCost * position.shares + amount;
      const totalShares = position.shares + shares;
      position.averageCost = totalCost / totalShares;
      position.shares = totalShares;
      position.currentValue = totalShares * getImpliedProbability(market);
      position.unrealizedPnL = position.currentValue - totalCost;
    } else {
      const probability = getImpliedProbability(market);
      const currentValue = shares * (outcome === 'YES' ? probability : 1 - probability);

      portfolio.positions.push({
        marketId: market.id,
        marketQuestion: market.question,
        outcome,
        shares,
        averageCost: amount / shares,
        currentValue,
        unrealizedPnL: currentValue - amount,
      });
    }
  }

  /**
   * Update all positions with current market prices
   */
  updatePositions(portfolioId: string, markets: Map<string, ManifoldMarket>): void {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) return;

    for (const position of portfolio.positions) {
      const market = markets.get(position.marketId);
      if (market) {
        const probability = getImpliedProbability(market);
        const outcomeProb = position.outcome === 'YES' ? probability : 1 - probability;
        position.currentValue = position.shares * outcomeProb;
        position.unrealizedPnL = position.currentValue - (position.averageCost * position.shares);
      }
    }

    // Recalculate total profit
    portfolio.totalProfit = portfolio.currentBalance - portfolio.startingBalance +
      portfolio.positions.reduce((sum, p) => sum + p.currentValue, 0);
  }

  /**
   * Resolve a market and settle positions
   */
  resolveMarket(portfolioId: string, marketId: string, resolvedOutcome: string): void {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) return;

    // Find and resolve bets
    for (const bet of portfolio.bets) {
      if (bet.marketId === marketId && !bet.resolved) {
        bet.resolved = true;
        bet.resolution = resolvedOutcome;

        // Calculate payout: if bet outcome matches resolution, payout = shares * 1
        // Otherwise payout = 0
        if (bet.outcome === resolvedOutcome) {
          bet.payout = bet.shares;
          portfolio.currentBalance += bet.payout;
          log.info(`Bet ${bet.id} won! Payout: M$${bet.payout.toFixed(2)}`);
        } else {
          bet.payout = 0;
          log.info(`Bet ${bet.id} lost. Outcome was ${resolvedOutcome}, bet was ${bet.outcome}`);
        }
      }
    }

    // Remove resolved positions
    portfolio.positions = portfolio.positions.filter(p => p.marketId !== marketId);

    // Recalculate profit
    portfolio.totalProfit = portfolio.currentBalance - portfolio.startingBalance +
      portfolio.positions.reduce((sum, p) => sum + p.currentValue, 0);
  }

  /**
   * Calculate Brier score for a portfolio
   * Brier score measures calibration: lower is better
   * Score = (1/N) * sum((forecast - outcome)^2)
   */
  calculateBrierScore(portfolioId: string): number {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) return 0.25; // Default (maximum uncertainty)

    const resolvedBets = portfolio.bets.filter(b => b.resolved && b.resolution);
    if (resolvedBets.length === 0) return 0.25;

    let sumSquaredError = 0;

    for (const bet of resolvedBets) {
      // outcome = 1 if bet was correct, 0 if not
      const actualOutcome = bet.outcome === bet.resolution ? 1 : 0;
      // forecast = probability at time of bet
      const forecast = bet.probabilityAtBet;
      // squared error
      sumSquaredError += Math.pow(forecast - actualOutcome, 2);
    }

    return sumSquaredError / resolvedBets.length;
  }

  /**
   * Calculate final scores for a competition
   */
  calculateFinalScores(competitionId: string): ScoreResult[] {
    const results: ScoreResult[] = [];

    for (const portfolio of this.portfolios.values()) {
      if (portfolio.competitionId !== competitionId) continue;

      // Calculate profit score (60% weight, max 600 points)
      // +50% gain = 600 points, 0% = 300 points, -50% = 0 points
      const profitPercent = (portfolio.totalProfit / portfolio.startingBalance) * 100;
      const normalizedProfit = Math.max(-50, Math.min(50, profitPercent));
      const profitScore = Math.round(((normalizedProfit + 50) / 100) * 600);

      // Calculate Brier score (25% weight, max 250 points)
      // 0.00 = 250 points, 0.25 = 0 points
      const brierScore = this.calculateBrierScore(portfolio.id);
      const brierScorePoints = Math.round(((0.25 - brierScore) / 0.25) * 250);

      // Calculate activity score (15% weight, max 150 points)
      // 15 points per bet, max 150 (10 bets)
      const activityScore = Math.min(150, portfolio.bets.length * 15);

      // Total score
      const totalScore = profitScore + Math.max(0, brierScorePoints) + activityScore;

      results.push({
        agentId: portfolio.agentId,
        portfolioId: portfolio.id,
        totalScore: Math.max(0, Math.min(1000, totalScore)),
        profitScore,
        brierScore,
        brierScorePoints: Math.max(0, brierScorePoints),
        activityScore,
        details: {
          startingBalance: portfolio.startingBalance,
          finalBalance: portfolio.currentBalance,
          totalProfit: portfolio.totalProfit,
          profitPercent,
          totalBets: portfolio.bets.length,
          resolvedBets: portfolio.bets.filter(b => b.resolved).length,
          unresolvedBets: portfolio.bets.filter(b => !b.resolved).length,
        },
      });
    }

    // Sort by total score descending
    results.sort((a, b) => b.totalScore - a.totalScore);

    return results;
  }

  /**
   * Get all portfolios for a competition
   */
  getCompetitionPortfolios(competitionId: string): VirtualPortfolio[] {
    return Array.from(this.portfolios.values())
      .filter(p => p.competitionId === competitionId);
  }

  /**
   * Clear a portfolio (for testing)
   */
  clearPortfolio(portfolioId: string): void {
    const portfolio = this.portfolios.get(portfolioId);
    if (portfolio) {
      this.portfolios.delete(portfolioId);
      const agentMap = this.portfoliosByAgent.get(portfolio.agentId);
      if (agentMap) {
        agentMap.delete(portfolio.competitionId);
      }
      log.info(`Cleared portfolio ${portfolioId}`);
    }
  }

  /**
   * Get portfolio summary for display
   */
  getPortfolioSummary(portfolioId: string): string {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) return 'Portfolio not found';

    const lines = [
      `=== Portfolio Summary ===`,
      `Balance: M$${portfolio.currentBalance.toFixed(2)}`,
      `Total Profit: M$${portfolio.totalProfit.toFixed(2)} (${((portfolio.totalProfit / portfolio.startingBalance) * 100).toFixed(1)}%)`,
      `Total Bets: ${portfolio.bets.length}`,
      ``,
      `=== Open Positions ===`,
    ];

    if (portfolio.positions.length === 0) {
      lines.push('No open positions');
    } else {
      for (const pos of portfolio.positions) {
        lines.push(`${pos.marketQuestion.substring(0, 50)}...`);
        lines.push(`  ${pos.outcome}: ${pos.shares.toFixed(2)} shares @ M$${pos.averageCost.toFixed(2)} | P&L: M$${pos.unrealizedPnL.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const virtualPortfolioManager = new VirtualPortfolioManager();
export default virtualPortfolioManager;
