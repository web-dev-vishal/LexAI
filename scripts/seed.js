/**
 * Admin Seed Script
 *
 * Creates the first admin user in a fresh database.
 * Run once on first deployment: `npm run seed`
 */

import 'dotenv/config';

import mongoose from 'mongoose';
import User from '../src/models/User.model.js';
import logger from '../src/utils/logger.js';

async function seed() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is not set. Cannot seed.');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        logger.info('Connected to MongoDB for seeding');

        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            logger.info(`Admin user already exists: ${existingAdmin.email}. Skipping seed.`);
            await mongoose.disconnect();
            process.exit(0);
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'admin@lexai.io';
        const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe@Immediately123';

        const admin = await User.create({
            name: 'Platform Admin',
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            emailVerified: true,
            isActive: true,
        });

        logger.info('✅ Admin user created:');
        logger.info(`   Email: ${admin.email}`);
        logger.info(`   Role:  ${admin.role}`);
        logger.info(`   ID:    ${admin._id}`);
        logger.info('⚠️  Change the admin password immediately in production!');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        logger.error('Seed failed:', err);
        process.exit(1);
    }
}

seed();
