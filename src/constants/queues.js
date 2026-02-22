/**
 * Queue & Channel Name Constants
 *
 * Single source of truth for all RabbitMQ queue/exchange names
 * and the Redis Pub/Sub channel. Referenced by config, workers,
 * services, and sockets — never hardcode these strings elsewhere.
 */

// RabbitMQ queue and exchange names
export const QUEUES = Object.freeze({
    ANALYSIS: 'lexai.analysis.queue',      // Main AI analysis job queue
    ALERT: 'lexai.alert.queue',            // Contract expiry alert job queue
    DLX_EXCHANGE: 'lexai.dlx',             // Dead Letter Exchange for failed jobs
    DLQ_ANALYSIS: 'lexai.analysis.dlq',    // Dead Letter Queue — holds permanently failed analysis jobs
});

// Redis Pub/Sub channel used by workers to push real-time events
// to the API process (which owns the Socket.io server)
export const PUBSUB_CHANNEL = 'lexai:socket:events';
