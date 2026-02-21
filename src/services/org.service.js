/**
 * Organization Service
 * Business logic for org creation, member management, and plan enforcement.
 */

const Organization = require('../models/Organization.model');
const User = require('../models/User.model');
const { getPlanLimits } = require('../constants/plans');

/**
 * Create a new organization. The creating user becomes owner + admin.
 */
async function createOrganization(userId, { name }) {
    // Check if user already belongs to an org
    const user = await User.findById(userId);
    if (user.organization) {
        const error = new Error('You already belong to an organization. Leave your current org first.');
        error.statusCode = 400;
        error.code = 'ALREADY_IN_ORG';
        throw error;
    }

    const org = await Organization.create({
        name,
        ownerId: userId,
        members: [{ userId, role: 'admin', joinedAt: new Date() }],
    });

    // Update user's org reference and role
    user.organization = org._id;
    user.role = 'admin';
    await user.save();

    return org;
}

/**
 * Get organization details with populated member info.
 */
async function getOrganization(orgId, userId) {
    const org = await Organization.findById(orgId).lean();

    if (!org) {
        const error = new Error('Organization not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
    }

    // Verify the requester is a member
    const isMember = org.members.some((m) => m.userId.toString() === userId.toString());
    if (!isMember) {
        const error = new Error('You are not a member of this organization.');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
    }

    // Populate member names
    const memberIds = org.members.map((m) => m.userId);
    const users = await User.find({ _id: { $in: memberIds } }).select('name email').lean();
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u; });

    org.members = org.members.map((m) => ({
        userId: m.userId,
        name: userMap[m.userId.toString()]?.name || 'Unknown',
        email: userMap[m.userId.toString()]?.email,
        role: m.role,
        joinedAt: m.joinedAt,
    }));

    return org;
}

/**
 * Update organization details (name, settings).
 */
async function updateOrganization(orgId, userId, updates) {
    const org = await Organization.findById(orgId);
    if (!org) {
        const error = new Error('Organization not found.');
        error.statusCode = 404;
        throw error;
    }

    const memberRole = org.getMemberRole(userId);
    if (!memberRole || !['admin', 'manager'].includes(memberRole)) {
        const error = new Error('Only admins and managers can update organization details.');
        error.statusCode = 403;
        throw error;
    }

    if (updates.name) org.name = updates.name;
    await org.save();

    return org;
}

/**
 * Change a member's role within the organization.
 */
async function changeMemberRole(orgId, targetUserId, newRole, requesterId) {
    const org = await Organization.findById(orgId);
    if (!org) {
        const error = new Error('Organization not found.');
        error.statusCode = 404;
        throw error;
    }

    // Only admins can change roles
    const requesterRole = org.getMemberRole(requesterId);
    if (requesterRole !== 'admin') {
        const error = new Error('Only admins can change member roles.');
        error.statusCode = 403;
        throw error;
    }

    // Can't change your own role
    if (requesterId.toString() === targetUserId.toString()) {
        const error = new Error('You cannot change your own role.');
        error.statusCode = 400;
        throw error;
    }

    const memberIndex = org.members.findIndex((m) => m.userId.toString() === targetUserId);
    if (memberIndex === -1) {
        const error = new Error('User is not a member of this organization.');
        error.statusCode = 404;
        throw error;
    }

    org.members[memberIndex].role = newRole;
    await org.save();

    // Also update the User document
    await User.findByIdAndUpdate(targetUserId, { role: newRole });

    return org;
}

/**
 * Remove a member from the organization.
 */
async function removeMember(orgId, targetUserId, requesterId) {
    const org = await Organization.findById(orgId);
    if (!org) {
        const error = new Error('Organization not found.');
        error.statusCode = 404;
        throw error;
    }

    if (requesterId.toString() === targetUserId.toString()) {
        const error = new Error('You cannot remove yourself. Transfer ownership first.');
        error.statusCode = 400;
        throw error;
    }

    org.members = org.members.filter((m) => m.userId.toString() !== targetUserId);
    await org.save();

    // Remove org reference from the user
    await User.findByIdAndUpdate(targetUserId, { organization: null, role: 'viewer' });

    return org;
}

/**
 * Check if adding a new member would exceed the plan limit.
 */
async function checkMemberLimit(orgId) {
    const org = await Organization.findById(orgId).lean();
    const planLimits = getPlanLimits(org.plan);

    if (planLimits.maxTeamMembers !== Infinity && org.members.length >= planLimits.maxTeamMembers) {
        const error = new Error(`Your ${org.plan} plan allows a maximum of ${planLimits.maxTeamMembers} team members. Upgrade to add more.`);
        error.statusCode = 403;
        error.code = 'PLAN_LIMIT';
        throw error;
    }
}

module.exports = {
    createOrganization,
    getOrganization,
    updateOrganization,
    changeMemberRole,
    removeMember,
    checkMemberLimit,
};
