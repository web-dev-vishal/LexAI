/**
 * Admin Controller
 * Platform-wide stats, queue status, and admin-only endpoints.
 */

import User from '../models/User.model.js';
import Organization from '../models/Organization.model.js';
import Contract from '../models/Contract.model.js';
import Analysis from '../models/Analysis.model.js';
import { getChannel } from '../config/rabbitmq.js';
import * as auditService from '../services/audit.service.js';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse.js';

/** GET /admin/stats */
export async function getStats(req, res) {
    const [totalUsers, totalOrgs, totalContracts, totalAnalyses] = await Promise.all([
        User.countDocuments(),
        Organization.countDocuments(),
        Contract.countDocuments({ isDeleted: false }),
        Analysis.countDocuments(),
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const analysesLast30Days = await Analysis.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    const riskAgg = await Analysis.aggregate([
        { $match: { status: 'completed', riskScore: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$riskScore' } } },
    ]);
    const averageRiskScore = riskAgg[0]?.avg ? Math.round(riskAgg[0].avg * 10) / 10 : 0;

    let queueDepth = 0;
    try {
        const channel = getChannel();
        if (channel) {
            const queueInfo = await channel.checkQueue(process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue');
            queueDepth = queueInfo.messageCount;
        }
    } catch { /* queue might not exist yet */ }

    sendSuccess(res, {
        data: {
            stats: { totalUsers, totalOrgs, totalContracts, totalAnalyses, analysesLast30Days, averageRiskScore, queueDepth },
        },
    });
}

/** GET /admin/queue/status */
export async function getQueueStatus(req, res) {
    let analysisQueue = { messageCount: 0, consumerCount: 0 };
    let dlxQueue = { messageCount: 0 };

    try {
        const channel = getChannel();
        if (channel) {
            analysisQueue = await channel.checkQueue(process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue');
            try { dlxQueue = await channel.checkQueue('lexai.analysis.dlq'); } catch { /* DLQ might not exist */ }
        }
    } catch { /* RabbitMQ might be disconnected */ }

    sendSuccess(res, {
        data: {
            queue: {
                name: process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue',
                messageCount: analysisQueue.messageCount,
                consumerCount: analysisQueue.consumerCount,
                dlxMessageCount: dlxQueue.messageCount,
            },
        },
    });
}

/** GET /admin/users */
export async function listUsers(req, res) {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
        User.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        User.countDocuments(),
    ]);

    sendSuccess(res, {
        data: { users, meta: buildPaginationMeta(total, parseInt(page), parseInt(limit)) },
    });
}

/** GET /admin/audit-logs */
export async function getAuditLogs(req, res) {
    const result = await auditService.getGlobalAuditLogs(req.query);
    sendSuccess(res, {
        data: { logs: result.logs, meta: buildPaginationMeta(result.total, result.page, result.limit) },
    });
}