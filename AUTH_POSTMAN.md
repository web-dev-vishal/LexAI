# Auth API — Postman Testing Guide

> **Base URL:** `http://localhost:3500/api/v1`  
> **Server port is 3500** (set in `.env` as `PORT=3500`)

---

## Setup in Postman

1. Create a **Collection** named `LexAI Auth`
2. Add a **Collection Variable** named `accessToken` (starts empty)
3. Make sure your server is running: `node server.js`
4. Redis must be running locally: `redis-server` (default port 6379)

---

## Endpoints

---

### 1. Register

**`POST`** `http://localhost:3500/api/v1/auth/register`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Vishal Sanam",
  "email": "vishal@example.com",
  "password": "Test@1234"
}
```

**✅ Success Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "userId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "email": "vishal@example.com",
    "verificationToken": "a3f8c2d1e4b5..."
  }
}
```
> ⚠️ `verificationToken` is **only returned in development** (`NODE_ENV=development`). Copy this token — you need it for Step 2.

**❌ Error — Email already registered (409):**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_EMAIL",
    "message": "An account with this email already exists."
  }
}
```

**❌ Error — Validation failure (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "password", "message": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character." }
    ]
  }
}
```

---

### 2. Verify Email

**`POST`** `http://localhost:3500/api/v1/auth/verify-email`

> Use the `verificationToken` from Step 1 (returned in dev mode).

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "token": "a3f8c2d1e4b5a3f8c2d1e4b5a3f8c2d1e4b5a3f8c2d1e4b5a3f8c2d1e4b5a3f8"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now log in."
}
```

**❌ Error — Token invalid or expired (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired verification token. Please request a new one."
  }
}
```

---

### 3. Resend Verification Email

**`POST`** `http://localhost:3500/api/v1/auth/resend-verification-email`

> Use this if the verification token expired or email was lost.

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "vishal@example.com"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "If this email exists and is unverified, a new verification link has been sent."
}
```
> ℹ️ Always returns success — prevents email enumeration. Check your Redis for the new token or check the email inbox.

---

### 4. Login

**`POST`** `http://localhost:3500/api/v1/auth/login`

> Must verify email first (Step 2) before login works.

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "vishal@example.com",
  "password": "Test@1234"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Vishal Sanam",
      "email": "vishal@example.com",
      "role": "user"
    }
  }
}
```
> ✅ **Save the `accessToken`** — paste it into the `accessToken` Collection Variable.  
> ✅ A `refreshToken` HttpOnly **cookie is also set automatically** by the server.

**❌ Error — Bad credentials (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password."
  }
}
```

**❌ Error — Email not verified (403):**
```json
{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Please verify your email before logging in."
  }
}
```

**❌ Error — Account locked after 5 bad attempts (429):**
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account temporarily locked. Try again in 15 minutes."
  }
}
```

---

### 5. Refresh Token

**`POST`** `http://localhost:3500/api/v1/auth/refresh-token`

> No body needed — the refresh token is read from the `refreshToken` HttpOnly cookie set during login.  
> In Postman: go to **Settings → Cookies** and make sure cookies are enabled.

**Headers:**
```
(none required — cookie is sent automatically by Postman)
```

**Body:** *(empty)*

**✅ Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```
> ✅ Update your `accessToken` collection variable with the new token.  
> The old refresh token is now blacklisted. A new refresh token cookie is set.

**❌ Error — Cookie missing (401):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Refresh token not found. Please log in again."
  }
}
```

---

### 6. Logout  *(protected)*

**`POST`** `http://localhost:3500/api/v1/auth/logout`

**Headers:**
```
Authorization: Bearer {{accessToken}}
```

**Body:** *(empty)*

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```
> ✅ Both the access token and the refresh token cookie are now revoked. Attempting to use the old `accessToken` will return `TOKEN_REVOKED`.

**❌ Error — No token (401):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Access token required. Format: Authorization: Bearer <token>"
  }
}
```

---

### 7. Forgot Password

**`POST`** `http://localhost:3500/api/v1/auth/forgot-password`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "vishal@example.com"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "If this email is registered, a password reset link has been sent."
}
```
> ⚠️ In development, find your reset token in Redis:  
> `redis-cli KEYS "pwReset:*"` — each result looks like `pwReset:<64-char-hex-token>`.  
> The **hex string after `pwReset:`** is the token to paste into Step 8's `token` field.  
> (`GET <key>` returns the userId, not the token — the token is in the key name itself.)

---

### 8. Reset Password

**`POST`** `http://localhost:3500/api/v1/auth/reset-password`

> Use the reset token from the email or Redis (Step 7).

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "token": "b7e2a3d1c4f5b7e2a3d1c4f5b7e2a3d1c4f5b7e2a3d1c4f5b7e2a3d1c4f5b7e2",
  "password": "NewPass@5678"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

**❌ Error — Token invalid or expired (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired password reset token. Please request a new one."
  }
}
```

**❌ Error — Same as old password (400):**
```json
{
  "success": false,
  "error": {
    "code": "PASSWORD_REUSE",
    "message": "New password must be different from your current password."
  }
}
```

---

### 9. Change Password  *(protected)*

**`POST`** `http://localhost:3500/api/v1/auth/change-password`

> Requires the user to be logged in (valid access token).

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {{accessToken}}
```

**Body (raw JSON):**
```json
{
  "currentPassword": "Test@1234",
  "newPassword": "NewPass@5678"
}
```

**✅ Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

**❌ Error — Wrong current password (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Current password is incorrect."
  }
}
```

**❌ Error — Same password (400):**
```json
{
  "success": false,
  "error": {
    "code": "PASSWORD_REUSE",
    "message": "New password must be different from your current password."
  }
}
```

---

## Testing Order (Happy Path)

```
1. POST /register          → copy verificationToken from response
2. POST /verify-email      → paste token, get success
3. POST /login             → copy accessToken, refreshToken cookie set automatically
4. POST /refresh-token     → get new accessToken (update variable)
5. POST /change-password   → use current accessToken
6. POST /forgot-password   → get reset token (check Redis or email)
7. POST /reset-password    → paste token + new password
8. POST /login             → login with new password
9. POST /logout            → session fully cleared
```

---

## Password Rules

Passwords must be **8–128 characters** and contain:
- Uppercase letter (A–Z)
- Lowercase letter (a–z)
- Number (0–9)
- Special character: `@ $ ! % * ? & . , - _ # ^ ( )`

**Example valid passwords:** `Test@1234` · `Hello#World1` · `Secure$Pass9`

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| `/register` | 10 requests / 15 minutes per IP |
| `/login` | 10 requests / 15 minutes per IP |
| `/forgot-password` | 10 requests / 15 minutes per IP |
| `/resend-verification-email` | 10 requests / 15 minutes per IP |
| All other endpoints | 100 requests / 1 minute per IP (global) |

Account lockout: **5 failed logins → 15 minute lockout** (per email, tracked in Redis)

---

## How to Find Dev Tokens in Redis

When SMTP is not configured, retrieve tokens directly from Redis:

```bash
# List all active verification tokens
redis-cli KEYS "emailVerify:*"
# Output example: emailVerify:a3f8c2d1e4b5...  ← the part after 'emailVerify:' IS the token

# List all active password reset tokens
redis-cli KEYS "pwReset:*"
# Output example: pwReset:b7e2a3d1c4f5... ← the part after 'pwReset:' IS the token

# Check what userId a token maps to
redis-cli GET emailVerify:<paste-64-char-token-here>

# Check how long a token has left to live (seconds)
redis-cli TTL emailVerify:<paste-64-char-token-here>
```

> 💡 **Token extraction tip**: The token is the 64-character hex string that forms the *key suffix*.
> For example, if `KEYS "emailVerify:*"` returns `emailVerify:a3f8...e61b`,
> then `a3f8...e61b` is the token to paste into the `token` field of `/verify-email`.
