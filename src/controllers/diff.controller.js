/**
 * Diff Controller
 * Handles version comparison requests.
 */

const diffService = require('../services/diff.service');
const { sendSuccess } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');

/**
 * POST /contracts/:id/compare
 */
async function compareVersions(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;

    const result = await diffService.compareVersions({
        contractId: req.params.id,
        orgId,
        userId: req.user.userId,
        versionA: req.body.versionA,
        versionB: req.body.versionB,
    });

    sendSuccess(res, {
        statusCode: HTTP.ACCEPTED,
        message: 'Version comparison queued. You will be notified via WebSocket when complete.',
        data: result,
    });
}

module.exports = { compareVersions };
