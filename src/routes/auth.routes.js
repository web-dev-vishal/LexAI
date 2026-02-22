/** Auth Routes */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as authValidator from '../validators/auth.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

router.post('/register', validate(authValidator.register), asyncWrapper(authController.register));
router.post('/verify-email', validate(authValidator.verifyEmail), asyncWrapper(authController.verifyEmail));
router.post('/login', validate(authValidator.login), asyncWrapper(authController.login));
router.post('/refresh-token', asyncWrapper(authController.refreshToken));
router.post('/logout', authenticate, asyncWrapper(authController.logout));
router.post('/forgot-password', validate(authValidator.forgotPassword), asyncWrapper(authController.forgotPassword));
router.post('/reset-password', validate(authValidator.resetPassword), asyncWrapper(authController.resetPassword));

export default router;
