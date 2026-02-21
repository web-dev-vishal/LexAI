/**
 * Analysis Routes
 */

const { Router } = require('express');
const analysisController = require('../controllers/analysis.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { checkQuota } = require('../middleware/quota.middleware');
const { validate } = require('../middleware/validate.middleware');
const analysisValidator = require('../validators/analysis.validator');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

router.post('/', authenticate, checkQuota, validate(analysisValidator.requestAnalysis), asyncWrapper(analysisController.requestAnalysis));
router.get('/:id', authenticate, asyncWrapper(analysisController.getAnalysis));
router.get('/contract/:contractId', authenticate, asyncWrapper(analysisController.getAnalysesByContract));

module.exports = router;
