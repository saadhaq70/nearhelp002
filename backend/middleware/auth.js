const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const auth = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
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
                    is_active: true,
                    is_suspended: true,
                    false_alert_count: true,
                    trust_score: true,
                    total_ratings: true,
                    rating_sum: true,
                    is_online: true,
                    last_seen: true,
                    skill_verification_status: true,
                    created_at: true,
                    is_physically_disabled: true
                }
            });

            if (!user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            // Normalize for backward compat: expose req.user.id and req.user._id
            // Convert Decimal types to numbers
            req.user = { 
                ...user, 
                _id: user.id,
                lat: user.lat ? parseFloat(user.lat.toString()) : null,
                lng: user.lng ? parseFloat(user.lng.toString()) : null,
                trust_score: user.trust_score ? parseFloat(user.trust_score.toString()) : 0,
                location: { 
                    lat: user.lat ? parseFloat(user.lat.toString()) : null, 
                    lng: user.lng ? parseFloat(user.lng.toString()) : null 
                } 
            };
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = auth;
