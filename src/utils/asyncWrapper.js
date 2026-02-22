/**
 * Async Wrapper
 *
 * Wraps an async Express route handler so that any unhandled promise rejection
 * is forwarded to Express's error handling middleware via next(err).
 *
 * Without this, async errors would be swallowed silently because Express 4
 * doesn't natively handle promise rejections from route handlers.
 *
 * Usage:
 *   router.get('/foo', asyncWrapper(myController));
 *
 * Note: We also use `express-async-errors` as a safety net, but this wrapper
 * makes the intent explicit and serves as a self-documenting pattern.
 */

/**
 * @param {Function} fn - Async route handler (req, res, next) => Promise
 * @returns {Function} Express middleware that catches rejected promises
 */
export function asyncWrapper(fn) {
    return (req, res, next) => {
        // Resolve the handler and forward any error to Express error middleware
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

export default asyncWrapper;
