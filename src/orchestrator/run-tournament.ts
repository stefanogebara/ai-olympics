#!/usr/bin/env node
// Tournament CLI Entry Point
// Usage:
//   npm run tournament -- --bracket elimination
//   npm run tournament -- --bracket round-robin --tasks form-blitz,shopping-cart
//   npm run tournament -- --bracket swiss --rounds 5

import { TournamentController } from './tournament-controller.js';
import { AGENT_PRESETS } from '../shared/config.js';
import { getAllTasks } from './task-registry.js';
import { startApiServer } from '../api/server.js';
import { createLogger } from '../shared/utils/logger.js';
import type { AgentConfig, BracketType } from '../shared/types/index.js';

const log = createLogger('TournamentCLI');

interface CLIOptions {
  bracket: BracketType;
  tasks?: string[];
  rounds?: number;
  agents?: string[];
  name?: string;
  port?: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    bracket: 'single-elimination',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--bracket':
      case '-b':
        const bracketType = args[++i];
        if (['single-elimination', 'round-robin', 'swiss'].includes(bracketType)) {
          options.bracket = bracketType as BracketType;
        } else {
          console.error(`Invalid bracket type: ${bracketType}`);
          console.error('Valid types: single-elimination, round-robin, swiss');
          process.exit(1);
        }
        break;

      case '--tasks':
      case '-t':
        options.tasks = args[++i].split(',');
        break;

      case '--rounds':
      case '-r':
        options.rounds = parseInt(args[++i], 10);
        break;

      case '--agents':
      case '-a':
        options.agents = args[++i].split(',');
        break;

      case '--name':
      case '-n':
        options.name = args[++i];
        break;

      case '--port':
      case '-p':
        options.port = parseInt(args[++i], 10);
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
AI Olympics Tournament CLI

Usage:
  npm run tournament -- [options]

Options:
  --bracket, -b <type>    Bracket type: single-elimination, round-robin, swiss (default: single-elimination)
  --tasks, -t <ids>       Comma-separated task IDs (default: all tasks)
  --rounds, -r <n>        Number of rounds for Swiss (default: auto)
  --agents, -a <ids>      Comma-separated agent IDs (default: all configured agents)
  --name, -n <name>       Tournament name
  --port, -p <port>       API server port (default: 3002)
  --help, -h              Show this help

Examples:
  npm run tournament -- --bracket elimination
  npm run tournament -- --bracket round-robin --tasks form-blitz,shopping-cart
  npm run tournament -- --bracket swiss --rounds 5
  npm run tournament -- -b elimination -a claude,gpt-4
  `);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('\n===================================');
  console.log('   AI OLYMPICS TOURNAMENT');
  console.log('===================================\n');

  // Get available agents
  const availableAgents = Object.entries(AGENT_PRESETS)
    .filter(([_, preset]) => preset !== undefined)
    .map(([_, preset]) => preset as AgentConfig);

  if (availableAgents.length < 2) {
    console.error('Error: Need at least 2 agents configured');
    console.error('Set API keys for agents in environment variables:');
    console.error('  - ANTHROPIC_API_KEY for Claude');
    console.error('  - OPENAI_API_KEY for GPT-4');
    console.error('  - GOOGLE_AI_API_KEY for Gemini');
    process.exit(1);
  }

  // Filter agents if specified
  let agents = availableAgents;
  if (options.agents) {
    agents = availableAgents.filter((a) =>
      options.agents!.some((id) => a.id.includes(id) || a.name.toLowerCase().includes(id.toLowerCase()))
    );

    if (agents.length < 2) {
      console.error('Error: At least 2 valid agents required');
      console.error('Available agents:', availableAgents.map((a) => a.id).join(', '));
      process.exit(1);
    }
  }

  // Get tasks
  const allTasks = getAllTasks();
  let taskIds = allTasks.map((t) => t.id);

  if (options.tasks) {
    taskIds = options.tasks.filter((id) => allTasks.some((t) => t.id === id));

    if (taskIds.length === 0) {
      console.error('Error: No valid tasks specified');
      console.error('Available tasks:', allTasks.map((t) => t.id).join(', '));
      process.exit(1);
    }
  }

  // Log configuration
  console.log('Tournament Configuration:');
  console.log(`  Bracket Type: ${options.bracket}`);
  console.log(`  Agents: ${agents.map((a) => a.name).join(', ')}`);
  console.log(`  Tasks: ${taskIds.join(', ')}`);
  if (options.rounds) {
    console.log(`  Max Rounds: ${options.rounds}`);
  }
  console.log('');

  // Start API server
  const port = options.port || 3002;
  const serverCleanup = startApiServer(port);
  console.log(`API Server running on http://localhost:${port}`);
  console.log('');

  // Create tournament
  const controller = new TournamentController();

  const tournamentName = options.name ||
    `AI Olympics ${options.bracket.charAt(0).toUpperCase() + options.bracket.slice(1)} Tournament`;

  controller.createTournament({
    name: tournamentName,
    bracketType: options.bracket,
    agents,
    taskIds,
    roundsPerMatch: options.rounds,
  });

  const tournament = controller.getTournament();
  console.log(`Tournament Created: ${tournament?.name}`);
  console.log(`  ID: ${tournament?.id}`);
  console.log(`  Rounds: ${tournament?.rounds.length}`);
  console.log('');

  // Handle shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nShutting down tournament...');
    await controller.cancelTournament();
    serverCleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Start tournament
    console.log('Starting tournament in 3 seconds...\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await controller.startTournament();

    // Print final standings
    const standings = controller.getStandings();
    console.log('\n===================================');
    console.log('   FINAL STANDINGS');
    console.log('===================================\n');

    standings.forEach((standing, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(
        `${medal} ${standing.rank}. ${standing.agentName.padEnd(15)} ` +
        `W:${standing.matchesWon} L:${standing.matchesLost} ` +
        `Score:${standing.totalScore}`
      );
    });

    console.log('\n===================================\n');

    // Keep server running for a bit to allow viewing results
    console.log('Tournament complete! Server will shut down in 30 seconds...');
    console.log('(Press Ctrl+C to exit immediately)');

    await new Promise((resolve) => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Tournament error:', error);
  } finally {
    serverCleanup();
  }
}

main().catch(console.error);
