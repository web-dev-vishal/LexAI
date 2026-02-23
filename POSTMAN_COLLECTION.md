# LexAI — Postman API Reference

> **Base URL:** `http://localhost:3100/api/v1`
> **Content-Type:** `application/json` (unless uploading files)

---

## 🔐 1. Authentication

### 1.1 Register

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/register` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "name": "Vishal Sanam",
  "email": "vishal@lexai.io",
  "password": "MySecure@Pass123"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f60012345678",
      "name": "Vishal Sanam",
      "email": "vishal@lexai.io",
      "role": "viewer",
      "emailVerified": false
    }
  },
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Error Response (409 — duplicate email):**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_KEY",
    "message": "A record with this email already exists.",
    "requestId": "a3f1e7c2-84ab-4b9e-b9d2-1234567890ab"
  }
}
```

---

### 1.2 Verify Email

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/verify-email` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "token": "c5f6a7b8-9d0e-1f2a-3b4c-5d6e7f8a9b0c"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now log in."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired verification token.",
    "requestId": "b4c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e"
  }
}
```

---

### 1.3 Login

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/login` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "email": "vishal@lexai.io",
  "password": "MySecure@Pass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NWExYjJjM2Q0ZTVmNjAwMTIzNDU2NzgiLCJvcmdJZCI6IjY1YTFiMmMzZDRlNWY2MDAxMjM0NTY3OSIsInJvbGUiOiJhZG1pbiIsImp0aSI6ImMxZDJlM2Y0LTU2NzgtOWFiYy1kZWYwLTEyMzQ1Njc4OWFiYyIsImlhdCI6MTcwOTEyMzQ1NiwiZXhwIjoxNzA5MTI0MzU2fQ.abc123signature",
    "user": {
      "id": "65a1b2c3d4e5f60012345678",
      "name": "Vishal Sanam",
      "email": "vishal@lexai.io",
      "role": "admin"
    }
  },
  "message": "Login successful"
}
```

> **Note:** The `refreshToken` is automatically set as an HttpOnly cookie — not visible in the response body.

**Error Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password.",
    "requestId": "c5d6e7f8-a9b0-c1d2-e3f4-567890abcdef"
  }
}
```

---

### 1.4 Refresh Token

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/refresh-token` |
| **Headers** | `Content-Type: application/json` |
| **Cookies** | `refreshToken=<token>` (auto-sent by browser) |

**Request Body:** _None_

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**
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

### 1.5 Logout

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/logout` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Request Body:** _None_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 1.6 Forgot Password

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/forgot-password` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "email": "vishal@lexai.io"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "If this email exists, a reset link has been sent."
}
```

---

### 1.7 Reset Password

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/auth/reset-password` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "token": "d7e8f9a0-b1c2-d3e4-f5a6-789012345678",
  "password": "NewSecure@Pass456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

---

## 👤 2. Users

### 2.1 Get My Profile

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/users/me` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f60012345678",
      "name": "Vishal Sanam",
      "email": "vishal@lexai.io",
      "role": "admin",
      "emailVerified": true,
      "isActive": true,
      "organization": {
        "name": "LexAI Corp",
        "plan": "pro"
      },
      "quota": {
        "used": 12,
        "limit": 50,
        "remaining": 38,
        "resetsAt": "2026-03-01T00:00:00.000Z"
      },
      "createdAt": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

---

### 2.2 Update My Profile

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/users/me` |
| **Headers** | `Authorization: Bearer <accessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "name": "Vishal S."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f60012345678",
      "name": "Vishal S.",
      "email": "vishal@lexai.io",
      "role": "admin"
    }
  }
}
```

---

### 2.3 Change Password

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/users/me/password` |
| **Headers** | `Authorization: Bearer <accessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "currentPassword": "MySecure@Pass123",
  "newPassword": "EvenMore@Secure789"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Current password is incorrect."
  }
}
```

---

### 2.4 Get User by ID (Admin Only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/users/65a1b2c3d4e5f60012345678` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f60012345678",
      "name": "Vishal Sanam",
      "email": "vishal@lexai.io",
      "role": "admin",
      "organization": {
        "name": "LexAI Corp",
        "plan": "pro"
      }
    }
  }
}
```

---

## 🏢 3. Organizations

### 3.1 Create Organization

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/orgs` |
| **Headers** | `Authorization: Bearer <accessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "name": "LexAI Corp"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "65a1b2c3d4e5f60012345679",
      "name": "LexAI Corp",
      "slug": "lexai-corp",
      "plan": "free",
      "memberCount": 1
    }
  }
}
```

---

### 3.2 Get Organization

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "65a1b2c3d4e5f60012345679",
      "name": "LexAI Corp",
      "slug": "lexai-corp",
      "plan": "pro",
      "members": [
        { "userId": "65a1b2c3d4e5f60012345678", "role": "admin", "joinedAt": "2026-01-15T10:30:00.000Z" }
      ],
      "contractCount": 42
    }
  }
}
```

---

### 3.3 Update Organization (Admin/Manager)

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679` |
| **Headers** | `Authorization: Bearer <accessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "name": "LexAI International"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "65a1b2c3d4e5f60012345679",
      "name": "LexAI International",
      "slug": "lexai-corp"
    }
  }
}
```

---

### 3.4 Invite Member (Admin/Manager)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679/invite` |
| **Headers** | `Authorization: Bearer <accessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "email": "teammate@company.com",
  "role": "manager"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Invitation sent to teammate@company.com",
  "data": {
    "invitationId": "65a1b2c3d4e5f6001234567a",
    "expiresAt": "2026-02-24T18:00:00.000Z"
  }
}
```

---

### 3.5 Accept Invite

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679/invite/accept` |
| **Headers** | `Content-Type: application/json` |

**Request Body:**
```json
{
  "token": "e8f9a0b1-c2d3-e4f5-a6b7-890123456789",
  "name": "New Teammate",
  "password": "Teammate@Pass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Invitation accepted. Your account has been created.",
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f6001234567b",
      "name": "New Teammate",
      "email": "teammate@company.com",
      "role": "manager"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 3.6 Change Member Role (Admin Only)

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679/members/65a1b2c3d4e5f6001234567b/role` |
| **Headers** | `Authorization: Bearer <adminAccessToken>`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "role": "viewer"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Member role updated successfully."
}
```

---

### 3.7 Remove Member (Admin Only)

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `http://localhost:3100/api/v1/orgs/65a1b2c3d4e5f60012345679/members/65a1b2c3d4e5f6001234567b` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Member removed from organization."
}
```

---

## 📄 4. Contracts

### 4.1 Upload Contract (File)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/contracts` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Request Body (form-data):**

| Key | Type | Value |
|---|---|---|
| `title` | Text | `Acme Corp NDA Agreement 2026` |
| `type` | Text | `NDA` |
| `tags` | Text | `["confidential", "acme", "2026"]` |
| `file` | File | `acme_nda.pdf` |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Contract uploaded successfully",
  "data": {
    "contract": {
      "id": "65a1b2c3d4e5f6001234567c",
      "title": "Acme Corp NDA Agreement 2026",
      "type": "NDA",
      "version": 1,
      "contentHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    }
  }
}
```

---

### 4.2 Upload Contract (Text)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/contracts` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "title": "Freelance Software Development Agreement",
  "type": "Vendor",
  "tags": ["freelance", "software", "development"],
  "content": "This Software Development Agreement (the 'Agreement') is entered into effective as of January 15, 2026, by and between Acme Corporation, a Delaware corporation with offices at 123 Tech Drive, San Francisco, CA 94105 ('Client'), and John Developer, an individual residing at 456 Code Avenue, Austin, TX 78701 ('Developer'). The Developer agrees to provide software development services as described in Exhibit A attached hereto."
}
```

---

### 4.3 List Contracts

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/contracts?page=1&limit=10&sortBy=createdAt&order=desc&type=NDA` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "contracts": [
      {
        "id": "65a1b2c3d4e5f6001234567c",
        "title": "Acme Corp NDA Agreement 2026",
        "type": "NDA",
        "tags": ["confidential", "acme", "2026"],
        "currentVersion": 1,
        "expiryDate": "2027-01-15T00:00:00.000Z",
        "daysUntilExpiry": 327,
        "createdAt": "2026-02-22T12:30:00.000Z"
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 4.4 Get Contract by ID

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "contract": {
      "id": "65a1b2c3d4e5f6001234567c",
      "title": "Acme Corp NDA Agreement 2026",
      "type": "NDA",
      "tags": ["confidential", "acme", "2026"],
      "content": "This Non-Disclosure Agreement...",
      "contentHash": "a1b2c3d4...",
      "currentVersion": 2,
      "versions": [
        { "versionNumber": 1, "uploadedAt": "2026-02-22T12:30:00.000Z", "changeNote": null },
        { "versionNumber": 2, "uploadedAt": "2026-02-22T14:00:00.000Z", "changeNote": "Updated termination clause" }
      ],
      "parties": [
        { "name": "Acme Corporation", "role": "Disclosing Party" },
        { "name": "Tech Solutions Inc.", "role": "Receiving Party" }
      ],
      "effectiveDate": "2026-01-15T00:00:00.000Z",
      "expiryDate": "2027-01-15T00:00:00.000Z",
      "alertDays": [90, 60, 30, 7],
      "createdAt": "2026-02-22T12:30:00.000Z"
    }
  }
}
```

---

### 4.5 Update Contract

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "title": "Acme Corp NDA — Revised",
  "tags": ["confidential", "acme", "revised"],
  "alertDays": [60, 30, 14, 7]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "contract": {
      "id": "65a1b2c3d4e5f6001234567c",
      "title": "Acme Corp NDA — Revised",
      "tags": ["confidential", "acme", "revised"]
    }
  }
}
```

---

### 4.6 Upload New Version

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c/versions` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "content": "This revised Non-Disclosure Agreement (the 'Agreement') is entered into effective as of February 22, 2026, by and between Acme Corporation and Tech Solutions Inc. This version includes updated termination provisions requiring 60 days written notice, replacing the previous 30-day notice period.",
  "changeNote": "Updated termination clause from 30 to 60 days notice"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "version": 2,
    "contentHash": "f0e1d2c3b4a59687...",
    "changeNote": "Updated termination clause from 30 to 60 days notice"
  }
}
```

---

### 4.7 Get Version History

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c/versions` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "versions": [
      { "versionNumber": 1, "contentHash": "a1b2c3d4...", "uploadedAt": "2026-02-22T12:30:00.000Z", "changeNote": null },
      { "versionNumber": 2, "contentHash": "f0e1d2c3...", "uploadedAt": "2026-02-22T14:00:00.000Z", "changeNote": "Updated termination clause" }
    ]
  }
}
```

---

### 4.8 Compare Versions

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c/compare` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "versionA": 1,
  "versionB": 2
}
```

**Success Response (202):**
```json
{
  "success": true,
  "message": "Version comparison queued. You will be notified via WebSocket when complete.",
  "data": {
    "jobId": "diff-a1b2c3d4-e5f6-7890-abcd-ef0123456789",
    "contractId": "65a1b2c3d4e5f6001234567c",
    "versionA": 1,
    "versionB": 2
  }
}
```

---

### 4.9 Delete Contract (Admin/Manager)

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Contract deleted successfully."
}
```

---

### 4.10 Get Contract Audit Trail

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/contracts/65a1b2c3d4e5f6001234567c/audit` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "65a1b2c3d4e5f6001234567d",
        "action": "contract.uploaded",
        "userId": "65a1b2c3d4e5f60012345678",
        "resourceType": "Contract",
        "ipAddress": "127.0.0.1",
        "createdAt": "2026-02-22T12:30:00.000Z"
      }
    ]
  }
}
```

---

## 🤖 5. Analyses

### 5.1 Request Analysis

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:3100/api/v1/analyses` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679`, `Content-Type: application/json` |

**Request Body:**
```json
{
  "contractId": "65a1b2c3d4e5f6001234567c",
  "version": 1
}
```

**Success Response (202 — Queued):**
```json
{
  "success": true,
  "message": "Analysis job queued. You will receive a WebSocket notification when complete.",
  "data": {
    "analysisId": "65a1b2c3d4e5f6001234567e",
    "status": "pending",
    "estimatedSeconds": 30
  }
}
```

**Success Response (200 — Cached):**
```json
{
  "success": true,
  "message": "Analysis result retrieved from cache.",
  "data": {
    "cached": true,
    "analysisId": "65a1b2c3d4e5f6001234567e",
    "summary": "This NDA is a standard mutual non-disclosure agreement...",
    "riskScore": 35,
    "riskLevel": "medium"
  }
}
```

**Error Response (429 — Quota exceeded):**
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You have used all 3 analyses for this month.",
    "details": [{
      "quota": { "used": 3, "limit": 3, "resetsAt": "2026-03-01T00:00:00.000Z" }
    }]
  }
}
```

---

### 5.2 Get Analysis Result

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/analyses/65a1b2c3d4e5f6001234567e` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "id": "65a1b2c3d4e5f6001234567e",
      "contractId": "65a1b2c3d4e5f6001234567c",
      "version": 1,
      "status": "completed",
      "summary": "This NDA is a standard mutual non-disclosure agreement between Acme Corporation and Tech Solutions Inc. It contains generally favorable terms with some risk areas in the non-compete and IP assignment clauses.",
      "riskScore": 35,
      "riskLevel": "medium",
      "clauses": [
        {
          "title": "Confidentiality Obligation",
          "content": "Both parties agree to maintain strict confidentiality...",
          "flag": "green",
          "explanation": "Standard mutual confidentiality clause with reasonable scope.",
          "suggestion": "No changes needed."
        },
        {
          "title": "Non-Compete Clause",
          "content": "The Receiving Party shall not engage in...",
          "flag": "red",
          "explanation": "This non-compete extends 24 months post-termination, which is unusually long and may not be enforceable in some jurisdictions.",
          "suggestion": "Negotiate to reduce from 24 months to 12 months, and narrow the geographic scope."
        }
      ],
      "obligations": {
        "yourObligations": [
          "Maintain confidentiality for 3 years after agreement termination",
          "Return all confidential materials within 30 days of termination",
          "Immediately notify the disclosing party of any unauthorized disclosure"
        ],
        "otherPartyObligations": [
          "Provide written notice 30 days before disclosing information to third parties",
          "Maintain records of all shared confidential information"
        ]
      },
      "keyDates": {
        "effectiveDate": "2026-01-15",
        "expiryDate": "2027-01-15",
        "renewalDate": null,
        "noticePeriod": "30 days"
      },
      "aiModel": "meta-llama/llama-3.1-8b-instruct:free",
      "tokensUsed": 4250,
      "processingTimeMs": 8432,
      "createdAt": "2026-02-22T12:35:00.000Z"
    }
  }
}
```

---

### 5.3 Get Analyses by Contract

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/analyses/contract/65a1b2c3d4e5f6001234567c` |
| **Headers** | `Authorization: Bearer <accessToken>`, `x-org-id: 65a1b2c3d4e5f60012345679` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "analyses": [
      { "id": "65a1b2c3d4e5f6001234567e", "version": 1, "status": "completed", "riskScore": 35, "riskLevel": "medium" },
      { "id": "65a1b2c3d4e5f6001234567f", "version": 2, "status": "pending", "riskScore": null, "riskLevel": null }
    ]
  }
}
```

---

## 🛡️ 6. Admin (Requires `admin` Role)

### 6.1 Platform Stats

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/admin/stats` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalUsers": 127,
      "totalOrgs": 34,
      "totalContracts": 892,
      "totalAnalyses": 1456,
      "analysesLast30Days": 312,
      "averageRiskScore": 41.3,
      "queueDepth": 5
    }
  }
}
```

---

### 6.2 Queue Status

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/admin/queue/status` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "queue": {
      "name": "lexai.analysis.queue",
      "messageCount": 5,
      "consumerCount": 2,
      "dlxMessageCount": 1
    }
  }
}
```

---

### 6.3 List All Users

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/admin/users?page=1&limit=20` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      { "id": "65a1b2c3d4e5f60012345678", "name": "Vishal Sanam", "email": "vishal@lexai.io", "role": "admin", "isActive": true }
    ],
    "meta": { "total": 127, "page": 1, "limit": 20, "totalPages": 7, "hasNextPage": true, "hasPrevPage": false }
  }
}
```

---

### 6.4 Global Audit Logs

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/admin/audit-logs?page=1&limit=50` |
| **Headers** | `Authorization: Bearer <adminAccessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      { "id": "65a1b2c3d4e5f60012345680", "action": "user.login", "userId": "65a1b2c3d4e5f60012345678", "ipAddress": "127.0.0.1", "createdAt": "2026-02-22T12:00:00.000Z" }
    ],
    "meta": { "total": 4200, "page": 1, "limit": 50, "totalPages": 84, "hasNextPage": true, "hasPrevPage": false }
  }
}
```

---

## 🔔 7. Notifications

### 7.1 List Notifications

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/notifications?page=1&limit=20&read=false` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "65a1b2c3d4e5f60012345681",
        "orgId": "65a1b2c3d4e5f60012345679",
        "type": "contract_expiring",
        "message": "Contract \"Acme Corp NDA\" expires in 30 days.",
        "read": false,
        "resourceType": "Contract",
        "resourceId": "65a1b2c3d4e5f6001234567c",
        "createdAt": "2026-02-22T02:00:00.000Z"
      }
    ],
    "meta": {
      "total": 5,
      "page": 1,
      "limit": 20,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 7.2 Get Unread Count

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/notifications/unread-count` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "unreadCount": 3
  }
}
```

---

### 7.3 Mark Notification as Read

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/notifications/65a1b2c3d4e5f60012345681/read` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Request Body:** _None_

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notification marked as read.",
  "data": {
    "notification": {
      "id": "65a1b2c3d4e5f60012345681",
      "read": true,
      "readAt": "2026-02-23T08:20:00.000Z"
    }
  }
}
```

---

### 7.4 Mark All as Read

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:3100/api/v1/notifications/read-all` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Request Body:** _None_

**Success Response (200):**
```json
{
  "success": true,
  "message": "All notifications marked as read.",
  "data": {
    "modifiedCount": 3
  }
}
```

---

## 🌍 8. Enrichment

### 8.1 Get Country Info

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/enrichment/country/United%20States` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "country": {
      "name": "United States",
      "region": "Americas",
      "subregion": "North America",
      "currency": "USD",
      "timezones": ["UTC-12:00", "UTC-11:00", "UTC-10:00", "UTC-09:00", "UTC-08:00", "UTC-07:00", "UTC-06:00", "UTC-05:00", "UTC-04:00", "UTC+10:00", "UTC+12:00"],
      "capital": "Washington, D.C."
    }
  }
}
```

---

### 8.2 Get World Time

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/enrichment/time/America/New_York` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "time": {
      "datetime": "2026-02-23T02:52:00.000000-05:00",
      "timezone": "America/New_York",
      "utcOffset": "-05:00"
    }
  }
}
```

---

### 8.3 Check Holiday

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/api/v1/enrichment/holidays?country=US&date=2026-12-25` |
| **Headers** | `Authorization: Bearer <accessToken>` |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "holiday": {
      "isHoliday": true,
      "holidays": [
        { "name": "Christmas Day", "type": "National" }
      ]
    }
  }
}
```

---

## ❤️ 9. Health Check (No Auth Required)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:3100/health` |

**Success Response (200):**
```json
{
  "status": "ok",
  "services": {
    "mongodb": "up",
    "redis": "up",
    "rabbitmq": "up"
  },
  "timestamp": "2026-02-22T12:30:00.000Z",
  "uptime": 86400
}
```

**Degraded Response (503):**
```json
{
  "status": "degraded",
  "services": {
    "mongodb": "up",
    "redis": "down",
    "rabbitmq": "up"
  },
  "timestamp": "2026-02-22T12:30:00.000Z",
  "uptime": 86400
}
```

---

## 🔌 10. WebSocket Events

Connect to `ws://localhost:3100` with a valid JWT:

```javascript
const socket = io('http://localhost:3100', {
  auth: { token: '<accessToken>' }
});

// Listen for analysis completion
socket.on('analysis:complete', (data) => {
  // { contractId, analysisId, riskScore, riskLevel }
});

// Listen for analysis failure
socket.on('analysis:failed', (data) => {
  // { contractId, reason }
});

// Listen for diff comparison results
socket.on('diff:complete', (data) => {
  // { contractId, versionA, versionB, summary, changes }
});

// Listen for contract expiry alerts
socket.on('contract:expiring', (data) => {
  // { contractId, title, daysRemaining }
});
```

---

## ⚠️ Common Error Responses

**Validation Error (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "email", "message": "email must be a valid email" },
      { "field": "password", "message": "password length must be at least 8 characters long" }
    ]
  }
}
```

**Unauthorized (401):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Access token has expired. Use /auth/refresh-token to get a new one."
  }
}
```

**Forbidden (403):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied. Required roles: admin, manager. Your role: viewer."
  }
}
```

**Not Found (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /api/v1/invalid not found."
  }
}
```

**Rate Limited (429):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again in 45 seconds.",
    "details": [{ "retryAfter": 45 }]
  }
}
```
