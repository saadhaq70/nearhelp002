const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

/**
 * Middleware to protect routes using JWT authentication.
 * Verifies the token, fetches the user from PostgreSQL via Prisma, and attaches it to req.user.
 */
const protect = async (req, res, next) => {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

            // Get user from PostgreSQL using Prisma
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
                    is_suspended: true,
                    trust_score: true
                }
            });

            if (!user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            if (user.is_suspended) {
                return res.status(403).json({ message: 'Account is suspended' });
            }

            // Attach user to request object (normalized for both id and _id)
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
            console.error('Auth Middleware Error:', error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token provided' });
    }
};

module.exports = { protect };
