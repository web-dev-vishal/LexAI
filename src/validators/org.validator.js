/**
 * Organization Validators
 * Joi schemas for org creation, invite, and role management.
 */

const Joi = require('joi');

const createOrg = Joi.object({
    name: Joi.string().trim().min(2).max(200).required()
        .messages({ 'any.required': 'Organization name is required' }),
});

const inviteMember = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    role: Joi.string().valid('admin', 'manager', 'viewer').default('viewer'),
});

const acceptInvite = Joi.object({
    token: Joi.string().required(),
    name: Joi.string().trim().min(2).max(100).optional(),
    password: Joi.string().min(8).max(128).optional(),
});

const updateMemberRole = Joi.object({
    role: Joi.string().valid('admin', 'manager', 'viewer').required(),
});

const updateOrg = Joi.object({
    name: Joi.string().trim().min(2).max(200).optional(),
});

module.exports = {
    createOrg,
    inviteMember,
    acceptInvite,
    updateMemberRole,
    updateOrg,
};