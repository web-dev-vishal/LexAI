/**
 * Date Helpers
 *
 * Utility functions for expiry calculations, day-diff computation,
 * and month-boundary logic. Used by:
 *   - Cron job (contract expiry scanning)
 *   - Quota service (monthly usage tracking)
 *   - User profile (quota reset date display)
 *
 * All date math uses UTC to avoid timezone-related bugs.
 */

/**
 * Calculate the number of calendar days between now and a target date.
 * Returns negative values for dates in the past — useful for detecting
 * already-expired contracts.
 *
 * @param {Date|string} targetDate - The date to measure against
 * @returns {number} Days until target (rounded down)
 */
export function daysUntil(targetDate) {
    const now = new Date();
    const diffMs = new Date(targetDate).getTime() - now.getTime();

    // Floor instead of round so "1.9 days" shows as "1 day" (conservative)
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date falls within N days from now (inclusive).
 * Used by the expiry cron to decide if an alert threshold is hit.
 *
 * @param {Date|string} targetDate - The date to check
 * @param {number} days - The window in days
 * @returns {boolean} True if the date is between now and N days from now
 */
export function isWithinDays(targetDate, days) {
    const remaining = daysUntil(targetDate);
    // Must be in the future (>= 0) and within the window (<= days)
    return remaining >= 0 && remaining <= days;
}

/**
 * Get the current month key in YYYY-MM format.
 * Used as part of Redis quota keys: `quota:${userId}:2026-02`
 *
 * @returns {string} Month key, e.g., '2026-02'
 */
export function getCurrentMonthKey() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Get the number of seconds remaining until the end of the current month.
 * Used to set TTL on monthly quota keys in Redis — keys auto-expire
 * at month rollover so we don't accumulate stale quota data.
 *
 * @returns {number} Seconds until the first moment of next month
 */
export function secondsUntilEndOfMonth() {
    const now = new Date();
    // First millisecond of next month (UTC)
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000);
}

/**
 * Get the ISO date string for the start of the next month.
 * Shown to users in quota responses so they know when their limit resets.
 *
 * @returns {string} ISO 8601 date string, e.g., '2026-03-01T00:00:00.000Z'
 */
export function getQuotaResetDate() {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return nextMonth.toISOString();
}
