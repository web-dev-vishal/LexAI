/**
 * Organization Model
 *
 * Multi-tenant container — every org is fully isolated.
 * Members array embeds userId + role + joinedAt for fast lookups
 * without needing a separate join/lookup collection.
 *
 * Subscription plan is tied to the org, not individual users —
 * upgrading the org benefits all members.
 */

import mongoose from 'mongoose';

// Embedded member sub-document — lightweight reference to a user within the org
const memberSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['admin', 'manager', 'viewer'], required: true },
        joinedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Organization name is required'],
            trim: true,
            maxlength: 200,
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true,
            trim: true,
            // Auto-generated from name in pre-save hook below
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,  // The user who created this org
        },
        members: [memberSchema],  // All users in this org (including the owner)
        plan: {
            type: String,
            enum: ['free', 'pro', 'enterprise'],
            default: 'free',
        },
        planExpiresAt: Date,       // When the current subscription expires (null = no expiry)
        contractCount: { type: Number, default: 0 },  // Cached count for plan limit checks
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
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ ownerId: 1 });

// ─── Pre-save: Auto-generate slug from name ───────────────────────
// Only generates on creation or when name changes (and slug wasn't manually set)
organizationSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric chars with hyphens
            .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
    }
    next();
});

// ─── Instance Methods ─────────────────────────────────────────────

/**
 * Check if a user is a member of this organization.
 * Compares ObjectId strings since Mongoose ObjectIds aren't === comparable.
 *
 * @param {string|ObjectId} userId
 * @returns {boolean}
 */
organizationSchema.methods.isMember = function (userId) {
    return this.members.some((m) => m.userId.toString() === userId.toString());
};

/**
 * Get a specific member's role within this org.
 * Returns null if the user is not a member.
 *
 * @param {string|ObjectId} userId
 * @returns {string|null} Role string or null
 */
organizationSchema.methods.getMemberRole = function (userId) {
    const member = this.members.find((m) => m.userId.toString() === userId.toString());
    return member ? member.role : null;
};

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
