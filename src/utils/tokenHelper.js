/**
 * JWT Token Helpers
 *
 * Sign and verify access and refresh tokens.
 *
 * Token lifecycle:
 *   - Access tokens:  short-lived (15m default), sent in Authorization header
 *   - Refresh tokens: long-lived (7d default), stored as HttpOnly cookie
 *   - Every token gets a unique JTI (JWT ID) for blacklist tracking on logout
 *
 * Note: email verification and password reset tokens are NOT JWTs.
 * They use crypto.randomBytes hex strings stored directly in Redis
 * (see auth.service.js). This module only handles access and refresh tokens.
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sign an access token.
 * Payload contains everything needed for auth checks without hitting the DB.
 *
 * @param {{ userId, orgId, role }} payload
 * @param {string} secret   — JWT_ACCESS_SECRET
 * @param {string} expiresIn — e.g. '15m'
 * @returns {{ token: string, jti: string }}
 */
export function signAccessToken(payload, secret, expiresIn) {
    const jti = uuidv4();
    const token = jwt.sign(
        { userId: payload.userId, orgId: payload.orgId, role: payload.role },
        secret,
        { expiresIn, jwtid: jti }
    );
    return { token, jti };
}

/**
 * Sign a refresh token.
 * Only carries userId — org/role is fetched fresh on refresh so changes
 * take effect without waiting for the access token to expire.
 *
 * @param {{ userId }} payload
 * @param {string} secret   — JWT_REFRESH_SECRET
 * @param {string} expiresIn — e.g. '7d'
 * @returns {{ token: string, jti: string }}
 */
export function signRefreshToken(payload, secret, expiresIn) {
    const jti = uuidv4();
    const token = jwt.sign(
        { userId: payload.userId },
        secret,
        { expiresIn, jwtid: jti }
    );
    return { token, jti };
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws TokenExpiredError or JsonWebTokenError on invalid tokens.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {object} Decoded payload
 */
export function verifyToken(token, secret) {
    return jwt.verify(token, secret);
}

/**
 * Decode a JWT WITHOUT verifying the signature.
 * Used to read the exp claim for blacklist TTL calculation on expired tokens.
 *
 * @param {string} token
 * @returns {object|null}
 */
export function decodeToken(token) {
    return jwt.decode(token);
}

/**
 * Calculate remaining TTL in seconds from a token's exp claim.
 * Redis EXPIRE requires at least 1 second — return minimum of 1.
 *
 * @param {number} exp — seconds since epoch
 * @returns {number}
 */
export function getRemainingTTL(exp) {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(exp - now, 1);
}