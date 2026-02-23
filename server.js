/**
 * Server Entry Point
 *
 * Starts the HTTP server with Socket.io, connects to all services,
 * initializes the Redis Pub/Sub subscriber, and starts the cron job.
 *
 * This is the API process — it handles HTTP requests and Socket.io.
 * The AI worker runs separately via worker.js.
 */

import http from 'http';
import env from './src/config/env.js';
import createApp from './src/app.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { initRedis, getRedisClient, getRedisSub, disconnectRedis } from './src/config/redis.js';
import { connectRabbitMQ, disconnectRabbitMQ } from './src/config/rabbitmq.js';
import { initSocket } from './src/config/socket.js';
import { initPubSubSubscriber } from './src/sockets/pubsub.subscriber.js';
import { initEmailTransporter } from './src/services/email.service.js';
import { startExpiryCron } from './src/jobs/expiry.cron.js';
import logger from './src/utils/logger.js';

async function startServer() {
    try {
        // 1. Connect to MongoDB
        await connectDB(env.MONGO_URI);

        // 2. Connect to Redis (both command + subscriber clients)
        await initRedis(env);

        // 3. Connect to RabbitMQ
        await connectRabbitMQ(env.RABBITMQ_URL);

        // 4. Initialize email transporter
        initEmailTransporter();

        // 5. Create Express app
        const app = createApp();

        // 6. Create HTTP server
        const server = http.createServer(app);

        // 7. Initialize Socket.io with Redis adapter
        const adapterPub = getRedisClient().duplicate();
        const adapterSub = getRedisClient().duplicate();
        const io = initSocket(server, env, adapterPub, adapterSub);

        // 8. Initialize Redis Pub/Sub subscriber (worker → Socket.io bridge)
        const redisSub = getRedisSub();
        initPubSubSubscriber(redisSub, io);

        // 9. Start expiry cron job
        startExpiryCron();

        // 10. Start listening
        const PORT = env.PORT || 3000;
        server.listen(PORT, () => {
            logger.info(`🚀 LexAI API server running on port ${PORT}`);
            logger.info(`   Health: http://localhost:${PORT}/health`);
            logger.info(`   API:    http://localhost:${PORT}/api/${env.API_VERSION}`);
            logger.info(`   Env:    ${env.NODE_ENV}`);
        });

        // ─── Graceful Shutdown ────────────────────────────────────────
        const shutdown = async (signal) => {
            logger.info(`\n${signal} received. Starting graceful shutdown...`);

            server.close(async () => {
                logger.info('HTTP server closed');

                await Promise.allSettled([
                    disconnectDB(),
                    disconnectRedis(),
                    disconnectRabbitMQ(),
                ]);

                logger.info('All connections closed. Goodbye! 👋');
                process.exit(0);
            });

            // Force exit after 30 seconds (matches Docker stop_grace_period)
            setTimeout(() => {
                logger.error('Graceful shutdown timed out. Forcing exit.');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled Promise Rejection:', reason);
        });

        process.on('uncaughtException', (err) => {
            logger.error('Uncaught Exception:', err);
            process.exit(1);
        });
    } catch (err) {
        logger.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();