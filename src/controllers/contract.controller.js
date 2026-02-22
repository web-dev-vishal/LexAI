/**
 * Contract Controller
 * Handles contract CRUD, versioning, search, and audit trail.
 */

import * as contractService from '../services/contract.service.js';
import * as auditService from '../services/audit.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/** POST /contracts — supports file upload (multer) or raw text */
export async function uploadContract(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    if (!orgId) {
        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: { code: 'MISSING_ORG', message: 'x-org-id header or orgId in token is required.' },
        });
    }

    let tags = req.body.tags;
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch { /* leave as string */ }
    }

    const contract = await contractService.createContract({
        orgId,
        userId: req.user.userId,
        title: req.body.title,
        type: req.body.type,
        tags,
        content: req.body.content,
        file: req.file,
    });

    sendSuccess(res, {
        statusCode: HTTP.CREATED,
        message: 'Contract uploaded successfully',
        data: {
            contract: {
                id: contract._id,
                title: contract.title,
                type: contract.type,
                version: contract.currentVersion,
                contentHash: contract.contentHash,
            },
        },
    });
}

/** GET /contracts */
export async function listContracts(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const { contracts, meta } = await contractService.listContracts(orgId, req.query);
    sendSuccess(res, { data: { contracts, meta } });
}

/** GET /contracts/:id */
export async function getContract(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const contract = await contractService.getContractById(req.params.id, orgId);
    sendSuccess(res, { data: { contract } });
}

/** PATCH /contracts/:id */
export async function updateContract(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const contract = await contractService.updateContract(req.params.id, orgId, req.body);
    sendSuccess(res, { data: { contract } });
}

/** POST /contracts/:id/versions */
export async function uploadVersion(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const result = await contractService.addVersion(req.params.id, orgId, req.user.userId, req.body);
    sendSuccess(res, { statusCode: HTTP.CREATED, data: result });
}

/** GET /contracts/:id/versions */
export async function getVersions(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const versions = await contractService.getVersions(req.params.id, orgId);
    sendSuccess(res, { data: { versions } });
}

/** DELETE /contracts/:id */
export async function deleteContract(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    await contractService.deleteContract(req.params.id, orgId, req.user.userId);
    sendSuccess(res, { message: 'Contract deleted successfully.' });
}

/** GET /contracts/:id/audit */
export async function getContractAudit(req, res) {
    const orgId = req.headers['x-org-id'] || req.user.orgId;
    const logs = await auditService.getContractAuditLogs(req.params.id, orgId);
    sendSuccess(res, { data: { logs } });
}
