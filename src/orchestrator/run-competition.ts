#!/usr/bin/env tsx
/**
 * AI Olympics - Run a Competition
 *
 * Usage:
 *   npx tsx src/orchestrator/run-competition.ts
 *
 * Or with npm script:
 *   npm run competition
 */

import 'dotenv/config';
import ora from 'ora';
import chalk from 'chalk';
import { createAPIServer } from '../api/server.js';
import { CompetitionController } from './competition-controller.js';
import { getTask } from './task-registry.js';
import { overlayManager } from '../streaming/overlay-manager.js';
import { commentator } from '../streaming/commentary.js';
import { config, AGENT_PRESETS, validateConfig } from '../shared/config.js';
import { eventBus } from '../shared/utils/events.js';
import { formatDuration } from '../shared/utils/timer.js';
import type { LeaderboardEntry } from '../shared/types/index.js';
import { createLogger } from '../shared/utils/logger.js';

const _log = createLogger('RunCompetition');

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     █████╗ ██╗    ██████╗ ██╗  ██╗   ██╗███╗   ███╗      ║
║    ██╔══██╗██║   ██╔═══██╗██║  ╚██╗ ██╔╝████╗ ████║      ║
║    ███████║██║   ██║   ██║██║   ╚████╔╝ ██╔████╔██║      ║
║    ██╔══██║██║   ██║   ██║██║    ╚██╔╝  ██║╚██╔╝██║      ║
║    ██║  ██║██║   ╚██████╔╝███████╗██║   ██║ ╚═╝ ██║      ║
║    ╚═╝  ╚═╝╚═╝    ╚═════╝ ╚══════╝╚═╝   ╚═╝     ╚═╝      ║
║                                                           ║
║           🏆 AI Agent Competition Platform 🏆              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

async function runCompetition() {
  console.log(chalk.cyan(banner));

  // Validate config
  const spinner = ora('Validating configuration...').start();

  const validation = validateConfig();
  if (!validation.valid) {
    spinner.fail('Configuration errors');
    console.error(chalk.red(validation.errors.join('\n')));
    console.log(chalk.yellow('\nCreate a .env file with your API keys:'));
    console.log(chalk.gray('  ANTHROPIC_API_KEY=sk-ant-...'));
    console.log(chalk.gray('  OPENAI_API_KEY=sk-...'));
    console.log(chalk.gray('  GOOGLE_AI_API_KEY=...'));
    process.exit(1);
  }
  spinner.succeed('Configuration valid');

  // Start API server
  spinner.start('Starting API server...');
  const server = createAPIServer();
  await server.start(config.port);
  spinner.succeed(`API server running on http://localhost:${config.port}`);

  // Determine available agents
  const availableAgents = [];
  const hasOpenRouter = !!config.openRouterApiKey;
  const hasAnthropic = !!config.anthropicApiKey && !config.anthropicApiKey.startsWith('your-');
  const hasOpenAI = !!config.openaiApiKey && !config.openaiApiKey.startsWith('your-');
  const hasGoogle = !!config.googleAiApiKey && !config.googleAiApiKey.startsWith('your-');

  // Build agent list based on available credentials
  // Priority: multi-provider if OpenRouter + direct keys for GPT/Gemini, else Claude-family
  const hasRealOpenAI = hasOpenAI;
  const hasRealGoogle = hasGoogle;
  const openRouterOnlyMode = hasOpenRouter && !hasRealOpenAI && !hasRealGoogle;

  if (hasAnthropic && (hasRealOpenAI || hasRealGoogle)) {
    // Best case: true multi-provider with real keys
    console.log(chalk.cyan('\n🌐 Multi-provider competition'));
    availableAgents.push(AGENT_PRESETS.claude);
    console.log(chalk.green('  ✓ Claude Opus (Anthropic direct)'));
    if (hasRealOpenAI) {
      availableAgents.push(AGENT_PRESETS['gpt-4']);
      console.log(chalk.green('  ✓ GPT-4 (OpenAI direct)'));
    }
    if (hasRealGoogle) {
      availableAgents.push(AGENT_PRESETS.gemini);
      console.log(chalk.green('  ✓ Gemini (Google direct)'));
    }
    if (hasOpenRouter) {
      availableAgents.push(AGENT_PRESETS.llama);
      console.log(chalk.green('  ✓ Llama 4 (via OpenRouter)'));
    }
  } else if (openRouterOnlyMode && !hasAnthropic) {
    // OpenRouter-only: all via OpenRouter
    console.log(chalk.cyan('\n🌐 OpenRouter competition (all models via OpenRouter)'));
    availableAgents.push(AGENT_PRESETS.claude);
    availableAgents.push(AGENT_PRESETS['gpt-4']);
    availableAgents.push(AGENT_PRESETS.gemini);
    availableAgents.push(AGENT_PRESETS.llama);
  } else if (hasAnthropic) {
    // Anthropic only: run Claude-family competition
    console.log(chalk.yellow('\n⚡ Running Claude-family competition (Opus vs Sonnet vs Haiku)'));
    console.log(chalk.gray('   (Add OPENAI_API_KEY/GOOGLE_AI_API_KEY for cross-provider competition)'));
    availableAgents.push(AGENT_PRESETS.claude);
    availableAgents.push(AGENT_PRESETS['claude-sonnet']);
    availableAgents.push(AGENT_PRESETS['claude-haiku']);
    console.log(chalk.green('  ✓ Claude Opus   (claude-opus-4-6)'));
    console.log(chalk.green('  ✓ Claude Sonnet (claude-sonnet-4-6)'));
    console.log(chalk.green('  ✓ Claude Haiku  (claude-haiku-4-5-20251001)'));
  }

  if (availableAgents.length < 2) {
    console.log(chalk.yellow('\n⚠️  Only one agent available. Add more API keys for competition!'));
  }

  // Get task
  const task = getTask('form-blitz');
  if (!task) {
    console.error(chalk.red('Task not found: form-blitz'));
    process.exit(1);
  }

  // Create competition
  console.log(chalk.cyan('\n📋 Creating competition...'));

  const controller = new CompetitionController();
  const competition = controller.createCompetition({
    name: 'AI Olympics - Form Blitz Showdown',
    description: 'Agents race to complete a registration form',
    agents: availableAgents,
    tasks: [task]
  });

  server.setCompetition(competition);

  // Initialize overlay
  overlayManager.initializeAgents(availableAgents.map(a => ({
    id: a.id,
    name: a.name,
    color: a.color,
    avatar: a.avatar
  })));

  // Enable AI commentary
  commentator.setEnabled(true);

  // Set up event logging
  eventBus.on('agent:action', (event) => {
    const action = event.data as any;
    const emoji = action.success ? '✅' : '❌';
    console.log(chalk.gray(`  ${emoji} [${action.agentId}] ${action.type}: ${action.target?.slice(0, 50)}`));
  });

  eventBus.on('agent:complete', (event) => {
    const data = event.data as any;
    console.log(chalk.green(`\n🏁 ${data.agentId} FINISHED!`));
  });

  eventBus.on('leaderboard:update', (event) => {
    const data = event.data as any;
    console.log(chalk.cyan('\n📊 Leaderboard Update:'));
    data.leaderboard.forEach((entry: LeaderboardEntry) => {
      console.log(`  #${entry.rank} ${entry.agentName}: ${entry.totalScore} pts`);
    });
  });

  // Start the competition
  console.log(chalk.yellow('\n🚀 Starting competition in 3 seconds...\n'));
  await new Promise(r => setTimeout(r, 3000));

  console.log(chalk.magenta('═'.repeat(60)));
  console.log(chalk.magenta.bold('                    COMPETITION START!'));
  console.log(chalk.magenta('═'.repeat(60)));
  console.log();

  const startTime = Date.now();

  try {
    await controller.startCompetition();

    const duration = Date.now() - startTime;

    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.magenta.bold('                   COMPETITION COMPLETE!'));
    console.log(chalk.magenta('═'.repeat(60)));

    console.log(chalk.cyan(`\n⏱️  Total time: ${formatDuration(duration)}`));

    // Final leaderboard
    const leaderboard = controller.getLeaderboard();
    console.log(chalk.yellow('\n🏆 FINAL STANDINGS:\n'));

    leaderboard.forEach((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      const highlight = i === 0 ? chalk.yellow.bold : chalk.white;
      console.log(highlight(`  ${medal} #${entry.rank} ${entry.agentName.padEnd(15)} ${entry.totalScore} pts`));
    });

    if (leaderboard[0]) {
      console.log(chalk.green.bold(`\n🎉 ${leaderboard[0].agentName} WINS! 🎉\n`));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Competition failed:'), error);
  }

  // Cleanup
  await controller.cleanup();

  console.log(chalk.gray('\nPress Ctrl+C to exit...'));

  // Keep server running for viewing results
  process.on('SIGINT', async () => {
    console.log(chalk.gray('\nShutting down...'));
    await server.stop();
    process.exit(0);
  });
}

// Run if executed directly
runCompetition().catch(console.error);
