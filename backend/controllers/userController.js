const prisma = require('../config/prisma');

const VALID_SKILLS = [
    'CPR Trained',
    'Medical / First Aid',
    'Firefighting / Fire Safety',
    'Search & Rescue',
    'Mental Health Support',
    'Counselling / Crisis Support',
    'Car / Vehicle Diagnosis',
    'Electrical Emergency',
    'Structural / Civil Emergency',
    'Legal Aid',
    'Child Safety',
    'Elderly Care',
    'Disaster Management',
    'Swimming / Water Rescue',
    'Security / Crowd Control',
    'Food & Shelter Aid',
    'Translation / Language Aid',
    'None',
];

// @route GET /api/users/profile
const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                age: true,
                blood_group: true,
                health_conditions: true,
                skills: true,
                lat: true,
                lng: true,
                guardians: true,
                trust_score: true,
                total_ratings: true,
                is_physically_disabled: true,
                skill_verification_status: true,
                created_at: true,
                false_alert_count: true,
                is_suspended: true
            }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Hydrate guardians
        let guardiansData = [];
        if (user.guardians?.length) {
            const gs = await prisma.user.findMany({
                where: { id: { in: user.guardians } },
                select: { id: true, name: true, email: true, phone: true }
            });
            guardiansData = gs || [];
        }
        res.json({ ...user, _id: user.id, location: { lat: user.lat, lng: user.lng }, guardiansData });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @route PUT /api/users/profile
const updateProfile = async (req, res) => {
    const { name, phone, age, isPhysicallyDisabled, bloodGroup, healthConditions } = req.body;
    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (age !== undefined) updates.age = parseInt(age) || null;
        if (isPhysicallyDisabled !== undefined) updates.is_physically_disabled = isPhysicallyDisabled;
        if (bloodGroup !== undefined) updates.blood_group = bloodGroup;
        if (healthConditions !== undefined) updates.health_conditions = healthConditions;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updates
        });
        
        res.json({ ...user, _id: user.id });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @route PUT /api/users/skills
const updateSkills = async (req, res) => {
    const { skills } = req.body;
    try {
        if (!Array.isArray(skills)) return res.status(400).json({ message: 'Skills must be an array' });
        const isValid = skills.every(s => VALID_SKILLS.includes(s));
        if (!isValid) return res.status(400).json({ message: 'Invalid skills provided' });

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { skills }
        });
        
        res.json({ ...user, _id: user.id });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @route PUT /api/users/location
const updateLocation = async (req, res) => {
    const { lat, lng } = req.body;
    try {
        if (lat === undefined || lng === undefined) return res.status(400).json({ message: 'lat and lng required' });
        
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                is_online: true,
                last_seen: new Date()
            }
        });
        
        res.json({ ...user, _id: user.id, location: { lat: user.lat, lng: user.lng } });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @route GET /api/users/guardians
const getGuardians = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { guardians: true }
        });
        
        const guardianIds = user?.guardians || [];
        let accepted = [];
        if (guardianIds.length > 0) {
            const gs = await prisma.user.findMany({
                where: { id: { in: guardianIds } },
                select: { id: true, name: true, email: true, phone: true }
            });
            accepted = gs || [];
        }

        const pendingNotifs = await prisma.notification.findMany({
            where: {
                sender_id: req.user.id,
                type: 'guardian_request'
            }
        });

        if (pendingNotifs && pendingNotifs.length > 0) {
            console.log("SAMPLE NOTIFICATION:", pendingNotifs[0]);
        }

        // Filter pending locally and ensure we don't include already accepted guardians
        const pendingList = (pendingNotifs || [])
            .filter(n => n.status === 'pending' || n.data?.status === 'pending')
            .filter(n => !guardianIds.includes(n.user_id));
        
        let pending = [];
        if (pendingList.length > 0) {
            const pendingIds = pendingList.map(n => n.user_id);
            const ps = await prisma.user.findMany({
                where: { id: { in: pendingIds } },
                select: { id: true, name: true, email: true }
            });
            pending = ps || [];
        }

        res.json({ accepted, pending });
    } catch (error) {
        console.error("getGuardians unhandled error:", error);
        res.status(500).json({ message: 'Server error', details: error.message });
    }
};

// @route POST /api/users/guardians
const addGuardian = async (req, res) => {
    const { email } = req.body;
    try {
        const guardian = await prisma.user.findFirst({
            where: { 
                email: { 
                    equals: (email || '').trim(), 
                    mode: 'insensitive' 
                } 
            },
            select: { id: true, name: true, email: true, phone: true }
        });
        
        if (!guardian) return res.status(404).json({ message: 'User with that email not found' });
        if (guardian.id === req.user.id) return res.status(400).json({ message: 'Cannot add yourself as a guardian' });

        const self = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { name: true, guardians: true }
        });
        
        const guardians = self?.guardians || [];
        if (guardians.includes(guardian.id)) return res.status(400).json({ message: 'Already a guardian' });

        // Check if a pending request already exists
        const existing = await prisma.notification.findFirst({
            where: {
                user_id: guardian.id,
                sender_id: req.user.id,
                type: 'guardian_request',
                status: 'pending'
            }
        });

        if (existing) return res.status(400).json({ message: 'Guardian request already pending' });

        // Create notification
        const notification = await prisma.notification.create({
            data: {
                user_id: guardian.id,
                sender_id: req.user.id,
                type: 'guardian_request',
                status: 'pending',
                data: { sender_name: self.name }
            }
        });

        // Emit socket event for real-time update
        if (global.io) {
            global.io.to(`user:${guardian.id}`).emit('notification:new', {
                ...notification,
                sender: { id: req.user.id, name: self.name, email: req.user.email }
            });
        }

        res.json({ message: 'Guardian request sent', notification });
    } catch (error) {
        console.error("addGuardian unhandled error:", error);
        res.status(500).json({ message: 'Server error', details: error.message || error });
    }
};

// @route DELETE /api/users/guardians/:id
const removeGuardian = async (req, res) => {
    try {
        const self = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { guardians: true }
        });
        
        const guardians = (self?.guardians || []).filter(g => g !== req.params.id);
        
        await prisma.user.update({
            where: { id: req.user.id },
            data: { guardians }
        });
        
        res.json({ message: 'Guardian removed' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @route GET /api/users/nearby
const getNearbyUsers = async (req, res) => {
    try {
        // Prefer query params (passed by frontend with fresh GPS coords), fall back to profile
        const lat = parseFloat(req.query.lat) || req.user.lat;
        const lng = parseFloat(req.query.lng) || req.user.lng;
        const radiusKm = parseFloat(req.query.radius) || 5;

        if (!lat || !lng) return res.status(400).json({ message: 'Location not set. Share your location first.' });

        const users = await prisma.user.findMany({
            where: {
                is_suspended: false,
                id: { not: req.user.id }
            },
            select: {
                id: true,
                name: true,
                skills: true,
                trust_score: true,
                lat: true,
                lng: true,
                is_online: true
            }
        });

        const { haversineDistance } = require('../utils/routingEngine');
        const nearby = (users || [])
            .filter(u => u.lat && u.lng && haversineDistance(lat, lng, u.lat, u.lng) <= radiusKm)
            .map(u => ({
                ...u,
                distance: haversineDistance(lat, lng, u.lat, u.lng),
                isOnline: u.is_online,
                trustScore: u.trust_score || 3,
            }))
            .sort((a, b) => a.distance - b.distance);

        res.json(nearby);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { getProfile, updateProfile, updateSkills, updateLocation, getGuardians, addGuardian, removeGuardian, getNearbyUsers };
