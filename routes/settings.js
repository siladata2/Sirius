// routes/settings.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { UserDB } from '../models/User.js';

const router = express.Router();

router.use(authenticateToken);

// Get bot config
router.get('/bot', async (req, res) => {
    try {
        const config = await UserDB.getBotConfig(req.user.id);
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

// Update bot config
router.put('/bot', async (req, res) => {
    try {
        const { prefix, bot_mode, auto_join, auto_react, auto_view, auto_reply, anti_link, anti_spam } = req.body;
        
        await UserDB.updateBotConfig(req.user.id, {
            prefix: prefix || '.',
            bot_mode: bot_mode || 'public',
            auto_join: auto_join ? 1 : 0,
            auto_react: auto_react ? 1 : 0,
            auto_view: auto_view ? 1 : 0,
            auto_reply: auto_reply ? 1 : 0,
            anti_link: anti_link ? 1 : 0,
            anti_spam: anti_spam ? 1 : 0
        });
        
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
