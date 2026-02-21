/**
 * Hash Helpers
 *
 * SHA-256 content hashing for:
 *   - Redis cache keys (analysis:${hash})
 *   - Deduplication (skip re-analysis if content hasn't changed)
 *   - Distributed lock keys (lock:analysis:${hash})
 */

const crypto = require('crypto');

/**
 * Generate a SHA-256 hash of the given content.
 * @param {string} content - Raw text content
 * @returns {string} Hex-encoded hash
 */
function hashContent(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Generate a cryptographically secure random token (hex string).
 * Used for email verification tokens, password reset tokens, invitation tokens.
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex-encoded token
 */
function generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { hashContent, generateSecureToken };
