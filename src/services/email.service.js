/**
 * Email Service
 *
 * Nodemailer wrapper for all outbound email:
 *   - Email verification
 *   - Password reset
 *   - Team invitations
 *   - Contract expiry alerts
 *
 * In development, uses Ethereal Email (free SMTP test inbox).
 * Transporter is lazily initialized on first email send.
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

// Module-level transporter — initialized once, reused for all emails
let transporter = null;

/**
 * Initialize the email transporter. Called once on first email send.
 * Uses SMTP config from environment variables.
 */
function initEmailTransporter() {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for port 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  logger.info('✅ Email transporter initialized');
}

/**
 * Send an email. Lazily initializes the transporter if not already done.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!transporter) initEmailTransporter();

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@lexai.io',
    to,
    subject,
    html,
    text,
  });

  // In dev with Ethereal, log the preview URL for easy testing
  if (process.env.NODE_ENV !== 'production') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`📧 Email preview: ${previewUrl}`);
    }
  }

  logger.debug(`Email sent to ${to}: ${subject}`);
  return info;
}

/**
 * Send email verification link to a newly registered user.
 */
export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'LexAI — Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to LexAI!</h2>
        <p>Thank you for registering. Please verify your email address to get started:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Verify Email</a>
        <p style="color: #6b7280; font-size: 14px;">Or copy this token and use it in the API: <code>${token}</code></p>
        <p style="color: #9ca3af; font-size: 12px;">If you didn't register for LexAI, you can safely ignore this email.</p>
      </div>
    `,
    text: `Welcome to LexAI! Verify your email by using this token: ${token}`,
  });
}

/**
 * Send password reset link with 1-hour expiry.
 */
export async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'LexAI — Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset</h2>
        <p>You requested a password reset. Click the link below (valid for 1 hour):</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
        <p style="color: #6b7280; font-size: 14px;">Token: <code>${token}</code></p>
        <p style="color: #9ca3af; font-size: 12px;">If you didn't request this, ignore this email. Your password will remain unchanged.</p>
      </div>
    `,
    text: `Reset your password using this token (valid for 1 hour): ${token}`,
  });
}

/**
 * Send team invitation email with accept link.
 */
export async function sendInvitationEmail(email, { token, orgName, role, expiresAt }) {
  const acceptUrl = `${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/accept-invite?token=${token}`;

  return sendEmail({
    to: email,
    subject: `LexAI — You've been invited to join ${orgName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Team Invitation</h2>
        <p>You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Accept Invitation</a>
        <p style="color: #6b7280; font-size: 14px;">This invitation expires on ${new Date(expiresAt).toUTCString()}.</p>
        <p style="color: #6b7280; font-size: 14px;">Invitation token: <code>${token}</code></p>
      </div>
    `,
    text: `You've been invited to join ${orgName} as a ${role}. Accept with token: ${token}`,
  });
}

/**
 * Send contract expiry alert email with urgency styling.
 */
export async function sendExpiryAlertEmail(email, { contractTitle, daysUntilExpiry, expiryDate, orgName }) {
  return sendEmail({
    to: email,
    subject: `LexAI — Contract "${contractTitle}" expires in ${daysUntilExpiry} days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">⚠️ Contract Expiry Alert</h2>
        <p>The following contract in <strong>${orgName}</strong> is expiring soon:</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Contract</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${contractTitle}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Expiry Date</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${new Date(expiryDate).toLocaleDateString()}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Days Remaining</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb; color: #ef4444; font-weight: bold;">${daysUntilExpiry}</td></tr>
        </table>
        <p style="color: #6b7280;">Log in to LexAI to review this contract and take action.</p>
        <p style="color: #9ca3af; font-size: 12px;">This is an automated notification from LexAI. AI analysis is not legal advice.</p>
      </div>
    `,
    text: `Contract "${contractTitle}" in ${orgName} expires on ${new Date(expiryDate).toLocaleDateString()} (${daysUntilExpiry} days remaining).`,
  });
}

export { initEmailTransporter };
