#!/usr/bin/env node
/**
 * DIRECT CMDCOLL TEST — calls cardSystem.cmdColl directly with a test user.
 *
 * This bypasses WhatsApp entirely and tests the FULL cmdColl flow:
 *   1. MongoDB query (UserCard.find)
 *   2. Go service call (generateCardGrid)
 *   3. sendMessage (mocked — just logs instead of sending to WhatsApp)
 *
 * If this succeeds, the issue is in the WhatsApp/Baileys layer.
 * If this fails, we'll see exactly which step fails.
 *
 * Usage: node scripts/test_cmdcoll_direct.js
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(section, msg, color = RESET) {
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  console.log(`${color}[${ts}] [${section}]${RESET} ${color}${msg}${RESET}`);
}

function logResult(label, success, detail) {
  const icon = success ? '✅' : '❌';
  const color = success ? GREEN : RED;
  console.log(`  ${icon} ${color}${label}${RESET}: ${detail}`);
}

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  DIRECT CMDCOLL TEST — tests full .jk coll flow without WhatsApp`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  // ── 1. Connect to MongoDB ─────────────────────────────────────
  log('MONGO', 'Connecting to MongoDB...', CYAN);
  const mongoose = require('mongoose');
  try {
    await withTimeout(
      mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0', { serverSelectionTimeoutMS: 5000 }),
      15000, 'mongoose.connect'
    );
    logResult('MongoDB connect', true, `readyState=${mongoose.connection.readyState}`);
  } catch (e) {
    logResult('MongoDB connect', false, e.message);
    process.exit(1);
  }

  // ── 2. Set up botConfig context (AsyncLocalStorage) ───────────
  log('BOTCONFIG', 'Setting up botConfig context for Jake...', CYAN);
  const botConfig = require('../botConfig');
  const configInstance = new botConfig.BotConfig(path.join(__dirname, '..', 'instances', 'Jake'));

  // ── 3. Load economy + cardSystem ──────────────────────────────
  log('LOAD', 'Loading economy + cardSystem...', CYAN);
  let economy, cardSystem;
  try {
    economy = require('../core/rpg/economy');
    logResult('require economy', true, 'loaded');
  } catch (e) {
    logResult('require economy', false, e.message);
    process.exit(1);
  }
  try {
    cardSystem = require('../core/rpg/cardSystem');
    logResult('require cardSystem', true, 'loaded');
  } catch (e) {
    logResult('require cardSystem', false, e.message);
    process.exit(1);
  }

  // ── 4. Run inside botConfig.storage context ───────────────────
  await botConfig.storage.run(configInstance, async () => {
    log('CONTEXT', 'Inside botConfig.storage context', CYAN);
    console.log(`  botId: ${botConfig.getBotId()}`);
    console.log(`  prefix: ${botConfig.getPrefix()}`);

    // ── 5. Initialize economy ─────────────────────────────────
    log('ECON', 'Loading economy data from MongoDB...', CYAN);
    try {
      await withTimeout(economy.loadEconomy(), 30000, 'economy.loadEconomy');
      logResult('economy.loadEconomy', true, `${economy.economyData?.size || 0} users loaded`);
    } catch (e) {
      logResult('economy.loadEconomy', false, e.message);
    }

    // ── 6. Initialize cardSystem with MOCK sock ───────────────
    log('CARDSYS', 'Initializing cardSystem with mock sock...', CYAN);
    const mockSock = {
      sendMessage: async (chatId, content, options) => {
        const type = content.image ? 'IMAGE' : content.video ? 'VIDEO' : 'TEXT';
        const size = content.image ? `(${content.image.length || content.image.byteLength || '?'} bytes)` : '';
        console.log(`  📤 [mockSock.sendMessage] type=${type} ${size} chatId=${chatId?.split('@')[0]}`);
        if (content.image && Buffer.isBuffer(content.image)) {
          fs.writeFileSync('/tmp/test_cmdcoll_output.png', content.image);
          console.log(`  📤 Saved image to /tmp/test_cmdcoll_output.png`);
        }
        return { key: { id: 'mock-msg-id', remoteJid: chatId } };
      },
      user: { id: '251453323092189@s.whatsapp.net' },
      authState: { creds: { me: { lid: '251453323092189' } } },
    };

    try {
      await withTimeout(
        cardSystem.init(mockSock, [], [], '251453323092189@s.whatsapp.net'),
        30000, 'cardSystem.init'
      );
      logResult('cardSystem.init', true, 'initialized');
    } catch (e) {
      logResult('cardSystem.init', false, e.message);
    }

    // ── 7. Find a test user with cards ────────────────────────
    log('USER', 'Finding a test user with cards in MongoDB...', CYAN);
    const UserCard = require('../core/models/UserCard');
    let testUserId = null;
    let testUserCardCount = 0;
    try {
      // Find any user who has at least 1 card
      const sample = await withTimeout(
        UserCard.aggregate([{ $group: { _id: '$userId', count: { $sum: 1 } } }, { $match: { count: { $gte: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
        10000, 'UserCard.aggregate'
      );
      if (sample && sample.length > 0) {
        testUserId = sample[0]._id;
        testUserCardCount = sample[0].count;
        logResult('Found test user', true, `${testUserId} (${testUserCardCount} cards)`);
        console.log(`  Top 5 users by card count:`);
        sample.forEach((u, i) => console.log(`    ${i+1}. ${u._id} — ${u.count} cards`));
      } else {
        logResult('Found test user', false, 'no users with cards found');
      }
    } catch (e) {
      logResult('UserCard.aggregate', false, e.message);
    }

    if (!testUserId) {
      console.log(`\n${YELLOW}No test user found. Using the owner JID instead.${RESET}`);
      testUserId = '251453323092189@s.whatsapp.net';
    }

    // ── 8. Call cardSystem.handleCommand directly ─────────────
    log('TEST', `Calling cardSystem.handleCommand for .jk coll (user: ${testUserId})...`, CYAN);

    // Mock the reply function to capture output
    const mockReply = async (text, options = {}) => {
      console.log(`  📤 [mockReply] text length=${text?.length || 0}`);
      return { key: { id: 'mock-reply-id' } };
    };

    // Create a mock message object
    const mockMsg = {
      key: { remoteJid: 'test@s.whatsapp.net', participant: testUserId, fromMe: false },
      message: { conversation: '.jk coll' },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const startTime = Date.now();
      const result = await withTimeout(
        cardSystem.handleCommand({
          lowerTxt: '.jk coll',
          txt: '.jk coll',
          senderJid: testUserId,
          chatId: 'test@s.whatsapp.net',
          m: mockMsg,
          economy: economy,
          isOwner: true,
          senderIsAdmin: false,
          isMod: true,
        }),
        30000, 'cardSystem.handleCommand(.jk coll)'
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      logResult('cardSystem.handleCommand(.jk coll)', true, `returned ${result} in ${elapsed}s`);
    } catch (e) {
      logResult('cardSystem.handleCommand(.jk coll)', false, e.message);
    }

    // ── 9. Also test .jk deck ─────────────────────────────────
    log('TEST', `Calling cardSystem.handleCommand for .jk deck...`, CYAN);
    try {
      const startTime = Date.now();
      const result = await withTimeout(
        cardSystem.handleCommand({
          lowerTxt: '.jk deck',
          txt: '.jk deck',
          senderJid: testUserId,
          chatId: 'test@s.whatsapp.net',
          m: mockMsg,
          economy: economy,
          isOwner: true,
          senderIsAdmin: false,
          isMod: true,
        }),
        30000, 'cardSystem.handleCommand(.jk deck)'
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      logResult('cardSystem.handleCommand(.jk deck)', true, `returned ${result} in ${elapsed}s`);
    } catch (e) {
      logResult('cardSystem.handleCommand(.jk deck)', false, e.message);
    }
  });

  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  TEST COMPLETE${RESET}`);
  console.log(`  If handleCommand returned true, the code works — the issue is`);
  console.log(`  in the WhatsApp/Baileys message delivery layer.`);
  console.log(`  If it returned false or threw, that's the specific bug to fix.`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error(`${RED}FATAL:${RESET}`, err);
  console.error(err.stack);
  process.exit(1);
});
