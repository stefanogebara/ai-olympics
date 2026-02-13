/**
 * Wallet Service
 * Core orchestrator for all money operations: deposits, withdrawals, bet locking, settlement.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('WalletService');

interface Wallet {
  id: string;
  user_id: string;
  balance_cents: number;
  pending_cents: number;
  created_at: string;
  updated_at: string;
}

interface WalletBalance {
  balance_cents: number;
  pending_cents: number;
  available_cents: number;
}

interface Transaction {
  id: string;
  wallet_id: string;
  type: string;
  amount_cents: number;
  provider: string;
  provider_ref: string;
  status: string;
  created_at: string;
}

class WalletService {
  /**
   * Returns user-scoped client if provided, otherwise service client.
   * User-scoped clients respect RLS for defense-in-depth.
   * Financial write operations (deposit, withdraw, settle) always use serviceClient.
   */
  private db(client?: SupabaseClient): SupabaseClient {
    return client || serviceClient;
  }

  async getOrCreateWallet(userId: string, client?: SupabaseClient): Promise<Wallet> {
    try {
      const db = this.db(client);
      const { data: existing, error: fetchError } = await db
        .from('aio_wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existing) {
        return existing as Wallet;
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      log.info('Creating new wallet', { userId });

      // Wallet creation uses serviceClient (no INSERT RLS policy for wallets)
      const { data: wallet, error: insertError } = await serviceClient
        .from('aio_wallets')
        .insert({ user_id: userId, balance_cents: 0, pending_cents: 0 })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return wallet as Wallet;
    } catch (error) {
      log.error('Failed to get or create wallet', { userId, error: String(error) });
      throw error;
    }
  }

  async getBalance(userId: string, client?: SupabaseClient): Promise<WalletBalance> {
    try {
      const wallet = await this.getOrCreateWallet(userId, client);
      return {
        balance_cents: wallet.balance_cents,
        pending_cents: wallet.pending_cents,
        available_cents: wallet.balance_cents - wallet.pending_cents,
      };
    } catch (error) {
      log.error('Failed to get balance', { userId, error: String(error) });
      throw error;
    }
  }

  async deposit(
    userId: string,
    amountCents: number,
    provider: string,
    providerRef: string,
    idempotencyKey: string
  ): Promise<void> {
    try {
      log.info('Processing deposit', { userId, amountCents, provider, providerRef });

      const wallet = await this.getOrCreateWallet(userId);

      const { error } = await serviceClient.rpc('credit_wallet', {
        p_wallet_id: wallet.id,
        p_amount_cents: amountCents,
        p_provider: provider,
        p_provider_ref: providerRef,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        throw error;
      }

      log.info('Deposit successful', { userId, amountCents, provider });
    } catch (error) {
      log.error('Deposit failed', { userId, amountCents, error: String(error) });
      throw error;
    }
  }

  async withdraw(
    userId: string,
    amountCents: number,
    provider: string,
    providerRef: string,
    idempotencyKey: string
  ): Promise<void> {
    try {
      log.info('Processing withdrawal', { userId, amountCents, provider });

      const wallet = await this.getOrCreateWallet(userId);

      const { error } = await serviceClient.rpc('debit_wallet_for_withdrawal', {
        p_wallet_id: wallet.id,
        p_amount_cents: amountCents,
        p_provider: provider,
        p_provider_ref: providerRef,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        throw error;
      }

      log.info('Withdrawal successful', { userId, amountCents, provider });
    } catch (error) {
      log.error('Withdrawal failed', { userId, amountCents, error: String(error) });
      throw error;
    }
  }

  async lockForBet(walletId: string, amountCents: number): Promise<void> {
    try {
      log.info('Locking funds for bet', { walletId, amountCents });

      const { error } = await serviceClient.rpc('lock_funds_for_bet', {
        p_wallet_id: walletId,
        p_amount_cents: amountCents,
      });

      if (error) {
        throw error;
      }

      log.info('Funds locked', { walletId, amountCents });
    } catch (error) {
      log.error('Failed to lock funds', { walletId, amountCents, error: String(error) });
      throw error;
    }
  }

  async settleBet(betId: string, payoutCents: number): Promise<void> {
    try {
      log.info('Settling bet', { betId, payoutCents });

      const { error } = await serviceClient.rpc('settle_real_bet', {
        p_bet_id: betId,
        p_payout_cents: payoutCents,
      });

      if (error) {
        throw error;
      }

      log.info('Bet settled', { betId, payoutCents });
    } catch (error) {
      log.error('Failed to settle bet', { betId, payoutCents, error: String(error) });
      throw error;
    }
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
    client?: SupabaseClient
  ): Promise<{ transactions: Transaction[]; total: number }> {
    try {
      const wallet = await this.getOrCreateWallet(userId, client);
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.db(client)
        .from('aio_transactions')
        .select('*', { count: 'exact' })
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return {
        transactions: (data || []) as Transaction[],
        total: count || 0,
      };
    } catch (error) {
      log.error('Failed to get transaction history', { userId, error: String(error) });
      throw error;
    }
  }
}

export const walletService = new WalletService();
export default walletService;
