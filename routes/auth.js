// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserDB } from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sirius_super_secret_key_2024';

// Generate random 8-character password
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { phone_number, username, email } = req.body;
        
        if (!phone_number || !username) {
            return res.status(400).json({ error: 'Phone number and username required' });
        }
        
        const cleanPhone = phone_number.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }
        
        // Check if user exists
        const existingUser = await UserDB.findByPhone(cleanPhone);
        if (existingUser) {
            return res.status(400).json({ error: 'Phone number already registered' });
        }
        
        const existingUsername = await UserDB.findByUsername(username.toLowerCase());
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // Generate random password
        const password = generateRandomPassword();
        
        // Create user
        const user = await UserDB.create({
            phone_number: cleanPhone,
            username: username.toLowerCase(),
            password: password,
            email: email || ''
        });
        
        // Generate token
        const token = jwt.sign(
            { userId: user.id, username: user.username, isAdmin: false },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            message: 'Account created successfully',
            credentials: {
                username: username.toLowerCase(),
                password: password,
                phone_number: cleanPhone
            },
            token: token,
            user: {
                id: user.id,
                username: user.username,
                phone_number: user.phone_number,
                is_admin: false,
                is_paired: false
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Find user by username or phone number
        let user = await UserDB.findByUsername(username.toLowerCase());
        if (!user) {
            user = await UserDB.findByPhone(username.replace(/[^0-9]/g, ''));
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (!user.is_active) {
            return res.status(401).json({ error: 'Account disabled' });
        }
        
        // Verify password
        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        await UserDB.updateLastLogin(user.id);
        
        // Generate token
        const token = jwt.sign(
            { userId: user.id, username: user.username, isAdmin: user.is_admin === 1 },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                phone_number: user.phone_number,
                email: user.email || '',
                is_admin: user.is_admin === 1,
                is_paired: user.is_paired === 1,
                paired_at: user.paired_at
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ valid: false });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await UserDB.findById(decoded.userId);
        
        if (!user || !user.is_active) {
            return res.status(401).json({ valid: false });
        }
        
        res.json({
            valid: true,
            user: {
                id: user.id,
                username: user.username,
                phone_number: user.phone_number,
                is_admin: user.is_admin === 1,
                is_paired: user.is_paired === 1
            }
        });
        
    } catch (error) {
        res.status(401).json({ valid: false });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    res.json({ success: true });
});

export default router;
