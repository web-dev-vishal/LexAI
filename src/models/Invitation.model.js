/**
 * Invitation Model
 *
 * Team member invitations with:
 *   - Unique token (UUID) sent via email
 *   - 48-hour expiry via TTL index (MongoDB auto-deletes expired docs)
 *   - Status tracking: pending → accepted | expired
 *
 * The TTL index on expiresAt means MongoDB will automatically clean up
 * expired invitations — no cron job needed for garbage collection.
 */

import mongoose from 'mongoose';

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
            required: true,  // Who sent the invitation
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
            default: 'viewer',  // Safest default — least privilege
        },
        token: {
            type: String,
            required: true,
            unique: true,  // Ensures no two invitations share a token
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'expired'],
            default: 'pending',
        },
        expiresAt: {
            type: Date,
            required: true,  // Must always have an expiry — no indefinite invitations
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
invitationSchema.index({ token: 1 }, { unique: true });   // Fast token lookups
invitationSchema.index({ orgId: 1, email: 1 });           // Check for duplicate invitations

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
// expireAfterSeconds: 0 means "delete at the exact expiresAt time"
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Invitation = mongoose.model('Invitation', invitationSchema);

export default Invitation;
