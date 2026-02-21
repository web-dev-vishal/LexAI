/**
 * RabbitMQ Connection & Channel Factory
 *
 * amqplib does NOT auto-reconnect, so we implement our own reconnection
 * loop with exponential backoff (1s → 2s → 4s → ... → max 30s).
 *
 * Exports:
 *   - connectRabbitMQ(url)  — establish connection + setup exchanges/queues
 *   - getChannel()          — get the shared channel
 *   - publishToQueue(queue, payload) — publish a persistent message
 *   - isRabbitHealthy()     — health check
 *   - disconnectRabbitMQ()  — graceful shutdown
 */

const amqplib = require('amqplib');
const logger = require('../utils/logger');

let connection = null;
let channel = null;
let reconnectTimer = null;
let currentUrl = null;

const MAX_BACKOFF_MS = 30000;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Connect to RabbitMQ, create durable queues, and wire up the Dead Letter Exchange.
 * @param {string} url - AMQP connection URL
 */
async function connectRabbitMQ(url) {
    currentUrl = url;

    try {
        connection = await amqplib.connect(url);
        logger.info('✅ RabbitMQ connected successfully');

        connection.on('error', (err) => {
            logger.error('RabbitMQ connection error:', err.message);
        });

        connection.on('close', () => {
            logger.warn('RabbitMQ connection closed. Scheduling reconnect...');
            channel = null;
            scheduleReconnect();
        });

        channel = await connection.createChannel();
        await channel.prefetch(1);

        // Dead Letter Exchange
        const dlxExchange = process.env.DLX_EXCHANGE || 'lexai.dlx';
        await channel.assertExchange(dlxExchange, 'direct', { durable: true });
        await channel.assertQueue('lexai.analysis.dlq', {
            durable: true,
            arguments: {},
        });
        await channel.bindQueue('lexai.analysis.dlq', dlxExchange, 'analysis.failed');

        // Main analysis queue — dead-lettered to DLX on rejection
        const analysisQueue = process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue';
        await channel.assertQueue(analysisQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': dlxExchange,
                'x-dead-letter-routing-key': 'analysis.failed',
            },
        });

        // Alert queue
        const alertQueue = process.env.ALERT_QUEUE || 'lexai.alert.queue';
        await channel.assertQueue(alertQueue, { durable: true });

        logger.info('RabbitMQ queues and exchanges asserted');
    } catch (err) {
        logger.error('RabbitMQ connection failed:', err.message);
        scheduleReconnect();
    }
}

/**
 * Reconnect with exponential backoff.
 */
function scheduleReconnect(attempt = 1) {
    if (reconnectTimer) return; // already scheduled

    const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
    logger.info(`RabbitMQ reconnect attempt ${attempt} in ${delay}ms...`);

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        try {
            await connectRabbitMQ(currentUrl);
        } catch {
            scheduleReconnect(attempt + 1);
        }
    }, delay);
}

/**
 * Get the shared channel. Returns null if not connected.
 */
function getChannel() {
    return channel;
}

/**
 * Publish a persistent JSON message to a queue.
 * @param {string} queue - Queue name
 * @param {object} payload - Message payload (will be JSON-stringified)
 */
function publishToQueue(queue, payload) {
    if (!channel) {
        logger.error('Cannot publish — RabbitMQ channel not available');
        throw new Error('RabbitMQ channel not available');
    }

    const message = Buffer.from(JSON.stringify(payload));
    channel.sendToQueue(queue, message, { persistent: true });
    logger.debug(`Published message to ${queue}`, { jobId: payload.jobId });
}

/**
 * Check if RabbitMQ is responsive (used by /health endpoint).
 */
function isRabbitHealthy() {
    return !!(connection && channel);
}

/**
 * Gracefully close the connection.
 */
async function disconnectRabbitMQ() {
    try {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (channel) await channel.close();
        if (connection) await connection.close();
        logger.info('RabbitMQ disconnected gracefully');
    } catch (err) {
        logger.error('Error during RabbitMQ disconnect:', err);
    }
}

module.exports = {
    connectRabbitMQ,
    getChannel,
    publishToQueue,
    isRabbitHealthy,
    disconnectRabbitMQ,
};
