// routes/admin.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { UserDB } from '../models/User.js';

const router = express.Router();

router.use(authenticateToken);

// Check if admin
router.use((req, res, next) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await UserDB.getAllUsers();
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await UserDB.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await UserDB.getActivityLogs(null, 100);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Update user
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active, is_admin } = req.body;
        
        await UserDB.updateUser(id, { is_active, is_admin });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }
        await UserDB.deleteUser(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
