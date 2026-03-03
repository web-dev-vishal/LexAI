/**
 * Analysis Routes
 *
 * Base path: /api/v1/analyses  (mounted in routes/index.js)
 *
 * All endpoints require authentication + a valid org context.
 *
 *   POST /analyses                          — Request AI analysis for a contract
 *   GET  /analyses/:id                      — Get a single analysis result by ID
 *   GET  /analyses/contract/:contractId     — Get all analyses for a contract
 */

import { Router } from 'express';
import * as analysisController from '../controllers/analysis.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireOrg } from '../middleware/orgResolver.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as analysisValidator from '../validators/analysis.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// All analysis routes require authentication + org membership
router.use(authenticate, requireOrg);

// Request a new AI analysis (or return cached result)
router.post(
    '/',
    validate(analysisValidator.requestAnalysis),
    asyncWrapper(analysisController.requestAnalysis)
);

// Get all analyses for a specific contract
// NOTE: This route MUST be declared before /:id to prevent "contract" being
// matched as a MongoDB ObjectId param.
router.get(
    '/contract/:contractId',
    asyncWrapper(analysisController.getAnalysesByContract)
);

// Get a single analysis by its ID
router.get(
    '/:id',
    asyncWrapper(analysisController.getAnalysis)
);

export default router;