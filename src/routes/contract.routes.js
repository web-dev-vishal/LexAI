/** Contract Routes — includes file upload via multer and version comparison. */

import { Router } from 'express';
import multer from 'multer';
import * as contractController from '../controllers/contract.controller.js';
import * as diffController from '../controllers/diff.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as contractValidator from '../validators/contract.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// Multer config — store in memory (extract text then discard the file)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024,
    },
    fileFilter(req, file, cb) {
        const allowedTypes = (process.env.ALLOWED_MIME_TYPES || '').split(',');
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
        }
    },
});

// Contract CRUD
router.post('/', authenticate, upload.single('file'), asyncWrapper(contractController.uploadContract));
router.get('/', authenticate, validate(contractValidator.listContracts, 'query'), asyncWrapper(contractController.listContracts));
router.get('/:id', authenticate, asyncWrapper(contractController.getContract));
router.patch('/:id', authenticate, validate(contractValidator.updateContract), asyncWrapper(contractController.updateContract));
router.delete('/:id', authenticate, authorize('admin', 'manager'), asyncWrapper(contractController.deleteContract));

// Version management
router.post('/:id/versions', authenticate, validate(contractValidator.uploadVersion), asyncWrapper(contractController.uploadVersion));
router.get('/:id/versions', authenticate, asyncWrapper(contractController.getVersions));

// Version comparison (Pro/Enterprise only — enforced in service layer)
router.post('/:id/compare', authenticate, validate(contractValidator.compareVersions), asyncWrapper(diffController.compareVersions));

// Audit trail
router.get('/:id/audit', authenticate, asyncWrapper(contractController.getContractAudit));

export default router;
