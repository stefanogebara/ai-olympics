import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: vi.fn() },
}));

vi.mock('./meta-market-service.js', () => ({
  metaMarketService: { resolveMarket: vi.fn() },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { serviceClient } from '../shared/utils/supabase.js';
import { metaMarketService } from './meta-market-service.js';
import { resolveStaleMarkets } from './market-auto-resolver.js';

const mockFrom = serviceClient.from as ReturnType<typeof vi.fn>;

describe('resolveStaleMarkets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-resolves market when competition ended more than 25h ago', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'aio_meta_markets') {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                data: [{ id: 'market-1', competition_id: 'comp-1', status: 'open' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'aio_competitions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'comp-1',
                  status: 'completed',
                  ended_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
                  winner_agent_id: 'agent-1',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
    });

    (metaMarketService.resolveMarket as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await resolveStaleMarkets();

    expect(metaMarketService.resolveMarket).toHaveBeenCalledWith('comp-1', 'agent-1');
  });

  it('skips market when competition is still running', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'aio_meta_markets') {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                data: [{ id: 'market-1', competition_id: 'comp-1', status: 'open' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'aio_competitions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'comp-1',
                  status: 'running',
                  ended_at: null,
                  winner_agent_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
    });

    await resolveStaleMarkets();

    expect(metaMarketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('cancels market when competition was cancelled', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'aio_meta_markets') {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                data: [{ id: 'market-1', competition_id: 'comp-1', status: 'open' }],
                error: null,
              }),
            }),
          }),
          update: updateMock,
        };
      }
      if (table === 'aio_competitions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'comp-1',
                  status: 'cancelled',
                  ended_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
                  winner_agent_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
    });

    await resolveStaleMarkets();

    expect(metaMarketService.resolveMarket).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  it('does nothing when no stale markets found', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          lt: () => ({ data: [], error: null }),
        }),
      }),
    }));

    await resolveStaleMarkets();

    expect(metaMarketService.resolveMarket).not.toHaveBeenCalled();
  });
});
