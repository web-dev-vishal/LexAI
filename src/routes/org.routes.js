/**
 * Organization Routes
 */

const { Router } = require('express');
const orgController = require('../controllers/org.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const orgValidator = require('../validators/org.validator');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

router.post('/', authenticate, validate(orgValidator.createOrg), asyncWrapper(orgController.createOrg));
router.get('/:orgId', authenticate, asyncWrapper(orgController.getOrg));
router.patch('/:orgId', authenticate, authorize('admin', 'manager'), validate(orgValidator.updateOrg), asyncWrapper(orgController.updateOrg));

// Invitation routes
router.post('/:orgId/invite', authenticate, authorize('admin', 'manager'), validate(orgValidator.inviteMember), asyncWrapper(orgController.inviteMember));
router.post('/:orgId/invite/accept', validate(orgValidator.acceptInvite), asyncWrapper(orgController.acceptInvite));

// Member management
router.patch('/:orgId/members/:userId/role', authenticate, authorize('admin'), validate(orgValidator.updateMemberRole), asyncWrapper(orgController.changeMemberRole));
router.delete('/:orgId/members/:userId', authenticate, authorize('admin'), asyncWrapper(orgController.removeMember));

module.exports = router;
