/**
 * Organization Service
 *
 * Business logic for org creation, member management, and plan enforcement.
 * Multi-tenancy is enforced at this layer — every operation is scoped to an org.
 *
 * Role hierarchy for permission checks:
 *   admin > manager > viewer
 *   - Admins: full org control (members, billing, settings)
 *   - Managers: can manage contracts and invite members
 *   - Viewers: read-only access
 */

import Organization from '../models/Organization.model.js';
import User from '../models/User.model.js';
import { getPlanLimits } from '../constants/plans.js';
import AppError from '../utils/AppError.js';

/**
 * Create a new organization. The creating user becomes owner + admin.
 * Users can only belong to one org at a time — enforced here.
 */
export async function createOrganization(userId, { name }) {
    const user = await User.findById(userId);

    // Prevent users from being in multiple orgs
    if (user.organization) {
        throw new AppError(
            'You already belong to an organization. Leave your current org first.',
            400,
            'ALREADY_IN_ORG'
        );
    }

    const org = await Organization.create({
        name,
        ownerId: userId,
        members: [{ userId, role: 'admin', joinedAt: new Date() }],
    });

    // Update the user's org reference and role
    user.organization = org._id;
    user.role = 'admin';
    await user.save();

    return org;
}

/**
 * Get organization details with populated member names and emails.
 * Only accessible to members of the org.
 */
export async function getOrganization(orgId, userId) {
    const org = await Organization.findById(orgId).lean();

    if (!org) {
        throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }

    // Verify the requester is actually a member of this org
    const isMember = org.members.some((m) => m.userId.toString() === userId.toString());
    if (!isMember) {
        throw new AppError('You are not a member of this organization.', 403, 'FORBIDDEN');
    }

    // Populate member names and emails for the response
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
 * Update organization details (e.g., name).
 * Only admins and managers can update org settings.
 */
export async function updateOrganization(orgId, userId, updates) {
    const org = await Organization.findById(orgId);
    if (!org) {
        throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }

    const memberRole = org.getMemberRole(userId);
    if (!memberRole || !['admin', 'manager'].includes(memberRole)) {
        throw new AppError('Only admins and managers can update organization details.', 403, 'FORBIDDEN');
    }

    if (updates.name) org.name = updates.name;
    await org.save();

    return org;
}

/**
 * Change a member's role within the organization.
 * Only admins can change roles, and you can't change your own role.
 */
export async function changeMemberRole(orgId, targetUserId, newRole, requesterId) {
    const org = await Organization.findById(orgId);
    if (!org) {
        throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }

    // Only admins can change roles
    const requesterRole = org.getMemberRole(requesterId);
    if (requesterRole !== 'admin') {
        throw new AppError('Only admins can change member roles.', 403, 'FORBIDDEN');
    }

    // Prevent admins from accidentally changing their own role
    if (requesterId.toString() === targetUserId.toString()) {
        throw new AppError('You cannot change your own role.', 400, 'SELF_ROLE_CHANGE');
    }

    const memberIndex = org.members.findIndex((m) => m.userId.toString() === targetUserId);
    if (memberIndex === -1) {
        throw new AppError('User is not a member of this organization.', 404, 'NOT_FOUND');
    }

    // Update role in both the org's members array and the user document
    org.members[memberIndex].role = newRole;
    await org.save();

    await User.findByIdAndUpdate(targetUserId, { role: newRole });

    return org;
}

/**
 * Remove a member from the organization.
 * Admins can remove anyone except themselves (ownership transfer first).
 */
export async function removeMember(orgId, targetUserId, requesterId) {
    const org = await Organization.findById(orgId);
    if (!org) {
        throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }

    // Can't remove yourself — transfer ownership first
    if (requesterId.toString() === targetUserId.toString()) {
        throw new AppError('You cannot remove yourself. Transfer ownership first.', 400, 'SELF_REMOVAL');
    }

    // Remove from org's members array
    org.members = org.members.filter((m) => m.userId.toString() !== targetUserId);
    await org.save();

    // Clear the user's org reference and reset role to viewer
    await User.findByIdAndUpdate(targetUserId, { organization: null, role: 'viewer' });

    return org;
}

/**
 * Check if adding a new member would exceed the plan's team size limit.
 * Throws if the limit is reached — used by invitation service before creating invites.
 */
export async function checkMemberLimit(orgId) {
    const org = await Organization.findById(orgId).lean();
    const planLimits = getPlanLimits(org.plan);

    if (planLimits.maxTeamMembers !== Infinity && org.members.length >= planLimits.maxTeamMembers) {
        throw new AppError(
            `Your ${org.plan} plan allows a maximum of ${planLimits.maxTeamMembers} team members. Upgrade to add more.`,
            403,
            'PLAN_LIMIT'
        );
    }
}
