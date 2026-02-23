/** Contract Routes — includes file upload via multer and version comparison. */

import { Router } from 'express';
import multer from 'multer';
import * as contractController from '../controllers/contract.controller.js';
import * as diffController from '../controllers/diff.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { requireOrg } from '../middleware/orgResolver.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { sendError } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';
import * as contractValidator from '../validators/contract.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';
import env from '../config/env.js';

const router = Router();

// Multer config — store in memory (extract text then discard the file)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: (parseInt(env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024,
    },
    fileFilter(req, file, cb) {
        const allowedTypes = (env.ALLOWED_MIME_TYPES || '').split(',');
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
        }
    },
});

/**
 * Multer error handler wrapper.
 * Converts multer-specific errors (file too large, unexpected field)
 * into structured API error responses instead of raw 500s.
 */
function handleUpload(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return sendError(res, {
                    statusCode: HTTP.BAD_REQUEST,
                    code: 'FILE_TOO_LARGE',
                    message: `File exceeds the maximum size of ${env.MAX_FILE_SIZE_MB || 5}MB.`,
                });
            }
            return sendError(res, {
                statusCode: HTTP.BAD_REQUEST,
                code: 'UPLOAD_ERROR',
                message: err.message,
            });
        }
        if (err) {
            return sendError(res, {
                statusCode: HTTP.BAD_REQUEST,
                code: 'UPLOAD_ERROR',
                message: err.message,
            });
        }
        next();
    });
}

// Contract CRUD
router.post('/', authenticate, requireOrg, handleUpload, asyncWrapper(contractController.uploadContract));
router.get('/', authenticate, requireOrg, validate(contractValidator.listContracts, 'query'), asyncWrapper(contractController.listContracts));
router.get('/:id', authenticate, requireOrg, asyncWrapper(contractController.getContract));
router.patch('/:id', authenticate, requireOrg, validate(contractValidator.updateContract), asyncWrapper(contractController.updateContract));
router.delete('/:id', authenticate, requireOrg, authorize('admin', 'manager'), asyncWrapper(contractController.deleteContract));

// Version management
router.post('/:id/versions', authenticate, requireOrg, validate(contractValidator.uploadVersion), asyncWrapper(contractController.uploadVersion));
router.get('/:id/versions', authenticate, requireOrg, asyncWrapper(contractController.getVersions));

// Version comparison (Pro/Enterprise only — enforced in service layer)
router.post('/:id/compare', authenticate, requireOrg, validate(contractValidator.compareVersions), asyncWrapper(diffController.compareVersions));

// Audit trail
router.get('/:id/audit', authenticate, requireOrg, asyncWrapper(contractController.getContractAudit));

export default router;

