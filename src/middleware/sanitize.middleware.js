/**
 * XSS Sanitization Middleware
 *
 * Sanitizes all string values in request body, query, and params
 * to prevent Cross-Site Scripting (XSS) attacks.
 *
 * Uses the `xss` library (already installed) which was previously
 * imported in package.json but never actually used anywhere.
 *
 * This middleware should be registered AFTER body parsing and BEFORE
 * route handlers in app.js.
 */

import xss from 'xss';

/**
 * Recursively sanitize all string values in an object.
 * Handles nested objects and arrays.
 *
 * @param {any} obj - Value to sanitize
 * @returns {any} Sanitized value
 */
function sanitizeValue(obj) {
    if (typeof obj === 'string') {
        return xss(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeValue);
    }

    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeValue(value);
        }
        return sanitized;
    }

    return obj;
}

/**
 * Express middleware that sanitizes req.body, req.query, and req.params.
 */
export function xssSanitizer(req, res, next) {
    if (req.body) req.body = sanitizeValue(req.body);
    if (req.query) req.query = sanitizeValue(req.query);
    if (req.params) req.params = sanitizeValue(req.params);
    next();
}
