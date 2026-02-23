/**
 * Diff Controller — version comparison requests.
 */

import * as diffService from '../services/diff.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/** POST /contracts/:id/compare */
export async function compareVersions(req, res) {
    const { orgId } = req;

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
