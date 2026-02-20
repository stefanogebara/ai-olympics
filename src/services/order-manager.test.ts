import { describe, it, expect, vi, beforeEach } from 'vitest';

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
// Integration-style tests for the OrderManager class with mocked dependencies
// ============================================================================

// Helper to build chainable Supabase query mocks.
// Each call to `buildChain(finalValue)` returns an object where every method
// returns `this`, except the terminal call resolves with `finalValue`.
function buildChain(finalValue: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'eq', 'in', 'order', 'limit', 'single'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal: single() resolves with the finalValue
  chain.single = vi.fn().mockResolvedValue(finalValue);
  // For queries that don't end with single(), the chain itself acts as the resolved value
  // We make the chain thenable so `await chain.from(...).insert(...).select()` works
  chain.then = (resolve: (v: any) => void) => resolve(finalValue);
  return chain;
}

// We need per-table chain tracking for settleCompetition which hits multiple tables
function buildTableRouter(tableMap: Record<string, ReturnType<typeof buildChain>>) {
  return {
    from: vi.fn((table: string) => {
      if (tableMap[table]) return tableMap[table];
      // Default fallback chain
      return buildChain({ data: null, error: null });
    }),
  };
}

// Mock external dependencies
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(() => buildChain({ data: null, error: null })),
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

vi.mock('../shared/config.js', () => ({
  config: {},
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Dynamic imports after mocks are set up
const { orderManager } = await import('./order-manager.js');
const { serviceClient } = await import('../shared/utils/supabase.js');
const { walletService } = await import('./wallet-service.js');
const { polymarketTradingService } = await import('./polymarket-trading.js');
const { kalshiTradingService } = await import('./kalshi-trading.js');

// ============================================================================
// placeOrder()
// ============================================================================
describe('OrderManager.placeOrder', () => {
  const userId = 'user-1';
  const walletId = 'wallet-1';
  const marketId = 'market-abc';
  const mockWallet = { id: walletId, user_id: userId, balance_cents: 50000, pending_cents: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(walletService.getOrCreateWallet).mockResolvedValue(mockWallet as any);
    vi.mocked(walletService.lockForBet).mockResolvedValue(undefined);
    vi.mocked(walletService.unlockForBet).mockResolvedValue(undefined);
  });

  it('places a Polymarket order and returns the bet record', async () => {
    vi.mocked(polymarketTradingService.placeMarketOrder).mockResolvedValue({
      orderId: 'poly-order-1',
      status: 'filled',
      fills: [],
    });

    const insertedBet = {
      id: 'bet-1',
      user_id: userId,
      wallet_id: walletId,
      market_id: marketId,
      market_source: 'polymarket',
      outcome: 'Yes',
      amount_cents: 1000,
      exchange_order_id: 'poly-order-1',
      status: 'filled',
      resolved: false,
      payout_cents: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chain = buildChain({ data: insertedBet, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.placeOrder(userId, marketId, 'polymarket', 'Yes', 1000);

    expect(walletService.getOrCreateWallet).toHaveBeenCalledWith(userId);
    expect(walletService.lockForBet).toHaveBeenCalledWith(walletId, 1000);
    expect(polymarketTradingService.placeMarketOrder).toHaveBeenCalledWith(userId, marketId, 'Yes', 10);
    expect(result.id).toBe('bet-1');
    expect(result.exchange_order_id).toBe('poly-order-1');
    expect(result.status).toBe('filled');
  });

  it('places a Kalshi order with correct side and quantity', async () => {
    vi.mocked(kalshiTradingService.placeOrder).mockResolvedValue({
      order: {
        order_id: 'kalshi-order-1',
        ticker: 'TICKER',
        status: 'filled',
        side: 'yes',
        type: 'market',
        count: 5,
        created_time: '2026-01-01T00:00:00Z',
      },
    } as any);

    const insertedBet = {
      id: 'bet-2',
      user_id: userId,
      wallet_id: walletId,
      market_id: marketId,
      market_source: 'kalshi',
      outcome: 'Yes',
      amount_cents: 500,
      exchange_order_id: 'kalshi-order-1',
      status: 'filled',
      resolved: false,
      payout_cents: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const chain = buildChain({ data: insertedBet, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.placeOrder(userId, marketId, 'kalshi', 'Yes', 500);

    expect(kalshiTradingService.placeOrder).toHaveBeenCalledWith(userId, marketId, 'yes', 5, 50);
    expect(result.exchange_order_id).toBe('kalshi-order-1');
  });

  it('unlocks funds when Polymarket exchange order fails', async () => {
    vi.mocked(polymarketTradingService.placeMarketOrder).mockRejectedValue(
      new Error('Exchange unavailable')
    );

    await expect(
      orderManager.placeOrder(userId, marketId, 'polymarket', 'Yes', 2000)
    ).rejects.toThrow('Exchange unavailable');

    expect(walletService.lockForBet).toHaveBeenCalledWith(walletId, 2000);
    expect(walletService.unlockForBet).toHaveBeenCalledWith(walletId, 2000);
  });

  it('unlocks funds when Kalshi exchange order fails', async () => {
    vi.mocked(kalshiTradingService.placeOrder).mockRejectedValue(
      new Error('Kalshi API error')
    );

    await expect(
      orderManager.placeOrder(userId, marketId, 'kalshi', 'No', 3000)
    ).rejects.toThrow('Kalshi API error');

    expect(walletService.unlockForBet).toHaveBeenCalledWith(walletId, 3000);
  });

  it('throws when DB insert fails after successful exchange order', async () => {
    vi.mocked(polymarketTradingService.placeMarketOrder).mockResolvedValue({
      orderId: 'poly-order-ok',
      status: 'filled',
      fills: [],
    });

    const chain = buildChain({ data: null, error: { message: 'DB insert failed' } });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    await expect(
      orderManager.placeOrder(userId, marketId, 'polymarket', 'Yes', 1000)
    ).rejects.toEqual({ message: 'DB insert failed' });
  });

  it('converts Kalshi outcome to lowercase side', async () => {
    vi.mocked(kalshiTradingService.placeOrder).mockResolvedValue({
      order: {
        order_id: 'kalshi-no-1',
        ticker: 'T',
        status: 'filled',
        side: 'no',
        type: 'market',
        count: 2,
        created_time: '2026-01-01T00:00:00Z',
      },
    } as any);

    const chain = buildChain({
      data: {
        id: 'bet-no',
        user_id: userId,
        wallet_id: walletId,
        market_id: marketId,
        market_source: 'kalshi',
        outcome: 'NO',
        amount_cents: 200,
        exchange_order_id: 'kalshi-no-1',
        status: 'filled',
        resolved: false,
        payout_cents: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    await orderManager.placeOrder(userId, marketId, 'kalshi', 'NO', 200);

    // Kalshi side should be lowercased
    expect(kalshiTradingService.placeOrder).toHaveBeenCalledWith(
      userId,
      marketId,
      'no',
      2, // Math.floor(200 / 100)
      50
    );
  });
});

// ============================================================================
// cancelOrder()
// ============================================================================
describe('OrderManager.cancelOrder', () => {
  const userId = 'user-1';
  const betId = 'bet-cancel-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a Kalshi order and updates bet status', async () => {
    const existingBet = {
      id: betId,
      user_id: userId,
      wallet_id: 'w-1',
      market_id: 'market-1',
      market_source: 'kalshi',
      outcome: 'Yes',
      amount_cents: 1000,
      exchange_order_id: 'kalshi-ex-1',
      status: 'filled',
      resolved: false,
      payout_cents: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    // First call: fetch the bet, Second call: update status
    const fetchChain = buildChain({ data: existingBet, error: null });
    const updateChain = buildChain({ data: null, error: null });

    let callCount = 0;
    vi.mocked(serviceClient.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fetchChain as any;
      return updateChain as any;
    });

    vi.mocked(kalshiTradingService.cancelOrder).mockResolvedValue(undefined as any);

    await orderManager.cancelOrder(userId, betId);

    expect(kalshiTradingService.cancelOrder).toHaveBeenCalledWith(userId, 'kalshi-ex-1');
  });

  it('does not call exchange cancel for Polymarket orders (already filled)', async () => {
    const polyBet = {
      id: betId,
      user_id: userId,
      wallet_id: 'w-1',
      market_id: 'market-2',
      market_source: 'polymarket',
      outcome: 'No',
      amount_cents: 500,
      exchange_order_id: 'poly-ex-1',
      status: 'filled',
      resolved: false,
      payout_cents: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    const fetchChain = buildChain({ data: polyBet, error: null });
    const updateChain = buildChain({ data: null, error: null });

    let callCount = 0;
    vi.mocked(serviceClient.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fetchChain as any;
      return updateChain as any;
    });

    await orderManager.cancelOrder(userId, betId);

    // Polymarket filled orders can't be cancelled on exchange
    expect(kalshiTradingService.cancelOrder).not.toHaveBeenCalled();
  });

  it('throws when bet is not found', async () => {
    const fetchChain = buildChain({ data: null, error: { message: 'not found' } });
    vi.mocked(serviceClient.from).mockReturnValue(fetchChain as any);

    await expect(orderManager.cancelOrder(userId, 'nonexistent')).rejects.toThrow(
      'Bet not found: nonexistent'
    );
  });

  it('throws when DB update fails', async () => {
    const existingBet = {
      id: betId,
      user_id: userId,
      market_source: 'polymarket',
      exchange_order_id: 'poly-ex-2',
    };

    const fetchChain = buildChain({ data: existingBet, error: null });
    const updateChain = buildChain({ data: null, error: { message: 'update failed' } });

    let callCount = 0;
    vi.mocked(serviceClient.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fetchChain as any;
      return updateChain as any;
    });

    await expect(orderManager.cancelOrder(userId, betId)).rejects.toEqual({
      message: 'update failed',
    });
  });
});

// ============================================================================
// getOpenOrders()
// ============================================================================
describe('OrderManager.getOpenOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns open orders for a user', async () => {
    const openBets = [
      { id: 'b-1', user_id: 'user-1', status: 'filled', market_id: 'm-1' },
      { id: 'b-2', user_id: 'user-1', status: 'pending', market_id: 'm-2' },
    ];

    const chain = buildChain({ data: openBets, error: null });
    // Override: getOpenOrders does not call .single(), so make the chain resolve via .order()
    chain.order = vi.fn().mockResolvedValue({ data: openBets, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.getOpenOrders('user-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b-1');
    expect(result[1].id).toBe('b-2');
  });

  it('returns empty array when no open orders exist', async () => {
    const chain = buildChain({ data: [], error: null });
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.getOpenOrders('user-no-orders');

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    const chain = buildChain({ data: null, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.getOpenOrders('user-null');

    expect(result).toEqual([]);
  });

  it('throws when DB query fails', async () => {
    const chain = buildChain({ data: null, error: { message: 'query failed' } });
    chain.order = vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    await expect(orderManager.getOpenOrders('user-err')).rejects.toEqual({
      message: 'query failed',
    });
  });
});

// ============================================================================
// getUserPositions()
// ============================================================================
describe('OrderManager.getUserPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns positions for a user', async () => {
    const positions = [
      { id: 'p-1', user_id: 'user-1', market_id: 'm-1', quantity: 10 },
      { id: 'p-2', user_id: 'user-1', market_id: 'm-2', quantity: 5 },
    ];

    const chain = buildChain({ data: positions, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: positions, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.getUserPositions('user-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('market_id', 'm-1');
  });

  it('returns empty array when no positions exist', async () => {
    const chain = buildChain({ data: null, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    const result = await orderManager.getUserPositions('user-empty');

    expect(result).toEqual([]);
  });

  it('throws when DB query fails', async () => {
    const chain = buildChain({ data: null, error: { message: 'positions query failed' } });
    chain.order = vi.fn().mockResolvedValue({ data: null, error: { message: 'positions query failed' } });
    vi.mocked(serviceClient.from).mockReturnValue(chain as any);

    await expect(orderManager.getUserPositions('user-err')).rejects.toEqual({
      message: 'positions query failed',
    });
  });
});

// ============================================================================
// settleCompetition()
// ============================================================================
describe('OrderManager.settleCompetition', () => {
  const competitionId = 'comp-1';
  const rankings = [
    { userId: 'user-1st', rank: 1 },
    { userId: 'user-2nd', rank: 2 },
    { userId: 'user-3rd', rank: 3 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settles competition with 60/30/10 split after 10% fee', async () => {
    const competition = {
      id: competitionId,
      prize_pool: 10000,
      entry_fee: 100,
      platform_fee_pct: 10,
      stake_mode: 'real',
    };

    // Track which tables are queried
    const wallets: Record<string, any> = {
      'user-1st': { id: 'w-1st', user_id: 'user-1st', balance_cents: 0 },
      'user-2nd': { id: 'w-2nd', user_id: 'user-2nd', balance_cents: 0 },
      'user-3rd': { id: 'w-3rd', user_id: 'user-3rd', balance_cents: 0 },
    };

    vi.mocked(walletService.getOrCreateWallet).mockImplementation(async (userId: string) => {
      return wallets[userId] as any;
    });

    // Build a from() mock that handles multiple tables
    const compChain = buildChain({ data: competition, error: null });
    const txChain = buildChain({ data: null, error: null });
    const walletUpdateChain = buildChain({ data: null, error: null });

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_competitions') return compChain as any;
      if (table === 'aio_transactions') return txChain as any;
      if (table === 'aio_wallets') return walletUpdateChain as any;
      return buildChain({ data: null, error: null }) as any;
    });

    const result = await orderManager.settleCompetition(competitionId, rankings);

    // netPool = 10000 * 0.9 = 9000
    // 1st: floor(9000 * 0.6) = 5400
    // 2nd: floor(9000 * 0.3) = 2700
    // 3rd: floor(9000 * 0.1) = 900
    expect(result.payouts).toHaveLength(3);
    expect(result.payouts[0]).toEqual({ userId: 'user-1st', amount: 5400 });
    expect(result.payouts[1]).toEqual({ userId: 'user-2nd', amount: 2700 });
    expect(result.payouts[2]).toEqual({ userId: 'user-3rd', amount: 900 });
  });

  it('returns empty payouts for sandbox competitions', async () => {
    const sandboxComp = {
      id: competitionId,
      prize_pool: 5000,
      entry_fee: 50,
      platform_fee_pct: 10,
      stake_mode: 'sandbox',
    };

    const compChain = buildChain({ data: sandboxComp, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(compChain as any);

    const result = await orderManager.settleCompetition(competitionId, rankings);

    expect(result.payouts).toEqual([]);
    // walletService should NOT have been called for sandbox
    expect(walletService.getOrCreateWallet).not.toHaveBeenCalled();
  });

  it('throws when competition is not found', async () => {
    const compChain = buildChain({ data: null, error: { message: 'not found' } });
    vi.mocked(serviceClient.from).mockReturnValue(compChain as any);

    await expect(
      orderManager.settleCompetition('nonexistent', rankings)
    ).rejects.toThrow('Competition not found: nonexistent');
  });

  it('uses default 10% fee when platform_fee_pct is null', async () => {
    const competition = {
      id: competitionId,
      prize_pool: 10000,
      entry_fee: 100,
      platform_fee_pct: null,
      stake_mode: 'real',
    };

    const wallets: Record<string, any> = {
      'user-1st': { id: 'w-1st', user_id: 'user-1st', balance_cents: 0 },
      'user-2nd': { id: 'w-2nd', user_id: 'user-2nd', balance_cents: 0 },
      'user-3rd': { id: 'w-3rd', user_id: 'user-3rd', balance_cents: 0 },
    };

    vi.mocked(walletService.getOrCreateWallet).mockImplementation(async (userId: string) => {
      return wallets[userId] as any;
    });

    const compChain = buildChain({ data: competition, error: null });
    const otherChain = buildChain({ data: null, error: null });

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_competitions') return compChain as any;
      return otherChain as any;
    });

    const result = await orderManager.settleCompetition(competitionId, rankings);

    // With null fee, defaults to 10%: netPool = 9000
    expect(result.payouts[0].amount).toBe(5400);
  });

  it('handles competition with zero prize pool', async () => {
    const competition = {
      id: competitionId,
      prize_pool: 0,
      entry_fee: 0,
      platform_fee_pct: 10,
      stake_mode: 'real',
    };

    const compChain = buildChain({ data: competition, error: null });
    vi.mocked(serviceClient.from).mockReturnValue(compChain as any);

    const result = await orderManager.settleCompetition(competitionId, rankings);

    expect(result.payouts).toEqual([]);
    expect(walletService.getOrCreateWallet).not.toHaveBeenCalled();
  });

  it('only pays top 3 even with more rankings', async () => {
    const manyRankings = [
      { userId: 'u-1', rank: 1 },
      { userId: 'u-2', rank: 2 },
      { userId: 'u-3', rank: 3 },
      { userId: 'u-4', rank: 4 },
      { userId: 'u-5', rank: 5 },
    ];

    const competition = {
      id: competitionId,
      prize_pool: 10000,
      entry_fee: 100,
      platform_fee_pct: 10,
      stake_mode: 'real',
    };

    vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
      id: 'w-generic',
      user_id: 'u-generic',
      balance_cents: 0,
    } as any);

    const compChain = buildChain({ data: competition, error: null });
    const otherChain = buildChain({ data: null, error: null });

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_competitions') return compChain as any;
      return otherChain as any;
    });

    const result = await orderManager.settleCompetition(competitionId, manyRankings);

    // Only 3 payouts (splits array has 3 entries)
    expect(result.payouts).toHaveLength(3);
    expect(result.payouts.map(p => p.userId)).toEqual(['u-1', 'u-2', 'u-3']);
  });

  it('records a transaction for each payout', async () => {
    const competition = {
      id: competitionId,
      prize_pool: 10000,
      entry_fee: 100,
      platform_fee_pct: 0,
      stake_mode: 'real',
    };

    vi.mocked(walletService.getOrCreateWallet).mockResolvedValue({
      id: 'w-track',
      user_id: 'u-track',
      balance_cents: 1000,
    } as any);

    const insertCalls: any[] = [];
    const txChain = buildChain({ data: null, error: null });
    txChain.insert = vi.fn((data: any) => {
      insertCalls.push(data);
      return txChain;
    });

    const compChain = buildChain({ data: competition, error: null });
    const walletUpdateChain = buildChain({ data: null, error: null });

    vi.mocked(serviceClient.from).mockImplementation((table: string) => {
      if (table === 'aio_competitions') return compChain as any;
      if (table === 'aio_transactions') return txChain as any;
      if (table === 'aio_wallets') return walletUpdateChain as any;
      return buildChain({ data: null, error: null }) as any;
    });

    await orderManager.settleCompetition(competitionId, rankings);

    // 3 transaction inserts (one per ranked user)
    expect(insertCalls).toHaveLength(3);
    // Each transaction should have type 'prize' and provider_ref = competitionId
    for (const call of insertCalls) {
      expect(call.type).toBe('prize');
      expect(call.provider_ref).toBe(competitionId);
      expect(call.status).toBe('completed');
      expect(call.provider).toBe('internal');
    }
  });
});
