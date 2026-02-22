/** Health Check Route — unauthenticated, for Docker/load balancer probes. */

import { Router } from 'express';
import { isMongoHealthy } from '../config/db.js';
import { isRedisHealthy } from '../config/redis.js';
import { isRabbitHealthy } from '../config/rabbitmq.js';

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

export default router;
