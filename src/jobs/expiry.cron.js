/**
 * Expiry Cron Job
 *
 * Runs daily at 2:00 AM UTC.
 * Scans all contracts for upcoming expiry dates and pushes alert
 * jobs to RabbitMQ for the alert worker to process.
 */

const cron = require('node-cron');
const { scanExpiringContracts } = require('../services/alert.service');
const logger = require('../utils/logger');

/**
 * Schedule the daily expiry scan.
 */
function startExpiryCron() {
    // Run at 2:00 AM UTC every day
    cron.schedule('0 2 * * *', async () => {
        logger.info('⏰ Expiry cron job triggered (2:00 AM UTC)');

        try {
            const alertCount = await scanExpiringContracts();
            logger.info(`Expiry cron completed. ${alertCount} alerts dispatched.`);
        } catch (err) {
            logger.error('Expiry cron job failed:', err.message);
        }
    }, {
        timezone: 'UTC',
        scheduled: true,
    });

    logger.info('✅ Expiry cron job scheduled: daily at 2:00 AM UTC');
}

module.exports = { startExpiryCron };
