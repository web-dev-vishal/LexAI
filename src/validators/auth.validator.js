/**
 * Auth Validators — Joi schemas for every auth endpoint request body.
 *
 * Rules followed here:
 *   - Email is always lowercased and trimmed at validation time so the service
 *     layer never has to worry about mixed-case emails.
 *   - Password complexity is only enforced on registration, reset, and change.
 *     The login endpoint accepts any string so users who registered before a
 *     policy tightening are never locked out.
 *   - The OTP field enforces exactly 6 digits — nothing more, nothing less.
 *   - All max-lengths prevent payload bloat / abuse.
 *   - Unknown fields are stripped by the validate middleware (not here).
 */

import Joi from 'joi';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable field definitions
// Define once, reuse across all schemas below.
// ─────────────────────────────────────────────────────────────────────────────

const emailField = Joi.string()
    .email({ tlds: { allow: false } })  // don't validate TLD (foo@bar.local is fine)
    .lowercase()
    .trim()
    .max(254)                            // RFC 5321 max email length
    .required()
    .messages({
        'string.email': 'Please provide a valid email address.',
        'any.required': 'Email is required.',
        'string.max': 'Email must not exceed 254 characters.',
    });

/**
 * Strong password rule — used for registration, reset, and change.
 * Must have: uppercase, lowercase, a digit, and a special character.
 */
const strongPassword = (label = 'Password') =>
    Joi.string()
        .trim()
        .min(8)
        .max(128)
        .required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,\-_#^()])[^\s]+$/)
        .messages({
            'any.required': `${label} is required.`,
            'string.min': `${label} must be at least 8 characters.`,
            'string.max': `${label} must not exceed 128 characters.`,
            'string.pattern.base': `${label} must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&.,\\-_#^()).`,
        });

/**
 * OTP field — exactly 6 numeric digits, e.g. "048291".
 */
const otpField = Joi.string()
    .trim()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
        'any.required': 'OTP is required.',
        'string.length': 'OTP must be exactly 6 digits.',
        'string.pattern.base': 'OTP must contain only digits.',
    });

/**
 * Hex token field — used for password reset tokens (64-char hex from crypto).
 * We keep the max length generous so a future token length change
 * doesn't require a validator update.
 */
const hexTokenField = Joi.string()
    .trim()
    .min(32)
    .max(512)
    .required()
    .messages({
        'any.required': 'Token is required.',
        'string.min': 'Invalid token format.',
        'string.max': 'Invalid token format.',
    });

// ─────────────────────────────────────────────────────────────────────────────
// Exported schemas — one per endpoint
// ─────────────────────────────────────────────────────────────────────────────

/** POST /auth/register */
export const register = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .pattern(/^[^\u0000-\u001F\u007F-\u009F]+$/)  // no invisible control characters
        .required()
        .messages({
            'any.required': 'Name is required.',
            'string.min': 'Name must be at least 2 characters.',
            'string.max': 'Name must not exceed 100 characters.',
            'string.pattern.base': 'Name contains invalid characters.',
        }),
    email: emailField,
    password: strongPassword('Password'),
});

/** POST /auth/login — password has no complexity rule (see file header comment) */
export const login = Joi.object({
    email: emailField,
    password: Joi.string().trim().max(256).required().messages({
        'any.required': 'Password is required.',
    }),
});

/** POST /auth/verify-email — { email, otp } */
export const verifyEmail = Joi.object({
    email: emailField,
    otp: otpField,
});

/** POST /auth/resend-verification-email */
export const resendVerificationEmail = Joi.object({
    email: emailField,
});

/** POST /auth/forgot-password */
export const forgotPassword = Joi.object({
    email: emailField,
});

/** POST /auth/reset-password */
export const resetPassword = Joi.object({
    token: hexTokenField,
    password: strongPassword('Password'),
});

/**
 * POST /auth/change-password (authenticated)
 *
 * The cross-field check here (current !== new) is done at the validator level
 * as a fast, cheap guard. The service also checks this against the hashed
 * value in the DB, which is the authoritative check.
 */
export const changePassword = Joi.object({
    currentPassword: Joi.string().trim().max(256).required().messages({
        'any.required': 'Current password is required.',
    }),
    newPassword: strongPassword('New password'),
}).custom((value, helpers) => {
    // Catch the obvious case where the user submits the same string for both.
    // The service will also catch this if they're different strings that hash the same.
    if (value.currentPassword && value.newPassword && value.currentPassword === value.newPassword) {
        return helpers.error('any.invalid', { label: 'newPassword' });
    }
    return value;
}).messages({
    'any.invalid': 'New password must be different from your current password.',
});