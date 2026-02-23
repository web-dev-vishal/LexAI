/**
 * Auth Middleware
 *
 * Verifies the JWT access token from the Authorization header.
 * Checks the Redis blacklist to handle logged-out tokens.
 * Attaches the decoded user to req.user for downstream use.
 */

import { verifyToken } from '../utils/tokenHelper.js';
import { getRedisClient } from '../config/redis.js';
import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Protect routes — requires a valid, non-blacklisted JWT.
 * Must be placed before any route that requires authentication.
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return sendError(res, {
                statusCode: HTTP.UNAUTHORIZED,
                code: 'UNAUTHORIZED',
                message: 'Access token is required. Provide it as: Authorization: Bearer <token>',
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token, env.JWT_ACCESS_SECRET);

        // Check if token has been blacklisted (user logged out)
        const redis = getRedisClient();
        const isBlacklisted = await redis.exists(`blacklist:${decoded.jti}`);

        if (isBlacklisted) {
            return sendError(res, {
                statusCode: HTTP.UNAUTHORIZED,
                code: 'UNAUTHORIZED',
                message: 'Token has been revoked. Please log in again.',
            });
        }

        // Attach user info to request for downstream middleware and controllers
        req.user = {
            userId: decoded.userId,
            orgId: decoded.orgId,
            role: decoded.role,
            jti: decoded.jti,
            exp: decoded.exp,
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return sendError(res, {
                statusCode: HTTP.UNAUTHORIZED,
                code: 'UNAUTHORIZED',
                message: 'Access token has expired. Use /auth/refresh-token to get a new one.',
            });
        }

        if (err.name === 'JsonWebTokenError') {
            return sendError(res, {
                statusCode: HTTP.UNAUTHORIZED,
                code: 'UNAUTHORIZED',
                message: 'Invalid access token.',
            });
        }

        logger.error('Auth middleware error:', err);
        return sendError(res, {
            statusCode: HTTP.INTERNAL_ERROR,
            message: 'Authentication failed.',
        });
    }
}
