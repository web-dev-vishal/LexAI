/**
 * Admin Controller
 * Platform-wide stats, queue status, and admin-only endpoints.
 */

const User = require('../models/User.model');
const Organization = require('../models/Organization.model');
const Contract = require('../models/Contract.model');
const Analysis = require('../models/Analysis.model');
const { getChannel } = require('../config/rabbitmq');
const { getRedisClient } = require('../config/redis');
const auditService = require('../services/audit.service');
const { sendSuccess } = require('../utils/apiResponse');
const { buildPaginationMeta } = require('../utils/apiResponse');

/**
 * GET /admin/stats
 */
async function getStats(req, res) {
    const [totalUsers, totalOrgs, totalContracts, totalAnalyses] = await Promise.all([
        User.countDocuments(),
        Organization.countDocuments(),
        Contract.countDocuments({ isDeleted: false }),
        Analysis.countDocuments(),
    ]);

    // Recent analyses (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const analysesLast30Days = await Analysis.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
    });

    // Average risk score
    const riskAgg = await Analysis.aggregate([
        { $match: { status: 'completed', riskScore: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$riskScore' } } },
    ]);
    const averageRiskScore = riskAgg[0]?.avg ? Math.round(riskAgg[0].avg * 10) / 10 : 0;

    // Queue depth
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
            stats: {
                totalUsers,
                totalOrgs,
                totalContracts,
                totalAnalyses,
                analysesLast30Days,
                averageRiskScore,
                queueDepth,
            },
        },
    });
}

/**
 * GET /admin/queue/status
 */
async function getQueueStatus(req, res) {
    let analysisQueue = { messageCount: 0, consumerCount: 0 };
    let dlxQueue = { messageCount: 0 };

    try {
        const channel = getChannel();
        if (channel) {
            analysisQueue = await channel.checkQueue(process.env.ANALYSIS_QUEUE || 'lexai.analysis.queue');
            try {
                dlxQueue = await channel.checkQueue('lexai.analysis.dlq');
            } catch { /* DLQ might not exist yet */ }
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

/**
 * GET /admin/users
 */
async function listUsers(req, res) {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
        User.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        User.countDocuments(),
    ]);

    sendSuccess(res, {
        data: {
            users,
            meta: buildPaginationMeta(total, parseInt(page), parseInt(limit)),
        },
    });
}

/**
 * GET /admin/audit-logs
 */
async function getAuditLogs(req, res) {
    const result = await auditService.getGlobalAuditLogs(req.query);

    sendSuccess(res, {
        data: {
            logs: result.logs,
            meta: buildPaginationMeta(result.total, result.page, result.limit),
        },
    });
}

module.exports = {
    getStats,
    getQueueStatus,
    listUsers,
    getAuditLogs,
};