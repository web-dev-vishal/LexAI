/**
 * User Routes
 */

const { Router } = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

router.get('/me', authenticate, asyncWrapper(userController.getProfile));
router.patch('/me', authenticate, asyncWrapper(userController.updateProfile));
router.patch('/me/password', authenticate, asyncWrapper(userController.changePassword));
router.get('/:id', authenticate, authorize('admin'), asyncWrapper(userController.getUserById));

module.exports = router;
