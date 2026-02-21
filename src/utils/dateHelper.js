/**
 * Date Helpers
 *
 * Utility functions for expiry calculations, day-diff computation,
 * and month-boundary logic used by the cron job and quota service.
 */

/**
 * Calculate the number of calendar days between now and a target date.
 * Returns negative values for dates in the past.
 * @param {Date} targetDate
 * @returns {number} Days until target (rounded down)
 */
function daysUntil(targetDate) {
    const now = new Date();
    const diffMs = new Date(targetDate).getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date falls within N days from now (inclusive).
 * @param {Date} targetDate
 * @param {number} days
 * @returns {boolean}
 */
function isWithinDays(targetDate, days) {
    const remaining = daysUntil(targetDate);
    return remaining >= 0 && remaining <= days;
}

/**
 * Get the current month key in YYYY-MM format (for quota tracking).
 * @returns {string} e.g., '2026-02'
 */
function getCurrentMonthKey() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Get the number of seconds remaining until the end of the current month.
 * Used to set TTL on monthly quota keys in Redis.
 * @returns {number}
 */
function secondsUntilEndOfMonth() {
    const now = new Date();
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000);
}

/**
 * Get the ISO date string for the start of the next month.
 * Used in quota responses to tell users when their quota resets.
 * @returns {string} ISO 8601 date string
 */
function getQuotaResetDate() {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return nextMonth.toISOString();
}

module.exports = {
    daysUntil,
    isWithinDays,
    getCurrentMonthKey,
    secondsUntilEndOfMonth,
    getQuotaResetDate,
};
