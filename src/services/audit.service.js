/**
 * Audit Service
 *
 * Writes immutable audit log entries for every significant action.
 * Logs are auto-deleted after 90 days via MongoDB TTL index.
 *
 * IMPORTANT: Audit logging failures are swallowed silently —
 * we never want a failed audit log to break a user's request.
 */

import AuditLog from '../models/AuditLog.model.js';
import logger from '../utils/logger.js';

/**
 * Create an audit log entry.
 * Wraps the DB write in try/catch so audit failures are non-fatal.
 *
 * @param {object} entry
 * @param {string} entry.orgId - Organization context
 * @param {string} entry.userId - Who performed the action
 * @param {string} entry.action - e.g., 'contract.uploaded', 'analysis.requested'
 * @param {string} [entry.resourceType] - 'Contract', 'Analysis', 'User', etc.
 * @param {string} [entry.resourceId] - ID of the affected resource
 * @param {object} [entry.metadata] - Additional context (title, version, etc.)
 * @param {string} [entry.ipAddress] - Client IP for security auditing
 * @param {string} [entry.userAgent] - Client user-agent string
 */
export async function log(entry) {
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
        // Audit logging failures should NEVER crash the app or fail user requests
        logger.error('Audit log write failed:', err.message);
    }
}

/**
 * Get audit logs for a specific contract (most recent first).
 */
export async function getContractAuditLogs(contractId, orgId) {
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
export async function getGlobalAuditLogs(query = {}) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(),
    ]);

    return { logs, total, page, limit };
}
