/**
 * Auth Controller
 * Handles registration, login, token refresh, logout, and password flows.
 */

import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import * as auditService from '../services/audit.service.js';

/** POST /auth/register */
export async function register(req, res) {
    const result = await authService.registerUser(req.body);
    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Registration successful. Please check your email to verify your account.',
        data: result,
    });
}

/** POST /auth/verify-email */
export async function verifyEmail(req, res) {
    await authService.verifyEmail(req.body.token);
    sendSuccess(res, { message: 'Email verified successfully. You can now log in.' });
}

/** POST /auth/login */
export async function login(req, res) {
    const { accessToken, refreshToken, user } = await authService.loginUser(req.body);

    // Set refresh token as HttpOnly cookie — not accessible via JavaScript
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
    });

    await auditService.log({
        orgId: user.organization,
        userId: user._id,
        action: 'user.login',
        resourceType: 'User',
        resourceId: user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
    });

    sendSuccess(res, {
        message: 'Login successful',
        data: {
            accessToken,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        },
    });
}

/** POST /auth/refresh-token */
export async function refreshToken(req, res) {
    const token = req.cookies?.refreshToken;
    if (!token) {
        return res.status(HTTP.UNAUTHORIZED).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Refresh token not found. Please log in again.' },
        });
    }

    const result = await authService.refreshAccessToken(token);

    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });

    sendSuccess(res, { data: { accessToken: result.accessToken } });
}

/** POST /auth/logout */
export async function logout(req, res) {
    await authService.logoutUser(req.user.jti, req.user.exp);
    res.clearCookie('refreshToken', { path: '/' });
    sendSuccess(res, { message: 'Logged out successfully' });
}

/** POST /auth/forgot-password */
export async function forgotPassword(req, res) {
    await authService.forgotPassword(req.body.email);
    // Always return success to prevent email enumeration
    sendSuccess(res, { message: 'If this email exists, a reset link has been sent.' });
}

/** POST /auth/reset-password */
export async function resetPassword(req, res) {
    await authService.resetPassword(req.body.token, req.body.password);
    sendSuccess(res, { message: 'Password reset successfully. You can now log in with your new password.' });
}
