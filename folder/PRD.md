# 📋 Product Requirements Document (PRD)
## LexAI — AI-Powered Contract Intelligence SaaS
**Version:** 1.0.0  
**Date:** February 2026  
**Author:** Backend Architecture Team  
**Status:** Ready for Development

---

## 1. Executive Summary

### 1.1 Product Vision
LexAI is a backend-first SaaS platform that helps **small and medium businesses** understand, analyze, summarize, and get risk alerts on legal contracts and documents — using AI (via OpenRouter), real-time notifications (Socket.io), background job processing (RabbitMQ), and intelligent caching (Redis). No expensive lawyer needed for the first read.

### 1.2 The Real Problem It Solves
Every day, thousands of SMBs sign contracts they don't fully understand — NDAs, vendor agreements, employment contracts, SaaS agreements. Hiring a lawyer for every document costs $300–$800/hour. Most founders just "skim and sign." This leads to hidden penalty clauses, auto-renewal traps, IP ownership conflicts, and liability surprises.

**LexAI solves this by:**
- Analyzing any uploaded contract with AI and flagging risky clauses in plain English
- Comparing contract versions and showing what changed (and why it matters)
- Sending real-time alerts when contract expiry or renewal dates approach
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
- RBAC: roles = `admin`, `manager`, `viewer`
- Email verification on signup
- Password reset with time-limited tokens
- Session blacklisting via Redis on logout

### Module 2: Organization & Team Management
- Multi-tenant: each org is isolated
- Invite team members by email
- Assign roles within an org
- Subscription plan tied to org (free, pro, enterprise)

### Module 3: Contract Management (Vault)
- Upload contract (PDF/DOCX/TXT) — stored as text in MongoDB
- Tag contracts (NDA, Vendor, Employment, etc.)
- Full-text search on contract content
- Version history — track edits/uploads of same contract
- Soft delete + audit trail on every action

### Module 4: AI Contract Analysis (Core Feature)
- On upload, push a job to RabbitMQ queue
- Worker picks up job, calls OpenRouter API (LLM)
- LLM performs:
  - Executive summary (plain English, 5 bullets)
  - Risk scoring (0–100) with explanation
  - Clause-by-clause flagging (red / yellow / green)
  - Key dates extraction (expiry, renewal, notice period)
  - Party obligation summary
- Result cached in Redis (TTL: 24h)
- Socket.io event emitted to client when analysis is complete

### Module 5: Contract Version Diff & AI Comparison
- Upload v2 of an existing contract
- System diffs the two versions (text diff algorithm)
- AI explains what changed and whether changes favor or hurt the user
- Highlights newly added risky clauses

### Module 6: Expiry & Renewal Alert Engine
- Background cron job scans contracts daily
- Finds contracts expiring in 90, 60, 30, 7 days
- Pushes reminder jobs to RabbitMQ
- Worker sends Socket.io event + logs notification in DB
- Users can configure alert thresholds per contract

### Module 7: Jurisdiction Law Enrichment (Public APIs)
- Enriches contract analysis with real public legal/regulatory data
- Uses REST Countries API — to validate party country/jurisdiction
- Uses Data.gov legal datasets — jurisdiction-specific law references
- Uses Open Notify / other APIs for date/timezone accuracy on deadlines

### Module 8: Rate Limiting & Quota Management
- IP-based rate limiting (Express + Redis sliding window)
- Per-user quota: free = 3 analyses/month, pro = 50, enterprise = unlimited
- Quota tracked in Redis, synced to MongoDB nightly
- Rate limit headers returned on every response

### Module 9: Analytics & Audit
- Every API call logged with user, org, timestamp, endpoint, response time
- Audit trail for every contract action (uploaded, analyzed, deleted, shared)
- Admin dashboard endpoints: total users, contracts analyzed, jobs in queue

---

## 5. Subscription Tiers

| Feature | Free | Pro ($29/mo) | Enterprise ($99/mo) |
|---|---|---|---|
| Contract analyses/month | 3 | 50 | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Contract vault storage | 10 docs | 200 docs | Unlimited |
| Version comparison | ❌ | ✅ | ✅ |
| Real-time alerts | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ✅ | ✅ |

---

## 6. User Stories

| ID | Story | Priority |
|---|---|---|
| US-01 | As a user, I can register and verify my email before accessing the platform | P0 |
| US-02 | As a user, I can upload a contract and receive an AI analysis within 60 seconds | P0 |
| US-03 | As a user, I receive a real-time WebSocket notification when my analysis is ready | P0 |
| US-04 | As a manager, I can invite team members and assign roles | P1 |
| US-05 | As a user, I can compare two versions of a contract and see AI-explained differences | P1 |
| US-06 | As a user, I receive alerts when a contract is about to expire | P1 |
| US-07 | As an admin, I can view platform-wide analytics | P2 |
| US-08 | As a user, I can search contracts by keyword, tag, or date | P1 |
| US-09 | As a user, my AI results are cached so repeat views are instant | P0 |
| US-10 | As a user, I am rate-limited appropriately based on my subscription | P0 |

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

---

## 8. Success Metrics

- Time to analysis < 60 seconds for 95th percentile
- API uptime > 99.5%
- Cache hit rate > 70% for repeat contract views
- Job failure rate < 1%
- Zero auth bypass vulnerabilities (OWASP Top 10 covered)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OpenRouter API rate limits | Implement request queuing + exponential backoff in worker |
| Large PDF uploads slow system | Extract text before queuing; reject files > 5MB |
| AI hallucinating legal advice | Clearly label all output as "AI analysis, not legal advice" |
| RabbitMQ job loss | Enable persistent queues + dead letter exchange |
| Redis cache invalidation bugs | Use contract hash as cache key; invalidate on re-upload |
