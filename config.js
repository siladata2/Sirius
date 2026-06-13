// config.js - SIRIUS BOT CONFIGURATION
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import zlib from 'zlib';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  // Bot Info
  BOT_NAME: 'SIRIUS',
  VERSION: '2.0.0',
  
  // Session - IMPORTANT: Set this in Heroku environment variables
  SESSION_ID: process.env.SESSION_ID || '',
  
  // Prefix
  PREFIX: process.env.PREFIX || '.',
  
  // Owner Info (will be auto-set on first run)
  OWNER_NUMBER: process.env.OWNER_NUMBER || '',
  
  // Social Links
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbDF0pZCxoB4rvUmnN1e',
  GROUP_LINK: 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g',
  CHANNEL_JID: '120363426725658598@newsletter',
  
  // Profile Picture
  PROFILE_PIC_URL: 'https://i.ibb.co/BKZGzcbr/Sila-cipher.jpg',
  
  // Server Port (for Heroku)
  PORT: process.env.PORT || 9090,
  
  // Auto Join Settings
  AUTO_JOIN_ENABLED: true,
  AUTO_JOIN_GROUP_LINK: 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g',
  SEND_WELCOME_MESSAGE: true,
  
  // Other Settings
  DEFAULT_PREFIX: '.',
  RATE_LIMIT_ENABLED: true,
  MIN_COMMAND_DELAY: 1000,
  STICKER_DELAY: 2000
};

// Validate and extract session from base64 string (SYNCHRONOUS VERSION)
function validateSession() {
  const sessionsDir = path.join(__dirname, 'sessions');
  
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  
  const credsPath = path.join(sessionsDir, 'creds.json');
  
  // If creds.json already exists, session is valid
  if (fs.existsSync(credsPath)) {
    console.log('✅ Session file found in sessions/creds.json');
    return true;
  }
  
  // Check if SESSION_ID is provided
  if (!config.SESSION_ID || config.SESSION_ID.trim() === '') {
    console.log('❌ ========================================');
    console.log('❋   SESSION_ID MISSING!');
    console.log('❋   Please add SESSION_ID to environment variables');
    console.log('❋   Or in config.js file');
    console.log('❋   Get your session from: https://session.silamd.tech');
    console.log('❌ ========================================');
    return false;
  }
  
  try {
    // Remove prefix if exists (SILA-MD~ or SIRIUS-BOT:)
    let sessdata = config.SESSION_ID;
    if (sessdata.includes('~')) {
      sessdata = sessdata.split('~').pop();
    }
    if (sessdata.startsWith('SIRIUS-BOT:')) {
      sessdata = sessdata.substring(10).trim();
    }
    sessdata = sessdata.trim();
    
    if (!sessdata) {
      console.log('❌ SESSION_ID is empty after processing');
      return false;
    }
    
    console.log('📥 Extracting session from base64 string...');
    
    // Decode base64 to compressed buffer
    const compressedBuffer = Buffer.from(sessdata, 'base64');
    
    // Decompress using zlib (synchronous)
    const sessionBuffer = zlib.gunzipSync(compressedBuffer);
    
    // Write to creds.json
    fs.writeFileSync(credsPath, sessionBuffer);
    
    console.log('✅ Session extracted and saved successfully!');
    console.log(`📊 Session size: ${sessionBuffer.length} bytes`);
    return true;
    
  } catch (err) {
    console.log('❌ Failed to extract session:', err.message);
    console.log('⚠️ Make sure you copied the FULL session string');
    console.log('⚠️ Session should start with "SILA-MD~" or be a valid base64 string');
    return false;
  }
}

export { config, validateSession };
