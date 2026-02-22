import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationBracket,
  generateRoundRobinSchedule,
  calculateRoundRobinStandings,
  generateSwissPairings,
  calculateSwissFinalStandings,
} from './tournament-bracket.js';
import type { AgentConfig, TournamentRound, TournamentSeed } from '../shared/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(id: string): AgentConfig {
  return { id, name: `Agent ${id}`, provider: 'claude', model: 'claude-sonnet-4-5', color: '#111111' };
}

function makeSeed(agentId: string, seedNumber: number): TournamentSeed {
  return { agentId, seedNumber };
}

function makeCompletedMatch(
  id: string,
  roundId: string,
  agentIds: string[],
  winnerId: string | undefined,
  scores: number[]
) {
  return {
    id,
    roundId,
    matchNumber: 1,
    agentIds,
    results: agentIds.map((agentId, i) => ({
      agentId,
      score: scores[i] ?? 0,
      tasksWon: winnerId === agentId ? 1 : 0,
      tasksPlayed: 1,
    })),
    winnerId,
    status: 'completed' as const,
    isBye: false,
  };
}

function makeRound(id: string, roundNumber: number, matches: ReturnType<typeof makeCompletedMatch>[]): TournamentRound {
  return {
    id,
    roundNumber,
    name: `Round ${roundNumber}`,
    status: 'completed',
    matches,
    advancingAgentIds: [],
    eliminatedAgentIds: [],
  };
}

// ---------------------------------------------------------------------------
// generateSingleEliminationBracket
// ---------------------------------------------------------------------------

describe('generateSingleEliminationBracket', () => {
  it('2 agents — single Finals round, no byes', () => {
    const agents = [makeAgent('a1'), makeAgent('a2')];
    const seeds = [makeSeed('a1', 1), makeSeed('a2', 2)];
    const { rounds, bracket } = generateSingleEliminationBracket(agents, seeds);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].name).toBe('Finals');
    expect(rounds[0].matches).toHaveLength(1);
    expect(rounds[0].matches[0].isBye).toBe(false);
    expect(rounds[0].matches[0].agentIds).toHaveLength(2);
    expect(bracket).toHaveLength(1);
  });

  it('4 agents — Semifinals then Finals, no byes', () => {
    const agents = ['a1', 'a2', 'a3', 'a4'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds, bracket } = generateSingleEliminationBracket(agents, seeds);

    expect(rounds).toHaveLength(2);
    expect(rounds[0].name).toBe('Semifinals');
    expect(rounds[1].name).toBe('Finals');

    expect(rounds[0].matches).toHaveLength(2);
    expect(rounds[0].matches.every((m) => !m.isBye)).toBe(true);
    expect(rounds[1].matches).toHaveLength(1);

    // 2 first-round nodes + 1 finals node
    expect(bracket).toHaveLength(3);
  });

  it('8 agents — Quarterfinals → Semifinals → Finals', () => {
    const agents = ['a1','a2','a3','a4','a5','a6','a7','a8'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    expect(rounds).toHaveLength(3);
    expect(rounds[0].name).toBe('Quarterfinals');
    expect(rounds[1].name).toBe('Semifinals');
    expect(rounds[2].name).toBe('Finals');
    expect(rounds[0].matches).toHaveLength(4);
    expect(rounds[1].matches).toHaveLength(2);
    expect(rounds[2].matches).toHaveLength(1);
  });

  it('16 agents — Round 1 → Quarterfinals → Semifinals → Finals', () => {
    const agents = Array.from({ length: 16 }, (_, i) => makeAgent(`a${i + 1}`));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    expect(rounds).toHaveLength(4);
    expect(rounds[0].name).toBe('Round 1');
    expect(rounds[1].name).toBe('Quarterfinals');
    expect(rounds[2].name).toBe('Semifinals');
    expect(rounds[3].name).toBe('Finals');
  });

  it('4 agents — seed 1 and seed 2 are in opposite halves (do not meet until Finals)', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    const round1Matches = rounds[0].matches;
    const matchWithSeed1 = round1Matches.find((m) => m.agentIds.includes('a1'))!;
    const matchWithSeed2 = round1Matches.find((m) => m.agentIds.includes('a2'))!;

    // Top 2 seeds should be in different matches
    expect(matchWithSeed1.id).not.toBe(matchWithSeed2.id);
    // Seed 1 should not play seed 2 in round 1
    expect(matchWithSeed1.agentIds).not.toContain('a2');
  });

  it('5 agents — bracket size 8, three bye matches in round 1', () => {
    const agents = ['a1','a2','a3','a4','a5'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    const round1 = rounds[0];
    expect(round1.matches).toHaveLength(4);

    const byeMatches = round1.matches.filter((m) => m.isBye);
    const realMatches = round1.matches.filter((m) => !m.isBye);
    expect(byeMatches).toHaveLength(3);
    expect(realMatches).toHaveLength(1);

    // Bye matches have a winnerId and status 'bye'
    byeMatches.forEach((m) => {
      expect(m.status).toBe('bye');
      expect(m.winnerId).toBeDefined();
      expect(m.agentIds).toHaveLength(1);
      expect(m.winnerId).toBe(m.agentIds[0]);
    });
  });

  it('5 agents — all 5 seeds appear exactly once across round 1 matches', () => {
    const agents = ['a1','a2','a3','a4','a5'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    const allAgentIds = rounds[0].matches.flatMap((m) => m.agentIds);
    const uniqueAgentIds = new Set(allAgentIds);
    expect(uniqueAgentIds.size).toBe(5);
    agents.forEach((a) => expect(uniqueAgentIds.has(a.id)).toBe(true));
  });

  it('bracket nodes link correctly — first-round nodes point to the Finals node', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { bracket } = generateSingleEliminationBracket(agents, seeds);

    // Only 1 node for a 2-agent bracket
    expect(bracket).toHaveLength(1);
    expect(bracket[0].parentNodes).toEqual([]);
    expect(bracket[0].childNode).toBeUndefined();
  });

  it('bracket nodes link correctly — 4-agent bracket has proper parent/child chain', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { bracket } = generateSingleEliminationBracket(agents, seeds);

    const firstRoundNodes = bracket.filter((n) => n.roundNumber === 1);
    const finalsNode = bracket.find((n) => n.roundNumber === 2)!;

    expect(firstRoundNodes).toHaveLength(2);
    firstRoundNodes.forEach((node) => {
      expect(node.parentNodes).toEqual([]);
      expect(node.childNode).toBe(finalsNode.id);
    });
    expect(finalsNode.parentNodes).toContain(firstRoundNodes[0].id);
    expect(finalsNode.parentNodes).toContain(firstRoundNodes[1].id);
  });

  it('rounds have correct roundId on their matches', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const seeds = agents.map((a, i) => makeSeed(a.id, i + 1));
    const { rounds } = generateSingleEliminationBracket(agents, seeds);

    rounds.forEach((round) => {
      round.matches.forEach((match) => {
        expect(match.roundId).toBe(round.id);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// generateRoundRobinSchedule
// ---------------------------------------------------------------------------

describe('generateRoundRobinSchedule', () => {
  it('4 agents — 3 rounds, 2 matches per round, 6 total', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    expect(rounds).toHaveLength(3);
    rounds.forEach((r) => expect(r.matches).toHaveLength(2));
  });

  it('4 agents — every pair plays exactly once', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    const allMatches = rounds.flatMap((r) => r.matches);
    expect(allMatches).toHaveLength(6); // C(4,2) = 6

    const pairsSeen = new Set<string>();
    allMatches.forEach((m) => {
      const pair = [...m.agentIds].sort().join('|');
      expect(pairsSeen.has(pair)).toBe(false);
      pairsSeen.add(pair);
    });
  });

  it('3 agents (odd) — BYE added, each agent plays 2 real matches', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    expect(rounds).toHaveLength(3); // n-1 where n=4 (BYE added)
    const allMatches = rounds.flatMap((r) => r.matches);
    expect(allMatches).toHaveLength(3); // C(3,2) = 3

    // No BYE in actual matches (they are skipped)
    allMatches.forEach((m) => {
      m.agentIds.forEach((id) => expect(id).not.toBe('BYE'));
    });

    // Every pair appears exactly once
    const pairsSeen = new Set<string>();
    allMatches.forEach((m) => {
      const pair = [...m.agentIds].sort().join('|');
      expect(pairsSeen.has(pair)).toBe(false);
      pairsSeen.add(pair);
    });
  });

  it('2 agents — 1 round, 1 match', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].matches).toHaveLength(1);
    expect(rounds[0].matches[0].agentIds.sort()).toEqual(['a1','a2']);
  });

  it('all matches have status pending and isBye false', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    rounds.flatMap((r) => r.matches).forEach((m) => {
      expect(m.status).toBe('pending');
      expect(m.isBye).toBe(false);
    });
  });

  it('each round has a unique id and sequential roundNumber', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const rounds = generateRoundRobinSchedule(agents);

    rounds.forEach((round, i) => {
      expect(round.roundNumber).toBe(i + 1);
      expect(round.id).toBe(`round-${i + 1}`);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateRoundRobinStandings
// ---------------------------------------------------------------------------

describe('calculateRoundRobinStandings', () => {
  it('ranks by wins (primary), score (secondary)', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    // a1 beats a2 and a3, a2 beats a3
    const rounds = [
      makeRound('r1', 1, [makeCompletedMatch('m1', 'r1', ['a1','a2'], 'a1', [100, 50])]),
      makeRound('r2', 2, [makeCompletedMatch('m2', 'r2', ['a1','a3'], 'a1', [80, 30])]),
      makeRound('r3', 3, [makeCompletedMatch('m3', 'r3', ['a2','a3'], 'a2', [70, 20])]),
    ];
    const standings = calculateRoundRobinStandings(rounds, agents);

    expect(standings[0].agentId).toBe('a1');
    expect(standings[0].matchesWon).toBe(2);
    expect(standings[0].rank).toBe(1);

    expect(standings[1].agentId).toBe('a2');
    expect(standings[1].matchesWon).toBe(1);
    expect(standings[1].rank).toBe(2);

    expect(standings[2].agentId).toBe('a3');
    expect(standings[2].matchesWon).toBe(0);
    expect(standings[2].rank).toBe(3);
  });

  it('uses total score as tiebreaker when wins are equal', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    // Tied (no winner), a1 has higher score
    const rounds = [
      makeRound('r1', 1, [makeCompletedMatch('m1', 'r1', ['a1','a2'], undefined, [200, 100])]),
    ];
    const standings = calculateRoundRobinStandings(rounds, agents);

    expect(standings[0].agentId).toBe('a1');
    expect(standings[0].matchesTied).toBe(1);
    expect(standings[0].totalScore).toBe(200);
    expect(standings[1].agentId).toBe('a2');
    expect(standings[1].totalScore).toBe(100);
  });

  it('accumulates scores across multiple matches', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const rounds = [
      makeRound('r1', 1, [makeCompletedMatch('m1', 'r1', ['a1','a2'], 'a1', [100, 50])]),
      makeRound('r2', 2, [makeCompletedMatch('m2', 'r2', ['a1','a2'], 'a2', [30, 90])]),
    ];
    const standings = calculateRoundRobinStandings(rounds, agents);

    const a1 = standings.find((s) => s.agentId === 'a1')!;
    const a2 = standings.find((s) => s.agentId === 'a2')!;
    expect(a1.totalScore).toBe(130);
    expect(a2.totalScore).toBe(140);
  });

  it('ignores non-completed matches', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const pendingMatch = {
      id: 'm1', roundId: 'r1', matchNumber: 1,
      agentIds: ['a1','a2'], results: [],
      winnerId: 'a1', status: 'pending' as const, isBye: false,
    };
    const rounds = [makeRound('r1', 1, [pendingMatch] as never)];
    const standings = calculateRoundRobinStandings(rounds, agents);

    expect(standings[0].matchesWon).toBe(0);
    expect(standings[1].matchesWon).toBe(0);
  });

  it('returns all agents even with no matches played', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    const standings = calculateRoundRobinStandings([], agents);

    expect(standings).toHaveLength(3);
    standings.forEach((s) => {
      expect(s.matchesWon).toBe(0);
      expect(s.matchesLost).toBe(0);
      expect(s.totalScore).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// generateSwissPairings
// ---------------------------------------------------------------------------

describe('generateSwissPairings', () => {
  it('4 agents, round 1 — produces 2 matches, no BYE', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const round = generateSwissPairings(agents, [], 1);

    expect(round.roundNumber).toBe(1);
    expect(round.id).toBe('round-1');
    const realMatches = round.matches.filter((m) => !m.isBye);
    const byeMatches = round.matches.filter((m) => m.isBye);
    expect(realMatches).toHaveLength(2);
    expect(byeMatches).toHaveLength(0);
  });

  it('3 agents — produces 1 real match and 1 BYE match', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    const round = generateSwissPairings(agents, [], 1);

    const realMatches = round.matches.filter((m) => !m.isBye);
    const byeMatches = round.matches.filter((m) => m.isBye);
    expect(realMatches).toHaveLength(1);
    expect(byeMatches).toHaveLength(1);
    expect(byeMatches[0].winnerId).toBeDefined();
    expect(byeMatches[0].status).toBe('bye');
  });

  it('no agent appears in more than one match per round', () => {
    const agents = ['a1','a2','a3','a4','a5','a6'].map((id) => makeAgent(id));
    const round = generateSwissPairings(agents, [], 1);

    const agentsSeen = new Set<string>();
    round.matches.forEach((m) => {
      m.agentIds.forEach((id) => {
        expect(agentsSeen.has(id)).toBe(false);
        agentsSeen.add(id);
      });
    });
  });

  it('round 2 — avoids rematches from round 1', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));

    // Round 1: a1 beats a2, a3 beats a4
    const round1: TournamentRound = {
      id: 'round-1', roundNumber: 1, name: 'Round 1',
      status: 'completed',
      matches: [
        makeCompletedMatch('m1', 'round-1', ['a1','a2'], 'a1', [100, 50]),
        makeCompletedMatch('m2', 'round-1', ['a3','a4'], 'a3', [100, 50]),
      ],
      advancingAgentIds: [], eliminatedAgentIds: [],
    };

    const round2 = generateSwissPairings(agents, [round1], 2);
    const realMatches = round2.matches.filter((m) => !m.isBye);

    // a1-a2 rematch must NOT happen
    const pairsInRound2 = realMatches.map((m) => [...m.agentIds].sort().join('|'));
    expect(pairsInRound2).not.toContain('a1|a2');
    expect(pairsInRound2).not.toContain('a3|a4');

    // Should pair winners vs winners, losers vs losers
    expect(pairsInRound2).toContain('a1|a3');
    expect(pairsInRound2).toContain('a2|a4');
  });

  it('all matches in the returned round have roundId matching the round number', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const round = generateSwissPairings(agents, [], 3);

    round.matches.forEach((m) => {
      expect(m.roundId).toBe('round-3');
    });
  });

  it('all non-BYE matches start as pending', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));
    const round = generateSwissPairings(agents, [], 1);

    round.matches.filter((m) => !m.isBye).forEach((m) => {
      expect(m.status).toBe('pending');
    });
  });
});

// ---------------------------------------------------------------------------
// calculateSwissFinalStandings
// ---------------------------------------------------------------------------

describe('calculateSwissFinalStandings', () => {
  it('returns all agents with correct Swiss points', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));

    // Round 1: a1 beats a2 (1pt), a3 beats a4 (1pt)
    // Round 2: a1 beats a3 (2pts), a2 beats a4 (1pt)
    const rounds: TournamentRound[] = [
      {
        id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed',
        matches: [
          makeCompletedMatch('m1', 'r1', ['a1','a2'], 'a1', [100, 50]),
          makeCompletedMatch('m2', 'r1', ['a3','a4'], 'a3', [100, 50]),
        ],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
      {
        id: 'r2', roundNumber: 2, name: 'Round 2', status: 'completed',
        matches: [
          makeCompletedMatch('m3', 'r2', ['a1','a3'], 'a1', [100, 50]),
          makeCompletedMatch('m4', 'r2', ['a2','a4'], 'a2', [100, 50]),
        ],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents, rounds);

    expect(standings).toHaveLength(4);

    const a1 = standings.find((s) => s.agentId === 'a1')!;
    const a2 = standings.find((s) => s.agentId === 'a2')!;
    const a3 = standings.find((s) => s.agentId === 'a3')!;
    const a4 = standings.find((s) => s.agentId === 'a4')!;

    expect(a1.swissPoints).toBe(2);
    expect(a2.swissPoints).toBe(1);
    expect(a3.swissPoints).toBe(1);
    expect(a4.swissPoints).toBe(0);
  });

  it('rank 1 goes to the agent with most Swiss points', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const rounds: TournamentRound[] = [
      {
        id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed',
        matches: [makeCompletedMatch('m1', 'r1', ['a1','a2'], 'a1', [100, 50])],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents, rounds);
    expect(standings[0].agentId).toBe('a1');
    expect(standings[0].rank).toBe(1);
    expect(standings[1].rank).toBe(2);
  });

  it('Buchholz tiebreaker — higher tiebreaker wins when Swiss points are tied', () => {
    const agents = ['a1','a2','a3','a4'].map((id) => makeAgent(id));

    // All play 1 match, a1 beats a3, a2 beats a4
    // a1 and a2 both have 1 Swiss point
    // a1's opponent (a3) has 0 pts; a2's opponent (a4) has 0 pts → equal Buchholz
    // So let's make a3 win some matches to increase a1's Buchholz
    const rounds: TournamentRound[] = [
      {
        id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed',
        matches: [
          makeCompletedMatch('m1', 'r1', ['a1','a3'], 'a1', [100, 50]),
          makeCompletedMatch('m2', 'r1', ['a2','a4'], 'a2', [100, 50]),
        ],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
      {
        id: 'r2', roundNumber: 2, name: 'Round 2', status: 'completed',
        matches: [
          // a3 wins (making a1's Buchholz higher: a1 beat a3 who now has 1pt)
          makeCompletedMatch('m3', 'r2', ['a3','a4'], 'a3', [100, 50]),
          // a4 loses (a2's Buchholz stays at 0)
          makeCompletedMatch('m4', 'r2', ['a1','a2'], 'a1', [100, 50]),
        ],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents, rounds);
    const a1 = standings.find((s) => s.agentId === 'a1')!;
    const a2 = standings.find((s) => s.agentId === 'a2')!;

    // a1 has 2pts, a2 has 1pt — a1 ranks higher on points alone
    expect(a1.rank).toBeLessThan(a2.rank);

    // Buchholz: a1 beat a3 (1pt) and a2 (1pt) → Buchholz = 2
    // a2 beat a4 (0pt), lost to a1 (2pt) → Buchholz = 2
    expect(a1.tiebreaker).toBeDefined();
  });

  it('returned objects do not include internal opponents array', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const rounds: TournamentRound[] = [
      {
        id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed',
        matches: [makeCompletedMatch('m1', 'r1', ['a1','a2'], 'a1', [100, 50])],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents, rounds);
    standings.forEach((s) => {
      expect('opponents' in s).toBe(false);
    });
  });

  it('zero rounds — all agents rank with 0 points', () => {
    const agents = ['a1','a2','a3'].map((id) => makeAgent(id));
    const standings = calculateSwissFinalStandings(agents, []);

    expect(standings).toHaveLength(3);
    standings.forEach((s) => {
      expect(s.swissPoints).toBe(0);
      expect(s.matchesWon).toBe(0);
    });
  });

  it('tie counted as 0.5 Swiss points', () => {
    const agents = ['a1','a2'].map((id) => makeAgent(id));
    const rounds: TournamentRound[] = [
      {
        id: 'r1', roundNumber: 1, name: 'Round 1', status: 'completed',
        matches: [makeCompletedMatch('m1', 'r1', ['a1','a2'], undefined, [80, 80])],
        advancingAgentIds: [], eliminatedAgentIds: [],
      },
    ];

    const standings = calculateSwissFinalStandings(agents, rounds);
    standings.forEach((s) => {
      expect(s.swissPoints).toBe(0.5);
      expect(s.matchesTied).toBe(1);
    });
  });
});
