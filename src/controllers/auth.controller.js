/**
 * Auth Controller
 *
 * Thin layer between routes and the auth service.
 * Each handler:
 *   1. Extracts what it needs from req
 *   2. Delegates all business logic to authService
 *   3. Sends a consistent success response
 *
 * Error handling: asyncWrapper catches any thrown AppError or unexpected error
 * and forwards it to the global error handler middleware.
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

// ---------------------------------------------------------------------------
// POST /api/v1/auth/register
// ---------------------------------------------------------------------------
export async function register(req, res) {
    const result = await registerUser(req.body);

    // verificationToken is ONLY included in development (enforced by service layer)
    const responseData = { userId: result.userId, email: result.email };
    if (result.verificationToken) {
        responseData.verificationToken = result.verificationToken; // ⚠️ DEV ONLY — never in production
    }

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Registration successful. Please check your email to verify your account.',
        data: responseData,
    });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/verify-email
// ---------------------------------------------------------------------------
export async function verifyEmail(req, res) {
    await verifyEmailService(req.body.token);
    sendSuccess(res, { message: 'Email verified successfully. You can now log in.' });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/resend-verification-email
// ---------------------------------------------------------------------------
export async function resendVerificationEmail(req, res) {
    await resendVerificationEmailService(req.body.email);
    // Always return success — prevents email enumeration attacks
    sendSuccess(res, {
        message: 'If this email exists and is unverified, a new verification link has been sent.',
    });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------
export async function login(req, res) {
    const { accessToken, refreshToken, user } = await loginUser(req.body);

    // Refresh token stored as HttpOnly cookie — never accessible from JavaScript
    res.cookie('refreshToken', refreshToken, buildRefreshCookieOptions());

    // Audit log is fire-and-forget — login flow must never fail due to audit failure
    auditService
        .log({
            orgId: user.organization,
            userId: user._id,
            action: 'user.login',
            resourceType: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        })
        .catch((err) => {
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

// ---------------------------------------------------------------------------
// POST /api/v1/auth/refresh-token
// ---------------------------------------------------------------------------
export async function refreshToken(req, res) {
    const token = req.cookies?.refreshToken;

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

    // Rotate: issue a new refresh token cookie; old one is now blacklisted in Redis
    res.cookie('refreshToken', result.refreshToken, buildRefreshCookieOptions());

    sendSuccess(res, { data: { accessToken: result.accessToken } });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout  (protected)
// ---------------------------------------------------------------------------
export async function logout(req, res) {
    const refreshTokenStr = req.cookies?.refreshToken ?? null;

    // Blacklist both the access token JTI and the refresh token JTI in Redis
    await logoutUser(req.user.jti, req.user.exp, refreshTokenStr);

    // Clear the cookie — must use same options as when it was set (minus maxAge)
    const cookieOptions = buildRefreshCookieOptions();
    delete cookieOptions.maxAge;
    res.clearCookie('refreshToken', cookieOptions);

    sendSuccess(res, { message: 'Logged out successfully.' });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/forgot-password
// ---------------------------------------------------------------------------
export async function forgotPassword(req, res) {
    await forgotPasswordService(req.body.email);
    // Always return the same response — prevents email enumeration
    sendSuccess(res, {
        message: 'If this email is registered, a password reset link has been sent.',
    });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/reset-password
// ---------------------------------------------------------------------------
export async function resetPassword(req, res) {
    await resetPasswordService(req.body.token, req.body.password);
    sendSuccess(res, {
        message: 'Password reset successfully. You can now log in with your new password.',
    });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/change-password  (protected)
// ---------------------------------------------------------------------------
export async function changePassword(req, res) {
    await changePasswordService(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
    );
    sendSuccess(res, { message: 'Password changed successfully.' });
}