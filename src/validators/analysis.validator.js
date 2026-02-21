/**
 * Analysis Validators
 * Joi schemas for analysis request endpoints.
 */

const Joi = require('joi');

const requestAnalysis = Joi.object({
    contractId: Joi.string().hex().length(24).required()
        .messages({ 'any.required': 'contractId is required' }),
    version: Joi.number().integer().min(1).optional().default(null),
});

module.exports = {
    requestAnalysis,
};
