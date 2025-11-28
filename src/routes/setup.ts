import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const router = Router();
const prisma = new PrismaClient();

// Reset and setup database
router.get('/reset', async (req, res) => {
    try {
        // Drop all tables and recreate
        await prisma.$executeRawUnsafe(`DROP SCHEMA public CASCADE`);
        await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);

        res.json({
            success: true,
            message: 'Database reset! Now redeploy to run migrations.',
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// One-time setup endpoint to seed database
router.get('/setup', async (req, res) => {
    try {
        // Create admin user
        const adminPassword = await bcrypt.hash('admin123', 10);
        const admin = await prisma.user.upsert({
            where: { email: 'admin@etl.com' },
            update: {},
            create: {
                email: 'admin@etl.com',
                password: adminPassword,
                name: 'Admin User',
                phone: '+1234567890',
                isAdmin: true,
            },
        });

        // Create categories
        const categories = ['Cars', 'Bikes', 'Mobiles', 'Electronics', 'Furniture', 'Others'];

        for (const categoryName of categories) {
            await prisma.category.upsert({
                where: { name: categoryName },
                update: {},
                create: { name: categoryName },
            });
        }

        // Create test user
        const testPassword = await bcrypt.hash('test123', 10);
        const testUser = await prisma.user.upsert({
            where: { email: 'test@etl.com' },
            update: {},
            create: {
                email: 'test@etl.com',
                password: testPassword,
                name: 'Test User',
                phone: '+9876543210',
            },
        });

        res.json({
            success: true,
            message: 'Database seeded successfully!',
            data: {
                admin: admin.email,
                testUser: testUser.email,
                categories: categories,
            },
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;
