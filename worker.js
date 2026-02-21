/**
 * Worker Entry Point
 *
 * Runs RabbitMQ consumers for AI analysis and alert jobs.
 * This is a separate process from the API server — it does NOT
 * handle HTTP requests or Socket.io connections.
 *
 * Communication with the API process happens via Redis Pub/Sub.
 */

const env = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const { initRedis } = require('./src/config/redis');
const { connectRabbitMQ } = require('./src/config/rabbitmq');
const { initEmailTransporter } = require('./src/services/email.service');
const { startAnalysisWorker } = require('./src/workers/analysis.worker');
const { startAlertWorker } = require('./src/workers/alert.worker');
const logger = require('./src/utils/logger');

async function startWorker() {
    try {
        // 1. Connect to MongoDB (workers need to read/write analysis results)
        await connectDB(env.MONGO_URI);

        // 2. Connect to Redis (for caching, Pub/Sub publishing, distributed locks)
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

            const { disconnectDB } = require('./src/config/db');
            const { disconnectRedis } = require('./src/config/redis');
            const { disconnectRabbitMQ } = require('./src/config/rabbitmq');

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
