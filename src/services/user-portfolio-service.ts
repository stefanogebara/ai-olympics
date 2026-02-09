/**
 * User Portfolio Service
 * Supabase-backed portfolio management for human users
 * Supports persistent portfolios, bets, positions, and social features
 */

import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import { marketService, type UnifiedMarket } from './market-service.js';

const log = createLogger('UserPortfolioService');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UserPortfolio {
  id: string;
  user_id: string;
  virtual_balance: number;
  starting_balance: number;
  total_profit: number;
  brier_score?: number;
  total_bets: number;
  winning_bets: number;
  total_volume: number;
  best_streak: number;
  current_streak: number;
  created_at: string;
  updated_at: string;
}

export interface UserBet {
  id: string;
  user_id: string;
  portfolio_id: string;
  market_id: string;
  market_source: string;
  market_question: string;
  market_category?: string;
  outcome: string;
  amount: number;
  shares: number;
  probability_at_bet: number;
  price_at_bet?: number;
  resolved: boolean;
  resolution?: string;
  payout?: number;
  profit?: number;
  created_at: string;
  resolved_at?: string;
}

export interface UserPosition {
  id: string;
  user_id: string;
  portfolio_id: string;
  market_id: string;
  market_source: string;
  market_question: string;
  market_category?: string;
  outcome: string;
  shares: number;
  average_cost: number;
  total_cost: number;
  current_value?: number;
  unrealized_pnl: number;
  updated_at: string;
}

export interface LeaderboardEntry {
  portfolio_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  virtual_balance: number;
  total_profit: number;
  profit_percent: number;
  total_bets: number;
  winning_bets: number;
  win_rate: number;
  brier_score?: number;
  follower_count: number;
}

export interface PlaceBetResult {
  success: boolean;
  bet?: UserBet;
  error?: string;
  newBalance?: number;
}

export interface UserStats {
  totalProfit: number;
  profitPercent: number;
  totalBets: number;
  winningBets: number;
  winRate: number;
  brierScore?: number;
  bestStreak: number;
  currentStreak: number;
  totalVolume: number;
  followerCount: number;
  followingCount: number;
}

// ============================================================================
// CPMM MATH (from virtual-portfolio.ts)
// ============================================================================

function calculateShares(pool: { YES: number; NO: number }, amount: number, outcome: 'YES' | 'NO'): number {
  const k = pool.YES * pool.NO;
  if (outcome === 'YES') {
    const newNo = pool.NO + amount;
    const newYes = k / newNo;
    return pool.YES - newYes + amount;
  } else {
    const newYes = pool.YES + amount;
    const newNo = k / newYes;
    return pool.NO - newNo + amount;
  }
}

// ============================================================================
// USER PORTFOLIO SERVICE
// ============================================================================

export class UserPortfolioService {
  private initialized = false;

  constructor() {
    this.initialized = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
    if (!this.initialized) {
      log.warn('Supabase not configured, user portfolio service will use fallback');
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.initialized;
  }

  /**
   * Get or create a portfolio for a user
   */
  async getOrCreatePortfolio(userId: string): Promise<UserPortfolio | null> {
    if (!this.initialized) {
      log.warn('Supabase not configured');
      return null;
    }

    try {
      // Try to get existing portfolio
      const { data: existing, error: getError } = await supabase
        .from('aio_user_portfolios')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existing && !getError) {
        return existing as UserPortfolio;
      }

      // Create new portfolio
      const { data: newPortfolio, error: createError } = await supabase
        .from('aio_user_portfolios')
        .insert({ user_id: userId })
        .select()
        .single();

      if (createError) {
        log.error('Error creating portfolio', { error: createError.message });
        return null;
      }

      log.info(`Created new portfolio for user ${userId}`);
      return newPortfolio as UserPortfolio;
    } catch (error) {
      log.error('Error in getOrCreatePortfolio', { error: String(error) });
      return null;
    }
  }

  /**
   * Get user's portfolio
   */
  async getPortfolio(userId: string): Promise<UserPortfolio | null> {
    if (!this.initialized) return null;

    try {
      const { data, error } = await supabase
        .from('aio_user_portfolios')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No portfolio found, create one
          return this.getOrCreatePortfolio(userId);
        }
        log.error('Error fetching portfolio', { error: error.message });
        return null;
      }

      return data as UserPortfolio;
    } catch (error) {
      log.error('Error in getPortfolio', { error: String(error) });
      return null;
    }
  }

  /**
   * Place a bet for a user
   */
  async placeBet(
    userId: string,
    marketId: string,
    outcome: string,
    amount: number,
    maxBetSize: number = 1000
  ): Promise<PlaceBetResult> {
    if (!this.initialized) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // Get or create portfolio
      const portfolio = await this.getOrCreatePortfolio(userId);
      if (!portfolio) {
        return { success: false, error: 'Failed to get portfolio' };
      }

      // Validate amount
      if (amount <= 0) {
        return { success: false, error: 'Bet amount must be positive' };
      }

      if (amount > maxBetSize) {
        return { success: false, error: `Bet amount exceeds maximum of M$${maxBetSize}` };
      }

      if (amount > portfolio.virtual_balance) {
        return { success: false, error: `Insufficient balance. Available: M$${portfolio.virtual_balance.toFixed(2)}` };
      }

      // Fetch market data
      const market = await marketService.getMarket(marketId);
      if (!market) {
        return { success: false, error: 'Market not found' };
      }

      // Calculate shares
      const normalizedOutcome = outcome.toUpperCase() as 'YES' | 'NO';
      const yesOutcome = market.outcomes.find(o => o.name === 'YES');
      const noOutcome = market.outcomes.find(o => o.name === 'NO');

      const pool = {
        YES: yesOutcome?.price || 50,
        NO: noOutcome?.price || 50
      };

      const shares = calculateShares(pool, amount, normalizedOutcome);
      const probability = normalizedOutcome === 'YES'
        ? (yesOutcome?.probability || 0.5)
        : (noOutcome?.probability || 0.5);

      // Insert bet
      const betData = {
        user_id: userId,
        portfolio_id: portfolio.id,
        market_id: marketId,
        market_source: market.source,
        market_question: market.question,
        market_category: market.category,
        outcome: normalizedOutcome,
        amount,
        shares,
        probability_at_bet: probability,
        price_at_bet: normalizedOutcome === 'YES' ? yesOutcome?.price : noOutcome?.price
      };

      const { data: bet, error: betError } = await supabase
        .from('aio_user_bets')
        .insert(betData)
        .select()
        .single();

      if (betError) {
        log.error('Error placing bet', { error: betError.message });
        return { success: false, error: 'Failed to place bet' };
      }

      // Update or create position
      await this.updatePosition(userId, portfolio.id, market, normalizedOutcome, amount, shares);

      // Get updated portfolio balance
      const updatedPortfolio = await this.getPortfolio(userId);

      log.info(`User ${userId} bet M$${amount} on ${normalizedOutcome} for market ${marketId}`);

      return {
        success: true,
        bet: bet as UserBet,
        newBalance: updatedPortfolio?.virtual_balance || portfolio.virtual_balance - amount
      };
    } catch (error) {
      log.error('Error in placeBet', { error: String(error) });
      return { success: false, error: 'Failed to place bet' };
    }
  }

  /**
   * Update or create a position
   */
  private async updatePosition(
    userId: string,
    portfolioId: string,
    market: UnifiedMarket,
    outcome: string,
    amount: number,
    shares: number
  ): Promise<void> {
    try {
      // Check for existing position
      const { data: existing } = await supabase
        .from('aio_user_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('market_id', market.id)
        .eq('outcome', outcome)
        .single();

      if (existing) {
        // Update existing position
        const newShares = existing.shares + shares;
        const newTotalCost = existing.total_cost + amount;
        const newAvgCost = newTotalCost / newShares;

        await supabase
          .from('aio_user_positions')
          .update({
            shares: newShares,
            average_cost: newAvgCost,
            total_cost: newTotalCost,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Create new position
        await supabase
          .from('aio_user_positions')
          .insert({
            user_id: userId,
            portfolio_id: portfolioId,
            market_id: market.id,
            market_source: market.source,
            market_question: market.question,
            market_category: market.category,
            outcome,
            shares,
            average_cost: amount / shares,
            total_cost: amount
          });
      }
    } catch (error) {
      log.error('Error updating position', { error: String(error) });
    }
  }

  /**
   * Get user's bet history
   */
  async getBets(userId: string, limit: number = 50, offset: number = 0): Promise<UserBet[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_user_bets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        log.error('Error fetching bets', { error: error.message });
        return [];
      }

      return data as UserBet[];
    } catch (error) {
      log.error('Error in getBets', { error: String(error) });
      return [];
    }
  }

  /**
   * Get user's open positions
   */
  async getPositions(userId: string): Promise<UserPosition[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_user_positions')
        .select('*')
        .eq('user_id', userId)
        .gt('shares', 0)
        .order('updated_at', { ascending: false });

      if (error) {
        log.error('Error fetching positions', { error: error.message });
        return [];
      }

      return data as UserPosition[];
    } catch (error) {
      log.error('Error in getPositions', { error: String(error) });
      return [];
    }
  }

  /**
   * Get user's stats
   */
  async getStats(userId: string): Promise<UserStats | null> {
    if (!this.initialized) return null;

    try {
      const portfolio = await this.getPortfolio(userId);
      if (!portfolio) return null;

      // Get follower/following counts
      const { count: followerCount } = await supabase
        .from('aio_followed_traders')
        .select('*', { count: 'exact', head: true })
        .eq('followed_id', userId);

      const { count: followingCount } = await supabase
        .from('aio_followed_traders')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      return {
        totalProfit: portfolio.total_profit,
        profitPercent: portfolio.starting_balance > 0
          ? (portfolio.total_profit / portfolio.starting_balance) * 100
          : 0,
        totalBets: portfolio.total_bets,
        winningBets: portfolio.winning_bets,
        winRate: portfolio.total_bets > 0
          ? (portfolio.winning_bets / portfolio.total_bets) * 100
          : 0,
        brierScore: portfolio.brier_score || undefined,
        bestStreak: portfolio.best_streak,
        currentStreak: portfolio.current_streak,
        totalVolume: portfolio.total_volume,
        followerCount: followerCount || 0,
        followingCount: followingCount || 0
      };
    } catch (error) {
      log.error('Error in getStats', { error: String(error) });
      return null;
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 50, offset: number = 0): Promise<LeaderboardEntry[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_user_prediction_leaderboard')
        .select('*')
        .range(offset, offset + limit - 1);

      if (error) {
        log.error('Error fetching leaderboard', { error: error.message });
        return [];
      }

      return data as LeaderboardEntry[];
    } catch (error) {
      log.error('Error in getLeaderboard', { error: String(error) });
      return [];
    }
  }

  /**
   * Follow a trader
   */
  async followTrader(followerId: string, followedId: string): Promise<boolean> {
    if (!this.initialized) return false;

    if (followerId === followedId) {
      log.warn('Cannot follow yourself');
      return false;
    }

    try {
      const { error } = await supabase
        .from('aio_followed_traders')
        .insert({ follower_id: followerId, followed_id: followedId });

      if (error) {
        if (error.code === '23505') {
          // Already following
          return true;
        }
        log.error('Error following trader', { error: error.message });
        return false;
      }

      log.info(`User ${followerId} followed ${followedId}`);
      return true;
    } catch (error) {
      log.error('Error in followTrader', { error: String(error) });
      return false;
    }
  }

  /**
   * Unfollow a trader
   */
  async unfollowTrader(followerId: string, followedId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const { error } = await supabase
        .from('aio_followed_traders')
        .delete()
        .eq('follower_id', followerId)
        .eq('followed_id', followedId);

      if (error) {
        log.error('Error unfollowing trader', { error: error.message });
        return false;
      }

      log.info(`User ${followerId} unfollowed ${followedId}`);
      return true;
    } catch (error) {
      log.error('Error in unfollowTrader', { error: String(error) });
      return false;
    }
  }

  /**
   * Get users followed by a user
   */
  async getFollowing(userId: string): Promise<string[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_followed_traders')
        .select('followed_id')
        .eq('follower_id', userId);

      if (error) {
        log.error('Error fetching following', { error: error.message });
        return [];
      }

      return data.map(f => f.followed_id);
    } catch (error) {
      log.error('Error in getFollowing', { error: String(error) });
      return [];
    }
  }

  /**
   * Get users following a user
   */
  async getFollowers(userId: string): Promise<string[]> {
    if (!this.initialized) return [];

    try {
      const { data, error } = await supabase
        .from('aio_followed_traders')
        .select('follower_id')
        .eq('followed_id', userId);

      if (error) {
        log.error('Error fetching followers', { error: error.message });
        return [];
      }

      return data.map(f => f.follower_id);
    } catch (error) {
      log.error('Error in getFollowers', { error: String(error) });
      return [];
    }
  }

  /**
   * Check if a user is following another
   */
  async isFollowing(followerId: string, followedId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const { data } = await supabase
        .from('aio_followed_traders')
        .select('id')
        .eq('follower_id', followerId)
        .eq('followed_id', followedId)
        .single();

      return !!data;
    } catch {
      return false;
    }
  }

  /**
   * Get recent trades from followed traders
   */
  async getFollowedTradesFeed(userId: string, limit: number = 20): Promise<UserBet[]> {
    if (!this.initialized) return [];

    try {
      // Get followed user IDs
      const following = await this.getFollowing(userId);
      if (following.length === 0) return [];

      const { data, error } = await supabase
        .from('aio_user_bets')
        .select('*')
        .in('user_id', following)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Error fetching trade feed', { error: error.message });
        return [];
      }

      return data as UserBet[];
    } catch (error) {
      log.error('Error in getFollowedTradesFeed', { error: String(error) });
      return [];
    }
  }
}

// Export singleton instance
export const userPortfolioService = new UserPortfolioService();
export default userPortfolioService;
