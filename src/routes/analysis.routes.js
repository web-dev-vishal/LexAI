/**
 * Auth Routes — Production-hardened
 *
 * Hardening applied:
 *  - /refresh-token now has its own dedicated rate limiter (was unprotected)
 *  - /reset-password rate-limited (was unprotected — brute-forceable)
 *  - /verify-email rate-limited (was unprotected — enumerable via timing)
 *  - /change-password rate-limited (authenticated, but still worth limiting)
 *  - /logout rate-limited (prevent blacklist flooding DoS)
 *  - Separate limiter tiers:
 *      authLimiter       — 10 req / 15 min  (register, login, forgot-password)
 *      sensitiveVerify   — 5  req / 15 min  (verify-email, resend-verification)
 *      tokenLimiter      — 20 req / 15 min  (refresh-token — higher for silent refresh)
 *      resetLimiter      — 5  req / 15 min  (reset-password)
 *      changeLimiter     — 10 req / 15 min  (change-password — authenticated)
 *      logoutLimiter     — 20 req / 15 min  (logout — prevent blacklist flood)
 *
 * Token Strategy:
 *  - Access tokens:  short-lived (15 m), sent in Authorization header
 *  - Refresh tokens: long-lived (7 d), HttpOnly cookie scoped to /api/auth
 *  - Both carry JTI for blacklist revocation
 *
 * All routes use asyncWrapper — unhandled rejections are forwarded to Express
 * error handler and never crash the process.
 */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { rateLimiter } from '../middleware/rateLimiter.middleware.js';
import * as authValidator from '../validators/auth.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiter tiers
// ---------------------------------------------------------------------------

/** High-sensitivity public endpoints — 10 req / 15 min */
const authLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many requests from this IP. Please try again later.',
});

/** Email verification — 5 req / 15 min (prevent token enumeration via timing) */
const sensitiveVerifyLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many verification requests. Please try again later.',
});

/** Refresh token endpoint — 20 req / 15 min (silent background refresh) */
const tokenLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many token refresh requests. Please log in again.',
});

/** Reset password — 5 req / 15 min (brute-force prevention) */
const resetLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password reset attempts. Please try again later.',
});

/** Change password — 10 req / 15 min (authenticated, still worth limiting) */
const changeLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many password change attempts. Please try again later.',
});

/** Logout — 20 req / 15 min (prevent blacklist flooding DoS) */
const logoutLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many logout requests.',
});

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

router.post(
    '/register',
    authLimiter,
    validate(authValidator.register),
    asyncWrapper(authController.register)
);

router.post(
    '/verify-email',
    sensitiveVerifyLimiter,
    validate(authValidator.verifyEmail),
    asyncWrapper(authController.verifyEmail)
);

router.post(
    '/resend-verification-email',
    sensitiveVerifyLimiter,
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
    tokenLimiter,
    asyncWrapper(authController.refreshToken)
);

router.post(
    '/forgot-password',
    authLimiter,
    validate(authValidator.forgotPassword),
    asyncWrapper(authController.forgotPassword)
);

router.post(
    '/reset-password',
    resetLimiter,
    validate(authValidator.resetPassword),
    asyncWrapper(authController.resetPassword)
);

// ---------------------------------------------------------------------------
// Protected routes (require valid access token)
// ---------------------------------------------------------------------------

router.post(
    '/logout',
    logoutLimiter,
    authenticate,
    asyncWrapper(authController.logout)
);

router.post(
    '/change-password',
    changeLimiter,
    authenticate,
    validate(authValidator.changePassword),
    asyncWrapper(authController.changePassword)
);

export default router;