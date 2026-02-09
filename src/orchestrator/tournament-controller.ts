// Tournament Controller
// Orchestrates multi-round bracket competitions

import { nanoid } from 'nanoid';
import type {
  Tournament,
  TournamentConfig,
  TournamentRound,
  TournamentMatch,
  TournamentSeed,
  TournamentStanding,
  AgentConfig,
  TaskDefinition,
  BracketType,
} from '../shared/types/index.js';
import { CompetitionController } from './competition-controller.js';
import { getTaskById } from './task-registry.js';
import { eventBus, createStreamEvent } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import {
  generateSingleEliminationBracket,
  generateRoundRobinSchedule,
  generateSwissPairings,
  calculateRoundRobinStandings,
  calculateSwissFinalStandings,
} from './tournament-bracket.js';

const log = createLogger('TournamentController');

export class TournamentController {
  private tournament: Tournament | null = null;
  private tasks: TaskDefinition[] = [];

  constructor() {}

  /**
   * Create a new tournament
   */
  createTournament(config: TournamentConfig): Tournament {
    const tournamentId = `tournament-${nanoid(10)}`;

    log.info(`Creating tournament: ${config.name}`, {
      id: tournamentId,
      bracket: config.bracketType,
      agents: config.agents.length,
    });

    // Resolve tasks
    this.tasks = config.taskIds
      .map((id) => getTaskById(id))
      .filter((t): t is TaskDefinition => t !== undefined);

    if (this.tasks.length === 0) {
      throw new Error('No valid tasks provided for tournament');
    }

    // Generate seeds (by order for now, could be based on ratings)
    const seeds: TournamentSeed[] = config.agents.map((agent, index) => ({
      agentId: agent.id,
      seedNumber: index + 1,
    }));

    // Generate bracket structure based on type
    let rounds: TournamentRound[] = [];
    let bracket: import('../shared/types/index.js').BracketNode[] = [];

    switch (config.bracketType) {
      case 'single-elimination': {
        const result = generateSingleEliminationBracket(config.agents, seeds);
        rounds = result.rounds;
        bracket = result.bracket;
        break;
      }
      case 'round-robin': {
        rounds = generateRoundRobinSchedule(config.agents);
        break;
      }
      case 'swiss': {
        // Swiss generates rounds dynamically, start with round 1
        rounds = [generateSwissPairings(config.agents, [], 1)];
        break;
      }
    }

    this.tournament = {
      id: tournamentId,
      name: config.name,
      bracketType: config.bracketType,
      status: 'pending',
      agents: config.agents,
      taskIds: config.taskIds,
      seeds,
      rounds,
      currentRoundIndex: 0,
      bracket,
      finalStandings: [],
      createdAt: Date.now(),
    };

    return this.tournament;
  }

  /**
   * Start the tournament
   */
  async startTournament(): Promise<void> {
    if (!this.tournament) {
      throw new Error('No tournament created');
    }

    log.info(`Starting tournament: ${this.tournament.name}`);

    this.tournament.status = 'running';
    this.tournament.startedAt = Date.now();

    this.emit('tournament:start', { tournament: this.tournament });

    // Run rounds based on bracket type
    switch (this.tournament.bracketType) {
      case 'single-elimination':
        await this.runSingleElimination();
        break;
      case 'round-robin':
        await this.runRoundRobin();
        break;
      case 'swiss':
        await this.runSwiss();
        break;
    }

    // Finalize tournament
    this.tournament.status = 'completed';
    this.tournament.completedAt = Date.now();

    this.emit('tournament:end', {
      tournament: this.tournament,
      standings: this.tournament.finalStandings,
    });

    log.info(`Tournament completed: ${this.tournament.name}`);
  }

  /**
   * Run single-elimination tournament
   */
  private async runSingleElimination(): Promise<void> {
    if (!this.tournament) return;

    for (let i = 0; i < this.tournament.rounds.length; i++) {
      this.tournament.currentRoundIndex = i;
      const round = this.tournament.rounds[i];

      log.info(`Starting round: ${round.name}`);
      await this.runRound(round);

      // After each round, update bracket nodes with winners
      // and populate next round matches
      this.updateBracketAfterRound(round, i);
    }

    // Calculate final standings
    this.tournament.finalStandings = this.calculateEliminationStandings();
  }

  /**
   * Run round-robin tournament
   */
  private async runRoundRobin(): Promise<void> {
    if (!this.tournament) return;

    for (let i = 0; i < this.tournament.rounds.length; i++) {
      this.tournament.currentRoundIndex = i;
      const round = this.tournament.rounds[i];

      log.info(`Starting round ${round.roundNumber}`);
      await this.runRound(round);
    }

    // Calculate final standings
    this.tournament.finalStandings = calculateRoundRobinStandings(
      this.tournament.rounds,
      this.tournament.agents
    );
  }

  /**
   * Run Swiss-system tournament
   */
  private async runSwiss(maxRounds: number = 5): Promise<void> {
    if (!this.tournament) return;

    const numRounds = Math.min(
      maxRounds,
      Math.ceil(Math.log2(this.tournament.agents.length)) + 1
    );

    for (let roundNum = 1; roundNum <= numRounds; roundNum++) {
      this.tournament.currentRoundIndex = roundNum - 1;

      // Generate pairings for this round (first round already generated)
      if (roundNum > 1) {
        const newRound = generateSwissPairings(
          this.tournament.agents,
          this.tournament.rounds.filter((r) => r.status === 'completed'),
          roundNum
        );
        this.tournament.rounds.push(newRound);
      }

      const round = this.tournament.rounds[roundNum - 1];
      log.info(`Starting Swiss round ${roundNum}`);
      await this.runRound(round);
    }

    // Calculate final standings
    this.tournament.finalStandings = calculateSwissFinalStandings(
      this.tournament.agents,
      this.tournament.rounds
    );
  }

  /**
   * Run a single round (all matches in parallel)
   */
  private async runRound(round: TournamentRound): Promise<void> {
    if (!this.tournament) return;

    round.status = 'running';
    round.startedAt = Date.now();

    this.emit('round:start', { round });

    // Run all non-bye matches in parallel
    const matchPromises = round.matches
      .filter((match) => !match.isBye && match.status === 'pending')
      .map((match) => this.runMatch(match));

    await Promise.all(matchPromises);

    // Process results
    round.advancingAgentIds = round.matches
      .filter((m) => m.winnerId)
      .map((m) => m.winnerId!);

    round.eliminatedAgentIds = round.matches
      .filter((m) => m.loserId)
      .map((m) => m.loserId!);

    round.status = 'completed';
    round.completedAt = Date.now();

    this.emit('round:end', { round });
  }

  /**
   * Run a single match (competition between 2 agents)
   */
  private async runMatch(match: TournamentMatch): Promise<void> {
    if (!this.tournament || match.agentIds.length < 2) return;

    log.info(`Running match: ${match.id}`, { agents: match.agentIds });

    match.status = 'running';
    match.startedAt = Date.now();

    // Get the two agents
    const agent1 = this.tournament.agents.find((a) => a.id === match.agentIds[0]);
    const agent2 = this.tournament.agents.find((a) => a.id === match.agentIds[1]);

    if (!agent1 || !agent2) {
      log.error('Match agents not found');
      match.status = 'completed';
      return;
    }

    // Select a random task for this match
    const task = this.tasks[Math.floor(Math.random() * this.tasks.length)];

    // Create a mini-competition for this match
    const controller = new CompetitionController();
    controller.createCompetition({
      name: `Match ${match.id}`,
      description: `Tournament match: ${agent1.name} vs ${agent2.name}`,
      agents: [agent1, agent2],
      tasks: [task],
    });

    try {
      await controller.startCompetition();

      // Get results
      const leaderboard = controller.getLeaderboard();
      const competition = controller.getCompetition();

      match.competitionId = competition?.id;

      // Process results
      match.results = match.agentIds.map((agentId) => {
        const entry = leaderboard.find((e) => e.agentId === agentId);
        return {
          agentId,
          score: entry?.totalScore || 0,
          tasksWon: entry?.eventsWon || 0,
          tasksPlayed: entry?.eventsCompleted || 0,
        };
      });

      // Determine winner
      const [result1, result2] = match.results;
      if (result1.score > result2.score) {
        match.winnerId = result1.agentId;
        match.loserId = result2.agentId;
      } else if (result2.score > result1.score) {
        match.winnerId = result2.agentId;
        match.loserId = result1.agentId;
      } else {
        // Tie - use random for now (could use tiebreaker tasks)
        const winner = Math.random() < 0.5 ? 0 : 1;
        match.winnerId = match.results[winner].agentId;
        match.loserId = match.results[1 - winner].agentId;
      }

      await controller.cleanup();

    } catch (error) {
      log.error(`Match failed: ${match.id}`, { error });
      // On error, randomly pick a winner
      match.winnerId = match.agentIds[Math.floor(Math.random() * 2)];
      match.loserId = match.agentIds.find((id) => id !== match.winnerId);
    }

    match.status = 'completed';
    match.completedAt = Date.now();

    this.emit('match:end', { match });
    log.info(`Match completed: ${match.winnerId} defeats ${match.loserId}`);
  }

  /**
   * Update bracket after a round completes (for single-elimination)
   */
  private updateBracketAfterRound(round: TournamentRound, roundIndex: number): void {
    if (!this.tournament || this.tournament.bracketType !== 'single-elimination') return;

    // Update bracket nodes with winners
    for (const match of round.matches) {
      const node = this.tournament.bracket.find((n) => n.matchId === match.id);
      if (node && match.winnerId) {
        node.winnerId = match.winnerId;

        // Propagate winner to next round
        if (node.childNode) {
          const childNode = this.tournament.bracket.find((n) => n.id === node.childNode);
          if (childNode) {
            childNode.agentIds.push(match.winnerId);

            // Also update the corresponding match
            const nextRound = this.tournament.rounds[roundIndex + 1];
            if (nextRound) {
              const nextMatch = nextRound.matches.find((m) => m.id === childNode.matchId);
              if (nextMatch) {
                nextMatch.agentIds.push(match.winnerId);
              }
            }
          }
        }
      }
    }

    this.emit('bracket:update', { bracket: this.tournament.bracket });
  }

  /**
   * Calculate standings for elimination tournament
   */
  private calculateEliminationStandings(): TournamentStanding[] {
    if (!this.tournament) return [];

    const standings: Map<string, TournamentStanding> = new Map();

    // Initialize standings
    this.tournament.agents.forEach((agent) => {
      standings.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name,
        rank: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        totalScore: 0,
        roundEliminated: undefined,
      });
    });

    // Process all rounds
    this.tournament.rounds.forEach((round) => {
      round.matches.forEach((match) => {
        if (match.status !== 'completed') return;

        // Update match counts
        if (match.winnerId) {
          const winnerStanding = standings.get(match.winnerId)!;
          winnerStanding.matchesWon += 1;

          const winnerResult = match.results.find((r) => r.agentId === match.winnerId);
          if (winnerResult) {
            winnerStanding.totalScore += winnerResult.score;
          }
        }

        if (match.loserId) {
          const loserStanding = standings.get(match.loserId)!;
          loserStanding.matchesLost += 1;
          loserStanding.roundEliminated = round.roundNumber;

          const loserResult = match.results.find((r) => r.agentId === match.loserId);
          if (loserResult) {
            loserStanding.totalScore += loserResult.score;
          }
        }
      });
    });

    // Sort by: round eliminated (later = better), then matches won, then total score
    const sortedStandings = Array.from(standings.values()).sort((a, b) => {
      const aElim = a.roundEliminated || Infinity;
      const bElim = b.roundEliminated || Infinity;
      if (bElim !== aElim) return bElim - aElim;
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      return b.totalScore - a.totalScore;
    });

    sortedStandings.forEach((standing, index) => {
      standing.rank = index + 1;
    });

    return sortedStandings;
  }

  /**
   * Emit event to the event bus
   */
  private emit(type: string, data: unknown): void {
    if (!this.tournament) return;

    eventBus.emit(type as any, createStreamEvent(
      type as any,
      this.tournament.id,
      data
    ));
  }

  /**
   * Get current tournament state
   */
  getTournament(): Tournament | null {
    return this.tournament;
  }

  /**
   * Get bracket visualization data
   */
  getBracket(): import('../shared/types/index.js').BracketNode[] {
    return this.tournament?.bracket || [];
  }

  /**
   * Get current standings
   */
  getStandings(): TournamentStanding[] {
    return this.tournament?.finalStandings || [];
  }

  /**
   * Cancel tournament
   */
  async cancelTournament(): Promise<void> {
    if (this.tournament) {
      this.tournament.status = 'cancelled';
      log.info('Tournament cancelled');
    }
  }
}

/**
 * Factory function to create a quick tournament
 */
export function createTournament(options: {
  name?: string;
  bracketType?: BracketType;
  agents: AgentConfig[];
  taskIds: string[];
}): TournamentController {
  const controller = new TournamentController();

  controller.createTournament({
    name: options.name || 'AI Olympics Tournament',
    bracketType: options.bracketType || 'single-elimination',
    agents: options.agents,
    taskIds: options.taskIds,
  });

  return controller;
}

export default TournamentController;
