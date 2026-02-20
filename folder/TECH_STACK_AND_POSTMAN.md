# ⚙️ Tech Stack Document & Postman API Collection
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.0.0

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
- Virtual fields for computed properties (e.g., `daysUntilExpiry`)
- `select('-password')` projection globally on User queries
- TTL index on AuditLog for auto-cleanup after 90 days

**Key Indexes:**
```js
Contract.index({ orgId: 1, isDeleted: 1 })          // All org contract queries
Contract.index({ expiryDate: 1, isDeleted: 1 })      // Cron expiry scan
Contract.index({ contentHash: 1 })                   // Cache lookup
Analysis.index({ contractId: 1, version: 1 })        // Analysis lookup
AuditLog.index({ orgId: 1, createdAt: -1 })          // Audit trail queries
AuditLog.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }) // 90-day TTL
```

---

### 1.3 Caching & Session Layer

| Technology | Version | Why This Choice |
|---|---|---|
| **Redis** | 7.2 | In-memory, sub-millisecond reads; perfect for token blacklist, rate limit counters, AI result cache |
| **ioredis** | 5.x | Better than `redis` package — supports clustering, Lua scripts, auto-reconnect |

**Redis Patterns Used:**
- **String + EX:** Token blacklist, cached analysis JSON
- **INCR + EXPIRE:** Rate limit counters (sliding window via Lua script), quota counters
- **SET NX:** Distributed lock for preventing duplicate analysis jobs
- **Pipeline:** Batch Redis ops for quota check + increment atomically

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

---

### 1.6 AI Integration

| Technology | Purpose |
|---|---|
| **OpenRouter** | API gateway to access free LLMs (Llama 3.1, Mistral 7B) |
| **axios** | HTTP client for OpenRouter calls with timeout + retry |
| **awesome-llm-apps** | Reference patterns: Document Analysis Agent, Structured Extraction |

**OpenRouter Free Models Used:**
- Primary: `meta-llama/llama-3.1-8b-instruct:free`
- Fallback: `mistralai/mistral-7b-instruct:free`
- Diff Analysis: `google/gemma-2-9b-it:free`

---

### 1.7 Authentication & Security

| Technology | Version | Purpose |
|---|---|---|
| **jsonwebtoken** | 9.x | Sign and verify JWTs |
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
| **Joi** | 17.x | Request body/param/query validation schemas |
| **zod** | 3.x | Environment variable validation on startup |

---

### 1.9 File Processing

| Technology | Version | Purpose |
|---|---|---|
| **multer** | 1.4 | Handle multipart/form-data file uploads |
| **pdf-parse** | 1.1 | Extract text from PDF uploads |
| **mammoth** | 1.7 | Extract text from DOCX uploads |

---

### 1.10 Background Jobs & Scheduling

| Technology | Version | Purpose |
|---|---|---|
| **node-cron** | 3.x | Daily cron job for expiry scanning |
| **Custom Worker** | — | `worker.js` entrypoint runs RabbitMQ consumers |

---

### 1.11 Logging & Monitoring

| Technology | Version | Purpose |
|---|---|---|
| **winston** | 3.x | Structured JSON logging with levels |
| **morgan** | 1.x | HTTP request logging middleware |
| **uuid** | 9.x | Request ID generation for tracing |

---

### 1.12 DevOps & Containerization

| Technology | Version | Purpose |
|---|---|---|
| **Docker** | 25.x | Containerize API, Worker, and all services |
| **docker-compose** | v3.8 | Orchestrate all services locally |
| **dotenv** | 16.x | Load .env variables in development |

---

### 1.13 Development Tools

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

# ─── Email (for verify/reset — use nodemailer + ethereal in dev) ─
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-user
SMTP_PASS=your-ethereal-pass
EMAIL_FROM=noreply@lexai.io

# ─── External APIs ─────────────────────────────────────────────
REST_COUNTRIES_URL=https://restcountries.com/v3.1
WORLD_TIME_API_URL=http://worldtimeapi.org/api
```

---

## 3. docker-compose.yml

```yaml
version: '3.8'

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
    depends_on:
      - mongodb
      - redis
      - rabbitmq
    volumes:
      - ./src:/app/src    # Hot reload in development
    restart: unless-stopped

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
    command: redis-server --appendonly yes  # Enable persistence
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
> **Collection Variable:** `{{base_url}}` = `http://localhost:3000/api/v1`  
> **Collection Variable:** `{{access_token}}` = *(set after login)*

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

→ Copy accessToken value into {{access_token}} collection variable
```

#### POST — Refresh Token
```
URL:     {{base_url}}/auth/refresh-token
Method:  POST
Headers: Content-Type: application/json
         Cookie: refreshToken=<httponly-cookie> (auto-sent by browser/Postman)

Expected Response (200):
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
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
  "message": "Invitation sent to priya@startupxyz.com"
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
        { "userId": "64abc123", "name": "Rahul Sharma", "role": "admin" }
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

#### GET — List Contracts
```
URL:     {{base_url}}/contracts?page=1&limit=10&type=Vendor&sortBy=createdAt&order=desc
Method:  GET
Headers: Authorization: Bearer {{access_token}}
         x-org-id: {{org_id}}

Query Params:
  page     → 1
  limit    → 10
  type     → Vendor (optional filter)
  tag      → aws (optional filter)
  search   → "auto-renew" (optional full-text search)
  sortBy   → createdAt
  order    → desc

Expected Response (200):
{
  "success": true,
  "data": {
    "contracts": [...],
    "meta": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "totalPages": 1
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
        "region": "us-east-1"
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

#### POST — Compare Versions
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
      "summary": "This vendor agreement contains several high-risk clauses including automatic renewal without adequate notice, severe liability limitations, and one-sided termination rights favoring the vendor.",
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
      { "id": "...", "version": 1, "status": "completed", "riskScore": 72 },
      { "id": "...", "version": 2, "status": "pending" }
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

Look for these response headers:
  X-RateLimit-Limit:     100
  X-RateLimit-Remaining: 99
  X-RateLimit-Reset:     1708421234

When rate limited (429 response):
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again in 45 seconds.",
    "retryAfter": 45
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

// Listen for analysis completion
socket.on('analysis:complete', (data) => {
  console.log('Analysis done!', data);
  // { contractId, analysisId, riskScore, riskLevel, title }
});

// Listen for expiry alerts
socket.on('contract:expiring', (data) => {
  console.log('Contract expiring!', data);
  // { contractId, title, daysUntilExpiry, expiryDate }
});

// Listen for quota warning
socket.on('quota:warning', (data) => {
  console.log('Quota warning:', data);
  // { used: 2, limit: 3, remaining: 1 }
});
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
    "dotenv": "^16.3.1",
    "nodemailer": "^6.9.7"
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

# 3. Start all infrastructure
docker-compose up -d mongodb redis rabbitmq

# 4. Start API server (terminal 1)
npm run dev

# 5. Start worker (terminal 2)
npm run dev:worker

# 6. Access services
#   API:              http://localhost:3000
#   RabbitMQ UI:      http://localhost:15672 (guest/guest)
#   MongoDB:          mongodb://localhost:27017/lexai

# 7. Import Postman collection
# → Create new collection in Postman
# → Set base_url variable to http://localhost:3000/api/v1
# → Follow request sequence: Register → Login → Create Org → Upload Contract → Request Analysis
```
