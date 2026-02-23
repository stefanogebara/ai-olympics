/**
 * Tests for meta-market-service.ts
 *
 * Covers: constructor (initialized flag), registerEventListeners,
 * createMarketForCompetition, getActiveMarkets, getMarket,
 * getMarketByCompetition, placeBet, lockMarket, resolveMarket,
 * getUserBets, getMarketBets, calculateOddsFromElo (indirect),
 * calculatePayout (indirect).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom, mockOn } = vi.hoisted(() => {
  // Set env vars before the module loads so initialized = true
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  return {
    mockFrom: vi.fn(),
    mockOn: vi.fn(),
  };
});

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));
vi.mock('../shared/utils/events.js', () => ({
  eventBus: { on: mockOn, emit: vi.fn() },
}));
vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { metaMarketService, MetaMarketService } from './meta-market-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  // 'in' is always the last chain method before await — return a real Promise
  q.in = vi.fn().mockResolvedValue(result);
  q.single = vi.fn().mockResolvedValue(result);
  // Allow direct await (for queries without .single() or .in())
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'market-1',
    competition_id: 'comp-1',
    question: 'Who will win?',
    market_type: 'winner',
    outcomes: [
      { id: 'agent-1', name: 'Agent One', initial_odds: -150, agent_id: 'agent-1' },
      { id: 'agent-2', name: 'Agent Two', initial_odds: 130, agent_id: 'agent-2' },
    ],
    current_odds: { 'agent-1': -150, 'agent-2': 130 },
    status: 'open',
    total_volume: 0,
    total_bets: 0,
    opens_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCompetition() {
  return {
    id: 'comp-1',
    name: 'Test Competition',
    task_id: 'task-speed',
    agents: [
      { id: 'agent-1', name: 'Agent One', elo: 1600, color: '#f00' },
      { id: 'agent-2', name: 'Agent Two', elo: 1400, color: '#0f0' },
    ],
    start_time: '2024-06-01T12:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks(); // restore vi.spyOn() originals (e.g. resolveMarket spy from registerEventListeners tests)
  vi.resetAllMocks();   // reset all vi.fn() state and implementations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (metaMarketService as any).initialized = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (metaMarketService as any).eventListenersRegistered = false;
  mockFrom.mockReturnValue(chain());
});

// ---------------------------------------------------------------------------
// Constructor / initialized flag
// ---------------------------------------------------------------------------

describe('constructor', () => {
  it('initialized is true when env vars are set', () => {
    const svc = new MetaMarketService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((svc as any).initialized).toBe(true);
  });

  it('initialized is false when env vars are absent', () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;

    const svc = new MetaMarketService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((svc as any).initialized).toBe(false);

    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_KEY = originalKey;
  });
});

// ---------------------------------------------------------------------------
// registerEventListeners
// ---------------------------------------------------------------------------

describe('registerEventListeners', () => {
  it('registers listeners for competition:create, competition:start, competition:end', () => {
    metaMarketService.registerEventListeners();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = mockOn.mock.calls.map((args: any[]) => args[0] as string);
    expect(events).toContain('competition:create');
    expect(events).toContain('competition:start');
    expect(events).toContain('competition:end');
  });

  it('is idempotent — second call does not re-register', () => {
    metaMarketService.registerEventListeners();
    metaMarketService.registerEventListeners();

    expect(mockOn).toHaveBeenCalledTimes(3); // only first call registers
  });

  it('competition:end handler calls resolveMarket when winner present', async () => {
    metaMarketService.registerEventListeners();

    const resolveMarketSpy = vi.spyOn(metaMarketService, 'resolveMarket').mockResolvedValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endHandler = mockOn.mock.calls.find((args: any[]) => args[0] === 'competition:end')?.[1];
    await endHandler?.({ data: { competitionId: 'comp-1', winner: { agentId: 'agent-1' } } });

    expect(resolveMarketSpy).toHaveBeenCalledWith('comp-1', 'agent-1');
  });

  it('competition:end handler skips resolveMarket when no winner', async () => {
    metaMarketService.registerEventListeners();

    const resolveMarketSpy = vi.spyOn(metaMarketService, 'resolveMarket').mockResolvedValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endHandler = mockOn.mock.calls.find((args: any[]) => args[0] === 'competition:end')?.[1];
    await endHandler?.({ data: { competitionId: 'comp-1' } });

    expect(resolveMarketSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createMarketForCompetition
// ---------------------------------------------------------------------------

describe('createMarketForCompetition', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    const result = await metaMarketService.createMarketForCompetition(makeCompetition());
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts market and upserts agent stats', async () => {
    const market = makeMarket();
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null })) // insert market
      .mockReturnValueOnce(chain({ data: null, error: null }))   // upsert agent-1
      .mockReturnValueOnce(chain({ data: null, error: null }));  // upsert agent-2

    const result = await metaMarketService.createMarketForCompetition(makeCompetition());

    expect(result).toEqual(market);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'aio_meta_markets');
    expect(mockFrom).toHaveBeenCalledWith('aio_agent_betting_stats');
    expect(mockFrom).toHaveBeenCalledTimes(3); // 1 market + 2 agents
  });

  it('sets question to "Who will win the <name>?"', async () => {
    const market = makeMarket();
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))
      .mockReturnValue(chain());

    await metaMarketService.createMarketForCompetition(makeCompetition());

    const insertCall = mockFrom.mock.results[0].value;
    const insertArg = insertCall.insert.mock.calls[0][0];
    expect(insertArg.question).toBe('Who will win the Test Competition?');
    expect(insertArg.market_type).toBe('winner');
    expect(insertArg.status).toBe('open');
  });

  it('returns null when DB insert returns error', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { message: 'DB error' } })
    );

    const result = await metaMarketService.createMarketForCompetition(makeCompetition());

    expect(result).toBeNull();
  });

  it('returns null when an exception is thrown', async () => {
    mockFrom.mockImplementationOnce(() => { throw new Error('connection refused'); });

    const result = await metaMarketService.createMarketForCompetition(makeCompetition());

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateOddsFromElo (via createMarketForCompetition)
// ---------------------------------------------------------------------------

describe('calculateOddsFromElo (indirect)', () => {
  it('favorite (higher ELO) gets negative odds, underdog gets positive', async () => {
    const market = makeMarket();
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))
      .mockReturnValue(chain());

    await metaMarketService.createMarketForCompetition(makeCompetition());

    const insertArg = mockFrom.mock.results[0].value.insert.mock.calls[0][0];
    // agent-1 has ELO 1600 (favorite) → negative odds
    expect(insertArg.current_odds['agent-1']).toBeLessThan(0);
    // agent-2 has ELO 1400 (underdog) → positive odds
    expect(insertArg.current_odds['agent-2']).toBeGreaterThan(0);
  });

  it('equal ELO agents both get -100 odds', async () => {
    const competition = {
      ...makeCompetition(),
      agents: [
        { id: 'a1', name: 'A1', elo: 1500 },
        { id: 'a2', name: 'A2', elo: 1500 },
      ],
    };
    const market = makeMarket();
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))
      .mockReturnValue(chain());

    await metaMarketService.createMarketForCompetition(competition);

    const insertArg = mockFrom.mock.results[0].value.insert.mock.calls[0][0];
    expect(insertArg.current_odds['a1']).toBe(-100);
    expect(insertArg.current_odds['a2']).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// getActiveMarkets
// ---------------------------------------------------------------------------

describe('getActiveMarkets', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.getActiveMarkets()).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns markets array on success', async () => {
    const markets = [makeMarket()];
    mockFrom.mockReturnValueOnce(chain({ data: markets, error: null }));

    const result = await metaMarketService.getActiveMarkets();

    expect(result).toEqual(markets);
    expect(mockFrom).toHaveBeenCalledWith('aio_active_meta_markets');
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));

    expect(await metaMarketService.getActiveMarkets()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMarket
// ---------------------------------------------------------------------------

describe('getMarket', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.getMarket('m1')).toBeNull();
  });

  it('returns market on success', async () => {
    const market = makeMarket();
    mockFrom.mockReturnValueOnce(chain({ data: market, error: null }));

    const result = await metaMarketService.getMarket('market-1');

    expect(result).toEqual(market);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('id', 'market-1');
  });

  it('returns null on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }));

    expect(await metaMarketService.getMarket('m-missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMarketByCompetition
// ---------------------------------------------------------------------------

describe('getMarketByCompetition', () => {
  it('returns null when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.getMarketByCompetition('comp-1')).toBeNull();
  });

  it('returns market filtered by competition_id', async () => {
    const market = makeMarket();
    mockFrom.mockReturnValueOnce(chain({ data: market, error: null }));

    const result = await metaMarketService.getMarketByCompetition('comp-1');

    expect(result).toEqual(market);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('competition_id', 'comp-1');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(1);
  });

  it('returns null on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'none' } }));

    expect(await metaMarketService.getMarketByCompetition('comp-x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// placeBet
// ---------------------------------------------------------------------------

describe('placeBet', () => {
  function setupPlaceBet({
    market = makeMarket(),
    portfolio = { virtual_balance: 500 },
    bet = { id: 'bet-1', market_id: 'market-1', user_id: 'user-1', outcome_id: 'agent-1', outcome_name: 'Agent One', amount: 100, odds_at_bet: -150, potential_payout: 166.67, status: 'active', created_at: '2024-01-01' },
    updatedPortfolio = { virtual_balance: 400 },
  } = {}) {
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))      // getMarket
      .mockReturnValueOnce(chain({ data: portfolio, error: null }))   // portfolio
      .mockReturnValueOnce(chain({ data: bet, error: null }))         // insert bet
      .mockReturnValueOnce(chain({ data: updatedPortfolio, error: null })); // updated balance
  }

  it('returns error when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result).toEqual({ success: false, error: 'Service not configured' });
  });

  it('returns error when market not found', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result).toEqual({ success: false, error: 'Market not found' });
  });

  it('returns error when market is not open', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makeMarket({ status: 'locked' }), error: null }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result).toEqual({ success: false, error: 'Market is not open for betting' });
  });

  it('returns error when outcome does not exist in market', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makeMarket(), error: null }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'no-such-outcome', 100);
    expect(result).toEqual({ success: false, error: 'Invalid outcome' });
  });

  it('returns error when amount is zero or negative', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makeMarket(), error: null }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 0);
    expect(result).toEqual({ success: false, error: 'Bet amount must be positive' });
  });

  it('returns error when amount exceeds maxBetSize', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: makeMarket(), error: null }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 2000, 1000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum bet size');
  });

  it('returns error when portfolio not found', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeMarket(), error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result).toEqual({ success: false, error: 'Portfolio not found' });
  });

  it('returns error when balance is insufficient', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeMarket(), error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 50 }, error: null }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient balance');
  });

  it('returns error when bet insert fails', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeMarket(), error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 500 }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: 'constraint violation' } }));
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);
    expect(result).toEqual({ success: false, error: 'Failed to place bet' });
  });

  it('returns success with bet and updated balance', async () => {
    setupPlaceBet();
    const result = await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);

    expect(result.success).toBe(true);
    expect(result.bet).toBeDefined();
    expect(result.newBalance).toBe(400);
  });

  it('uses current_odds over initial_odds when present', async () => {
    const market = makeMarket({ current_odds: { 'agent-1': 200, 'agent-2': -250 } });
    setupPlaceBet({ market });
    await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);

    const betInsertArg = mockFrom.mock.results[2].value.insert.mock.calls[0][0];
    expect(betInsertArg.odds_at_bet).toBe(200); // current_odds, not initial_odds
  });
});

// ---------------------------------------------------------------------------
// calculatePayout (indirect via placeBet)
// ---------------------------------------------------------------------------

describe('calculatePayout (indirect)', () => {
  it('positive odds: payout = amount + amount * (odds/100)', async () => {
    // Bet 100 at +200 → 100 + 100*(200/100) = 300
    const market = makeMarket({ current_odds: { 'agent-1': 200, 'agent-2': 130 } });
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 500 }, error: null }))
      .mockReturnValueOnce(chain({ data: { id: 'bet-1' }, error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 400 }, error: null }));

    await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);

    const betArg = mockFrom.mock.results[2].value.insert.mock.calls[0][0];
    expect(betArg.potential_payout).toBe(300);
  });

  it('negative odds: payout = amount + amount * (100/|odds|)', async () => {
    // Bet 100 at -200 → 100 + 100*(100/200) = 150
    const market = makeMarket({ current_odds: { 'agent-1': -200, 'agent-2': 130 } });
    mockFrom
      .mockReturnValueOnce(chain({ data: market, error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 500 }, error: null }))
      .mockReturnValueOnce(chain({ data: { id: 'bet-1' }, error: null }))
      .mockReturnValueOnce(chain({ data: { virtual_balance: 400 }, error: null }));

    await metaMarketService.placeBet('user-1', 'market-1', 'agent-1', 100);

    const betArg = mockFrom.mock.results[2].value.insert.mock.calls[0][0];
    expect(betArg.potential_payout).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// lockMarket
// ---------------------------------------------------------------------------

describe('lockMarket', () => {
  it('returns false when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.lockMarket('comp-1')).toBe(false);
  });

  it('returns true and updates status to locked', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await metaMarketService.lockMarket('comp-1');

    expect(result).toBe(true);
    const q = mockFrom.mock.results[0].value;
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'locked' }));
    expect(q.eq).toHaveBeenCalledWith('competition_id', 'comp-1');
    expect(q.eq).toHaveBeenCalledWith('status', 'open');
  });

  it('returns false on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await metaMarketService.lockMarket('comp-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveMarket
// ---------------------------------------------------------------------------

describe('resolveMarket', () => {
  it('returns false when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.resolveMarket('comp-1', 'agent-1')).toBe(false);
  });

  it('returns true and sets resolved_outcome', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await metaMarketService.resolveMarket('comp-1', 'agent-1');

    expect(result).toBe(true);
    const q = mockFrom.mock.results[0].value;
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'resolved',
      resolved_outcome: 'agent-1',
    }));
    expect(q.in).toHaveBeenCalledWith('status', ['open', 'locked']);
  });

  it('returns false on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await metaMarketService.resolveMarket('comp-1', 'agent-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getUserBets
// ---------------------------------------------------------------------------

describe('getUserBets', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.getUserBets('user-1')).toEqual([]);
  });

  it('returns bets for user ordered by created_at desc', async () => {
    const bets = [{ id: 'bet-1', user_id: 'user-1' }];
    mockFrom.mockReturnValueOnce(chain({ data: bets, error: null }));

    const result = await metaMarketService.getUserBets('user-1');

    expect(result).toEqual(bets);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await metaMarketService.getUserBets('user-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMarketBets
// ---------------------------------------------------------------------------

describe('getMarketBets', () => {
  it('returns empty array when not initialized', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (metaMarketService as any).initialized = false;
    expect(await metaMarketService.getMarketBets('market-1')).toEqual([]);
  });

  it('returns bets for market', async () => {
    const bets = [{ id: 'bet-1', market_id: 'market-1' }];
    mockFrom.mockReturnValueOnce(chain({ data: bets, error: null }));

    const result = await metaMarketService.getMarketBets('market-1');

    expect(result).toEqual(bets);
    const q = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('aio_meta_market_bets');
    expect(q.eq).toHaveBeenCalledWith('market_id', 'market-1');
  });

  it('returns empty array on DB error', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'err' } }));
    expect(await metaMarketService.getMarketBets('market-1')).toEqual([]);
  });
});
