/**
 * Organization Model
 *
 * Multi-tenant container — every org is isolated.
 * Members array embeds userId + role + joinedAt for fast lookups.
 * Subscription plan is tied to the org, not individual users.
 */

const mongoose = require('mongoose');

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
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        members: [memberSchema],
        plan: {
            type: String,
            enum: ['free', 'pro', 'enterprise'],
            default: 'free',
        },
        planExpiresAt: Date,
        contractCount: { type: Number, default: 0 },
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
organizationSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
    next();
});

// ─── Instance Methods ─────────────────────────────────────────────

/**
 * Check if a user is a member of this organization.
 */
organizationSchema.methods.isMember = function (userId) {
    return this.members.some((m) => m.userId.toString() === userId.toString());
};

/**
 * Get a specific member's role.
 */
organizationSchema.methods.getMemberRole = function (userId) {
    const member = this.members.find((m) => m.userId.toString() === userId.toString());
    return member ? member.role : null;
};

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
