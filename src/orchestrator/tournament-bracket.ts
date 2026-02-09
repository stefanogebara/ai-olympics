// Tournament Bracket Generation Algorithms
// Handles single-elimination, round-robin, and Swiss pairings

import {
  BracketNode,
  TournamentMatch,
  TournamentRound,
  TournamentSeed,
  TournamentStanding,
  AgentConfig,
} from '../shared/types/index.js';

// ============================================================================
// SINGLE ELIMINATION BRACKET
// ============================================================================

/**
 * Generate a single-elimination bracket with proper seeding
 * Seeds are placed to avoid top seeds meeting until later rounds
 */
export function generateSingleEliminationBracket(
  agents: AgentConfig[],
  seeds: TournamentSeed[]
): { rounds: TournamentRound[]; bracket: BracketNode[] } {
  const numAgents = agents.length;

  // Calculate bracket size (next power of 2)
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numAgents)));
  const numByes = bracketSize - numAgents;
  const numRounds = Math.ceil(Math.log2(bracketSize));

  // Sort seeds by seed number
  const sortedSeeds = [...seeds].sort((a, b) => a.seedNumber - b.seedNumber);

  // Create seeded positions using standard bracket seeding
  const seedPositions = generateSeedPositions(bracketSize);

  // Assign agents to positions
  const firstRoundAgents: (string | null)[] = new Array(bracketSize).fill(null);

  sortedSeeds.forEach((seed, index) => {
    const position = seedPositions[index];
    firstRoundAgents[position] = seed.agentId;
  });

  // Generate all rounds
  const rounds: TournamentRound[] = [];
  const bracket: BracketNode[] = [];
  let matchCounter = 0;
  let nodeCounter = 0;

  // Generate first round
  const firstRoundMatches: TournamentMatch[] = [];
  const firstRoundNodes: BracketNode[] = [];

  for (let i = 0; i < bracketSize; i += 2) {
    const agent1 = firstRoundAgents[i];
    const agent2 = firstRoundAgents[i + 1];

    const matchId = `match-${++matchCounter}`;
    const nodeId = `node-${++nodeCounter}`;

    const isBye = agent1 === null || agent2 === null;
    const agentIds = [agent1, agent2].filter((a): a is string => a !== null);

    const match: TournamentMatch = {
      id: matchId,
      roundId: 'round-1',
      matchNumber: Math.floor(i / 2) + 1,
      agentIds,
      results: [],
      status: isBye ? 'bye' : 'pending',
      isBye,
      winnerId: isBye ? agentIds[0] : undefined,
    };

    firstRoundMatches.push(match);

    const node: BracketNode = {
      id: nodeId,
      roundNumber: 1,
      position: Math.floor(i / 2),
      matchId,
      agentIds,
      winnerId: match.winnerId,
      parentNodes: [],
      childNode: undefined,
    };

    firstRoundNodes.push(node);
  }

  rounds.push({
    id: 'round-1',
    roundNumber: 1,
    name: getRoundName(numRounds, 1),
    status: 'pending',
    matches: firstRoundMatches,
    advancingAgentIds: firstRoundMatches.filter((m) => m.isBye).map((m) => m.winnerId!),
    eliminatedAgentIds: [],
  });

  bracket.push(...firstRoundNodes);

  // Generate subsequent rounds
  let previousRoundNodes = firstRoundNodes;

  for (let round = 2; round <= numRounds; round++) {
    const roundMatches: TournamentMatch[] = [];
    const roundNodes: BracketNode[] = [];
    const numMatches = bracketSize / Math.pow(2, round);

    for (let i = 0; i < numMatches; i++) {
      const matchId = `match-${++matchCounter}`;
      const nodeId = `node-${++nodeCounter}`;

      const parentNode1 = previousRoundNodes[i * 2];
      const parentNode2 = previousRoundNodes[i * 2 + 1];

      const match: TournamentMatch = {
        id: matchId,
        roundId: `round-${round}`,
        matchNumber: i + 1,
        agentIds: [],
        results: [],
        status: 'pending',
        isBye: false,
      };

      roundMatches.push(match);

      const node: BracketNode = {
        id: nodeId,
        roundNumber: round,
        position: i,
        matchId,
        agentIds: [],
        parentNodes: [parentNode1.id, parentNode2.id],
        childNode: undefined,
      };

      // Link parent nodes to this child
      parentNode1.childNode = nodeId;
      parentNode2.childNode = nodeId;

      roundNodes.push(node);
    }

    rounds.push({
      id: `round-${round}`,
      roundNumber: round,
      name: getRoundName(numRounds, round),
      status: 'pending',
      matches: roundMatches,
      advancingAgentIds: [],
      eliminatedAgentIds: [],
    });

    bracket.push(...roundNodes);
    previousRoundNodes = roundNodes;
  }

  return { rounds, bracket };
}

/**
 * Generate seed positions using standard bracket seeding
 * e.g., for 8-team bracket: [0, 7, 3, 4, 1, 6, 2, 5] (1v8, 4v5, 2v7, 3v6)
 */
function generateSeedPositions(bracketSize: number): number[] {
  if (bracketSize === 2) return [0, 1];

  const positions = generateSeedPositions(bracketSize / 2);
  const result: number[] = [];

  for (let i = 0; i < positions.length; i++) {
    result.push(positions[i]);
    result.push(bracketSize - 1 - positions[i]);
  }

  return result;
}

/**
 * Get the name for a round based on total rounds and current round
 */
function getRoundName(totalRounds: number, currentRound: number): string {
  const roundsFromEnd = totalRounds - currentRound;

  switch (roundsFromEnd) {
    case 0:
      return 'Finals';
    case 1:
      return 'Semifinals';
    case 2:
      return 'Quarterfinals';
    default:
      return `Round ${currentRound}`;
  }
}

// ============================================================================
// ROUND ROBIN SCHEDULING
// ============================================================================

/**
 * Generate a round-robin schedule using the circle method
 * Every agent plays every other agent exactly once
 */
export function generateRoundRobinSchedule(
  agents: AgentConfig[]
): TournamentRound[] {
  const agentIds = agents.map((a) => a.id);
  let participants = [...agentIds];

  // Add a BYE if odd number of participants
  if (participants.length % 2 === 1) {
    participants.push('BYE');
  }

  const numParticipants = participants.length;
  const numRounds = numParticipants - 1;
  const rounds: TournamentRound[] = [];

  // Circle method: fix first position, rotate others
  for (let round = 0; round < numRounds; round++) {
    const matches: TournamentMatch[] = [];

    for (let i = 0; i < numParticipants / 2; i++) {
      const home = participants[i];
      const away = participants[numParticipants - 1 - i];

      if (home === 'BYE' || away === 'BYE') continue;

      matches.push({
        id: `match-${round + 1}-${i + 1}`,
        roundId: `round-${round + 1}`,
        matchNumber: i + 1,
        agentIds: [home, away],
        results: [],
        status: 'pending',
        isBye: false,
      });
    }

    rounds.push({
      id: `round-${round + 1}`,
      roundNumber: round + 1,
      name: `Round ${round + 1}`,
      status: 'pending',
      matches,
      advancingAgentIds: [],
      eliminatedAgentIds: [],
    });

    // Rotate: keep first element fixed, rotate rest clockwise
    const fixed = participants[0];
    const rotated = [fixed];
    rotated.push(participants[numParticipants - 1]);
    for (let i = 1; i < numParticipants - 1; i++) {
      rotated.push(participants[i]);
    }
    participants = rotated;
  }

  return rounds;
}

/**
 * Calculate round-robin standings
 */
export function calculateRoundRobinStandings(
  rounds: TournamentRound[],
  agents: AgentConfig[]
): TournamentStanding[] {
  const standings: Map<string, TournamentStanding> = new Map();

  // Initialize standings
  agents.forEach((agent) => {
    standings.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      rank: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesTied: 0,
      totalScore: 0,
    });
  });

  // Process completed matches
  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (match.status !== 'completed') return;

      match.agentIds.forEach((agentId) => {
        const standing = standings.get(agentId)!;
        const result = match.results.find((r) => r.agentId === agentId);

        if (result) {
          standing.totalScore += result.score;
        }

        if (match.winnerId === agentId) {
          standing.matchesWon += 1;
        } else if (match.winnerId) {
          standing.matchesLost += 1;
        } else {
          standing.matchesTied += 1;
        }
      });
    });
  });

  // Sort and assign ranks
  const sortedStandings = Array.from(standings.values()).sort((a, b) => {
    // Primary: wins
    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
    // Secondary: total score
    return b.totalScore - a.totalScore;
  });

  sortedStandings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return sortedStandings;
}

// ============================================================================
// SWISS SYSTEM PAIRING
// ============================================================================

interface SwissStanding extends TournamentStanding {
  opponents: string[];
  swissPoints: number;
}

/**
 * Generate Swiss-system pairings for a round
 * Pairs agents with similar scores who haven't played each other
 */
export function generateSwissPairings(
  agents: AgentConfig[],
  completedRounds: TournamentRound[],
  roundNumber: number
): TournamentRound {
  // Calculate current standings with opponent tracking
  const standings = calculateSwissStandings(agents, completedRounds);

  // Sort by Swiss points (descending)
  const sortedStandings = [...standings].sort((a, b) => b.swissPoints - a.swissPoints);

  // Pair agents using the simple Swiss pairing algorithm
  const paired: Set<string> = new Set();
  const matches: TournamentMatch[] = [];
  let matchNumber = 0;

  for (let i = 0; i < sortedStandings.length; i++) {
    const standing1 = sortedStandings[i];
    if (paired.has(standing1.agentId)) continue;

    // Find the highest-ranked unpaired opponent they haven't played
    for (let j = i + 1; j < sortedStandings.length; j++) {
      const standing2 = sortedStandings[j];
      if (paired.has(standing2.agentId)) continue;
      if (standing1.opponents.includes(standing2.agentId)) continue;

      // Pair these two
      matchNumber++;
      matches.push({
        id: `match-${roundNumber}-${matchNumber}`,
        roundId: `round-${roundNumber}`,
        matchNumber,
        agentIds: [standing1.agentId, standing2.agentId],
        results: [],
        status: 'pending',
        isBye: false,
      });

      paired.add(standing1.agentId);
      paired.add(standing2.agentId);
      break;
    }
  }

  // Handle odd player (BYE)
  const unpaired = sortedStandings.find((s) => !paired.has(s.agentId));
  if (unpaired) {
    matchNumber++;
    matches.push({
      id: `match-${roundNumber}-${matchNumber}`,
      roundId: `round-${roundNumber}`,
      matchNumber,
      agentIds: [unpaired.agentId],
      results: [],
      winnerId: unpaired.agentId,
      status: 'bye',
      isBye: true,
    });
  }

  return {
    id: `round-${roundNumber}`,
    roundNumber,
    name: `Round ${roundNumber}`,
    status: 'pending',
    matches,
    advancingAgentIds: [],
    eliminatedAgentIds: [],
  };
}

/**
 * Calculate Swiss standings with opponent tracking and tiebreakers
 */
function calculateSwissStandings(
  agents: AgentConfig[],
  rounds: TournamentRound[]
): SwissStanding[] {
  const standings: Map<string, SwissStanding> = new Map();

  // Initialize standings
  agents.forEach((agent) => {
    standings.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      rank: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesTied: 0,
      totalScore: 0,
      opponents: [],
      swissPoints: 0,
    });
  });

  // Process completed matches
  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (match.status !== 'completed' && match.status !== 'bye') return;

      // Track opponents
      if (match.agentIds.length === 2) {
        const [agent1, agent2] = match.agentIds;
        standings.get(agent1)!.opponents.push(agent2);
        standings.get(agent2)!.opponents.push(agent1);
      }

      // Update scores
      match.agentIds.forEach((agentId) => {
        const standing = standings.get(agentId)!;
        const result = match.results.find((r) => r.agentId === agentId);

        if (result) {
          standing.totalScore += result.score;
        }

        if (match.winnerId === agentId) {
          standing.matchesWon += 1;
          standing.swissPoints += 1;
        } else if (match.winnerId) {
          standing.matchesLost += 1;
        } else if (!match.isBye) {
          standing.matchesTied += 1;
          standing.swissPoints += 0.5;
        }
      });
    });
  });

  // Calculate Buchholz tiebreaker (sum of opponents' scores)
  standings.forEach((standing) => {
    standing.tiebreaker = standing.opponents.reduce((sum, oppId) => {
      const opp = standings.get(oppId);
      return sum + (opp?.swissPoints || 0);
    }, 0);
  });

  // Sort and assign ranks
  const sortedStandings = Array.from(standings.values()).sort((a, b) => {
    if (b.swissPoints !== a.swissPoints) return b.swissPoints - a.swissPoints;
    if ((b.tiebreaker || 0) !== (a.tiebreaker || 0)) {
      return (b.tiebreaker || 0) - (a.tiebreaker || 0);
    }
    return b.totalScore - a.totalScore;
  });

  sortedStandings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return sortedStandings;
}

/**
 * Calculate final Swiss standings
 */
export function calculateSwissFinalStandings(
  agents: AgentConfig[],
  rounds: TournamentRound[]
): TournamentStanding[] {
  const swissStandings = calculateSwissStandings(agents, rounds);

  return swissStandings.map((s) => ({
    agentId: s.agentId,
    agentName: s.agentName,
    rank: s.rank,
    matchesWon: s.matchesWon,
    matchesLost: s.matchesLost,
    matchesTied: s.matchesTied,
    totalScore: s.totalScore,
    swissPoints: s.swissPoints,
    tiebreaker: s.tiebreaker,
  }));
}
