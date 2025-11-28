import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get or create conversation
router.post('/conversation', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { otherUserId } = req.body;

        if (!otherUserId) {
            return res.status(400).json({ error: 'Other user ID is required' });
        }

        // Sort user IDs to ensure consistent conversation lookup
        const [user1Id, user2Id] = [req.userId!, otherUserId].sort();

        // Find or create conversation
        let conversation = await prisma.conversation.findUnique({
            where: {
                user1Id_user2Id: {
                    user1Id,
                    user2Id,
                },
            },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    user1Id,
                    user2Id,
                },
                include: {
                    user1: {
                        select: {
                            id: true,
                            name: true,
                            profilePic: true,
                        },
                    },
                    user2: {
                        select: {
                            id: true,
                            name: true,
                            profilePic: true,
                        },
                    },
                    messages: true,
                },
            });
        }

        res.json(conversation);
    } catch (error) {
        console.error('Get/create conversation error:', error);
        res.status(500).json({ error: 'Failed to get conversation' });
    }
});

// Get all user conversations
router.get('/conversations', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { user1Id: req.userId },
                    { user2Id: req.userId },
                ],
            },
            include: {
                user1: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
                user2: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        res.json(conversations);
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get messages for a conversation
router.get('/messages/:conversationId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { conversationId } = req.params;

        // Verify user is part of conversation
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.user1Id !== req.userId && conversation.user2Id !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
            },
        });

        res.json(messages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send message
router.post('/message', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const { conversationId, content, receiverId } = req.body;

        if (!conversationId || !content || !receiverId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify conversation exists and user is part of it
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.user1Id !== req.userId && conversation.user2Id !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const message = await prisma.message.create({
            data: {
                content,
                senderId: req.userId!,
                receiverId,
                conversationId,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        profilePic: true,
                    },
                },
            },
        });

        // Update conversation timestamp
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        res.status(201).json(message);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;
