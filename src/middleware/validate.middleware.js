/**
 * Validation Middleware
 *
 * Creates a middleware from a Joi schema that validates the request
 * body, query, or params. Returns 400 with structured error details
 * if validation fails.
 *
 * Usage:
 *   router.post('/auth/register', validate(registerSchema), handler);
 *   router.get('/contracts', validate(listSchema, 'query'), handler);
 */

import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/**
 * Create a validation middleware for a Joi schema.
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {'body'|'query'|'params'} [source='body'] - Which part of the request to validate
 */
export function validate(schema, source = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,  // Return ALL errors, not just the first
            stripUnknown: true, // Remove unexpected fields silently
        });

        if (error) {
            const details = error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message.replace(/"/g, ''),
            }));

            return sendError(res, {
                statusCode: HTTP.BAD_REQUEST,
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed.',
                details,
            });
        }

        // Replace the source with the validated + sanitized value
        req[source] = value;
        next();
    };
}
