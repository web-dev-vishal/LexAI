/**
 * Invitation Service
 *
 * Handles team member invitations:
 *   - Create invitation with 48-hour expiry token (UUID)
 *   - Send invitation email
 *   - Accept invitation (create new user or add existing user to org)
 *
 * The invitation token is a UUID v4 — not a JWT — because invitations
 * don't need to carry a payload, they just need to be unique and hard to guess.
 */

import { v4 as uuidv4 } from 'uuid';
import Invitation from '../models/Invitation.model.js';
import User from '../models/User.model.js';
import Organization from '../models/Organization.model.js';
import * as emailService from './email.service.js';
import * as orgService from './org.service.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

const INVITATION_EXPIRY_HOURS = 48; // Invitations are valid for 48 hours

/**
 * Create and send a team invitation.
 * Validates plan limits and checks for duplicate invitations before creating.
 */
export async function createInvitation(orgId, invitedByUserId, { email, role }) {
    // Check if adding a member would exceed the plan's team size limit
    await orgService.checkMemberLimit(orgId);

    // Check if user is already a member of this org
    const org = await Organization.findById(orgId);
    const existingUser = await User.findOne({ email });

    if (existingUser && org.isMember(existingUser._id)) {
        throw new AppError('This user is already a member of your organization.', 400, 'ALREADY_MEMBER');
    }

    // Check for existing pending invitation to prevent spam
    const existingInvite = await Invitation.findOne({
        orgId,
        email,
        status: 'pending',
    });

    if (existingInvite) {
        throw new AppError('A pending invitation already exists for this email.', 400, 'DUPLICATE_INVITATION');
    }

    // Create invitation with UUID token and 48-hour expiry
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const invitation = await Invitation.create({
        orgId,
        invitedBy: invitedByUserId,
        email,
        role,
        token,
        expiresAt,
    });

    // Send invitation email — fire-and-forget so the request isn't blocked
    emailService.sendInvitationEmail(email, {
        token,
        orgName: org.name,
        role,
        expiresAt,
    }).catch((err) => {
        logger.error('Failed to send invitation email:', err.message);
    });

    return invitation;
}

/**
 * Accept an invitation.
 * Creates a new user if the invitee doesn't have an account,
 * or adds the existing user to the org.
 */
export async function acceptInvitation(orgId, { token, name, password }) {
    const invitation = await Invitation.findOne({
        orgId,
        token,
        status: 'pending',
    });

    if (!invitation) {
        throw new AppError('Invalid, expired, or already used invitation.', 400, 'INVALID_INVITATION');
    }

    // Belt + suspenders: check expiry in code too (TTL index handles deletion)
    if (new Date() > invitation.expiresAt) {
        invitation.status = 'expired';
        await invitation.save();
        throw new AppError('This invitation has expired. Ask your team admin for a new one.', 400, 'INVITATION_EXPIRED');
    }

    let user = await User.findOne({ email: invitation.email });

    if (!user) {
        // New user — name and password are required for account creation
        if (!name || !password) {
            throw new AppError('Name and password are required to accept this invitation.', 400, 'MISSING_FIELDS');
        }

        user = await User.create({
            name,
            email: invitation.email,
            password,
            organization: orgId,
            role: invitation.role,
            emailVerified: true, // Verified by clicking the invitation email link
        });
    } else {
        // Existing user — update their org reference and role
        user.organization = orgId;
        user.role = invitation.role;
        await user.save();
    }

    // Add the user to the org's members array
    const org = await Organization.findById(orgId);
    org.members.push({
        userId: user._id,
        role: invitation.role,
        joinedAt: new Date(),
    });
    await org.save();

    // Mark invitation as accepted — prevents reuse
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    return { userId: user._id, orgId, role: invitation.role };
}
