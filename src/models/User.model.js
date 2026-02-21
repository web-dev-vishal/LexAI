/**
 * User Model
 *
 * Core user document with:
 *   - bcrypt password hashing via pre-save hook
 *   - Email verification and password reset token fields
 *   - Organization reference and RBAC role
 *   - Automatic password exclusion from JSON serialization
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: 100,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 8,
            select: false, // Never returned in queries by default
        },

        // Email verification
        emailVerified: { type: Boolean, default: false },
        emailVerifyToken: { type: String, select: false },

        // Password reset
        passwordResetToken: { type: String, select: false },
        passwordResetExpiry: { type: Date, select: false },

        // Organization & role
        organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
        role: {
            type: String,
            enum: ['admin', 'manager', 'viewer'],
            default: 'viewer',
        },

        isActive: { type: Boolean, default: true },
        lastLoginAt: Date,
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.password;
                delete ret.emailVerifyToken;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpiry;
                return ret;
            },
        },
    }
);

// ─── Indexes ──────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ organization: 1 });

// ─── Pre-save Hook: Hash password only when modified ──────────────
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// ─── Instance Methods ─────────────────────────────────────────────

/**
 * Compare a candidate password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
