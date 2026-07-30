require("dotenv").config();

/*
 * GLOBAL RAM TRAP - ULTRA AGGRESSIVE
 * Intercepts hardcoded library logs that serialize large Buffer objects.
 */
const maskLogs = (originalFn) => {
    return function(...args) {
        const str = args[0];
        // NOTE: Only mask truly noisy library internals that spam the log with large buffers.
        // 'Connection Closed', '440', and similar disconnect signals are LEFT UNMASKED
        // so we can diagnose the "connected but silent" outage pattern.
        if (typeof str === 'string' && (
            str.includes('Removing old closed session') || 
            str.includes('SessionEntry') || 
            str.includes('Closing open session') ||
            str.includes('Ratchet')
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

const fs = require('fs');
const path = require('path');
const { startBot, getBotInstancesHealth } = require('./core/engine');
const { BotConfig } = require('./botConfig');
const connectDB = require('./db');

// Keep-alive endpoint for Render/UptimeRobot - serves a rich dashboard
app.get('/', (req, res) => {
    const uptimeSeconds = process.uptime();
    const uptimeStr = formatUptime(uptimeSeconds);
    const memory = process.memoryUsage();
    const rssMb = (memory.rss / 1024 / 1024).toFixed(1);
    const limitMb = 512;
    const memoryPercent = Math.min((memory.rss / 1024 / 1024 / limitMb) * 100, 100).toFixed(0);

    const healthMap = getBotInstancesHealth ? getBotInstancesHealth() : new Map();
    const instances = [];
    let activeCount = 0;
    let disconnectedCount = 0;
    let qrCount = 0;

    for (const [botId, health] of healthMap.entries()) {
        instances.push({ botId, ...health });
        if (health.status === 'connected') activeCount++;
        else if (health.status === 'disconnected') disconnectedCount++;
        else if (health.status === 'needs_qr') qrCount++;
    }

    let overallStatus = 'Healthy';
    let overallClass = 'healthy';
    if (instances.length > 0) {
        if (disconnectedCount === instances.length) {
            overallStatus = 'Offline';
            overallClass = 'down';
        } else if (disconnectedCount > 0 || qrCount > 0) {
            overallStatus = 'Degraded';
            overallClass = 'degraded';
        }
    } else {
        overallStatus = 'Idle';
        overallClass = 'degraded';
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Joker Bot Manager Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', sans-serif;
            background: radial-gradient(circle at top right, #1a1c29, #0f1016);
            color: #f3f4f6;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            width: 100%;
            max-width: 850px;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            padding: 35px;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            padding-bottom: 20px;
        }
        .header-title h1 {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #a78bfa, #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header-title p {
            font-size: 13px;
            color: #9ca3af;
            margin-top: 4px;
        }
        .status-pill {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 50px;
            font-weight: 600;
            font-size: 13px;
        }
        .status-pill.healthy {
            background: rgba(52, 211, 153, 0.1);
            border: 1px solid rgba(52, 211, 153, 0.2);
            color: #34d399;
        }
        .status-pill.degraded {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.2);
            color: #fbbf24;
        }
        .status-pill.down {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: #f87171;
        }
        .pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: currentColor;
            box-shadow: 0 0 8px currentColor;
            animation: pulse 1.8s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.015);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 18px;
            padding: 20px;
        }
        .stat-label {
            font-size: 12px;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin-bottom: 6px;
        }
        .stat-value {
            font-size: 22px;
            font-weight: 600;
            color: #f3f4f6;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            margin-top: 12px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            border-radius: 10px;
            background: linear-gradient(90deg, #6366f1, #818cf8);
        }
        .progress-fill.warn {
            background: linear-gradient(90deg, #f59e0b, #fbbf24);
        }
        .progress-fill.danger {
            background: linear-gradient(90deg, #ef4444, #f87171);
        }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #d1d5db;
            letter-spacing: 0.5px;
        }
        .bot-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .bot-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255, 255, 255, 0.015);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 16px;
            padding: 16px 20px;
            transition: all 0.25s ease;
        }
        .bot-item:hover {
            border-color: rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.03);
            transform: translateY(-1px);
        }
        .bot-info {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .bot-name {
            font-weight: 600;
            font-size: 16px;
            color: #f3f4f6;
        }
        .bot-id {
            font-size: 11px;
            color: #6b7280;
            font-family: monospace;
        }
        .bot-status-container {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .bot-status {
            font-size: 12px;
            font-weight: 600;
            padding: 6px 12px;
            border-radius: 50px;
            text-transform: capitalize;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .bot-status.connected { background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.25); color: #34d399; }
        .bot-status.connecting { background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.25); color: #fbbf24; }
        .bot-status.needs_qr { background: rgba(167, 139, 250, 0.15); border: 1px solid rgba(167, 139, 250, 0.25); color: #a78bfa; }
        .bot-status.logged_out { background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.25); color: #f43f5e; }
        .bot-status.disconnected { background: rgba(248, 113, 113, 0.15); border: 1px solid rgba(248, 113, 113, 0.25); color: #f87171; }
        
        .bot-meta {
            font-size: 11px;
            color: #9ca3af;
            text-align: right;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 120px;
        }
        .bot-meta span {
            color: #ef4444;
            font-size: 10px;
        }
        .no-bots {
            text-align: center;
            padding: 30px;
            color: #6b7280;
            font-size: 14px;
            background: rgba(255, 255, 255, 0.01);
            border: 1px dashed rgba(255, 255, 255, 0.05);
            border-radius: 16px;
        }
        .footer {
            margin-top: 35px;
            font-size: 11px;
            color: #4b5563;
            text-align: center;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .footer-guardian {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #818cf8;
        }
        .guardian-active-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: #818cf8;
            animation: pulse 1s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-title">
                <h1>Joker Bot Manager</h1>
                <p>Render Free Tier Optimization Console</p>
            </div>
            <div class="status-pill ${overallClass}">
                <div class="pulse-dot"></div>
                ${overallStatus}
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">RAM Usage</div>
                <div class="stat-value">${rssMb} MB / ${limitMb} MB</div>
                <div class="progress-bar">
                    <div class="progress-fill ${memoryPercent > 80 ? 'danger' : memoryPercent > 65 ? 'warn' : ''}" style="width: ${memoryPercent}%"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Uptime</div>
                <div class="stat-value">${uptimeStr}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Bots</div>
                <div class="stat-value">${activeCount} / ${instances.length} Online</div>
            </div>
        </div>

        <div class="section-title">Spawned Tenant Instances</div>
        <div class="bot-list">
            ${instances.length === 0 ? '<div class="no-bots">No bot instances have registered yet. Spawning in progress...</div>' : ''}
            ${instances.map(bot => {
                const dateStr = new Date(bot.lastUpdated).toLocaleTimeString();
                const statusClass = bot.status;
                const errText = bot.error ? `<span>${bot.error}</span>` : '';
                return `
                <div class="bot-item">
                    <div class="bot-info">
                        <div class="bot-name">${bot.name}</div>
                        <div class="bot-id">ID: ${bot.botId}</div>
                    </div>
                    <div class="bot-status-container">
                        <div class="bot-meta">
                            Last State Sync: &nbsp;${dateStr}
                            ${errText}
                        </div>
                        <div class="bot-status ${statusClass}">
                            <div class="pulse-dot" style="animation-duration: 2.5s"></div>
                            ${bot.status.replace('_', ' ')}
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="footer">
            <div>&copy; 2026 Joker Multi-Tenant Manager</div>
            <div class="footer-guardian">
                <div class="guardian-active-dot"></div>
                Render Guardian Active (Self-Healing Enabled)
            </div>
        </div>
    </div>
</body>
</html>
    `;
    res.send(html);
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);

    const dDisplay = d > 0 ? d + "d " : "";
    const hDisplay = h > 0 ? h + "h " : "";
    const mDisplay = m > 0 ? m + "m " : "";
    const sDisplay = s + "s";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

app.listen(port, '0.0.0.0', () => {
  console.log(`📡 Keep-alive server listening on port ${port}`);
});

// ============================================================
// 💓 EVENT LOOP HEARTBEAT
// Prints every 30s. If this stops printing during a freeze,
// the Node.js event loop itself is blocked (not a socket issue).
// If this keeps printing but messages stop → zombie socket.
// ============================================================
setInterval(() => {
    const mem = process.memoryUsage();
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    console.log(`💓 [Heartbeat] ALIVE | uptime=${Math.floor(process.uptime())}s | rss=${rssMb}MB | heap=${heapMb}MB`);
}, 30000);

// ============================================================
// 🧟 ZOMBIE SOCKET DETECTOR
// Tracks the last time messages.upsert fired across all bots.
// If the bot is 'connected' but silent for 4+ minutes in an
// active chat window, this triggers a process.exit so Render
// restarts cleanly instead of staying in zombie state.
// ============================================================
// Engine calls this whenever a real (non-stale) message is processed
function recordUpsert(botId) {
    // No-op: Zombie socket detector disabled to prevent false-positive reboots during quiet hours.
}

module.exports = module.exports || {};
module.exports.recordUpsert = recordUpsert;

// Self-healing connection guardian (specifically for Render Free Tier stability)
const BOOT_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes grace period on startup
const DISCONNECT_TIMEOUT = 5 * 60 * 1000; // 5 minutes maximum disconnected state allowed
const spawnTime = Date.now();
const disconnectedTimestamps = new Map(); // botId -> timestamp

setInterval(() => {
    const uptime = Date.now() - spawnTime;
    if (uptime < BOOT_GRACE_PERIOD) return; // Wait until grace period passes

    const healthMap = getBotInstancesHealth ? getBotInstancesHealth() : new Map();
    let needsReboot = false;
    let stuckBotName = '';

    for (const [botId, health] of healthMap.entries()) {
        const isLoggedOut = health.status === 'logged_out' || 
                            (health.error && (health.error.includes('401') || health.error.toLowerCase().includes('logged out')));
        if (health.status === 'disconnected' && !isLoggedOut) {
            if (!disconnectedTimestamps.has(botId)) {
                disconnectedTimestamps.set(botId, Date.now());
            } else {
                const disconnectedDuration = Date.now() - disconnectedTimestamps.get(botId);
                if (disconnectedDuration > DISCONNECT_TIMEOUT) {
                    needsReboot = true;
                    stuckBotName = health.name;
                    break;
                }
            }
        } else {
            disconnectedTimestamps.delete(botId);
        }
    }

    if (needsReboot) {
        console.error(`🚨 [Guardian] Bot instance '${stuckBotName}' is unresponsive. Triggering container restart...`);
        process.exit(1);
    }
}, 30000);

async function boot() {
    // Kill Switch Check
    if (process.env.BOT_ACTIVE === 'false') {
        console.log("🛑 Kill Switch Triggered (BOT_ACTIVE=false). Manager shutting down...");
        process.exit(0);
    }

    // 💡 SANDBOX AUTO-SAVE: save all active sandboxes on process exit
    // so data isn't lost when the bot restarts.
    async function gracefulShutdown() {
        try {
            const engine = require('./core/engine');
            if (typeof engine.saveAllSandboxes === 'function') {
                await engine.saveAllSandboxes();
            }
        } catch (e) {
            console.error('🧪 [Sandbox] Graceful shutdown save failed:', e.message);
        }
        process.exit(0);
    }
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    console.log(" Multi-Tenant Manager Booting...");
    
    // 1. Connect to Shared Database once
    await connectDB();

    // 2. Identify bot instances
    const instancesDir = path.join(__dirname, 'instances');
    if (!fs.existsSync(instancesDir)) {
        console.error("❌ /instances folder not found!");
        process.exit(1);
    }

    let folders = fs.readdirSync(instancesDir).filter(f => {
        return fs.statSync(path.join(instancesDir, f)).isDirectory();
    });

    const selectedInstances = (process.env.BOT_INSTANCES || process.env.BOT_INSTANCE || '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);

    if (selectedInstances.length > 0) {
        const selected = new Set(selectedInstances);
        folders = folders.filter(folder => selected.has(folder));
        console.log(`🎯 Instance filter active: ${selectedInstances.join(', ')}`);
    }

    if (folders.length === 0) {
        console.warn("⚠️ No bot instances found in /instances. Please create a folder with botConfig.json.");
        return;
    }

    // 3. Schedule weekly wealth tax (Phase 1 — Economy Rebalance)
    try {
      const economy = require('./core/rpg/economy');
      if (typeof economy.scheduleWealthTax === 'function') {
        economy.scheduleWealthTax();
        console.log("💸 Wealth tax scheduler initialized.");
      }
    } catch (e) {
      console.error("Failed to init wealth tax scheduler:", e.message);
    }

    // 3b. Schedule daily guild bank interest + loan processing (Phase 2 — Guild Polish)
    try {
      const guildPerks = require('./core/rpg/guildPerks');
      if (typeof guildPerks.runDailyInterest === 'function') {
        // Run every 24 hours
        const ONE_DAY = 24 * 60 * 60 * 1000;
        // First run in 1 hour (so it doesn't fire immediately on boot), then daily
        setTimeout(() => {
          guildPerks.runDailyInterest().catch(e => console.error('[GuildInterest] Run failed:', e.message));
          // 💡 Phase 2: also process overdue loans daily
          if (typeof guildPerks.runDailyLoanProcessing === 'function') {
            guildPerks.runDailyLoanProcessing().catch(e => console.error('[GuildLoans] Run failed:', e.message));
          }
          setInterval(() => {
            guildPerks.runDailyInterest().catch(e => console.error('[GuildInterest] Run failed:', e.message));
            if (typeof guildPerks.runDailyLoanProcessing === 'function') {
              guildPerks.runDailyLoanProcessing().catch(e => console.error('[GuildLoans] Run failed:', e.message));
            }
          }, ONE_DAY);
        }, 60 * 60 * 1000);
        console.log("🏛️ Guild bank interest + loan scheduler initialized (runs every 24h).");
      }
    } catch (e) {
      console.error("Failed to init guild interest scheduler:", e.message);
    }

    // 3c. Schedule weekly raid spawn + voting round resolver (Phase 5 — Avatar Raid)
    try {
      const raidSystem = require('./core/rpg/raidSystem');
      // Spawn raid boss if it doesn't exist for this week (runs on boot + every hour)
      const checkAndSpawnRaid = async () => {
        try {
          const existing = await raidSystem.getRaidStatus();
          if (!existing) {
            // Estimate active player count from economy
            const economy = require('./core/rpg/economy');
            const econInfo = economy.getGlobalEconomyStats ? economy.getGlobalEconomyStats() : { totalUsers: 50 };
            const activeCount = econInfo.totalUsers || 50;
            const result = await raidSystem.spawnWeeklyRaid(activeCount);
            if (result.success) {
              console.log(`[RaidSystem] Spawned weekly raid: ${result.raid.bossName}`);
            }
          }
        } catch (e) {
          console.error('[RaidSystem] Spawn check failed:', e.message);
        }
      };
      // Check on boot (delayed 2 min so DB is ready), then every hour
      setTimeout(checkAndSpawnRaid, 2 * 60 * 1000);
      setInterval(checkAndSpawnRaid, 60 * 60 * 1000);

      // Voting round resolver — runs every 30s to check if voting window closed
      const resolveRaidRound = async () => {
        try {
          await raidSystem.resolveVotingRound();
        } catch (e) {
          // Silent — raid may not exist yet
        }
      };
      setInterval(resolveRaidRound, 30 * 1000);

      console.log("⚔️ Raid scheduler initialized (spawn check every 1h, voting resolver every 30s).");
    } catch (e) {
      console.error("Failed to init raid scheduler:", e.message);
    }

    // 3d. Schedule daily bounty expiry (Phase 6 — Bounty System)
    try {
      const bountySystem = require('./core/rpg/bountySystem');
      const ONE_DAY = 24 * 60 * 60 * 1000;
      // First run in 30 min, then daily
      setTimeout(() => {
        bountySystem.expireOldBounties().catch(e => console.error('[Bounty] Expire failed:', e.message));
        setInterval(() => {
          bountySystem.expireOldBounties().catch(e => console.error('[Bounty] Expire failed:', e.message));
        }, ONE_DAY);
      }, 30 * 60 * 1000);
      console.log("💰 Bounty expiry scheduler initialized (runs every 24h).");
    } catch (e) {
      console.error("Failed to init bounty scheduler:", e.message);
    }

    // 3e. Schedule weekly guild war spawn + resolve (Phase 7 — Multi-Event Guild Wars)
    try {
      const guildWars = require('./core/rpg/guildWars');
      // Check on boot (delayed 3 min so DB is ready), then every 1h
      // — spawns new war if missing for current week, resolves if expired
      const checkAndSpawnWar = async () => {
        try {
          const existing = await guildWars.getWarStatus();
          if (!existing) {
            const result = await guildWars.spawnWeeklyWar();
            if (result.success) {
              console.log(`[GuildWars] Spawned weekly war: ${result.war.eventName}`);
            }
          } else if (existing.status === 'active' && new Date() > new Date(existing.endsAt)) {
            // War has expired — resolve it
            const result = await guildWars.resolveWeeklyWar();
            if (result.action === 'resolved') {
              console.log(`[GuildWars] Resolved expired war: ${result.war.eventName}`);
              // Spawn next week's war
              await guildWars.spawnWeeklyWar();
            }
          }
        } catch (e) {
          console.error('[GuildWars] Check failed:', e.message);
        }
      };
      setTimeout(checkAndSpawnWar, 3 * 60 * 1000);
      setInterval(checkAndSpawnWar, 60 * 60 * 1000);
      console.log("⚔️ Guild war scheduler initialized (spawn check every 1h).");
    } catch (e) {
      console.error("Failed to init guild war scheduler:", e.message);
    }

    // 4. Start each instance with a stagger delay
    for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];
        const instancePath = path.join(instancesDir, folder);
        const configPath = path.join(instancePath, 'botConfig.json');
        
        if (fs.existsSync(configPath)) {
            // Create a dedicated config instance for this bot
            const config = new BotConfig(instancePath);
            if (!config.isEnabled()) {
                console.log(`🔇 Skipping disabled bot: ${config.getBotName()} [${config.getBotId()}]`);
                continue;
            }
            console.log(`📡 Spawning bot: ${config.getBotName()} [${config.getBotId()}]`);
            startBot(config);

            // Add a stagger delay between bot startups (except the last one)
            if (i < folders.length - 1) {
                console.log(`⏳ Waiting 15s before spawning next bot to prevent conflicts...`);
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        } else {
            console.warn(`⚠️ Skipping instance '${folder}': botConfig.json missing.`);
        }
    }
}

if (require.main === module) {
    boot();

    // 💡 SPRITE WARM-UP: fetch all missing Digimon sprites in the background
    // 30s after boot. This ensures the codex/roster/profile card renderers
    // have sprites cached before any user views them. Non-blocking, non-fatal.
    setTimeout(() => {
        try {
            const summonSprites = require('./core/rpg/summonSprites');
            const registry = require('./core/rpg/summonRegistry');
            summonSprites.warmupCache(registry);
        } catch (e) {
            console.error('[SpriteWarmup] Failed to start (non-fatal):', e.message);
        }
    }, 30000);
}
