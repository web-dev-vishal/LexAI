/**
 * Quota Middleware
 *
 * Checks the user's monthly analysis quota before allowing
 * a new analysis to be queued. Quotas are tracked in Redis and
 * synced to MongoDB nightly.
 *
 * Tier limits:
 *   Free:       3 analyses/month
 *   Pro:        50 analyses/month
 *   Enterprise: Unlimited
 */

const { getRedisClient } = require('../config/redis');
const { sendError } = require('../utils/apiResponse');
const { getPlanLimits } = require('../constants/plans');
const { getCurrentMonthKey, getQuotaResetDate } = require('../utils/dateHelper');
const HTTP = require('../constants/httpStatus');
const Organization = require('../models/Organization.model');
const logger = require('../utils/logger');

/**
 * Middleware that checks and enforces per-user monthly analysis quota.
 * Must be placed AFTER auth middleware (needs req.user).
 */
async function checkQuota(req, res, next) {
    try {
        const { userId, orgId } = req.user;
        const redis = getRedisClient();

        // Look up the org's plan
        const org = await Organization.findById(orgId).select('plan').lean();
        if (!org) {
            return sendError(res, {
                statusCode: HTTP.NOT_FOUND,
                code: 'NOT_FOUND',
                message: 'Organization not found.',
            });
        }

        const planLimits = getPlanLimits(org.plan);

        // Enterprise = unlimited, skip check
        if (planLimits.analysesPerMonth === Infinity) {
            return next();
        }

        const monthKey = getCurrentMonthKey();
        const quotaKey = `quota:${userId}:${monthKey}`;

        const used = parseInt(await redis.get(quotaKey)) || 0;

        if (used >= planLimits.analysesPerMonth) {
            return sendError(res, {
                statusCode: HTTP.TOO_MANY_REQUESTS,
                code: 'QUOTA_EXCEEDED',
                message: `You have used all ${planLimits.analysesPerMonth} analyses for this month. Upgrade to Pro for 50/month.`,
                details: [{
                    quota: {
                        used,
                        limit: planLimits.analysesPerMonth,
                        resetsAt: getQuotaResetDate(),
                    },
                }],
            });
        }

        // Attach quota info to request so downstream can use it
        req.quota = { used, limit: planLimits.analysesPerMonth };
        next();
    } catch (err) {
        logger.error('Quota middleware error:', err.message);
        // Fail open — don't block the user on a Redis error
        next();
    }
}

module.exports = { checkQuota };
