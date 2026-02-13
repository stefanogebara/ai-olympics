import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock supabase before importing elo-service
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), rpc: vi.fn() })),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
}));

// Import after mock is set up
const { expectedScore, getKFactor, calculateMultiPlayerElo } = await import('./elo-service.js');

describe('ELO Service - Pure Functions', () => {
  describe('expectedScore', () => {
    it('returns 0.5 for equally rated players', () => {
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns higher expected score for higher-rated player', () => {
      const score = expectedScore(1800, 1500);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1.0);
    });

    it('returns lower expected score for lower-rated player', () => {
      const score = expectedScore(1200, 1500);
      expect(score).toBeGreaterThan(0.0);
      expect(score).toBeLessThan(0.5);
    });

    it('expected scores of two opponents sum to 1', () => {
      const a = expectedScore(1600, 1400);
      const b = expectedScore(1400, 1600);
      expect(a + b).toBeCloseTo(1.0, 10);
    });

    it('returns ~0.76 for 200-point advantage (well-known ELO property)', () => {
      expect(expectedScore(1700, 1500)).toBeCloseTo(0.7597, 3);
    });
  });

  describe('getKFactor', () => {
    it('returns 40 for provisional players (< 10 games)', () => {
      expect(getKFactor(0)).toBe(40);
      expect(getKFactor(5)).toBe(40);
      expect(getKFactor(9)).toBe(40);
    });

    it('returns 32 for established players (>= 10 games)', () => {
      expect(getKFactor(10)).toBe(32);
      expect(getKFactor(50)).toBe(32);
      expect(getKFactor(1000)).toBe(32);
    });
  });

  describe('calculateMultiPlayerElo', () => {
    it('winner gains rating, loser loses rating in 2-player match', () => {
      const agents = [
        { id: 'a', elo_rating: 1500, total_competitions: 20 },
        { id: 'b', elo_rating: 1500, total_competitions: 20 },
      ];
      const rankings = new Map([['a', 1], ['b', 2]]);

      const results = calculateMultiPlayerElo(agents, rankings, 2);

      const a = results.get('a')!;
      const b = results.get('b')!;

      expect(a.change).toBeGreaterThan(0);
      expect(b.change).toBeLessThan(0);
      expect(a.change).toBe(-b.change);
    });

    it('higher-rated player gains less for beating lower-rated', () => {
      const agents = [
        { id: 'strong', elo_rating: 1800, total_competitions: 20 },
        { id: 'weak', elo_rating: 1200, total_competitions: 20 },
      ];
      const rankings = new Map([['strong', 1], ['weak', 2]]);

      const results = calculateMultiPlayerElo(agents, rankings, 2);

      const strong = results.get('strong')!;
      expect(strong.change).toBeGreaterThan(0);
      expect(strong.change).toBeLessThan(16);
    });

    it('upset win (lower-rated beats higher-rated) gives bigger change', () => {
      const agents = [
        { id: 'strong', elo_rating: 1800, total_competitions: 20 },
        { id: 'weak', elo_rating: 1200, total_competitions: 20 },
      ];
      const rankings = new Map([['weak', 1], ['strong', 2]]);

      const results = calculateMultiPlayerElo(agents, rankings, 2);

      const weak = results.get('weak')!;
      expect(weak.change).toBeGreaterThan(20);
    });

    it('handles 4-player competition correctly', () => {
      const agents = [
        { id: 'a', elo_rating: 1500, total_competitions: 20 },
        { id: 'b', elo_rating: 1500, total_competitions: 20 },
        { id: 'c', elo_rating: 1500, total_competitions: 20 },
        { id: 'd', elo_rating: 1500, total_competitions: 20 },
      ];
      const rankings = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);

      const results = calculateMultiPlayerElo(agents, rankings, 4);

      const changes = ['a', 'b', 'c', 'd'].map(id => results.get(id)!.change);
      expect(changes[0]).toBeGreaterThan(0);
      expect(changes[3]).toBeLessThan(0);
      const sum = changes.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum)).toBeLessThanOrEqual(4);
    });

    it('enforces minimum rating of 100', () => {
      const agents = [
        { id: 'strong', elo_rating: 1500, total_competitions: 20 },
        { id: 'weak', elo_rating: 100, total_competitions: 0 },
      ];
      const rankings = new Map([['strong', 1], ['weak', 2]]);

      const results = calculateMultiPlayerElo(agents, rankings, 2);
      const weak = results.get('weak')!;
      expect(weak.ratingAfter).toBeGreaterThanOrEqual(100);
    });

    it('provisional players (K=40) have larger rating swings', () => {
      const provisionalAgents = [
        { id: 'a', elo_rating: 1500, total_competitions: 2 },
        { id: 'b', elo_rating: 1500, total_competitions: 2 },
      ];
      const establishedAgents = [
        { id: 'a', elo_rating: 1500, total_competitions: 50 },
        { id: 'b', elo_rating: 1500, total_competitions: 50 },
      ];
      const rankings = new Map([['a', 1], ['b', 2]]);

      const provResults = calculateMultiPlayerElo(provisionalAgents, rankings, 2);
      const estResults = calculateMultiPlayerElo(establishedAgents, rankings, 2);

      expect(Math.abs(provResults.get('a')!.change))
        .toBeGreaterThan(Math.abs(estResults.get('a')!.change));
    });

    it('handles tied ranks', () => {
      const agents = [
        { id: 'a', elo_rating: 1500, total_competitions: 20 },
        { id: 'b', elo_rating: 1500, total_competitions: 20 },
      ];
      const rankings = new Map([['a', 1], ['b', 1]]);

      const results = calculateMultiPlayerElo(agents, rankings, 2);

      expect(results.get('a')!.change).toBe(0);
      expect(results.get('b')!.change).toBe(0);
    });
  });
});
