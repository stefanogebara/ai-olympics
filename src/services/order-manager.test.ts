import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Test the platform fee and payout distribution logic
// These are pure math calculations extracted from settleCompetition()
// ============================================================================

describe('Order Manager - Payout Calculations', () => {
  // Pure math from settleCompetition:
  // netPool = grossPool * (1 - feePct / 100)
  // splits = [0.6, 0.3, 0.1]
  // payout_i = floor(netPool * splits[i])

  function calculatePayouts(
    grossPool: number,
    feePct: number,
    rankingCount: number
  ): { netPool: number; payouts: number[] } {
    const netPool = grossPool * (1 - feePct / 100);
    const splits = [0.6, 0.3, 0.1];
    const payouts: number[] = [];

    for (let i = 0; i < Math.min(rankingCount, splits.length); i++) {
      const amount = Math.floor(netPool * splits[i]);
      if (amount > 0) {
        payouts.push(amount);
      }
    }

    return { netPool, payouts };
  }

  describe('platform fee deduction', () => {
    it('deducts 10% default platform fee', () => {
      const { netPool } = calculatePayouts(10000, 10, 3);
      expect(netPool).toBe(9000);
    });

    it('deducts 0% fee', () => {
      const { netPool } = calculatePayouts(10000, 0, 3);
      expect(netPool).toBe(10000);
    });

    it('deducts 100% fee (edge case)', () => {
      const { netPool } = calculatePayouts(10000, 100, 3);
      expect(netPool).toBe(0);
    });

    it('handles fractional fee percentages', () => {
      const { netPool } = calculatePayouts(10000, 7.5, 3);
      expect(netPool).toBe(9250);
    });
  });

  describe('prize distribution', () => {
    it('distributes 60/30/10 split for 3+ players', () => {
      const { payouts } = calculatePayouts(10000, 10, 4);
      // netPool = 9000
      expect(payouts).toEqual([5400, 2700, 900]);
    });

    it('distributes to 2 players (only 1st and 2nd get prizes)', () => {
      const { payouts } = calculatePayouts(10000, 10, 2);
      // netPool = 9000
      expect(payouts).toEqual([5400, 2700]);
    });

    it('distributes to 1 player (only 1st gets prize)', () => {
      const { payouts } = calculatePayouts(10000, 10, 1);
      expect(payouts).toEqual([5400]);
    });

    it('floors amounts (no fractional cents)', () => {
      // 3333 * 0.9 = 2999.7 -> splits: 1799.82 -> 1799
      const { payouts } = calculatePayouts(3333, 10, 3);
      payouts.forEach(p => {
        expect(p).toBe(Math.floor(p));
      });
    });

    it('returns empty payouts for zero prize pool', () => {
      const { payouts } = calculatePayouts(0, 10, 3);
      expect(payouts).toEqual([]);
    });

    it('total payouts never exceed net pool', () => {
      const testCases = [
        { gross: 10000, fee: 10, players: 4 },
        { gross: 1, fee: 0, players: 3 },
        { gross: 99999, fee: 15, players: 8 },
        { gross: 50, fee: 5, players: 2 },
      ];

      for (const tc of testCases) {
        const { netPool, payouts } = calculatePayouts(tc.gross, tc.fee, tc.players);
        const totalPaid = payouts.reduce((sum, p) => sum + p, 0);
        expect(totalPaid).toBeLessThanOrEqual(netPool);
      }
    });

    it('1st place always gets the most', () => {
      const { payouts } = calculatePayouts(10000, 10, 3);
      expect(payouts[0]).toBeGreaterThan(payouts[1]);
      expect(payouts[1]).toBeGreaterThan(payouts[2]);
    });
  });
});
