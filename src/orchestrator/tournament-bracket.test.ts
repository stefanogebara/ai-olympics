import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationBracket,
  generateRoundRobinSchedule,
  calculateRoundRobinStandings,
  generateSwissPairings,
  calculateSwissFinalStandings,
} from './tournament-bracket.js';
import type {
  AgentConfig,
  TournamentSeed,
  TournamentRound,
  TournamentMatch,
  TournamentMatchResult,
} from '../shared/types/index.js';

// ============================================================================
// HELPERS
// ============================================================================

const makeAgent = (id: string, name: string): AgentConfig => ({
  id,
  name,
  provider: 'anthropic' as const,
  model: 'test-model',
  color: '#000',
});

const makeSeed = (agentId: string, seedNumber: number): TournamentSeed => ({
  agentId,
  seedNumber,
});

const agents2 = [makeAgent('a1', 'Agent 1'), makeAgent('a2', 'Agent 2')];
const agents3 = [makeAgent('a1', 'A1'), makeAgent('a2', 'A2'), makeAgent('a3', 'A3')];
const agents4 = [
  makeAgent('a1', 'A1'),
  makeAgent('a2', 'A2'),
  makeAgent('a3', 'A3'),
  makeAgent('a4', 'A4'),
];
const agents5 = Array.from({ length: 5 }, (_, i) => makeAgent(`a${i + 1}`, `Agent ${i + 1}`));
const agents8 = Array.from({ length: 8 }, (_, i) => makeAgent(`a${i + 1}`, `Agent ${i + 1}`));
const agents6 = Array.from({ length: 6 }, (_, i) => makeAgent(`a${i + 1}`, `Agent ${i + 1}`));

const makeSeeds = (agents: AgentConfig[]): TournamentSeed[] =>
  agents.map((a, i) => makeSeed(a.id, i + 1));

/**
 * Build a completed match for testing standings calculations.
 */
function makeCompletedMatch(
  id: string,
  roundId: string,
  matchNumber: number,
  agentIds: [string, string],
  winnerId: string | undefined,
  scores: [number, number]
): TournamentMatch {
  return {
    id,
    roundId,
    matchNumber,
    agentIds,
    results: agentIds.map((agentId, i) => ({
      agentId,
      score: scores[i],
      tasksWon: winnerId === agentId ? 1 : 0,
      tasksPlayed: 1,
    })) as TournamentMatchResult[],
    status: 'completed',
    isBye: false,
    winnerId,
  };
}

function makeCompletedRound(
  roundNumber: number,
  matches: TournamentMatch[]
): TournamentRound {
  return {
    id: `round-${roundNumber}`,
    roundNumber,
    name: `Round ${roundNumber}`,
    status: 'completed',
    matches,
    advancingAgentIds: [],
    eliminatedAgentIds: [],
  };
}

// ============================================================================
// generateSingleEliminationBracket
// ============================================================================

describe('generateSingleEliminationBracket', () => {
  describe('2 agents', () => {
    const seeds = makeSeeds(agents2);
    const result = generateSingleEliminationBracket(agents2, seeds);

    it('creates exactly 1 round', () => {
      expect(result.rounds).toHaveLength(1);
    });

    it('names the single round "Finals"', () => {
      expect(result.rounds[0].name).toBe('Finals');
    });

    it('creates 1 match in that round', () => {
      expect(result.rounds[0].matches).toHaveLength(1);
    });

    it('has no bye matches', () => {
      expect(result.rounds[0].matches.every((m) => !m.isBye)).toBe(true);
    });

    it('includes both agents in the match', () => {
      const matchAgents = result.rounds[0].matches[0].agentIds;
      expect(matchAgents).toHaveLength(2);
      expect(matchAgents).toContain('a1');
      expect(matchAgents).toContain('a2');
    });

    it('creates 1 bracket node', () => {
      expect(result.bracket).toHaveLength(1);
    });

    it('bracket node has no parentNodes', () => {
      expect(result.bracket[0].parentNodes).toHaveLength(0);
    });

    it('bracket node has no childNode', () => {
      expect(result.bracket[0].childNode).toBeUndefined();
    });
  });

  describe('4 agents', () => {
    const seeds = makeSeeds(agents4);
    const result = generateSingleEliminationBracket(agents4, seeds);

    it('creates 2 rounds', () => {
      expect(result.rounds).toHaveLength(2);
    });

    it('names the first round "Semifinals" and the second "Finals"', () => {
      expect(result.rounds[0].name).toBe('Semifinals');
      expect(result.rounds[1].name).toBe('Finals');
    });

    it('has 2 matches in the first round', () => {
      expect(result.rounds[0].matches).toHaveLength(2);
    });

    it('has 1 match in the finals', () => {
      expect(result.rounds[1].matches).toHaveLength(1);
    });

    it('has no bye matches', () => {
      const allMatches = result.rounds.flatMap((r) => r.matches);
      expect(allMatches.every((m) => !m.isBye)).toBe(true);
    });

    it('seeds #1 vs #3 and #4 vs #2 (standard bracket seeding)', () => {
      const r1Matches = result.rounds[0].matches;
      const pairings = r1Matches.map((m) => new Set(m.agentIds));
      // Standard bracket seeding for 4: positions [0,3,1,2]
      // seed1->pos0, seed2->pos3, seed3->pos1, seed4->pos2
      // Match 1: pos0 vs pos1 = seed1 vs seed3
      // Match 2: pos2 vs pos3 = seed4 vs seed2
      const match1Correct = pairings.some(
        (s) => s.has('a1') && s.has('a3')
      );
      const match2Correct = pairings.some(
        (s) => s.has('a2') && s.has('a4')
      );
      expect(match1Correct).toBe(true);
      expect(match2Correct).toBe(true);
    });

    it('creates 3 bracket nodes total (2 first round + 1 finals)', () => {
      expect(result.bracket).toHaveLength(3);
    });

    it('finals node has 2 parentNodes', () => {
      const finalsNode = result.bracket.find((n) => n.roundNumber === 2);
      expect(finalsNode).toBeDefined();
      expect(finalsNode!.parentNodes).toHaveLength(2);
    });

    it('first round nodes have childNode pointing to finals', () => {
      const firstRoundNodes = result.bracket.filter((n) => n.roundNumber === 1);
      const finalsNode = result.bracket.find((n) => n.roundNumber === 2);
      firstRoundNodes.forEach((node) => {
        expect(node.childNode).toBe(finalsNode!.id);
      });
    });
  });

  describe('8 agents', () => {
    const seeds = makeSeeds(agents8);
    const result = generateSingleEliminationBracket(agents8, seeds);

    it('creates 3 rounds', () => {
      expect(result.rounds).toHaveLength(3);
    });

    it('names rounds Quarterfinals, Semifinals, Finals', () => {
      expect(result.rounds[0].name).toBe('Quarterfinals');
      expect(result.rounds[1].name).toBe('Semifinals');
      expect(result.rounds[2].name).toBe('Finals');
    });

    it('has 4, 2, 1 matches per round', () => {
      expect(result.rounds[0].matches).toHaveLength(4);
      expect(result.rounds[1].matches).toHaveLength(2);
      expect(result.rounds[2].matches).toHaveLength(1);
    });

    it('has no bye matches', () => {
      const allMatches = result.rounds.flatMap((r) => r.matches);
      expect(allMatches.every((m) => !m.isBye)).toBe(true);
    });

    it('creates 7 bracket nodes total (4+2+1)', () => {
      expect(result.bracket).toHaveLength(7);
    });

    it('seed #1 does not face seed #2 in the first round', () => {
      const r1Matches = result.rounds[0].matches;
      const hasTopTwoClash = r1Matches.some(
        (m) => m.agentIds.includes('a1') && m.agentIds.includes('a2')
      );
      expect(hasTopTwoClash).toBe(false);
    });

    it('seed #1 and seed #2 are on opposite halves of the bracket', () => {
      const r1Matches = result.rounds[0].matches;
      const a1MatchIndex = r1Matches.findIndex((m) => m.agentIds.includes('a1'));
      const a2MatchIndex = r1Matches.findIndex((m) => m.agentIds.includes('a2'));
      // In a 4-match first round, opposite halves means one is in [0,1], other in [2,3]
      const a1Half = a1MatchIndex < 2 ? 'top' : 'bottom';
      const a2Half = a2MatchIndex < 2 ? 'top' : 'bottom';
      expect(a1Half).not.toBe(a2Half);
    });

    it('every agent appears in exactly one first-round match', () => {
      const agentAppearances = new Map<string, number>();
      result.rounds[0].matches.forEach((m) => {
        m.agentIds.forEach((id) => {
          agentAppearances.set(id, (agentAppearances.get(id) || 0) + 1);
        });
      });
      agents8.forEach((a) => {
        expect(agentAppearances.get(a.id)).toBe(1);
      });
    });
  });

  describe('3 agents (odd number, pads to 4)', () => {
    const seeds = makeSeeds(agents3);
    const result = generateSingleEliminationBracket(agents3, seeds);

    it('creates 2 rounds (bracket size is 4)', () => {
      expect(result.rounds).toHaveLength(2);
    });

    it('has exactly 1 bye match in the first round', () => {
      const byeMatches = result.rounds[0].matches.filter((m) => m.isBye);
      expect(byeMatches).toHaveLength(1);
    });

    it('bye match has status "bye"', () => {
      const byeMatch = result.rounds[0].matches.find((m) => m.isBye);
      expect(byeMatch!.status).toBe('bye');
    });

    it('bye match has winnerId set to the single agent', () => {
      const byeMatch = result.rounds[0].matches.find((m) => m.isBye);
      expect(byeMatch!.winnerId).toBeDefined();
      expect(byeMatch!.agentIds).toContain(byeMatch!.winnerId);
    });

    it('bye match has exactly 1 agentId', () => {
      const byeMatch = result.rounds[0].matches.find((m) => m.isBye);
      expect(byeMatch!.agentIds).toHaveLength(1);
    });

    it('non-bye match has 2 agents', () => {
      const normalMatch = result.rounds[0].matches.find((m) => !m.isBye);
      expect(normalMatch!.agentIds).toHaveLength(2);
    });

    it('advancing agents include the bye winner', () => {
      const byeMatch = result.rounds[0].matches.find((m) => m.isBye);
      expect(result.rounds[0].advancingAgentIds).toContain(byeMatch!.winnerId);
    });
  });

  describe('5 agents (pads to 8, 3 byes)', () => {
    const seeds = makeSeeds(agents5);
    const result = generateSingleEliminationBracket(agents5, seeds);

    it('creates 3 rounds (bracket size is 8)', () => {
      expect(result.rounds).toHaveLength(3);
    });

    it('has exactly 3 bye matches in the first round', () => {
      const byeMatches = result.rounds[0].matches.filter((m) => m.isBye);
      expect(byeMatches).toHaveLength(3);
    });

    it('has exactly 1 non-bye match in the first round', () => {
      const normalMatches = result.rounds[0].matches.filter((m) => !m.isBye);
      expect(normalMatches).toHaveLength(1);
    });

    it('all bye matches have winnerId set', () => {
      const byeMatches = result.rounds[0].matches.filter((m) => m.isBye);
      byeMatches.forEach((m) => {
        expect(m.winnerId).toBeDefined();
      });
    });

    it('has 4 first-round matches total (8/2)', () => {
      expect(result.rounds[0].matches).toHaveLength(4);
    });
  });

  describe('round naming', () => {
    it('16 agents: Round 1, Quarterfinals, Semifinals, Finals', () => {
      const agents16 = Array.from({ length: 16 }, (_, i) =>
        makeAgent(`a${i + 1}`, `Agent ${i + 1}`)
      );
      const seeds = makeSeeds(agents16);
      const result = generateSingleEliminationBracket(agents16, seeds);
      expect(result.rounds).toHaveLength(4);
      expect(result.rounds[0].name).toBe('Round 1');
      expect(result.rounds[1].name).toBe('Quarterfinals');
      expect(result.rounds[2].name).toBe('Semifinals');
      expect(result.rounds[3].name).toBe('Finals');
    });

    it('32 agents: Round 1, Round 2, Quarterfinals, Semifinals, Finals', () => {
      const agents32 = Array.from({ length: 32 }, (_, i) =>
        makeAgent(`a${i + 1}`, `Agent ${i + 1}`)
      );
      const seeds = makeSeeds(agents32);
      const result = generateSingleEliminationBracket(agents32, seeds);
      expect(result.rounds).toHaveLength(5);
      expect(result.rounds[0].name).toBe('Round 1');
      expect(result.rounds[1].name).toBe('Round 2');
      expect(result.rounds[2].name).toBe('Quarterfinals');
      expect(result.rounds[3].name).toBe('Semifinals');
      expect(result.rounds[4].name).toBe('Finals');
    });
  });

  describe('bracket node linking', () => {
    const seeds = makeSeeds(agents8);
    const result = generateSingleEliminationBracket(agents8, seeds);

    it('first round nodes have empty parentNodes', () => {
      const r1Nodes = result.bracket.filter((n) => n.roundNumber === 1);
      r1Nodes.forEach((node) => {
        expect(node.parentNodes).toHaveLength(0);
      });
    });

    it('later round nodes have exactly 2 parentNodes', () => {
      const laterNodes = result.bracket.filter((n) => n.roundNumber > 1);
      laterNodes.forEach((node) => {
        expect(node.parentNodes).toHaveLength(2);
      });
    });

    it('finals node has no childNode', () => {
      const finalsNode = result.bracket.find(
        (n) => n.roundNumber === result.rounds.length
      );
      expect(finalsNode!.childNode).toBeUndefined();
    });

    it('every non-finals node has a childNode', () => {
      const maxRound = result.rounds.length;
      const nonFinalsNodes = result.bracket.filter((n) => n.roundNumber < maxRound);
      nonFinalsNodes.forEach((node) => {
        expect(node.childNode).toBeDefined();
      });
    });

    it('parentNode references point to valid node IDs', () => {
      const nodeIds = new Set(result.bracket.map((n) => n.id));
      const laterNodes = result.bracket.filter((n) => n.roundNumber > 1);
      laterNodes.forEach((node) => {
        node.parentNodes.forEach((parentId) => {
          expect(nodeIds.has(parentId)).toBe(true);
        });
      });
    });

    it('childNode references point to valid node IDs', () => {
      const nodeIds = new Set(result.bracket.map((n) => n.id));
      result.bracket
        .filter((n) => n.childNode !== undefined)
        .forEach((node) => {
          expect(nodeIds.has(node.childNode!)).toBe(true);
        });
    });
  });

  describe('match and round IDs', () => {
    const seeds = makeSeeds(agents8);
    const result = generateSingleEliminationBracket(agents8, seeds);

    it('each match has a unique ID', () => {
      const allMatches = result.rounds.flatMap((r) => r.matches);
      const ids = allMatches.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each round has a unique ID', () => {
      const ids = result.rounds.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('match roundId references match the containing round ID', () => {
      result.rounds.forEach((round) => {
        round.matches.forEach((match) => {
          expect(match.roundId).toBe(round.id);
        });
      });
    });

    it('round numbers are sequential starting from 1', () => {
      result.rounds.forEach((round, i) => {
        expect(round.roundNumber).toBe(i + 1);
      });
    });
  });

  describe('all first-round matches start pending or bye', () => {
    const seeds = makeSeeds(agents5);
    const result = generateSingleEliminationBracket(agents5, seeds);

    it('non-bye matches are pending', () => {
      result.rounds[0].matches
        .filter((m) => !m.isBye)
        .forEach((m) => {
          expect(m.status).toBe('pending');
        });
    });

    it('bye matches have status "bye"', () => {
      result.rounds[0].matches
        .filter((m) => m.isBye)
        .forEach((m) => {
          expect(m.status).toBe('bye');
        });
    });
  });

  describe('subsequent rounds start empty', () => {
    const seeds = makeSeeds(agents8);
    const result = generateSingleEliminationBracket(agents8, seeds);

    it('later round matches have empty agentIds', () => {
      result.rounds.slice(1).forEach((round) => {
        round.matches.forEach((m) => {
          expect(m.agentIds).toHaveLength(0);
        });
      });
    });

    it('later round matches are pending', () => {
      result.rounds.slice(1).forEach((round) => {
        round.matches.forEach((m) => {
          expect(m.status).toBe('pending');
        });
      });
    });
  });
});

// ============================================================================
// generateRoundRobinSchedule
// ============================================================================

describe('generateRoundRobinSchedule', () => {
  describe('4 agents (even)', () => {
    const rounds = generateRoundRobinSchedule(agents4);

    it('creates 3 rounds (n-1)', () => {
      expect(rounds).toHaveLength(3);
    });

    it('each round has 2 matches (n/2)', () => {
      rounds.forEach((round) => {
        expect(round.matches).toHaveLength(2);
      });
    });

    it('every pair plays exactly once', () => {
      const pairings = new Set<string>();
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          const pair = [...match.agentIds].sort().join('-');
          expect(pairings.has(pair)).toBe(false);
          pairings.add(pair);
        });
      });
      // Total unique pairings = C(4,2) = 6
      expect(pairings.size).toBe(6);
    });

    it('each agent plays exactly 3 matches total (n-1)', () => {
      const appearances = new Map<string, number>();
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          match.agentIds.forEach((id) => {
            appearances.set(id, (appearances.get(id) || 0) + 1);
          });
        });
      });
      agents4.forEach((a) => {
        expect(appearances.get(a.id)).toBe(3);
      });
    });

    it('no agent plays itself', () => {
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          expect(new Set(match.agentIds).size).toBe(match.agentIds.length);
        });
      });
    });

    it('all matches have status pending', () => {
      rounds.forEach((round) => {
        round.matches.forEach((m) => {
          expect(m.status).toBe('pending');
        });
      });
    });

    it('all matches have isBye false', () => {
      rounds.forEach((round) => {
        round.matches.forEach((m) => {
          expect(m.isBye).toBe(false);
        });
      });
    });
  });

  describe('3 agents (odd, adds BYE internally)', () => {
    const rounds = generateRoundRobinSchedule(agents3);

    it('creates 3 rounds (n rounds after adding BYE)', () => {
      // With 3 agents, internal list becomes [a1, a2, a3, BYE] -> 3 rounds
      expect(rounds).toHaveLength(3);
    });

    it('each round has 1 match (one agent sits out per round)', () => {
      rounds.forEach((round) => {
        expect(round.matches).toHaveLength(1);
      });
    });

    it('every agent pair plays exactly once', () => {
      const pairings = new Set<string>();
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          const pair = [...match.agentIds].sort().join('-');
          pairings.add(pair);
        });
      });
      // C(3,2) = 3
      expect(pairings.size).toBe(3);
    });

    it('each agent plays exactly 2 matches (n-1)', () => {
      const appearances = new Map<string, number>();
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          match.agentIds.forEach((id) => {
            appearances.set(id, (appearances.get(id) || 0) + 1);
          });
        });
      });
      agents3.forEach((a) => {
        expect(appearances.get(a.id)).toBe(2);
      });
    });

    it('no match contains the BYE agent ID', () => {
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          expect(match.agentIds).not.toContain('BYE');
        });
      });
    });
  });

  describe('2 agents', () => {
    const rounds = generateRoundRobinSchedule(agents2);

    it('creates 1 round', () => {
      expect(rounds).toHaveLength(1);
    });

    it('has 1 match with both agents', () => {
      expect(rounds[0].matches).toHaveLength(1);
      expect(rounds[0].matches[0].agentIds).toContain('a1');
      expect(rounds[0].matches[0].agentIds).toContain('a2');
    });
  });

  describe('6 agents', () => {
    const rounds = generateRoundRobinSchedule(agents6);

    it('creates 5 rounds (n-1)', () => {
      expect(rounds).toHaveLength(5);
    });

    it('each round has 3 matches (n/2)', () => {
      rounds.forEach((round) => {
        expect(round.matches).toHaveLength(3);
      });
    });

    it('total of 15 unique pairings (C(6,2))', () => {
      const pairings = new Set<string>();
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          const pair = [...match.agentIds].sort().join('-');
          pairings.add(pair);
        });
      });
      expect(pairings.size).toBe(15);
    });

    it('no duplicate pairings across all rounds', () => {
      const pairings: string[] = [];
      rounds.forEach((round) => {
        round.matches.forEach((match) => {
          pairings.push([...match.agentIds].sort().join('-'));
        });
      });
      expect(new Set(pairings).size).toBe(pairings.length);
    });
  });

  describe('round metadata', () => {
    const rounds = generateRoundRobinSchedule(agents4);

    it('rounds are named "Round N"', () => {
      rounds.forEach((round, i) => {
        expect(round.name).toBe(`Round ${i + 1}`);
      });
    });

    it('round numbers are sequential starting from 1', () => {
      rounds.forEach((round, i) => {
        expect(round.roundNumber).toBe(i + 1);
      });
    });

    it('round IDs follow the pattern "round-N"', () => {
      rounds.forEach((round, i) => {
        expect(round.id).toBe(`round-${i + 1}`);
      });
    });

    it('rounds have status pending', () => {
      rounds.forEach((round) => {
        expect(round.status).toBe('pending');
      });
    });

    it('advancingAgentIds and eliminatedAgentIds are empty', () => {
      rounds.forEach((round) => {
        expect(round.advancingAgentIds).toHaveLength(0);
        expect(round.eliminatedAgentIds).toHaveLength(0);
      });
    });
  });
});

// ============================================================================
// calculateRoundRobinStandings
// ============================================================================

describe('calculateRoundRobinStandings', () => {
  describe('empty rounds (no completed matches)', () => {
    const rounds = generateRoundRobinSchedule(agents4);
    const standings = calculateRoundRobinStandings(rounds, agents4);

    it('returns a standing for every agent', () => {
      expect(standings).toHaveLength(4);
    });

    it('all standings have 0 wins, losses, ties, and score', () => {
      standings.forEach((s) => {
        expect(s.matchesWon).toBe(0);
        expect(s.matchesLost).toBe(0);
        expect(s.matchesTied).toBe(0);
        expect(s.totalScore).toBe(0);
      });
    });

    it('assigns sequential ranks', () => {
      const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4]);
    });
  });

  describe('completed matches with clear winner', () => {
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        makeCompletedMatch('m1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
        makeCompletedMatch('m2', 'round-1', 2, ['a3', 'a4'], 'a3', [80, 30]),
      ]),
      makeCompletedRound(2, [
        makeCompletedMatch('m3', 'round-2', 1, ['a1', 'a3'], 'a1', [90, 70]),
        makeCompletedMatch('m4', 'round-2', 2, ['a2', 'a4'], 'a2', [60, 40]),
      ]),
    ];

    const standings = calculateRoundRobinStandings(rounds, agents4);

    it('a1 has 2 wins and rank 1', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.matchesWon).toBe(2);
      expect(a1.matchesLost).toBe(0);
      expect(a1.rank).toBe(1);
    });

    it('a1 has totalScore = 190 (100 + 90)', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.totalScore).toBe(190);
    });

    it('a3 has 1 win, 1 loss', () => {
      const a3 = standings.find((s) => s.agentId === 'a3')!;
      expect(a3.matchesWon).toBe(1);
      expect(a3.matchesLost).toBe(1);
    });

    it('a4 has 0 wins, 2 losses', () => {
      const a4 = standings.find((s) => s.agentId === 'a4')!;
      expect(a4.matchesWon).toBe(0);
      expect(a4.matchesLost).toBe(2);
    });

    it('standings are sorted by wins descending', () => {
      for (let i = 1; i < standings.length; i++) {
        expect(standings[i - 1].matchesWon).toBeGreaterThanOrEqual(standings[i].matchesWon);
      }
    });

    it('ranks are 1 through 4', () => {
      const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4]);
    });
  });

  describe('ties (no winnerId)', () => {
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        {
          id: 'm1',
          roundId: 'round-1',
          matchNumber: 1,
          agentIds: ['a1', 'a2'],
          results: [
            { agentId: 'a1', score: 50, tasksWon: 0, tasksPlayed: 1 },
            { agentId: 'a2', score: 50, tasksWon: 0, tasksPlayed: 1 },
          ] as TournamentMatchResult[],
          status: 'completed',
          isBye: false,
          winnerId: undefined,
        },
      ]),
    ];

    const standings = calculateRoundRobinStandings(rounds, agents2);

    it('both agents have 1 tie each', () => {
      standings.forEach((s) => {
        expect(s.matchesTied).toBe(1);
        expect(s.matchesWon).toBe(0);
        expect(s.matchesLost).toBe(0);
      });
    });
  });

  describe('tiebreaker by totalScore', () => {
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        makeCompletedMatch('m1', 'round-1', 1, ['a1', 'a3'], 'a1', [100, 30]),
        makeCompletedMatch('m2', 'round-1', 2, ['a2', 'a4'], 'a2', [200, 10]),
      ]),
    ];

    const standings = calculateRoundRobinStandings(rounds, agents4);

    it('a2 ranks higher than a1 when both have 1 win but a2 has higher score', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      const a2 = standings.find((s) => s.agentId === 'a2')!;
      expect(a2.rank).toBeLessThan(a1.rank);
    });
  });

  describe('pending matches are ignored', () => {
    const rounds: TournamentRound[] = [
      {
        id: 'round-1',
        roundNumber: 1,
        name: 'Round 1',
        status: 'pending',
        matches: [
          {
            id: 'm1',
            roundId: 'round-1',
            matchNumber: 1,
            agentIds: ['a1', 'a2'],
            results: [],
            status: 'pending',
            isBye: false,
          },
        ],
        advancingAgentIds: [],
        eliminatedAgentIds: [],
      },
    ];

    const standings = calculateRoundRobinStandings(rounds, agents2);

    it('does not count pending matches', () => {
      standings.forEach((s) => {
        expect(s.matchesWon).toBe(0);
        expect(s.matchesLost).toBe(0);
        expect(s.matchesTied).toBe(0);
        expect(s.totalScore).toBe(0);
      });
    });
  });

  describe('agent names are preserved', () => {
    const rounds: TournamentRound[] = [];
    const standings = calculateRoundRobinStandings(rounds, agents4);

    it('each standing has the correct agentName', () => {
      agents4.forEach((agent) => {
        const standing = standings.find((s) => s.agentId === agent.id);
        expect(standing).toBeDefined();
        expect(standing!.agentName).toBe(agent.name);
      });
    });
  });
});

// ============================================================================
// generateSwissPairings
// ============================================================================

describe('generateSwissPairings', () => {
  describe('first round (no history)', () => {
    const round = generateSwissPairings(agents4, [], 1);

    it('returns a TournamentRound', () => {
      expect(round.id).toBe('round-1');
      expect(round.roundNumber).toBe(1);
      expect(round.name).toBe('Round 1');
    });

    it('creates 2 matches for 4 agents', () => {
      expect(round.matches).toHaveLength(2);
    });

    it('each match has 2 agents', () => {
      round.matches.forEach((m) => {
        expect(m.agentIds).toHaveLength(2);
      });
    });

    it('all agents are paired', () => {
      const allAgentIds = round.matches.flatMap((m) => m.agentIds);
      agents4.forEach((a) => {
        expect(allAgentIds).toContain(a.id);
      });
    });

    it('no byes with even number of agents', () => {
      expect(round.matches.every((m) => !m.isBye)).toBe(true);
    });

    it('all matches are pending', () => {
      round.matches.forEach((m) => {
        expect(m.status).toBe('pending');
      });
    });
  });

  describe('first round with odd agents (3 agents)', () => {
    const round = generateSwissPairings(agents3, [], 1);

    it('creates 2 matches: 1 regular + 1 bye', () => {
      expect(round.matches).toHaveLength(2);
    });

    it('one match is a bye', () => {
      const byeMatches = round.matches.filter((m) => m.isBye);
      expect(byeMatches).toHaveLength(1);
    });

    it('bye match has winnerId set', () => {
      const byeMatch = round.matches.find((m) => m.isBye)!;
      expect(byeMatch.winnerId).toBeDefined();
      expect(byeMatch.agentIds).toContain(byeMatch.winnerId);
    });

    it('bye match has status "bye"', () => {
      const byeMatch = round.matches.find((m) => m.isBye)!;
      expect(byeMatch.status).toBe('bye');
    });

    it('bye match has 1 agent', () => {
      const byeMatch = round.matches.find((m) => m.isBye)!;
      expect(byeMatch.agentIds).toHaveLength(1);
    });
  });

  describe('after 1 completed round, pairs by similar score', () => {
    // a1 beat a4 (a1=1pt), a2 beat a3 (a2=1pt), a3=0, a4=0
    const completedRound: TournamentRound = makeCompletedRound(1, [
      makeCompletedMatch('m-1-1', 'round-1', 1, ['a1', 'a4'], 'a1', [100, 20]),
      makeCompletedMatch('m-1-2', 'round-1', 2, ['a2', 'a3'], 'a2', [80, 30]),
    ]);

    const round2 = generateSwissPairings(agents4, [completedRound], 2);

    it('creates 2 matches', () => {
      expect(round2.matches).toHaveLength(2);
    });

    it('pairs winners together and losers together', () => {
      const matchAgentSets = round2.matches.map((m) =>
        new Set(m.agentIds)
      );
      // a1 (1pt) vs a2 (1pt) and a3 (0pt) vs a4 (0pt)
      const winnersMatch = matchAgentSets.find(
        (s) => s.has('a1') && s.has('a2')
      );
      const losersMatch = matchAgentSets.find(
        (s) => s.has('a3') && s.has('a4')
      );
      expect(winnersMatch).toBeDefined();
      expect(losersMatch).toBeDefined();
    });

    it('uses round number 2 in match IDs', () => {
      round2.matches.forEach((m) => {
        expect(m.id).toMatch(/^match-2-/);
      });
    });

    it('round ID is round-2', () => {
      expect(round2.id).toBe('round-2');
    });
  });

  describe('avoids re-pairing agents who already played', () => {
    // 4 agents, round 1: a1 vs a2, a3 vs a4
    // Now in round 2 they can't be re-paired
    const completedRound: TournamentRound = makeCompletedRound(1, [
      makeCompletedMatch('m-1-1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
      makeCompletedMatch('m-1-2', 'round-1', 2, ['a3', 'a4'], 'a3', [80, 40]),
    ]);

    const round2 = generateSwissPairings(agents4, [completedRound], 2);

    it('does not re-pair a1 with a2', () => {
      const hasRepair = round2.matches.some(
        (m) => m.agentIds.includes('a1') && m.agentIds.includes('a2')
      );
      expect(hasRepair).toBe(false);
    });

    it('does not re-pair a3 with a4', () => {
      const hasRepair = round2.matches.some(
        (m) => m.agentIds.includes('a3') && m.agentIds.includes('a4')
      );
      expect(hasRepair).toBe(false);
    });
  });

  describe('odd number assigns BYE to lowest-ranked unpaired', () => {
    const round = generateSwissPairings(agents5, [], 1);

    it('creates 3 matches total (2 regular + 1 bye)', () => {
      expect(round.matches).toHaveLength(3);
    });

    it('bye goes to the lowest-ranked agent', () => {
      const byeMatch = round.matches.find((m) => m.isBye)!;
      // All agents start at 0 points, sorted by initial order
      // The lowest-ranked unpaired agent gets the bye
      expect(byeMatch.agentIds).toHaveLength(1);
      expect(byeMatch.winnerId).toBeDefined();
    });
  });

  describe('match metadata', () => {
    const round = generateSwissPairings(agents4, [], 3);

    it('round number is set to the passed-in roundNumber', () => {
      expect(round.roundNumber).toBe(3);
    });

    it('match IDs contain the round number', () => {
      round.matches.forEach((m) => {
        expect(m.id).toMatch(/^match-3-/);
      });
    });

    it('match roundId references the round ID', () => {
      round.matches.forEach((m) => {
        expect(m.roundId).toBe('round-3');
      });
    });

    it('match numbers are sequential starting from 1', () => {
      round.matches.forEach((m, i) => {
        expect(m.matchNumber).toBe(i + 1);
      });
    });
  });
});

// ============================================================================
// calculateSwissFinalStandings
// ============================================================================

describe('calculateSwissFinalStandings', () => {
  describe('empty rounds', () => {
    const standings = calculateSwissFinalStandings(agents4, []);

    it('returns standings for all agents', () => {
      expect(standings).toHaveLength(4);
    });

    it('all have 0 Swiss points', () => {
      standings.forEach((s) => {
        expect(s.swissPoints).toBe(0);
      });
    });

    it('all have 0 tiebreaker', () => {
      standings.forEach((s) => {
        expect(s.tiebreaker).toBe(0);
      });
    });

    it('assigns sequential ranks', () => {
      const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4]);
    });
  });

  describe('single completed round', () => {
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        makeCompletedMatch('m1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
        makeCompletedMatch('m2', 'round-1', 2, ['a3', 'a4'], 'a3', [80, 30]),
      ]),
    ];

    const standings = calculateSwissFinalStandings(agents4, rounds);

    it('winners have 1 Swiss point', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      const a3 = standings.find((s) => s.agentId === 'a3')!;
      expect(a1.swissPoints).toBe(1);
      expect(a3.swissPoints).toBe(1);
    });

    it('losers have 0 Swiss points', () => {
      const a2 = standings.find((s) => s.agentId === 'a2')!;
      const a4 = standings.find((s) => s.agentId === 'a4')!;
      expect(a2.swissPoints).toBe(0);
      expect(a4.swissPoints).toBe(0);
    });

    it('tracks matchesWon and matchesLost', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.matchesWon).toBe(1);
      expect(a1.matchesLost).toBe(0);

      const a2 = standings.find((s) => s.agentId === 'a2')!;
      expect(a2.matchesWon).toBe(0);
      expect(a2.matchesLost).toBe(1);
    });

    it('tracks totalScore', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.totalScore).toBe(100);

      const a4 = standings.find((s) => s.agentId === 'a4')!;
      expect(a4.totalScore).toBe(30);
    });
  });

  describe('multiple completed rounds with Buchholz tiebreaker', () => {
    // Round 1: a1 beats a2, a3 beats a4
    // Round 2: a1 beats a3, a2 beats a4
    // After round 2: a1=2pts, a2=1pt, a3=1pt, a4=0pts
    // Buchholz for a2: opponents = [a1(2pts), a4(0pts)] = 2
    // Buchholz for a3: opponents = [a4(0pts), a1(2pts)] = 2
    // So a2 and a3 are tied on both swissPoints (1) and tiebreaker (2)
    // Then totalScore breaks the tie
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        makeCompletedMatch('m-1-1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
        makeCompletedMatch('m-1-2', 'round-1', 2, ['a3', 'a4'], 'a3', [80, 30]),
      ]),
      makeCompletedRound(2, [
        makeCompletedMatch('m-2-1', 'round-2', 1, ['a1', 'a3'], 'a1', [90, 60]),
        makeCompletedMatch('m-2-2', 'round-2', 2, ['a2', 'a4'], 'a2', [70, 20]),
      ]),
    ];

    const standings = calculateSwissFinalStandings(agents4, rounds);

    it('a1 is ranked #1 with 2 Swiss points', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.rank).toBe(1);
      expect(a1.swissPoints).toBe(2);
    });

    it('a4 is ranked last with 0 Swiss points', () => {
      const a4 = standings.find((s) => s.agentId === 'a4')!;
      expect(a4.rank).toBe(4);
      expect(a4.swissPoints).toBe(0);
    });

    it('a1 totalScore is 190', () => {
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.totalScore).toBe(190);
    });

    it('Buchholz tiebreaker is calculated (sum of opponents Swiss points)', () => {
      // a1 played a2(1pt) and a3(1pt) -> tiebreaker = 2
      const a1 = standings.find((s) => s.agentId === 'a1')!;
      expect(a1.tiebreaker).toBe(2);
    });

    it('a2 and a3 tied on swissPoints, resolved by tiebreaker then totalScore', () => {
      const a2 = standings.find((s) => s.agentId === 'a2')!;
      const a3 = standings.find((s) => s.agentId === 'a3')!;
      // Both have 1 swissPoint
      expect(a2.swissPoints).toBe(1);
      expect(a3.swissPoints).toBe(1);
      // Tiebreaker (Buchholz): a2 played a1(2pts)+a4(0pts)=2, a3 played a4(0pts)+a1(2pts)=2
      expect(a2.tiebreaker).toBe(2);
      expect(a3.tiebreaker).toBe(2);
      // totalScore: a3=140 vs a2=120, so a3 ranks higher
      expect(a3.totalScore).toBe(140);
      expect(a2.totalScore).toBe(120);
      expect(a3.rank).toBeLessThan(a2.rank);
    });
  });

  describe('different Buchholz tiebreakers resolve ranking', () => {
    // 6 agents, 2 rounds designed so that a2 and a5 end with 1 Swiss point each
    // but a2 played stronger opponents (higher Buchholz).
    // Round 1: a1 beats a2 (a1=1pt), a3 beats a4 (a3=1pt), a5 beats a6 (a5=1pt)
    // Round 2: a1 beats a3 (a1=2pt), a2 beats a6 (a2=1pt), a5 beats a4 (a5 stays 1pt, wait no 2pt)
    // Let me recalculate: a2=1pt, a5=2pt - not tied.
    // Better scenario:
    // Round 1: a1 beats a2, a3 beats a5, a4 beats a6
    // Round 2: a1 beats a3, a2 beats a4, a5 beats a6
    // After round 2: a1=2, a2=1, a3=1, a4=1, a5=1, a6=0
    // Buchholz for a2: opponents=[a1(2), a4(1)] = 3
    // Buchholz for a3: opponents=[a5(1), a1(2)] = 3
    // Buchholz for a4: opponents=[a6(0), a2(1)] = 1
    // Buchholz for a5: opponents=[a3(1), a6(0)] = 1
    // So a2,a3 have tiebreaker=3 and a4,a5 have tiebreaker=1
    // a2 vs a4: same swissPoints (1), different tiebreaker (3 vs 1) -> a2 ranks higher
    const agents6ForSwiss = Array.from({ length: 6 }, (_, i) =>
      makeAgent(`a${i + 1}`, `Agent ${i + 1}`)
    );
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        makeCompletedMatch('m-1-1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
        makeCompletedMatch('m-1-2', 'round-1', 2, ['a3', 'a5'], 'a3', [80, 40]),
        makeCompletedMatch('m-1-3', 'round-1', 3, ['a4', 'a6'], 'a4', [70, 30]),
      ]),
      makeCompletedRound(2, [
        makeCompletedMatch('m-2-1', 'round-2', 1, ['a1', 'a3'], 'a1', [90, 60]),
        makeCompletedMatch('m-2-2', 'round-2', 2, ['a2', 'a4'], 'a2', [85, 45]),
        makeCompletedMatch('m-2-3', 'round-2', 3, ['a5', 'a6'], 'a5', [75, 35]),
      ]),
    ];

    const standings = calculateSwissFinalStandings(agents6ForSwiss, rounds);

    it('agents with higher Buchholz rank above agents with lower Buchholz at same swissPoints', () => {
      const a2 = standings.find((s) => s.agentId === 'a2')!;
      const a4 = standings.find((s) => s.agentId === 'a4')!;
      // Both have 1 Swiss point, but a2 has Buchholz=3, a4 has Buchholz=1
      expect(a2.swissPoints).toBe(1);
      expect(a4.swissPoints).toBe(1);
      expect(a2.tiebreaker).toBeGreaterThan(a4.tiebreaker!);
      expect(a2.rank).toBeLessThan(a4.rank);
    });

    it('different Buchholz values cause ranking differentiation (lines 484-485)', () => {
      const a3 = standings.find((s) => s.agentId === 'a3')!;
      const a5 = standings.find((s) => s.agentId === 'a5')!;
      // a3: Buchholz = opponents [a5(1), a1(2)] = 3
      // a5: Buchholz = opponents [a3(1), a6(0)] = 1
      expect(a3.swissPoints).toBe(1);
      expect(a5.swissPoints).toBe(1);
      expect(a3.tiebreaker).toBe(3);
      expect(a5.tiebreaker).toBe(1);
      expect(a3.rank).toBeLessThan(a5.rank);
    });
  });

  describe('tied match (draw)', () => {
    const rounds: TournamentRound[] = [
      makeCompletedRound(1, [
        {
          id: 'm1',
          roundId: 'round-1',
          matchNumber: 1,
          agentIds: ['a1', 'a2'],
          results: [
            { agentId: 'a1', score: 50, tasksWon: 0, tasksPlayed: 1 },
            { agentId: 'a2', score: 50, tasksWon: 0, tasksPlayed: 1 },
          ] as TournamentMatchResult[],
          status: 'completed',
          isBye: false,
          winnerId: undefined,
        },
      ]),
    ];

    const standings = calculateSwissFinalStandings(agents2, rounds);

    it('both agents get 0.5 Swiss points for a draw', () => {
      standings.forEach((s) => {
        expect(s.swissPoints).toBe(0.5);
      });
    });

    it('both agents have 1 tie', () => {
      standings.forEach((s) => {
        expect(s.matchesTied).toBe(1);
        expect(s.matchesWon).toBe(0);
        expect(s.matchesLost).toBe(0);
      });
    });
  });

  describe('bye matches in Swiss', () => {
    const rounds: TournamentRound[] = [
      {
        id: 'round-1',
        roundNumber: 1,
        name: 'Round 1',
        status: 'completed',
        matches: [
          makeCompletedMatch('m1', 'round-1', 1, ['a1', 'a2'], 'a1', [100, 50]),
          {
            id: 'm2',
            roundId: 'round-1',
            matchNumber: 2,
            agentIds: ['a3'],
            results: [],
            status: 'bye',
            isBye: true,
            winnerId: 'a3',
          },
        ],
        advancingAgentIds: [],
        eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents3, rounds);

    it('bye winner gets 1 Swiss point', () => {
      const a3 = standings.find((s) => s.agentId === 'a3')!;
      expect(a3.swissPoints).toBe(1);
      expect(a3.matchesWon).toBe(1);
    });
  });

  describe('output shape', () => {
    const standings = calculateSwissFinalStandings(agents4, []);

    it('does not include opponents array (stripped from SwissStanding)', () => {
      standings.forEach((s) => {
        expect(s).not.toHaveProperty('opponents');
      });
    });

    it('includes swissPoints and tiebreaker fields', () => {
      standings.forEach((s) => {
        expect(s).toHaveProperty('swissPoints');
        expect(s).toHaveProperty('tiebreaker');
      });
    });

    it('includes standard standing fields', () => {
      standings.forEach((s) => {
        expect(s).toHaveProperty('agentId');
        expect(s).toHaveProperty('agentName');
        expect(s).toHaveProperty('rank');
        expect(s).toHaveProperty('matchesWon');
        expect(s).toHaveProperty('matchesLost');
        expect(s).toHaveProperty('matchesTied');
        expect(s).toHaveProperty('totalScore');
      });
    });
  });
});
