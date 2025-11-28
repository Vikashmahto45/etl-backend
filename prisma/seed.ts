import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

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

    console.log('✅ Admin user created:', admin.email);

    // Create categories
    const categories = [
        'Cars',
        'Bikes',
        'Mobiles',
        'Electronics',
        'Furniture',
        'Others',
    ];

    for (const categoryName of categories) {
        await prisma.category.upsert({
            where: { name: categoryName },
            update: {},
            create: { name: categoryName },
        });
    }

    console.log('✅ Categories created:', categories.join(', '));

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

    console.log('✅ Test user created:', testUser.email);

    console.log('✨ Seeding complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
