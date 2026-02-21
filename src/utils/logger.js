/**
 * Winston Logger
 *
 * Structured JSON logging with request ID tracing.
 * Levels: error, warn, info, debug
 * In production, only error/warn/info are logged.
 */

const winston = require('winston');

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Human-readable format for development
const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ timestamp: ts, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${ts} ${level}: ${stack || message}${metaStr}`;
    })
);

// Structured JSON for production
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    defaultMeta: { service: 'lexai' },
    transports: [
        new winston.transports.Console(),
    ],
    // Don't exit on uncaught exceptions — let the process manager handle it
    exitOnError: false,
});

module.exports = logger;
