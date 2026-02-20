import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock all external dependencies before importing
// ============================================================================

const mockMulti = {
  set: vi.fn().mockReturnThis(),
  sadd: vi.fn().mockReturnThis(),
  del: vi.fn().mockReturnThis(),
  srem: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  mget: vi.fn(),
  multi: vi.fn().mockReturnValue(mockMulti),
};

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

vi.mock('../config.js', () => ({
  config: { redisUrl: 'redis://localhost:6379' },
}));

vi.mock('./logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ============================================================================
// Helpers
// ============================================================================

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    competitionId: 'comp-1',
    name: 'Test Competition',
    status: 'running',
    leaderboard: [
      {
        agentId: 'agent-1',
        agentName: 'Bot Alpha',
        totalScore: 100,
        eventsWon: 2,
        eventsCompleted: 3,
        rank: 1,
      },
    ],
    currentEventIndex: 2,
    totalEvents: 5,
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Redis utilities', () => {
  // The redis module uses module-level variables (redisClient, available) that
  // persist across tests. We carefully manage state using closeRedis() and
  // clearAllMocks() to keep tests isolated.

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default mock return values after clearAllMocks
    mockMulti.set.mockReturnThis();
    mockMulti.sadd.mockReturnThis();
    mockMulti.del.mockReturnThis();
    mockMulti.srem.mockReturnThis();
    mockMulti.exec.mockResolvedValue([]);
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.quit.mockResolvedValue(undefined);
    mockRedisInstance.multi.mockReturnValue(mockMulti);
  });

  describe('initRedis()', () => {
    it('connects successfully and returns true', async () => {
      // Fresh import — module state starts with available=false, redisClient=null
      const redis = await import('./redis.js');

      const result = await redis.initRedis();

      expect(result).toBe(true);
      expect(redis.isRedisAvailable()).toBe(true);
      expect(mockRedisInstance.connect).toHaveBeenCalled();

      // Cleanup for next tests
      await redis.closeRedis();
    });

    it('returns false when redisUrl is empty', async () => {
      // Override config to have no redisUrl
      const configModule = await import('../config.js');
      const originalUrl = configModule.config.redisUrl;
      (configModule.config as Record<string, unknown>).redisUrl = '';

      const redis = await import('./redis.js');
      const result = await redis.initRedis();

      expect(result).toBe(false);
      expect(redis.isRedisAvailable()).toBe(false);

      // Restore
      (configModule.config as Record<string, unknown>).redisUrl = originalUrl;
    });

    it('returns false on connection error', async () => {
      mockRedisInstance.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const redis = await import('./redis.js');
      const result = await redis.initRedis();

      expect(result).toBe(false);
      expect(redis.isRedisAvailable()).toBe(false);
    });
  });

  describe('isRedisAvailable()', () => {
    it('returns false before init', async () => {
      const redis = await import('./redis.js');
      // After closeRedis or fresh state, should be false
      expect(redis.isRedisAvailable()).toBe(false);
    });

    it('returns true after successful init', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);

      await redis.initRedis();
      expect(redis.isRedisAvailable()).toBe(true);

      // Cleanup
      await redis.closeRedis();
    });
  });

  describe('saveCompetitionSnapshot()', () => {
    it('saves snapshot with multi/set/sadd/exec', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      const snapshot = makeSnapshot();
      await redis.saveCompetitionSnapshot(snapshot);

      expect(mockRedisInstance.multi).toHaveBeenCalled();
      expect(mockMulti.set).toHaveBeenCalledWith(
        'aio:competition:comp-1',
        JSON.stringify(snapshot),
        'EX',
        3600
      );
      expect(mockMulti.sadd).toHaveBeenCalledWith('aio:active-competitions', 'comp-1');
      expect(mockMulti.exec).toHaveBeenCalled();

      await redis.closeRedis();
    });

    it('is a no-op if Redis is unavailable', async () => {
      const redis = await import('./redis.js');
      // Don't init — Redis not available

      mockRedisInstance.multi.mockClear();
      const snapshot = makeSnapshot();
      await redis.saveCompetitionSnapshot(snapshot);

      expect(mockRedisInstance.multi).not.toHaveBeenCalled();
    });
  });

  describe('removeCompetitionSnapshot()', () => {
    it('deletes with multi/del/srem/exec', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      await redis.removeCompetitionSnapshot('comp-2');

      expect(mockRedisInstance.multi).toHaveBeenCalled();
      expect(mockMulti.del).toHaveBeenCalledWith('aio:competition:comp-2');
      expect(mockMulti.srem).toHaveBeenCalledWith('aio:active-competitions', 'comp-2');
      expect(mockMulti.exec).toHaveBeenCalled();

      await redis.closeRedis();
    });

    it('is a no-op if Redis is unavailable', async () => {
      const redis = await import('./redis.js');
      // Don't init — Redis not available

      mockRedisInstance.multi.mockClear();
      await redis.removeCompetitionSnapshot('comp-2');

      expect(mockRedisInstance.multi).not.toHaveBeenCalled();
    });
  });

  describe('getInterruptedCompetitions()', () => {
    it('returns parsed snapshots', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      const snap1 = makeSnapshot({ competitionId: 'comp-a' });
      const snap2 = makeSnapshot({ competitionId: 'comp-b', name: 'Second' });

      mockRedisInstance.smembers.mockResolvedValue(['comp-a', 'comp-b']);
      mockRedisInstance.mget.mockResolvedValue([
        JSON.stringify(snap1),
        JSON.stringify(snap2),
      ]);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([snap1, snap2]);
      expect(mockRedisInstance.smembers).toHaveBeenCalledWith('aio:active-competitions');
      expect(mockRedisInstance.mget).toHaveBeenCalledWith(
        'aio:competition:comp-a',
        'aio:competition:comp-b'
      );

      await redis.closeRedis();
    });

    it('cleans up corrupt entries', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockResolvedValue(['comp-corrupt']);
      mockRedisInstance.mget.mockResolvedValue(['not-valid-json{{{']);
      mockRedisInstance.srem.mockResolvedValue(1);
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);
      expect(mockRedisInstance.srem).toHaveBeenCalledWith('aio:active-competitions', 'comp-corrupt');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('aio:competition:comp-corrupt');

      await redis.closeRedis();
    });

    it('cleans up expired keys (null values)', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockResolvedValue(['comp-expired']);
      mockRedisInstance.mget.mockResolvedValue([null]);
      mockRedisInstance.srem.mockResolvedValue(1);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);
      expect(mockRedisInstance.srem).toHaveBeenCalledWith('aio:active-competitions', 'comp-expired');

      await redis.closeRedis();
    });

    it('returns empty array when no active competitions', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockResolvedValue([]);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);
      expect(mockRedisInstance.mget).not.toHaveBeenCalled();

      await redis.closeRedis();
    });

    it('returns empty array if Redis is unavailable', async () => {
      const redis = await import('./redis.js');
      // Don't init

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);
      expect(mockRedisInstance.smembers).not.toHaveBeenCalled();
    });
  });

  describe('closeRedis()', () => {
    it('calls quit and sets available to false', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      expect(redis.isRedisAvailable()).toBe(true);

      await redis.closeRedis();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(redis.isRedisAvailable()).toBe(false);
    });

    it('falls back to disconnect when quit throws', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.quit.mockRejectedValueOnce(new Error('quit failed'));

      await redis.closeRedis();

      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
      expect(redis.isRedisAvailable()).toBe(false);
    });

    it('is safe to call when no client exists', async () => {
      const redis = await import('./redis.js');
      // No init — redisClient is null after previous closeRedis
      // Should not throw
      await redis.closeRedis();
    });
  });
});
