import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthenticatedWebSocket extends WebSocket {
    userId?: string;
}

const clients = new Map<string, AuthenticatedWebSocket>();

export const setupWebSocket = (wss: WebSocketServer) => {
    wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
        console.log('New WebSocket connection');

        // Extract token from query parameter
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) {
            ws.close(1008, 'No token provided');
            return;
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
                userId: string;
            };

            ws.userId = decoded.userId;
            clients.set(decoded.userId, ws);

            console.log(`User ${decoded.userId} connected via WebSocket`);

            // Handle incoming messages
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());

                    if (message.type === 'chat_message') {
                        const { conversationId, content, receiverId } = message;

                        // Save message to database
                        const savedMessage = await prisma.message.create({
                            data: {
                                content,
                                senderId: ws.userId!,
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

                        // Send to receiver if online
                        const receiverWs = clients.get(receiverId);
                        if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                            receiverWs.send(JSON.stringify({
                                type: 'new_message',
                                message: savedMessage,
                            }));
                        }

                        // Send confirmation back to sender
                        ws.send(JSON.stringify({
                            type: 'message_sent',
                            message: savedMessage,
                        }));
                    }
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Failed to process message',
                    }));
                }
            });

            ws.on('close', () => {
                if (ws.userId) {
                    clients.delete(ws.userId);
                    console.log(`User ${ws.userId} disconnected`);
                }
            });
        } catch (error) {
            console.error('WebSocket auth error:', error);
            ws.close(1008, 'Invalid token');
        }
    });
};
