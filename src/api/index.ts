import 'dotenv/config';
import { createLogger } from '../shared/utils/logger.js';
import { createAPIServer } from './server.js';

export { createAPIServer, startApiServer } from './server.js';

const log = createLogger('Process');

// Global error handlers — prevent silent crashes in production
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception — shutting down', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', { reason: String(reason) });
});

// Start server when run directly
const api = createAPIServer();
api.start();
