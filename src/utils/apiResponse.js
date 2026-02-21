/**
 * Standard API Response Helpers
 *
 * Every API response follows the shape:
 *   { success: boolean, message?: string, data?: any, meta?: any, error?: { code, message, details } }
 */

const HTTP = require('../constants/httpStatus');

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=200]
 * @param {string} [options.message]
 * @param {any} [options.data]
 * @param {object} [options.meta] - Pagination meta
 */
function sendSuccess(res, { statusCode = HTTP.OK, message, data, meta } = {}) {
    const body = { success: true };
    if (message) body.message = message;
    if (data !== undefined) body.data = data;
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number} [options.statusCode=500]
 * @param {string} [options.code='INTERNAL_ERROR']
 * @param {string} [options.message='Something went wrong']
 * @param {Array} [options.details]
 */
function sendError(res, { statusCode = HTTP.INTERNAL_ERROR, code = 'INTERNAL_ERROR', message = 'Something went wrong', details } = {}) {
    const body = {
        success: false,
        error: { code, message },
    };
    if (details) body.error.details = details;
    return res.status(statusCode).json(body);
}

/**
 * Build pagination meta object.
 * @param {number} total - Total document count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 */
function buildPaginationMeta(total, page, limit) {
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

module.exports = { sendSuccess, sendError, buildPaginationMeta };
