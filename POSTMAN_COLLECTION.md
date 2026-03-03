# LexAI — Complete Postman Collection

> **Base URL:** `http://localhost:3500/api/v1`
> **Local Port:** `3500` (set in `.env`)
> **API Version:** `v1` (set in `.env`)

---

## 📌 Postman Environment Variables

Create a Postman **Environment** with these variables:

| Variable          | Initial Value                      | Description                         |
|-------------------|------------------------------------|-------------------------------------|
| `base_url`        | `http://localhost:3500/api/v1`     | Base API URL                        |
| `access_token`    | *(set after login)*                | JWT access token (Bearer)           |
| `refresh_token`   | *(auto-set via cookie)*            | Set as HttpOnly cookie by server    |
| `org_id`          | *(set after createOrg)*            | MongoDB ObjectId of your org        |
| `contract_id`     | *(set after upload)*               | MongoDB ObjectId of a contract      |
| `analysis_id`     | *(set after requestAnalysis)*      | MongoDB ObjectId of an analysis     |
| `user_id`         | *(set after login)*                | MongoDB ObjectId of your user       |
| `otp`             | *(from email / dev response)*      | 6-digit OTP for email verification  |
| `reset_token`     | *(from forgot-password email)*     | Hex token for password reset        |
| `session_jti`     | *(from GET /auth/sessions)*        | UUID JTI of a session to revoke     |
| `invite_token`    | *(from invitation email)*          | Invitation acceptance token         |

> 🔒 **Protected routes** require: `Authorization: Bearer {{access_token}}`
> 🍪 **Refresh token**: automatically stored as HttpOnly cookie named `refreshToken`

---

## 🏥 1. Health Check

No authentication required. Used by Docker / load balancers.

---

### GET — Health Check

```
GET http://localhost:3500/health
```

**Headers:** _(none)_

**Success Response (200 — all healthy):**
```json
{
  "status": "ok",
  "services": {
    "mongodb": "up",
    "redis": "up",
    "rabbitmq": "up"
  },
  "timestamp": "2026-03-03T17:50:00.000Z",
  "uptime": 3600
}
```

**Degraded Response (503):**
```json
{
  "status": "degraded",
  "services": { "mongodb": "up", "redis": "down", "rabbitmq": "up" },
  "timestamp": "2026-03-03T17:50:00.000Z",
  "uptime": 100
}
```

---

## 🔐 2. Auth — `/api/v1/auth`

> Rate-limited. Public endpoints do NOT need a token.

---

### POST — Register

```
POST {{base_url}}/auth/register
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Vishal Sanam",
  "email": "vishal@example.com",
  "password": "SecurePass@123"
}
```

**Password rules:** min 8 chars, must contain uppercase, lowercase, digit, special char (`@$!%*?&.,\-_#^()`).

**Success Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. A 6-digit OTP has been sent to your email.",
  "data": {
    "userId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "email": "vishal@example.com",
    "otp": "482910"
  }
}
```

> ⚠️ `otp` is only included in the response in **development** mode. In production it is only sent by email.

---

### POST — Verify Email (OTP)

```
POST {{base_url}}/auth/verify-email
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "vishal@example.com",
  "otp": "{{otp}}"
}
```

OTP is exactly 6 digits. Expires in 10 minutes.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now log in."
}
```

---

### POST — Resend Verification Email

```
POST {{base_url}}/auth/resend-verification-email
```

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

**Success Response (200):**
```json
{
  "success": true,
  "message": "If this email exists and is unverified, a new OTP has been sent."
}
```

---

### POST — Login

```
POST {{base_url}}/auth/login
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "vishal@example.com",
  "password": "SecurePass@123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Vishal Sanam",
      "email": "vishal@example.com",
      "role": "admin"
    }
  }
}
```

> 🍪 The server also sets a `refreshToken` HttpOnly cookie automatically.
> Copy `data.accessToken` → Postman env var `access_token`.
> Copy `data.user.id` → Postman env var `user_id`.

---

### POST — Refresh Access Token

```
POST {{base_url}}/auth/refresh-token
```

**Headers:** _(none needed — reads `refreshToken` cookie automatically)_

**Body:** _(empty — no body required)_

> In Postman: Go to **Settings → Cookies** → ensure cookie `refreshToken` from `localhost` is passed.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn..."
  }
}
```

---

### POST — Forgot Password

```
POST {{base_url}}/auth/forgot-password
```

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

**Success Response (200):**
```json
{
  "success": true,
  "message": "If this email is registered, a password reset link has been sent."
}
```

> The reset token is emailed. Copy the token from the email link into the `reset_token` env var.

---

### POST — Reset Password

```
POST {{base_url}}/auth/reset-password
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "token": "{{reset_token}}",
  "password": "NewSecurePass@456"
}
```

Token is a 64-character hex string. Expires in 1 hour.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

---

### POST — Logout _(🔒 Protected)_

```
POST {{base_url}}/auth/logout
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

> Blacklists both access and refresh tokens in Redis. Cookie is cleared.

---

### POST — Change Password _(🔒 Protected)_

```
POST {{base_url}}/auth/change-password
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "currentPassword": "SecurePass@123",
  "newPassword": "NewSecurePass@456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

---

### GET — List Sessions _(🔒 Protected)_

```
GET {{base_url}}/auth/sessions
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

Lists all active refresh token sessions for your account.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      { "jti": "a1b2c3d4-e5f6-...", "createdAt": "2026-03-01T10:00:00Z" }
    ]
  }
}
```

> Copy a `jti` value into `session_jti` env var to use below.

---

### DELETE — Revoke Session by JTI _(🔒 Protected)_

```
DELETE {{base_url}}/auth/sessions/{{session_jti}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Session revoked."
}
```

---

### DELETE — Revoke All Sessions _(🔒 Protected)_

```
DELETE {{base_url}}/auth/sessions
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

Logs you out from all devices.

**Success Response (200):**
```json
{
  "success": true,
  "message": "All sessions revoked."
}
```

---

## 👤 3. Users — `/api/v1/users`

> All routes require `Authorization: Bearer {{access_token}}`

---

### GET — Get My Profile _(🔒 Protected)_

```
GET {{base_url}}/users/me
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Vishal Sanam",
      "email": "vishal@example.com",
      "role": "admin",
      "isVerified": true
    }
  }
}
```

---

### PATCH — Update My Profile _(🔒 Protected)_

```
PATCH {{base_url}}/users/me
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Vishal S."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Vishal S.",
      "email": "vishal@example.com"
    }
  }
}
```

---

### PATCH — Change My Password (via users) _(🔒 Protected)_

```
PATCH {{base_url}}/users/me/password
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "currentPassword": "SecurePass@123",
  "newPassword": "AnotherPass@789"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

---

### GET — Get User by ID _(🔒 Protected — Admin Only)_

```
GET {{base_url}}/users/{{user_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

---

## 🏢 4. Organizations — `/api/v1/orgs`

> All routes require `Authorization: Bearer {{access_token}}`

---

### POST — Create Organization _(🔒 Protected)_

```
POST {{base_url}}/orgs
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "LexAI Legal Ltd"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d2",
      "name": "LexAI Legal Ltd",
      "slug": "lexai-legal-ltd",
      "plan": "free",
      "memberCount": 1
    }
  }
}
```

> Copy `data.org.id` → `org_id` env var.

---

### GET — Get Organization _(🔒 Protected)_

```
GET {{base_url}}/orgs/{{org_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "org": { ... } }
}
```

---

### PATCH — Update Organization _(🔒 Protected — Admin/Manager)_

```
PATCH {{base_url}}/orgs/{{org_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "LexAI Legal Group"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "org": { ... } }
}
```

---

### POST — Invite Member _(🔒 Protected — Admin/Manager)_

```
POST {{base_url}}/orgs/{{org_id}}/invite
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "newmember@example.com",
  "role": "viewer"
}
```

Roles: `"admin"`, `"manager"`, `"viewer"` (default: `"viewer"`).

**Success Response (200):**
```json
{
  "success": true,
  "message": "Invitation sent to newmember@example.com",
  "data": {
    "invitationId": "65f1a2b3c4d5e6f7a8b9c0d3",
    "expiresAt": "2026-03-10T17:00:00.000Z"
  }
}
```

---

### POST — Accept Invitation _(Public — No token required)_

```
POST {{base_url}}/orgs/{{org_id}}/invite/accept
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "token": "{{invite_token}}",
  "name": "New Member",
  "password": "Welcome@123"
}
```

`name` and `password` are required if the user is new (no existing account).

**Success Response (200):**
```json
{
  "success": true,
  "message": "Invitation accepted. Your account has been created.",
  "data": { ... }
}
```

---

### PATCH — Change Member Role _(🔒 Protected — Admin only)_

```
PATCH {{base_url}}/orgs/{{org_id}}/members/{{user_id}}/role
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "role": "manager"
}
```

Roles: `"admin"`, `"manager"`, `"viewer"`.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Member role updated successfully."
}
```

---

### DELETE — Remove Member _(🔒 Protected — Admin only)_

```
DELETE {{base_url}}/orgs/{{org_id}}/members/{{user_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Member removed from organization."
}
```

---

## 📄 5. Contracts — `/api/v1/contracts`

> All routes require `Authorization: Bearer {{access_token}}` + org membership.
> The server resolves `orgId` automatically from your JWT.

---

### POST — Upload Contract (File) _(🔒 Protected)_

```
POST {{base_url}}/contracts
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body (form-data):**
| Key       | Type | Value                        |
|-----------|------|------------------------------|
| `file`    | File | Select a `.pdf`, `.docx`, or `.txt` file (max 5MB) |
| `title`   | Text | `Service Agreement 2026`     |
| `type`    | Text | `NDA`                        |
| `tags`    | Text | `["legal","2026"]`           |

Types: `NDA`, `Vendor`, `Employment`, `SaaS`, `Other`.

**Success Response (201):**
```json
{
  "success": true,
  "message": "Contract uploaded successfully",
  "data": {
    "contract": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d4",
      "title": "Service Agreement 2026",
      "type": "NDA",
      "version": 1,
      "contentHash": "abc123def456..."
    }
  }
}
```

> Copy `data.contract.id` → `contract_id` env var.

---

### POST — Upload Contract (Raw Text) _(🔒 Protected)_

```
POST {{base_url}}/contracts
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "title": "Simple NDA Agreement",
  "type": "NDA",
  "content": "This Non-Disclosure Agreement is entered into as of March 1, 2026, between Party A and Party B. Both parties agree to keep all shared information confidential...",
  "tags": ["nda", "confidential"],
  "expiryDate": "2027-03-01",
  "jurisdiction": "India"
}
```

`content` must be at least 50 characters.

---

### GET — List Contracts _(🔒 Protected)_

```
GET {{base_url}}/contracts
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Query Parameters (all optional):**
| Param    | Type   | Default      | Options                                        |
|----------|--------|--------------|------------------------------------------------|
| `page`   | number | 1            |                                                |
| `limit`  | number | 10           | 1–100                                          |
| `sortBy` | string | `createdAt`  | `createdAt`, `title`, `type`, `riskScore`, `expiryDate` |
| `order`  | string | `desc`       | `asc`, `desc`                                  |
| `type`   | string | _(none)_     | `NDA`, `Vendor`, `Employment`, `SaaS`, `Other` |
| `tag`    | string | _(none)_     | any tag string                                 |
| `search` | string | _(none)_     | full-text search in title                      |

**Example:**
```
GET {{base_url}}/contracts?page=1&limit=10&type=NDA&order=desc
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "contracts": [ ... ],
    "meta": { "total": 25, "page": 1, "limit": 10, "totalPages": 3 }
  }
}
```

---

### GET — Get Contract by ID _(🔒 Protected)_

```
GET {{base_url}}/contracts/{{contract_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "contract": { ... } }
}
```

---

### PATCH — Update Contract _(🔒 Protected)_

```
PATCH {{base_url}}/contracts/{{contract_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON — all fields optional):**
```json
{
  "title": "Updated NDA Agreement",
  "type": "NDA",
  "tags": ["updated", "nda"],
  "alertDays": [30, 7],
  "expiryDate": "2027-06-01"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "contract": { ... } }
}
```

---

### DELETE — Delete Contract _(🔒 Protected — Admin/Manager only)_

```
DELETE {{base_url}}/contracts/{{contract_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Contract deleted successfully."
}
```

---

### POST — Upload New Version _(🔒 Protected)_

```
POST {{base_url}}/contracts/{{contract_id}}/versions
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "content": "Revised NDA Agreement text. This agreement is entered into as of March 1, 2026, between Party A and Party B...",
  "changeNote": "Updated confidentiality clause in section 3."
}
```

`content` must be at least 50 characters.

**Success Response (201):**
```json
{
  "success": true,
  "data": { "version": 2, ... }
}
```

---

### GET — List Versions _(🔒 Protected)_

```
GET {{base_url}}/contracts/{{contract_id}}/versions
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "versions": [ { "version": 1, ... }, { "version": 2, ... } ] }
}
```

---

### POST — Compare Versions _(🔒 Protected — Pro/Enterprise)_

```
POST {{base_url}}/contracts/{{contract_id}}/compare
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "versionA": 1,
  "versionB": 2
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "diff": "...", "summary": "..." }
}
```

---

### GET — Audit Trail _(🔒 Protected)_

```
GET {{base_url}}/contracts/{{contract_id}}/audit
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "action": "contract.created",
        "userId": "...",
        "timestamp": "2026-03-01T10:00:00Z"
      }
    ]
  }
}
```

---

## 🤖 6. Analyses — `/api/v1/analyses`

> All routes require `Authorization: Bearer {{access_token}}` + org membership.

---

### POST — Request AI Analysis _(🔒 Protected)_

```
POST {{base_url}}/analyses
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "contractId": "{{contract_id}}",
  "version": 1
}
```

`version` is optional. If omitted, the latest version is analysed.

**Success Response — Cached (200):**
```json
{
  "success": true,
  "message": "Analysis result retrieved from cache.",
  "data": { "cached": true, "analysis": { ... } }
}
```

**Success Response — Queued (202):**
```json
{
  "success": true,
  "message": "Analysis job queued. You will receive a WebSocket notification when complete.",
  "data": {
    "analysisId": "65f1a2b3c4d5e6f7a8b9c0d5",
    "status": "pending",
    "estimatedSeconds": 30
  }
}
```

> Copy `data.analysisId` → `analysis_id` env var.

---

### GET — Get Analysis by ID _(🔒 Protected)_

```
GET {{base_url}}/analyses/{{analysis_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "_id": "65f1a2b3c4d5e6f7a8b9c0d5",
      "contractId": "...",
      "status": "completed",
      "riskScore": 7.2,
      "summary": "This NDA contains standard confidentiality clauses...",
      "flags": ["missing_penalty_clause", "jurisdiction_mismatch"]
    }
  }
}
```

---

### GET — Get All Analyses for a Contract _(🔒 Protected)_

```
GET {{base_url}}/analyses/contract/{{contract_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "analyses": [ { ... }, { ... } ]
  }
}
```

---

## 🔔 7. Notifications — `/api/v1/notifications`

> All routes require `Authorization: Bearer {{access_token}}`

---

### GET — List Notifications _(🔒 Protected)_

```
GET {{base_url}}/notifications
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Query Parameters (optional):**
| Param   | Type    | Default | Description                     |
|---------|---------|---------|---------------------------------|
| `page`  | number  | 1       |                                 |
| `limit` | number  | 20      |                                 |
| `read`  | boolean | _(all)_ | `true` or `false` to filter     |

**Example:**
```
GET {{base_url}}/notifications?read=false&page=1&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "notifications": [ { ... } ],
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET — Get Unread Count _(🔒 Protected)_

```
GET {{base_url}}/notifications/unread-count
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "unreadCount": 3
}
```

---

### PATCH — Mark All as Read _(🔒 Protected)_

```
PATCH {{base_url}}/notifications/read-all
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "modifiedCount": 3
}
```

---

### PATCH — Mark One as Read _(🔒 Protected)_

```
PATCH {{base_url}}/notifications/{{notification_id}}/read
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Body:** _(empty)_

**Success Response (200):**
```json
{
  "success": true,
  "notification": { "_id": "...", "read": true, "readAt": "2026-03-03T17:00:00Z" }
}
```

---

## 🌍 8. Enrichment — `/api/v1/enrichment`

> All routes require `Authorization: Bearer {{access_token}}`
> These call external public APIs. Non-critical — degrade gracefully.

---

### GET — Country Info _(🔒 Protected)_

```
GET {{base_url}}/enrichment/country/India
```

Replace `India` with any country name (min 2 characters).

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "country": {
    "name": "India",
    "capital": "New Delhi",
    "currency": { "INR": { "name": "Indian rupee", "symbol": "₹" } },
    "region": "Asia",
    "flag": "🇮🇳"
  }
}
```

---

### GET — World Time _(🔒 Protected)_

```
GET {{base_url}}/enrichment/time/Asia/Kolkata
```

Replace `Asia/Kolkata` with any valid IANA timezone (e.g. `America/New_York`, `Europe/London`).

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "time": {
    "timezone": "Asia/Kolkata",
    "datetime": "2026-03-03T22:50:00.000+05:30",
    "utc_offset": "+05:30"
  }
}
```

---

### GET — Check Holiday _(🔒 Protected)_

```
GET {{base_url}}/enrichment/holidays?country=IN&date=2026-03-15
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Query Parameters (required):**
| Param     | Description                         | Example        |
|-----------|-------------------------------------|----------------|
| `country` | ISO 2-letter country code           | `IN`, `US`, `GB` |
| `date`    | Date to check in `YYYY-MM-DD` format | `2026-03-15`   |

**Success Response (200):**
```json
{
  "success": true,
  "holiday": {
    "isHoliday": false,
    "holidays": []
  }
}
```

---

## 🛡️ 9. Admin — `/api/v1/admin`

> All routes require `Authorization: Bearer {{access_token}}` + **`role: admin`**.

---

### GET — Platform Stats _(🔒 Admin only)_

```
GET {{base_url}}/admin/stats
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalUsers": 42,
      "totalOrgs": 8,
      "totalContracts": 156,
      "totalAnalyses": 89,
      "analysesLast30Days": 23,
      "averageRiskScore": 6.4,
      "queueDepth": 0
    }
  }
}
```

---

### GET — Queue Status _(🔒 Admin only)_

```
GET {{base_url}}/admin/queue/status
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "queue": {
      "name": "lexai.analysis.queue",
      "messageCount": 0,
      "consumerCount": 1,
      "dlxMessageCount": 0
    }
  }
}
```

---

### GET — List All Users _(🔒 Admin only)_

```
GET {{base_url}}/admin/users
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Query Parameters (optional):**
| Param   | Default |
|---------|---------|
| `page`  | 1       |
| `limit` | 20      |

**Example:**
```
GET {{base_url}}/admin/users?page=1&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [ { ... }, { ... } ],
    "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
  }
}
```

---

### GET — Audit Logs _(🔒 Admin only)_

```
GET {{base_url}}/admin/audit-logs
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Query Parameters (optional):**
| Param      | Description                      |
|------------|----------------------------------|
| `page`     | Page number (default: 1)         |
| `limit`    | Results per page (default: 20)   |
| `orgId`    | Filter by organisation           |
| `userId`   | Filter by user                   |
| `action`   | Filter by action (e.g. `user.login`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [ { "action": "user.login", "userId": "...", "timestamp": "..." } ],
    "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
  }
}
```

---

## ⚠️ Common Error Responses

All errors follow this shape:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Access token is missing or invalid."
  }
}
```

| HTTP Code | Error Code          | Meaning                                    |
|-----------|---------------------|--------------------------------------------|
| `400`     | `VALIDATION_ERROR`  | Request body failed Joi validation         |
| `400`     | `FILE_TOO_LARGE`    | Uploaded file exceeds 5MB                  |
| `400`     | `UPLOAD_ERROR`      | Unsupported file type or multer error      |
| `401`     | `UNAUTHORIZED`      | Missing or expired access token            |
| `401`     | `TOKEN_EXPIRED`     | JWT access token has expired               |
| `403`     | `FORBIDDEN`         | Role not authorized for this action        |
| `404`     | `NOT_FOUND`         | Resource not found                         |
| `409`     | `CONFLICT`          | Duplicate resource (e.g. email taken)      |
| `429`     | `TOO_MANY_REQUESTS` | Rate limit exceeded                        |
| `500`     | `INTERNAL_ERROR`    | Unexpected server error                    |
| `503`     | _(health check)_    | One or more services are down              |

---

## 🔄 Recommended Testing Order

```
1.  GET  /health                           ← Verify all services are up
2.  POST /auth/register                    ← Create account; copy otp from dev response
3.  POST /auth/verify-email                ← Verify OTP
4.  POST /auth/login                       ← Copy access_token + user_id
5.  GET  /auth/sessions                    ← Copy a jti → session_jti
6.  POST /orgs                             ← Create org; copy org_id
7.  POST /contracts (file or JSON)         ← Upload; copy contract_id
8.  GET  /contracts                        ← List contracts
9.  GET  /contracts/{{contract_id}}        ← View single contract
10. POST /analyses                         ← Queue analysis; copy analysis_id
11. GET  /analyses/{{analysis_id}}         ← Poll for result
12. GET  /notifications/unread-count       ← Check badge count
13. GET  /notifications                    ← View notifications
14. GET  /enrichment/country/India         ← Test enrichment
15. GET  /admin/stats                      ← Admin token only
16. POST /auth/logout                      ← Blacklist tokens
```
