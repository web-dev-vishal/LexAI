/**
 * Analysis Controller
 * Handles AI analysis requests and result retrieval.
 */

import * as analysisService from '../services/analysis.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/** POST /analyses */
export async function requestAnalysis(req, res) {
    const { orgId } = req;

    const result = await analysisService.requestAnalysis({
        contractId: req.body.contractId,
        orgId,
        userId: req.user.userId,
        version: req.body.version,
    });

    if (result.cached) {
        sendSuccess(res, { message: 'Analysis result retrieved from cache.', data: result });
    } else {
        sendSuccess(res, {
            statusCode: HTTP.ACCEPTED,
            message: 'Analysis job queued. You will receive a WebSocket notification when complete.',
            data: {
                analysisId: result.analysisId,
                status: result.status,
                estimatedSeconds: result.estimatedSeconds || 30,
            },
        });
    }
}

/** GET /analyses/:id */
export async function getAnalysis(req, res) {
    const { orgId } = req;
    const analysis = await analysisService.getAnalysis(req.params.id, orgId);
    sendSuccess(res, { data: { analysis } });
}

/** GET /analyses/contract/:contractId */
export async function getAnalysesByContract(req, res) {
    const { orgId } = req;
    const analyses = await analysisService.getAnalysesByContract(req.params.contractId, orgId);
    sendSuccess(res, { data: { analyses } });
}
