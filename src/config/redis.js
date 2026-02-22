/**
 * Redis Configuration
 *
 * Creates two ioredis clients:
 *   - redisClient: general-purpose command client (GET, SET, INCR, PUBLISH, etc.)
 *   - redisSub: dedicated subscriber client (SUBSCRIBE only)
 *
 * Why two clients? A subscribed ioredis client enters "subscriber mode"
 * and can ONLY run SUBSCRIBE/UNSUBSCRIBE commands. You can't mix
 * normal commands and subscriptions on the same connection.
 *
 * Both clients share the same connection config but are independent connections.
 */

import Redis from 'ioredis';
import logger from '../utils/logger.js';

// Module-level state — initialized once during app startup
let redisClient = null;
let redisSub = null;

/**
 * Build the shared ioredis config object.
 * Keeps connection options DRY between the command and subscriber clients.
 */
function buildRedisConfig(env) {
    const config = {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        maxRetriesPerRequest: 3,   // Fail after 3 retries per individual command
        retryStrategy(times) {
            // Exponential backoff: 200ms, 400ms, 600ms... capped at 5s
            const delay = Math.min(times * 200, 5000);
            return delay;
        },
        lazyConnect: true,  // Don't connect until .connect() is called explicitly
    };

    // Only set password if one is configured — empty password breaks some Redis setups
    if (env.REDIS_PASSWORD) {
        config.password = env.REDIS_PASSWORD;
    }

    return config;
}

/**
 * Initialize both Redis clients. Call this once during app startup.
 * Connects both clients in parallel for faster boot time.
 *
 * @param {object} env - Validated environment config
 */
export async function initRedis(env) {
    const config = buildRedisConfig(env);

    // Command client — used for caching, rate limiting, quota tracking, locks
    redisClient = new Redis(config);
    redisClient.on('connect', () => logger.info('✅ Redis command client connected'));
    redisClient.on('error', (err) => logger.error('Redis command client error:', err.message));

    // Subscriber client — dedicated to Pub/Sub message receiving
    redisSub = new Redis(config);
    redisSub.on('connect', () => logger.info('✅ Redis subscriber client connected'));
    redisSub.on('error', (err) => logger.error('Redis subscriber client error:', err.message));

    // Connect both clients simultaneously
    await Promise.all([redisClient.connect(), redisSub.connect()]);
}

/**
 * Get the command client — used for GET, SET, INCR, PUBLISH, etc.
 * Throws if called before initRedis() — catches init-order bugs early.
 */
export function getRedisClient() {
    if (!redisClient) throw new Error('Redis command client not initialized. Call initRedis() first.');
    return redisClient;
}

/**
 * Get the subscriber client — used exclusively for SUBSCRIBE / PSUBSCRIBE.
 * Throws if called before initRedis().
 */
export function getRedisSub() {
    if (!redisSub) throw new Error('Redis subscriber client not initialized. Call initRedis() first.');
    return redisSub;
}

/**
 * Check if Redis is responsive (used by /health endpoint).
 * Sends a PING command and expects "PONG" back.
 *
 * @returns {Promise<boolean>}
 */
export async function isRedisHealthy() {
    try {
        const pong = await redisClient.ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}

/**
 * Gracefully close both Redis connections.
 * Uses quit() instead of disconnect() to finish pending commands.
 */
export async function disconnectRedis() {
    try {
        if (redisClient) await redisClient.quit();
        if (redisSub) await redisSub.quit();
        logger.info('Redis clients disconnected gracefully');
    } catch (err) {
        logger.error('Error during Redis disconnect:', err);
    }
}
