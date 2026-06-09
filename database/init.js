// database/init.js
import { UserDB } from '../models/User.js';

async function initDatabase() {
    console.log('✅ Database initialized');
    const stats = await UserDB.getStats();
    console.log(`📊 Total users: ${stats.total_users || 0}`);
}

initDatabase();

export default initDatabase;
