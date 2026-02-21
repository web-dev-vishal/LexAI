/**
 * Alert Worker
 *
 * RabbitMQ consumer for contract expiry alert jobs.
 * Receives jobs from the expiry cron scanner and dispatches
 * both Socket.io events and emails to org members.
 */

const { getChannel } = require('../config/rabbitmq');
const { getRedisClient } = require('../config/redis');
const alertService = require('../services/alert.service');
const logger = require('../utils/logger');

const ALERT_QUEUE = process.env.ALERT_QUEUE || 'lexai.alert.queue';

/**
 * Start consuming alert jobs from the queue.
 */
async function startAlertWorker() {
    const channel = getChannel();
    if (!channel) {
        logger.error('Cannot start alert worker — RabbitMQ channel not available');
        return;
    }

    logger.info(`Alert worker listening on queue: ${ALERT_QUEUE}`);

    channel.consume(ALERT_QUEUE, async (msg) => {
        if (!msg) return;

        try {
            const payload = JSON.parse(msg.content.toString());
            const redis = getRedisClient();

            await alertService.processExpiryAlert(payload, redis);
            channel.ack(msg);
        } catch (err) {
            logger.error('Alert job failed:', err.message);
            channel.nack(msg, false, false); // Don't requeue failed alerts
        }
    }, { noAck: false });
}

module.exports = { startAlertWorker };
