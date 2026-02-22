/**
 * Redis Pub/Sub Subscriber
 *
 * Bridges events from the worker process to connected Socket.io clients.
 * Worker → PUBLISH → this subscriber → io.to(room).emit()
 */

import { PUBSUB_CHANNEL } from '../constants/queues.js';
import logger from '../utils/logger.js';

/**
 * Initialize the Pub/Sub subscriber.
 * @param {import('ioredis').Redis} redisSub - Dedicated subscriber client
 * @param {import('socket.io').Server} io - Socket.io server instance
 */
export function initPubSubSubscriber(redisSub, io) {
    redisSub.subscribe(PUBSUB_CHANNEL, (err, count) => {
        if (err) {
            logger.error('Failed to subscribe to Redis Pub/Sub channel:', err.message);
            return;
        }
        logger.info(`✅ Subscribed to Redis Pub/Sub channel: ${PUBSUB_CHANNEL} (${count} subscription(s))`);
    });

    redisSub.on('message', (channel, message) => {
        if (channel !== PUBSUB_CHANNEL) return;

        try {
            const { event, room, payload } = JSON.parse(message);

            if (!event || !room) {
                logger.warn('Malformed Pub/Sub message — missing event or room:', message);
                return;
            }

            io.to(room).emit(event, payload);
            logger.debug('Pub/Sub → Socket.io', { event, room, payloadKeys: Object.keys(payload || {}) });
        } catch (err) {
            logger.error('Error processing Pub/Sub message:', err.message);
        }
    });
}
