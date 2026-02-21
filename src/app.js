/**
 * Express App Setup
 *
 * Configures all middleware, security headers, and routes.
 * Does NOT start the server — that's done in server.js.
 */

require('express-async-errors');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const healthRoutes = require('./routes/health.routes');
const { rateLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler } = require('./middleware/errorHandler.middleware');
const { attachRequestId, httpLogger } = require('./middleware/requestLogger.middleware');

function createApp() {
    const app = express();

    // ─── Security Middleware ────────────────────────────────────────
    app.use(helmet());

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());
    app.use(cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id', 'x-request-id'],
    }));

    // Prevent NoSQL injection
    app.use(mongoSanitize());

    // ─── Parsing Middleware ─────────────────────────────────────────
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // ─── Request Logging ────────────────────────────────────────────
    app.use(attachRequestId);
    app.use(httpLogger);

    // ─── Rate Limiting ──────────────────────────────────────────────
    app.use(rateLimiter());

    // ─── Health Check (unauthenticated) ─────────────────────────────
    app.use('/health', healthRoutes);

    // ─── API Routes ─────────────────────────────────────────────────
    const apiVersion = process.env.API_VERSION || 'v1';
    app.use(`/api/${apiVersion}`, routes);

    // ─── 404 Handler ────────────────────────────────────────────────
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: `Route ${req.method} ${req.originalUrl} not found.`,
            },
        });
    });

    // ─── Global Error Handler (must be last) ────────────────────────
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
