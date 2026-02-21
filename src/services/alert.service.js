/**
 * Alert Service
 *
 * Handles contract expiry alert logic:
 *   - Scans for expiring contracts (called by cron job)
 *   - Pushes alert jobs to RabbitMQ
 *   - Dispatches both Socket.io events and emails
 */

const Contract = require('../models/Contract.model');
const Organization = require('../models/Organization.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const { publishToQueue } = require('../config/rabbitmq');
const { getPlanLimits } = require('../constants/plans');
const { daysUntil } = require('../utils/dateHelper');
const logger = require('../utils/logger');

const ALERT_QUEUE = process.env.ALERT_QUEUE || 'lexai.alert.queue';

/**
 * Scan all contracts for upcoming expiry dates and push alert jobs.
 * Called by the cron job at 2:00 AM UTC daily.
 */
async function scanExpiringContracts() {
    logger.info('Starting contract expiry scan...');

    const contracts = await Contract.find({
        isDeleted: false,
        expiryDate: { $exists: true, $ne: null },
    }).lean();

    let alertCount = 0;

    for (const contract of contracts) {
        const remaining = daysUntil(contract.expiryDate);

        // Skip contracts already expired or too far out
        if (remaining < 0 || remaining > 90) continue;

        // Check each alert threshold
        for (const threshold of contract.alertDays || [90, 60, 30, 7]) {
            if (remaining > threshold) continue;

            // Check if this alert was already sent
            const alreadySent = contract.alertsSent?.some(
                (a) => a.daysBeforeExpiry === threshold
            );
            if (alreadySent) continue;

            // Push alert job to RabbitMQ
            publishToQueue(ALERT_QUEUE, {
                contractId: contract._id.toString(),
                orgId: contract.orgId.toString(),
                title: contract.title,
                expiryDate: contract.expiryDate,
                daysUntilExpiry: remaining,
                threshold,
            });

            // Mark alert as sent on the contract
            await Contract.findByIdAndUpdate(contract._id, {
                $push: { alertsSent: { daysBeforeExpiry: threshold, sentAt: new Date() } },
            });

            alertCount++;
        }
    }

    logger.info(`Expiry scan complete. ${alertCount} alerts queued.`);
    return alertCount;
}

/**
 * Process an expiry alert job (called by the alert worker).
 * Sends both Socket.io event and emails to all org members.
 */
async function processExpiryAlert(payload, redisClient) {
    const { contractId, orgId, title, expiryDate, daysUntilExpiry, threshold } = payload;

    const org = await Organization.findById(orgId).lean();
    if (!org) {
        logger.warn('Alert skipped — org not found:', orgId);
        return;
    }

    const planLimits = getPlanLimits(org.plan);

    // Only Pro and Enterprise get expiry alerts
    if (!planLimits.expiryEmailAlerts) {
        logger.debug('Skipping expiry alert — free plan:', orgId);
        return;
    }

    // Publish Socket.io event via Redis Pub/Sub
    const socketEvent = {
        event: 'contract:expiring',
        room: `org:${orgId}`,
        payload: { contractId, title, daysUntilExpiry, expiryDate },
    };

    await redisClient.publish('lexai:socket:events', JSON.stringify(socketEvent));

    // Send email to all org members
    const emailService = require('./email.service');
    const memberIds = org.members.map((m) => m.userId);
    const users = await User.find({ _id: { $in: memberIds } }).select('email').lean();

    for (const user of users) {
        emailService.sendExpiryAlertEmail(user.email, {
            contractTitle: title,
            daysUntilExpiry,
            expiryDate,
            orgName: org.name,
        }).catch((err) => {
            logger.error(`Failed to send expiry email to ${user.email}:`, err.message);
        });
    }

    // Log notification
    await Notification.create({
        orgId,
        type: 'contract_expiring',
        channel: 'both',
        resourceType: 'Contract',
        resourceId: contractId,
        message: `Contract "${title}" expires in ${daysUntilExpiry} days.`,
        metadata: { expiryDate, threshold },
    });

    logger.info(`Expiry alert processed: "${title}" — ${daysUntilExpiry} days remaining`);
}

module.exports = {
    scanExpiringContracts,
    processExpiryAlert,
};
