/**
 * Auth Controller
 * Handles registration, login, token refresh, logout, and password flows.
 */

const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');
const auditService = require('../services/audit.service');

/**
 * POST /auth/register
 */
async function register(req, res) {
    const result = await authService.registerUser(req.body);

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Registration successful. Please check your email to verify your account.',
        data: result,
    });
}

/**
 * POST /auth/verify-email
 */
async function verifyEmail(req, res) {
    await authService.verifyEmail(req.body.token);

    sendSuccess(res, {
        message: 'Email verified successfully. You can now log in.',
    });
}

/**
 * POST /auth/login
 */
async function login(req, res) {
    const { accessToken, refreshToken, user } = await authService.loginUser(req.body);

    // Set refresh token as HttpOnly cookie
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
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        },
    });
}

/**
 * POST /auth/refresh-token
 */
async function refreshToken(req, res) {
    const token = req.cookies?.refreshToken;

    if (!token) {
        return res.status(HTTP.UNAUTHORIZED).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Refresh token not found. Please log in again.' },
        });
    }

    const result = await authService.refreshAccessToken(token);

    // Set the new rotated refresh token
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });

    sendSuccess(res, {
        data: { accessToken: result.accessToken },
    });
}

/**
 * POST /auth/logout
 */
async function logout(req, res) {
    await authService.logoutUser(req.user.jti, req.user.exp);

    res.clearCookie('refreshToken', { path: '/' });

    sendSuccess(res, { message: 'Logged out successfully' });
}

/**
 * POST /auth/forgot-password
 */
async function forgotPassword(req, res) {
    await authService.forgotPassword(req.body.email);

    // Always return success to prevent email enumeration
    sendSuccess(res, {
        message: 'If this email exists, a reset link has been sent.',
    });
}

/**
 * POST /auth/reset-password
 */
async function resetPassword(req, res) {
    await authService.resetPassword(req.body.token, req.body.password);

    sendSuccess(res, {
        message: 'Password reset successfully. You can now log in with your new password.',
    });
}

module.exports = {
    register,
    verifyEmail,
    login,
    refreshToken,
    logout,
    forgotPassword,
    resetPassword,
};
