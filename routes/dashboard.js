// routes/dashboard.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { UserDB } from '../models/User.js';

const router = express.Router();

router.use(authenticateToken);

// Get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const user = await UserDB.findById(req.user.id);
        const botConfig = await UserDB.getBotConfig(req.user.id);
        
        res.json({
            success: true,
            stats: {
                bot_connected: false,
                bot_jid: user.bot_jid || null,
                is_paired: user.is_paired === 1,
                paired_at: user.paired_at,
                commands_used: 0,
                messages_processed: 0,
                groups_joined: 0,
                uptime: process.uptime(),
                prefix: botConfig?.prefix || '.',
                bot_mode: botConfig?.bot_mode || 'public'
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get activity
router.get('/activity', async (req, res) => {
    try {
        const logs = await UserDB.getActivityLogs(req.user.id, 20);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

export default router;
