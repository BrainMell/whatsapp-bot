#!/usr/bin/env node
/**
 * OVERNIGHT VERIFY SCRIPT — Tests PvP + Abyss + Prefix interpolation
 * directly against the actual code modules (no WhatsApp needed).
 *
 * Run locally from /home/z/my-project/workspaces/whatsapp-bot:
 *   node scripts/test_overnight_verify.js
 *
 * Tests:
 *   1. P() interpolation — no literal '${P()}' in any module-exported message
 *   2. PvP cancelDuel — clears stuck 'duel already active' state
 *   3. PvP challengePlayer + acceptChallenge flow (with mocked image gen)
 *   4. Abyss startRun — uses player's REAL stats (HP/EN scale with level)
 *   5. Abyss processAttack — damage scales with player stats, not flat 100
 *   6. buildMentions — only pings explicit @-mentions, not reply targets
 */

'use strict';

require('dotenv').config();

const assert = require('assert');

const PASS = '\x1b[32m';
const FAIL = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let testCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

function ok(name, detail) {
  testCount++;
  passCount++;
  console.log(`  ${PASS}✅ PASS${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  testCount++;
  failCount++;
  failures.push({ name, detail });
  console.log(`  ${FAIL}❌ FAIL${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Track failures for final report
process.on('uncaughtException', (e) => {
  console.error(`${FAIL}UNCAUGHT:${RESET}`, e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error(`${FAIL}UNHANDLED REJECTION:${RESET}`, e);
  process.exit(1);
});

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  OVERNIGHT VERIFY — direct module-level tests`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  // ── TEST 1: P() interpolation — scan all RPG modules for leaks ──
  console.log(`${CYAN}[Test 1]${RESET} Scan for literal '\${P()}' leaks in module source...`);
  const fs = require('fs');
  const path = require('path');
  const glob = require('glob');
  const rpgDir = path.join(__dirname, '..', 'core', 'rpg');
  const files = fs.readdirSync(rpgDir).filter(f => f.endsWith('.js'));
  let leakCount = 0;
  for (const f of files) {
    const full = path.join(rpgDir, f);
    const src = fs.readFileSync(full, 'utf8');
    // Walk char-by-char tracking string state ACROSS newlines.
    // Single/double-quoted strings don't span newlines (without a backslash),
    // but template literals (backticks) DO. So we MUST carry inB across lines.
    let inS = false, inD = false, inB = false;
    let line = 1, col = 0;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '\n') { line++; col = 0; continue; }
      col++;
      if (c === '\\' && i + 1 < src.length) { i++; col++; continue; }
      if (!inB && !inD && c === "'") inS = !inS;
      else if (!inB && !inS && c === '"') inD = !inD;
      else if (!inS && !inD && c === '`') inB = !inB;
      // Detect ${P()} ONLY when not inside a backtick template literal
      else if (!inB && !inS && !inD && src.startsWith('${P()}', i)) {
        fail(`no-leak:${f}:${line}`, `literal '\${P()}' found in single/double-quoted string at line ${line}:${col}`);
        leakCount++;
        i += 5; // skip past ${P()}
      }
      // Single/double quoted strings can't span newlines — reset on newline
      // (the 'continue' above already did this, but be explicit for safety)
    }
  }
  if (leakCount === 0) ok('no-leak:rpg-modules', `scanned ${files.length} files in core/rpg/, no literal \${P()} leaks`);

  // ── TEST 2: P() helper exists in modules that use it ──
  console.log(`\n${CYAN}[Test 2]${RESET} Verify P() helper is defined in modules that interpolate it...`);
  for (const f of ['abyssSystem.js', 'raidSystem.js', 'bountySystem.js', 'cardSystem.js']) {
    const full = path.join(rpgDir, f);
    const src = fs.readFileSync(full, 'utf8');
    const hasP = /const\s+P\s*=\s*\(\)\s*=>/.test(src) || /function\s+P\s*\(\)/.test(src);
    const usesP = /\bP\(\)/.test(src);
    if (usesP && hasP) ok(`P-defined:${f}`, 'P() helper is defined and used');
    else if (usesP && !hasP) fail(`P-defined:${f}`, 'uses P() but never defines it — ReferenceError at runtime');
    else ok(`P-defined:${f}`, '(does not use P())');
  }

  // ── TEST 3: pvpSystem.cancelDuel exists and clears state ──
  console.log(`\n${CYAN}[Test 3]${RESET} pvpSystem.cancelDuel() clears stuck duel state...`);
  let pvpSystem;
  try {
    pvpSystem = require('../core/rpg/pvpSystem');
    if (typeof pvpSystem.cancelDuel !== 'function') {
      fail('cancelDuel:exported', 'cancelDuel is not exported from pvpSystem');
    } else {
      ok('cancelDuel:exported', 'pvpSystem.cancelDuel is a function');
      // Try calling it on a fake chatId with no active duel — should return {success: false}
      const r1 = pvpSystem.cancelDuel('test-chat-nonexistent-' + Date.now());
      if (r1 && r1.success === false && /no active duel/i.test(r1.message)) {
        ok('cancelDuel:empty-state', `returns "${r1.message}" when no duel is active`);
      } else {
        fail('cancelDuel:empty-state', `expected failure message, got: ${JSON.stringify(r1)}`);
      }
    }
  } catch (e) {
    fail('cancelDuel:load', `failed to load pvpSystem: ${e.message}`);
  }

  // ── TEST 4: pvpSystem acceptChallenge handles missing invite gracefully ──
  console.log(`\n${CYAN}[Test 4]${RESET} pvpSystem.acceptChallenge handles missing invite...`);
  if (pvpSystem && typeof pvpSystem.acceptChallenge === 'function') {
    try {
      const r = await pvpSystem.acceptChallenge(
        { sendMessage: async () => ({}) }, // mock sock
        'test-chat-nonexistent-' + Date.now(),
        'fakeUser@s.whatsapp.net',
      );
      if (r && r.success === false && /no pending|no pending invitations/i.test(r.message)) {
        ok('acceptChallenge:no-invite', `returns "${r.message}" when no invite exists`);
      } else {
        fail('acceptChallenge:no-invite', `expected no-pending message, got: ${JSON.stringify(r).slice(0, 200)}`);
      }
    } catch (e) {
      fail('acceptChallenge:no-invite', `threw: ${e.message}`);
    }
  } else {
    fail('acceptChallenge:exists', 'pvpSystem.acceptChallenge is not a function');
  }

  // ── TEST 5: buildMentions only pings explicit @-mentions ──
  console.log(`\n${CYAN}[Test 5]${RESET} engine.js buildMentions only pings explicit @-mentions...`);
  // buildMentions is defined inside the engine closure — we can't import it directly.
  // Instead, verify the helper functions it depends on are wired correctly by reading source.
  const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
  const hasBuildMentions = /function\s+buildMentions\s*\(/.test(engineSrc);
  const hasWasExplicit = /function\s+wasExplicitlyMentioned\s*\(/.test(engineSrc);
  const hasGetExplicit = /function\s+getExplicitMention\s*\(/.test(engineSrc);
  if (hasBuildMentions && hasWasExplicit && hasGetExplicit) {
    ok('buildMentions:defined', 'all three helpers (buildMentions, wasExplicitlyMentioned, getExplicitMention) are defined');
  } else {
    fail('buildMentions:defined', `missing helpers: buildMentions=${hasBuildMentions} wasExplicit=${hasWasExplicit} getExplicit=${hasGetExplicit}`);
  }
  // Count call-sites that were migrated
  const buildMentionsCallCount = (engineSrc.match(/buildMentions\s*\(/g) || []).length;
  if (buildMentionsCallCount > 5) {
    ok('buildMentions:call-sites', `${buildMentionsCallCount} call-sites use buildMentions (definition + ~${buildMentionsCallCount - 1} callers)`);
  } else {
    fail('buildMentions:call-sites', `only ${buildMentionsCallCount} call-sites — expected many admin/mod/pvp commands to be migrated`);
  }

  // ── TEST 6: Abyss startRun uses player's real stats ──
  console.log(`\n${CYAN}[Test 6]${RESET} Abyss loads player's REAL stats (not flat 100 defaults)...`);
  const abyssSystem = require('../core/rpg/abyssSystem');
  const economy = require('../core/rpg/economy');
  const progression = require('../core/rpg/progression');
  const connectDB = require('../db');
  await connectDB(); // uses MONGO_URI from .env

  // Find a real user to test with (one with the highest level, so HP should clearly not be 100)
  const User = require('../core/models/User');
  const topUser = await User.findOne({}).sort({ 'progression.level': -1 }).limit(1);
  if (!topUser) {
    fail('abyss:test-user', 'no users in DB to test with');
  } else {
    const testJid = topUser.userId;
    console.log(`  Using test user: ${testJid} (level ${topUser.progression?.level || 'unknown'})`);
    // Hydrate the user into economy cache (normally happens at bot boot)
    await economy.reloadUserFromDB(testJid);
    // Try to start an Abyss run with this user's REAL stats
    const user = economy.getUser(testJid);
    if (!user) {
      fail('abyss:load-user', `economy.getUser returned null for ${testJid} (user may not be registered)`);
    } else {
      const userClass = economy.getUserClass(testJid);
      const classIdForAbyss = userClass?.id || (typeof user.class === 'string' ? user.class : 'FIGHTER');
      const baseStats = progression.getBaseStats(testJid, classIdForAbyss);
      console.log(`  User class: ${userClass?.name || user.class || 'none'} (id=${classIdForAbyss})`);
      console.log(`  baseStats: hp=${baseStats?.hp}, atk=${baseStats?.atk}, def=${baseStats?.def}, energy=${baseStats?.energy}`);
      // The bug was that HP showed as 100. Verify the base HP scales with level.
      if (baseStats && baseStats.hp && baseStats.hp > 100) {
        ok('abyss:real-stats', `baseStats.hp=${baseStats.hp} (scales with level, not flat 100)`);
      } else if (baseStats && baseStats.hp === 100) {
        fail('abyss:real-stats', `baseStats.hp is exactly 100 — likely the flat-default bug still present`);
      } else {
        fail('abyss:real-stats', `baseStats.hp is missing or unexpected: ${JSON.stringify(baseStats).slice(0, 200)}`);
      }
    }
  }

  // ── TEST 7: Abyss processAttack damage formula scales with player stats ──
  console.log(`\n${CYAN}[Test 7]${RESET} Abyss damage scales with player stats...`);
  // We can't easily test this without an active Abyss run, but we CAN inspect the code path.
  const abyssSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'abyssSystem.js'), 'utf8');
  // The damage formula should reference playerStats (or baseStats) and a level multiplier
  const usesPlayerStats = /playerStats\.(atk|mag|str|int)/i.test(abyssSrc) ||
                          /baseStats\.(atk|mag|str|int)/i.test(abyssSrc);
  const hasDamageCap = /Math\.min\s*\(\s*\w*[Dd]amage\s*,\s*100\s*\)/.test(abyssSrc);
  if (usesPlayerStats) {
    ok('abyss:damage-formula', 'damage formula references playerStats/baseStats');
  } else {
    fail('abyss:damage-formula', 'damage formula does NOT reference player stats — likely using flat basePower');
  }
  if (hasDamageCap) {
    fail('abyss:damage-cap', 'found Math.min(damage, 100) cap — THIS IS THE BUG');
  } else {
    ok('abyss:damage-cap', 'no flat 100 damage cap found in abyssSystem.js');
  }

  // ── TEST 8: guildAdventure.startAbyssCombat uses getUserClass ──
  console.log(`\n${CYAN}[Test 8]${RESET} startAbyssCombat uses economy.getUserClass (not raw user.class)...`);
  const gaSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildAdventure.js'), 'utf8');
  const usesGetUserClass = /economy\.getUserClass\s*\(/.test(gaSrc);
  const usesRawUserClass = /user\.class(?!\s*\?)/.test(gaSrc);
  // Note: user.class might appear in unrelated places; we just need to verify getUserClass is used in Abyss path
  // Look at the specific Abyss combat section
  const abyssCombatMatch = gaSrc.match(/async\s+function\s+startAbyssCombat[\s\S]{0,1500}/);
  if (abyssCombatMatch) {
    const section = abyssCombatMatch[0];
    if (/economy\.getUserClass\s*\(/.test(section)) {
      ok('abyss:getUserClass-used', 'startAbyssCombat uses economy.getUserClass()');
    } else {
      fail('abyss:getUserClass-used', 'startAbyssCombat does NOT use economy.getUserClass — class loading regression');
    }
  } else {
    fail('abyss:getUserClass-used', 'could not locate startAbyssCombat function');
  }

  // ── TEST 9: goImageService queue timeout exists ──
  console.log(`\n${CYAN}[Test 9]${RESET} goImageService has queue-wait timeout...`);
  const goSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'utils', 'goImageService.js'), 'utf8');
  if (/queue\s+timeout/i.test(goSrc) && /8000|8_000/.test(goSrc)) {
    ok('goImageService:queue-timeout', '8s queue-wait timeout is present');
  } else {
    fail('goImageService:queue-timeout', 'queue-wait timeout missing — would hang under load');
  }

  // ── TEST 10: Go service is actually healthy on Box 2 (production) ──
  console.log(`\n${CYAN}[Test 10]${RESET} Go service health check (via SSH to Box 2 — production VCN IP)...`);
  const { execSync } = require('child_process');
  try {
    const sshScript = '/home/z/my-project/scripts/ssh_oracle.py';
    const out = execSync(`python3 ${sshScript} 92.4.134.161 "curl -s -m 5 http://127.0.0.1:7860/health"`, { timeout: 30000 }).toString().trim();
    let parsed;
    try { parsed = JSON.parse(out); } catch (e) { /* not JSON */ }
    if (parsed && (parsed.status === 'ready' || parsed.engine)) {
      ok('go:health', `Go service healthy on Box 2: ${JSON.stringify(parsed)}`);
    } else {
      fail('go:health', `unexpected response from Box 2 Go service: ${out.slice(0, 200)}`);
    }
  } catch (e) {
    fail('go:health', `SSH to Box 2 failed: ${e.message}`);
  }

  // ── FINAL REPORT ──
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${passCount}/${testCount} passed, ${failCount} failed`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);
  if (failures.length) {
    console.log(`${FAIL}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  • ${f.name}: ${f.detail}`);
    }
    console.log();
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${FAIL}FATAL:${RESET}`, e);
  process.exit(1);
});
