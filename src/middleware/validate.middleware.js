/**
 * Validation Middleware
 *
 * Creates a middleware from a Joi schema that validates the request
 * body, query, or params. Returns 400 with structured error details
 * if validation fails.
 *
 * Usage:
 *   router.post('/auth/register', validate(registerSchema), authController.register);
 */

const { sendError } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');

/**
 * Create a validation middleware for a Joi schema.
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {'body'|'query'|'params'} [source='body'] - Which part of the request to validate
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,  // Return all errors, not just the first
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

module.exports = { validate };
