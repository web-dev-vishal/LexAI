/**
 * Invitation Model
 *
 * Team member invitations with:
 *   - Unique token (UUID) sent via email
 *   - 48-hour expiry via TTL index (MongoDB auto-deletes expired docs)
 *   - Status tracking: pending → accepted / expired
 */

const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
    {
        orgId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        email: {
            type: String,
            required: [true, 'Invitee email is required'],
            lowercase: true,
            trim: true,
        },
        role: {
            type: String,
            enum: ['admin', 'manager', 'viewer'],
            default: 'viewer',
        },
        token: {
            type: String,
            required: true,
            unique: true,
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'expired'],
            default: 'pending',
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        acceptedAt: Date,
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
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ orgId: 1, email: 1 });
// TTL index: auto-delete documents when expiresAt is reached
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation;
