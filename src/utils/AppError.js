/**
 * Application Error Class
 *
 * Custom error class that carries HTTP status codes and error codes.
 * Replaces the scattered pattern of creating plain Error objects and
 * manually attaching statusCode/code properties throughout services.
 *
 * Usage:
 *   throw new AppError('User not found.', 404, 'NOT_FOUND');
 *
 * The global error handler middleware catches these and formats
 * the response automatically.
 */

export class AppError extends Error {
    /**
     * @param {string} message - Human-readable error message
     * @param {number} statusCode - HTTP status code (e.g., 400, 404, 403)
     * @param {string} [code='APP_ERROR'] - Machine-readable error code for API consumers
     */
    constructor(message, statusCode, code = 'APP_ERROR') {
        super(message);

        // Attach HTTP metadata so the error handler can use it directly
        this.statusCode = statusCode;
        this.code = code;

        // Preserve the correct class name in stack traces
        this.name = 'AppError';

        // Capture the stack trace, excluding this constructor from it
        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;
