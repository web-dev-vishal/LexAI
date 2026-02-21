/**
 * Notification Model
 *
 * Logs every notification sent (socket and email) for auditing
 * and deduplication. The alert engine checks this before sending
 * duplicate expiry reminders.
 */

const mongoose = require('mongoose');

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
        },
        type: {
            type: String,
            enum: ['analysis_complete', 'analysis_failed', 'contract_expiring', 'quota_warning', 'invitation'],
            required: true,
        },
        channel: {
            type: String,
            enum: ['socket', 'email', 'both'],
            default: 'both',
        },
        resourceType: String,
        resourceId: mongoose.Schema.Types.ObjectId,
        message: String,
        metadata: mongoose.Schema.Types.Mixed,
        read: { type: Boolean, default: false },
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

notificationSchema.index({ orgId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
