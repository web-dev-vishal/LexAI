/**
 * Auth Middleware
 *
 * Verifies the JWT access token from the Authorization header.
 * Checks the Redis blacklist to handle logged-out tokens.
 * Attaches the decoded user to req.user for downstream use.
 */

const { verifyToken } = require('../utils/tokenHelper');
const { getRedisClient } = require('../config/redis');
const { sendError } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');

/**
 * Protect routes — requires a valid, non-blacklisted JWT.
 */
async function authenticate(req, res, next) {
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
        const decoded = verifyToken(token, process.env.JWT_ACCESS_SECRET);

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

        // Attach user info to request
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

module.exports = { authenticate };
