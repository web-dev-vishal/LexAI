/**
 * Role Constants
 *
 * Used throughout the app for RBAC (Role-Based Access Control) checks.
 * The hierarchy determines permission escalation — admins can do
 * everything managers can, managers can do everything viewers can.
 */

// Available roles in the system
export const ROLES = Object.freeze({
    ADMIN: 'admin',       // Full org control: manage members, billing, delete contracts
    MANAGER: 'manager',   // Can upload, edit, delete contracts and invite members
    VIEWER: 'viewer',     // Read-only: can view contracts and analyses
});

// Ordered by privilege level (highest first)
// Used in permission checks where "at least manager" means index <= 1
export const ROLE_HIERARCHY = [ROLES.ADMIN, ROLES.MANAGER, ROLES.VIEWER];
