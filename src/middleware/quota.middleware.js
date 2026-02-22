/**
 * Quota Middleware
 *
 * Checks the user's monthly analysis quota before allowing
 * a new analysis to be queued. Fails open on Redis errors.
 */

import { getRedisClient } from '../config/redis.js';
import { sendError } from '../utils/apiResponse.js';
import { getPlanLimits } from '../constants/plans.js';
import { getCurrentMonthKey, getQuotaResetDate } from '../utils/dateHelper.js';
import HTTP from '../constants/httpStatus.js';
import Organization from '../models/Organization.model.js';
import logger from '../utils/logger.js';

/**
 * Middleware that checks and enforces per-user monthly analysis quota.
 * Must be placed AFTER auth middleware (needs req.user).
 */
export async function checkQuota(req, res, next) {
    try {
        const { userId, orgId } = req.user;
        const redis = getRedisClient();

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
                message: `You have used all ${planLimits.analysesPerMonth} analyses for this month.`,
                details: [{
                    quota: { used, limit: planLimits.analysesPerMonth, resetsAt: getQuotaResetDate() },
                }],
            });
        }

        // Attach quota info for downstream use
        req.quota = { used, limit: planLimits.analysesPerMonth };
        next();
    } catch (err) {
        // Fail open — don't block the user on a Redis error
        logger.error('Quota middleware error:', err.message);
        next();
    }
}
