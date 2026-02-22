/**
 * Subscription Plan Limits
 *
 * Defines feature gates and usage caps for each pricing tier.
 * These limits are enforced at the service layer (quota middleware,
 * contract upload, version comparison, alert dispatch).
 *
 * No actual payment gateway in v1 — plan assignment is manual.
 * Infinity is used for enterprise to avoid numeric comparisons.
 */

const PLANS = Object.freeze({
    free: {
        name: 'Free',
        analysesPerMonth: 3,       // AI analyses allowed per user per month
        maxTeamMembers: 1,         // Only the owner — no team collaboration
        maxContracts: 10,          // Total contracts stored in the org
        versionComparison: false,  // Side-by-side diff feature disabled
        realTimeAlerts: false,     // No WebSocket push notifications
        expiryEmailAlerts: false,  // No email alerts for contract expiry
        apiAccess: false,          // No programmatic API access
        auditLogs: false,          // No audit trail visibility
    },
    pro: {
        name: 'Pro',
        price: 29,                 // USD per month
        analysesPerMonth: 50,
        maxTeamMembers: 5,
        maxContracts: 200,
        versionComparison: true,
        realTimeAlerts: true,
        expiryEmailAlerts: true,
        apiAccess: false,          // Reserved for enterprise
        auditLogs: true,
    },
    enterprise: {
        name: 'Enterprise',
        price: 99,
        analysesPerMonth: Infinity, // No cap — checked with === Infinity
        maxTeamMembers: Infinity,
        maxContracts: Infinity,
        versionComparison: true,
        realTimeAlerts: true,
        expiryEmailAlerts: true,
        apiAccess: true,
        auditLogs: true,
    },
});

/**
 * Look up the plan config by name.
 * Falls back to 'free' if the plan name is invalid or missing.
 * This fail-safe prevents undefined plan limits from crashing the app.
 *
 * @param {string} planName - One of 'free', 'pro', 'enterprise'
 * @returns {object} Plan limits configuration
 */
export function getPlanLimits(planName) {
    return PLANS[planName] || PLANS.free;
}

export { PLANS };
