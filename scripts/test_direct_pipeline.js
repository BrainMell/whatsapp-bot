#!/usr/bin/env node
/**
 * DIRECT PIPELINE TEST v2 — with aggressive timeouts on EVERY call.
 *
 * v1 hung because some Go service calls have no timeout (120s axios default).
 * This version wraps EVERY call in a 10s Promise.race timeout.
 *
 * Usage: node scripts/test_direct_pipeline.js
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
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

// Wrap any promise in a timeout — prevents hangs
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
  console.log(`  DIRECT PIPELINE TEST v2 — every call has 10s timeout`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  // ── 1. Environment ─────────────────────────────────────────────
  log('ENV', 'Environment check', CYAN);
  console.log(`  GO_IMAGE_SERVICE_URL: ${process.env.GO_IMAGE_SERVICE_URL || '(unset — default http://127.0.0.1:7860)'}`);
  console.log(`  MONGO_URI: ${process.env.MONGO_URI ? 'set' : '(unset)'}`);
  console.log(`  Node: ${process.version}, CWD: ${process.cwd()}`);
  console.log('');

  // ── 2. Load goImageService ─────────────────────────────────────
  log('LOAD', 'Requiring goImageService.js...', CYAN);
  let GoImageService;
  try {
    GoImageService = require('../core/utils/goImageService');
    logResult('require', true, 'loaded');
  } catch (e) {
    logResult('require', false, e.message);
    process.exit(1);
  }

  // Create instance — this.client is now set BEFORE healthCheck (fixed in dc7ea3ac)
  log('LOAD', 'Creating GoImageService instance...', CYAN);
  const goService = new GoImageService();
  console.log(`  baseUrl: ${goService.baseUrl}`);
  console.log(`  client defined: ${!!goService.client}`);
  console.log('');

  // ── 3. healthCheck ─────────────────────────────────────────────
  log('HEALTH', 'goService.healthCheck()...', CYAN);
  try {
    const health = await withTimeout(goService.healthCheck(), 10000, 'healthCheck');
    if (health) {
      logResult('healthCheck', true, JSON.stringify(health));
    } else {
      logResult('healthCheck', false, 'returned null');
    }
  } catch (e) {
    logResult('healthCheck', false, e.message);
  }
  console.log('');

  // ── 4. generateProfileCard ─────────────────────────────────────
  log('PROFILE', 'goService.generateProfileCard()...', CYAN);
  const profileData = {
    nickname: 'TEST', level: 50, rank: 'S', class: 'Adventurer', classIcon: '🛡️',
    stats: { hp: 5000, atk: 250, def: 200, mag: 150, spd: 100, luck: 50, crit: 25, evasion: 10 },
    equipStats: { hp: 500, atk: 25, def: 20, mag: 15, spd: 10, luck: 5, crit: 2, evasion: 1 },
    statPoints: 0, pfpUrl: '',
    rankData: { color: '#FFD700', label: 'S-Rank' },
  };
  try {
    const t0 = Date.now();
    const buf = await withTimeout(goService.generateProfileCard(profileData), 10000, 'generateProfileCard');
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (buf && buf.length > 100) {
      logResult('generateProfileCard', true, `${buf.length} bytes in ${elapsed}s`);
      fs.writeFileSync('/tmp/test_profile.png', buf);
    } else {
      logResult('generateProfileCard', false, `${buf ? buf.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateProfileCard', false, e.message);
  }
  console.log('');

  // ── 5. generateCardGrid ────────────────────────────────────────
  log('GRID', 'goService.generateCardGrid()...', CYAN);
  const testUrls = [
    { url: 'https://cdn.shoob.gg/images/cards/1/1.png', name: 'Card 1', tier: '1', animated: false },
    { url: 'https://cdn.shoob.gg/images/cards/2/1.png', name: 'Card 2', tier: '2', animated: false },
  ];
  try {
    const t0 = Date.now();
    const buf = await withTimeout(goService.generateCardGrid(testUrls, 'TEST'), 15000, 'generateCardGrid');
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (buf && buf.length > 100) {
      logResult('generateCardGrid', true, `${buf.length} bytes in ${elapsed}s`);
      fs.writeFileSync('/tmp/test_grid.png', buf);
    } else {
      logResult('generateCardGrid', false, `${buf ? buf.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateCardGrid', false, e.message);
  }
  console.log('');

  // ── 6. generateTransactionCard ─────────────────────────────────
  log('TX', 'goService.generateTransactionCard()...', CYAN);
  try {
    const t0 = Date.now();
    const buf = await withTimeout(
      goService.generateTransactionCard({
        type: 'daily', amount: 5000, balance: 25000, nickname: 'TEST', currency: 'Ꞩ'
      }),
      10000, 'generateTransactionCard'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (buf && buf.length > 100) {
      logResult('generateTransactionCard', true, `${buf.length} bytes in ${elapsed}s`);
    } else {
      logResult('generateTransactionCard', false, `${buf ? buf.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateTransactionCard', false, e.message);
  }
  console.log('');

  // ── 7. generateCombatImage ─────────────────────────────────────
  log('COMBAT', 'goService.generateCombatImage()...', CYAN);
  try {
    const t0 = Date.now();
    const buf = await withTimeout(
      goService.generateCombatImage({
        players: [{ name: 'Hero', class: 'Fighter', hp: 1000, maxHp: 1000, mp: 100, maxMp: 100, level: 50, spriteIndex: 0 }],
        enemies: [{ name: 'Goblin', isBoss: false, hp: 500, maxHp: 500, level: 10, spriteIndex: 0 }],
        background: 'env1.png',
      }),
      15000, 'generateCombatImage'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (buf && buf.length > 100) {
      logResult('generateCombatImage', true, `${buf.length} bytes in ${elapsed}s`);
    } else {
      logResult('generateCombatImage', false, `${buf ? buf.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateCombatImage', false, e.message);
  }
  console.log('');

  // ── 8. generateEconomyCard ─────────────────────────────────────
  log('ECON', 'goService.generateEconomyCard()...', CYAN);
  try {
    const t0 = Date.now();
    const buf = await withTimeout(
      goService.generateEconomyCard({
        type: 'balance', nickname: 'TEST', wallet: 50000, bank: 100000, currency: 'Ꞩ'
      }),
      10000, 'generateEconomyCard'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    if (buf && buf.length > 100) {
      logResult('generateEconomyCard', true, `${buf.length} bytes in ${elapsed}s`);
    } else {
      logResult('generateEconomyCard', false, `${buf ? buf.length + ' bytes' : 'null'} in ${elapsed}s`);
    }
  } catch (e) {
    logResult('generateEconomyCard', false, e.message);
  }
  console.log('');

  // ── 9. Raw axios test (same as deploy test) ────────────────────
  log('RAW', 'Raw axios.get(/health) test...', CYAN);
  try {
    const axios = require('axios');
    const t0 = Date.now();
    const res = await withTimeout(
      axios.get('http://127.0.0.1:7860/health', { timeout: 5000 }),
      10000, 'raw axios'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    logResult('raw axios /health', true, `${JSON.stringify(res.data)} in ${elapsed}s`);
  } catch (e) {
    logResult('raw axios /health', false, e.message);
  }
  console.log('');

  // ── 10. Raw POST test (render endpoint) ────────────────────────
  log('RAW', 'Raw axios.post(/api/cards/profile) test...', CYAN);
  try {
    const axios = require('axios');
    const t0 = Date.now();
    const res = await withTimeout(
      axios.post('http://127.0.0.1:7860/api/cards/profile', profileData, {
        responseType: 'arraybuffer',
        timeout: 10000,
      }),
      15000, 'raw axios POST'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const buf = Buffer.from(res.data);
    logResult('raw axios POST /api/cards/profile', true, `${buf.length} bytes in ${elapsed}s`);
  } catch (e) {
    logResult('raw axios POST /api/cards/profile', false, e.message);
  }
  console.log('');

  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  TEST COMPLETE${RESET}`);
  console.log(`  If goService.* calls fail but raw axios succeeds, the issue is`);
  console.log(`  in goImageService.js (client config, _enqueue queue, etc.).`);
  console.log(`  If raw axios also fails, the Go service itself is the problem.`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  // Force exit — don't let hanging promises keep the process alive
  process.exit(0);
}

main().catch(err => {
  console.error(`${RED}FATAL:${RESET}`, err);
  process.exit(1);
});
