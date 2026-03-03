/**
 * Auth Controller — The thin layer between HTTP routes and the auth service.
 *
 * Each function here does exactly three things:
 *   1. Pulls what it needs out of the request (body, cookies, user from JWT).
 *   2. Calls the service to do the actual work.
 *   3. Sends a success response.
 *
 * There is NO business logic here. If you find yourself writing an if-statement
 * that isn't about the HTTP layer, it belongs in auth.service.js instead.
 *
 * Error handling: errors thrown by the service are caught by the asyncWrapper
 * and forwarded to the global error handler in middleware/error.middleware.js.
 */

import {
    registerUser,
    verifyEmail as verifyEmailService,
    resendVerificationEmail as resendVerificationEmailService,
    loginUser,
    refreshAccessToken,
    logoutUser,
    forgotPassword as forgotPasswordService,
    resetPassword as resetPasswordService,
    changePassword as changePasswordService,
    buildRefreshCookieOptions,
} from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import * as auditService from '../services/audit.service.js';
import logger from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────
export async function register(req, res) {
    const result = await registerUser(req.body);

    // The service only includes `otp` in development mode.
    // In production this object only has userId and email — never the OTP.
    const data = { userId: result.userId, email: result.email };
    if (result.otp) {
        data.otp = result.otp; // ⚠️ DEV ONLY — stripped automatically in production
    }

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Registration successful. A 6-digit OTP has been sent to your email.',
        data,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/verify-email
// Body: { email, otp }
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyEmail(req, res) {
    const { otp, email } = req.body;
    await verifyEmailService(otp, email);
    sendSuccess(res, { message: 'Email verified successfully. You can now log in.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/resend-verification-email
// Body: { email }
// ─────────────────────────────────────────────────────────────────────────────
export async function resendVerificationEmail(req, res) {
    await resendVerificationEmailService(req.body.email);

    // We always return the same message regardless of whether the email exists
    // or is already verified — this prevents attackers from using this endpoint
    // to find out which emails are registered (user enumeration).
    sendSuccess(res, {
        message: 'If this email exists and is unverified, a new OTP has been sent.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// Body: { email, password }
// ─────────────────────────────────────────────────────────────────────────────
export async function login(req, res) {
    const { accessToken, refreshToken, user } = await loginUser(req.body);

    // Store the refresh token in an HttpOnly cookie so JavaScript on the page
    // can never read it — reduces risk from XSS attacks.
    res.cookie('refreshToken', refreshToken, buildRefreshCookieOptions());

    // Record the login in the audit log. This is fire-and-forget — an audit
    // failure should NEVER cause the login itself to fail.
    auditService.log({
        orgId: user.organization,
        userId: user._id,
        action: 'user.login',
        resourceType: 'User',
        resourceId: user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
    }).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Audit log failed on login');
    });

    sendSuccess(res, {
        message: 'Login successful.',
        data: {
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh-token
// No body — reads refreshToken from the HttpOnly cookie automatically.
// ─────────────────────────────────────────────────────────────────────────────
export async function refreshToken(req, res) {
    const token = req.cookies?.refreshToken;

    // Guard here instead of the service so we return before making any DB calls
    if (!token) {
        return res.status(HTTP.UNAUTHORIZED).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Refresh token not found. Please log in again.',
            },
        });
    }

    const result = await refreshAccessToken(token);

    // Set the new refresh token as a cookie — the old one is now blacklisted
    res.cookie('refreshToken', result.refreshToken, buildRefreshCookieOptions());

    sendSuccess(res, { data: { accessToken: result.accessToken } });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout  (requires valid access token)
// ─────────────────────────────────────────────────────────────────────────────
export async function logout(req, res) {
    const refreshTokenStr = req.cookies?.refreshToken ?? null;

    // Blacklist both the access token JTI and the refresh token JTI in Redis.
    // req.user is populated by the authenticate middleware.
    await logoutUser(req.user.jti, req.user.exp, refreshTokenStr);

    // Clear the cookie from the browser.
    // We must pass the same options used when setting it (except maxAge).
    const cookieOptions = buildRefreshCookieOptions();
    delete cookieOptions.maxAge;
    res.clearCookie('refreshToken', cookieOptions);

    sendSuccess(res, { message: 'Logged out successfully.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// Body: { email }
// ─────────────────────────────────────────────────────────────────────────────
export async function forgotPassword(req, res) {
    await forgotPasswordService(req.body.email);

    // Always return the same message — prevents attackers from finding out
    // which emails exist in the system.
    sendSuccess(res, {
        message: 'If this email is registered, a password reset link has been sent.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/reset-password
// Body: { token, password }
// ─────────────────────────────────────────────────────────────────────────────
export async function resetPassword(req, res) {
    await resetPasswordService(req.body.token, req.body.password);
    sendSuccess(res, {
        message: 'Password reset successfully. You can now log in with your new password.',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/change-password  (requires valid access token)
// Body: { currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
export async function changePassword(req, res) {
    await changePasswordService(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
    );
    sendSuccess(res, { message: 'Password changed successfully.' });
}