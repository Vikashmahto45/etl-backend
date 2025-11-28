import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Add to favorites
router.post('/:adId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { adId } = req.params;

        // Check if ad exists
        const ad = await prisma.ad.findUnique({
            where: { id: adId },
        });

        if (!ad || ad.status === 'deleted') {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Check if already favorited
        const existing = await prisma.favorite.findUnique({
            where: {
                userId_adId: {
                    userId: req.userId!,
                    adId,
                },
            },
        });

        if (existing) {
            return res.status(400).json({ error: 'Already in favorites' });
        }

        const favorite = await prisma.favorite.create({
            data: {
                userId: req.userId!,
                adId,
            },
        });

        res.status(201).json(favorite);
    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({ error: 'Failed to add to favorites' });
    }
});

// Remove from favorites
router.delete('/:adId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { adId } = req.params;

        await prisma.favorite.delete({
            where: {
                userId_adId: {
                    userId: req.userId!,
                    adId,
                },
            },
        });

        res.json({ message: 'Removed from favorites' });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Failed to remove from favorites' });
    }
});

// Get user's favorites
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const favorites = await prisma.favorite.findMany({
            where: { userId: req.userId },
            include: {
                ad: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                phone: true,
                                profilePic: true,
                            },
                        },
                        category: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Filter out deleted ads
        const validFavorites = favorites.filter(f => f.ad.status !== 'deleted');

        res.json(validFavorites.map(f => f.ad));
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

// Check if ad is favorited
router.get('/check/:adId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { adId } = req.params;

        const favorite = await prisma.favorite.findUnique({
            where: {
                userId_adId: {
                    userId: req.userId!,
                    adId,
                },
            },
        });

        res.json({ isFavorite: !!favorite });
    } catch (error) {
        console.error('Check favorite error:', error);
        res.status(500).json({ error: 'Failed to check favorite status' });
    }
});

export default router;
