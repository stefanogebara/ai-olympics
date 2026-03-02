/**
 * Tests for VirtualPortfolioManager (virtual-portfolio.ts)
 *
 * All DB calls mocked via in-memory store. calculateShares and
 * getImpliedProbability are mocked for deterministic results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ManifoldMarket } from './manifold-client.js';

// ---------------------------------------------------------------------------
// Mocks — hoisted so they run before imports
// ---------------------------------------------------------------------------

const { mockCalculateShares, mockGetImpliedProbability, mockServiceClient, resetMockDb, getMockTable } =
  vi.hoisted(() => {
    const mockCalculateShares = vi.fn().mockReturnValue(9);
    const mockGetImpliedProbability = vi.fn().mockReturnValue(0.6);

    // ---- In-memory Supabase mock ----
    const tables = new Map<string, Record<string, unknown>[]>([
      ['aio_virtual_portfolios', []],
      ['aio_virtual_bets', []],
    ]);
    const counter = { value: 0 };

    class QB {
      private _table: string;
      private _filters: Array<[string, unknown]> = [];
      private _insertData: Record<string, unknown> | null = null;
      private _updateData: Record<string, unknown> | null = null;
      private _isDelete = false;

      constructor(table: string) {
        this._table = table;
      }

      select(_cols?: string) { return this; }
      insert(data: Record<string, unknown>) { this._insertData = data; return this; }
      update(data: Record<string, unknown>) { this._updateData = data; return this; }
      delete() { this._isDelete = true; return this; }
      eq(col: string, val: unknown) { this._filters.push([col, val]); return this; }
      order(_col: string, _opts?: unknown) { return this; }

      private _matchesFilters(row: Record<string, unknown>): boolean {
        return this._filters.every(([col, val]) => row[col] === val);
      }

      private _execute(): { data: unknown; error: null } {
        const rows = tables.get(this._table)!;

        if (this._insertData) {
          const row: Record<string, unknown> = {
            id: `uuid-${++counter.value}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...this._insertData,
          };
          rows.push(row);
          return { data: row, error: null };
        }

        if (this._updateData) {
          const matches = rows.filter(r => this._matchesFilters(r));
          for (const row of matches) Object.assign(row, this._updateData);
          return { data: matches, error: null };
        }

        if (this._isDelete) {
          const keep = rows.filter(r => !this._matchesFilters(r));
          rows.length = 0;
          rows.push(...keep);
          return { data: null, error: null };
        }

        return { data: rows.filter(r => this._matchesFilters(r)), error: null };
      }

      async single() {
        const r = this._execute();
        return { data: r.data, error: null };
      }

      async maybeSingle() {
        const r = this._execute();
        const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return { data, error: null };
      }

      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => unknown) {
        return Promise.resolve(this._execute()).then(resolve, reject);
      }
    }

    const mockServiceClient = { from: (table: string) => new QB(table) };

    const resetMockDb = () => {
      tables.set('aio_virtual_portfolios', []);
      tables.set('aio_virtual_bets', []);
      counter.value = 0;
    };

    const getMockTable = (name: string) => tables.get(name)!;

    return {
      mockCalculateShares,
      mockGetImpliedProbability,
      mockServiceClient,
      resetMockDb,
      getMockTable,
    };
  });

vi.mock('./manifold-client.js', () => ({
  calculateShares: mockCalculateShares,
  getImpliedProbability: mockGetImpliedProbability,
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: mockServiceClient,
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

let mgr: VirtualPortfolioManager;

beforeEach(() => {
  resetMockDb();
  vi.clearAllMocks();
  mockCalculateShares.mockReturnValue(9);
  mockGetImpliedProbability.mockReturnValue(0.6);
  mgr = new VirtualPortfolioManager();
});

// ---------------------------------------------------------------------------
// Tests: createPortfolio
// ---------------------------------------------------------------------------

describe('createPortfolio', () => {
  it('creates portfolio with default starting balance of 10000', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    expect(p.agentId).toBe('agent-1');
    expect(p.competitionId).toBe('comp-1');
    expect(p.startingBalance).toBe(10000);
    expect(p.currentBalance).toBe(10000);
    expect(p.positions).toEqual([]);
    expect(p.bets).toEqual([]);
  });

  it('creates portfolio with custom starting balance', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 5000);
    expect(p.startingBalance).toBe(5000);
    expect(p.currentBalance).toBe(5000);
  });

  it('returns the same portfolio when called twice for the same agent + competition', async () => {
    const p1 = await mgr.createPortfolio('agent-1', 'comp-1');
    const p2 = await mgr.createPortfolio('agent-1', 'comp-1');
    expect(p1.id).toBe(p2.id);
  });
});

// ---------------------------------------------------------------------------
// Tests: getPortfolio / getPortfolioId / getOrCreatePortfolio
// ---------------------------------------------------------------------------

describe('getPortfolio', () => {
  it('retrieves portfolio by id', async () => {
    const created = await mgr.createPortfolio('agent-1', 'comp-1');
    const fetched = await mgr.getPortfolio(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('returns undefined for unknown id', async () => {
    expect(await mgr.getPortfolio('does-not-exist')).toBeUndefined();
  });
});

describe('getPortfolioId', () => {
  it('returns portfolio id for known agent + competition', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    expect(await mgr.getPortfolioId('agent-1', 'comp-1')).toBe(p.id);
  });

  it('returns undefined for unknown agent', async () => {
    expect(await mgr.getPortfolioId('ghost', 'comp-1')).toBeUndefined();
  });
});

describe('getOrCreatePortfolio', () => {
  it('creates a new portfolio when none exists', async () => {
    const p = await mgr.getOrCreatePortfolio('agent-1', 'comp-1', 8000);
    expect(p.startingBalance).toBe(8000);
  });

  it('returns existing portfolio without resetting balance', async () => {
    const p1 = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const p2 = await mgr.getOrCreatePortfolio('agent-1', 'comp-1', 9999);
    expect(p2.id).toBe(p1.id);
    expect(p2.startingBalance).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// Tests: placeBet
// ---------------------------------------------------------------------------

describe('placeBet', () => {
  let portfolioId: string;

  beforeEach(async () => {
    portfolioId = (await mgr.createPortfolio('agent-1', 'comp-1', 10000)).id;
  });

  it('returns a successful result with correct bet fields', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
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

  it('deducts the bet amount from current balance', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.currentBalance).toBe(9900);
  });

  it('records the implied probability at bet time for YES', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect(result.bet!.probabilityAtBet).toBeCloseTo(0.6);
  });

  it('records 1 - probability for NO bets', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'NO', 100);
    expect(result.bet!.probabilityAtBet).toBeCloseTo(0.4);
  });

  it('normalises lowercase outcome to uppercase', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'yes', 100);
    expect(result.bet!.outcome).toBe('YES');
  });

  it('creates a position for the market after betting', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.positions).toHaveLength(1);
    expect(portfolio!.positions[0].marketId).toBe('mkt-1');
    expect(portfolio!.positions[0].shares).toBe(9);
  });

  it('adds to an existing position on a second bet on the same market + outcome', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 50);
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.positions).toHaveLength(1);
    expect(portfolio!.positions[0].shares).toBe(18); // 9 + 9
  });

  it('creates separate positions for different outcomes on the same market', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    await mgr.placeBet(portfolioId, makeMarket(), 'NO', 100);
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.positions).toHaveLength(2);
  });

  it('returns error when portfolio does not exist', async () => {
    const result = await mgr.placeBet('bad-id', makeMarket(), 'YES', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/portfolio not found/i);
  });

  it('returns error when amount is zero', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'YES', 0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/positive/i);
  });

  it('returns error when amount is negative', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'YES', -10);
    expect(result.success).toBe(false);
  });

  it('returns error when amount exceeds maxBetSize', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'YES', 2000, 1000);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum/i);
  });

  it('returns error when balance is insufficient', async () => {
    const smallId = (await mgr.createPortfolio('agent-2', 'comp-1', 50)).id;
    const result = await mgr.placeBet(smallId, makeMarket(), 'YES', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/insufficient/i);
  });

  it('returns error when outcome is not valid for BINARY market', async () => {
    const result = await mgr.placeBet(portfolioId, makeMarket(), 'MAYBE', 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid outcome/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: updatePositions (no-op — positions are derived from bets on read)
// ---------------------------------------------------------------------------

describe('updatePositions', () => {
  it('does not throw when called', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    await expect(mgr.updatePositions(p.id, new Map())).resolves.toBeUndefined();
  });

  it('is a no-op for an unknown portfolio', async () => {
    await expect(mgr.updatePositions('bad-id', new Map())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: resolveMarket
// ---------------------------------------------------------------------------

describe('resolveMarket', () => {
  let portfolioId: string;

  beforeEach(async () => {
    portfolioId = (await mgr.createPortfolio('agent-1', 'comp-1', 10000)).id;
  });

  it('credits shares to balance when bet wins', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100); // balance → 9900, 9 shares
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.currentBalance).toBeCloseTo(9909);
  });

  it('does not change balance when bet loses', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'NO');
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.currentBalance).toBe(9900);
  });

  it('marks bet as resolved with the resolution outcome', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    const portfolio = await mgr.getPortfolio(portfolioId);
    const bet = portfolio!.bets[0];
    expect(bet.resolved).toBe(true);
    expect(bet.resolution).toBe('YES');
    expect(bet.payout).toBe(9);
  });

  it('sets payout to 0 for a losing bet', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'NO');
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.bets[0].payout).toBe(0);
  });

  it('removes the resolved market from positions', async () => {
    await mgr.placeBet(portfolioId, makeMarket(), 'YES', 100);
    expect((await mgr.getPortfolio(portfolioId))!.positions).toHaveLength(1);
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    expect((await mgr.getPortfolio(portfolioId))!.positions).toHaveLength(0);
  });

  it('only resolves bets for the specified market', async () => {
    await mgr.placeBet(portfolioId, makeMarket({ id: 'mkt-1' }), 'YES', 100);
    await mgr.placeBet(portfolioId, makeMarket({ id: 'mkt-2' }), 'YES', 50);
    await mgr.resolveMarket(portfolioId, 'mkt-1', 'YES');
    const portfolio = await mgr.getPortfolio(portfolioId);
    expect(portfolio!.bets[0].resolved).toBe(true);
    expect(portfolio!.bets[1].resolved).toBe(false);
  });

  it('is a no-op when portfolio does not exist', async () => {
    await expect(mgr.resolveMarket('bad-id', 'mkt-1', 'YES')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateBrierScore
// ---------------------------------------------------------------------------

describe('calculateBrierScore', () => {
  it('returns 0.25 (max uncertainty) when no resolved bets exist', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    expect(await mgr.calculateBrierScore(p.id)).toBe(0.25);
  });

  it('returns 0.25 for unknown portfolio id', async () => {
    expect(await mgr.calculateBrierScore('ghost')).toBe(0.25);
  });

  it('returns 0 for a perfect forecaster (probability 1.0, correct outcome)', async () => {
    mockGetImpliedProbability.mockReturnValue(1.0);
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    await mgr.placeBet(p.id, makeMarket({ probability: 1.0 }), 'YES', 100);
    await mgr.resolveMarket(p.id, 'mkt-1', 'YES');
    expect(await mgr.calculateBrierScore(p.id)).toBe(0);
  });

  it('returns 1.0 for a worst-case forecaster (probability 1.0, wrong outcome)', async () => {
    mockGetImpliedProbability.mockReturnValue(1.0);
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    await mgr.placeBet(p.id, makeMarket({ probability: 1.0 }), 'YES', 100);
    await mgr.resolveMarket(p.id, 'mkt-1', 'NO');
    // probabilityAtBet = 1.0, actualOutcome = 0 → (1.0 - 0)^2 = 1.0
    expect(await mgr.calculateBrierScore(p.id)).toBe(1.0);
  });

  it('averages squared errors across multiple resolved bets', async () => {
    mockGetImpliedProbability.mockReturnValue(0.8);
    const p = await mgr.createPortfolio('agent-1', 'comp-1');
    // Bet 1: forecast 0.8 YES, wins → error = (0.8 - 1)^2 = 0.04
    await mgr.placeBet(p.id, makeMarket({ id: 'mkt-1' }), 'YES', 100);
    await mgr.resolveMarket(p.id, 'mkt-1', 'YES');
    // Bet 2: forecast 0.2 NO (1-0.8), loses → error = (0.2 - 0)^2 = 0.04
    await mgr.placeBet(p.id, makeMarket({ id: 'mkt-2' }), 'NO', 50);
    await mgr.resolveMarket(p.id, 'mkt-2', 'YES');
    // avg = (0.04 + 0.04) / 2 = 0.04
    expect(await mgr.calculateBrierScore(p.id)).toBeCloseTo(0.04);
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateFinalScores
// ---------------------------------------------------------------------------

describe('calculateFinalScores', () => {
  it('returns empty array when no portfolios exist for competition', async () => {
    await mgr.createPortfolio('agent-1', 'other-comp');
    expect(await mgr.calculateFinalScores('comp-1')).toEqual([]);
  });

  it('only includes portfolios for the specified competition', async () => {
    await mgr.createPortfolio('agent-1', 'comp-1');
    await mgr.createPortfolio('agent-2', 'comp-2');
    const scores = await mgr.calculateFinalScores('comp-1');
    expect(scores).toHaveLength(1);
    expect(scores[0].agentId).toBe('agent-1');
  });

  it('awards 300 profit points for 0% profit (breakeven)', async () => {
    await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const [score] = await mgr.calculateFinalScores('comp-1');
    expect(score.profitScore).toBe(300);
  });

  it('awards 600 profit points for +50% gain', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // Seed totalProfit directly in mock DB
    const row = getMockTable('aio_virtual_portfolios').find(r => r.id === p.id)!;
    row.total_profit = '5000';
    row.current_balance = '15000';
    const [score] = await mgr.calculateFinalScores('comp-1');
    expect(score.profitScore).toBe(600);
  });

  it('awards 150 activity points for 10+ bets', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    // Seed bets directly in mock DB
    const betsTable = getMockTable('aio_virtual_bets');
    for (let i = 0; i < 10; i++) {
      betsTable.push({
        id: `bet-${i}`, portfolio_id: p.id, manifold_market_id: `mkt-${i}`,
        market_question: 'Q', outcome: 'YES', amount: '10', shares: '0',
        probability_at_bet: '0.5', resolved: true, resolution: 'YES', payout: '0',
        created_at: new Date().toISOString(),
      });
    }
    const [score] = await mgr.calculateFinalScores('comp-1');
    expect(score.activityScore).toBe(150);
  });

  it('calculates proportional activity score for fewer than 10 bets', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const betsTable = getMockTable('aio_virtual_bets');
    for (let i = 0; i < 3; i++) {
      betsTable.push({
        id: `bet-${i}`, portfolio_id: p.id, manifold_market_id: `mkt-${i}`,
        market_question: 'Q', outcome: 'YES', amount: '10', shares: '0',
        probability_at_bet: '0.5', resolved: false, resolution: null, payout: null,
        created_at: new Date().toISOString(),
      });
    }
    const [score] = await mgr.calculateFinalScores('comp-1');
    expect(score.activityScore).toBe(45); // 3 * 15
  });

  it('sorts results by totalScore descending', async () => {
    await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    await mgr.createPortfolio('agent-2', 'comp-1', 10000);
    // Give agent-2 higher profit via mock DB
    const table = getMockTable('aio_virtual_portfolios');
    table.find(r => r.agent_id === 'agent-2')!.total_profit = '5000';
    table.find(r => r.agent_id === 'agent-2')!.current_balance = '15000';

    const scores = await mgr.calculateFinalScores('comp-1');
    expect(scores[0].agentId).toBe('agent-2');
    expect(scores[1].agentId).toBe('agent-1');
  });

  it('clamps totalScore to [0, 1000]', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const row = getMockTable('aio_virtual_portfolios').find(r => r.id === p.id)!;
    row.total_profit = '100000';
    row.current_balance = '110000';
    const [score] = await mgr.calculateFinalScores('comp-1');
    expect(score.totalScore).toBeLessThanOrEqual(1000);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: getCompetitionPortfolios
// ---------------------------------------------------------------------------

describe('getCompetitionPortfolios', () => {
  it('returns only portfolios belonging to the specified competition', async () => {
    await mgr.createPortfolio('agent-1', 'comp-1');
    await mgr.createPortfolio('agent-2', 'comp-1');
    await mgr.createPortfolio('agent-3', 'comp-2');
    const portfolios = await mgr.getCompetitionPortfolios('comp-1');
    expect(portfolios).toHaveLength(2);
    expect(portfolios.every(p => p.competitionId === 'comp-1')).toBe(true);
  });

  it('returns empty array for unknown competition', async () => {
    expect(await mgr.getCompetitionPortfolios('ghost')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: getPortfolioSummary
// ---------------------------------------------------------------------------

describe('getPortfolioSummary', () => {
  it('returns "Portfolio not found" for unknown id', async () => {
    expect(await mgr.getPortfolioSummary('ghost')).toBe('Portfolio not found');
  });

  it('includes balance and profit information', async () => {
    const p = await mgr.createPortfolio('agent-1', 'comp-1', 10000);
    const summary = await mgr.getPortfolioSummary(p.id);
    expect(summary).toContain('10000.00');
    expect(summary).toContain('Total Bets: 0');
  });
});
