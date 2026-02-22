/**
 * Express App Setup
 *
 * Configures all middleware, security headers, and routes.
 * Does NOT start the server — that's done in server.js.
 *
 * NOTE: `express-async-errors` is imported for its side effect —
 * it patches Express to catch unhandled promise rejections in
 * route handlers, making asyncWrapper optional but still useful
 * for explicit error handling.
 */

import 'express-async-errors';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';

import routes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { rateLimiter } from './middleware/rateLimiter.middleware.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { attachRequestId, httpLogger } from './middleware/requestLogger.middleware.js';

export default function createApp() {
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
