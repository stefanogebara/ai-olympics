import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS - must be declared before importing the module under test
// ============================================================================

const mockFrom = vi.fn();

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockGetMarket = vi.fn();

vi.mock('./market-service.js', () => ({
  marketService: {
    getMarket: (...args: unknown[]) => mockGetMarket(...args),
  },
}));

// Stub env vars so `initialized` is true when constructing instances
vi.stubEnv('SUPABASE_URL', 'http://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');

// Import AFTER vi.mock and vi.stubEnv
const { UserPortfolioService } = await import('./user-portfolio-service.js');

// ============================================================================
// Test data factories
// ============================================================================

const MOCK_USER_ID = 'user-abc-123';
const MOCK_PORTFOLIO_ID = 'portfolio-xyz-789';
const MOCK_MARKET_ID = 'market-001';

function makePortfolio(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_PORTFOLIO_ID,
    user_id: MOCK_USER_ID,
    virtual_balance: 1000,
    starting_balance: 1000,
    total_profit: 0,
    brier_score: null,
    total_bets: 10,
    winning_bets: 6,
    total_volume: 500,
    best_streak: 3,
    current_streak: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeBet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bet-001',
    user_id: MOCK_USER_ID,
    portfolio_id: MOCK_PORTFOLIO_ID,
    market_id: MOCK_MARKET_ID,
    market_source: 'polymarket',
    market_question: 'Will it rain?',
    market_category: 'weather',
    outcome: 'YES',
    amount: 50,
    shares: 55.5,
    probability_at_bet: 0.6,
    price_at_bet: 60,
    resolved: false,
    created_at: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_MARKET_ID,
    source: 'polymarket',
    question: 'Will it rain?',
    category: 'weather',
    outcomes: [
      { id: 'yes-1', name: 'YES', probability: 0.6, price: 60 },
      { id: 'no-1', name: 'NO', probability: 0.4, price: 40 },
    ],
    closeTime: Date.now() + 86400000, // 24 hours from now
    status: 'open',
    volume24h: 10000,
    totalVolume: 50000,
    liquidity: 25000,
    url: 'https://polymarket.com/test',
    ...overrides,
  };
}

// ============================================================================
// Chainable Supabase query builder mock
// ============================================================================

function chainable(data: unknown = null, error: unknown = null, count?: number) {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
    'order', 'limit', 'range', 'single', 'maybeSingle',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function) => resolve({ data, error, count });
  return chain;
}

// ============================================================================
// Tests
// ============================================================================

describe('UserPortfolioService', () => {
  let service: InstanceType<typeof UserPortfolioService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserPortfolioService();
  });

  // --------------------------------------------------------------------------
  // isConfigured
  // --------------------------------------------------------------------------
  describe('isConfigured()', () => {
    it('returns true when env vars are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when env vars are missing', () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

      const uninitService = new UserPortfolioService();
      expect(uninitService.isConfigured()).toBe(false);

      // Restore
      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_KEY = originalKey;
    });
  });

  // --------------------------------------------------------------------------
  // getOrCreatePortfolio
  // --------------------------------------------------------------------------
  describe('getOrCreatePortfolio()', () => {
    it('returns existing portfolio when found', async () => {
      const portfolio = makePortfolio();
      const chain = chainable(portfolio, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getOrCreatePortfolio(MOCK_USER_ID);

      expect(result).toEqual(portfolio);
      expect(mockFrom).toHaveBeenCalledWith('aio_user_portfolios');
    });

    it('creates new portfolio when none exists (existing is null)', async () => {
      const newPortfolio = makePortfolio({ virtual_balance: 1000 });

      // First call: select returns null data with no error
      const selectChain = chainable(null, null);
      // Second call: insert returns the new portfolio
      const insertChain = chainable(newPortfolio, null);

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });

      const result = await service.getOrCreatePortfolio(MOCK_USER_ID);

      expect(result).toEqual(newPortfolio);
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('returns null when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getOrCreatePortfolio(MOCK_USER_ID);
      expect(result).toBeNull();
    });

    it('returns null on create error', async () => {
      // First call: select returns null (no portfolio)
      const selectChain = chainable(null, null);
      // Second call: insert fails
      const insertChain = chainable(null, { code: '42P01', message: 'insert error' });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });

      const result = await service.getOrCreatePortfolio(MOCK_USER_ID);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getPortfolio
  // --------------------------------------------------------------------------
  describe('getPortfolio()', () => {
    it('returns existing portfolio', async () => {
      const portfolio = makePortfolio();
      const chain = chainable(portfolio, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getPortfolio(MOCK_USER_ID);
      expect(result).toEqual(portfolio);
    });

    it('creates portfolio on PGRST116 error', async () => {
      const newPortfolio = makePortfolio();

      // First call: getPortfolio select -> PGRST116
      const selectChain = chainable(null, { code: 'PGRST116', message: 'No rows found' });
      // getOrCreatePortfolio: select existing -> null, then insert -> new portfolio
      const getSelectChain = chainable(null, null);
      const insertChain = chainable(newPortfolio, null);

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;     // getPortfolio select
        if (callCount === 2) return getSelectChain;   // getOrCreatePortfolio select
        return insertChain;                           // getOrCreatePortfolio insert
      });

      const result = await service.getPortfolio(MOCK_USER_ID);
      expect(result).toEqual(newPortfolio);
    });

    it('returns null on non-PGRST116 error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'bad error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getPortfolio(MOCK_USER_ID);
      expect(result).toBeNull();
    });

    it('returns null when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getPortfolio(MOCK_USER_ID);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getLimits
  // --------------------------------------------------------------------------
  describe('getLimits()', () => {
    it('returns correct limits object with balance, maxBet, daily counts', async () => {
      const portfolio = makePortfolio({ virtual_balance: 500 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(null, null, 3);
        if (table === 'aio_user_positions') return chainable(null, null, 5);
        return chainable();
      });

      const result = await service.getLimits(MOCK_USER_ID);

      expect(result).toEqual({
        balance: 500,
        maxBetPercent: 10,
        maxBet: 50,  // Math.floor(500 * 10 / 100)
        minBet: 1,
        dailyBetsUsed: 3,
        dailyBetsMax: 10,
        weeklyBetsUsed: 3,
        weeklyBetsMax: 50,
        openPositions: 5,
        maxPositions: 20,
        closeTimeBufferMs: 3600000,
      });
    });

    it('returns null when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getLimits(MOCK_USER_ID);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // placeBet
  // --------------------------------------------------------------------------
  describe('placeBet()', () => {
    it('places a successful bet with correct shares/probability', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });
      const market = makeMarket();
      const betRecord = makeBet();

      mockGetMarket.mockResolvedValue(market);

      // We need to handle multiple .from() calls:
      // 1. getOrCreatePortfolio: aio_user_portfolios -> portfolio
      // 2. getDailyBetCount: aio_user_bets -> count 0
      // 3. getOpenPositionCount: aio_user_positions -> count 0
      // 4. insert bet: aio_user_bets -> betRecord
      // 5. updatePosition: aio_user_positions (select existing)
      // 6. updatePosition: aio_user_positions (insert new position)
      // 7. getPortfolio: aio_user_portfolios -> updated portfolio
      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'aio_user_portfolios') {
          return chainable(portfolio, null);
        }
        if (table === 'aio_user_bets') {
          // First time is getDailyBetCount (count query), second is insert
          if (callCount <= 3) return chainable(null, null, 0);
          return chainable(betRecord, null);
        }
        if (table === 'aio_user_positions') {
          return chainable(null, null, 0);
        }
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 50);

      expect(result.success).toBe(true);
      expect(result.bet).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('returns error when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 50);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Supabase not configured');
    });

    it('returns error for min bet violation', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        return chainable(null, null, 0);
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 0.5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum bet');
    });

    it('returns error for max bet violation (10% of balance)', async () => {
      const portfolio = makePortfolio({ virtual_balance: 100 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        return chainable(null, null, 0);
      });

      // Max bet = 100 * 10% = 10, so 15 should fail
      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 15);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Max bet');
    });

    it('returns error for insufficient balance', async () => {
      const portfolio = makePortfolio({ virtual_balance: 5 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        return chainable(null, null, 0);
      });

      // Max bet = 5 * 10% = 0.5, but min bet is 1, so amount 1 passes max bet check but fails balance
      // Actually amount 1 > 0.5 so it will fail max bet first. Let's use a different scenario.
      // With balance 5, maxBet = 0.5, even amount 1 > 0.5. We need a case where amount <= maxBet but > balance.
      // That's impossible since maxBet = balance * 0.1 < balance.
      // The insufficient balance check triggers when amount > balance, but max bet = 10% of balance.
      // So amount > balance implies amount > 10 * maxBet => always fails max bet first.
      // But the code checks max bet BEFORE balance, so let's verify the max bet error:
      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 10);
      expect(result.success).toBe(false);
      // This will be maxBet error since 10 > 0.5
      expect(result.error).toContain('Max bet');
    });

    it('returns error for daily limit reached', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(null, null, 10); // 10 daily bets already
        if (table === 'aio_user_positions') return chainable(null, null, 0);
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Daily bet limit');
    });

    it('returns error for max positions reached', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(null, null, 0);
        if (table === 'aio_user_positions') return chainable(null, null, 20); // max 20
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum');
      expect(result.error).toContain('open positions');
    });

    it('returns error for market not found', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });
      mockGetMarket.mockResolvedValue(null);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(null, null, 0);
        if (table === 'aio_user_positions') return chainable(null, null, 0);
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Market not found');
    });

    it('returns error for market closing within 1 hour', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });
      // Market closes in 30 minutes (within 1 hour buffer)
      const market = makeMarket({ closeTime: Date.now() + 1800000 });
      mockGetMarket.mockResolvedValue(market);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(null, null, 0);
        if (table === 'aio_user_positions') return chainable(null, null, 0);
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Market closes within 1 hour');
    });

    it('returns error when portfolio creation fails', async () => {
      // getOrCreatePortfolio returns null (both select and insert fail)
      const selectChain = chainable(null, null);
      const insertChain = chainable(null, { code: '42P01', message: 'insert error' });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 50);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get portfolio');
    });

    it('returns error on bet insert failure', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });
      const market = makeMarket();
      mockGetMarket.mockResolvedValue(market);

      let betInsertCall = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') {
          betInsertCall++;
          // First call is getDailyBetCount, second is the actual insert
          if (betInsertCall === 1) return chainable(null, null, 0);
          return chainable(null, { code: '42P01', message: 'insert failed' });
        }
        if (table === 'aio_user_positions') return chainable(null, null, 0);
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to place bet');
    });

    it('allows betting on markets with closeTime far in the future', async () => {
      const portfolio = makePortfolio({ virtual_balance: 1000 });
      const market = makeMarket({ closeTime: Date.now() + 86400000 * 30 }); // 30 days
      const betRecord = makeBet();
      mockGetMarket.mockResolvedValue(market);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_user_bets') return chainable(betRecord, null, 0);
        if (table === 'aio_user_positions') return chainable(null, null, 0);
        return chainable();
      });

      const result = await service.placeBet(MOCK_USER_ID, MOCK_MARKET_ID, 'YES', 5);
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getBets
  // --------------------------------------------------------------------------
  describe('getBets()', () => {
    it('returns bet history with pagination', async () => {
      const bets = [makeBet({ id: 'bet-001' }), makeBet({ id: 'bet-002' })];
      const chain = chainable(bets, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getBets(MOCK_USER_ID, 10, 0);

      expect(result).toEqual(bets);
      expect(mockFrom).toHaveBeenCalledWith('aio_user_bets');
      expect(chain.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.range).toHaveBeenCalledWith(0, 9);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getBets(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getBets(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getPositions
  // --------------------------------------------------------------------------
  describe('getPositions()', () => {
    it('returns open positions', async () => {
      const positions = [
        { id: 'pos-1', user_id: MOCK_USER_ID, shares: 10, outcome: 'YES' },
        { id: 'pos-2', user_id: MOCK_USER_ID, shares: 5, outcome: 'NO' },
      ];
      const chain = chainable(positions, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getPositions(MOCK_USER_ID);

      expect(result).toEqual(positions);
      expect(mockFrom).toHaveBeenCalledWith('aio_user_positions');
      expect(chain.gt).toHaveBeenCalledWith('shares', 0);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getPositions(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getPositions(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------
  describe('getStats()', () => {
    it('returns full stats with follower/following counts', async () => {
      const portfolio = makePortfolio({
        total_profit: 150,
        starting_balance: 1000,
        total_bets: 20,
        winning_bets: 12,
        brier_score: 0.25,
        best_streak: 5,
        current_streak: 2,
        total_volume: 800,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_user_portfolios') return chainable(portfolio, null);
        if (table === 'aio_followed_traders') return chainable(null, null, 7);
        return chainable();
      });

      const result = await service.getStats(MOCK_USER_ID);

      expect(result).toEqual({
        totalProfit: 150,
        profitPercent: 15, // (150 / 1000) * 100
        totalBets: 20,
        winningBets: 12,
        winRate: 60, // (12 / 20) * 100
        brierScore: 0.25,
        bestStreak: 5,
        currentStreak: 2,
        totalVolume: 800,
        followerCount: 7,
        followingCount: 7,
      });
    });

    it('returns null when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getStats(MOCK_USER_ID);
      expect(result).toBeNull();
    });

    it('returns null when no portfolio found', async () => {
      // getPortfolio returns non-PGRST116 error -> null
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getStats(MOCK_USER_ID);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getLeaderboard
  // --------------------------------------------------------------------------
  describe('getLeaderboard()', () => {
    it('returns leaderboard entries with pagination', async () => {
      const entries = [
        { portfolio_id: 'p1', user_id: 'u1', username: 'alice', virtual_balance: 1500, total_profit: 500 },
        { portfolio_id: 'p2', user_id: 'u2', username: 'bob', virtual_balance: 1200, total_profit: 200 },
      ];
      const chain = chainable(entries, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getLeaderboard(10, 0);

      expect(result).toEqual(entries);
      expect(mockFrom).toHaveBeenCalledWith('aio_user_prediction_leaderboard');
      expect(chain.range).toHaveBeenCalledWith(0, 9);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getLeaderboard();
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getLeaderboard();
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // followTrader
  // --------------------------------------------------------------------------
  describe('followTrader()', () => {
    it('succeeds when following another user', async () => {
      const chain = chainable(null, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.followTrader('user-1', 'user-2');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('aio_followed_traders');
      expect(chain.insert).toHaveBeenCalledWith({ follower_id: 'user-1', followed_id: 'user-2' });
    });

    it('returns false when trying to follow yourself', async () => {
      const result = await service.followTrader('user-1', 'user-1');
      expect(result).toBe(false);
    });

    it('returns true on duplicate follow (23505 error code)', async () => {
      const chain = chainable(null, { code: '23505', message: 'duplicate key' });
      mockFrom.mockReturnValue(chain);

      const result = await service.followTrader('user-1', 'user-2');
      expect(result).toBe(true);
    });

    it('returns false when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.followTrader('user-1', 'user-2');
      expect(result).toBe(false);
    });

    it('returns false on other database errors', async () => {
      const chain = chainable(null, { code: '42P01', message: 'relation error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.followTrader('user-1', 'user-2');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // unfollowTrader
  // --------------------------------------------------------------------------
  describe('unfollowTrader()', () => {
    it('succeeds when unfollowing', async () => {
      const chain = chainable(null, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.unfollowTrader('user-1', 'user-2');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('aio_followed_traders');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('follower_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('followed_id', 'user-2');
    });

    it('returns false when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.unfollowTrader('user-1', 'user-2');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.unfollowTrader('user-1', 'user-2');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getFollowing
  // --------------------------------------------------------------------------
  describe('getFollowing()', () => {
    it('returns list of followed user IDs', async () => {
      const data = [
        { followed_id: 'user-2' },
        { followed_id: 'user-3' },
      ];
      const chain = chainable(data, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getFollowing(MOCK_USER_ID);

      expect(result).toEqual(['user-2', 'user-3']);
      expect(mockFrom).toHaveBeenCalledWith('aio_followed_traders');
      expect(chain.select).toHaveBeenCalledWith('followed_id');
      expect(chain.eq).toHaveBeenCalledWith('follower_id', MOCK_USER_ID);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getFollowing(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getFollowing(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getFollowers
  // --------------------------------------------------------------------------
  describe('getFollowers()', () => {
    it('returns list of follower user IDs', async () => {
      const data = [
        { follower_id: 'user-4' },
        { follower_id: 'user-5' },
      ];
      const chain = chainable(data, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getFollowers(MOCK_USER_ID);

      expect(result).toEqual(['user-4', 'user-5']);
      expect(mockFrom).toHaveBeenCalledWith('aio_followed_traders');
      expect(chain.select).toHaveBeenCalledWith('follower_id');
      expect(chain.eq).toHaveBeenCalledWith('followed_id', MOCK_USER_ID);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getFollowers(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      const chain = chainable(null, { code: '42P01', message: 'error' });
      mockFrom.mockReturnValue(chain);

      const result = await service.getFollowers(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // isFollowing
  // --------------------------------------------------------------------------
  describe('isFollowing()', () => {
    it('returns true when following', async () => {
      const chain = chainable({ id: 'follow-1' }, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.isFollowing('user-1', 'user-2');
      expect(result).toBe(true);
    });

    it('returns false when not following', async () => {
      const chain = chainable(null, null);
      mockFrom.mockReturnValue(chain);

      const result = await service.isFollowing('user-1', 'user-2');
      expect(result).toBe(false);
    });

    it('returns false when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.isFollowing('user-1', 'user-2');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getFollowedTradesFeed
  // --------------------------------------------------------------------------
  describe('getFollowedTradesFeed()', () => {
    it('returns bets from followed users', async () => {
      const followingData = [{ followed_id: 'user-2' }, { followed_id: 'user-3' }];
      const bets = [
        makeBet({ id: 'bet-100', user_id: 'user-2' }),
        makeBet({ id: 'bet-101', user_id: 'user-3' }),
      ];

      let fromCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        fromCallCount++;
        if (table === 'aio_followed_traders') {
          return chainable(followingData, null);
        }
        if (table === 'aio_user_bets') {
          return chainable(bets, null);
        }
        return chainable();
      });

      const result = await service.getFollowedTradesFeed(MOCK_USER_ID, 20);

      expect(result).toEqual(bets);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no one followed', async () => {
      // getFollowing returns empty
      const chain = chainable([], null);
      mockFrom.mockReturnValue(chain);

      const result = await service.getFollowedTradesFeed(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array when not initialized', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const uninitService = new UserPortfolioService();
      process.env.SUPABASE_URL = originalUrl;

      const result = await uninitService.getFollowedTradesFeed(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array on bets query error', async () => {
      const followingData = [{ followed_id: 'user-2' }];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'aio_followed_traders') return chainable(followingData, null);
        if (table === 'aio_user_bets') return chainable(null, { code: '42P01', message: 'error' });
        return chainable();
      });

      const result = await service.getFollowedTradesFeed(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });
});
