const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const sosHandler = require('./sosHandler');
const chatHandler = require('./chatHandler');
const locationHandler = require('./locationHandler');

module.exports = (io) => {
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.token;
            if (!token) return next(new Error('Authentication error: No token provided'));

            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            if (!decoded || !decoded.id) {
                console.error('[Socket Auth] Decoded token missing ID:', decoded);
                return next(new Error('Authentication error: Invalid token payload'));
            }

            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    skills: true,
                    is_suspended: true,
                    lat: true,
                    lng: true,
                    guardians: true
                }
            });

            if (!user) {
                console.error('[Socket Auth] User not found in DB for ID:', decoded.id);
                return next(new Error('Authentication error: User not found'));
            }
            if (user.is_suspended) return next(new Error('Authentication error: Account suspended'));

            socket.user = { ...user, _id: user.id };
            next();
        } catch (error) {
            console.error('Socket Auth error:', error);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`User connected: ${socket.user.name} (${socket.id})`);

        await prisma.user.update({
            where: { id: socket.user.id },
            data: { is_online: true }
        });
        io.to('admin:room').emit('admin:user_online', { userId: socket.user.id });

        socket.join(`user:${socket.user.id}`);

        if (socket.user.email === 'municipal@community.gov.in') {
            socket.join('admin:room');
            const activeSOS = await prisma.sOS.findMany({
                where: {
                    status: { in: ['active', 'responding'] }
                },
                select: {
                    id: true,
                    type: true,
                    status: true,
                    lat: true,
                    lng: true,
                    seeker_id: true,
                    responders: true,
                    created_at: true
                }
            });
            const onlineUsers = await prisma.user.findMany({
                where: { is_online: true },
                select: {
                    id: true,
                    name: true,
                    lat: true,
                    lng: true,
                    skills: true,
                    is_online: true
                }
            });
            socket.emit('admin:current_state', { activeSOS: activeSOS || [], onlineUsers: onlineUsers || [] });
        }

        sosHandler(io, socket);
        chatHandler(io, socket);
        locationHandler(io, socket);

        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.user.name}`);
            await prisma.user.update({
                where: { id: socket.user.id },
                data: {
                    is_online: false,
                    last_seen: new Date()
                }
            });
            io.to('admin:room').emit('admin:user_offline', { userId: socket.user.id });
        });
    });
};
