/**
 * Analysis Worker
 *
 * RabbitMQ consumer that processes AI analysis jobs.
 *
 * Flow:
 *   1. Pick job from queue
 *   2. Check Redis cache — skip AI if cached
 *   3. Call OpenRouter API (with fallback model chain)
 *   4. Save Analysis to MongoDB
 *   5. Update Contract with AI-extracted dates
 *   6. Cache result in Redis (24h TTL)
 *   7. Publish completion event via Redis Pub/Sub
 *   8. ACK the message
 *   9. On failure: NACK with requeue (max 3 retries) or route to DLX
 */

const { getChannel } = require('../config/rabbitmq');
const { getRedisClient } = require('../config/redis');
const { PUBSUB_CHANNEL } = require('../constants/queues');
const Analysis = require('../models/Analysis.model');
const Contract = require('../models/Contract.model');
const aiService = require('../services/ai.service');
const logger = require('../utils/logger');

const ANALYSIS_QUEUE = process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue';
const CACHE_TTL = 86400; // 24 hours
const MAX_RETRIES = 3;

/**
 * Start consuming messages from the analysis queue.
 */
async function startAnalysisWorker() {
    const channel = getChannel();
    if (!channel) {
        logger.error('Cannot start analysis worker — RabbitMQ channel not available');
        return;
    }

    logger.info(`Analysis worker listening on queue: ${ANALYSIS_QUEUE}`);

    channel.consume(ANALYSIS_QUEUE, async (msg) => {
        if (!msg) return;

        let job;
        try {
            job = JSON.parse(msg.content.toString());
        } catch (err) {
            logger.error('Invalid message payload — cannot parse JSON:', err.message);
            channel.ack(msg); // Don't requeue malformed messages
            return;
        }

        // Handle diff jobs separately
        if (job.type === 'diff') {
            await processDiffJob(job, channel, msg);
            return;
        }

        await processAnalysisJob(job, channel, msg);
    }, { noAck: false });
}

/**
 * Process a single analysis job.
 */
async function processAnalysisJob(job, channel, msg) {
    const { jobId, contractId, analysisId, orgId, userId, content, contentHash, version, retryCount = 0 } = job;
    const redis = getRedisClient();
    const startTime = Date.now();

    try {
        logger.info(`Processing analysis job: ${jobId}`, { contractId, version });

        // Update status to processing
        await Analysis.findByIdAndUpdate(analysisId, { status: 'processing' });

        // Check cache one more time (race condition guard)
        const cached = await redis.get(`analysis:${contentHash}`);
        if (cached) {
            logger.info('Cache hit inside worker — skipping AI call', { jobId });
            const cachedResult = JSON.parse(cached);

            await Analysis.findByIdAndUpdate(analysisId, {
                status: 'completed',
                ...cachedResult,
                processingTimeMs: Date.now() - startTime,
            });

            // Publish completion event
            await publishSocketEvent(redis, orgId, contractId, analysisId, cachedResult.riskScore, cachedResult.riskLevel);
            channel.ack(msg);
            return;
        }

        // Call AI
        const result = await aiService.analyzeContract(content);

        // Save to MongoDB
        await Analysis.findByIdAndUpdate(analysisId, {
            status: 'completed',
            summary: result.summary,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            clauses: result.clauses,
            obligations: result.obligations,
            keyDates: result.keyDates,
            aiModel: result.aiModel,
            tokensUsed: result.tokensUsed,
            processingTimeMs: Date.now() - startTime,
            cacheKey: contentHash,
        });

        // Update contract with AI-extracted dates
        const dateUpdates = {};
        if (result.keyDates?.expiryDate) {
            const parsed = new Date(result.keyDates.expiryDate);
            if (!isNaN(parsed)) dateUpdates.expiryDate = parsed;
        }
        if (result.keyDates?.effectiveDate) {
            const parsed = new Date(result.keyDates.effectiveDate);
            if (!isNaN(parsed)) dateUpdates.effectiveDate = parsed;
        }
        if (result.keyDates?.renewalDate) {
            const parsed = new Date(result.keyDates.renewalDate);
            if (!isNaN(parsed)) dateUpdates.renewalDate = parsed;
        }
        if (result.parties?.length > 0) {
            dateUpdates.parties = result.parties;
        }
        if (Object.keys(dateUpdates).length > 0) {
            await Contract.findByIdAndUpdate(contractId, { $set: dateUpdates });
        }

        // Cache the result in Redis
        const cachePayload = {
            analysisId,
            summary: result.summary,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
        };
        await redis.set(`analysis:${contentHash}`, JSON.stringify(cachePayload), 'EX', CACHE_TTL);

        // Publish Socket.io event via Redis Pub/Sub
        await publishSocketEvent(redis, orgId, contractId, analysisId, result.riskScore, result.riskLevel);

        // Release distributed lock
        await redis.del(`lock:analysis:${contentHash}`);

        logger.info(`Analysis completed in ${Date.now() - startTime}ms`, { jobId, riskScore: result.riskScore });
        channel.ack(msg);
    } catch (err) {
        logger.error(`Analysis job failed: ${err.message}`, { jobId, retryCount });

        if (retryCount < MAX_RETRIES - 1) {
            // Requeue with incremented retry count
            job.retryCount = retryCount + 1;
            channel.ack(msg); // Ack the original
            channel.sendToQueue(ANALYSIS_QUEUE, Buffer.from(JSON.stringify(job)), { persistent: true });
            logger.info(`Requeued job with retryCount=${job.retryCount}`, { jobId });
        } else {
            // Max retries exceeded — send to DLX
            logger.error(`Job exhausted all ${MAX_RETRIES} retries. Routing to DLX.`, { jobId });

            await Analysis.findByIdAndUpdate(analysisId, {
                status: 'failed',
                failureReason: err.message,
                retryCount: MAX_RETRIES,
            });

            // Publish failure event
            await redis.publish(PUBSUB_CHANNEL, JSON.stringify({
                event: 'analysis:failed',
                room: `org:${orgId}`,
                payload: { contractId, reason: err.message },
            }));

            await redis.del(`lock:analysis:${contentHash}`);
            channel.nack(msg, false, false); // Route to DLX
        }
    }
}

/**
 * Process a diff comparison job.
 */
async function processDiffJob(job, channel, msg) {
    const { jobId, contractId, orgId, contractTitle, diffText, versionA, versionB } = job;

    try {
        logger.info(`Processing diff job: ${jobId}`, { contractId, versionA, versionB });

        const result = await aiService.explainDiff(diffText, contractTitle);
        const redis = getRedisClient();

        // Publish result via Socket.io
        await redis.publish(PUBSUB_CHANNEL, JSON.stringify({
            event: 'diff:complete',
            room: `org:${orgId}`,
            payload: {
                contractId,
                versionA,
                versionB,
                ...result,
            },
        }));

        logger.info('Diff job completed', { jobId });
        channel.ack(msg);
    } catch (err) {
        logger.error(`Diff job failed: ${err.message}`, { jobId });
        channel.nack(msg, false, false);
    }
}

/**
 * Publish a completion event to Redis Pub/Sub.
 */
async function publishSocketEvent(redis, orgId, contractId, analysisId, riskScore, riskLevel) {
    await redis.publish(PUBSUB_CHANNEL, JSON.stringify({
        event: 'analysis:complete',
        room: `org:${orgId}`,
        payload: { contractId, analysisId, riskScore, riskLevel },
    }));
}

module.exports = { startAnalysisWorker };
