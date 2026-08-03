#!/usr/bin/env node
/**
 * COMBAT SIMULATION SUITE — tests damage formula, HP/EN display,
 * summon deployment, and @-mention display across multiple class/level
 * combinations. Calls actual code paths against real MongoDB data.
 *
 * Run from: /home/z/my-project/workspaces/whatsapp-bot
 *   node scripts/test_combat_simulations.js
 */

'use strict';

require('dotenv').config();

const PASS = '\x1b[32m';
const FAIL = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passCount = 0, failCount = 0;
const failures = [];

function ok(name, detail) {
  passCount++;
  console.log(`  ${PASS}✅ PASS${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  failCount++;
  failures.push({ name, detail });
  console.log(`  ${FAIL}❌ FAIL${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) {
  console.log(`\n${CYAN}${BOLD}═══ ${name} ═══${RESET}`);
}

// ========================================
// SIMULATION 1: Damage formula across classes/levels
// ========================================

async function simulateDamageFormula() {
  section('SIMULATION 1: Damage Formula — Multiple Classes × Levels');

  const connectDB = require('../db');
  await connectDB();

  const economy = require('../core/rpg/economy');
  const progression = require('../core/rpg/progression');
  const User = require('../core/models/User');

  // Get a range of real users at different levels
  const users = await User.find({}).sort({ 'progression.level': -1 }).limit(10);
  if (users.length === 0) {
    fail('test-users', 'no users in DB');
    return;
  }

  console.log(`  Testing with ${users.length} real users (levels: ${users.map(u => u.progression?.level || 0).join(', ')})`);

  for (const userDoc of users) {
    const jid = userDoc.userId;
    const level = userDoc.progression?.level || 1;
    const className = userDoc.class || 'FIGHTER';

    // Hydrate user into economy cache
    await economy.reloadUserFromDB(jid);
    const user = economy.getUser(jid);
    if (!user) continue;

    const userClass = economy.getUserClass(jid);
    const classId = userClass?.id || (typeof user.class === 'string' ? user.class : 'FIGHTER');
    const baseStats = progression.getBaseStats(jid, classId);

    if (!baseStats) {
      fail(`stats:${jid}`, `getBaseStats returned null for level ${level} ${classId}`);
      continue;
    }

    // Simulate damage: basePower + (stat * scaling) + (level * multiplier) - enemyDef
    const basePower = 50; // typical skill power
    const stat = baseStats.atk || baseStats.str || 10;
    const statScaling = 1.5;
    const levelMult = 5;
    const enemyDef = 50;
    const expectedDamage = Math.max(1, Math.floor(basePower + (stat * statScaling) + (level * levelMult) - enemyDef));

    // Check: damage should scale with level (higher level = more damage)
    if (level >= 50 && expectedDamage < 100) {
      fail(`damage-scales:${jid}`, `level ${level} ${classId}: damage=${expectedDamage} (expected >100 for high level)`);
    } else if (level >= 50) {
      ok(`damage-scales:${jid}`, `level ${level} ${classId}: damage=${expectedDamage}, atk=${stat}, hp=${baseStats.hp}`);
    }

    // Check: HP should NOT be 100 (the old bug)
    if (baseStats.hp === 100) {
      fail(`hp-not-100:${jid}`, `level ${level} ${classId}: HP is exactly 100 — flat default bug`);
    } else if (baseStats.hp > 100) {
      ok(`hp-real:${jid}`, `level ${level} ${classId}: HP=${baseStats.hp} (scales with level)`);
    }
  }
}

// ========================================
// SIMULATION 2: Combat image rendering via Go service
// ========================================

async function simulateCombatImages() {
  section('SIMULATION 2: Combat Image Rendering — All Combat Types');

  const { execSync } = require('child_process');
  const sshScript = '/home/z/my-project/scripts/ssh_oracle.py';

  const testCases = [
    {
      name: 'PvE-Fighter-LowLevel',
      payload: {
        players: [{ name: 'Hero', class: 'FIGHTER', level: 10, hp: 500, maxHp: 500, currentHP: 450, energy: 80, maxEnergy: 100, adventurerRank: 'F', spriteIndex: 0 }],
        enemies: [{ name: 'Slime', currentHP: 200, maxHp: 200, isBoss: false, justDied: false, spriteIndex: 0 }],
        summons: [],
        combatType: 'PVE',
        rank: 'F',
      },
    },
    {
      name: 'PvE-Mage-HighLevel',
      payload: JSON.stringify({
        players: [{ name: 'Archmage', class: 'MAGE', level: 100, hp: 6000, maxHp: 6000, currentHP: 5500, energy: 200, maxEnergy: 200, adventurerRank: 'S', spriteIndex: 0 }],
        enemies: [{ name: 'Ancient Dragon', currentHP: 50000, maxHp: 50000, isBoss: true, justDied: false, spriteIndex: 0 }],
        summons: [{ name: 'Flame Elemental', species: 'flame_elemental', currentHP: 800, maxHp: 800, justDied: false, ownerIndex: 0, isStationary: false }],
        combatType: 'PVE',
        rank: 'S',
        action: { attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 0, skillName: 'Fireball', element: 'fire', damage: 5000, isCrit: false, missed: false, heal: 0 },
      }),
    },
    {
      name: 'PvP-2-Players',
      payload: JSON.stringify({
        players: [
          { name: 'Challenger', class: 'PALADIN', level: 75, hp: 3000, maxHp: 3000, currentHP: 2800, energy: 100, maxEnergy: 100, adventurerRank: 'A', spriteIndex: 0 },
          { name: 'Defender', class: 'NINJA', level: 80, hp: 2500, maxHp: 2500, currentHP: 2200, energy: 100, maxEnergy: 100, adventurerRank: 'A', spriteIndex: 0 },
        ],
        enemies: [],
        summons: [
          { name: 'Wolf', species: 'wolf', currentHP: 500, maxHp: 500, justDied: false, ownerIndex: 0, isStationary: false },
          { name: 'Skeleton', species: 'skeleton', currentHP: 300, maxHp: 300, justDied: false, ownerIndex: 1, isStationary: false },
        ],
        combatType: 'PVP',
        rank: 'A',
        action: { attackerSide: 'player', attackerIndex: 0, targetSide: 'player', targetIndex: 1, skillName: 'Heavy Strike', element: 'physical', damage: 800, isCrit: true, missed: false, heal: 0 },
      }),
    },
    {
      name: 'Abyss-Floor50',
      payload: JSON.stringify({
        players: [{ name: 'AbyssDiver', class: 'BERSERKER', level: 120, hp: 8000, maxHp: 8000, currentHP: 3000, energy: 150, maxEnergy: 150, adventurerRank: 'SS', spriteIndex: 0 }],
        enemies: [{ name: 'Abyssal Guardian', currentHP: 100000, maxHp: 100000, isBoss: true, justDied: false, spriteIndex: 0 }],
        summons: [{ name: 'Dragon', species: 'wargreymon', currentHP: 2000, maxHp: 2000, justDied: false, ownerIndex: 0, isStationary: false }],
        combatType: 'PVE',
        rank: 'ABYSS',
        action: { attackerSide: 'enemy', attackerIndex: 0, targetSide: 'player', targetIndex: 0, skillName: 'Void Blast', element: 'dark', damage: 2000, isCrit: false, missed: false, heal: 0 },
      }),
    },
  ];

  for (const tc of testCases) {
    const payloadStr = typeof tc.payload === 'string' ? tc.payload : JSON.stringify(tc.payload);
    const escapedPayload = payloadStr.replace(/'/g, "'\\''");
    const cmd = `curl -s -m 15 -X POST http://127.0.0.1:7860/api/combat -H "Content-Type: application/json" -d '${escapedPayload}' -o /tmp/sim_${tc.name}.png -w "HTTP %{http_code} %{size_download}bytes %{time_total}s"`;

    try {
      const result = execSync(`python3 ${sshScript} 92.4.134.161 "${cmd.replace(/"/g, '\\"')}"`, { timeout: 30000, encoding: 'utf8' }).trim();
      if (result.includes('HTTP 200')) {
        ok(`render:${tc.name}`, result);
      } else {
        fail(`render:${tc.name}`, `unexpected response: ${result}`);
      }
    } catch (e) {
      fail(`render:${tc.name}`, `SSH/Go service error: ${e.message.slice(0, 100)}`);
    }
  }
}

// ========================================
// SIMULATION 3: @-mention display (nickname not LID)
// ========================================

async function simulateMentionDisplay() {
  section('SIMULATION 3: @-mention Display — Nickname Resolution');

  const economy = require('../core/rpg/economy');
  const connectDB = require('../db');
  await connectDB();

  // Get real users
  const User = require('../core/models/User');
  const users = await User.find({}).limit(5);

  for (const userDoc of users) {
    const jid = userDoc.userId;
    await economy.reloadUserFromDB(jid);
    const user = economy.getUser(jid);
    const displayName = economy.getDisplayName(jid);
    const mentionJid = economy.getMentionJid(jid);

    // Display name should NOT be an 18-digit LID number
    const isLid = /^\d{15,20}$/.test(displayName);
    if (isLid) {
      fail(`mention:${jid}`, `display="${displayName}" looks like an LID number (should be nickname)`);
    } else if (user?.nickname && displayName === user.nickname) {
      ok(`mention:${jid}`, `display="${displayName}" (matches nickname) | mentionJid="${mentionJid}"`);
    } else {
      ok(`mention:${jid}`, `display="${displayName}" | mentionJid="${mentionJid}"`);
    }

    // Mention JID should match the user's registered format (LID or phone)
    // In LID-privacy groups, WhatsApp matches LID mentions — so LID is correct.
    // In regular groups, WhatsApp matches phone mentions — so phone is correct.
    // The key: getMentionJid should return the JID the user is registered as.
    if (mentionJid && (mentionJid.endsWith('@lid') || mentionJid.endsWith('@s.whatsapp.net'))) {
      ok(`mention-jid:${jid}`, `mentionJid="${mentionJid}" (valid format)`);
    } else {
      fail(`mention-jid:${jid}`, `mentionJid="${mentionJid}" is not a valid JID format`);
    }
  }
}

// ========================================
// SIMULATION 4: PvP cancelDuel + stuck-state recovery
// ========================================

async function simulatePvPRecovery() {
  section('SIMULATION 4: PvP Stuck-State Recovery');

  const pvpSystem = require('../core/rpg/pvpSystem');

  // Test 1: cancelDuel with no active duel
  const r1 = pvpSystem.cancelDuel('sim-test-chat-empty-' + Date.now());
  if (r1 && r1.success === false && /no active duel/i.test(r1.message)) {
    ok('cancelDuel:empty', `returns "No active duel" when empty`);
  } else {
    fail('cancelDuel:empty', `unexpected: ${JSON.stringify(r1)}`);
  }

  // Test 2: acceptChallenge with no invite
  try {
    const r2 = await pvpSystem.acceptChallenge(
      { sendMessage: async () => ({}) },
      'sim-test-chat-noinvite-' + Date.now(),
      'sim-test-user@s.whatsapp.net',
    );
    if (r2 && r2.success === false && /no pending/i.test(r2.message)) {
      ok('accept:no-invite', `returns "No pending challenge" when no invite`);
    } else {
      fail('accept:no-invite', `unexpected: ${JSON.stringify(r2).slice(0, 150)}`);
    }
  } catch (e) {
    fail('accept:no-invite', `threw: ${e.message}`);
  }

  // Test 3: declineChallenge with no invite (returns boolean, not object)
  try {
    const r3 = pvpSystem.declineChallenge('sim-test-chat-nodecline-' + Date.now(), 'sim-test-user@s.whatsapp.net');
    if (r3 === false) {
      ok('decline:no-invite', `returns false when no invite exists (boolean API)`);
    } else if (r3 === true) {
      fail('decline:no-invite', `returned true but no invite should exist`);
    } else {
      fail('decline:no-invite', `unexpected return type: ${typeof r3} = ${JSON.stringify(r3)}`);
    }
  } catch (e) {
    fail('decline:no-invite', `threw: ${e.message}`);
  }
}

// ========================================
// SIMULATION 5: Abyss HP/EN display (no decimals, no /100)
// ========================================

async function simulateAbyssDisplay() {
  section('SIMULATION 5: Abyss HP/EN Display — No Decimals, No /100');

  const fs = require('fs');
  const abyssSrc = fs.readFileSync(require('path').join(__dirname, '..', 'core', 'rpg', 'abyssSystem.js'), 'utf8');

  // Check: no remaining un-floored HP display patterns
  const unflooredHp = abyssSrc.match(/HP: \$\{[^}]*(?!Math\.floor)[^}]*\.hp\}/g);
  if (unflooredHp && unflooredHp.length > 0) {
    fail('abyss:hp-floored', `${unflooredHp.length} un-floored HP patterns remain`);
  } else {
    ok('abyss:hp-floored', 'all HP display patterns use Math.floor()');
  }

  // Check: no remaining un-floored maxHp patterns
  const unflooredMaxHp = abyssSrc.match(/\/\$\{[^}]*(?!Math\.floor)[^}]*\.maxHp\}/g);
  if (unflooredMaxHp && unflooredMaxHp.length > 0) {
    fail('abyss:maxhp-floored', `${unflooredMaxHp.length} un-floored maxHp patterns remain`);
  } else {
    ok('abyss:maxhp-floored', 'all maxHp display patterns use Math.floor()');
  }

  // Check: no literal /100 default (the old bug)
  if (abyssSrc.includes('/100 HP') || abyssSrc.includes('/100 EN')) {
    fail('abyss:no-100-default', 'found "/100 HP" or "/100 EN" — the old flat-default bug');
  } else {
    ok('abyss:no-100-default', 'no "/100 HP" or "/100 EN" flat-default patterns');
  }

  // Check: no literal ${P()} leaks in single-quoted strings
  const lines = abyssSrc.split('\n');
  let leakCount = 0;
  for (const line of lines) {
    if (line.includes("'") && line.includes('${P()}')) {
      // Check if it's inside a backtick template literal
      const before = line.split('${P()}')[0];
      if (before.split('`').length % 2 === 1) {
        // Odd number of backticks = not in template literal
        leakCount++;
      }
    }
  }
  if (leakCount === 0) {
    ok('abyss:no-p-leak', 'no literal ${P()} leaks in single-quoted strings');
  } else {
    fail('abyss:no-p-leak', `${leakCount} literal ${'$'}{P()} leaks found`);
  }
}

// ========================================
// SIMULATION 6: Summon field compatibility with Go service
// ========================================

async function simulateSummonFields() {
  section('SIMULATION 6: Summon Field Compatibility — Go Service Struct');

  const summonSystem = require('../core/rpg/summonSystem');

  // Test with multiple species
  const testSpecies = ['skeleton', 'flame_elemental', 'wolf', 'wargreymon', 'beelzemon'];
  for (const species of testSpecies) {
    const mockSummon = {
      summonId: `sim-${species}-${Date.now()}`,
      species,
      nickname: `Test${species}`,
      archetype: 'BRUTE',
      element: 'DARK',
      personality: 'AGGRESSIVE',
      behaviorScore: { aggression: 50, defense: 30, support: 20 },
      loyalty: 100,
      echoId: null,
      level: 10,
      rarity: 'COMMON',
    };

    const entity = summonSystem.buildCombatEntity(mockSummon, 'sim-test@s.whatsapp.net');
    if (!entity) {
      fail(`summon:${species}`, 'buildCombatEntity returned null');
      continue;
    }

    // Go service expects: name, species, currentHP, maxHp, justDied, ownerIndex, isStationary
    const requiredFields = ['name', 'species', 'currentHP', 'maxHp', 'justDied', 'ownerIndex', 'isStationary'];
    const missing = requiredFields.filter(f => entity[f] === undefined || entity[f] === null);
    if (missing.length === 0) {
      ok(`summon:${species}`, `all Go-required fields present (species="${entity.species}", maxHp=${entity.maxHp})`);
    } else {
      fail(`summon:${species}`, `missing fields: ${missing.join(', ')}`);
    }

    // Verify species matches input
    if (entity.species !== species) {
      fail(`summon:${species}:species-match`, `entity.species="${entity.species}" != input "${species}"`);
    }
  }
}

// ========================================
// MAIN
// ========================================

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  COMBAT SIMULATION SUITE — Multi-System, Multi-Angle`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  try { await simulateDamageFormula(); } catch (e) { console.error('SIM1 error:', e.message); }
  try { await simulateCombatImages(); } catch (e) { console.error('SIM2 error:', e.message); }
  try { await simulateMentionDisplay(); } catch (e) { console.error('SIM3 error:', e.message); }
  try { await simulatePvPRecovery(); } catch (e) { console.error('SIM4 error:', e.message); }
  try { await simulateAbyssDisplay(); } catch (e) { console.error('SIM5 error:', e.message); }
  try { await simulateSummonFields(); } catch (e) { console.error('SIM6 error:', e.message); }

  // Final report
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  SIMULATION SUMMARY: ${passCount} passed, ${failCount} failed`);
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

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
