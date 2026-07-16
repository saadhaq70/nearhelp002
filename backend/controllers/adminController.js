const prisma = require('../config/prisma');

// @route GET /api/admin/live-map
const getLiveMapData = async (req, res) => {
    try {
        const activeSOS = await prisma.sOS.findMany({
            where: {
                status: { in: ['active', 'responding'] }
            },
            include: {
                seeker: {
                    select: { name: true }
                }
            },
            select: {
                id: true,
                type: true,
                status: true,
                lat: true,
                lng: true,
                seeker_id: true,
                responders: true,
                created_at: true,
                seeker: true
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
        
        res.json({ 
            activeSOS: activeSOS || [], 
            onlineUsers: onlineUsers || [] 
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/analytics
const getAnalytics = async (req, res) => {
    try {
        const allSOS = await prisma.sOS.findMany({
            where: { status: 'resolved' }
        });
        
        const today = new Date(); 
        today.setHours(0, 0, 0, 0);

        const resolvedToday = (allSOS || []).filter(s => s.resolved_at && new Date(s.resolved_at) >= today).length;
        const sosByType = {};
        const typeTimeSums = {};
        const typeTimeCounts = {};
        let totalResponseTime = 0, countWithTime = 0;
        const areaCounts = {};

        (allSOS || []).forEach(sos => {
            sosByType[sos.type] = (sosByType[sos.type] || 0) + 1;
            if (sos.response_time_seconds > 0) {
                totalResponseTime += sos.response_time_seconds;
                countWithTime++;
                typeTimeSums[sos.type] = (typeTimeSums[sos.type] || 0) + sos.response_time_seconds;
                typeTimeCounts[sos.type] = (typeTimeCounts[sos.type] || 0) + 1;
            }
            if (sos.lat && sos.lng) {
                const key = `${Number(sos.lat).toFixed(2)},${Number(sos.lng).toFixed(2)}`;
                areaCounts[key] = (areaCounts[key] || 0) + 1;
            }
        });

        const avgResponseTimeByType = {};
        for (const t in sosByType) {
            avgResponseTimeByType[t] = typeTimeCounts[t] > 0 ? Math.round(typeTimeSums[t] / typeTimeCounts[t]) : 0;
        }

        const topRespondedAreas = Object.keys(areaCounts)
            .map(k => ({ area: k, count: areaCounts[k] }))
            .sort((a, b) => b.count - a.count).slice(0, 10);

        const onlineUsers = await prisma.user.count({
            where: { is_online: true }
        });

        const falseAlertCount = await prisma.sOS.count({
            where: { is_flagged: true }
        });

        res.json({
            totalSOS: allSOS?.length || 0, 
            resolvedToday, 
            sosByType, 
            avgResponseTimeByType,
            avgResponseTime: countWithTime > 0 ? Math.round(totalResponseTime / (countWithTime * 60)) : 0,
            topRespondedAreas, 
            falseAlertCount, 
            onlineUsers
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/analytics/heatmap
const getHeatmap = async (req, res) => {
    try {
        const allSOS = await prisma.sOS.findMany({
            where: {
                lat: { not: null }
            },
            select: {
                lat: true,
                lng: true,
                type: true
            }
        });
        
        const grid = {};
        (allSOS || []).forEach(sos => {
            const gridX = Math.round(Number(sos.lng) * 100) / 100;
            const gridY = Math.round(Number(sos.lat) * 100) / 100;
            const key = `${gridX}_${gridY}`;
            if (!grid[key]) grid[key] = { gridX, gridY, count: 0, types: [] };
            grid[key].count++;
            if (!grid[key].types.includes(sos.type)) grid[key].types.push(sos.type);
        });
        res.json(Object.values(grid));
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/users
const getUsers = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        let where = {};
        if (status === 'flagged') where.false_alert_count = { gt: 0 };
        else if (status === 'suspended') where.is_suspended = true;
        else if (status === 'active') where.is_suspended = false;
        
        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                skills: true,
                trust_score: true,
                false_alert_count: true,
                is_suspended: true,
                created_at: true,
                is_active: true
            },
            orderBy: { created_at: 'desc' },
            skip: (pageNum - 1) * limitNum,
            take: limitNum
        });
        
        res.json(users || []);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/users/:id
const getUserById = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                skills: true,
                trust_score: true,
                false_alert_count: true,
                is_suspended: true,
                created_at: true,
                blood_group: true
            }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const sosHistory = await prisma.sOS.findMany({
            where: {
                OR: [
                    { seeker_id: req.params.id },
                    { responders: { has: req.params.id } }
                ]
            },
            select: {
                id: true,
                type: true,
                status: true,
                created_at: true,
                resolved_at: true,
                seeker_id: true,
                responders: true
            },
            orderBy: { created_at: 'desc' }
        });
        
        res.json({ user, sosHistory: sosHistory || [] });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/admin/users/:id/suspend
const suspendUser = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { is_suspended: true }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const io = req.app.get('io');
        if (io) io.to(`user:${user.id}`).emit('account:suspended', { reason: 'Admin suspended your account.' });
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/admin/users/:id/unsuspend
const unsuspendUser = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { 
                is_suspended: false, 
                false_alert_count: 0 
            }
        });
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/admin/users/:id/ban
const banUser = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { 
                is_suspended: true, 
                is_active: false 
            }
        });
        
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${user.id}`).emit('account:banned', { reason: 'Account permanently banned.' });
            io.in(`user:${user.id}`).disconnectSockets(true);
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/skills/queue
const getSkillQueue = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: {
                skills: { has: 'Medical / First Aid' },
                trust_score: { lt: 4.0 }
            },
            select: {
                id: true,
                name: true,
                email: true,
                skills: true,
                skill_verification_status: true,
                created_at: true,
                trust_score: true
            }
        });
        
        res.json(users || []);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/admin/skills/:userId/verify
const verifySkill = async (req, res) => {
    try {
        const { skill, status } = req.body;
        if (!skill || !['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid skill or status payload' });
        }
        
        const user = await prisma.user.findUnique({
            where: { id: req.params.userId }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        const verification = { ...(user.skill_verification_status || {}), [skill]: status };
        let skills = user.skills || [];
        if (status === 'rejected') skills = skills.filter(s => s !== skill);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                skill_verification_status: verification,
                skills
            }
        });

        if (status === 'verified') {
            const io = req.app.get('io');
            if (io) io.to(`user:${user.id}`).emit('skill:verified', { skill });
        }
        
        res.json({ ...user, skill_verification_status: verification });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/admin/welfare
const getWelfareChecks = async (req, res) => {
    try {
        const checks = await prisma.welfareCheck.findMany({
            where: { sent: true },
            include: {
                user: {
                    select: { name: true, email: true }
                },
                sos: {
                    select: { type: true }
                }
            },
            orderBy: { scheduled_for: 'desc' }
        });
        
        res.json(checks || []);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { getLiveMapData, getAnalytics, getHeatmap, getUsers, getUserById, suspendUser, unsuspendUser, banUser, getSkillQueue, verifySkill, getWelfareChecks };
