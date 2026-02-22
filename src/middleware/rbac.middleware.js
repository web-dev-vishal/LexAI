/**
 * RBAC Middleware
 *
 * Role-based access control gate. Checks if the authenticated user's
 * role is within the set of allowed roles for a route.
 *
 * Usage:
 *   router.delete('/contracts/:id', authenticate, authorize('admin', 'manager'), handler);
 */

import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/**
 * Create a middleware that restricts access to specific roles.
 * @param  {...string} allowedRoles - Roles that can access this route
 */
export function authorize(...allowedRoles) {
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
