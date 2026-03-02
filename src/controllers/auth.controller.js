// /**
//  * Auth Controller
//  * Handles registration, login, token refresh, logout, and password flows.
//  */

// import * as authService from '../services/auth.service.js';
// import { sendSuccess } from '../utils/apiResponse.js';
// import HTTP from '../constants/httpStatus.js';
// import * as auditService from '../services/audit.service.js';

// /** POST /auth/register */
// export async function register(req, res) {
//     const result = await authService.registerUser(req.body);
    
//     // In development, include verification token in response for testing
//     // In production, token ONLY sent via email for security
//     const responseData = {
//         userId: result.userId,
//         email: result.email,
//     };
    
//     if (process.env.NODE_ENV !== 'production') {
//         responseData.verificationToken = result.verificationToken; // ⚠️ DEV ONLY
//     }
    
//     sendSuccess(res, {
//         statusCode: HTTP.CREATED,
//         message: 'Registration successful. Please check your email to verify your account.',
//         data: responseData,
//     });
// }

// /** POST /auth/verify-email */
// export async function verifyEmail(req, res) {
//     await authService.verifyEmail(req.body.token);
//     sendSuccess(res, { message: 'Email verified successfully. You can now log in.' });
// }

// /** POST /auth/login */
// export async function login(req, res) {
//     const { accessToken, refreshToken, user } = await authService.loginUser(req.body);

//     // Set refresh token as HttpOnly cookie — not accessible via JavaScript
//     res.cookie('refreshToken', refreshToken, {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === 'production',
//         sameSite: 'strict',
//         maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//         path: '/',
//     });

//     await auditService.log({
//         orgId: user.organization,
//         userId: user._id,
//         action: 'user.login',
//         resourceType: 'User',
//         resourceId: user._id,
//         ipAddress: req.ip,
//         userAgent: req.get('user-agent'),
//     });

//     sendSuccess(res, {
//         message: 'Login successful',
//         data: {
//             accessToken,
//             user: { id: user._id, name: user.name, email: user.email, role: user.role },
//         },
//     });
// }

// /** POST /auth/refresh-token */
// export async function refreshToken(req, res) {
//     const token = req.cookies?.refreshToken;
//     if (!token) {
//         return res.status(HTTP.UNAUTHORIZED).json({
//             success: false,
//             error: { code: 'UNAUTHORIZED', message: 'Refresh token not found. Please log in again.' },
//         });
//     }

//     const result = await authService.refreshAccessToken(token);

//     res.cookie('refreshToken', result.refreshToken, {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === 'production',
//         sameSite: 'strict',
//         maxAge: 7 * 24 * 60 * 60 * 1000,
//         path: '/',
//     });

//     sendSuccess(res, { data: { accessToken: result.accessToken } });
// }

// /** POST /auth/logout */
// export async function logout(req, res) {
//     await authService.logoutUser(req.user.jti, req.user.exp);
    
//     // Clear the refresh token cookie with exact same options as when set
//     res.clearCookie('refreshToken', {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === 'production',
//         sameSite: 'strict',
//         path: '/',
//     });
    
//     sendSuccess(res, { message: 'Logged out successfully' });
// }

// /** POST /auth/forgot-password */
// export async function forgotPassword(req, res) {
//     await authService.forgotPassword(req.body.email);
//     // Always return success to prevent email enumeration
//     sendSuccess(res, { message: 'If this email exists, a reset link has been sent.' });
// }

// /** POST /auth/reset-password */
// export async function resetPassword(req, res) {
//     await authService.resetPassword(req.body.token, req.body.password);
//     sendSuccess(res, { message: 'Password reset successfully. You can now log in with your new password.' });
// }

// /** POST /auth/change-password */
// export async function changePassword(req, res) {
//     await authService.changePassword(req.user.userId, req.body.currentPassword, req.body.newPassword);
//     sendSuccess(res, { message: 'Password changed successfully.' });
// }

// /** POST /auth/resend-verification-email */
// export async function resendVerificationEmail(req, res) {
//     await authService.resendVerificationEmail(req.body.email);
//     // Always return success to prevent email enumeration
//     sendSuccess(res, { message: 'If this email exists and is unverified, a verification link has been sent.' });
// }

/**
 * Auth Controller — Production-hardened
 *
 * Hardening applied:
 *  - Cookie options centralized via buildRefreshCookieOptions() from service
 *  - Refresh token also blacklisted on logout (access + refresh both revoked)
 *  - refreshToken endpoint rate-limited
 *  - verificationToken never leaked in production (enforced at service layer too)
 *  - Consistent error response format on early returns
 *  - Audit log wrapped in try/catch — auth flow never broken by audit failure
 *  - No sensitive data in response bodies
 */

import * as authService from '../services/auth.service.js';
import { buildRefreshCookieOptions } from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import * as auditService from '../services/audit.service.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
export async function register(req, res) {
    const result = await authService.registerUser(req.body);

    // verificationToken is only present in the result when NODE_ENV !== 'production'
    // (enforced at service layer). Controller passes it through transparently.
    const responseData = { userId: result.userId, email: result.email };
    if (result.verificationToken) {
        responseData.verificationToken = result.verificationToken; // ⚠️ DEV ONLY
    }

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Registration successful. Please check your email to verify your account.',
        data: responseData,
    });
}

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// ---------------------------------------------------------------------------
export async function verifyEmail(req, res) {
    await authService.verifyEmail(req.body.token);
    sendSuccess(res, { message: 'Email verified successfully. You can now log in.' });
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
export async function login(req, res) {
    const { accessToken, refreshToken, user } = await authService.loginUser(req.body);

    res.cookie('refreshToken', refreshToken, buildRefreshCookieOptions());

    // Audit log must never break the login flow
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
// POST /auth/refresh-token
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

    const result = await authService.refreshAccessToken(token);

    // Issue new refresh token cookie
    res.cookie('refreshToken', result.refreshToken, buildRefreshCookieOptions());

    sendSuccess(res, { data: { accessToken: result.accessToken } });
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
export async function logout(req, res) {
    const refreshTokenStr = req.cookies?.refreshToken ?? null;

    // Blacklist both access JTI and refresh token JTI
    await authService.logoutUser(req.user.jti, req.user.exp, refreshTokenStr);

    // Clear cookie using identical options (required for cookie deletion to work)
    const cookieOptions = buildRefreshCookieOptions();
    delete cookieOptions.maxAge; // clearCookie does not use maxAge
    res.clearCookie('refreshToken', cookieOptions);

    sendSuccess(res, { message: 'Logged out successfully.' });
}

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------
export async function forgotPassword(req, res) {
    await authService.forgotPassword(req.body.email);
    // Always return the same response — enumeration prevention
    sendSuccess(res, {
        message: 'If this email is registered, a password reset link has been sent.',
    });
}

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------
export async function resetPassword(req, res) {
    await authService.resetPassword(req.body.token, req.body.password);
    sendSuccess(res, {
        message: 'Password reset successfully. You can now log in with your new password.',
    });
}

// ---------------------------------------------------------------------------
// POST /auth/change-password
// ---------------------------------------------------------------------------
export async function changePassword(req, res) {
    await authService.changePassword(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
    );
    sendSuccess(res, { message: 'Password changed successfully.' });
}

// ---------------------------------------------------------------------------
// POST /auth/resend-verification-email
// ---------------------------------------------------------------------------
export async function resendVerificationEmail(req, res) {
    await authService.resendVerificationEmail(req.body.email);
    // Always return the same response — enumeration prevention
    sendSuccess(res, {
        message: 'If this email exists and is unverified, a verification link has been sent.',
    });
}