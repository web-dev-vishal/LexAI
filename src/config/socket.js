/**
 * Socket.io Configuration
 *
 * Sets up the Socket.io server with:
 *   - JWT authentication on connection handshake
 *   - Room-based architecture (org rooms, user rooms, admin room)
 *   - Redis adapter for multi-instance horizontal scaling
 *
 * Room architecture:
 *   - `user:<userId>` — personal notifications (analysis complete, etc.)
 *   - `org:<orgId>` — org-wide events (contract expiring, etc.)
 *   - `admin` — platform-wide admin events
 *
 * The Pub/Sub subscriber that bridges worker events → Socket.io
 * lives in src/sockets/pubsub.subscriber.js and is wired up in server.js.
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import logger from '../utils/logger.js';

// Module-level reference to the Socket.io server instance
let io = null;

/**
 * Initialize Socket.io on an HTTP server.
 *
 * @param {import('http').Server} httpServer - Node.js HTTP server
 * @param {object} env - Validated environment config
 * @param {import('ioredis').Redis} pubClient - Redis client for adapter publishing
 * @param {import('ioredis').Redis} subClient - Redis client for adapter subscribing
 * @returns {Server} Socket.io server instance
 */
export function initSocket(httpServer, env, pubClient, subClient) {
    // Parse CORS origins from env — same origins allowed for HTTP and WebSocket
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

    io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'], // Prefer WebSocket, fall back to polling
        pingInterval: 25000,  // How often to ping clients (ms)
        pingTimeout: 60000,   // How long to wait for pong before disconnecting
    });

    // Redis adapter — allows Socket.io to work across multiple Node instances
    // Each instance publishes events to Redis, all instances receive them
    io.adapter(createAdapter(pubClient, subClient));

    // ─── JWT Authentication Middleware ──────────────────────────
    // Runs once per connection attempt — rejects unauthenticated clients
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error('Authentication required — provide token in auth.token'));
        }

        // Support both raw tokens and "Bearer <token>" format
        const raw = token.startsWith('Bearer ') ? token.slice(7) : token;

        try {
            const decoded = jwt.verify(raw, env.JWT_ACCESS_SECRET);

            // Attach user identity to the socket for use in event handlers
            socket.userId = decoded.userId;
            socket.orgId = decoded.orgId;
            socket.role = decoded.role;
            next();
        } catch (err) {
            logger.warn('Socket auth failed:', err.message);
            return next(new Error('Invalid or expired token'));
        }
    });

    // ─── Connection Handler ────────────────────────────────────
    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

        // Auto-join the user's personal room — used for direct notifications
        socket.join(`user:${socket.userId}`);

        // Join org room on request — used for org-wide broadcasts
        // Security: only allow joining the user's own org room
        socket.on('join:org', ({ orgId }) => {
            if (!orgId) return;

            // Prevent cross-org eavesdropping — user can only join their own org room
            if (orgId.toString() !== socket.orgId?.toString()) {
                logger.warn(`Socket ${socket.id} attempted to join unauthorized org room: ${orgId}`);
                socket.emit('error', { message: 'You can only join your own organization room.' });
                return;
            }

            socket.join(`org:${orgId}`);
            logger.debug(`Socket ${socket.id} joined room org:${orgId}`);
        });

        // Admin users automatically join the admin room for platform-wide events
        if (socket.role === 'admin') {
            socket.join('admin');
        }

        socket.on('disconnect', (reason) => {
            logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
        });

        socket.on('error', (err) => {
            logger.error(`Socket error on ${socket.id}:`, err);
        });
    });

    logger.info('✅ Socket.io initialized');
    return io;
}

/**
 * Get the Socket.io server instance.
 * Throws if called before initSocket() — catches init-order bugs.
 *
 * @returns {Server} Socket.io server instance
 */
export function getIO() {
    if (!io) throw new Error('Socket.io not initialized. Call initSocket() first.');
    return io;
}
