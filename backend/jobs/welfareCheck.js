const prisma = require('../config/prisma');

const scheduleWelfareCheck = async (userId, sosId) => {
    try {
        const check = await prisma.welfareCheck.create({
            data: {
                user_id: userId,
                sos_id: sosId,
                scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000),
                sent: false
            }
        });

        setTimeout(async () => {
            try {
                await prisma.welfareCheck.update({
                    where: { id: check.id },
                    data: { sent: true }
                });
                if (global.io) {
                    global.io.to(`user:${userId}`).emit('welfare:check', {
                        message: "Hi, we are checking in. Are you okay after yesterday's incident?",
                        sosId
                    });
                }
                console.log(`[WELFARE CHECK] Sent to userId: ${userId}`);
            } catch (err) {
                console.error('Error sending welfare check:', err);
            }
        }, 24 * 60 * 60 * 1000);
    } catch (err) {
        console.error('Error scheduling welfare check:', err);
    }
};

const recordWelfareResponse = async (userId, sosId, response) => {
    try {
        const check = await prisma.welfareCheck.findFirst({
            where: {
                user_id: userId,
                sos_id: sosId
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        if (!check) {
            throw new Error('Welfare check not found');
        }

        const updatedCheck = await prisma.welfareCheck.update({
            where: { id: check.id },
            data: { response }
        });

        return updatedCheck;
    } catch (err) {
        console.error('Error recording welfare response:', err);
        throw err;
    }
};

module.exports = { scheduleWelfareCheck, recordWelfareResponse };
