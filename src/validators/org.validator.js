/**
 * Org Validators — Joi schemas for org endpoints.
 */

import Joi from 'joi';

export const createOrg = Joi.object({
    name: Joi.string().trim().min(2).max(200).required()
        .messages({ 'any.required': 'Organization name is required' }),
});

export const inviteMember = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    role: Joi.string().valid('admin', 'manager', 'viewer').default('viewer'),
});

export const acceptInvite = Joi.object({
    token: Joi.string().required(),
    name: Joi.string().trim().min(2).max(100).optional(),
    password: Joi.string().min(8).max(128).optional(),
});

export const updateMemberRole = Joi.object({
    role: Joi.string().valid('admin', 'manager', 'viewer').required(),
});

export const updateOrg = Joi.object({
    name: Joi.string().trim().min(2).max(200).optional(),
});