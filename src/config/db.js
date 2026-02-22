/**
 * MongoDB Connection
 *
 * Connects to MongoDB with retry logic and graceful shutdown handling.
 * Uses Mongoose 8.x with sensible pool/timeout defaults for production.
 *
 * Retry strategy: linear backoff (3s × attempt number) with a max of 5 attempts.
 * If all retries fail, the process exits so the orchestrator (Docker, PM2)
 * can restart it — better than running in a broken state.
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Retry configuration — adjust if your DB takes longer to become available
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // Base delay, multiplied by attempt number

/**
 * Attempt to connect to MongoDB with linear backoff.
 * Registers event listeners for runtime connection issues after initial connect.
 *
 * @param {string} uri - MongoDB connection string
 * @param {number} [attempt=1] - Current retry attempt (used internally during recursion)
 */
export async function connectDB(uri, attempt = 1) {
    try {
        await mongoose.connect(uri, {
            maxPoolSize: 10,                  // Max concurrent connections in the pool
            serverSelectionTimeoutMS: 5000,   // Fail fast if no server is reachable
            socketTimeoutMS: 45000,           // Kill stuck queries after 45s
        });

        logger.info('✅ MongoDB connected successfully');

        // These listeners handle issues AFTER the initial connection succeeds
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Mongoose will attempt reconnect automatically.');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });
    } catch (err) {
        // All retries exhausted — exit so the orchestrator can restart us
        if (attempt >= MAX_RETRIES) {
            logger.error(`MongoDB connection failed after ${MAX_RETRIES} attempts:`, err);
            process.exit(1);
        }

        // Linear backoff: 3s, 6s, 9s, 12s...
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn(`MongoDB connection attempt ${attempt} failed. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return connectDB(uri, attempt + 1);
    }
}

/**
 * Gracefully close the MongoDB connection.
 * Called during server shutdown to drain in-flight queries.
 */
export async function disconnectDB() {
    try {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected gracefully');
    } catch (err) {
        logger.error('Error during MongoDB disconnect:', err);
    }
}

/**
 * Check if MongoDB is responsive (used by /health endpoint).
 * Sends a lightweight `ping` command to the admin DB.
 *
 * @returns {Promise<boolean>} True if MongoDB responds to ping
 */
export async function isMongoHealthy() {
    try {
        const adminDb = mongoose.connection.db.admin();
        const result = await adminDb.ping();
        return result?.ok === 1;
    } catch {
        return false;
    }
}
