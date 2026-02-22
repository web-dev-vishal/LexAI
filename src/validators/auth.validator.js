/**
 * Auth Validators — Joi schemas for authentication endpoints.
 */

import Joi from 'joi';

export const register = Joi.object({
    name: Joi.string().trim().min(2).max(100).required()
        .messages({ 'any.required': 'Name is required' }),
    email: Joi.string().email().lowercase().trim().required()
        .messages({ 'any.required': 'Email is required' }),
    password: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
            'any.required': 'Password is required',
            'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number, and one special character',
        }),
});

export const login = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required(),
});

export const verifyEmail = Joi.object({
    token: Joi.string().required(),
});

export const forgotPassword = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
});

export const resetPassword = Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
            'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number, and one special character',
        }),
});