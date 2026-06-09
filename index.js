// ============================================================
//  SIRIUS — MULTI-USER WHATSAPP BOT
//  🐺 Original Bot + Multi-User Support
// ============================================================

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import readline from 'readline';
import express from 'express';
import zlib from 'zlib';

dotenv.config({ path: './.env' });

// =================== ORIGINAL CONSOLE METHODS ===================
const originalConsoleMethods = {
    log: console.log, info: console.info, warn: console.warn,
    error: console.error, debug: console.debug, trace: console.trace,
    dir: console.dir, dirxml: console.dirxml, table: console.table,
    time: console.time, timeEnd: console.timeEnd, timeLog: console.timeLog,
    group: console.group, groupEnd: console.groupEnd, groupCollapsed: console.groupCollapsed,
    clear: console.clear, count: console.count, countReset: console.countReset,
    assert: console.assert, profile: console.profile, profileEnd: console.profileEnd,
    timeStamp: console.timeStamp, context: console.context
};

const shouldShowLog = (args) => {
    if (args.length === 0) return true;
    const firstArg = args[0];
    if (typeof firstArg !== 'string') return true;
    const lowerMsg = firstArg.toLowerCase();
    if (lowerMsg.includes('command') ||
        lowerMsg.includes('✅') || lowerMsg.includes('❌') ||
        lowerMsg.includes('👥') || lowerMsg.includes('👤')) return true;
    if (!lowerMsg.includes('baileys') && !lowerMsg.includes('signal') &&
        !lowerMsg.includes('session') && !lowerMsg.includes('buffer') &&
        !lowerMsg.includes('key')) return true;
    const noisyPatterns = ['closing session', 'sessionentry', 'registrationid',
        'currentratchet', 'buffer', '05 ', '0x', 'failed to decrypt'];
    return !noisyPatterns.some(pattern => lowerMsg.includes(pattern));
};

for (const method of Object.keys(originalConsoleMethods)) {
    if (typeof console[method] === 'function') {
        console[method] = function (...args) {
            if (shouldShowLog(args)) originalConsoleMethods[method].apply(console, args);
        };
    }
}

function setupProcessFilter() {
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const sessionPatterns = ['closing session','sessionentry','registrationid','currentratchet',
        'indexinfo','pendingprekey','_chains','ephemeralkeypair','lastremoteephemeralkey','rootkey','basekey'];
    const filterOutput = (chunk) => {
        const lowerChunk = chunk.toString().toLowerCase();
        return !sessionPatterns.some(p => lowerChunk.includes(p));
    };
    process.stdout.write = function (chunk, encoding, callback) {
        if (filterOutput(chunk)) return originalStdoutWrite.call(this, chunk, encoding, callback);
        if (callback) callback(); return true;
    };
    process.stderr.write = function (chunk, encoding, callback) {
        if (filterOutput(chunk)) return originalStderrWrite.call(this, chunk, encoding, callback);
        if (callback) callback(); return true;
    };
}

process.env.DEBUG = '';
process.env.NODE_ENV = 'production';
process.env.BAILEYS_LOG_LEVEL = 'fatal';
process.env.PINO_LOG_LEVEL = 'fatal';
process.env.BAILEYS_DISABLE_LOG = 'true';
process.env.DISABLE_BAILEYS_LOG = 'true';
process.env.PINO_DISABLE = 'true';

// =================== IMPORTS ===================
import { handleAutoReact } from './commands/automation/autoreactstatus.js';
import { handleAutoView } from './commands/automation/autoviewstatus.js';
import { initializeAutoJoin } from './commands/group/add.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =================== DATABASE SETUP (Multi-User) ===================
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

const dbPath = path.join(__dirname, 'database', 'sirius.db');
if (!fs.existsSync(path.join(__dirname, 'database'))) {
    fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            pair_password TEXT,
            bot_jid TEXT,
            session_string TEXT,
            is_admin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_paired INTEGER DEFAULT 0,
            paired_at TEXT,
            last_login TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Bot configurations per user
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            prefix TEXT DEFAULT '.',
            bot_mode TEXT DEFAULT 'public',
            auto_join INTEGER DEFAULT 1,
            auto_react INTEGER DEFAULT 0,
            auto_view INTEGER DEFAULT 0,
            auto_reply INTEGER DEFAULT 0,
            anti_link INTEGER DEFAULT 0,
            anti_spam INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `);

    // Activity logs
    db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            ip_address TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    `);

    // Create admin user (you - sila0022)
    const adminPin = 'sila0022';
    const hashedPin = bcrypt.hashSync(adminPin, 10);
    
    db.get('SELECT * FROM users WHERE is_admin = 1', (err, row) => {
        if (!row) {
            db.run(`
                INSERT INTO users (phone_number, username, password, is_admin, is_active)
                VALUES ('admin', 'admin', ?, 1, 1)
            `, [hashedPin]);
            console.log('✅ Admin user created (username: admin, password: sila0022)');
        }
    });
});

// User database functions
const UserDB = {
    create: (userData) => {
        return new Promise((resolve, reject) => {
            const { phone_number, username, password, email } = userData;
            const hashedPassword = bcrypt.hashSync(password, 10);
            
            db.run(`
                INSERT INTO users (phone_number, username, password, email, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `, [phone_number, username, hashedPassword, email || ''], function(err) {
                if (err) reject(err);
                else {
                    db.run(`INSERT INTO bot_configs (user_id) VALUES (?)`, [this.lastID]);
                    resolve({ id: this.lastID, phone_number, username });
                }
            });
        });
    },

    findByPhone: (phone_number) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE phone_number = ?', [phone_number], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    findByUsername: (username) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    findById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updatePairInfo: (userId, pairPassword, botJid, sessionString) => {
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE users 
                SET pair_password = ?, bot_jid = ?, session_string = ?, is_paired = 1, paired_at = datetime('now')
                WHERE id = ?
            `, [pairPassword, botJid, sessionString, userId], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    },

    updateLastLogin: (userId) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [userId], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    },

    getAllUsers: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM users ORDER BY id DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getBotConfig: (userId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM bot_configs WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updateBotConfig: (userId, config) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            Object.keys(config).forEach(key => {
                fields.push(`${key} = ?`);
                values.push(config[key]);
            });
            values.push(userId);
            db.run(`UPDATE bot_configs SET ${fields.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`, values, (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    },

    logActivity: (userId, action, details, ip) => {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO activity_logs (user_id, action, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `, [userId, action, details, ip], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }
};

// =================== ORIGINAL BOT VARIABLES ===================
const SESSION_DIR = './sessions/master';
const BOT_NAME = process.env.BOT_NAME || 'SIRIUS';
const VERSION = '2.0.0';
const DEFAULT_PREFIX = process.env.PREFIX || '.';
const OWNER_FILE = './owner.json';
const PREFIX_CONFIG_FILE = './prefix_config.json';
const BOT_SETTINGS_FILE = './bot_settings.json';
const BOT_MODE_FILE = './bot_mode.json';
const WHITELIST_FILE = './whitelist.json';
const BLOCKED_USERS_FILE = './blocked_users.json';
const WELCOME_DATA_FILE = './data/welcome_data.json';
const AUTO_CONNECT_ON_LINK = true;
const AUTO_CONNECT_ON_START = true;
const RATE_LIMIT_ENABLED = true;
const MIN_COMMAND_DELAY = 1000;
const STICKER_DELAY = 2000;
const AUTO_JOIN_ENABLED = true;
const AUTO_JOIN_DELAY = 5000;
const SEND_WELCOME_MESSAGE = true;
const GROUP_LINK = 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g';
const GROUP_INVITE_CODE = GROUP_LINK.split('/').pop();
const GROUP_NAME = 'SIRIUS TEAM';
const AUTO_JOIN_LOG_FILE = './auto_join_log.json';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbDF0pZCxoB4rvUmnN1e';
const CHANNEL_JID = '120363426725658598@newsletter';

function silenceBaileysCompletely() {
    try { const pino = require('pino'); pino({ level: 'silent', enabled: false }); } catch {}
}
silenceBaileysCompletely();
console.clear();
setupProcessFilter();

// =================== ORIGINAL LOGGER ===================
class UltraCleanLogger {
    static log(...args) {
        const message = args.join(' ').toLowerCase();
        const suppressPatterns = ['buffer','timeout','transaction','failed to decrypt','received error','sessionerror','bad mac','stream errored','baileys','whatsapp','ws','closing session','sessionentry','_chains','registrationid','currentratchet','indexinfo','pendingprekey','ephemeralkeypair','lastremoteephemeralkey','rootkey','basekey','signal','key','ratchet','encryption','decryption','qr','scan','pairing','connection.update','creds.update','messages.upsert','group','participant','metadata','presence.update','chat.update','message.receipt.update','message.update','keystore','keypair','pubkey','privkey','<buffer','05 ','0x','signalkey','signalprotocol','sessionstate','senderkey','groupcipher','signalgroup'];
        for (const pattern of suppressPatterns) { if (message.includes(pattern)) return; }
        const timestamp = chalk.gray(`[${new Date().toLocaleTimeString()}]`);
        const cleanArgs = args.map(arg => typeof arg === 'string' ? arg.replace(/\n\s+/g, ' ') : arg);
        originalConsoleMethods.log(timestamp, ...cleanArgs);
    }
    static error(...args) {
        const message = args.join(' ');
        if (message.toLowerCase().includes('fatal') || message.toLowerCase().includes('critical') || message.includes('❌')) {
            const timestamp = chalk.red(`[${new Date().toLocaleTimeString()}]`);
            originalConsoleMethods.error(timestamp, ...args);
        }
    }
    static success(...args) { originalConsoleMethods.log(chalk.green(`[${new Date().toLocaleTimeString()}]`), chalk.green('✅'), ...args); }
    static info(...args) { originalConsoleMethods.log(chalk.blue(`[${new Date().toLocaleTimeString()}]`), chalk.blue('ℹ️'), ...args); }
    static warning(...args) { originalConsoleMethods.log(chalk.yellow(`[${new Date().toLocaleTimeString()}]`), chalk.yellow('⚠️'), ...args); }
    static event(...args) { originalConsoleMethods.log(chalk.magenta(`[${new Date().toLocaleTimeString()}]`), chalk.magenta('🎭'), ...args); }
    static command(...args) { originalConsoleMethods.log(chalk.cyan(`[${new Date().toLocaleTimeString()}]`), chalk.cyan('💬'), ...args); }
    static critical(...args) { originalConsoleMethods.error(chalk.red(`[${new Date().toLocaleTimeString()}]`), chalk.red('🚨'), ...args); }
    static group(...args) { originalConsoleMethods.log(chalk.magenta(`[${new Date().toLocaleTimeString()}]`), chalk.magenta('👥'), ...args); }
    static member(...args) { originalConsoleMethods.log(chalk.cyan(`[${new Date().toLocaleTimeString()}]`), chalk.cyan('👤'), ...args); }
}

console.log = UltraCleanLogger.log;
console.error = UltraCleanLogger.error;
console.info = UltraCleanLogger.info;
console.warn = UltraCleanLogger.warning;
console.debug = () => {};
console.critical = UltraCleanLogger.critical;
global.logSuccess = UltraCleanLogger.success;
global.logInfo = UltraCleanLogger.info;
global.logWarning = UltraCleanLogger.warning;
global.logEvent = UltraCleanLogger.event;
global.logCommand = UltraCleanLogger.command;
global.logGroup = UltraCleanLogger.group;
global.logMember = UltraCleanLogger.member;

const ultraSilentLogger = {
    level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {},
    error: () => {}, fatal: () => {}, child: () => ultraSilentLogger, log: () => {},
    success: () => {}, warning: () => {}, event: () => {}, command: () => {}
};

// =================== ORIGINAL RATE LIMIT ===================
class RateLimitProtection {
    constructor() {
        this.commandTimestamps = new Map();
        this.userCooldowns = new Map();
        this.globalCooldown = Date.now();
        this.stickerSendTimes = new Map();
        setInterval(() => this.cleanup(), 60000);
    }
    canSendCommand(chatId, userId, command) {
        if (!RATE_LIMIT_ENABLED) return { allowed: true };
        const now = Date.now();
        const userKey = `${userId}_${command}`;
        const chatKey = `${chatId}_${command}`;
        if (this.userCooldowns.has(userKey)) {
            const timeDiff = now - this.userCooldowns.get(userKey);
            if (timeDiff < MIN_COMMAND_DELAY) return { allowed: false, reason: `Please wait ${Math.ceil((MIN_COMMAND_DELAY - timeDiff) / 1000)}s before using ${command} again.` };
        }
        if (this.commandTimestamps.has(chatKey)) {
            const timeDiff = now - this.commandTimestamps.get(chatKey);
            if (timeDiff < MIN_COMMAND_DELAY) return { allowed: false, reason: `Command cooldown: ${Math.ceil((MIN_COMMAND_DELAY - timeDiff) / 1000)}s remaining.` };
        }
        if (now - this.globalCooldown < 250) return { allowed: false, reason: 'System is busy. Please try again in a moment.' };
        this.userCooldowns.set(userKey, now);
        this.commandTimestamps.set(chatKey, now);
        this.globalCooldown = now;
        return { allowed: true };
    }
    async waitForSticker(chatId) {
        if (!RATE_LIMIT_ENABLED) { await this.delay(STICKER_DELAY); return; }
        const now = Date.now();
        const lastSticker = this.stickerSendTimes.get(chatId) || 0;
        const timeDiff = now - lastSticker;
        if (timeDiff < STICKER_DELAY) await this.delay(STICKER_DELAY - timeDiff);
        this.stickerSendTimes.set(chatId, Date.now());
    }
    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    cleanup() {
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        for (const [key, timestamp] of this.userCooldowns.entries()) { if (now - timestamp > fiveMinutes) this.userCooldowns.delete(key); }
        for (const [key, timestamp] of this.commandTimestamps.entries()) { if (now - timestamp > fiveMinutes) this.commandTimestamps.delete(key); }
    }
}

const rateLimiter = new RateLimitProtection();

// =================== ORIGINAL PREFIX SYSTEM ===================
let prefixCache = DEFAULT_PREFIX;
let prefixHistory = [];
let isPrefixless = false;

function getCurrentPrefix() { return isPrefixless ? '' : prefixCache; }

function savePrefixToFile(newPrefix) {
    try {
        const isNone = newPrefix === 'none' || newPrefix === '""' || newPrefix === "''" || newPrefix === '';
        fs.writeFileSync(PREFIX_CONFIG_FILE, JSON.stringify({ prefix: isNone ? '' : newPrefix, isPrefixless: isNone, setAt: new Date().toISOString(), timestamp: Date.now(), version: VERSION, previousPrefix: prefixCache, previousIsPrefixless: isPrefixless }, null, 2));
        fs.writeFileSync(BOT_SETTINGS_FILE, JSON.stringify({ prefix: isNone ? '' : newPrefix, isPrefixless: isNone, prefixSetAt: new Date().toISOString(), prefixChangedAt: Date.now(), previousPrefix: prefixCache, previousIsPrefixless: isPrefixless, version: VERSION }, null, 2));
        return true;
    } catch (error) { UltraCleanLogger.error(`Error saving prefix: ${error.message}`); return false; }
}

function loadPrefixFromFiles() {
    try {
        if (fs.existsSync(PREFIX_CONFIG_FILE)) {
            const configData = JSON.parse(fs.readFileSync(PREFIX_CONFIG_FILE, 'utf8'));
            if (configData.isPrefixless !== undefined) isPrefixless = configData.isPrefixless;
            if (configData.prefix !== undefined) {
                if (configData.prefix.trim() === '' && configData.isPrefixless) return '';
                if (configData.prefix.trim() !== '') return configData.prefix.trim();
            }
        }
        if (fs.existsSync(BOT_SETTINGS_FILE)) {
            const settings = JSON.parse(fs.readFileSync(BOT_SETTINGS_FILE, 'utf8'));
            if (settings.isPrefixless !== undefined) isPrefixless = settings.isPrefixless;
            if (settings.prefix && settings.prefix.trim() !== '') return settings.prefix.trim();
        }
    } catch (error) { UltraCleanLogger.warning(`Error loading prefix: ${error.message}`); }
    return DEFAULT_PREFIX;
}

function updatePrefixImmediately(newPrefix) {
    const oldPrefix = prefixCache;
    const oldIsPrefixless = isPrefixless;
    const isNone = newPrefix === 'none' || newPrefix === '""' || newPrefix === "''" || newPrefix === '';
    if (isNone) { isPrefixless = true; prefixCache = ''; }
    else {
        if (!newPrefix || newPrefix.trim() === '') return { success: false, error: 'Empty prefix' };
        if (newPrefix.length > 5) return { success: false, error: 'Prefix too long' };
        prefixCache = newPrefix.trim(); isPrefixless = false;
    }
    if (typeof global !== 'undefined') { global.prefix = getCurrentPrefix(); global.CURRENT_PREFIX = getCurrentPrefix(); global.isPrefixless = isPrefixless; }
    process.env.PREFIX = getCurrentPrefix();
    savePrefixToFile(newPrefix);
    prefixHistory.push({ oldPrefix: oldIsPrefixless ? 'none' : oldPrefix, newPrefix: isPrefixless ? 'none' : prefixCache, isPrefixless, oldIsPrefixless, timestamp: new Date().toISOString(), time: Date.now() });
    if (prefixHistory.length > 10) prefixHistory = prefixHistory.slice(-10);
    updateTerminalHeader();
    return { success: true, oldPrefix: oldIsPrefixless ? 'none' : oldPrefix, newPrefix: isPrefixless ? 'none' : prefixCache, isPrefixless, timestamp: new Date().toISOString() };
}

function updateTerminalHeader() {
    const currentPrefix = getCurrentPrefix();
    const prefixDisplay = isPrefixless ? 'none (prefixless)' : `"${currentPrefix}"`;
    console.clear();
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════════╗
║   ✨ ${chalk.bold(`${BOT_NAME.toUpperCase()} v${VERSION}`)}
║   💬 Prefix  : ${prefixDisplay}
║   🔧 Auto Fix: ✅ ENABLED
║   🛡️ Rate Limit Protection: ✅ ACTIVE
║   🔗 Auto-Connect on Link: ${AUTO_CONNECT_ON_LINK ? '✅' : '❌'}
║   🔐 Login Methods: Pairing Code | Web Login
║   📢 Channel: ${CHANNEL_LINK}
║   👥 Group: ${GROUP_LINK}
╚══════════════════════════════════════════════════════════════════════╝
`));
}

prefixCache = loadPrefixFromFiles();
isPrefixless = prefixCache === '' ? true : false;
updateTerminalHeader();

function detectPlatform() {
    if (process.env.PANEL) return 'Panel';
    if (process.env.HEROKU) return 'Heroku';
    if (process.env.RENDER) return 'Render';
    if (process.env.REPLIT) return 'Replit';
    if (process.env.VERCEL) return 'Vercel';
    return 'Local/VPS';
}

// =================== ORIGINAL VARIABLES ===================
let OWNER_NUMBER = null, OWNER_JID = null, OWNER_CLEAN_JID = null, OWNER_CLEAN_NUMBER = null, OWNER_LID = null;
let SOCKET_INSTANCE = null, isConnected = false, store = null;
let heartbeatInterval = null, lastActivityTime = Date.now(), connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 10;
let BOT_MODE = 'public', WHITELIST = new Set(), AUTO_LINK_ENABLED = true;
let AUTO_CONNECT_COMMAND_ENABLED = true, AUTO_ULTIMATE_FIX_ENABLED = true;
let isWaitingForPairingCode = false, RESTART_AUTO_FIX_ENABLED = true;
let hasAutoConnectedOnStart = false;

// Active user bots (kwa multi-user)
const activeUserBots = new Map();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================== ORIGINAL JID MANAGER ===================
class JidManager {
    constructor() {
        this.ownerJids = new Set();
        this.ownerLids = new Set();
        this.owner = null;
        this.loadOwnerData();
        this.loadWhitelist();
        UltraCleanLogger.success('JID Manager initialized');
    }
    loadOwnerData() {
        try {
            if (fs.existsSync(OWNER_FILE)) {
                const data = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'));
                const ownerJid = data.OWNER_JID;
                if (ownerJid) {
                    const cleaned = this.cleanJid(ownerJid);
                    this.owner = { rawJid: ownerJid, cleanJid: cleaned.cleanJid, cleanNumber: cleaned.cleanNumber, isLid: cleaned.isLid, linkedAt: data.linkedAt || new Date().toISOString() };
                    this.ownerJids.clear(); this.ownerLids.clear();
                    this.ownerJids.add(cleaned.cleanJid); this.ownerJids.add(ownerJid);
                    if (cleaned.isLid) { this.ownerLids.add(ownerJid); this.ownerLids.add(ownerJid.split('@')[0]); OWNER_LID = ownerJid; }
                    OWNER_JID = ownerJid; OWNER_NUMBER = cleaned.cleanNumber; OWNER_CLEAN_JID = cleaned.cleanJid; OWNER_CLEAN_NUMBER = cleaned.cleanNumber;
                }
            }
        } catch {}
    }
    loadWhitelist() {
        try {
            if (fs.existsSync(WHITELIST_FILE)) {
                const data = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
                if (data.whitelist && Array.isArray(data.whitelist)) data.whitelist.forEach(item => WHITELIST.add(item));
            }
        } catch {}
    }
    cleanJid(jid) {
        if (!jid) return { cleanJid: '', cleanNumber: '', raw: jid, isLid: false };
        const isLid = jid.includes('@lid');
        if (isLid) return { raw: jid, cleanJid: jid, cleanNumber: jid.split('@')[0], isLid: true };
        const [numberPart] = jid.split('@')[0].split(':');
        const serverPart = jid.split('@')[1] || 's.whatsapp.net';
        const cleanNumber = numberPart.replace(/[^0-9]/g, '');
        const normalizedNumber = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
        return { raw: jid, cleanJid: `${normalizedNumber}@${serverPart}`, cleanNumber: normalizedNumber, isLid: false };
    }
    isOwner(msg) {
        if (!msg || !msg.key) return false;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const cleaned = this.cleanJid(senderJid);
        if (!this.owner || !this.owner.cleanNumber) return false;
        if (this.ownerJids.has(cleaned.cleanJid) || this.ownerJids.has(senderJid)) return true;
        if (cleaned.isLid) {
            const lidNumber = cleaned.cleanNumber;
            if (this.ownerLids.has(senderJid) || this.ownerLids.has(lidNumber)) return true;
            if (OWNER_LID && (senderJid === OWNER_LID || lidNumber === OWNER_LID.split('@')[0])) return true;
        }
        return false;
    }
    setNewOwner(newJid, isAutoLinked = false) {
        try {
            const cleaned = this.cleanJid(newJid);
            this.ownerJids.clear(); this.ownerLids.clear(); WHITELIST.clear();
            this.owner = { rawJid: newJid, cleanJid: cleaned.cleanJid, cleanNumber: cleaned.cleanNumber, isLid: cleaned.isLid, linkedAt: new Date().toISOString(), autoLinked: isAutoLinked };
            this.ownerJids.add(cleaned.cleanJid); this.ownerJids.add(newJid);
            if (cleaned.isLid) { this.ownerLids.add(newJid); this.ownerLids.add(newJid.split('@')[0]); OWNER_LID = newJid; } else { OWNER_LID = null; }
            OWNER_JID = newJid; OWNER_NUMBER = cleaned.cleanNumber; OWNER_CLEAN_JID = cleaned.cleanJid; OWNER_CLEAN_NUMBER = cleaned.cleanNumber;
            fs.writeFileSync(OWNER_FILE, JSON.stringify({ OWNER_JID: newJid, OWNER_NUMBER: cleaned.cleanNumber, OWNER_CLEAN_JID: cleaned.cleanJid, OWNER_CLEAN_NUMBER: cleaned.cleanNumber, ownerLID: cleaned.isLid ? newJid : null, linkedAt: new Date().toISOString(), autoLinked: isAutoLinked, previousOwnerCleared: true, version: VERSION }, null, 2));
            UltraCleanLogger.success(`New owner set: ${cleaned.cleanJid}`);
            return { success: true, owner: this.owner, isLid: cleaned.isLid };
        } catch { return { success: false, error: 'Failed to set new owner' }; }
    }
    getOwnerInfo() {
        return { ownerJid: this.owner?.cleanJid || null, ownerNumber: this.owner?.cleanNumber || null, ownerLid: OWNER_LID || null, jidCount: this.ownerJids.size, lidCount: this.ownerLids.size, whitelistCount: WHITELIST.size, isLid: this.owner?.isLid || false, linkedAt: this.owner?.linkedAt || null };
    }
}

const jidManager = new JidManager();

// =================== ORIGINAL CLASSES (MemberDetector, AutoGroupJoin, etc) ===================
class NewMemberDetector {
    constructor() {
        this.enabled = true;
        this.detectedMembers = new Map();
        this.groupMembersCache = new Map();
        this.loadDetectionData();
        UltraCleanLogger.success('New Member Detector initialized');
    }
    loadDetectionData() {
        try {
            if (fs.existsSync('./data/member_detection.json')) {
                const data = JSON.parse(fs.readFileSync('./data/member_detection.json', 'utf8'));
                if (data.detectedMembers) for (const [g, m] of Object.entries(data.detectedMembers)) this.detectedMembers.set(g, m);
            }
        } catch (error) { UltraCleanLogger.warning(`Could not load member detection data: ${error.message}`); }
    }
    saveDetectionData() {
        try {
            const data = { detectedMembers: {}, updatedAt: new Date().toISOString(), totalGroups: this.detectedMembers.size };
            for (const [groupId, members] of this.detectedMembers.entries()) data.detectedMembers[groupId] = members;
            if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
            fs.writeFileSync('./data/member_detection.json', JSON.stringify(data, null, 2));
        } catch (error) { UltraCleanLogger.warning(`Could not save member detection data: ${error.message}`); }
    }
    async detectNewMembers(sock, groupUpdate) {
        try {
            if (!this.enabled) return null;
            const { id: groupId, action } = groupUpdate;
            if (action === 'add' || action === 'invite') {
                const rawParticipants = groupUpdate.participants || [];
                const metadata = await sock.groupMetadata(groupId);
                const groupName = metadata.subject || 'Unknown Group';
                let cachedMembers = this.groupMembersCache.get(groupId) || new Set();
                const newMembers = [];

                for (const raw of rawParticipants) {
                    const participant = typeof raw === 'string' ? raw : (raw?.id || raw?.jid || String(raw));
                    if (!participant || !participant.includes('@')) continue;

                    if (!cachedMembers.has(participant)) {
                        try {
                            const userInfo = await sock.onWhatsApp(participant);
                            const userName = userInfo?.[0]?.name || participant.split('@')[0];
                            const userNumber = participant.split('@')[0];
                            newMembers.push({ jid: participant, name: userName, number: userNumber, addedAt: new Date().toISOString(), timestamp: Date.now(), action, addedBy: groupUpdate.actor || 'unknown' });
                            cachedMembers.add(participant);
                            logMember(`➕ ${action.toUpperCase()}: ${userName} (+${userNumber})`);
                            logGroup(`👥 Group: ${groupName}`);
                        } catch (error) { UltraCleanLogger.warning(`Could not get user info for ${participant}: ${error.message}`); }
                    }
                }

                this.groupMembersCache.set(groupId, cachedMembers);
                if (newMembers.length > 0) {
                    const groupEvents = this.detectedMembers.get(groupId) || [];
                    groupEvents.push(...newMembers);
                    this.detectedMembers.set(groupId, groupEvents.slice(-50));
                    if (Math.random() < 0.2) this.saveDetectionData();
                    return newMembers;
                }
            }
            return null;
        } catch (error) { UltraCleanLogger.error(`Member detection error: ${error.message}`); return null; }
    }
    getStats() {
        let totalEvents = 0;
        for (const events of this.detectedMembers.values()) totalEvents += events.length;
        return { enabled: this.enabled, totalGroups: this.detectedMembers.size, totalEvents, cachedGroups: this.groupMembersCache.size };
    }
}

const memberDetector = new NewMemberDetector();

class AutoGroupJoinSystem {
    constructor() {
        this.invitedUsers = new Set();
        this.loadInvitedUsers();
        UltraCleanLogger.success('Auto-Join System initialized');
    }
    loadInvitedUsers() {
        try {
            if (fs.existsSync(AUTO_JOIN_LOG_FILE)) {
                const data = JSON.parse(fs.readFileSync(AUTO_JOIN_LOG_FILE, 'utf8'));
                data.users.forEach(user => this.invitedUsers.add(user));
            }
        } catch {}
    }
    saveInvitedUser(userJid) {
        try {
            this.invitedUsers.add(userJid);
            let data = { users: [], lastUpdated: new Date().toISOString(), totalInvites: 0 };
            if (fs.existsSync(AUTO_JOIN_LOG_FILE)) data = JSON.parse(fs.readFileSync(AUTO_JOIN_LOG_FILE, 'utf8'));
            if (!data.users.includes(userJid)) { data.users.push(userJid); data.totalInvites = data.users.length; data.lastUpdated = new Date().toISOString(); fs.writeFileSync(AUTO_JOIN_LOG_FILE, JSON.stringify(data, null, 2)); }
        } catch (error) { UltraCleanLogger.error(`❌ Error saving invited user: ${error.message}`); }
    }
    isOwner(userJid, jidManager) {
        if (!jidManager.owner || !jidManager.owner.cleanNumber) return false;
        return userJid === jidManager.owner.cleanJid || userJid === jidManager.owner.rawJid || userJid.includes(jidManager.owner.cleanNumber);
    }
    async sendWelcomeMessage(sock, userJid) {
        if (!SEND_WELCOME_MESSAGE) return;
        try { await sock.sendMessage(userJid, { text: `🎉 *WELCOME TO SIRIUS!*\n\nThank you for connecting! 🤖\nYou're being automatically invited to our community group...\nPlease wait... ⏳` }); } catch (error) { UltraCleanLogger.error(`❌ Could not send welcome message: ${error.message}`); }
    }
    async sendGroupInvitation(sock, userJid, isOwner = false) {
        try {
            await sock.sendMessage(userJid, { text: isOwner ? `👑 *OWNER AUTO-JOIN*\n\nYou are being automatically added to the group...\n🔗 ${GROUP_LINK}` : `🔗 *GROUP INVITATION*\n\nJoin our community: ${GROUP_LINK}\n*Group Name:* ${GROUP_NAME}\n\n📢 *Channel:* ${CHANNEL_LINK}` });
            return true;
        } catch (error) { UltraCleanLogger.error(`❌ Could not send group invitation: ${error.message}`); return false; }
    }
    async attemptAutoAdd(sock, userJid, isOwner = false) {
        try {
            let groupId;
            try { groupId = await sock.groupAcceptInvite(GROUP_INVITE_CODE); } catch (inviteError) { throw new Error('Could not access group with invite code'); }
            await sock.groupParticipantsUpdate(groupId, [userJid], 'add');
            await sock.sendMessage(userJid, { text: `✅ *SUCCESSFULLY JOINED!*\n\nYou have been added to the group! 🎉\n\n📢 Join our channel: ${CHANNEL_LINK}` });
            return true;
        } catch (error) {
            UltraCleanLogger.error(`❌ Auto-add failed for ${userJid}: ${error.message}`);
            await sock.sendMessage(userJid, { text: `⚠️ *MANUAL JOIN REQUIRED*\n\nPlease join manually:\n👥 Group: ${GROUP_LINK}\n📢 Channel: ${CHANNEL_LINK}` });
            return false;
        }
    }
    async autoJoinGroup(sock, userJid) {
        if (!AUTO_JOIN_ENABLED) return false;
        if (this.invitedUsers.has(userJid)) return false;
        const isOwner = this.isOwner(userJid, jidManager);
        await this.sendWelcomeMessage(sock, userJid);
        await new Promise(resolve => setTimeout(resolve, AUTO_JOIN_DELAY));
        await this.sendGroupInvitation(sock, userJid, isOwner);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const success = await this.attemptAutoAdd(sock, userJid, isOwner);
        this.saveInvitedUser(userJid);
        return success;
    }
}

const autoGroupJoinSystem = new AutoGroupJoinSystem();

class UltimateFixSystem {
    constructor() { this.fixedJids = new Set(); this.fixApplied = false; this.restartFixAttempted = false; }
    async applyUltimateFix(sock, senderJid, cleaned, isFirstUser = false, isRestart = false) {
        try {
            const originalIsOwner = jidManager.isOwner;
            jidManager.isOwner = function (message) {
                try {
                    if (message?.key?.fromMe) return true;
                    if (!this.owner || !this.owner.cleanNumber) this.loadOwnerDataFromFile?.();
                    return originalIsOwner.call(this, message);
                } catch { return message?.key?.fromMe || false; }
            };
            jidManager.loadOwnerDataFromFile = function () {
                try {
                    if (fs.existsSync('./owner.json')) {
                        const data = JSON.parse(fs.readFileSync('./owner.json', 'utf8'));
                        let cleanNumber = data.OWNER_CLEAN_NUMBER || data.OWNER_NUMBER;
                        if (cleanNumber && cleanNumber.includes(':')) cleanNumber = cleanNumber.split(':')[0];
                        this.owner = { cleanNumber, cleanJid: data.OWNER_CLEAN_JID || data.OWNER_JID, rawJid: data.OWNER_JID, isLid: (data.OWNER_CLEAN_JID || data.OWNER_JID)?.includes('@lid') || false };
                        return true;
                    }
                } catch {}
                return false;
            };
            global.OWNER_NUMBER = cleaned.cleanNumber; global.OWNER_CLEAN_NUMBER = cleaned.cleanNumber;
            global.OWNER_JID = cleaned.cleanJid; global.OWNER_CLEAN_JID = cleaned.cleanJid;
            this.fixedJids.add(senderJid); this.fixApplied = true;
            UltraCleanLogger.success(`✅ Ultimate Fix applied: ${cleaned.cleanJid}`);
            return { success: true, jid: cleaned.cleanJid, number: cleaned.cleanNumber, isLid: cleaned.isLid, isRestart };
        } catch (error) { UltraCleanLogger.error(`Ultimate Fix failed: ${error.message}`); return { success: false, error: 'Fix failed' }; }
    }
    isFixNeeded(jid) { return !this.fixedJids.has(jid); }
    shouldRunRestartFix(ownerJid) { return fs.existsSync(OWNER_FILE) && this.isFixNeeded(ownerJid) && !this.restartFixAttempted && RESTART_AUTO_FIX_ENABLED; }
    markRestartFixAttempted() { this.restartFixAttempted = true; }
}

const ultimateFixSystem = new UltimateFixSystem();

class AutoConnectOnStart {
    constructor() { this.hasRun = false; this.isEnabled = AUTO_CONNECT_ON_START; }
    async trigger(sock) {
        try {
            if (!this.isEnabled || this.hasRun) return;
            if (!sock || !sock.user?.id) return;
            const ownerJid = sock.user.id;
            const cleaned = jidManager.cleanJid(ownerJid);
            const mockMsg = { key: { remoteJid: ownerJid, fromMe: true, id: 'auto-start-' + Date.now(), participant: ownerJid }, message: { conversation: '.connect' } };
            await delay(2000);
            await handleConnectCommand(sock, mockMsg, [], cleaned);
            this.hasRun = true; hasAutoConnectedOnStart = true;
        } catch (error) { UltraCleanLogger.error(`Auto-connect on start failed: ${error.message}`); }
    }
    reset() { this.hasRun = false; hasAutoConnectedOnStart = false; }
}

const autoConnectOnStart = new AutoConnectOnStart();

class AutoLinkSystem {
    constructor() { this.linkAttempts = new Map(); this.MAX_ATTEMPTS = 3; this.autoConnectEnabled = AUTO_CONNECT_ON_LINK; }
    async shouldAutoLink(sock, msg) {
        if (!AUTO_LINK_ENABLED) return false;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const cleaned = jidManager.cleanJid(senderJid);
        if (!jidManager.owner || !jidManager.owner.cleanNumber) {
            UltraCleanLogger.info(`🔗 New owner detected: ${cleaned.cleanJid}`);
            const result = await this.autoLinkNewOwner(sock, senderJid, cleaned, true);
            if (result && this.autoConnectEnabled) setTimeout(async () => { await this.triggerAutoConnect(sock, msg, cleaned, true); }, 1500);
            return result;
        }
        if (msg.key.fromMe) return false;
        if (jidManager.isOwner(msg)) return false;
        const currentOwnerNumber = jidManager.owner.cleanNumber;
        if (this.isSimilarNumber(cleaned.cleanNumber, currentOwnerNumber)) {
            if (!jidManager.ownerJids.has(cleaned.cleanJid)) {
                jidManager.ownerJids.add(cleaned.cleanJid); jidManager.ownerJids.add(senderJid);
                if (AUTO_ULTIMATE_FIX_ENABLED && ultimateFixSystem.isFixNeeded(senderJid)) setTimeout(async () => { await ultimateFixSystem.applyUltimateFix(sock, senderJid, cleaned, false); }, 800);
                await this.sendDeviceLinkedMessage(sock, senderJid, cleaned);
                if (this.autoConnectEnabled) setTimeout(async () => { await this.triggerAutoConnect(sock, msg, cleaned, false); }, 1500);
                return true;
            }
        }
        return false;
    }
    isSimilarNumber(num1, num2) {
        if (!num1 || !num2) return false;
        if (num1 === num2) return true;
        if (num1.includes(num2) || num2.includes(num1)) return true;
        if (num1.length >= 6 && num2.length >= 6) return num1.slice(-6) === num2.slice(-6);
        return false;
    }
    async autoLinkNewOwner(sock, senderJid, cleaned, isFirstUser = false) {
        try {
            const result = jidManager.setNewOwner(senderJid, true);
            if (!result.success) return false;
            await this.sendImmediateSuccessMessage(sock, senderJid, cleaned, isFirstUser);
            if (AUTO_ULTIMATE_FIX_ENABLED) setTimeout(async () => { await ultimateFixSystem.applyUltimateFix(sock, senderJid, cleaned, isFirstUser); }, 1200);
            if (AUTO_JOIN_ENABLED) setTimeout(async () => { try { await autoGroupJoinSystem.autoJoinGroup(sock, senderJid); } catch (error) { UltraCleanLogger.error(`❌ Auto-join for new owner failed: ${error.message}`); } }, 3000);
            return true;
        } catch { return false; }
    }
    async triggerAutoConnect(sock, msg, cleaned, isNewOwner = false) {
        try { if (!this.autoConnectEnabled) return; await handleConnectCommand(sock, msg, [], cleaned); } catch (error) { UltraCleanLogger.error(`Auto-connect failed: ${error.message}`); }
    }
    async sendImmediateSuccessMessage(sock, senderJid, cleaned, isFirstUser = false) {
        try {
            const currentPrefix = getCurrentPrefix();
            const prefixDisplay = isPrefixless ? 'none (prefixless)' : `"${currentPrefix}"`;
            await sock.sendMessage(senderJid, { text: `✅ *${BOT_NAME.toUpperCase()} v${VERSION} CONNECTED!*\n\n${isFirstUser ? '🎉 *FIRST TIME SETUP COMPLETE!*\n\n' : '🔄 *NEW OWNER LINKED!*\n\n'}📋 *YOUR INFORMATION:*\n├─ Your Number: +${cleaned.cleanNumber}\n├─ Device Type: ${cleaned.isLid ? 'Linked Device 🔗' : 'Regular Device 📱'}\n├─ Prefix: ${prefixDisplay}\n└─ Status: ✅ LINKED SUCCESSFULLY\n\n🎉 *You're all set!*\n\n📢 *Join our channel:* ${CHANNEL_LINK}\n👥 *Join our group:* ${GROUP_LINK}` });
        } catch {}
    }
    async sendDeviceLinkedMessage(sock, senderJid, cleaned) {
        try { await sock.sendMessage(senderJid, { text: `📱 *Device Linked Successfully!*\n\n✅ You can now use owner commands from this device.\n🎉 All systems are now active!\n\n📢 Channel: ${CHANNEL_LINK}\n👥 Group: ${GROUP_LINK}` }); } catch {}
    }
}

const autoLinkSystem = new AutoLinkSystem();

async function handleConnectCommand(sock, msg, args, cleaned) {
    try {
        const chatJid = msg.key.remoteJid || cleaned.cleanJid;
        const start = Date.now();
        const currentPrefix = getCurrentPrefix();
        const prefixDisplay = isPrefixless ? 'none (prefixless)' : `"${currentPrefix}"`;
        const platform = detectPlatform();
        const loadingMessage = await sock.sendMessage(chatJid, { text: `✨ *${BOT_NAME}* is checking connection... █▒▒▒▒▒▒▒▒▒` }, { quoted: msg });
        const latency = Date.now() - start;
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
        const isOwnerUser = jidManager.isOwner(msg);
        const memberStats = memberDetector ? memberDetector.getStats() : null;
        let statusEmoji, statusText, mood;
        if (latency <= 100) { statusEmoji = '🟢'; statusText = 'Excellent'; mood = '⚡Superb Connection'; }
        else if (latency <= 300) { statusEmoji = '🟡'; statusText = 'Good'; mood = '📡Stable Link'; }
        else { statusEmoji = '🔴'; statusText = 'Slow'; mood = '🌑Needs Optimization'; }
        await delay(Math.max(500, 1000 - (Date.now() - start)));
        await sock.sendMessage(chatJid, { text: `\n╭━━🌕 *CONNECTION STATUS* 🌕━━╮\n┃  ⚡ *User:* ${cleaned.cleanNumber}\n┃  🔴 *Prefix:* ${prefixDisplay}\n┃  🐾 *Ultimatefix:* ${isOwnerUser ? '✅' : '❌'}\n┃  🏗️ *Platform:* ${platform}\n┃  ⏱️ *Latency:* ${latency}ms ${statusEmoji}\n┃  ⏰ *Uptime:* ${h}h ${m}m ${s}s\n┃  👥 *Members:* ${memberStats ? memberStats.totalEvents + ' events' : 'Not loaded'}\n┃  🔗 *Status:* ${statusText}\n┃  🎯 *Mood:* ${mood}\n┃  👑 *Owner:* ${isOwnerUser ? '✅ Yes' : '❌ No'}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n🔗 *OFFICIAL LINKS:*\n📢 Channel: ${CHANNEL_LINK}\n👥 Group: ${GROUP_LINK}\n\n_✨ SIRIUS — The Brightest Star_`, edit: loadingMessage.key }, { quoted: msg });
        UltraCleanLogger.command(`Connect from ${cleaned.cleanNumber}`);
        return true;
    } catch { return false; }
}

class StatusDetector {
    constructor() {
        this.detectionEnabled = true; this.statusLogs = []; this.lastDetection = null;
        this.setupDataDir(); this.loadStatusLogs();
        UltraCleanLogger.success('Status Detector initialized');
    }
    setupDataDir() { try { if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true }); } catch (error) { UltraCleanLogger.error(`Error setting up data directory: ${error.message}`); } }
    loadStatusLogs() {
        try {
            if (fs.existsSync('./data/status_detection_logs.json')) {
                const data = JSON.parse(fs.readFileSync('./data/status_detection_logs.json', 'utf8'));
                if (Array.isArray(data.logs)) this.statusLogs = data.logs.slice(-100);
            }
        } catch {}
    }
    saveStatusLogs() {
        try { fs.writeFileSync('./data/status_detection_logs.json', JSON.stringify({ logs: this.statusLogs.slice(-1000), updatedAt: new Date().toISOString(), count: this.statusLogs.length }, null, 2)); } catch {}
    }
    async detectStatusUpdate(msg) {
        try {
            if (!this.detectionEnabled) return null;
            const sender = msg.key.participant || 'unknown';
            const shortSender = sender.split('@')[0];
            const timestamp = msg.messageTimestamp || Date.now();
            const statusTime = new Date(timestamp * 1000).toLocaleTimeString();
            const statusInfo = this.extractStatusInfo(msg);
            UltraCleanLogger.info(`👁️ Status from ${shortSender} at ${statusTime} [${statusInfo.type}]`);
            const logEntry = { sender: shortSender, fullSender: sender, type: statusInfo.type, caption: statusInfo.caption, fileInfo: statusInfo.fileInfo, postedAt: statusTime, detectedAt: new Date().toLocaleTimeString(), timestamp: Date.now() };
            this.statusLogs.push(logEntry); this.lastDetection = logEntry;
            if (this.statusLogs.length % 5 === 0) this.saveStatusLogs();
            return logEntry;
        } catch { return null; }
    }
    extractStatusInfo(msg) {
        try {
            const message = msg.message;
            let type = 'unknown', caption = '', fileInfo = '';
            if (message.imageMessage) { type = 'image'; caption = message.imageMessage.caption || ''; }
            else if (message.videoMessage) { type = 'video'; caption = message.videoMessage.caption || ''; }
            else if (message.audioMessage) { type = 'audio'; }
            else if (message.extendedTextMessage) { type = 'text'; caption = message.extendedTextMessage.text || ''; }
            else if (message.conversation) { type = 'text'; caption = message.conversation; }
            else if (message.stickerMessage) { type = 'sticker'; }
            return { type, caption: caption.substring(0, 100), fileInfo };
        } catch { return { type: 'unknown', caption: '', fileInfo: '' }; }
    }
    getStats() {
        return { totalDetected: this.statusLogs.length, lastDetection: this.lastDetection ? `${this.lastDetection.sender} - ${this.getTimeAgo(this.lastDetection.timestamp)}` : 'None', detectionEnabled: this.detectionEnabled };
    }
    getTimeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`;
    }
}

let statusDetector = null;

function isUserBlocked(jid) {
    try { if (fs.existsSync(BLOCKED_USERS_FILE)) { const data = JSON.parse(fs.readFileSync(BLOCKED_USERS_FILE, 'utf8')); return data.users && data.users.includes(jid); } } catch {}
    return false;
}

function checkBotMode(msg, commandName) {
    try {
        if (jidManager.isOwner(msg)) return true;
        if (fs.existsSync(BOT_MODE_FILE)) { const modeData = JSON.parse(fs.readFileSync(BOT_MODE_FILE, 'utf8')); BOT_MODE = modeData.mode || 'public'; } else { BOT_MODE = 'public'; }
        const chatJid = msg.key.remoteJid;
        switch (BOT_MODE) {
            case 'public': return true; case 'private': return false; case 'silent': return false;
            case 'group-only': return chatJid.includes('@g.us');
            case 'maintenance': return ['ping', 'status', 'uptime', 'help'].includes(commandName);
            default: return true;
        }
    } catch { return true; }
}

function startHeartbeat(sock) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => { if (isConnected && sock) { try { await sock.sendPresenceUpdate('available'); lastActivityTime = Date.now(); } catch {} } }, 60 * 1000);
}

function stopHeartbeat() { if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } }

function ensureSessionDir() { if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true }); }

function cleanSession() { try { if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true }); return true; } catch { return false; } }

class MessageStore {
    constructor() { this.messages = new Map(); this.maxMessages = 100; }
    addMessage(jid, messageId, message) {
        try {
            const key = `${jid}|${messageId}`;
            this.messages.set(key, { ...message, timestamp: Date.now() });
            if (this.messages.size > this.maxMessages) this.messages.delete(this.messages.keys().next().value);
        } catch {}
    }
    getMessage(jid, messageId) { try { return this.messages.get(`${jid}|${messageId}`) || null; } catch { return null; } }
}

const commands = new Map();
const commandCategories = new Map();

async function loadCommandsFromFolder(folderPath, category = 'general') {
    const absolutePath = path.resolve(folderPath);
    if (!fs.existsSync(absolutePath)) return;
    try {
        const items = fs.readdirSync(absolutePath);
        let categoryCount = 0;
        for (const item of items) {
            const fullPath = path.join(absolutePath, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) { await loadCommandsFromFolder(fullPath, item); }
            else if (item.endsWith('.js')) {
                try {
                    if (item.includes('.test.') || item.includes('.disabled.')) continue;
                    const commandModule = await import(`file://${fullPath}`);
                    const command = commandModule.default || commandModule;
                    if (command && command.name) {
                        command.category = category;
                        commands.set(command.name.toLowerCase(), command);
                        if (!commandCategories.has(category)) commandCategories.set(category, []);
                        commandCategories.get(category).push(command.name);
                        categoryCount++;
                        if (Array.isArray(command.alias)) command.alias.forEach(alias => commands.set(alias.toLowerCase(), command));
                    }
                } catch {}
            }
        }
        if (categoryCount > 0) UltraCleanLogger.info(`${categoryCount} commands loaded from ${category}`);
    } catch {}
}

// =================== SESSION PARSER (SILA-MD~) ===================
function parseSIRIUSSession(sessionString) {
    try {
        let cleaned = sessionString.trim().replace(/^["']|["']$/g, '');
        if (cleaned.startsWith('SILA-MD~')) {
            cleaned = cleaned.substring(8);
        }
        if (!cleaned) throw new Error('No data after prefix');
        const buffer = Buffer.from(cleaned, 'base64');
        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
            const decompressed = zlib.gunzipSync(buffer);
            return JSON.parse(decompressed.toString('utf8'));
        }
        const text = buffer.toString('utf8');
        return JSON.parse(text);
    } catch (error) { 
        console.log('❌ Failed to parse session:', error.message); 
        return null; 
    }
}

// =================== USER BOT STARTER (Multi-User) ===================
async function startUserBot(userId, phoneNumber, sessionString) {
    const userSessionDir = `./sessions/user_${userId}`;
    
    if (!fs.existsSync(userSessionDir)) {
        fs.mkdirSync(userSessionDir, { recursive: true });
    }
    
    const credsPath = path.join(userSessionDir, 'creds.json');
    
    if (sessionString && !fs.existsSync(credsPath)) {
        try {
            const sessionData = parseSIRIUSSession(sessionString);
            if (sessionData) {
                fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
                console.log(`✅ Session saved for user ${phoneNumber}`);
            }
        } catch (err) {
            console.error(`❌ Failed to save session for user ${phoneNumber}:`, err.message);
            return;
        }
    }
    
    if (!fs.existsSync(credsPath)) {
        console.log(`⏳ User ${phoneNumber} needs to pair first`);
        return;
    }
    
    try {
        const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } = await import('@whiskeysockets/baileys');
        const pino = (await import('pino')).default;
        
        const { state, saveCreds } = await useMultiFileAuthState(userSessionDir);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
            logger: pino({ level: "fatal" }).child({ level: "fatal" })
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            
            if (connection === 'open') {
                console.log(chalk.green(`✅ Bot for ${phoneNumber} is ONLINE!`));
                
                // Update user in database
                await UserDB.updatePairInfo(userId, null, sock.user.id, null);
                
                // Send welcome message
                await sock.sendMessage(sock.user.id, {
                    text: `✅ *SIRIUS BOT v${VERSION}* is now ONLINE!\n\n` +
                          `🔗 Your dashboard: ${process.env.WEB_URL || 'http://localhost:3000'}\n` +
                          `📢 Channel: ${CHANNEL_LINK}\n` +
                          `👥 Group: ${GROUP_LINK}\n\n` +
                          `📝 Use ${getCurrentPrefix()}help to see available commands.`
                });
            }
            
            if (connection === 'close') {
                console.log(chalk.yellow(`⚠️ Bot for ${phoneNumber} disconnected`));
                // Auto restart after 5 seconds
                setTimeout(() => {
                    startUserBot(userId, phoneNumber, null);
                }, 5000);
            }
        });
        
        // Handle messages (commands)
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            // Get user's custom prefix
            const userConfig = await UserDB.getBotConfig(userId);
            const userPrefix = userConfig?.prefix || DEFAULT_PREFIX;
            
            // Process message (you can add your command handling here)
            // For now, just log
            console.log(`[${phoneNumber}] Message:`, msg.message.conversation || 'Media');
        });
        
        activeUserBots.set(userId, sock);
        
    } catch (error) {
        console.error(`❌ Failed to start bot for user ${phoneNumber}:`, error.message);
    }
}

// =================== START ALL USER BOTS ===================
async function startAllUserBots() {
    const users = await UserDB.getAllUsers();
    
    for (const user of users) {
        if (user.is_paired && user.session_string) {
            console.log(`🚀 Starting bot for ${user.phone_number}...`);
            await startUserBot(user.id, user.phone_number, user.session_string);
            await delay(2000); // Delay between starting bots
        }
    }
}

// =================== MAIN BOT START (Your Original) ===================
async function startMasterBot() {
    try {
        UltraCleanLogger.info('🚀 Initializing SIRIUS Multi-User System...');
        
        // Load commands
        await loadCommandsFromFolder('./commands');
        store = new MessageStore();
        ensureSessionDir();
        statusDetector = new StatusDetector();
        autoConnectOnStart.reset();
        
        const { default: makeWASocket } = await import('@whiskeysockets/baileys');
        const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = await import('@whiskeysockets/baileys');
        
        let state, saveCreds;
        try {
            const authState = await useMultiFileAuthState(SESSION_DIR);
            state = authState.state;
            saveCreds = authState.saveCreds;
        } catch {
            cleanSession();
            const freshAuth = await useMultiFileAuthState(SESSION_DIR);
            state = freshAuth.state;
            saveCreds = freshAuth.saveCreds;
        }
        
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({
            version,
            logger: ultraSilentLogger,
            browser: Browsers.ubuntu('Chrome'),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, ultraSilentLogger)
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 40000,
            keepAliveIntervalMs: 15000,
            emitOwnEvents: true,
            mobile: false,
            getMessage: async (key) => store?.getMessage(key.remoteJid, key.id) || null,
            defaultQueryTimeoutMs: 20000
        });
        
        SOCKET_INSTANCE = sock;
        connectionAttempts = 0;
        isWaitingForPairingCode = false;
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                isConnected = true;
                startHeartbeat(sock);
                await handleSuccessfulConnection(sock);
                isWaitingForPairingCode = false;
                triggerRestartAutoFix(sock).catch(() => {});
                
                // Start all user bots after master connects
                await startAllUserBots();
                
                if (AUTO_CONNECT_ON_START) {
                    setTimeout(async () => { await autoConnectOnStart.trigger(sock); }, 2000);
                }
            }
            if (connection === 'close') {
                isConnected = false;
                stopHeartbeat();
                if (statusDetector) statusDetector.saveStatusLogs();
                if (memberDetector) memberDetector.saveDetectionData();
                await handleConnectionCloseSilently(lastDisconnect);
                isWaitingForPairingCode = false;
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('group-participants.update', async (update) => {
            try {
                if (memberDetector && memberDetector.enabled) {
                    const newMembers = await memberDetector.detectNewMembers(sock, update);
                    if (newMembers && newMembers.length > 0) {
                        UltraCleanLogger.info(`👥 Detected ${newMembers.length} new members`);
                    }
                }
            } catch (error) {
                UltraCleanLogger.warning(`Member detection error: ${error.message}`);
            }
        });
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message) return;
            lastActivityTime = Date.now();
            
            if (msg.key?.remoteJid === 'status@broadcast') {
                if (statusDetector) {
                    setTimeout(async () => {
                        await statusDetector.detectStatusUpdate(msg);
                        await handleAutoView(sock, msg.key);
                        await handleAutoReact(sock, msg.key);
                    }, 800);
                }
                return;
            }
            
            if (store) store.addMessage(msg.key.remoteJid, msg.key.id, msg);
            handleIncomingMessage(sock, msg).catch(() => {});
        });
        
        UltraCleanLogger.success(`✅ Loaded ${commands.size} commands`);
        return sock;
        
    } catch (error) {
        UltraCleanLogger.error('❌ Connection failed, retrying in 8 seconds...');
        setTimeout(async () => { await startMasterBot(); }, 8000);
    }
}

async function triggerRestartAutoFix(sock) {
    try {
        if (fs.existsSync(OWNER_FILE) && sock.user?.id) {
            const ownerJid = sock.user.id;
            const cleaned = jidManager.cleanJid(ownerJid);
            if (ultimateFixSystem.shouldRunRestartFix(ownerJid)) {
                ultimateFixSystem.markRestartFixAttempted();
                await delay(1500);
                await ultimateFixSystem.applyUltimateFix(sock, ownerJid, cleaned, false, true);
            }
        }
    } catch (error) {
        UltraCleanLogger.warning(`⚠️ Restart auto-fix error: ${error.message}`);
    }
}

async function handleSuccessfulConnection(sock) {
    OWNER_JID = sock.user.id;
    OWNER_NUMBER = OWNER_JID.split('@')[0];
    const isFirstConnection = !fs.existsSync(OWNER_FILE);
    if (isFirstConnection) jidManager.setNewOwner(OWNER_JID, false);
    else jidManager.loadOwnerData();
    const ownerInfo = jidManager.getOwnerInfo();
    const currentPrefix = getCurrentPrefix();
    const prefixDisplay = isPrefixless ? 'none (prefixless)' : `"${currentPrefix}"`;
    updateTerminalHeader();
    console.log(chalk.greenBright(`\n╔══════════════════════════════════════╗\n║    ✨ SIRIUS MULTI-USER v${VERSION}     ║\n╠══════════════════════════════════════╣\n║  ✅ Master Bot Connected!\n║  👑 Owner  : +${ownerInfo.ownerNumber}\n║  💬 Prefix : ${prefixDisplay}\n║  👥 Users  : Waiting for users...\n║  📢 Channel: ${CHANNEL_LINK}\n║  👥 Group  : ${GROUP_LINK}\n╚══════════════════════════════════════╝\n`));
    
    const cleaned = jidManager.cleanJid(OWNER_JID);
    if (ultimateFixSystem.isFixNeeded(OWNER_JID)) {
        setTimeout(async () => {
            await ultimateFixSystem.applyUltimateFix(sock, OWNER_JID, cleaned, isFirstConnection);
        }, 1200);
    }
}

async function handleConnectionCloseSilently(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    connectionAttempts++;
    if (statusCode === 409) {
        setTimeout(async () => { await startMasterBot(); }, 25000);
        return;
    }
    if (statusCode === 401 || statusCode === 403 || statusCode === 419) cleanSession();
    const delayTime = Math.min(4000 * Math.pow(2, connectionAttempts - 1), 50000);
    setTimeout(async () => {
        if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
            connectionAttempts = 0;
            process.exit(1);
        } else {
            await startMasterBot();
        }
    }, delayTime);
}

// =================== RESOLVE JID FOR LOG ===================
async function resolveJidForLog(sock, inputJid, groupChatJid = null) {
    if (!inputJid) return inputJid;
    if (inputJid.endsWith('@g.us') || inputJid.endsWith('@newsletter')) return inputJid;
    if (inputJid.endsWith('@lid')) {
        if (groupChatJid && groupChatJid.endsWith('@g.us')) {
            try {
                const meta = await sock.groupMetadata(groupChatJid);
                const p = meta?.participants?.find(x => x.id === inputJid);
                if (p?.phoneNumber) {
                    const num = String(p.phoneNumber).split('@')[0].split(':')[0].replace(/\D/g, '');
                    if (num.length >= 7) return `${num}@s.whatsapp.net`;
                }
            } catch {}
        }
        return inputJid;
    }
    const number = inputJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    return `${number}@s.whatsapp.net`;
}

async function logIncomingMessage(sock, msg, textMsg) {
    try {
        messageLogCounter++;
        const logNum = messageLogCounter;
        const chatId = msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const rawSenderJid = msg.key.participant || chatId;
        const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
        
        let resolvedSenderJid = rawSenderJid;
        try { resolvedSenderJid = await resolveJidForLog(sock, rawSenderJid, isGroup ? chatId : null); } catch {}
        
        const phoneNumber = '+' + resolvedSenderJid.split('@')[0].split(':')[0].replace(/\D/g, '');
        
        let displayName = '';
        try {
            const contacts = sock.store?.contacts || {};
            const contact = contacts[resolvedSenderJid] || contacts[rawSenderJid];
            displayName = contact?.name || contact?.notify || '';
        } catch {}
        if (!displayName) displayName = phoneNumber;
        
        if (isGroup) {
            let groupName = chatId;
            try {
                const meta = await sock.groupMetadata(chatId);
                groupName = meta?.subject || chatId;
            } catch {}
            
            const line = '─'.repeat(42);
            originalConsoleMethods.log(chalk.green(
                `\n╭${line}\n` +
                `│ ✨ ${chalk.bold(`SIRIUS LOG #${logNum}`)}\n` +
                `├${line}\n` +
                `│ 👥 ${chalk.bold('Group  :')} ${groupName}\n` +
                `│ 👤 ${chalk.bold('Sender :')} ${displayName}\n` +
                `│ ☎️  ${chalk.bold('Number :')} ${phoneNumber}\n` +
                `│ 🆔 ${chalk.bold('JID    :')} ${chatId}\n` +
                `│ 💬 ${chalk.bold('Msg    :')} ${textMsg.substring(0, 80)}${textMsg.length > 80 ? '…' : ''}\n` +
                `│ 🕒 ${chalk.bold('Time   :')} ${timeStr}\n` +
                `│ 📩 ${chalk.bold('Type   :')} GROUP\n` +
                `╰${line}`
            ));
        } else {
            const line = '─'.repeat(37);
            originalConsoleMethods.log(chalk.green(
                `\n╭${line}\n` +
                `│ ✨ ${chalk.bold(`SIRIUS LOG #${logNum}`)}\n` +
                `├${line}\n` +
                `│ 👤 ${chalk.bold('Name   :')} ${displayName}\n` +
                `│ ☎️  ${chalk.bold('Number :')} ${phoneNumber}\n` +
                `│ 🆔 ${chalk.bold('JID    :')} ${resolvedSenderJid}\n` +
                `│ 💬 ${chalk.bold('Msg    :')} ${textMsg.substring(0, 80)}${textMsg.length > 80 ? '…' : ''}\n` +
                `│ 🕒 ${chalk.bold('Time   :')} ${timeStr}\n` +
                `│ 📩 ${chalk.bold('Type   :')} DM\n` +
                `╰${line}`
            ));
        }
    } catch {}
}

let messageLogCounter = 0;

async function handleIncomingMessage(sock, msg) {
    try {
        const chatId = msg.key.remoteJid;
        const senderJid = msg.key.participant || chatId;
        const autoLinkPromise = autoLinkSystem.shouldAutoLink(sock, msg);
        if (isUserBlocked(senderJid)) return;
        const linked = await autoLinkPromise;
        if (linked) return;
        const textMsg = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        if (!textMsg) return;
        logIncomingMessage(sock, msg, textMsg).catch(() => {});
        const currentPrefix = getCurrentPrefix();
        let commandName = '', args = [];
        if (!isPrefixless && textMsg.startsWith(currentPrefix)) {
            const spaceIndex = textMsg.indexOf(' ', currentPrefix.length);
            commandName = spaceIndex === -1 ? textMsg.slice(currentPrefix.length).toLowerCase().trim() : textMsg.slice(currentPrefix.length, spaceIndex).toLowerCase().trim();
            args = spaceIndex === -1 ? [] : textMsg.slice(spaceIndex).trim().split(/\s+/);
        } else if (isPrefixless) {
            const words = textMsg.trim().split(/\s+/);
            const firstWord = words[0].toLowerCase();
            if (commands.has(firstWord)) { commandName = firstWord; args = words.slice(1); }
            else {
                for (const [cmdName, command] of commands.entries()) { if (command.alias && command.alias.includes(firstWord)) { commandName = cmdName; args = words.slice(1); break; } }
                if (!commandName) { const defaultCommands = ['ping','help','autojoin','uptime','statusstats','ultimatefix','prefixinfo','defib','defibrestart']; if (defaultCommands.includes(firstWord)) { commandName = firstWord; args = words.slice(1); } }
            }
        }
        if (!commandName) return;
        const rateLimitCheck = rateLimiter.canSendCommand(chatId, senderJid, commandName);
        if (!rateLimitCheck.allowed) { await sock.sendMessage(chatId, { text: `⚠️ ${rateLimitCheck.reason}` }); return; }
        const prefixDisplay = isPrefixless ? '' : currentPrefix;
        UltraCleanLogger.command(`${chatId.split('@')[0]} → ${prefixDisplay}${commandName}`);
        if (!checkBotMode(msg, commandName)) {
            if (BOT_MODE === 'silent' && !jidManager.isOwner(msg)) return;
            try { await sock.sendMessage(chatId, { text: `❌ *Command Blocked*\nBot is in ${BOT_MODE} mode.` }); } catch {}
            return;
        }
        if (commandName === 'connect' || commandName === 'link') { const cleaned = jidManager.cleanJid(senderJid); await handleConnectCommand(sock, msg, args, cleaned); return; }
        const command = commands.get(commandName);
        if (command) {
            try {
                if (command.ownerOnly && !jidManager.isOwner(msg)) { try { await sock.sendMessage(chatId, { text: '❌ *Owner Only Command*' }); } catch {} return; }
                if (commandName.includes('sticker')) await delay(1000);
                await command.execute(sock, msg, args, currentPrefix, { OWNER_NUMBER: OWNER_CLEAN_NUMBER, OWNER_JID: OWNER_CLEAN_JID, OWNER_LID, BOT_NAME, VERSION, isOwner: () => jidManager.isOwner(msg), jidManager, store, statusDetector, updatePrefix: updatePrefixImmediately, getCurrentPrefix, rateLimiter, memberDetector, isPrefixless });
            } catch (error) { UltraCleanLogger.error(`Command ${commandName} failed: ${error.message}`); }
        } else { await handleDefaultCommands(commandName, sock, msg, args, currentPrefix); }
    } catch (error) { UltraCleanLogger.error(`Message handler error: ${error.message}`); }
}

async function handleDefaultCommands(commandName, sock, msg, args, currentPrefix) {
    const chatId = msg.key.remoteJid;
    try {
        switch (commandName) {
            case 'ping': await sock.sendMessage(chatId, { text: `✨ *SIRIUS v${VERSION}* — Pong! ✅\n⏱️ Uptime: ${Math.round(process.uptime())}s` }, { quoted: msg }); break;
            case 'uptime': { const uptime = process.uptime(); await sock.sendMessage(chatId, { text: `⏰ *Uptime:* ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s\n💾 *Memory:* ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB` }, { quoted: msg }); break; }
            case 'help': {
                let helpText = `✨ *${BOT_NAME} v${VERSION}* ✨

📋 *Prefix:* ${isPrefixless ? 'none' : `"${currentPrefix}"`}
📊 *Commands:* ${commands.size}

🔗 *OFFICIAL LINKS:*
├─ 📢 Channel: ${CHANNEL_LINK}
├─ 👥 Group: ${GROUP_LINK}
└─ 🆔 Channel JID: ${CHANNEL_JID}

📝 *COMMANDS:*\n`;
                for (const category of commandCategories.keys()) { 
                    const cmdList = commandCategories.get(category); 
                    helpText += `\n*${category.toUpperCase()}*\n${cmdList.map(c => `• ${currentPrefix}${c}`).join('\n')}\n`; 
                }
                helpText += `\n_✨ SIRIUS — The Brightest Star_`;
                await sock.sendMessage(chatId, { text: helpText }, { quoted: msg }); 
                break;
            }
            case 'statusstats': { if (!statusDetector) { await sock.sendMessage(chatId, { text: '❌ Status Detector not initialized' }, { quoted: msg }); break; } const stats = statusDetector.getStats(); await sock.sendMessage(chatId, { text: `👁️ *STATUS DETECTOR STATS*\n\n📊 Total Detected: ${stats.totalDetected}\n🕒 Last Detection: ${stats.lastDetection}\n🔧 Detection Enabled: ${stats.detectionEnabled ? '✅' : '❌'}` }, { quoted: msg }); break; }
            case 'prefixinfo': { const currentP = getCurrentPrefix(); await sock.sendMessage(chatId, { text: `💬 *PREFIX INFO*\n\nCurrent Prefix: ${isPrefixless ? 'none' : `"${currentP}"`}\nPrefixless Mode: ${isPrefixless ? '✅' : '❌'}` }, { quoted: msg }); break; }
        }
    } catch (error) { UltraCleanLogger.error(`Default command error: ${error.message}`); }
}

// =================== EXPRESS WEB SERVER (For Users) ===================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Import web routes
import authRoutes from './routes/auth.js';
import pairRoutes from './routes/pair.js';
import webDashboardRoutes from './routes/dashboard.js';
import webSettingsRoutes from './routes/settings.js';
import webProfileRoutes from './routes/profile.js';
import webAdminRoutes from './routes/admin.js';

app.use('/api/auth', authRoutes);
app.use('/api/pair', pairRoutes);
app.use('/api/dashboard', webDashboardRoutes);
app.use('/api/settings', webSettingsRoutes);
app.use('/api/profile', webProfileRoutes);
app.use('/api/admin', webAdminRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(chalk.green(`🌐 Web panel running on http://localhost:${PORT}`));
    console.log(chalk.cyan(`🔑 Admin login: admin / sila0022`));
});

// =================== PROCESS HANDLERS ===================
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Shutting down gracefully...'));
    if (statusDetector) statusDetector.saveStatusLogs();
    if (memberDetector) memberDetector.saveDetectionData();
    stopHeartbeat();
    if (SOCKET_INSTANCE) SOCKET_INSTANCE.ws.close();
    process.exit(0);
});

process.on('uncaughtException', (error) => { 
    UltraCleanLogger.error(`Uncaught exception: ${error.message}`); 
});

process.on('unhandledRejection', (error) => { 
    UltraCleanLogger.error(`Unhandled rejection: ${error?.message}`); 
});

setInterval(() => { 
    if (isConnected && (Date.now() - lastActivityTime) > 5 * 60 * 1000 && SOCKET_INSTANCE) { 
        SOCKET_INSTANCE.sendPresenceUpdate('available').catch(() => {}); 
    } 
}, 60000);

// =================== START EVERYTHING ===================
startMasterBot().catch(() => { process.exit(1); });
