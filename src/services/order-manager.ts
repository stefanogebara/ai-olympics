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
        log.error('Exchange order failed, unlocking funds', { error: String(exchangeError) });
        await walletService.unlockForBet(wallet.id, amountCents);
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

      // Cancel on the exchange
      if (realBet.market_source === 'kalshi') {
        await kalshiTradingService.cancelOrder(userId, realBet.exchange_order_id);
      }
      // Note: Polymarket market orders can't be cancelled once filled

      // Update bet status
      const { error: updateError } = await serviceClient
        .from('aio_real_bets')
        .update({ status: 'cancelled' })
        .eq('id', betId);

      if (updateError) {
        throw updateError;
      }

      log.info('Order cancelled', { betId });
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
   * @param competitionId - The competition to settle
   * @param rankings - Array of { userId, rank } ordered by placement
   */
  async settleCompetition(
    competitionId: string,
    rankings: { userId: string; rank: number }[]
  ): Promise<{ payouts: { userId: string; amount: number }[] }> {
    try {
      log.info('Settling competition', { competitionId, rankings: rankings.length });

      // Fetch competition details including platform fee
      const { data: competition, error: compError } = await serviceClient
        .from('aio_competitions')
        .select('id, prize_pool, entry_fee, platform_fee_pct, stake_mode')
        .eq('id', competitionId)
        .single();

      if (compError || !competition) {
        throw new Error(`Competition not found: ${competitionId}`);
      }

      // Sandbox competitions have no payouts
      if (competition.stake_mode === 'sandbox') {
        log.info('Sandbox competition, no payouts', { competitionId });
        return { payouts: [] };
      }

      const grossPool = competition.prize_pool || 0;
      const feePct = competition.platform_fee_pct ?? 10;
      const netPool = grossPool * (1 - feePct / 100);

      log.info('Prize pool breakdown', { grossPool, feePct, netPool });

      // Simple distribution: 1st gets 60%, 2nd gets 30%, 3rd gets 10%
      const splits = [0.6, 0.3, 0.1];
      const payouts: { userId: string; amount: number }[] = [];

      for (let i = 0; i < Math.min(rankings.length, splits.length); i++) {
        const amount = Math.floor(netPool * splits[i]);
        if (amount > 0) {
          const wallet = await walletService.getOrCreateWallet(rankings[i].userId);
          // Credit wallet with prize payout
          await serviceClient
            .from('aio_transactions')
            .insert({
              wallet_id: wallet.id,
              type: 'prize',
              amount_cents: amount,
              status: 'completed',
              provider: 'internal',
              provider_ref: competitionId,
            });

          // Also update wallet balance
          await serviceClient
            .from('aio_wallets')
            .update({ balance_cents: wallet.balance_cents + amount })
            .eq('id', wallet.id);

          payouts.push({ userId: rankings[i].userId, amount });
        }
      }

      log.info('Competition settled', { competitionId, payouts });
      return { payouts };
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
