import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before importing
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock manifold-client pure functions
vi.mock('./manifold-client.js', () => ({
  calculateShares: vi.fn().mockReturnValue(100),
  getImpliedProbability: vi.fn().mockReturnValue(0.6),
}));

const { VirtualPortfolioManager } = await import('./virtual-portfolio.js');
const { calculateShares, getImpliedProbability } = await import('./manifold-client.js');

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeMarket(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'market-1',
    question: 'Will it rain tomorrow?',
    pool: { YES: 1000, NO: 1000 },
    outcomeType: 'BINARY',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('VirtualPortfolioManager', () => {
  let manager: InstanceType<typeof VirtualPortfolioManager>;

  beforeEach(() => {
    manager = new VirtualPortfolioManager();
    vi.clearAllMocks();
    // Reset default mock return values
    vi.mocked(calculateShares).mockReturnValue(100);
    vi.mocked(getImpliedProbability).mockReturnValue(0.6);
  });

  // --------------------------------------------------------------------------
  // createPortfolio
  // --------------------------------------------------------------------------
  describe('createPortfolio', () => {
    it('creates a portfolio with correct fields', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 5000);

      expect(portfolio.agentId).toBe('agent-1');
      expect(portfolio.competitionId).toBe('comp-1');
      expect(portfolio.startingBalance).toBe(5000);
      expect(portfolio.currentBalance).toBe(5000);
      expect(portfolio.positions).toEqual([]);
      expect(portfolio.bets).toEqual([]);
      expect(portfolio.totalProfit).toBe(0);
      expect(portfolio.id).toMatch(/^vp_/);
      expect(portfolio.createdAt).toBeGreaterThan(0);
    });

    it('returns existing portfolio if already exists', () => {
      const first = manager.createPortfolio('agent-1', 'comp-1', 5000);
      const second = manager.createPortfolio('agent-1', 'comp-1', 9999);

      expect(second.id).toBe(first.id);
      expect(second.startingBalance).toBe(5000); // keeps original balance
    });

    it('uses default starting balance of 10000', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      expect(portfolio.startingBalance).toBe(10000);
      expect(portfolio.currentBalance).toBe(10000);
    });

    it('uses custom starting balance', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 25000);

      expect(portfolio.startingBalance).toBe(25000);
      expect(portfolio.currentBalance).toBe(25000);
    });

    it('creates separate portfolios for different competitions', () => {
      const p1 = manager.createPortfolio('agent-1', 'comp-1');
      const p2 = manager.createPortfolio('agent-1', 'comp-2');

      expect(p1.id).not.toBe(p2.id);
      expect(p1.competitionId).toBe('comp-1');
      expect(p2.competitionId).toBe('comp-2');
    });

    it('creates separate portfolios for different agents', () => {
      const p1 = manager.createPortfolio('agent-1', 'comp-1');
      const p2 = manager.createPortfolio('agent-2', 'comp-1');

      expect(p1.id).not.toBe(p2.id);
    });
  });

  // --------------------------------------------------------------------------
  // getPortfolio
  // --------------------------------------------------------------------------
  describe('getPortfolio', () => {
    it('returns portfolio by ID', () => {
      const created = manager.createPortfolio('agent-1', 'comp-1');
      const retrieved = manager.getPortfolio(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.agentId).toBe('agent-1');
    });

    it('returns undefined for unknown ID', () => {
      const result = manager.getPortfolio('nonexistent-id');

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getPortfolioId
  // --------------------------------------------------------------------------
  describe('getPortfolioId', () => {
    it('returns portfolio ID by agent and competition', () => {
      const created = manager.createPortfolio('agent-1', 'comp-1');
      const id = manager.getPortfolioId('agent-1', 'comp-1');

      expect(id).toBe(created.id);
    });

    it('returns undefined for unknown agent', () => {
      const id = manager.getPortfolioId('nonexistent', 'comp-1');

      expect(id).toBeUndefined();
    });

    it('returns undefined for unknown competition', () => {
      manager.createPortfolio('agent-1', 'comp-1');
      const id = manager.getPortfolioId('agent-1', 'comp-99');

      expect(id).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getOrCreatePortfolio
  // --------------------------------------------------------------------------
  describe('getOrCreatePortfolio', () => {
    it('returns existing portfolio', () => {
      const original = manager.createPortfolio('agent-1', 'comp-1', 5000);
      const retrieved = manager.getOrCreatePortfolio('agent-1', 'comp-1', 9999);

      expect(retrieved.id).toBe(original.id);
      expect(retrieved.startingBalance).toBe(5000); // original balance preserved
    });

    it('creates new portfolio if not exists', () => {
      const portfolio = manager.getOrCreatePortfolio('agent-1', 'comp-1', 7500);

      expect(portfolio).toBeDefined();
      expect(portfolio.agentId).toBe('agent-1');
      expect(portfolio.competitionId).toBe('comp-1');
      expect(portfolio.startingBalance).toBe(7500);
    });

    it('uses default balance when creating', () => {
      const portfolio = manager.getOrCreatePortfolio('agent-1', 'comp-1');

      expect(portfolio.startingBalance).toBe(10000);
    });
  });

  // --------------------------------------------------------------------------
  // placeBet
  // --------------------------------------------------------------------------
  describe('placeBet', () => {
    let portfolioId: string;

    beforeEach(() => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      portfolioId = portfolio.id;
    });

    it('places a successful bet that reduces balance', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'YES', 100);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(9900);
      expect(result.error).toBeUndefined();
    });

    it('creates a bet record with correct fields', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'YES', 200);

      expect(result.bet).toBeDefined();
      const bet = result.bet!;
      expect(bet.id).toMatch(/^vb_/);
      expect(bet.portfolioId).toBe(portfolioId);
      expect(bet.marketId).toBe('market-1');
      expect(bet.marketQuestion).toBe('Will it rain tomorrow?');
      expect(bet.outcome).toBe('YES');
      expect(bet.amount).toBe(200);
      expect(bet.shares).toBe(100); // from mock
      expect(bet.probabilityAtBet).toBe(0.6); // YES probability from mock
      expect(bet.resolved).toBe(false);
      expect(bet.timestamp).toBeGreaterThan(0);
    });

    it('sets probabilityAtBet to 1 - probability for NO bets', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'NO', 100);

      expect(result.bet!.probabilityAtBet).toBe(0.4); // 1 - 0.6
    });

    it('creates a position for the bet', () => {
      const market = makeMarket();
      manager.placeBet(portfolioId, market, 'YES', 100);

      const portfolio = manager.getPortfolio(portfolioId)!;
      expect(portfolio.positions).toHaveLength(1);
      expect(portfolio.positions[0].marketId).toBe('market-1');
      expect(portfolio.positions[0].outcome).toBe('YES');
      expect(portfolio.positions[0].shares).toBe(100);
    });

    it('returns error for non-existent portfolio', () => {
      const market = makeMarket();
      const result = manager.placeBet('nonexistent', market, 'YES', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Portfolio not found');
    });

    it('returns error for negative amount', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'YES', -50);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bet amount must be positive');
    });

    it('returns error for zero amount', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'YES', 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bet amount must be positive');
    });

    it('returns error for amount exceeding maxBetSize', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'YES', 1500, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bet amount exceeds maximum of M$1000');
    });

    it('returns error for insufficient balance', () => {
      const market = makeMarket();
      // Use amount within maxBetSize but exceeding balance
      const result = manager.placeBet(portfolioId, market, 'YES', 500, 20000);

      // First deplete balance
      expect(result.success).toBe(true);

      // Now try to bet more than remaining balance (9500) with high maxBetSize
      const result2 = manager.placeBet(portfolioId, market, 'YES', 9600, 20000);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Insufficient balance');
    });

    it('returns error for invalid outcome', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'MAYBE', 100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid outcome');
    });

    it('accepts lowercase outcome and normalizes to uppercase', () => {
      const market = makeMarket();
      const result = manager.placeBet(portfolioId, market, 'yes', 100);

      expect(result.success).toBe(true);
      expect(result.bet!.outcome).toBe('YES');
    });

    it('updates position with average cost on multiple bets on same market', () => {
      const market = makeMarket();

      // First bet: 100 units, gets 100 shares => cost per share = 1.0
      vi.mocked(calculateShares).mockReturnValue(100);
      manager.placeBet(portfolioId, market, 'YES', 100);

      // Second bet: 200 units, gets 50 shares => cost per share = 4.0
      vi.mocked(calculateShares).mockReturnValue(50);
      manager.placeBet(portfolioId, market, 'YES', 200);

      const portfolio = manager.getPortfolio(portfolioId)!;
      expect(portfolio.positions).toHaveLength(1);
      // total shares = 100 + 50 = 150
      expect(portfolio.positions[0].shares).toBe(150);
      // average cost = (1.0 * 100 + 200) / 150 = 300/150 = 2.0
      expect(portfolio.positions[0].averageCost).toBe(2);
    });

    it('creates separate positions for different outcomes on same market', () => {
      const market = makeMarket();
      manager.placeBet(portfolioId, market, 'YES', 100);
      manager.placeBet(portfolioId, market, 'NO', 100);

      const portfolio = manager.getPortfolio(portfolioId)!;
      expect(portfolio.positions).toHaveLength(2);
      expect(portfolio.positions[0].outcome).toBe('YES');
      expect(portfolio.positions[1].outcome).toBe('NO');
    });

    it('recalculates totalProfit after placing a bet', () => {
      const market = makeMarket();
      manager.placeBet(portfolioId, market, 'YES', 100);

      const portfolio = manager.getPortfolio(portfolioId)!;
      // totalProfit = (currentBalance - startingBalance) + sum(position.currentValue)
      // currentBalance = 10000 - 100 = 9900
      // currentValue = 100 shares * 0.6 probability = 60
      // totalProfit = (9900 - 10000) + 60 = -40
      expect(portfolio.totalProfit).toBe(-40);
    });

    it('calls calculateShares with correct arguments', () => {
      const market = makeMarket({ pool: { YES: 500, NO: 1500 } });
      manager.placeBet(portfolioId, market, 'YES', 250);

      expect(calculateShares).toHaveBeenCalledWith(
        { YES: 500, NO: 1500 },
        250,
        'YES'
      );
    });

    it('calls getImpliedProbability with the market', () => {
      const market = makeMarket();
      manager.placeBet(portfolioId, market, 'YES', 100);

      expect(getImpliedProbability).toHaveBeenCalledWith(market);
    });

    it('uses custom maxBetSize', () => {
      const market = makeMarket();
      // Amount 500 is within maxBetSize 600
      const result = manager.placeBet(portfolioId, market, 'YES', 500, 600);
      expect(result.success).toBe(true);

      // Amount 700 exceeds maxBetSize 600
      const result2 = manager.placeBet(portfolioId, market, 'YES', 700, 600);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Bet amount exceeds maximum of M$600');
    });

    it('defaults maxBetSize to 1000', () => {
      const market = makeMarket();
      // Amount 999 is within default maxBetSize 1000
      const result = manager.placeBet(portfolioId, market, 'YES', 999);
      expect(result.success).toBe(true);

      // Amount 1001 exceeds default maxBetSize 1000
      const result2 = manager.placeBet(portfolioId, market, 'YES', 1001);
      expect(result2.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // updatePositions
  // --------------------------------------------------------------------------
  describe('updatePositions', () => {
    it('updates position values from market prices', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);

      // Now update with new probability
      vi.mocked(getImpliedProbability).mockReturnValue(0.8);
      const marketsMap = new Map([['market-1', makeMarket()]]);
      manager.updatePositions(portfolio.id, marketsMap);

      const updated = manager.getPortfolio(portfolio.id)!;
      // 100 shares * 0.8 = 80
      expect(updated.positions[0].currentValue).toBe(80);
    });

    it('recalculates unrealizedPnL', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      // Place bet: 100 amount, 100 shares, averageCost = 1.0
      manager.placeBet(portfolio.id, market, 'YES', 100);

      vi.mocked(getImpliedProbability).mockReturnValue(0.8);
      const marketsMap = new Map([['market-1', makeMarket()]]);
      manager.updatePositions(portfolio.id, marketsMap);

      const updated = manager.getPortfolio(portfolio.id)!;
      // unrealizedPnL = currentValue - (averageCost * shares) = 80 - (1.0 * 100) = -20
      expect(updated.positions[0].unrealizedPnL).toBe(-20);
    });

    it('recalculates total profit', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);

      vi.mocked(getImpliedProbability).mockReturnValue(0.8);
      const marketsMap = new Map([['market-1', makeMarket()]]);
      manager.updatePositions(portfolio.id, marketsMap);

      const updated = manager.getPortfolio(portfolio.id)!;
      // totalProfit = (9900 - 10000) + 80 = -20
      expect(updated.totalProfit).toBe(-20);
    });

    it('is a no-op for unknown portfolio', () => {
      const marketsMap = new Map([['market-1', makeMarket()]]);
      // Should not throw
      expect(() => manager.updatePositions('nonexistent', marketsMap)).not.toThrow();
    });

    it('skips positions with no matching market data', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);

      const originalValue = manager.getPortfolio(portfolio.id)!.positions[0].currentValue;

      // Update with empty markets map - position should not change
      const emptyMap = new Map<string, any>();
      manager.updatePositions(portfolio.id, emptyMap);

      const updated = manager.getPortfolio(portfolio.id)!;
      expect(updated.positions[0].currentValue).toBe(originalValue);
    });

    it('handles NO positions with 1 - probability', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'NO', 100);

      vi.mocked(getImpliedProbability).mockReturnValue(0.3);
      const marketsMap = new Map([['market-1', makeMarket()]]);
      manager.updatePositions(portfolio.id, marketsMap);

      const updated = manager.getPortfolio(portfolio.id)!;
      // NO position: shares * (1 - probability) = 100 * (1 - 0.3) = 70
      expect(updated.positions[0].currentValue).toBe(70);
    });
  });

  // --------------------------------------------------------------------------
  // resolveMarket
  // --------------------------------------------------------------------------
  describe('resolveMarket', () => {
    it('winning bets pay out shares to balance', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      vi.mocked(calculateShares).mockReturnValue(150);
      manager.placeBet(portfolio.id, market, 'YES', 100);
      // Balance is now 9900

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const updated = manager.getPortfolio(portfolio.id)!;
      // Won: balance += 150 shares => 9900 + 150 = 10050
      expect(updated.currentBalance).toBe(10050);
    });

    it('losing bets pay 0', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);
      // Balance is now 9900

      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      const updated = manager.getPortfolio(portfolio.id)!;
      // Lost: no payout, balance stays at 9900
      expect(updated.currentBalance).toBe(9900);
    });

    it('removes resolved positions', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);
      expect(manager.getPortfolio(portfolio.id)!.positions).toHaveLength(1);

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      expect(manager.getPortfolio(portfolio.id)!.positions).toHaveLength(0);
    });

    it('updates bet records with resolution', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      vi.mocked(calculateShares).mockReturnValue(120);
      manager.placeBet(portfolio.id, market, 'YES', 100);

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const updated = manager.getPortfolio(portfolio.id)!;
      expect(updated.bets[0].resolved).toBe(true);
      expect(updated.bets[0].resolution).toBe('YES');
      expect(updated.bets[0].payout).toBe(120);
    });

    it('sets payout to 0 for losing bets', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      const updated = manager.getPortfolio(portfolio.id)!;
      expect(updated.bets[0].payout).toBe(0);
      expect(updated.bets[0].resolution).toBe('NO');
    });

    it('recalculates total profit after resolution', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      vi.mocked(calculateShares).mockReturnValue(200);
      manager.placeBet(portfolio.id, market, 'YES', 100);

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const updated = manager.getPortfolio(portfolio.id)!;
      // balance = 9900 + 200 = 10100, positions empty
      // totalProfit = 10100 - 10000 + 0 = 100
      expect(updated.totalProfit).toBe(100);
    });

    it('is a no-op for unknown portfolio', () => {
      expect(() => manager.resolveMarket('nonexistent', 'market-1', 'YES')).not.toThrow();
    });

    it('only resolves unresolved bets for the given market', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market1 = makeMarket({ id: 'market-1' });
      const market2 = makeMarket({ id: 'market-2', question: 'Will it snow?' });

      manager.placeBet(portfolio.id, market1, 'YES', 100);
      manager.placeBet(portfolio.id, market2, 'YES', 100);

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const updated = manager.getPortfolio(portfolio.id)!;
      // Only market-1 bet is resolved
      expect(updated.bets[0].resolved).toBe(true);
      expect(updated.bets[1].resolved).toBe(false);
    });

    it('does not re-resolve already resolved bets', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      vi.mocked(calculateShares).mockReturnValue(150);
      manager.placeBet(portfolio.id, market, 'YES', 100);

      manager.resolveMarket(portfolio.id, 'market-1', 'YES');
      const balanceAfterFirst = manager.getPortfolio(portfolio.id)!.currentBalance;

      // Resolve again - should not double-pay
      manager.resolveMarket(portfolio.id, 'market-1', 'YES');
      const balanceAfterSecond = manager.getPortfolio(portfolio.id)!.currentBalance;

      expect(balanceAfterSecond).toBe(balanceAfterFirst);
    });
  });

  // --------------------------------------------------------------------------
  // calculateBrierScore
  // --------------------------------------------------------------------------
  describe('calculateBrierScore', () => {
    it('returns 0.25 for unknown portfolio', () => {
      const score = manager.calculateBrierScore('nonexistent');
      expect(score).toBe(0.25);
    });

    it('returns 0.25 for no resolved bets', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);
      // Bet is not resolved

      const score = manager.calculateBrierScore(portfolio.id);
      expect(score).toBe(0.25);
    });

    it('returns 0.25 for portfolio with no bets at all', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const score = manager.calculateBrierScore(portfolio.id);
      expect(score).toBe(0.25);
    });

    it('calculates correctly for perfect prediction (high confidence, correct)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const market = makeMarket();

      // Bet YES with 0.9 probability
      vi.mocked(getImpliedProbability).mockReturnValue(0.9);
      manager.placeBet(portfolio.id, market, 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const score = manager.calculateBrierScore(portfolio.id);
      // forecast = 0.9, outcome = 1 (correct)
      // Brier = (0.9 - 1)^2 = 0.01
      expect(score).toBeCloseTo(0.01, 5);
    });

    it('calculates correctly for wrong prediction (high confidence, wrong)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const market = makeMarket();

      // Bet YES with 0.9 probability
      vi.mocked(getImpliedProbability).mockReturnValue(0.9);
      manager.placeBet(portfolio.id, market, 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      const score = manager.calculateBrierScore(portfolio.id);
      // forecast = 0.9, outcome = 0 (wrong)
      // Brier = (0.9 - 0)^2 = 0.81
      expect(score).toBeCloseTo(0.81, 5);
    });

    it('averages scores across multiple resolved bets', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      // Bet 1: YES at 0.8 on market-1, resolves YES (correct)
      vi.mocked(getImpliedProbability).mockReturnValue(0.8);
      manager.placeBet(portfolio.id, makeMarket({ id: 'm1' }), 'YES', 100);
      manager.resolveMarket(portfolio.id, 'm1', 'YES');

      // Bet 2: YES at 0.6 on market-2, resolves NO (wrong)
      vi.mocked(getImpliedProbability).mockReturnValue(0.6);
      manager.placeBet(portfolio.id, makeMarket({ id: 'm2' }), 'YES', 100);
      manager.resolveMarket(portfolio.id, 'm2', 'NO');

      const score = manager.calculateBrierScore(portfolio.id);
      // Bet 1: (0.8 - 1)^2 = 0.04
      // Bet 2: (0.6 - 0)^2 = 0.36
      // Average: (0.04 + 0.36) / 2 = 0.20
      expect(score).toBeCloseTo(0.20, 5);
    });

    it('handles NO bets probability correctly', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const market = makeMarket();

      // Bet NO at 0.6 implied prob (so NO prob = 0.4)
      vi.mocked(getImpliedProbability).mockReturnValue(0.6);
      manager.placeBet(portfolio.id, market, 'NO', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      const score = manager.calculateBrierScore(portfolio.id);
      // probabilityAtBet for NO = 1 - 0.6 = 0.4
      // outcome = correct, so actualOutcome = 1
      // Brier = (0.4 - 1)^2 = 0.36
      expect(score).toBeCloseTo(0.36, 5);
    });
  });

  // --------------------------------------------------------------------------
  // calculateFinalScores
  // --------------------------------------------------------------------------
  describe('calculateFinalScores', () => {
    it('calculates profit score with 60% weight (max 600 points)', () => {
      // 0% profit => 300 points
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const scores = manager.calculateFinalScores('comp-1');

      expect(scores).toHaveLength(1);
      expect(scores[0].profitScore).toBe(300); // 0% profit = midpoint
    });

    it('gives 600 points for +50% profit', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);

      // Simulate profit by placing bet and winning
      vi.mocked(calculateShares).mockReturnValue(5200);
      const market = makeMarket();
      manager.placeBet(portfolio.id, market, 'YES', 200);
      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      // balance = 9800 + 5200 = 15000 => profit = 5000 = 50%
      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].profitScore).toBe(600);
    });

    it('gives 0 points for -50% profit', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);

      // Lose 5000 by betting and losing (set maxBetSize high enough)
      vi.mocked(calculateShares).mockReturnValue(100);
      const market = makeMarket();
      manager.placeBet(portfolio.id, market, 'YES', 5000, 10000);
      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      // balance = 5000, profit = -5000 = -50%
      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].profitScore).toBe(0);
    });

    it('calculates brier score with 25% weight (max 250 points)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      // No resolved bets => Brier = 0.25 => brierScorePoints = 0
      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].brierScore).toBe(0.25);
      expect(scores[0].brierScorePoints).toBe(0);
    });

    it('gives 250 brier points for perfect calibration (brier=0)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      // Perfect bet: forecast 1.0, outcome correct
      vi.mocked(getImpliedProbability).mockReturnValue(1.0);
      manager.placeBet(portfolio.id, makeMarket(), 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const scores = manager.calculateFinalScores('comp-1');
      // Brier = (1.0 - 1)^2 = 0 => brierScorePoints = ((0.25 - 0) / 0.25) * 250 = 250
      expect(scores[0].brierScorePoints).toBe(250);
    });

    it('calculates activity score with 15% weight (max 150 points)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      // Place 3 bets
      for (let i = 0; i < 3; i++) {
        manager.placeBet(portfolio.id, makeMarket({ id: `m${i}` }), 'YES', 100);
      }

      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].activityScore).toBe(45); // 3 * 15
    });

    it('caps activity score at 150 points (10 bets)', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      for (let i = 0; i < 15; i++) {
        manager.placeBet(portfolio.id, makeMarket({ id: `m${i}` }), 'YES', 100);
      }

      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].activityScore).toBe(150); // capped
    });

    it('sorts by total score descending', () => {
      // Agent 1: no bets, default
      manager.createPortfolio('agent-1', 'comp-1', 10000);

      // Agent 2: win big
      const p2 = manager.createPortfolio('agent-2', 'comp-1', 10000);
      vi.mocked(calculateShares).mockReturnValue(5200);
      manager.placeBet(p2.id, makeMarket(), 'YES', 200);
      manager.resolveMarket(p2.id, 'market-1', 'YES');

      const scores = manager.calculateFinalScores('comp-1');
      expect(scores[0].agentId).toBe('agent-2');
      expect(scores[1].agentId).toBe('agent-1');
      expect(scores[0].totalScore).toBeGreaterThanOrEqual(scores[1].totalScore);
    });

    it('caps total scores at 0-1000', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');
      const scores = manager.calculateFinalScores('comp-1');

      expect(scores[0].totalScore).toBeGreaterThanOrEqual(0);
      expect(scores[0].totalScore).toBeLessThanOrEqual(1000);
    });

    it('returns empty array for unknown competition', () => {
      const scores = manager.calculateFinalScores('nonexistent');
      expect(scores).toEqual([]);
    });

    it('includes correct details in score result', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'YES');

      const scores = manager.calculateFinalScores('comp-1');
      const details = scores[0].details;

      expect(details.startingBalance).toBe(10000);
      expect(details.totalBets).toBe(1);
      expect(details.resolvedBets).toBe(1);
      expect(details.unresolvedBets).toBe(0);
    });

    it('clamps brierScorePoints to 0 minimum', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      // Very bad prediction: forecast 0.9, outcome wrong => Brier > 0.25
      vi.mocked(getImpliedProbability).mockReturnValue(0.9);
      manager.placeBet(portfolio.id, makeMarket(), 'YES', 100);
      manager.resolveMarket(portfolio.id, 'market-1', 'NO');

      const scores = manager.calculateFinalScores('comp-1');
      // Brier = (0.9 - 0)^2 = 0.81 => brierScorePoints = ((0.25 - 0.81) / 0.25) * 250 = negative
      expect(scores[0].brierScorePoints).toBe(0); // clamped to 0
    });
  });

  // --------------------------------------------------------------------------
  // getCompetitionPortfolios
  // --------------------------------------------------------------------------
  describe('getCompetitionPortfolios', () => {
    it('returns all portfolios for a competition', () => {
      manager.createPortfolio('agent-1', 'comp-1');
      manager.createPortfolio('agent-2', 'comp-1');
      manager.createPortfolio('agent-3', 'comp-2'); // different competition

      const portfolios = manager.getCompetitionPortfolios('comp-1');
      expect(portfolios).toHaveLength(2);
      expect(portfolios.map(p => p.agentId).sort()).toEqual(['agent-1', 'agent-2']);
    });

    it('returns empty array for unknown competition', () => {
      const portfolios = manager.getCompetitionPortfolios('nonexistent');
      expect(portfolios).toEqual([]);
    });

    it('returns empty array when no portfolios exist', () => {
      const portfolios = manager.getCompetitionPortfolios('comp-1');
      expect(portfolios).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // clearPortfolio
  // --------------------------------------------------------------------------
  describe('clearPortfolio', () => {
    it('removes portfolio from maps', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1');

      manager.clearPortfolio(portfolio.id);

      expect(manager.getPortfolio(portfolio.id)).toBeUndefined();
      expect(manager.getPortfolioId('agent-1', 'comp-1')).toBeUndefined();
    });

    it('is a no-op for unknown portfolio', () => {
      expect(() => manager.clearPortfolio('nonexistent')).not.toThrow();
    });

    it('does not affect other portfolios', () => {
      const p1 = manager.createPortfolio('agent-1', 'comp-1');
      const p2 = manager.createPortfolio('agent-2', 'comp-1');

      manager.clearPortfolio(p1.id);

      expect(manager.getPortfolio(p1.id)).toBeUndefined();
      expect(manager.getPortfolio(p2.id)).toBeDefined();
    });

    it('allows creating a new portfolio for the same agent+competition after clear', () => {
      const original = manager.createPortfolio('agent-1', 'comp-1', 5000);
      manager.clearPortfolio(original.id);

      const newPortfolio = manager.createPortfolio('agent-1', 'comp-1', 7000);
      expect(newPortfolio.id).not.toBe(original.id);
      expect(newPortfolio.startingBalance).toBe(7000);
    });
  });

  // --------------------------------------------------------------------------
  // getPortfolioSummary
  // --------------------------------------------------------------------------
  describe('getPortfolioSummary', () => {
    it('returns formatted summary string', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const summary = manager.getPortfolioSummary(portfolio.id);

      expect(summary).toContain('Portfolio Summary');
      expect(summary).toContain('Balance: M$10000.00');
      expect(summary).toContain('Total Profit: M$0.00');
      expect(summary).toContain('Total Bets: 0');
      expect(summary).toContain('No open positions');
    });

    it('returns "Portfolio not found" for unknown portfolio', () => {
      const summary = manager.getPortfolioSummary('nonexistent');
      expect(summary).toBe('Portfolio not found');
    });

    it('shows open positions', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket({ question: 'Will AI pass the bar exam by 2025 with flying colors?' });

      manager.placeBet(portfolio.id, market, 'YES', 100);

      const summary = manager.getPortfolioSummary(portfolio.id);
      expect(summary).toContain('YES');
      expect(summary).toContain('shares');
      expect(summary).toContain('P&L');
      expect(summary).not.toContain('No open positions');
    });

    it('shows updated balance after bets', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const market = makeMarket();

      manager.placeBet(portfolio.id, market, 'YES', 500);

      const summary = manager.getPortfolioSummary(portfolio.id);
      expect(summary).toContain('Balance: M$9500.00');
      expect(summary).toContain('Total Bets: 1');
    });

    it('shows profit percentage', () => {
      const portfolio = manager.createPortfolio('agent-1', 'comp-1', 10000);
      const summary = manager.getPortfolioSummary(portfolio.id);
      expect(summary).toContain('0.0%');
    });
  });
});
