/**
 * Polymarket Trading Service
 * Executes trades on the Polymarket CLOB (Central Limit Order Book).
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('PolymarketTrading');
const CLOB_API = 'https://clob.polymarket.com';

interface ExchangeCredentials {
  id: string;
  user_id: string;
  exchange: string;
  encrypted_credentials: Record<string, string>;
}

interface OrderResult {
  orderId: string;
  status: string;
  fills: Array<{ price: string; size: string }>;
}

interface OrderStatus {
  id: string;
  status: string;
  side: string;
  size: string;
  price: string;
  filled: string;
}

class PolymarketTradingService {
  async loadCredentials(userId: string): Promise<Record<string, string>> {
    try {
      const { data, error } = await serviceClient
        .from('aio_exchange_credentials')
        .select('encrypted_credentials')
        .eq('user_id', userId)
        .eq('exchange', 'polymarket')
        .single();

      if (error) {
        throw new Error(`No Polymarket credentials found for user: ${error.message}`);
      }

      return (data as ExchangeCredentials).encrypted_credentials;
    } catch (error) {
      log.error('Failed to load Polymarket credentials', { userId, error: String(error) });
      throw error;
    }
  }

  async placeMarketOrder(
    userId: string,
    conditionId: string,
    outcome: string,
    amountUsdc: number
  ): Promise<OrderResult> {
    try {
      log.info('Placing Polymarket order', { userId, conditionId, outcome, amountUsdc });

      const credentials = await this.loadCredentials(userId);

      // Build order parameters
      const side = outcome.toUpperCase() === 'YES' ? 'BUY' : 'SELL';
      const orderParams = {
        market: conditionId,
        side,
        size: amountUsdc.toString(),
        type: 'market',
      };

      // NOTE: Full EIP-712 signing requires @polymarket/clob-client.
      // This is a simplified REST call; production would use the CLOB client SDK.
      const response = await fetch(`${CLOB_API}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'POLY-ADDRESS': credentials.address || '',
          'POLY-SIGNATURE': credentials.apiSecret || '',
          'POLY-TIMESTAMP': Date.now().toString(),
          'POLY-NONCE': '0',
        },
        body: JSON.stringify(orderParams),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Polymarket order failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      log.info('Polymarket order placed', { userId, orderId: result.orderID || result.id });

      return {
        orderId: result.orderID || result.id || '',
        status: result.status || 'submitted',
        fills: result.fills || [],
      };
    } catch (error) {
      log.error('Failed to place Polymarket order', {
        userId,
        conditionId,
        outcome,
        error: String(error),
      });
      throw error;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    try {
      const response = await fetch(`${CLOB_API}/order/${orderId}`);

      if (!response.ok) {
        throw new Error(`Failed to get order status: ${response.status}`);
      }

      return response.json() as Promise<OrderStatus>;
    } catch (error) {
      log.error('Failed to get order status', { orderId, error: String(error) });
      throw error;
    }
  }

  async getUserPositions(
    userId: string,
    conditionId?: string
  ): Promise<Record<string, unknown>[]> {
    try {
      const credentials = await this.loadCredentials(userId);

      // Placeholder - needs auth headers for CLOB positions endpoint
      const params = new URLSearchParams();
      if (conditionId) {
        params.set('market', conditionId);
      }

      const response = await fetch(`${CLOB_API}/positions?${params.toString()}`, {
        headers: {
          'POLY-ADDRESS': credentials.address || '',
          'POLY-SIGNATURE': credentials.apiSecret || '',
          'POLY-TIMESTAMP': Date.now().toString(),
          'POLY-NONCE': '0',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get positions: ${response.status}`);
      }

      return response.json() as Promise<Record<string, unknown>[]>;
    } catch (error) {
      log.error('Failed to get user positions', { userId, error: String(error) });
      throw error;
    }
  }
}

export const polymarketTradingService = new PolymarketTradingService();
export default polymarketTradingService;
