# 📋 Product Requirements Document (PRD)
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.1.0
**Date:** February 2026
**Author:** Backend Architecture Team
**Status:** Ready for Development

> **Changelog from v1.0.0:** Fixed incorrect Open Notify API reference (replaced with World Time API). Added data retention & GDPR policy. Added file storage decision. Added invitation model to Module 2. Clarified AI summary format. Added email alerts to expiry module. Added pagination requirement.

---

## 1. Executive Summary

### 1.1 Product Vision
LexAI is a backend-first SaaS platform that helps **small and medium businesses** understand, analyze, summarize, and get risk alerts on legal contracts and documents — using AI (via OpenRouter), real-time notifications (Socket.io), background job processing (RabbitMQ), and intelligent caching (Redis). No expensive lawyer needed for the first read.

### 1.2 The Real Problem It Solves
Every day, thousands of SMBs sign contracts they don't fully understand — NDAs, vendor agreements, employment contracts, SaaS agreements. Hiring a lawyer for every document costs $300–$800/hour. Most founders just "skim and sign." This leads to hidden penalty clauses, auto-renewal traps, IP ownership conflicts, and liability surprises.

**LexAI solves this by:**
- Analyzing any uploaded contract with AI and flagging risky clauses in plain English
- Comparing contract versions and showing what changed (and why it matters)
- Sending real-time alerts AND email notifications when contract expiry or renewal dates approach
- Pulling live jurisdiction-specific legal data from public APIs
- Maintaining a full contract vault with search, tagging, and audit trail

### 1.3 Why It's Unique
| Feature | LexAI | Generic Doc Tools | Lawyer |
|---|---|---|---|
| AI Risk Scoring | ✅ | ❌ | ✅ |
| Real-time Expiry Alerts | ✅ | ❌ | ❌ |
| Version Diff + AI Explanation | ✅ | ❌ | ✅ |
| Jurisdiction Law Enrichment | ✅ | ❌ | ✅ |
| Price | Freemium | Paid | $300+/hr |
| Instant Results | ✅ | ✅ | ❌ |

---

## 2. Goals & Non-Goals

### 2.1 Goals
- Build a fully functional backend SaaS API with auth, RBAC, and subscription tiers
- Process contracts asynchronously using RabbitMQ to avoid blocking the API
- Use AI (OpenRouter + LLM) to analyze, summarize, and flag clauses
- Real-time WebSocket notifications for job completion and expiry alerts
- Email notifications for expiry alerts (users may not be connected via WebSocket)
- Redis for caching AI results, rate limit counters, and session tokens
- Docker for full containerized local and production setup
- Postman-ready API collection with working test data

### 2.2 Non-Goals
- No frontend (pure backend SaaS API)
- No chat interface or conversational UI
- No microservices architecture (monolithic MVC only)
- No payment gateway integration in v1 (subscription tiers enforced via DB flags)
- No mobile SDK in v1

---

## 3. User Personas

### Persona 1 — Startup Founder "Rahul"
- Signs 10–15 contracts/year (investor agreements, SaaS tools, freelancer NDAs)
- Has no legal background
- Needs: Quick risk summary, plain English explanation, renewal reminders

### Persona 2 — SMB Operations Manager "Priya"
- Manages vendor contracts for a 50-person company
- Needs: Contract vault, team collaboration, version comparison, audit logs

### Persona 3 — Freelance Consultant "Alex"
- Signs client contracts weekly
- Needs: Fast NDA/service agreement analysis, red flag detection, free tier

---

## 4. Feature Modules

### Module 1: Authentication & Authorization
- JWT-based auth with access + refresh tokens
- Refresh token rotation: each use of a refresh token invalidates it and issues a new one
- RBAC: roles = `admin`, `manager`, `viewer`
- Email verification on signup
- Password reset with time-limited tokens
- Session blacklisting via Redis on logout

### Module 2: Organization & Team Management
- Multi-tenant: each org is isolated
- Invite team members by email
  - Invitation stored in `Invitation` model with status: `pending`, `accepted`, `expired`
  - Invitation token expires after 48 hours
  - Invitee receives an email with a one-click accept link
  - On accept, user is created (or existing user is added) with the specified role
- Assign roles within an org
- Subscription plan tied to org (free, pro, enterprise)

### Module 3: Contract Management (Vault)
- Upload contract (PDF/DOCX/TXT) — original file is not retained; text is extracted at upload time and stored as a string in MongoDB. This decision is intentional for v1 to keep storage simple. Re-download of the original file is not supported.
- Tag contracts (NDA, Vendor, Employment, etc.)
- Full-text search on contract content using MongoDB `$text` index
- Paginated contract listing (page, limit, sortBy, order query params; response includes total count)
- Version history — track edits/uploads of same contract
- Soft delete + audit trail on every action

### Module 4: AI Contract Analysis (Core Feature)
- On upload, push a job to RabbitMQ queue
- Worker picks up job, calls OpenRouter API (LLM)
- LLM performs:
  - Executive summary — a single plain-English paragraph (not a bullet list)
  - Risk scoring (0–100) with explanation
  - Clause-by-clause flagging (red / yellow / green)
  - Key dates extraction (expiry, renewal, notice period)
  - Party obligation summary
- Result cached in Redis (TTL: 24h)
- Socket.io event emitted to client when analysis is complete
- Worker communicates analysis completion to the API process via Redis Pub/Sub; the API process then emits the Socket.io event to the correct org room

### Module 5: Contract Version Diff & AI Comparison
- Upload v2 of an existing contract
- System diffs the two versions (text diff algorithm)
- AI explains what changed and whether changes favor or hurt the user
- Highlights newly added risky clauses
- Available on Pro and Enterprise plans only

### Module 6: Expiry & Renewal Alert Engine
- Background cron job scans contracts daily at 2:00 AM UTC
- Finds contracts expiring in 90, 60, 30, 7 days
- Pushes reminder jobs to RabbitMQ
- Worker sends BOTH a Socket.io event (for connected users) AND an email (for all users, regardless of connection state)
- Logs notification in DB
- Users can configure alert thresholds per contract
- Alert-via-email is essential because users are unlikely to be connected via WebSocket at the moment an expiry cron fires

### Module 7: Jurisdiction Law Enrichment (Public APIs)
- Enriches contract analysis with real public data
- Uses REST Countries API (`restcountries.com`) — validate party country/jurisdiction, get timezone
- Uses Abstract API Holidays (`abstractapi.com/holidays`) — check if contract expiry falls on a public holiday (adjust alerts accordingly)
- Uses Open Exchange Rates (`openexchangerates.org`) — show contract value in user's local currency
- Uses World Time API (`worldtimeapi.org`) — accurate current time for expiry calculations (HTTPS endpoint)
- Uses IPify (`api.ipify.org`) — get user's public IP for audit logging
- Note: Data.gov legal datasets are NOT integrated in v1; jurisdiction law enrichment is limited to country/timezone/holiday data only

### Module 8: Rate Limiting & Quota Management
- IP-based rate limiting (Express + Redis sliding window)
- Per-user quota: free = 3 analyses/month, pro = 50, enterprise = unlimited
- Quota tracked in Redis, synced to MongoDB nightly
- Rate limit headers returned on every response

### Module 9: Analytics & Audit
- Every API call logged with user, org, timestamp, endpoint, response time
- Audit trail for every contract action (uploaded, analyzed, deleted, shared)
- Admin dashboard endpoints: total users, contracts analyzed, jobs in queue

### Module 10: System Health
- A `/health` endpoint (unauthenticated) that returns the status of all dependencies: MongoDB, Redis, RabbitMQ
- Used for Docker healthchecks, load balancer probes, and uptime monitoring
- Must return HTTP 200 when all systems are healthy; HTTP 503 if any dependency is down

---

## 5. Subscription Tiers

| Feature | Free | Pro ($29/mo) | Enterprise ($99/mo) |
|---|---|---|---|
| Contract analyses/month | 3 | 50 | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Contract vault storage | 10 docs | 200 docs | Unlimited |
| Version comparison | ❌ | ✅ | ✅ |
| Real-time alerts | ❌ | ✅ | ✅ |
| Expiry email alerts | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ✅ | ✅ |

---

## 6. User Stories

| ID | Story | Priority |
|---|---|---|
| US-01 | As a user, I can register and verify my email before accessing the platform | P0 |
| US-02 | As a user, I can upload a contract and receive an AI analysis within 60 seconds | P0 |
| US-03 | As a user, I receive a real-time WebSocket notification when my analysis is ready | P0 |
| US-04 | As a manager, I can invite team members by email and assign roles | P1 |
| US-05 | As a user, I can compare two versions of a contract and see AI-explained differences | P1 |
| US-06 | As a user, I receive Socket.io AND email alerts when a contract is about to expire | P1 |
| US-07 | As an admin, I can view platform-wide analytics | P2 |
| US-08 | As a user, I can search contracts by keyword, tag, or date with paginated results | P1 |
| US-09 | As a user, my AI results are cached so repeat views are instant | P0 |
| US-10 | As a user, I am rate-limited appropriately based on my subscription | P0 |
| US-11 | As an ops team member, I can check `/health` to verify all services are running | P0 |

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | AI analysis job should complete within 60 seconds |
| Scalability | RabbitMQ workers can be scaled horizontally |
| Security | All endpoints require valid JWT; sensitive data never logged |
| Reliability | Failed jobs retry up to 3 times with exponential backoff |
| Caching | AI results cached in Redis for 24 hours |
| Rate Limiting | 100 req/min per IP; per-user quota enforced |
| Logging | Winston logger with request ID tracing |
| Containerization | Full Docker + docker-compose setup |
| Refresh Token Security | Refresh token rotation enforced on every use |
| RabbitMQ Resilience | Auto-reconnect logic required; connection loss must not crash the API |
| Pagination | All list endpoints must return paginated results with total count metadata |

---

## 8. Data Retention & GDPR Policy

- Contract text and analysis results are stored for the lifetime of the organization's account
- On organization deletion or account cancellation: all contracts, analyses, and audit logs belonging to that org are hard-deleted within 30 days
- Users can request deletion of their personal data via admin; this removes their user record and anonymizes their entries in audit logs (userId replaced with a tombstone value)
- AuditLog entries are auto-deleted after 90 days via MongoDB TTL index
- No contract data is shared with third parties; AI analysis is sent to OpenRouter only as a stateless API call

---

## 9. Success Metrics

- Time to analysis < 60 seconds for 95th percentile
- API uptime > 99.5%
- Cache hit rate > 70% for repeat contract views
- Job failure rate < 1%
- Zero auth bypass vulnerabilities (OWASP Top 10 covered)

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OpenRouter API rate limits | Implement request queuing + exponential backoff in worker |
| Large PDF uploads slow system | Extract text before queuing; reject files > 5MB |
| AI hallucinating legal advice | Clearly label all output as "AI analysis, not legal advice" |
| RabbitMQ job loss | Enable persistent queues + dead letter exchange |
| Redis cache invalidation bugs | Use contract hash as cache key; invalidate on re-upload |
| User misses expiry alert (not connected via WebSocket) | Send email alert for all expiry notifications regardless of socket status |
| Stolen refresh token | Enforce refresh token rotation; each token can only be used once |
| Orphaned data after account deletion | Enforce hard delete of all org data within 30 days of cancellation |

see this file and give me code in and give me code of logic and code is look like software developer made not like robot made code and follow and do the double check of given code 


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
  emailVerifyToken: String,            // Temp token for email confirmation
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