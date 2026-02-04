import winston from 'winston';
import chalk from 'chalk';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, agentId, component, ...meta }) => {
  const ts = chalk.gray(`[${timestamp}]`);
  const comp = component ? chalk.cyan(`[${component}]`) : '';
  const agent = agentId ? chalk.yellow(`[${agentId}]`) : '';
  const metaStr = Object.keys(meta).length ? chalk.gray(` ${JSON.stringify(meta)}`) : '';

  return `${ts} ${level} ${comp}${agent} ${message}${metaStr}`;
});

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        consoleFormat
      )
    }),
    // File transport for persistent logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Helper to create component-specific loggers
export function createLogger(component: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(message, { component, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { component, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(message, { component, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, { component, ...meta }),
    agent: (agentId: string, message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { component, agentId, ...meta })
  };
}

export default logger;
