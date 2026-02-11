/**
 * Kalshi Trading Service
 * Executes trades on the Kalshi REST API with RSA-PSS authentication.
 */

import { serviceClient } from '../shared/utils/supabase.js';
import { createLogger } from '../shared/utils/logger.js';
import crypto from 'crypto';

const log = createLogger('KalshiTrading');
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

interface KalshiCredentials {
  apiKeyId: string;
  privateKeyPem: string;
}

interface KalshiOrderResponse {
  order: {
    order_id: string;
    ticker: string;
    status: string;
    side: string;
    type: string;
    count: number;
    yes_price?: number;
    no_price?: number;
    created_time: string;
  };
}

interface KalshiPosition {
  ticker: string;
  market_exposure: number;
  resting_orders_count: number;
  total_traded: number;
  realized_pnl: number;
}

class KalshiTradingService {
  async loadCredentials(userId: string): Promise<KalshiCredentials> {
    try {
      const { data, error } = await serviceClient
        .from('aio_exchange_credentials')
        .select('encrypted_credentials')
        .eq('user_id', userId)
        .eq('exchange', 'kalshi')
        .single();

      if (error) {
        throw new Error(`No Kalshi credentials found for user: ${error.message}`);
      }

      const creds = data.encrypted_credentials as unknown as KalshiCredentials;

      if (!creds.apiKeyId || !creds.privateKeyPem) {
        throw new Error('Invalid Kalshi credentials: missing apiKeyId or privateKeyPem');
      }

      return creds;
    } catch (error) {
      log.error('Failed to load Kalshi credentials', { userId, error: String(error) });
      throw error;
    }
  }

  private signRequest(
    method: string,
    path: string,
    timestamp: string,
    privateKeyPem: string
  ): string {
    const message = `${timestamp}${method}${path}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    return sign.sign(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      'base64'
    );
  }

  private buildAuthHeaders(
    method: string,
    path: string,
    credentials: KalshiCredentials
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.signRequest(method, path, timestamp, credentials.privateKeyPem);

    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'KALSHI-ACCESS-KEY': credentials.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
    };
  }

  async placeOrder(
    userId: string,
    ticker: string,
    side: 'yes' | 'no',
    quantity: number,
    limitPrice: number
  ): Promise<KalshiOrderResponse> {
    try {
      log.info('Placing Kalshi order', { userId, ticker, side, quantity, limitPrice });

      const credentials = await this.loadCredentials(userId);
      const path = '/trade-api/v2/portfolio/orders';
      const headers = this.buildAuthHeaders('POST', path, credentials);

      const body: Record<string, unknown> = {
        ticker,
        side,
        type: 'limit',
        count: quantity,
      };

      if (side === 'yes') {
        body.yes_price = limitPrice;
      } else {
        body.no_price = limitPrice;
      }

      const response = await fetch(`${KALSHI_API}/portfolio/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kalshi order failed: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as KalshiOrderResponse;

      log.info('Kalshi order placed', {
        userId,
        orderId: result.order.order_id,
        status: result.order.status,
      });

      return result;
    } catch (error) {
      log.error('Failed to place Kalshi order', {
        userId,
        ticker,
        side,
        error: String(error),
      });
      throw error;
    }
  }

  async getOrderStatus(userId: string, orderId: string): Promise<KalshiOrderResponse> {
    try {
      const credentials = await this.loadCredentials(userId);
      const path = `/trade-api/v2/portfolio/orders/${orderId}`;
      const headers = this.buildAuthHeaders('GET', path, credentials);

      const response = await fetch(`${KALSHI_API}/portfolio/orders/${orderId}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to get order status: ${response.status}`);
      }

      return response.json() as Promise<KalshiOrderResponse>;
    } catch (error) {
      log.error('Failed to get Kalshi order status', { orderId, error: String(error) });
      throw error;
    }
  }

  async getUserPositions(userId: string): Promise<KalshiPosition[]> {
    try {
      const credentials = await this.loadCredentials(userId);
      const path = '/trade-api/v2/portfolio/positions';
      const headers = this.buildAuthHeaders('GET', path, credentials);

      const response = await fetch(`${KALSHI_API}/portfolio/positions`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to get positions: ${response.status}`);
      }

      const data = await response.json();
      return (data.market_positions || []) as KalshiPosition[];
    } catch (error) {
      log.error('Failed to get Kalshi positions', { userId, error: String(error) });
      throw error;
    }
  }

  async cancelOrder(userId: string, orderId: string): Promise<void> {
    try {
      log.info('Cancelling Kalshi order', { userId, orderId });

      const credentials = await this.loadCredentials(userId);
      const path = `/trade-api/v2/portfolio/orders/${orderId}`;
      const headers = this.buildAuthHeaders('DELETE', path, credentials);

      const response = await fetch(`${KALSHI_API}/portfolio/orders/${orderId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel order: ${response.status}`);
      }

      log.info('Kalshi order cancelled', { userId, orderId });
    } catch (error) {
      log.error('Failed to cancel Kalshi order', { userId, orderId, error: String(error) });
      throw error;
    }
  }
}

export const kalshiTradingService = new KalshiTradingService();
export default kalshiTradingService;
