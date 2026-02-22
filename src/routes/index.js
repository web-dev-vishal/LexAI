/**
 * Route Aggregator
 * Mounts all route modules under their respective prefixes.
 */

import { Router } from 'express';

import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import orgRoutes from './org.routes.js';
import contractRoutes from './contract.routes.js';
import analysisRoutes from './analysis.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/orgs', orgRoutes);
router.use('/contracts', contractRoutes);
router.use('/analyses', analysisRoutes);
router.use('/admin', adminRoutes);

export default router;
