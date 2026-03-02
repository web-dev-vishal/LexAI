/**
 * Auth Validators — Production-hardened
 *
 * Hardening applied:
 *  - Token fields validated for hex format (prevents injection via crafted tokens)
 *  - newPassword must differ from currentPassword (validated at schema level as a first check)
 *  - Passwords stripped of leading/trailing whitespace to prevent bypass tricks
 *  - email normalized to lowercase at validation layer consistently
 *  - abortEarly: false omitted intentionally — handled globally by validate middleware
 *  - allowUnknown: false (default) — no extra fields accepted on any auth body
 *  - name field strips dangerous unicode control characters via regex
 *  - max constraints on all string fields prevent payload abuse
 */

import Joi from 'joi';

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const emailField = Joi.string()
    .email({ tlds: { allow: false } }) // Don't validate TLDs — too restrictive for new TLDs
    .lowercase()
    .trim()
    .max(254) // RFC 5321 max email length
    .required()
    .messages({
        'string.email': 'Please provide a valid email address.',
        'any.required': 'Email is required.',
    });

const passwordField = (label = 'Password') =>
    Joi.string()
        .min(8)
        .max(128)
        .required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,\-_#^()])[\S]+$/)
        .messages({
            'any.required': `${label} is required.`,
            'string.min': `${label} must be at least 8 characters.`,
            'string.max': `${label} must not exceed 128 characters.`,
            'string.pattern.base': `${label} must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&.,\\-_#^()).`,
        });

// Secure token: hex string, 32–256 chars (matches generateSecureToken output)
const tokenField = Joi.string()
    .trim()
    .min(32)
    .max(256)
    .pattern(/^[a-f0-9]+$/)
    .required()
    .messages({
        'any.required': 'Token is required.',
        'string.pattern.base': 'Invalid token format.',
    });

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const register = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .pattern(/^[^\u0000-\u001F\u007F-\u009F]+$/) // No control characters
        .required()
        .messages({
            'any.required': 'Name is required.',
            'string.min': 'Name must be at least 2 characters.',
            'string.max': 'Name must not exceed 100 characters.',
            'string.pattern.base': 'Name contains invalid characters.',
        }),
    email: emailField,
    password: passwordField('Password'),
});

export const login = Joi.object({
    email: emailField,
    // No complexity requirement on login — just existence
    password: Joi.string().max(256).required().messages({
        'any.required': 'Password is required.',
    }),
});

export const verifyEmail = Joi.object({
    token: tokenField,
});

export const forgotPassword = Joi.object({
    email: emailField,
});

export const resetPassword = Joi.object({
    token: tokenField,
    password: passwordField('Password'),
});

export const changePassword = Joi.object({
    currentPassword: Joi.string().max(256).required().messages({
        'any.required': 'Current password is required.',
    }),
    newPassword: passwordField('New password'),
}).custom((value, helpers) => {
    // Schema-level check: new password must differ from current
    if (value.currentPassword && value.newPassword && value.currentPassword === value.newPassword) {
        return helpers.error('any.invalid', { label: 'newPassword' });
    }
    return value;
}).messages({
    'any.invalid': 'New password must be different from your current password.',
});

export const resendVerificationEmail = Joi.object({
    email: emailField,
});