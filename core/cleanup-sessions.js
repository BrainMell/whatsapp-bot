// cleanup-sessions.js
// Run this to clean up old WhatsApp sessions and speed up boot time

const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================
// Set this to true ONLY when you want to run the cleanup
const ENABLE_CLEANUP = true; 
const AUTH_DIR = './auth';

// ==========================================
// EXECUTION LOGIC
// ==========================================

if (!ENABLE_CLEANUP) {
    console.log('⚠️  Cleanup is currently DISABLED.');
    console.log('💡 To run the cleanup, edit this file and set ENABLE_CLEANUP = true;');
    process.exit(0);
}

console.log('🧹 Starting session cleanup...');

try {
    // Check if directory exists
    if (!fs.existsSync(AUTH_DIR)) {
        console.error(`❌ Error: Directory "${AUTH_DIR}" not found.`);
        process.exit(1);
    }

    // Get all files in auth directory
    const files = fs.readdirSync(AUTH_DIR);
    
    let deletedCount = 0;
    let keptFiles = [];
    
    files.forEach(file => {
        const filePath = path.join(AUTH_DIR, file);
        
        // KEEP creds.json - this is your login!
        if (file === 'creds.json') {
            keptFiles.push(file);
            console.log(`✅ Keeping: ${file}`);
            return;
        }
        
        // DELETE session files, pre-keys, etc.
        // These are often the cause of "MessageCounterError"
        const shouldDelete = file.startsWith('session-') || 
                           file.startsWith('pre-key-') || 
                           file.startsWith('sender-key-') || 
                           file.startsWith('app-state-') ||
                           file.startsWith('lid-mapping-') ||
                           file.startsWith('device-list-');

        if (shouldDelete) {
            try {
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    console.log(`🗑️  Deleted: ${file}`);
                }
            } catch (err) {
                console.log(`❌ Failed to delete ${file}:`, err.message);
            }
        } else {
            keptFiles.push(file);
        }
    });
    
    console.log('\n✅ Cleanup complete!');
    console.log(`📊 Kept ${keptFiles.length} file(s): ${keptFiles.join(', ')}`);
    console.log(`🗑️  Deleted ${deletedCount} session file(s)`);
    console.log('\n🚀 Restart the bot - it should boot MUCH faster!');
    
} catch (err) {
    console.error('❌ Error during cleanup:', err.message);
    process.exit(1);
}
