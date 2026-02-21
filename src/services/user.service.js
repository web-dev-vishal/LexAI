/**
 * User Service
 * Business logic for user profile operations.
 */

const User = require('../models/User.model');
const Organization = require('../models/Organization.model');
const { getRedisClient } = require('../config/redis');
const { getCurrentMonthKey, getQuotaResetDate } = require('../utils/dateHelper');
const { getPlanLimits } = require('../constants/plans');

/**
 * Get the current user's profile with quota information.
 */
async function getUserProfile(userId) {
    const user = await User.findById(userId)
        .populate('organization', 'name plan')
        .lean();

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
    }

    // Build quota info
    const quota = await getUserQuota(userId, user.organization?.plan);

    return {
        ...user,
        id: user._id,
        quota,
    };
}

/**
 * Update the current user's profile.
 */
async function updateUserProfile(userId, updates) {
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
        const error = new Error('User not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
    }

    return user;
}

/**
 * Change the current user's password.
 */
async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        const error = new Error('Current password is incorrect.');
        error.statusCode = 400;
        error.code = 'INVALID_PASSWORD';
        throw error;
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
async function getUserById(userId) {
    const user = await User.findById(userId).populate('organization', 'name plan').lean();
    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }
    return user;
}

module.exports = {
    getUserProfile,
    updateUserProfile,
    changePassword,
    getUserQuota,
    getUserById,
};
