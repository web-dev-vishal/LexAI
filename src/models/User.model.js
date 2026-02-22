/**
 * User Model
 *
 * Core user document with:
 *   - bcrypt password hashing via pre-save hook (12 salt rounds)
 *   - Email verification and password reset token fields
 *   - Organization reference and RBAC role
 *   - Automatic password exclusion from JSON serialization
 *
 * Security notes:
 *   - Password field uses `select: false` — never returned unless explicitly requested
 *   - Sensitive fields (tokens, reset expiry) also excluded from default queries
 *   - toJSON transform strips internal MongoDB fields (_id → id, no __v)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Higher rounds = more secure but slower. 12 is the sweet spot for production.
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
            lowercase: true,  // Normalize to prevent duplicate accounts with different casing
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 8,
            select: false, // CRITICAL: never returned in queries unless you call .select('+password')
        },

        // ─── Email Verification ──────────────────────────────────
        emailVerified: { type: Boolean, default: false },
        emailVerifyToken: { type: String, select: false },

        // ─── Password Reset ──────────────────────────────────────
        passwordResetToken: { type: String, select: false },
        passwordResetExpiry: { type: Date, select: false },

        // ─── Organization & Role ─────────────────────────────────
        organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
        role: {
            type: String,
            enum: ['admin', 'manager', 'viewer'],
            default: 'viewer', // Safest default — least privilege
        },

        isActive: { type: Boolean, default: true },  // Soft-disable without deleting
        lastLoginAt: Date,
    },
    {
        timestamps: true,  // Adds createdAt and updatedAt automatically
        toJSON: {
            // Clean up the response payload for API consumers
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
userSchema.index({ email: 1 }, { unique: true });  // Fast email lookups + uniqueness
userSchema.index({ organization: 1 });              // List users by org

// ─── Pre-save Hook: Hash password only when modified ──────────────
// This runs before every save() — skips hashing if password hasn't changed
// (e.g., when updating name or role)
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
 * Used during login — the hash comparison is timing-safe.
 *
 * @param {string} candidatePassword - Raw password from the login form
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
