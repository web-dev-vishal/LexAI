/**
 * Rate Limiter Middleware
 *
 * IP-based sliding window rate limiting using Redis.
 * Default: 100 requests per 60-second window per IP.
 * Fails open if Redis is unavailable.
 */

import { getRedisClient } from '../config/redis.js';
import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import logger from '../utils/logger.js';

/**
 * Create a rate limiter middleware.
 * @param {object} [options]
 * @param {number} [options.windowMs=60000] - Window size in milliseconds
 * @param {number} [options.max=100] - Max requests per window
 */
export function rateLimiter(options = {}) {
    const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
    const max = options.max || parseInt(process.env.RATE_LIMIT_MAX) || 100;
    const windowSec = Math.ceil(windowMs / 1000);

    return async (req, res, next) => {
        try {
            const redis = getRedisClient();
            const ip = req.ip || req.connection.remoteAddress;
            const windowKey = Math.floor(Date.now() / windowMs);
            const key = `ratelimit:${ip}:${windowKey}`;

            const current = await redis.incr(key);
            if (current === 1) {
                await redis.expire(key, windowSec);
            }

            const resetTime = Math.ceil(((windowKey + 1) * windowMs) / 1000);

            // Set standard rate-limit headers on every response
            res.set('X-RateLimit-Limit', String(max));
            res.set('X-RateLimit-Remaining', String(Math.max(0, max - current)));
            res.set('X-RateLimit-Reset', String(resetTime));

            if (current > max) {
                const retryAfter = Math.ceil((resetTime * 1000 - Date.now()) / 1000);
                res.set('Retry-After', String(retryAfter));

                return sendError(res, {
                    statusCode: HTTP.TOO_MANY_REQUESTS,
                    code: 'RATE_LIMITED',
                    message: `Too many requests. Please try again in ${retryAfter} seconds.`,
                    details: [{ retryAfter }],
                });
            }

            next();
        } catch (err) {
            // Fail open — allow the request through if Redis is down
            logger.error('Rate limiter error:', err.message);
            next();
        }
    };
}
