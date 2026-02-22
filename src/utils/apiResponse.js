/**
 * Standard API Response Helpers
 *
 * Every API response follows a consistent shape:
 *   Success: { success: true, message?, data?, meta? }
 *   Error:   { success: false, error: { code, message, details? } }
 *
 * Using these helpers instead of raw res.json() ensures:
 *   - Consistent response structure across all endpoints
 *   - Frontend can reliably check `response.success`
 *   - Error codes are machine-readable for client-side handling
 */

import HTTP from '../constants/httpStatus.js';

/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {string} [options.message] - Human-readable success message
 * @param {any} [options.data] - Response payload
 * @param {object} [options.meta] - Pagination metadata
 */
export function sendSuccess(res, { statusCode = HTTP.OK, message, data, meta } = {}) {
    const body = { success: true };

    // Only include fields that were explicitly provided — keeps responses clean
    if (message) body.message = message;
    if (data !== undefined) body.data = data;
    if (meta) body.meta = meta;

    return res.status(statusCode).json(body);
}

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=500] - HTTP status code
 * @param {string} [options.code='INTERNAL_ERROR'] - Machine-readable error code
 * @param {string} [options.message='Something went wrong'] - Human-readable message
 * @param {Array} [options.details] - Field-level validation errors
 */
export function sendError(res, { statusCode = HTTP.INTERNAL_ERROR, code = 'INTERNAL_ERROR', message = 'Something went wrong', details } = {}) {
    const body = {
        success: false,
        error: { code, message },
    };

    // Attach validation details only when present (e.g., Joi errors)
    if (details) body.error.details = details;

    return res.status(statusCode).json(body);
}

/**
 * Build pagination meta object for list endpoints.
 * Provides everything the frontend needs to render pagination controls.
 *
 * @param {number} total - Total document count matching the query
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {object} Pagination metadata
 */
export function buildPaginationMeta(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}
