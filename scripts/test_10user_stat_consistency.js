#!/usr/bin/env node
/**
 * 10-USER STAT CONSISTENCY TEST
 *
 * Takes 10 real user accounts and runs them through every RPG system,
 * verifying stats are consistent across:
 *   - economy.getUser (in-memory cache)
 *   - MongoDB User document
 *   - progression.getBaseStats (computed stats with equipment)
 *   - inventorySystem.getEquipmentStats (equipment bonuses)
 *   - economy.getUserClass (class resolution)
 *
 * Also tests Abyss combat damage with each user's real stats.
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

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  10-USER STAT CONSISTENCY TEST SUITE`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  const connectDB = require('../db');
  await connectDB();

  const economy = require('../core/rpg/economy');
  const progression = require('../core/rpg/progression');
  const inventorySystem = require('../core/rpg/inventorySystem');
  const User = require('../core/models/User');

  // Get 10 real users with diverse levels
  const users = await User.find({}).sort({ 'progression.level': -1 }).limit(10);
  if (users.length < 10) {
    console.log(`${YELLOW}Only ${users.length} users found (wanted 10)${RESET}`);
  }

  console.log(`Testing ${users.length} users:`);
  users.forEach((u, i) => {
    console.log(`  ${i+1}. ${u.userId} (Lv${u.progression?.level || 0} ${u.class || 'FIGHTER'})`);
  });

  for (let idx = 0; idx < users.length; idx++) {
    const userDoc = users[idx];
    const jid = userDoc.userId;
    const userNum = idx + 1;

    section(`USER ${userNum}: ${jid} (Lv${userDoc.progression?.level || 0} ${userDoc.class || 'FIGHTER'})`);

    // Hydrate user into economy cache
    await economy.reloadUserFromDB(jid);
    const user = economy.getUser(jid);

    if (!user) {
      fail(`load:${jid}`, 'economy.getUser returned null after reloadUserFromDB');
      continue;
    }

    // === TEST 1: DB vs Economy Cache Consistency ===
    console.log(`  ${CYAN}[Test 1] DB vs Economy Cache${RESET}`);
    if (user.wallet === userDoc.wallet) {
      ok(`wallet:${userNum}`, `DB=${userDoc.wallet} | cache=${user.wallet}`);
    } else {
      fail(`wallet:${userNum}`, `DB=${userDoc.wallet} | cache=${user.wallet} (mismatch)`);
    }
    if (user.adventurerRank === userDoc.adventurerRank) {
      ok(`rank:${userNum}`, `rank=${user.adventurerRank}`);
    } else {
      fail(`rank:${userNum}`, `DB=${userDoc.adventurerRank} | cache=${user.adventurerRank}`);
    }
    if ((user.progression?.level || 0) === (userDoc.progression?.level || 0)) {
      ok(`level:${userNum}`, `level=${user.progression?.level || 0}`);
    } else {
      fail(`level:${userNum}`, `DB=${userDoc.progression?.level} | cache=${user.progression?.level}`);
    }

    // === TEST 2: Class Resolution ===
    console.log(`  ${CYAN}[Test 2] Class Resolution${RESET}`);
    const userClass = economy.getUserClass(jid);
    if (userClass && userClass.id) {
      ok(`class:${userNum}`, `class=${userClass.name} (id=${userClass.id})`);
    } else {
      fail(`class:${userNum}`, `getUserClass returned null or missing id: ${JSON.stringify(userClass)}`);
    }

    // === TEST 3: Base Stats Computation ===
    console.log(`  ${CYAN}[Test 3] Base Stats (with equipment + passives)${RESET}`);
    const classId = userClass?.id || (typeof user.class === 'string' ? user.class : 'FIGHTER');
    const baseStats = progression.getBaseStats(jid, classId);

    if (!baseStats) {
      fail(`baseStats:${userNum}`, 'getBaseStats returned null');
      continue;
    }

    const requiredStats = ['hp', 'atk', 'def', 'mag', 'spd', 'luck', 'crit'];
    let statsOk = true;
    for (const stat of requiredStats) {
      if (typeof baseStats[stat] !== 'number' || isNaN(baseStats[stat])) {
        fail(`stat:${userNum}:${stat}`, `${stat}=${baseStats[stat]} (not a number)`);
        statsOk = false;
      }
    }
    if (statsOk) {
      ok(`baseStats:${userNum}`, `hp=${baseStats.hp} atk=${baseStats.atk} def=${baseStats.def} mag=${baseStats.mag}`);
    }

    // === TEST 4: HP Scales with Level (not flat 100) ===
    console.log(`  ${CYAN}[Test 4] HP Scales with Level${RESET}`);
    const level = user.progression?.level || 1;
    if (baseStats.hp === 100 && level > 1) {
      fail(`hp-scales:${userNum}`, `HP is exactly 100 at level ${level} — flat default bug`);
    } else if (baseStats.hp > 100 && level > 5) {
      ok(`hp-scales:${userNum}`, `HP=${baseStats.hp} at level ${level} (scales correctly)`);
    } else if (level <= 5) {
      ok(`hp-scales:${userNum}`, `HP=${baseStats.hp} at level ${level} (low level, OK)`);
    } else {
      fail(`hp-scales:${userNum}`, `HP=${baseStats.hp} at level ${level} (unexpected)`);
    }

    // === TEST 5: Equipment Stats Load ===
    console.log(`  ${CYAN}[Test 5] Equipment Stats${RESET}`);
    try {
      const equipStats = inventorySystem.getEquipmentStats(jid);
      if (equipStats && typeof equipStats === 'object') {
        const equipBonusTotal = Object.values(equipStats).reduce((a, b) => a + (Number(b) || 0), 0);
        ok(`equipStats:${userNum}`, `equipment bonus total=${equipBonusTotal} (${Object.keys(equipStats).length} stats)`);
      } else {
        fail(`equipStats:${userNum}`, `getEquipmentStats returned: ${typeof equipStats}`);
      }
    } catch (e) {
      fail(`equipStats:${userNum}`, `threw: ${e.message}`);
    }

    // === TEST 6: Damage Formula Simulation ===
    console.log(`  ${CYAN}[Test 6] Damage Formula${RESET}`);
    // Simulate: damage = basePower + (atk * scaling) - enemyDef
    // The real calculateDamage uses: damage = power; then damage -= def * 0.5; etc.
    // For a basic attack: power = player.stats.atk
    const power = baseStats.atk;
    const enemyDef = 50; // typical low-tier enemy
    const expectedRawDamage = power - (enemyDef * 0.5);
    const expectedDamage = Math.max(1, Math.floor(expectedRawDamage));

    if (level >= 50 && expectedDamage < 100) {
      fail(`damage:${userNum}`, `level ${level}: expected damage=${expectedDamage} (too low for high level)`);
    } else if (level >= 50) {
      ok(`damage:${userNum}`, `level ${level}: expected damage=${expectedDamage} (atk=${power}, enemyDef=${enemyDef})`);
    } else {
      ok(`damage:${userNum}`, `level ${level}: expected damage=${expectedDamage}`);
    }

    // === TEST 7: Nickname Resolution ===
    console.log(`  ${CYAN}[Test 7] Nickname Resolution${RESET}`);
    const displayName = economy.getDisplayName(jid);
    const isLid = /^\d{15,20}$/.test(displayName);
    if (isLid) {
      fail(`nickname:${userNum}`, `display="${displayName}" looks like LID number`);
    } else if (user.nickname && displayName === user.nickname) {
      ok(`nickname:${userNum}`, `display="${displayName}" (matches nickname)`);
    } else {
      ok(`nickname:${userNum}`, `display="${displayName}"`);
    }

    // === TEST 8: Inventory Load ===
    console.log(`  ${CYAN}[Test 8] Inventory Load${RESET}`);
    try {
      const inv = inventorySystem.getInventory(jid);
      if (inv && typeof inv === 'object') {
        const itemCount = inv.items ? inv.items.size || Object.keys(inv.items).length : 0;
        ok(`inventory:${userNum}`, `inventory loaded (${itemCount} items, ${inv.inventorySlots || 20} slots)`);
      } else {
        fail(`inventory:${userNum}`, `getInventory returned: ${typeof inv}`);
      }
    } catch (e) {
      fail(`inventory:${userNum}`, `threw: ${e.message}`);
    }

    // === TEST 9: Persistent HP ===
    console.log(`  ${CYAN}[Test 9] Persistent HP${RESET}`);
    try {
      // getPersistentHP requires maxHP param to initialize/validate
      const persistentHP = economy.getPersistentHP(jid, baseStats.hp);
      if (typeof persistentHP === 'number' && persistentHP >= 0) {
        ok(`persistentHP:${userNum}`, `persistentHP=${persistentHP} / maxHp=${baseStats.hp}`);
      } else {
        fail(`persistentHP:${userNum}`, `getPersistentHP returned: ${persistentHP}`);
      }
    } catch (e) {
      fail(`persistentHP:${userNum}`, `threw: ${e.message}`);
    }

    // === TEST 10: Stat Points ===
    console.log(`  ${CYAN}[Test 10] Stat Points${RESET}`);
    const statPoints = user.progression?.statPoints || 0;
    if (typeof statPoints === 'number' && statPoints >= 0) {
      ok(`statPoints:${userNum}`, `statPoints=${statPoints}`);
    } else {
      fail(`statPoints:${userNum}`, `statPoints=${statPoints} (invalid)`);
    }
  }

  // === ABBYSS DAMAGE SIMULATION ===
  section('ABYSS DAMAGE SIMULATION — 3 Users with Real Stats');

  // Pick 3 users at different levels
  const testUsers = [users[0], users[Math.floor(users.length / 2)], users[users.length - 1]].filter(Boolean);

  for (const userDoc of testUsers) {
    const jid = userDoc.userId;
    const level = userDoc.progression?.level || 1;
    const className = userDoc.class || 'FIGHTER';

    await economy.reloadUserFromDB(jid);
    const user = economy.getUser(jid);
    if (!user) continue;

    const userClass = economy.getUserClass(jid);
    const classId = userClass?.id || 'FIGHTER';
    const baseStats = progression.getBaseStats(jid, classId);

    // Simulate Abyss enemy at floor matching user level
    const floor = Math.floor(level / 10) * 10 || 1;
    const enemyHp = 500 + (floor * 100);
    const enemyAtk = 30 + (floor * 5);
    const enemyDef = 20 + (floor * 3);

    // Player damage (basic attack): power = atk, then def mitigation
    const playerPower = baseStats.atk;
    const playerDamageAfterDef = Math.max(1, Math.floor(playerPower - (enemyDef * 0.5)));

    // Enemy damage to player: power = enemyAtk, then player def mitigation
    const enemyPower = enemyAtk;
    const enemyDamageAfterDef = Math.max(1, Math.floor(enemyPower - (baseStats.def * 0.5)));

    console.log(`\n  ${YELLOW}User: ${jid}${RESET}`);
    console.log(`  Level ${level} ${className} | Floor ${floor}`);
    console.log(`  Player: HP=${baseStats.hp} ATK=${baseStats.atk} DEF=${baseStats.def}`);
    console.log(`  Enemy:  HP=${enemyHp} ATK=${enemyAtk} DEF=${enemyDef}`);
    console.log(`  Player damage per hit: ~${playerDamageAfterDef} (kills in ${Math.ceil(enemyHp / playerDamageAfterDef)} hits)`);
    console.log(`  Enemy damage per hit:  ~${enemyDamageAfterDef} (kills in ${Math.ceil(baseStats.hp / enemyDamageAfterDef)} hits)`);

    // Verify damage scales with level
    if (level >= 50 && playerDamageAfterDef < 100) {
      fail(`abyss-damage:${jid}`, `level ${level}: player damage=${playerDamageAfterDef} (too low)`);
    } else if (level >= 50) {
      ok(`abyss-damage:${jid}`, `level ${level}: player damage=${playerDamageAfterDef} (scales correctly)`);
    } else {
      ok(`abyss-damage:${jid}`, `level ${level}: player damage=${playerDamageAfterDef}`);
    }

    // Verify player can actually kill the enemy (not stuck)
    const hitsToKill = Math.ceil(enemyHp / playerDamageAfterDef);
    if (hitsToKill > 100) {
      fail(`abyss-killable:${jid}`, `needs ${hitsToKill} hits to kill enemy (too many — damage too low)`);
    } else {
      ok(`abyss-killable:${jid}`, `needs ${hitsToKill} hits to kill enemy (reasonable)`);
    }
  }

  // === FINAL REPORT ===
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${passCount} passed, ${failCount} failed`);
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
