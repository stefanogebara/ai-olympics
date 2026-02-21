/**
 * Meta Market Service
 * Manages betting markets for AI competition outcomes
 * Auto-creates markets for competitions and resolves them based on results
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import { eventBus } from '../shared/utils/events.js';

const log = createLogger('MetaMarketService');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MarketType = 'winner' | 'score_over_under' | 'head_to_head' | 'task_completion';
export type MarketStatus = 'draft' | 'open' | 'locked' | 'resolved' | 'cancelled';

export interface MarketOutcome {
  id: string;
  name: string;
  initial_odds: number;
  agent_id?: string;
  agent_name?: string;
  elo?: number;
}

export interface MetaMarket {
  id: string;
  competition_id?: string;
  question: string;
  description?: string;
  market_type: MarketType;
  outcomes: MarketOutcome[];
  current_odds?: Record<string, number>;
  status: MarketStatus;
  resolved_outcome?: string;
  total_volume: number;
  total_bets: number;
  opens_at: string;
  locks_at?: string;
  created_at: string;
}

export interface MetaMarketBet {
  id: string;
  market_id: string;
  user_id: string;
  outcome_id: string;
  outcome_name: string;
  amount: number;
  odds_at_bet: number;
  potential_payout: number;
  status: 'active' | 'won' | 'lost' | 'cancelled' | 'refunded';
  actual_payout?: number;
  created_at: string;
  settled_at?: string;
}

export interface PlaceBetResult {
  success: boolean;
  bet?: MetaMarketBet;
  error?: string;
  newBalance?: number;
}

export interface CompetitionInfo {
  id: string;
  name: string;
  task_id: string;
  agents: {
    id: string;
    name: string;
    elo?: number;
    color?: string;
  }[];
  start_time?: string;
}

// ============================================================================
// ODDS CALCULATION
// ============================================================================

/**
 * Calculate initial odds from agent ELO ratings
 * Uses a simple ELO-to-probability conversion
 */
function calculateOddsFromElo(agents: { id: string; name: string; elo?: number }[]): Record<string, number> {
  const odds: Record<string, number> = {};

  // Default ELO for agents without rating
  const DEFAULT_ELO = 1500;

  // Calculate win probabilities from ELO
  const elos = agents.map(a => a.elo || DEFAULT_ELO);
  const avgElo = elos.reduce((sum, e) => sum + e, 0) / elos.length;

  agents.forEach((agent, index) => {
    const elo = agent.elo || DEFAULT_ELO;
    // Expected score formula from ELO
    const expectedScore = 1 / (1 + Math.pow(10, (avgElo - elo) / 400));
    // Convert to American odds
    if (expectedScore >= 0.5) {
      // Favorite: negative odds
      odds[agent.id] = Math.round(-(expectedScore / (1 - expectedScore)) * 100);
    } else {
      // Underdog: positive odds
      odds[agent.id] = Math.round(((1 - expectedScore) / expectedScore) * 100);
    }
  });

  return odds;
}

/**
 * Calculate potential payout from bet amount and odds
 */
function calculatePayout(amount: number, odds: number): number {
  if (odds > 0) {
    return amount + (amount * (odds / 100));
  } else {
    return amount + (amount * (100 / Math.abs(odds)));
  }
}

// ============================================================================
// META MARKET SERVICE CLASS
// ============================================================================

export class MetaMarketService {
  private initialized = false;
  private eventListenersRegistered = false;

  constructor() {
    this.initialized = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
    if (!this.initialized) {
      log.warn('Supabase not configured, meta market service will use fallback');
    }
  }

  /**
   * Register event listeners for auto-market creation/resolution
   */
  registerEventListeners(): void {
    if (this.eventListenersRegistered) return;

    // Auto-create market when competition is created
    eventBus.on('competition:create', async (event) => {
      const competition = event.data as CompetitionInfo;
      await this.createMarketForCompetition(competition);
    });

    // Lock market when competition starts
    eventBus.on('competition:start', async (event) => {
      const { competitionId } = event.data as { competitionId: string };
      await this.lockMarket(competitionId);
    });

    // Resolve market when competition ends
    eventBus.on('competition:end', async (event) => {
      const { competitionId, winner } = event.data as { competitionId: string; winner?: { agentId: string } };
      if (winner?.agentId) {
        await this.resolveMarket(competitionId, winner.agentId);
      }
    });

    this.eventListenersRegistered = true;
    log.info('Event listeners registered for auto-market management');
  }

  /**
   * Create a betting market for a competition
   */
  async createMarketForCompetition(competition: CompetitionInfo): Promise<MetaMarket | null> {
    if (!this.initialized) return null;

    try {
      const odds = calculateOddsFromElo(competition.agents);

      const outcomes: MarketOutcome[] = competition.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        initial_odds: odds[agent.id],
        agent_id: agent.id,
        agent_name: agent.name,
        elo: agent.elo
      }));

      const marketData = {
        competition_id: competition.id,
        question: `Who will win the ${competition.name}?`,
        description: `Bet on which AI agent will win this ${competition.task_id} competition.`,
        market_type: 'winner' as MarketType,
        outcomes: outcomes,
        current_odds: odds,
        status: 'open' as MarketStatus,
        locks_at: competition.start_time || null
      };

      const { data, error } = await supabase
        .from('aio_meta_markets')
        .insert(marketData)
        .select()
        .single();

      if (error) {
        log.error('Error creating meta market', { error: error.message });
        return null;
      }

      // Update agent betting stats (batch upsert instead of N+1 loop)
      await supabase
        .from('aio_agent_betting_stats')
        .upsert(
          competition.agents.map(agent => ({
            agent_id: agent.id,
            markets_featured: 1,
            last_featured_at: new Date().toISOString(),
          })),
          { onConflict: 'agent_id' }
        );

      log.info(`Created meta market for competition ${competition.id}`);
      return data as MetaMarket;
    } catch (error) {
      log.error('Error in createMarketForCompetition', { error: String(error) });
      return null;
    }
  }

  /**
   * Get all active meta markets
   */
  async getActiveMarkets(): Promise<MetaMarket[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_active_meta_markets')
        .select('*');

      if (error) {
        log.error('Error fetching active markets', { error: error.message });
        return [];
      }

      return data as MetaMarket[];
    } catch (error) {
      log.error('Error in getActiveMarkets', { error: String(error) });
      return [];
    }
  }

  /**
   * Get a specific market by ID
   */
  async getMarket(marketId: string): Promise<MetaMarket | null> {
    if (!this.initialized) return null;

    try {
      const { data, error } = await supabase
        .from('aio_meta_markets')
        .select('*')
        .eq('id', marketId)
        .single();

      if (error) {
        log.error('Error fetching market', { error: error.message });
        return null;
      }

      return data as MetaMarket;
    } catch (error) {
      log.error('Error in getMarket', { error: String(error) });
      return null;
    }
  }

  /**
   * Get market by competition ID
   */
  async getMarketByCompetition(competitionId: string): Promise<MetaMarket | null> {
    if (!this.initialized) return null;

    try {
      const { data, error } = await supabase
        .from('aio_meta_markets')
        .select('*')
        .eq('competition_id', competitionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        return null;
      }

      return data as MetaMarket;
    } catch (error) {
      return null;
    }
  }

  /**
   * Place a bet on a meta market
   */
  async placeBet(
    userId: string,
    marketId: string,
    outcomeId: string,
    amount: number,
    maxBetSize: number = 1000
  ): Promise<PlaceBetResult> {
    if (!this.initialized) {
      return { success: false, error: 'Service not configured' };
    }

    try {
      // Get market
      const market = await this.getMarket(marketId);
      if (!market) {
        return { success: false, error: 'Market not found' };
      }

      // Check market status
      if (market.status !== 'open') {
        return { success: false, error: 'Market is not open for betting' };
      }

      // Validate outcome
      const outcome = market.outcomes.find(o => o.id === outcomeId);
      if (!outcome) {
        return { success: false, error: 'Invalid outcome' };
      }

      // Validate amount
      if (amount <= 0) {
        return { success: false, error: 'Bet amount must be positive' };
      }

      if (amount > maxBetSize) {
        return { success: false, error: `Maximum bet size is M$${maxBetSize}` };
      }

      // Get current odds for outcome
      const odds = market.current_odds?.[outcomeId] || outcome.initial_odds;
      const potentialPayout = calculatePayout(amount, odds);

      // Atomic bet placement: balance check + deduction + insert in single transaction
      const { data: result, error: rpcError } = await supabase
        .rpc('place_meta_market_bet_atomic', {
          p_user_id: userId,
          p_market_id: marketId,
          p_outcome_id: outcomeId,
          p_outcome_name: outcome.name,
          p_amount: amount,
          p_odds: odds,
          p_potential_payout: potentialPayout,
        });

      if (rpcError) {
        log.error('Error placing bet', { error: rpcError.message });
        return { success: false, error: 'Failed to place bet' };
      }

      const row = Array.isArray(result) ? result[0] : result;

      if (!row?.success) {
        return { success: false, error: row?.error_msg || 'Failed to place bet' };
      }

      log.info(`User ${userId} bet M$${amount} on ${outcome.name} in market ${marketId}`);

      // Fetch the created bet for the response
      const { data: bet } = await supabase
        .from('aio_meta_market_bets')
        .select('*')
        .eq('id', row.bet_id)
        .single();

      return {
        success: true,
        bet: (bet || { id: row.bet_id, market_id: marketId, user_id: userId, outcome_id: outcomeId, outcome_name: outcome.name, amount, odds_at_bet: odds, potential_payout: potentialPayout, status: 'active', created_at: new Date().toISOString() }) as MetaMarketBet,
        newBalance: row.new_balance,
      };
    } catch (error) {
      log.error('Error in placeBet', { error: String(error) });
      return { success: false, error: 'Failed to place bet' };
    }
  }

  /**
   * Lock market (prevent new bets)
   */
  async lockMarket(competitionId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const { error } = await supabase
        .from('aio_meta_markets')
        .update({ status: 'locked', updated_at: new Date().toISOString() })
        .eq('competition_id', competitionId)
        .eq('status', 'open');

      if (error) {
        log.error('Error locking market', { error: error.message });
        return false;
      }

      log.info(`Locked market for competition ${competitionId}`);
      return true;
    } catch (error) {
      log.error('Error in lockMarket', { error: String(error) });
      return false;
    }
  }

  /**
   * Resolve market with winner
   */
  async resolveMarket(competitionId: string, winnerId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const { error } = await supabase
        .from('aio_meta_markets')
        .update({
          status: 'resolved',
          resolved_outcome: winnerId,
          resolves_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('competition_id', competitionId)
        .in('status', ['open', 'locked']);

      if (error) {
        log.error('Error resolving market', { error: error.message });
        return false;
      }

      log.info(`Resolved market for competition ${competitionId}, winner: ${winnerId}`);
      return true;
    } catch (error) {
      log.error('Error in resolveMarket', { error: String(error) });
      return false;
    }
  }

  /**
   * Get user's bets on meta markets
   */
  async getUserBets(userId: string, limit: number = 50): Promise<MetaMarketBet[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_user_meta_bets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Error fetching user bets', { error: error.message });
        return [];
      }

      return data as MetaMarketBet[];
    } catch (error) {
      log.error('Error in getUserBets', { error: String(error) });
      return [];
    }
  }

  /**
   * Get bets for a specific market
   */
  async getMarketBets(marketId: string): Promise<MetaMarketBet[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_meta_market_bets')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      if (error) {
        log.error('Error fetching market bets', { error: error.message });
        return [];
      }

      return data as MetaMarketBet[];
    } catch (error) {
      log.error('Error in getMarketBets', { error: String(error) });
      return [];
    }
  }
}

// Export singleton instance
export const metaMarketService = new MetaMarketService();
export default metaMarketService;
