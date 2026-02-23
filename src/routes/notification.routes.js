/** Notification Routes — all require authentication. */

import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

router.get('/', asyncWrapper(notificationController.listNotifications));
router.get('/unread-count', asyncWrapper(notificationController.getUnreadCount));
router.patch('/read-all', asyncWrapper(notificationController.markAllAsRead));
router.patch('/:id/read', asyncWrapper(notificationController.markAsRead));

export default router;
