/**
 * JWT Token Helpers
 *
 * Sign and verify both access and refresh tokens.
 *
 * Token lifecycle:
 *   - Access tokens: short-lived (15m default), sent in Authorization header
 *   - Refresh tokens: long-lived (7d default), stored as HttpOnly cookie
 *   - Every token gets a unique JTI (JWT ID) for blacklist tracking on logout
 *
 * The JTI is critical for token revocation — when a user logs out,
 * we store the JTI in Redis with a TTL matching the token's remaining lifetime.
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sign an access token with user identity and org context.
 * The token payload includes everything needed for auth checks
 * without hitting the database on every request.
 *
 * @param {object} payload - { userId, orgId, role }
 * @param {string} secret - JWT signing secret
 * @param {string} expiresIn - Expiry duration string, e.g., '15m'
 * @returns {{ token: string, jti: string }} Signed token + its unique ID
 */
export function signAccessToken(payload, secret, expiresIn) {
    const jti = uuidv4(); // Unique ID for this specific token instance
    const token = jwt.sign(
        { userId: payload.userId, orgId: payload.orgId, role: payload.role },
        secret,
        { expiresIn, jwtid: jti }
    );
    return { token, jti };
}

/**
 * Sign a refresh token.
 * Only carries the userId — org/role info is fetched fresh during refresh
 * so that role changes take effect without waiting for the access token to expire.
 *
 * @param {object} payload - { userId }
 * @param {string} secret - JWT signing secret
 * @param {string} expiresIn - Expiry duration string, e.g., '7d'
 * @returns {{ token: string, jti: string }} Signed token + its unique ID
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
 * @param {string} token - The JWT string to verify
 * @param {string} secret - The secret used to sign the token
 * @returns {object} Decoded payload (userId, orgId, role, jti, exp, etc.)
 */
export function verifyToken(token, secret) {
    return jwt.verify(token, secret);
}

/**
 * Decode a token WITHOUT verification.
 * Used to read the expiry claim for blacklist TTL calculation —
 * we trust the token structure even if it's expired.
 *
 * @param {string} token - The JWT string
 * @returns {object|null} Decoded payload or null if malformed
 */
export function decodeToken(token) {
    return jwt.decode(token);
}

/**
 * Calculate remaining TTL in seconds from a token's exp claim.
 * Used when blacklisting — we only keep the blacklist entry until
 * the token would have expired naturally, avoiding Redis bloat.
 *
 * @param {number} exp - Token expiry timestamp (seconds since epoch)
 * @returns {number} Remaining seconds, minimum 1 (Redis requires positive TTL)
 */
export function getRemainingTTL(exp) {
    const now = Math.floor(Date.now() / 1000);
    const remaining = exp - now;
    return Math.max(remaining, 1); // Redis EXPIRE requires at least 1 second
}
