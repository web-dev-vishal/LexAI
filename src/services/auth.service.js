// /**
//  * Auth Service
//  *
//  * Core authentication business logic:
//  *   - Registration with email verification
//  *   - Login with JWT token issuance (access + refresh)
//  *   - Refresh token rotation (single-use, prevents replay attacks)
//  *   - Token blacklisting on logout
//  *   - Forgot/reset password flow
//  *
//  * Security design:
//  *   - Refresh tokens are single-use: each use invalidates the previous token
//  *   - If a used refresh token is replayed, it may indicate token theft
//  *   - Token blacklist is stored in Redis with TTL matching token expiry
//  *   - Email enumeration is prevented in forgot-password (always returns success)
//  */

// import env from '../config/env.js';
// import User from '../models/User.model.js';
// import { getRedisClient } from '../config/redis.js';
// import { signAccessToken, signRefreshToken, verifyToken, getRemainingTTL } from '../utils/tokenHelper.js';
// import { generateSecureToken } from '../utils/hashHelper.js';
// import * as emailService from './email.service.js';
// import logger from '../utils/logger.js';
// import AppError from '../utils/AppError.js';

// /**
//  * Register a new user.
//  * Creates the user, generates an email verification token, and sends
//  * the verification email (non-blocking — registration succeeds even if email fails).
//  */
// export async function registerUser({ name, email, password }) {
//     // Check if email is already taken — throw 409 Conflict if so
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//         throw new AppError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
//     }

//     // Generate a secure random token for email verification
//     const emailVerifyToken = generateSecureToken();

//     const user = await User.create({
//         name,
//         email,
//         password, // Mongoose pre save hook will hash this before writing to DB
//         emailVerified: false,
//     });

//     // Store token in Redis (token -> userId) and also keep reverse lookup (userId -> token)
//     const redis = getRedisClient();
//     await redis.set(`emailVerify:${emailVerifyToken}`, user._id.toString(), 'EX', env.EMAIL_VERIFICATION_EXPIRY);
//     await redis.set(`emailVerifyUser:${user._id.toString()}`, emailVerifyToken, 'EX', env.EMAIL_VERIFICATION_EXPIRY);

//     // Send verification email fire and forget so registration isn't blocked
//     emailService.sendVerificationEmail(user.email, emailVerifyToken).catch((err) => {
//         logger.error('Failed to send verification email:', err.message);
//     });

//     return { 
//         userId: user._id, 
//         email: user.email,
//         verificationToken: emailVerifyToken,  // Returned for dev/testing purposes
//     };
// }

// /**
//  * Verify a user's email address using the token from the verification email.
//  */
// export async function verifyEmail(token) {
//     const redis = getRedisClient();

//     // look up the token in Redis
//     const userId = await redis.get(`emailVerify:${token}`);
//     if (!userId) {
//         throw new AppError('Invalid or expired verification token.', 400, 'INVALID_TOKEN');
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//         // should not really happen, but handle gracefully
//         await redis.del(`emailVerify:${token}`);
//         await redis.del(`emailVerifyUser:${userId}`);
//         throw new AppError('User associated with token not found.', 400, 'INVALID_TOKEN');
//     }

//     // Mark user as verified (if not already)
//     user.emailVerified = true;
//     await user.save();

//     // cleanup Redis keys
//     await redis.del(`emailVerify:${token}`, `emailVerifyUser:${userId}`);

//     return true;
// }

// /**
//  * Authenticate a user and issue access + refresh tokens.
//  * Performs three checks: credentials, email verified, account active.
//  */
// export async function loginUser({ email, password }) {
//     const redis = getRedisClient();
//     const lockoutKey = `login:lockout:${email.toLowerCase()}`;
//     const failKey = `login:fail:${email.toLowerCase()}`;
//     const MAX_ATTEMPTS = 5;
//     const LOCKOUT_SECONDS = 900; // 15 minutes

//     // Check if account is currently locked out
//     const isLocked = await redis.exists(lockoutKey);
//     if (isLocked) {
//         const ttl = await redis.ttl(lockoutKey);
//         throw new AppError(
//             `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
//             429,
//             'ACCOUNT_LOCKED'
//         );
//     }

//     // Explicitly select password since it has select: false in the schema
//     const user = await User.findOne({ email }).select('+password');

//     // Intentionally vague error message — don't reveal whether email exists
//     if (!user || !(await user.comparePassword(password))) {
//         // Increment failed attempt counter
//         const failures = await redis.incr(failKey);
//         await redis.expire(failKey, LOCKOUT_SECONDS);

//         if (failures >= MAX_ATTEMPTS) {
//             // Lock the account and clear the counter
//             await redis.set(lockoutKey, '1', 'EX', LOCKOUT_SECONDS);
//             await redis.del(failKey);
//             logger.warn(`Account locked after ${MAX_ATTEMPTS} failed login attempts: ${email}`);
//             throw new AppError(
//                 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
//                 429,
//                 'ACCOUNT_LOCKED'
//             );
//         }

//         throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
//     }

//     if (!user.emailVerified) {
//         throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
//     }

//     if (!user.isActive) {
//         throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
//     }

//     // Clear failed attempt counter on successful login
//     await redis.del(failKey);
//     await redis.del(lockoutKey);

//     // Issue tokens — access token contains org/role for auth checks without DB hits
//     const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
//     const access = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
//     const refresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

//     // Track last login for admin dashboards
//     user.lastLoginAt = new Date();
//     await user.save();

//     return { accessToken: access.token, refreshToken: refresh.token, user };
// }

// /**
//  * Refresh token rotation.
//  *
//  * Each refresh token can only be used ONCE:
//  *   1. Verify the incoming refresh token
//  *   2. Check if the token's JTI is blacklisted (already used)
//  *   3. Blacklist the incoming token immediately
//  *   4. Issue a new access token + new refresh token
//  *
//  * If a blacklisted token is replayed, it may indicate token theft.
//  */
// export async function refreshAccessToken(refreshTokenStr) {
//     const decoded = verifyToken(refreshTokenStr, env.JWT_REFRESH_SECRET);
//     const redis = getRedisClient();

//     // Check if this refresh token was already used (token rotation enforcement)
//     const isUsed = await redis.exists(`blacklist:${decoded.jti}`);
//     if (isUsed) {
//         throw new AppError(
//             'Refresh token has already been used. This may indicate token theft. Please log in again.',
//             401,
//             'TOKEN_ROTATED'
//         );
//     }

//     // Blacklist the incoming refresh token (mark as used) with TTL matching its expiry
//     const ttl = getRemainingTTL(decoded.exp);
//     await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttl);

//     // Fetch fresh user data so role/org changes take effect immediately
//     const user = await User.findById(decoded.userId);
//     if (!user || !user.isActive) {
//         throw new AppError('User not found or account deactivated.', 401, 'UNAUTHORIZED');
//     }

//     // Issue brand new token pair
//     const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
//     const newAccess = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
//     const newRefresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

//     return { accessToken: newAccess.token, refreshToken: newRefresh.token };
// }

// /**
//  * Logout — blacklist the current access token's JTI so it can't be reused.
//  * The blacklist entry expires when the token would have expired naturally.
//  */
// export async function logoutUser(jti, exp) {
//     const redis = getRedisClient();
//     const ttl = getRemainingTTL(exp);
//     await redis.set(`blacklist:${jti}`, '1', 'EX', ttl);
// }

// /**
//  * Forgot password — generate a time-limited reset token and email it.
//  * Always returns void (no error) to prevent email enumeration attacks.
//  */
// export async function forgotPassword(email) {
//     const user = await User.findOne({ email });

//     // Silent return — don't reveal whether the email exists in our system
//     if (!user) return;

//     const resetToken = generateSecureToken();
//     const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

//     user.passwordResetToken = resetToken;
//     user.passwordResetExpiry = resetExpiry;
//     await user.save();

//     // Fire-and-forget — don't fail the request if email delivery fails
//     emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
//         logger.error('Failed to send password reset email:', err.message);
//     });
// }

// /**
//  * Reset password using a valid reset token.
//  * The token must not be expired and must match a user in the database.
//  */
// export async function resetPassword(token, newPassword) {
//     const user = await User.findOne({
//         passwordResetToken: token,
//         passwordResetExpiry: { $gt: new Date() }, // Token must not be expired
//     }).select('+passwordResetToken +passwordResetExpiry');

//     if (!user) {
//         throw new AppError('Invalid or expired password reset token.', 400, 'INVALID_TOKEN');
//     }

//     // Update password (pre-save hook will hash it) and clear reset fields
//     user.password = newPassword;
//     user.passwordResetToken = undefined;
//     user.passwordResetExpiry = undefined;
//     await user.save();

//     return true;
// }

// /**
//  * Change password for an authenticated user.
//  * Requires the user to provide their current password to verify identity.
//  * This is different from password reset — it's done by the logged-in user.
//  */
// export async function changePassword(userId, currentPassword, newPassword) {
//     const user = await User.findById(userId).select('+password');

//     if (!user) {
//         throw new AppError('User not found.', 404, 'NOT_FOUND');
//     }

//     // Verify the current password matches
//     const isValid = await user.comparePassword(currentPassword);
//     if (!isValid) {
//         throw new AppError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
//     }

//     // Update to new password (pre-save hook will hash it)
//     user.password = newPassword;
//     await user.save();

//     logger.info(`Password changed for user: ${user.email}`);
//     return true;
// }

// /**
//  * Resend email verification token.
//  * Used when the original verification email was lost or the token expired.
//  * Only works if the user exists and hasn't already verified their email.
//  */
// export async function resendVerificationEmail(email) {
//     const user = await User.findOne({ email });

//     // Silent return — don't reveal whether the email exists
//     if (!user) return;

//     // Don't resend if already verified
//     if (user.emailVerified) {
//         logger.debug(`Verification email requested for already-verified user: ${email}`);
//         return;
//     }

//     const redis = getRedisClient();
//     // remove any existing token for this user to avoid multiple valid tokens
//     const existing = await redis.get(`emailVerifyUser:${user._id.toString()}`);
//     if (existing) {
//         await redis.del(`emailVerify:${existing}`);
//     }

//     // Generate a new verification token
//     const emailVerifyToken = generateSecureToken();
//     await redis.set(`emailVerify:${emailVerifyToken}`, user._id.toString(), 'EX', env.EMAIL_VERIFICATION_EXPIRY);
//     await redis.set(`emailVerifyUser:${user._id.toString()}`, emailVerifyToken, 'EX', env.EMAIL_VERIFICATION_EXPIRY);

//     // Fire-and-forget — don't fail the request if email delivery fails
//     emailService.sendVerificationEmail(user.email, emailVerifyToken).catch((err) => {
//         logger.error('Failed to send verification email:', err.message);
//     });

//     logger.info(`Verification email resent to: ${email}`);
// }


/**
 * Auth Service
 *
 * Email verification strategy:
 *   We sign a short-lived JWT (email verify token) and store its JTI in Redis
 *   against the userId. When the user clicks the link, we verify the JWT
 *   signature first, then confirm the JTI is still live in Redis — that second
 *   check is what lets us invalidate tokens early (e.g. on resend) and ensures
 *   single-use. No hashing layer, no dual keys, just straightforward logic.
 *
 * Password reset uses the same pattern: sign a JWT, store JTI in Redis.
 * Verifying = check signature + check Redis. Consuming = delete from Redis.
 *
 * Refresh token rotation is atomic via SET NX — only one request can consume
 * a given JTI, preventing race conditions on simultaneous refresh calls.
 */

import env from '../config/env.js';
import User from '../models/User.model.js';
import { getRedisClient } from '../config/redis.js';
import {
    signAccessToken,
    signRefreshToken,
    signEmailVerifyToken,
    signPasswordResetToken,
    verifyToken as verifyJwt,
    getRemainingTTL,
} from '../utils/tokenHelper.js';
import * as emailService from './email.service.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

// ---------------------------------------------------------------------------
// Redis key namespaces — one place to change if we ever need to rename
// ---------------------------------------------------------------------------

const REDIS_KEY = {
    emailVerify:     (jti)    => `emailVerify:${jti}`,
    emailVerifyUser: (userId) => `emailVerifyUser:${userId}`,
    pwReset:         (jti)    => `pwReset:${jti}`,
    pwResetUser:     (userId) => `pwResetUser:${userId}`,
    loginFail:       (email)  => `login:fail:${email}`,
    loginLock:       (email)  => `login:lockout:${email}`,
    blacklist:       (jti)    => `blacklist:${jti}`,
};

// ---------------------------------------------------------------------------
// Cookie options — single source of truth, used by controller for set + clear
// ---------------------------------------------------------------------------

export function buildRefreshCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: env.JWT_REFRESH_COOKIE_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth', // scoped — cookie only travels to auth endpoints
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
        password, // pre-save hook hashes this
        emailVerified: false,
    });

    const rawVerifyToken = await _issueAndSendVerificationToken(user);

    const result = { userId: user._id, email: user.email };

    // Expose the raw token outside production so devs can test without an inbox
    if (process.env.NODE_ENV !== 'production') {
        result.verificationToken = rawVerifyToken;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(token) {
    // Step 1 — verify the JWT signature and expiry.
    // If someone tampered with the token or it expired, this throws immediately.
    let decoded;
    try {
        decoded = verifyJwt(token, env.JWT_EMAIL_VERIFY_SECRET);
    } catch {
        throw new AppError('Invalid or expired verification link.', 400, 'INVALID_TOKEN');
    }

    const redis = getRedisClient();

    // Step 2 — check Redis to confirm this JTI is still valid.
    // The key is deleted after first use and also when a resend replaces it,
    // so this is what makes the link truly single-use.
    const userId = await redis.get(REDIS_KEY.emailVerify(decoded.jti));
    if (!userId) {
        throw new AppError(
            'This verification link has already been used or has expired. Request a new one.',
            400,
            'INVALID_TOKEN'
        );
    }

    const user = await User.findById(userId);
    if (!user) {
        // Stale Redis entry — clean up and bail
        await redis.del(REDIS_KEY.emailVerify(decoded.jti));
        throw new AppError('Invalid or expired verification link.', 400, 'INVALID_TOKEN');
    }

    if (!user.emailVerified) {
        user.emailVerified = true;
        await user.save();
    }

    // Step 3 — consume the token. Delete both the JTI key and the user pointer.
    await redis.pipeline()
        .del(REDIS_KEY.emailVerify(decoded.jti))
        .del(REDIS_KEY.emailVerifyUser(userId))
        .exec();

    return true;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginUser({ email, password }) {
    const redis = getRedisClient();
    const normalizedEmail = email.toLowerCase();
    const lockKey = REDIS_KEY.loginLock(normalizedEmail);
    const failKey = REDIS_KEY.loginFail(normalizedEmail);
    const MAX_ATTEMPTS    = 5;
    const LOCKOUT_SECONDS = 900; // 15 minutes

    // Check lockout before touching the DB at all
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
        // Increment the failure counter atomically — two concurrent bad logins
        // both count and neither slips past the threshold check
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

    if (user.isActive === false) {
        throw new AppError('Your account has been deactivated. Please contact support.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Successful login — wipe any leftover lockout/failure state
    await redis.pipeline().del(failKey).del(lockKey).exec();

    const accessPayload = { userId: user._id, orgId: user.organization, role: user.role };
    const access  = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
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
        throw new AppError('Refresh token not found. Please log in again.', 401, 'UNAUTHORIZED');
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

    // SET NX is atomic. If two requests come in simultaneously with the same
    // token, exactly one gets the key set (returns 1) and the other finds it
    // already set (returns null). No race condition possible.
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
    const newAccess  = signAccessToken(accessPayload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRY);
    const newRefresh = signRefreshToken({ userId: user._id }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRY);

    return { accessToken: newAccess.token, refreshToken: newRefresh.token };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logoutUser(jti, exp, refreshTokenStr) {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    const accessTTL = getRemainingTTL(exp);
    if (accessTTL > 0) {
        pipeline.set(REDIS_KEY.blacklist(jti), '1', 'EX', accessTTL);
    }

    // Also kill the refresh token so the cookie can't be used to get a new access token
    if (refreshTokenStr) {
        try {
            const decoded = verifyJwt(refreshTokenStr, env.JWT_REFRESH_SECRET);
            const refreshTTL = getRemainingTTL(decoded.exp);
            if (refreshTTL > 0) {
                pipeline.set(REDIS_KEY.blacklist(decoded.jti), '1', 'EX', refreshTTL);
            }
        } catch {
            // Refresh token already expired or tampered — nothing to blacklist, that's fine
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
    if (!user) return; // Silent — don't reveal whether the email is registered

    await _issueAndSendPasswordResetToken(user);
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export async function resetPassword(token, newPassword) {
    // Step 1 — verify JWT signature
    let decoded;
    try {
        decoded = verifyJwt(token, env.JWT_PASSWORD_RESET_SECRET);
    } catch {
        throw new AppError('Invalid or expired password reset link.', 400, 'INVALID_TOKEN');
    }

    const redis = getRedisClient();

    // Step 2 — check the JTI is still in Redis (single-use + early invalidation)
    const userId = await redis.get(REDIS_KEY.pwReset(decoded.jti));
    if (!userId) {
        throw new AppError(
            'This password reset link has already been used or has expired.',
            400,
            'INVALID_TOKEN'
        );
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
        await redis.del(REDIS_KEY.pwReset(decoded.jti));
        throw new AppError('Invalid or expired password reset link.', 400, 'INVALID_TOKEN');
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw new AppError('New password must be different from your current password.', 400, 'PASSWORD_REUSE');
    }

    // Step 3 — set new password and consume the token
    user.password = newPassword; // pre-save hook hashes
    await user.save();

    await redis.pipeline()
        .del(REDIS_KEY.pwReset(decoded.jti))
        .del(REDIS_KEY.pwResetUser(userId))
        .exec();

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
        throw new AppError('New password must be different from your current password.', 400, 'PASSWORD_REUSE');
    }

    user.password = newPassword; // pre-save hook hashes
    await user.save();

    logger.info({ userId, email: user.email }, 'Password changed successfully');
    return true;
}

// ---------------------------------------------------------------------------
// Resend verification email
// ---------------------------------------------------------------------------

export async function resendVerificationEmail(email) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return; // Silent — enumeration prevention

    if (user.emailVerified) return; // Silent — don't leak verified/unverified state

    await _issueAndSendVerificationToken(user);
    logger.info({ userId: user._id }, 'Verification email resent');
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Signs a new email verification JWT, writes its JTI to Redis, and fires the
 * verification email. If the user already has an outstanding token we delete
 * it first so only the latest link ever works.
 *
 * Returns the raw JWT string (used by registerUser for dev exposure).
 */
async function _issueAndSendVerificationToken(user) {
    const ttl = env.EMAIL_VERIFICATION_EXPIRY ?? 86400; // seconds, default 24 h

    const jwt = signEmailVerifyToken(
        { userId: user._id },
        env.JWT_EMAIL_VERIFY_SECRET,
        ttl
    );

    const redis = getRedisClient();
    const pointerKey = REDIS_KEY.emailVerifyUser(user._id);

    // If there's already a pending token for this user, invalidate it so old
    // links in the user's inbox stop working the moment a new one is sent
    const prevJti = await redis.get(pointerKey);
    if (prevJti) {
        await redis.del(REDIS_KEY.emailVerify(prevJti));
    }

    // Store JTI → userId (for verification lookup) and userId → JTI (for invalidation on resend)
    await redis.pipeline()
        .set(REDIS_KEY.emailVerify(jwt.jti), user._id.toString(), 'EX', ttl)
        .set(pointerKey, jwt.jti, 'EX', ttl)
        .exec();

    emailService.sendVerificationEmail(user.email, jwt.token).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send verification email');
    });

    return jwt.token;
}

/**
 * Signs a new password reset JWT, writes its JTI to Redis, and fires the
 * reset email. Any previous outstanding reset token for this user is
 * invalidated so only the most recently requested link works.
 */
async function _issueAndSendPasswordResetToken(user) {
    const ttl = 3600; // 1 hour

    const jwt = signPasswordResetToken(
        { userId: user._id },
        env.JWT_PASSWORD_RESET_SECRET,
        ttl
    );

    const redis = getRedisClient();
    const pointerKey = REDIS_KEY.pwResetUser(user._id);

    const prevJti = await redis.get(pointerKey);
    if (prevJti) {
        await redis.del(REDIS_KEY.pwReset(prevJti));
    }

    await redis.pipeline()
        .set(REDIS_KEY.pwReset(jwt.jti), user._id.toString(), 'EX', ttl)
        .set(pointerKey, jwt.jti, 'EX', ttl)
        .exec();

    emailService.sendPasswordResetEmail(user.email, jwt.token).catch((err) => {
        logger.error({ err: err.message, userId: user._id }, 'Failed to send password reset email');
    });
}