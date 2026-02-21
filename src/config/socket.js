/**
 * Socket.io Configuration
 *
 * Sets up the Socket.io server with:
 *   - JWT authentication on connection handshake
 *   - Room-based architecture (org rooms, user rooms, admin room)
 *   - Redis adapter for multi-instance support
 *
 * The actual Pub/Sub subscriber that bridges worker events → Socket.io
 * lives in src/sockets/pubsub.subscriber.js and is wired up in server.js.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { createAdapter } = require('@socket.io/redis-adapter');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.io on an HTTP server.
 * @param {http.Server} httpServer
 * @param {object} env - Validated environment config
 * @param {import('ioredis').Redis} pubClient - Redis command client
 * @param {import('ioredis').Redis} subClient - Redis subscriber client (a duplicate for socket adapter)
 * @returns {Server} Socket.io server instance
 */
function initSocket(httpServer, env, pubClient, subClient) {
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

    io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    // Redis adapter so Socket.io works across multiple Node instances
    io.adapter(createAdapter(pubClient, subClient));

    // JWT authentication middleware — runs on every connection attempt
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error('Authentication required — provide token in auth.token'));
        }

        // Strip "Bearer " prefix if present
        const raw = token.startsWith('Bearer ') ? token.slice(7) : token;

        try {
            const decoded = jwt.verify(raw, env.JWT_ACCESS_SECRET);
            socket.userId = decoded.userId;
            socket.orgId = decoded.orgId;
            socket.role = decoded.role;
            next();
        } catch (err) {
            logger.warn('Socket auth failed:', err.message);
            return next(new Error('Invalid or expired token'));
        }
    });

    // Connection handler — join rooms based on user identity
    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

        // Auto-join the user's personal room
        socket.join(`user:${socket.userId}`);

        // Join org room when requested
        socket.on('join:org', ({ orgId }) => {
            if (orgId) {
                socket.join(`org:${orgId}`);
                logger.debug(`Socket ${socket.id} joined room org:${orgId}`);
            }
        });

        // Admin room (only for admin users)
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
 * @returns {Server}
 */
function getIO() {
    if (!io) throw new Error('Socket.io not initialized. Call initSocket() first.');
    return io;
}

module.exports = { initSocket, getIO };
