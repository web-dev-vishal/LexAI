/**
 * JWT Token Helpers
 *
 * Sign and verify both access and refresh tokens.
 * Access tokens are short-lived (15m), refresh tokens long-lived (7d).
 * Every token gets a unique JTI (JWT ID) for blacklist tracking.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * Sign an access token.
 * @param {object} payload - { userId, orgId, role }
 * @param {string} secret
 * @param {string} expiresIn - e.g., '15m'
 * @returns {{ token: string, jti: string }}
 */
function signAccessToken(payload, secret, expiresIn) {
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
 * @param {object} payload - { userId }
 * @param {string} secret
 * @param {string} expiresIn - e.g., '7d'
 * @returns {{ token: string, jti: string }}
 */
function signRefreshToken(payload, secret, expiresIn) {
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
 * Throws on invalid/expired tokens.
 * @param {string} token
 * @param {string} secret
 * @returns {object} Decoded payload
 */
function verifyToken(token, secret) {
    return jwt.verify(token, secret);
}

/**
 * Decode a token without verification (to read its expiry for blacklist TTL).
 * @param {string} token
 * @returns {object|null}
 */
function decodeToken(token) {
    return jwt.decode(token);
}

/**
 * Calculate remaining TTL in seconds from a token's exp claim.
 * Used when blacklisting a token — we only need to keep the blacklist entry
 * until the token would have expired naturally.
 * @param {number} exp - Token expiry timestamp (seconds since epoch)
 * @returns {number} Remaining seconds, floored at 1
 */
function getRemainingTTL(exp) {
    const now = Math.floor(Date.now() / 1000);
    const remaining = exp - now;
    return Math.max(remaining, 1);
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyToken,
    decodeToken,
    getRemainingTTL,
};
