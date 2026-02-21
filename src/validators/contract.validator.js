/**
 * Contract Validators
 * Joi schemas for contract upload, update, version, and comparison.
 */

const Joi = require('joi');

const uploadContract = Joi.object({
    title: Joi.string().trim().min(3).max(300).required(),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').default('Other'),
    tags: Joi.alternatives().try(
        Joi.array().items(Joi.string().trim().lowercase()),
        Joi.string().trim() // Accept comma-separated string too
    ).optional(),
    content: Joi.string().min(50).optional(), // Either file or content must be provided
    expiryDate: Joi.date().iso().optional(),
    jurisdiction: Joi.string().optional(),
});

const updateContract = Joi.object({
    title: Joi.string().trim().min(3).max(300).optional(),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').optional(),
    tags: Joi.array().items(Joi.string().trim().lowercase()).optional(),
    alertDays: Joi.array().items(Joi.number().integer().min(1).max(365)).optional(),
    expiryDate: Joi.date().iso().optional(),
});

const uploadVersion = Joi.object({
    content: Joi.string().min(50).required(),
    changeNote: Joi.string().max(500).optional(),
});

const compareVersions = Joi.object({
    versionA: Joi.number().integer().min(1).required(),
    versionB: Joi.number().integer().min(1).required(),
});

const listContracts = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'title', 'type', 'riskScore', 'expiryDate').default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').optional(),
    tag: Joi.string().trim().lowercase().optional(),
    search: Joi.string().trim().max(200).optional(),
});

module.exports = {
    uploadContract,
    updateContract,
    uploadVersion,
    compareVersions,
    listContracts,
};
