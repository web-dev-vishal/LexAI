/** Admin Routes — all require admin role. */

import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorize('admin'));

router.get('/stats', asyncWrapper(adminController.getStats));
router.get('/queue/status', asyncWrapper(adminController.getQueueStatus));
router.get('/users', asyncWrapper(adminController.listUsers));
router.get('/audit-logs', asyncWrapper(adminController.getAuditLogs));

export default router;
