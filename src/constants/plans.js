/**
 * Subscription Plan Limits
 * Enforced at the service layer — no actual payment gateway in v1.
 */

const PLANS = Object.freeze({
    free: {
        name: 'Free',
        analysesPerMonth: 3,
        maxTeamMembers: 1,
        maxContracts: 10,
        versionComparison: false,
        realTimeAlerts: false,
        expiryEmailAlerts: false,
        apiAccess: false,
        auditLogs: false,
    },
    pro: {
        name: 'Pro',
        price: 29,
        analysesPerMonth: 50,
        maxTeamMembers: 5,
        maxContracts: 200,
        versionComparison: true,
        realTimeAlerts: true,
        expiryEmailAlerts: true,
        apiAccess: false,
        auditLogs: true,
    },
    enterprise: {
        name: 'Enterprise',
        price: 99,
        analysesPerMonth: Infinity,
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
 * Look up the plan config by name. Falls back to 'free' for invalid values.
 */
function getPlanLimits(planName) {
    return PLANS[planName] || PLANS.free;
}

module.exports = { PLANS, getPlanLimits };
