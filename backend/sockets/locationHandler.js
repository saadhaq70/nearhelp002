const prisma = require('../config/prisma');

const userEmitCounters = {};

module.exports = (io, socket) => {
    socket.on('location:update', async (data) => {
        try {
            const { lat, lng } = data;
            const userId = socket.user.id;

            socket.user.lat = lat;
            socket.user.lng = lng;

            if (!userEmitCounters[userId]) userEmitCounters[userId] = 0;
            userEmitCounters[userId]++;

            // Debounce DB writes — every 5 socket events
            if (userEmitCounters[userId] >= 5) {
                await prisma.user.update({
                    where: { id: userId },
                    data: { lat, lng }
                });
                userEmitCounters[userId] = 0;
            }

            // Emit to all active SOS rooms this user participates in
            const activeSOS = await prisma.sOS.findMany({
                where: {
                    status: { in: ['active', 'responding'] },
                    OR: [
                        { seeker_id: userId },
                        { responders: { has: userId } }
                    ]
                },
                select: { id: true }
            });

            (activeSOS || []).forEach(sos => {
                io.to(`sos:${sos.id}`).emit('location:responder_moved', { userId, lat, lng });
            });
        } catch (error) {
            console.error('Error in location:update', error);
        }
    });
};
