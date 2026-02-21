/**
 * Redis Pub/Sub Subscriber
 *
 * Bridges events from the worker process (which can't directly access Socket.io)
 * to connected clients via Socket.io rooms.
 *
 * Flow:
 *   Worker → PUBLISH redis 'lexai:socket:events' JSON
 *   → This subscriber receives the message
 *   → Parses the JSON and calls io.to(room).emit(event, payload)
 *   → Connected clients receive the real-time event
 */

const { PUBSUB_CHANNEL } = require('../constants/queues');
const logger = require('../utils/logger');

/**
 * Initialize the Pub/Sub subscriber.
 * @param {import('ioredis').Redis} redisSub - Dedicated subscriber client
 * @param {import('socket.io').Server} io - Socket.io server instance
 */
function initPubSubSubscriber(redisSub, io) {
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

            // Emit to the specified Socket.io room
            io.to(room).emit(event, payload);

            logger.debug('Pub/Sub → Socket.io', { event, room, payloadKeys: Object.keys(payload || {}) });
        } catch (err) {
            logger.error('Error processing Pub/Sub message:', err.message);
        }
    });
}

module.exports = { initPubSubSubscriber };
