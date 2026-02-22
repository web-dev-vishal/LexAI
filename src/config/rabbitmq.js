/**
 * RabbitMQ Connection & Channel Factory
 *
 * amqplib does NOT auto-reconnect, so we implement our own reconnection
 * loop with exponential backoff (1s → 2s → 4s → ... → max 30s).
 *
 * Architecture:
 *   - Single shared channel (prefetch=1 for fair dispatch to workers)
 *   - Dead Letter Exchange (DLX) for permanently failed messages
 *   - Durable queues survive broker restarts
 *   - Persistent messages survive broker restarts
 */

import amqplib from 'amqplib';
import logger from '../utils/logger.js';

// Module-level state
let connection = null;
let channel = null;
let reconnectTimer = null;
let currentUrl = null;

// Reconnection backoff limits
const MAX_BACKOFF_MS = 30000;     // Cap at 30 seconds between retries
const INITIAL_BACKOFF_MS = 1000;  // Start at 1 second

/**
 * Connect to RabbitMQ, create durable queues, and wire up the Dead Letter Exchange.
 * Called during app startup and again on reconnection.
 *
 * @param {string} url - AMQP connection URL (e.g., amqp://localhost)
 */
export async function connectRabbitMQ(url) {
    currentUrl = url; // Store for reconnection attempts

    try {
        connection = await amqplib.connect(url);
        logger.info('✅ RabbitMQ connected successfully');

        // Monitor connection health — triggers reconnect on failure
        connection.on('error', (err) => {
            logger.error('RabbitMQ connection error:', err.message);
        });

        connection.on('close', () => {
            logger.warn('RabbitMQ connection closed. Scheduling reconnect...');
            channel = null; // Mark channel as unavailable
            scheduleReconnect();
        });

        // Create a channel with prefetch=1 (each worker processes one job at a time)
        channel = await connection.createChannel();
        await channel.prefetch(1);

        // ─── Dead Letter Exchange Setup ────────────────────────────
        // Failed messages get routed here instead of being lost
        const dlxExchange = process.env.DLX_EXCHANGE || 'lexai.dlx';
        await channel.assertExchange(dlxExchange, 'direct', { durable: true });

        // DLQ — where dead-lettered analysis jobs end up for manual inspection
        await channel.assertQueue('lexai.analysis.dlq', {
            durable: true,
            arguments: {},
        });
        await channel.bindQueue('lexai.analysis.dlq', dlxExchange, 'analysis.failed');

        // ─── Main Analysis Queue ────────────────────────────────────
        // On rejection (nack without requeue), messages route to the DLX
        const analysisQueue = process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue';
        await channel.assertQueue(analysisQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': dlxExchange,
                'x-dead-letter-routing-key': 'analysis.failed',
            },
        });

        // ─── Alert Queue ────────────────────────────────────────────
        // Simpler queue — no DLX (failed alerts are logged and dropped)
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
 * Only schedules one reconnect at a time (idempotent).
 */
function scheduleReconnect(attempt = 1) {
    if (reconnectTimer) return; // Already scheduled — don't double-schedule

    // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
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
 * Callers should check for null before using the channel.
 */
export function getChannel() {
    return channel;
}

/**
 * Publish a persistent JSON message to a queue.
 * Messages marked as persistent survive broker restarts.
 *
 * @param {string} queue - Queue name
 * @param {object} payload - Message payload (will be JSON-stringified)
 * @throws {Error} If the channel is not available
 */
export function publishToQueue(queue, payload) {
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
 * Simple check: both connection and channel objects exist.
 */
export function isRabbitHealthy() {
    return !!(connection && channel);
}

/**
 * Gracefully close the connection and clear any pending reconnect timer.
 * Closes channel first, then connection (order matters).
 */
export async function disconnectRabbitMQ() {
    try {
        // Cancel any pending reconnection attempts
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
