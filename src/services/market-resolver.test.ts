import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock all external dependencies BEFORE importing the module under test
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

const mockSettleBet = vi.fn();
vi.mock('./wallet-service.js', () => ({
  walletService: {
    settleBet: (...args: unknown[]) => mockSettleBet(...args),
  },
}));

const mockPolymarketGetMarket = vi.fn();
vi.mock('./polymarket-client.js', () => ({
  polymarketClient: {
    getMarket: (...args: unknown[]) => mockPolymarketGetMarket(...args),
  },
}));

const mockKalshiGetMarket = vi.fn();
vi.mock('./kalshi-client.js', () => ({
  kalshiClient: {
    getMarket: (...args: unknown[]) => mockKalshiGetMarket(...args),
  },
}));

// Import AFTER mocks are registered
const {
  startResolver,
  stopResolver,
  manualResolve,
  checkResolutions,
} = await import('./market-resolver.js');

// ============================================================================
// Helper: chainable Supabase query mock
// ============================================================================

function chainable(data: unknown = null, error: unknown = null) {
  const chain: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
    'order', 'limit', 'single', 'maybeSingle', 'range',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: Function) => resolve({ data, error });
  return chain;
}

// ============================================================================
// Test data factories
// ============================================================================

function makeRealBet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bet-001',
    user_id: 'user-abc',
    market_id: 'market-123',
    market_source: 'polymarket',
    outcome: 'Yes',
    amount_cents: 5000,
    ...overrides,
  };
}

function makePaperBet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'paper-bet-001',
    user_id: 'user-abc',
    outcome: 'Yes',
    amount: 50,
    shares: 100,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MarketResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure resolver is stopped between tests
    stopResolver();
  });

  afterEach(() => {
    stopResolver();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // startResolver / stopResolver
  // --------------------------------------------------------------------------
  describe('startResolver()', () => {
    it('calls checkResolutions immediately on start', () => {
      // checkResolutions queries aio_real_bets, so set up a mock for it
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      startResolver();

      // Should have called from('aio_real_bets') immediately
      expect(mockFrom).toHaveBeenCalledWith('aio_real_bets');
    });

    it('sets up an interval that calls checkResolutions periodically', () => {
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      startResolver();

      // Clear the immediate call's mock data
      mockFrom.mockClear();

      // Advance 5 minutes (300000ms)
      mockFrom.mockReturnValue(chainable([], null));
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(mockFrom).toHaveBeenCalledWith('aio_real_bets');
    });

    it('warns and does not create duplicate interval if already running', () => {
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      startResolver();
      const callCountAfterFirst = mockFrom.mock.calls.length;

      // Clear and call again
      mockFrom.mockClear();
      mockFrom.mockReturnValue(chainable([], null));

      startResolver();

      // Should NOT have called checkResolutions again
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('stopResolver()', () => {
    it('clears the interval so checkResolutions is no longer called', () => {
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      startResolver();
      stopResolver();

      mockFrom.mockClear();
      mockFrom.mockReturnValue(chainable([], null));

      // Advance 5 minutes - should NOT trigger checkResolutions
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('is safe to call when resolver is not running', () => {
      // Should not throw
      expect(() => stopResolver()).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // checkResolutions
  // --------------------------------------------------------------------------
  describe('checkResolutions()', () => {
    it('returns early when no unresolved bets found (empty array)', async () => {
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      await checkResolutions();

      // Should only have one from() call for aio_real_bets
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith('aio_real_bets');
      // Should NOT call any exchange API
      expect(mockPolymarketGetMarket).not.toHaveBeenCalled();
      expect(mockKalshiGetMarket).not.toHaveBeenCalled();
    });

    it('returns early when no unresolved bets found (null data)', async () => {
      const realBetsChain = chainable(null, null);
      mockFrom.mockReturnValue(realBetsChain);

      await checkResolutions();

      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockPolymarketGetMarket).not.toHaveBeenCalled();
      expect(mockKalshiGetMarket).not.toHaveBeenCalled();
    });

    it('handles DB error on initial fetch without throwing', async () => {
      const realBetsChain = chainable(null, { code: '42P01', message: 'relation does not exist' });
      mockFrom.mockReturnValue(realBetsChain);

      // Should not throw (error is caught internally)
      await expect(checkResolutions()).resolves.toBeUndefined();
    });

    it('groups bets by market and checks Polymarket for resolution', async () => {
      const bet = makeRealBet({ outcome: 'Yes', market_source: 'polymarket', market_id: 'pm-1' });
      const realBetsChain = chainable([bet], null);

      // unresolved Polymarket market (not closed, not archived)
      mockPolymarketGetMarket.mockResolvedValue({
        closed: false,
        archived: false,
        outcomePrices: '["0.65", "0.35"]',
        outcomes: '["Yes", "No"]',
      });

      mockFrom.mockReturnValue(realBetsChain);

      await checkResolutions();

      expect(mockPolymarketGetMarket).toHaveBeenCalledWith('pm-1');
      // Market is not resolved, so no settlement should happen
      expect(mockSettleBet).not.toHaveBeenCalled();
    });

    it('resolves a Polymarket market that is closed and archived', async () => {
      const bet1 = makeRealBet({
        id: 'bet-win',
        outcome: 'Yes',
        market_source: 'polymarket',
        market_id: 'pm-resolved',
        amount_cents: 1000,
      });
      const bet2 = makeRealBet({
        id: 'bet-lose',
        outcome: 'No',
        market_source: 'polymarket',
        market_id: 'pm-resolved',
        amount_cents: 2000,
      });
      const realBetsChain = chainable([bet1, bet2], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;     // aio_real_bets
        if (fromCallCount === 2) return paperBetsChain;     // aio_user_bets (settlePaperBets)
        return resolutionChain;                              // aio_market_resolutions
      });

      // Polymarket resolved: YES won (price ~1.0)
      mockPolymarketGetMarket.mockResolvedValue({
        closed: true,
        archived: true,
        outcomePrices: '["0.99", "0.01"]',
        outcomes: '["Yes", "No"]',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Winner (Yes) gets amount_cents * 2 = 2000
      expect(mockSettleBet).toHaveBeenCalledWith('bet-win', 2000);
      // Loser (No) gets 0
      expect(mockSettleBet).toHaveBeenCalledWith('bet-lose', 0);

      // Resolution record inserted
      expect(mockFrom).toHaveBeenCalledWith('aio_market_resolutions');
    });

    it('resolves a Kalshi market that is settled', async () => {
      const bet = makeRealBet({
        id: 'bet-k1',
        outcome: 'yes',
        market_source: 'kalshi',
        market_id: 'kalshi-1',
        amount_cents: 3000,
      });
      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      expect(mockKalshiGetMarket).toHaveBeenCalledWith('kalshi-1');
      // Won: amount_cents * 2 = 6000
      expect(mockSettleBet).toHaveBeenCalledWith('bet-k1', 6000);
    });

    it('skips Kalshi markets that are not yet settled', async () => {
      const bet = makeRealBet({
        market_source: 'kalshi',
        market_id: 'kalshi-open',
      });
      const realBetsChain = chainable([bet], null);
      mockFrom.mockReturnValue(realBetsChain);

      mockKalshiGetMarket.mockResolvedValue({
        status: 'open',
        result: null,
      });

      await checkResolutions();

      expect(mockSettleBet).not.toHaveBeenCalled();
    });

    it('handles individual market check failure without stopping others', async () => {
      const bet1 = makeRealBet({
        id: 'bet-fail',
        market_source: 'polymarket',
        market_id: 'pm-fail',
      });
      const bet2 = makeRealBet({
        id: 'bet-ok',
        market_source: 'kalshi',
        market_id: 'kalshi-ok',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const realBetsChain = chainable([bet1, bet2], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      // Polymarket call throws
      mockPolymarketGetMarket.mockRejectedValue(new Error('Network error'));

      // Kalshi market resolves fine
      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // The Kalshi bet should still be settled despite Polymarket failure
      expect(mockSettleBet).toHaveBeenCalledWith('bet-ok', 2000);
    });

    it('records resolution in aio_market_resolutions on success', async () => {
      const bet = makeRealBet({
        id: 'bet-r1',
        market_source: 'polymarket',
        market_id: 'pm-r1',
        outcome: 'No',
        amount_cents: 500,
      });
      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockPolymarketGetMarket.mockResolvedValue({
        closed: true,
        archived: true,
        outcomePrices: '["0.02", "0.98"]',
        outcomes: '["Yes", "No"]',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Verify resolution was inserted
      expect(mockFrom).toHaveBeenCalledWith('aio_market_resolutions');
      expect(resolutionChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          market_id: 'pm-r1',
          market_source: 'polymarket',
          winning_outcome: 'NO',
          resolved_at: expect.any(String),
        })
      );
    });

    it('handles resolution record insert error without throwing', async () => {
      const bet = makeRealBet({
        id: 'bet-res-err',
        market_source: 'kalshi',
        market_id: 'kalshi-res-err',
        outcome: 'yes',
        amount_cents: 1000,
      });
      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      // Resolution insert fails
      const resolutionChain = chainable(null, { code: '23505', message: 'duplicate key' });

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      // Should not throw
      await expect(checkResolutions()).resolves.toBeUndefined();
      // Bet should still be settled
      expect(mockSettleBet).toHaveBeenCalledWith('bet-res-err', 2000);
    });

    it('handles Polymarket outcomes parsing failure gracefully', async () => {
      const bet = makeRealBet({
        market_source: 'polymarket',
        market_id: 'pm-bad-parse',
      });
      const realBetsChain = chainable([bet], null);
      mockFrom.mockReturnValue(realBetsChain);

      // Invalid JSON in outcomePrices
      mockPolymarketGetMarket.mockResolvedValue({
        closed: true,
        archived: true,
        outcomePrices: 'invalid-json',
        outcomes: '["Yes", "No"]',
      });

      await checkResolutions();

      // winningOutcome is null due to parse failure, so no settlement
      expect(mockSettleBet).not.toHaveBeenCalled();
    });

    it('settles paper bets when market resolves', async () => {
      const realBet = makeRealBet({
        id: 'bet-with-paper',
        market_source: 'kalshi',
        market_id: 'kalshi-paper',
        outcome: 'yes',
        amount_cents: 1000,
      });
      const paperBet = makePaperBet({
        id: 'paper-1',
        outcome: 'Yes',
        amount: 50,
        shares: 100,
      });

      const realBetsChain = chainable([realBet], null);
      const paperBetsChain = chainable([paperBet], null);
      const paperUpdateChain = chainable(null, null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;       // aio_real_bets
        if (fromCallCount === 2) return paperBetsChain;       // aio_user_bets (select)
        if (fromCallCount === 3) return paperUpdateChain;     // aio_user_bets (update)
        return resolutionChain;                                // aio_market_resolutions
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Paper bet query
      expect(mockFrom).toHaveBeenCalledWith('aio_user_bets');
      // Paper bet update with win data
      expect(paperUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: true,
          resolution: 'win',
          payout: 100,   // shares
          profit: 50,    // payout - amount = 100 - 50
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // manualResolve
  // --------------------------------------------------------------------------
  describe('manualResolve()', () => {
    it('settles all matching bets with correct win/loss status', async () => {
      const winBet = makeRealBet({
        id: 'manual-win',
        outcome: 'Yes',
        amount_cents: 2000,
      });
      const lossBet = makeRealBet({
        id: 'manual-loss',
        outcome: 'No',
        amount_cents: 3000,
      });

      const realBetsChain = chainable([winBet, lossBet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockSettleBet.mockResolvedValue(undefined);

      await manualResolve('market-123', 'polymarket', 'Yes');

      // Winner gets amount_cents * 2
      expect(mockSettleBet).toHaveBeenCalledWith('manual-win', 4000);
      // Loser gets 0
      expect(mockSettleBet).toHaveBeenCalledWith('manual-loss', 0);
    });

    it('handles no unresolved bets gracefully', async () => {
      const realBetsChain = chainable([], null);
      mockFrom.mockReturnValue(realBetsChain);

      await manualResolve('market-empty', 'kalshi', 'yes');

      expect(mockSettleBet).not.toHaveBeenCalled();
    });

    it('handles null bets data gracefully', async () => {
      const realBetsChain = chainable(null, null);
      mockFrom.mockReturnValue(realBetsChain);

      await manualResolve('market-null', 'kalshi', 'yes');

      expect(mockSettleBet).not.toHaveBeenCalled();
    });

    it('records resolution with manual=true', async () => {
      const bet = makeRealBet({
        id: 'manual-rec',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockSettleBet.mockResolvedValue(undefined);

      await manualResolve('market-123', 'polymarket', 'yes');

      expect(mockFrom).toHaveBeenCalledWith('aio_market_resolutions');
      expect(resolutionChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          market_id: 'market-123',
          market_source: 'polymarket',
          winning_outcome: 'YES',
          manual: true,
          resolved_at: expect.any(String),
        })
      );
    });

    it('throws on DB fetch error', async () => {
      const dbError = { code: '42P01', message: 'relation does not exist' };
      const realBetsChain = chainable(null, dbError);
      mockFrom.mockReturnValue(realBetsChain);

      await expect(
        manualResolve('market-fail', 'polymarket', 'Yes')
      ).rejects.toEqual(dbError);
    });

    it('calls settlePaperBets with uppercased resolution', async () => {
      const realBet = makeRealBet({
        id: 'manual-paper',
        outcome: 'yes',
        amount_cents: 1000,
      });
      const paperBet = makePaperBet({
        id: 'paper-manual',
        outcome: 'yes',
        amount: 20,
        shares: 40,
      });

      const realBetsChain = chainable([realBet], null);
      const paperBetsChain = chainable([paperBet], null);
      const paperUpdateChain = chainable(null, null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;       // aio_real_bets
        if (fromCallCount === 2) return paperBetsChain;       // aio_user_bets (select)
        if (fromCallCount === 3) return paperUpdateChain;     // aio_user_bets (update)
        return resolutionChain;                                // aio_market_resolutions
      });

      mockSettleBet.mockResolvedValue(undefined);

      await manualResolve('market-123', 'polymarket', 'yes');

      // Paper bets should be queried
      expect(mockFrom).toHaveBeenCalledWith('aio_user_bets');
      // Paper bet should be updated as a win (outcome YES matches resolution YES)
      expect(paperUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: true,
          resolution: 'win',
          payout: 40,    // shares
          profit: 20,    // payout - amount = 40 - 20
        })
      );
    });

    it('compares outcomes case-insensitively', async () => {
      const bet = makeRealBet({
        id: 'case-test',
        outcome: 'yEs',
        amount_cents: 500,
      });

      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockSettleBet.mockResolvedValue(undefined);

      await manualResolve('market-123', 'polymarket', 'YES');

      // Should match: 'yEs'.toUpperCase() === 'YES'.toUpperCase()
      expect(mockSettleBet).toHaveBeenCalledWith('case-test', 1000); // won: 500 * 2
    });

    it('handles resolution record insert error without throwing', async () => {
      const bet = makeRealBet({
        id: 'manual-res-err',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const realBetsChain = chainable([bet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, { code: '23505', message: 'duplicate' });

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockSettleBet.mockResolvedValue(undefined);

      // Should not throw even though resolution insert fails
      await expect(
        manualResolve('market-123', 'polymarket', 'yes')
      ).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // settlePaperBets (internal, tested through checkResolutions and manualResolve)
  // --------------------------------------------------------------------------
  describe('settlePaperBets (via checkResolutions)', () => {
    it('settles paper bets with correct win status and payout', async () => {
      const realBet = makeRealBet({
        id: 'real-1',
        market_source: 'kalshi',
        market_id: 'k-paper',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const winPaperBet = makePaperBet({
        id: 'paper-win',
        outcome: 'Yes',
        amount: 30,
        shares: 60,
      });
      const losePaperBet = makePaperBet({
        id: 'paper-lose',
        outcome: 'No',
        amount: 40,
        shares: 80,
      });

      const realBetsChain = chainable([realBet], null);
      const paperBetsChain = chainable([winPaperBet, losePaperBet], null);
      const paperUpdateChain1 = chainable(null, null);
      const paperUpdateChain2 = chainable(null, null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        if (fromCallCount === 3) return paperUpdateChain1;
        if (fromCallCount === 4) return paperUpdateChain2;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Win: payout = shares (60), profit = 60 - 30 = 30
      expect(paperUpdateChain1.update).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: true,
          resolution: 'win',
          payout: 60,
          profit: 30,
        })
      );

      // Loss: payout = 0, profit = 0 - 40 = -40
      expect(paperUpdateChain2.update).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: true,
          resolution: 'loss',
          payout: 0,
          profit: -40,
        })
      );
    });

    it('handles paper bets fetch error gracefully', async () => {
      const realBet = makeRealBet({
        id: 'real-paper-err',
        market_source: 'kalshi',
        market_id: 'k-paper-err',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const realBetsChain = chainable([realBet], null);
      // Paper bets fetch fails
      const paperBetsChain = chainable(null, { code: 'ERR', message: 'paper fetch failed' });
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      // Should not throw
      await expect(checkResolutions()).resolves.toBeUndefined();
      // Real bet should still be settled
      expect(mockSettleBet).toHaveBeenCalledWith('real-paper-err', 2000);
    });

    it('returns early when no paper bets exist', async () => {
      const realBet = makeRealBet({
        id: 'real-no-paper',
        market_source: 'kalshi',
        market_id: 'k-no-paper',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const realBetsChain = chainable([realBet], null);
      const paperBetsChain = chainable([], null);
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Only 3 from() calls: aio_real_bets, aio_user_bets (select, no updates), aio_market_resolutions
      // No paper bet update calls
      expect(mockFrom).toHaveBeenCalledTimes(3);
    });

    it('handles paper bet update error gracefully', async () => {
      const realBet = makeRealBet({
        id: 'real-up-err',
        market_source: 'kalshi',
        market_id: 'k-up-err',
        outcome: 'yes',
        amount_cents: 1000,
      });

      const paperBet = makePaperBet({
        id: 'paper-up-err',
        outcome: 'Yes',
        amount: 10,
        shares: 20,
      });

      const realBetsChain = chainable([realBet], null);
      const paperBetsChain = chainable([paperBet], null);
      // Paper bet update fails
      const paperUpdateChain = chainable(null, { code: 'ERR', message: 'update failed' });
      const resolutionChain = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;
        if (fromCallCount === 2) return paperBetsChain;
        if (fromCallCount === 3) return paperUpdateChain;
        return resolutionChain;
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'yes',
      });

      mockSettleBet.mockResolvedValue(undefined);

      // Should not throw
      await expect(checkResolutions()).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('handles multiple markets in a single check (Polymarket + Kalshi)', async () => {
      const pmBet = makeRealBet({
        id: 'pm-multi',
        market_source: 'polymarket',
        market_id: 'pm-multi-1',
        outcome: 'Yes',
        amount_cents: 500,
      });
      const kBet = makeRealBet({
        id: 'k-multi',
        market_source: 'kalshi',
        market_id: 'kalshi-multi-1',
        outcome: 'no',
        amount_cents: 700,
      });

      const realBetsChain = chainable([pmBet, kBet], null);
      // Both paper bets empty
      const paperBetsChain1 = chainable([], null);
      const resolutionChain1 = chainable(null, null);
      const paperBetsChain2 = chainable([], null);
      const resolutionChain2 = chainable(null, null);

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return realBetsChain;       // aio_real_bets
        if (fromCallCount === 2) return paperBetsChain1;      // paper bets for first market
        if (fromCallCount === 3) return resolutionChain1;     // resolution for first market
        if (fromCallCount === 4) return paperBetsChain2;      // paper bets for second market
        return resolutionChain2;                               // resolution for second market
      });

      mockPolymarketGetMarket.mockResolvedValue({
        closed: true,
        archived: true,
        outcomePrices: '["0.95", "0.05"]',
        outcomes: '["Yes", "No"]',
      });

      mockKalshiGetMarket.mockResolvedValue({
        status: 'settled',
        result: 'no',
      });

      mockSettleBet.mockResolvedValue(undefined);

      await checkResolutions();

      // Polymarket YES won, so pmBet (Yes) wins
      expect(mockSettleBet).toHaveBeenCalledWith('pm-multi', 1000);
      // Kalshi NO won, so kBet (no) wins
      expect(mockSettleBet).toHaveBeenCalledWith('k-multi', 1400);
    });

    it('handles Polymarket market returning null', async () => {
      const bet = makeRealBet({
        market_source: 'polymarket',
        market_id: 'pm-null',
      });
      const realBetsChain = chainable([bet], null);
      mockFrom.mockReturnValue(realBetsChain);

      mockPolymarketGetMarket.mockResolvedValue(null);

      await checkResolutions();

      expect(mockSettleBet).not.toHaveBeenCalled();
    });
  });
});
