/**
 * Organization Controller
 * Org creation, member management, and invitation handling.
 */

const orgService = require('../services/org.service');
const invitationService = require('../services/invitation.service');
const { sendSuccess } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');
const auditService = require('../services/audit.service');

/**
 * POST /orgs
 */
async function createOrg(req, res) {
    const org = await orgService.createOrganization(req.user.userId, req.body);

    await auditService.log({
        orgId: org._id,
        userId: req.user.userId,
        action: 'org.created',
        resourceType: 'Organization',
        resourceId: org._id,
        ipAddress: req.ip,
    });

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        data: {
            org: {
                id: org._id,
                name: org.name,
                slug: org.slug,
                plan: org.plan,
                memberCount: org.members.length,
            },
        },
    });
}

/**
 * GET /orgs/:orgId
 */
async function getOrg(req, res) {
    const org = await orgService.getOrganization(req.params.orgId, req.user.userId);

    sendSuccess(res, {
        data: { org },
    });
}

/**
 * PATCH /orgs/:orgId
 */
async function updateOrg(req, res) {
    const org = await orgService.updateOrganization(req.params.orgId, req.user.userId, req.body);

    sendSuccess(res, {
        data: { org },
    });
}

/**
 * POST /orgs/:orgId/invite
 */
async function inviteMember(req, res) {
    const invitation = await invitationService.createInvitation(
        req.params.orgId,
        req.user.userId,
        req.body
    );

    await auditService.log({
        orgId: req.params.orgId,
        userId: req.user.userId,
        action: 'org.member.invited',
        resourceType: 'Invitation',
        resourceId: invitation._id,
        metadata: { email: req.body.email, role: req.body.role },
        ipAddress: req.ip,
    });

    sendSuccess(res, {
        message: `Invitation sent to ${req.body.email}`,
        data: {
            invitationId: invitation._id,
            expiresAt: invitation.expiresAt,
        },
    });
}

/**
 * POST /orgs/:orgId/invite/accept
 */
async function acceptInvite(req, res) {
    const result = await invitationService.acceptInvitation(req.params.orgId, req.body);

    sendSuccess(res, {
        message: 'Invitation accepted. Your account has been created.',
        data: result,
    });
}

/**
 * PATCH /orgs/:orgId/members/:userId/role
 */
async function changeMemberRole(req, res) {
    await orgService.changeMemberRole(
        req.params.orgId,
        req.params.userId,
        req.body.role,
        req.user.userId
    );

    sendSuccess(res, {
        message: 'Member role updated successfully.',
    });
}

/**
 * DELETE /orgs/:orgId/members/:userId
 */
async function removeMember(req, res) {
    await orgService.removeMember(
        req.params.orgId,
        req.params.userId,
        req.user.userId
    );

    await auditService.log({
        orgId: req.params.orgId,
        userId: req.user.userId,
        action: 'org.member.removed',
        resourceType: 'User',
        resourceId: req.params.userId,
        ipAddress: req.ip,
    });

    sendSuccess(res, {
        message: 'Member removed from organization.',
    });
}

module.exports = {
    createOrg,
    getOrg,
    updateOrg,
    inviteMember,
    acceptInvite,
    changeMemberRole,
    removeMember,
};
