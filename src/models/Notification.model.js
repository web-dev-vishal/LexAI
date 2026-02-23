/**
 * Notification Model
 *
 * Logs every notification sent (socket and email) for auditing
 * and deduplication. The alert engine checks this collection before
 * sending duplicate expiry reminders.
 *
 * Also serves as an in-app notification feed — the `read` flag
 * lets the frontend show unread notification badges.
 */

import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            // Optional — some notifications are org-wide (e.g., contract expiring)
        },
        type: {
            type: String,
            enum: ['analysis_complete', 'analysis_failed', 'contract_expiring', 'quota_warning', 'invitation'],
            required: true,
        },
        channel: {
            type: String,
            enum: ['socket', 'email', 'both'],
            default: 'both',  // Most notifications go out via both channels
        },
        resourceType: String,                      // e.g., 'Contract', 'Analysis'
        resourceId: mongoose.Schema.Types.ObjectId,
        message: String,                            // Human-readable notification text
        metadata: mongoose.Schema.Types.Mixed,      // Extra context (expiry date, risk score, etc.)
        read: { type: Boolean, default: false },    // Unread by default — frontend marks as read
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
notificationSchema.index({ orgId: 1, createdAt: -1 });  // Org notification feed (newest first)
notificationSchema.index({ userId: 1, read: 1 });       // User's unread notifications
notificationSchema.index({ type: 1, createdAt: -1 });   // Filter by notification type

// TTL index — auto-delete notifications older than 30 days to prevent unbounded growth
// Same pattern used by AuditLog (90 days). Adjust the value if you need longer retention.
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60; // 2,592,000
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_IN_SECONDS });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
