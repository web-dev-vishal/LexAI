/**
 * Hash Helpers
 *
 * SHA-256 content hashing and secure random token generation.
 *
 * Content hashing is used for:
 *   - Redis cache keys: `analysis:${hash}` — same content = same cache hit
 *   - Deduplication: skip re-analysis if the contract text hasn't changed
 *   - Distributed lock keys: `lock:analysis:${hash}` — prevent duplicate jobs
 *
 * Secure tokens are used for:
 *   - Email verification tokens
 *   - Password reset tokens
 *   - Invitation tokens
 */

import crypto from 'crypto';

/**
 * Generate a SHA-256 hash of the given content.
 * Deterministic — same input always produces the same hash.
 *
 * @param {string} content - Raw text content to hash
 * @returns {string} 64-character hex-encoded SHA-256 hash
 */
export function hashContent(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Generate a cryptographically secure random token (hex string).
 * Each call produces a unique, unpredictable value.
 *
 * Default 32 bytes = 64 hex characters — provides 256 bits of entropy,
 * which is more than enough to resist brute-force guessing.
 *
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex-encoded random token
 */
export function generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}
