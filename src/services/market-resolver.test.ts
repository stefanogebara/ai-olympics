/**
 * Tests for market-resolver.ts
 *
 * Covers: checkResolutions (Kalshi + Polymarket paths, paper bets, error handling),
 * manualResolve, and the startResolver/stopResolver lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted() so variables are available when vi.mock() factories
// run (vi.mock calls are hoisted to the top of the file by Vitest).
// ---------------------------------------------------------------------------

const { mockSettleBet, mockGetMarketPolymarket, mockGetMarketKalshi, mockFrom } = vi.hoisted(() => ({
  mockSettleBet: vi.fn().mockResolvedValue(undefined),
  mockGetMarketPolymarket: vi.fn(),
  mockGetMarketKalshi: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('./wallet-service.js', () => ({
  walletService: { settleBet: mockSettleBet },
}));

vi.mock('./polymarket-client.js', () => ({
  polymarketClient: { getMarket: mockGetMarketPolymarket },
}));

vi.mock('./kalshi-client.js', () => ({
  kalshiClient: { getMarket: mockGetMarketKalshi },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { checkResolutions, manualResolve, startResolver, stopResolver } from './market-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a chainable Supabase query mock.
 * Every query method (select, eq, update, insert, neq) returns the same object,
 * and the object is thenable so it can be awaited at any point in the chain.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'update', 'insert', 'neq', 'or', 'in']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.then = (
    resolve: (v: unknown) => unknown,
    _reject: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, _reject);
  return q;
}

/** Configure mockFrom to return different chains per table name. */
function setupFrom(tableMap: Record<string, ReturnType<typeof chain>>) {
  mockFrom.mockImplementation((table: string) => tableMap[table] ?? chain());
}

function makeBet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bet1',
    user_id: 'user1',
    market_id: 'market1',
    market_source: 'kalshi' as const,
    outcome: 'YES',
    amount_cents: 1000,
    ...overrides,
  };
}

function makeKalshiMarket(overrides: Record<string, unknown> = {}) {
  return { status: 'settled', result: 'YES', ...overrides };
}

function makePolymarketMarket(overrides: Record<string, unknown> = {}) {
  return {
    closed: true,
    archived: true,
    outcomePrices: '["0.95","0.05"]',
    outcomes: '["YES","NO"]',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: checkResolutions – Kalshi path
// ---------------------------------------------------------------------------

describe('checkResolutions – Kalshi path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no unresolved bets exist', async () => {
    setupFrom({ aio_real_bets: chain({ data: [], error: null }) });
    await checkResolutions();
    expect(mockGetMarketKalshi).not.toHaveBeenCalled();
  });

  it('skips market when status is not settled', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet()], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ status: 'open' }));
    await checkResolutions();
    expect(mockSettleBet).not.toHaveBeenCalled();
  });

  it('settles winning bet with 2x payout', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet({ outcome: 'YES', amount_cents: 1000 })], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 2000);
  });

  it('settles losing bet with 0 payout', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet({ outcome: 'NO', amount_cents: 1000 })], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 0);
  });

  it('matches outcomes case-insensitively', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet({ outcome: 'yes', amount_cents: 500 })], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 1000);
  });

  it('settles multiple bets on the same market', async () => {
    const bets = [
      makeBet({ id: 'bet1', outcome: 'YES', amount_cents: 100 }),
      makeBet({ id: 'bet2', outcome: 'NO', amount_cents: 200 }),
    ];
    setupFrom({
      aio_real_bets: chain({ data: bets, error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(mockSettleBet).toHaveBeenCalledTimes(2);
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 200);
    expect(mockSettleBet).toHaveBeenCalledWith('bet2', 0);
  });

  it('continues checking other markets when one market fetch throws', async () => {
    const bet1 = makeBet({ id: 'bet1', market_id: 'mkt1' });
    const bet2 = makeBet({ id: 'bet2', market_id: 'mkt2', outcome: 'YES' });
    setupFrom({
      aio_real_bets: chain({ data: [bet1, bet2], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi
      .mockRejectedValueOnce(new Error('API down'))
      .mockResolvedValueOnce(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(mockSettleBet).toHaveBeenCalledWith('bet2', 2000);
  });

  it('does not throw when the initial DB fetch fails', async () => {
    setupFrom({ aio_real_bets: chain({ data: null, error: new Error('DB error') }) });
    await expect(checkResolutions()).resolves.toBeUndefined();
  });

  it('inserts a resolution record after settling', async () => {
    const resChain = chain({ data: null, error: null });
    setupFrom({
      aio_real_bets: chain({ data: [makeBet()], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: resChain,
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(resChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ market_id: 'market1', winning_outcome: 'YES' })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: checkResolutions – Polymarket path
// ---------------------------------------------------------------------------

describe('checkResolutions – Polymarket path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips market when not yet closed', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet({ market_source: 'polymarket' })], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketPolymarket.mockResolvedValue(makePolymarketMarket({ closed: false }));
    await checkResolutions();
    expect(mockSettleBet).not.toHaveBeenCalled();
  });

  it('determines winner by highest price in outcomePrices', async () => {
    setupFrom({
      aio_real_bets: chain({
        data: [makeBet({ market_source: 'polymarket', outcome: 'YES', amount_cents: 200 })],
        error: null,
      }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketPolymarket.mockResolvedValue(makePolymarketMarket());
    await checkResolutions();
    // YES has price 0.95 (highest) so bet wins: 200 * 2 = 400
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 400);
  });

  it('settles loser with 0 when a different outcome wins', async () => {
    setupFrom({
      aio_real_bets: chain({
        data: [makeBet({ market_source: 'polymarket', outcome: 'NO', amount_cents: 300 })],
        error: null,
      }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketPolymarket.mockResolvedValue(makePolymarketMarket());
    await checkResolutions();
    // YES wins, bet is on NO: payout = 0
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 0);
  });

  it('handles malformed outcomePrices JSON without throwing', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [makeBet({ market_source: 'polymarket' })], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketPolymarket.mockResolvedValue(
      makePolymarketMarket({ outcomePrices: 'not-valid-json' })
    );
    await expect(checkResolutions()).resolves.toBeUndefined();
    expect(mockSettleBet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: paper bet settlement (exercised via checkResolutions)
// ---------------------------------------------------------------------------

describe('paper bet settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates winning paper bet with win resolution and nonzero payout', async () => {
    const paperBet = { id: 'pb1', user_id: 'u1', outcome: 'YES', amount: 10, shares: 15 };
    const userBetsChain = chain({ data: [paperBet], error: null });
    setupFrom({
      aio_real_bets: chain({ data: [makeBet()], error: null }),
      aio_user_bets: userBetsChain,
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(userBetsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved: true, resolution: 'win', payout: 15, profit: 5 })
    );
  });

  it('updates losing paper bet with loss resolution and zero payout', async () => {
    const paperBet = { id: 'pb1', user_id: 'u1', outcome: 'NO', amount: 10, shares: 15 };
    const userBetsChain = chain({ data: [paperBet], error: null });
    setupFrom({
      aio_real_bets: chain({ data: [makeBet()], error: null }),
      aio_user_bets: userBetsChain,
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    mockGetMarketKalshi.mockResolvedValue(makeKalshiMarket({ result: 'YES' }));
    await checkResolutions();
    expect(userBetsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved: true, resolution: 'loss', payout: 0, profit: -10 })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: manualResolve
// ---------------------------------------------------------------------------

describe('manualResolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settles winning bet with 2x payout', async () => {
    const bet = { id: 'bet1', user_id: 'u1', outcome: 'YES', amount_cents: 500 };
    setupFrom({
      aio_real_bets: chain({ data: [bet], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    await manualResolve('mkt1', 'kalshi', 'YES');
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 1000);
  });

  it('settles losing bet with 0 payout', async () => {
    const bet = { id: 'bet1', user_id: 'u1', outcome: 'NO', amount_cents: 500 };
    setupFrom({
      aio_real_bets: chain({ data: [bet], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    await manualResolve('mkt1', 'kalshi', 'YES');
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 0);
  });

  it('resolves outcomes case-insensitively', async () => {
    const bet = { id: 'bet1', user_id: 'u1', outcome: 'yes', amount_cents: 200 };
    setupFrom({
      aio_real_bets: chain({ data: [bet], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    await manualResolve('mkt1', 'kalshi', 'YES');
    expect(mockSettleBet).toHaveBeenCalledWith('bet1', 400);
  });

  it('returns without error when no bets are found', async () => {
    setupFrom({
      aio_real_bets: chain({ data: [], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: chain({ data: null, error: null }),
    });
    await expect(manualResolve('mkt1', 'kalshi', 'YES')).resolves.toBeUndefined();
    expect(mockSettleBet).not.toHaveBeenCalled();
  });

  it('throws when the DB fetch fails', async () => {
    setupFrom({ aio_real_bets: chain({ data: null, error: new Error('DB down') }) });
    await expect(manualResolve('mkt1', 'kalshi', 'YES')).rejects.toThrow();
  });

  it('records resolution with manual flag set to true', async () => {
    const bet = { id: 'bet1', user_id: 'u1', outcome: 'YES', amount_cents: 100 };
    const resChain = chain({ data: null, error: null });
    setupFrom({
      aio_real_bets: chain({ data: [bet], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: resChain,
    });
    await manualResolve('mkt1', 'kalshi', 'YES');
    expect(resChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ manual: true, winning_outcome: 'YES' })
    );
  });

  it('stores the winning outcome as uppercase in the resolution record', async () => {
    const bet = { id: 'bet1', user_id: 'u1', outcome: 'yes', amount_cents: 100 };
    const resChain = chain({ data: null, error: null });
    setupFrom({
      aio_real_bets: chain({ data: [bet], error: null }),
      aio_user_bets: chain({ data: [], error: null }),
      aio_market_resolutions: resChain,
    });
    await manualResolve('mkt1', 'kalshi', 'yes');
    expect(resChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ winning_outcome: 'YES' })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: resolver lifecycle
// ---------------------------------------------------------------------------

describe('resolver lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopResolver(); // ensure clean state
    setupFrom({ aio_real_bets: chain({ data: [], error: null }) });
  });

  afterEach(() => {
    stopResolver();
    vi.useRealTimers();
  });

  it('startResolver calls checkResolutions immediately on start', () => {
    startResolver();
    // mockFrom is called synchronously before the first await inside checkResolutions
    expect(mockFrom).toHaveBeenCalledWith('aio_real_bets');
  });

  it('stopResolver prevents the interval from firing again', () => {
    startResolver();
    const callCount = mockFrom.mock.calls.length;
    stopResolver();
    vi.advanceTimersByTime(10 * 60 * 1000); // advance past two intervals
    expect(mockFrom.mock.calls.length).toBe(callCount);
  });

  it('calling startResolver twice does not throw or double-start', () => {
    expect(() => {
      startResolver();
      startResolver();
    }).not.toThrow();
  });
});
