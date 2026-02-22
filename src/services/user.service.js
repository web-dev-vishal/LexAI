/**
 * User Service
 *
 * Business logic for user profile operations:
 *   - Get profile with quota info
 *   - Update profile (name only — email changes require verification)
 *   - Change password (requires current password)
 *   - Admin user lookup
 */

import User from '../models/User.model.js';
import { getRedisClient } from '../config/redis.js';
import { getCurrentMonthKey, getQuotaResetDate } from '../utils/dateHelper.js';
import { getPlanLimits } from '../constants/plans.js';
import AppError from '../utils/AppError.js';

/**
 * Get the current user's profile with quota information.
 */
export async function getUserProfile(userId) {
    const user = await User.findById(userId)
        .populate('organization', 'name plan')
        .lean();

    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }

    const quota = await getUserQuota(userId, user.organization?.plan);

    return { ...user, id: user._id, quota };
}

/**
 * Update the current user's profile.
 * Only 'name' is allowed — prevents changing email/role via this endpoint.
 */
export async function updateUserProfile(userId, updates) {
    const allowedFields = ['name'];
    const sanitized = {};
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            sanitized[field] = updates[field];
        }
    }

    const user = await User.findByIdAndUpdate(userId, sanitized, {
        new: true,
        runValidators: true,
    });

    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }

    return user;
}

/**
 * Change the current user's password.
 * Requires the current password for verification — prevents session hijacking.
 */
export async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        throw new AppError('Current password is incorrect.', 400, 'INVALID_PASSWORD');
    }

    user.password = newPassword;
    await user.save();
    return true;
}

/**
 * Get user's monthly quota usage from Redis.
 */
async function getUserQuota(userId, plan) {
    const redis = getRedisClient();
    const monthKey = getCurrentMonthKey();
    const quotaKey = `quota:${userId}:${monthKey}`;
    const planLimits = getPlanLimits(plan || 'free');

    const used = parseInt(await redis.get(quotaKey)) || 0;
    const limit = planLimits.analysesPerMonth === Infinity ? 'unlimited' : planLimits.analysesPerMonth;

    return {
        used,
        limit,
        remaining: limit === 'unlimited' ? 'unlimited' : Math.max(0, limit - used),
        resetsAt: getQuotaResetDate(),
    };
}

/**
 * Get user by ID (admin use).
 */
export async function getUserById(userId) {
    const user = await User.findById(userId).populate('organization', 'name plan').lean();
    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }
    return user;
}
