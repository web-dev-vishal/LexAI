/**
 * Analysis Service
 *
 * Queues AI analysis jobs to RabbitMQ and retrieves cached results.
 * Uses Redis distributed lock to prevent duplicate job submission
 * for the same contract content.
 *
 * Flow:
 *   1. Client requests analysis → check Redis cache
 *   2. Cache hit → return cached result immediately
 *   3. Cache miss → acquire distributed lock → create Analysis doc → push to queue
 *   4. Worker picks up job → AI call → save result → cache → publish Socket event
 */

import { v4 as uuidv4 } from 'uuid';
import Analysis from '../models/Analysis.model.js';
import Contract from '../models/Contract.model.js';
import { getRedisClient } from '../config/redis.js';
import { publishToQueue } from '../config/rabbitmq.js';
import { getCurrentMonthKey, secondsUntilEndOfMonth } from '../utils/dateHelper.js';
import * as auditService from './audit.service.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

const ANALYSIS_QUEUE = process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue';
const CACHE_TTL = 86400; // 24 hours — cached results expire after a day
const LOCK_TTL = 300;    // 5 minutes — lock expires if worker crashes mid-job

/**
 * Queue a new AI analysis job for a contract.
 * Checks cache first, then acquires a distributed lock to prevent duplicates.
 */
export async function requestAnalysis({ contractId, orgId, userId, version }) {
    const redis = getRedisClient();

    // Fetch the contract — enforce org isolation
    const contract = await Contract.findOne({ _id: contractId, orgId, isDeleted: false });
    if (!contract) {
        throw new AppError('Contract not found.', 404, 'NOT_FOUND');
    }

    // Determine which version to analyze — default to current if not specified
    const targetVersion = version || contract.currentVersion;
    let content = contract.content;
    let contentHash = contract.contentHash;

    // If a specific historical version was requested, find it in the versions array
    if (version && version !== contract.currentVersion) {
        const versionDoc = contract.versions.find((v) => v.versionNumber === version);
        if (!versionDoc) {
            throw new AppError(`Version ${version} not found for this contract.`, 404, 'VERSION_NOT_FOUND');
        }
        content = versionDoc.content;
        contentHash = versionDoc.contentHash;
    }

    // Check cache — skip queuing if we already have a result for this content
    const cached = await redis.get(`analysis:${contentHash}`);
    if (cached) {
        logger.debug('Analysis cache hit', { contractId, contentHash });
        const cachedResult = JSON.parse(cached);
        return { analysisId: cachedResult.analysisId, status: 'completed', cached: true };
    }

    // Distributed lock — prevent duplicate jobs for the same content
    // Uses Redis SET with NX (only set if not exists) + EX (auto-expire)
    const lockKey = `lock:analysis:${contentHash}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');

    if (!lockAcquired) {
        // Another job is already processing this content — return the existing analysis
        const existing = await Analysis.findOne({
            contractId,
            version: targetVersion,
            status: { $in: ['pending', 'processing'] },
        });
        if (existing) {
            return { analysisId: existing._id, status: existing.status, cached: false };
        }
    }

    // Create analysis record to track job progress
    const analysis = await Analysis.create({
        contractId,
        orgId,
        version: targetVersion,
        status: 'pending',
        cacheKey: contentHash,
    });

    // Increment user's monthly quota (tracked in Redis with auto-expiry)
    const monthKey = getCurrentMonthKey();
    const quotaKey = `quota:${userId}:${monthKey}`;
    const currentUsage = await redis.incr(quotaKey);
    if (currentUsage === 1) {
        // First analysis this month — set TTL to end of month
        await redis.expire(quotaKey, secondsUntilEndOfMonth());
    }

    // Push job to RabbitMQ for the analysis worker to pick up
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

    // Audit trail
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
        estimatedSeconds: 30, // Rough estimate for the frontend to show a timer
        cached: false,
    };
}

/**
 * Get analysis result by ID.
 * Enforces org isolation — can't access analyses from other orgs.
 */
export async function getAnalysis(analysisId, orgId) {
    const analysis = await Analysis.findOne({ _id: analysisId, orgId }).lean();
    if (!analysis) {
        throw new AppError('Analysis not found.', 404, 'NOT_FOUND');
    }
    return analysis;
}

/**
 * Get all analyses for a specific contract (light listing).
 * Excludes heavy fields (clauses, obligations) for list performance.
 */
export async function getAnalysesByContract(contractId, orgId) {
    const analyses = await Analysis.find({ contractId, orgId })
        .sort({ createdAt: -1 })
        .select('-clauses -obligations') // Light listing — full data via getAnalysis
        .lean();
    return analyses;
}
