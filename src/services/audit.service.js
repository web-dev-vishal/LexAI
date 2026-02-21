/**
 * Audit Service
 *
 * Writes immutable audit log entries for every significant action.
 * Logs are auto-deleted after 90 days via MongoDB TTL index.
 */

const AuditLog = require('../models/AuditLog.model');
const logger = require('../utils/logger');

/**
 * Create an audit log entry.
 * @param {object} entry
 * @param {string} entry.orgId
 * @param {string} entry.userId
 * @param {string} entry.action - e.g., 'contract.uploaded', 'analysis.requested'
 * @param {string} [entry.resourceType] - 'Contract', 'Analysis', 'User', etc.
 * @param {string} [entry.resourceId]
 * @param {object} [entry.metadata] - Additional context
 * @param {string} [entry.ipAddress]
 * @param {string} [entry.userAgent]
 */
async function log(entry) {
    try {
        await AuditLog.create({
            orgId: entry.orgId,
            userId: entry.userId,
            action: entry.action,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            metadata: entry.metadata,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
        });
    } catch (err) {
        // Audit logging failures should never crash the app
        logger.error('Audit log write failed:', err.message);
    }
}

/**
 * Get audit logs for a specific contract.
 */
async function getContractAuditLogs(contractId, orgId) {
    return AuditLog.find({
        orgId,
        resourceType: 'Contract',
        resourceId: contractId,
    })
        .sort({ createdAt: -1 })
        .lean();
}

/**
 * Get global audit logs (admin endpoint) with pagination.
 */
async function getGlobalAuditLogs(query = {}) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(),
    ]);

    return { logs, total, page, limit };
}

module.exports = {
    log,
    getContractAuditLogs,
    getGlobalAuditLogs,
};
