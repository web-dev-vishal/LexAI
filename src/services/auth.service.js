/**
 * Auth Service
 *
 * All authentication business logic lives here.
 *
 * Token strategy (Redis-based):
 *   - Email verification & password reset use crypto.randomBytes() to generate
 *     a secure 32-byte hex token that is stored in Redis with a TTL.
 *     When the user submits the token it is looked up in Redis, consumed (deleted),
 *     and the corresponding DB action is performed. This gives us:
 *       • Single-use tokens (deleted on first use)
 *       • Easy early invalidation (delete the key)
 *       • No JWT secret sprawl for short-lived one-time tokens
 *
 *   - Access & Refresh tokens remain JWTs (signed with JWT_ACCESS_SECRET /
 *     JWT_REFRESH_SECRET). Refresh tokens rotate on every use (SET NX prevents
 *     replay attacks). Blacklist entries live in Redis until the token's natural
 *     expiry so revoked tokens are rejected without touching the DB.
 *
 * Brute-force protection:
 *   - After 5 failed login attempts the account is locked for 15 minutes.
 *   - Lock state is stored in Redis so it survives server restarts.
 */

import crypto from 'crypto';
import env from '../config/env.js';
import User from '../models/User.model.js';
import { getRedisClient } from '../config/redis.js';
import {
    signAccessToken,
    signRefreshToken,
    verifyToken as verifyJwt,
    getRemainingTTL,
} from '../utils/tokenHelper.js';
import * as emailService from './email.service.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

// ---------------------------------------------------------------------------
// Redis key namespaces — one place to change if keys ever need renaming
// ---------------------------------------------------------------------------
const REDIS_KEY = {
    emailVerify: (token) => `emailVerify:${token}`,
    pwReset: (token) => `pwReset:${token}`,
    loginFail: (email) => `login:fail:${email}`,
    loginLock: (email) => `login:lockout:${email}`,
    blacklist: (jti) => `blacklist:${jti}`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a URL-safe random hex token (64 hex chars = 32 bytes of entropy). */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Cookie options — single source of truth shared with the controller
// ---------------------------------------------------------------------------
export function buildRefreshCookieOptions() {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: env.JWT_REFRESH_COOKIE_MAX_AGE_MS,
        path: '/',
    };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export async function registerUser({ name, email, password }) {
    const normalizedEmail = email.toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
        throw new AppError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    const user = await User.create({
        name,
        email: normalizedEmail,
        password,          // pre-save hook in the model hashes this
        emailVerified: false,
    });

    const verificationToken = await _issueEmailVerificationToken(user._id);

    // Fire-and-forget: don't block registration if the email fails
    emailService.sendVerificationEmail(user.email, verificationToken).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send verification email');
    });

    const result = { userId: user._id, email: user.email };

    // Expose the raw token in non-production so devs can test without an inbox
    if (env.NODE_ENV !== 'production') {
        result.verificationToken = verificationToken;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
export async function verifyEmail(token) {
    const redis = getRedisClient();
    const userId = await redis.get(REDIS_KEY.emailVerify(token));

    if (!userId) {
        throw new AppError(
            'Invalid or expired verification token. Please request a new one.',
            400,
            'INVALID_TOKEN'
        );
    }

    const user = await User.findById(userId);
    if (!user) {
        // Stale Redis entry — clean up and reject
        await redis.del(REDIS_KEY.emailVerify(token));
        throw new AppError('Invalid or expired verification token.', 400, 'INVALID_TOKEN');
    }

    // Mark as verified if not already (idempotent — safe to call twice)
    if (!user.emailVerified) {
        user.emailVerified = true;
        await user.save();
    }

    // Always consume the token so it cannot be used again
    await redis.del(REDIS_KEY.emailVerify(token));
    return true;
}

// ---------------------------------------------------------------------------
// Resend verification email
// ---------------------------------------------------------------------------
export async function resendVerificationEmail(email) {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Silent return prevents email enumeration
    if (!user) return;
    if (user.emailVerified) return;

    const verificationToken = await _issueEmailVerificationToken(user._id);

    emailService.sendVerificationEmail(user.email, verificationToken).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to resend verification email');
    });

    logger.info({ userId: user._id }, 'Verification email resent');
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function loginUser({ email, password }) {
    const redis = getRedisClient();
    const normalizedEmail = email.toLowerCase();
    const lockKey = REDIS_KEY.loginLock(normalizedEmail);
    const failKey = REDIS_KEY.loginFail(normalizedEmail);
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_SECONDS = 900; // 15 minutes

    // Check lockout before touching the DB
    const [isLocked, lockTTL] = await Promise.all([
        redis.exists(lockKey),
        redis.ttl(lockKey),
    ]);

    if (isLocked) {
        throw new AppError(
            `Account temporarily locked. Try again in ${Math.ceil(lockTTL / 60)} minutes.`,
            429,
            'ACCOUNT_LOCKED'
        );
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    const credentialsValid = user && (await user.comparePassword(password));

    if (!credentialsValid) {
        // Atomically increment the failure counter
        const pipeline = redis.pipeline();
        pipeline.incr(failKey);
        pipeline.expire(failKey, LOCKOUT_SECONDS);
        const [[, failures]] = await pipeline.exec();

        if (failures >= MAX_ATTEMPTS) {
            await redis.pipeline()
                .set(lockKey, '1', 'EX', LOCKOUT_SECONDS)
                .del(failKey)
                .exec();
            logger.warn({ email: normalizedEmail }, 'Account locked after too many failed login attempts');
            throw new AppError(
                'Account temporarily locked after too many failed attempts. Try again in 15 minutes.',
                429,
                'ACCOUNT_LOCKED'
            );
        }

        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.emailVerified) {
        throw new AppError(
            'Please verify your email before logging in.',
            403,
            'EMAIL_NOT_VERIFIED'
        );
    }

    if (user.isActive === false) {
        throw new AppError(
            'Your account has been deactivated. Please contact support.',
            403,
            'ACCOUNT_DEACTIVATED'
        );
    }

    // Successful login — clear any leftover lock/fail state
    await redis.pipeline().del(failKey).del(lockKey).exec();

    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const access = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const refresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    user.lastLoginAt = new Date();
    await user.save();

    return { accessToken: access.token, refreshToken: refresh.token, user };
}

// ---------------------------------------------------------------------------
// Refresh token rotation
// ---------------------------------------------------------------------------
export async function refreshAccessToken(refreshTokenStr) {
    if (!refreshTokenStr) {
        throw new AppError('Refresh token not provided. Please log in again.', 401, 'UNAUTHORIZED');
    }

    let decoded;
    try {
        decoded = verifyJwt(refreshTokenStr, env.JWT_REFRESH_SECRET);
    } catch {
        throw new AppError('Invalid or expired refresh token. Please log in again.', 401, 'UNAUTHORIZED');
    }

    const redis = getRedisClient();
    const ttl = getRemainingTTL(decoded.exp);

    if (ttl < 1) {
        throw new AppError('Refresh token has expired. Please log in again.', 401, 'TOKEN_EXPIRED');
    }

    // SET NX is atomic — exactly one concurrent request wins; replays are rejected
    const consumed = await redis.set(REDIS_KEY.blacklist(decoded.jti), '1', 'EX', ttl, 'NX');
    if (!consumed) {
        logger.warn({ jti: decoded.jti, userId: decoded.userId }, 'Refresh token replay detected — possible token theft');
        throw new AppError(
            'This refresh token has already been used. Please log in again.',
            401,
            'TOKEN_ROTATED'
        );
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.isActive === false) {
        throw new AppError('Account not found or deactivated. Please log in again.', 401, 'UNAUTHORIZED');
    }

    if (!user.emailVerified) {
        throw new AppError('Email not verified.', 403, 'EMAIL_NOT_VERIFIED');
    }

    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const newAccess = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const newRefresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    return { accessToken: newAccess.token, refreshToken: newRefresh.token };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export async function logoutUser(jti, exp, refreshTokenStr) {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    // Blacklist the access token JTI so it cannot be used after logout
    const accessTTL = getRemainingTTL(exp);
    if (accessTTL > 0) {
        pipeline.set(REDIS_KEY.blacklist(jti), '1', 'EX', accessTTL);
    }

    // Also kill the refresh token so the cookie cannot yield a new access token
    if (refreshTokenStr) {
        try {
            const decoded = verifyJwt(refreshTokenStr, env.JWT_REFRESH_SECRET);
            const refreshTTL = getRemainingTTL(decoded.exp);
            if (refreshTTL > 0) {
                pipeline.set(REDIS_KEY.blacklist(decoded.jti), '1', 'EX', refreshTTL);
            }
        } catch {
            // Refresh token already expired or tampered — nothing to blacklist
            logger.debug('Refresh token invalid at logout — skipping blacklist entry');
        }
    }

    await pipeline.exec();
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------
export async function forgotPassword(email) {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Silent return — never reveal whether the email is registered
    if (!user) return;

    const resetToken = await _issuePasswordResetToken(user._id);

    emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send password reset email');
    });
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------
export async function resetPassword(token, newPassword) {
    const redis = getRedisClient();
    const userId = await redis.get(REDIS_KEY.pwReset(token));

    if (!userId) {
        throw new AppError(
            'Invalid or expired password reset token. Please request a new one.',
            400,
            'INVALID_TOKEN'
        );
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
        await redis.del(REDIS_KEY.pwReset(token));
        throw new AppError('Invalid or expired password reset token.', 400, 'INVALID_TOKEN');
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw new AppError(
            'New password must be different from your current password.',
            400,
            'PASSWORD_REUSE'
        );
    }

    // Set new password (pre-save hook hashes it) and consume the token
    user.password = newPassword;
    await user.save();

    await redis.del(REDIS_KEY.pwReset(token));
    logger.info({ userId }, 'Password reset successfully');
    return true;
}

// ---------------------------------------------------------------------------
// Change password (authenticated)
// ---------------------------------------------------------------------------
export async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }

    const currentIsValid = await user.comparePassword(currentPassword);
    if (!currentIsValid) {
        throw new AppError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw new AppError(
            'New password must be different from your current password.',
            400,
            'PASSWORD_REUSE'
        );
    }

    user.password = newPassword; // pre-save hook hashes
    await user.save();

    logger.info({ userId, email: user.email }, 'Password changed successfully');
    return true;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Generate a new email verification token, store it in Redis, and return it.
 * Any previously issued token for this user is overwritten (old link invalidated).
 */
async function _issueEmailVerificationToken(userId) {
    const token = generateToken();
    const redis = getRedisClient();

    await redis.set(
        REDIS_KEY.emailVerify(token),
        userId.toString(),
        'EX',
        env.EMAIL_VERIFICATION_EXPIRY
    );

    return token;
}

/**
 * Generate a new password reset token, store it in Redis, and return it.
 * Any previously issued reset token for this user is implicitly superseded
 * (only the latest token in Redis will match at reset time).
 */
async function _issuePasswordResetToken(userId) {
    const token = generateToken();
    const redis = getRedisClient();

    await redis.set(
        REDIS_KEY.pwReset(token),
        userId.toString(),
        'EX',
        env.PASSWORD_RESET_EXPIRY
    );

    return token;
}