/**
 * Tests for user-portfolio-service.ts
 *
 * Covers: constructor/isConfigured, getOrCreatePortfolio, getPortfolio,
 * getLimits, placeBet (validation + CPMM + position update), getBets,
 * getPositions, getStats, getLeaderboard, followTrader, unfollowTrader,
 * getFollowing, getFollowers, isFollowing, getFollowedTradesFeed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted so they run before module imports)
// ---------------------------------------------------------------------------

const { mockFrom, mockGetMarket } = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  return {
    mockFrom: vi.fn(),
    mockGetMarket: vi.fn(),
  };
});

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));
vi.mock('./market-service.js', () => ({
  marketService: { getMarket: mockGetMarket },
}));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { userPortfolioService, UserPortfolioService } from './user-portfolio-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: Record<string, unknown> = { data: null, error: null, count: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of [
    'select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert',
    'delete', 'range', 'gt', 'gte', 'in', 'not',
  ]) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  // Allow direct await (queries that don't end with .single())
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makePortfolio(overrides: Record<string, unknown> = {}) {
  return {
    id: 'portfolio-1',
    user_id: 'user-1',
    virtual_balance: 1000,
    starting_balance: 1000,
    total_profit: 50,
    total_bets: 5,
    winning_bets: 3,
    total_volume: 500,
    best_streak: 3,
    current_streak: 1,
    brier_score: 0.25,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'market-1',
    source: 'polymarket',
    question: 'Will X happen?',
    category: 'sports',
    outcomes: [
      { name: 'YES', price: 60, probability: 0.6 },
      { name: 'NO', price: 40, probability: 0.4 },
    ],
    closeTime: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks(); // restore any vi.spyOn() originals
  vi.resetAllMocks();   // clear vi.fn() state and implementations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (userPortfolioService as any).initialized = true;
  mockFrom.mockReturnValue(chain());
});

// ---------------------------------------------------------------------------
// constructor / isConfigured
// ---------------------------------------------------------------------------

describe('constructor / isConfigured', () => {
  it('isConfigured() returns true when env vars are set', () => {
    const svc = new UserPortfolioService();
    expect(svc.isConfigured()).toBe(true);
  });

  it('isConfigured() returns false when env vars are absent', () => {
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;

    const svc = new UserPortfolioService();
    expect(svc.isConfigured()).toBe(false);

    process.env.SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// getOrCreatePortfolio
// ---------------------------------------------------------------------------

describe('getOrCreatePortfolio', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getOrCreatePortfolio('user-1')).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns existing portfolio when found', async () => {
    const portfolio = makePortfolio();
    mockFrom.mockReturnValueOnce(chain({ data: portfolio, error: null }));

    const result = await userPortfolioService.getOrCreatePortfolio('user-1');

    expect(result).toEqual(portfolio);
    expect(mockFrom).toHaveBeenCalledWith('aio_user_portfolios');
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('creates and returns new portfolio when existing not found', async () => {
    const newPortfolio = makePortfolio({ id: 'portfolio-new' });
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }))  // get: not found
      .mockReturnValueOnce(chain({ data: newPortfolio, error: null }));          // insert: success

    const result = await userPortfolioService.getOrCreatePortfolio('user-1');

    expect(result).toEqual(newPortfolio);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('returns null when create fails', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'insert failed' } }));

    expect(await userPortfolioService.getOrCreatePortfolio('user-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPortfolio
// ---------------------------------------------------------------------------

describe('getPortfolio', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getPortfolio('user-1')).toBeNull();
  });

  it('returns portfolio on success', async () => {
    const portfolio = makePortfolio();
    mockFrom.mockReturnValueOnce(chain({ data: portfolio, error: null }));

    const result = await userPortfolioService.getPortfolio('user-1');

    expect(result).toEqual(portfolio);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('falls back to getOrCreatePortfolio on PGRST116', async () => {
    const portfolio = makePortfolio();
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })) // getPortfolio: miss
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }))                       // getOrCreate: get miss
      .mockReturnValueOnce(chain({ data: portfolio, error: null }));                                  // getOrCreate: insert

    const result = await userPortfolioService.getPortfolio('user-1');

    expect(result).toEqual(portfolio);
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it('returns null on other DB errors', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { code: '500', message: 'server error' } }));
    expect(await userPortfolioService.getPortfolio('user-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLimits
// ---------------------------------------------------------------------------

describe('getLimits', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getLimits('user-1')).toBeNull();
  });

  it('returns limits with correct calculations for balance=1000', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio({ virtual_balance: 1000 }), error: null })) // getOrCreatePortfolio
      .mockReturnValueOnce(chain({ data: null, error: null, count: 3 }))  // getDailyBetCount
      .mockReturnValueOnce(chain({ data: null, error: null, count: 5 })); // getOpenPositionCount

    const result = await userPortfolioService.getLimits('user-1');

    expect(result).not.toBeNull();
    expect(result!.balance).toBe(1000);
    expect(result!.maxBetPercent).toBe(10);
    expect(result!.maxBet).toBe(100);        // floor(1000 * 10 / 100)
    expect(result!.minBet).toBe(1);
    expect(result!.dailyBetsUsed).toBe(3);
    expect(result!.dailyBetsMax).toBe(10);
    expect(result!.openPositions).toBe(5);
    expect(result!.maxPositions).toBe(20);
    expect(result!.closeTimeBufferMs).toBe(3600000);
  });

  it('returns null when portfolio cannot be retrieved', async () => {
    // getOrCreatePortfolio: get fails, create also fails → returns null portfolio
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'insert failed' } }));

    expect(await userPortfolioService.getLimits('user-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// placeBet
// ---------------------------------------------------------------------------

describe('placeBet', () => {
  /**
   * Sets up the full happy-path mock sequence (7 from() calls).
   * Call order:
   *   0 getOrCreatePortfolio   from('aio_user_portfolios')  .select().eq().single()
   *   1 getDailyBetCount       from('aio_user_bets')         .select().eq().gte()
   *   2 getOpenPositionCount   from('aio_user_positions')    .select().eq().gt()
   *   3 insert bet             from('aio_user_bets')         .insert().select().single()
   *   4 updatePosition check   from('aio_user_positions')    .select().eq().eq().eq().single()
   *   5 updatePosition insert  from('aio_user_positions')    .insert()
   *   6 getPortfolio           from('aio_user_portfolios')   .select().eq().single()
   */
  function setupHappyPath(
    portfolio = makePortfolio(),
    market = makeMarket(),
    dailyCount = 0,
    positionCount = 0,
  ) {
    const bet = { id: 'bet-1', user_id: 'user-1', outcome: 'YES', amount: 100 };
    mockGetMarket.mockResolvedValue(market);
    mockFrom
      .mockReturnValueOnce(chain({ data: portfolio, error: null }))                   // getOrCreatePortfolio
      .mockReturnValueOnce(chain({ data: null, error: null, count: dailyCount }))     // getDailyBetCount
      .mockReturnValueOnce(chain({ data: null, error: null, count: positionCount }))  // getOpenPositionCount
      .mockReturnValueOnce(chain({ data: bet, error: null }))                         // insert bet
      .mockReturnValueOnce(chain({ data: null, error: null }))                        // updatePosition: check (no existing)
      .mockReturnValueOnce(chain({ data: null, error: null }))                        // updatePosition: insert new
      .mockReturnValueOnce(chain({ data: { ...portfolio, virtual_balance: 900 }, error: null })); // getPortfolio
    return bet;
  }

  it('returns error when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);
    expect(result).toEqual({ success: false, error: 'Supabase not configured' });
  });

  it('returns error when portfolio cannot be retrieved', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'create failed' } }));

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);
    expect(result).toEqual({ success: false, error: 'Failed to get portfolio' });
  });

  it('returns error when amount is below minimum (M$1)', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makePortfolio(), error: null }));
    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 0);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Minimum bet');
  });

  it('returns error when amount exceeds 10% of balance', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makePortfolio({ virtual_balance: 1000 }), error: null }));
    // maxBet = 1000 * 10/100 = 100; bet 101 > 100
    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 101);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Max bet');
  });

  it('returns error when daily bet limit is reached', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 10 })); // 10 = MAX_DAILY_BETS

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Daily bet limit');
  });

  it('returns error when max open positions reached', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 20 })); // 20 = MAX_OPEN_POSITIONS

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result.success).toBe(false);
    expect(result.error).toContain('20 open positions');
  });

  it('returns error when market is not found', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }));
    mockGetMarket.mockResolvedValue(null);

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result).toEqual({ success: false, error: 'Market not found' });
  });

  it('returns error when market closes within 1 hour', async () => {
    const closeSoon = Date.now() + 30 * 60 * 1000; // 30 min from now
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }));
    mockGetMarket.mockResolvedValue(makeMarket({ closeTime: closeSoon }));

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result.success).toBe(false);
    expect(result.error).toContain('closes within 1 hour');
  });

  it('does not block when market closes more than 1 hour away', async () => {
    const farFuture = Date.now() + 3 * 60 * 60 * 1000; // 3 hours from now
    setupHappyPath(makePortfolio(), makeMarket({ closeTime: farFuture }));

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result.success).toBe(true);
  });

  it('does not block when closeTime is null', async () => {
    setupHappyPath(makePortfolio(), makeMarket({ closeTime: null }));
    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result.success).toBe(true);
  });

  it('returns error when bet insert fails', async () => {
    mockGetMarket.mockResolvedValue(makeMarket());
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'constraint violation' } }));

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 50);
    expect(result).toEqual({ success: false, error: 'Failed to place bet' });
  });

  it('returns success with bet and updated balance', async () => {
    const bet = setupHappyPath();
    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);

    expect(result.success).toBe(true);
    expect(result.bet).toMatchObject(bet);
    expect(result.newBalance).toBe(900);
  });

  it('normalises outcome to uppercase (yes → YES)', async () => {
    setupHappyPath();
    await userPortfolioService.placeBet('user-1', 'market-1', 'yes', 100);

    // Call index 3 = insert bet
    const betInsertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(betInsertArg.outcome).toBe('YES');
  });

  it('calculates shares using CPMM formula (YES bet)', async () => {
    // pool { YES: 60, NO: 40 }, amount=100
    // k=2400; newNo=140; newYes=2400/140≈17.143; shares=60-17.143+100≈142.857
    setupHappyPath();
    await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);

    const betInsertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(betInsertArg.shares).toBeCloseTo(142.857, 2);
  });

  it('uses probability_at_bet from YES outcome probability', async () => {
    setupHappyPath();
    await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);

    const betInsertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(betInsertArg.probability_at_bet).toBe(0.6);
  });

  it('updates existing position rather than creating new one', async () => {
    const existingPosition = { id: 'pos-1', shares: 10, total_cost: 50 };
    const bet = { id: 'bet-1', user_id: 'user-1', outcome: 'YES', amount: 100 };
    mockGetMarket.mockResolvedValue(makeMarket());
    mockFrom
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }))             // getOrCreatePortfolio
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))              // getDailyBetCount
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))              // getOpenPositionCount
      .mockReturnValueOnce(chain({ data: bet, error: null }))                         // insert bet
      .mockReturnValueOnce(chain({ data: existingPosition, error: null }))            // updatePosition: existing found
      .mockReturnValueOnce(chain({ data: null, error: null }))                        // updatePosition: .update().eq()
      .mockReturnValueOnce(chain({ data: makePortfolio(), error: null }));            // getPortfolio

    const result = await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);
    expect(result.success).toBe(true);

    // Call index 5 = the update position call
    const updateQ = mockFrom.mock.results[5].value;
    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({
      shares: expect.any(Number),
      average_cost: expect.any(Number),
      total_cost: expect.any(Number),
    }));
  });

  it('stores market metadata on the bet', async () => {
    setupHappyPath();
    await userPortfolioService.placeBet('user-1', 'market-1', 'YES', 100);

    const betInsertArg = mockFrom.mock.results[3].value.insert.mock.calls[0][0];
    expect(betInsertArg.market_source).toBe('polymarket');
    expect(betInsertArg.market_question).toBe('Will X happen?');
    expect(betInsertArg.market_category).toBe('sports');
    expect(betInsertArg.portfolio_id).toBe('portfolio-1');
  });
});

// ---------------------------------------------------------------------------
// getBets
// ---------------------------------------------------------------------------

describe('getBets', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getBets('user-1')).toEqual([]);
  });

  it('returns paginated bets ordered by created_at desc', async () => {
    const bets = [{ id: 'bet-1' }, { id: 'bet-2' }];
    mockFrom.mockReturnValueOnce(chain({ data: bets, error: null }));

    const result = await userPortfolioService.getBets('user-1', 20, 40);

    expect(result).toEqual(bets);
    const q = mockFrom.mock.results[0].value;
    expect(q.range).toHaveBeenCalledWith(40, 59); // offset=40, offset+limit-1=59
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.getBets('user-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPositions
// ---------------------------------------------------------------------------

describe('getPositions', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getPositions('user-1')).toEqual([]);
  });

  it('returns positions with shares > 0 ordered by updated_at', async () => {
    const positions = [{ id: 'pos-1', shares: 10 }];
    mockFrom.mockReturnValueOnce(chain({ data: positions, error: null }));

    const result = await userPortfolioService.getPositions('user-1');

    expect(result).toEqual(positions);
    const q = mockFrom.mock.results[0].value;
    expect(q.gt).toHaveBeenCalledWith('shares', 0);
    expect(q.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.getPositions('user-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getStats('user-1')).toBeNull();
  });

  it('returns null when portfolio not found', async () => {
    // Non-PGRST116 error so getPortfolio returns null directly
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { code: '500', message: 'server error' } }));
    expect(await userPortfolioService.getStats('user-1')).toBeNull();
  });

  it('returns stats with correct profit/win rate calculations', async () => {
    const portfolio = makePortfolio({
      starting_balance: 1000,
      total_profit: 100,
      total_bets: 10,
      winning_bets: 7,
      best_streak: 4,
      current_streak: 2,
      total_volume: 800,
      brier_score: 0.2,
    });
    mockFrom
      .mockReturnValueOnce(chain({ data: portfolio, error: null }))        // getPortfolio
      .mockReturnValueOnce(chain({ data: null, error: null, count: 5 }))   // follower count
      .mockReturnValueOnce(chain({ data: null, error: null, count: 3 }));  // following count

    const result = await userPortfolioService.getStats('user-1');

    expect(result).not.toBeNull();
    expect(result!.totalProfit).toBe(100);
    expect(result!.profitPercent).toBe(10);  // 100 / 1000 * 100
    expect(result!.totalBets).toBe(10);
    expect(result!.winningBets).toBe(7);
    expect(result!.winRate).toBe(70);         // 7 / 10 * 100
    expect(result!.brierScore).toBe(0.2);
    expect(result!.bestStreak).toBe(4);
    expect(result!.currentStreak).toBe(2);
    expect(result!.totalVolume).toBe(800);
    expect(result!.followerCount).toBe(5);
    expect(result!.followingCount).toBe(3);
  });

  it('returns winRate=0 and profitPercent=0 when no bets and starting_balance=0', async () => {
    const portfolio = makePortfolio({ total_bets: 0, winning_bets: 0, starting_balance: 0, total_profit: 0 });
    mockFrom
      .mockReturnValueOnce(chain({ data: portfolio, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: null, error: null, count: 0 }));

    const result = await userPortfolioService.getStats('user-1');

    expect(result!.winRate).toBe(0);
    expect(result!.profitPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getLeaderboard
// ---------------------------------------------------------------------------

describe('getLeaderboard', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getLeaderboard()).toEqual([]);
  });

  it('returns leaderboard entries with pagination', async () => {
    const entries = [{ portfolio_id: 'p1', username: 'alice' }];
    mockFrom.mockReturnValueOnce(chain({ data: entries, error: null }));

    const result = await userPortfolioService.getLeaderboard(10, 20);

    expect(result).toEqual(entries);
    expect(mockFrom).toHaveBeenCalledWith('aio_user_prediction_leaderboard');
    const q = mockFrom.mock.results[0].value;
    expect(q.range).toHaveBeenCalledWith(20, 29); // offset=20, offset+limit-1=29
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.getLeaderboard()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// followTrader
// ---------------------------------------------------------------------------

describe('followTrader', () => {
  it('returns false when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.followTrader('user-1', 'user-2')).toBe(false);
  });

  it('returns false when trying to follow yourself', async () => {
    const result = await userPortfolioService.followTrader('user-1', 'user-1');
    expect(result).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns true and inserts row on success', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await userPortfolioService.followTrader('user-1', 'user-2');

    expect(result).toBe(true);
    const q = mockFrom.mock.results[0].value;
    expect(q.insert).toHaveBeenCalledWith({ follower_id: 'user-1', followed_id: 'user-2' });
  });

  it('returns true when already following (error code 23505)', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { code: '23505' } }));
    expect(await userPortfolioService.followTrader('user-1', 'user-2')).toBe(true);
  });

  it('returns false on other DB errors', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { code: '500', message: 'err' } }));
    expect(await userPortfolioService.followTrader('user-1', 'user-2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unfollowTrader
// ---------------------------------------------------------------------------

describe('unfollowTrader', () => {
  it('returns false when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.unfollowTrader('user-1', 'user-2')).toBe(false);
  });

  it('returns true and deletes the follow row', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await userPortfolioService.unfollowTrader('user-1', 'user-2');

    expect(result).toBe(true);
    const q = mockFrom.mock.results[0].value;
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('follower_id', 'user-1');
    expect(q.eq).toHaveBeenCalledWith('followed_id', 'user-2');
  });

  it('returns false on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.unfollowTrader('user-1', 'user-2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFollowing
// ---------------------------------------------------------------------------

describe('getFollowing', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getFollowing('user-1')).toEqual([]);
  });

  it('returns followed user IDs', async () => {
    const data = [{ followed_id: 'user-2' }, { followed_id: 'user-3' }];
    mockFrom.mockReturnValueOnce(chain({ data, error: null }));

    const result = await userPortfolioService.getFollowing('user-1');

    expect(result).toEqual(['user-2', 'user-3']);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('follower_id', 'user-1');
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.getFollowing('user-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFollowers
// ---------------------------------------------------------------------------

describe('getFollowers', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getFollowers('user-1')).toEqual([]);
  });

  it('returns follower IDs', async () => {
    const data = [{ follower_id: 'user-3' }, { follower_id: 'user-4' }];
    mockFrom.mockReturnValueOnce(chain({ data, error: null }));

    const result = await userPortfolioService.getFollowers('user-1');

    expect(result).toEqual(['user-3', 'user-4']);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('followed_id', 'user-1');
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await userPortfolioService.getFollowers('user-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isFollowing
// ---------------------------------------------------------------------------

describe('isFollowing', () => {
  it('returns false when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.isFollowing('user-1', 'user-2')).toBe(false);
  });

  it('returns true when a follow row exists', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: 'rel-1' }, error: null }));
    expect(await userPortfolioService.isFollowing('user-1', 'user-2')).toBe(true);
  });

  it('returns false when no follow row found', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { code: 'PGRST116' } }));
    expect(await userPortfolioService.isFollowing('user-1', 'user-2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFollowedTradesFeed
// ---------------------------------------------------------------------------

describe('getFollowedTradesFeed', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (userPortfolioService as any).initialized = false;
    expect(await userPortfolioService.getFollowedTradesFeed('user-1')).toEqual([]);
  });

  it('returns empty array when not following anyone', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], error: null })); // getFollowing: empty list
    expect(await userPortfolioService.getFollowedTradesFeed('user-1')).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1); // no second query
  });

  it('returns trades from followed users', async () => {
    const following = [{ followed_id: 'user-2' }, { followed_id: 'user-3' }];
    const bets = [{ id: 'bet-1', user_id: 'user-2' }, { id: 'bet-2', user_id: 'user-3' }];
    mockFrom
      .mockReturnValueOnce(chain({ data: following, error: null })) // getFollowing
      .mockReturnValueOnce(chain({ data: bets, error: null }));     // main query

    const result = await userPortfolioService.getFollowedTradesFeed('user-1', 20);

    expect(result).toEqual(bets);
    const q = mockFrom.mock.results[1].value;
    expect(q.in).toHaveBeenCalledWith('user_id', ['user-2', 'user-3']);
    expect(q.limit).toHaveBeenCalledWith(20);
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns empty array on DB error fetching feed', async () => {
    const following = [{ followed_id: 'user-2' }];
    mockFrom
      .mockReturnValueOnce(chain({ data: following, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));

    expect(await userPortfolioService.getFollowedTradesFeed('user-1')).toEqual([]);
  });
});
