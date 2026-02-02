const fs = require('fs');
const path = require('path');

// Adjust path depending on where this script is run from.
// Assuming this is in 'core/', we step back one level to find 'instances/'
const instancesDir = path.join(__dirname, '../instances');

async function cleanupSessions() {
    console.log("🧹 Starting Multi-Instance Session Cleanup...");

    if (!fs.existsSync(instancesDir)) {
        console.error(`❌ Instances directory not found at: ${instancesDir}`);
        return;
    }

    // Get all instance folders (joker, subaru, etc.)
    const instances = fs.readdirSync(instancesDir).filter(f => 
        fs.statSync(path.join(instancesDir, f)).isDirectory()
    );

    if (instances.length === 0) {
        console.log("⚠️ No instances found.");
        return;
    }

    console.log(`found ${instances.length} instances.`);

    for (const instance of instances) {
        const authPath = path.join(instancesDir, instance, 'auth');

        if (fs.existsSync(authPath)) {
            console.log(`
🔍 Processing: [${instance}]`);
            const files = fs.readdirSync(authPath);
            let deletedCount = 0;

            for (const file of files) {
                // THE GOLDEN RULE: Skip creds.json
                if (file !== 'creds.json') {
                    const fullPath = path.join(authPath, file);
                    try {
                        // Recursive true allows deleting directories if Baileys creates subfolders
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        deletedCount++;
                    } catch (e) {
                        console.error(`   ❌ Failed to delete ${file}: ${e.message}`);
                    }
                }
            }

            if (deletedCount > 0) {
                console.log(`   ✅ Cleaned ${deletedCount} session files.`);
            } else {
                console.log(`   ✨ Already clean.`);
            }
        } else {
            console.log(`   ⚠️ No auth folder found for [${instance}]`);
        }
    }

    console.log("\n✅ Session cleanup complete. All 'creds.json' files preserved.");
}

// Execute
cleanupSessions();