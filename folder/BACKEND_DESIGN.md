# 🏗️ Backend Design Document
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.1.0 | **Architecture:** Monolithic MVC | **Pattern:** Advanced MVC + Service Layer

> **Changelog from v1.0.0:** Added Redis Pub/Sub bridge for worker-to-socket communication. Added email.service.js. Added diff.controller.js and diff route. Added Invitation model. Added analysis.validator.js. Added /health endpoint. Added RabbitMQ reconnection design. Added full-text search index. Added pagination design. Added admin bootstrap / seed strategy. Added refresh token rotation.

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
│                     ▲ Redis Pub/Sub Subscriber                  │
└──────┬──────────────┼───────────────────┬───────────────────────┘
       │              │                   │
┌──────▼───┐  ┌───────▼──────┐  ┌────────▼──────────────────────┐
│ MongoDB  │  │    Redis     │  │         RabbitMQ               │
│(Mongoose)│  │ Cache|Session│  │  Producer → Queue → Consumer   │
│ Main DB  │  │  Rate Limit  │  │   (AI Analysis Worker)         │
│          │  │  Pub/Sub ◄───┼──┤   Worker publishes to Pub/Sub  │
└──────────┘  └──────────────┘  └────────────────────────────────┘
                                          │
                               ┌──────────▼──────────────────────┐
                               │      AI Worker (Standalone)     │
                               │  Consumes job → Calls OpenRouter│
                               │  → Stores result → Publishes to │
                               │    Redis Pub/Sub channel        │
                               └─────────────────────────────────┘
```

### Key Architectural Pattern — Worker to Socket.io Communication
The AI Worker runs in a **separate process** (worker.js) and cannot directly call the Socket.io server in the API process. The bridge works as follows:

1. Worker completes AI analysis and saves result to MongoDB
2. Worker publishes a message to a Redis Pub/Sub channel: `PUBLISH lexai:socket:events '{"event":"analysis:complete","room":"org:xyz","payload":{...}}'`
3. The API process has a Redis subscriber that listens to `lexai:socket:events`
4. On receiving a message, the API process calls `io.to(room).emit(event, payload)`

This is the standard pattern for multi-process Socket.io event emission.

---

## 2. Folder & Code Architecture

```
lexai-backend/
│
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection with retry logic
│   │   ├── redis.js           # Redis client setup (ioredis) — two clients: one for commands, one for Pub/Sub subscribe
│   │   ├── rabbitmq.js        # RabbitMQ connection + channel factory + reconnection logic
│   │   ├── socket.js          # Socket.io server setup + auth middleware + Redis Pub/Sub subscriber
│   │   └── env.js             # Zod-validated env variables
│   │
│   ├── models/
│   │   ├── User.model.js      # User schema with bcrypt hooks
│   │   ├── Organization.model.js
│   │   ├── Invitation.model.js  # Team invite tokens, status, expiry
│   │   ├── Contract.model.js  # Main contract with versions array
│   │   ├── Analysis.model.js  # AI analysis result per contract
│   │   ├── Notification.model.js
│   │   └── AuditLog.model.js  # Every action logged here (90-day TTL index)
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── org.controller.js
│   │   ├── contract.controller.js
│   │   ├── diff.controller.js     # ← NEW: handles version comparison requests
│   │   ├── analysis.controller.js
│   │   └── admin.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js          # Token generation, verification, blacklist, rotation
│   │   ├── user.service.js
│   │   ├── org.service.js
│   │   ├── invitation.service.js    # ← NEW: create, send, accept, expire invitations
│   │   ├── contract.service.js      # Business logic for contract ops
│   │   ├── analysis.service.js      # Queue job + fetch cached result
│   │   ├── ai.service.js            # OpenRouter API calls, prompt building
│   │   ├── diff.service.js          # Text diff + AI explanation
│   │   ├── alert.service.js         # Expiry cron + notification dispatch (socket + email)
│   │   ├── email.service.js         # ← NEW: nodemailer wrapper for all outbound email
│   │   ├── quota.service.js         # Per-user quota checks via Redis
│   │   ├── enrichment.service.js    # Public API data fetching
│   │   └── audit.service.js         # Write audit logs
│   │
│   ├── workers/
│   │   ├── analysis.worker.js    # RabbitMQ consumer for AI jobs
│   │   └── alert.worker.js       # RabbitMQ consumer for alert jobs
│   │
│   ├── jobs/
│   │   └── expiry.cron.js        # Cron job that scans expiring contracts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js         # JWT verify + attach user to req
│   │   ├── rbac.middleware.js         # Role-based access control
│   │   ├── rateLimiter.middleware.js  # Redis sliding window rate limit
│   │   ├── quota.middleware.js        # Check user's monthly analysis quota
│   │   ├── validate.middleware.js     # Joi/Zod request validation
│   │   ├── errorHandler.middleware.js # Global error handler
│   │   └── requestLogger.middleware.js # Winston request logger
│   │
│   ├── routes/
│   │   ├── index.js             # Aggregates all routes
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── org.routes.js
│   │   ├── contract.routes.js   # Includes /compare route pointing to diff.controller
│   │   ├── analysis.routes.js
│   │   ├── health.routes.js     # ← NEW: /health endpoint
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
│   │   ├── analysis.validator.js  # ← NEW: validates analysis request body
│   │   └── org.validator.js
│   │
│   ├── sockets/
│   │   ├── events.js            # Socket event name constants
│   │   ├── pubsub.subscriber.js # ← NEW: Redis Pub/Sub listener that calls io.emit
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
├── scripts/
│   └── seed.js                  # ← NEW: seeds first admin user on fresh deploy
│
├── server.js                    # Entry point: starts HTTP + WS server + Redis Pub/Sub subscriber
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
  name: String,
  email: { type: String, unique: true },
  password: String,                    // bcrypt hashed — NEVER returned in API
  emailVerified: Boolean,              // Must be true to use the platform
  // emailVerifyToken value is no longer stored on the user document –
  // temporary verification tokens live in Redis with a 24‑hour TTL
  emailVerifyToken: String,            // (deprecated) Temp token for email confirmation (moved to Redis)
  passwordResetToken: String,          // Time-limited reset token
  passwordResetExpiry: Date,
  organization: ObjectId (ref: Org),
  role: { type: String, enum: ['admin','manager','viewer'] },
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt, updatedAt
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

### 3.3 Invitation Model ← NEW
```js
{
  _id: ObjectId,
  orgId: ObjectId (ref: Organization),
  invitedBy: ObjectId (ref: User),
  email: String,                        // Email of the invitee
  role: { type: String, enum: ['admin','manager','viewer'] },
  token: String,                        // Unique UUID token (in email link)
  status: { type: String, enum: ['pending','accepted','expired'], default: 'pending' },
  expiresAt: Date,                      // Token valid for 48 hours from creation
  acceptedAt: Date,
  createdAt, updatedAt
}
```

### 3.4 Contract Model
```js
{
  _id: ObjectId,
  orgId: ObjectId (ref: Organization),
  uploadedBy: ObjectId (ref: User),
  title: String,
  type: { type: String, enum: ['NDA','Vendor','Employment','SaaS','Other'] },
  tags: [String],
  content: String,                     // Full extracted text — original file NOT stored
  contentHash: String,                 // SHA-256 of content — used as Redis cache key

  // File metadata (original file not retained after text extraction)
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

  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: ObjectId,

  createdAt, updatedAt
}
```

### 3.5 Analysis Model
```js
{
  _id: ObjectId,
  contractId: ObjectId (ref: Contract),
  orgId: ObjectId,
  version: Number,
  status: { type: String, enum: ['pending','processing','completed','failed'] },

  // AI Output
  summary: String,                     // Plain English paragraph (not a bullet list)
  riskScore: { type: Number, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['low','medium','high','critical'] },

  clauses: [{
    title: String,
    content: String,
    flag: { type: String, enum: ['green','yellow','red'] },
    explanation: String,
    suggestion: String
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

  aiModel: String,
  tokensUsed: Number,
  processingTimeMs: Number,
  failureReason: String,
  retryCount: { type: Number, default: 0 },
  cacheKey: String,

  createdAt, updatedAt
}
```

### 3.6 AuditLog Model
```js
{
  _id: ObjectId,
  orgId: ObjectId,
  userId: ObjectId,
  action: String,             // e.g. 'contract.uploaded', 'analysis.requested'
  resourceType: String,       // 'Contract', 'Analysis', 'User', etc.
  resourceId: ObjectId,
  metadata: Mixed,
  ipAddress: String,
  userAgent: String,
  createdAt: Date             // TTL index: auto-deleted after 90 days
}
```

---

## 4. API Endpoint Design

### Health Route — `/health`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/health` | System health check (MongoDB, Redis, RabbitMQ status) | No |

### Auth Routes — `/api/v1/auth`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/register` | Create account + send verify email | No |
| POST | `/verify-email` | Confirm email with token | No |
| POST | `/login` | Returns access token + sets refresh token HttpOnly cookie | No |
| POST | `/refresh-token` | Exchange refresh for new access token + rotated refresh token | No |
| POST | `/logout` | Blacklist current token in Redis, clear refresh cookie | Yes |
| POST | `/forgot-password` | Send password reset email | No |
| POST | `/reset-password` | Apply new password with token | No |

### User Routes — `/api/v1/users`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/me` | Get current user profile + quota info | Yes |
| PATCH | `/me` | Update profile | Yes |
| PATCH | `/me/password` | Change password | Yes |
| GET | `/:id` | Get user by ID | Admin |

### Organization Routes — `/api/v1/orgs`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/` | Create organization | Yes |
| GET | `/:orgId` | Get org details | Yes (member) |
| PATCH | `/:orgId` | Update org name/settings | Admin/Manager |
| POST | `/:orgId/invite` | Send invite email to new member | Admin/Manager |
| POST | `/:orgId/invite/accept` | Accept invitation via token | No (token-based) |
| PATCH | `/:orgId/members/:userId/role` | Change member role | Admin |
| DELETE | `/:orgId/members/:userId` | Remove member | Admin |

### Contract Routes — `/api/v1/contracts`
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/` | Upload new contract | Yes + Quota |
| GET | `/` | List all contracts (paginated, filterable, searchable) | Yes |
| GET | `/:id` | Get single contract with latest analysis | Yes |
| PATCH | `/:id` | Update title, tags, alert config | Yes |
| POST | `/:id/versions` | Upload new version of same contract | Yes |
| GET | `/:id/versions` | List version history | Yes |
| POST | `/:id/compare` | Compare two versions with AI diff | Yes + Pro/Enterprise |
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
| GET | `/users` | List all users (paginated) | Admin only |
| GET | `/audit-logs` | Global audit log (paginated) | Admin only |

---

## 5. Authentication & Authorization Design

### 5.1 JWT Strategy
```
Access Token:   Short-lived (15 minutes) — sent in Authorization: Bearer header
Refresh Token:  Long-lived (7 days) — stored in HttpOnly cookie (never in response body)
```

### 5.2 Refresh Token Rotation
```
On /refresh-token:
  1. Verify incoming refresh token (JWT signature + expiry)
  2. Check if token JTI is in the Redis blacklist → reject if found (already rotated/used)
  3. Blacklist the incoming refresh token JTI immediately: SET blacklist:{jti} "1" EX {remaining_ttl}
  4. Generate a new access token
  5. Generate a new refresh token with a new JTI
  6. Set new refresh token as HttpOnly cookie
  7. Return new access token in response body

This ensures each refresh token can only be used once.
A stolen refresh token will fail the moment the legitimate user rotates it.
```

### 5.3 Token Blacklisting (Redis)
```
On logout:  SET blacklist:{jti} "1" EX {remaining_ttl_seconds}
On verify:  Check if blacklist:{jti} exists → reject if found
Same pattern applied to refresh token on rotation (see 5.2)
```

### 5.4 RBAC Matrix
| Action | Viewer | Manager | Admin |
|---|---|---|---|
| Upload contract | ✅ | ✅ | ✅ |
| Request analysis | ✅ | ✅ | ✅ |
| Delete contract | ❌ | ✅ | ✅ |
| Invite members | ❌ | ✅ | ✅ |
| Change member roles | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ✅ | ✅ |
| View platform stats | ❌ | ❌ | ✅ |
| Access version compare | ❌ (free) | ✅ (pro+) | ✅ |

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
   → YES: skip AI call, fetch from cache, publish to Redis Pub/Sub, ack job
   → NO: continue
3. Call OpenRouter API with structured prompt
4. Parse and validate AI response
5. Save Analysis document to MongoDB (status: completed)
6. Cache result in Redis: SET analysis:{contentHash} {result} EX 86400
7. Publish to Redis Pub/Sub channel 'lexai:socket:events':
     { "event": "analysis:complete", "room": "org:{orgId}", "payload": { contractId, analysisId, riskScore, riskLevel } }
   The API process subscribes to this channel and calls io.to(room).emit(event, payload)
8. Ack the RabbitMQ message
9. On failure: increment retryCount, nack with requeue (max 3 retries)
   After 3 failures: route to DLX, update Analysis status to 'failed',
   publish failure event to Redis Pub/Sub so user receives 'analysis:failed' socket event
```

### RabbitMQ Reconnection Logic
```
amqplib does NOT auto-reconnect on connection loss. The following must be implemented in rabbitmq.js:
- Wrap the connection in a reconnect loop with exponential backoff (1s, 2s, 4s... max 30s)
- Listen for 'error' and 'close' events on the connection object
- On connection loss: log error, wait backoff period, attempt reconnect
- Re-establish all channels and consumers after reconnect
- The API process must not crash on RabbitMQ disconnection; it should log and retry
- The worker process must also implement the same reconnection pattern
```

---

## 7. Redis Usage Map

| Key Pattern | Purpose | TTL |
|---|---|---|
| `blacklist:{jti}` | Blacklisted JWT tokens (access + rotated refresh) | Token remaining TTL |
| `session:{userId}` | Active session tracking | 7 days |
| `analysis:{contentHash}` | Cached AI analysis result | 24 hours |
| `ratelimit:{ip}:{window}` | IP rate limit sliding window | 1 minute |
| `quota:{userId}:{month}` | Monthly analysis usage count | 32 days |
| `queue:status` | Cached queue depth stats | 30 seconds |
| `lock:analysis:{contentHash}` | Distributed lock — prevents duplicate job submission | 5 minutes (SET NX) |

### Redis Pub/Sub Channel
| Channel | Published By | Subscribed By | Purpose |
|---|---|---|---|
| `lexai:socket:events` | AI Worker process | API process | Bridge worker events to Socket.io without shared memory |

> **Important:** ioredis requires two separate client instances — one for commands and one for Pub/Sub subscribe mode (a subscribed client cannot run other commands). Configure two clients in `config/redis.js`: `redisClient` (commands) and `redisSub` (subscriber).

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

### How Worker Events Reach the Socket
```
Worker → PUBLISH redis 'lexai:socket:events' JSON
API Process (redisSub) → receives message → parses JSON → io.to(room).emit(event, payload)
This happens in src/sockets/pubsub.subscriber.js which is initialized in server.js
```

---

## 9. AI Integration Design (OpenRouter)

### OpenRouter Config
```
Base URL:   https://openrouter.ai/api/v1
Auth:       Authorization: Bearer {OPENROUTER_API_KEY}
Primary:    meta-llama/llama-3.1-8b-instruct:free
Fallback:   mistralai/mistral-7b-instruct:free
Diff Model: google/gemma-2-9b-it:free
```

### Analysis Prompt Template
```
SYSTEM: You are a legal contract analyst. Your job is to analyze contracts
and return structured JSON. Never give legal advice. Always return valid JSON.

USER: Analyze the following contract and return ONLY a JSON object with this structure:
{
  "summary": "A single plain-English paragraph summarizing the contract, its key risk areas, and what the signing party should be aware of.",
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

> **Note on summary format:** The `summary` field is a single string paragraph, NOT an array of bullets. The PRD v1.0 incorrectly described it as "5 bullets" — this has been corrected. The structured clause list already handles bullet-level details.

### LLM Apps Pattern Used
- **Document Analysis Agent** pattern — single-turn structured extraction
- **Retry with backoff** on rate limit errors
- **Response validation** — parse JSON, validate schema, reject malformed output
- **Fallback model chain** — if primary model fails or returns invalid JSON, retry with fallback model

---

## 10. Public APIs Integration Map

| API | Source | Used For |
|---|---|---|
| REST Countries | `https://restcountries.com/v3.1` | Validate contract jurisdiction, get country info, timezone |
| Open Exchange Rates | `https://openexchangerates.org` | Show contract value in user's local currency |
| Abstract API Holidays | `https://abstractapi.com/holidays` | Check if expiry falls on a public holiday (adjust alerts) |
| IPify | `https://api.ipify.org` | Get user's public IP for audit logging |
| World Time API | `https://worldtimeapi.org/api` | Accurate current time for expiry calculations (HTTPS) |
| Quotable API | `https://api.quotable.io` | Motivational legal quotes on dashboard (optional, free) |

> **Note:** Data.gov legal datasets are NOT integrated in v1. All external API calls MUST use HTTPS endpoints. The previous `.env.example` incorrectly used `http://` for World Time API — all URLs must be `https://`.

---

## 11. Pagination Design

All list endpoints support the following query parameters and return a `meta` object:

### Query Parameters
```
page     (integer, default: 1)
limit    (integer, default: 10, max: 100)
sortBy   (string, default: 'createdAt')
order    ('asc' | 'desc', default: 'desc')
```

### Response Meta Object
```json
{
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Full-Text Search Index
To support full-text search on contract content, the following MongoDB index must be defined on the Contract model:
```js
Contract.index({ content: 'text', title: 'text', tags: 'text' })
// Weighted: title weight 10, tags weight 5, content weight 1
// Query via: { $text: { $search: "auto-renewal liability" } }
// Score via: { score: { $meta: "textScore" } }
```

---

## 12. Rate Limiting Strategy

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

## 13. Error Handling Architecture

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [],
    "requestId": "uuid-for-tracing"
  }
}
```

### Error Codes
| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/params failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid JWT but insufficient role or plan |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `QUOTA_EXCEEDED` | 429 | Monthly analysis quota used up |
| `RATE_LIMITED` | 429 | Too many requests in window |
| `AI_UNAVAILABLE` | 503 | OpenRouter API unreachable |
| `JOB_QUEUED` | 202 | Analysis job accepted, processing async |
| `TOKEN_ROTATED` | 401 | Refresh token already used (possible theft detected) |

---

## 14. Cron Job Design

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

### Alert Worker
```
1. Picks alert job from lexai.alert.queue
2. Emits Socket.io event (via Redis Pub/Sub) to org room: contract:expiring
3. Sends expiry email to all org members with Pro/Enterprise plans via email.service.js
4. Logs notification in Notification model
5. Acks the job
```

---

## 15. Health Check Endpoint

### GET /health (unauthenticated)
```
Purpose: System dependency health check for Docker, load balancers, uptime monitors

Checks:
  - MongoDB: ping command (db.admin().ping())
  - Redis: PING command
  - RabbitMQ: check if connection object is open

Response 200 (all healthy):
{
  "status": "ok",
  "services": {
    "mongodb": "up",
    "redis": "up",
    "rabbitmq": "up"
  },
  "timestamp": "2026-02-20T10:00:00Z",
  "uptime": 3600
}

Response 503 (any dependency down):
{
  "status": "degraded",
  "services": {
    "mongodb": "up",
    "redis": "down",
    "rabbitmq": "up"
  }
}
```

---

## 16. Docker Architecture

```yaml
services:
  api:          # Main Express app (port 3000) — with OPENROUTER_API_KEY
  worker:       # RabbitMQ consumer (separate process) — with OPENROUTER_API_KEY
  mongodb:      # MongoDB 7.0 (port 27017, volume mounted)
  redis:        # Redis 7.2 (port 6379, persistence enabled)
  rabbitmq:     # RabbitMQ 3.13 with Management UI (port 5672, 15672)
```

> **Critical:** `OPENROUTER_API_KEY` must be passed to BOTH the `api` service and the `worker` service environment blocks. Without it in `worker`, AI calls will fail silently.

---

## 17. Logging Strategy

### Winston Logger Levels
```
error  — Unhandled exceptions, DB failures, AI failures, RabbitMQ disconnection
warn   — Rate limit hits, retry attempts, quota warnings, reconnection attempts
info   — Request logs, job processed, user actions
debug  — Redis hits/misses, queue ack/nack, Pub/Sub messages (dev only)
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

---

## 18. Admin Bootstrap / Seed Strategy

On a fresh deployment, there is no admin user to access admin-only endpoints. The following bootstrap strategy is used:

### scripts/seed.js
```
Purpose: Create the first admin user in a fresh database
Run once on first deploy: node scripts/seed.js

Logic:
  1. Check if any user with role 'admin' already exists → skip if found
  2. Read ADMIN_EMAIL and ADMIN_PASSWORD from environment variables
  3. Hash password with bcrypt (12 rounds)
  4. Create user: { email, password, name: "Platform Admin", role: "admin", emailVerified: true }
  5. Log created admin credentials

Never run seed.js in production after initial setup.
```

### Environment Variables for Seed
```
ADMIN_EMAIL=admin@lexai.io
ADMIN_PASSWORD=ChangeMe@Immediately123
```