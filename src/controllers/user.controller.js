/**
 * User Controller — Profile management endpoints.
 */

import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** GET /users/me */
export async function getProfile(req, res) {
    const user = await userService.getUserProfile(req.user.userId);
    sendSuccess(res, { data: { user } });
}

/** PATCH /users/me */
export async function updateProfile(req, res) {
    const user = await userService.updateUserProfile(req.user.userId, req.body);
    sendSuccess(res, { message: 'Profile updated successfully', data: { user } });
}

/** PATCH /users/me/password */
export async function changePassword(req, res) {
    await userService.changePassword(req.user.userId, req.body.currentPassword, req.body.newPassword);
    sendSuccess(res, { message: 'Password changed successfully.' });
}

/** GET /users/:id (admin only) */
export async function getUserById(req, res) {
    const user = await userService.getUserById(req.params.id);
    sendSuccess(res, { data: { user } });
}
