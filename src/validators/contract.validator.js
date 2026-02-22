/**
 * Contract Validators — Joi schemas for contract endpoints.
 */

import Joi from 'joi';

export const uploadContract = Joi.object({
    title: Joi.string().trim().min(3).max(300).required(),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').default('Other'),
    tags: Joi.alternatives().try(
        Joi.array().items(Joi.string().trim().lowercase()),
        Joi.string().trim()
    ).optional(),
    content: Joi.string().min(50).optional(),
    expiryDate: Joi.date().iso().optional(),
    jurisdiction: Joi.string().optional(),
});

export const updateContract = Joi.object({
    title: Joi.string().trim().min(3).max(300).optional(),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').optional(),
    tags: Joi.array().items(Joi.string().trim().lowercase()).optional(),
    alertDays: Joi.array().items(Joi.number().integer().min(1).max(365)).optional(),
    expiryDate: Joi.date().iso().optional(),
});

export const uploadVersion = Joi.object({
    content: Joi.string().min(50).required(),
    changeNote: Joi.string().max(500).optional(),
});

export const compareVersions = Joi.object({
    versionA: Joi.number().integer().min(1).required(),
    versionB: Joi.number().integer().min(1).required(),
});

export const listContracts = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'title', 'type', 'riskScore', 'expiryDate').default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    type: Joi.string().valid('NDA', 'Vendor', 'Employment', 'SaaS', 'Other').optional(),
    tag: Joi.string().trim().lowercase().optional(),
    search: Joi.string().trim().max(200).optional(),
});