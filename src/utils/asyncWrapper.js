/**
 * Async Wrapper
 *
 * Wraps an async Express route handler so that any unhandled promise rejection
 * is forwarded to Express's error handling middleware via next(err).
 *
 * Usage:
 *   router.get('/foo', asyncWrapper(myController));
 *
 * Note: We also use express-async-errors as a safety net, but this wrapper
 * makes the intent explicit and works as a self-documenting pattern.
 */

function asyncWrapper(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = asyncWrapper;
