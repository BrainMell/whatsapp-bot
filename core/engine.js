require("dotenv").config();
const botConfig = require('../botConfig');
const { storage } = botConfig;
const makeWASocket = require("@whiskeysockets/baileys").default;
const { 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason, 
  downloadMediaMessage, 
  downloadContentFromMessage,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { searchVSB, scrapeVSBPage, extractStatsWithGroq, formatPowerScale } = require("./powerscale");
const classSystem = require('./classSystem');
const guilds = require('./guilds');
const guildAdventure = require('./guildAdventure');
const skillTree = require('./skillTree');
const bossMechanics = require('./bossMechanics');
const qrcode = require("qrcode-terminal");
const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const execPromise = promisify(exec);
const axios = require("axios");
const cheerio = require("cheerio");
const play = require('play-dl');
const yts = require('yt-search');
const ytdl = require("@distube/ytdl-core");
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { parseHTML } = require('linkedom');

// Helper for dynamic ESM import of got-scraping
async function getGot() {
    const { gotScraping } = await import('got-scraping');
    return gotScraping;
}

const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || "ffmpeg");
const { getAnikaiBestMatch } = require('./anikaiResolver');
const runSecurity = require('./security');
const tictactoe = require('./tictactoe');
const debate = require('./debate');
const ludo = require('./ludo');
const wordle = require('./wordle');
const economy = require('./economy');
const system = require('./system'); // NEW: MongoDB System Module
const ChatMessage = require('./models/ChatMessage');
const ErrorLog = require('./models/ErrorLog');
const Metric = require('./models/Metric');
const news = require('./news'); // ✅ Added news module
const loans = require('./loans'); // ✅ Added loans module
const stockMarket = require('./stockMarket'); // ✅ Added stock market module
const P = require('pino');
const gambling = require('./gambling');
const progression = require('./progression');
const rpgCommands = require('./rpgCommands');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const progressionCommands = require('./progressionCommands');
const shopCommands = require('./shopCommands');
const skillCommands = require('./skillCommands');
const classCommands = require('./classCommands');
const pvpSystem = require('./pvpSystem');
const contextEngine = require('./src/context_engine/Engine'); // NEW: Brain system
const NodeCache = require("node-cache");

async function startBot(configInstance) {
    let sock;
    let qrShown = false;
    let retryCount = 0;
    let reconnectTimer;
    let botStarting = false;
    let isNewLogin = false;
    let isRekeying = false;
    let botStartTime;
    const msgRetryCounterCache = new NodeCache({ stdTTL: 300 }); // 5 min TTL
    const groupMetadataCache = new NodeCache({ stdTTL: 300 });
    const commandCooldowns = new Map();

    // RAM Metric Collection (Every 5 mins)
    setInterval(async () => {
      try {
        const usage = process.memoryUsage().rss / 1024 / 1024;
        Metric.create({
          botId: botConfig.getBotId(),
          ramUsage: usage,
          timestamp: new Date()
        }).catch(() => {});
      } catch (err) {}
    }, 300000);

  // Wrap everything in AsyncLocalStorage to provide context to core files
  await storage.run(configInstance, async () => {
    // Get dynamic values
    const BOT_ID = botConfig.getBotId();
    const PREFIX = botConfig.getPrefix();
    const BOT_NAME = botConfig.getBotName();
    const CURRENCY = botConfig.getCurrency();
    const ZENI = CURRENCY.symbol;
    let BOT_MARKER = `*${botConfig.getBotName()}*\n\n`;   // BOT MArker for messages

    // ============================================
    // GROUP CHAT SUMMARY SYSTEM
    // ============================================

    // Store group messages in memory (per group)
    const groupMessageHistory = new Map();
    const MAX_HISTORY_PER_GROUP = 200;

    // Track messages for summarization
    function trackGroupMessage(chatId, sender, senderName, text, timestamp) {
        const settings = getGroupSettings(chatId);
        
        // ✅ ONLY record if the toggle is ON for this specific group
        if (!settings.recording) return;

        // 1. IGNORE BOT COMMANDS (so it doesn't summarize itself)
        if (text.toLowerCase().startsWith(`${PREFIX.toLowerCase()}`)) return;

        const messageObj = { sender, senderName, text, timestamp };

        // 2. Track in RAM
        if (!groupMessageHistory.has(chatId)) groupMessageHistory.set(chatId, []);
        const history = groupMessageHistory.get(chatId);
        history.push(messageObj);
        if (history.length > MAX_HISTORY_PER_GROUP) history.shift();

        // 3. Track in JSON (Isolated by chatId)
        saveGroupMessage(chatId, messageObj);
    }

    // Get message history for summary
    function getGroupMessageHistory(chatId, limit = 50) {
        const history = groupMessageHistory.get(chatId) || [];
        return history.slice(-limit); // Get last N messages
    }

    // Create AI-powered summary with user mentions
    async function createGroupSummary(messages) {
        try {
            let chatContext = "";
            const nameToJid = new Map();

            // Build context using only actual names from THIS chat
            messages.forEach((msg) => {
                // Clean the name so the AI doesn’t get confused
                const cleanName = msg.senderName.replace(/[^a-zA-Z0-9]/g, '');
                nameToJid.set(cleanName, msg.sender);
                chatContext += `${cleanName}: ${msg.text}\n`;
            });

            const participants = Array.from(nameToJid.keys()).join(", ");

            const res = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content:
                            "You summarize chats. Stick to facts, keep it short, and use @Name when mentioning people. No roleplay, no extra fluff."
                    },
                    {
                        role: "user",
                        content: 
    `Participants: ${participants}

Chat:
${chatContext}

What to do:
1. Summarize the main points.
2. Call out key people using @Name.
3. Keep it direct.`
                    }
                ],
                model: "llama-3.1-8b-instant",
            });

            let summaryText = res.choices[0].message.content;
            const mentionedJids = [];

            // Swap @Name with real WhatsApp-style @numbers
            for (const [name, jid] of nameToJid.entries()) {
                const tag = `@${name}`;
                if (summaryText.includes(tag)) {
                    const phone = jid.split('@')[0];
                    summaryText = summaryText.split(tag).join(`@${phone}`);
                    mentionedJids.push(jid);
                }
            }

            return { text: summaryText, mentions: mentionedJids };
        } catch (err) {
            return { text: "Summary failed.", mentions: [] };
        }
    }

    // --- Global Constants for Recording ---
    const RESET_INTERVAL = 4 * 60 * 60 * 1000; // 4 Hours in milliseconds

    // Periodic wipe: All group message logs cleared from MongoDB
    setInterval(() => {
        system.set(BOT_ID + '_group_message_info', {});
        groupMessageHistory.clear(); 
        console.log(`🧹 [${BOT_ID}] Periodic wipe: All group message logs cleared from MongoDB.`);
    }, RESET_INTERVAL);

    // Load data from MongoDB
    function loadGroupInfo() {
        return system.get(BOT_ID + '_group_message_info', {});
    }

    // Save specific group data without affecting others
    function saveGroupMessage(chatId, messageObj) {
        const allData = loadGroupInfo();
        if (!allData[chatId]) allData[chatId] = [];
        
        allData[chatId].push(messageObj);
        
        // Keep only last 100 messages per group to save space
        if (allData[chatId].length > 100) allData[chatId].shift();
        
        system.set(BOT_ID + '_group_message_info', allData);
    }

    // ============================================
    // 📨 SAFE SEND QUEUE
    // - Serializes all outgoing messages
    // - Avoids "Connection Closed" cascades during reconnects
    // - Adds a small gap between sends to reduce WS churn/rate limits
    // ============================================
    // Baileys exposes `sock.ws` as a WebSocketClient (with `.isOpen`), not the raw `ws` instance.
    // Keep WS_OPEN for fallback checks in case the internal shape changes.
    const WS_OPEN = 1;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const isConnError = (err) => {
      const msg = err?.message ? String(err.message) : '';
      const statusCode = err?.output?.statusCode || err?.statusCode;
      return (
        msg.includes('Connection Closed') ||
        msg.includes('Socket') ||
        msg.includes('WebSocket') ||
        statusCode === 408 ||
        statusCode === 428
      );
    };

    const sendQueue = (() => {
      const queue = [];
      let processing = false;

      // Updated on every (re)connect
      let boundSock = null;
      let rawSend = null;

      const MAX_QUEUE = 150;
      const MSG_TTL_MS = 5 * 60 * 1000; // 5 minutes
      const MAX_RETRIES = 3;
      const SEND_GAP_MS = 350;

      const isWsOpen = () => {
        const ws = boundSock?.ws;
        if (!ws) return false;
        if (typeof ws.isOpen === 'boolean') return ws.isOpen;
        // Fallbacks: support older/alternate shapes.
        const rs = ws.readyState ?? ws.socket?.readyState;
        return rs === WS_OPEN;
      };

      const canSendNow = () => {
        return Boolean(boundSock && rawSend && isWsOpen());
      };

      const bind = (newSock) => {
        boundSock = newSock;
        // Capture the raw Baileys sender BEFORE we override sock.sendMessage.
        rawSend = newSock.sendMessage.bind(newSock);
      };

      const kick = () => {
        if (processing) return;
        processing = true;
        processQueue().finally(() => {
          processing = false;
        });
      };

      const enqueue = (jid, content, options = {}) => {
        return new Promise((resolve, reject) => {
          if (queue.length >= MAX_QUEUE) {
            const dropped = queue.shift();
            dropped?.reject?.(new Error('Send queue overflow (dropped oldest message)'));
          }

          queue.push({
            jid,
            content,
            options,
            ts: Date.now(),
            retries: 0,
            resolve,
            reject,
          });

          kick();
        });
      };

      const processQueue = async () => {
        while (queue.length > 0) {
          // Don't spin when disconnected
          if (!canSendNow()) return;

          const item = queue[0];

          // Drop expired messages
          if (Date.now() - item.ts > MSG_TTL_MS) {
            queue.shift();
            item.reject(new Error('Send queue TTL expired'));
            continue;
          }

          try {
            const res = await rawSend(item.jid, item.content, item.options);
            queue.shift();
            item.resolve(res);
            await sleep(SEND_GAP_MS);
          } catch (err) {
            item.retries += 1;

            // Connection issues: pause and wait for reconnect; keep message at front
            if (isConnError(err)) {
              await sleep(Math.min(1000 * Math.pow(2, item.retries - 1), 5000));
              return;
            }

            // Non-connection error: retry a little then drop
            if (item.retries < MAX_RETRIES) {
              await sleep(Math.min(500 * item.retries, 1500));
              continue;
            }

            queue.shift();
            item.reject(err);
          }
        }
      };

      const size = () => queue.length;

      const clear = (reason = 'Send queue cleared') => {
        while (queue.length) {
          const item = queue.shift();
          item.reject(new Error(reason));
        }
      };

      return { bind, send: enqueue, kick, size, clear };
    })();

    // 1. Kick off the connection
    initSocket().catch(e => console.error(`[${configInstance.getBotId()}] Initial boot failed:`, e.message));
process.env.NODE_ENV = 'production';

// Global error handlers to prevent process crash
process.on('uncaughtException', async (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  try {
    ErrorLog.create({
      errorType: 'uncaught_exception',
      message: err.message,
      stack: err.stack,
      timestamp: new Date()
    }).catch(() => {});
  } catch (e) {}
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    ErrorLog.create({
      errorType: 'unhandled_rejection',
      message: reason?.message || String(reason),
      stack: reason?.stack || null,
      metadata: { promise: String(promise) },
      timestamp: new Date()
    }).catch(() => {});
  } catch (e) {}
});

// --- DYNAMIC TITLE LOGIC ---
function getDynamicTitle(userId) {
  const user = economy.getUser(userId);
  if (!user) return "";

  const stats = user.stats || {};
  const profile = user.profile || {};
  
  const wealth = (user.wallet || 0) + (user.bank || 0);
  const msgCount = profile.stats?.messageCount || 0;
  
  // 1. WEALTH TITLES
  if (wealth > 1000000) return "💎 The Millionaire";
  if (wealth > 500000) return "💰 The Wealthy";
  if (wealth > 100000) return "💵 The Affluent";
  if (wealth < 100) return "🪹 The Penniless";

  // 2. COMBAT TITLES (Infected Focus)
  if (stats.bossesDefeated > 10) return "👑 The Hive-Slayer";
  if (stats.monstersKilled > 200) return "☣️ The Exterminator";
  if (stats.monstersKilled > 100) return "⚔️ The Veteran";
  if (stats.monstersKilled > 50) return "🗡️ The Hunter";
  if (stats.monstersKilled > 10) return "🔰 The Rookie";

  // 3. GAMBLING TITLES
  if (stats.totalGambled > 1000000) return "🎰 The High Roller";
  if (stats.totalGambled > 500000) return "🎲 The Risk-Taker";
  if (stats.totalGambled > 100000) return "🃏 The Gambler";
  if (stats.biggestWin > 50000) return "🏆 The Lucky Shot";
  if (stats.gamesLost > stats.gamesWon * 2) return "📉 The Unlucky";

  // 4. ACTIVITY & SOCIAL
  if (msgCount > 5000) return "🗣️ The Legend";
  if (msgCount > 1000) return "💬 The Talkative";
  if (msgCount > 500) return "👥 The Regular";
  if (msgCount < 10 && msgCount > 0) return "👻 The Lurker";

  // 5. RPG STAT TITLES
  if (stats.luck > 80) return "🌟 God's Favorite";
  if (stats.luck > 50) return "🍀 The Lucky";
  if (stats.atk > 100) return "🔥 The Juggernaut";
  if (stats.def > 100) return "🛡️ The Wall";
  if (stats.spd > 100) return "⚡ The Blur";
  if (stats.mag > 100) return "🔮 The Archmage";

  // 6. QUEST & HARDCORE
  const graveyard = system.get('graveyard', []);
  const name = profile.nickname || userId.split('@')[0];
  const deathCount = graveyard.filter(h => h.name === name).length;
  
  if (deathCount > 5) return "🦴 The Immortal (Noob)";
  if (deathCount > 2) return "💀 The Undying";
  if (stats.treasuresFound > 20) return "🎁 The Treasure Seeker";
  if (stats.trapsTriggered > 15) return "🪤 The Clumsy";

  // 7. SCAVENGING
  if (stats.fishCaught > 50) return "🎣 The Angler";
  if (stats.animalsHunted > 50) return "🏹 The Tracker";

  return "";
}

// --- GRAVEYARD LOGIC ---
function addToGraveyard(userId, level, className, cause) {
  const graveyard = system.get('graveyard', []);
  const name = getUserProfile(userId)?.nickname || userId.split('@')[0];
  
  graveyard.push({
    name,
    level,
    class: className,
    cause,
    date: Date.now()
  });
  
  // Keep only last 50
  if (graveyard.length > 50) graveyard.shift();
  
  system.set('graveyard', graveyard);
}

async function showGraveyard(sock, chatId, m) {
  const graveyard = system.get('graveyard', []);
  
  let msg = GET_BANNER(`💀 GRAVEYARD`) + `\n\n`;
  msg += `*Memory of the Fallen (Hardcore)*\n\n`;
  
  if (graveyard.length === 0) {
    msg += `No heroes have fallen... yet.`;
  } else {
    // Show last 10
    const list = [...graveyard].reverse().slice(0, 10);
    list.forEach(h => {
      msg += `▫️ *${h.name}* (Lv.${h.level} ${h.class})\n`;
      msg += `   ➥ _Slain by ${h.cause}_\n`;
      msg += `   📅 ${new Date(h.date).toLocaleDateString()}\n\n`;
    });
  }
  
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `💡 Heroes lost in Hardcore mode are immortalized here.`;
  
  await sendMenuWithBanner(sock, chatId, msg);
}

/*
 * Helper to update bot profile picture
 */
async function updateBotPFP(sock) {
  const pfpPng = botConfig.getAssetPath('pfp.png');
  const pfpJpg = botConfig.getAssetPath('pfp.jpg');
  const pfpPath = fs.existsSync(pfpPng) ? pfpPng : (fs.existsSync(pfpJpg) ? pfpJpg : null);

  if (pfpPath) {
    try {
      console.log(`🖼️  [${BOT_ID}] Updating PFP: ${pfpPath}...`);
      
      const tempPfp = `./temp/pfp_convert_${Date.now()}.jpg`;
      if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

      // Use a robust conversion command to standard JPG
      const cmd = `"${FFMPEG_PATH}" -i "${pfpPath}" -q:v 1 -vframes 1 -vf "scale=640:640:force_original_aspect_ratio=increase,crop=640:640" -y "${tempPfp}"`;
      
      try {
        await execPromise(cmd);
        const buffer = fs.readFileSync(tempPfp);
        await sock.updateProfilePicture(sock.user.id, buffer);
        console.log(`✅ [${BOT_ID}] Bot profile picture updated.`);
        if (fs.existsSync(tempPfp)) fs.unlinkSync(tempPfp);
      } catch (convErr) {
        console.error(`❌ [${BOT_ID}] PFP Sync Error:`, convErr.message);
      }
    } catch (e) {
      console.error(`❌ [${BOT_ID}] PFP Helper Error:`, e.message);
    }
  }
}

/*
 * Helper to update bot WhatsApp profile name
 */
async function updateBotNameOnWhatsApp(sock, retryCount = 0) {
  const configName = botConfig.getBotName();
  const currentName = sock.user.name || sock.user.verifiedName;
  
  // Also try to update the "About" (Status) as a fallback/addition
  try {
    const status = `Identity: ${configName} | Power Level: MAX`;
    await sock.updateProfileStatus(status);
    console.log(`📝 [${BOT_ID}] WhatsApp Bio updated to: ${status}`);
  } catch (e) {
    // Bio update is less critical, fail silently
  }

  if (configName && currentName !== configName) {
    try {
      console.log(`🏷️ [${BOT_ID}] Attempting to update profile name to: ${configName}...`);
      await sock.updateProfileName(configName);
      console.log(`✅ [${BOT_ID}] WhatsApp profile name updated.`);
    } catch (e) {
      if (e.message.includes('myAppStateKey')) {
        if (retryCount < 1) {
          console.log(`⚠️ [${BOT_ID}] Business Account detected or Key Syncing. Retrying name update in 60s...`);
          setTimeout(() => updateBotNameOnWhatsApp(sock, retryCount + 1), 60000);
        } else {
          console.log(`💡 [${BOT_ID}] Note: WhatsApp Business accounts often restrict name changes via API. Please change it manually in the WhatsApp Business app to "${configName}" if it hasn't updated.`);
        }
      } else {
        console.error(`❌ [${BOT_ID}] Failed to update WhatsApp profile name:`, e.message);
      }
    }
  }
}

// Create a completely silent logger - this stops ALL Baileys logging
const logger = P({
  level: 'silent'
});

 // Global sock reference
 // Flag to only sync PFP/Name on first login

// --- LOAN CHECKER INTERVAL ---
// Checks for due loans every 60 seconds
setInterval(async () => {
  try {
    const results = loans.checkDueLoans();
    if (results.length > 0) {
      console.log(`💸 [${BOT_ID}] Processed ${results.length} loan transactions/defaults.`);
      
      if (sock) {
        for (const res of results) {
          try {
            if (res.type === 'paid') {
              // Notify both parties
              await sock.sendMessage(res.borrower, { text: `💸 Your loan of ${ZENI}${res.amount.toLocaleString()} has been auto-repaid to @${res.lender.split('@')[0]}.`, contextInfo: { mentionedJid: [res.lender] } });
              await sock.sendMessage(res.lender, { text: `💰 @${res.borrower.split('@')[0]} has auto-repaid their loan of ${ZENI}${res.amount.toLocaleString()}.`, contextInfo: { mentionedJid: [res.borrower] } });
            } else if (res.type === 'defaulted') {
              // Notify about default
              await sock.sendMessage(res.borrower, { text: `🚨 *LOAN DEFAULT!* 🚨\n\nYou couldn't repay your debt. Your entire balance has been seized and given to the lender.\n\n🚫 You are now BLOCKED from using the bot for ${res.blockTime} minutes.` });
              await sock.sendMessage(res.lender, { text: `🏦 *LOAN DEFAULT!* 🏦\n\n@${res.borrower.split('@')[0]} defaulted on their loan. You have been paid ${ZENI}${res.seized.toLocaleString()} (their entire remaining balance).`, contextInfo: { mentionedJid: [res.borrower] } });
            }
          } catch (sendErr) {
            console.error("Failed to send loan notification:", sendErr.message);
          }
        }
      }
    }
  } catch (e) {
    console.error("Error in loan checker:", e);
  }
}, 60000);

// --- Profile Picture Directory ---
const pfpDir = botConfig.getDataPath('pfp');

// NUCLEAR OPTION: Filter at the process stdout/stderr level
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  // Block session/encryption spam to keep console clean, but don't force restart
  if (str.includes('Closing session') || 
      str.includes('Session error') || 
      str.includes('Failed to decrypt') || 
      str.includes('MAC') ||
      str.includes('MessageCounterError')) { 
    return true; 
  }
  return originalStdoutWrite(chunk, encoding, callback);
};

process.stderr.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  if (str.includes('Closing session') || 
      str.includes('Session error') || 
      str.includes('Failed to decrypt') || 
      str.includes('MAC') ||
      str.includes('MessageCounterError')) { 
    return true; 
  }
  return originalStderrWrite(chunk, encoding, callback);
};

// STYLISH RAM MONITOR - shows bot is alive and tracking resources
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

// Update every 30 seconds
setInterval(() => {
  const ramUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  const spinner = spinnerFrames[spinnerIndex % spinnerFrames.length];
      // console.log(`${spinner} [${BOT_ID}] RAM: ${ramUsage} MB | Status: 🟢 Active`);  spinnerIndex++;
}, 30000); // Every 30 seconds

// --- Marker for tracking bot's own messages (invisible to users) ---
// const BOT_MARKER = '\u200B'; // zero-width space - this shi is genius ngl
// --- Groq AI Setup with API Rotation ---
// Multiple API keys for 5x capacity and auto-rotation
const GROQ_API_KEYS = (process.env.GROQ_API_KEYS || "").split(",").filter(key => key.trim() !== "");

let currentKeyIndex = 0;
let keyFailureCounts = new Map();
const MAX_FAILURES_PER_KEY = 3;

function getNextGroqClient() {
  let apiKey = GROQ_API_KEYS[currentKeyIndex];
  const failures = keyFailureCounts.get(apiKey) || 0;
  if (failures >= MAX_FAILURES_PER_KEY && GROQ_API_KEYS.length > 1) {
    console.log("⚠️ API Key ${currentKeyIndex + 1} has ${failures} failures, switching...");
    currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
    apiKey = GROQ_API_KEYS[currentKeyIndex];
  }
  return new Groq({ apiKey });
}

function markKeyFailure() {
  const apiKey = GROQ_API_KEYS[currentKeyIndex];
  const currentFailures = keyFailureCounts.get(apiKey) || 0;
  keyFailureCounts.set(apiKey, currentFailures + 1);
}

function markKeySuccess() {
  const apiKey = GROQ_API_KEYS[currentKeyIndex];
  keyFailureCounts.set(apiKey, 0);
}

const groq = getNextGroqClient();

const MODELS = {
  FAST: "llama-3.1-8b-instant",
  SMART: "llama-3.3-70b-versatile",
};

function selectModel(messageLength, isComplex = false) {
  if (isComplex || messageLength > 500) return MODELS.SMART;
  return MODELS.FAST;
}

async function smartGroqCall(options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const client = getNextGroqClient();
      const response = await client.chat.completions.create(options);
      markKeySuccess();
      return response;
    } catch (error) {
      markKeyFailure();
      const isRateLimit = error.message?.includes('rate_limit') || error.status === 429;
      if (isRateLimit && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log("⏳ Waiting ${waitTime}ms before retry...");
        await new Promise(resolve => setTimeout(resolve, waitTime));
        if (GROQ_API_KEYS.length > 1) {
          currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
          console.log(`🔄 Switching to API Key ${currentKeyIndex + 1}/${GROQ_API_KEYS.length}`);
        }
        continue;
      }
      if (attempt === retries) throw error;
    }
  }
}

console.log(`✅ Groq API initialized with ${GROQ_API_KEYS.length} key(s)`);
// --- FFMPEG Path ---
// Detect FFmpeg path (support both Windows and Linux)
const FFMPEG_PATH = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg' : '/usr/bin/ffmpeg');
const YTDLP_PATH = process.env.YTDLP_PATH || `yt-dlp`;

// can't use any bot commands
const blockedUsers = new Set();

// --- Auth check ---



 

function hasAuth(authPath) {
  try {
    return fs.existsSync(authPath) && fs.readdirSync(authPath).length > 0;
  } catch (e) {
    return false;
  }
}

function getBackoff() {
  // exponential backoff: 5s, 10s, 20s, 40s, capped at 60s
  retryCount = Math.min(retryCount + 1, 6);
  return Math.min(60000, 5000 * Math.pow(2, retryCount - 1));
}
// --- Sticker folders by mood ---
// organized by vibes basically lmao
const stickerPaths = {
  neutral: [
    botConfig.getStickerPath("casual.webp"),
    botConfig.getStickerPath("casualwebp.webp"),
    botConfig.getStickerPath("casual001.webp"),
    botConfig.getStickerPath("casual01.webp"),
    botConfig.getStickerPath("casual02.webp")
  ],

  happy: [
    botConfig.getStickerPath("smile.webp"),
    botConfig.getStickerPath("flutred.webp")
  ],

  sarcastic: [
    botConfig.getStickerPath("sus.webp"),
    botConfig.getStickerPath("confident.webp"),
    botConfig.getStickerPath("confident2.webp"),
    botConfig.getStickerPath("confident3.webp"),
    botConfig.getStickerPath("confident0.webp")
  ],

  thinking: [
    botConfig.getStickerPath("thinkking.webp"),
    botConfig.getStickerPath("interesting.webp"),
    botConfig.getStickerPath("interesting1.webp"),
    botConfig.getStickerPath("interesting2.webp"),
    botConfig.getStickerPath("interestong.webp"),
    botConfig.getStickerPath("confused.webp"),
    botConfig.getStickerPath("nervous.webp")
  ],

  concerned: [
    botConfig.getStickerPath("uninterested.webp"),
    botConfig.getStickerPath("tired.webp"),
    botConfig.getStickerPath("tired2.webp"),
    botConfig.getStickerPath("tired3.webp"),
    botConfig.getStickerPath("tired0.webp"),
    botConfig.getStickerPath("angry.webp"),
    botConfig.getStickerPath("angry0.webp"),
    botConfig.getStickerPath("angry01.webp")
  ]
};

// helper to pick random sticker
// basically rng but for stickers
// maybe improve mood system later marker[01]
function getRandomSticker(mood) {
  const list = stickerPaths[mood] || stickerPaths.neutral;
  return list[Math.floor(Math.random() * list.length)];
}

// view-once message extractor
// grabs the hidden content from view-once messages
function extractViewOnce(msg) {
  if (!msg || !msg.message) {
    console.log("❌ No message object");
    return null;
  }

  console.log("🔍 Message keys:", Object.keys(msg.message));

  //Check if imageMessage or videoMessage has viewOnce flag
  if (msg.message.imageMessage && msg.message.imageMessage.viewOnce) {
    console.log("✅ Found view-once IMAGE");
    return { imageMessage: msg.message.imageMessage };
  }

  if (msg.message.videoMessage && msg.message.videoMessage.viewOnce) {
    console.log("✅ Found view-once VIDEO");
    return { videoMessage: msg.message.videoMessage };
  }

  //  check for v2 format first (wrapped versions), tnx to chatgpGOAT 
  if (msg.message.viewOnceMessageV2) {
    console.log("✅ Found viewOnceMessageV2");
    return msg.message.viewOnceMessageV2.message;
  }

  // Check for v2 extension
  if (msg.message.viewOnceMessageV2Extension) {
    console.log("✅ Found viewOnceMessageV2Extension");
    return msg.message.viewOnceMessageV2Extension.message;
  }

  // Fallback to v1 format 
  if (msg.message.viewOnceMessage) {
    console.log("✅ Found viewOnceMessage");
    return msg.message.viewOnceMessage.message;
  }

  console.log("❌ No view-once found in message");
  return null;
}

// download media helper for view-once messages
// streams the media content and converts to buffer
async function downloadMedia(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// NEW: Write EXIF metadata to WebP stickers

async function imageToSticker(inputPath, outputPath, ) {
  try {
    const cmd = `${FFMPEG_PATH} -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1" -c:v libwebp -preset drawing -loop 0 -q:v 75 -an "${outputPath}"`;

    await execPromise(cmd);
    
    return true;
  } catch (err) {
    console.error("Error converting image to sticker, sum fucked up:", err);
    return false;
  }
}
// helper to normalize JIDs for comparison
function normalizeJid(jid) {
  if (!jid) return null;
  // Remove everything after @ and :
  return jid.split('@')[0].split(':')[0];
}

// ---------- scraper (Hybrid Node/Go Service) ----------
const GoImageService = require('./goImageService');
const goService = new GoImageService();

async function scrapePornPics(searchTerm, count = 10, options = {}) {
    try {
        const got = await getGot();
        const searchUrl = `https://www.pornpics.com/?q=${encodeURIComponent(searchTerm)}`;
        
        console.log('🔍 Scraping (No-Browser):', searchUrl);
        
        const response = await got.get(searchUrl, {
            headers: {
                'Referer': 'https://www.pornpics.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: { request: 15000 }
        });
        
        const { document } = parseHTML(response.body);
        const imgs = document.querySelectorAll('img');
        console.log(`🔍 [${botConfig.getBotId()}] PornPics found ${imgs.length} image tags`);
        const candidates = [];

        for (const img of imgs) {
            let url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
            if (!url) continue;

            if (!url.startsWith('http')) {
                if (url.startsWith('//')) url = 'https:' + url;
                else if (url.startsWith('/')) url = 'https://www.pornpics.com' + url;
                else continue;
            }

            if (url.includes('logo') || url.includes('icon') || url.includes('avatar')) continue;

            const w = parseInt(img.getAttribute('width')) || 0;
            const h = parseInt(img.getAttribute('height')) || 0;
            const score = w * h;

            if (score > 20000 || (!w && !h)) {
                candidates.push({ url, score });
            }
        }

        if (candidates.length === 0) {
            const regex = /https?:\/\/[^\"\'\s]+\.(jpg|jpeg|png|webp)/gi;
            const matches = response.body.match(regex) || [];
            matches.forEach(url => {
                if (url.includes('thumb')) candidates.push({ url, score: 30000 });
            });
        }

        const finalList = [...new Set(candidates.map(c => c.url))]
            .filter(url => !url.includes('google') && !url.includes('click'))
            .slice(0, count + 1);

        const result = finalList.length > 1 ? finalList.slice(1) : finalList;
        return result.slice(0, count);

    } catch (err) {
        console.error('❌ PornPics Scrape Error:', err.message || String(err));
        return [];
    }
}


// Scrapes Rule34.xxx (Refactored to Go Service)
async function scrapeFromDefaultSite(searchTerm, count = 10) {
    try {
        console.log(`🔍 Rule34 Search (Go Service): ${searchTerm}`);
        const result = await goService.searchRule34(searchTerm, count);
        return result.images || [];
    } catch (err) {
        console.error("❌ Rule34 Error:", err.message);
        return [];
    }
}

// ... (Group Summary System remains unchanged) ...

// Scrapes pinterest for image results based on a query (Refactored to Go Service)
async function searchPinterest(query, count = 10) {
    try {
        console.log(`🔍 Pinterest Search (Go Service): ${query}`);
        const result = await goService.searchPinterest(query, count);
        return result.images || [];
    } catch (err) {
        console.error("❌ Pinterest Error:", err.message);
        return [];
    }
}

/**
 * Search Klipy Stickers (Go Service)
 */
async function searchStickers(query, count = 10) {
    try {
        console.log(`🔍 Sticker Search (Go Service): ${query}`);
        const result = await goService.searchStickers(query, count);
        return result.stickers || [];
    } catch (err) {
        console.error("❌ Sticker Error:", err.message);
        return [];
    }
}



async function stickerToImage(inputPath, outputPath) {
  try {
    // Convert WebP sticker to PNG - pretty straightforward
    const cmd = `${FFMPEG_PATH} -i ${inputPath} ${outputPath}`;

    await execPromise(cmd);
    return true;
  } catch (err) {
    console.error("Error converting sticker to image:", err);
    return false;
  }
}

// Override users set
const overrideUsers = new Set();

// Load blocked users from DB
async function loadBlockedUsers() {
  try {
    const data = system.get(BOT_ID + "_blocked_users", []);
    data.forEach(userId => blockedUsers.add(userId));
    console.log(`📛 [${BOT_ID}] Loaded ${blockedUsers.size} blocked users from MongoDB`);
  } catch (err) {
    console.error("Error loading blocked users:", err.message);
  }
}

function saveBlockedUsers() {
  system.set(BOT_ID + "_blocked_users", Array.from(blockedUsers));
}

function blockUser(userId) {
  blockedUsers.add(userId);
  saveBlockedUsers();
}

function unblockUser(userId) {
  blockedUsers.delete(userId);
  saveBlockedUsers();
}

function isBlocked(userId) {
  if (blockedUsers.has(userId)) return true;
  if (loans.isLoanBlocked(userId)) return true;
  return false;
}

// Helper to get target user from mention or reply
function getMentionOrReply(m) {
  // Check mentions
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0) return jidNormalizedUser(mentioned[0]);
  
  // Check direct reply participant
  const replyParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
  if (replyParticipant) return jidNormalizedUser(replyParticipant);

  // Baileys sometimes wraps the quoted message differently
  const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quotedMessage) {
    // If we have a quoted message, the participant JID should be in contextInfo
    const participant = m.message?.extendedTextMessage?.contextInfo?.participant;
    return participant ? jidNormalizedUser(participant) : null;
  }
  
  return null;
}

function toEmojiNumber(num) {
  const emojiMap = {
    '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
    '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣'
  };
  return num.toString().split('').map(digit => emojiMap[digit] || digit).join('');
}

// Conversation memory per USER (not per chat)
const conversationMemory = new Map();

// Evict stale conversation histories (idle > 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 7200000; // 2 hours
  for (const [jid, history] of conversationMemory.entries()) {
    const lastMsg = history[history.length - 1];
    if (!lastMsg || (lastMsg._ts && lastMsg._ts < cutoff)) {
      conversationMemory.delete(jid);
    }
  }
}, 300000); // run every 5 min

const temporaryContext = new Map();
const pendingTagRequests = new Map();


// Group settings - MongoDB
const groupSettings = new Map();

function loadGroupSettings() {
  try {
    const data = system.get(BOT_ID + "_group_settings", {});
    Object.entries(data).forEach(([key, value]) => {
      groupSettings.set(key, value);
    });
    console.log(`✅ [${BOT_ID}] Loaded group settings from MongoDB`);
  } catch (err) {
    console.error("Error loading group settings:", err.message);
  }
}

function saveGroupSettings() {
  system.set(BOT_ID + "_group_settings", Object.fromEntries(groupSettings));
}

function getGroupSettings(chatId) {
  if (!groupSettings.has(chatId)) {
    groupSettings.set(chatId, {
      antilink: false,
      antilinkAction: 'delete',
      welcomeMessage: null,
      antispam: false,
      recording: false,
      blacklist: []
    });
    saveGroupSettings();
  }
  return groupSettings.get(chatId);
}

// Support usage tracking - MongoDB
const supportUsage = new Map();

function loadSupportUsage() {
  try {
    const data = system.get(BOT_ID + "_support_usage", {});
    for (const [userId, count] of Object.entries(data)) {
      supportUsage.set(userId, count);
    }
    console.log(`✅ [${BOT_ID}] Loaded support usage from MongoDB`);
  } catch (err) {
    console.error("Error loading support usage:", err.message);
  }
}

function saveSupportUsage() {
  system.set(BOT_ID + "_support_usage", Object.fromEntries(supportUsage));
}

function checkSupportUsage(userId) {
  const usage = supportUsage.get(userId) || 0;
  return usage;
}

function incrementSupportUsage(userId) {
  const usage = supportUsage.get(userId) || 0;
  supportUsage.set(userId, usage + 1);
  saveSupportUsage();
  return usage + 1;
}

function isBlockedFromBot(userId) {
  const usage = supportUsage.get(userId) || 0;
  return usage >= 10; // Capped at 10 for safety
}

// User warnings - MongoDB
const userWarnings = new Map();

function loadUserWarnings() {
  try {
    const data = system.get(BOT_ID + "_user_warnings", {});
    Object.entries(data).forEach(([key, value]) => {
      userWarnings.set(key, value);
    });
    console.log(`✅ [${BOT_ID}] Loaded warnings from MongoDB`);
  } catch (err) {
    console.error("Error loading warnings:", err.message);
  }
}

function saveUserWarnings() {
  system.set(BOT_ID + "_user_warnings", Object.fromEntries(userWarnings));
}

// Muted users - MongoDB
const mutedUsers = new Map();

function loadMutedUsers() {
  try {
    const data = system.get(BOT_ID + "_muted_users", {});
    Object.entries(data).forEach(([userId, muteData]) => {
      mutedUsers.set(userId, muteData);
    });
    console.log(`🔇 [${BOT_ID}] Loaded ${mutedUsers.size} muted users from MongoDB`);
  } catch (err) {
    console.error("Error loading muted users:", err.message);
  }
}

function saveMutedUsers() {
  system.set(BOT_ID + "_muted_users", Object.fromEntries(mutedUsers));
}

function addWarning(userId, groupId, reason) {
  // Key format: "userId@groupId" for per-group warnings
  const key = `${userId}@${groupId}`;
  
  if (!userWarnings.has(key)) {
    userWarnings.set(key, []);
  }
  userWarnings.get(key).push({
    reason,
    timestamp: new Date().toISOString()
  });
  saveUserWarnings();
  return userWarnings.get(key).length;
}

function resetWarnings(userId, groupId) {
  const key = groupId ? `${userId}@${groupId}` : userId;
  userWarnings.delete(key);
  saveUserWarnings();
}

function getWarningCount(userId, groupId) {
  const key = `${userId}@${groupId}`;
  return userWarnings.has(key) ? userWarnings.get(key).length : 0;
}

// ✅ Activity tracking - who's active and who's not
const activityTracker = new Map();

// ✅ Blacklist - banned words or blocked users
const blacklistWords = new Set();
const blacklistedUsers = new Set();

// ✅ Spam prevention
const spamTracker = new Map();

setInterval(() => {
  const now = Date.now();

  // spamTracker: remove users with no recent messages
  for (const [key, data] of spamTracker.entries()) {
    if (data.messages.length === 0 && now - (data.lastWarning || 0) > 600000) {
      spamTracker.delete(key);
    }
  }

  // temporaryContext: clear empty entries
  for (const [jid, items] of temporaryContext.entries()) {
    if (!items || !items.length) temporaryContext.delete(jid);
  }

  // pendingTagRequests: drop anything older than 2 min
  for (const [jid, req] of pendingTagRequests.entries()) {
    if (now - req.timestamp > 120000) pendingTagRequests.delete(jid);
  }

  // activityTracker: cap nested maps at 200 most recent users per chat
  for (const [chatId, users] of activityTracker.entries()) {
    if (users.size > 200) {
      const sorted = [...users.entries()].sort((a, b) => b[1].lastMessage - a[1].lastMessage);
      users.clear();
      sorted.slice(0, 200).forEach(([k, v]) => users.set(k, v));
    }
  }
}, 120000); // every 2 min

// Activity tracking - who sent how many messages
function trackActivity(chatId, userId) {
  if (!activityTracker.has(chatId)) {
    activityTracker.set(chatId, new Map());
  }
  
  const chatActivity = activityTracker.get(chatId);
  if (!chatActivity.has(userId)) {
    chatActivity.set(userId, {
      count: 0,
      firstSeen: Date.now(),
      lastMessage: Date.now()
    });
  }
  
  const userActivity = chatActivity.get(userId);
  userActivity.count++;
  userActivity.lastMessage = Date.now();
}

function getActivity(chatId, userId) {
  if (!activityTracker.has(chatId)) return null;
  const chatActivity = activityTracker.get(chatId);
  return chatActivity.get(userId) || null;
}

function getChatActivity(chatId) {
  if (!activityTracker.has(chatId)) return [];
  const chatActivity = activityTracker.get(chatId);
  return Array.from(chatActivity.entries()).map(([userId, data]) => ({
    userId,
    ...data
  }));
}

// Spam detection - checks if user is sending too many messages too fast
function checkSpam(userId, chatId) {
  const key = `${userId}_${chatId}`;
  if (!spamTracker.has(key)) {
    spamTracker.set(key, { messages: [], lastWarning: 0 });
  }

  const userData = spamTracker.get(key);
  const now = Date.now();

  // Remove messages older than 5 seconds
  userData.messages = userData.messages.filter(time => now - time < 5000);
  userData.messages.push(now);

  // If more than 5 messages in 5 seconds = spam
  if (userData.messages.length > 5) {
    // Only warn once per minute so we dont spam them back lol
    if (now - userData.lastWarning > 60000) {
      userData.lastWarning = now;
      return true;
    }
  }

  return false;
}
// ✅ FIXED: Parse time duration (e.g., "10s", "5m", "2h", "1d")
// so u can say .mute @user 10s for 10 seconds, 5m for 5 minutes, etc
function parseDuration(duration) {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  // s = seconds, m = minutes, h = hours, d = days
  const multipliers = { 
    s: 1000,        // seconds
    m: 60000,       // minutes
    h: 3600000,     // hours
    d: 86400000     // days
  };
  
  return value * multipliers[unit];
}

// Format duration for display (milliseconds to human readable)
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

// Helper to get chat-specific mute key
function getMuteKey(userId, chatId) {
  // If it's a private chat (DM), just use userId. Otherwise, use composite key.
  if (!chatId || !chatId.endsWith('@g.us')) return userId;
  return `${userId}_${chatId}`;
}

// ✅ FIXED: Check if user is muted and auto-cleanup expired mutes
function isMuted(userId, chatId) {
  const key = getMuteKey(userId, chatId);
  if (!mutedUsers.has(key)) return false;
  
  const muteData = mutedUsers.get(key);
  
  // check if mute has expired
  if (Date.now() > muteData.until) {
    // mute expired, remove it automatically
    mutedUsers.delete(key);
    saveMutedUsers();
    console.log(`🔊 Auto-unmuted ${userId} in ${chatId} (time expired)`);
    return false;
  }
  
  return true;
}

// ✅ FIXED: Mute user with proper persistence
function muteUser(userId, chatId, duration) {
  const key = getMuteKey(userId, chatId);
  mutedUsers.set(key, {
    until: Date.now() + duration,
    mutedAt: Date.now(),
    duration: duration,
    userId: userId,
    chatId: chatId
  });
  saveMutedUsers();
  console.log(`🔇 Muted ${userId} in ${chatId} for ${formatDuration(duration)}`);
}

// ✅ FIXED: Unmute user with proper cleanup
function unmuteUser(userId, chatId) {
  const key = getMuteKey(userId, chatId);
  mutedUsers.delete(key);
  saveMutedUsers();
  console.log(`🔊 Unmuted ${userId} in ${chatId}`);
}

// Get remaining mute time
function getMuteInfo(userId, chatId) {
  const key = getMuteKey(userId, chatId);
  if (!mutedUsers.has(key)) return null;
  const data = mutedUsers.get(key);
  const remaining = data.until - Date.now();
  return remaining > 0 ? remaining : null;
}

// ✅ User profiles storage - Integrated with Economy/MongoDB
function getUserProfile(jid) {
  const user = economy.getUser(jid);
  if (!user || !user.profile) return null;
  return user.profile;
}

function loadUserProfile(jid) {
  return getUserProfile(jid);
}

function initializeUserProfile(jid) {
  const user = economy.getUser(jid);
  
  return {
    jid: jid,
    whatsappName: null,
    nickname: user?.nickname || null,
    profilePicture: null,
    notes: [],
    memories: {
      likes: [],
      dislikes: [],
      hobbies: [],
      personal: [],
      other: []
    },
    stats: {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      messageCount: 0
    }
  };
}

function updateUserProfile(jid, updates = {}) {
  const user = economy.getUser(jid);
  if (!user) return null;
  
  if (!user.profile) {
    user.profile = initializeUserProfile(jid);
  }
  
  const profile = user.profile;
  
  if (updates.nickname !== undefined) {
    profile.nickname = updates.nickname;
    // 💡 RPG SYNC: Also update the main economy nickname so it shows in quests/RPG commands
    user.nickname = updates.nickname;
    economy.saveUser(jid);
  }
  if (updates.whatsappName !== undefined) profile.whatsappName = updates.whatsappName;
  if (updates.profilePicture !== undefined) profile.profilePicture = updates.profilePicture;
  
  if (updates.note) {
    profile.notes.push({
      content: updates.note,
      timestamp: new Date().toISOString()
    });
  }
  
  if (updates.memory) {
    const { category, content } = updates.memory;
    if (!profile.memories) profile.memories = { likes: [], dislikes: [], hobbies: [], personal: [], other: [] };
    if (profile.memories[category]) {
      if (!profile.memories[category].includes(content)) {
        profile.memories[category].push(content);
      }
    }
  }
  
  if (!profile.stats) profile.stats = { firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), messageCount: 0 };
  profile.stats.lastSeen = new Date().toISOString();
  profile.stats.messageCount++;
  
  economy.saveUser(jid);
  return profile;
}

function addUserMemory(jid, category, content) {
  return updateUserProfile(jid, { memory: { category, content } });
}

function addUserNote(jid, note) {
  return updateUserProfile(jid, { note });
}

async function detectTagIntent(message) {
  try {
    const intentPrompt = `Analyze if the user is EXPLICITLY asking you to notify/announce something to everyone in the group.

Message: "${message}"

ONLY return true if the message contains DIRECT instructions like:
- " yo ${botConfig.getBotName()} tell everyone [message]"
- "let everyone know [message]"
- "notify the group that [message]"
- "announce to everyone [message]"
- "tag everyone and say [message]"
- "inform the gc [message]"
- "tell them all [message]"

DO NOT return true for:
- Normal questions or statements
- Messages that just mention "everyone" casually
- Questions about the group
- General conversation

Return JSON:
{
  "shouldTag": true/false,
  "announcement": "the message to announce" or null
}

Be STRICT - only return true if it's a clear command to notify everyone.
Return ONLY the JSON.

JSON:`;

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "user", content: intentPrompt }
      ]
    });

    const result = response.choices[0].message.content.trim();
    let cleanJson = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    return JSON.parse(cleanJson);
  } catch (err) {
    return { shouldTag: false, announcement: null };
  }
}

// ============================================
// Detect if message is about someone else
// ============================================
function detectPersonContext(text, chatId, mentionedJids = []) {
  const context = {
    aboutSomeone: false,
    personJid: null,
    personName: null,
    personProfile: null,
    isMention: false
  };

  try {
    // Check for direct mentions first
    if (mentionedJids && mentionedJids.length > 0) {
      const mentionedJid = mentionedJids[0];
      
      // Load profile directly from JSON
      const profile = getUserProfile(mentionedJid);
      
      context.aboutSomeone = true;
      context.personJid = mentionedJid;
      context.personName = profile?.nickname || profile?.whatsappName || mentionedJid.split('@')[0];
      context.personProfile = profile;
      context.isMention = true;
      
      return context;
    }

    // Look for names in the text by checking against all known profiles
    const words = text.toLowerCase().split(/\s+/);
    
    // Safety check: Ensure economy cache is initialized
    if (!economy.economyData) return context;

    // Search through all profiles in the economy cache
    for (const [jid, user] of economy.economyData.entries()) {
      const profile = user.profile;
      if (!profile || !profile.nickname) continue;
      
      const nickname = profile.nickname.toLowerCase();
      const nicknameParts = nickname.split(/\s+/);
      
      // Check if any part of the nickname appears in the message
      for (const part of nicknameParts) {
        if (part.length < 3) continue; // Skip very short names
        
        for (const word of words) {
          // Fuzzy match: check if word contains name or name contains word
          if (word.includes(part) || part.includes(word)) {
            context.aboutSomeone = true;
            context.personJid = jid;
            context.personName = profile.nickname;
            context.personProfile = profile;
            context.isMention = false;
            return context;
          }
        }
      }
      
      // Also check full nickname match
      if (text.toLowerCase().includes(nickname)) {
        context.aboutSomeone = true;
        context.personJid = jid;
        context.personName = profile.nickname;
        context.personProfile = profile;
        context.isMention = false;
        return context;
      }
    }
    
  } catch (err) {
    console.log("⚠️ Person context detection error:", err.message);
  }
  
  return context;
}

// ============================================
// Format profile for AI context
// ============================================
function formatProfileForAI(profile, senderJid) {
  let context = "";
  
  if (profile) {
    if (profile.nickname) {
      context += `Nickname: ${profile.nickname}\n`;
    }
    
    if (profile.whatsappName && profile.whatsappName !== profile.nickname) {
      context += `WhatsApp Name: ${profile.whatsappName}\n`;
    }
    
    if (profile.notes && profile.notes.length > 0) {
      context += `\nNotes about this person:\n`;
      profile.notes.slice(-5).forEach(note => {
        context += `- ${note.content}\n`;
      });
    }
    
    if (profile.memories) {
      if (profile.memories.likes && profile.memories.likes.length > 0) {
        context += `\nThings they like: ${profile.memories.likes.join(", ")}\n`;
      }
      if (profile.memories.dislikes && profile.memories.dislikes.length > 0) {
        context += `Things they dislike: ${profile.memories.dislikes.join(", ")}\n`;
      }
      if (profile.memories.hobbies && profile.memories.hobbies.length > 0) {
        context += `Their hobbies: ${profile.memories.hobbies.join(", ")}\n`;
      }
      if (profile.memories.personal && profile.memories.personal.length > 0) {
        context += `Personal info:\n`;
        profile.memories.personal.forEach(info => {
          context += `- ${info}\n`;
        });
      }
      if (profile.memories.other && profile.memories.other.length > 0) {
        context += `Other facts:\n`;
        profile.memories.other.forEach(fact => {
          context += `- ${fact}\n`;
        });
      }
    }
    
    if (profile.stats && profile.stats.messageCount !== undefined) {
      context += `\nYou've talked ${profile.stats.messageCount} times.\n`;
    }
  }
  
  // Add temporary context for this convo
  if (temporaryContext.has(senderJid)) {
    const temp = temporaryContext.get(senderJid);
    if (temp.length > 0) {
      context += `\n--- Current Conversation Context ---\n`;
      temp.forEach(item => {
        context += `- ${item.content}\n`;
      });
    }
  }
  
  return context || null;
}


// Main AI function - sends message to Groq and gets response
async function askAI(senderJid, newMessage, mentionedJids = [], chatId = null) {
  const history = conversationMemory.get(senderJid) || [];
  
  // Joker's personality and behavior rules - NOW DYNAMIC per bot instance
  const contentDescription = botConfig.getContentDescription();
  
  // Load the sender's profile (with safety check for preflight)
  let userProfile = null;
  if (typeof loadUserProfile === 'function') {
    userProfile = loadUserProfile(senderJid);
    if (!userProfile && typeof initializeUserProfile === 'function') {
      userProfile = initializeUserProfile(senderJid);
    }
  }
  
  // Keywords to look for before storing in memory
  const MEMORY_KEYWORDS = [
    'remember', 'my name is', 'i like', 'i love', 'i hate', 'i dislike',
    'favorite', 'prefer', 'born', 'birthday', 'age', 'from', 'live',
    'nickname', 'call me', 'hobby', 'interests', 'work', 'job', 'study'
  ];
  
  // DON'T store commands in conversation history
  const isCommand = newMessage.trim().startsWith(`${botConfig.getPrefix().toLowerCase()}`) || newMessage.trim().startsWith('.');
  
  // Check if message contains important keywords
  const shouldStore = !isCommand && MEMORY_KEYWORDS.some(keyword => 
    newMessage.toLowerCase().includes(keyword)
  );
  
  // Only store in memory if it contains important info or history is short (and not a command)
  if (shouldStore || (!isCommand && history.length < 5)) {
    history.push({ role: `user`, content: newMessage, _ts: Date.now() });
  }
  
  const recentHistory = history.slice(-10);

  let systemPrompt = contentDescription;
  
  // Only add profile context if we have it
  if (userProfile && typeof formatProfileForAI === 'function') {
    const profileContext = formatProfileForAI(userProfile, senderJid);
    
    if (profileContext) {
      systemPrompt += "\n\n--- Person You're Talking To ---\n";
      systemPrompt += profileContext;
      systemPrompt += "\nUse this information naturally in conversation. Don't robotically recite it.\n";
    }
  }

  // Detect if they're talking about someone else (only if function exists)
  if (typeof detectPersonContext === 'function') {
    const personContext = detectPersonContext(newMessage, chatId, mentionedJids);
    
    if (personContext.aboutSomeone) {
      systemPrompt += "\n\n--- IMPORTANT: They're Talking About Someone Else ---\n";
      systemPrompt += `The user is ${personContext.isMention ? 'mentioning/tagging' : 'talking about'} another person:\n`;
      systemPrompt += `Person's Name: ${personContext.personName}\n`;
      
      if (personContext.personProfile && typeof formatProfileForAI === 'function') {
        const targetContext = formatProfileForAI(personContext.personProfile, personContext.personJid);
        if (targetContext) {
          systemPrompt += "\n--- Info About The Person They're Discussing ---\n";
          systemPrompt += targetContext;
        }
      }
      
      systemPrompt += "\nRespond naturally about this person. Use their info to give relevant, personalized responses. ";
      systemPrompt += "Don't say 'according to my data' - just naturally incorporate what you know about them.\n";
    }
  }

  // prepare messages for Groq API
  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...recentHistory.map(msg => ({ role: msg.role, content: msg.content }))
  ];

  // Using smart API rotation with model selection
  const completion = await smartGroqCall({
    model: selectModel(newMessage.length, false),
    messages: groqMessages
  });

  const aiReply = completion.choices[0].message.content;
  history.push({ role: "assistant", content: aiReply, _ts: Date.now() });
  conversationMemory.set(senderJid, history);
  
  // Update user stats (only if we have the profile and save function)
  if (userProfile && userProfile.stats && typeof saveUserProfile === 'function') {
    userProfile.stats.lastSeen = new Date().toISOString();
    userProfile.stats.messageCount = (userProfile.stats.messageCount || 0) + 1;
    saveUserProfile(senderJid, userProfile);
  }
  
  return aiReply;
}

// Mood detection for sticker selection
// reads the message and picks what vibe the user is giving off
async function detectMood(text) {
  try {
    const res = await smartGroqCall({
      model: MODELS.FAST,
      messages: [
        { role: "system", content: "Return ONLY one word based on the mood of the message you are respoonding to: neutral, happy, sarcastic, thinking, concerned" },
        { role: "user", content: text }
      ]
    });

    const mood = res.choices[0].message.content.trim().toLowerCase();
    return stickerPaths[mood] ? mood : "neutral";
  } catch {
    return "neutral";
  }
}

/**
 * Awards progression (XP/GP) to a user for interacting with the bot.
 * Handles level-up notifications.
 */
async function awardProgression(userId, chatId) {
  try {
    if (!sock) return; // Safety check

    // 1. Award GP if user is in a guild
    const userGuild = guilds.getUserGuild(userId);
    if (userGuild) {
      progression.awardGP(userId, true);
    }
    
    // 2. Award small amount of XP (5 XP per interaction)
    const xpResult = progression.addXP(userId, 5, 'Interaction');
    
    // 3. If they leveled up, send a notification
    if (xpResult && xpResult.leveledUp) {
      const levelDisplay = progression.getLevelDisplay(xpResult.newLevel);
      
      let msg = `🎊 *LEVEL UP!* 🎊\n\n`;
      msg += `👤 @${userId.split('@')[0]}\n`;
      msg += `📈 *Rank:* ${levelDisplay}\n`;
      msg += `✨ *Stat Points:* +${xpResult.statPointsGained}\n`;
      msg += `🔮 *Skill Points:* +${xpResult.skillPointsGained}\n\n`;
      msg += `💡 Use \`${botConfig.getPrefix()} profile\` to see your updated stats!\n`;
      msg += `💡 Use \`${botConfig.getPrefix()} allocate\` to spend your points.`;

      await sock.sendMessage(chatId, {
        text: BOT_MARKER + msg,
        contextInfo: { mentionedJid: [userId] }
      });
    }
  } catch (err) {
    console.error("❌ awardProgression error:", err.message);
  }
}

// Pre-flight check - makes sure AI is working before starting
async function preflightCheck() {
  try {
    console.log("Checking AI with sample 'hi' prompt…");
    const response = await askAI("test-user", "hi");
    console.log("✅ AI responded:", response);
    return true;
  } catch (err) {
    console.error("❌ AI check failed:", err.message);
    return false;
  }
}

const COMMAND_REGISTRY = require('./commandRegistry');

// Banner template for all menus
const GET_BANNER = (title) => {
  // Ensure title fits or is handled
  return `┏━━━━━━━━━━━━━━━┓
┃   ${title}
┗━━━━━━━━━━━━━━━┛`;
};

const CATEGORY_EMOJIS = {

  SUPPORT: '🛠️',

  STICKERS: '🎨',

  SEARCH: '🔍',

  'PHANTOM THIEF': '🎭',

  'USER INFO': '👤',

  ADMIN: '⚙️',

  GUILDS: '🏰',

  RPG: '⚔️',

  GROUP: '👥',

  PROGRESSION: '📈',

  ECONOMY: '💰',

  GAMBLING: '🎰',

  FUN: '🎡',

  GAMES: '🎮',

  PowerScaling: '⚖️',

  ANIME: '🎎',

  INFO: 'ℹ️'

};



// 📢 CHANNEL CONFIGURATION



// Replace with your own Channel JID (found by forwarding a message from channel to bot)



const NEWSLETTER_JID = '120363425532756870@newsletter';



/**

 * Helper to send menu messages with an image banner if available.

 * Includes professional Newsletter Forwarding UI.

 */

async function sendMenuWithBanner(sock, chatId, text, mentions = []) {
  const imagePath = botConfig.getAssetPath('banner.png');
  const contextInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: botConfig.getBotName() + ' Official',
      serverMessageId: -1
    }
  };

  if (fs.existsSync(imagePath)) {
    return await sock.sendMessage(chatId, {
      image: { url: imagePath },
      caption: text,
      mentions,
      contextInfo
    });
  } else {
    const botName = botConfig.getBotName();
    const botMarker = `🃏 *${botName}*\n\n`;
    return await sock.sendMessage(chatId, { 
      text: botMarker + text,
      mentions,
      contextInfo
    });
  }
}



// New dynamic menu function

async function sendBotMenu(sock, chatId, args = []) {

  const categoryInput = args[0]?.toUpperCase();

  const botName = botConfig.getBotName();

  const prefix = botConfig.getPrefix();

  

  // 1. COMMAND EXPLAIN MODE (.j menu <command>)
  if (categoryInput) {
    let foundCommand = null;
    let commandCategory = "";

    

    for (const [cat, cmds] of Object.entries(COMMAND_REGISTRY)) {

      const match = cmds.find(c => c.cmd.toLowerCase() === categoryInput.toLowerCase());

      if (match) {

        foundCommand = match;

        commandCategory = cat;

        break;

      }

    }

    

    if (foundCommand) {

      const emoji = CATEGORY_EMOJIS[commandCategory] || '✨';

      let explainMsg = GET_BANNER(`${emoji} ${botName.toUpperCase()}`) + `\n\n`;

      explainMsg += `*Command:* \`${botConfig.getPrefix()} ${foundCommand.cmd}\`



*Description:*

${foundCommand.desc}



*Usage:*

\`${botConfig.getPrefix()} ${foundCommand.usage}\`



*Category:*

${commandCategory}`;

      return await sendMenuWithBanner(sock, chatId, explainMsg);

    }

  }



  // 2. CATEGORY MENU (.j menu <CATEGORY>)

  if (categoryInput && COMMAND_REGISTRY[categoryInput]) {

    const cmds = COMMAND_REGISTRY[categoryInput];

    const emoji = CATEGORY_EMOJIS[categoryInput] || '📂';

    let catMsg = GET_BANNER(`${emoji} ${categoryInput.toUpperCase()}`) + `\n\n`;

    

    cmds.forEach(c => {

      catMsg += `➤ \`${botConfig.getPrefix()} ${c.cmd}\` – ${c.desc.split('.')[0]}\n`;

    });

    

    return await sendMenuWithBanner(sock, chatId, catMsg);

  }



  // 3. SHOW ALL COMMANDS (.j menu all)

  if (categoryInput === 'ALL') {

    let allMsg = GET_BANNER(`✨ ${botName.toUpperCase()}`) + `\n`;

    allMsg += `*Prefix* ${botConfig.getPrefix()}\n\n`;

    for (const [cat, cmds] of Object.entries(COMMAND_REGISTRY)) {

      const emoji = CATEGORY_EMOJIS[cat] || '◈';

      allMsg += `${emoji}─── ＊ ${cat} ＊ ───${emoji}\n`;

      cmds.forEach(c => {

        allMsg += `• \`${botConfig.getPrefix()} ${c.cmd}\`\n`;

      });

      allMsg += "\n";

    }

    return await sendMenuWithBanner(sock, chatId, allMsg);

  }



    // 4. MAIN CATEGORY SELECTOR (.j menu)



    const categories = Object.keys(COMMAND_REGISTRY);



    



    let mainMsg = GET_BANNER(`✨ *${botName.toUpperCase()}*`) + `\n *Version ${botConfig.getVersion()}* \n *By mellow* \n\n`;



    mainMsg += `*Prefix:* ${botConfig.getPrefix()}\n\n`;



    mainMsg += `📂 Select a category by typing \`${botConfig.getPrefix()} menu <name>\`:\n\n`;



    



    // Display categories with emojis



    for (let i = 0; i < categories.length; i += 2) {



      const cat1Name = categories[i];



      const emoji1 = CATEGORY_EMOJIS[cat1Name] || '📂';



      const cat1 = `\`${emoji1} ${cat1Name}\``.padEnd(18);



      



      let cat2 = "";



      if (categories[i+1]) {



        const cat2Name = categories[i+1];



        const emoji2 = CATEGORY_EMOJIS[cat2Name] || '📂';



        cat2 = `\`${emoji2} ${cat2Name}\``;



      }


      mainMsg += `${cat1} ${cat2}\n`;



    }


    mainMsg += `\n➤ Type:\`${botConfig.getPrefix()} menu <CATEGORY>\`
➤ Or:\`${botConfig.getPrefix()} menu all\`
➤ Info:\`${botConfig.getPrefix()} menu <command>\``;

    return await sendMenuWithBanner(sock, chatId, mainMsg);



  }

  // ============================================



  // SESSION CLEANUP - prevents 10+ minute boot times



  // ============================================
async function cleanupOldSessions() {
  try {
    const authDir = './auth';
    if (!fs.existsSync(authDir)) return;
    
    const files = await fs.promises.readdir(authDir);
    let deletedCount = 0;
    
    await Promise.all(files.map(async (file) => {
      // KEEP creds.json - everything else can go
      if (file === 'creds.json') return;
      
      try {
        await fs.promises.unlink(path.join(authDir, file));
        deletedCount++;
      } catch (err) {
        // Ignore errors
      }
    }));
    
    if (deletedCount > 0) {
      // No log - silent optimization
    }
  } catch (err) {
    // console.log('⚠️ Session cleanup failed:', err.message);
  }
}

// Clean up sessions every 24 hours to prevent accumulation
// ✅ FIX: Disabled auto-cleanup - it was causing slow startups!
// To clean sessions manually, use: node cleanup-sessions.js
// Starts the interval 3 minutes after boot, so it never hits during startup
setTimeout(() => {
    cleanupOldSessions(); // Run once after 3 mins
    setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000); // Daily after that
}, 180000);

// ============================================
// 📰 AUTOMATED NEWS LOOP
// ============================================
let newsInterval = null;

async function startNewsLoop(sock) {
  if (newsInterval) clearInterval(newsInterval);
  
  console.log(`📰 Starting Persistent News Check (Every 5 mins check)...`);
  
  // Check immediately on startup
  checkAndSendNews(sock);

  // Periodic check every 5 minutes (300,000ms)
  // This is safe because it checks the DB timestamp, not a RAM timer
  newsInterval = setInterval(async () => {
    checkAndSendNews(sock);
  }, 300000); 
}

async function checkAndSendNews(sock) {
    if (news.isUpdateDue()) {
        console.log("📰 News update is due! Fetching...");
        await broadcastNews(sock);
        news.markUpdateComplete();
    } else {
        // console.log("📰 News update not due yet.");
    }
}

// Helper to format the news digest message
function formatNewsDigest(articles) {
  let message = `╔══════════════════════╗\n   📰 *ANIME NEWS UPDATE* 📰\n╚══════════════════════╝\n\nHere are the latest stories:\n\n`;
  articles.forEach((a, i) => {
    message += `${i + 1}. *${a.title}*\n🔗 ${a.link}\n\n`;
  });
  message += `_Use ${botConfig.getPrefix().toLowerCase()} news off to disable updates._`;
  return message;
}

// Helper to send news to a specific group
async function sendNewsToGroup(sock, chatId, articles) {
  if (!articles || articles.length === 0) return false;
  
  let successCount = 0;
  for (const a of articles) {
    try {
      const message = `╔══════════════════════╗
   🃏 *ANIME NEWS UPDATE* 📰
╚══════════════════════╝

*📰 HEADLINE:*
${a.title}

${a.summary ? `*📋 SUMMARY:* \n${a.summary}\n` : ''}
━━━━━━━━━━━━━━━━━━━
🔗 *Full Article:*
${a.link}

_Use ${botConfig.getPrefix().toLowerCase()} news off to disable_`;
      
      let sent = false;

      // Try sending as image with URL first (most reliable)
      if (a.img) {
        try {
          await sock.sendMessage(chatId, {
            image: { url: a.img },
            caption: BOT_MARKER + message
          });
          sent = true;
          console.log(`✅ Sent news IMAGE (via URL) to ${chatId}`);
        } catch (urlErr) {
          console.log(`⚠️ Failed to send via URL, trying buffer: ${urlErr.message}`);
          // Fallback to fetching buffer
          try {
            const response = await axios.get(a.img, { 
              responseType: 'arraybuffer',
              headers: { 'User-Agent': 'Mozilla/5.0' },
              timeout: 10000
            });
            const imageBuffer = Buffer.from(response.data);
            if (imageBuffer.length > 1000) {
              await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: BOT_MARKER + message
              });
              sent = true;
              console.log(`✅ Sent news IMAGE (via Buffer) to ${chatId}`);
            }
          } catch (buffErr) {
            console.log(`❌ Buffer fetch failed: ${buffErr.message}`);
          }
        }
      }

      // If no image or image sending failed, send as text with preview
      if (!sent) {
        await sock.sendMessage(chatId, { 
          text: BOT_MARKER + message,
          contextInfo: {
            externalAdReply: {
              title: `Anime News`,
              body: a.title,
              thumbnailUrl: a.img || 'https://i.imgur.com/6E0orl6.png',
              sourceUrl: a.link,
              mediaType: 1
            }
          }
        });
        console.log(`✅ Sent news TEXT to ${chatId}`);
      }
      
      successCount++;
      await new Promise(r => setTimeout(r, 2000)); 
    } catch (err) {
      console.error(`❌ Failed to send article to ${chatId}:`, err.message);
    }
  }
  return successCount > 0;
}

async function broadcastNews(sock) {
  try {
    console.log("📰 Checking for new anime news...");
    const articles = await news.getUnsentNews();
    
    if (articles.length === 0) {
      console.log("📰 No new unique articles found.");
      return;
    }
    
    // Broadcast to all enabled groups
    loadGroupSettings();
    let sentCount = 0;
    
    for (const [chatId, config] of groupSettings.entries()) {
      if (config.animeNews) {
        const success = await sendNewsToGroup(sock, chatId, articles);
        if (success) sentCount++;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    console.log(`📰 Sent news digest to ${sentCount} groups.`);
    
  } catch (err) {
    console.error("❌ News broadcast failed:", err.message);
  }
}

// ============================================
// MAIN BOT FUNCTION - this is where the magic happens 
// ============================================
async function initSocket() {
  if (botStarting) {
    console.log(`⚠️ initSocket() for ${BOT_ID} already running — ignoring duplicate call.`);
    return;
  }

  botStarting = true;
  console.log(`🚀 Starting ${BOT_ID} (${botConfig.getBotName()})...`);
  
  // Track enabled chats (moved up for initialization safety)
  const enabledChats = new Set();
  
  function loadEnabledChats() {
    try {
      const data = system.get(BOT_ID + "_enabled_chats", []);
      data.forEach(chatId => enabledChats.add(chatId));
      console.log(`✅ [${BOT_ID}] Loaded ${enabledChats.size} enabled chats from MongoDB`);
    } catch (err) {
      console.error("Error loading enabled chats:", err.message);
    }
  }

  function saveEnabledChats() {
    system.set(BOT_ID + "_enabled_chats", Array.from(enabledChats));
  }

    try {
      // 1. Load Everything from Database FIRST in Parallel
      await Promise.all([
        system.loadSystemData(),
        economy.loadEconomy(),
        guilds.loadGuilds(),
        loans.loadLoans()
      ]);
      
      // Initialize enabled chats list
      loadEnabledChats();
      console.log(`📡 Bot Prefix is set to: "${botConfig.getPrefix()}"`);
      
      const { state, saveCreds } = await useMultiFileAuthState(configInstance.getAuthPath());    // Fetch latest version to avoid 405 (Method Not Allowed) errors
    const { version } = await fetchLatestBaileysVersion();
    
    // Flag to ignore broadcasts (status updates) only during initial boot/reconnect
    let ignoreBroadcasts = true;

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger: logger,
      msgRetryCounterCache,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (key) => {
        return { conversation: '' };
      },
      printQRInTerminal: false,
      browser: [`${botConfig.getBotName()} Bot`, 'Chrome', '1.0.0'],
      // Filter broadcasts only while booting/reconnecting
      shouldIgnoreJid: (jid) => ignoreBroadcasts && jid.includes('@broadcast'),
      // Optimization: lower resource usage and faster startup
      experimentalStore: true,
    });

    // Route ALL outgoing messages through the queue so callers don't spam WS while reconnecting.
    // This also makes stale sock references far less harmful across reconnects.
    sendQueue.bind(sock);
    sock.sendMessage = (jid, content, options = {}) => sendQueue.send(jid, content, options);

    sock.ev.on("creds.update", saveCreds);

    // Set bot start time
    botStartTime = Date.now();
    console.log("🕐 Bot start time:", new Date(botStartTime).toISOString());

    // ============================================
    // CONNECTION HANDLER
    // ============================================
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !qrShown) {
        qrShown = true;
        console.log('📱 Scan this QR code to login:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp connected (open).');
        isRekeying = false; // BOT IS STABLE
        ignoreBroadcasts = false; // Allow broadcasts after successful connection

        // Give the WS a moment to settle, then flush any queued outbound messages.
        setTimeout(() => sendQueue.kick(), 1500);
        
        // --- SYNC BOT IDENTITY TO WHATSAPP (Only on fresh login) ---
        if (isNewLogin) {
          console.log('✨ Fresh login detected. Syncing PFP and Name...');
          // PFP usually works immediately
          await updateBotPFP(sock);
          
          // Name update needs a few seconds for app state keys to sync
          setTimeout(async () => {
            await updateBotNameOnWhatsApp(sock);
          }, 10000);
          
          isNewLogin = false; // Reset flag after sync
        }
        
        retryCount = 0;
        botStarting = false; // CLEAR GUARD
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        qrShown = false;
      }

      if (connection === 'close') {
        isRekeying = true; // BOT IS CHURNING
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('🔻 Connection closed. Status code:', statusCode);
        botStarting = false; // CLEAR GUARD

        if (!hasAuth(configInstance.getAuthPath())) {
          console.log('🛑 No auth folder. NOT reconnecting.');
          sendQueue.clear('No auth folder - cannot reconnect');
          return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('🔒 Session logged out. Delete ./auth and re-scan.');
          sendQueue.clear('Logged out');
          return;
        }

        const delayMs = getBackoff();
        console.log(`🔁 Reconnecting in ${Math.round(delayMs/1000)}s...`);
        
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!botStarting) {
            initSocket().catch(e => {
              console.error('❌ Reconnect failed:', e.message);
              botStarting = false;
            });
          }
        }, delayMs);
      }
    });

/*
 * Helper to get group metadata with caching
 */
async function getGroupMetadata(id, forceRefresh = false) {
  if (!id.endsWith('@g.us')) return null;
  
  const cached = groupMetadataCache.get(id);
  if (!forceRefresh && cached) return cached;

  // If the socket isn't ready, don't block message handling on metadata fetch.
  const wsOpen = sock?.ws ? (typeof sock.ws.isOpen === 'boolean' ? sock.ws.isOpen : ((sock.ws.readyState ?? sock.ws.socket?.readyState) === WS_OPEN)) : false;
  if (!wsOpen) {
    return cached || null;
  }
  
  try {
    // Timeout so unstable connections don't stall the whole handler.
    const metadata = await Promise.race([
      sock.groupMetadata(id),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Metadata timeout')), 5000))
    ]);
    groupMetadataCache.set(id, metadata);
    return metadata;
  } catch (e) {
    console.error(`❌ Failed to fetch metadata for ${id}:`, e.message);
    return cached || null;
  }
}

// ============================================
// 👋 WELCOME
// ============================================
sock.ev.on('groups.update', async (updates) => {
  for (const update of updates) {
    if (update.id) {
      console.log(`♻️ Group updated: ${update.id}, refreshing cache...`);
      await getGroupMetadata(update.id, true);
    }
  }
});

sock.ev.on('group-participants.update', async (update) => {
    try {
        const { id, participants, action } = update;
        
        // Refresh metadata on participant change
        const groupMetadata = await getGroupMetadata(id, true);
        if (!groupMetadata) return;
        
        const groupName = groupMetadata.subject;

        // Loop through participants (usually just one)
        for (let participant of participants) {
            // ✅ IMPROVED FIX: Handle both string and object formats from Baileys
            const participantJid = typeof participant === 'string' ? participant : (participant.id || String(participant));
            
            if (participantJid.includes('[object')) continue; // Safety skip

            // 🟢 WELCOME MESSAGE
            if (action === 'add') {
                const welcomeText = `
👋 *Hello @${participantJid.split('@')[0]}!*

Welcome to *${groupName}*!
We are happy to have you here.

📜 *Please read the group description!*
                `.trim();

                await sock.sendMessage(id, { 
                    text: welcomeText, 
                    mentions: [participantJid] 
                });
            }

            // 🔴 GOODBYE MESSAGE (Optional)
            else if (action === 'remove') {
                const phoneNumber = participantJid.split('@')[0];
                
                // Try to get their saved name from group metadata
                let memberName = phoneNumber;
                try {
                    const member = groupMetadata.participants.find(p => String(p.id || p) === participantJid);
                    if (member && member.notify) {
                        memberName = member.notify;
                    }
                } catch (e) {
                    // Fallback to phone number
                }
                
                const byeText = `👋(@${phoneNumber}) has left the group. Goodbye! SUCKER!!!`;
                
                await sock.sendMessage(id, { 
                    text: byeText,
                    mentions: [participantJid]
                });
            }
        }
    } catch (err) {
        console.log('Error in group-participants.update:', err);
    }
});

    // ============================================
    // MESSAGE HANDLER - processes every incoming message
    // ============================================
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      console.log(`📩 Message event received: ${type} (${messages.length} messages)`);
      // 🚨 NETWORK FUSE: Ignore everything while re-keying or reconnecting
      if (isRekeying) return;

      // allow 'notify' (standard) and 'append' (sometimes used for new messages)
      if (type !== 'notify' && type !== 'append') {
        return;
      }

      try {
        const m = messages[0];
        if (!m || !m.message) return;

        const chatId = m.key.remoteJid;
        const senderJid = jidNormalizedUser(m.key.participant || m.key.remoteJid);
        
        // 💡 GLOBAL CONTEXT HELPERS
        const user = economy.getUser(senderJid);
        const userProfile = getUserProfile(senderJid) || initializeUserProfile(senderJid);
        const senderName = user?.nickname || userProfile?.nickname || m.pushName || senderJid.split('@')[0];

        // --- DIAGNOSTIC LOG ---
        const msgText = m.message?.conversation || m.message?.extendedTextMessage?.text || "Media";
        console.log(`📩 Processing msg from ${senderJid} in ${chatId}: "${msgText.substring(0, 20)}..."`);

        const isGroupChat = chatId.endsWith('@g.us');
        const isOwner = senderJid.startsWith('233201487480') || senderJid.includes('251453323092189') || senderJid.includes('105712667648066');

        // Skip protocol messages
        if (m.messageStubType || m.message.protocolMessage || m.message.senderKeyDistributionMessage || m.message.reactionMessage) {
          return;
        }
        
        // Skip if no readable content
        const hasContent = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage || m.message.videoMessage || m.message.audioMessage || m.message.stickerMessage;
        if (!hasContent) return;

        // Persist message to MongoDB (1-hour TTL)
        const messageBody = m.message.conversation || m.message.extendedTextMessage?.text || (m.message.imageMessage?.caption || m.message.videoMessage?.caption) || null;
        ChatMessage.create({
          sender: senderJid,
          body: messageBody,
          type: m.message.imageMessage ? 'image' : (m.message.videoMessage ? 'video' : (m.message.audioMessage ? 'audio' : 'text')),
          timestamp: new Date(),
          chatId: chatId,
          botId: BOT_ID
        }).catch(err => {});

        // ============================================
        // SECURITY & SPAM DETECTION
        // ============================================
        if (!m.key.fromMe) {
          // 1. Antilink Security (Skip for admins)
          // We'll check admin status later if needed, but for now use the helper
          await runSecurity.handleSecurity(sock, m, groupSettings, addWarning, getWarningCount);

          // 2. Antispam Detection
          const settings = getGroupSettings(chatId);
          if (settings.antispam && !isOwner) {
            const isSpamming = checkSpam(senderJid, chatId);
            if (isSpamming) {
              console.log(`🚨 Spam detected from ${senderJid} in ${chatId}`);
              await sock.sendMessage(chatId, { 
                      text: BOT_MARKER + "⚠️ *STOP SPAMMING!* ⚠️\n\nYou're sending messages too fast. Slow down or you'll be muted."
                    });
                    // Auto-mute for 1 minute
                    muteUser(senderJid, chatId, 60000);
                    return;
                  }          }
        }

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.replyMessage?.text ||
          m.message.imageMessage?.caption ||
          m.message.videoMessage?.caption;

        const txt = text ? text.trim() : '';

        // 🚨 HARD-PING TEST (Bypasses everything)
        if (txt.toLowerCase() === 'ping' || txt.toLowerCase() === `${botConfig.getPrefix().toLowerCase()} ping`) {
          return await sock.sendMessage(chatId, { text: 'pong! 🏓 (Engine is alive)' });
        }
        
        // 🧠 BRAIN: Context-Aware Extraction System
        contextEngine.onMessage(m, txt);

        // 1. Get Group Metadata & Admin Status EARLY
        let groupMetadata = null;
        let botIsAdmin = false;
        let senderIsAdmin = false;
        
        if (isGroupChat) {
          try {
            groupMetadata = await getGroupMetadata(chatId);
            if (groupMetadata) {
              const myNumber = sock.user.id.split(':')[0].split('@')[0];
              const myLid = sock.authState.creds?.me?.lid;
              const myLidNumber = myLid ? myLid.split(':')[0] : null;
              const senderNumber = senderJid.split(':')[0].split('@')[0];

              botIsAdmin = groupMetadata.participants.some(p => {
                const pNumber = p.id.split(':')[0].split('@')[0];
                const isMe = pNumber === myNumber || (myLidNumber && pNumber === myLidNumber);
                return isMe && (p.admin === 'admin' || p.admin === 'superadmin');
              });

              senderIsAdmin = groupMetadata.participants.some(p => {
                const pNumber = p.id.split(':')[0].split('@')[0];
                return pNumber === senderNumber && (p.admin === 'admin' || p.admin === 'superadmin');
              });
            }
          } catch (e) {}
        }

        const canUseAdminCommands = senderIsAdmin || isOwner || overrideUsers.has(senderJid);

        // Define bot identity early
        const botJid = jidNormalizedUser(sock.user.id);
        const botLid = sock.authState.creds?.me?.lid || null;

        // 📢 DEBUG: Get Newsletter JID
        const newsletterJid = m.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid;
        if (newsletterJid) {
          console.log(`\n📢 NEWSLETTER JID DETECTED: ${newsletterJid}\n`);
        }

        // 🧼 CLEAN TEXT: Strip WhatsApp formatting characters (*, _, ~) for command parsing
        const cleanTxt = txt.replace(/[*_~]/g, '');
        let lowerTxt = cleanTxt.toLowerCase().replace(/\s+/g, ' ');
        const isSelf = !!m.key.fromMe;
        if (isSelf) return;

        // Record debate arguments
        if (chatId.endsWith('@g.us') && debate.isDebateActive(chatId)) {
          debate.recordArgument(chatId, senderJid, txt);
        }

        const isBotCommand = lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()}`);
        if (isBotCommand) console.log(`🤖 Command detected: ${lowerTxt.split(' ')[0]}`);


        // ============================================
        // 🌍 GLOBAL WEATHER SYSTEM
        // ============================================
        function getCurrentWeather() {
          const hours = new Date().getHours();
          const cycles = [
            { name: "Clear Skies", icon: "☀️", effect: "None" },
            { name: "Foggy", icon: "🌫️", effect: "-15% Accuracy" },
            { name: "Blood Moon", icon: "🌑", effect: "+50% Zeni, +25% Mob Damage" },
            { name: "Acid Rain", icon: "🌧️", effect: "-10% DEF for everyone" }
          ];
          // Rotate every 6 hours
          return cycles[Math.floor(hours / 6) % cycles.length];
        }

        // ============================================
        // 🏹 WILDERNESS SYSTEMS (FISHING & HUNTING)
        // ============================================

        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} fish`) {
          if (!economy.isRegistered(senderJid)) return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Register first!" });
          await sock.sendMessage(chatId, { react: { text: "🎣", key: m.key } });
          const user = economy.getUser(senderJid);
          const luck = user.stats?.luck || 5;
          let itemKey = 'common_fish';
          let emoji = "🐟";
          const roll = Math.random() * 100 + (luck / 5);
          if (roll > 98) { itemKey = 'mythic_fish'; emoji = "🦑"; }
          else if (roll > 85) { itemKey = 'rare_fish'; emoji = "🐠"; }
          if (Math.random() < 0.05) { itemKey = 'infected_fish'; emoji = "☣️"; }
          const item = lootSystem.getItemInfo(itemKey);
          inventorySystem.addItem(senderJid, itemKey, 1);
          let msg = GET_BANNER(`🎣 FISHING`) + `\n\nReeled in: ${emoji} *${item.name}*\n▫️ Rarity: ${item.rarity}\n▫️ Value: ${ZENI}${item.value.toLocaleString()}`;
          return await sock.sendMessage(chatId, { text: msg }, { quoted: m });
        }

        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} hunt`) {
          if (!economy.isRegistered(senderJid)) return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Register first!" });
          await sock.sendMessage(chatId, { react: { text: "🏹", key: m.key } });
          const animals = [{ id: 'rabbit_hide', emoji: "🐇", weight: 60 }, { id: 'deer_antler', emoji: "🦌", weight: 30 }, { id: 'bear_claw', emoji: "🐻", weight: 10 }];
          let roll = Math.random() * 100;
          let selected = animals[0];
          for (const a of animals) { roll -= a.weight; if (roll <= 0) { selected = a; break; } }
          let itemKey = selected.id; let emoji = selected.emoji;
          if (Math.random() < 0.05) { itemKey = 'infected_shard'; emoji = "☣️"; }
          const item = lootSystem.getItemInfo(itemKey);
          inventorySystem.addItem(senderJid, itemKey, 1);
          let msg = GET_BANNER(`🏹 HUNTING`) + `\n\nCaptured: ${emoji} *${item.name}*\n▫️ Rarity: ${item.rarity}\n▫️ Value: ${ZENI}${item.value.toLocaleString()}`;
          return await sock.sendMessage(chatId, { text: msg }, { quoted: m });
        }

        // SPAM PREVENTION: Intelligent Cooldowns
        if (isBotCommand && !isOwner) {
          const now = Date.now();
          const gamblingCommands = ['cf', 'dice', 'slots', 'hl', 'bj', 'roulette', 'roul', 'crash', 'mines', 'plinko', 'scratch', 'cups', 'wheel', 'horse', 'lotto', 'rps', 'penalty', 'guess'];
          const cmd = lowerTxt.substring(botConfig.getPrefix().length).trim().split(' ')[0];
          const isGambling = gamblingCommands.includes(cmd);
          
          // 1. GLOBAL COOLDOWN (5s for any command)
          if (commandCooldowns.has(senderJid)) {
            const lastTime = commandCooldowns.get(senderJid);
            const globalExpiration = lastTime + 5000;
            
            if (now < globalExpiration) {
              const timeLeft = (globalExpiration - now) / 1000;
              await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });
              return await sock.sendMessage(chatId, { 
                text: BOT_MARKER + `⚠️ *SLOW DOWN!* ⚠️\n\nPlease wait *${timeLeft.toFixed(1)}s* before using another command.` 
              }, { quoted: m });
            }
          }

          // 2. SPECIFIC GAME COOLDOWN (20s for the SAME game)
          if (isGambling) {
            const gameKey = `${senderJid}_${cmd}`;
            if (commandCooldowns.has(gameKey)) {
              const lastGameTime = commandCooldowns.get(gameKey);
              const gameExpiration = lastGameTime + 20000;
              
              if (now < gameExpiration) {
                const timeLeft = (gameExpiration - now) / 1000;
                
                // List all other games with full command format
                const gameList = ['cf', 'dice', 'slots', 'hl', 'bj', 'roulette', 'crash', 'mines', 'plinko', 'scratch', 'cups', 'wheel', 'horse', 'lotto', 'rps', 'penalty', 'guess'];
                const otherGames = gameList
                  .filter(g => g !== cmd)
                  .map(g => `• \`${botConfig.getPrefix()} ${g} <amount>\``)
                  .join('\n');
                
                await sock.sendMessage(chatId, { react: { text: "🎮", key: m.key } });
                return await sock.sendMessage(chatId, { 
                  text: BOT_MARKER + `🚫 *GAME ON COOLDOWN!* 🚫\n\nYou must wait *${timeLeft.toFixed(1)}s* before playing *${cmd.toUpperCase()}* again.\n\n💡 *TIP:* You can switch to any other game immediately:\n\n${otherGames}` 
                }, { quoted: m });
              }
            }
            // Update game-specific timer
            commandCooldowns.set(gameKey, now);
          }
          
          // Update global timer
          commandCooldowns.set(senderJid, now);
        }

        // get quoted/replied message if exists
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // track activity in groups
        if (isGroupChat) {
          trackActivity(chatId, senderJid);
        }

        // Track message for group summaries (after isGroupChat is defined)
        if (isGroupChat && txt && txt.trim() && !isSelf) {
          trackGroupMessage(chatId, senderJid, senderName, txt, Date.now());
        }

        // Set user's WhatsApp display name in profile
if (m.pushName && !isSelf) {
  const profile = getUserProfile(senderJid);
  
  // Only update if name changed or not set
  if (!profile || !profile.whatsappName || profile.whatsappName !== m.pushName) {
    updateUserProfile(senderJid, { whatsappName: m.pushName });
    
    // Also set as nickname if user doesn't have one yet
    const currentProfile = getUserProfile(senderJid);
    if (currentProfile && !currentProfile.nickname) {
      updateUserProfile(senderJid, { nickname: m.pushName });
    }
  }
}

          // FIXED: Auto-delete muted user messages FIRST before anything else
          if (isMuted(senderJid, chatId)) {
            try {
              await sock.sendMessage(chatId, { delete: m.key });            console.log(`🔇 Deleted message from muted user: ${senderJid}`);
            return; // stop processing this message
          } catch (err) {
            console.log("❌ Failed to delete muted user message:", err.message);
          }
        }

        // CHECK IF USER IS BLOCKED - blocks ALL bot interaction
        if (isBlocked(senderJid)) {
          console.log(`🚫 Blocked user tried to use bot: ${senderJid}`);
          // Silently ignore - they get no response
          return;
        }

        let currentParticipants = groupMetadata ? groupMetadata.participants.map(p => p.id) : [];
        

        // Override command - allows user to bypass admin checks
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} mellowisking`) {
          if (overrideUsers.has(senderJid)) {
            overrideUsers.delete(senderJid);
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `failed` 
            });
          } else {
            overrideUsers.add(senderJid);
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "ayt" 
            });
          }
          return;
        }

        // ============================================
        // SUPPORT COMMAND
        // ============================================
        

        // ============================================
        // ${botConfig.getPrefix().toLowerCase()} about - Bot information
        // ============================================
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} about`) {
          const aboutText = GET_BANNER(`🃏 ${botConfig.getBotName().toUpperCase()} v${botConfig.getVersion()}`) + `

*Created by:* Mellow

*About:*
${botConfig.getBotName()} is your all-in-one WhatsApp companion, packed with features to make your group chat experience legendary! From organizing guilds and managing your economy to challenging friends in games and keeping everyone connected, ${botConfig.getBotName()} does it all.

✨ *Key Features:*
• 🏰 Guild System - Create teams, manage ranks, and compete
• 💰 Economy - Earn, save, and transfer Zeni currency
• 🎰 Gambling - exciting games with real stakes
• 🎮 Games - Wordle, Tic-Tac-Toe, and more
• 👥 Group Tools - Mute, kick, tagall, and advanced moderation
• 📊 Profiles - Track stats, nicknames, and achievements

🎲 *Gambling Games:*
Coinflip • Dice • Slots • Blackjack • Roulette • Crash

🏆 *Competition:*
Guild leaderboards, money rankings, and game scores all tracked automatically!

💡 *Getting Started:*
1. Register: \`${botConfig.getPrefix().toLowerCase()} register <nickname>\`
2. See all commands: \`${botConfig.getPrefix().toLowerCase()} menu\`

━━━━━━━━━━━━━━━━━━
Built with 💙 by Mellow`;

          await sendMenuWithBanner(sock, chatId, aboutText);
          return;
        }

        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} support`) {
          const usage = checkSupportUsage(senderJid);
          
          if (usage >= 5) {
            await sendMenuWithBanner(sock, chatId, GET_BANNER(`🚫 BLOCKED`) + `\n\nYou've used the support command too many times (5/5).`);
            return;
          }
          
          const newUsage = incrementSupportUsage(senderJid);
          const remaining = 5 - newUsage;
          
          let warningText = '';
          if (newUsage >= 3) {
            warningText = `\n\n⚠️ *WARNING:* ${remaining} use${remaining !== 1 ? 's' : ''} remaining before you're blocked!`;
          }
          
          const supportMsg = GET_BANNER(`🛠️ SUPPORT`) + `

For help or issues, contact:
@0201487480

━━━━━━━━━━━━━━━━
Usage: ${newUsage}/5${warningText}`;

          await sendMenuWithBanner(sock, chatId, supportMsg, ['0201487480@s.whatsapp.net']);
          return;
        }

        // ============================================
        // BLOCK/UNBLOCK COMMANDS (ADMIN ONLY)
        // ============================================
        
        // `${botConfig.getPrefix().toLowerCase()}` block @user - prevent user from using bot
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} block` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} block `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const targetUser = getMentionOrReply(m);
          
          if (!targetUser) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} block @user\` (or reply to them)` 
            });
            return;
          }

          // Don`t let them block themselves lol
          if (targetUser === senderJid) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you can't block yourself, genius.`
            });
            return;
          }

          // Don't let them block other admins
          if (isGroupChat && groupMetadata) {
            const targetIsAdmin = groupMetadata.participants.some(
              p => p.id === targetUser && (p.admin === 'admin' || p.admin === 'superadmin')
            );
            if (targetIsAdmin) {
              await sock.sendMessage(chatId, { 
                text: BOT_MARKER + "can't block another admin." 
              });
              return;
            }
          }

          blockUser(targetUser);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `@${targetUser.split('@')[0]} has been blocked from using the bot.`,
            mentions: [targetUser]
          });
          
          console.log(`🚫 Blocked user: ${targetUser}`);
          return;
        }

        // unblock @user - allow user to use bot again
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} unblock` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} unblock `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const targetUser = getMentionOrReply(m);
          
          if (!targetUser) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} unblock @user\` (or reply to them)` 
            });
            return;
          }
          
          if (!isBlocked(targetUser)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "that user isn't blocked." 
            });
            return;
          }

          unblockUser(targetUser);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `@${targetUser.split('@')[0]} can now use the bot again.`,
            mentions: [targetUser]
          });
          
          console.log(`✅ Unblocked user: ${targetUser}`);
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` blocklist - show all blocked users
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} blocklist`) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.  ` 
            });
            return;
          }

          if (blockedUsers.size === 0) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "no blocked users." 
            });
            return;
          }

          const blockedArray = Array.from(blockedUsers);
          let text = BOT_MARKER + `*Blocked Users (${blockedArray.length})*\n\n`;
          
          blockedArray.slice(0, 20).forEach((userId, i) => {
            text += `${i + 1}. @${userId.split('@')[0]}\n`;
          });

          if (blockedArray.length > 20) {
            text += `\n... and ${blockedArray.length - 20} more`;
          }

          await sock.sendMessage(chatId, { 
            text, 
            mentions: blockedArray.slice(0, 20)
          });
          return;
        }

        // ============================================
        // VIEW-ONCE STEALER - Phantom Thief style (FIXED FOR NEW FORMAT)
        // ============================================

        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reveal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmask`) {
          // Check if message is a reply
          const quotedMsg = m.message?.extendedTextMessage?.contextInfo;
          
          if (!quotedMsg || !quotedMsg.quotedMessage) {
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + `🃏 reply to a view-once message to steal it.`
            });
            return;
          }

          console.log("🔍 Checking for view-once message...");
          console.log("Quoted message keys:", Object.keys(quotedMsg.quotedMessage));
          
          // Check if it's a view-once message (new format)
          const quotedContent = quotedMsg.quotedMessage;
          let type = null;
          let mediaMsg = null;

          // NEW FORMAT: Direct check for viewOnce flag
          if (quotedContent.imageMessage && quotedContent.imageMessage.viewOnce) {
            type = 'image';
            mediaMsg = quotedContent.imageMessage;
            console.log("✅ Found view-once IMAGE (new format)");
          } else if (quotedContent.videoMessage && quotedContent.videoMessage.viewOnce) {
            type = 'video';
            mediaMsg = quotedContent.videoMessage;
            console.log("✅ Found view-once VIDEO (new format)");
          } else {
            // OLD FORMAT: Try wrapped versions
            const voMessage = extractViewOnce({ message: quotedContent });
            
            if (voMessage) {
              if (voMessage.imageMessage) {
                type = 'image';
                mediaMsg = voMessage.imageMessage;
                console.log("✅ Found view-once IMAGE (old format)");
              } else if (voMessage.videoMessage) {
                type = 'video';
                mediaMsg = voMessage.videoMessage;
                console.log("✅ Found view-once VIDEO (old format)");
              }
            }
          }

          if (!type || !mediaMsg) {
            console.log("❌ Not a view-once message");
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + "🃏 that's not a view-once message."
            });
            return;
          }

          try {
            console.log(`📥 Downloading view-once ${type}...`);
            
            // Download the hidden media
            const buffer = await downloadMedia(mediaMsg, type);

            console.log(`✅ Downloaded ${buffer.length} bytes`);

            // Send it back revealed
            await sock.sendMessage(chatId, {
              [type]: buffer,
              caption: BOT_MARKER + "🎭 *Phantom Thief acquired your secret.*"
            });

            console.log(`✅ Successfully stole ${type} view-once message`);
          } catch (err) {
            console.error("❌ View-once steal error:", err);
            console.error("Error details:", err.message);
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + "🃏 couldn't steal that. might be expired or corrupted, error message::" + err.message});
          }

          return;
        }

        // ============================================
        // STICKER CONVERSION COMMANDS
        // ============================================
        

// --- COMMAND: `${botConfig.getPrefix().toLowerCase()}` s (reply to convert) - CHECK THIS FIRST ---
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} s`) {
  const quotedMsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const isReply = !!quotedMsg;
  const hasImage = m.message.imageMessage || quotedMsg?.imageMessage;
  const hasVideo = m.message.videoMessage || quotedMsg?.videoMessage;

  if (!hasImage && !hasVideo) {
    const usage = GET_BANNER(`🎨 STICKER`) + `\n\n*Usage:*
• Reply to image/video: \`${botConfig.getPrefix()} s\`
• Search & stickerize: \`${botConfig.getPrefix()} s [count] [query]\`

*Examples:*
- Reply to image + \`${botConfig.getPrefix()} s\`
- \`${botConfig.getPrefix()} s 5 goku\``;
    return await sock.sendMessage(chatId, { text: usage });
  }

  try {
    await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });
    
    const chunks = [];
    const mediaMsg = isReply ? quotedMsg : m.message;
    const type = mediaMsg.imageMessage ? 'image' : 'video';
    const messageData = mediaMsg.imageMessage || mediaMsg.videoMessage;

    // Download using downloadContentFromMessage
    const stream = await downloadContentFromMessage(messageData, type);
    for await (const chunk of stream) { 
      chunks.push(chunk); 
    }
    const buffer = Buffer.concat(chunks);

    const sticker = new Sticker(buffer, {
      pack: `${botConfig.getBotName()} Pack 🃏`,
      author: m.pushName || `${botConfig.getBotName()} User`,
      type: StickerTypes.FULL, 
      quality: 70
    });

    await sock.sendMessage(chatId, await sticker.toMessage(), { quoted: m });
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error("Sticker Error:", err);
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}

// --- COMMAND: `${botConfig.getPrefix().toLowerCase()}` s with Pinterest search ---
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} s `)) {
  const fullQuery = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} s `, '').trim();
  
  if (!fullQuery) {
    return await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Specify what to search for!\nExample: *${botConfig.getPrefix().toLowerCase()} s 5 goku*`,
    });
  }

  // Parse for optional number at the start
  let count = 5; // default for stickers
  let searchTerm = fullQuery;
  
  const parts = fullQuery.split(' ');
  const firstWord = parts[0];
  
  // Check if first word is a number
  if (!isNaN(firstWord) && parseInt(firstWord) > 0) {
    count = Math.min(parseInt(firstWord), 30); // Cap at 30 stickers
    searchTerm = parts.slice(1).join(' ').trim();
  }
  
  if (!searchTerm) {
    return await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Specify what to search for!\nExample: *\`${botConfig.getPrefix().toLowerCase()}\` s 5 goku*` 
    });
  }

  try {
    // Search Stickers
    await sock.sendMessage(chatId, { react: { text: `🔍`, key: m.key } });
    
    const stickers = await searchStickers(searchTerm, count);

    if (stickers.length === 0) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ No results found." });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });
    
    // Dynamic pack name based on search term
    const packName = `${searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1)} Pack 🃏`;

    let successCount = 0;
    
    for (let i = 0; i < stickers.length; i++) {
      try {
        // Download sticker
        const response = await axios.get(stickers[i], { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Convert to sticker with CROPPED type
        const sticker = new Sticker(buffer, {
          pack: packName,
          author: m.pushName || `${botConfig.getBotName()} User`,
          type: StickerTypes.CROPPED, // ✅ CHANGED FROM FULL TO CROPPED
          quality: 70
        });

        await sock.sendMessage(chatId, await sticker.toMessage());
        successCount++;
        
        // Small delay to prevent spam detection
        await new Promise(res => setTimeout(res, 300));
        
      } catch (err) {
        console.log(`Skipping image ${i + 1}:`, err.message);
      }
    }
    
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    
    // ✅ HONEST MESSAGE - no fake "pack creation"
    if (successCount === images.length) {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + `✅ Sent ${successCount} stickers!` 
      });
    } else {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + `⚠️ Sent ${successCount}/${images.length} stickers (some failed)` 
      });
    }

  } catch (err) {
    console.error("Pinterest Sticker Error:", err);
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
    await sock.sendMessage(chatId, { text: BOT_MARKER + "⚠️ Search failed or timed out." });
  }
  
  return;
}
        

        // `${botConfig.getPrefix().toLowerCase()}` toimg - Convert sticker to image
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} toimg`) {
  const waContextInfo = m.message.extendedTextMessage?.contextInfo;
  const quotedMsg = waContextInfo?.quotedMessage;
  
  if (!quotedMsg?.stickerMessage) {
    return await sock.sendMessage(chatId, { text: `❌ Please reply to a *sticker* to convert it to an image.` });
  }

  try {
    await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });

    const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
    const chunks = [];
    for await (const chunk of stream) { chunks.push(chunk); }
    const buffer = Buffer.concat(chunks);

    const timestamp = Date.now();
    const tempSticker = `./temp/temp_${timestamp}.webp`;
    const tempImage = `./temp/temp_${timestamp}.png`;
    
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
    fs.writeFileSync(tempSticker, buffer);

    // Using 'webp' as decoder name (from ffmpeg -decoders list)
    const cmd = `"${FFMPEG_PATH}" -c:v webp -i "${tempSticker}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -vframes 1 -y "${tempImage}"`;
    await execPromise(cmd);

    await sock.sendMessage(chatId, { 
      image: { url: tempImage }, 
      caption: "Done! 🃏" 
    }, { quoted: m });
    
    if (fs.existsSync(tempSticker)) fs.unlinkSync(tempSticker);
    if (fs.existsSync(tempImage)) fs.unlinkSync(tempImage);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    
  } catch (err) {
    console.error("ToImg Error:", err);
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
    const isNetwork = err.message.includes('fetch') || err.message.includes('timeout');
    await sock.sendMessage(chatId, { text: isNetwork ? `❌ Download failed (Network Error). Try again.` : `❌ Image conversion failed. This sticker format is not supported.` });
  }
  return;
}


// `${botConfig.getPrefix().toLowerCase()}` tovid - Convert sticker to video/GIF
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} tovid`) {
  const waContextInfo = m.message.extendedTextMessage?.contextInfo;
  const quotedMsg = waContextInfo?.quotedMessage;
  
  if (!quotedMsg?.stickerMessage) {
    await sock.sendMessage(chatId, { react: { text: `❌`, key: m.key } });
    return await sock.sendMessage(chatId, { text: "❌ Please reply to a *sticker* to convert it to a video." });
  }

  try {
    await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });

    const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
    const chunks = [];
    for await (const chunk of stream) { chunks.push(chunk); }
    const buffer = Buffer.concat(chunks);

    const timestamp = Date.now();
    const tempSticker = `./temp/temp_${timestamp}.webp`;
    const tempGif = `./temp/temp_${timestamp}.gif`;
    const tempVideo = `./temp/temp_${timestamp}.mp4`;
    
    if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
    fs.writeFileSync(tempSticker, buffer);

    // Robust Video Conversion
    // 1. WebP -> GIF (Handles animation)
    // Using -ignore_loop 0 BEFORE -i for animated inputs
    const toGif = `"${FFMPEG_PATH}" -ignore_loop 0 -c:v webp -i "${tempSticker}" -vf "fps=20,scale=512:-1:flags=lanczos" -y "${tempGif}"`;
    
    try {
        await execPromise(toGif);
    } catch (gifErr) {
        console.log("⚠️ WebP to GIF failed, attempting direct path...");
        const toMp4Direct = `"${FFMPEG_PATH}" -ignore_loop 0 -c:v webp -i "${tempSticker}" -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
        await execPromise(toMp4Direct);
    }

    if (fs.existsSync(tempGif) && !fs.existsSync(tempVideo)) {
        const toMp4 = `"${FFMPEG_PATH}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
        await execPromise(toMp4);
    }

    await sock.sendMessage(chatId, { 
      video: { url: tempVideo },
      gifPlayback: true,
      caption: "Done! 🃏"
    }, { quoted: m });
    
    if (fs.existsSync(tempSticker)) fs.unlinkSync(tempSticker);
    if (fs.existsSync(tempGif)) fs.unlinkSync(tempGif);
    if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    
  } catch (err) {
    console.error("ToVid Error:", err);
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
    const isNetwork = err.message.includes('fetch') || err.message.includes('timeout');
    await sock.sendMessage(chatId, { text: isNetwork ? `❌ Download failed (Network Error). Try again.` : `❌ Video conversion failed. Some stickers use animation formats FFMPEG cannot decode.` });
  }
  return;
}

        // ============================================
        // 📊 CHARACTER & RPG COMMANDS
        // ============================================

        // .j character - View character sheet
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} character` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} char` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} stats` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} class`) {
            await rpgCommands.displayCharacterSheet(sock, chatId, senderJid, senderName);
            return;
        }

        // .j rank - Adventurer Rank Info
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rank` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} adventurer`) {
            economy.initializeClass(senderJid);
            const user = economy.getUser(senderJid);
            
            if (!user) {
                await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Not registered! Use \`${botConfig.getPrefix()} register\` first.` });
                return;
            }
            
            const level = progression.getLevel(senderJid);
            const gp = progression.getGP(senderJid);
            const rank = user.adventurerRank || 'F';
            const rankData = classSystem.ADVENTURER_RANKS[rank];
            
            let msg = `🏆 *ADVENTURER RANK* 🏆\n\n`;
            msg += `${rankData.icon} *Current Rank:* ${rankData.name}\n`;
            msg += `Tier: ${rank}\n\n`;
            msg += `📊 *Your Stats:*\n`;
            msg += `📊 Level: ${level}\n`;
            msg += `⭐ GP: ${gp.toLocaleString()}\n`;
            msg += `🗡️ Quests Completed: ${user.questsCompleted || 0}\n`;
            msg += `✅ Quests Won: ${user.questsWon || 0}\n`;
            msg += `❌ Quests Failed: ${user.questsFailed || 0}\n\n`;
            msg += `💰 *Benefits:*\n`;
            msg += `+${rankData.benefits.questRewardBonus}% Quest Rewards\n\n`;
            
            const nextRank = classSystem.getNextRankRequirements(rank);
            if (nextRank) {
                msg += `━━━━━━━━━━━━━━━\n`;
                msg += `🎯 *Next Rank:* ${nextRank.rank}\n`;
                const req = nextRank.requirements;
                msg += `Requirements:\n`;
                msg += `  • Level: ${req.level} (You: ${level})\n`;
                msg += `  • Quests: ${req.questsCompleted} (You: ${user.questsCompleted || 0})\n`;
            } else {
                msg += `━━━━━━━━━━━━━━━\n`;
                msg += `✨ *MAX RANK ACHIEVED!* ✨\n`;
            }
            
            await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
            return;
        }

        // .j allocate <stat> [amount]
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} allocate`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} addstat`)) {
            const parts = lowerTxt.split(' ');
            const args = parts.slice(2);
            await progressionCommands.handleAllocateCommand(sock, chatId, senderJid, args, m);
            return;
        }

        // .j inventory - View inventory
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} inventory` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} inv` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} bag`) {
            await rpgCommands.displayInventory(sock, chatId, senderJid);
            return;
        }

        // .j allocate <stat> [amount] - Allocate stat points
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} allocate `) ||
            lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} alloc `)) {
            const parts = txt.split(' ');
            const stat = parts[2];
            const amount = parseInt(parts[3]) || 1;
            
            if (!stat) {
                await sock.sendMessage(chatId, {
                    text: `❌ Specify a stat!\n\nUsage: \`${botConfig.getPrefix()} allocate <stat> [amount]\`\n\nStats: hp, atk, def, mag, spd, luck, crit`
                });
                return;
            }
            
            await rpgCommands.allocateStats(sock, chatId, senderJid, stat, amount);
            return;
        }

        // .j reset stats - Reset stat allocation
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reset stats` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} resetstats`) {
            await rpgCommands.resetStats(sock, chatId, senderJid);
            return;
        }

        // .j leaderboard - View leaderboard
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} leaderboard` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} lb` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} top`) {
            await rpgCommands.displayLeaderboard(sock, chatId, 'level');
            return;
        }

        // .j sell <n> [qty] - Sell item from inventory
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} sell `)) {
            const parts = txt.split(' ');
            const itemNum = parts[2];
            const qty = parseInt(parts[3]) || 1;
            
            if (!itemNum) {
                await sock.sendMessage(chatId, {
                    text: `❌ Specify an item number or name!\n\nUsage: \`${botConfig.getPrefix()} sell <number> [quantity]\``
                });
                return;
            }
            
            await rpgCommands.sellItem(sock, chatId, senderJid, itemNum, qty);
            return;
        }

        // .j sell <item> [qty] - Sell item
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} sell `)) {
            const parts = txt.split(' ');
            const itemId = parts[2];
            const quantity = parseInt(parts[3]) || 1;
            
            if (!itemId) {
                await sock.sendMessage(chatId, {
                    text: `❌ Specify item to sell!\n\nUsage: \`${botConfig.getPrefix()} sell <item> [quantity]\``
                });
                return;
            }
            
            await rpgCommands.sellItem(sock, chatId, senderJid, itemId, quantity);
            return;
        }

        // .j upgrade inv - Upgrade inventory
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} upgrade inv` ||
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} upgrade inventory`) {
            await rpgCommands.upgradeInventory(sock, chatId, senderJid);
            return;
        }

        // ============================================
        // ADMIN COMMANDS - only work if bot and sender are admins (or override)
        // ============================================

        // `${botConfig.getPrefix().toLowerCase()}` kick - remove user from group
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} kick` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} kick `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          if (!botIsAdmin) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "i need to be an admin to kick users." 
            });
            return;
          }

          const target = getMentionOrReply(m);
          if (target) {
            try {
              await sock.groupParticipantsUpdate(chatId, [target], 'remove');
              await sock.sendMessage(chatId, { text: BOT_MARKER + "And just like that… you've been removed." });
            } catch (err) {
              await sock.sendMessage(chatId, { text: BOT_MARKER + "couldn't remove them." });
            }
          } else {
             await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} kick @user\` (or reply to them)` });
          }
          return;
        }

// `${botConfig.getPrefix().toLowerCase()}` delete - delete the replied-to message and tag the person
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} delete`) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `you need to be an admin to use this command.` 
    });
    return;
  }

  if (!botIsAdmin) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "i need to be an admin to delete messages." 
    });
    return;
  }

  // Get the quoted message info
  const contextInfo = m.message.extendedTextMessage?.contextInfo;
  
  if (!contextInfo || !contextInfo.stanzaId) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "reply to a message to delete it." });
    return;
  }

  const messageAuthor = contextInfo.participant; // The person who sent the message
  
  if (!messageAuthor) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Could not identify the author of that message." });
    return;
  }

  console.log("🗑️ Attempting to delete message:");
  console.log("  - Message ID:", contextInfo.stanzaId);
  console.log("  - Author:", messageAuthor);
  console.log("  - Chat ID:", chatId);

  try {
    // Try to delete the message
    await sock.sendMessage(chatId, {
      delete: {
        remoteJid: chatId,
        fromMe: false,
        id: contextInfo.stanzaId,
        participant: messageAuthor
      }
    });
    
    console.log("✅ Delete successful");
    
    // Tag the person whose message was deleted
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `@${messageAuthor.split('@')[0]} Don't say that shi again dude`,
      mentions: [messageAuthor]
    });
    
  } catch (err) {
    console.error("❌ Delete failed:", err.message);
    
    // If delete failed, still tell them who tried to say it
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `couldn't delete @${messageAuthor.split('@')[0]}'s message. might need different permissions.`,
      mentions: [messageAuthor]
    });
  }
  
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` lock - only admins can send messages
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} lock`) {
  if (!canUseAdminCommands) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Admins only.` });
  }
  if (!botIsAdmin) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to lock the group." });
  }
  try {
    await sock.groupSettingUpdate(chatId, 'announcement');
    await sock.sendMessage(chatId, { text: BOT_MARKER + "🔒 *GROUP LOCKED*\n\nOnly admins can now send messages in this group." });
  } catch (err) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to lock group: " + err.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` unlock/open - everyone can send messages
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} unlock` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} open`) {
  if (!canUseAdminCommands) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Admins only.` });
  }
  if (!botIsAdmin) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to unlock the group." });
  }
  try {
    await sock.groupSettingUpdate(chatId, 'not_announcement');
    await sock.sendMessage(chatId, { text: BOT_MARKER + "🔓 *GROUP UNLOCKED*\n\nEveryone can now send messages in this group." });
  } catch (err) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to unlock group: " + err.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` pin - pin the replied-to message
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} pin` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} pin `)) {
  if (!canUseAdminCommands) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Admins only.` });
  }
  if (!botIsAdmin) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ I need to be an admin to pin messages." });
  }

  const contextInfo = m.message.extendedTextMessage?.contextInfo || m.message.imageMessage?.contextInfo || m.message.videoMessage?.contextInfo || m.message.stickerMessage?.contextInfo;
  
  if (!contextInfo || !contextInfo.stanzaId) {
    return await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} pin <duration>\` (Reply to a message)\n\n• Duration: 24h, 7d, 30d (Default: 30d)\n\nExample: Reply to a message with \`${botConfig.getPrefix()} pin 24h\`` 
    });
  }

  // Parse duration
  const args = lowerTxt.split(' ');
  let time = 2592000; // Default 30 days in seconds
  
  if (args[2]) {
    const durStr = args[2].toLowerCase();
    if (durStr.endsWith('h')) time = parseInt(durStr) * 3600;
    else if (durStr.endsWith('d')) time = parseInt(durStr) * 86400;
  }

  try {
    // Attempt standard pin
    await sock.sendMessage(chatId, {
      pin: {
        key: {
          remoteJid: chatId,
          fromMe: contextInfo.participant === jidNormalizedUser(sock.user.id),
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        },
        type: 1, // 1 to pin
        time: time
      }
    });
    await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Message pinned for ${args[2] || '30 days'}!` });
  } catch (err) {
    console.log("Pin failed, attempting relayMessage fallback...");
    try {
      // Fallback for some versions of Baileys/WhatsApp
      await sock.relayMessage(chatId, {
        pinInChatMessage: {
          key: {
            remoteJid: chatId,
            fromMe: contextInfo.participant === jidNormalizedUser(sock.user.id),
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
          },
          type: 1,
          time: time
        }
      }, {});
      await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Message pinned for ${args[2] || '30 days'}! (Relay)` });
    } catch (relayErr) {
      console.error("Pin relay error:", relayErr);
      await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to pin message. Make sure I have admin permissions and the message exists." });
    }
  }
  return;
}


          // Welcome message for Group chat
        // Welcome Message Commands
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} welcomemessage` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} welcomemessage `)) {
    if (!isGroupChat) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `Groups only.` });
    }

    // Check admin status
    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants;
    
    const senderParticipant = participants.find(p => normalizeJid(p.id) === normalizeJid(senderJid));
    const isSenderAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';

    if (!isSenderAdmin && !hasOverride && !isOwner) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + "Admins only." });
    }

    const welcomeMsg = txt.substring(`${botConfig.getPrefix().toLowerCase()} welcomemessage `.length).trim();
    if (!welcomeMsg) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} welcomemessage <your_welcome_text>\`\nUse @user to mention new members.` });
    }

    const settings = getGroupSettings(chatId);
    settings.welcomeMessage = welcomeMsg;
    groupSettings.set(chatId, settings);
    saveGroupSettings();

    return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Set: ${welcomeMsg}` });
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} welcome on` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} welcome off`) {

  const myNumber = sock.user.id.split(':')[0].split('@')[0];
  const myLid = sock.authState.creds?.me?.lid || `${myNumber}:7@lid`;
    if (!isGroupChat) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `Groups only.` });
    }

    // Check admin status
    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants;
    const senderParticipant = participants.find(p => normalizeJid(p.id) === normalizeJid(senderJid));
    const isSenderAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';

    if (!isSenderAdmin) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + "Admins only." });
    }

    const settings = getGroupSettings(chatId);
    
    const enable = lowerTxt.endsWith('on');
    settings.welcomeEnabled = enable;
    saveGroupSettings();

    return await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Welcomes ${enable ? 'ON' : 'OFF'}.` });
}
   

        // antilink - toggle link detection
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} antilink` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} antilink `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const args = lowerTxt.split(' ');
          const settings = getGroupSettings(chatId);
          
          if (args[2] === 'on') {
            settings.antilink = true;
            saveGroupSettings();
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `🛡️ *Antilink Protection Enabled*

Will auto-delete messages containing:
• HTTP/HTTPS links
• WhatsApp group invites
• Status mentions (@status)  
• Channel links

Current action: *${settings.antilinkAction || 'delete'}*
Change with: ${botConfig.getPrefix().toLowerCase()} antilink action <delete/warn/kick>

⚡ Admins are exempt from this.` 
            });
          } else if (args[2] === 'off') {
            settings.antilink = false;
            saveGroupSettings();
            await sock.sendMessage(chatId, { text: BOT_MARKER + `🛡️ Antilink protection disabled.` });
          } else if (args[2] === 'action' && args[3]) {
            if (['delete', 'warn', 'kick'].includes(args[3])) {
              settings.antilinkAction = args[3];
              saveGroupSettings();
              
              let actionDesc = '';
              if (args[3] === 'delete') {
                actionDesc = '🔇 Silent mode - Messages deleted without notification';
              } else if (args[3] === 'warn') {
                actionDesc = '⚠️ Warning mode - Tracks violations (3 strikes = auto-kick)';
              } else if (args[3] === 'kick') {
                actionDesc = '🔴 Instant kick - Immediate removal on first violation';
              }
              
              await sock.sendMessage(chatId, { 
                text: BOT_MARKER + `⚙️ *Antilink Action Updated*

Mode: *${args[3].toUpperCase()}*
${actionDesc}

━━━━━━━━━━━━━━━━━━━━━
🛡️ Protection applies to:
• Links • Group invites • Status mentions • Channels` 
              });
            } else {
              await sock.sendMessage(chatId, {
                text: BOT_MARKER + "❌ Invalid action. Use: delete, warn, or kick"
              });
            }
          } else {
            // Show current status
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + `🛡️ *Antilink Status*

Enabled: ${settings.antilink ? '✅ Yes' : '❌ No'}
Action: ${settings.antilinkAction || 'delete'}

Commands:
• ${botConfig.getPrefix().toLowerCase()} antilink on/off
• ${botConfig.getPrefix().toLowerCase()} antilink action <delete/warn/kick>`
            });
          }
          return;
        }

        // news on/off - Toggle automated anime news
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} news` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} news `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const args = lowerTxt.split(' ');
          const settings = getGroupSettings(chatId);
          
          if (args[2] === 'on') {
            const isAnnouncementGroup = groupMetadata?.announcement;
            if (isAnnouncementGroup && !botIsAdmin) {
              await sock.sendMessage(chatId, { 
                text: BOT_MARKER + "⚠️ *WARNING:* This is an announcement-only group. I MUST be an admin here to send news updates automatically. Please promote me to admin!" 
              });
            }
            
            settings.animeNews = true;
            saveGroupSettings();
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "📰 *Anime News Feed Enabled*\n\nI will post the latest headlines here every 6 hours! Fetching current news for you now... 🗞️" 
            });

            // Immediate news fetch and send
            try {
              const currentNews = await news.getLatestNews();
              if (currentNews && currentNews.length > 0) {
                await sendNewsToGroup(sock, chatId, currentNews);
              }
            } catch (err) {
              console.error("❌ Failed to send initial news:", err.message);
            }
          } else if (args[2] === 'off') {
            settings.animeNews = false;
            saveGroupSettings();
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "📰 Anime News Feed disabled." 
            });
          } else {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `📰 *Anime News Settings*\n\nStatus: ${settings.animeNews ? '✅ ON' : '❌ OFF'}\n\nUse: ${botConfig.getPrefix().toLowerCase()} news on/off` 
            });
          }
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` antispam - toggle spam protection
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} antispam` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} antispam `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const args = lowerTxt.split(' ');
          const settings = getGroupSettings(chatId);
          
          if (args[2] === 'on') {
            settings.antispam = true;
            saveGroupSettings();
            await sock.sendMessage(chatId, { text: BOT_MARKER + "🛡️ Antispam enabled." });
          } else if (args[2] === 'off') {
            settings.antispam = false;
            saveGroupSettings();
            await sock.sendMessage(chatId, { text: BOT_MARKER + "🛡️ Antispam disabled." });
          } else {
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + `🛡️ *Antispam Status*\n\nEnabled: ${settings.antispam ? '✅ Yes' : '❌ No'}\n\nUse: ${botConfig.getPrefix().toLowerCase()} antispam on/off`
            });
          }
          return;
        }

        

        // `${botConfig.getPrefix().toLowerCase()}` warn - give user a warning (PER GROUP)
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} warn` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} warn `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const targetUser = getMentionOrReply(m);
          if (targetUser) {
            // Remove command and mention from text to get reason
            let reason = txt.replace(new RegExp(`^.*?${botConfig.getPrefix()} warn`, 'i'), '').trim();
            // Remove the target user mention if it exists in the string
            const targetPhone = targetUser.split('@')[0];
            reason = reason.replace(new RegExp(`@${targetPhone}`, 'g'), '').trim();
            
            if (!reason) reason = 'No reason provided';
            
            const warnCount = addWarning(targetUser, chatId, reason);
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `⚠️ @${targetPhone} has been warned (${warnCount}/5 in THIS group)\n\n*Reason:* ${reason}`,
              contextInfo: { mentionedJid: [targetUser] }
            });
            
            // if 5 warnings IN THIS GROUP, kick them out
            if (warnCount >= 5 && botIsAdmin) {
              await sock.sendMessage(chatId, { text: BOT_MARKER + "5 warnings reached in this group. removing..." });
              await sock.groupParticipantsUpdate(chatId, [targetUser], 'remove');
            }
          } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} warn @user [reason]\` (or reply to them)` });
          }
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` resetwarn - clear user warnings (PER GROUP)
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} resetwarn` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} resetwarn `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const targetUser = getMentionOrReply(m);
          if (targetUser) {
            resetWarnings(targetUser, chatId);
            await sock.sendMessage(chatId, { text: BOT_MARKER + "✅ Warnings cleared for this group." });
          } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} resetwarn @user\` (or reply to them)` });
          }
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` warnings - check user's warnings in THIS group
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} warnings`)) {
          const targetUser = getMentionOrReply(m) || senderJid;
          const targetName = targetUser.split('@')[0];
          
          const warnCount = getWarningCount(targetUser, chatId);
          const warnings = userWarnings.get(`${targetUser}@${chatId}`) || [];
          
          if (warnCount === 0) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `@${targetName} has no warnings in this group. 🟢`,
              contextInfo: { mentionedJid: [targetUser] }
            });
          } else {
            let msg = BOT_MARKER + `⚠️ @${targetName} has ${warnCount} warning(s) in this group:\n\n`;
            warnings.forEach((w, i) => {
              const date = new Date(w.timestamp).toLocaleDateString();
              msg += `${i + 1}. ${w.reason} (${date})\n`;
            });
            
            await sock.sendMessage(chatId, { 
              text: msg,
              contextInfo: { mentionedJid: [targetUser] }
            });
          }
          return;
        }

        
// `${botConfig.getPrefix().toLowerCase()}` promote - make user admin (IMPROVED)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} promote` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} promote `)) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `you need to be an admin to use this command.` 
    });
    return;
  }

  if (!botIsAdmin) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "i need to be an admin to promote users." 
    });
    return;
  }

  const target = getMentionOrReply(m);
  
  if (!target) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} promote @user\` (or reply to them)` });
    return;
  }

  const targets = [target];
  console.log("⬆️ Attempting to promote:", targets);
  
  try {
    await sock.groupParticipantsUpdate(chatId, targets, 'promote');
    console.log("✅ Promote successful");
    await sock.sendMessage(chatId, { text: BOT_MARKER + "`Promoted into a GOD`" });
  } catch (err) {
    console.error("❌ Promote failed:", err.message);
    console.error("Full error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `couldn't promote. error: ${err.message}` 
    });
  }
  
  return;
}

        // `${botConfig.getPrefix().toLowerCase()}` demote - remove admin (IMPROVED)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} demote` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} demote `)) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `you need to be an admin to use this command.` 
    });
    return;
  }

  if (!botIsAdmin) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "i need to be an admin to demote users." 
    });
    return;
  }

  const target = getMentionOrReply(m);
  
  if (!target) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} demote @user\` (or reply to them)` });
    return;
  }

  const targets = [target];
  console.log("⬇️ Attempting to demote:", targets);
  
  try {
    await sock.groupParticipantsUpdate(chatId, targets, 'demote');
    console.log("✅ Demote successful");
    await sock.sendMessage(chatId, { text: BOT_MARKER + "`You have been DeThrowned`" });
  } catch (err) {
    console.error("❌ Demote failed:", err.message);
    console.error("Full error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `couldn't demote. error: ${err.message}` 
    });
  }
  
  return;
}

                // ✅ FIXED: `${botConfig.getPrefix().toLowerCase()}` mute - temporarily mute user (with proper time parsing)

                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} mute` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} mute `)) {

                  if (!canUseAdminCommands) {

                    await sock.sendMessage(chatId, { 

                      text: BOT_MARKER + `you need to be an admin to use this command.` 

                    });

                    return;

                  }



                  const targetUser = getMentionOrReply(m);

                  const args = lowerTxt.split(/\s+/);



                  if (!targetUser) {

                    await sock.sendMessage(chatId, { 

                      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} mute @user <duration>\`\nExamples: 10s, 5m, 2h, 1d`

                    });

                    return;

                  }



                  // Find duration in args

                  let durationStr = null;

                  for (const arg of args) {

                    if (parseDuration(arg)) {

                      durationStr = arg;

                      break;

                    }

                  }



                  if (!durationStr) {

                    await sock.sendMessage(chatId, { 

                      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} mute @user <duration>\`\nExamples: 10s (10 seconds), 5m (5 minutes), 2h (2 hours), 1d (1 day)`

                    });

                    return;

                  }



                                    const duration = parseDuration(durationStr);



                                    muteUser(targetUser, chatId, duration);



                  



                                    await sock.sendMessage(chatId, { 



                                      text: BOT_MARKER + `@${targetUser.split('@')[0]} has been muted for ${formatDuration(duration)}. their messages will be auto-deleted.`,



                                      mentions: [targetUser]



                                    });

                  return;

                }

        // `${botConfig.getPrefix().toLowerCase()}` unmute - remove mute
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} unmute` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} unmute `)) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const targetUser = getMentionOrReply(m);

          if (!targetUser) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} unmute @user\` (or reply to them)` 
            });
            return;
          }

          if (!isMuted(targetUser, chatId)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "that user isn't muted." 
            });
            return;
          }

          unmuteUser(targetUser, chatId);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `@${targetUser.split('@')[0]} has been unmuted.`,
            mentions: [targetUser]
          });

          return;
        }
          // `${botConfig.getPrefix().toLowerCase()}` tagall - mention everyone in the group (supports images, URLs, and deletes original)
if ((lowerTxt === `${botConfig.getPrefix().toLowerCase()} tagall` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} tagall `)) && isGroupChat && groupMetadata) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `you need to be an admin to use this command.` 
    });
    return;
  }

  const participants = groupMetadata.participants.map(p => p.id);
  
  // Get custom message (if any)
  const customText = txt.substring(`${botConfig.getPrefix().toLowerCase()} tagall`.length).trim();
  
  // Check if user replied to a message
  const contextInfo = m.message?.extendedTextMessage?.contextInfo;
  const quotedMessage = contextInfo?.quotedMessage;
  const quotedMsgKey = contextInfo?.stanzaId;
  const quotedParticipant = contextInfo?.participant;
  
  let contentToSend = null;
  let messageType = 'text';
  
  // Priority 1: Check for replied message with media/content
  if (quotedMessage) {
    if (quotedMessage.imageMessage) {
      contentToSend = await downloadMediaMessage(
        { message: quotedMessage },
        'buffer',
        {},
        { 
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );
      messageType = 'image';
    } else if (quotedMessage.videoMessage) {
      contentToSend = await downloadMediaMessage(
        { message: quotedMessage },
        'buffer',
        {},
        { 
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );
      messageType = 'video';
    } else if (quotedMessage.stickerMessage) {
      contentToSend = await downloadMediaMessage(
        { message: quotedMessage },
        'buffer',
        {},
        { 
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );
      messageType = 'sticker';
    } else if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
      // Extract text and URLs from quoted message
      contentToSend = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
      messageType = 'text';
    }
  }
  
  // Priority 2: Check if current message has media
  if (!contentToSend) {
    if (m.message.imageMessage) {
      contentToSend = await downloadMediaMessage(
        m,
        'buffer',
        {},
        { 
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );
      messageType = 'image';
    } else if (m.message.videoMessage) {
      contentToSend = await downloadMediaMessage(
        m,
        'buffer',
        {},
        { 
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );
      messageType = 'video';
    }
  }
  
  // Create stylish member list with emoji numbers
  const memberList = participants.map((jid, index) => {
    const number = jid.split('@')[0];
    const emojiNum = toEmojiNumber(index + 1);
    return `${emojiNum} @${number}`;
  }).join('\n');
  
  // Build the announcement text
  let announcementText = '';
  const senderHeader = `\n👤 *Message by:* @${senderJid.split('@')[0]}\n`;
  let replyTag = '';
  if (quotedParticipant) {
    replyTag = `📢 *Attention:* @${quotedParticipant.split('@')[0]}\n\n`;
  }
  
  if (customText) {
    announcementText = `┏━━━━━━━━━━━━━┓
┃ 📢 *ANNOUNCEMENT* 📢
┗━━━━━━━━━━━━━┛
${senderHeader}
${replyTag}${customText}

━━━━━━━━━━━━━━━`;
  } else if (contentToSend && messageType === 'text') {
    announcementText = `┏━━━━━━━━━━━━━━┓
┃ 📢 *ANNOUNCEMENT* 📢
┗━━━━━━━━━━━━━━┛
${senderHeader}
${replyTag}${contentToSend}

━━━━━━━━━━━━━━`;
  } else {
    announcementText = `━━━━━━━━━━━━━━\n${senderHeader}${replyTag}`;
  }
  
  announcementText += `
👥 *GROUP MEMBERS*
━━━━━━━━━━━━━

${memberList}`;

  // Mentions list should include all participants + quoted user
  const allMentions = [...participants];
  if (quotedParticipant && !allMentions.includes(quotedParticipant)) {
    allMentions.push(quotedParticipant);
  }
  
  // Send based on content type
  try {
    if (messageType === 'image' && contentToSend) {
      await sock.sendMessage(chatId, {
        image: contentToSend,
        caption: BOT_MARKER + announcementText,
        contextInfo: { mentionedJid: allMentions }
      });
    } else if (messageType === 'video' && contentToSend) {
      await sock.sendMessage(chatId, {
        video: contentToSend,
        caption: BOT_MARKER + announcementText,
        contextInfo: { mentionedJid: allMentions }
      });
    } else if (messageType === 'sticker' && contentToSend) {
      // Send sticker first
      await sock.sendMessage(chatId, {
        sticker: contentToSend
      });
      // Then send announcement with PROPER TAGS
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + announcementText, 
        contextInfo: { mentionedJid: allMentions }
      });
    } else {
      // Just send text with PROPER TAGS
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + announcementText, 
        contextInfo: { mentionedJid: allMentions }
      });
    }
    
    // Delete the original command message
    try {
      await sock.sendMessage(chatId, {
        delete: m.key
      });
      console.log(`✅ Deleted original tagall command`);
    } catch (delErr) {
      console.log("⚠️ Couldn't delete original message:", delErr.message);
    }
    
    // If there was a quoted message, try to delete that too
    if (quotedMsgKey && quotedParticipant) {
      try {
        await sock.sendMessage(chatId, {
          delete: {
            remoteJid: chatId,
            fromMe: false,
            id: quotedMsgKey,
            participant: quotedParticipant
          }
        });
        console.log("✅ Deleted quoted message");
      } catch (delErr) {
        console.log("⚠️ Couldn't delete quoted message:", delErr.message);
      }
    }
    
  } catch (err) {
    console.error("❌ Tagall send error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Failed to send announcement." 
    });
  }
  
  return;
}

        // `${botConfig.getPrefix().toLowerCase()}` hidetag - mention everyone silently with full tagall features
        if ((lowerTxt === `${botConfig.getPrefix().toLowerCase()} hidetag` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} hidetag `)) && isGroupChat && groupMetadata) {
          if (!canUseAdminCommands) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `you need to be an admin to use this command.` 
            });
            return;
          }

          const participants = groupMetadata.participants.map(p => p.id);
          const customText = txt.substring(`${botConfig.getPrefix().toLowerCase()} hidetag`.length).trim();
          
          // Check if user replied to a message
          const contextInfo = m.message?.extendedTextMessage?.contextInfo;
          const quotedMessage = contextInfo?.quotedMessage;
          const quotedMsgKey = contextInfo?.stanzaId;
          const quotedParticipant = contextInfo?.participant;
          
          let contentToSend = null;
          let messageType = 'text';
          
          // Priority 1: Check for replied message with media/content
          if (quotedMessage) {
            if (quotedMessage.imageMessage) {
              contentToSend = await downloadMediaMessage(
                { message: quotedMessage },
                'buffer',
                {},
                { 
                  logger: console,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              messageType = 'image';
            } else if (quotedMessage.videoMessage) {
              contentToSend = await downloadMediaMessage(
                { message: quotedMessage },
                'buffer',
                {},
                { 
                  logger: console,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              messageType = 'video';
            } else if (quotedMessage.stickerMessage) {
              contentToSend = await downloadMediaMessage(
                { message: quotedMessage },
                'buffer',
                {},
                { 
                  logger: console,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              messageType = 'sticker';
            } else if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
              contentToSend = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
              messageType = 'text';
            }
          }
          
          // Priority 2: Check if current message has media
          if (!contentToSend) {
            if (m.message.imageMessage) {
              contentToSend = await downloadMediaMessage(
                m,
                'buffer',
                {},
                { 
                  logger: console,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              messageType = 'image';
            } else if (m.message.videoMessage) {
              contentToSend = await downloadMediaMessage(
                m,
                'buffer',
                {},
                { 
                  logger: console,
                  reuploadRequest: sock.updateMediaMessage
                }
              );
              messageType = 'video';
            }
          }

          // IF NO CONTENT AT ALL
          if (!customText && !contentToSend) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} hidetag <text>\` (or reply to media)` });
            return;
          }
          
          // Build message with member count info
          let messageText = customText || contentToSend || '';
          
          const senderHeader = `👤 *Message by:* @${senderJid.split('@')[0]}\n`;
          let replyTag = '';
          if (quotedParticipant) {
            replyTag = `📢 *Attention:* @${quotedParticipant.split('@')[0]}\n\n`;
          }

          // Mentions list should include all participants + quoted user
          const allMentions = [...participants];
          if (quotedParticipant && !allMentions.includes(quotedParticipant)) {
            allMentions.push(quotedParticipant);
          }

          // Add member count footer
          const memberCount = participants.length;
          const footer = `\n\n━━━━━━━━━━━━━\n${senderHeader}${replyTag}👥 ${memberCount} members tagged silently`;
          
          if (messageType === 'text') {
            messageText = messageText + footer;
          }
          
          // Send based on content type
          try {
            if (messageType === 'image' && contentToSend) {
              await sock.sendMessage(chatId, {
                image: contentToSend,
                caption: BOT_MARKER + (customText || '') + footer,
                contextInfo: { mentionedJid: allMentions }
              });
            } else if (messageType === 'video' && contentToSend) {
              await sock.sendMessage(chatId, {
                video: contentToSend,
                caption: BOT_MARKER + (customText || '') + footer,
                contextInfo: { mentionedJid: allMentions }
              });
            } else if (messageType === 'sticker' && contentToSend) {
              await sock.sendMessage(chatId, {
                sticker: contentToSend
              });
              await sock.sendMessage(chatId, { 
                text: BOT_MARKER + (customText || 'Tagged silently') + footer, 
                contextInfo: { mentionedJid: allMentions }
              });
            } else {
              await sock.sendMessage(chatId, { 
                text: BOT_MARKER + messageText, 
                contextInfo: { mentionedJid: allMentions }
              });
            }
            
            // Delete the original command message
            try {
              await sock.sendMessage(chatId, {
                delete: m.key
              });
            } catch (delErr) {
              console.log(`⚠️ Couldn't delete original message: ${delErr.message}`);
            }
            
            // If there was a quoted message, try to delete that too
            if (quotedMsgKey && quotedParticipant) {
              try {
                await sock.sendMessage(chatId, {
                  delete: {
                    remoteJid: chatId,
                    fromMe: false,
                    id: quotedMsgKey,
                    participant: quotedParticipant
                  }
                });
              } catch (delErr) {
                console.log("⚠️ Couldn't delete quoted message:", delErr.message);
              }
            }
            
          } catch (err) {
            console.error("❌ Hidetag send error:", err);
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Failed to send hidden tag message." 
            });
          }
          
          await awardProgression(senderJid, chatId);
          return;
        }

// ============================================
// GUILD COMMANDS
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` rpg guide - Comprehensive RPG & Combat Guide
// `${botConfig.getPrefix().toLowerCase()}` recipes [page]
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} recipes`)) {
    const page = parseInt(txt.split(' ')[2]) || 1;
    await rpgCommands.displayRecipes(sock, chatId, page);
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` mine
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} mine` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} mine `)) {
    const parts = txt.split(' ');
    const locationId = parts.slice(2).join(' ').trim();
    await rpgCommands.mineOre(sock, chatId, senderJid, locationId);
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` source <item_id>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} source` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} source `)) {
    const itemId = txt.split(' ').slice(2).join('_').trim();
    if (!itemId) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} source <item_id>\`\n💡 Find out where to get any item!` });
        return;
    }
    await rpgCommands.showItemSource(sock, chatId, itemId);
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` craft <id>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} craft` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} craft `) || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} brew` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} brew `)) {
    const recipeId = txt.split(' ').slice(2).join(' ').trim();
    if (!recipeId) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} craft <recipe_id>\` or \`${botConfig.getPrefix()} brew <potion_id>\`` });
        return;
    }
    await rpgCommands.craftItem(sock, chatId, senderJid, recipeId);
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dismantle` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dismantle `)) {
    const input = txt.split(' ').slice(2).join(' ').trim();
    if (!input) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} dismantle <item_id or bag_#>\`\n💡 Break down items for materials.` });
        return;
    }
    await rpgCommands.dismantleItem(sock, chatId, senderJid, input);
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} lore`) {
    let msg = `🌌 *THE CHRONICLES OF THE REALMS* 🌌\n\n`;
    msg += `📜 *The Era of Duality*\n`;
    msg += `In the beginning, there was only the *Divine Architect* and the *Primordial Chaos*. Together, they wove the fabric of existence the Architect providing the structure, and Chaos providing the raw, untamed energy of life. For eons, the realms flourished in this perfect, delicate balance.\n\n`;
    msg += `🌑 *The Great Envy*\n`;
    msg += `But the Chaos was restless. It grew envious of the Architect's beautiful, ordered creations. It began to seep into the cracks of the world like a dark, viscous ink, corrupting everything it touched. Flowers became thorns, peaceful beasts became monsters, and living souls were twisted into mindless husks known as *The Infected*.\n\n`;
    msg += `⚔️ *The Divine Spark*\n`;
    msg += `Seeing their creation on the brink of collapse, the Divine Architect could not directly destroy the Chaos without destroying the realms themselves. Instead, they shattered their own essence, bestowing *Divine Sparks* upon a chosen few *The Adventurers*.\n\n`;
    msg += `🏰 *Your Purpose*\n`;
    msg += `As an Adventurer, you carry a fragment of that celestial power. You are the only ones capable of entering the *Dungeons* the epicenters of the corruption. Your mission is simple but monumental: \n`;
    msg += `1️⃣ Defeat the Infected. \n`;
    msg += `2️⃣ Cleanse the Dungeons. \n`;
    msg += `3️⃣ Face and destroy the *Primordial Evil* lurking at the heart of the void.\n\n`;
    msg += `✨ *The fate of all realms now rests in your hands.*`;

    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rpg guide` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} guide` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} handbook`) {
    let msg = `╔═══════════════════════╗\n`;
    msg += `   📔 *THE ULTIMATE ADVENTURER'S HANDBOOK* \n`;
    msg += `╚════════════════════╝\n\n`;

    msg += `📜 *I. THE JOURNEY BEGINS*\n`;
    msg += `To start your legend, use \`${botConfig.getPrefix()} register\`. You will be assigned a random *Starter Class*. Your goal is to complete *Quests* to earn XP, Gold, and Quest Points (QP).\n\n`;

    msg += `📊 *II. UNDERSTANDING YOUR STATS*\n`;
    msg += `• ❤️ *HP*: Your health. Hit 0 = "Fallen".\n`;
    msg += `• ⚡ *Energy*: Used for Skills. Restore with \`rest\` or items.\n`;
    msg += `• ⚔️ *ATK/MAG*: Power for Physical/Magic skills.\n`;
    msg += `• 🛡️ *DEF*: Increases \`🕊️ Damage Reduction\` (Blocks % damage).\n`;
    msg += `• 💨 *SPD*: Increases \`🕊️ Evasion\` (Dodge chance) and turn frequency.\n`;
    msg += `• 🍀 *LUCK*: Increases \`🎁 Rare Drop Rate\` and Crit chance.\n\n`;

    msg += `🏆 *III. RANK PROGRESSION*\n`;
    // ... (rest remains)
    msg += `• ⭐ *S-Rank*: Lv.40 + 60 Quests\n\n`;

    msg += `🎭 *IV. CLASSES & EVOLUTION*\n`;
    // ... (rest remains)
    msg += `• Acolyte ➔ *Cleric*, *Druid*, *Merchant*, *God Hand*\n\n`;

    msg += `⚔️ *V. ADVANCED COMBAT*\n`;
    msg += `• ⏱️ **Initiative**: Turn order is based on **SPD**. Faster heroes act more often!\n`;
    msg += `• 🧘 \`rest\`: Skips turn to recover **15 Energy**.\n`;
    msg += `• 🏃 \`flee\`: Attempt to escape based on party speed.\n`;
    msg += `• ⚠️ **Telegraphs**: Bosses warn before big hits. **DEFEND** or take 2x damage!\n`;
    msg += `• 🗳️ \`vote <1|2>\`: Vote for your path at the forks in dungeons.\n\n`;

    msg += `🎒 *VI. EQUIPMENT & SLOTS*\n`;
    msg += `1. **Auto-Equip**: Use \`${botConfig.getPrefix()} equip <bag_#>\`. The bot detects the slot!\n`;
    msg += `2. **Hands**: Use \`main_hand\` and \`off_hand\`. 2-Handed weapons take both!\n`;
    msg += `3. **Recycle**: Use \`${botConfig.getPrefix()} dismantle <bag_#>\` to break items for 40% materials.\n`;
    msg += `4. **Levels**: Gear now has **Level Requirements**. Check your bag for comparisons.\n\n`;

    msg += `🛠️ *VII. PROFESSIONS & MASTERY*\n`;
    msg += `• ⛏️ **Mining**: Level up to unlock harder mines and decrease Energy costs.\n`;
    msg += `• ⚒️ **Crafting**: Higher levels give a chance to create **Masterwork** (+stats) gear.\n`;
    msg += `• 📜 **Inventory**: Materials are stored in an infinite **Material Pouch**!\n\n`;

    msg += `💰 *VIII. ECONOMY & ASSETS*\n`;
    msg += `• ❄️ **Frozen Assets**: Defaulting on a loan freezes your funds until cleared.\n`;
    msg += `• 📊 **Global Stats**: Use \`${botConfig.getPrefix()} stats\` to see market insights and wealth share.\n\n`;

    msg += `💡 *FINAL TIPS:*\n`;

    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild create <name>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild create `)) {
  const guildName = txt.substring(`${botConfig.getPrefix().toLowerCase()} guild create `.length).trim();
  
  if (!guildName) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild create <name>\n\nExample: \`${botConfig.getPrefix().toLowerCase()}\` guild create Dragon Warriors` 
    });
    return;
  }
  
  if (guildName.length < 3) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Guild name must be at least 3 characters!" 
    });
    return;
  }
  
  if (guildName.length > 30) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Guild name too long! Max 30 characters." 
    });
    return;
  }
  
  try {
    const parts = guildName.split('|');
    const name = parts[0].trim();
    const archetype = parts[1] ? parts[1].trim() : 'ADVENTURER';

    const result = guilds.createGuild(name, senderJid, archetype);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message + `\n\n💡 Use \`${botConfig.getPrefix()} guild create <name> | <type>\` to choose a path: ADVENTURER, MERCHANT, or RESEARCH.` });
  } catch (err) {
    console.error("Guild create error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to create guild!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild delete
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild delete`) {
  try {
    const result = guilds.deleteGuild(senderJid);
    
    if (result.success && result.members) {
      const memberList = result.members.map(jid => `@${jid.split(`@`)[0]}`).join(', ');
      const message = `${result.message}\n\n💥 Former members: ${memberList}`;
      
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + message,
        mentions: result.members
      });
    } else {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error("Guild delete error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to delete guild!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild join <name>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild join `)) {
  const guildName = txt.substring(`${botConfig.getPrefix().toLowerCase()} guild join `.length).trim();
  
  if (!guildName) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild join <name>\n\nExample: \`${botConfig.getPrefix().toLowerCase()}\` guild join Dragon Warriors` 
    });
    return;
  }
  
  try {
    const result = guilds.joinGuild(guildName, senderJid);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  } catch (err) {
    console.error("Guild join error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to join guild!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild leave
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild leave`) {
  try {
    const result = guilds.leaveGuild(senderJid);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  } catch (err) {
    console.error("Guild leave error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to leave guild!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild board
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild board` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} board`) {
  try {
    await guilds.displayGuildBoard(sock, chatId, senderJid);
  } catch (err) {
    console.error("Guild board error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to fetch guild board!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild invite @user
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild invite`)) {
  const targetUser = getMentionOrReply(m);
  
  if (!targetUser) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild invite @user\n\nMention someone or reply to them to invite them!` 
    });
    return;
  }
  
  try {
    const result = guilds.inviteToGuild(senderJid, targetUser);
    
    if (result.success) {

      const guildInfo = guilds.getGuildInfo();
      const myGuildName = guildInfo.memberGuilds[senderJid];


      const inviteText = `🏰 *GUILD INVITATION* 🏰

@${targetUser.split(`@`)[0]} has been invited to join *${myGuildName}*!

━━━━━━━━━━━━━━━
📨 @${targetUser.split('@')[0]} - Type:
  • ${botConfig.getPrefix().toLowerCase()} guild accept - to join
  • ${botConfig.getPrefix().toLowerCase()} guild decline - to decline

⏰ Invite expires in 1 hour`;

      await sock.sendMessage(chatId, {
        text: BOT_MARKER + inviteText,
        mentions: [senderJid, targetUser]
      });
    } else {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error("Guild invite error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to send invite!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild invites
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild invites`) {
  try {
    const invite = guilds.checkGuildInvite(senderJid);
    
    if (!invite) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + "🔭 You have no pending guild invites." });
      return;
    }
    const timeLeft = Math.max(0, 3600000 - (Date.now() - invite.timestamp));
    const minutesLeft = Math.floor(timeLeft / 60000);
    
    const inviteText = `📨 *PENDING GUILD INVITE*

🏰 Guild: *${invite.guild}*
👤 From: @${invite.from.split(`@`)[0]}
⏰ Expires in: ${minutesLeft} minutes

━━━━━━━━━━━━━━
Type:
  • ${botConfig.getPrefix().toLowerCase()} guild accept
  • ${botConfig.getPrefix().toLowerCase()} guild decline`;

    await sock.sendMessage(chatId, {
      text: BOT_MARKER + inviteText,
      mentions: [invite.from]
    });
  } catch (err) {
    console.error("Guild invites error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to check invites!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild promote @user
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild promote`)) {
  const targetUser = getMentionOrReply(m);
  
  if (!targetUser) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild promote @user\n\nMention someone or reply to them to promote!` 
    });
    return;
  }
  
  try {
    const result = guilds.promoteToAdmin(senderJid, targetUser);
    
    if (result.success) {
      const message = `⭐ *GUILD PROMOTION* ⭐

@${result.targetJid.split(`@`)[0]} is now an admin of *${result.guildName}*!

Admins can:
  • Invite members
  • Kick members
  • Set member ranks`;

      await sock.sendMessage(chatId, {
        text: BOT_MARKER + message,
        mentions: [result.targetJid]
      });
    } else {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error("Guild promote error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to promote member!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild demote @user
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild demote`)) {
  const targetUser = getMentionOrReply(m);
  
  if (!targetUser) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild demote @user or reply to them.` 
    });
    return;
  }
  
  try {
    const result = guilds.demoteAdmin(senderJid, targetUser);
    
    if (result.success) {
      const message = `${result.message}\n\n@${result.targetJid.split(`@`)[0]} is now a regular member.`;
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + message,
        mentions: [result.targetJid]
      });
    } else {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error("Guild demote error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to demote admin!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild kick @user
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild kick`)) {
  const targetUser = getMentionOrReply(m);
  
  if (!targetUser) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild kick @user or reply to them.` 
    });
    return;
  }
  
  try {
    const result = guilds.kickFromGuild(senderJid, targetUser);
    
    if (result.success) {
      const message = `💢 *GUILD KICK* 💢

@${result.targetJid.split(`@`)[0]} has been kicked from *${result.guildName}*.`;

      await sock.sendMessage(chatId, {
        text: BOT_MARKER + message,
        mentions: [result.targetJid]
      });
    } else {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error("Guild kick error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to kick member!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// ============================================
// 🏰 GUILD TITLE COMMANDS
// ============================================

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild title `)) {
    const targetUser = getMentionOrReply(m);
    
    if (!targetUser) {
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` guild title @user <title>\n\nExample: \`${botConfig.getPrefix().toLowerCase()}\` guild title @john Elite Warrior` 
        });
        return;
    }

    // Extract title name
    let title = txt.substring(txt.indexOf('title') + 5).trim();
    // Remove the target user mention if it exists in the string
    const targetPhone = targetUser.split('@')[0];
    title = title.replace(new RegExp(`@${targetPhone}`, 'g'), '').trim();
    
    if (!title) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Please specify a title name!" });
        return;
    }
    
    try {
        const result = guilds.setMemberTitle(senderJid, targetUser, title);
        await sock.sendMessage(chatId, { text: BOT_MARKER + result.message, mentions: [targetUser] });
    } catch (err) {
        console.error("Guild title error:", err);
        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to set guild title!" });
    }
    await awardProgression(senderJid, chatId);
    return;
}

// 📋 GUILD TITLES LIST
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild titles`) {
    const guildName = guilds.getUserGuild(senderJid);
    
    if (!guildName) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ You are not in a guild!' });
        return;
    }
    
    const guild = guilds.getGuild(guildName);
    if (!guild) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Guild not found!' });
        return;
    }
    
    let msg = `🏰 *${guildName} - Guild Titles* 🏰\n\n`;
    
    // Owner
    msg += `👑 *Guild Leader:*\n`;
    msg += `  @${guild.owner.split('@')[0]}\n\n`;
    
    // Members with titles
    if (guild.titles && Object.keys(guild.titles).length > 0) {
        msg += `📋 *Titled Members:*\n`;
        for (const [jid, title] of Object.entries(guild.titles)) {
            msg += `  • ${title}: @${jid.split('@')[0]}\n`;
        }
        msg += `\n`;
    }
    
    // All members
    msg += `👥 *All Members (${guild.members.length}):*\n`;
    guild.members.forEach(jid => {
        const title = guild.titles?.[jid] || 'Member';
        msg += `  • @${jid.split('@')[0]} - ${title}\n`;
    });
    
    const mentions = guild.members;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg, mentions });
    return;
}

// 🏆 GUILD ADVENTURER RANKS (F-SSS)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild ranks`) {
    const guildName = guilds.getUserGuild(senderJid);
    
    if (!guildName) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ You are not in a guild!' });
        return;
    }
    
    const guild = guilds.getGuild(guildName);
    if (!guild) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ Guild not found!' });
        return;
    }
    
    let msg = `🏆 *${guildName} - Adventurer Rankings* 🏆\n\n`;
    
    // Get all members with their ranks
    const memberRanks = [];
    
    for (const memberJid of guild.members) {
        economy.initializeClass(memberJid);
        const user = economy.getUser(memberJid);
        const level = progression.getLevel(memberJid);
        const gp = progression.getGP(memberJid);
        const rank = user?.adventurerRank || 'F';
        const rankData = classSystem.ADVENTURER_RANKS[rank];
        const classData = economy.getUserClass(memberJid);
        
        memberRanks.push({
            jid: memberJid,
            name: memberJid.split('@')[0],
            rank: rank,
            rankData: rankData,
            level: level,
            gp: gp,
            quests: user?.questsCompleted || 0,
            class: classData
        });
    }
    
    // Sort by rank (SSS first)
    const rankOrder = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    memberRanks.sort((a, b) => {
        return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });
    
    // Display
    memberRanks.forEach((member, i) => {
        const classIcon = member.class?.icon || '❓';
        msg += `${i + 1}. ${member.rankData.icon} *${member.rankData.name}* - @${member.name}\n`;
        msg += `   ${classIcon} ${member.class?.name || 'No Class'} | Lv.${member.level} | ${member.quests} quests\n\n`;
    });
    
    const mentions = memberRanks.map(m => m.jid);
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg, mentions });
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild list
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild list`) {
  try {
    const info = guilds.getGuildInfo();
    
    if (Object.keys(info.guilds).length === 0) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + "📜 No guilds created yet!" });
      return;
    }
    
    let listText = `╔════════════╗
║ 🏰 *GUILD LIST* 🏰
╚════════════╝

`;
    
    const allOwners = [];
    
    for (const [name, guild] of Object.entries(info.guilds)) {
      const members = Array.isArray(guild.members) ? guild.members : [];
      const admins = Array.isArray(guild.admins) ? guild.admins : [];
      const ownerNumber = guild.owner.split(`@`)[0];
      
      allOwners.push(guild.owner);
      
      listText += `\n🏰 *${name}*\n`;
      listText += `   👑 Owner: @${ownerNumber}\n`;
      listText += `   👥 Members: ${members.length}\n`;
      listText += `   ⭐ Admins: ${admins.length}\n`;
      listText += `━━━━━━━━━━━━`;
    }
    
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + listText,
      mentions: allOwners
    });
  } catch (err) {
    console.error("Guild list error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to load guild list!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild members
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild members` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild member`) {
  try {
    const info = guilds.getGuildInfo();
    const userGuild = info.memberGuilds[senderJid];
    
    if (!userGuild) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ You're not in any guild!" });
      return;
    }
    
    const guild = info.guilds[userGuild];
    if (!guild) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Guild data is corrupted or guild no longer exists." });
      return;
    }
    const members = Array.isArray(guild.members) ? guild.members : [];
    
    let text = `🏰 *${userGuild}*\n`;
    if (guild.motto) text += `_"${guild.motto}"_\n`;
    text += `━━━━━━━━━━━━━━\n\n`;
    
    members.forEach((jid, i) => {
      let titleDisplay = '';
      
      // Check if owner
      if (guild.owner === jid) {
        titleDisplay = '👑 Guild Master';
      }
      // Check if admin
      else if (guild.admins && guild.admins.includes(jid)) {
        titleDisplay = '⭐ Admin';
      }
      // Check for custom title
      else if (guild.titles && guild.titles[jid]) {
        titleDisplay = `🎖️ ${guild.titles[jid]}`;
      }
      // Default member
      else {
        titleDisplay = '👤 Member';
      }

      // Get RPG Info
      economy.initializeClass(jid);
      const user = economy.getUser(jid);
      const level = progression.getLevel(jid);
      const rank = user?.adventurerRank || 'F';
      const rankData = classSystem.ADVENTURER_RANKS[rank];
      const classData = economy.getUserClass(jid);
      const classIcon = classData?.icon || '❓';
      const className = classData?.name || 'No Class';
      
      text += `${i + 1}. @${jid.split('@')[0]}\n`;
      text += `   ├─ Title: ${titleDisplay}\n`;
      text += `   ├─ Rank: ${rankData.icon} ${rank}\n`;
      text += `   └─ Class: ${classIcon} ${className} (Lv.${level})\n\n`;
    });
    
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + text, 
      mentions: members 
    });
  } catch (err) {
    console.error("Guild members error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to load members!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}
// `${botConfig.getPrefix().toLowerCase()}` guild tag <message>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild tag `)) {
  const message = txt.substring(`${botConfig.getPrefix().toLowerCase()} guild tag `.length).trim();
  
  try {
    const result = await guilds.tagGuildMembers(sock, chatId, senderJid, message, BOT_MARKER);
    
    if (!result.success) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
  } catch (err) {
    console.error(`Guild tag error:`, err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to tag guild members!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild motto <text>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild motto `)) {
  const motto = txt.substring(`${botConfig.getPrefix().toLowerCase()} guild motto `.length).trim();
  
  if (!motto) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Usage: `.j guild motto <text>`" });
    return;
  }

  const result = guilds.setGuildMotto(senderJid, motto);
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild leaderboard
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild leaderboard` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild lb`) {
  try {
    const leaderboard = guilds.getGuildLeaderboard(wordle.getAllScores(), tictactoe.getAllScores(), economy);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + `📜 No guilds exist yet!` });
      return;
    }
    
    let leaderboardText = `╔══════════════╗
   🏆 *GUILD LEADERBOARD* 🏆
╚═════════════╝

`;
    
    leaderboard.forEach((guild, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏰';
      leaderboardText += `${medal} *${guild.name}*\n`;
      leaderboardText += `   💰 Score: ${guild.score}\n`;
      leaderboardText += `   📝 Wordle: ${guild.wordleWins} wins\n`;
      leaderboardText += `   ⭕ TicTacToe: ${guild.tttWins} wins\n`;
      leaderboardText += `   🎰 Gambling: ${guild.gamblingWins} wins\n`;
      leaderboardText += `   👥 Members: ${guild.memberCount}\n`;
      leaderboardText += `━━━━━━━━━━━━━━━━\n`;
    });
    
    await sock.sendMessage(chatId, { text: BOT_MARKER + leaderboardText });
  } catch (err) {
    console.error("Guild leaderboard error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to load leaderboard!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild points - Show current guild points
if (/^\`${botConfig.getPrefix().toLowerCase()}`\s+guild\s+(points?|pts)$/.test(lowerTxt)) {
  try {
    const info = guilds.getGuildInfo();
    const userGuild = info.memberGuilds[senderJid];
    
    if (!userGuild) {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + "❌ You're not in any guild!",
        mentions: [senderJid]
      });
      return;
    }
    
    const pointsData = guilds.getGuildPoints(userGuild);
    
    if (!pointsData) {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + "❌ Guild not found!",
        mentions: [senderJid]
      });
      return;
    }
    
    let text = `╔═══════════════════╗
   🏆 GUILD POINTS 🏆
╚═══════════════════╝

🏰 *${userGuild}*
📊 Total Points: ${pointsData.points.toLocaleString()}

━━━━━━━━━━━━━━━━
📈 Recent Activity:
`;

    const recentHistory = pointsData.history.slice(-5).reverse();
    if (recentHistory.length > 0) {
      recentHistory.forEach(entry => {
        const sign = entry.points > 0 ? '+' : '';
        const date = new Date(entry.timestamp).toLocaleDateString();
        text += `${sign}${entry.points} pts - ${entry.reason} (${date})\n`;
      });
    } else {
      text += `No activity yet! Play games to earn points!\n`;
    }
    
    text += `\n━━━━━━━━━━━━━━━━
💡 Earn points by:
• Playing Wordle (+10)
• Playing Tic-Tac-Toe (+5)
• Big gambling wins (+15)
• Claiming daily (+1)
• Winning challenges (+50)`;

    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + text,
      mentions: [senderJid]
    });
  } catch (err) {
    console.error("Guild points error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Failed to load guild points!",
      mentions: [senderJid]
    });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild pointsboard - Guild points leaderboard
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild pointsboard`) {
  try {
    const leaderboard = guilds.getGuildPointsLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + "📊 No guilds exist yet!" 
      });
      return;
    }
    
    let text = `╔═══════════════════╗
   🏆 TOP GUILDS 🏆
╚═══════════════════╝

📊 Ranked by Points

━━━━━━━━━━━━━━━━
`;
    
    leaderboard.forEach((guild, i) => {
      const medal = i === 0 ? `🥇` : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} *${guild.name}*\n`;
      text += `   📊 ${guild.points.toLocaleString()} points\n`;
      text += `   👥 ${guild.members} members\n`;
      text += `━━━━━━━━━━━━━━━━\n`;
    });
    
    await sock.sendMessage(chatId, { text: BOT_MARKER + text });
  } catch (err) {
    console.error("Guild pointsboard error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Failed to load points leaderboard!" 
    });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild upgrade <building_id>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild upgrade`)) {
  const parts = lowerTxt.split(' ');
  const buildingId = parts[3]; // .j(0) guild(1) upgrade(2) <id>(3)

  if (!buildingId) {
    let msg = `🏠 **GUILD UPGRADES** 🏠\n\n`;
    msg += `Spend Guild Points to upgrade your base!\n\n`;
    
    for (const [id, data] of Object.entries(guilds.GUILD_UPGRADES)) {
      msg += `• *${data.name}* (ID: \`${id}\`)\n`;
      msg += `  ✨ ${data.benefit}\n`;
      msg += `  💰 Base Cost: ${data.baseCost} pts\n\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 Usage: \`${botConfig.getPrefix().toLowerCase()} guild upgrade <id>\``;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
  }

  const result = guilds.upgradeGuildBuilding(senderJid, buildingId.toLowerCase());
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild challenges - List available challenge types
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild challenges`) {
  try {
    const types = guilds.getChallengeTypes();
    let text = `⚔️ *AVAILABLE CHALLENGE TYPES* ⚔️\n\n`;
    
    Object.entries(types).forEach(([id, data]) => {
      text += `🔹 *${data.name}* (\`${id}\`)\n`;
      text += `   💰 Entry: ${economy.getZENI()}${data.entryFee.toLocaleString()}\n`;
      text += `   🏆 Prize: ${economy.getZENI()}${data.prize.toLocaleString()}\n\n`;
    });
    
    text += `💡 Issue a challenge: \`${botConfig.getPrefix().toLowerCase()} guild challenge <guild_name> <type_id>\``;
    
    await sock.sendMessage(chatId, { text: BOT_MARKER + text });
  } catch (err) {
    console.error("Guild challenges error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to load challenge types!" });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` guild challenge <guild> <type> - Issue a challenge
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild challenge `)) {
  const args = txt.substring(`${botConfig.getPrefix().toLowerCase()} guild challenge `.length).trim().split(/\s+/);
  
  if (args.length < 2) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} guild challenge <guild_name> <type>\`\n\nExample: \`${botConfig.getPrefix().toLowerCase()} guild challenge "Dragon Warriors" ttt\`` 
    });
    return;
  }
  
  // Handle guild names with spaces if they are in quotes, or just take the first part if not
  let targetGuildName, type;
  if (txt.includes('"')) {
    const match = txt.match(/"([^"]+)"\s+(\S+)/);
    if (match) {
      targetGuildName = match[1];
      type = match[2];
    }
  }
  
  if (!targetGuildName) {
    type = args[args.length - 1];
    targetGuildName = args.slice(0, -1).join(' ');
  }
  
  try {
    const result = guilds.createChallenge(senderJid, targetGuildName, type);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  } catch (err) {
    console.error("Guild challenge issue error:", err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to issue challenge!" });
  }
  return;
}



// ============================================
// ACTIVITY COMMANDS
// ============================================

        // `${botConfig.getPrefix().toLowerCase()}` activity - show total messages today
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} activity`) {
          const activity = getChatActivity(chatId);
          const total = activity.reduce((sum, user) => sum + user.count, 0);
          await sock.sendMessage(chatId, { text: BOT_MARKER + `total messages today: ${total}` });
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` active - show most active members
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} active`) {
          const activity = getChatActivity(chatId);
          const sorted = activity.sort((a, b) => b.count - a.count).slice(0, 10);
          let text = BOT_MARKER + "User activity:\n\n";
          sorted.forEach((user, i) => {
            text += `${i + 1}. @${user.userId.split(`@`)[0]} - ${user.count} messages\n`;
          });
          const mentions = sorted.map(u => u.userId);
          await sock.sendMessage(chatId, { text, mentions });
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` inactive - show inactive members
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} inactive` && isGroupChat && groupMetadata) {
          const activity = getChatActivity(chatId);
          const activeUsers = new Set(activity.map(a => a.userId));
          const inactive = groupMetadata.participants
            .filter(p => !activeUsers.has(p.id) && p.id !== sock.user.id)
            .slice(0, 10);
          
          if (inactive.length > 0) {
            let text = BOT_MARKER + "inactive members, below top 10\n\n";
            inactive.forEach((p, i) => {
              text += `${i + 1}. @${p.id.split(`@`)[0]}\n`;
            });
            const mentions = inactive.map(p => p.id);
            await sock.sendMessage(chatId, { text, mentions });
          } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + "everyone's been active today." });
          }
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` userinfo or `${botConfig.getPrefix().toLowerCase()}` whois - show user info
        if ((lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} userinfo`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} whois`))) {
          const targetUser = getMentionOrReply(m) || senderJid;
          const targetName = targetUser.split('@')[0];
          
          const profile = getUserProfile(targetUser);
          const warnings = getWarningCount(targetUser, chatId);
          const muteInfo = getMuteInfo(targetUser, chatId);
          const activity = getActivity(chatId, targetUser);
          const isAdmin = groupMetadata?.participants.some(p => p.id === targetUser && (p.admin === `admin` || p.admin === 'superadmin'));
          const blocked = isBlocked(targetUser);
          
          let info = BOT_MARKER + `*User Info*\n\n`;
          info += `Phone: @${targetUser.split('@')[0]}\n`;
          if (profile?.nickname) info += `Nickname: ${profile.nickname}\n`;
          info += `Admin: ${isAdmin ? 'Yes' : 'No'}\n`;
          info += `Blocked: ${blocked ? 'Yes' : 'No'}\n`;
          info += `Warnings: ${warnings}/3\n`;
          info += `Muted: ${muteInfo ? 'Yes' : 'No'}\n`;
          if (muteInfo) {
            info += `Mute ends in: ${formatDuration(muteInfo)}\n`;
          }
          if (activity) {
            info += `Messages today: ${activity.count}\n`;
            info += `Last active: ${new Date(activity.lastMessage).toLocaleTimeString()}\n`;
            info += `First seen: ${new Date(activity.firstSeen).toLocaleString()}\n`;
          }
          if (profile?.stats) {
            info += `Total messages (all time): ${profile.stats.messageCount}\n`;
          }
          
          await sock.sendMessage(chatId, { 
            text: info, 
            contextInfo: { mentionedJid: [targetUser] } 
          });
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` jid - Secret command to show JID info
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} jid` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} jid `)) {
          const mentionedJids = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
          const quotedParticipant = m.message.extendedTextMessage?.contextInfo?.participant;
          
          let targetUser = senderJid;
          if (mentionedJids.length > 0) {
            targetUser = mentionedJids[0];
          } else if (quotedParticipant) {
            targetUser = quotedParticipant;
          }

          const myNumber = sock.user.id.split(`:`)[0].split('@')[0];
          const myLid = sock.authState.creds?.me?.lid;
          const isBot = targetUser.includes(myNumber) || (myLid && targetUser.includes(myLid.split('@')[0]));

          let jidInfo = BOT_MARKER + `🔍 *JID INFORMATION* 🔍\n\n`;
          jidInfo += `👤 *User:* ${isBot ? `${botConfig.getBotName()} Bot (Me)` : '@' + targetUser.split('@')[0]}\n`;
          jidInfo += `🆔 *Full JID:* ${targetUser}\n`;
          jidInfo += `📡 *Type:* ${targetUser.endsWith('@lid') ? 'LID (Hidden Identity)' : 'Standard JID'}\n`;
          
          if (isBot) {
            jidInfo += `🤖 *Bot Status:* Active\n`;
            if (myLid) jidInfo += `🎭 *Bot LID:* ${myLid}\n`;
          }

          const profile = getUserProfile(targetUser);
          if (profile?.whatsappName) jidInfo += `📝 *WhatsApp Name:* ${profile.whatsappName}\n`;
          if (profile?.nickname) jidInfo += `🃏 *Nickname:* ${profile.nickname}\n`;

          await sock.sendMessage(chatId, { 
            text: jidInfo, 
            mentions: [targetUser] 
          });
          return;
        }

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} 18+` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} 18+ `)) {
    const searchTerm = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 18+`, ``).trim();

    if (!searchTerm) {
        const usage = GET_BANNER(`🔞 18+`) + `\n\n*Usage:* \`${botConfig.getPrefix()} 18+ <search term>\`\n\n*Example:* \`${botConfig.getPrefix()} 18+ anime\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    try {
        await sock.sendMessage(chatId, { react: { text: "🔍", key: m.key } });

        // scrape PornPics
        const images = await scrapePornPics(searchTerm, 10);

        if (images.length === 0) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ No results found." });
        }

        await sock.sendMessage(chatId, { react: { text: "📥", key: m.key } });

        // send images in best-res-first order
        for (const img of images) {
            try {
                await sock.sendMessage(chatId, { image: { url: img } }, { quoted: m });
                await new Promise(res => setTimeout(res, 150));
            } catch (e) {
                console.log("Skipping broken image...");
            }
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

    } catch (err) {
        console.error("❌ Command Error:", err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Failed to fetch images." });
    }

    return;
}



// `${botConfig.getPrefix().toLowerCase()}` nsfw <count> <search term>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} nsfw` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} nsfw `)) {
    const fullQuery = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} nsfw`, ``).trim();
    
    if (!fullQuery) {
        const usage = GET_BANNER(`🔞 NSFW`) + `\n\n*Usage:* \`${botConfig.getPrefix()} nsfw [count] <search term>\`\n\n*Examples:*\n- \`${botConfig.getPrefix()} nsfw anime\`\n- \`${botConfig.getPrefix()} nsfw 15 neko\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    // Parse count and search term
    let count = 10;
    let searchTerm = fullQuery;
    
    const parts = fullQuery.split(` `);
    const firstWord = parts[0];
    
    if (!isNaN(firstWord) && parseInt(firstWord) > 0) {
        count = Math.min(parseInt(firstWord), 10); // Limit to 10 max for performance
        searchTerm = parts.slice(1).join(' ').trim();
    }
    
    if (!searchTerm || searchTerm === firstWord && !isNaN(firstWord)) {
        const usage = GET_BANNER(`🔞 NSFW`) + `\n\n*Usage:* \`${botConfig.getPrefix()} nsfw [count] <search term>\`\n\n*Examples:*\n- \`${botConfig.getPrefix()} nsfw anime\`\n- \`${botConfig.getPrefix()} nsfw 15 neko\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    try {
        await sock.sendMessage(chatId, { react: { text: "🔍", key: m.key } });
        
        const images = await scrapeFromDefaultSite(searchTerm, count);

        if (images.length === 0) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ No results found." });
        }

        await sock.sendMessage(chatId, { react: { text: "📥", key: m.key } });
        console.log(`📤 Sending ${images.length} images...`);

        // Send up to 5 images max to avoid spam
        for (let i = 0; i < Math.min(images.length, 5); i++) {
            const imageUrl = images[i];
            
            try {
                console.log(`📸 Downloading image ${i + 1}/${Math.min(images.length, 5)}: ${imageUrl}`);
                
                // Download image as buffer
                const response = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': 'https://rule34.xxx/',
                        'Cookie': 'filter_ai=1'
                    }
                });
                
                const imageBuffer = Buffer.from(response.data);
                
                // Send image
                await sock.sendMessage(chatId, {
                    image: imageBuffer,
                }, { quoted: m });
                
                console.log(`✅ Sent image ${i + 1}`);
                
                // Small delay to avoid spam
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (imgErr) {
                console.error(`❌ Failed to send image ${i + 1}:`, imgErr.message);
                continue;
            }
        }
        
        await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `✅ Sent ${Math.min(images.length, 5)} images for: ${searchTerm}` 
        });

    } catch (err) {
        console.error("Scrape Error:", err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Scrape failed." });
    }
    return;
}


       // --- COMMAND: `${botConfig.getPrefix().toLowerCase()}` img ---
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} img` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} img `)) {
    // Extract the full command after `${botConfig.getPrefix().toLowerCase()} img `
    const fullQuery = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} img`, ``).trim();
    
    if (!fullQuery) {
        const usage = GET_BANNER(`🔍 IMAGE`) + `\n\n*Usage:* \`${botConfig.getPrefix()} img [count] <query>\`\n\n*Example:* \`${botConfig.getPrefix()} img 5 goku\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    // Parse for optional number at the start
    let count = 10; // default
    let searchTerm = fullQuery;
    
    const parts = fullQuery.split(` `);
    const firstWord = parts[0];
    
    // Check if first word is a number
    if (!isNaN(firstWord) && parseInt(firstWord) > 0) {
        count = Math.min(parseInt(firstWord), 20); // Cap at 20 to avoid spam
        searchTerm = parts.slice(1).join(' ').trim();
    }
    
    if (!searchTerm) {
        const usage = GET_BANNER(`🔍 IMAGE`) + `\n\n*Usage:* \`${botConfig.getPrefix()} img [count] <query>\`\n\n*Example:* \`${botConfig.getPrefix()} img 5 goku\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    // Feedback
    await sock.sendMessage(chatId, { react: { text: "🔍", key: m.key } });

    try {
        const images = await searchPinterest(searchTerm, count);

        if (images.length === 0) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(chatId, { text: "❌ No results found." });
        }

        await sock.sendMessage(chatId, { react: { text: "⏳", key: m.key } });

        for (let i = 0; i < images.length; i++) {
            try {
                await sock.sendMessage(chatId, { 
                    image: { url: images[i] }, 
                }, { quoted: m });
                
                // 100ms delay to prevent spam detection
                await new Promise(res => setTimeout(res, 100)); 
            } catch (e) {
                console.log("Skipping a broken pin link...");
            }
        }
        
        await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    } catch (err) {
        console.error("Pinterest Command Error:", err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(chatId, { text: "⚠️ Search failed or timed out." });
    }
    return;
}

// ============================================
// 🎵 AUDIO COMMAND (WITH COVER IMAGE & INFO)
// ============================================

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} audio` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} audio `)) {
  const query = txt.substring(`${botConfig.getPrefix().toLowerCase()} audio `.length).trim();
  if (!query) {
    const usage = GET_BANNER(`🎵 AUDIO`) + `\n\n*Usage:* \`${botConfig.getPrefix()} audio <song name>\`\n\n*Example:* \`${botConfig.getPrefix()} audio starboy\``;
    await sock.sendMessage(chatId, { text: usage }, { quoted: m });
    return;
  }

  try {
    // 1. React to show search started
    await sock.sendMessage(chatId, { react: { text: "🔎", key: m.key } });

    const r = await yts(query);
    const video = r.videos[0];
    if (!video) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ No results found." });
    }

    // 2. Fetch Thumbnail
    let thumbnailBuffer = null;
    try {
      const response = await axios.get(video.thumbnail, { responseType: `arraybuffer` });
      thumbnailBuffer = Buffer.from(response.data);
    } catch (e) { console.log("Thumbnail fetch failed"); }

    // 3. React to show download started
    await sock.sendMessage(chatId, { react: { text: "📥", key: m.key } });

    const fileName = path.join(__dirname, 'temp', `audio_${Date.now()}.mp3`);

    const dl = spawn(YTDLP_PATH, [
      video.url,
      '-f', 'bestaudio[ext=m4a]/bestaudio/best', 
      '-x', '--audio-format', 'mp3',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      '--no-check-certificates',
      '--geo-bypass',
      '--ffmpeg-location', FFMPEG_PATH,
      '--max-filesize', '50M',
      '-o', fileName
    ]);

    let errorOutput = "";
    dl.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Hard-kill timer: 120 seconds (increased from 60)
    const killTimer = setTimeout(() => {
      dl.kill('SIGKILL');
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      console.log(`[YouTube] Killed hung process for: ${video.title}`);
    }, 120000);

    // Auto-delete on spawn error
    dl.on('error', (err) => { 
      clearTimeout(killTimer);
      console.error(`[YouTube] Spawn error: ${err.message}`);
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName); 
    });

    dl.on('close', async (code) => {
      clearTimeout(killTimer);
      if (code === 0 && fs.existsSync(fileName)) {
        try {
          await sock.sendMessage(chatId, { 
            audio: { url: fileName }, 
            mimetype: 'audio/mpeg',
            fileName: `${video.title}.mp3`,
            contextInfo: {
              mentionedJid: [senderJid], // Tag the person who requested
              externalAdReply: {
                title: video.title,
                body: `${video.author.name} | ${video.timestamp}`,
                thumbnail: thumbnailBuffer,
                mediaType: 2,
                mediaUrl: video.url,
                sourceUrl: video.url
              }
              
            }
          });
          // Final success reaction
          await sock.sendMessage(chatId, { react: { text: "▶️", key: m.key } });
        } catch (sendErr) {
          // Contingency: Plain audio if rich fails
          await sock.sendMessage(chatId, { 
            audio: { url: fileName }, 
            mimetype: 'audio/mpeg',
            contextInfo: { mentionedJid: [senderJid] } // Tag requester
          });
        } finally {
          // UNIVERSAL CLEANUP: Delete immediately
          if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
        }
      } else {
        if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
        console.error(`[YouTube] Download failed with code ${code}. Error: ${errorOutput}`);
        await sock.sendMessage(chatId, { react: { text: "⚠️", key: m.key } });
        await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Download failed." });
      }
    });

  } catch (err) {
    console.error("Audio Error:", err);
    await sock.sendMessage(chatId, { react: { text: "❗", key: m.key } });
  }
  return;
}

// ============================================
// 📰 ANIME COMMANDS
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` anime news

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime news` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} animenews`) {
  try {
    await sock.sendMessage(chatId, { react: { text: "📰", key: m.key } });

    const BASE_URL = `https://animecorner.me/`;
    const res = await axios.get(BASE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);

    const articles = [];

    // scrape homepage articles
    $('article').each((i, el) => {
      if (i >= 5) return false;

      const title = $(el).find('h1,h2,h3').first().text().trim();
      const link = $(el).find('a').first().attr('href');

      let img =
        $(el).find('img').attr('data-src') ||
        $(el).find('img').attr('data-lazy-src') ||
        $(el).find('img').attr('data-original') ||
        $(el).find('img').attr('src');

      if (img && img.startsWith('//')) img = 'https:' + img;
      if (img && img.startsWith('/')) img = BASE_URL + img.replace('/', '');

      if (title && link) {
        articles.push({ title, link, img });
      }
    });

    if (!articles.length) {
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return sock.sendMessage(chatId, {
        text: BOT_MARKER + "❌ Could not fetch anime news."
      });
    }

    const article = articles[Math.floor(Math.random() * articles.length)];
    let summary = '';
    let imageUrl = article.img || null;

    // fetch article page for better summary + image fallback
    try {
      const page = await axios.get(article.link, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $$ = cheerio.load(page.data);

      const para = $$('article p').first().text().trim();
      if (para.length > 50) summary = para.slice(0, 400);

      if (!imageUrl) {
        imageUrl =
          $$('meta[property="og:image"]').attr('content') ||
          $$('meta[name="twitter:image"]').attr('content');
      }
    } catch {}

    const caption = `
╔══════════════════════╗
   🃏 *ANIME NEWS* 🃏
╚══════════════════════╝

*📰 HEADLINE:*
${article.title}

━━━━━━━━━━━━━━━━━━━

*📋 RECAP:*
${summary || 'No summary available.'}...

━━━━━━━━━━━━━━━━━━━

🔗 *Full Article:*
${article.link}

_Latest anime updates • Anime Corner_
`.trim();

    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

    // try image via URL → fallback to buffer
    if (imageUrl) {
      try {
        await sock.sendMessage(chatId, {
          image: { url: imageUrl },
          caption: BOT_MARKER + caption
        }, { quoted: m });
      } catch {
        const imgRes = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        await sock.sendMessage(chatId, {
          image: Buffer.from(imgRes.data),
          caption: BOT_MARKER + caption
        }, { quoted: m });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + caption + "\n\n⚠️ _Image not available_"
      }, { quoted: m });
    }
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error('Anime news error:', err);

    // fallback → Jikan API
    try {
      const res = await axios.get('https://api.jikan.moe/v4/top/anime?filter=airing&limit=10');
      const anime = res.data.data[Math.floor(Math.random() * res.data.data.length)];

      const caption = `
╔══════════════════════╗
   🃏 *ANIME SPOTLIGHT* 🃏
╚══════════════════════╝

*📰 TITLE:*
${anime.title}

━━━━━━━━━━━━━━━━━━━

*📋 RECAP:*
${anime.synopsis?.slice(0, 350) || 'No synopsis available.'}...

🔗 ${anime.url}
`.trim();

      const img =
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url ||
        anime.images?.webp?.large_image_url ||
        anime.images?.webp?.image_url;

      if (img) {
        await sock.sendMessage(chatId, {
          image: { url: img },
          caption: BOT_MARKER + caption
        }, { quoted: m });
      } else {
        await sock.sendMessage(chatId, {
          text: BOT_MARKER + caption
        }, { quoted: m });
      }

    } catch {
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + "❌ Could not fetch anime news right now."
      });
    }
  }

  return;
}


// --------------------------
// Helpers (used by the improved commands)
// --------------------------
function resolveImageUrl(img, base) {
  if (!img) return null;
  img = String(img).trim();
  if (img.startsWith('//')) img = 'https:' + img;
  try {
    new URL(img);
    return img;
  } catch {
    try {
      return new URL(img, base).href;
    } catch {
      return null;
    }
  }
}

async function sendImageSafe(sock, chatId, imageUrl, caption, quotedMsg) {
  if (!imageUrl) throw new Error('No imageUrl provided');
  try {
    // try sending remote URL first
    await sock.sendMessage(chatId, { image: { url: imageUrl }, caption }, { quoted: quotedMsg });
    return;
  } catch (err) {
    // fallback: download and send buffer
    try {
      const resp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024
      });
      await sock.sendMessage(chatId, { image: Buffer.from(resp.data), caption }, { quoted: quotedMsg });
      return;
    } catch (err2) {
      throw err2;
    }
  }
}


// --------------------------
// Search caches (by chat and by specific message id)
// --------------------------
global[`__${BOT_ID}_anime_search_cache_by_chat`] = global[`__${BOT_ID}_anime_search_cache_by_chat`] || new Map();
global[`__${BOT_ID}_anime_search_cache_by_msgid`] = global[`__${BOT_ID}_anime_search_cache_by_msgid`] || new Map();
const SEARCH_TTL = 1000 * 60 * 5; // 5 minutes


// helper to extract quoted message id from incoming message `m`
function getQuotedMessageId(m) {
  try {
    // Common Baileys fields where quoted id may be located
    const ctx = m.message?.extendedTextMessage?.contextInfo || m.message?.conversation?.contextInfo || m.message?.imageMessage?.contextInfo;
    if (!ctx) return null;
    // try stanzaId or quotedMessage key id
    if (ctx.stanzaId) return ctx.stanzaId;
    if (ctx.quotedMessage && ctx.quotedMessage.key && ctx.quotedMessage.key.id) return ctx.quotedMessage.key.id;
    if (ctx.quotedMessage && ctx.quotedMessage.key && ctx.quotedMessage.key.remoteJid) return ctx.quotedMessage.key.remoteJid;
    if (ctx.quotedMessageId) return ctx.quotedMessageId;
    return null;
  } catch (e) {
    return null;
  }
}


// --- PERSISTENT SELECTION LOGIC ---
const numOnly = lowerTxt.match(/^([1-9][0-9]*)$/);
if (numOnly) {
  const idx = parseInt(numOnly[1], 10);
  let cached = null;
  const quotedId = getQuotedMessageId(m);

  if (quotedId && global[`__${BOT_ID}_anime_search_cache_by_msgid`].has(quotedId)) {
    cached = global[`__${BOT_ID}_anime_search_cache_by_msgid`].get(quotedId);
  } else if (global[`__${BOT_ID}_anime_search_cache_by_chat`].has(chatId)) {
    cached = global[`__${BOT_ID}_anime_search_cache_by_chat`].get(chatId);
  }

  if (cached && idx >= 1 && idx <= cached.results.length) {
    const a = cached.results[idx - 1];
   const downloadLink = await getAnikaiBestMatch(a.title);



    const caption = `
╔══════════════════════╗
    🃏 *ANIME DETAILS* 🃏
╚══════════════════════╝
🎬 *Title:* ${a.title}
⭐ *Score:* ${a.score || 'N/A'}
🏅 *Global Rank:* #${a.rank || 'N/A'}
━━━━━━━━━━━━━━━━━━
📖 *Synopsis:* ${(a.synopsis || 'No description available.').slice(0, 400)}...
━━━━━━━━━━━━━━━━━━
📥 *WATCH/DOWNLOAD:* ${downloadLink}
━━━━━━━━━━━━━━━━━━
_💡 Reply with another number from your search list!_`.trim();

    const imageUrl = resolveImageUrl(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url, a.url);
    await sendImageSafe(sock, chatId, imageUrl, BOT_MARKER + caption, m);
    return;
  }
}

// ============================================
// Improved / editorial-style commands (news above unchanged)
// ============================================


// `${botConfig.getPrefix().toLowerCase()}` anime trending  (improved: curated trending by popularity + short note)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime trending`) {
  await sock.sendMessage(chatId, { react: { text: "🔥", key: m.key } });
  try {
    const r = await axios.get(`https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=20`);
    const list = r.data.data || [];
    if (!list.length) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + 'No trending data.' }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return;
    }

    // pick from top 10 for variety but quality
    const candidates = list.slice(0, Math.min(10, list.length));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const noteParts = [];
    if ((pick.score || 0) >= 8) noteParts.push('critically rated');
    if ((pick.members || 0) > 100000) noteParts.push('very popular');
    const note = noteParts.length ? noteParts.join(' • ') : 'popular right now';

    const caption = `
╔══════════════════════╗
   🔥 *ANIME TRENDING* 🔥
╚══════════════════════╝

*${pick.title}*${pick.title_english ? ` — ${pick.title_english}` : ''}

⭐ ${pick.score || 'N/A'} | Popularity: #${pick.popularity || 'N/A'}
• ${note}

📋 Quick:
${(pick.synopsis || '').slice(0, 280)}...

🔗 ${pick.url}
`.trim();

    const imageUrl = resolveImageUrl(pick.images?.jpg?.large_image_url || pick.images?.jpg?.image_url || pick.images?.webp?.large_image_url || pick.images?.webp?.image_url, pick.url);
    try {
      await sendImageSafe(sock, chatId, imageUrl, BOT_MARKER + caption, m);
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    } catch {
      await sock.sendMessage(chatId, { text: BOT_MARKER + caption }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    }
  } catch (err) {
    console.error('trending error', err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + 'Could not fetch trending anime.' }, { quoted: m });
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}


// `${botConfig.getPrefix().toLowerCase()}` anime rank <name>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} anime rank`)) {
  const SERPER_KEY = "02e605431054e2ee9fb761663e642e1886495861"; 
  await sock.sendMessage(chatId, { react: { text: "🏅", key: m.key } });

  try {
    const query = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} anime rank`, ``).trim();
    if (!query) return sock.sendMessage(chatId, { text: BOT_MARKER + `Usage: \`${botConfig.getPrefix().toLowerCase()}\` anime rank <name>` });

    // 1. Fetch Jikan Data (TV only)
    const jikanRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&type=tv&limit=1`);
    const a = jikanRes.data.data?.[0];
    if (!a) return sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Series not found." });

// 2. Market Search (Serper)
const search = await axios.post(
  "https://google.serper.dev/search",
  {
    q: `${a.title} anime franchise revenue market value 2026 stats`,
    num: 3
  },
  { headers: { "X-API-KEY": SERPER_KEY } }
);


    const marketInfo = search.data.organic.map(s => s.snippet).join(" ");
    const isDB = a.title.toLowerCase().includes('dragon ball');

    // 3. AI Calculation (No yapping, just math/data)
    const aiPrompt = `
      Analyze "${a.title}" market data: "${marketInfo}"
      
      TASK: 
      1. Assign a STATUS (e.g., UNIVERSAL ICON, SEASONAL HIT, RISING STAR).
      2. Calculate LEGACY SCORE (0-100) based on longevity and revenue.
      3. Extract or Estimate MARKET POWER in Millions/Billions.
      4. IF title is NOT Dragon Ball, DO NOT mention Goku/Dragon Ball.
      
      OUTPUT ONLY JSON:
      {"status": "...", "score": 0, "market": "...", "market_val": 0.0}
    `;

    const aiRes = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: aiPrompt }],
      response_format: { type: "json_object" }
    });

    const data = JSON.parse(aiRes.choices[0].message.content);
    
    // Formatting variables
    const members = (a.members / 1000000).toFixed(2);
    const favs = a.favorites?.toLocaleString() || '0';
    const fanPower = ((a.members * (a.score || 1)) / 1000000).toFixed(2);
    const progress = "█".repeat(Math.min(10, Math.floor(data.score / 10))) + "░".repeat(10 - Math.min(10, Math.floor(data.score / 10)));

    // 4. THE STYLE
    const caption = `
╔══════════════════════╗
    🏅 *ANIME RANKING* 🏅
╚══════════════════════╝
🎬 *${a.title}*
━━━━━━━━━━━━━━━━━━
👑 *STATUS:* ${data.status.toUpperCase()}
🎖️ *ANIME SCORE:* ${data.score}/100
━━━━━━━━━━━━━━━━━━
📊 *FANBASE POWER:*

👥 *Community:* ${members}M members
❤️ *Hardcore Fans:* ${favs} favorites
💪 *Fan Power:* ${fanPower}M value
━━━━━━━━━━━━━━━━━━
💰 *MARKET POWER:*
[${progress}] ${data.market}
━━━━━━━━━━━━━━━━━━
📅 *Release:* ${a.year || 'N/A'}
⭐ *Critic Score:* ${a.score || 'N/A'}/10
📡 *Status:* ${a.status}
━━━━━━━━━━━━━━━━━━

🔗 ${isDB ? "https://dragonball.fandom.com/wiki/Dragon_Ball_(franchise)" : a.url}

_Legacy Score factors in community size, hardcore fans, and historical market data. Simple math, honest results!_
`.trim();

    await sendImageSafe(sock, chatId, a.images.jpg.large_image_url, BOT_MARKER + caption, m);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error(err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Ranking Engine Error." });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` anime airing  (improved: short list + pick highlight)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime airing`) {
  await sock.sendMessage(chatId, { react: { text: `📡`, key: m.key } });
  try {
    const r = await axios.get('https://api.jikan.moe/v4/seasons/now?limit=12');
    const airing = r.data.data || [];
    if (!airing.length) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + 'No airing info.' }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return;
    }

    // choose a highlight and list top 3
    const highlight = airing[Math.floor(Math.random() * airing.length)];
    const top3 = airing.slice(0, 3).map(a => `• ${a.title} (${a.episodes || 'ongoing'})`).join('\n');

    const caption = `
╔══════════════════════╗
   📡 *CURRENTLY AIRING* 📡
╚══════════════════════╝

Top this week:
${top3}

🔍 Highlight:
${highlight.title}
⭐ ${highlight.score || 'N/A'} | Episodes: ${highlight.episodes || 'Ongoing'}

📋 Quick:
${(highlight.synopsis || '').slice(0, 260)}...

🔗 ${highlight.url}
`.trim();

    const imageUrl = resolveImageUrl(highlight.images?.jpg?.large_image_url || highlight.images?.jpg?.image_url || highlight.images?.webp?.large_image_url || highlight.images?.webp?.image_url, highlight.url);
    try {
      await sendImageSafe(sock, chatId, imageUrl, BOT_MARKER + caption, m);
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    } catch {
      await sock.sendMessage(chatId, { text: BOT_MARKER + caption }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    }
  } catch (err) {
    console.error('airing error', err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + 'Could not fetch airing anime.' }, { quoted: m });
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}


// `${botConfig.getPrefix().toLowerCase()}` anime upcoming  (improved: most-anticipated editorial) — FIXED selection + reactions
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime upcoming`) {
  await sock.sendMessage(chatId, { react: { text: `⏳`, key: m.key } });
  try {
    // Adding a slight delay or simplified query to help with rate limits
    const r = await axios.get('https://api.jikan.moe/v4/seasons/upcoming', { timeout: 10000 });
    let pool = r.data.data || [];
    
    if (!pool.length) throw new Error('Empty pool');

    // Filter out entries with no images or titles to avoid "blah blah" errors
    const validPool = pool.filter(a => a.title && a.images?.jpg?.image_url);
    const pick = validPool[Math.floor(Math.random() * Math.min(15, validPool.length))];

    const caption = `
╔══════════════════════╗
   ⏳ *UPCOMING ANIME* ⏳
╚══════════════════════╝
🔥 *${pick.title}*
📅 Expected: ${pick.year || 'TBA'}
📋 *Synopsis:*
${(pick.synopsis || 'Plot details coming soon.').slice(0, 300)}...

🔗 ${pick.url}
`.trim();

    const imageUrl = pick.images?.jpg?.large_image_url || pick.images?.jpg?.image_url;
    await sendImageSafe(sock, chatId, imageUrl, BOT_MARKER + caption, m);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });

  } catch (err) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "⚠️ API is busy. Please try again in a few seconds." });
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}


// `${botConfig.getPrefix().toLowerCase()}` anime top  (improved: top picks with context) — FIXED selection + reactions
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime top`) {
  await sock.sendMessage(chatId, { react: { text: `🏆`, key: m.key } });
  try {
    const r = await axios.get('https://api.jikan.moe/v4/top/anime?limit=25', { timeout: 10000 });
    const list = r.data.data;
    const pick = list[Math.floor(Math.random() * list.length)];

    const caption = `
╔══════════════════════╗
   🏆 *TOP ANIME* 🏆
╚══════════════════════╝
🏅 *Rank:* #${pick.rank || 'N/A'}
🎬 *${pick.title}*
⭐ *Score:* ${pick.score || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━
${(pick.synopsis || 'No synopsis.').slice(0, 350)}...

🔗 ${pick.url}
`.trim();

    await sendImageSafe(sock, chatId, pick.images?.jpg?.large_image_url || pick.images?.jpg?.image_url, BOT_MARKER + caption, m);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
  } catch (err) {
    // If Top fails, fetch Trending as a fallback
    try {
      const fallback = await axios.get('https://api.jikan.moe/v4/seasons/now?limit=10');
      const pick = fallback.data.data[0];
      await sock.sendMessage(chatId, { text: BOT_MARKER + `⚠️ Top Anime API is slow. Showing a current hit instead:\n\n*${pick.title}*\n⭐ ${pick.score}` });
    } catch {
      await sock.sendMessage(chatId, { text: BOT_MARKER + '❌ All anime services are currently busy. Try again shortly.' });
    }
  }
  return;
}


// `${botConfig.getPrefix().toLowerCase()}` anime random  (improved random with short editorial + title header)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} anime random`) {
  await sock.sendMessage(chatId, { react: { text: `🎲`, key: m.key } });
  try {
    const r = await axios.get('https://api.jikan.moe/v4/random/anime');
    const a = r.data.data;
    if (!a) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + 'No random anime fetched.' }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
      return;
    }

    // generate reasons
    const reasons = [];
    if ((a.score || 0) >= 8) reasons.push('highly rated');
    if ((a.members || 0) > 50000) reasons.push('popular');

    // get Anikai link dynamically
    const { getAnikaiBestMatch } = require('./anikaiResolver');
    const anikaiLink = await getAnikaiBestMatch(a.title);

    const caption = `
╔═══════════════════╗
   🎲 *RANDOM ANIME* 🎲
╚═══════════════════╝

🎬 *Title:* ${a.title} ${a.title_english ? `— ${a.title_english}` : ''}

⭐ ${a.score || 'N/A'} | ${a.episodes || 'Unknown'} eps
• ${reasons.length ? reasons.join(' • ') : 'Give this a try!'}

📋 Short:
${(a.synopsis || '').slice(0, 300)}...

🔗 ${anikaiLink}
`.trim();

    const imageUrl = resolveImageUrl(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url, a.url);

    try {
      if (imageUrl) await sendImageSafe(sock, chatId, imageUrl, BOT_MARKER + caption, m);
      else await sock.sendMessage(chatId, { text: BOT_MARKER + caption }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error('random send error', err);
      await sock.sendMessage(chatId, { text: BOT_MARKER + caption }, { quoted: m });
      await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
    }
  } catch (err) {
    console.error('random error', err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + 'Could not fetch a random anime.' }, { quoted: m });
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}



// `${botConfig.getPrefix().toLowerCase()}` anime studio <name>  (improved studio lookup — keeps same trigger)
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} anime studio`)) {
  await sock.sendMessage(chatId, { react: { text: `🎥`, key: m.key } });
  try {
    const studioInput = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} anime studio`, '').trim();
    if (!studioInput) return sock.sendMessage(chatId, { text: BOT_MARKER + `Usage: \`${botConfig.getPrefix().toLowerCase()}\` anime studio <name>` });

    // Use a single, broad search. This is much less likely to trigger `Busy`
    const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(studioInput)}&limit=15&order_by=popularity`);
    const results = res.data.data || [];

    // Filter to find works where the studio name matches what you typed
    const matches = results.filter(a => 
      a.studios?.some(s => s.name.toLowerCase().includes(studioInput.toLowerCase()))
    );

    const pool = matches.length > 0 ? matches : results;

    if (!pool.length) {
      return sock.sendMessage(chatId, { text: BOT_MARKER + `No anime found for studio: ${studioInput}` });
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const caption = `
╔══════════════════════╗
   🎥 *STUDIO SEARCH* 🎥
╚══════════════════════╝
🎬 *${pick.title}*
🏢 *Studio:* ${pick.studios.map(s => s.name).join(', ')}
⭐ *Score:* ${pick.score || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━
${(pick.synopsis || 'No description.').slice(0, 300)}...

🔗 ${pick.url}
`.trim();

    await sendImageSafe(sock, chatId, pick.images?.jpg?.large_image_url, BOT_MARKER + caption, m);
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
  } catch (err) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ API is overloaded. Please wait 5 seconds." });
  }
  return;
}
// `${botConfig.getPrefix().toLowerCase()}` search <query> - Alias for anime search
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} search `)) {
  const q = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} search `, '').trim();
  if (!q) return await sock.sendMessage(chatId, { text: BOT_MARKER + `Usage: \`${botConfig.getPrefix().toLowerCase()}\` search <title>` });
  // Redirect to anime search logic (which starts with anime search)
  lowerTxt = `${botConfig.getPrefix().toLowerCase()} anime search ${q}`;
}

// `${botConfig.getPrefix().toLowerCase()}` anime search <query>  (improved search — returns compact menu; reply with number works)
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} anime search`)) {
  await sock.sendMessage(chatId, { react: { text: `🔎`, key: m.key } });
  try {
    const q = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} anime search`, '').trim();
    if (!q) return sock.sendMessage(chatId, { text: BOT_MARKER + `Usage: \`${botConfig.getPrefix().toLowerCase()}\` anime search <title>` });

    // Removed the limit to show all primary results from Jikan
    const r = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}`);
    const list = r.data.data || [];

    if (!list.length) {
      await sock.sendMessage(chatId, { react: { text: `❌`, key: m.key } });
      return sock.sendMessage(chatId, { text: BOT_MARKER + 'No results found.' });
    }

    // Helper for Anikai first-episode download links
    const getAnikaiLink = (title) => {
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') 
        .replace(/\s+/g, '-')         
        .replace(/-+/g, '-');         
      return `https://anikai.to/watch/${slug}-episode-1`;
    };

    let menu = `🔎 *Search results for:* ${q}\n━━━━━━━━━━━━━━━━━━━\n`;
    list.forEach((a, i) => {
      const type = a.type ? `[${a.type}]` : '';
      menu += `*${i + 1}.* ${a.title} ${type}\n`;
    });
    
    menu += `\n━━━━━━━━━━━━━━━━━━━━\n*Reply with a number (1-${list.length}) for details.*`;

    const cacheData = { ts: Date.now(), results: list, downloadFn: getAnikaiLink };
    global[`__${BOT_ID}_anime_search_cache_by_chat`].set(chatId, cacheData);

    const sentMenu = await sock.sendMessage(chatId, { text: BOT_MARKER + menu }, { quoted: m });
    const msgId = sentMenu?.key?.id;
    if (msgId) global[`__${BOT_ID}_anime_search_cache_by_msgid`].set(msgId, cacheData);

    // Auto-clear cache after 5 minutes to save RAM
    setTimeout(() => {
      global[`__${BOT_ID}_anime_search_cache_by_chat`].delete(chatId);
      if (msgId) global[`__${BOT_ID}_anime_search_cache_by_msgid`].delete(msgId);
    }, 300000);

    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
  } catch (err) {
    console.error(err);
    await sock.sendMessage(chatId, { text: BOT_MARKER + 'Search failed. API limit reached.' });
  }
  return;
}



// ============================================
// 🎮 GENERAL FUN COMMANDS 
// ============================================


// ============================================
// 🏹 WILDERNESS SYSTEMS (FISHING & HUNTING)
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` fish - go fishing
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} fish`) {
  if (!economy.isRegistered(senderJid)) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Register first to start scavenging!" });
  }

  await sock.sendMessage(chatId, { react: { text: "🎣", key: m.key } });
  await sock.sendMessage(chatId, { text: BOT_MARKER + "⏳ Casting your line... please wait 5s." });

  setTimeout(async () => {
    const user = economy.getUser(senderJid);
    const luck = user.stats?.luck || 5;
    
    // Rarity Logic
    let itemKey = 'common_fish';
    let emoji = "🐟";
    const roll = Math.random() * 100 + (luck / 5);

    if (roll > 98) { itemKey = 'mythic_fish'; emoji = "🦑"; }
    else if (roll > 85) { itemKey = 'rare_fish'; emoji = "🐠"; }
    
    // Infection Check (5%)
    if (Math.random() < 0.05) {
      itemKey = 'infected_fish';
      emoji = "☣️";
    }

    const item = lootSystem.getItemInfo(itemKey);
    inventorySystem.addItem(senderJid, itemKey, 1);
    
    let msg = GET_BANNER(`🎣 FISHING`) + `\n\n`;
    msg += `You reeled something in!\n\n`;
    msg += `${emoji} *${item.name}*\n`;
    msg += `▫️ Rarity: ${item.rarity}\n`;
    msg += `▫️ Value: ${ZENI}${item.value.toLocaleString()}\n\n`;
    msg += `💡 Sell it at the Resistance HQ or keep it for crafting!`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: m });
    await awardProgression(senderJid, chatId);
  }, 5000);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` hunt - go hunting
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} hunt`) {
  if (!economy.isRegistered(senderJid)) {
    return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Register first to start scavenging!" });
  }

  await sock.sendMessage(chatId, { react: { text: "🏹", key: m.key } });
  await sock.sendMessage(chatId, { text: BOT_MARKER + "⏳ Tracking prey... please wait 5s." });

  setTimeout(async () => {
    const user = economy.getUser(senderJid);
    const luck = user.stats?.luck || 5;
    
    // Animal Pool
    const animals = [
      { id: 'rabbit_hide', emoji: "🐇", weight: 60 },
      { id: 'deer_antler', emoji: "🦌", weight: 30 },
      { id: 'bear_claw', emoji: "🐻", weight: 10 }
    ];

    let roll = Math.random() * 100 - (luck / 10);
    let selected = animals[0];
    
    for (const a of animals) {
      roll -= a.weight;
      if (roll <= 0) {
        selected = a;
        break;
      }
    }

    let itemKey = selected.id;
    let emoji = selected.emoji;

    // Infection Check (5%)
    let isInfected = false;
    if (Math.random() < 0.05) {
      itemKey = Math.random() < 0.5 ? 'infected_heart' : 'infected_shard';
      emoji = "☣️";
      isInfected = true;
    }

    const item = lootSystem.getItemInfo(itemKey);
    inventorySystem.addItem(senderJid, itemKey, 1);
    
    let msg = GET_BANNER(`🏹 HUNTING`) + `\n\n`;
    if (isInfected) msg += `⚠️ *ANOMALY DETECTED!*\n`;
    msg += `You tracked and took down a target!\n\n`;
    msg += `${emoji} *${item.name}*\n`;
    msg += `▫️ Rarity: ${item.rarity}\n`;
    msg += `▫️ Value: ${ZENI}${item.value.toLocaleString()}\n\n`;
    msg += `💡 Captures can be sold for profit or used in the Lab.`;

    await sock.sendMessage(chatId, { text: msg }, { quoted: m });
    await awardProgression(senderJid, chatId);
  }, 5000);
  return;
}

// AI Roasts with profile data
// 1. Personal Roast - Uses User Profile Data
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} roast` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} roast `)) {
    // Check if roasting someone else
    const targetJid = getMentionOrReply(m);
    
    if (!targetJid && lowerTxt.split(' ').length === 2 && lowerTxt.endsWith('roast')) {
        const usage = GET_BANNER(`🔥 ROAST`) + `\n\n*Usage:* \`${botConfig.getPrefix()} roast @user\`\n\n*Example:* \`${botConfig.getPrefix()} roast @friend\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    const finalTarget = targetJid || senderJid;
    const targetName = finalTarget.split('@')[0];

    try {
        // Load target's profile
        let targetProfile = getUserProfile(finalTarget);
        if (!targetProfile) {
            targetProfile = initializeUserProfile(finalTarget);
        }

        // Access memories correctly
        const mem = targetProfile.memories || {};

        // Build roast context from profile
        let roastContext = ``;
        const hasData = mem.likes?.length > 0 || 
                       mem.dislikes?.length > 0 || 
                       mem.hobbies?.length > 0 || 
                       mem.personal?.length > 0 ||
                       targetProfile.notes?.length > 0;

        if (hasData) {
            roastContext = `Target: @${targetName}\n`;
            if (targetProfile.nickname) roastContext += `Name: ${targetProfile.nickname}\n`;
            if (mem.likes?.length > 0) roastContext += `Likes: ${mem.likes.join(", ")}\n`;
            if (mem.dislikes?.length > 0) roastContext += `Dislikes: ${mem.dislikes.join(", ")}\n`;
            if (mem.hobbies?.length > 0) roastContext += `Hobbies: ${mem.hobbies.join(", ")}\n`;
            if (mem.personal?.length > 0) roastContext += `Facts: ${mem.personal.join(", ")}\n`;
            if (targetProfile.notes?.length > 0) {
                const noteTexts = targetProfile.notes.slice(-3).map(n => 
                    typeof n === 'object' ? n.content : n
                );
                roastContext += `Notes about them: ${noteTexts.join(", ")}\n`;
            }
            if (targetProfile.stats?.messageCount) {
                roastContext += `Messages: ${targetProfile.stats.messageCount}\n`;
            }
        }

        const systemPrompt = hasData 
            ? `You are ${botConfig.getBotName()} . Roast this person BRUTALLY using their specific data. Mention their weird likes, hobbies, or notes. Be sharp, witty, and savage. 2-3 sentences max.`
            : `You are ${botConfig.getBotName()} . This person is a ghost with ZERO data on file. Roast them for being invisible, boring, and having no personality. 2-3 sentences max.`;

        const userPrompt = hasData 
            ? `Roast this person based on their profile:\n${roastContext}`
            : `Roast this nobody who has no data, no personality, nothing interesting about them.`;

        const res = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            model: "llama-3.1-8b-instant",
        });

        const roastText = res.choices[0].message.content;

        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `@${targetName} ${roastText}`,
            contextInfo: { mentionedJid: [targetJid] }
        });
        await awardProgression(senderJid, chatId);
        return;

    } catch (err) {
        console.error("Roast Error:", err.message);
        await sock.sendMessage(chatId, { text: BOT_MARKER + "💀 Roast failed." });
        return;
    }
}

// Rate My...

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} rate`)) {
    // Check if rating someone else
    const targetJid = getMentionOrReply(m) || senderJid;
    const targetName = targetJid.split('@')[0];

    try {
        // Load target's profile
        let targetProfile = loadUserProfile(targetJid);
        if (!targetProfile) {
            targetProfile = initializeUserProfile(targetJid);
        }

        // Access memories correctly
        const mem = targetProfile.memories || {};

        // Build rating context
        let ratingContext = `Rating user: @${targetName}\n`;
        if (targetProfile.nickname) ratingContext += `Name: ${targetProfile.nickname}\n`;
        if (mem.likes?.length > 0) ratingContext += `Likes: ${mem.likes.slice(0, 3).join(`, `)}\n`;
        if (mem.hobbies?.length > 0) ratingContext += `Hobbies: ${mem.hobbies.slice(0, 3).join(", ")}\n`;
        if (targetProfile.stats?.messageCount) ratingContext += `Activity: ${targetProfile.stats.messageCount} messages\n`;

        const hasData = mem.likes?.length > 0 || mem.hobbies?.length > 0;

        const res = await groq.chat.completions.create({
            messages: [
                { role: "system", content: `You're ${botConfig.getBotName()}. Rate this person 0-10 based on their profile. Be witty and funny. Include a rating number and 1-2 sentence comment.` },
                { role: "user", content: hasData ? ratingContext : "Rate someone with no profile data (boring ghost)" }
            ],
            model: "llama-3.1-8b-instant",
        });

        const rating = res.choices[0].message.content;

        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `⭐ *Rating @${targetName}*\n\n${rating}`,
            contextInfo: { mentionedJid: [targetJid] }
        });
        await awardProgression(senderJid, chatId);
        return;

    } catch (err) {
        console.error("Rate Error:", err.message);
        // Fallback
        const rating = Math.floor(Math.random() * 11);
        const comments = ["Trash.", "Mid.", "Decent.", "Goated.", "Not bad.", "Meh."];
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `⭐ I rate @${targetName} a *${rating}/10*. ${comments[Math.floor(Math.random() * comments.length)]}`,
            contextInfo: { mentionedJid: [targetJid] }
        });
        await awardProgression(senderJid, chatId);
        return;
    }
}




// 🔥 `${botConfig.getPrefix().toLowerCase()}` powerscale <character> - Get character power stats from VS Battles Wiki
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} powerscale`)) {
    const character = txt.substring(`${botConfig.getPrefix().toLowerCase()} powerscale`.length).trim();
    
    if (!character) {
        await sock.sendMessage(chatId, {
            text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` powerscale <character name>\nExample: \`${botConfig.getPrefix().toLowerCase()}\` powerscale goku`
        });
        await awardProgression(senderJid, chatId);
        return;
    }

    await sock.sendMessage(chatId, { react: { text: `🔍`, key: m.key } });
    await sock.sendMessage(chatId, {
        text: BOT_MARKER + `🔍 Searching VS Battles Wiki for "${character}"...`
    });

    try {
        // Step 1: Search for character links
        const searchResults = await searchVSB(character);

        if (!searchResults || searchResults.length === 0) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `❌ No results found for "${character}" on VS Battles Wiki.`
            });
        }

        // Step 2: Try results until one provides valid stats
        let foundData = null;
        let finalUrl = "";

        for (const res of searchResults) {
            try {
                console.log(`🔍 [${BOT_ID}] Fetching API data for: ${res.name}`);
                const pageData = await scrapeVSBPage(res.url);
                
                // If Go service handled it, pageData already has stats.
                // We only call Groq if it's legacy HTML content.
                let stats = pageData.stats;
                if (pageData.htmlContent !== 'EXTRACTED_BY_GO') {
                    stats = await extractStatsWithGroq(pageData.htmlContent);
                }
                
                // If we have a summary, it's a valid character page even if stats are Unknown
                if (pageData.summary.length > 50 || (stats && stats.tier !== "Unknown")) {
                    foundData = { ...pageData, stats };
                    finalUrl = res.url;
                    break;
                }
            } catch (e) {
                console.log(`⚠️ [${BOT_ID}] Skipping ${res.name}: ${e.message}`);
            }
        }

        if (!foundData) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(chatId, {
                text: BOT_MARKER + `❌ No valid power scaling data found for "${character}".`
            });
        }

        // Build the formatted message
        let message = `🔥 *POWER SCALING: ${character.toUpperCase()}*\n\n`;

        if (foundData.summary && foundData.summary.length > 0) {
            const shortSummary = foundData.summary.substring(0, 350);
            message += `📖 *Summary:*\n${shortSummary}${foundData.summary.length > 350 ? '...' : ''}\n\n`;
        }

        message += `⚡ *POWER STATS:*\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `🏆 *TIER:* ${foundData.stats.tier}\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💥 *Attack Potency:* ${foundData.stats.ap}\n`;
        message += `🛡️ *Durability:* ${foundData.stats.durability}\n`;
        message += `⚡ *Speed:* ${foundData.stats.speed}\n`;
        message += `💪 *Stamina:* ${foundData.stats.stamina}\n`;
        message += `📏 *Range:* ${foundData.stats.range}\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📚 Source: VS Battles Wiki`;

        // Send with image if available
        if (foundData.imageUrl) {
            try {
                const imageResponse = await axios.get(foundData.imageUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                await sock.sendMessage(chatId, {
                    image: Buffer.from(imageResponse.data),
                    caption: BOT_MARKER + message
                });
            } catch (imgErr) {
                console.log("📸 Image load failed, sending text only");
                await sock.sendMessage(chatId, { text: BOT_MARKER + message });
            }
        } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + message });
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
        await awardProgression(senderJid, chatId);

    } catch (err) {
        console.error("❌ Powerscale Error:", err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(chatId, {
            text: BOT_MARKER + ` Failed to fetch power scaling data.\nError: ${err.message}`
        });
        await awardProgression(senderJid, chatId);
    }
    return;
}

// 🎱 8-Ball
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} 8ball` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} 8ball `)) {
  const question = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} 8ball`, '').trim();
  
  if (!question) {
    const usage = GET_BANNER(`🎱 8-BALL`) + `\n\n*Usage:* \`${botConfig.getPrefix()} 8ball <question>\`\n\n*Example:* \`${botConfig.getPrefix()} 8ball will i be rich? \``;
    await sock.sendMessage(chatId, { text: usage }, { quoted: m });
    return;
  }

  // react first
  await sock.sendMessage(chatId, { react: { text: `🎱`, key: m.key } });

 const answers = [
  "Yes.",
  "No.",
  "Maybe.",
  "Definitely.",
  "Very doubtful.",
  "Absolutely!",
  "I don’t think so.",
  "Outlook good.",
  "Outlook not so good.",
  "Signs point to yes.",
  "Without a doubt.",
  "You may rely on it.",
  "My sources say no.",
  "It is certain.",
  "Most likely.",
  "Chances aren’t good."
];

  
  const choice = answers[Math.floor(Math.random() * answers.length)];

  try {
    await sock.sendMessage(chatId, { text: BOT_MARKER + `🎱 *8-Ball says:* ${choice}` }, { quoted: m });
    // react success
    await sock.sendMessage(chatId, { react: { text: "✅", key: m.key } });
  } catch (err) {
    console.error('8-Ball send error', err);
    await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  }
  return;
}


// Ship Meter
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} ship` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ship `)) {
    const target = getMentionOrReply(m);
    let mentions = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    // Support reply if no mentions
    if (mentions.length === 0 && target) {
        mentions = [target];
    }

    // Check for usage
    if (mentions.length === 0) {
        const textInput = txt.substring(`${botConfig.getPrefix().toLowerCase()} ship `.length).trim();
        if (!textInput) {
            const usage = GET_BANNER(`❤️ SHIP`) + `\n\n*Usage:* \`${botConfig.getPrefix()} ship @u1 @u2\`\n\n*Example:* \`${botConfig.getPrefix()} ship @friend1 @friend2\``;
            await sock.sendMessage(chatId, { text: usage }, { quoted: m });
            return;
        }
    }
    
    let score = 0;
    let comment = ``;
    let namesDisplay = "";

    // ---------------------------------------------------------
    // SCENARIO 1: AI ANALYSIS (If users are tagged)
    // ---------------------------------------------------------
    if (mentions.length > 0) {
        await sock.sendMessage(chatId, { react: { text: "💘", key: m.key } });

        // Determine who is being shipped
        const u1Jid = mentions.length === 2 ? mentions[0] : senderJid;
        const u2Jid = mentions.length === 2 ? mentions[1] : mentions[0];

        // Load profiles
        const p1 = getUserProfile(u1Jid) || {};
        const p2 = getUserProfile(u2Jid) || {};

        const name1 = p1.nickname || u1Jid.split('@')[0];
        const name2 = p2.nickname || u2Jid.split('@')[0];
        namesDisplay = `${name1} & ${name2}`;

        // Format data for AI
        const formatData = (p) => {
            const likes = p.memories?.likes?.join(', ') || "Unknown";
            const dislikes = p.memories?.dislikes?.join(', ') || "Unknown";
            const hobbies = p.memories?.hobbies?.join(', ') || "Unknown";
            const personality = p.notes?.map(n => n.content).join('. ') || "Mystery";
            return `Likes: ${likes} | Dislikes: ${dislikes} | Hobbies: ${hobbies} | Notes: ${personality}`;
        };

        const prompt = `
        Analyze romantic compatibility between two people based on this data:
        
        Person A (${name1}): ${formatData(p1)}
        Person B (${name2}): ${formatData(p2)}
        
        Task:
        1. Calculate a compatibility percentage (0-100).
        2. Write a short, funny, 1-sentence verdict (roast them if incompatible).
        
        Output JSON ONLY:
        {"score": number, "comment": "string"}
        `;

        try {
            const res = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.1-8b-instant",
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(res.choices[0].message.content);
            score = result.score;
            comment = result.comment;

        } catch (err) {
            console.error("AI Ship Error:", err);
            // Fallback to random if AI fails
            score = Math.floor(Math.random() * 101);
            comment = "The stars remain silent... (AI Error)";
        }
    } 
    
    // ---------------------------------------------------------
    // SCENARIO 2: MATH HASH (If just text provided)
    // ---------------------------------------------------------
    else {
        const textInput = txt.substring(`${botConfig.getPrefix().toLowerCase()} ship `.length).trim();
        if (!textInput) return await sock.sendMessage(chatId, { text: BOT_MARKER + `Who are we shipping? Tag them or type names!` });

        namesDisplay = textInput;

        // Deterministic Hash Logic (So "A+B" always gives same score)
        const pairString = textInput.toLowerCase().split(/\s+(?:and|x|&|\+)\s+/i).sort().join("");
        let hash = 0;
        for (let i = 0; i < pairString.length; i++) {
            hash = pairString.charCodeAt(i) + ((hash << 5) - hash);
        }
        score = Math.abs(hash % 101);

        // Generic comments based on score
        if (score > 90) comment = "It's destiny! Put a ring on it! 💍";
        else if (score > 75) comment = "Getting spicy in here. 🔥";
        else if (score > 50) comment = "There's potential... maybe. ⚖️";
        else if (score > 25) comment = "It's a bit chilly. 🧊";
        else comment = "Run. Just run. ☠️";
    }
    let emoji = score > 90 ? "💍" : score > 75 ? "💖" : score > 50 ? "⚖️" : "💔";
    
    // Create Progress Bar
    const filledLength = Math.floor(score / 10);
    const emptyLength = 10 - filledLength;
    const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

    const response = [
        `${BOT_MARKER} ${emoji} *LOVE CALCULATOR* ${emoji}`,
        `*Pair:* ${namesDisplay}`,
        `*Score:* ${score}%`,
        `*Meter:* [${bar}]`,
        `*Verdict:* ${comment}`
    ].join('\n');

    return await sock.sendMessage(chatId, { text: response });
}

// Random Joke (AI)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} joke`) {
  const res = await groq.chat.completions.create({
    messages: [{ role: `user`, content: "Tell me a short funny,actually cultrally funny joke be creative" }],
    model: "llama-3.1-8b-instant",
  });
  await sock.sendMessage(chatId, { text: BOT_MARKER + `😂 ${res.choices[0].message.content}` });
  await awardProgression(senderJid, chatId);
  return;
}

// Truth or Dare (AI)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} truth`) {
  const res = await groq.chat.completions.create({
    messages: [{ role: `user`, content: "Ask one spicy/embarrassing truth question." }],
    model: "llama-3.1-8b-instant",
  });
  await sock.sendMessage(chatId, { text: BOT_MARKER + `🧐 *Truth:* ${res.choices[0].message.content}` });
  await awardProgression(senderJid, chatId);
  return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dare`) {
  const res = await groq.chat.completions.create({
    messages: [{ role: `user`, content: "Give one funny dare that can be done in a WhatsApp group." }],
    model: "llama-3.1-8b-instant",
  });
  await sock.sendMessage(chatId, { text: BOT_MARKER + `🔥 *Dare:* ${res.choices[0].message.content}` });
  await awardProgression(senderJid, chatId);
  return;
}


// Motivation
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} motivate`) {
  const res = await groq.chat.completions.create({
    messages: [{ role: `user`, content: "Give me an aggressive 1-sentence motivation." }],
    model: "llama-3.1-8b-instant",
  });
  await sock.sendMessage(chatId, { text: BOT_MARKER + `😤 ${res.choices[0].message.content}` });
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` fact - Random fact
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} fact`) {
  try {
    const factPrompt = `Generate one interesting random fact. Keep it under 100 words. Be fascinating and accurate.`;
    
    const completion = await smartGroqCall({
      model: selectModel(factPrompt.length, false),
      messages: [
        { role: "system", content: "You are a knowledgeable fact generator." },
        { role: "user", content: factPrompt }
      ]
    });

    const fact = completion.choices[0].message.content;
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `💡 *DID YOU KNOW?*\n\n${fact}` 
    }, { quoted: m });
  } catch (err) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Couldn't fetch a fact right now!" 
    });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` define <word> - Define a word
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} define` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} define `)) {
  const word = txt.substring(`${botConfig.getPrefix().toLowerCase()} define `.length).trim();
  
  if (!word) {
    const usage = GET_BANNER(`📖 DEFINE`) + `\n\n*Usage:* \`${botConfig.getPrefix()} define <word>\`\n\n*Example:* \`${botConfig.getPrefix()} define algorithm\``;
    await sock.sendMessage(chatId, { text: usage }, { quoted: m });
    return;
  }

  try {
    const definePrompt = `Define the word "${word}" in simple terms. Include: 1) Definition, 2) Part of speech, 3) Example sentence. Keep it concise but detailed when needed`;
    
    const completion = await smartGroqCall({
      model: selectModel(definePrompt.length, false),
      messages: [
        { role: "system", content: "You are a dictionary. Be clear and concise." },
        { role: "user", content: definePrompt }
      ]
    });

    const definition = completion.choices[0].message.content;
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `📖 *${word.toUpperCase()}*\n\n${definition}` 
    }, { quoted: m });
  } catch (err) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Couldn't define that word!" 
    });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` rate <thing> - Rate something out of 10
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rate` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} rate `)) {
  const thing = txt.substring(`${botConfig.getPrefix().toLowerCase()} rate `.length).trim();
  const target = getMentionOrReply(m);

  if (!thing && !target) {
    const usage = GET_BANNER(`⭐ RATE`) + `\n\n*Usage:* \`${botConfig.getPrefix()} rate <something/someone>\`\n\n*Example:* \`${botConfig.getPrefix()} rate anime\``;
    await sock.sendMessage(chatId, { text: usage }, { quoted: m });
    return;
  }

  // If it's a person
  if (target) {
    const targetJid = target;
    const targetName = targetJid.split('@')[0];

    try {
        let targetProfile = getUserProfile(targetJid);
        if (!targetProfile) targetProfile = initializeUserProfile(targetJid);
        const mem = targetProfile.memories || {};

        let ratingContext = `Rating user: @${targetName}\n`;
        if (targetProfile.nickname) ratingContext += `Name: ${targetProfile.nickname}\n`;
        if (mem.likes?.length > 0) ratingContext += `Likes: ${mem.likes.slice(0, 3).join(`, `)}\n`;
        if (mem.hobbies?.length > 0) ratingContext += `Hobbies: ${mem.hobbies.slice(0, 3).join(", ")}\n`;

        const completion = await smartGroqCall({
            messages: [
                { role: "system", content: `You're ${botConfig.getBotName()}. Rate this person 0-10 based on their profile. Be witty. 1-2 sentence comment.` },
                { role: "user", content: ratingContext }
            ],
            model: "llama-3.1-8b-instant",
        });

        const rating = completion.choices[0].message.content;
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `⭐ *Rating @${targetName}*\n\n${rating}`,
            contextInfo: { mentionedJid: [targetJid] }
        });
        await awardProgression(senderJid, chatId);
        return;
    } catch (e) { console.error(e); }
  }

  try {
    const ratePrompt = `Rate "${thing}" out of 10. Give a number (X/10) and a funny 1-sentence reason.`;
    
    const completion = await smartGroqCall({
      model: selectModel(ratePrompt.length, false),
      messages: [
        { role: "system", content: "You are a witty critic. Rate things creatively." },
        { role: "user", content: ratePrompt }
      ]
    });

    const rating = completion.choices[0].message.content;
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `⭐ *RATING: ${thing}*\n\n${rating}` 
    }, { quoted: m });
  } catch (err) {
    // Fallback to random rating
    const score = Math.floor(Math.random() * 11);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `⭐ I rate "${thing}" a solid *${score}/10*!` 
    }, { quoted: m });
  }
  await awardProgression(senderJid, chatId);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` summary / `${botConfig.getPrefix().toLowerCase()}` recap - Summarize recent group chat
// `${botConfig.getPrefix().toLowerCase()}` record
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} record`)) {
    const settings = getGroupSettings(chatId);
    const args = text.split(' ').slice(2); // Get `on` or "off"
    const action = args[0]?.toLowerCase();

    if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} record on`)) {
        settings.recording = true;
        saveGroupSettings();
        return await sock.sendMessage(chatId, { text: `⏺️ *Recording Enabled.* I will now start logging messages for future summaries.` });
    } 
    
   if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} record off`)) {
        settings.recording = false;
        saveGroupSettings();
        // Optional: Clear history when turned off
        groupMessageHistory.delete(chatId); 
        return await sock.sendMessage(chatId, { text: `⏹️ *Recording Disabled.* Existing logs for this session have been paused.` });
    }

    // If no args, show current status
    const count = groupMessageHistory.get(chatId)?.length || 0;
    const status = settings.recording ? "✅ ON" : "❌ OFF";
    await sock.sendMessage(chatId, { 
        text: `⏺️ *Recording Status: ${status}*\nMessages in current log: ${count}\n\nUse \`${botConfig.getPrefix().toLowerCase()} record on\` or \`${botConfig.getPrefix().toLowerCase()} record off\` to toggle.` 
    });
}



// --- END OF ADMIN COMMANDS ---



        // `${botConfig.getPrefix().toLowerCase()}` menu or `${botConfig.getPrefix().toLowerCase()}` help - show command list
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} menu`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} help`)) {
          const parts = lowerTxt.split(' ');
          const menuArgs = parts.slice(2); 
          await sendBotMenu(sock, chatId, menuArgs);
          return;
        }
        // Welcome message for Group chat marker1
       
        // Store the list of current participants in a variable

// Main message processing logic
if (isGroupChat && !senderIsAdmin) {
  const settings = getGroupSettings(chatId);
  
  if (settings.welcomeMessage) {
    // Check if the sender is a new user
    const isNewUser = !currentParticipants.includes(senderJid) && !senderIsAdmin && !botIsAdmin;

    if (isNewUser) {
      console.log(`New user detected:`, senderJid);
      // Send the welcome message to the new user
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + settings.welcomeMessage,
        mentions: [senderJid]
      });
    }
  }
}




        // ============================================
        // REGULAR BOT FUNCTIONALITY - AI responses
        // ============================================

        const mediaIndicator = m.message.imageMessage ? "🖼️ [Image]" : 
                             m.message.videoMessage ? "🎥 [Video]" : 
                             m.message.audioMessage ? "🎵 [Audio]" : 
                             m.message.stickerMessage ? "✨ [Sticker]" : "";
        
        // Detailed Logging
        const timestamp = new Date().toLocaleTimeString();
        const senderPush = m.pushName || "Unknown";
        const senderDisplay = `${senderPush} (${senderJid.split('@')[0]})`;
        
        let contextInfo = `👤 From: ${senderDisplay}`;
        
        if (isGroupChat) {
            let groupName = "Unknown Group";
            try {
                // Try to get cached group name first to save API calls
                const groupMetadata = await sock.groupMetadata(chatId);
                groupName = groupMetadata.subject;
            } catch (e) {
                groupName = chatId.split('@')[0];
            }
            contextInfo = `👥 Group: ${groupName} (${chatId.split('@')[0]})\n   👤 User: ${senderDisplay}`;
        }

        const logMsg = txt.substring(0, 100).replace(/\n/g, ' ') + (txt.length > 100 ? "..." : "");
        const finalLog = `\n[${timestamp}] 📨 [${BOT_NAME}] NEW MESSAGE\n   ${contextInfo}\n   💬 Content: ${mediaIndicator} ${logMsg}`.trim();
        
        console.log(finalLog);

        // check for yes/no confirmation to tag-everyone requests
        if (pendingTagRequests.has(senderJid)) {
          const pending = pendingTagRequests.get(senderJid);
          
          if (lowerTxt === 'yes' || lowerTxt === 'y' || lowerTxt === 'yeah' || lowerTxt === 'yep') {
            const groupMetadata = await sock.groupMetadata(pending.chatId);
            const participants = groupMetadata.participants.map(p => p.id);
            
            const announcement = `━━━━━━━━━━━━━━━━━
📢 *ANNOUNCEMENT*
━━━━━━━━━━━━━━━━━

${senderName} said y'all should know:

"${pending.announcement}"

━━━━━━━━━━━━━━━━━`;
            
            await sock.sendMessage(pending.chatId, {
              text: BOT_MARKER + announcement,
              mentions: participants
            });
            
            pendingTagRequests.delete(senderJid);
            return;
          } 
          else if (lowerTxt === 'no' || lowerTxt === 'n' || lowerTxt === 'nah' || lowerTxt === 'nope') {
            await sock.sendMessage(chatId, { text: BOT_MARKER + "alright, cancelled." });
            pendingTagRequests.delete(senderJid);
            return;
          }
        }

        // ============================================
        // 🏰 GUILD ADVENTURE COMMANDS
        // ============================================


        // START ADVENTURE (with mode selection)
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} quest`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} adventure`)) {
    if (!economy.isRegistered(senderJid)) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` });
        return;
    }
    
    // Check for stop
    if (lowerTxt.endsWith(' stop')) {
        const result = guildAdventure.stopQuest(chatId, senderJid, canUseAdminCommands);
        await sock.sendMessage(chatId, { text: BOT_MARKER + result });
        return;
    }

    // Check for hardcore
    const isHardcore = lowerTxt.includes('hardcore') || lowerTxt.includes('permadeath');
    
    // Parse rank
    const parts = lowerTxt.split(' ');
    let rank = null;
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    for (const p of parts) {
        if (ranks.includes(p.toUpperCase())) {
            rank = p.toUpperCase();
            break;
        }
    }

    const result = await guildAdventure.initAdventure(sock, chatId, groq, isHardcore ? 'PERMADEATH' : 'NORMAL', false, rank, senderJid, smartGroqCall);
    if (result.success && !result.isMenu) {
      const state = guildAdventure.getGameState(chatId);
      if (state) state.onHardcoreDeath = addToGraveyard;
    }
    await sock.sendMessage(chatId, { text: result.msg });
    return;
}

// JOIN ADVENTURE
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} join`) {
    if (!economy.isRegistered(senderJid)) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` });
        return;
    }
    const result = guildAdventure.joinAdventure(chatId, senderJid, senderName);
    await sock.sendMessage(chatId, { text: result });
    return;
}

// SOLO QUEST
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} solo`)) {
    if (!economy.isRegistered(senderJid)) {
        await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` });
        return;
    }

    // Check for stop
    if (lowerTxt.endsWith(' stop')) {
        const result = guildAdventure.stopQuest(chatId, senderJid, canUseAdminCommands);
        await sock.sendMessage(chatId, { text: BOT_MARKER + result });
        return;
    }

    // Check for hardcore
    const isHardcore = lowerTxt.includes('hardcore') || lowerTxt.includes('permadeath');
    
    // Parse rank
    const parts = lowerTxt.split(' ');
    let rank = null;
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    for (const p of parts) {
        if (ranks.includes(p.toUpperCase())) {
            rank = p.toUpperCase();
            break;
        }
    }

    const result = await guildAdventure.initAdventure(sock, chatId, groq, isHardcore ? 'PERMADEATH' : 'NORMAL', true, rank, senderJid, smartGroqCall);
    if (result.success && !result.isMenu) {
        const state = guildAdventure.getGameState(chatId);
        if (state) state.onHardcoreDeath = addToGraveyard;
        
        // initAdventure already auto-joins for solo, so we don't call joinAdventure again
        
        let startMsg = `╔════════════════════╗\n`;
        startMsg += `   🗡️  *QUEST STARTING* \n`;
        startMsg += `╚════════════════════╝\n\n`;
        startMsg += `👤 Hero: *${senderName}*\n`;
        startMsg += `⭐ Rank: *${rank || 'F'}*\n`;
        startMsg += `🔥 Mode: *${isHardcore ? 'HARDCORE' : 'NORMAL'}*\n\n`;
        startMsg += `⚔️ Preparing the battlefield...`;

        await sock.sendMessage(chatId, { text: BOT_MARKER + startMsg });
    } else {
        await sock.sendMessage(chatId, { text: result.msg });
    }
    return;
}

// ============================================
// 🛒 SHOP & CLASS COMMANDS
// ============================================

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} shop` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} shop `)) {
    const category = lowerTxt.split(' ')[2] || 'all';
    await shopCommands.displayShop(sock, chatId, category);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} buy `)) {
    // Check if this is adventure shop (during quest)
    const state = guildAdventure.getGameState(chatId);
    if (state && state.phase === 'SHOPPING') {
        const itemNum = lowerTxt.split(' ')[2];
        const result = guildAdventure.handleBuy(chatId, senderJid, itemNum);
        await sock.sendMessage(chatId, { text: result });
        return;
    }
    
    // Otherwise use global shop
    const parts = txt.split(' ').slice(2);
    const itemId = parts.join('_').toLowerCase();
    await shopCommands.buyItem(sock, chatId, senderJid, itemId);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} evolve `)) {
    const choice = lowerTxt.split(' ')[2];
    await shopCommands.handleEvolutionChoice(sock, chatId, senderJid, choice);
    return;
}

// ============================================
// 🌳 SKILL TREE COMMANDS
// ============================================

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} skill tree` || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} st` ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} skilltree`) {
    await skillCommands.displaySkillTree(sock, chatId, senderJid, senderName);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} evolve`)) {
    const parts = txt.split(' ');
    const args = parts.slice(1);
    await skillCommands.handleEvolve(sock, chatId, senderJid, senderName, args);
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} classes`) {
    await classCommands.displayClasses(sock, chatId);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} skill up `) ||
    lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} skill upgrade `)) {
    const parts = txt.split(' ');
    const skillId = parts.slice(3).join(' ');
    
    if (!skillId) {
        await sock.sendMessage(chatId, { 
            text: `❌ Specify a skill!\n\nUsage: \`${botConfig.getPrefix()} skill up <skill_name>\`` 
        });
        return;
    }
    
    await skillCommands.upgradeSkill(sock, chatId, senderJid, skillId);
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} skill reset` ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} reset skills`) {
    await skillCommands.resetSkills(sock, chatId, senderJid);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} skill learn`) ||
    lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} learn skill`)) {
    const parts = txt.split(' ');
    // Handle both ".j skill learn <id>" and ".j learn skill <id>"
    // .j(0) skill(1) learn(2) <id>(3+)
    const skillId = parts.length > 3 ? parts.slice(3).join(' ') : null;
    
    await skillCommands.learnSkill(sock, chatId, senderJid, skillId);
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} abilities` || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} skills` || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} combat abilities`) {
    await skillCommands.viewAbilities(sock, chatId, senderJid, senderName);
    return;
}

// `${botConfig.getPrefix().toLowerCase()}` duel @user [stake] - Challenge player to PVP
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} duel` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} duel `) ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} challenge` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} challenge `)) {
    const target = getMentionOrReply(m);
    if (!target) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} duel @user [stake_amount]\`` });
    }
    if (target === senderJid) return await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ You can't fight yourself, edge-lord." });

    const args = lowerTxt.split(' ');
    const stake = parseInt(args.find(a => !isNaN(a) && a > 0)) || 0;

    const result = pvpSystem.challengePlayer(chatId, senderJid, target, stake);
    if (result.success) {
        let msg = `⚔️ *DUEL CHALLENGE* ⚔️\n\n`;
        msg += `@${senderJid.split('@')[0]} has challenged @${target.split('@')[0]} to a duel!\n`;
        if (stake > 0) msg += `💰 *Stakes:* ${ZENI}${stake.toLocaleString()}\n`;
        msg += `\n⏳ *Time:* 120s to accept.\n💡 Type \`${botConfig.getPrefix().toLowerCase()} accept\` to begin!`;
        
        await sock.sendMessage(chatId, { text: BOT_MARKER + msg, mentions: [senderJid, target] });
    } else {
        await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
    return;
}
// ... [Accept/Decline blocks]
// PVP ACTIONS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} pvp` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} pvp `)) {
    const parts = lowerTxt.split(' ');
    const action = parts[2];
    
    if (!action) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} pvp <attack|ability|item|stats|flee>\`` });
    }

    const target = parts[3];

    const result = await pvpSystem.handlePvPAction(sock, chatId, senderJid, action, target, m);
    if (result.success) {
        if (result.image?.success) {
            await sock.sendMessage(chatId, { 
                image: { url: result.image.path }, 
                caption: BOT_MARKER + result.message,
                mentions: result.mentions || []
            });
        } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + result.message, mentions: result.mentions || [] });
        }
    }
    return;
}
// COMBAT ACTIONS
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} combat`)) {
    const parts = lowerTxt.split(' ');
    const action = parts[2]; // attack, ability, item, defend
    
    // Help command for combat
    if (!action || action === 'help' || action === 'h') {
        let helpMsg = `⚔️ *COMBAT COMMANDS* ⚔️\n\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat attack <num>\` - Basic attack enemy\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat ability <num> <target>\` - Use class ability\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat item <num> [target]\` - Use a combat item\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat defend\` - Reduce incoming damage\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat status\` - View combat status\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat abilities\` - List your skills\n`;
        helpMsg += `• \`${botConfig.getPrefix().toLowerCase()} combat items\` - List your items\n`;
        await sock.sendMessage(chatId, { text: helpMsg });
        return;
    }
    
    // Status command
    if (action === 'status') {
        const state = guildAdventure.getGameState(chatId);
        if (!state || !state.inCombat) {
            await sock.sendMessage(chatId, { text: "❌ No combat active!" });
            return;
        }
        
        let msg = `⚔️ *COMBAT STATUS* ⚔️\n\n`;
        msg += `📍 Round: ${state.combatRound + 1}\n\n`;
        
        msg += `👥 *Party:*\n`;
        state.players.forEach(p => {
            if (!p.isDead) {
                const icon = p.class?.icon || '👤';
                const hpPercent = Math.floor((p.stats.hp / p.stats.maxHp) * 100);
                msg += `${icon} ${p.name} - ${p.stats.hp}/${p.stats.maxHp} HP (${hpPercent}%)\n`;
            } else {
                msg += `💀 ${p.name} - FALLEN\n`;
            }
        });
        
        msg += `\n👾 *Enemies:*\n`;
        state.enemies.forEach((e, i) => {
            if (e.stats.hp > 0) {
                const hpPercent = Math.floor((e.stats.hp / e.stats.maxHp) * 100);
                msg += `${i + 1}. ${e.icon} ${e.name} - ${e.stats.hp}/${e.stats.maxHp} HP (${hpPercent}%)\n`;
            } else {
                msg += `${i + 1}. ${e.icon} ${e.name} - DEFEATED\n`;
            }
        });
        
        const current = state.activeCombatant;
        if (current) {
            const currentIcon = current.isEnemy ? current.icon : (current.class?.icon || '👤');
            msg += `\n🎯 *Current Turn:* ${currentIcon} ${current.name}`;
        }
        
        await sock.sendMessage(chatId, { text: msg });
        return;
    }

    const combatTarget = parts.slice(3).join(' ');
    try {
        const result = await guildAdventure.handleCombatAction(sock, chatId, senderJid, action, combatTarget);
        if (result) {
            await sock.sendMessage(chatId, { text: result });
        }
    } catch (err) {
        console.error("Combat action failed:", err.message);
    }
    return;
}

// SHORTCUT: .j item <num> [target]
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} item` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} item `)) {
    const parts = lowerTxt.split(' ');
    const itemNum = parts[2];
    if (!itemNum) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} item <num> [target]\`` });
    }
    const target = parts[3];
    
    try {
        const result = await guildAdventure.handleCombatAction(sock, chatId, senderJid, 'item', itemNum + (target ? ` ${target}` : ''));
        if (result) {
            await sock.sendMessage(chatId, { text: result });
        }
    } catch (err) {
        console.error("Combat item shortcut failed:", err.message);
    }
    return;
}

// VOTE (for non-combat encounters)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} vote` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} vote `)) {
    const choice = lowerTxt.split(' ')[2];
    if (!choice) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} vote <number>\`` });
    }
    const result = guildAdventure.handleVote(chatId, senderJid, choice);
    await sock.sendMessage(chatId, { text: result });
    return;
}

// EQUIPMENT COMMANDS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} equip`) {
    await rpgCommands.equipItem(sock, chatId, senderJid, null, null);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} equip `)) {
    const parts = txt.split(' ');
    const itemId = parts[2];
    const slot = parts[3];
    await rpgCommands.equipItem(sock, chatId, senderJid, itemId, slot);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} unequip `)) {
    const parts = lowerTxt.split(' ');
    const slot = parts[2];
    await rpgCommands.unequipItem(sock, chatId, senderJid, slot);
    return;
}

        // ============================================
        // PROFILE MANAGEMENT COMMANDS
        // ============================================

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} economy`) {
    const stats = economy.getGlobalEconomyStats();
    const loans = require('./loans');
    const stockMarket = require('./stockMarket');
    const totalDebt = loans.getTotalDebt();
    const marketCap = stockMarket.getMarketCap();
    
    let msg = `📊 **Global Economy Statistics**\n`;
    msg += `​Total Users: ${stats.totalUsers}\n`;
    msg += `​Total Wealth: ${stats.totalWealth.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​In Wallets: ${stats.totalWallet.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​In Banks: ${stats.totalBank.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​Premium Members: ${stats.premiumMembers}\n`;
    msg += `​Diamond Members: ${stats.diamondMembers}\n`;
    msg += `​Active Businesses: 0\n`;
    msg += `​Outstanding Loan Debt: ${totalDebt.toLocaleString()} ${economy.getZENI()}\n\n`;
    
    msg += `​🔍 **Deep Insights**\n`;
    msg += `​Avg Wealth: ${stats.avgWealth.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​Frozen Assets: ${stats.totalFrozen.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​Market Cap (Stocks): ${marketCap.toLocaleString()} ${economy.getZENI()}\n`;
    msg += `​Business Valuation: 0 ${economy.getZENI()}\n`;
    msg += `​Wealth Share (Top 1%): ${stats.top1Share}%\n`;
    msg += `​Wealth Share (Top 10%): ${stats.top10Share}%\n`;
    msg += `​Richest User: ${stats.richest ? `${stats.richest.name} with ${stats.richest.amount.toLocaleString()} ${economy.getZENI()}` : 'None'}\n`;
    
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

// STOCK MARKET COMMANDS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} stocks`) {
    const stockMarket = require('./stockMarket');
    let msg = `📈 **ZENI STOCK EXCHANGE** 📈\n\n`;
    for (const [symbol, s] of Object.entries(stockMarket.STOCKS)) {
        msg += `• *${s.name}* (\`${symbol}\`)\n  Price: ${economy.getZENI()}${s.price.toLocaleString()}\n\n`;
    }
    msg += `💡 Use: \`${botConfig.getPrefix()} buy stock <symbol> <amt>\` or \`${botConfig.getPrefix()} sell stock <symbol> <amt>\``;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} buy stock `) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} sell stock `)) {
    const stockMarket = require('./stockMarket');
    const isBuy = lowerTxt.includes('buy');
    const parts = lowerTxt.split(' ');
    const symbol = parts[3]?.toUpperCase();
    const amount = parseInt(parts[4]);
    
    if (!symbol || isNaN(amount)) {
        return sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} ${isBuy?'buy':'sell'} stock <symbol> <amount>\`` });
    }
    
    const result = isBuy ? stockMarket.buyStock(senderJid, symbol, amount) : stockMarket.sellStock(senderJid, symbol, amount);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    return;
}

// INVESTMENT COMMANDS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} invest`) {
    const invest = require('./investment');
    let msg = `🏦 **INVESTMENT PROGRAMS** 🏦\n\n`;
    for (const [id, plan] of Object.entries(invest.INVESTMENT_PLANS)) {
        msg += `• *${plan.name}* (\`${id}\`)\n  Rate: +${(plan.interest*100).toFixed(0)}% | Time: ${plan.durationDays} days\n  Min: ${economy.getZENI()}${plan.minDeposit.toLocaleString()}\n\n`;
    }
    msg += `💡 Use: \`${botConfig.getPrefix()} invest <id> <amount>\` to start or \`${botConfig.getPrefix()} invest claim\` to collect matured funds.`;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} invest `)) {
    const invest = require('./investment');
    const parts = lowerTxt.split(' ');
    const action = parts[2];
    
    if (action?.toLowerCase() === 'claim') {
        const result = invest.claimInvestment(senderJid);
        return sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
    
    const amount = parseInt(parts[3]);
    if (!action || isNaN(amount)) {
        return sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} invest <id> <amount>\`` });
    }
    
    const result = invest.startInvestment(senderJid, action, amount);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    return;
}

// STOCK MARKET COMMANDS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} stocks` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} market`) {
    let msg = `📈 **GLOBAL STOCK MARKET** 📈\n\n`;
    for (const [symbol, stock] of Object.entries(stockMarket.STOCKS)) {
        msg += `• *${stock.name}* (\`${symbol}\`)\n  Price: ${economy.getZENI()}${stock.price.toLocaleString()}\n\n`;
    }
    msg += `💡 Use: \`${botConfig.getPrefix()} stocks buy <symbol> <amount>\` or \`${botConfig.getPrefix()} stocks sell <symbol> <amount>\`\n`;
    msg += `📊 To view your shares: \`${botConfig.getPrefix()} stocks portfolio\``;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} stocks `)) {
    const parts = lowerTxt.split(' ');
    const action = parts[2]?.toLowerCase();
    
    if (action === 'portfolio' || action === 'me') {
        const portfolio = stockMarket.getPortfolio(senderJid);
        if (portfolio.length === 0) {
            return sock.sendMessage(chatId, { text: BOT_MARKER + "📊 You don't own any stocks yet!" });
        }
        
        let msg = `📊 **YOUR PORTFOLIO** 📊\n\n`;
        let totalValue = 0;
        portfolio.forEach(s => {
            msg += `• *${s.name}* (${s.symbol})\n  Shares: ${s.amount} | Value: ${economy.getZENI()}${s.totalValue.toLocaleString()}\n\n`;
            totalValue += s.totalValue;
        });
        msg += `━━━━━━━━━━━━━━━\n💰 **Total Portfolio Value:** ${economy.getZENI()}${totalValue.toLocaleString()}`;
        return sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    }
    
    const symbol = parts[3]?.toUpperCase();
    const amount = parseInt(parts[4]);
    
    if (!symbol || isNaN(amount) || amount <= 0) {
        return sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} stocks <buy/sell> <symbol> <amount>\`` });
    }
    
    if (action === 'buy') {
        const result = stockMarket.buyStock(senderJid, symbol, amount);
        await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    } else if (action === 'sell') {
        const result = stockMarket.sellStock(senderJid, symbol, amount);
        await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    }
    return;
}

// MEMBERSHIP COMMANDS
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} membership` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} premium`) {
    let msg = `💎 **ADVENTURER MEMBERSHIPS** 💎\n\n`;
    for (const [id, tier] of Object.entries(economy.MEMBERSHIP_TIERS)) {
        msg += `• *${tier.name}* (\`${id}\`)\n  Cost: ${economy.getZENI()}${tier.cost.toLocaleString()} / 30 days\n  Daily: +${economy.getZENI()}${tier.dailyBonus.toLocaleString()}\n  Bank Tax: ${(tier.bankTax*100).toFixed(0)}%\n\n`;
    }
    msg += `💡 Use: \`${botConfig.getPrefix()} buy membership <id>\``;
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} buy membership` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} buy membership `)) {
    const tierId = lowerTxt.split(' ')[3];
    if (!tierId) {
        return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} buy membership <id>\`` });
    }
    const result = economy.buyMembership(senderJid, tierId);
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
    return;
}

if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} monster guide` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} monsters`) {
    const monsterSkills = require('./monsterSkills');
    const bossMechanics = require('./bossMechanics');
    
    let msg = monsterSkills.formatMonsterGuide();
    
    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `👑 **ELITE BOSS SKILLS** 👑\n\n`;
    
    for (const [id, ability] of Object.entries(bossMechanics.BOSS_ABILITIES)) {
        msg += `• *${ability.name}* ${ability.isTelegraphed ? '⚠️' : ''}\n`;
        msg += `  ${ability.telegraphMessage || `Deals ${ability.damage}x ATK`}\n\n`;
    }
    
    await sock.sendMessage(chatId, { text: BOT_MARKER + msg });
    return;
}

        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} nickname` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} nickname `)) {
          const nickname = txt.substring(`${botConfig.getPrefix().toLowerCase()} nickname `.length).trim();
          if (!nickname) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} nickname <your_new_name>\`` });
            return;
          }
          updateUserProfile(senderJid, { nickname });
          await sock.sendMessage(chatId, { text: BOT_MARKER + `got it. i'll call you ${nickname}.` });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} note` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} note `)) {
          const note = txt.substring(`${botConfig.getPrefix().toLowerCase()} note `.length).trim();
          if (!note) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} note <text_to_remember>\`` });
            return;
          }
          addUserNote(senderJid, note);
          await sock.sendMessage(chatId, { text: BOT_MARKER + `noted.` });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} likes` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} likes `)) {
          const content = txt.substring(`${botConfig.getPrefix().toLowerCase()} likes `.length).trim();
          if (!content) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} likes <what_you_like>\`` });
            return;
          }
          addUserMemory(senderJid, 'likes', content);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "got it. i'll remember that." });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dislikes` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dislikes `)) {
          const content = txt.substring(`${botConfig.getPrefix().toLowerCase()} dislikes `.length).trim();
          if (!content) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} dislikes <what_you_hate>\`` });
            return;
          }
          addUserMemory(senderJid, `dislikes`, content);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "noted." });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} hobby` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} hobby `)) {
          const content = txt.substring(`${botConfig.getPrefix().toLowerCase()} hobby `.length).trim();
          if (!content) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} hobby <your_hobby>\`` });
            return;
          }
          addUserMemory(senderJid, `hobbies`, content);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "cool." });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} personal` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} personal `)) {
          const content = txt.substring(`${botConfig.getPrefix().toLowerCase()} personal `.length).trim();
          if (!content) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} personal <fact_about_you>\`` });
            return;
          }
          addUserMemory(senderJid, `personal`, content);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "i'll remember that." });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} remember` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} remember `)) {
          const content = txt.substring(`${botConfig.getPrefix().toLowerCase()} remember `.length).trim();
          if (!content) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} remember <any_fact>\`` });
            return;
          }
          addUserMemory(senderJid, `other`, content);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "got it." });
          return;
        }
        
// ============================================
// ECONOMY COMMANDS - COMPLETE SECTION
// ============================================

// ${botConfig.getPrefix().toLowerCase()} register [nickname] - Create economy account
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} register`)) {
  let nickname = txt.substring(`${botConfig.getPrefix().toLowerCase()} register`.length).trim();
  
  // Use WhatsApp display name if no nickname provided
  if (!nickname) {
    nickname = m.pushName || `User_${senderJid.split('@')[0].slice(-4)}`;
  }

  if (nickname.length < 2) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Nickname must be at least 2 characters!` 
    });
    return;
  }
  
  if (nickname.length > 20) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Nickname too long! Max 20 characters." 
    });
    return;
  }
  
  const result = economy.registerUser(senderJid, nickname);
  
  if (result.success) {
    // Also update user profile with nickname
    updateUserProfile(senderJid, { nickname });
  }
  
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  await awardProgression(senderJid, chatId);
  return;
}


        // ============================================
        // REGISTRATION & TRANSFER
        // ============================================

        // ${botConfig.getPrefix().toLowerCase()} loan @user <amt> <%> <time> - Request loan
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} loan `) && !lowerTxt.includes('accept') && !lowerTxt.includes('decline')) {
            const lender = getMentionOrReply(m);
            if (!lender) {
                 await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Mention a lender or reply to them.\nUsage: \`${botConfig.getPrefix()} loan @user <amount> <interest%> <time>\`` });
                 return;
            }
            
            // Clean split
            const parts = txt.trim().split(/\s+/);
            
            let amount = null;
            let interest = null;
            let duration = null;
            
            for (const part of parts) {
                // Skip command keywords and mentions
                if (part.startsWith(botConfig.getPrefix()) || part.toLowerCase() === 'loan' || part.includes('@')) continue;
                
                const lowerPart = part.toLowerCase();
                
                if (lowerPart.endsWith('%')) {
                    interest = parseInt(lowerPart.replace('%', ''));
                } else if (lowerPart.endsWith('m') || lowerPart.endsWith('min') || lowerPart.endsWith('mins')) {
                    duration = parseInt(lowerPart.replace(/mins?|m/, ''));
                } else if (!isNaN(parseInt(part))) {
                    // Assume plain number is amount
                    amount = parseInt(part);
                }
            }
            
            if (!amount || !interest || !duration) {
                await sock.sendMessage(chatId, { 
                    text: BOT_MARKER + `❌ Invalid format.\nUsage: \`${botConfig.getPrefix()} loan @user 1000 10% 60m\`\n\n• Amount: Number (e.g. 1000)\n• Interest: Ends with % (e.g. 10%)\n• Time: Ends with m (e.g. 60m)` 
                });
                return;
            }

            const res = loans.requestLoan(senderJid, lender, amount, interest, duration);
            await sock.sendMessage(chatId, { 
                text: BOT_MARKER + res.msg, 
                mentions: [lender] 
            });
            return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` transfer @user <amount> - Transfer money
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} transfer `) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} send `)) {
          const receiver = getMentionOrReply(m);
          
          if (!receiver) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` transfer @user <amount>\n\nExample: \`${botConfig.getPrefix().toLowerCase()}\` transfer @user 500 or reply to them.` 
            });
            return;
          }
          
          const args = txt.split(/\s+/);
          const amount = parseInt(args[args.length - 1]);
          
          if (!amount || isNaN(amount)) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Invalid amount!" });
            return;
          }
          
          const result = economy.transferMoney(senderJid, receiver, amount);
          
          if (result.success) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + result.message,
              mentions: [result.receiver]
            });
          } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          }
          
          return;
        }

// ${botConfig.getPrefix().toLowerCase()} balance / ${botConfig.getPrefix().toLowerCase()} bal - Check your balance
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} balance` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} bal` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} money`) {
  if (!economy.isRegistered(senderJid)) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` 
    });
    return;
  }
  
  const balance = economy.getBankBalance(senderJid);
  const user = economy.getUser(senderJid);
  
  const balText = `┏━━━━━━━━━━━━━━━┓
┃   💰 BALANCE  ┃
┗━━━━━━━━━━━━━━━┛

👤 ${user.nickname}
━━━━━━━━━━━━━━━

👛 Wallet: ${economy.getZENI()}${balance.wallet.toLocaleString()}
🏦 Bank: ${economy.getZENI()}${balance.bank.toLocaleString()}
❄️ Frozen: ${economy.getZENI()}${(user.frozenAssets?.wallet + user.frozenAssets?.bank).toLocaleString()}
━━━━━━━━━━━━━━━
💎 Total: ${economy.getZENI()}${balance.total.toLocaleString()}`;

  await sock.sendMessage(chatId, { 
    image: fs.readFileSync(botConfig.getAssetPath('zeni.png')),
    caption: BOT_MARKER + balText,
  mentions: [senderJid]
  }
  );
  await awardProgression(senderJid, chatId);
  return;
}

// ${botConfig.getPrefix().toLowerCase()} bh - Balance History
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} bh` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} history`) {
  if (!economy.isRegistered(senderJid)) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` 
    });
    return;
  }
  
  const user = economy.getUser(senderJid);
  const history = user.history || [];
  
  if (history.length === 0) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `┏━━━━━━━━━━━━━━━┓\n┃   📜 HISTORY  ┃\n┗━━━━━━━━━━━━━━━┛\n\nYour history is empty.` 
    });
    return;
  }
  
  let historyText = `┏━━━━━━━━━━━━━━━┓\n┃   📜 HISTORY  ┃\n┗━━━━━━━━━━━━━━━┛\n\n👤 *User:* ${user.nickname}\n💰 *Balance:* ${economy.getZENI()}${user.wallet.toLocaleString()}\n\n`;
  
  // Show last 10 transactions
  const displayHistory = history.slice(0, 10);
  
  displayHistory.forEach((entry, i) => {
    const time = new Date(entry.time).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const prefix = entry.amount > 0 ? "📈 +" : "📉 ";
    historyText += `${i+1}. *${entry.desc}*\n   ${prefix}${economy.getZENI()}${Math.abs(entry.amount).toLocaleString()}\n   ⏱️ _${time}_\n\n`;
  });
  
  historyText += `_Only showing last 10 transactions._`;

  await sock.sendMessage(chatId, { text: BOT_MARKER + historyText });
  return;
}

        // daily - Claim daily reward
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} daily`) {
  const result = economy.claimDaily(senderJid);
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  
  // Award guild points for daily claim
  if (result.success) {
    try {
      const guilds = require(`./guilds`);
      guilds.awardPointsForActivity(senderJid, 'daily_claimed');
    } catch (err) {
      // Guild system not available, skip
    }
  }
  await awardProgression(senderJid, chatId);
  return;
}

        // ${botConfig.getPrefix().toLowerCase()} rob @user - Rob money
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} rob `) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} steal `)) {
             if (!economy.isRegistered(senderJid)) {
                await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` });
                return;
             }
             
             const victim = getMentionOrReply(m);

             if (!victim) {
                 await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix()} rob @user\` or reply to their message.` });
                 return;
             }

             if (victim === senderJid) {
                 await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You can't rob yourself.` });
                 return;
             }

             // Check if target is the bot
             const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
             const botLid = sock.authState.creds?.me?.lid;
             if (victim === botJid || victim === botLid) {
                 await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ you cant rob the bot` });
                 return;
             }
             
             const result = economy.robUser(senderJid, victim);
             await sock.sendMessage(chatId, { 
                 text: BOT_MARKER + result.message,
                 contextInfo: { mentionedJid: [victim, senderJid] }
             });
             await awardProgression(senderJid, chatId);
             return;
        }

// transfer @user <amount> / .joker send @user <amount>
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} transfer`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} send`)) {
  if (!economy.isRegistered(senderJid)) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` 
    });
    return;
  }
  
  const receiver = getMentionOrReply(m);
  
  if (!receiver) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Tag someone or reply to them to send money!

📝 Usage: \`${botConfig.getPrefix().toLowerCase()} transfer @user <amount>\`

Examples:
  ${botConfig.getPrefix().toLowerCase()} transfer @user 500
  ${botConfig.getPrefix().toLowerCase()} send @user 1000`
    });
    return;
  }
  
  const args = txt.split(` `);
  const amount = parseInt(args[args.length - 1]); // Last arg is amount
  
  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Invalid amount! Must be a positive number." 
    });
    return;
  }
  
  const result = economy.transferMoney(senderJid, receiver, amount);
  
  if (result.success) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + result.message,
      contextInfo: { mentionedJid: [result.receiver] }
    });
  } else {
    await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  }
  
  await awardProgression(senderJid, chatId);
  return;
}

// rich - Show richest users (top 10)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rich` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} richest` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} lb money`) {
  try {
    const leaderboard = economy.getMoneyLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + "📊 No registered users yet!" 
      });
      return;
    }
    
    let text = BOT_MARKER + `╔═══════════════════╗
   💰 RICHEST USERS 💰
╚═══════════════════╝

📊 Top ${leaderboard.length} by Total Wealth

━━━━━━━━━━━━━━━━━━
`;
    
    const mentions = [];
    
    leaderboard.forEach((user, i) => {
      const medal = i === 0 ? `🥇` : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const nickname = user.nickname || user.userId.split('@')[0];
      
      text += `${medal} @${user.userId.split('@')[0]}\n`;
      text += `   💎 ${economy.getZENI()}${user.total.toLocaleString()}\n`;
      text += `   💵 Wallet: ${economy.getZENI()}${user.total - (user.bank || 0) >= 0 ? (user.total - (user.bank || 0)).toLocaleString() : '0'}\n`;
      text += `━━━━━━━━━━━━━━━━━━\n`;
      
      mentions.push(user.userId);
    });
    
    await sock.sendMessage(chatId, { 
      text: text,
      mentions: mentions
    });
    
  } catch (err) {
    console.error("Rich leaderboard error:", err);
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + "❌ Failed to load leaderboard!" 
    });
  }
  return;
}

// deposit <amount> / .joker dep <amount>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} deposit` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} deposit `) || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} dep` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dep `)) {
  const args = txt.split(` `);
  let amount = args[2];
  
  if (!amount) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} deposit <amount|all>\`` 
    });
    return;
  }
  
  // Handle "all" keyword
  if (amount.toLowerCase() === `all`) {
    const balance = economy.getBalance(senderJid);
    amount = balance;
  } else {
    amount = parseInt(amount);
  }
  
  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Invalid amount!" });
    return;
  }
  
  const result = economy.deposit(senderJid, amount);
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  return;
}

// withdraw <amount> / .joker with <amount>
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} withdraw` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} withdraw `) || 
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} with` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} with `)) {
  const args = txt.split(` `);
  let amount = args[2];
  
  if (!amount) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} withdraw <amount|all>\``
    });
    return;
  }
  
  // Handle "all" keyword
  if (amount.toLowerCase() === `all`) {
    const bankData = economy.getBankBalance(senderJid);
    amount = bankData.bank;
  } else {
    amount = parseInt(amount);
  }
  
  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "❌ Invalid amount!" });
    return;
  }
  
  const result = economy.withdraw(senderJid, amount);
  await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
  return;
}

        // ============================================
        // GAMBLING COMMANDS - ALL FIXED
        // ============================================

// flip <amount> <heads/tails> - Alias for cf
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} flip `)) {
  lowerTxt = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} flip `, `${botConfig.getPrefix().toLowerCase()} cf `);
}

// roll <amount> - Alias for dice
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} roll `)) {
  lowerTxt = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} roll `, `${botConfig.getPrefix().toLowerCase()} dice `);
}

// cf <amount> <heads/tails> - Coinflip
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} cf` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} cf `)) {
          const args = txt.split(` `);
          const amount = parseInt(args[2]);
          const choice = args[3];
          
          if (!amount || !choice) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} cf <amount> <heads/tails>\`

Examples:
  \`${botConfig.getPrefix().toLowerCase()} cf 100 heads
  \`${botConfig.getPrefix().toLowerCase()} cf 500 h
  \`${botConfig.getPrefix().toLowerCase()} cf 200 tails\``,
              mentions: [senderJid]
            });
            return;
          }
          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
                    const result = gambling.coinflip(senderJid, amount, choice, economy);
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                      mentions: [senderJid]
                    });
                    await awardProgression(senderJid, chatId);
                    return;
                  }
        // dice <amount> - Dice roll
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} dice` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} dice `)) {
          const args = txt.split(` `);
          const amount = parseInt(args[2]);

          if (!amount) {
            await sock.sendMessage(chatId, {
              text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} dice <amount>\n\nExample: ${botConfig.getPrefix()} dice 200`,
              mentions: [senderJid]
            });
            return;
          }
          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
                    const result = gambling.diceRoll(senderJid, amount, economy);
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + result.message,
                      contextInfo: { mentionedJid: [senderJid] }
                    });
                    await awardProgression(senderJid, chatId);
                    return;
                  }
                // slots <amount> - Slot machine
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} slots` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} slots `) || 
                    lowerTxt === `${botConfig.getPrefix().toLowerCase()} slot` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} slot `)) {
                  const args = txt.split(` `);
                  const amount = parseInt(args[2]);
        
                  if (!amount) {
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} slots <amount>\n\nExample: ${botConfig.getPrefix()} slots 300`,
                      mentions: [senderJid]
                    });
                    return;
                  }
        
                  if (isNaN(amount)) {
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + "❌ Invalid amount!",
                      mentions: [senderJid]
                    });
                    return;
                  }
        
                  const result = gambling.slots(senderJid, amount, economy);
                  await sock.sendMessage(chatId, {
                    text: BOT_MARKER + result.message,
                    mentions: [senderJid]
                  });
                  await awardProgression(senderJid, chatId);
                  return;
                }
        
                // hl <amount> <higher/lower> - Higher/Lower
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} hl` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} hl `)) {
          const args = txt.split(` `);
          const amount = parseInt(args[2]);
          const guess = args[3];
          
          if (!amount || !guess) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} hl <amount> <higher/lower>\`

Examples:
  \`${botConfig.getPrefix().toLowerCase()} hl 100 higher\`
  \`${botConfig.getPrefix().toLowerCase()} hl 200 h\`
  \`${botConfig.getPrefix().toLowerCase()} hl 150 lower\`
  \`${botConfig.getPrefix().toLowerCase()} hl 300 l\`  `,
              mentions: [senderJid]
            });
            return;
          }
          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
          // Check if higherLower exists in gambling module
          if (typeof gambling.higherLower === `function`) {
            const result = gambling.higherLower(senderJid, amount, guess, economy);
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + result.message,
              mentions: [senderJid]
            });
            await awardProgression(senderJid, chatId);
          } else {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Higher/Lower game not available yet!",
              mentions: [senderJid]
            });
          }
          return;
        }

                // bj <amount> - Start blackjack
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} bj` || (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} bj `) && !lowerTxt.includes(`hit`) && !lowerTxt.includes('stand') && !lowerTxt.includes('double'))) {
                  const args = txt.split(' ');
                  const amount = parseInt(args[2]);
        
                  if (!amount) {
                    await sock.sendMessage(chatId, {
                      text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} bj <amount>\n\nExample: ${botConfig.getPrefix()} bj 500\n\nCommands during game:\n  ${botConfig.getPrefix()} bj hit - Get another card\n  ${botConfig.getPrefix()} bj stand - Keep current hand\n  ${botConfig.getPrefix()} bj double - Double bet & hit once`,
                      mentions: [senderJid]
                    });
                    return;
                  }          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
          const result = gambling.startBlackjack(senderJid, amount, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message,
            mentions: [senderJid]
          });
          await awardProgression(senderJid, chatId);
          return;
        }

                // bj hit - Blackjack hit
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} bj hit`) {
                  const result = gambling.blackjackHit(senderJid, economy);
                  await sock.sendMessage(chatId, {
                    text: BOT_MARKER + result.message,
                    mentions: [senderJid]
                  });
                  await awardProgression(senderJid, chatId);
                  return;
                }
        
                // bj stand - Blackjack stand
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} bj stand`) {
                  const result = gambling.blackjackStand(senderJid, economy);
                  await sock.sendMessage(chatId, {
                    text: BOT_MARKER + result.message,
                    mentions: [senderJid]
                  });
                  await awardProgression(senderJid, chatId);
                  return;
                }
        
                // bj double - Blackjack double
                if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} bj double`) {
                  const result = gambling.blackjackDouble(senderJid, economy);
                  await sock.sendMessage(chatId, {
                    text: BOT_MARKER + result.message,
                    mentions: [senderJid]
                  });
                  await awardProgression(senderJid, chatId);
                  return;
                }
        // roulette <amount> <bet> - Roulette
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} roulette` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} roulette `) || 
            lowerTxt === `${botConfig.getPrefix().toLowerCase()} roul` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} roul `)) {
          const args = txt.split(` `);
          const amount = parseInt(args[2]);
          const bet = args[3];
          
          if (!amount || !bet) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} roulette <amount> <bet>\n\nBets:\n  red/black - 2x payout\n  even/odd - 2x payout\n  green/0 - 35x payout\n  0-36 - 35x payout\n\nExamples:\n  ${botConfig.getPrefix()} roulette 100 red\n  ${botConfig.getPrefix()} roulette 50 even\n  ${botConfig.getPrefix()} roulette 20 7`,
              mentions: [senderJid]
            });
            return;
          }
          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
          const result = gambling.roulette(senderJid, amount, bet, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message,
            mentions: [senderJid]
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` crash <amount> - Start crash game
        if ((lowerTxt === `${botConfig.getPrefix().toLowerCase()} crash` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} crash `)) && !lowerTxt.includes(`out`)) {
          const args = txt.split(' ');
          const amount = parseInt(args[2]);
          
          if (!amount) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()} crash <amount>\`

Cash out before it crashes!

Example: \`${botConfig.getPrefix().toLowerCase()} crash 300\``,
              mentions: [senderJid]
            });
            return;
          }
          
          if (isNaN(amount)) {
            await sock.sendMessage(chatId, { 
              text: BOT_MARKER + "❌ Invalid amount!",
              mentions: [senderJid]
            });
            return;
          }
          
          const result = gambling.startCrash(senderJid, amount, economy, sock, chatId);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message,
            mentions: [senderJid]
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` crash out - Cash out from crash
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} crash out` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} co`) {
          const result = gambling.crashCashOut(senderJid, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message,
            mentions: [senderJid]
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // `${botConfig.getPrefix().toLowerCase()}` horse <amt> <horse 1-5>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} horse` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} horse `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const horseNum = args[3];
          
          if (isNaN(amount) || !horseNum) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: \`${botConfig.getPrefix().toLowerCase()}\` horse <amount> <1-5>` });
          }
          
          const result = gambling.horseRace(senderJid, amount, horseNum, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message, 
            contextInfo: { mentionedJid: [senderJid] } 
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // lotto <amt>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} lotto` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} lotto `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          
          if (isNaN(amount)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} lotto <amount>` });
          }
          
          const result = gambling.lottery(senderJid, amount, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message, 
            contextInfo: { mentionedJid: [senderJid] } 
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // rps <amt> <r/p/s>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} rps` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} rps `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const choice = args[3];
          
          if (isNaN(amount) || !choice) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} rps <amount> <rock/paper/scissors>` });
          }
          
          const result = gambling.rps(senderJid, amount, choice, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message, 
            contextInfo: { mentionedJid: [senderJid] } 
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // penalty <amt> <l/c/r>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} penalty` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} penalty `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const direction = args[3];
          
          if (isNaN(amount) || !direction) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} penalty <amount> <left/center/right>` });
          }
          
          const result = gambling.penalty(senderJid, amount, direction, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message, 
            contextInfo: { mentionedJid: [senderJid] } 
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // guess <amt> <1-10>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} guess` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guess `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const guess = args[3];
          
          if (isNaN(amount) || !guess) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} guess <amount> <1-10>` });
          }
          
          const result = gambling.guessNumber(senderJid, amount, guess, economy);
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + result.message, 
            contextInfo: { mentionedJid: [senderJid] } 
          });
          await awardProgression(senderJid, chatId);
          return;
        }

        // --- NEW GAMBLING GAMES ---

        // mines <amt> <mines>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} mines` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} mines `)) {
          const args = lowerTxt.split(` `);
          
          if (args[2] === 'pick') {
            const cell = args[3];
            if (!cell) return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} mines pick <1-25>` });
            const result = gambling.minesPick(senderJid, cell, economy);
            await awardProgression(senderJid, chatId);
            return await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          }
          
          if (args[2] === 'out' || args[2] === 'cashout') {
            const result = gambling.minesCashOut(senderJid, economy);
            await awardProgression(senderJid, chatId);
            return await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          }

          const amount = parseInt(args[2]);
          const mineCount = parseInt(args[3]) || 3;
          
          if (isNaN(amount)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} mines <amount> <mine_count>\nExample: ${botConfig.getPrefix()} mines 500 5` });
          }
          
          const result = gambling.startMines(senderJid, amount, mineCount, economy);
          await awardProgression(senderJid, chatId);
          await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          return;
        }

        // plinko <amt> <low/mid/high>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} plinko` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} plinko `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const risk = args[3] || 'mid';
          
          if (isNaN(amount)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} plinko <amount> <low/mid/high>` });
          }
          
          const result = gambling.plinko(senderJid, amount, risk, economy);
          await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          await awardProgression(senderJid, chatId);
          return;
        }

        // scratch <amt>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} scratch` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} scratch `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          
          if (isNaN(amount)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} scratch <amount>` });
          }
          
          const result = gambling.scratchCard(senderJid, amount, economy);
          await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          await awardProgression(senderJid, chatId);
          return;
        }

        // cups <amt> <1-3>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} cups` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} cups `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          const choice = args[3];
          
          if (isNaN(amount) || !choice) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} cups <amount> <1-3>` });
          }
          
          const result = gambling.cupGame(senderJid, amount, choice, economy);
          await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          await awardProgression(senderJid, chatId);
          return;
        }

        // wheel <amt>
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wheel` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} wheel `)) {
          const args = lowerTxt.split(` `);
          const amount = parseInt(args[2]);
          
          if (isNaN(amount)) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Usage: ${botConfig.getPrefix()} wheel <amount>` });
          }
          
          const result = gambling.wheelOfFortune(senderJid, amount, economy);
          await sock.sendMessage(chatId, { text: BOT_MARKER + result.message });
          await awardProgression(senderJid, chatId);
          return;
        }



// `${botConfig.getPrefix().toLowerCase()}` gamblers / `${botConfig.getPrefix().toLowerCase()}` leaderboard gamble - Gambling leaderboard
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} gamblers` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} leaderboard gamble` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} lb gamble`) {
  const leaderboard = economy.getGamblingLeaderboard(10);
  
  if (leaderboard.length === 0) {
    await sock.sendMessage(chatId, { text: BOT_MARKER + "📊 No gambling data yet!" });
    return;
  }
  
  let lbText = `╔══════════════╗
║  🎰 TOP GAMBLERS 🎰
╚══════════════╝

`;
  
  leaderboard.forEach((user, i) => {
    const medal = i === 0 ? `🥇` : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const phoneNumber = user.userId.split('@')[0];
    const userData = economy.getUser(user.userId);
    const displayName = userData?.nickname || phoneNumber;
    
    // Improved win rate calculation with safety checks
    const wins = user.stats.gamesWon || 0;
    const losses = user.stats.gamesLost || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    
    lbText += `${medal} ${displayName}\n`;
    lbText += `   🏆 Wins: ${wins}\n`;
    lbText += `   📊 Win Rate: ${winRate}%\n\n`;
  });
  
  const mentions = leaderboard.map(u => u.userId);
  await sock.sendMessage(chatId, { text: BOT_MARKER + lbText, mentions });
  return;
}


// ============================================
// PROFILE PICTURE MANAGEMENT
// ============================================

const pfpDir = botConfig.getDataPath('pfp');

// Ensure PFP directory exists
if (!fs.existsSync(pfpDir)) {
  fs.mkdirSync(pfpDir, { recursive: true });
  console.log('✅ Created profile picture directory');
}

async function fetchAndSaveProfilePicture(sock, jid) {
  try {
    const normalizedJid = jid.split('@')[0].split(':')[0];
    const pfpPath = path.join(pfpDir, `${normalizedJid}.jpg`);
    
    // Return cached path if exists
    if (fs.existsSync(pfpPath)) {
      console.log(`✅ Using cached PFP for ${normalizedJid}`);
      return pfpPath;
    }
    
    console.log(`📸 Fetching PFP for ${normalizedJid}...`);
    
    try {
      const pfpUrl = await sock.profilePictureUrl(jid, 'image');
      
      if (pfpUrl) {
        const response = await axios.get(pfpUrl, { 
          responseType: 'arraybuffer',
          timeout: 10000 
        });
        
        fs.writeFileSync(pfpPath, Buffer.from(response.data));
        console.log(`✅ Cached PFP for ${normalizedJid}`);
        return pfpPath;
      }
    } catch (pfpErr) {
      console.log(`⚠️ PFP not available for ${normalizedJid}: ${pfpErr.message}`);
    }
    
    return null;
    
  } catch (err) {
    console.error(`❌ Error fetching PFP: ${err.message}`);
    return null;
  }
}

// ============================================
// FIXED `${botConfig.getPrefix().toLowerCase()}` profile COMMAND
// ============================================


if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} profile` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} me` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} whois`) {
  try {
    // Determine whose profile to show
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const targetJid = quoted || mentioned || senderJid;
    const targetName = targetJid.split(`@`)[0];
    
    // Load the profile
    let profile = getUserProfile(targetJid);
    
    // If no profile exists, create one
    if (!profile) {
      if (targetJid === senderJid) {
        profile = initializeUserProfile(targetJid);
        const user = economy.getUser(targetJid);
        if (user) {
            user.profile = profile;
            economy.saveUser(targetJid);
        }
      } else {
        return await sock.sendMessage(chatId, { 
          text: BOT_MARKER + `I don't have any data on @${targetName} yet.`,
          contextInfo: { mentionedJid: [targetJid] }
        });
      }
    }

    // ✅ Fetch and save profile picture
    const pfpPath = await fetchAndSaveProfilePicture(sock, targetJid);
    
    // If we got a PFP and it's not already saved in profile, update it
    if (pfpPath && profile.profilePicture !== pfpPath) {
      profile.profilePicture = pfpPath;
      economy.saveUser(targetJid);
    }

    // ✅ Get economy data from module (MongoDB)
    const userEconomy = economy.getUser(targetJid);
    let economyProfile = { 
      wallet: 0, 
      bank: 0, 
      total: 0,
      frozenAssets: { wallet: 0, bank: 0, reason: "" },
      stats: { 
        totalEarned: 0,
        totalSpent: 0,
        totalGambled: 0,
        gamesWon: 0, 
        gamesLost: 0, 
        biggestWin: 0,
        biggestLoss: 0
      } 
    };
    
    if (userEconomy) {
      economyProfile = {
        wallet: userEconomy.wallet || 0,
        bank: userEconomy.bank || 0,
        frozenAssets: userEconomy.frozenAssets || { wallet: 0, bank: 0, reason: "" },
        total: (userEconomy.wallet || 0) + (userEconomy.bank || 0),
        stats: userEconomy.stats || economyProfile.stats
      };
    }
    
    // Get guild info safely
    let guildName = null;
    if (isGroupChat) {
      try {
        guildName = guilds.getUserGuild(targetJid) || null;
      } catch (guildErr) {
        console.log("⚠️ Guild data unavailable:", guildErr.message);
      }
    }
    
    // ✅ Get Wordle stats from module
    const normalizedTargetJid = targetJid.split('@')[0].split(':')[0];
    const wordleScores = wordle.getAllScores();
    const wordleStats = wordleScores[normalizedTargetJid] || null;
    
    // ✅ Get TicTacToe stats from module
    const tttScores = tictactoe.getAllScores();
    const tttStats = tttScores[normalizedTargetJid] || null;
    
    // ✅ Build the profile response
    const dynamicTitle = getDynamicTitle(targetJid);
    let response = BOT_MARKER + `┏━━━━━━━━━━━━┓
┃ 📋 *PROFILE* 📋
┗━━━━━━━━━━━━━┛

${dynamicTitle ? `✨ *${dynamicTitle}*\n` : ''}👤 *@${targetName}*
${profile.nickname ? `🏷️ Nickname: ${profile.nickname}` : ''}
${profile.whatsappName ? `📱 WhatsApp: ${profile.whatsappName}` : ''}
${guildName ? `🏰 Guild: *${guildName}*` : ''}

━━━━━━━━━━━━━━━━━━
💰 *ECONOMY*
━━━━━━━━━━━━━━━━━━
💎 Total Wealth: ${economy.getZENI()}${economyProfile.total.toLocaleString()}
👛 Wallet: ${economy.getZENI()}${economyProfile.wallet.toLocaleString()}
🏦 Bank: ${economy.getZENI()}${economyProfile.bank.toLocaleString()}
❄️ Frozen: ${economy.getZENI()}${(economyProfile.frozenAssets?.wallet + economyProfile.frozenAssets?.bank).toLocaleString()}${economyProfile.frozenAssets?.reason ? ` (${economyProfile.frozenAssets.reason})` : ''}

━━━━━━━━━━━━━━━━━━
🎮 *GAME STATS*
━━━━━━━━━━━━━━━━━━`;

    // Wordle stats
    if (wordleStats && (wordleStats.wins + wordleStats.losses) > 0) {
      const gamesPlayed = wordleStats.wins + wordleStats.losses;
      const winRate = Math.round((wordleStats.wins / gamesPlayed) * 100);
      const avgGuesses = wordleStats.wins > 0 ? (wordleStats.totalGuesses / wordleStats.wins).toFixed(1) : 'N/A';
      response += `
📝 Wordle:
   🏆 Wins: ${wordleStats.wins}
   📊 Win Rate: ${winRate}%
   🎯 Avg Guesses: ${avgGuesses}
   🔥 Streak: ${wordleStats.currentStreak}`;
    } else {
      response += `
📝 Wordle: No games played`;
    }
    
    // Tic-tac-toe stats
    if (tttStats && (tttStats.wins + tttStats.losses + (tttStats.draws || 0)) > 0) {
      const totalGames = tttStats.wins + tttStats.losses + (tttStats.draws || 0);
      const winRate = Math.round((tttStats.wins / totalGames) * 100);
      response += `
⭕ Tic-Tac-Toe:
   🏆 Wins: ${tttStats.wins}
   📊 Win Rate: ${winRate}%`;
    } else {
      response += `
⭕ Tic-Tac-Toe: No games played`;
    }
    
    // Gambling stats
    const gWins = economyProfile.stats?.gamesWon || 0;
    const gLosses = economyProfile.stats?.gamesLost || 0;
    if (gWins > 0 || gLosses > 0) {
      const totalGambles = gWins + gLosses;
      const winRate = Math.round((gWins / totalGambles) * 100);
      const biggestWin = economyProfile.stats?.biggestWin || 0;
      response += `
🎰 Gambling:
   🏆 Wins: ${gWins}
   📊 Win Rate: ${winRate}%
   💸 Biggest Win: ${economy.getZENI()}${biggestWin.toLocaleString()}`;
    } else {
      response += `
🎰 Gambling: No games played`;
    }
    
    // Show tips if it's the user's own profile
    if (targetJid === senderJid) {
      response += `

━━━━━━━━━━━━━━━━━━
💡 *Customize your profile:*
  ${botConfig.getPrefix().toLowerCase()} register <name>
  ${botConfig.getPrefix().toLowerCase()} nickname <name>`;
    }

    // ✅ Send with profile picture if available
    if (pfpPath && fs.existsSync(pfpPath)) {
      await sock.sendMessage(chatId, { 
        image: { url: pfpPath },
        caption: response,
        contextInfo: { mentionedJid: [targetJid] }
      });
    } else {
      // Fallback to text-only if no image
      await sock.sendMessage(chatId, { 
        text: response,
        contextInfo: { mentionedJid: [targetJid] }
      });
    }

  } catch (err) {
    console.error("Profile Error:", err);
    
    // Better error handling
    if (err.message?.includes(`toLocaleString`) || err.message?.includes('economy')) {
          await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `❌ You need to register first!\n\nType: \`\`${botConfig.getPrefix().toLowerCase()}\` register <nickname>\`` 
          });    } else {
      await sock.sendMessage(chatId, { 
        text: BOT_MARKER + "❌ Error loading profile. Try again later."
      });
    }
  }
  return;
}

        
        // delete user`s profile
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} forget me`) {
          const user = economy.getUser(senderJid);
          if (user) {
              user.profile = initializeUserProfile(senderJid);
              economy.saveUser(senderJid);
          }
          conversationMemory.delete(senderJid);
          temporaryContext.delete(senderJid);
          await sock.sendMessage(chatId, { text: BOT_MARKER + "…alright. starting fresh." });
          return;
        }

        // ${botConfig.getPrefix().toLowerCase()} refresh - Force refresh group metadata
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} refresh`) {
          if (!isGroupChat) return;
          await sock.sendMessage(chatId, { react: { text: "♻️", key: m.key } });
          const metadata = await getGroupMetadata(chatId, true);
          if (metadata) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ Group metadata refreshed!\n📊 Members: ${metadata.participants.length}` });
          } else {
            await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Failed to refresh metadata. Make sure I am in this group!` });
          }
          return;
        }



        // GROUP CHAT SETTINGS
        // summary [timeframe] - Summarize recent group chat
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} summary`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} recap`)) {
    if (!isGroupChat) {
        return await sock.sendMessage(chatId, { 
            text: BOT_MARKER + `This command is for groups only.` 
        });
    }

    // Parse timeframe
    const args = lowerTxt.split(' ').slice(2);
    let messageLimit = 50; // default
    let timeframeText = "recent messages";
    
    if (args.length > 0) {
        const num = parseInt(args[0]);
        if (!isNaN(num) && num > 0) {
            messageLimit = Math.min(num, 200); // Cap at 200
            timeframeText = `last ${messageLimit} messages`;
        }
    }

    await sock.sendMessage(chatId, { 
        text: BOT_MARKER + `📊 Analyzing ${timeframeText}...` 
    });

    try {
        // Get recent messages from the group
        const messages = await getGroupMessageHistory(chatId, messageLimit);
        
        if (messages.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: BOT_MARKER + "❌ No messages found to summarize." 
            });
        }

        console.log(`📝 Summarizing ${messages.length} messages...`);

        // Create summary with AI
        const summary = await createGroupSummary(messages);
        
                // Send summary
        
                await sock.sendMessage(chatId, {
        
                    text: BOT_MARKER + summary.text,
        
                    contextInfo: { mentionedJid: summary.mentions }
        
                });
        
                await awardProgression(senderJid, chatId);
        
            } catch (err) {
        console.error("Summary Error:", err.message);
        await sock.sendMessage(chatId, { 
            text: BOT_MARKER + "❌ Failed to create summary." 
        });
    }
    return;
}

        // ============================================
        // BOT CONTROL COMMANDS
        // ============================================

        // .on - enable bot in group
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} on` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} on `)) {
          if (!canUseAdminCommands) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + "Admins only." });
          }
          enabledChats.add(chatId);
          saveEnabledChats();
          const replyText = BOT_MARKER + `🤖 ${botConfig.getBotName()} AI is now *enabled* in this chat!`;
          await sock.sendMessage(chatId, { text: replyText });
          return;
        }

        // .off - disable bot in group
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} off` || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} off `)) {
          if (!canUseAdminCommands) {
            return await sock.sendMessage(chatId, { text: BOT_MARKER + "Admins only." });
          }
          enabledChats.delete(chatId);
          saveEnabledChats();
          await sock.sendMessage(chatId, { text: BOT_MARKER + `🤖 ${botConfig.getBotName()} AI is now *disabled* in this chat!` });
          return;
        }
        
        if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} reset sprite` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} sprite reset`) {
            if (!economy.isRegistered(senderJid)) {
                await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ You need to register first!` });
                return;
            }
            const user = economy.getUser(senderJid);
            user.spriteIndex = Math.floor(Math.random() * 100);
            economy.saveUser(senderJid);
            await sock.sendMessage(chatId, { text: BOT_MARKER + `✅ *SPRITE RESET!* Your assigned sprite has been rerolled. It will appear in your next adventure!` });
            return;
        }
        
        // reset conversation memory
        if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} reset`)) {          conversationMemory.delete(senderJid);
          temporaryContext.delete(senderJid);
          await sock.sendMessage(chatId, { text: BOT_MARKER + `🗑️ Chat memory cleared.` });
          return;
        }

// ============================================
// DEBATE TRACKER COMMANDS
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` debate on <topic> @user1 @user2
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} debate on `)) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Only admins can start debates!` 
    });
    return;
  }

  // Extract topic: everything between "debate on" and the first mention or end of string
  const topicPart = txt.substring(`${botConfig.getPrefix().toLowerCase()} debate on `.length).trim();
  let topic = topicPart.split('@')[0].trim();
  
  const target = getMentionOrReply(m);
  let mentionedJids = [...(m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])];
  
  // Support reply if not already in mentionedJids
  if (target && !mentionedJids.includes(target)) {
    mentionedJids.push(target);
  }

  let debater1, debater2;

  if (mentionedJids.length === 1) {
    // Admin vs Tagged Person
    debater1 = senderJid;
    debater2 = mentionedJids[0];
  } else if (mentionedJids.length >= 2) {
    // Tagged Person 1 vs Tagged Person 2
    debater1 = mentionedJids[0];
    debater2 = mentionedJids[1];
  } else {
    // Not enough participants
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + `━━━━━━━━━━━━━━━━━
⚖️ *DEBATE USAGE* ⚖️
━━━━━━━━━━━━━━━━━

❌ *Error:* You must specify who is debating!

💡 *Option 1 (Admin vs User):*
\`${botConfig.getPrefix().toLowerCase()} debate on <topic> @user\`
_(Or reply to their message)_

💡 *Option 2 (User vs User):*
\`${botConfig.getPrefix().toLowerCase()} debate on <topic> @user1 @user2\`

📌 *Example:*
\`${botConfig.getPrefix().toLowerCase()} debate on Messi is better than Ronaldo @user1 @user2\`

━━━━━━━━━━━━━━━━━`
    });
    return;
  }

  // Ensure topic isn't empty
  if (!topic) topic = "General Argument";

  const result = await debate.startDebate(
    sock, chatId, topic, 
    debater1, debater2, 
    groupMetadata, BOT_MARKER,
    smartGroqCall, MODELS
  );

  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` debate off (cancel debate)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} debate off`) {
  if (!canUseAdminCommands) {
    await sock.sendMessage(chatId, { 
      text: BOT_MARKER + `❌ Only admins can cancel debates!` 
    });
    return;
  }

  const result = await debate.cancelDebate(sock, chatId, BOT_MARKER);
  await sock.sendMessage(chatId, { text: result.message });
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` judge (end debate and get AI verdict)
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} judge`) {
  const result = await debate.judgeDebate(
    sock, chatId, BOT_MARKER, 
    smartGroqCall, MODELS
  );

  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// ============================================
// LUDO GAME COMMANDS
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` ludo start @user1 @user2 @user3
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo start`)) {
  let mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  
  // Support reply if no mentions
  if (mentionedJids.length === 0) {
    const target = getMentionOrReply(m);
    if (target) mentionedJids = [target];
  }
  
  // Ludo needs 2-4 players
  const totalPlayers = mentionedJids.length + 1; // +1 for sender
  
  if (totalPlayers < 2 || totalPlayers > 4) {
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + `❌ Ludo needs 2-4 players total!\nTag 1-3 other players.`
    });
    return;
  }

  const result = await ludo.startGame(
    sock, chatId, senderJid, mentionedJids, BOT_MARKER, m
  );

  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` ludo roll - Roll dice
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} ludo roll` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} ludo r`) {
  const result = await ludo.rollDice(sock, chatId, senderJid, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` ludo move <piece> - Move a piece
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo move `) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ludo m `) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} piece `)) {
  const pieceNum = lowerTxt.includes('move') 
    ? parseInt(lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ludo move `.length))
    : parseInt(lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ludo m `.length));

  if (isNaN(pieceNum) || pieceNum < 1 || pieceNum > 4) {
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + `❌ Piece must be 1-4!`
    });
    return;
  }

  const result = await ludo.movePiece(sock, chatId, senderJid, pieceNum, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` ludo board - Show current board
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} ludo board` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} ludo b`) {
  const result = await ludo.showBoard(sock, chatId, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` ludo end - End game
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} ludo end`) {
  const result = await ludo.endGame(sock, chatId, senderJid, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}
// ============================================
// Handle `${botConfig.getPrefix().toLowerCase()}` ttt (3x3), `${botConfig.getPrefix().toLowerCase()}` tttt (4x4), `${botConfig.getPrefix().toLowerCase()}` ttttt (5x5)
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttttt`)) {
    const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ttttt`.length).trim().split(' ');
    const command = args[0]?.toLowerCase();

    if (command === 'end' || command === 'stop') {
        await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
        return;
    }

    const target = getMentionOrReply(m);
    if (!target && !command) {
        const usage = GET_BANNER(`🎮 TTT 16x16`) + `\n\n*Usage:* \`${botConfig.getPrefix()} ttttt @user\`\n\n*Other:* \`${botConfig.getPrefix()} ttttt end\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    const mentionedJids = target ? [target] : [];
    await tictactoe.handleStartGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m, 16);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} tttt`)) {
    const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} tttt`.length).trim().split(' ');
    const command = args[0]?.toLowerCase();

    if (command === 'end' || command === 'stop') {
        await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
        return;
    }

    const target = getMentionOrReply(m);
    if (!target && !command) {
        const usage = GET_BANNER(`🎮 TTT 8x8`) + `\n\n*Usage:* \`${botConfig.getPrefix()} tttt @user\`\n\n*Other:* \`${botConfig.getPrefix()} tttt end\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    const mentionedJids = target ? [target] : [];
    await tictactoe.handleStartGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m, 8);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttt`)) {
    // 3x3 CLASSIC TIC-TAC-TOE
    const args = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} ttt`.length).trim().split(' ');
    const command = args[0]?.toLowerCase();

    if (command === 'end' || command === 'stop') {
        await tictactoe.handleEndGame(sock, chatId, senderJid, BOT_MARKER, m);
        return;
    }

    if (command === 'top' || command === 'score' || command === 'scores') {
        await tictactoe.handleScores(sock, chatId, BOT_MARKER, m);
        return;
    }

    if (command === 'board' || command === 'show') {
        await tictactoe.handleShowBoard(sock, chatId, BOT_MARKER, m);
        return;
    }

    const target = getMentionOrReply(m);
    if (!target && !command) {
        const usage = GET_BANNER(`🎮 TTT 3x3`) + `\n\n*Usage:* \`${botConfig.getPrefix()} ttt @user\`\n\n*Other:* \`${botConfig.getPrefix()} ttt scores\`, \`${botConfig.getPrefix()} ttt end\``;
        await sock.sendMessage(chatId, { text: usage }, { quoted: m });
        return;
    }

    const mentionedJids = target ? [target] : [];
    
    await tictactoe.handleStartGame(sock, chatId, senderJid, mentionedJids, BOT_MARKER, m, 3);
    return;
}

if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} move `)) {
    const move = lowerTxt.replace(`${botConfig.getPrefix().toLowerCase()} move `, '').trim();
    return await tictactoe.handleMove(sock, chatId, senderJid, move, BOT_MARKER, m, senderName);
}
// ============================================

// `${botConfig.getPrefix().toLowerCase()}` wordle top 
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle top` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle leaderboard`) {
  const result = await wordle.showLeaderboard(sock, chatId, BOT_MARKER, m);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` wordle stats - Show player stats
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle stats` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle s`) {
  const result = await wordle.showStats(sock, chatId, senderJid, BOT_MARKER, m);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` wordle board - Show current game board
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle show board` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle b`) {
  const result = await wordle.showBoard(sock, chatId, senderJid, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` wordle end - End current game
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle end` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle stop`) {
  const result = await wordle.endGame(sock, chatId, senderJid, BOT_MARKER, m, canUseAdminCommands);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` wordle [difficulty] - Start a new Wordle game
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle start` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle` ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle easy` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle e` ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle medium` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle m` ||
    lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle hard` || lowerTxt === `${botConfig.getPrefix().toLowerCase()} wordle h`) {
  
  // Determine difficulty from command
  let difficulty = 'medium'; // default
  if (lowerTxt.includes('easy') || lowerTxt.endsWith(' e')) {
    difficulty = 'easy';
  } else if (lowerTxt.includes('hard') || lowerTxt.endsWith(' h')) {
    difficulty = 'hard';
  } else if (lowerTxt.includes('medium') || lowerTxt.endsWith(' m')) {
    difficulty = 'medium';
  }
  
  const result = await wordle.startGame(sock, chatId, senderJid, BOT_MARKER, m, senderName, difficulty);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` wordle <word> - Make a guess (MUST BE LAST)
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} wordle `) && lowerTxt.length > `${botConfig.getPrefix().toLowerCase()} wordle `.length) {
  const guess = lowerTxt.substring(`${botConfig.getPrefix().toLowerCase()} wordle `.length).trim();
  
  // Check if it's a command, not a guess
  if (['start', 'end', 'show board', 'stats', 'top', 'leaderboard', 'stop', 'b', 's', 'e', 'm', 'h', 'easy', 'medium', 'hard'].includes(guess.toLowerCase())) {
    return; // Let other handlers catch it
  }
  
  const result = await wordle.makeGuess(sock, chatId, senderJid, guess, BOT_MARKER, m);
  if (!result.success) {
    await sock.sendMessage(chatId, { text: result.message });
  }
  return;
}

// ============================================
// PROGRESSION COMMANDS
// ============================================

// level [user] - Show level and XP
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} level`)) {
  const args = txt.split(' ').slice(2);
  await progressionCommands.handleLevelCommand(sock, chatId, senderJid, args, m);
  return;
}

// xptop - XP leaderboard
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} xptop`)) {
  await progressionCommands.handleXPTopCommand(sock, chatId, m);
  return;
}

// gptop - GP leaderboard  
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} gptop`)) {
  await progressionCommands.handleGPTopCommand(sock, chatId, m);
  return;
}

// achievements [user] - Show achievements
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} achievements`)) {
  const args = txt.split(' ').slice(2);
  await progressionCommands.handleAchievementsCommand(sock, chatId, senderJid, args, m);
  return;
}

// `${botConfig.getPrefix().toLowerCase()}` graveyard - Show fallen heroes
if (lowerTxt === `${botConfig.getPrefix().toLowerCase()} graveyard`) {
  await showGraveyard(sock, chatId, m);
  return;
}

// ============================================
// Don't forget to update the allCommands array for the unknown command handler:
// Add these to the allCommands array (around line 6023):
//
// ============================================

// ❓ unknown joker command — MUST be LAST
// We add checks here to ensure valid sub-commands like 'ttt' and 'move' don't trigger this
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()}`)) {
  

// Ignore valid sub-commands
if (lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttt`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} tttt`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} ttttt`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} move`)) {
    return;
}

  await sock.sendMessage(chatId, { react: { text: "❓", key: m.key } });

  const typed = lowerTxt.substring(botConfig.getPrefix().length).trim(); // What user typed after botConfig.getPrefix()
  if (!typed) return; 

  // Clean JIDs from display to look better
  const displayTyped = typed.replace(/@\d+(:?\d+)?(@[a-zA-Z0-9.-]+)?/g, '@user');
  
    // List of all valid commands for suggestions
    const allCommands = [
      'menu', 'help', 'on', 'off', 'reset', 'about', 'support', 'refresh', 'handbook', 'reset sprite',
      'accept', 'decline',
      's', 'toimg', 'tovid',
      'img', 'audio', 'anime search', 'search', 'nsfw', '18+',
      'reveal', 'unmask', 'steal',
      'debate on', 'debate off', 'judge',
      'kick', 'delete', 'block', 'unblock', 'blocklist',
      'antilink', 'antispam', 'welcome', 'welcomemessage',
      'warn', 'resetwarn', 'warnings', 'promote', 'demote',
      'mute', 'unmute', 'tagall', 'hidetag',
      'guild create', 'guild delete', 'guild join', 'guild leave', 'guild invite', 'guild accept', 'guild decline', 'guild list', 'guild members', 'guild tag', 'guild motto', 'guild promote', 'guild demote', 'guild kick', 'guild title', 'guild titles', 'guild ranks', 'guild leaderboard', 'guild points', 'guild pointsboard', 'guild upgrade', 'guild challenge', 'guild challenges',
      'news', 'anime news',
      'register', 'balance', 'bal', 'bh', 'history', 'daily', 'deposit', 'withdraw', 'transfer', 'send', 'rob', 'rich', 'money', 'economy', 'invest', 'claim', 'stocks', 'market',
      'cf', 'flip', 'dice', 'roll', 'slots', 'hl', 'bj', 'roulette', 'crash', 'mines', 'plinko', 'scratch', 'cups', 'wheel',
      'horse', 'lotto', 'rps', 'penalty', 'guess',
      'summary', 'recap', 'activity', 'active', 'inactive',
      'joke', 'truth', 'dare', 'roast', 'ship', 'fact', 'define', 'rate', '8ball', 'motivate', 'fish', 'hunt',
      'anime trending', 'anime airing', 'anime upcoming', 'anime top', 'anime random', 'anime studio', 'anime search', 'anime rank',
      'powerscale',
      'ttt', 'tttt', 'ttttt', 'move', 'ttt end', 'ttt scores', 'ttt board',
      'ludo start', 'ludo roll', 'ludo move', 'ludo board', 'ludo end',
      'profile', 'me', 'whois', 'nickname', 'note', 'likes', 'dislikes', 'hobby', 'personal', 'forget me',
      'level', 'xptop', 'gptop', 'achievements', 'rank', 'adventurer', 'graveyard',
      'wordle', 'wordle start', 'wordle board', 'wordle end', 'wordle stats', 'wordle top',
      'shop', 'buy', 'evolve', 'classes', 'character', 'char', 'stats', 'abilities', 'skills', 'skill tree', 'skill up', 'skill reset',
      'quest', 'solo', 'join', 'stop', 'vote', 'mine', 'recipes', 'craft', 'brew', 'dismantle', 'lore', 'monster guide', 'handbook', 'source',
      'equip', 'unequip', 'inventory', 'bag', 'upgrade inv',
      'duel', 'challenge', 'pvp',
      'combat', 'combat attack', 'combat ability', 'combat item', 'combat defend', 'combat status', 'combat help'
    ];  
  // Find similar commands (simple string matching)
  const suggestions = allCommands
    .filter(cmd => cmd.includes(typed.toLowerCase()) || typed.toLowerCase().includes(cmd.split(' ')[0]))
    .slice(0, 5);
  
  let message = GET_BANNER(`❌ ERROR`) + `\n\nUnknown command: *${botConfig.getPrefix().toLowerCase()} ${displayTyped}*\n\n`;
  
  if (suggestions.length > 0) {
    message += `💡 *Did you mean:*\n`;
    suggestions.forEach(s => {
      message += `➤ \`${botConfig.getPrefix().toLowerCase()} ${s}\`\n`;
    });
  } else {
    message += `Type \`${botConfig.getPrefix().toLowerCase()} menu\` to see all commands.`;
  }

  await sock.sendMessage(chatId, { text: message }, { quoted: m });

  await sock.sendMessage(chatId, { react: { text: "❌", key: m.key } });
  return;
}

        // ============================================
        // AI RESPONSE LOGIC - only if triggered
        // ============================================

        if (!text) return; // no text to process
        
        // IGNORE COMMANDS: If the message starts with a dot or `${botConfig.getPrefix().toLowerCase()}`, don`t let the AI handle it
        const isCommand = txt.startsWith(`${botConfig.getPrefix().toLowerCase()}`) || lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()}`);
        if (isCommand && txt.split(` `).length > 1) return; 

        // check if bot should respond (mentioned, replied to, or keyword)
        const waContextInfo = m.message.extendedTextMessage?.contextInfo || 
                           m.message.imageMessage?.contextInfo || 
                           m.message.videoMessage?.contextInfo || 
                           m.message.audioMessage?.contextInfo || 
                           m.message.stickerMessage?.contextInfo;
        
        // 1. Mention Check (Normalized for all devices)
        const mentionedJids = (waContextInfo?.mentionedJid || []).map(jid => jidNormalizedUser(jid));
        const isBotMentioned = mentionedJids.includes(botJid) || (botLid && mentionedJids.includes(botLid));
        
        // 2. Reply Check
        const quotedParticipant = waContextInfo?.participant || (waContextInfo?.quotedMessage ? chatId : null);
        const isReplyToBot = quotedParticipant ? (jidNormalizedUser(quotedParticipant) === botJid || (botLid && jidNormalizedUser(quotedParticipant) === botLid)) : false;
        
        // 3. Name Check (Ensure it's a whole word to avoid accidental triggers)
        const botName = botConfig.getBotName().toLowerCase();
        const nameRegex = new RegExp(`\\b${botName}\\b`, 'i');
        const isBotNameMention = nameRegex.test(lowerTxt);
        
        const hasTrigger = isBotMentioned || isReplyToBot || isBotNameMention;
        
        // --- Smart Activation Fuse ---
        // Private DMs: Always respond to triggers
        // Group Chats: Only respond if bot is turned "on" AND triggered
        const isDM = !chatId.endsWith('@g.us');
        const isBotEnabled = isDM || enabledChats.has(chatId);
        
        if (!isBotEnabled || !hasTrigger) return;

        const prompt = txt.replace(new RegExp(`${botConfig.getPrefix()}`, 'gi'), '').replace(nameRegex, '').trim();
        if (!prompt) return;

        try {
          // check if user wants to tag everyone
          if (isGroupChat) {
            const intent = await detectTagIntent(prompt);
            
            if (intent.shouldTag && intent.announcement) {
              // ask for confirmation first
              pendingTagRequests.set(senderJid, {
                chatId: chatId,
                announcement: intent.announcement,
                timestamp: Date.now()
              });
              
              await sock.sendMessage(chatId, {
                text: BOT_MARKER + `want me to tag everyone with that? (yes/no)`
              });
              
              return;
            }
          }
          
          // extract info from the message
          //await autoExtractInfo(prompt, senderJid);
          
          // get AI response
          const reply = await askAI(senderJid, prompt, mentionedJids, chatId);
          
          if (!reply || reply.trim().length === 0) {
            console.log("⚠️ AI returned empty response, skipping...");
            return;
          }

          const mood = await detectMood(prompt);
          const stickerPath = getRandomSticker(mood);
          const replyText = BOT_MARKER + `@${senderJid.split('@')[0]} ` + reply;

          // send text response
          await sock.sendMessage(chatId, {
            text: replyText,
            contextInfo: { mentionedJid: [senderJid] }
          });

          // send sticker
          await sock.sendMessage(chatId, {
            sticker: fs.readFileSync(stickerPath)
          });

        } catch (err) {
          console.error("❌ AI error:", err.message);
          const errText = BOT_MARKER + `@${senderJid.split('@')[0]} 🤖 AI didn't respond — try again!`;
          await sock.sendMessage(chatId, {
            text: errText,
            contextInfo: { mentionedJid: [senderJid] }
          });
        }
      } catch (err) {
  if (err.message?.includes('decrypt') || err.message?.includes('MAC')) {
    // Just skip these, WhatsApp usually resyncs them after a while
    return;
  }
  console.log("⚠️ Skipping message:", err.message);
  return;
}
    }); // END messages.upsert

    // Start background tasks AFTER handler is registered
    startNewsLoop(sock);
    
    // Stock Market Update Loop (Every 30 mins)
    setInterval(() => {
        stockMarket.updatePrices();
        console.log("📈 Stock prices updated.");
    }, 1800000);

  } catch (err) {
    console.error('❌ initSocket failed:', err.message);
    botStarting = false;
    
    if (!hasAuth(configInstance.getAuthPath())) {
      console.log('🛑 Auth missing. Fix before retrying.');
      return;
    }

        const delayMs = getBackoff();
    console.log(`🔁 Retrying in ${Math.round(delayMs/1000)}s...`);
    setTimeout(() => {
      if (!botStarting) {
        initSocket().catch(e => console.error('Retry failed:', e.message));
      }
    }, delayMs);
  }
}

// ============================================
// ENTRY POINT - now managed by index.js
// ============================================
  });
}

function getSock() {
  return sock;
}

module.exports = { startBot, getSock };
