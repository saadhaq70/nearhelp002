const prisma = require('../config/prisma');

// @route POST /api/ratings/:sosId
// Seeker rates responder
const submitRating = async (req, res) => {
    try {
        const { responderId, stars, review } = req.body;
        const sosId = req.params.sosId;
        if (!responderId || !stars || stars < 1 || stars > 5) {
            return res.status(400).json({ message: 'Please provide responderId and a valid star rating (1-5)' });
        }

        const sos = await prisma.sOS.findUnique({
            where: { id: sosId }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        if (sos.seeker_id !== req.user.id) return res.status(403).json({ message: 'Not authorized: must be the seeker' });
        if (sos.status !== 'resolved') return res.status(400).json({ message: 'SOS must be resolved before rating' });
        if (!(sos.responders || []).includes(responderId)) return res.status(400).json({ message: 'User was not a responder for this SOS' });

        const existing = await prisma.rating.findFirst({
            where: {
                sos_id: sosId,
                rater_id: req.user.id,
                ratee_id: responderId
            }
        });
        
        if (existing) return res.status(400).json({ message: 'You have already rated this responder for this SOS' });

        const ratingObj = await prisma.rating.create({
            data: {
                sos_id: sosId,
                rater_id: req.user.id,
                ratee_id: responderId,
                rating: stars,
                feedback: review
            }
        });

        // Update trust score and check for one-star ratings
        await updateUserTrustScore(responderId, stars);
        
        res.status(201).json({ rating: ratingObj });
    } catch (error) {
        console.error('[Ratings] ❌ Error submitting rating:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/ratings/:sosId/rate-seeker
// Responder rates seeker
const submitSeekerRating = async (req, res) => {
    try {
        const { stars, review } = req.body;
        const sosId = req.params.sosId;
        if (!stars || stars < 1 || stars > 5) {
            return res.status(400).json({ message: 'Please provide a valid star rating (1-5)' });
        }

        const sos = await prisma.sOS.findUnique({
            where: { id: sosId }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        if (!(sos.responders || []).includes(req.user.id)) {
            return res.status(403).json({ message: 'Not authorized: must be a responder for this SOS' });
        }
        if (sos.status !== 'resolved') return res.status(400).json({ message: 'SOS must be resolved before rating' });

        // Check if responder already rated this seeker
        const existing = await prisma.rating.findFirst({
            where: {
                sos_id: sosId,
                rater_id: req.user.id,
                ratee_id: sos.seeker_id
            }
        });
        
        if (existing) return res.status(400).json({ message: 'You have already rated the seeker for this SOS' });

        const ratingObj = await prisma.rating.create({
            data: {
                sos_id: sosId,
                rater_id: req.user.id,
                ratee_id: sos.seeker_id,
                rating: stars,
                feedback: review
            }
        });

        // Update seeker's trust score
        await updateUserTrustScore(sos.seeker_id, stars);
        
        res.status(201).json({ rating: ratingObj });
    } catch (error) {
        console.error('[Ratings] ❌ Error submitting seeker rating:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Helper function to update trust score and handle auto-suspension
async function updateUserTrustScore(userId, stars) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        
        if (!user) {
            console.error('[Ratings] ❌ User not found for trust score update:', userId);
            return;
        }

        const newSum = (user.rating_sum || 0) + stars;
        const newCount = (user.total_ratings || 0) + 1;
        const newScore = Math.round((newSum / newCount) * 10) / 10;
        
        // Count one-star ratings
        const oneStarCount = await prisma.rating.count({
            where: {
                ratee_id: userId,
                rating: 1
            }
        });
        
        // Auto-suspend if user has received more than 3 one-star ratings
        const shouldSuspend = oneStarCount > 3;
        
        const updateData = {
            rating_sum: newSum,
            total_ratings: newCount,
            trust_score: newScore
        };
        
        if (shouldSuspend) {
            updateData.is_suspended = true;
            console.log(`[Ratings] 🚫 User ${user.name} (${userId}) auto-suspended after ${oneStarCount} one-star ratings`);
        }
        
        await prisma.user.update({
            where: { id: userId },
            data: updateData
        });
        
        console.log(`[Ratings] ✅ Updated trust score for ${user.name}: ${newScore} (${newCount} ratings, ${oneStarCount} one-stars)${shouldSuspend ? ' - SUSPENDED' : ''}`);
    } catch (error) {
        console.error('[Ratings] ❌ Error updating trust score:', error);
    }
}

// @route GET /api/ratings/responder/:userId
const getResponderRatings = async (req, res) => {
    try {
        const ratings = await prisma.rating.findMany({
            where: { ratee_id: req.params.userId },
            include: {
                sos: {
                    select: { type: true }
                },
                rater: {
                    select: { name: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        const user = await prisma.user.findUnique({
            where: { id: req.params.userId },
            select: {
                trust_score: true,
                total_ratings: true
            }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ 
            ratings: ratings || [], 
            averageScore: user.trust_score, 
            totalCount: user.total_ratings,
            oneStarCount: 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/ratings/user/:userId
// Get all ratings for a user (both as responder and seeker)
const getUserRatings = async (req, res) => {
    try {
        // Get ratings where user was responder (ratee)
        const asResponder = await prisma.rating.findMany({
            where: { ratee_id: req.params.userId },
            include: {
                sos: {
                    select: { type: true }
                },
                rater: {
                    select: { name: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        // Get ratings where user was seeker (rater)
        const asSeeker = await prisma.rating.findMany({
            where: { rater_id: req.params.userId },
            include: {
                sos: {
                    select: { type: true }
                },
                ratee: {
                    select: { name: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        const user = await prisma.user.findUnique({
            where: { id: req.params.userId },
            select: {
                trust_score: true,
                total_ratings: true,
                is_suspended: true
            }
        });
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ 
            ratingsReceived: asResponder || [],
            ratingsGiven: asSeeker || [],
            averageScore: user.trust_score, 
            totalCount: user.total_ratings,
            oneStarCount: 0,
            isSuspended: user.is_suspended
        });
    } catch (error) {
        console.error('[Ratings] Error fetching user ratings:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { 
    submitRating, 
    submitSeekerRating,
    getResponderRatings,
    getUserRatings
};
