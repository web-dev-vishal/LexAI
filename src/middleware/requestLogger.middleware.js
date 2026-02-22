/**
 * Request Logger Middleware
 *
 * Assigns a unique request ID to every incoming request and logs
 * the request/response cycle with Morgan → Winston pipeline.
 */

import { v4 as uuidv4 } from 'uuid';
import morgan from 'morgan';
import logger from '../utils/logger.js';

/**
 * Attach a unique request ID to every request.
 * Respects existing X-Request-ID headers from load balancers.
 */
export function attachRequestId(req, res, next) {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.set('X-Request-ID', req.requestId);
    next();
}

/**
 * Morgan HTTP logger that pipes output through Winston.
 * Logs 4xx+ responses as warnings, everything else as info.
 */
export const httpLogger = morgan(
    (tokens, req, res) => {
        return JSON.stringify({
            requestId: req.requestId,
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: tokens.status(req, res),
            responseTimeMs: tokens['response-time'](req, res),
            contentLength: tokens.res(req, res, 'content-length'),
            userAgent: tokens['user-agent'](req, res),
            ip: req.ip,
            userId: req.user?.userId || 'anonymous',
        });
    },
    {
        stream: {
            write(message) {
                try {
                    const data = JSON.parse(message);
                    const level = parseInt(data.status) >= 400 ? 'warn' : 'info';
                    logger[level]('HTTP Request', data);
                } catch {
                    logger.info(message.trim());
                }
            },
        },
    }
);
