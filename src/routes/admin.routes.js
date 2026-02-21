/**
 * Admin Routes
 */

const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorize('admin'));

router.get('/stats', asyncWrapper(adminController.getStats));
router.get('/queue/status', asyncWrapper(adminController.getQueueStatus));
router.get('/users', asyncWrapper(adminController.listUsers));
router.get('/audit-logs', asyncWrapper(adminController.getAuditLogs));

module.exports = router;
