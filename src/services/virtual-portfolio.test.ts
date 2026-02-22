/**
 * Tests for VirtualPortfolioManager (virtual-portfolio.ts)
 *
 * All in-memory: no Supabase. calculateShares and getImpliedProbability
 * are mocked for deterministic results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ManifoldMarket } from './manifold-client.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockCalculateShares, mockGetImpliedProbability } = vi.hoisted(() => ({
  mockCalculateShares: vi.fn().mockReturnValue(9),        // 9 shares per bet
  mockGetImpliedProbability: vi.fn().mockReturnValue(0.6), // 60% implied probability
}));

vi.mock('./manifold-client.js', () => ({
  calculateShares: mockCalculateShares,
  getImpliedProbability: mockGetImpliedProbability,
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { VirtualPortfolioManager } from './virtual-portfolio.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMarket(overrides: Partial<ManifoldMarket> = {}): ManifoldMarket {
  return {
    id: 'mkt-1',
    creatorId: 'creator-1',
    creatorUsername: 'creator',
    creatorName: 'Creator',
    createdTime: 1000000,
    question: 'Will it rain tomorrow?',
    slug: 'will-it-rain',
    url: 'https://manifold.markets/will-it-rain',
    pool: { YES: 100, NO: 100 },
    probability: 0.6,
    totalLiquidity: 200,
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    volume: 500,
    volume24Hours: 50,
    isResolved: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: createPortfolio
// ---------------------------------------------------------------------------

describe('createPortfolio', () => {
  let mgr: VirtualPortfolioManager;
  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('creates portfolio with default starting balance of 10000', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1');
    expect(p.agentId).toBe('agent-1');
    expect(p.competitionId).toBe('comp-1');
    expect(p.startingBalance).toBe(10000);
    expect(p.currentBalance).toBe(10000);
    expect(p.positions).toEqual([]);
    expect(p.bets).toEqual([]);
  });

  it('creates portfolio with custom starting balance', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 5000);
    expect(p.startingBalance).toBe(5000);
    expect(p.currentBalance).toBe(5000);
  });

  it('returns the same portfolio when called twice for the same agent + competition', () => {
    const p1 = mgr.createPortfolio('agent-1', 'comp-1');
    const p2 = mgr.createPortfolio('agent-1', 'comp-1');
    expect(p1.id).toBe(p2.id);
  });
});

// ---------------------------------------------------------------------------
// Tests: getPortfolio / getPortfolioId / getOrCreatePortfolio
// ---------------------------------------------------------------------------

describe('getPortfolio', () => {
  let mgr: VirtualPortfolioManager;
  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('retrieves portfolio by id', () => {
    const created = mgr.createPortfolio('agent-1', 'comp-1');
    expect(mgr.getPortfolio(created.id)).toBe(created);
  });

  it('returns undefined for unknown id', () => {
    expect(mgr.getPortfolio('does-not-exist')).toBeUndefined();
  });
});

describe('getPortfolioId', () => {
  let mgr: VirtualPortfolioManager;
  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('returns portfolio id for known agent + competition', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1');
    expect(mgr.getPortfolioId('agent-1', 'comp-1')).toBe(p.id);
  });

  it('returns undefined for unknown agent', () => {
    expect(mgr.getPortfolioId('ghost', 'comp-1')).toBeUndefined();
  });
});

describe('getOrCreatePortfolio', () => {
  let mgr: VirtualPortfolioManager;
  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('creates a new portfolio when none exists', () => {
    const p = mgr.getOrCreatePortfolio('agent-1', 'comp-1', 8000);
    expect(p.startingBalance).toBe(8000);
  });

  it('returns existing portfolio without resetting balance', () => {
    const p1 = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const p2 = mgr.getOrCreatePortfolio('agent-1', 'comp-1', 9999);
    expect(p2.id).toBe(p1.id);
    expect(p2.startingBalance).toBe(10000); // original balance preserved
  });
});

// ---------------------------------------------------------------------------
// Tests: placeBet
// ---------------------------------------------------------------------------

describe('placeBet', () => {
  let mgr: VirtualPortfolioManager;
  let portfolioId: string;

  beforeEach(() => {
    mgr = new VirtualPortfolioManager();
    vi.clearAllMocks();
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(0.6);
    portfolioId = mgr.createPortfolio('agent-1', 'comp-1', 10000).id;
  });

  it('returns a successful result with correct bet fields', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect(result.success).toBe(true);
    expect(result.bet).toMatchObject({
      portfolioId,
      marketId: 'mkt-1',
      outcome: 'YES',
      amount: 100,
      shares: 9,
      resolved: false,
    });
  });

  it('deducts the bet amount from current balance', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect(mgr.getPortfolio(portfolioId)!.currentBalance).toBe(9900);
  });

  it('records the implied probability at bet time for YES', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect(result.bet!.probabilityAtBet).toBeCloseTo(0.6);
  });

  it('records 1 - probability for NO bets', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'NO', 100);
    expect(result.bet!.probabilityAtBet).toBeCloseTo(0.4); // 1 - 0.6
  });

  it('normalises lowercase outcome to uppercase', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'yes', 100);
    expect(result.bet!.outcome).toBe('YES');
  });

  it('creates a new position after the first bet on a market', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    const portfolio = mgr.getPortfolio(portfolioId)!;
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0].marketId).toBe('mkt-1');
    expect(portfolio.positions[0].shares).toBe(9);
  });

  it('adds to an existing position on a second bet on the same market + outcome', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 50);
    const portfolio = mgr.getPortfolio(portfolioId)!;
    // One position, shares = 9 + 9 = 18
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0].shares).toBe(18);
  });

  it('creates separate positions for different outcomes on the same market', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    mgr.placeBet(portfolioId, makeMarket(), 'NO', 100);
    expect(mgr.getPortfolio(portfolioId)!.positions).toHaveLength(2);
  });

  it('returns error when portfolio does not exist', () => {
    const result = mgr.placeBet('bad-id', makeMarket(), 'YES', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/portfolio not found/i);
  });

  it('returns error when amount is zero', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'YES', 0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/positive/i);
  });

  it('returns error when amount is negative', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'YES', -10);
    expect(result.success).toBe(false);
  });

  it('returns error when amount exceeds maxBetSize', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'YES', 2000, 1000);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum/i);
  });

  it('returns error when balance is insufficient', () => {
    const smallId = mgr.createPortfolio('agent-2', 'comp-1', 50).id;
    const result = mgr.placeBet(smallId, makeMarket(), 'YES', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient/i);
  });

  it('returns error when outcome is not valid for BINARY market', () => {
    const result = mgr.placeBet(portfolioId, makeMarket(), 'MAYBE', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid outcome/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: updatePositions
// ---------------------------------------------------------------------------

describe('updatePositions', () => {
  let mgr: VirtualPortfolioManager;
  let portfolioId: string;

  beforeEach(() => {
    mgr = new VirtualPortfolioManager();
    vi.clearAllMocks();
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(0.6);
    portfolioId = mgr.createPortfolio('agent-1', 'comp-1', 10000).id;
  });

  it('updates currentValue and unrealizedPnL when market price changes', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);

    // Price moves to 0.8
    mockGetImpliedProbability.mockReturnValue(0.8);
    const markets = new Map([['mkt-1', makeMarket({ probability: 0.8 })]]);
    mgr.updatePositions(portfolioId, markets);

    const position = mgr.getPortfolio(portfolioId)!.positions[0];
    expect(position.currentValue).toBeCloseTo(9 * 0.8); // 7.2
  });

  it('is a no-op when portfolio does not exist', () => {
    expect(() => mgr.updatePositions('bad-id', new Map())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: resolveMarket
// ---------------------------------------------------------------------------

describe('resolveMarket', () => {
  let mgr: VirtualPortfolioManager;
  let portfolioId: string;

  beforeEach(() => {
    mgr = new VirtualPortfolioManager();
    vi.clearAllMocks();
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(0.6);
    portfolioId = mgr.createPortfolio('agent-1', 'comp-1', 10000).id;
  });

  it('credits shares to balance when bet wins', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100); // balance → 9900, 9 shares
    mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    // Payout = 9 shares
    expect(mgr.getPortfolio(portfolioId)!.currentBalance).toBeCloseTo(9909);
  });

  it('does not change balance when bet loses', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100); // balance → 9900
    mgr.resolveMarket(portfolioId, 'mkt-1', 'NO');
    expect(mgr.getPortfolio(portfolioId)!.currentBalance).toBe(9900);
  });

  it('marks bet as resolved with the resolution outcome', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    const bet = mgr.getPortfolio(portfolioId)!.bets[0];
    expect(bet.resolved).toBe(true);
    expect(bet.resolution).toBe('YES');
    expect(bet.payout).toBe(9);
  });

  it('sets payout to 0 for a losing bet', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    mgr.resolveMarket(portfolioId, 'mkt-1', 'NO');
    expect(mgr.getPortfolio(portfolioId)!.bets[0].payout).toBe(0);
  });

  it('removes the resolved market from positions', () => {
    mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect(mgr.getPortfolio(portfolioId)!.positions).toHaveLength(1);
    mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    expect(mgr.getPortfolio(portfolioId)!.positions).toHaveLength(0);
  });

  it('only resolves bets for the specified market', () => {
    mgr.placeBet(portfolioId, makeMarket({ id: 'mkt-1' }), 'YES', 100);
    mgr.placeBet(portfolioId, makeMarket({ id: 'mkt-2' }), 'YES', 50);
    mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    const bets = mgr.getPortfolio(portfolioId)!.bets;
    expect(bets[0].resolved).toBe(true);
    expect(bets[1].resolved).toBe(false);
  });

  it('is a no-op when portfolio does not exist', () => {
    expect(() => mgr.resolveMarket('bad-id', 'mkt-1', 'YES')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateBrierScore
// ---------------------------------------------------------------------------

describe('calculateBrierScore', () => {
  let mgr: VirtualPortfolioManager;

  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('returns 0.25 (max uncertainty) when no resolved bets exist', () => {
    const id = mgr.createPortfolio('agent-1', 'comp-1').id;
    expect(mgr.calculateBrierScore(id)).toBe(0.25);
  });

  it('returns 0.25 for unknown portfolio id', () => {
    expect(mgr.calculateBrierScore('ghost')).toBe(0.25);
  });

  it('returns 0 for a perfect forecaster (probability 1.0, correct outcome)', () => {
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(1.0);
    const id = mgr.createPortfolio('agent-1', 'comp-1').id;
    // Place bet at implied prob 1.0 → probabilityAtBet = 1.0
    mgr.placeBet(id, makeMarket({ probability: 1.0 }), 'YES', 100);
    mgr.resolveMarket(id, 'mkt-1', 'YES'); // bet wins
    // Brier = (1.0 - 1)^2 = 0
    expect(mgr.calculateBrierScore(id)).toBe(0);
  });

  it('returns 1.0 for a worst-case forecaster (probability 1.0, wrong outcome)', () => {
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(1.0);
    const id = mgr.createPortfolio('agent-1', 'comp-1').id;
    mgr.placeBet(id, makeMarket({ probability: 1.0 }), 'YES', 100);
    mgr.resolveMarket(id, 'mkt-1', 'NO'); // bet loses
    // probabilityAtBet = 1.0, actualOutcome = 0 → (1.0 - 0)^2 = 1.0
    expect(mgr.calculateBrierScore(id)).toBe(1.0);
  });

  it('averages squared errors across multiple resolved bets', () => {
    mockCalculateShares.mockReturnValue(9);
    mockGetImpliedProbability.mockReturnValue(0.8);
    const id = mgr.createPortfolio('agent-1', 'comp-1').id;
    // Bet 1: forecast 0.8, wins → error = (0.8 - 1)^2 = 0.04
    mgr.placeBet(id, makeMarket({ id: 'mkt-1', probability: 0.8 }), 'YES', 100);
    mgr.resolveMarket(id, 'mkt-1', 'YES');
    // Bet 2: forecast 0.2 (NO on 0.8 market = 1-0.8), loses → error = (0.2 - 0)^2 = 0.04
    mockGetImpliedProbability.mockReturnValue(0.8);
    mgr.placeBet(id, makeMarket({ id: 'mkt-2', probability: 0.8 }), 'NO', 50);
    mgr.resolveMarket(id, 'mkt-2', 'YES'); // NO bet loses
    // avg = (0.04 + 0.04) / 2 = 0.04
    expect(mgr.calculateBrierScore(id)).toBeCloseTo(0.04);
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateFinalScores
// ---------------------------------------------------------------------------

describe('calculateFinalScores', () => {
  let mgr: VirtualPortfolioManager;

  beforeEach(() => {
    mgr = new VirtualPortfolioManager();
    vi.clearAllMocks();
    mockCalculateShares.mockReturnValue(0); // no shares so no position value
    mockGetImpliedProbability.mockReturnValue(0.5);
  });

  it('returns empty array when no portfolios exist for competition', () => {
    mgr.createPortfolio('agent-1', 'other-comp');
    expect(mgr.calculateFinalScores('comp-1')).toEqual([]);
  });

  it('only includes portfolios for the specified competition', () => {
    mgr.createPortfolio('agent-1', 'comp-1');
    mgr.createPortfolio('agent-2', 'comp-2');
    const scores = mgr.calculateFinalScores('comp-1');
    expect(scores).toHaveLength(1);
    expect(scores[0].agentId).toBe('agent-1');
  });

  it('awards 300 profit points for 0% profit (breakeven)', () => {
    mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // totalProfit = 0 → profitPercent = 0 → profitScore = 300
    const [score] = mgr.calculateFinalScores('comp-1');
    expect(score.profitScore).toBe(300);
  });

  it('awards 600 profit points for +50% gain', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // Manually set totalProfit to simulate +50% gain
    mgr.getPortfolio(p.id)!.totalProfit = 5000;
    const [score] = mgr.calculateFinalScores('comp-1');
    expect(score.profitScore).toBe(600);
  });

  it('awards 150 activity points for 10+ bets', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // Push 10 fake resolved bets directly
    const portfolio = mgr.getPortfolio(p.id)!;
    for (let i = 0; i < 10; i++) {
      portfolio.bets.push({
        id: `vb_${i}`, portfolioId: p.id, marketId: `mkt-${i}`,
        marketQuestion: 'Q', outcome: 'YES', amount: 10, shares: 0,
        probabilityAtBet: 0.5, timestamp: Date.now(), resolved: true,
        resolution: 'YES', payout: 0,
      });
    }
    const [score] = mgr.calculateFinalScores('comp-1');
    expect(score.activityScore).toBe(150);
  });

  it('calculates proportional activity score for fewer than 10 bets', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const portfolio = mgr.getPortfolio(p.id)!;
    for (let i = 0; i < 3; i++) {
      portfolio.bets.push({
        id: `vb_${i}`, portfolioId: p.id, marketId: `mkt-${i}`,
        marketQuestion: 'Q', outcome: 'YES', amount: 10, shares: 0,
        probabilityAtBet: 0.5, timestamp: Date.now(), resolved: false,
      });
    }
    const [score] = mgr.calculateFinalScores('comp-1');
    expect(score.activityScore).toBe(45); // 3 * 15
  });

  it('sorts results by totalScore descending', () => {
    const p1 = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const p2 = mgr.createPortfolio('agent-2', 'comp-1', 10000);
    // Give agent-2 higher profit
    mgr.getPortfolio(p1.id)!.totalProfit = 0;
    mgr.getPortfolio(p2.id)!.totalProfit = 5000;
    const scores = mgr.calculateFinalScores('comp-1');
    expect(scores[0].agentId).toBe('agent-2');
    expect(scores[1].agentId).toBe('agent-1');
  });

  it('clamps totalScore to [0, 1000]', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // Set extreme profit to push score above 1000
    mgr.getPortfolio(p.id)!.totalProfit = 100000;
    const [score] = mgr.calculateFinalScores('comp-1');
    expect(score.totalScore).toBeLessThanOrEqual(1000);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: getCompetitionPortfolios
// ---------------------------------------------------------------------------

describe('getCompetitionPortfolios', () => {
  it('returns only portfolios belonging to the specified competition', () => {
    const mgr = new VirtualPortfolioManager();
    mgr.createPortfolio('agent-1', 'comp-1');
    mgr.createPortfolio('agent-2', 'comp-1');
    mgr.createPortfolio('agent-3', 'comp-2');
    const portfolios = mgr.getCompetitionPortfolios('comp-1');
    expect(portfolios).toHaveLength(2);
    expect(portfolios.every(p => p.competitionId === 'comp-1')).toBe(true);
  });

  it('returns empty array for unknown competition', () => {
    const mgr = new VirtualPortfolioManager();
    expect(mgr.getCompetitionPortfolios('ghost')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: getPortfolioSummary
// ---------------------------------------------------------------------------

describe('getPortfolioSummary', () => {
  let mgr: VirtualPortfolioManager;
  beforeEach(() => { mgr = new VirtualPortfolioManager(); vi.clearAllMocks(); });

  it('returns "Portfolio not found" for unknown id', () => {
    expect(mgr.getPortfolioSummary('ghost')).toBe('Portfolio not found');
  });

  it('includes balance and profit information', () => {
    const p = mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const summary = mgr.getPortfolioSummary(p.id);
    expect(summary).toContain('10000.00');
    expect(summary).toContain('Total Bets: 0');
  });
});
