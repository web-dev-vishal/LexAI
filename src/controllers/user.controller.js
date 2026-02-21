/**
 * User Controller
 * Profile management endpoints.
 */

const userService = require('../services/user.service');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * GET /users/me
 */
async function getProfile(req, res) {
    const user = await userService.getUserProfile(req.user.userId);

    sendSuccess(res, {
        data: { user },
    });
}

/**
 * PATCH /users/me
 */
async function updateProfile(req, res) {
    const user = await userService.updateUserProfile(req.user.userId, req.body);

    sendSuccess(res, {
        message: 'Profile updated successfully',
        data: { user },
    });
}

/**
 * PATCH /users/me/password
 */
async function changePassword(req, res) {
    await userService.changePassword(
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
    );

    sendSuccess(res, {
        message: 'Password changed successfully.',
    });
}

/**
 * GET /users/:id (admin only)
 */
async function getUserById(req, res) {
    const user = await userService.getUserById(req.params.id);

    sendSuccess(res, {
        data: { user },
    });
}

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    getUserById,
};
