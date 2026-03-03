/**
 * Auth Routes
 *
 * Base path: /api/v1/auth  (mounted in routes/index.js)
 *
 * Public endpoints (no token required):
 *   POST /register                  — Create a new user account
 *   POST /verify-email              — Verify email with Redis token
 *   POST /resend-verification-email — Request a new verification email
 *   POST /login                     — Authenticate and receive tokens
 *   POST /refresh-token             — Rotate access token (reads cookie)
 *   POST /forgot-password           — Send password reset email
 *   POST /reset-password            — Reset password with Redis token
 *
 * Protected endpoints (require Authorization: Bearer <access_token>):
 *   POST /logout                    — Revoke access + refresh tokens
 *   POST /change-password           — Change password while logged in
 *
 * Token strategy:
 *   Access tokens  — 15 min JWT, sent in Authorization header
 *   Refresh tokens — 7 day JWT, stored in HttpOnly cookie
 *   Verify / Reset — 64-char hex, stored in Redis with TTL
 */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { rateLimiter } from '../middleware/rateLimiter.middleware.js';
import * as authValidator from '../validators/auth.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// Stricter rate limit for sensitive auth endpoints — 10 req / 15 min per IP
const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

// ─── Public ──────────────────────────────────────────────────────────────────
router.post(
    '/register',
    authLimiter,
    validate(authValidator.register),
    asyncWrapper(authController.register)
);

router.post(
    '/verify-email',
    validate(authValidator.verifyEmail),
    asyncWrapper(authController.verifyEmail)
);

router.post(
    '/resend-verification-email',
    authLimiter,
    validate(authValidator.resendVerificationEmail),
    asyncWrapper(authController.resendVerificationEmail)
);

router.post(
    '/login',
    authLimiter,
    validate(authValidator.login),
    asyncWrapper(authController.login)
);

router.post(
    '/refresh-token',
    asyncWrapper(authController.refreshToken)
    // No body validation — token is read from the HttpOnly cookie
);

router.post(
    '/forgot-password',
    authLimiter,
    validate(authValidator.forgotPassword),
    asyncWrapper(authController.forgotPassword)
);

router.post(
    '/reset-password',
    validate(authValidator.resetPassword),
    asyncWrapper(authController.resetPassword)
);

// ─── Protected (JWT required) ─────────────────────────────────────────────
router.post(
    '/logout',
    authenticate,
    asyncWrapper(authController.logout)
);

router.post(
    '/change-password',
    authenticate,
    validate(authValidator.changePassword),
    asyncWrapper(authController.changePassword)
);

// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────

// list active sessions
router.get(
    '/sessions',
    authenticate,
    asyncWrapper(authController.getSessions)
);

// revoke one session by JTI
router.delete(
    '/sessions/:jti',
    authenticate,
    validate(authValidator.jtiParam, 'params'),
    asyncWrapper(authController.revokeSession)
);

// revoke all sessions (log out everywhere)
router.delete(
    '/sessions',
    authenticate,
    asyncWrapper(authController.revokeAllSessions)
);

export default router;