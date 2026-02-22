/**
 * Expiry Cron Job
 *
 * Runs daily at 2:00 AM UTC. Scans contracts for upcoming expiry
 * and pushes alert jobs to RabbitMQ.
 */

import cron from 'node-cron';
import { scanExpiringContracts } from '../services/alert.service.js';
import logger from '../utils/logger.js';

/** Schedule the daily expiry scan. */
export function startExpiryCron() {
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
