/**
 * Analysis Validators — Joi schemas for analysis endpoints.
 */

import Joi from 'joi';

export const requestAnalysis = Joi.object({
    contractId: Joi.string().hex().length(24).required()
        .messages({ 'any.required': 'contractId is required' }),
    version: Joi.number().integer().min(1).optional().default(null),
});