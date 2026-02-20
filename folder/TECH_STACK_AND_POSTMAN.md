# ⚙️ Tech Stack Document & Postman API Collection
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.1.0

> **Changelog from v1.0.0:** Added OPENROUTER_API_KEY to docker-compose worker + api env blocks. Fixed World Time API URL to HTTPS. Removed deprecated `version:` key from docker-compose. Added full-text search index. Added Postman pre-request auto token refresh script. Added ADMIN_EMAIL/ADMIN_PASSWORD to .env.example. Fixed Multer version note. Added nodemailer to services list. Added Redis dual-client note. Added /health endpoint.

---

## 1. Complete Tech Stack Breakdown

### 1.1 Core Runtime & Framework

| Technology | Version | Why This Choice |
|---|---|---|
| **Node.js** | 20 LTS | Non-blocking I/O perfect for async AI job handling; long-term support |
| **Express.js** | 4.19 | Minimal, unopinionated, battle-tested; full control over middleware chain |
| **express-async-errors** | 3.1 | Auto-catch async errors, no try-catch boilerplate in controllers |

**How it fits:** Express handles all HTTP routing. Every controller is an async function wrapped in `asyncWrapper` util. Express never blocks on AI calls — those go to RabbitMQ immediately.

---

### 1.2 Database Layer

| Technology | Version | Why This Choice |
|---|---|---|
| **MongoDB** | 7.0 | Document-oriented; perfect for variable contract structures and analysis JSON blobs |
| **Mongoose** | 8.x | Schema validation, pre/post hooks (for password hashing), populate, indexing |

**Mongoose Features Used:**
- `pre('save')` hooks on User model for bcrypt password hashing
- `index()` on `contentHash`, `orgId`, `expiryDate` for query performance
- `$text` index on `content`, `title`, `tags` for full-text contract search
- Virtual fields for computed properties (e.g., `daysUntilExpiry`)
- `select('-password')` projection globally on User queries
- TTL index on AuditLog for auto-cleanup after 90 days

**Key Indexes:**
```js
Contract.index({ orgId: 1, isDeleted: 1 })           // All org contract queries
Contract.index({ expiryDate: 1, isDeleted: 1 })       // Cron expiry scan
Contract.index({ contentHash: 1 })                    // Cache lookup
Contract.index(                                        // Full-text search
  { content: 'text', title: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, content: 1 } }
)
Analysis.index({ contractId: 1, version: 1 })         // Analysis lookup
AuditLog.index({ orgId: 1, createdAt: -1 })           // Audit trail queries
AuditLog.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }) // 90-day TTL
Invitation.index({ token: 1 })                        // Accept invite lookup
Invitation.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // Auto-expire invites
```

---

### 1.3 Caching & Session Layer

| Technology | Version | Why This Choice |
|---|---|---|
| **Redis** | 7.2 | In-memory, sub-millisecond reads; perfect for token blacklist, rate limit counters, AI result cache, and Pub/Sub bridge |
| **ioredis** | 5.x | Better than `redis` package — supports clustering, Lua scripts, auto-reconnect |

**Redis Patterns Used:**
- **String + EX:** Token blacklist, cached analysis JSON
- **INCR + EXPIRE:** Rate limit counters (sliding window via Lua script), quota counters
- **SET NX:** Distributed lock for preventing duplicate analysis jobs
- **Pipeline:** Batch Redis ops for quota check + increment atomically
- **Pub/Sub:** Worker publishes socket events; API process subscribes and emits via Socket.io

**Two Redis clients required:**
```
redisClient  — Standard command client (GET, SET, INCR, EXPIRE, PUBLISH, etc.)
redisSub     — Dedicated subscriber client (SUBSCRIBE only)
             A subscribed ioredis client cannot issue other commands.
             Both clients are configured in src/config/redis.js.
```

---

### 1.4 Message Queue

| Technology | Version | Why This Choice |
|---|---|---|
| **RabbitMQ** | 3.13 | Persistent message queue; AI analysis can take 20–60s, must be async. AMQP protocol, proven reliability |
| **amqplib** | 0.10 | Official Node.js AMQP client; low-level control for acks, nacks, DLX routing |

**RabbitMQ Patterns Used:**
- **Durable queues:** Messages survive RabbitMQ restarts
- **Persistent messages:** `{ persistent: true }` on every publish
- **Manual ack:** Worker only acks after successfully saving to DB + caching
- **Dead Letter Exchange:** Failed jobs after 3 retries routed to `lexai.analysis.dlx`
- **Prefetch(1):** Worker processes one job at a time per consumer (prevent memory spike)
- **Auto-reconnect:** Custom exponential backoff reconnect loop (amqplib does NOT auto-reconnect; this must be explicitly implemented in `config/rabbitmq.js`)

---

### 1.5 Real-Time Communication

| Technology | Version | Why This Choice |
|---|---|---|
| **Socket.io** | 4.7 | WebSocket + fallback; perfect for pushing AI analysis completion events to client without polling |

**Socket.io Patterns Used:**
- JWT auth on connection (`socket.handshake.auth.token`)
- Room-based events (org rooms so all team members get analysis notifications)
- Server-to-client only (no client-to-server events needed in v1)
- Redis adapter (`@socket.io/redis-adapter`) for multi-instance support
- **Redis Pub/Sub subscriber** in API process bridges events from the worker process to Socket.io rooms (see `src/sockets/pubsub.subscriber.js`)

---

### 1.6 AI Integration

| Technology | Purpose |
|---|---|
| **OpenRouter** | API gateway to access free LLMs (Llama 3.1, Mistral 7B, Gemma 2) |
| **axios** | HTTP client for OpenRouter calls with timeout + retry |

**OpenRouter Free Models Used:**
- Primary: `meta-llama/llama-3.1-8b-instruct:free`
- Fallback: `mistralai/mistral-7b-instruct:free`
- Diff Analysis: `google/gemma-2-9b-it:free`

---

### 1.7 Authentication & Security

| Technology | Version | Purpose |
|---|---|---|
| **jsonwebtoken** | 9.x | Sign and verify JWTs (access + refresh) |
| **bcryptjs** | 2.4 | Password hashing (12 rounds) |
| **helmet** | 7.x | Security headers (XSS, HSTS, noSniff, etc.) |
| **cors** | 2.x | Configurable CORS with whitelist |
| **express-mongo-sanitize** | 2.x | Prevent NoSQL injection via request body |
| **xss** | 1.x | Strip XSS from user inputs |
| **crypto** (Node built-in) | — | Token generation, content hashing (SHA-256) |

---

### 1.8 Validation

| Technology | Version | Purpose |
|---|---|---|
| **Joi** | 17.x | Request body/param/query validation schemas (auth, contract, analysis, org) |
| **zod** | 3.x | Environment variable validation on startup |

---

### 1.9 File Processing

| Technology | Version | Purpose |
|---|---|---|
| **multer** | 1.4 | Handle multipart/form-data file uploads |
| **pdf-parse** | 1.1 | Extract text from PDF uploads |
| **mammoth** | 1.7 | Extract text from DOCX uploads |

> **Security Note:** `multer` 1.x has known unpatched vulnerabilities. Monitor the multer repository for a stable 2.x release and upgrade immediately when available. As a mitigation in v1, always validate `mimetype` and file size server-side after multer processes the upload, and do not trust the `Content-Type` header alone.

---

### 1.10 Email

| Technology | Version | Purpose |
|---|---|---|
| **nodemailer** | 6.x | Send transactional emails: email verification, password reset, expiry alerts, team invitations |

**Email Sending Scenarios:**
- Email verification on registration
- Password reset link
- Team invitation (48-hour expiry token link)
- Contract expiry alerts (Pro/Enterprise users) — sent in addition to Socket.io events

**Dev Setup:** Use [Ethereal Email](https://ethereal.email/) for a free local SMTP test inbox.

---

### 1.11 Background Jobs & Scheduling

| Technology | Version | Purpose |
|---|---|---|
| **node-cron** | 3.x | Daily cron job at 2:00 AM UTC for expiry scanning |
| **Custom Worker** | — | `worker.js` entrypoint runs RabbitMQ consumers |

---

### 1.12 Logging & Monitoring

| Technology | Version | Purpose |
|---|---|---|
| **winston** | 3.x | Structured JSON logging with levels |
| **morgan** | 1.x | HTTP request logging middleware |
| **uuid** | 9.x | Request ID generation for tracing |

---

### 1.13 DevOps & Containerization

| Technology | Version | Purpose |
|---|---|---|
| **Docker** | 25.x | Containerize API, Worker, and all services |
| **docker-compose** | v2 | Orchestrate all services locally (no `version:` key — deprecated in Compose v2) |
| **dotenv** | 16.x | Load .env variables in development |

---

### 1.14 Development Tools

| Technology | Purpose |
|---|---|
| **nodemon** | Auto-restart in development |
| **eslint** | Code linting (Airbnb style guide) |
| **prettier** | Code formatting |
| **jest** | Unit + integration testing |
| **supertest** | HTTP endpoint testing |

---

## 2. Environment Variables (.env.example)

```env
# ─── App ───────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
API_VERSION=v1

# ─── MongoDB ───────────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017/lexai

# ─── Redis ─────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ─── RabbitMQ ──────────────────────────────────────────────────
RABBITMQ_URL=amqp://guest:guest@localhost:5672
ANALYSIS_QUEUE=lexai.analysis.queue
ALERT_QUEUE=lexai.alert.queue
DLX_EXCHANGE=lexai.dlx

# ─── JWT ───────────────────────────────────────────────────────
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ─── OpenRouter AI ─────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_PRIMARY_MODEL=meta-llama/llama-3.1-8b-instruct:free
AI_FALLBACK_MODEL=mistralai/mistral-7b-instruct:free

# ─── Rate Limiting ─────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# ─── File Upload ───────────────────────────────────────────────
MAX_FILE_SIZE_MB=5
ALLOWED_MIME_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain

# ─── CORS ──────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ─── Email (use nodemailer + ethereal in dev) ──────────────────
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-user
SMTP_PASS=your-ethereal-pass
EMAIL_FROM=noreply@lexai.io

# ─── External APIs (all HTTPS) ─────────────────────────────────
REST_COUNTRIES_URL=https://restcountries.com/v3.1
WORLD_TIME_API_URL=https://worldtimeapi.org/api

# ─── Admin Bootstrap (used by scripts/seed.js only) ────────────
ADMIN_EMAIL=admin@lexai.io
ADMIN_PASSWORD=ChangeMe@Immediately123
```

---

## 3. docker-compose.yml

> **Note:** The `version:` key has been removed. It is deprecated in Docker Compose v2 and causes a warning. Compose v2 infers the format automatically.

```yaml
services:
  # ─── Main API Server ──────────────────────────────────────────
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: lexai-api
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      MONGO_URI: mongodb://mongodb:27017/lexai
      REDIS_HOST: redis
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}      # ← Required: AI calls from api
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      EMAIL_FROM: ${EMAIL_FROM}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
    depends_on:
      - mongodb
      - redis
      - rabbitmq
    volumes:
      - ./src:/app/src    # Hot reload in development
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── RabbitMQ Worker ──────────────────────────────────────────
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    container_name: lexai-worker
    environment:
      NODE_ENV: development
      MONGO_URI: mongodb://mongodb:27017/lexai
      REDIS_HOST: redis
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}      # ← Critical: worker makes AI calls
      AI_PRIMARY_MODEL: ${AI_PRIMARY_MODEL}
      AI_FALLBACK_MODEL: ${AI_FALLBACK_MODEL}
      ANALYSIS_QUEUE: ${ANALYSIS_QUEUE}
      ALERT_QUEUE: ${ALERT_QUEUE}
      DLX_EXCHANGE: ${DLX_EXCHANGE}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      EMAIL_FROM: ${EMAIL_FROM}
    depends_on:
      - mongodb
      - redis
      - rabbitmq
    restart: unless-stopped

  # ─── MongoDB ──────────────────────────────────────────────────
  mongodb:
    image: mongo:7.0
    container_name: lexai-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

  # ─── Redis ────────────────────────────────────────────────────
  redis:
    image: redis:7.2-alpine
    container_name: lexai-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes  # Enable AOF persistence
    volumes:
      - redis_data:/data
    restart: unless-stopped

  # ─── RabbitMQ ─────────────────────────────────────────────────
  rabbitmq:
    image: rabbitmq:3.13-management
    container_name: lexai-rabbitmq
    ports:
      - "5672:5672"    # AMQP port
      - "15672:15672"  # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    restart: unless-stopped

volumes:
  mongodb_data:
  redis_data:
  rabbitmq_data:
```

---

## 4. Postman API Collection

> **Base URL:** `http://localhost:3000/api/v1`
> **Collection Variables:**
> - `{{base_url}}` = `http://localhost:3000/api/v1`
> - `{{access_token}}` = *(set after login)*
> - `{{org_id}}` = *(set after creating org)*
> - `{{contract_id}}` = *(set after uploading contract)*
> - `{{analysis_id}}` = *(set after requesting analysis)*

### Postman Pre-Request Script (Collection Level)
Add this script at the **Collection level → Pre-request Scripts** to auto-refresh the access token when it expires (access tokens expire in 15 minutes):

```javascript
// Auto refresh access token if expired
const accessToken = pm.collectionVariables.get("access_token");

if (!accessToken) return; // Skip if not logged in yet

// Decode JWT payload (base64)
const payload = JSON.parse(atob(accessToken.split('.')[1]));
const expiresAt = payload.exp * 1000; // ms
const now = Date.now();
const fiveMinutes = 5 * 60 * 1000;

// Refresh if token expires in less than 5 minutes
if (expiresAt - now < fiveMinutes) {
  const baseUrl = pm.collectionVariables.get("base_url");

  pm.sendRequest({
    url: baseUrl + '/auth/refresh-token',
    method: 'POST',
    header: { 'Content-Type': 'application/json' }
    // Refresh token is sent automatically via HttpOnly cookie
  }, (err, res) => {
    if (!err && res.code === 200) {
      const newToken = res.json().data.accessToken;
      pm.collectionVariables.set("access_token", newToken);
      console.log('Access token auto-refreshed.');
    } else {
      console.warn('Token refresh failed. Please login again.');
    }
  });
}
```

---

### 📁 Folder 0: Health Check

#### GET — Health Check
```
URL:     http://localhost:3000/health
Method:  GET
Headers: (none required)

Expected Response (200):
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

Expected Response (503 — any service down):
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

### 📁 Folder 1: Auth

#### POST — Register
```
URL:     {{base_url}}/auth/register
Method:  POST
Headers: Content-Type: application/json

Body (raw JSON):
{
  "name": "Rahul Sharma",
  "email": "rahul@startupxyz.com",
  "password": "SecurePass@123"
}

Expected Response (201):
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "userId": "64abc123def456789",
    "email": "rahul@startupxyz.com"
  }
}
```

#### POST — Verify Email
```
URL:     {{base_url}}/auth/verify-email
Method:  POST
Headers: Content-Type: application/json

Body:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Expected Response (200):
{
  "success": true,
  "message": "Email verified successfully. You can now log in."
}
```

#### POST — Login
```
URL:     {{base_url}}/auth/login
Method:  POST
Headers: Content-Type: application/json

Body:
{
  "email": "rahul@startupxyz.com",
  "password": "SecurePass@123"
}

Expected Response (200):
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64abc123def456789",
      "name": "Rahul Sharma",
      "email": "rahul@startupxyz.com",
      "role": "admin"
    }
  }
}

Note: Refresh token is set as an HttpOnly cookie automatically — it will NOT appear in the response body.
→ Copy accessToken value into {{access_token}} collection variable
```

#### POST — Refresh Token
```
URL:     {{base_url}}/auth/refresh-token
Method:  POST
Headers: Content-Type: application/json
         Cookie: refreshToken=<httponly-cookie> (auto-sent by Postman if cookie jar is enabled)

Expected Response (200):
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}

Note: A NEW rotated refresh token is also set as an HttpOnly cookie.
The old refresh token is immediately blacklisted — it cannot be used again.
```

#### POST — Logout
```
URL:     {{base_url}}/auth/logout
Method:  POST
Headers: Authorization: Bearer {{access_token}}

Expected Response (200):
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST — Forgot Password
```
URL:     {{base_url}}/auth/forgot-password
Method:  POST
Headers: Content-Type: application/json

Body:
{
  "email": "rahul@startupxyz.com"
}

Expected Response (200):
{
  "success": true,
  "message": "If this email exists, a reset link has been sent."
}
```

---

### 📁 Folder 2: Organization

#### POST — Create Organization
```
URL:     {{base_url}}/orgs
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         Content-Type: application/json

Body:
{
  "name": "Startup XYZ Pvt Ltd"
}

Expected Response (201):
{
  "success": true,
  "data": {
    "org": {
      "id": "64def456abc789012",
      "name": "Startup XYZ Pvt Ltd",
      "slug": "startup-xyz-pvt-ltd",
      "plan": "free",
      "memberCount": 1
    }
  }
}

→ Save org.id as {{org_id}} collection variable
```

#### POST — Invite Member
```
URL:     {{base_url}}/orgs/{{org_id}}/invite
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         Content-Type: application/json

Body:
{
  "email": "priya@startupxyz.com",
  "role": "manager"
}

Expected Response (200):
{
  "success": true,
  "message": "Invitation sent to priya@startupxyz.com",
  "data": {
    "invitationId": "64inv123abc",
    "expiresAt": "2026-02-22T10:00:00Z"
  }
}

→ The invitee receives an email with a link containing the invitation token.
```

#### POST — Accept Invitation
```
URL:     {{base_url}}/orgs/{{org_id}}/invite/accept
Method:  POST
Headers: Content-Type: application/json

Body:
{
  "token": "uuid-invitation-token-from-email",
  "name": "Priya Singh",
  "password": "NewUserPass@456"
}

Expected Response (200):
{
  "success": true,
  "message": "Invitation accepted. Your account has been created.",
  "data": {
    "userId": "64usr456def",
    "orgId": "64def456abc789012",
    "role": "manager"
  }
}
```

#### GET — Get Organization
```
URL:     {{base_url}}/orgs/{{org_id}}
Method:  GET
Headers: Authorization: Bearer {{access_token}}

Expected Response (200):
{
  "success": true,
  "data": {
    "org": {
      "id": "64def456abc789012",
      "name": "Startup XYZ Pvt Ltd",
      "plan": "free",
      "members": [
        { "userId": "64abc123", "name": "Rahul Sharma", "role": "admin", "joinedAt": "2026-02-20T09:00:00Z" }
      ]
    }
  }
}
```

---

### 📁 Folder 3: Contracts

#### POST — Upload Contract
```
URL:     {{base_url}}/contracts
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}
Body:    form-data

Form Fields:
  title       → "Vendor Agreement - AWS 2026"
  type        → "Vendor"
  tags        → ["cloud","aws","infrastructure"]
  file        → [Select File: vendor_agreement.pdf]

  OR use text upload:
  content     → "THIS VENDOR AGREEMENT is entered into as of January 1, 2026...
                 RENEWAL: This agreement shall auto-renew for successive one-year
                 terms unless either party provides 30 days written notice...
                 LIABILITY: Vendor's liability shall not exceed $500 in any event..."

Note: The original file is NOT stored after text extraction. Only the extracted text is saved.

Expected Response (201):
{
  "success": true,
  "message": "Contract uploaded successfully",
  "data": {
    "contract": {
      "id": "64ghi789jkl012345",
      "title": "Vendor Agreement - AWS 2026",
      "type": "Vendor",
      "version": 1,
      "contentHash": "a3f5c8d2..."
    }
  }
}

→ Save contract.id as {{contract_id}}
```

#### GET — List Contracts (Paginated + Searchable)
```
URL:     {{base_url}}/contracts?page=1&limit=10&type=Vendor&sortBy=createdAt&order=desc&search=auto-renew
Method:  GET
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}

Query Params:
  page     → 1
  limit    → 10 (max 100)
  type     → Vendor (optional filter)
  tag      → aws (optional filter)
  search   → "auto-renew" (optional — full-text MongoDB $text search on content, title, tags)
  sortBy   → createdAt
  order    → desc

Expected Response (200):
{
  "success": true,
  "data": {
    "contracts": [
      { "id": "...", "title": "Vendor Agreement - AWS 2026", "type": "Vendor", "riskScore": 72, "currentVersion": 1 }
    ],
    "meta": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

#### GET — Get Single Contract
```
URL:     {{base_url}}/contracts/{{contract_id}}
Method:  GET
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}

Expected Response (200):
{
  "success": true,
  "data": {
    "contract": {
      "id": "64ghi789jkl012345",
      "title": "Vendor Agreement - AWS 2026",
      "type": "Vendor",
      "currentVersion": 1,
      "latestAnalysis": null,
      "jurisdiction": {
        "country": "United States",
        "region": "North America",
        "currency": "USD"
      }
    }
  }
}
```

#### POST — Upload New Version
```
URL:     {{base_url}}/contracts/{{contract_id}}/versions
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}
         Content-Type: application/json

Body:
{
  "content": "AMENDED VENDOR AGREEMENT... LIABILITY: Vendor's liability shall not exceed $1000...",
  "changeNote": "Vendor increased liability cap from $500 to $1000"
}

Expected Response (201):
{
  "success": true,
  "data": {
    "versionNumber": 2,
    "contractId": "64ghi789jkl012345"
  }
}
```

#### POST — Compare Versions (Pro/Enterprise only)
```
URL:     {{base_url}}/contracts/{{contract_id}}/compare
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}
         Content-Type: application/json

Body:
{
  "versionA": 1,
  "versionB": 2
}

Expected Response (202 — job queued):
{
  "success": true,
  "message": "Version comparison queued. You will be notified via WebSocket when complete.",
  "data": {
    "jobId": "uuid-v4-job-id"
  }
}

Expected Response (403 — free plan):
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Version comparison is available on Pro and Enterprise plans only."
  }
}
```

---

### 📁 Folder 4: AI Analysis

#### POST — Request Analysis
```
URL:     {{base_url}}/analyses
Method:  POST
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}
         Content-Type: application/json

Body:
{
  "contractId": "{{contract_id}}",
  "version": 1
}

Expected Response (202 — accepted, job queued):
{
  "success": true,
  "message": "Analysis job queued. You will receive a WebSocket notification when complete.",
  "data": {
    "analysisId": "64mno345pqr678901",
    "status": "pending",
    "estimatedSeconds": 30
  }
}

→ Save analysisId as {{analysis_id}}
→ Open a Socket.io connection (see Section 5) to receive the analysis:complete event
```

#### GET — Get Analysis Result
```
URL:     {{base_url}}/analyses/{{analysis_id}}
Method:  GET
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}

Expected Response (200 — when complete):
{
  "success": true,
  "data": {
    "analysis": {
      "id": "64mno345pqr678901",
      "status": "completed",
      "riskScore": 72,
      "riskLevel": "high",
      "summary": "This vendor agreement contains several high-risk clauses including automatic renewal without adequate notice, severe liability limitations, and one-sided termination rights that strongly favor the vendor. The signing party should negotiate the renewal notice period, the liability cap, and the termination conditions before signing.",
      "clauses": [
        {
          "title": "Auto-Renewal Clause",
          "flag": "red",
          "explanation": "Contract auto-renews for 1 year unless you send written notice 30 days before expiry. Easy to miss.",
          "suggestion": "Negotiate for 90-day notice period and opt-in renewal instead of opt-out."
        },
        {
          "title": "Liability Cap",
          "flag": "yellow",
          "explanation": "Vendor's maximum liability is capped at $500 regardless of actual damages caused.",
          "suggestion": "Request liability cap to be at least equal to fees paid in the prior 12 months."
        }
      ],
      "obligations": {
        "yourObligations": ["Pay monthly fee by 5th of each month", "Provide 30-day termination notice"],
        "otherPartyObligations": ["Maintain 99.9% uptime", "Notify of price changes 60 days in advance"]
      },
      "keyDates": {
        "effectiveDate": "2026-01-01",
        "expiryDate": "2026-12-31",
        "renewalDate": "2026-12-01",
        "noticePeriod": "30 days"
      },
      "processingTimeMs": 18432,
      "aiModel": "meta-llama/llama-3.1-8b-instruct:free"
    }
  }
}

Note on summary: The summary is a single plain-English paragraph, NOT a list of bullets.
```

#### GET — Get All Analyses for a Contract
```
URL:     {{base_url}}/analyses/contract/{{contract_id}}
Method:  GET
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}

Expected Response (200):
{
  "success": true,
  "data": {
    "analyses": [
      { "id": "...", "version": 1, "status": "completed", "riskScore": 72, "createdAt": "2026-02-20T09:30:00Z" },
      { "id": "...", "version": 2, "status": "pending", "createdAt": "2026-02-20T10:00:00Z" }
    ]
  }
}
```

---

### 📁 Folder 5: User Profile

#### GET — Get My Profile
```
URL:     {{base_url}}/users/me
Method:  GET
Headers: Authorization: Bearer {{access_token}}

Expected Response (200):
{
  "success": true,
  "data": {
    "user": {
      "id": "64abc123def456789",
      "name": "Rahul Sharma",
      "email": "rahul@startupxyz.com",
      "role": "admin",
      "emailVerified": true,
      "lastLoginAt": "2026-02-20T08:30:00Z",
      "organization": {
        "id": "64def456abc789012",
        "name": "Startup XYZ Pvt Ltd",
        "plan": "free"
      },
      "quota": {
        "used": 1,
        "limit": 3,
        "remaining": 2,
        "resetsAt": "2026-03-01T00:00:00Z"
      }
    }
  }
}
```

#### PATCH — Update Profile
```
URL:     {{base_url}}/users/me
Method:  PATCH
Headers: Authorization: Bearer {{access_token}}
         Content-Type: application/json

Body:
{
  "name": "Rahul Kumar Sharma"
}

Expected Response (200):
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { "user": { "name": "Rahul Kumar Sharma" } }
}
```

---

### 📁 Folder 6: Admin

#### GET — Platform Stats (Admin only)
```
URL:     {{base_url}}/admin/stats
Method:  GET
Headers: Authorization: Bearer {{admin_access_token}}

Expected Response (200):
{
  "success": true,
  "data": {
    "stats": {
      "totalUsers": 142,
      "totalOrgs": 38,
      "totalContracts": 516,
      "totalAnalyses": 489,
      "analysesLast30Days": 127,
      "averageRiskScore": 61.4,
      "queueDepth": 3,
      "cacheHitRate": "74%"
    }
  }
}
```

#### GET — Queue Status
```
URL:     {{base_url}}/admin/queue/status
Method:  GET
Headers: Authorization: Bearer {{admin_access_token}}

Expected Response (200):
{
  "success": true,
  "data": {
    "queue": {
      "name": "lexai.analysis.queue",
      "messageCount": 3,
      "consumerCount": 1,
      "dlxMessageCount": 0
    }
  }
}
```

---

### 📁 Folder 7: Rate Limiting Test

#### GET — Test Rate Limit Headers
```
URL:     {{base_url}}/users/me
Method:  GET
Headers: Authorization: Bearer {{access_token}}

Look for these response headers on EVERY response:
  X-RateLimit-Limit:     100
  X-RateLimit-Remaining: 99
  X-RateLimit-Reset:     1708421234 (Unix timestamp)

When rate limited (429 response):
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again in 45 seconds.",
    "retryAfter": 45
  }
}

When quota exceeded (429 response):
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You have used all 3 analyses for this month. Upgrade to Pro for 50/month.",
    "quota": { "used": 3, "limit": 3, "resetsAt": "2026-03-01T00:00:00Z" }
  }
}
```

---

## 5. WebSocket Connection (Socket.io)

### Connect & Listen for Events
```javascript
// Test in browser console or Socket.io client tool

const socket = io('http://localhost:3000', {
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  // Join your org room
  socket.emit('join:org', { orgId: '64def456abc789012' });
});

socket.on('connect_error', (err) => {
  console.error('Socket auth failed:', err.message);
  // Ensure your access token is valid and not expired
});

// Listen for analysis completion (published by worker via Redis Pub/Sub → API → Socket.io)
socket.on('analysis:complete', (data) => {
  console.log('Analysis done!', data);
  // { contractId, analysisId, riskScore, riskLevel, title }
});

// Listen for analysis failure
socket.on('analysis:failed', (data) => {
  console.log('Analysis failed:', data);
  // { contractId, reason }
});

// Listen for expiry alerts (Pro/Enterprise only)
socket.on('contract:expiring', (data) => {
  console.log('Contract expiring!', data);
  // { contractId, title, daysUntilExpiry, expiryDate }
  // A corresponding email is also sent to all org members
});

// Listen for quota warning
socket.on('quota:warning', (data) => {
  console.log('Quota warning:', data);
  // { used: 2, limit: 3, remaining: 1 }
});
```

### How Events Flow from Worker to Client
```
Worker (separate process)
  → PUBLISH redis 'lexai:socket:events' '{"event":"analysis:complete","room":"org:xyz","payload":{...}}'
    → API process (redisSub listener in pubsub.subscriber.js)
      → io.to("org:xyz").emit("analysis:complete", payload)
        → All connected clients in that org room receive the event
```

---

## 6. Package.json Scripts

```json
{
  "scripts": {
    "start":          "node server.js",
    "start:worker":   "node worker.js",
    "dev":            "nodemon server.js",
    "dev:worker":     "nodemon worker.js",
    "seed":           "node scripts/seed.js",
    "docker:up":      "docker-compose up --build",
    "docker:down":    "docker-compose down",
    "test":           "jest --runInBand",
    "test:watch":     "jest --watch",
    "lint":           "eslint src/",
    "lint:fix":       "eslint src/ --fix"
  }
}
```

---

## 7. Key npm Dependencies (package.json)

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "express-async-errors": "^3.1.0",
    "mongoose": "^8.0.0",
    "ioredis": "^5.3.2",
    "amqplib": "^0.10.3",
    "socket.io": "^4.7.2",
    "@socket.io/redis-adapter": "^8.2.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "joi": "^17.11.0",
    "zod": "^3.22.4",
    "axios": "^1.6.2",
    "multer": "^1.4.5",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.7.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-mongo-sanitize": "^2.2.0",
    "xss": "^1.0.15",
    "winston": "^3.11.0",
    "morgan": "^1.10.0",
    "uuid": "^9.0.1",
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.7",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0"
  }
}
```

> **Dependency Note:** `multer` is pinned at 1.x which has known unpatched security issues. Upgrade to 2.x when it reaches stable release. Mitigate by validating mimetype and file size at the service layer after upload.

---

## 8. Quick Start Guide

```bash
# 1. Clone and install
git clone <repo>
cd lexai-backend
npm install

# 2. Setup environment
cp .env.example .env
# → Fill in OPENROUTER_API_KEY from https://openrouter.ai/
# → Fill in SMTP credentials (use https://ethereal.email/ for dev)
# → Fill in JWT secrets (min 32 chars each)

# 3. Start all infrastructure
docker-compose up -d mongodb redis rabbitmq

# 4. Seed the first admin user (first deploy only)
npm run seed
# → Creates admin@lexai.io with role=admin, emailVerified=true
# → Change ADMIN_PASSWORD in .env before running in production

# 5. Start API server (terminal 1)
npm run dev

# 6. Start worker (terminal 2)
npm run dev:worker

# 7. Verify everything is running
curl http://localhost:3000/health
# → Should return { "status": "ok", "services": { "mongodb": "up", "redis": "up", "rabbitmq": "up" } }

# 8. Access services
#   API:              http://localhost:3000
#   Health Check:     http://localhost:3000/health
#   RabbitMQ UI:      http://localhost:15672 (guest/guest)
#   MongoDB:          mongodb://localhost:27017/lexai

# 9. Import Postman collection
# → Create new collection in Postman
# → Set base_url variable to http://localhost:3000/api/v1
# → Add the pre-request script from Section 4 at collection level
# → Enable "Cookie jar" in Postman settings for HttpOnly refresh token to work
# → Follow request sequence:
#   Register → Verify Email → Login → Create Org → Upload Contract → Request Analysis → (listen WebSocket)
```