/**
 * Alert Service
 *
 * Handles contract expiry alert logic:
 *   - Scans for expiring contracts (called daily by cron job at 2:00 AM UTC)
 *   - Pushes alert jobs to RabbitMQ
 *   - Dispatches both Socket.io events and emails to org members
 *
 * Alert deduplication: once an alert is sent for a specific threshold
 * (e.g., 30 days before expiry), it's recorded on the contract document
 * so we never send the same alert twice.
 */

import Contract from '../models/Contract.model.js';
import Organization from '../models/Organization.model.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import { publishToQueue } from '../config/rabbitmq.js';
import { getPlanLimits } from '../constants/plans.js';
import { daysUntil } from '../utils/dateHelper.js';
import * as emailService from './email.service.js';
import logger from '../utils/logger.js';

const ALERT_QUEUE = process.env.ALERT_QUEUE || 'lexai.alert.queue';

/**
 * Scan all contracts for upcoming expiry dates and push alert jobs.
 * Called daily by the cron job at 2:00 AM UTC.
 *
 * Checks each contract against its configured alert thresholds
 * (default: 90, 60, 30, 7 days before expiry) and queues notifications
 * for any that haven't been sent yet.
 *
 * @returns {number} Number of alerts queued
 */
export async function scanExpiringContracts() {
    logger.info('Starting contract expiry scan...');

    // Find all active contracts that have an expiry date set
    const contracts = await Contract.find({
        isDeleted: false,
        expiryDate: { $exists: true, $ne: null },
    }).lean();

    let alertCount = 0;

    for (const contract of contracts) {
        const remaining = daysUntil(contract.expiryDate);

        // Skip already-expired contracts and those more than 90 days out
        if (remaining < 0 || remaining > 90) continue;

        // Check each configured alert threshold
        for (const threshold of contract.alertDays || [90, 60, 30, 7]) {
            if (remaining > threshold) continue;

            // Deduplication: skip if this specific alert was already sent
            const alreadySent = contract.alertsSent?.some(
                (a) => a.daysBeforeExpiry === threshold
            );
            if (alreadySent) continue;

            // Push alert job to RabbitMQ for the alert worker to process
            publishToQueue(ALERT_QUEUE, {
                contractId: contract._id.toString(),
                orgId: contract.orgId.toString(),
                title: contract.title,
                expiryDate: contract.expiryDate,
                daysUntilExpiry: remaining,
                threshold,
            });

            // Mark this alert as sent on the contract document
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
 * Sends both a Socket.io real-time event and emails to all org members.
 *
 * @param {object} payload - Alert job payload from RabbitMQ
 * @param {import('ioredis').Redis} redisClient - Redis client for Pub/Sub
 */
export async function processExpiryAlert(payload, redisClient) {
    const { contractId, orgId, title, expiryDate, daysUntilExpiry, threshold } = payload;

    const org = await Organization.findById(orgId).lean();
    if (!org) {
        logger.warn('Alert skipped — org not found:', orgId);
        return;
    }

    const planLimits = getPlanLimits(org.plan);

    // Only Pro and Enterprise plans get expiry email alerts
    if (!planLimits.expiryEmailAlerts) {
        logger.debug('Skipping expiry alert — free plan:', orgId);
        return;
    }

    // Publish Socket.io event via Redis Pub/Sub so connected clients get notified
    const socketEvent = {
        event: 'contract:expiring',
        room: `org:${orgId}`,
        payload: { contractId, title, daysUntilExpiry, expiryDate },
    };

    await redisClient.publish('lexai:socket:events', JSON.stringify(socketEvent));

    // Send email alerts to every member in the org
    const memberIds = org.members.map((m) => m.userId);
    const users = await User.find({ _id: { $in: memberIds } }).select('email').lean();

    for (const user of users) {
        // Fire-and-forget — don't block alert processing on individual email failures
        emailService.sendExpiryAlertEmail(user.email, {
            contractTitle: title,
            daysUntilExpiry,
            expiryDate,
            orgName: org.name,
        }).catch((err) => {
            logger.error(`Failed to send expiry email to ${user.email}:`, err.message);
        });
    }

    // Record the notification for in-app notification feed
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
