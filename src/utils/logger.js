/**
 * Winston Logger
 *
 * Structured JSON logging with request ID tracing.
 * Levels: error, warn, info, debug
 *
 * - Development: colorized, human-readable output with timestamps
 * - Production: structured JSON for log aggregators (Datadog, ELK, etc.)
 *
 * Log level is controlled by NODE_ENV:
 *   production → info (no debug noise)
 *   anything else → debug (full visibility)
 */

import winston from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Human-readable format for development — colorized with short timestamps
const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }), // Print full stack traces for Error objects
    printf(({ timestamp: ts, level, message, stack, ...meta }) => {
        // Append any extra metadata as JSON (e.g., { requestId, userId })
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${ts} ${level}: ${stack || message}${metaStr}`;
    })
);

// Structured JSON for production — easy to parse by log aggregation tools
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

// Determine log level and format based on environment
const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    format: isProduction ? prodFormat : devFormat,
    defaultMeta: { service: 'lexai' }, // Attached to every log entry
    transports: [
        new winston.transports.Console(),
    ],
    // Don't exit on uncaught exceptions — let the process manager (PM2, Docker) handle restarts
    exitOnError: false,
});

export default logger;
