/** User Routes */

import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as userValidator from '../validators/user.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

router.get('/me', authenticate, asyncWrapper(userController.getProfile));
router.patch('/me', authenticate, validate(userValidator.updateProfile), asyncWrapper(userController.updateProfile));
router.patch('/me/password', authenticate, validate(userValidator.changePassword), asyncWrapper(userController.changePassword));
router.get('/:id', authenticate, authorize('admin'), asyncWrapper(userController.getUserById));

export default router;
