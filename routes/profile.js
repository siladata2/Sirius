// routes/profile.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { UserDB } from '../models/User.js';
import bcrypt from 'bcrypt';

const router = express.Router();

router.use(authenticateToken);

// Get profile
router.get('/info', async (req, res) => {
    try {
        const user = await UserDB.findById(req.user.id);
        res.json({
            success: true,
            profile: {
                id: user.id,
                username: user.username,
                phone_number: user.phone_number,
                email: user.email || '',
                is_admin: user.is_admin === 1,
                is_paired: user.is_paired === 1,
                paired_at: user.paired_at,
                created_at: user.created_at,
                last_login: user.last_login
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update profile
router.put('/update', async (req, res) => {
    try {
        const { username, email } = req.body;
        
        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username too short' });
        }
        
        await UserDB.updateUser(req.user.id, { username, email });
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get session
router.get('/session', async (req, res) => {
    try {
        const user = await UserDB.findById(req.user.id);
        if (!user.is_paired || !user.session_string) {
            return res.status(404).json({ error: 'No session found' });
        }
        res.json({ success: true, session: user.session_string });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

export default router;
