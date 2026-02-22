<div align="center">

# ⚖️ LexAI

### AI-Powered Contract Intelligence Platform

Upload any legal contract. Get instant AI-powered risk analysis, clause-by-clause review, obligation tracking, and expiry alerts — all in real-time.

[![Node.js](https://img.shields.io/badge/Node.js-≥20.0.0-339933?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Powered-DC382D?logo=redis)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-Queue-FF6600?logo=rabbitmq)](https://www.rabbitmq.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

</div>

---

## 🎯 What It Does

| Feature | Description |
|---|---|
| 📄 **Contract Upload** | Upload PDF, DOCX, or plain text contracts |
| 🤖 **AI Analysis** | Risk scoring, clause flagging, obligation extraction via OpenRouter LLM |
| ⚡ **Real-Time Updates** | WebSocket notifications when analysis completes |
| 📊 **Version Comparison** | AI-powered diff between contract versions |
| 🔔 **Expiry Alerts** | Automated email + socket alerts before contract expiry |
| 🏢 **Multi-Tenant** | Organization-based isolation with RBAC (admin/manager/viewer) |
| 📈 **Quota Management** | Redis-based monthly analysis limits per subscription tier |
| 🔐 **Enterprise Security** | JWT rotation, token blacklist, rate limiting, input validation |

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| **Runtime** | Node.js ≥ 20 (ES Modules) |
| **Framework** | Express.js 4.19 |
| **Database** | MongoDB 8 + Mongoose ODM |
| **Cache & Pub/Sub** | Redis (ioredis) |
| **Message Queue** | RabbitMQ (amqplib) |
| **Real-Time** | Socket.io with Redis adapter |
| **AI Engine** | OpenRouter API (Llama 3.1, Mistral 7B) |
| **Auth** | JWT (access + refresh tokens) with bcrypt |
| **Validation** | Joi + Zod |
| **Email** | Nodemailer (SMTP) |
| **File Parsing** | pdf-parse, mammoth (DOCX) |
| **Logging** | Winston + Morgan |
| **Security** | Helmet, CORS, express-mongo-sanitize, rate limiting |
| **Scheduling** | node-cron |

---

## 📁 Folder Structure

```
LexAI/
├── server.js              # API entry point (HTTP + Socket.io + cron)
├── worker.js              # Background worker (RabbitMQ consumers)
├── package.json           # Dependencies & scripts
├── scripts/seed.js        # First admin user seed script
│
└── src/
    ├── app.js             # Express middleware & route setup
    ├── config/            # DB, Redis, RabbitMQ, Socket.io, env validation
    ├── constants/         # HTTP codes, plans, queues, roles
    ├── models/            # 7 Mongoose models
    ├── services/          # 13 business logic services
    ├── controllers/       # 7 HTTP request handlers
    ├── middleware/         # 7 middleware (auth, RBAC, validation, rate limit)
    ├── validators/        # 4 Joi schema files
    ├── routes/            # 8 Express routers
    ├── utils/             # 8 shared utilities
    ├── sockets/           # Socket.io event bridge
    ├── workers/           # RabbitMQ consumers (analysis + alerts)
    └── jobs/              # Cron jobs (daily expiry scan)
```

> 📖 For a detailed explanation of every file and how data flows through the system, see **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)**.

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
# App
NODE_ENV=development
PORT=3000
API_VERSION=v1

# MongoDB
MONGO_URI=mongodb://localhost:27017/lexai

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
ANALYSIS_QUEUE=lexai.analysis.queue
ALERT_QUEUE=lexai.alert.queue
DLX_EXCHANGE=lexai.dlx

# JWT (use strong, random 32+ character strings)
JWT_ACCESS_SECRET=your-access-secret-at-least-32-chars-long
JWT_REFRESH_SECRET=your-refresh-secret-at-least-32-chars-long
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_PRIMARY_MODEL=meta-llama/llama-3.1-8b-instruct:free
AI_FALLBACK_MODEL=mistralai/mistral-7b-instruct:free

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# File Upload
MAX_FILE_SIZE_MB=5
ALLOWED_MIME_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Email (Ethereal for testing)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@lexai.io

# External APIs
REST_COUNTRIES_URL=https://restcountries.com/v3.1
WORLD_TIME_API_URL=https://worldtimeapi.org/api
```

---

## 🚀 How to Run Locally

### Prerequisites

- **Node.js** ≥ 20
- **MongoDB** (local or Atlas)
- **Redis** (local or cloud)
- **RabbitMQ** (local or CloudAMQP)

### 1. Install Dependencies

```bash
git clone https://github.com/YOUR_USERNAME/LexAI.git
cd LexAI
npm install
```

### 2. Start Infrastructure (Docker option)

If you have Docker:

```bash
docker-compose up -d    # Starts MongoDB, Redis, RabbitMQ
```

### 3. Configure Environment

```bash
cp .env.example .env    # Copy and fill in your values
```

### 4. Seed Admin User

```bash
npm run seed
```

### 5. Start the API Server

```bash
npm run dev             # Development with auto-reload
# or
npm start               # Production
```

### 6. Start the Background Worker

In a separate terminal:

```bash
npm run dev:worker      # Development
# or
npm run start:worker    # Production
```

### 7. Verify

```bash
curl http://localhost:3000/health
```

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | ❌ | Register new user |
| `POST` | `/api/v1/auth/verify-email` | ❌ | Verify email token |
| `POST` | `/api/v1/auth/login` | ❌ | Login, get tokens |
| `POST` | `/api/v1/auth/refresh-token` | 🍪 | Refresh access token |
| `POST` | `/api/v1/auth/logout` | ✅ | Blacklist current token |
| `POST` | `/api/v1/auth/forgot-password` | ❌ | Request password reset |
| `POST` | `/api/v1/auth/reset-password` | ❌ | Reset with token |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | ✅ | Get my profile + quota |
| `PATCH` | `/api/v1/users/me` | ✅ | Update my name |
| `PATCH` | `/api/v1/users/me/password` | ✅ | Change password |
| `GET` | `/api/v1/users/:id` | 🔒 Admin | Get user by ID |

### Organizations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/orgs` | ✅ | Create organization |
| `GET` | `/api/v1/orgs/:orgId` | ✅ | Get org details |
| `PATCH` | `/api/v1/orgs/:orgId` | 🔒 Admin/Mgr | Update org |
| `POST` | `/api/v1/orgs/:orgId/invite` | 🔒 Admin/Mgr | Invite member |
| `POST` | `/api/v1/orgs/:orgId/invite/accept` | ❌ | Accept invite |
| `PATCH` | `/api/v1/orgs/:orgId/members/:userId/role` | 🔒 Admin | Change role |
| `DELETE` | `/api/v1/orgs/:orgId/members/:userId` | 🔒 Admin | Remove member |

### Contracts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/contracts` | ✅ | Upload contract (file/text) |
| `GET` | `/api/v1/contracts` | ✅ | List with pagination/filter |
| `GET` | `/api/v1/contracts/:id` | ✅ | Get full contract |
| `PATCH` | `/api/v1/contracts/:id` | ✅ | Update metadata |
| `DELETE` | `/api/v1/contracts/:id` | 🔒 Admin/Mgr | Soft delete |
| `POST` | `/api/v1/contracts/:id/versions` | ✅ | Upload new version |
| `GET` | `/api/v1/contracts/:id/versions` | ✅ | Version history |
| `POST` | `/api/v1/contracts/:id/compare` | ✅ | Compare versions (AI) |
| `GET` | `/api/v1/contracts/:id/audit` | ✅ | Audit trail |

### Analyses

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/analyses` | ✅ | Request AI analysis |
| `GET` | `/api/v1/analyses/:id` | ✅ | Get analysis result |
| `GET` | `/api/v1/analyses/contract/:contractId` | ✅ | All analyses for contract |

### Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/stats` | 🔒 Admin | Platform statistics |
| `GET` | `/api/v1/admin/queue/status` | 🔒 Admin | RabbitMQ queue status |
| `GET` | `/api/v1/admin/users` | 🔒 Admin | List all users |
| `GET` | `/api/v1/admin/audit-logs` | 🔒 Admin | Global audit logs |

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | Service health check |

> 📖 For complete request/response examples with dummy data, see **[POSTMAN_COLLECTION.md](./POSTMAN_COLLECTION.md)**.

---

## 📊 Entity-Relationship Diagram

> 📖 Full ER diagram with all fields and data types is in **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md#er-diagram)**.

**Quick overview of model relationships:**

```
User ──belongs to──▶ Organization
Organization ──has many──▶ Contract, Invitation, AuditLog, Notification
Contract ──has many──▶ Analysis, Version (embedded), Party (embedded)
Analysis ──contains──▶ Clause (embedded)
```

---

## 🚢 Deployment

LexAI is deployment-ready for **Render.com** (free tier supported).

> 📖 Full step-by-step deployment guide with GitHub setup, service configuration, env vars, and common error fixes: **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

**Live URL format after deployment:**
```
https://lexai-api.onrender.com/health
https://lexai-api.onrender.com/api/v1/auth/login
```

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Usage |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change, no feature/bug fix |
| `test:` | Adding/updating tests |
| `chore:` | Maintenance tasks |

---

## 📜 License

This project is licensed under the **ISC License**. See [LICENSE](./LICENSE) for details.

---

<div align="center">

Built with ❤️ by the LexAI Team

</div>
