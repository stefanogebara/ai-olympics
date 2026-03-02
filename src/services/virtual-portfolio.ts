/**
 * Virtual Portfolio Manager
 * Manages virtual portfolios for sandbox prediction market competitions.
 * Persisted to Supabase (aio_virtual_portfolios + aio_virtual_bets).
 */

import { createLogger } from '../shared/utils/logger.js';
import { serviceClient } from '../shared/utils/supabase.js';
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
// DB ROW HELPERS
// ============================================================================

type DbPortfolioRow = {
  id: string;
  agent_id: string;
  competition_id: string;
  starting_balance: string | number;
  current_balance: string | number;
  total_profit: string | number | null;
  created_at: string;
};

type DbBetRow = {
  id: string;
  portfolio_id: string;
  manifold_market_id: string;
  market_question: string | null;
  outcome: string;
  amount: string | number;
  shares: string | number;
  probability_at_bet: string | number;
  resolved: boolean | null;
  resolution: string | null;
  payout: string | number | null;
  created_at: string;
};

function rowToPortfolio(row: DbPortfolioRow, bets: VirtualBet[]): VirtualPortfolio {
  const starting = Number(row.starting_balance);
  const current = Number(row.current_balance);

  // Derive positions from unresolved bets (grouped by marketId + outcome)
  const positionMap = new Map<string, VirtualPosition>();
  for (const bet of bets) {
    if (bet.resolved) continue;
    const key = `${bet.marketId}:${bet.outcome}`;
    const existing = positionMap.get(key);
    if (existing) {
      const totalCost = existing.averageCost * existing.shares + bet.amount;
      const totalShares = existing.shares + bet.shares;
      existing.averageCost = totalCost / totalShares;
      existing.shares = totalShares;
      // Estimate current value using probability at bet as proxy
      existing.currentValue = totalShares * bet.probabilityAtBet;
      existing.unrealizedPnL = existing.currentValue - totalCost;
    } else {
      const currentValue = bet.shares * bet.probabilityAtBet;
      positionMap.set(key, {
        marketId: bet.marketId,
        marketQuestion: bet.marketQuestion,
        outcome: bet.outcome,
        shares: bet.shares,
        averageCost: bet.amount / bet.shares,
        currentValue,
        unrealizedPnL: currentValue - bet.amount,
      });
    }
  }

  return {
    id: row.id,
    agentId: row.agent_id,
    competitionId: row.competition_id,
    startingBalance: starting,
    currentBalance: current,
    positions: Array.from(positionMap.values()),
    bets,
    totalProfit: Number(row.total_profit ?? current - starting),
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToBet(row: DbBetRow): VirtualBet {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    marketId: row.manifold_market_id,
    marketQuestion: row.market_question ?? '',
    outcome: row.outcome,
    amount: Number(row.amount),
    shares: Number(row.shares),
    probabilityAtBet: Number(row.probability_at_bet),
    timestamp: new Date(row.created_at).getTime(),
    resolved: row.resolved ?? false,
    payout: row.payout != null ? Number(row.payout) : undefined,
    resolution: row.resolution ?? undefined,
  };
}

// ============================================================================
// VIRTUAL PORTFOLIO MANAGER
// ============================================================================

export class VirtualPortfolioManager {
  private async getBets(portfolioId: string): Promise<VirtualBet[]> {
    const { data, error } = await serviceClient
      .from('aio_virtual_bets')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: true });

    if (error) {
      log.warn('Failed to fetch bets', { portfolioId, error: error.message });
      return [];
    }
    return (data ?? []).map(rowToBet);
  }

  /**
   * Create a new virtual portfolio for an agent in a competition.
   * Idempotent: returns existing portfolio if one already exists.
   */
  async createPortfolio(
    agentId: string,
    competitionId: string,
    startingBalance = 10000
  ): Promise<VirtualPortfolio> {
    // Check for existing
    const existing = await this.findPortfolioRow(agentId, competitionId);
    if (existing) {
      const bets = await this.getBets(existing.id);
      return rowToPortfolio(existing, bets);
    }

    const { data, error } = await serviceClient
      .from('aio_virtual_portfolios')
      .insert({
        agent_id: agentId,
        competition_id: competitionId,
        starting_balance: startingBalance,
        current_balance: startingBalance,
        total_profit: 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create portfolio: ${error.message}`);
    }

    log.info(`Created portfolio ${data.id} for agent ${agentId} with M$${startingBalance}`);
    return rowToPortfolio(data as DbPortfolioRow, []);
  }

  /**
   * Get portfolio by ID.
   */
  async getPortfolio(portfolioId: string): Promise<VirtualPortfolio | undefined> {
    const { data, error } = await serviceClient
      .from('aio_virtual_portfolios')
      .select('*')
      .eq('id', portfolioId)
      .maybeSingle();

    if (error || !data) return undefined;

    const bets = await this.getBets(portfolioId);
    return rowToPortfolio(data as DbPortfolioRow, bets);
  }

  /**
   * Find the portfolio DB row for (agentId, competitionId).
   */
  private async findPortfolioRow(
    agentId: string,
    competitionId: string
  ): Promise<DbPortfolioRow | null> {
    const { data, error } = await serviceClient
      .from('aio_virtual_portfolios')
      .select('*')
      .eq('agent_id', agentId)
      .eq('competition_id', competitionId)
      .maybeSingle();

    if (error) {
      log.warn('findPortfolioRow error', { agentId, competitionId, error: error.message });
      return null;
    }
    return (data as DbPortfolioRow | null);
  }

  /**
   * Get portfolio ID for an (agentId, competitionId) pair.
   */
  async getPortfolioId(agentId: string, competitionId: string): Promise<string | undefined> {
    const row = await this.findPortfolioRow(agentId, competitionId);
    return row?.id;
  }

  /**
   * Get or create portfolio for agent.
   */
  async getOrCreatePortfolio(
    agentId: string,
    competitionId: string,
    startingBalance = 10000
  ): Promise<VirtualPortfolio> {
    const existing = await this.findPortfolioRow(agentId, competitionId);
    if (existing) {
      const bets = await this.getBets(existing.id);
      return rowToPortfolio(existing, bets);
    }
    return this.createPortfolio(agentId, competitionId, startingBalance);
  }

  /**
   * Place a virtual bet.
   */
  async placeBet(
    portfolioId: string,
    market: ManifoldMarket,
    outcome: string,
    amount: number,
    maxBetSize = 1000
  ): Promise<PlaceBetResult> {
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      return { success: false, error: 'Portfolio not found' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Bet amount must be positive' };
    }
    if (amount > maxBetSize) {
      return { success: false, error: `Bet amount exceeds maximum of M$${maxBetSize}` };
    }
    if (amount > portfolio.currentBalance) {
      return { success: false, error: `Insufficient balance. Available: M$${portfolio.currentBalance.toFixed(2)}` };
    }

    const validOutcomes = this.getValidOutcomes(market);
    if (!validOutcomes.includes(outcome.toUpperCase())) {
      return { success: false, error: `Invalid outcome. Valid options: ${validOutcomes.join(', ')}` };
    }

    const normalizedOutcome = outcome.toUpperCase() as 'YES' | 'NO';
    const shares = calculateShares(market.pool, amount, normalizedOutcome);
    const probability = getImpliedProbability(market);
    const probabilityAtBet = normalizedOutcome === 'YES' ? probability : 1 - probability;

    // Insert bet
    const { data: betData, error: betErr } = await serviceClient
      .from('aio_virtual_bets')
      .insert({
        portfolio_id: portfolioId,
        manifold_market_id: market.id,
        market_question: market.question,
        market_url: market.url ?? null,
        outcome: normalizedOutcome,
        amount,
        shares,
        probability_at_bet: probabilityAtBet,
        pool_snapshot: market.pool,
      })
      .select()
      .single();

    if (betErr) {
      return { success: false, error: `Failed to record bet: ${betErr.message}` };
    }

    // Update portfolio balance
    const newBalance = portfolio.currentBalance - amount;
    const newProfit = newBalance - portfolio.startingBalance;
    await serviceClient
      .from('aio_virtual_portfolios')
      .update({
        current_balance: newBalance,
        total_profit: newProfit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolioId);

    const bet = rowToBet(betData as DbBetRow);
    log.info(`Bet placed: ${amount} on ${normalizedOutcome} for "${market.question}" — ${shares.toFixed(2)} shares`);

    return { success: true, bet, newBalance };
  }

  private getValidOutcomes(market: ManifoldMarket): string[] {
    if (market.outcomeType === 'BINARY') return ['YES', 'NO'];
    if (market.outcomeType === 'MULTIPLE_CHOICE' && market.answers) {
      return market.answers.map(a => a.id);
    }
    return ['YES', 'NO'];
  }

  /**
   * Update positions with current market prices (best-effort, no DB write needed).
   */
  async updatePositions(_portfolioId: string, _markets: Map<string, ManifoldMarket>): Promise<void> {
    // Positions are derived from bets on read; no separate persistence needed.
  }

  /**
   * Resolve a market and settle all positions in a portfolio.
   */
  async resolveMarket(portfolioId: string, marketId: string, resolvedOutcome: string): Promise<void> {
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) return;

    const unresolved = portfolio.bets.filter(b => b.marketId === marketId && !b.resolved);
    if (unresolved.length === 0) return;

    let balanceDelta = 0;

    for (const bet of unresolved) {
      const won = bet.outcome === resolvedOutcome;
      const payout = won ? bet.shares : 0;
      balanceDelta += payout;

      await serviceClient
        .from('aio_virtual_bets')
        .update({
          resolved: true,
          resolution: resolvedOutcome,
          payout,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', bet.id);

      log.info(`Bet ${bet.id} ${won ? `won! Payout: M$${payout.toFixed(2)}` : 'lost.'}`);
    }

    if (balanceDelta !== 0) {
      const newBalance = portfolio.currentBalance + balanceDelta;
      await serviceClient
        .from('aio_virtual_portfolios')
        .update({
          current_balance: newBalance,
          total_profit: newBalance - portfolio.startingBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', portfolioId);
    }
  }

  /**
   * Calculate Brier score for a portfolio (lower = better calibration).
   */
  async calculateBrierScore(portfolioId: string): Promise<number> {
    const { data, error } = await serviceClient
      .from('aio_virtual_bets')
      .select('probability_at_bet, outcome, resolution, resolved')
      .eq('portfolio_id', portfolioId)
      .eq('resolved', true);

    if (error || !data || data.length === 0) return 0.25;

    let sumSquaredError = 0;
    for (const row of data) {
      if (!row.resolution) continue;
      const actualOutcome = row.outcome === row.resolution ? 1 : 0;
      const forecast = Number(row.probability_at_bet);
      sumSquaredError += Math.pow(forecast - actualOutcome, 2);
    }

    return sumSquaredError / data.length;
  }

  /**
   * Calculate final scores for all agents in a competition.
   */
  async calculateFinalScores(competitionId: string): Promise<ScoreResult[]> {
    const portfolios = await this.getCompetitionPortfolios(competitionId);
    const results: ScoreResult[] = [];

    for (const portfolio of portfolios) {
      const profitPercent = (portfolio.totalProfit / portfolio.startingBalance) * 100;
      const normalizedProfit = Math.max(-50, Math.min(50, profitPercent));
      const profitScore = Math.round(((normalizedProfit + 50) / 100) * 600);

      const brierScore = await this.calculateBrierScore(portfolio.id);
      const brierScorePoints = Math.round(((0.25 - brierScore) / 0.25) * 250);

      const activityScore = Math.min(150, portfolio.bets.length * 15);
      const totalScore = Math.max(0, Math.min(1000,
        profitScore + Math.max(0, brierScorePoints) + activityScore
      ));

      results.push({
        agentId: portfolio.agentId,
        portfolioId: portfolio.id,
        totalScore,
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

    results.sort((a, b) => b.totalScore - a.totalScore);
    return results;
  }

  /**
   * Get all portfolios for a competition.
   */
  async getCompetitionPortfolios(competitionId: string): Promise<VirtualPortfolio[]> {
    const { data, error } = await serviceClient
      .from('aio_virtual_portfolios')
      .select('*')
      .eq('competition_id', competitionId);

    if (error || !data) return [];

    return Promise.all(
      (data as DbPortfolioRow[]).map(async row => {
        const bets = await this.getBets(row.id);
        return rowToPortfolio(row, bets);
      })
    );
  }

  /**
   * Delete a portfolio and all its bets.
   */
  async clearPortfolio(portfolioId: string): Promise<void> {
    await serviceClient.from('aio_virtual_bets').delete().eq('portfolio_id', portfolioId);
    await serviceClient.from('aio_virtual_portfolios').delete().eq('id', portfolioId);
    log.info(`Cleared portfolio ${portfolioId}`);
  }

  /**
   * Get a human-readable portfolio summary.
   */
  async getPortfolioSummary(portfolioId: string): Promise<string> {
    const portfolio = await this.getPortfolio(portfolioId);
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
