/**
 * Integration tests for GET /api/competitions/:id/events
 * Uses a minimal Express app (no full server.ts bootstrap) to isolate the route.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks — must be registered before the route module is imported
// ---------------------------------------------------------------------------

const getEventsFromLogMock = vi.fn().mockResolvedValue([]);

vi.mock('../../shared/utils/redis.js', () => ({
  getEventsFromLog: getEventsFromLogMock,
}));

// Stub out heavy dependencies pulled in transitively by competitions.ts
vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: { from: vi.fn(() => ({ select: vi.fn(), insert: vi.fn() })) },
}));
vi.mock('../../orchestrator/competition-manager.js', () => ({
  competitionManager: { getCompetition: vi.fn(), startCompetition: vi.fn() },
}));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../middleware/validate.js', () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../schemas.js', () => ({
  createCompetitionSchema: {},
  joinCompetitionSchema: {},
  voteSchema: {},
}));

const { default: competitionsRouter } = await import('./competitions.js');

// ---------------------------------------------------------------------------
// Minimal Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use('/api/competitions', competitionsRouter);

let server: http.Server;
let base: string;

beforeAll(() => {
  server = http.createServer(app);
  return new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      base = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(path: string) {
  const res = await fetch(`${base}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/competitions/:id/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEventsFromLogMock.mockResolvedValue([]);
  });

  it('returns 200 with empty events array when log is empty', async () => {
    const { status, body } = await get(`/api/competitions/${VALID_UUID}/events`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      competition_id: VALID_UUID,
      events: [],
      count: 0,
    });
  });

  it('passes the competitionId to getEventsFromLog', async () => {
    await get(`/api/competitions/${VALID_UUID}/events`);
    expect(getEventsFromLogMock).toHaveBeenCalledWith(VALID_UUID, undefined);
  });

  it('returns events from the log with correct count', async () => {
    const events = [
      { type: 'agent:action', timestamp: 1000 },
      { type: 'agent:action', timestamp: 2000 },
      { type: 'leaderboard:update', timestamp: 3000 },
    ];
    getEventsFromLogMock.mockResolvedValue(events);

    const { status, body } = await get(`/api/competitions/${VALID_UUID}/events`);
    expect(status).toBe(200);
    expect(body.count).toBe(3);
    expect(body.events).toHaveLength(3);
  });

  it('passes ?since= as a number to getEventsFromLog', async () => {
    await get(`/api/competitions/${VALID_UUID}/events?since=5000`);
    expect(getEventsFromLogMock).toHaveBeenCalledWith(VALID_UUID, 5000);
  });

  it('returns 400 for a non-numeric ?since= value', async () => {
    const { status, body } = await get(`/api/competitions/${VALID_UUID}/events?since=abc`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: 'Invalid since parameter' });
  });

  it('returns 500 when getEventsFromLog throws', async () => {
    getEventsFromLogMock.mockRejectedValue(new Error('Redis unavailable'));
    const { status, body } = await get(`/api/competitions/${VALID_UUID}/events`);
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: 'Failed to get event log' });
  });

  it('uses the raw id string from params (no coercion)', async () => {
    const otherId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await get(`/api/competitions/${otherId}/events`);
    expect(getEventsFromLogMock).toHaveBeenCalledWith(otherId, undefined);
  });
});
