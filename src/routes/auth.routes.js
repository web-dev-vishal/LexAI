/**
 * Auth Routes
 */

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const authValidator = require('../validators/auth.validator');
const asyncWrapper = require('../utils/asyncWrapper');

const router = Router();

router.post('/register', validate(authValidator.register), asyncWrapper(authController.register));
router.post('/verify-email', validate(authValidator.verifyEmail), asyncWrapper(authController.verifyEmail));
router.post('/login', validate(authValidator.login), asyncWrapper(authController.login));
router.post('/refresh-token', asyncWrapper(authController.refreshToken));
router.post('/logout', authenticate, asyncWrapper(authController.logout));
router.post('/forgot-password', validate(authValidator.forgotPassword), asyncWrapper(authController.forgotPassword));
router.post('/reset-password', validate(authValidator.resetPassword), asyncWrapper(authController.resetPassword));

module.exports = router;
