/** Analysis Routes */

import { Router } from 'express';
import * as analysisController from '../controllers/analysis.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { checkQuota } from '../middleware/quota.middleware.js';
import { requireOrg } from '../middleware/orgResolver.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as analysisValidator from '../validators/analysis.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

router.post('/', authenticate, requireOrg, checkQuota, validate(analysisValidator.requestAnalysis), asyncWrapper(analysisController.requestAnalysis));
router.get('/:id', authenticate, requireOrg, asyncWrapper(analysisController.getAnalysis));
router.get('/contract/:contractId', authenticate, requireOrg, asyncWrapper(analysisController.getAnalysesByContract));

export default router;
