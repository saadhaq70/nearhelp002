const prisma = require('../config/prisma');

const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;

        // Ensure userId is a valid UUID to avoid Postgres errors
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
            console.error("[getNotifications] Invalid UUID format:", userId);
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        const notifications = await prisma.notification.findMany({
            where: { user_id: userId },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: { created_at: 'desc' },
            take: 20
        });

        res.json(notifications);
    } catch (error) {
        console.error("[getNotifications] Catch block error:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route PUT /api/notifications/:id/status
const updateStatus = async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    try {
        // Fetch notification first to verify ownership and type
        const notification = await prisma.notification.findFirst({
            where: {
                id: id,
                user_id: req.user.id
            }
        });

        if (!notification) return res.status(404).json({ message: 'Notification not found' });

        // Update status in notifications table (stored in both column and data)
        const newData = { ...notification.data, status };
        
        const updated = await prisma.notification.update({
            where: { id: id },
            data: {
                status: status,
                data: newData,
                is_read: true
            }
        });

        // Handle logical side effects based on type
        if (status === 'accepted' && notification.type === 'guardian_request') {
            const seekerId = notification.sender_id; // The person asking for help
            const guardianId = req.user.id;         // The person who accepted

            // Add recipient (guardian) to sender's (seeker) guardians list
            const seeker = await prisma.user.findUnique({
                where: { id: seekerId },
                select: { guardians: true }
            });

            const guardians = seeker.guardians || [];
            if (!guardians.includes(guardianId)) {
                guardians.push(guardianId);
                await prisma.user.update({
                    where: { id: seekerId },
                    data: { guardians }
                });
                    
                if (global.io) {
                    global.io.to(`user:${seekerId}`).emit('guardian:updated');
                    
                    const acceptNotif = await prisma.notification.create({
                        data: {
                            user_id: seekerId,
                            sender_id: guardianId,
                            type: 'guardian_accepted',
                            status: 'unread',
                            data: { message: `${req.user.name} accepted your guardian request` }
                        }
                    });
                    
                    if (acceptNotif) {
                        global.io.to(`user:${seekerId}`).emit('notification:new', {
                            ...acceptNotif,
                            sender: { id: req.user.id, name: req.user.name, email: req.user.email }
                        });
                    }
                }
            }
        }

        res.json(updated);
    } catch (error) {
        console.error("Update notification error:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @route PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: {
                user_id: req.user.id,
                status: { in: ['unread', 'pending'] }
            },
            data: { status: 'read' }
        });

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error("Mark all read error:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { getNotifications, updateStatus, markAllRead };
