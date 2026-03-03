/**
 * Email Service — Handles all outbound emails for LexAI.
 *
 * Emails sent by this service:
 *   1. OTP verification    — 6-digit code, expires in 10 minutes
 *   2. Password reset      — secure link with a hex token, expires in 1 hour
 *   3. Team invitation     — link to accept/join an organisation
 *   4. Contract expiry     — alert when a contract is about to expire
 *
 * Transport:
 *   Uses Gmail SMTP with an App Password (set in SMTP_USER / SMTP_PASS).
 *   The nodemailer transporter is created once on the first email send
 *   and reused for every email after that (connection pooling).
 *
 * To add a new email type:
 *   1. Add a new exported async function below.
 *   2. Call sendEmail() with the right to/subject/html/text.
 *   3. That's it — no other file needs to change.
 */

import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// The transporter is created once and reused — creating it on every email
// would waste time and connections.
let transporter = null;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets up the Gmail SMTP connection using credentials from the environment.
 * Called automatically on the first email send — you don't call this directly.
 */
function _initTransporter() {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,   // smtp.gmail.com
    port: env.SMTP_PORT,   // 587
    secure: false,            // false = STARTTLS (upgrades from plain to encrypted)
    auth: {
      user: env.SMTP_USER, // your Gmail address
      pass: env.SMTP_PASS, // Gmail App Password (not your account password)
    },
  });

  logger.info('Email transporter ready (Gmail SMTP)');
}

/**
 * The core send function used by every email helper below.
 * Lazily initializes the transporter on first call.
 *
 * @param {object} options
 * @param {string} options.to      - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html    - HTML version of the email body
 * @param {string} options.text    - Plain-text fallback (shown by clients that block HTML)
 */
async function _sendEmail({ to, subject, html, text }) {
  if (!transporter) _initTransporter();

  const info = await transporter.sendMail({
    from: `"LexAI" <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
    text,
  });

  logger.debug({ to, subject, messageId: info.messageId }, 'Email sent');
  return info;
}

/**
 * Returns the first allowed origin (e.g. "http://localhost:3000") to use as
 * the base URL for links in emails. Falls back gracefully if env is not set.
 */
function _getAppBaseUrl() {
  return (env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')[0].trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OTP Verification Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a 6-digit OTP to the user's email address.
 * The OTP is displayed in a large, easy-to-read box and expires in 10 minutes.
 *
 * @param {string} email - Where to send the OTP
 * @param {string} otp   - The 6-digit code (e.g. "048291")
 */
export async function sendOtpEmail(email, otp) {
  // In development, print the OTP to the server logs so engineers can test
  // without needing access to an email inbox.
  if (env.NODE_ENV !== 'production') {
    logger.info({ email, otp }, '[DEV] OTP — use this to verify the account');
  }

  return _sendEmail({
    to: email,
    subject: 'LexAI — Your Verification Code',
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;
                        border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

                <!-- Header -->
                <div style="background: #2563eb; padding: 24px 32px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; letter-spacing: -0.5px;">LexAI</h1>
                </div>

                <!-- Body -->
                <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #111827;">Verify Your Email Address</h2>
                    <p style="color: #374151; line-height: 1.6; margin-bottom: 24px;">
                        Use the code below to verify your account. It is valid for
                        <strong>10 minutes</strong> and can only be used once.
                    </p>

                    <!-- OTP display -->
                    <div style="text-align: center; margin: 28px 0;">
                        <span style="
                            display:       inline-block;
                            font-family:   'Courier New', monospace;
                            font-size:     40px;
                            font-weight:   700;
                            letter-spacing: 14px;
                            color:         #2563eb;
                            background:    #eff6ff;
                            padding:       16px 32px;
                            border-radius: 8px;
                        ">${otp}</span>
                    </div>

                    <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin-top: 24px;">
                        If you did not sign up for LexAI, please ignore this email.
                        No action is needed — this code will expire on its own.
                    </p>
                </div>

                <!-- Footer -->
                <div style="background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                        © ${new Date().getFullYear()} LexAI · This is an automated message — please do not reply.
                    </p>
                </div>

            </div>
        `,
    text: `Your LexAI verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Password Reset Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a password reset link to the user's email.
 * The link includes a secure hex token that expires in 1 hour.
 *
 * @param {string} email - Recipient address
 * @param {string} token - 64-character hex reset token
 */
export async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${_getAppBaseUrl()}/reset-password?token=${token}`;

  // Log that a reset was triggered (but NOT the token itself in production —
  // that would be a security leak in log files).
  if (env.NODE_ENV !== 'production') {
    logger.info({ email, token }, '[DEV] Password reset token');
  } else {
    logger.info({ email }, 'Password reset email triggered');
  }

  return _sendEmail({
    to: email,
    subject: 'LexAI — Reset Your Password',
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;
                        border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

                <!-- Header -->
                <div style="background: #2563eb; padding: 24px 32px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; letter-spacing: -0.5px;">LexAI</h1>
                </div>

                <!-- Body -->
                <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #111827;">Reset Your Password</h2>
                    <p style="color: #374151; line-height: 1.6; margin-bottom: 24px;">
                        We received a request to reset your password.
                        Click the button below — this link is valid for <strong>1 hour</strong>.
                    </p>

                    <!-- CTA button -->
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${resetUrl}" style="
                            display:          inline-block;
                            padding:          14px 32px;
                            background-color: #2563eb;
                            color:            white;
                            text-decoration:  none;
                            border-radius:    6px;
                            font-weight:      600;
                            font-size:        15px;
                        ">Reset Password</a>
                    </div>

                    <p style="color: #6b7280; font-size: 13px;">
                        If the button doesn't work, paste this URL into your browser:<br/>
                        <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
                        If you did not request a password reset, ignore this email.
                        Your password will remain unchanged.
                    </p>
                </div>

            </div>
        `,
    text: `Reset your LexAI password by visiting this link (valid 1 hour):\n${resetUrl}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Team Invitation Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an invitation email when a user is added to an organisation.
 *
 * @param {string} email              - Recipient email address
 * @param {object} options
 * @param {string} options.token      - Invitation accept token
 * @param {string} options.orgName    - Name of the organisation
 * @param {string} options.role       - Role being assigned (e.g. "member", "admin")
 * @param {Date}   options.expiresAt  - When the invitation expires
 */
export async function sendInvitationEmail(email, { token, orgName, role, expiresAt }) {
  const acceptUrl = `${_getAppBaseUrl()}/accept-invite?token=${token}`;
  const expiryDate = new Date(expiresAt).toUTCString();

  return _sendEmail({
    to: email,
    subject: `LexAI — You've been invited to join ${orgName}`,
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;
                        border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

                <div style="background: #2563eb; padding: 24px 32px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px;">LexAI</h1>
                </div>

                <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #111827;">You're Invited!</h2>
                    <p style="color: #374151; line-height: 1.6;">
                        You've been invited to join <strong>${orgName}</strong> as a
                        <strong>${role}</strong>.
                    </p>

                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${acceptUrl}" style="
                            display:          inline-block;
                            padding:          14px 32px;
                            background-color: #2563eb;
                            color:            white;
                            text-decoration:  none;
                            border-radius:    6px;
                            font-weight:      600;
                            font-size:        15px;
                        ">Accept Invitation</a>
                    </div>

                    <p style="color: #6b7280; font-size: 13px;">
                        This invitation expires on <strong>${expiryDate}</strong>.
                    </p>
                </div>

            </div>
        `,
    text: `You've been invited to join ${orgName} as a ${role}.\n\nAccept here: ${acceptUrl}\n\nExpires: ${expiryDate}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Contract Expiry Alert Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an alert email warning that a contract is close to its expiry date.
 *
 * @param {string} email                      - Recipient email address
 * @param {object} options
 * @param {string} options.contractTitle      - Name/title of the contract
 * @param {number} options.daysUntilExpiry    - How many days remain
 * @param {Date}   options.expiryDate         - The actual expiry date
 * @param {string} options.orgName            - Organisation the contract belongs to
 */
export async function sendExpiryAlertEmail(email, { contractTitle, daysUntilExpiry, expiryDate, orgName }) {
  const formattedDate = new Date(expiryDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  // Use a warning colour for urgency: red if ≤ 7 days, amber otherwise
  const urgencyColour = daysUntilExpiry <= 7 ? '#ef4444' : '#f59e0b';

  return _sendEmail({
    to: email,
    subject: `LexAI — Contract "${contractTitle}" expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`,
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;
                        border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

                <div style="background: ${urgencyColour}; padding: 24px 32px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px;">LexAI</h1>
                </div>

                <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #111827;">⚠️ Contract Expiry Alert</h2>
                    <p style="color: #374151; line-height: 1.6;">
                        The following contract in <strong>${orgName}</strong> is expiring soon.
                        Please log in to take action.
                    </p>

                    <table style="border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 14px;">
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; width: 40%;">Contract</td>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${contractTitle}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600;">Expiry Date</td>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${formattedDate}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600;">Days Remaining</td>
                            <td style="padding: 10px 12px; border: 1px solid #e5e7eb; color: ${urgencyColour}; font-weight: 700;">
                                ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}
                            </td>
                        </tr>
                    </table>

                    <p style="color: #9ca3af; font-size: 12px;">
                        This is an automated alert from LexAI. AI analysis is not a substitute for legal advice.
                    </p>
                </div>

            </div>
        `,
    text: `Contract "${contractTitle}" in ${orgName} expires on ${formattedDate} (${daysUntilExpiry} days remaining). Log in to LexAI to take action.`,
  });
}
