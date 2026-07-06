/**
 * Tests for requireAuthOrAgent — the prediction-market auth middleware.
 *
 * Regression guard for the CRITICAL/HIGH auth bypass where presence of the
 * forgeable X-Agent-Id / X-Competition-Id headers was accepted as full
 * authentication with no verification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockRequireAuth } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('../../../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: mockRequireAuth,
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { requireAuthOrAgent } from './types.js';

/** Build a Supabase query chain whose maybeSingle() resolves to `result`. */
function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) obj[m] = vi.fn().mockReturnValue(obj);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  return obj;
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('requireAuthOrAgent — agent header path', () => {
  it('rejects forged headers when the agent is not a participant (401, no next)', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null })); // participant lookup: none
    const req = { headers: { 'x-agent-id': 'attacker', 'x-competition-id': 'comp-x' } } as never;
    const res = makeRes();
    const next = vi.fn();

    await requireAuthOrAgent(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the competition is not running (401)', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'p1' } }))       // participant exists
      .mockReturnValueOnce(chain({ data: { status: 'lobby' } })); // but not running
    const req = { headers: { 'x-agent-id': 'a1', 'x-competition-id': 'comp-1' } } as never;
    const res = makeRes();
    const next = vi.fn();

    await requireAuthOrAgent(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a real participant in a running competition and sets agentAuth', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'p1' } }))          // participant exists
      .mockReturnValueOnce(chain({ data: { status: 'running' } })); // running
    const req = { headers: { 'x-agent-id': 'a1', 'x-competition-id': 'comp-1' } } as {
      headers: Record<string, string>;
      agentAuth?: { agentId: string; competitionId: string };
    };
    const res = makeRes();
    const next = vi.fn();

    await requireAuthOrAgent(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.agentAuth).toEqual({ agentId: 'a1', competitionId: 'comp-1' });
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireAuthOrAgent — user token path', () => {
  it('falls back to requireAuth when no agent headers are present', async () => {
    const req = { headers: {} } as never;
    const res = makeRes();
    const next = vi.fn();

    await requireAuthOrAgent(req, res as never, next);

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
