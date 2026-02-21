/**
 * AuditLog Model
 *
 * Immutable log of every significant action in the system.
 * Has a 90-day TTL index — MongoDB automatically deletes old entries.
 *
 * Per GDPR: on user deletion, userId is replaced with a tombstone value
 * rather than deleting the log entry (preserves the audit trail).
 */

const mongoose = require('mongoose');

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60; // 7,776,000

const auditLogSchema = new mongoose.Schema(
    {
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: {
            type: String,
            required: true,
            // Examples: 'contract.uploaded', 'analysis.requested', 'user.login',
            // 'contract.deleted', 'org.member.invited', 'org.member.removed'
        },
        resourceType: {
            type: String,
            enum: ['User', 'Organization', 'Contract', 'Analysis', 'Invitation', 'System'],
        },
        resourceId: mongoose.Schema.Types.ObjectId,
        metadata: mongoose.Schema.Types.Mixed,
        ipAddress: String,
        userAgent: String,
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

// ─── Indexes ──────────────────────────────────────────────────────
auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

// 90-day TTL — auto-delete old audit logs
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
