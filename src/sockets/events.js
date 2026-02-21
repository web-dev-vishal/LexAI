/**
 * Socket Event Name Constants
 * Single source of truth for all Socket.io event names.
 */

const SOCKET_EVENTS = Object.freeze({
    // Analysis lifecycle
    ANALYSIS_COMPLETE: 'analysis:complete',
    ANALYSIS_FAILED: 'analysis:failed',

    // Contract alerts
    CONTRACT_EXPIRING: 'contract:expiring',

    // User notifications
    QUOTA_WARNING: 'quota:warning',

    // Room management
    JOIN_ORG: 'join:org',
});

module.exports = SOCKET_EVENTS;
