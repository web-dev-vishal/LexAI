/**
 * Invitation Service
 *
 * Handles team member invitations:
 *   - Create invitation with 48-hour expiry token
 *   - Send invitation email
 *   - Accept invitation (create/add user to org)
 */

const { v4: uuidv4 } = require('uuid');
const Invitation = require('../models/Invitation.model');
const User = require('../models/User.model');
const Organization = require('../models/Organization.model');
const emailService = require('./email.service');
const orgService = require('./org.service');
const logger = require('../utils/logger');

const INVITATION_EXPIRY_HOURS = 48;

/**
 * Create and send a team invitation.
 */
async function createInvitation(orgId, invitedByUserId, { email, role }) {
    // Check member limit before inviting
    await orgService.checkMemberLimit(orgId);

    // Check if user is already a member
    const org = await Organization.findById(orgId);
    const existingUser = await User.findOne({ email });

    if (existingUser && org.isMember(existingUser._id)) {
        const error = new Error('This user is already a member of your organization.');
        error.statusCode = 400;
        error.code = 'ALREADY_MEMBER';
        throw error;
    }

    // Check for existing pending invitation
    const existingInvite = await Invitation.findOne({
        orgId,
        email,
        status: 'pending',
    });

    if (existingInvite) {
        const error = new Error('A pending invitation already exists for this email.');
        error.statusCode = 400;
        error.code = 'DUPLICATE_INVITATION';
        throw error;
    }

    // Create invitation
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

    // Send invitation email
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
 * Accept an invitation. Creates a new user if needed, or adds existing user to org.
 */
async function acceptInvitation(orgId, { token, name, password }) {
    const invitation = await Invitation.findOne({
        orgId,
        token,
        status: 'pending',
    });

    if (!invitation) {
        const error = new Error('Invalid, expired, or already used invitation.');
        error.statusCode = 400;
        error.code = 'INVALID_INVITATION';
        throw error;
    }

    // Check if invitation has expired (belt + suspenders with TTL index)
    if (new Date() > invitation.expiresAt) {
        invitation.status = 'expired';
        await invitation.save();
        const error = new Error('This invitation has expired. Ask your team admin for a new one.');
        error.statusCode = 400;
        error.code = 'INVITATION_EXPIRED';
        throw error;
    }

    let user = await User.findOne({ email: invitation.email });

    if (!user) {
        // Create a new user
        if (!name || !password) {
            const error = new Error('Name and password are required to accept this invitation.');
            error.statusCode = 400;
            error.code = 'MISSING_FIELDS';
            throw error;
        }

        user = await User.create({
            name,
            email: invitation.email,
            password,
            organization: orgId,
            role: invitation.role,
            emailVerified: true, // Verified via invitation email
        });
    } else {
        // Existing user — update their org
        user.organization = orgId;
        user.role = invitation.role;
        await user.save();
    }

    // Add to org members
    const org = await Organization.findById(orgId);
    org.members.push({
        userId: user._id,
        role: invitation.role,
        joinedAt: new Date(),
    });
    await org.save();

    // Mark invitation as accepted
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    return { userId: user._id, orgId, role: invitation.role };
}

module.exports = {
    createInvitation,
    acceptInvitation,
};
