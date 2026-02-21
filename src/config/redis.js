/**
 * Redis Configuration
 * Creates two ioredis clients:
 *   - redisClient: standard command client (GET, SET, INCR, PUBLISH, etc.)
 *   - redisSub:    dedicated subscriber client (SUBSCRIBE only — cannot issue other commands)
 *
 * A subscribed ioredis client is locked into subscriber mode, so we need
 * a separate instance for Pub/Sub listening.
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let redisSub = null;

/**
 * Build the shared ioredis config object.
 */
function buildRedisConfig(env) {
    const config = {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 200, 5000);
            return delay;
        },
        lazyConnect: true,
    };

    if (env.REDIS_PASSWORD) {
        config.password = env.REDIS_PASSWORD;
    }

    return config;
}

/**
 * Initialize both Redis clients. Call this once during app startup.
 * @param {object} env - Validated env config
 */
async function initRedis(env) {
    const config = buildRedisConfig(env);

    // Command client
    redisClient = new Redis(config);
    redisClient.on('connect', () => logger.info('✅ Redis command client connected'));
    redisClient.on('error', (err) => logger.error('Redis command client error:', err.message));

    // Subscriber client (separate instance)
    redisSub = new Redis(config);
    redisSub.on('connect', () => logger.info('✅ Redis subscriber client connected'));
    redisSub.on('error', (err) => logger.error('Redis subscriber client error:', err.message));

    await Promise.all([redisClient.connect(), redisSub.connect()]);
}

/**
 * Get the command client — used for GET, SET, INCR, PUBLISH, etc.
 */
function getRedisClient() {
    if (!redisClient) throw new Error('Redis command client not initialized. Call initRedis() first.');
    return redisClient;
}

/**
 * Get the subscriber client — used exclusively for SUBSCRIBE / PSUBSCRIBE.
 */
function getRedisSub() {
    if (!redisSub) throw new Error('Redis subscriber client not initialized. Call initRedis() first.');
    return redisSub;
}

/**
 * Check if Redis is responsive (used by /health endpoint).
 * @returns {Promise<boolean>}
 */
async function isRedisHealthy() {
    try {
        const pong = await redisClient.ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}

/**
 * Gracefully close both Redis connections.
 */
async function disconnectRedis() {
    try {
        if (redisClient) await redisClient.quit();
        if (redisSub) await redisSub.quit();
        logger.info('Redis clients disconnected gracefully');
    } catch (err) {
        logger.error('Error during Redis disconnect:', err);
    }
}

module.exports = {
    initRedis,
    getRedisClient,
    getRedisSub,
    isRedisHealthy,
    disconnectRedis,
};
