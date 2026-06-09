// models/User.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../database/sirius.db');

if (!fs.existsSync(path.join(__dirname, '../database'))) {
    fs.mkdirSync(path.join(__dirname, '../database'), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

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
            welcome_message TEXT,
            goodbye_message TEXT,
            anti_link INTEGER DEFAULT 0,
            anti_spam INTEGER DEFAULT 0,
            anti_badword INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `);

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

    // Create admin user
    const adminPin = 'sila0022';
    const hashedPin = bcrypt.hashSync(adminPin, 10);
    
    db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (!row) {
            db.run(`
                INSERT INTO users (phone_number, username, password, is_admin, is_active)
                VALUES ('admin', 'admin', ?, 1, 1)
            `, [hashedPin], function(err) {
                if (!err && this.lastID) {
                    db.run(`INSERT INTO bot_configs (user_id) VALUES (?)`, [this.lastID]);
                }
            });
        }
    });
});

export const UserDB = {
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

    findById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
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

    updateUser: (id, data) => {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            Object.keys(data).forEach(key => {
                if (key !== 'id') {
                    fields.push(`${key} = ?`);
                    if (key === 'password') {
                        values.push(bcrypt.hashSync(data[key], 10));
                    } else {
                        values.push(data[key]);
                    }
                }
            });
            values.push(id);
            db.run(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, values, (err) => {
                if (err) reject(err);
                else resolve(true);
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
            db.all('SELECT id, phone_number, username, email, is_admin, is_active, is_paired, paired_at, last_login, created_at FROM users ORDER BY id DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    deleteUser: (userId) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
                if (err) reject(err);
                else resolve(true);
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
    },

    getActivityLogs: (userId = null, limit = 100) => {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT l.*, u.username, u.phone_number 
                FROM activity_logs l
                LEFT JOIN users u ON l.user_id = u.id
            `;
            let params = [];
            if (userId) {
                query += ' WHERE l.user_id = ?';
                params.push(userId);
            }
            query += ' ORDER BY l.id DESC LIMIT ?';
            params.push(limit);
            
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getStats: () => {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN is_paired = 1 THEN 1 ELSE 0 END) as paired_users,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
                    SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) as admin_users
                FROM users
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
};

export default db;
