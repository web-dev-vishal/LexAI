/** Auth Routes */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { rateLimiter } from '../middleware/rateLimiter.middleware.js';
import * as authValidator from '../validators/auth.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// Stricter rate limit for auth endpoints — 10 requests per 15 minutes per IP
const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/register', authLimiter, validate(authValidator.register), asyncWrapper(authController.register));
router.post('/verify-email', validate(authValidator.verifyEmail), asyncWrapper(authController.verifyEmail));
router.post('/login', authLimiter, validate(authValidator.login), asyncWrapper(authController.login));
router.post('/refresh-token', asyncWrapper(authController.refreshToken));
router.post('/logout', authenticate, asyncWrapper(authController.logout));
router.post('/forgot-password', authLimiter, validate(authValidator.forgotPassword), asyncWrapper(authController.forgotPassword));
router.post('/reset-password', validate(authValidator.resetPassword), asyncWrapper(authController.resetPassword));

export default router;