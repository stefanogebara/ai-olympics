/**
 * Redis Utilities - Extra Coverage Tests
 *
 * Targets uncovered lines 109-113 (removeCompetitionSnapshot error path)
 * and lines 149-153 (getInterruptedCompetitions error path).
 * Complements the existing redis.test.ts with additional error scenarios.
 */

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
// Tests - Error paths
// ============================================================================

describe('Redis utilities - error paths', () => {
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

  // -------------------------------------------------------------------------
  // removeCompetitionSnapshot error path (lines 109-113)
  // -------------------------------------------------------------------------

  describe('removeCompetitionSnapshot - error handling', () => {
    it('handles multi exec error gracefully (lines 109-113)', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      // Make the multi chain throw during exec
      mockMulti.exec.mockRejectedValueOnce(new Error('Redis multi exec failed'));

      // Should not throw - just logs the warning
      await expect(
        redis.removeCompetitionSnapshot('comp-err')
      ).resolves.toBeUndefined();

      await redis.closeRedis();
    });

    it('handles multi() throwing an error', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      // Make multi() itself throw
      mockRedisInstance.multi.mockImplementationOnce(() => {
        throw new Error('Redis unavailable mid-operation');
      });

      await expect(
        redis.removeCompetitionSnapshot('comp-err2')
      ).resolves.toBeUndefined();

      await redis.closeRedis();
    });

    it('handles non-Error exception in removeCompetitionSnapshot', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      // Throw a string instead of Error
      mockMulti.exec.mockRejectedValueOnce('connection reset');

      await expect(
        redis.removeCompetitionSnapshot('comp-str-err')
      ).resolves.toBeUndefined();

      await redis.closeRedis();
    });
  });

  // -------------------------------------------------------------------------
  // getInterruptedCompetitions error path (lines 149-153)
  // -------------------------------------------------------------------------

  describe('getInterruptedCompetitions - error handling', () => {
    it('handles smembers error gracefully (lines 149-153)', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      // Make smembers throw
      mockRedisInstance.smembers.mockRejectedValueOnce(
        new Error('Redis SMEMBERS failed')
      );

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);

      await redis.closeRedis();
    });

    it('handles mget error gracefully', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockResolvedValueOnce(['comp-x']);
      mockRedisInstance.mget.mockRejectedValueOnce(
        new Error('Redis MGET timeout')
      );

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);

      await redis.closeRedis();
    });

    it('handles non-Error exception in getInterruptedCompetitions', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockRejectedValueOnce('unexpected failure');

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);

      await redis.closeRedis();
    });
  });

  // -------------------------------------------------------------------------
  // saveCompetitionSnapshot error path (already covered but extended)
  // -------------------------------------------------------------------------

  describe('saveCompetitionSnapshot - error handling', () => {
    it('handles multi exec error gracefully', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockMulti.exec.mockRejectedValueOnce(new Error('Redis write failed'));

      const snapshot = makeSnapshot();
      await expect(
        redis.saveCompetitionSnapshot(snapshot)
      ).resolves.toBeUndefined();

      await redis.closeRedis();
    });

    it('handles non-Error exception in saveCompetitionSnapshot', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockMulti.exec.mockRejectedValueOnce(42);

      const snapshot = makeSnapshot();
      await expect(
        redis.saveCompetitionSnapshot(snapshot)
      ).resolves.toBeUndefined();

      await redis.closeRedis();
    });
  });

  // -------------------------------------------------------------------------
  // initRedis error handling extensions
  // -------------------------------------------------------------------------

  describe('initRedis - additional error handling', () => {
    it('handles non-Error connection failure', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockRejectedValueOnce('network down');

      const result = await redis.initRedis();
      expect(result).toBe(false);
      expect(redis.isRedisAvailable()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // closeRedis additional scenarios
  // -------------------------------------------------------------------------

  describe('closeRedis - additional scenarios', () => {
    it('disconnect is called when quit rejects', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.quit.mockRejectedValueOnce(new Error('quit error'));

      await redis.closeRedis();

      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
      expect(redis.isRedisAvailable()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getInterruptedCompetitions - mixed valid/invalid data
  // -------------------------------------------------------------------------

  describe('getInterruptedCompetitions - mixed data scenarios', () => {
    it('returns only valid snapshots from mixed results', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      const validSnap = makeSnapshot({ competitionId: 'comp-valid' });
      mockRedisInstance.smembers.mockResolvedValueOnce([
        'comp-valid',
        'comp-corrupt',
        'comp-expired',
      ]);
      mockRedisInstance.mget.mockResolvedValueOnce([
        JSON.stringify(validSnap),
        '{invalid json',
        null,
      ]);
      mockRedisInstance.srem.mockResolvedValue(1);
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([validSnap]);
      // Corrupt entry cleaned up
      expect(mockRedisInstance.srem).toHaveBeenCalledWith(
        'aio:active-competitions',
        'comp-corrupt'
      );
      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        'aio:competition:comp-corrupt'
      );
      // Expired entry cleaned up
      expect(mockRedisInstance.srem).toHaveBeenCalledWith(
        'aio:active-competitions',
        'comp-expired'
      );

      await redis.closeRedis();
    });

    it('returns empty array when all entries are expired', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      mockRedisInstance.smembers.mockResolvedValueOnce(['x', 'y']);
      mockRedisInstance.mget.mockResolvedValueOnce([null, null]);
      mockRedisInstance.srem.mockResolvedValue(1);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toEqual([]);
      expect(mockRedisInstance.srem).toHaveBeenCalledTimes(2);

      await redis.closeRedis();
    });

    it('returns multiple valid snapshots', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();

      const snap1 = makeSnapshot({ competitionId: 'a' });
      const snap2 = makeSnapshot({ competitionId: 'b', name: 'Second' });
      const snap3 = makeSnapshot({ competitionId: 'c', name: 'Third' });

      mockRedisInstance.smembers.mockResolvedValueOnce(['a', 'b', 'c']);
      mockRedisInstance.mget.mockResolvedValueOnce([
        JSON.stringify(snap1),
        JSON.stringify(snap2),
        JSON.stringify(snap3),
      ]);

      const result = await redis.getInterruptedCompetitions();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(snap1);
      expect(result[1]).toEqual(snap2);
      expect(result[2]).toEqual(snap3);

      await redis.closeRedis();
    });
  });

  // -------------------------------------------------------------------------
  // isRedisAvailable edge case
  // -------------------------------------------------------------------------

  describe('isRedisAvailable - edge cases', () => {
    it('returns false after closeRedis', async () => {
      const redis = await import('./redis.js');
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      await redis.initRedis();
      expect(redis.isRedisAvailable()).toBe(true);

      await redis.closeRedis();
      expect(redis.isRedisAvailable()).toBe(false);
    });
  });
});
