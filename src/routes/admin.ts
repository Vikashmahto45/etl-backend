import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest, isAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(isAdmin);

// Get all users
router.get('/users', async (req, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                profilePic: true,
                isAdmin: true,
                isBlocked: true,
                createdAt: true,
                _count: {
                    select: {
                        ads: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Block/unblock user
router.put('/users/:id/block', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { isBlocked } = req.body;

        if (typeof isBlocked !== 'boolean') {
            return res.status(400).json({ error: 'isBlocked must be a boolean' });
        }

        // Prevent blocking yourself
        if (id === req.userId) {
            return res.status(400).json({ error: 'Cannot block yourself' });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { isBlocked },
            select: {
                id: true,
                email: true,
                name: true,
                isBlocked: true,
            },
        });

        res.json(user);
    } catch (error) {
        console.error('Block/unblock user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Get all ads (including deleted)
router.get('/ads', async (req, res: Response) => {
    try {
        const { status } = req.query;

        const where: any = {};
        if (status) {
            where.status = status as string;
        }

        const ads = await prisma.ad.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                category: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(ads);
    } catch (error) {
        console.error('Get all ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

// Delete ad (hard delete or soft delete)
router.delete('/ads/:id', async (req, res: Response) => {
    try {
        const { id } = req.params;
        const { hard } = req.query;

        if (hard === 'true') {
            // Hard delete - completely remove from database
            await prisma.ad.delete({
                where: { id },
            });
        } else {
            // Soft delete - mark as deleted
            await prisma.ad.update({
                where: { id },
                data: { status: 'deleted' },
            });
        }

        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        console.error('Delete ad error:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// Get dashboard stats
router.get('/stats', async (req, res: Response) => {
    try {
        const [totalUsers, totalAds, activeAds, totalCategories] = await Promise.all([
            prisma.user.count(),
            prisma.ad.count(),
            prisma.ad.count({ where: { status: 'active' } }),
            prisma.category.count(),
        ]);

        res.json({
            totalUsers,
            totalAds,
            activeAds,
            totalCategories,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
