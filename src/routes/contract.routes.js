/**
 * Contract Routes
 * Includes file upload via multer and version comparison.
 */

const { Router } = require('express');
const multer = require('multer');
const contractController = require('../controllers/contract.controller');
const diffController = require('../controllers/diff.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const contractValidator = require('../validators/contract.validator');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

// Multer config — store in memory (we extract text then discard the file)
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

module.exports = router;
