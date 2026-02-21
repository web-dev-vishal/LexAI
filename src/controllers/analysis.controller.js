/**
 * Analysis Controller
 * Handles AI analysis requests and result retrieval.
 */

const analysisService = require('../services/analysis.service');
const { sendSuccess } = require('../utils/apiResponse');
const HTTP = require('../constants/httpStatus');

/**
 * POST /analyses
 */
async function requestAnalysis(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;

    const result = await analysisService.requestAnalysis({
        contractId: req.body.contractId,
        orgId,
        userId: req.user.userId,
        version: req.body.version,
    });

    if (result.cached) {
        sendSuccess(res, {
            message: 'Analysis result retrieved from cache.',
            data: result,
        });
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

/**
 * GET /analyses/:id
 */
async function getAnalysis(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const analysis = await analysisService.getAnalysis(req.params.id, orgId);

    sendSuccess(res, {
        data: { analysis },
    });
}

/**
 * GET /analyses/contract/:contractId
 */
async function getAnalysesByContract(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const analyses = await analysisService.getAnalysesByContract(req.params.contractId, orgId);

    sendSuccess(res, {
        data: { analyses },
    });
}

module.exports = {
    requestAnalysis,
    getAnalysis,
    getAnalysesByContract,
};
