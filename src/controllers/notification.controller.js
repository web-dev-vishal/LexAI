/**
 * Notification Controller
 *
 * Handles CRUD operations for in-app notifications:
 *   - List org notifications with pagination
 *   - Mark individual notification as read
 *   - Mark all notifications as read (bulk)
 *   - Get unread count for badge display
 */

import Notification from '../models/Notification.model.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { buildPaginationMeta } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/**
 * GET /notifications
 * List notifications for the authenticated user's org (newest first).
 */
export async function listNotifications(req, res) {
    const { orgId } = req.user;
    const { page = 1, limit = 20, read } = req.query;

    const filter = { orgId };

    // Optional filter: ?read=true or ?read=false
    if (read !== undefined) {
        filter.read = read === 'true';
    }

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
        Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        Notification.countDocuments(filter),
    ]);

    const meta = buildPaginationMeta(total, parseInt(page), parseInt(limit));

    sendSuccess(res, { notifications, meta });
}

/**
 * GET /notifications/unread-count
 * Get the count of unread notifications for badge display.
 */
export async function getUnreadCount(req, res) {
    const { orgId } = req.user;

    const count = await Notification.countDocuments({ orgId, read: false });

    sendSuccess(res, { unreadCount: count });
}

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 */
export async function markAsRead(req, res) {
    const { orgId } = req.user;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
        { _id: id, orgId },
        { read: true, readAt: new Date() },
        { new: true }
    );

    if (!notification) {
        return res.status(HTTP.NOT_FOUND).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notification not found.' },
        });
    }

    sendSuccess(res, { notification }, 'Notification marked as read.');
}

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read for the user's org.
 */
export async function markAllAsRead(req, res) {
    const { orgId } = req.user;

    const result = await Notification.updateMany(
        { orgId, read: false },
        { read: true, readAt: new Date() }
    );

    sendSuccess(res, { modifiedCount: result.modifiedCount }, 'All notifications marked as read.');
}
