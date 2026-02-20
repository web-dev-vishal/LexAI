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