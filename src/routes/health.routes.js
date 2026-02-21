/**
 * Health Check Route
 * Unauthenticated — used by Docker healthchecks and load balancers.
 */

const { Router } = require('express');
const { isMongoHealthy } = require('../config/db');
const { isRedisHealthy } = require('../config/redis');
const { isRabbitHealthy } = require('../config/rabbitmq');

const router = Router();

router.get('/', async (req, res) => {
    const [mongoOk, redisOk, rabbitOk] = await Promise.all([
        isMongoHealthy().catch(() => false),
        isRedisHealthy().catch(() => false),
        Promise.resolve(isRabbitHealthy()),
    ]);

    const allHealthy = mongoOk && redisOk && rabbitOk;

    const body = {
        status: allHealthy ? 'ok' : 'degraded',
        services: {
            mongodb: mongoOk ? 'up' : 'down',
            redis: redisOk ? 'up' : 'down',
            rabbitmq: rabbitOk ? 'up' : 'down',
        },
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
    };

    res.status(allHealthy ? 200 : 503).json(body);
});

module.exports = router;
