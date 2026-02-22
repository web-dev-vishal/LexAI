/**
 * AuditLog Model
 *
 * Immutable log of every significant action in the system.
 * Has a 90-day TTL index — MongoDB automatically deletes old entries.
 *
 * GDPR consideration: on user deletion, userId is replaced with a
 * tombstone value rather than deleting the log entry (preserves
 * the audit trail while respecting data minimization).
 *
 * These logs are NOT the same as Winston logs — they are structured
 * business events stored in MongoDB for compliance and admin visibility.
 */

import mongoose from 'mongoose';

// 90 days in seconds — after this, MongoDB auto-deletes the document
const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60; // 7,776,000

const auditLogSchema = new mongoose.Schema(
    {
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: {
            type: String,
            required: true,
            // Convention: 'resource.verb' — e.g., 'contract.uploaded', 'user.login'
        },
        resourceType: {
            type: String,
            enum: ['User', 'Organization', 'Contract', 'Analysis', 'Invitation', 'System'],
        },
        resourceId: mongoose.Schema.Types.ObjectId,
        metadata: mongoose.Schema.Types.Mixed,  // Free-form context (title, version, etc.)
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
auditLogSchema.index({ orgId: 1, createdAt: -1 });    // Org-scoped audit trail
auditLogSchema.index({ userId: 1, createdAt: -1 });   // Per-user activity log
auditLogSchema.index({ action: 1 });                   // Filter by action type

// TTL index — MongoDB automatically deletes documents 90 days after creation
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
