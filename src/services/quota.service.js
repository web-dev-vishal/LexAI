/**
 * Quota Service
 *
 * Per-user monthly analysis quotas using Redis counters.
 * Keys auto-expire at month boundaries via EXPIRE TTL.
 */

import { getRedisClient } from '../config/redis.js';
import { getCurrentMonthKey, secondsUntilEndOfMonth, getQuotaResetDate } from '../utils/dateHelper.js';
import { getPlanLimits } from '../constants/plans.js';

/**
 * Check if a user has remaining quota for this month.
 */
export async function checkQuota(userId, plan) {
    const redis = getRedisClient();
    const planLimits = getPlanLimits(plan);

    if (planLimits.analysesPerMonth === Infinity) {
        return { allowed: true, used: 0, limit: Infinity };
    }

    const monthKey = getCurrentMonthKey();
    const quotaKey = `quota:${userId}:${monthKey}`;
    const used = parseInt(await redis.get(quotaKey)) || 0;

    return {
        allowed: used < planLimits.analysesPerMonth,
        used,
        limit: planLimits.analysesPerMonth,
        remaining: Math.max(0, planLimits.analysesPerMonth - used),
        resetsAt: getQuotaResetDate(),
    };
}

/**
 * Increment the user's quota usage by 1.
 */
export async function incrementQuota(userId) {
    const redis = getRedisClient();
    const monthKey = getCurrentMonthKey();
    const quotaKey = `quota:${userId}:${monthKey}`;

    const current = await redis.incr(quotaKey);
    if (current === 1) {
        await redis.expire(quotaKey, secondsUntilEndOfMonth());
    }

    return current;
}

/**
 * Get quota info formatted for user profile display.
 */
export async function getQuotaInfo(userId, plan) {
    const { used, limit, remaining, resetsAt } = await checkQuota(userId, plan);
    return {
        used,
        limit: limit === Infinity ? 'unlimited' : limit,
        remaining: limit === Infinity ? 'unlimited' : remaining,
        resetsAt,
    };
}
