/**
 * Auth Routes
 *
 * Authentication & authorization endpoints:
 *
 * Public (unauthenticated):
 *   POST /register              - Register new user
 *   POST /verify-email          - Verify email address with token
 *   POST /resend-verification-email - Request new verification email
 *   POST /login                 - Authenticate and receive tokens
 *   POST /refresh-token         - Rotate access token using refresh token
 *   POST /forgot-password       - Request password reset email
 *   POST /reset-password        - Reset password using token
 *
 * Protected (requires authentication):
 *   POST /logout                - Revoke access & refresh tokens
 *   POST /change-password       - Change password while logged in
 *
 * Token Strategy:
 *   - Access tokens: 15m lifetime, sent in Authorization header
 *   - Refresh tokens: 7d lifetime, stored as HttpOnly cookie (CSRF-protected)
 *   - Both tokens include JTI (JWT ID) for blacklist tracking on logout
 *
 * Rate Limiting:
 *   - Auth endpoints (register, login, forgot-password): 10 req/15 min per IP
 *   - Other endpoints: Standard global rate limit applies
 */

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
router.post('/resend-verification-email', authLimiter, validate(authValidator.resendVerificationEmail), asyncWrapper(authController.resendVerificationEmail));
router.post('/login', authLimiter, validate(authValidator.login), asyncWrapper(authController.login));
router.post('/refresh-token', asyncWrapper(authController.refreshToken));
router.post('/logout', authenticate, asyncWrapper(authController.logout));
router.post('/forgot-password', authLimiter, validate(authValidator.forgotPassword), asyncWrapper(authController.forgotPassword));
router.post('/reset-password', validate(authValidator.resetPassword), asyncWrapper(authController.resetPassword));
router.post('/change-password', authenticate, validate(authValidator.changePassword), asyncWrapper(authController.changePassword));

export default router;