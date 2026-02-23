/**
 * User Validators — Joi schemas for user profile endpoints.
 */

import Joi from 'joi';

/**
 * PATCH /users/me — update profile.
 * Only 'name' is allowed via this endpoint.
 */
export const updateProfile = Joi.object({
    name: Joi.string().trim().min(2).max(100).required()
        .messages({
            'any.required': 'Name is required',
            'string.min': 'Name must be at least 2 characters',
        }),
});

/**
 * PATCH /users/me/password — change password.
 * Requires current password for verification and a strong new password.
 */
export const changePassword = Joi.object({
    currentPassword: Joi.string().required()
        .messages({ 'any.required': 'Current password is required' }),
    newPassword: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
            'any.required': 'New password is required',
            'string.min': 'New password must be at least 8 characters',
            'string.pattern.base': 'New password must contain at least one uppercase, one lowercase, one number, and one special character',
        }),
});
