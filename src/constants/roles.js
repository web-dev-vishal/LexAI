/**
 * Role Constants
 * Used throughout the app for RBAC checks.
 */

const ROLES = Object.freeze({
    ADMIN: 'admin',
    MANAGER: 'manager',
    VIEWER: 'viewer',
});

// Ordered by privilege level (highest first) — useful for permission checks
const ROLE_HIERARCHY = [ROLES.ADMIN, ROLES.MANAGER, ROLES.VIEWER];

module.exports = { ROLES, ROLE_HIERARCHY };
