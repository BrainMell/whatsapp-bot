require("dotenv").config();

/*
 * GLOBAL RAM TRAP - ULTRA AGGRESSIVE
 * Intercepts hardcoded library logs that serialize large Buffer objects.
 */
const maskLogs = (originalFn) => {
    return function(...args) {
        const str = args[0];
        if (typeof str === 'string' && (
            str.includes('Removing old closed session') || 
            str.includes('SessionEntry') || 
            str.includes('Closing open session') ||
            str.includes('Ratchet') ||
            str.includes('Connection Closed') ||
            str.includes('440')
        )) {
            return;
        }
        originalFn.apply(console, args);
    };
};

console.log = maskLogs(console.log);
console.info = maskLogs(console.info);
console.warn = maskLogs(console.warn);
console.debug = maskLogs(console.debug);
console.error = maskLogs(console.error);

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Keep-alive endpoint for Render/UptimeRobot
app.get('/', (req, res) => {
  res.send('Multi-Tenant Bot Manager is Running!');
});

app.listen(port, () => {
  console.log(`📡 Keep-alive server listening on port ${port}`);
});

const fs = require('fs');
const path = require('path');
const { startBot } = require('./core/engine');
const { BotConfig } = require('./botConfig');
const connectDB = require('./db');

async function boot() {
    // Kill Switch Check
    if (process.env.BOT_ACTIVE === 'false') {
        console.log("🛑 Kill Switch Triggered (BOT_ACTIVE=false). Manager shutting down...");
        process.exit(0);
    }

    console.log(" Multi-Tenant Manager Booting...");
    
    // 1. Connect to Shared Database once
    await connectDB();

    // 2. Identify bot instances
    const instancesDir = path.join(__dirname, 'instances');
    if (!fs.existsSync(instancesDir)) {
        console.error("❌ /instances folder not found!");
        process.exit(1);
    }

    const folders = fs.readdirSync(instancesDir).filter(f => {
        return fs.statSync(path.join(instancesDir, f)).isDirectory();
    });

    if (folders.length === 0) {
        console.warn("⚠️ No bot instances found in /instances. Please create a folder with botConfig.json.");
        return;
    }

    // 3. Start each instance
    for (const folder of folders) {
        const instancePath = path.join(instancesDir, folder);
        const configPath = path.join(instancePath, 'botConfig.json');
        
        if (fs.existsSync(configPath)) {
            // Create a dedicated config instance for this bot
            const config = new BotConfig(instancePath);
            console.log(`📡 Spawning bot: ${config.getBotName()} [${config.getBotId()}]`);
            startBot(config);
        } else {
            console.warn(`⚠️ Skipping instance '${folder}': botConfig.json missing.`);
        }
    }
}

if (require.main === module) {
    boot();
}