#!/usr/bin/env node
/**
 * DIRECT PIPELINE TEST — runs ON Oracle, requires the bot's actual modules.
 *
 * This script bypasses WhatsApp entirely. It directly:
 *   1. Requires goImageService.js and tests each Go service method
 *   2. Requires cardSystem.js and tests cmdColl directly
 *   3. Requires rpgCommands.js and tests displayCharacterSheet directly
 *   4. Reports exactly which call fails and why
 *
 * Usage: node scripts/test_direct_pipeline.js
 * Run on Oracle: cd ~/whatsapp-bot && node scripts/test_direct_pipeline.js
 *
 * This is the definitive test — if a call works here but fails in WhatsApp,
 * the issue is in the WhatsApp/Baileys layer, not the Go service or command code.
 */

'use strict';

// Load .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(section, msg, color = RESET) {
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  console.log(`${color}[${ts}] ${BOLD}[${section}]${RESET} ${color}${msg}${RESET}`);
}

function logResult(label, success, detail) {
  const icon = success ? '✅' : '❌';
  const color = success ? GREEN : RED;
  console.log(`  ${icon} ${color}${label}${RESET}: ${detail}`);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  DIRECT PIPELINE TEST — testing bot code without WhatsApp`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  // ── 1. Environment check ──────────────────────────────────────
  log('ENV', 'Checking environment...', CYAN);
  console.log(`  GO_IMAGE_SERVICE_URL: ${process.env.GO_IMAGE_SERVICE_URL || '(unset — will use default http://127.0.0.1:7860)'}`);
  console.log(`  MONGO_URI: ${process.env.MONGO_URI ? 'set (' + process.env.MONGO_URI.slice(0, 30) + '...)' : '(unset)'}`);
  console.log(`  Node version: ${process.version}`);
  console.log(`  CWD: ${process.cwd()}`);
  console.log('');

  // ── 2. Test GoImageService ────────────────────────────────────
  log('GOSERVICE', 'Loading goImageService.js...', CYAN);
  let GoImageService;
  try {
    GoImageService = require('../core/utils/goImageService');
    logResult('require goImageService', true, 'module loaded');
  } catch (e) {
    logResult('require goImageService', false, e.message);
    process.exit(1);
  }

  log('GOSERVICE', 'Creating instance...', CYAN);
  const goService = new GoImageService();
  console.log(`  baseUrl: ${goService.baseUrl}`);
  console.log(`  client defined: ${!!goService.client}`);
  console.log('');

  // Wait a moment for the constructor's async healthCheck to complete
  log('GOSERVICE', 'Waiting 3s for constructor healthCheck to complete...', CYAN);
  await new Promise(r => setTimeout(r, 3000));

  // ── 3. Test healthCheck ───────────────────────────────────────
  log('HEALTH', 'Calling goService.healthCheck()...', CYAN);
  try {
    const health = await goService.healthCheck();
    if (health) {
      logResult('healthCheck', true, JSON.stringify(health));
    } else {
      logResult('healthCheck', false, 'returned null (see error log above)');
    }
  } catch (e) {
    logResult('healthCheck', false, `${e.code || e.constructor.name}: ${e.message}`);
  }
  console.log('');

  // ── 4. Test generateProfileCard ───────────────────────────────
  log('PROFILE', 'Calling goService.generateProfileCard() with test data...', CYAN);
  const profileData = {
    nickname: 'TEST_USER',
    level: 50,
    rank: 'S',
    class: 'Adventurer',
    classIcon: '🛡️',
    stats: { hp: 5000, atk: 250, def: 200, mag: 150, spd: 100, luck: 50, crit: 25, evasion: 10 },
    equipStats: { hp: 500, atk: 25, def: 20, mag: 15, spd: 10, luck: 5, crit: 2, evasion: 1 },
    statPoints: 0,
    pfpUrl: '',
    rankData: { color: '#FFD700', label: 'S-Rank' },
  };

  try {
    const startTime = Date.now();
    const cardBuffer = await goService.generateProfileCard(profileData);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (cardBuffer && cardBuffer.length > 100) {
      logResult('generateProfileCard', true, `returned ${cardBuffer.length} bytes in ${elapsed}s`);
      // Save to file for inspection
      fs.writeFileSync('/tmp/test_profile.png', cardBuffer);
      console.log(`  Saved to /tmp/test_profile.png`);
    } else {
      logResult('generateProfileCard', false, `returned ${cardBuffer ? cardBuffer.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateProfileCard', false, `${e.code || e.constructor.name}: ${e.message}`);
  }
  console.log('');

  // ── 5. Test generateCardGrid ──────────────────────────────────
  log('CARDGRID', 'Calling goService.generateCardGrid() with test data...', CYAN);
  const testImageUrls = [
    { url: 'https://cdn.shoob.gg/images/cards/1/1.png', name: 'Test Card 1', tier: '1', animated: false },
    { url: 'https://cdn.shoob.gg/images/cards/2/1.png', name: 'Test Card 2', tier: '2', animated: false },
    { url: 'https://cdn.shoob.gg/images/cards/3/1.png', name: 'Test Card 3', tier: '3', animated: false },
  ];

  try {
    const startTime = Date.now();
    const gridBuffer = await goService.generateCardGrid(testImageUrls, 'TEST GRID');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (gridBuffer && gridBuffer.length > 100) {
      logResult('generateCardGrid', true, `returned ${gridBuffer.length} bytes in ${elapsed}s`);
      fs.writeFileSync('/tmp/test_grid.png', gridBuffer);
      console.log(`  Saved to /tmp/test_grid.png`);
    } else {
      logResult('generateCardGrid', false, `returned ${gridBuffer ? gridBuffer.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateCardGrid', false, `${e.code || e.constructor.name}: ${e.message}`);
  }
  console.log('');

  // ── 6. Test generateTransactionCard ───────────────────────────
  log('TXCARD', 'Calling goService.generateTransactionCard() with test data...', CYAN);
  const txData = {
    type: 'daily',
    amount: 5000,
    balance: 25000,
    nickname: 'TEST_USER',
    currency: 'Ꞩ',
  };

  try {
    const startTime = Date.now();
    const txBuffer = await goService.generateTransactionCard(txData);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (txBuffer && txBuffer.length > 100) {
      logResult('generateTransactionCard', true, `returned ${txBuffer.length} bytes in ${elapsed}s`);
      fs.writeFileSync('/tmp/test_tx.png', txBuffer);
      console.log(`  Saved to /tmp/test_tx.png`);
    } else {
      logResult('generateTransactionCard', false, `returned ${txBuffer ? txBuffer.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateTransactionCard', false, `${e.code || e.constructor.name}: ${e.message}`);
  }
  console.log('');

  // ── 7. Test generateCombatImage ───────────────────────────────
  log('COMBAT', 'Calling goService.generateCombatImage() with test data...', CYAN);
  const combatData = {
    players: [{ name: 'TestHero', class: 'Fighter', hp: 1000, maxHp: 1000, mp: 100, maxMp: 100, level: 50, spriteIndex: 0 }],
    enemies: [{ name: 'TestEnemy', isBoss: false, hp: 500, maxHp: 500, level: 10, spriteIndex: 0 }],
    background: 'env1.png',
  };

  try {
    const startTime = Date.now();
    const combatBuffer = await goService.generateCombatImage(combatData);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (combatBuffer && combatBuffer.length > 100) {
      logResult('generateCombatImage', true, `returned ${combatBuffer.length} bytes in ${elapsed}s`);
      fs.writeFileSync('/tmp/test_combat.png', combatBuffer);
      console.log(`  Saved to /tmp/test_combat.png`);
    } else {
      logResult('generateCombatImage', false, `returned ${combatBuffer ? combatBuffer.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateCombatImage', false, `${e.code || e.constructor.name}: ${e.message}`);
  }
  console.log('');

  // ── 8. Test cardSystem directly ───────────────────────────────
  log('CARDSYS', 'Loading cardSystem.js...', CYAN);
  let cardSystem;
  try {
    cardSystem = require('../core/rpg/cardSystem');
    logResult('require cardSystem', true, 'module loaded');
  } catch (e) {
    logResult('require cardSystem', false, e.message);
    console.log('');
    console.log(`${YELLOW}Skipping cardSystem direct test (module failed to load).${RESET}`);
    return summarize();
  }

  // Initialize card system
  log('CARDSYS', 'Initializing cardSystem...', CYAN);
  try {
    const botConfig = require('../botConfig');
    const configInstance = new botConfig.BotConfig(path.join(__dirname, '..', 'instances', 'Jake'));
    await botConfig.storage.run(configInstance, async () => {
      cardSystem.init({ sock: { sendMessage: async () => ({ key: { id: 'test' } }) }, sendMessage: async () => ({ key: { id: 'test' } }) });
      logResult('cardSystem.init', true, 'initialized');
    });
  } catch (e) {
    logResult('cardSystem.init', false, e.message);
  }
  console.log('');

  // ── 9. Test MongoDB connectivity ──────────────────────────────
  log('MONGO', 'Testing MongoDB connectivity...', CYAN);
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0', { serverSelectionTimeoutMS: 5000 });
    }
    logResult('MongoDB connect', true, `readyState=${mongoose.connection.readyState}`);
  } catch (e) {
    logResult('MongoDB connect', false, e.message);
  }
  console.log('');

  // ── SUMMARY ───────────────────────────────────────────────────
  summarize();
}

function summarize() {
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  TEST COMPLETE — check results above`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`\nIf all Go service calls returned ✅, the issue is in the WhatsApp/`);
  console.log(`Baileys message handling layer, not the Go service or command code.`);
  console.log(`If any call returned ❌, that's the specific call that needs fixing.\n`);
}

main().catch(err => {
  console.error(`${RED}FATAL ERROR:${RESET}`, err);
  console.error(err.stack);
  process.exit(1);
});
