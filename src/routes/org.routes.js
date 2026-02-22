/** Organization Routes */

import { Router } from 'express';
import * as orgController from '../controllers/org.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as orgValidator from '../validators/org.validator.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

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

export default router;
