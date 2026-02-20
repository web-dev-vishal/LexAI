# 🏗️ Backend Design Document
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.0.0 | **Architecture:** Monolithic MVC | **Pattern:** Advanced MVC + Service Layer

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Postman / Frontend)              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                       │
│              Rate Limit Headers | SSL Termination               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              Node.js + Express (Monolithic MVC App)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Routes  │ │Controller│ │ Service  │ │   Middleware      │  │
│  │  Layer   │ │  Layer   │ │  Layer   │ │ Auth|Rate|Validate│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────────────────┐  │
│  │  Models  │ │  Utils   │ │    Socket.io Handler Layer     │  │
│  │(Mongoose)│ │ Helpers  │ │  (Real-time event emitter)     │  │
│  └──────────┘ └──────────┘ └────────────────────────────────┘  │
└──────┬──────────────┬───────────────────┬───────────────────────┘
       │              │                   │
┌──────▼───┐  ┌───────▼──────┐  ┌────────▼──────────────────────┐
│ MongoDB  │  │    Redis     │  │         RabbitMQ               │
│(Mongoose)│  │ Cache|Session│  │  Producer → Queue → Consumer   │
│ Main DB  │  │  Rate Limit  │  │   (AI Analysis Worker)         │
└──────────┘  └──────────────┘  └────────────────────────────────┘
                                          │
                               ┌──────────▼──────────────────────┐
                               │      AI Worker (Standalone)     │
                               │  Consumes job → Calls OpenRouter│
                               │  → Stores result → Emits Socket │
                               └─────────────────────────────────┘
```

---

## 2. Folder & Code Architecture

```
lexai-backend/
│
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection with retry logic
│   │   ├── redis.js           # Redis client setup (ioredis)
│   │   ├── rabbitmq.js        # RabbitMQ connection + channel factory
│   │   ├── socket.js          # Socket.io server setup + auth middleware
│   │   └── env.js             # Zod-validated env variables
│   │
│   ├── models/
│   │   ├── User.model.js      # User schema with bcrypt hooks
│   │   ├── Organization.model.js
│   │   ├── Contract.model.js  # Main contract with versions array
│   │   ├── Analysis.model.js  # AI analysis result per contract
│   │   ├── Notification.model.js
│   │   └── AuditLog.model.js  # Every action logged here
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── org.controller.js
│   │   ├── contract.controller.js
│   │   ├── analysis.controller.js
│   │   └── admin.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js       # Token generation, verification, blacklist
│   │   ├── user.service.js
│   │   ├── contract.service.js   # Business logic for contract ops
│   │   ├── analysis.service.js   # Queue job + fetch cached result
│   │   ├── ai.service.js         # OpenRouter API calls, prompt building
│   │   ├── diff.service.js       # Text diff + AI explanation
│   │   ├── alert.service.js      # Expiry cron + notification dispatch
│   │   ├── quota.service.js      # Per-user quota checks via Redis
│   │   ├── enrichment.service.js # Public API data fetching
│   │   └── audit.service.js      # Write audit logs
│   │
│   ├── workers/
│   │   ├── analysis.worker.js    # RabbitMQ consumer for AI jobs
│   │   └── alert.worker.js       # RabbitMQ consumer for alert jobs
│   │
│   ├── jobs/
│   │   └── expiry.cron.js        # Cron job that scans expiring contracts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js     # JWT verify + attach user to req
│   │   ├── rbac.middleware.js     # Role-based access control
│   │   ├── rateLimiter.middleware.js  # Redis sliding window rate limit
│   │   ├── quota.middleware.js    # Check user's monthly analysis quota
│   │   ├── validate.middleware.js # Joi/Zod request validation
│   │   ├── errorHandler.middleware.js # Global error handler
│   │   └── requestLogger.middleware.js # Winston request logger
│   │
│   ├── routes/
│   │   ├── index.js             # Aggregates all routes
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── org.routes.js
│   │   ├── contract.routes.js
│   │   ├── analysis.routes.js
│   │   └── admin.routes.js
│   │
│   ├── utils/
│   │   ├── apiResponse.js       # Standard { success, data, message, meta }
│   │   ├── asyncWrapper.js      # Wraps async controllers, catches errors
│   │   ├── tokenHelper.js       # JWT sign/verify helpers
│   │   ├── hashHelper.js        # Contract content hash for cache keys
│   │   ├── dateHelper.js        # Date calculations for expiry
│   │   ├── textExtractor.js     # Extract text from PDF/DOCX buffer
│   │   └── logger.js            # Winston logger config
│   │
│   ├── validators/
│   │   ├── auth.validator.js
│   │   ├── contract.validator.js
│   │   └── org.validator.js
│   │
│   ├── sockets/
│   │   ├── events.js            # Socket event name constants
│   │   └── handlers/
│   │       ├── analysis.handler.js   # Emits analysis:complete events
│   │       └── alert.handler.js      # Emits contract:expiry events
│   │
│   ├── constants/
│   │   ├── roles.js             # ROLES object
│   │   ├── queues.js            # Queue name constants
│   │   ├── plans.js             # Subscription plan limits
│   │   └── httpStatus.js        # HTTP status code constants
│   │
│   └── app.js                   # Express app setup (no server listen here)
│
├── server.js                    # Entry point: starts HTTP + WS server
├── worker.js                    # Entry point: starts RabbitMQ workers only
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── Dockerfile.worker
└── package.json
```

---

## 3. Database Schema Design

### 3.1 User Model
```js
{
  _id: ObjectId,
  name: String,                        // Full name
  email: { type: String, unique: true },
  password: String,                    // bcrypt hashed — NEVER returned in API
  emailVerified: Boolean,              // Must be true to use the platform
  emailVerifyToken: String,            // Temp token for email confirmation
  passwordResetToken: String,          // Time-limited reset token
  passwordResetExpiry: Date,
  organization: ObjectId (ref: Org),   // Current active org
  role: { type: String, enum: ['admin','manager','viewer'] },
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt, updatedAt                 // Mongoose timestamps
}
```

### 3.2 Organization Model
```js
{
  _id: ObjectId,
  name: String,
  slug: { type: String, unique: true },  // URL-safe org identifier
  ownerId: ObjectId (ref: User),
  members: [{ userId: ObjectId, role: String, joinedAt: Date }],
  plan: { type: String, enum: ['free','pro','enterprise'], default: 'free' },
  planExpiresAt: Date,
  contractCount: Number,               // Running counter, cached value
  createdAt, updatedAt
}
```

### 3.3 Contract Model
```js
{
  _id: ObjectId,
  orgId: ObjectId (ref: Organization),
  uploadedBy: ObjectId (ref: User),
  title: String,
  type: { type: String, enum: ['NDA','Vendor','Employment','SaaS','Other'] },
  tags: [String],
  content: String,                     // Full extracted text of contract
  contentHash: String,                 // SHA-256 of content — used as Redis cache key
  fileSize: Number,
  mimeType: String,
  
  // Versions array to track contract history
  versions: [{
    versionNumber: Number,
    content: String,
    contentHash: String,
    uploadedBy: ObjectId,
    uploadedAt: Date,
    changeNote: String
  }],
  currentVersion: { type: Number, default: 1 },
  
  // Key dates extracted by AI
  parties: [{ name: String, role: String }],
  effectiveDate: Date,
  expiryDate: Date,
  renewalDate: Date,
  noticePeriodDays: Number,
  
  // Alert config per contract
  alertDays: [{ type: Number, default: [90, 60, 30, 7] }],
  alertsSent: [{ daysBeforeExpiry: Number, sentAt: Date }],
  
  // Jurisdiction from REST Countries API enrichment
  jurisdiction: { country: String, region: String, currency: String },
  
  isDeleted: Boolean,                  // Soft delete
  deletedAt: Date,
  deletedBy: ObjectId,
  
  createdAt, updatedAt
}
```

### 3.4 Analysis Model
```js
{
  _id: ObjectId,
  contractId: ObjectId (ref: Contract),
  orgId: ObjectId,
  version: Number,                     // Which contract version this analysis is for
  status: { type: String, enum: ['pending','processing','completed','failed'] },
  
  // AI Output
  summary: String,                     // Plain English executive summary
  riskScore: { type: Number, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['low','medium','high','critical'] },
  
  clauses: [{
    title: String,
    content: String,                   // The actual clause text
    flag: { type: String, enum: ['green','yellow','red'] },
    explanation: String,               // AI plain English explanation
    suggestion: String                 // What user should negotiate/change
  }],
  
  obligations: {
    yourObligations: [String],
    otherPartyObligations: [String]
  },
  
  keyDates: {
    effectiveDate: String,
    expiryDate: String,
    renewalDate: String,
    noticePeriod: String
  },
  
  aiModel: String,                     // Which LLM model was used
  tokensUsed: Number,
  processingTimeMs: Number,
  failureReason: String,               // Populated if status = failed
  retryCount: { type: Number, default: 0 },
  
  cacheKey: String,                    // Redis key used to cache this result
  
  createdAt, updatedAt
}
```

### 3.5 AuditLog Model
```js
{
  _id: ObjectId,
  orgId: ObjectId,
  userId: ObjectId,
  action: String,                // e.g. 'contract.uploaded', 'analysis.requested'
  resourceType: String,          // 'Contract', 'Analysis', 'User', etc.
  resourceId: ObjectId,
  metadata: Mixed,               // Any extra relevant data
  ipAddress: String,
  userAgent: String,
  createdAt: Date
}
```

---

## 4. API Endpoint Design

### Auth Routes — `/api/v1/auth`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/register` | Create account + send verify email | No |
| POST | `/verify-email` | Confirm email with token | No |
| POST | `/login` | Returns access + refresh tokens | No |
| POST | `/refresh-token` | Exchange refresh for new access token | No |
| POST | `/logout` | Blacklist current token in Redis | Yes |
| POST | `/forgot-password` | Send password reset email | No |
| POST | `/reset-password` | Apply new password with token | No |

### User Routes — `/api/v1/users`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/me` | Get current user profile | Yes |
| PATCH | `/me` | Update profile | Yes |
| PATCH | `/me/password` | Change password | Yes |
| GET | `/:id` | Get user by ID | Admin |

### Organization Routes — `/api/v1/orgs`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/` | Create organization | Yes |
| GET | `/:orgId` | Get org details | Yes (member) |
| PATCH | `/:orgId` | Update org name/settings | Admin/Manager |
| POST | `/:orgId/invite` | Invite user by email | Admin/Manager |
| PATCH | `/:orgId/members/:userId/role` | Change member role | Admin |
| DELETE | `/:orgId/members/:userId` | Remove member | Admin |

### Contract Routes — `/api/v1/contracts`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/` | Upload new contract | Yes + Quota |
| GET | `/` | List all contracts (paginated, filterable) | Yes |
| GET | `/:id` | Get single contract with analysis | Yes |
| PATCH | `/:id` | Update title, tags, alert config | Yes |
| POST | `/:id/versions` | Upload new version of same contract | Yes |
| GET | `/:id/versions` | List version history | Yes |
| POST | `/:id/compare` | Compare v1 vs v2 with AI diff | Yes + Quota |
| DELETE | `/:id` | Soft delete contract | Admin/Manager |
| GET | `/:id/audit` | Get audit trail for this contract | Yes |

### Analysis Routes — `/api/v1/analyses`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/` | Queue AI analysis for a contract | Yes + Quota |
| GET | `/:id` | Get analysis result | Yes |
| GET | `/contract/:contractId` | Get all analyses for a contract | Yes |

### Admin Routes — `/api/v1/admin`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/stats` | Platform-wide stats | Admin only |
| GET | `/queue/status` | RabbitMQ queue status | Admin only |
| GET | `/users` | List all users | Admin only |
| GET | `/audit-logs` | Global audit log | Admin only |

---

## 5. Authentication & Authorization Design

### 5.1 JWT Strategy
```
Access Token:   Short-lived (15 minutes) — sent in Authorization: Bearer header
Refresh Token:  Long-lived (7 days) — sent in HttpOnly cookie
```

### 5.2 Token Blacklisting (Redis)
```
On logout:  SET blacklist:{jti} "1" EX {remaining_ttl_seconds}
On verify:  Check if blacklist:{jti} exists → reject if found
```

### 5.3 RBAC Matrix
| Action | Viewer | Manager | Admin |
|---|---|---|---|
| Upload contract | ✅ | ✅ | ✅ |
| Request analysis | ✅ | ✅ | ✅ |
| Delete contract | ❌ | ✅ | ✅ |
| Invite members | ❌ | ✅ | ✅ |
| Change member roles | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ✅ | ✅ |
| View platform stats | ❌ | ❌ | ✅ |

---

## 6. RabbitMQ Queue Design

### Queues
```
lexai.analysis.queue       — Main AI analysis jobs (persistent, durable)
lexai.alert.queue          — Contract expiry alerts
lexai.analysis.dlx         — Dead Letter Exchange for failed jobs
```

### Job Payload — Analysis Job
```json
{
  "jobId": "uuid-v4",
  "contractId": "mongo-object-id",
  "orgId": "mongo-object-id",
  "userId": "mongo-object-id",
  "content": "full contract text",
  "contentHash": "sha256-hash",
  "version": 1,
  "retryCount": 0,
  "queuedAt": "ISO-8601"
}
```

### Worker Flow
```
1. Consumer picks job from queue
2. Check Redis: does cache key (contentHash) already have result?
   → YES: skip AI call, fetch from cache, emit socket event, ack job
   → NO: continue
3. Call OpenRouter API with structured prompt
4. Parse and validate AI response
5. Save Analysis document to MongoDB (status: completed)
6. Cache result in Redis: SET analysis:{contentHash} {result} EX 86400
7. Emit Socket.io event: analysis:complete to org room
8. Ack the RabbitMQ message
9. On failure: increment retryCount, nack with requeue (max 3 retries)
   After 3 failures: route to DLX, update Analysis status to 'failed'
```

---

## 7. Redis Usage Map

| Key Pattern | Purpose | TTL |
|---|---|---|
| `blacklist:{jti}` | Blacklisted JWT tokens | Token remaining TTL |
| `session:{userId}` | Active session tracking | 7 days |
| `analysis:{contentHash}` | Cached AI analysis result | 24 hours |
| `ratelimit:{ip}:{window}` | IP rate limit sliding window | 1 minute |
| `quota:{userId}:{month}` | Monthly analysis usage count | 32 days |
| `queue:status` | Cached queue depth stats | 30 seconds |

---

## 8. Socket.io Architecture

### Authentication
```
Client connects with: socket.handshake.auth.token = "Bearer <jwt>"
Server verifies token on 'connection' event before allowing room joins
```

### Rooms
```
Org room:    org:{orgId}         — All members of an org
User room:   user:{userId}       — Personal notifications
Admin room:  admin               — Platform admins
```

### Events Emitted by Server
| Event | Room | Payload |
|---|---|---|
| `analysis:complete` | `org:{orgId}` | `{ contractId, analysisId, riskScore, riskLevel }` |
| `analysis:failed` | `user:{userId}` | `{ contractId, reason }` |
| `contract:expiring` | `org:{orgId}` | `{ contractId, title, daysUntilExpiry, expiryDate }` |
| `quota:warning` | `user:{userId}` | `{ used, limit, remaining }` |

---

## 9. AI Integration Design (OpenRouter)

### OpenRouter Config
```
Base URL:   https://openrouter.ai/api/v1
Auth:       Authorization: Bearer {OPENROUTER_API_KEY}
Model:      meta-llama/llama-3.1-8b-instruct:free  (free tier)
Fallback:   mistralai/mistral-7b-instruct:free
```

### Analysis Prompt Template
```
SYSTEM: You are a legal contract analyst. Your job is to analyze contracts 
and return structured JSON. Never give legal advice. Always return valid JSON.

USER: Analyze the following contract and return ONLY a JSON object with this structure:
{
  "summary": "5-bullet plain English summary",
  "riskScore": <number 0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "clauses": [{ "title": "", "content": "", "flag": "<green|yellow|red>", 
                "explanation": "", "suggestion": "" }],
  "obligations": { "yourObligations": [], "otherPartyObligations": [] },
  "keyDates": { "effectiveDate": "", "expiryDate": "", "renewalDate": "", "noticePeriod": "" },
  "parties": [{ "name": "", "role": "" }]
}

Contract text:
{CONTRACT_CONTENT}
```

### LLM Apps Pattern Used (from awesome-llm-apps repo)
- **Document Analysis Agent** pattern — single-turn structured extraction
- **Retry with backoff** on rate limit errors
- **Response validation** — parse JSON, validate schema, reject malformed

---

## 10. Public APIs Integration Map

| API | Source | Used For |
|---|---|---|
| REST Countries | `restcountries.com` | Validate contract jurisdiction, get country info, timezone |
| Open Exchange Rates | `openexchangerates.org` | Show contract value in user's local currency |
| Abstract API Holidays | `abstractapi.com/holidays` | Check if contract expiry falls on a holiday (alert adjustment) |
| IPify | `api.ipify.org` | Get user's public IP for audit logging |
| World Time API | `worldtimeapi.org` | Accurate current time for expiry calculations |
| Quotable API | `api.quotable.io` | Motivational legal quotes on dashboard (fun, free) |

---

## 11. Rate Limiting Strategy

### IP-Level (Redis Sliding Window)
```
Window:     60 seconds
Limit:      100 requests per IP per window
Headers:    X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
Response:   429 Too Many Requests with Retry-After header
```

### User Quota (Monthly Analysis Limit)
```
Free plan:        3 analyses/month
Pro plan:         50 analyses/month
Enterprise:       Unlimited

Implementation:
  INCR quota:{userId}:{YYYY-MM}
  EXPIRE quota:{userId}:{YYYY-MM} (set to end of month in seconds)
  Check value BEFORE processing → reject if over limit
```

---

## 12. Error Handling Architecture

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [...],
    "requestId": "uuid-for-tracing"
  }
}
```

### Error Codes
| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/params failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid JWT but insufficient role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `QUOTA_EXCEEDED` | 429 | Monthly analysis quota used up |
| `RATE_LIMITED` | 429 | Too many requests in window |
| `AI_UNAVAILABLE` | 503 | OpenRouter API unreachable |
| `JOB_QUEUED` | 202 | Analysis job accepted, processing async |

---

## 13. Cron Job Design

### Contract Expiry Scanner
```
Schedule:   Every day at 2:00 AM UTC
Logic:
  1. Find all contracts where isDeleted=false AND expiryDate exists
  2. Calculate days until expiry for each
  3. For each alertDays threshold [90,60,30,7]:
     - If daysUntilExpiry <= threshold AND alert not already sent for this threshold:
       → Push alert job to RabbitMQ
       → Mark alertsSent for this threshold in contract document
```

---

## 14. Docker Architecture

```yaml
services:
  api:          # Main Express app (port 3000)
  worker:       # RabbitMQ consumer (separate process, same codebase)
  mongodb:      # MongoDB 7.0 (port 27017, volume mounted)
  redis:        # Redis 7.2 (port 6379, persistence enabled)
  rabbitmq:     # RabbitMQ 3.13 with Management UI (port 5672, 15672)
```

---

## 15. Logging Strategy

### Winston Logger Levels
```
error  — Unhandled exceptions, DB failures, AI failures
warn   — Rate limit hits, retry attempts, quota warnings  
info   — Request logs, job processed, user actions
debug  — Redis hits/misses, queue ack/nack (dev only)
```

### Request Log Format
```json
{
  "requestId": "uuid",
  "method": "POST",
  "url": "/api/v1/analyses",
  "userId": "mongo-id",
  "orgId": "mongo-id",
  "statusCode": 202,
  "responseTimeMs": 45,
  "ip": "1.2.3.4",
  "timestamp": "ISO-8601"
}
```
