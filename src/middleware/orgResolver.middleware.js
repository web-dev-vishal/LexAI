/**
 * Org Resolver Middleware
 *
 * Securely resolves the orgId from the authenticated user's JWT token.
 * Attaches req.orgId for downstream controllers.
 *
 * SECURITY: Never trusts client-supplied headers for org context.
 * The orgId MUST come from the verified JWT payload — this prevents
 * horizontal privilege escalation where a user sets x-org-id to
 * access another organization's data.
 *
 * Usage:
 *   router.get('/contracts', authenticate, requireOrg, handler);
 */

import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/**
 * Middleware that extracts orgId from the authenticated user's JWT.
 * Returns 403 if the user does not belong to any organization.
 * Must be placed AFTER auth middleware (needs req.user).
 */
export function requireOrg(req, res, next) {
    const orgId = req.user?.orgId;

    if (!orgId) {
        return sendError(res, {
            statusCode: HTTP.FORBIDDEN,
            code: 'NO_ORGANIZATION',
            message: 'You must belong to an organization to access this resource. Create or join one first.',
        });
    }

    // Attach orgId at top level for clean access in controllers
    req.orgId = orgId;
    next();
}
