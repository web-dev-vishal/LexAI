/**
 * Auth Validators
 * Joi schemas for all authentication endpoints.
 */

const Joi = require('joi');

const register = Joi.object({
    name: Joi.string().trim().min(2).max(100).required()
        .messages({ 'any.required': 'Name is required' }),
    email: Joi.string().email().lowercase().trim().required()
        .messages({ 'any.required': 'Email is required' }),
    password: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
            'any.required': 'Password is required',
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        }),
});

const login = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required(),
});

const verifyEmail = Joi.object({
    token: Joi.string().required(),
});

const forgotPassword = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
});

const resetPassword = Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .messages({
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        }),
});

module.exports = {
    register,
    login,
    verifyEmail,
    forgotPassword,
    resetPassword,
};
