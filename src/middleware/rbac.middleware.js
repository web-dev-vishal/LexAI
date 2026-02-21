/**
 * RBAC Middleware
 *
 * Role-based access control gate. Checks if the authenticated user's
 * role is within the set of allowed roles for a route.
 *
 * Usage:
 *   router.delete('/contracts/:id', authenticate, authorize('admin', 'manager'), controller);
 */

const { sendError } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');

/**
 * Create a middleware that restricts access to specific roles.
 * @param  {...string} allowedRoles - Roles that can access this route
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return sendError(res, {
                statusCode: HTTP.UNAUTHORIZED,
                code: 'UNAUTHORIZED',
                message: 'Authentication required.',
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return sendError(res, {
                statusCode: HTTP.FORBIDDEN,
                code: 'FORBIDDEN',
                message: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
            });
        }

        next();
    };
}

module.exports = { authorize };
