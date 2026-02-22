import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock dependencies used in unlock path tests
// ============================================================================

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('./wallet-service.js', () => ({
  walletService: {
    getOrCreateWallet: vi.fn(),
    lockForBet: vi.fn(),
    unlockForBet: vi.fn(),
  },
}));

vi.mock('./polymarket-trading.js', () => ({
  polymarketTradingService: {
    placeMarketOrder: vi.fn(),
  },
}));

vi.mock('./kalshi-trading.js', () => ({
  kalshiTradingService: {
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

// ============================================================================
// Test the platform fee and payout distribution logic
// These are pure math calculations extracted from settleCompetition()
// ============================================================================

describe('Order Manager - Payout Calculations', () => {
  // Pure math from settleCompetition:
  // netPool = grossPool * (1 - feePct / 100)
  // splits = [0.6, 0.3, 0.1]
  // payout_i = floor(netPool * splits[i])

  function calculatePayouts(
    grossPool: number,
    feePct: number,
    rankingCount: number
  ): { netPool: number; payouts: number[] } {
    const netPool = grossPool * (1 - feePct / 100);
    const splits = [0.6, 0.3, 0.1];
    const payouts: number[] = [];

    for (let i = 0; i < Math.min(rankingCount, splits.length); i++) {
      const amount = Math.floor(netPool * splits[i]);
      if (amount > 0) {
        payouts.push(amount);
      }
    }

    return { netPool, payouts };
  }

  describe('platform fee deduction', () => {
    it('deducts 10% default platform fee', () => {
      const { netPool } = calculatePayouts(10000, 10, 3);
      expect(netPool).toBe(9000);
    });

    it('deducts 0% fee', () => {
      const { netPool } = calculatePayouts(10000, 0, 3);
      expect(netPool).toBe(10000);
    });

    it('deducts 100% fee (edge case)', () => {
      const { netPool } = calculatePayouts(10000, 100, 3);
      expect(netPool).toBe(0);
    });

    it('handles fractional fee percentages', () => {
      const { netPool } = calculatePayouts(10000, 7.5, 3);
      expect(netPool).toBe(9250);
    });
  });

  describe('prize distribution', () => {
    it('distributes 60/30/10 split for 3+ players', () => {
      const { payouts } = calculatePayouts(10000, 10, 4);
      // netPool = 9000
      expect(payouts).toEqual([5400, 2700, 900]);
    });

    it('distributes to 2 players (only 1st and 2nd get prizes)', () => {
      const { payouts } = calculatePayouts(10000, 10, 2);
      // netPool = 9000
      expect(payouts).toEqual([5400, 2700]);
    });

    it('distributes to 1 player (only 1st gets prize)', () => {
      const { payouts } = calculatePayouts(10000, 10, 1);
      expect(payouts).toEqual([5400]);
    });

    it('floors amounts (no fractional cents)', () => {
      // 3333 * 0.9 = 2999.7 -> splits: 1799.82 -> 1799
      const { payouts } = calculatePayouts(3333, 10, 3);
      payouts.forEach(p => {
        expect(p).toBe(Math.floor(p));
      });
    });

    it('returns empty payouts for zero prize pool', () => {
      const { payouts } = calculatePayouts(0, 10, 3);
      expect(payouts).toEqual([]);
    });

    it('total payouts never exceed net pool', () => {
      const testCases = [
        { gross: 10000, fee: 10, players: 4 },
        { gross: 1, fee: 0, players: 3 },
        { gross: 99999, fee: 15, players: 8 },
        { gross: 50, fee: 5, players: 2 },
      ];

      for (const tc of testCases) {
        const { netPool, payouts } = calculatePayouts(tc.gross, tc.fee, tc.players);
        const totalPaid = payouts.reduce((sum, p) => sum + p, 0);
        expect(totalPaid).toBeLessThanOrEqual(netPool);
      }
    });

    it('1st place always gets the most', () => {
      const { payouts } = calculatePayouts(10000, 10, 3);
      expect(payouts[0]).toBeGreaterThan(payouts[1]);
      expect(payouts[1]).toBeGreaterThan(payouts[2]);
    });
  });
});

// ============================================================================
// unlock_funds_for_bet — funds released on exchange failure and cancellation
// ============================================================================

describe('Order Manager - Fund Unlock Paths', () => {
  // Import mocked modules lazily so vi.mock() is applied first
  let orderManager: Awaited<ReturnType<typeof import('./order-manager.js').default.placeOrder>> extends never
    ? never
    : (typeof import('./order-manager.js'))['orderManager'];
  let walletService: typeof import('./wallet-service.js')['walletService'];
  let polymarketTradingService: typeof import('./polymarket-trading.js')['polymarketTradingService'];
  let kalshiTradingService: typeof import('./kalshi-trading.js')['kalshiTradingService'];
  let serviceClient: typeof import('../shared/utils/supabase.js')['serviceClient'];

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ orderManager } = await import('./order-manager.js'));
    ({ walletService } = await import('./wallet-service.js'));
    ({ polymarketTradingService } = await import('./polymarket-trading.js'));
    ({ kalshiTradingService } = await import('./kalshi-trading.js'));
    ({ serviceClient } = await import('../shared/utils/supabase.js'));
  });

  describe('placeOrder — exchange failure unlocks funds', () => {
    it('calls unlockForBet when Polymarket order throws', async () => {
      vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
        id: 'wallet-1',
        user_id: 'user-1',
        balance_cents: 5000,
        pending_cents: 0,
        created_at: '',
        updated_at: '',
      });
      vi.mocked(walletService.lockForBet).mockResolvedValue(undefined);
      vi.mocked(walletService.unlockForBet).mockResolvedValue(undefined);
      vi.mocked(polymarketTradingService.placeMarketOrder).mockRejectedValue(
        new Error('Exchange timeout')
      );

      await expect(
        orderManager.placeOrder('user-1', 'market-1', 'polymarket', 'YES', 1000)
      ).rejects.toThrow('Exchange timeout');

      expect(walletService.lockForBet).toHaveBeenCalledWith('wallet-1', 1000);
      expect(walletService.unlockForBet).toHaveBeenCalledWith('wallet-1', 1000);
    });

    it('calls unlockForBet when Kalshi order throws', async () => {
      vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
        id: 'wallet-2',
        user_id: 'user-2',
        balance_cents: 2000,
        pending_cents: 0,
        created_at: '',
        updated_at: '',
      });
      vi.mocked(walletService.lockForBet).mockResolvedValue(undefined);
      vi.mocked(walletService.unlockForBet).mockResolvedValue(undefined);
      vi.mocked(kalshiTradingService.placeOrder).mockRejectedValue(
        new Error('Kalshi unavailable')
      );

      await expect(
        orderManager.placeOrder('user-2', 'market-2', 'kalshi', 'yes', 500)
      ).rejects.toThrow('Kalshi unavailable');

      expect(walletService.unlockForBet).toHaveBeenCalledWith('wallet-2', 500);
    });

    it('still throws exchange error even if unlockForBet fails', async () => {
      vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
        id: 'wallet-3',
        user_id: 'user-3',
        balance_cents: 1000,
        pending_cents: 0,
        created_at: '',
        updated_at: '',
      });
      vi.mocked(walletService.lockForBet).mockResolvedValue(undefined);
      vi.mocked(walletService.unlockForBet).mockRejectedValue(new Error('Redis down'));
      vi.mocked(polymarketTradingService.placeMarketOrder).mockRejectedValue(
        new Error('Exchange error')
      );

      // Original exchange error must propagate, not the unlock error
      await expect(
        orderManager.placeOrder('user-3', 'market-3', 'polymarket', 'NO', 200)
      ).rejects.toThrow('Exchange error');
    });
  });

  describe('cancelOrder — unlocks funds after cancellation', () => {
    const mockBet = {
      id: 'bet-1',
      user_id: 'user-1',
      wallet_id: 'wallet-1',
      market_id: 'market-1',
      market_source: 'kalshi' as const,
      outcome: 'yes',
      amount_cents: 1000,
      exchange_order_id: 'kal-order-1',
      status: 'filled',
      resolved: false,
      payout_cents: null,
      created_at: '',
    };

    it('calls unlockForBet after successful Kalshi cancellation', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockBet, error: null }),
        update: vi.fn().mockReturnThis(),
      };
      vi.mocked(serviceClient.from).mockReturnValue(mockFrom as never);
      vi.mocked(kalshiTradingService.cancelOrder).mockResolvedValue(undefined as never);
      vi.mocked(walletService.unlockForBet).mockResolvedValue(undefined);

      await orderManager.cancelOrder('user-1', 'bet-1');

      expect(kalshiTradingService.cancelOrder).toHaveBeenCalledWith('user-1', 'kal-order-1');
      expect(walletService.unlockForBet).toHaveBeenCalledWith('wallet-1', 1000);
    });

    it('rejects cancellation of already-resolved bets', async () => {
      const resolvedBet = { ...mockBet, status: 'resolved' };
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: resolvedBet, error: null }),
      };
      vi.mocked(serviceClient.from).mockReturnValue(mockFrom as never);

      await expect(orderManager.cancelOrder('user-1', 'bet-1')).rejects.toThrow(
        "Cannot cancel bet with status 'resolved'"
      );
      expect(walletService.unlockForBet).not.toHaveBeenCalled();
    });

    it('rejects cancellation of already-cancelled bets', async () => {
      const cancelledBet = { ...mockBet, status: 'cancelled' };
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: cancelledBet, error: null }),
      };
      vi.mocked(serviceClient.from).mockReturnValue(mockFrom as never);

      await expect(orderManager.cancelOrder('user-1', 'bet-1')).rejects.toThrow(
        "Cannot cancel bet with status 'cancelled'"
      );
      expect(walletService.unlockForBet).not.toHaveBeenCalled();
    });
  });
});
