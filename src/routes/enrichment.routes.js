/** Enrichment Routes — all require authentication. */

import { Router } from 'express';
import * as enrichmentController from '../controllers/enrichment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

const router = Router();

// All enrichment routes require authentication
router.use(authenticate);

router.get('/country/:name', asyncWrapper(enrichmentController.getCountryInfo));
router.get('/time/:timezone(*)', asyncWrapper(enrichmentController.getWorldTime));
router.get('/holidays', asyncWrapper(enrichmentController.checkHoliday));

export default router;
