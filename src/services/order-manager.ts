/**
 * Order Manager
 * Unified order routing across Polymarket and Kalshi exchanges.
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { walletService } from './wallet-service.js';
import { polymarketTradingService } from './polymarket-trading.js';
import { kalshiTradingService } from './kalshi-trading.js';
import { config } from '../shared/config.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('OrderManager');

interface RealBet {
  id: string;
  user_id: string;
  wallet_id: string;
  market_id: string;
  market_source: 'polymarket' | 'kalshi';
  outcome: string;
  amount_cents: number;
  exchange_order_id: string;
  status: string;
  resolved: boolean;
  payout_cents: number | null;
  created_at: string;
}

class OrderManager {
  async placeOrder(
    userId: string,
    marketId: string,
    marketSource: 'polymarket' | 'kalshi',
    outcome: string,
    amountCents: number
  ): Promise<RealBet> {
    try {
      log.info('Placing order', { userId, marketId, marketSource, outcome, amountCents });

      // Get or create wallet and lock funds
      const wallet = await walletService.getOrCreateWallet(userId);
      await walletService.lockForBet(wallet.id, amountCents);

      let exchangeOrderId: string;

      try {
        if (marketSource === 'polymarket') {
          const result = await polymarketTradingService.placeMarketOrder(
            userId,
            marketId,
            outcome,
            amountCents / 100
          );
          exchangeOrderId = result.orderId;
        } else {
          const side = outcome.toLowerCase() as 'yes' | 'no';
          const quantity = Math.floor(amountCents / 100);
          const result = await kalshiTradingService.placeOrder(
            userId,
            marketId,
            side,
            quantity,
            50 // default limit price
          );
          exchangeOrderId = result.order.order_id;
        }
      } catch (exchangeError) {
        // Exchange order failed — reverse the lock so the user's balance is restored
        log.error('Exchange order failed, unlocking funds', { error: String(exchangeError) });
        try {
          await walletService.unlockForBet(wallet.id, amountCents);
        } catch (unlockError) {
          // Log but don't mask the original exchange error
          log.error('CRITICAL: Failed to unlock funds after exchange failure — manual reconciliation needed', {
            walletId: wallet.id,
            amountCents,
            unlockError: String(unlockError),
          });
        }
        throw exchangeError;
      }

      // Insert bet record
      const { data: bet, error } = await serviceClient
        .from('aio_real_bets')
        .insert({
          user_id: userId,
          wallet_id: wallet.id,
          market_id: marketId,
          market_source: marketSource,
          outcome,
          amount_cents: amountCents,
          exchange_order_id: exchangeOrderId,
          status: 'filled',
          resolved: false,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      log.info('Order placed successfully', { betId: bet.id, exchangeOrderId });

      return bet as RealBet;
    } catch (error) {
      log.error('Failed to place order', {
        userId,
        marketId,
        marketSource,
        error: String(error),
      });
      throw error;
    }
  }

  async cancelOrder(userId: string, betId: string): Promise<void> {
    try {
      log.info('Cancelling order', { userId, betId });

      const { data: bet, error: fetchError } = await serviceClient
        .from('aio_real_bets')
        .select('*')
        .eq('id', betId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !bet) {
        throw new Error(`Bet not found: ${betId}`);
      }

      const realBet = bet as RealBet;

      // Only cancel bets that still have locked funds
      const cancellableStatuses = ['pending', 'filled'];
      if (!cancellableStatuses.includes(realBet.status)) {
        throw new Error(`Cannot cancel bet with status '${realBet.status}'`);
      }

      // Cancel on the exchange
      if (realBet.market_source === 'kalshi') {
        await kalshiTradingService.cancelOrder(userId, realBet.exchange_order_id);
      }
      // Polymarket market orders can't be cancelled once filled on the exchange —
      // we still cancel the record and release the lock so funds are not frozen.

      // Update bet status first, then release the lock
      const { error: updateError } = await serviceClient
        .from('aio_real_bets')
        .update({ status: 'cancelled' })
        .eq('id', betId);

      if (updateError) {
        throw updateError;
      }

      // Restore locked funds to user's available balance
      await walletService.unlockForBet(realBet.wallet_id, realBet.amount_cents);

      log.info('Order cancelled and funds unlocked', { betId, amountCents: realBet.amount_cents });
    } catch (error) {
      log.error('Failed to cancel order', { userId, betId, error: String(error) });
      throw error;
    }
  }

  async getOpenOrders(userId: string): Promise<RealBet[]> {
    try {
      const { data, error } = await serviceClient
        .from('aio_real_bets')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'filled', 'partially_filled'])
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as RealBet[];
    } catch (error) {
      log.error('Failed to get open orders', { userId, error: String(error) });
      throw error;
    }
  }

  /**
   * Settle a competition and distribute winnings with platform fee deduction.
   * Distributes net pool 60% / 30% / 10% to rank 1 / 2 / 3.
   * Idempotent: uses creditPrizeWinning which generates deterministic idempotency keys.
   * Skips participants without a userId (house/bot agents).
   *
   * @param competitionId - The competition to settle
   * @param rankedParticipants - Array of { userId?, rank } — userId is optional (house agents have none)
   */
  async settleCompetition(
    competitionId: string,
    rankedParticipants: Array<{ userId?: string; rank: number }>
  ): Promise<void> {
    try {
      log.info('Settling competition', { competitionId, participants: rankedParticipants.length });

      // Fetch competition details including gross prize pool and platform fee
      const { data: competition, error: compError } = await serviceClient
        .from('aio_competitions')
        .select('id, prize_pool, platform_fee_pct')
        .eq('id', competitionId)
        .single();

      if (compError || !competition) {
        throw new Error(`Competition not found: ${competitionId}`);
      }

      const grossPool: number = competition.prize_pool || 0;

      // No money to distribute — exit early
      if (grossPool === 0) {
        log.info('Prize pool is zero, skipping settlement', { competitionId });
        return;
      }

      const feePct: number = competition.platform_fee_pct ?? 10;
      const platformFee = Math.floor(grossPool * feePct / 100);
      const netPool = grossPool - platformFee;

      log.info('Prize pool breakdown', { grossPool, feePct, platformFee, netPool });

      // Record platform fee on the competition row
      await serviceClient
        .from('aio_competitions')
        .update({ platform_fee_collected_cents: platformFee })
        .eq('id', competitionId);

      // Distribution: rank 1 → 60%, rank 2 → 30%, rank 3 → 10% of net pool
      const splits: Record<number, number> = { 1: 0.60, 2: 0.30, 3: 0.10 };

      for (const [rankStr, splitPct] of Object.entries(splits)) {
        const rank = Number(rankStr);

        // Find the participant at this rank who has a real user (not a house agent)
        const participant = rankedParticipants.find(p => p.rank === rank && p.userId);
        if (!participant || !participant.userId) {
          log.info('No eligible participant for rank, skipping', { competitionId, rank });
          continue;
        }

        const payout = Math.floor(netPool * splitPct);
        if (payout === 0) {
          log.info('Payout rounds to zero, skipping', { competitionId, rank });
          continue;
        }

        await walletService.creditPrizeWinning(participant.userId, competitionId, payout, rank);
        log.info('Prize credited', { competitionId, userId: participant.userId, rank, payout });
      }

      log.info('Competition settlement complete', { competitionId, grossPool, netPool, platformFee });
    } catch (error) {
      log.error('Failed to settle competition', { competitionId, error: String(error) });
      throw error;
    }
  }

  async getUserPositions(userId: string): Promise<Record<string, unknown>[]> {
    try {
      const { data, error } = await serviceClient
        .from('aio_real_positions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as Record<string, unknown>[];
    } catch (error) {
      log.error('Failed to get user positions', { userId, error: String(error) });
      throw error;
    }
  }
}

export const orderManager = new OrderManager();
export default orderManager;
