/**
 * Analysis Service
 *
 * Queues AI analysis jobs to RabbitMQ and retrieves cached results.
 * Uses Redis distributed lock to prevent duplicate job submission
 * for the same contract content.
 */

const { v4: uuidv4 } = require('uuid');
const Analysis = require('../models/Analysis.model');
const Contract = require('../models/Contract.model');
const { getRedisClient } = require('../config/redis');
const { publishToQueue } = require('../config/rabbitmq');
const { getCurrentMonthKey, secondsUntilEndOfMonth } = require('../utils/dateHelper');
const auditService = require('./audit.service');
const logger = require('../utils/logger');

const ANALYSIS_QUEUE = process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue';
const CACHE_TTL = 86400; // 24 hours
const LOCK_TTL = 300;    // 5 minutes

/**
 * Queue a new AI analysis job for a contract.
 * Checks cache first, then acquires a distributed lock to prevent duplicates.
 */
async function requestAnalysis({ contractId, orgId, userId, version }) {
    const redis = getRedisClient();

    // Fetch the contract
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });
    if (!contract) {
        const error = new Error('Contract not found.');
        error.statusCode = 404;
        throw error;
    }

    // Determine which version to analyze
    const targetVersion = version || contract.currentVersion;
    let content = contract.content;
    let contentHash = contract.contentHash;

    if (version && version !== contract.currentVersion) {
        const versionDoc = contract.versions.find((v) => v.versionNumber === version);
        if (!versionDoc) {
            const error = new Error(`Version ${version} not found for this contract.`);
            error.statusCode = 404;
            throw error;
        }
        content = versionDoc.content;
        contentHash = versionDoc.contentHash;
    }

    // Check cache — skip queuing if we already have a result
    const cached = await redis.get(`analysis:${contentHash}`);
    if (cached) {
        logger.debug('Analysis cache hit', { contractId, contentHash });
        const cachedResult = JSON.parse(cached);
        return { analysisId: cachedResult.analysisId, status: 'completed', cached: true };
    }

    // Distributed lock — prevent duplicate jobs for same content
    const lockKey = `lock:analysis:${contentHash}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');

    if (!lockAcquired) {
        // A job is already in progress for this content
        const existing = await Analysis.findOne({ contractId, version: targetVersion, status: { $in: ['pending', 'processing'] } });
        if (existing) {
            return { analysisId: existing._id, status: existing.status, cached: false };
        }
    }

    // Create analysis record
    const analysis = await Analysis.create({
        contractId,
        orgId,
        version: targetVersion,
        status: 'pending',
        cacheKey: contentHash,
    });

    // Increment quota
    const monthKey = getCurrentMonthKey();
    const quotaKey = `quota:${userId}:${monthKey}`;
    const currentUsage = await redis.incr(quotaKey);
    if (currentUsage === 1) {
        await redis.expire(quotaKey, secondsUntilEndOfMonth());
    }

    // Push job to RabbitMQ
    const jobId = uuidv4();
    const jobPayload = {
        jobId,
        contractId: contractId.toString(),
        analysisId: analysis._id.toString(),
        orgId: orgId.toString(),
        userId: userId.toString(),
        content,
        contentHash,
        version: targetVersion,
        retryCount: 0,
        queuedAt: new Date().toISOString(),
    };

    publishToQueue(ANALYSIS_QUEUE, jobPayload);
    logger.info('Analysis job queued', { jobId, contractId, analysisId: analysis._id });

    // Audit log
    await auditService.log({
        orgId,
        userId,
        action: 'analysis.requested',
        resourceType: 'Analysis',
        resourceId: analysis._id,
        metadata: { contractId, version: targetVersion },
    });

    return {
        analysisId: analysis._id,
        status: 'pending',
        estimatedSeconds: 30,
        cached: false,
    };
}

/**
 * Get analysis result by ID.
 */
async function getAnalysis(analysisId, orgId) {
    const analysis = await Analysis.findOne({ _id: analysisId, orgId }).lean();
    if (!analysis) {
        const error = new Error('Analysis not found.');
        error.statusCode = 404;
        throw error;
    }
    return analysis;
}

/**
 * Get all analyses for a specific contract.
 */
async function getAnalysesByContract(contractId, orgId) {
    const analyses = await Analysis.find({ contractId, orgId })
        .sort({ createdAt: -1 })
        .select('-clauses -obligations') // Light listing
        .lean();
    return analyses;
}

module.exports = {
    requestAnalysis,
    getAnalysis,
    getAnalysesByContract,
};
