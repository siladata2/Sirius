// middleware/auth.js
import jwt from 'jsonwebtoken';
import { UserDB } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sirius_super_secret_key_2024';

export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await UserDB.findById(decoded.userId);
        
        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Invalid user' });
        }
        
        req.user = {
            id: user.id,
            username: user.username,
            phone_number: user.phone_number,
            is_admin: user.is_admin === 1,
            is_paired: user.is_paired === 1
        };
        
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
