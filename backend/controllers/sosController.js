const prisma = require('../config/prisma');
const { getUsersInRadius, haversineDistance } = require('../utils/routingEngine');
const aiService = require('../services/aiService');
const { scheduleWelfareCheck } = require('../jobs/welfareCheck');

// @route POST /api/sos/create
const createSOS = async (req, res) => {
    try {
        const { type, modalData = {}, lat: bodyLat, lng: bodyLng } = req.body;

        // When creating SOS, use the seeker's current stored lat/lng
        // These should have been updated by the GPS fetch on dashboard load
        const seeker = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                lat: true,
                lng: true,
                blood_group: true,
                health_conditions: true
            }
        });

        // Validate coords are real — reject Delhi default if user never set GPS
        let finalLat = seeker?.lat;
        let finalLng = seeker?.lng;

        if (!finalLat || !finalLng || (finalLat === 28.6139 && finalLng === 77.2090)) {
            // Coords are still the hardcoded default
            // Use coords from request body if frontend passed them
            finalLat = bodyLat || finalLat;
            finalLng = bodyLng || finalLng;
        }

        if (!finalLat || !finalLng) {
            return res.status(400).json({ message: 'User location is not set. Please update your location first.' });
        }

        // Auto-populate medical info for Medical SOS
        if (type === 'Medical') {
            modalData.bloodGroup = seeker.blood_group || '';
            modalData.healthConditions = seeker.health_conditions || '';
        }

        const sos = await prisma.sOS.create({
            data: {
                seeker_id: seeker.id,
                type,
                modal_data: modalData,
                lat: finalLat,
                lng: finalLng,
                status: 'active',
            }
        });

        const targets = await getUsersInRadius({ lat: seeker.lat, lng: seeker.lng }, 5, {
            seekerId: seeker.id,
            type
        });

        const io = req.app.get('io');

        // --- PERSISTENCE LAYER: Save notifications to DB for 100% reliability ---
        const allTargetIds = [...new Set([...targets.priority, ...targets.general, ...targets.guardians])];
        if (allTargetIds.length > 0) {
            const notificationsToInsert = allTargetIds.map(userId => ({
                user_id: userId,
                sender_id: seeker.id,
                type: 'sos_alert',
                status: 'unread',
                data: {
                    sos_id: sos.id,
                    message: `New ${type} SOS alert nearby!`,
                    seeker_name: seeker.name,
                    is_priority: targets.priority.includes(userId),
                    is_guardian: targets.guardians.includes(userId)
                }
            }));
            await prisma.notification.createMany({
                data: notificationsToInsert
            });
        }

        if (io) {
            // 0. Notify the SEEKER that their own SOS was created
            io.to(`user:${req.user.id}`).emit('sos:created', { sos, seeker });

            // 1. Guardians first
            targets.guardians.forEach(guardianId => {
                io.to(`user:${guardianId}`).emit('sos:guardian_alert', {
                    sos, seekerName: seeker.name, isGuardian: true
                });
            });

            // 2. Community after short delay
            setTimeout(() => {
                targets.priority.forEach(userId => {
                    if (!targets.guardians.includes(userId)) {
                        io.to(`user:${userId}`).emit('sos:priority_alert', { sos, isPriority: true });
                    }
                });
                targets.general.forEach(userId => {
                    if (!targets.priority.includes(userId) && !targets.guardians.includes(userId)) {
                        io.to(`user:${userId}`).emit('sos:new_alert', { sos, isPriority: false });
                    }
                });
                io.to('admin:room').emit('admin:sos_created', sos);
            }, 500);
        }

        // ... (rest of the code omitted for brevity but stays) ...
        // Async AI: generate guidance + call script SEQUENTIALLY to save quota
        (async () => {
            try {
                console.log(`[AI] Starting generation for SOS ${sos.id}, type: ${type}`);
                
                // Generate guidance first
                let guidance = null;
                let callScript = null;
                
                try {
                    guidance = await aiService.generateFirstResponseGuidance(type, modalData, seeker);
                    console.log(`[AI] ✅ Guidance generated for SOS ${sos.id}`);
                } catch (err) {
                    console.error(`[AI] ❌ Guidance generation failed:`, err.message);
                    guidance = null; // Will use frontend fallback
                }
                
                // Then generate call script (optional - don't let this block the guidance)
                try {
                    callScript = await aiService.generateCallScript(
                        type, 
                        modalData, 
                        seeker, 
                        modalData?.landmark || '', 
                        finalLat, 
                        finalLng
                    );
                    console.log(`[AI] ✅ Call script generated for SOS ${sos.id}`);
                } catch (err) {
                    console.error(`[AI] ⚠️ Call script generation failed (non-critical):`, err.message);
                    callScript = null; // Will use frontend fallback
                }
                
                // Save both to database (even if one is null)
                const updateData = {};
                if (guidance) updateData.first_response_guidance = guidance;
                if (callScript) updateData.call_script = callScript;
                
                if (Object.keys(updateData).length > 0) {
                    await prisma.sOS.update({
                        where: { id: sos.id },
                        data: updateData
                    });
                    console.log(`[AI] 💾 Saved to database for SOS ${sos.id}`);
                }

                if (io) {
                    const payload = {
                        sosId: sos.id,
                        guidance,
                        callScript,
                    };
                    
                    // Log exactly what we're sending
                    console.log('[AI] 📤 Socket payload:', JSON.stringify({
                        sosId: sos.id,
                        hasGuidance: !!guidance,
                        hasCallScript: !!callScript,
                        guidanceLength: guidance?.length || 0,
                        guidancePreview: guidance?.substring(0, 100) || ''
                    }));
                    
                    console.log(`[AI] 📡 About to emit sos:ai_ready - Connected sockets:`, io.sockets.sockets.size);
                    console.log(`[AI] 📡 Seeker room: user:${seeker.id}`);
                    
                    // Emit EVEN IF only guidance succeeded - using BROADCAST to ALL connected clients
                    io.emit('sos:ai_ready', payload);
                    console.log(`[AI] ✅ Global emit sent for SOS ${sos.id}`);
                    
                    // Also emit to specific user room as backup
                    if (seeker && seeker.id) {
                        const roomEmitResult = io.to(`user:${seeker.id}`).emit('sos:ai_ready', payload);
                        console.log(`[AI] ✅ Room emit sent to user:${seeker.id}`, roomEmitResult ? 'success' : 'might have failed');
                    }
                    
                    // Log all rooms this seeker is in
                    const seekerSockets = await io.in(`user:${seeker.id}`).fetchSockets();
                    console.log(`[AI] 🔍 Seeker has ${seekerSockets.length} socket(s) connected in their room`);
                    seekerSockets.forEach((s, i) => {
                        console.log(`[AI]   Socket ${i}: ID=${s.id}, rooms=${Array.from(s.rooms).join(', ')}`);
                    });
                    
                    io.emit('sos:stats_updated');
                } else {
                    console.error('[AI] ❌ Socket IO not available!');
                }
            } catch (err) {
                console.error('[AI] ❌ Critical error in AI generation:', err);
                // Don't block SOS creation if AI fails completely
            }
        })();

        res.status(201).json({ 
            ...sos, 
            _id: sos.id, 
            lat: sos.lat ? parseFloat(sos.lat.toString()) : null,
            lng: sos.lng ? parseFloat(sos.lng.toString()) : null,
            notifiedUsers: targets.priority.length + targets.general.length 
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/anonymous
const createAnonymousSOS = async (req, res) => {
    try {
        const { type, modalData = {}, lat, lng, anonymousName, anonymousBloodGroup } = req.body;
        if (!type || !lat || !lng) return res.status(400).json({ message: 'Type and location required' });

        const sos = await prisma.sOS.create({
            data: {
                seeker_id: null,
                type,
                modal_data: { ...modalData, bloodGroup: anonymousBloodGroup || '' },
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                status: 'active',
                is_anonymous: true,
                anonymous_name: anonymousName || 'Anonymous User',
                anonymous_blood_group: anonymousBloodGroup || '',
            }
        });

        const targets = await getUsersInRadius({ lat: parseFloat(lat), lng: parseFloat(lng) }, 5, { type, isAnonymous: true });

        // --- PERSISTENCE LAYER: Save anonymous notifications to DB ---
        const allTargetIds = [...new Set([...targets.priority, ...targets.general])];
        if (allTargetIds.length > 0) {
            const notificationsToInsert = allTargetIds.map(userId => ({
                user_id: userId,
                sender_id: null,
                type: 'sos_alert',
                status: 'unread',
                data: {
                    sos_id: sos.id,
                    message: `Anonymous ${type} SOS alert nearby!`,
                    seeker_name: sos.anonymous_name,
                    is_priority: targets.priority.includes(userId)
                }
            }));
            await prisma.notification.createMany({
                data: notificationsToInsert
            });
        }

        const io = global.io;
        if (io) {
            setTimeout(() => {
                targets.priority.forEach(userId => {
                    io.to(`user:${userId}`).emit('sos:priority_alert', {
                        sos: { ...sos, seekerName: sos.anonymous_name },
                        isPriority: true, isAnonymous: true
                    });
                });
                targets.general.forEach(userId => {
                    if (!targets.priority.includes(userId)) {
                        io.to(`user:${userId}`).emit('sos:new_alert', {
                            sos: { ...sos, seekerName: sos.anonymous_name },
                            isPriority: false, isAnonymous: true
                        });
                    }
                });
                io.to('admin:room').emit('admin:sos_created', sos);
                io.emit('sos:stats_updated');
            }, 500);
        }

        aiService.generateFirstResponseGuidance(type, modalData, {
            blood_group: anonymousBloodGroup || '',
            health_conditions: ''
        }).then(guidance => {
            prisma.sOS.update({
                where: { id: sos.id },
                data: { first_response_guidance: guidance }
            });
            if (global.io) global.io.emit(`sos:guidance_${sos.id}`, { guidance });
        });

        res.json({ 
            sos: { 
                ...sos, 
                _id: sos.id,
                lat: sos.lat ? parseFloat(sos.lat.toString()) : null,
                lng: sos.lng ? parseFloat(sos.lng.toString()) : null
            }, 
            message: 'SOS broadcast to nearby community' 
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/active
const getActiveSOS = async (req, res) => {
    try {
        const user = req.user;
        if (!user.lat || !user.lng) {
            return res.status(400).json({ message: 'Location not set' });
        }

        const allActive = await prisma.sOS.findMany({
            where: {
                status: { in: ['active', 'responding'] }
            },
            include: {
                seeker: {
                    select: {
                        name: true,
                        blood_group: true,
                        health_conditions: true,
                        skills: true,
                        lat: true,
                        lng: true
                    }
                }
            }
        });

        const nearbySOS = (allActive || []).filter(sos => {
            if (!sos.lat || !sos.lng) return false;
            const sosLat = parseFloat(sos.lat.toString());
            const sosLng = parseFloat(sos.lng.toString());
            const userLat = parseFloat(user.lat.toString());
            const userLng = parseFloat(user.lng.toString());
            return haversineDistance(userLat, userLng, sosLat, sosLng) <= 5;
        });

        // Convert Decimal types to numbers for all SOS entries
        const response = (nearbySOS || []).map(s => ({
            ...s,
            _id: s.id,
            lat: s.lat ? parseFloat(s.lat.toString()) : null,
            lng: s.lng ? parseFloat(s.lng.toString()) : null,
            users: s.seeker,
            seeker: s.seeker ? {
                ...s.seeker,
                lat: s.seeker.lat ? parseFloat(s.seeker.lat.toString()) : null,
                lng: s.seeker.lng ? parseFloat(s.seeker.lng.toString()) : null
            } : null
        }));

        res.json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/stats
const getSOSStats = async (req, res) => {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const [active, resolvedToday, online, myResponses] = await Promise.all([
            prisma.sOS.count({ where: { status: 'active' } }),
            prisma.sOS.count({ 
                where: { 
                    status: 'resolved',
                    resolved_at: { gte: today }
                } 
            }),
            prisma.user.count({ where: { is_online: true } }),
            prisma.sOS.findMany({
                where: {
                    responders: { has: req.user.id },
                    status: 'resolved'
                },
                select: { response_time_seconds: true }
            }),
        ]);

        const avgResponse = myResponses?.length
            ? Math.round(myResponses.reduce((s, r) => s + (r.response_time_seconds || 0), 0) / myResponses.length)
            : 0;

        res.json({
            activeSOS: active || 0,
            resolvedToday: resolvedToday || 0,
            respondersOnline: online || 0,
            avgResponseSeconds: avgResponse,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/global-stats
const getGlobalStats = async (req, res) => {
    try {
        const allSOS = await prisma.sOS.findMany({
            where: { status: 'resolved' }
        });
        
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const resolvedToday = (allSOS || []).filter(s => s.resolved_at && new Date(s.resolved_at) >= today).length;
        const sosByType = {};
        const typeTimeSums = {};
        const typeTimeCounts = {};

        (allSOS || []).forEach(sos => {
            sosByType[sos.type] = (sosByType[sos.type] || 0) + 1;
            if (sos.response_time_seconds > 0) {
                typeTimeSums[sos.type] = (typeTimeSums[sos.type] || 0) + sos.response_time_seconds;
                typeTimeCounts[sos.type] = (typeTimeCounts[sos.type] || 0) + 1;
            }
        });

        const avgResponseTimeByType = {};
        for (const t in sosByType) {
            avgResponseTimeByType[t] = typeTimeCounts[t] > 0 ? Math.round(typeTimeSums[t] / typeTimeCounts[t]) : 0;
        }

        res.json({
            totalSOS: allSOS?.length || 0,
            resolvedToday,
            sosByType,
            avgResponseTimeByType
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/:id
const getSOSById = async (req, res) => {
    try {
        const sos = await prisma.sOS.findUnique({
            where: { id: req.params.id },
            include: {
                seeker: {
                    select: {
                        name: true,
                        email: true,
                        phone: true,
                        blood_group: true,
                        health_conditions: true,
                        skills: true,
                        lat: true,
                        lng: true
                    }
                }
            }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        
        // Convert Decimal types to numbers for frontend
        const response = {
            ...sos,
            _id: sos.id,
            lat: sos.lat ? parseFloat(sos.lat.toString()) : null,
            lng: sos.lng ? parseFloat(sos.lng.toString()) : null,
            users: sos.seeker,
            seeker: sos.seeker ? {
                ...sos.seeker,
                lat: sos.seeker.lat ? parseFloat(sos.seeker.lat.toString()) : null,
                lng: sos.seeker.lng ? parseFloat(sos.seeker.lng.toString()) : null
            } : null
        };
        
        res.json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/:id/respond
const respondToSOS = async (req, res) => {
    try {
        const sos = await prisma.sOS.findUnique({
            where: { id: req.params.id }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        if (sos.seeker_id === req.user.id) return res.status(403).json({ message: 'You cannot respond to your own SOS' });
        if (sos.status === 'resolved' || sos.status === 'cancelled') return res.status(400).json({ message: 'SOS is no longer active' });

        const responders = sos.responders || [];
        if (!responders.includes(req.user.id)) {
            responders.push(req.user.id);
        }

        const newStatus = sos.status === 'active' ? 'responding' : sos.status;
        const updated = await prisma.sOS.update({
            where: { id: req.params.id },
            data: {
                responders,
                status: newStatus
            }
        });

        const io = req.app.get('io');
        if (io) io.to('admin:room').emit('admin:sos_updated', updated);

        // Convert Decimal types to numbers for frontend
        const response = {
            ...updated,
            _id: updated.id,
            lat: updated.lat ? parseFloat(updated.lat.toString()) : null,
            lng: updated.lng ? parseFloat(updated.lng.toString()) : null
        };

        res.json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/:id/resolve
const resolveSOS = async (req, res) => {
    try {
        console.log(`[resolveSOS] Attempting to resolve SOS ${req.params.id} by user ${req.user.id}`);
        
        const sos = await prisma.sOS.findUnique({
            where: { id: req.params.id }
        });
        
        if (!sos) {
            console.error('[resolveSOS] SOS not found:', req.params.id);
            return res.status(404).json({ message: 'SOS not found' });
        }
        if (sos.seeker_id !== req.user.id) {
            console.error('[resolveSOS] Permission denied. SOS seeker:', sos.seeker_id, 'User:', req.user.id);
            return res.status(403).json({ message: 'Only the seeker can resolve' });
        }

        const resolvedAt = new Date();
        const responseTimeSeconds = Math.round((resolvedAt - new Date(sos.created_at)) / 1000);

        console.log(`[resolveSOS] Updating SOS ${req.params.id} to resolved status`);
        const updated = await prisma.sOS.update({
            where: { id: req.params.id },
            data: {
                status: 'resolved',
                resolved_at: resolvedAt,
                response_time_seconds: responseTimeSeconds,
            }
        });

        // Prevent backlog chain: Also resolve any other stuck active SOSes for this user
        await prisma.sOS.updateMany({
            where: {
                seeker_id: req.user.id,
                status: { in: ['active', 'responding'] },
                id: { not: req.params.id }
            },
            data: {
                status: 'resolved',
                resolved_at: resolvedAt,
            }
        });

        console.log(`[resolveSOS] ✅ SOS ${req.params.id} successfully resolved`);

        const io = req.app.get('io');

        // AI: generate incident summary + debrief SEQUENTIALLY to save quota
        if (sos.seeker_id) {
            (async () => {
                try {
                    // Generate summary first
                    const summary = await aiService.generateResolutionSummary(updated);
                    
                    // Then generate debrief
                    const debrief = await aiService.generateDebriefPrompt(updated);
                    
                    // Save both to database
                    await prisma.sOS.update({
                        where: { id: sos.id },
                        data: {
                            resolution_summary: summary,
                            debrief_prompt: debrief
                        }
                    });
                    
                    if (io) {
                        // Push debrief to seeker only
                        io.to(`user:${sos.seeker_id}`).emit('sos:debrief_ready', { sosId: sos.id, debrief });
                        io.to(`chat:${sos.id}`).emit('sos:summary_ready', { sosId: sos.id, summary });
                    }
                } catch (err) {
                    console.error('AI Resolution Error:', err);
                    // Don't block resolution if AI fails
                }
            })();
        }

        scheduleWelfareCheck(sos.seeker_id, sos.id);

        if (io) {
            io.to('admin:room').emit('admin:sos_resolved', updated);
            io.emit('sos:resolved', { sosId: sos.id });
            io.emit('sos:stats_updated');
        }

        res.json({ ...updated, _id: updated.id });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/:id/flag
const flagSOS = async (req, res) => {
    try {
        const sos = await prisma.sOS.findUnique({
            where: { id: req.params.id }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        
        // Removed responder-only restriction to allow community reporting from the map

        const flaggedBy = sos.flagged_by || [];
        if (flaggedBy.includes(req.user.id)) {
            return res.json({ message: 'Already flagged by you', seekerSuspended: false });
        }

        flaggedBy.push(req.user.id);
        await prisma.sOS.update({
            where: { id: req.params.id },
            data: {
                flagged_by: flaggedBy,
                is_flagged: true
            }
        });

        if (sos.seeker_id) {
            const seeker = await prisma.user.findUnique({
                where: { id: sos.seeker_id }
            });
            
            if (seeker) {
                const newCount = (seeker.false_alert_count || 0) + 1;
                await prisma.user.update({
                    where: { id: seeker.id },
                    data: { false_alert_count: newCount }
                });

                return res.json({ message: 'SOS flagged successfully', seekerSuspended: false });
            }
        }
        res.json({ message: 'SOS flagged' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/history
const getSOSHistory = async (req, res) => {
    try {
        const history = await prisma.sOS.findMany({
            where: {
                OR: [
                    { seeker_id: req.user.id },
                    { responders: { has: req.user.id } }
                ]
            },
            include: {
                seeker: {
                    select: { name: true }
                }
            },
            orderBy: { created_at: 'desc' },
            take: 20
        });
        
        res.json((history || []).map(s => ({ ...s, _id: s.id, users: s.seeker })));
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/chat
const handleAIChat = async (req, res) => {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        const messages = req.body.contents;
        const systemInstruction = req.body.system_instruction;
        
        if (!apiKey) {
            return res.status(500).json({ error: "AI service not configured", details: "MISTRAL_API_KEY missing" });
        }

        // Convert Gemini-style contents to Mistral chat format
        const mistralMessages = [];
        
        // Add system instruction if provided
        if (systemInstruction && systemInstruction.parts && systemInstruction.parts[0]) {
            mistralMessages.push({
                role: 'system',
                content: systemInstruction.parts[0].text
            });
        }
        
        // Convert user messages
        if (messages && Array.isArray(messages)) {
            messages.forEach(msg => {
                if (msg.parts && msg.parts[0] && msg.parts[0].text) {
                    mistralMessages.push({
                        role: msg.role || 'user',
                        content: msg.parts[0].text
                    });
                }
            });
        }

        const url = 'https://api.mistral.ai/v1/chat/completions';
        
        try {
            const mistralRes = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-small-latest',
                    messages: mistralMessages,
                    temperature: 0.7,
                    max_tokens: 1024
                }),
            });

            if (!mistralRes.ok) {
                const errorText = await mistralRes.text();
                console.error(`[sosController] Mistral AI failed (${mistralRes.status}):`, errorText);
                return res.status(mistralRes.status).json({ 
                    error: "AI Assistant failed", 
                    details: errorText 
                });
            }

            const data = await mistralRes.json();
            
            // Convert Mistral response to Gemini-compatible format for frontend
            const geminiFormat = {
                candidates: [{
                    content: {
                        parts: [{
                            text: data.choices[0].message.content
                        }],
                        role: 'model'
                    }
                }]
            };
            
            return res.status(200).json(geminiFormat);
        } catch (err) {
            console.error(`[sosController] Mistral API error:`, err.message);
            return res.status(500).json({ error: "AI Assistant failed", details: err.message });
        }
    } catch (error) {
        console.error('[sosController] handleAIChat error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route GET /api/sos/me/active
const getMyActiveSOS = async (req, res) => {
    try {
        console.log('[getMyActiveSOS] Checking for user:', req.user.id);
        
        const sosList = await prisma.sOS.findMany({
            where: {
                seeker_id: req.user.id,
                status: { in: ['active', 'responding'] }
            },
            orderBy: { created_at: 'desc' },
            take: 1
        });

        const sos = sosList && sosList.length > 0 ? sosList[0] : null;
        if (sos) {
            // Convert Decimal types to numbers
            sos._id = sos.id;
            sos.lat = sos.lat ? parseFloat(sos.lat.toString()) : null;
            sos.lng = sos.lng ? parseFloat(sos.lng.toString()) : null;
            console.log('[getMyActiveSOS] Found active SOS:', sos.id, 'Status:', sos.status, 'Created:', sos.created_at);
        } else {
            console.log('[getMyActiveSOS] No active SOS found');
        }
        
        res.json(sos);
    } catch (error) {
        console.error('[getMyActiveSOS] Unexpected error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/:id/presence
const confirmPresence = async (req, res) => {
    try {
        const { available } = req.body;
        const io = req.app.get('io');

        const sos = await prisma.sOS.findUnique({
            where: { id: req.params.id }
        });
        
        if (!sos) return res.status(404).json({ message: 'SOS not found' });
        if (sos.status === 'resolved' || sos.status === 'cancelled') return res.status(400).json({ message: 'SOS is no longer active' });
        if (sos.seeker_id === req.user.id) return res.status(403).json({ message: 'Cannot respond to own SOS' });

        // Declined — just dismiss on responder side
        if (!available) {
            if (io) io.to(`user:${req.user.id}`).emit('presence:declined', { sosId: sos.id });
            return res.json({ message: 'Declined' });
        }

        // Add responder
        const responders = sos.responders || [];
        
        // Ensure only one responder can accept the SOS
        if (responders.length > 0 && !responders.includes(req.user.id)) {
            return res.status(400).json({ message: 'This SOS has already been accepted by another responder.' });
        }
        
        if (!responders.includes(req.user.id)) responders.push(req.user.id);

        const updated = await prisma.sOS.update({
            where: { id: req.params.id },
            data: {
                responders,
                status: 'responding'
            }
        });

        // Fetch both profiles in parallel
        const [seeker, responder] = await Promise.all([
            sos.seeker_id
                ? prisma.user.findUnique({
                    where: { id: sos.seeker_id },
                    select: {
                        id: true,
                        name: true,
                        lat: true,
                        lng: true,
                        blood_group: true,
                        health_conditions: true,
                        skills: true
                    }
                })
                : Promise.resolve(null),
            prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    lat: true,
                    lng: true,
                    skills: true,
                    trust_score: true
                }
            })
        ]);

        const mutualPayload = {
            sosId: sos.id,
            _id: sos.id,
            sosType: sos.type,
            modalData: sos.modal_data,
            seeker: seeker ? {
                id: seeker.id,
                name: sos.is_anonymous ? 'Anonymous User' : (seeker.name || 'Help Seeker'),
                lat: seeker.lat,
                lng: seeker.lng,
                bloodGroup: sos.modal_data?.bloodGroup || seeker.blood_group,
                healthConditions: seeker.health_conditions,
            } : { id: null, name: 'Anonymous User', lat: sos.lat, lng: sos.lng },
            responder: {
                id: responder.id,
                name: responder.name,
                lat: responder.lat,
                lng: responder.lng,
                skills: responder.skills,
                trustScore: responder.trust_score
            },
            seekerLocation: { lat: sos.lat, lng: sos.lng },
        };

        if (io) {
            io.to(`user:${req.user.id}`).emit('response:mutual_open', mutualPayload);
            if (sos.seeker_id) io.to(`user:${sos.seeker_id}`).emit('response:mutual_open', mutualPayload);
        }

        return res.json({ success: true, payload: mutualPayload });
    } catch (error) {
        console.error('[confirmPresence]', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @route POST /api/sos/ai-chat (PUBLIC - No auth required)
const handlePublicAIChat = async (req, res) => {
    try {
        const apiKey = process.env.MISTRAL_API_KEY;
        const messages = req.body.contents;
        const systemInstruction = req.body.system_instruction;
        
        if (!apiKey) {
            return res.status(500).json({ error: "AI service not configured", details: "MISTRAL_API_KEY missing" });
        }

        // Convert Gemini-style contents to Mistral chat format
        const mistralMessages = [];
        
        // Add system instruction if provided
        if (systemInstruction && systemInstruction.parts && systemInstruction.parts[0]) {
            mistralMessages.push({
                role: 'system',
                content: systemInstruction.parts[0].text
            });
        }
        
        // Convert user messages
        if (messages && Array.isArray(messages)) {
            messages.forEach(msg => {
                if (msg.parts && msg.parts[0] && msg.parts[0].text) {
                    mistralMessages.push({
                        role: msg.role || 'user',
                        content: msg.parts[0].text
                    });
                }
            });
        }

        const url = 'https://api.mistral.ai/v1/chat/completions';
        
        try {
            const mistralRes = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-small-latest',
                    messages: mistralMessages,
                    temperature: 0.7,
                    max_tokens: 1024
                }),
            });

            if (!mistralRes.ok) {
                const errorText = await mistralRes.text();
                console.error(`[handlePublicAIChat] Mistral AI failed (${mistralRes.status}):`, errorText);
                return res.status(mistralRes.status).json({ 
                    error: "AI Assistant failed", 
                    details: errorText 
                });
            }

            const data = await mistralRes.json();
            
            // Convert Mistral response to Gemini-compatible format for frontend
            const geminiFormat = {
                candidates: [{
                    content: {
                        parts: [{
                            text: data.choices[0].message.content
                        }],
                        role: 'model'
                    }
                }]
            };
            
            console.log(`[handlePublicAIChat] ✅ Mistral AI response generated successfully`);
            return res.status(200).json(geminiFormat);
        } catch (err) {
            console.error(`[handlePublicAIChat] Mistral API error:`, err.message);
            return res.status(500).json({ error: "AI Assistant failed", details: err.message });
        }
    } catch (error) {
        console.error('[handlePublicAIChat] error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { createSOS, createAnonymousSOS, getActiveSOS, getSOSStats, getGlobalStats, getSOSById, respondToSOS, resolveSOS, flagSOS, getSOSHistory, handleAIChat, handlePublicAIChat, getMyActiveSOS, confirmPresence };
