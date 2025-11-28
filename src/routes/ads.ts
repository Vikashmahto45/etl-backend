import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/ads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    },
});

// Create ad
router.post('/', authenticateToken, upload.array('images', 5), async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, price, categoryId, location } = req.body;

        if (!title || !description || !price || !categoryId || !location) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const files = req.files as Express.Multer.File[];
        const imagePaths = files ? files.map(file => `/uploads/ads/${file.filename}`) : [];

        const ad = await prisma.ad.create({
            data: {
                title,
                description,
                price: parseFloat(price),
                categoryId,
                location,
                images: imagePaths,
                userId: req.userId!,
            },
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
        });

        res.status(201).json(ad);
    } catch (error) {
        console.error('Create ad error:', error);
        res.status(500).json({ error: 'Failed to create ad' });
    }
});

// Get all ads with search, filter, and sort
router.get('/', async (req, res: Response) => {
    try {
        const {
            search,
            categoryId,
            minPrice,
            maxPrice,
            location,
            sortBy = 'newest',
            page = '1',
            limit = '20',
        } = req.query;

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        // Build where clause
        const where: any = {
            status: 'active',
        };

        if (search) {
            where.OR = [
                { title: { contains: search as string, mode: 'insensitive' } },
                { description: { contains: search as string, mode: 'insensitive' } },
            ];
        }

        if (categoryId) {
            where.categoryId = categoryId as string;
        }

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice as string);
            if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
        }

        if (location) {
            where.location = { contains: location as string, mode: 'insensitive' };
        }

        // Build orderBy clause
        let orderBy: any = { createdAt: 'desc' }; // newest by default

        if (sortBy === 'price_low') {
            orderBy = { price: 'asc' };
        } else if (sortBy === 'price_high') {
            orderBy = { price: 'desc' };
        }

        const [ads, total] = await Promise.all([
            prisma.ad.findMany({
                where,
                orderBy,
                skip,
                take: parseInt(limit as string),
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
                    _count: {
                        select: { favorites: true },
                    },
                },
            }),
            prisma.ad.count({ where }),
        ]);

        res.json({
            ads,
            pagination: {
                total,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

// Get single ad by ID
router.get('/:id', async (req, res: Response) => {
    try {
        const { id } = req.params;

        const ad = await prisma.ad.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        profilePic: true,
                        email: true,
                    },
                },
                category: true,
                _count: {
                    select: { favorites: true },
                },
            },
        });

        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        if (ad.status === 'deleted') {
            return res.status(404).json({ error: 'Ad not found' });
        }

        res.json(ad);
    } catch (error) {
        console.error('Get ad error:', error);
        res.status(500).json({ error: 'Failed to fetch ad' });
    }
});

// Get user's own ads
router.get('/user/my-ads', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const ads = await prisma.ad.findMany({
            where: {
                userId: req.userId,
                status: { not: 'deleted' },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                category: true,
                _count: {
                    select: { favorites: true },
                },
            },
        });

        res.json(ads);
    } catch (error) {
        console.error('Get my ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

// Delete ad (only owner or admin)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const ad = await prisma.ad.findUnique({
            where: { id },
        });

        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Check if user is owner or admin
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
        });

        if (ad.userId !== req.userId && !user?.isAdmin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Soft delete
        await prisma.ad.update({
            where: { id },
            data: { status: 'deleted' },
        });

        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        console.error('Delete ad error:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// Get all categories
router.get('/categories/all', async (req, res: Response) => {
    try {
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' },
        });

        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

export default router;
