import 'dotenv/config';
import { createAPIServer } from './api/server.js';
import { CompetitionController } from './orchestrator/competition-controller.js';
import { sandboxManager } from './orchestrator/sandbox-manager.js';
import { overlayManager } from './streaming/overlay-manager.js';
import { commentator } from './streaming/commentary.js';
import { config, validateConfig } from './shared/config.js';
import { createLogger } from './shared/utils/logger.js';
import { startGauntletScheduler } from './services/gauntlet-scheduler.js';

const log = createLogger('Main');

async function main() {
  log.info('🏆 AI Olympics Starting...');

  // Validate configuration
  const validation = validateConfig();
  if (!validation.valid) {
    log.error('Configuration errors:', { errors: validation.errors });
    process.exit(1);
  }

  // Initialize sandbox environment
  try {
    await sandboxManager.initialize();
  } catch (error) {
    log.warn('Docker not available - running in local mode');
  }

  // Start API server
  const server = createAPIServer();
  await server.start(config.port);

  // Start gauntlet weekly scheduler
  const stopGauntletScheduler = startGauntletScheduler();
  log.info('Gauntlet scheduler started');

  log.info('✅ AI Olympics Ready');
  log.info(`📺 Dashboard: http://localhost:${config.port}`);
  log.info(`🔌 WebSocket: ws://localhost:${config.port}`);
  log.info(`📋 Tasks: http://localhost:${config.port}/tasks/form-blitz`);

  // Handle shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    stopGauntletScheduler();
    await sandboxManager.cleanup();
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  log.error('Fatal error:', { error });
  process.exit(1);
});

export { CompetitionController, sandboxManager, overlayManager, commentator };
