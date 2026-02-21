/**
 * Route Aggregator
 * Mounts all route modules under their respective prefixes.
 */

const { Router } = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const orgRoutes = require('./org.routes');
const contractRoutes = require('./contract.routes');
const analysisRoutes = require('./analysis.routes');
const adminRoutes = require('./admin.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/orgs', orgRoutes);
router.use('/contracts', contractRoutes);
router.use('/analyses', analysisRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
