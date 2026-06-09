// routes/pair.js
import express from 'express';
import { UserDB } from '../models/User.js';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sirius_super_secret_key_2024';

// Store active pairing sessions
const pairSessions = new Map();

// Generate random 8-character password
function generatePairPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Generate SILA-MD~ session from creds.json
function generateSilaMDSession(credsPath) {
    try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const compressedData = zlib.gzipSync(credsData);
        const b64data = compressedData.toString('base64');
        return 'SILA-MD~' + b64data;
    } catch (error) {
        console.error("Error generating session:", error);
        return null;
    }
}

// Start pairing process
router.post('/start', async (req, res) => {
    try {
        const { phone_number } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await UserDB.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!phone_number || phone_number.length < 10) {
            return res.status(400).json({ error: 'Valid phone number required' });
        }
        
        const cleanNumber = phone_number.replace(/[^0-9]/g, '');
        
        // Generate pair password
        const pairPassword = generatePairPassword();
        
        // Create pair session
        const pairId = crypto.randomBytes(16).toString('hex');
        const tempDir = path.join(__dirname, '../temp', pairId);
        
        if (!fs.existsSync(path.join(__dirname, '../temp'))) {
            fs.mkdirSync(path.join(__dirname, '../temp'), { recursive: true });
        }
        
        pairSessions.set(pairId, {
            userId: user.id,
            phoneNumber: cleanNumber,
            pairPassword: pairPassword,
            tempDir: tempDir,
            createdAt: Date.now(),
            status: 'pending'
        });
        
        // Start pairing in background
        startPairingProcess(pairId, cleanNumber, tempDir);
        
        res.json({
            success: true,
            pairId: pairId,
            pairPassword: pairPassword,
            message: `Pairing initiated for +${cleanNumber}`,
            instructions: `1. Open WhatsApp\n2. Settings → Linked Devices\n3. Tap "Link a Device"\n4. Enter the code you'll receive\n5. Your password: ${pairPassword}`
        });
        
    } catch (error) {
        console.error('Pair start error:', error);
        res.status(500).json({ error: 'Failed to start pairing' });
    }
});

// Background pairing process
async function startPairingProcess(pairId, phoneNumber, tempDir) {
    try {
        const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = await import('@whiskeysockets/baileys');
        const pino = (await import('pino')).default;
        
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        
        const items = ["Safari", "Chrome", "Firefox"];
        const randomItem = items[Math.floor(Math.random() * items.length)];
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            logger: pino({ level: "fatal" }).child({ level: "fatal" }),
            syncFullHistory: false,
            browser: Browsers.macOS(randomItem)
        });
        
        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`Pairing code for ${phoneNumber}: ${code}`);
        }
        
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on("connection.update", async (s) => {
            const { connection } = s;
            
            if (connection == "open") {
                await delay(3000);
                const credsPath = path.join(tempDir, 'creds.json');
                
                if (fs.existsSync(credsPath)) {
                    const sessionString = generateSilaMDSession(credsPath);
                    
                    if (sessionString) {
                        const session = pairSessions.get(pairId);
                        if (session) {
                            await UserDB.updatePairInfo(session.userId, session.pairPassword, sock.user.id, sessionString);
                            session.status = 'completed';
                            session.botJid = sock.user.id;
                            pairSessions.set(pairId, session);
                            
                            // Send success message
                            await sock.sendMessage(sock.user.id, {
                                text: `✅ *SIRIUS DEVICE PAIRED!*\n\n` +
                                      `🔑 Your login password: *${session.pairPassword}*\n\n` +
                                      `🌐 Login: ${process.env.WEB_URL || 'http://localhost:3000'}/login\n\n` +
                                      `📢 Channel: https://whatsapp.com/channel/0029VbDF0pZCxoB4rvUmnN1e\n` +
                                      `👥 Group: https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g`
                            });
                        }
                    }
                }
                
                await delay(5000);
                await sock.ws.close();
                
                setTimeout(() => {
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                }, 60000);
            }
        });
        
    } catch (error) {
        console.error(`Pairing error for ${pairId}:`, error);
        const session = pairSessions.get(pairId);
        if (session) {
            session.status = 'failed';
            pairSessions.set(pairId, session);
        }
    }
}

// Check pair status
router.get('/status/:pairId', async (req, res) => {
    try {
        const { pairId } = req.params;
        const session = pairSessions.get(pairId);
        
        if (!session) {
            return res.json({ status: 'expired' });
        }
        
        if (Date.now() - session.createdAt > 10 * 60 * 1000) {
            pairSessions.delete(pairId);
            return res.json({ status: 'expired' });
        }
        
        if (session.status === 'completed') {
            const user = await UserDB.findById(session.userId);
            return res.json({
                status: 'completed',
                username: user?.username,
                password: session.pairPassword
            });
        }
        
        if (session.status === 'failed') {
            return res.json({ status: 'failed', message: session.error });
        }
        
        res.json({ status: 'pending' });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Cancel pairing
router.post('/cancel/:pairId', async (req, res) => {
    try {
        const { pairId } = req.params;
        const session = pairSessions.get(pairId);
        
        if (session && fs.existsSync(session.tempDir)) {
            fs.rmSync(session.tempDir, { recursive: true, force: true });
        }
        pairSessions.delete(pairId);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel' });
    }
});

export default router;
