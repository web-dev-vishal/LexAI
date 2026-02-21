/**
 * Queue Name Constants
 * Single source of truth for all RabbitMQ queue/exchange names.
 */

const QUEUES = Object.freeze({
    ANALYSIS: 'lexai.analysis.queue',
    ALERT: 'lexai.alert.queue',
    DLX_EXCHANGE: 'lexai.dlx',
    DLQ_ANALYSIS: 'lexai.analysis.dlq',
});

// Redis Pub/Sub channel used by workers to bridge events to the API process
const PUBSUB_CHANNEL = 'lexai:socket:events';

module.exports = { QUEUES, PUBSUB_CHANNEL };
