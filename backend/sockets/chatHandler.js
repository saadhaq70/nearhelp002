const prisma = require('../config/prisma');

module.exports = (io, socket) => {
    socket.on('chat:message', async (data) => {
        try {
            const { sosId, message } = data;
            const sos = await prisma.sOS.findUnique({
                where: { id: sosId }
            });
            if (!sos) return socket.emit('error', { message: 'SOS not found' });

            const isSeeker = sos.seeker_id === socket.user.id;
            const isResponder = (sos.responders || []).includes(socket.user.id);
            if (!isSeeker && !isResponder) return socket.emit('error', { message: 'Unauthorized' });

            const chatObj = { sender: socket.user.id, message, timestamp: Date.now() };
            const chatLog = [...(sos.chat_log || []), chatObj];
            await prisma.sOS.update({
                where: { id: sosId },
                data: { chat_log: chatLog }
            });

            io.to(`chat:${sosId}`).emit('chat:message', {
                senderId: socket.user.id,
                senderName: socket.user.name,
                message,
                timestamp: chatObj.timestamp
            });
        } catch (error) {
            console.error('Error in chat:message', error);
        }
    });

    socket.on('chat:typing', (data) => {
        const { sosId } = data;
        socket.to(`chat:${sosId}`).emit('chat:typing', { senderName: socket.user.name });
    });
};
