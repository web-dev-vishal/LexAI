/**
 * Auth Service
 *
 * Core authentication business logic:
 *   - Registration with email verification
 *   - Login with JWT token issuance (access + refresh)
 *   - Refresh token rotation (single-use, prevents replay attacks)
 *   - Token blacklisting on logout
 *   - Forgot/reset password flow
 *
 * Security design:
 *   - Refresh tokens are single-use: each use invalidates the previous token
 *   - If a used refresh token is replayed, it may indicate token theft
 *   - Token blacklist is stored in Redis with TTL matching token expiry
 *   - Email enumeration is prevented in forgot-password (always returns success)
 */

import env from '../config/env.js';
import User from '../models/User.model.js';
import { getRedisClient } from '../config/redis.js';
import { signAccessToken, signRefreshToken, verifyToken, getRemainingTTL } from '../utils/tokenHelper.js';
import { generateSecureToken } from '../utils/hashHelper.js';
import * as emailService from './email.service.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

/**
 * Register a new user.
 * Creates the user, generates an email verification token, and sends
 * the verification email (non-blocking — registration succeeds even if email fails).
 */
export async function registerUser({ name, email, password }) {
    // Check if email is already taken — throw 409 Conflict if so
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new AppError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    // Generate a secure random token for email verification
    const emailVerifyToken = generateSecureToken();

    const user = await User.create({
        name,
        email,
        password, // Mongoose pre save hook will hash this before writing to DB
        emailVerifyToken,
        emailVerified: false,
    });

    // Send verification email fire and forget so registration isn't blocked
    emailService.sendVerificationEmail(user.email, emailVerifyToken).catch((err) => {
        logger.error('Failed to send verification email:', err.message);
    });

    return { userId: user._id, email: user.email };
}

/**
 * Verify a user's email address using the token from the verification email.
 */
export async function verifyEmail(token) {
    // Need +emailVerifyToken since it has select: false in the schema
    const user = await User.findOne({ emailVerifyToken: token }).select('+emailVerifyToken');

    if (!user) {
        throw new AppError('Invalid or expired verification token.', 400, 'INVALID_TOKEN');
    }

    // Mark as verified and clear the token so it can't be reused
    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    await user.save();

    return true;
}

/**
 * Authenticate a user and issue access + refresh tokens.
 * Performs three checks: credentials, email verified, account active.
 */
export async function loginUser({ email, password }) {
    const redis = getRedisClient();
    const lockoutKey = `login:lockout:${email.toLowerCase()}`;
    const failKey = `login:fail:${email.toLowerCase()}`;
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_SECONDS = 900; // 15 minutes

    // Check if account is currently locked out
    const isLocked = await redis.exists(lockoutKey);
    if (isLocked) {
        const ttl = await redis.ttl(lockoutKey);
        throw new AppError(
            `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
            429,
            'ACCOUNT_LOCKED'
        );
    }

    // Explicitly select password since it has select: false in the schema
    const user = await User.findOne({ email }).select('+password');

    // Intentionally vague error message — don't reveal whether email exists
    if (!user || !(await user.comparePassword(password))) {
        // Increment failed attempt counter
        const failures = await redis.incr(failKey);
        await redis.expire(failKey, LOCKOUT_SECONDS);

        if (failures >= MAX_ATTEMPTS) {
            // Lock the account and clear the counter
            await redis.set(lockoutKey, '1', 'EX', LOCKOUT_SECONDS);
            await redis.del(failKey);
            logger.warn(`Account locked after ${MAX_ATTEMPTS} failed login attempts: ${email}`);
            throw new AppError(
                'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
                429,
                'ACCOUNT_LOCKED'
            );
        }

        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.emailVerified) {
        throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
    }

    if (!user.isActive) {
        throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Clear failed attempt counter on successful login
    await redis.del(failKey);
    await redis.del(lockoutKey);

    // Issue tokens — access token contains org/role for auth checks without DB hits
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const access = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const refresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    // Track last login for admin dashboards
    user.lastLoginAt = new Date();
    await user.save();

    return { accessToken: access.token, refreshToken: refresh.token, user };
}

/**
 * Refresh token rotation.
 *
 * Each refresh token can only be used ONCE:
 *   1. Verify the incoming refresh token
 *   2. Check if the token's JTI is blacklisted (already used)
 *   3. Blacklist the incoming token immediately
 *   4. Issue a new access token + new refresh token
 *
 * If a blacklisted token is replayed, it may indicate token theft.
 */
export async function refreshAccessToken(refreshTokenStr) {
    const decoded = verifyToken(refreshTokenStr, env.JWT_REFRESH_SECRET);
    const redis = getRedisClient();

    // Check if this refresh token was already used (token rotation enforcement)
    const isUsed = await redis.exists(`blacklist:${decoded.jti}`);
    if (isUsed) {
        throw new AppError(
            'Refresh token has already been used. This may indicate token theft. Please log in again.',
            401,
            'TOKEN_ROTATED'
        );
    }

    // Blacklist the incoming refresh token (mark as used) with TTL matching its expiry
    const ttl = getRemainingTTL(decoded.exp);
    await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttl);

    // Fetch fresh user data so role/org changes take effect immediately
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
        throw new AppError('User not found or account deactivated.', 401, 'UNAUTHORIZED');
    }

    // Issue brand new token pair
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const newAccess = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const newRefresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    return { accessToken: newAccess.token, refreshToken: newRefresh.token };
}

/**
 * Logout — blacklist the current access token's JTI so it can't be reused.
 * The blacklist entry expires when the token would have expired naturally.
 */
export async function logoutUser(jti, exp) {
    const redis = getRedisClient();
    const ttl = getRemainingTTL(exp);
    await redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
}

/**
 * Forgot password — generate a time-limited reset token and email it.
 * Always returns void (no error) to prevent email enumeration attacks.
 */
export async function forgotPassword(email) {
    const user = await User.findOne({ email });

    // Silent return — don't reveal whether the email exists in our system
    if (!user) return;

    const resetToken = generateSecureToken();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = resetExpiry;
    await user.save();

    // Fire-and-forget — don't fail the request if email delivery fails
    emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
        logger.error('Failed to send password reset email:', err.message);
    });
}

/**
 * Reset password using a valid reset token.
 * The token must not be expired and must match a user in the database.
 */
export async function resetPassword(token, newPassword) {
    const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpiry: { $gt: new Date() }, // Token must not be expired
    }).select('+passwordResetToken +passwordResetExpiry');

    if (!user) {
        throw new AppError('Invalid or expired password reset token.', 400, 'INVALID_TOKEN');
    }

    // Update password (pre-save hook will hash it) and clear reset fields
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    return true;
}
