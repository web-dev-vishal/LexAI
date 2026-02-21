/**
 * MongoDB Connection
 * Connects to MongoDB with retry logic and graceful shutdown handling.
 * Uses Mongoose 8.x with sensible defaults for production.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Attempt to connect to MongoDB with exponential backoff.
 * @param {string} uri - MongoDB connection string
 * @param {number} attempt - Current attempt number (internal)
 */
async function connectDB(uri, attempt = 1) {
    try {
        await mongoose.connect(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        logger.info('✅ MongoDB connected successfully');

        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });
    } catch (err) {
        if (attempt >= MAX_RETRIES) {
            logger.error(`MongoDB connection failed after ${MAX_RETRIES} attempts:`, err);
            process.exit(1);
        }

        const delay = RETRY_DELAY_MS * attempt;
        logger.warn(`MongoDB connection attempt ${attempt} failed. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return connectDB(uri, attempt + 1);
    }
}

/**
 * Gracefully close the MongoDB connection.
 */
async function disconnectDB() {
    try {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected gracefully');
    } catch (err) {
        logger.error('Error during MongoDB disconnect:', err);
    }
}

/**
 * Check if MongoDB is responsive (used by /health endpoint).
 * @returns {Promise<boolean>}
 */
async function isMongoHealthy() {
    try {
        const adminDb = mongoose.connection.db.admin();
        const result = await adminDb.ping();
        return result?.ok === 1;
    } catch {
        return false;
    }
}

module.exports = { connectDB, disconnectDB, isMongoHealthy };
