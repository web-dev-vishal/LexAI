/**
 * Worker Entry Point
 *
 * Runs RabbitMQ consumers for AI analysis and alert jobs.
 * Separate process from the API server — no HTTP or Socket.io.
 * Communicates with the API process via Redis Pub/Sub.
 */

import env from './src/config/env.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { initRedis, disconnectRedis } from './src/config/redis.js';
import { connectRabbitMQ, disconnectRabbitMQ } from './src/config/rabbitmq.js';
import { initEmailTransporter } from './src/services/email.service.js';
import { startAnalysisWorker } from './src/workers/analysis.worker.js';
import { startAlertWorker } from './src/workers/alert.worker.js';
import logger from './src/utils/logger.js';

async function startWorker() {
    try {
        // 1. Connect to MongoDB (workers need to read/write analysis results)
        await connectDB(env.MONGO_URI);

        // 2. Connect to Redis (caching, Pub/Sub publishing, distributed locks)
        await initRedis(env);

        // 3. Connect to RabbitMQ
        await connectRabbitMQ(env.RABBITMQ_URL);

        // 4. Initialize email transporter (alert worker sends emails)
        initEmailTransporter();

        // 5. Start consumers
        await startAnalysisWorker();
        await startAlertWorker();

        logger.info('🔧 LexAI Worker started — consuming analysis + alert queues');

        // ─── Graceful Shutdown ────────────────────────────────────────
        const shutdown = async (signal) => {
            logger.info(`\n${signal} received. Shutting down worker...`);

            await Promise.allSettled([
                disconnectDB(),
                disconnectRedis(),
                disconnectRabbitMQ(),
            ]);

            logger.info('Worker shutdown complete. 👋');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('unhandledRejection', (reason) => {
            logger.error('Worker unhandled rejection:', reason);
        });

        process.on('uncaughtException', (err) => {
            logger.error('Worker uncaught exception:', err);
            process.exit(1);
        });
    } catch (err) {
        logger.error('Failed to start worker:', err);
        process.exit(1);
    }
}

startWorker();
