import { describe, it, expect, vi } from 'vitest';

// Mock supabase before importing elo-service
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), rpc: vi.fn() })),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
}));

// Import the backward-compatibility shim
const { eloService, updateRatingsAfterCompetition } = await import('./elo-service.js');
const defaultExport = (await import('./elo-service.js')).default;

describe('ELO Service - Backward Compatibility Shim', () => {
  it('exports eloService with updateRatingsAfterCompetition', () => {
    expect(eloService).toBeDefined();
    expect(typeof eloService.updateRatingsAfterCompetition).toBe('function');
  });

  it('exports updateRatingsAfterCompetition as named export', () => {
    expect(typeof updateRatingsAfterCompetition).toBe('function');
  });

  it('default export has updateRatingsAfterCompetition', () => {
    expect(defaultExport).toBeDefined();
    expect(typeof defaultExport.updateRatingsAfterCompetition).toBe('function');
  });

  it('named and default exports reference the same function', () => {
    expect(eloService.updateRatingsAfterCompetition).toBe(updateRatingsAfterCompetition);
    expect(defaultExport.updateRatingsAfterCompetition).toBe(updateRatingsAfterCompetition);
  });
});
