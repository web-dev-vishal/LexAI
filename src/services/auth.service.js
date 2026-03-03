/**
 * Auth Service — All authentication business logic lives here.
 *
 * How verification works:
 *   - When a user registers, we generate a random 6-digit OTP and store it in
 *     Redis under the key "emailOtp:{userId}" with a 10-minute expiry.
 *   - We send the OTP to the user's email.
 *   - When the user submits the OTP, we look it up in Redis, check it matches,
 *     mark the account as verified, then delete the OTP so it can't be reused.
 *   - If the user resends, we overwrite the old OTP in Redis — so only the
 *     latest code ever works.
 *
 * How login tokens work:
 *   - Access token  → short-lived JWT (15 min), sent in Authorization header.
 *   - Refresh token → long-lived JWT (7 days), stored in an HttpOnly cookie.
 *   - On every token refresh, the old refresh token is blacklisted in Redis and
 *     a brand new one is issued. This prevents stolen tokens being reused.
 *
 * Brute-force protection:
 *   - 5 wrong passwords in a row → account locked for 15 minutes.
 *   - The lock is stored in Redis, so it survives server restarts.
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

// ─────────────────────────────────────────────────────────────────────────────
// Redis key templates
// All Redis keys are defined here so if you ever need to rename or add a
// namespace prefix, you only change it in one place.
// ─────────────────────────────────────────────────────────────────────────────
const REDIS_KEY = {
    // OTP is keyed by the user's _id, not by the OTP itself.
    // This means issuing a new OTP automatically invalidates the old one.
    emailOtp: (userId) => `emailOtp:${userId}`,

    // Password-reset token is keyed by the token itself (random 64-char hex).
    // Redis GET returns the userId; the token is embedded in the key name.
    pwReset: (token) => `pwReset:${token}`,

    // Login failure counter per email address
    loginFail: (email) => `login:fail:${email}`,

    // Account lockout flag per email address
    loginLock: (email) => `login:lockout:${email}`,

    // Revoked JWT IDs — checked on every authenticated request
    blacklist: (jti) => `blacklist:${jti}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Token / OTP generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a random 6-digit string like "048291".
 * Uses crypto.randomInt which is cryptographically secure and uniformly
 * distributed — no modulo bias.
 */
function generateOtp() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Returns a random 64-character hex string (32 bytes of entropy).
 * Used for password-reset tokens where the user clicks a link.
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh cookie options
// Exported so the controller uses the exact same settings when clearing it.
// ─────────────────────────────────────────────────────────────────────────────
export function buildRefreshCookieOptions() {
    return {
        httpOnly: true,                                    // JS cannot read this cookie
        secure: env.NODE_ENV === 'production',           // HTTPS only in prod
        sameSite: 'strict',                                // blocks CSRF
        maxAge: env.JWT_REFRESH_COOKIE_MAX_AGE_MS,       // 7 days in ms
        path: '/',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────
export async function registerUser({ name, email, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    // Reject duplicate emails before creating anything in the DB
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
        throw new AppError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    // Create the user — the model's pre-save hook will hash the password
    const user = await User.create({
        name,
        email: normalizedEmail,
        password,
        emailVerified: false,
    });

    // Generate OTP and send it. We don't await the email so that a slow SMTP
    // server never delays the register response for the user.
    const otp = await _issueEmailOtp(user._id);
    emailService.sendOtpEmail(user.email, otp).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send OTP email after registration');
    });

    // Only return the OTP in development so engineers can test without an inbox.
    // In production this field is simply absent from the response.
    const response = { userId: user._id, email: user.email };
    if (env.NODE_ENV !== 'production') {
        response.otp = otp;
    }

    return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify email with OTP
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyEmail(otp, email) {
    const normalizedEmail = email.toLowerCase().trim();

    // Look up the user first
    const user = await User.findOne({ email: normalizedEmail });

    // Use a generic error message — we don't want to reveal whether an email
    // is registered or not (prevents user enumeration attacks).
    if (!user) {
        throw new AppError('Invalid or expired OTP. Please request a new one.', 400, 'INVALID_OTP');
    }

    // If they're already verified, treat it as success (idempotent).
    // This handles the case where someone clicks "verify" twice.
    if (user.emailVerified) {
        return true;
    }

    // Check the OTP stored in Redis against what the user submitted
    const redis = getRedisClient();
    const storedOtp = await redis.get(REDIS_KEY.emailOtp(user._id));

    if (!storedOtp || storedOtp !== otp) {
        throw new AppError('Invalid or expired OTP. Please request a new one.', 400, 'INVALID_OTP');
    }

    // Mark account as verified and consume the OTP in one go.
    // We save first — if Redis delete fails it's not a security risk
    // (the OTP will just expire naturally after 10 minutes).
    user.emailVerified = true;
    await user.save();
    await redis.del(REDIS_KEY.emailOtp(user._id));

    logger.info({ userId: user._id }, 'Email verified via OTP');
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resend OTP
// ─────────────────────────────────────────────────────────────────────────────
export async function resendVerificationEmail(email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Return silently for unknown or already-verified emails.
    // The controller always sends the same success message, so callers
    // cannot tell whether this email exists (prevents enumeration).
    if (!user || user.emailVerified) return;

    // Issuing a new OTP overwrites the old one in Redis — the old code is dead.
    const otp = await _issueEmailOtp(user._id);
    emailService.sendOtpEmail(user.email, otp).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to resend OTP email');
    });

    logger.info({ userId: user._id }, 'OTP resent');
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────
export async function loginUser({ email, password }) {
    const redis = getRedisClient();
    const normalizedEmail = email.toLowerCase().trim();

    const lockKey = REDIS_KEY.loginLock(normalizedEmail);
    const failKey = REDIS_KEY.loginFail(normalizedEmail);
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

    // Check the lockout status *before* hitting the DB.
    // This prevents attackers from generating DB load during a lockout.
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

    // Fetch user with password (password is hidden by default via select: false)
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    const credentialsValid = user && (await user.comparePassword(password));

    if (!credentialsValid) {
        // Atomically increment failure counter and refresh its expiry window.
        // We use a pipeline so both commands go to Redis in one round-trip.
        const pipeline = redis.pipeline();
        pipeline.incr(failKey);
        pipeline.expire(failKey, LOCKOUT_SECONDS);
        const [[, failures]] = await pipeline.exec();

        // Lock the account once failures hit the threshold
        if (failures >= MAX_ATTEMPTS) {
            await redis.pipeline()
                .set(lockKey, '1', 'EX', LOCKOUT_SECONDS)
                .del(failKey)
                .exec();
            logger.warn({ email: normalizedEmail }, 'Account locked — too many failed login attempts');
            throw new AppError(
                'Too many failed attempts. Account locked for 15 minutes.',
                429,
                'ACCOUNT_LOCKED'
            );
        }

        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Verified check comes *after* credential check on purpose:
    // we don't reveal whether an account exists to someone who can't log in.
    if (!user.emailVerified) {
        throw new AppError(
            'Please verify your email before logging in. Check your inbox for the OTP.',
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

    // Successful login — wipe any leftover lock/fail keys
    await redis.pipeline().del(failKey).del(lockKey).exec();

    // Sign both tokens
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const access = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const refresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    // Record last login time (non-blocking save)
    user.lastLoginAt = new Date();
    await user.save();

    return { accessToken: access.token, refreshToken: refresh.token, user };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh access token (token rotation)
// ─────────────────────────────────────────────────────────────────────────────
export async function refreshAccessToken(refreshTokenStr) {
    if (!refreshTokenStr) {
        throw new AppError('Refresh token not provided. Please log in again.', 401, 'UNAUTHORIZED');
    }

    // Verify the JWT signature and expiry
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

    // SET NX (only set if the key doesn't already exist) is atomic.
    // The first request wins; any duplicate request is rejected as a replay.
    // This protects against token theft in multi-device or network-split scenarios.
    const consumed = await redis.set(REDIS_KEY.blacklist(decoded.jti), '1', 'EX', ttl, 'NX');
    if (!consumed) {
        logger.warn({ jti: decoded.jti, userId: decoded.userId }, 'Refresh token replay — possible token theft');
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

    // Issue a fresh pair of tokens
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const newAccess = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const newRefresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    return { accessToken: newAccess.token, refreshToken: newRefresh.token };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────
export async function logoutUser(jti, exp, refreshTokenStr) {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    // Blacklist the access token so it stops working immediately,
    // even though it hasn't expired yet. TTL matches the token's remaining life.
    const accessTTL = getRemainingTTL(exp);
    if (accessTTL > 0) {
        pipeline.set(REDIS_KEY.blacklist(jti), '1', 'EX', accessTTL);
    }

    // Also blacklist the refresh token so the cookie can't mint a new access token
    if (refreshTokenStr) {
        try {
            const decoded = verifyJwt(refreshTokenStr, env.JWT_REFRESH_SECRET);
            const refreshTTL = getRemainingTTL(decoded.exp);
            if (refreshTTL > 0) {
                pipeline.set(REDIS_KEY.blacklist(decoded.jti), '1', 'EX', refreshTTL);
            }
        } catch {
            // Token is already expired or was tampered with — nothing to blacklist
            logger.debug('Refresh token invalid at logout; skipping blacklist');
        }
    }

    await pipeline.exec();
}

// ─────────────────────────────────────────────────────────────────────────────
// Forgot password
// ─────────────────────────────────────────────────────────────────────────────
export async function forgotPassword(email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Silent return — never reveal whether this email is in our system
    if (!user) return;

    const resetToken = await _issuePasswordResetToken(user._id);

    emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send password reset email');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset password
// ─────────────────────────────────────────────────────────────────────────────
export async function resetPassword(token, newPassword) {
    const redis = getRedisClient();
    const userId = await redis.get(REDIS_KEY.pwReset(token));

    if (!userId) {
        throw new AppError(
            'Invalid or expired password reset link. Please request a new one.',
            400,
            'INVALID_TOKEN'
        );
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
        // Stale Redis entry pointing to a deleted user — clean up and reject
        await redis.del(REDIS_KEY.pwReset(token));
        throw new AppError('Invalid or expired password reset link.', 400, 'INVALID_TOKEN');
    }

    // Prevent users from "resetting" to their current password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw new AppError(
            'New password must be different from your current password.',
            400,
            'PASSWORD_REUSE'
        );
    }

    // Save new password (the pre-save hook in User.model.js hashes it)
    user.password = newPassword;
    await user.save();

    // Consume the token — it cannot be used again
    await redis.del(REDIS_KEY.pwReset(token));
    logger.info({ userId }, 'Password reset successfully');
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Change password (while logged in)
// ─────────────────────────────────────────────────────────────────────────────
export async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
        throw new AppError('User not found.', 404, 'NOT_FOUND');
    }

    // Confirm the user knows their current password before allowing a change
    const currentIsValid = await user.comparePassword(currentPassword);
    if (!currentIsValid) {
        throw new AppError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
    }

    // Prevent re-using the same password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw new AppError(
            'New password must be different from your current password.',
            400,
            'PASSWORD_REUSE'
        );
    }

    // The pre-save hook hashes the new password automatically
    user.password = newPassword;
    await user.save();

    logger.info({ userId, email: user.email }, 'Password changed successfully');
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers (not exported — only used inside this file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a 6-digit OTP, saves it to Redis under emailOtp:{userId},
 * and returns the OTP string.
 *
 * Because the key is {userId} (not the OTP itself), calling this a second time
 * for the same user automatically overwrites the old OTP — there's never more
 * than one valid OTP per user at any given time.
 */
async function _issueEmailOtp(userId) {
    const otp = generateOtp();
    const redis = getRedisClient();

    await redis.set(
        REDIS_KEY.emailOtp(userId.toString()),
        otp,
        'EX',
        env.OTP_EXPIRY  // 10 minutes, defined in .env and validated in env.js
    );

    return otp;
}

/**
 * Creates a secure random hex token for password reset, stores it in Redis
 * under pwReset:{token}, and returns the token.
 *
 * The token itself is the Redis key suffix — GET returns the userId.
 * The token expires after PASSWORD_RESET_EXPIRY seconds (default: 1 hour).
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