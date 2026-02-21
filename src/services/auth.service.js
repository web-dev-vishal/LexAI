/**
 * Auth Service
 *
 * Core authentication business logic:
 *   - Registration with email verification
 *   - Login with token issuance
 *   - Refresh token rotation (single-use)
 *   - Token blacklisting on logout
 *   - Password reset flow
 */

const User = require('../models/User.model');
const { getRedisClient } = require('../config/redis');
const { signAccessToken, signRefreshToken, verifyToken, getRemainingTTL } = require('../utils/tokenHelper');
const { generateSecureToken } = require('../utils/hashHelper');
const emailService = require('./email.service');
const logger = require('../utils/logger');

/**
 * Register a new user.
 * Creates the user, generates an email verification token, and sends the verification email.
 */
async function registerUser({ name, email, password }) {
    // Check if email is already taken
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        const error = new Error('An account with this email already exists.');
        error.statusCode = 409;
        error.code = 'DUPLICATE_EMAIL';
        throw error;
    }

    // Generate email verification token
    const emailVerifyToken = generateSecureToken();

    const user = await User.create({
        name,
        email,
        password,
        emailVerifyToken,
        emailVerified: false,
    });

    // Send verification email (non-blocking — don't fail registration if email fails)
    emailService.sendVerificationEmail(user.email, emailVerifyToken).catch((err) => {
        logger.error('Failed to send verification email:', err.message);
    });

    return { userId: user._id, email: user.email };
}

/**
 * Verify a user's email address using the verification token.
 */
async function verifyEmail(token) {
    const user = await User.findOne({ emailVerifyToken: token }).select('+emailVerifyToken');

    if (!user) {
        const error = new Error('Invalid or expired verification token.');
        error.statusCode = 400;
        error.code = 'INVALID_TOKEN';
        throw error;
    }

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    await user.save();

    return true;
}

/**
 * Authenticate a user and issue access + refresh tokens.
 * Returns accessToken in body, sets refreshToken as HttpOnly cookie.
 */
async function loginUser({ email, password }) {
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
        const error = new Error('Invalid email or password.');
        error.statusCode = 401;
        error.code = 'INVALID_CREDENTIALS';
        throw error;
    }

    if (!user.emailVerified) {
        const error = new Error('Please verify your email before logging in.');
        error.statusCode = 403;
        error.code = 'EMAIL_NOT_VERIFIED';
        throw error;
    }

    if (!user.isActive) {
        const error = new Error('Your account has been deactivated.');
        error.statusCode = 403;
        error.code = 'ACCOUNT_DEACTIVATED';
        throw error;
    }

    // Issue tokens
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const access = signAccessToken(accessPayload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRY);
    const refresh = signRefreshToken({ userId: user._id }, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRY);

    // Update last login
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
 */
async function refreshAccessToken(refreshTokenStr) {
    const decoded = verifyToken(refreshTokenStr, process.env.JWT_REFRESH_SECRET);
    const redis = getRedisClient();

    // Check if this refresh token was already used (token rotation enforcement)
    const isUsed = await redis.exists(`blacklist:${decoded.jti}`);
    if (isUsed) {
        const error = new Error('Refresh token has already been used. This may indicate token theft. Please log in again.');
        error.statusCode = 401;
        error.code = 'TOKEN_ROTATED';
        throw error;
    }

    // Blacklist the incoming refresh token (mark as used)
    const ttl = getRemainingTTL(decoded.exp);
    await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttl);

    // Fetch user to get current org and role
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
        const error = new Error('User not found or account deactivated.');
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        throw error;
    }

    // Issue new tokens
    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const newAccess = signAccessToken(accessPayload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRY);
    const newRefresh = signRefreshToken({ userId: user._id }, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRY);

    return { accessToken: newAccess.token, refreshToken: newRefresh.token };
}

/**
 * Logout — blacklist the current access token.
 */
async function logoutUser(jti, exp) {
    const redis = getRedisClient();
    const ttl = getRemainingTTL(exp);
    await redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
}

/**
 * Forgot password — generate a time-limited reset token and email it.
 */
async function forgotPassword(email) {
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) return;

    const resetToken = generateSecureToken();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = resetExpiry;
    await user.save();

    await emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
        logger.error('Failed to send password reset email:', err.message);
    });
}

/**
 * Reset password using a valid reset token.
 */
async function resetPassword(token, newPassword) {
    const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpiry: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpiry');

    if (!user) {
        const error = new Error('Invalid or expired password reset token.');
        error.statusCode = 400;
        error.code = 'INVALID_TOKEN';
        throw error;
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    return true;
}

module.exports = {
    registerUser,
    verifyEmail,
    loginUser,
    refreshAccessToken,
    logoutUser,
    forgotPassword,
    resetPassword,
};
