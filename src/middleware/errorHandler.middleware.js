/**
 * Global Error Handler Middleware
 *
 * Catches all unhandled errors thrown by controllers/services and
 * returns a standardized error response. Handles:
 *   - AppError (custom errors with statusCode)
 *   - Mongoose ValidationError, CastError, duplicate key
 *   - JWT errors (fallback if not caught earlier)
 *   - Unexpected server errors
 *
 * Must be the LAST middleware registered in Express.
 */

import HTTP from '../constants/httpStatus.js';
import logger from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    // Log the full error in dev, summary only in production
    if (process.env.NODE_ENV === 'development') {
        logger.error(err.stack || err.message);
    } else {
        logger.error(`${err.name}: ${err.message}`, {
            requestId: req.requestId,
            url: req.originalUrl,
            method: req.method,
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const details = Object.values(err.errors).map((e) => ({
            field: e.path,
            message: e.message,
        }));

        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Database validation failed.',
                details,
                requestId: req.requestId,
            },
        });
    }

    // Mongoose duplicate key error (code 11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(HTTP.CONFLICT).json({
            success: false,
            error: {
                code: 'DUPLICATE_KEY',
                message: `A record with this ${field} already exists.`,
                requestId: req.requestId,
            },
        });
    }

    // Mongoose cast error (invalid ObjectId, etc.)
    if (err.name === 'CastError') {
        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: {
                code: 'INVALID_ID',
                message: `Invalid value for ${err.path}: ${err.value}`,
                requestId: req.requestId,
            },
        });
    }

    // JWT errors (fallback — normally caught in auth middleware)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(HTTP.UNAUTHORIZED).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid or expired token.',
                requestId: req.requestId,
            },
        });
    }

    // Custom application errors (AppError or manually attached statusCode)
    if (err.statusCode) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code || 'APP_ERROR',
                message: err.message,
                requestId: req.requestId,
            },
        });
    }

    // Fallback: unexpected server error — hide message in production
    return res.status(HTTP.INTERNAL_ERROR).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred.'
                : err.message,
            requestId: req.requestId,
        },
    });
}
