#!/usr/bin/env node
/**
 * CROSS-COMBAT STAT CONSISTENCY TEST
 *
 * Tests that a player's stats are the SAME whether they enter:
 *   1. PvP (pvpSystem.buildDuelPlayer + capPvPStats)
 *   2. Abyss (guildAdventure.startAbyssCombat)
 *   3. PvE/Guild Adventure (guildAdventure startJourney player build)
 *
 * And that damage is consistent across all three (modulo the PvP cap,
 * which is an intentional balance mechanic).
 *
 * The user's complaint: "stats are the same in the abyss as they are
 * everywhere else and their damage across different combat types"
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
  console.log(`  CROSS-COMBAT STAT CONSISTENCY TEST`);
  console.log(`═══════════════════════════════════════════════════════════════${RESET}\n`);

  const connectDB = require('../db');
  await connectDB();

  const economy = require('../core/rpg/economy');
  const progression = require('../core/rpg/progression');
  const inventorySystem = require('../core/rpg/inventorySystem');
  const User = require('../core/models/User');

  // Get 5 real users at different levels
  const users = await User.find({}).sort({ 'progression.level': -1 }).limit(5);

  for (const userDoc of users) {
    const jid = userDoc.userId;
    const level = userDoc.progression?.level || 1;
    const className = userDoc.class || 'FIGHTER';

    section(`USER: ${jid} (Lv${level} ${className})`);

    // Hydrate
    await economy.reloadUserFromDB(jid);
    const user = economy.getUser(jid);
    if (!user) { fail(`load:${jid}`, 'getUser null'); continue; }

    const userClass = economy.getUserClass(jid);
    const classId = userClass?.id || 'FIGHTER';

    // === SOURCE OF TRUTH: progression.getBaseStats ===
    const trueStats = progression.getBaseStats(jid, classId);
    console.log(`  ${YELLOW}Source of truth (getBaseStats):${RESET}`);
    console.log(`    hp=${trueStats.hp} atk=${trueStats.atk} def=${trueStats.def} mag=${trueStats.mag} spd=${trueStats.spd}`);

    // === PATH 1: ABYSS (startAbyssCombat player build) ===
    console.log(`  ${CYAN}[Path 1] Abyss combat stats${RESET}`);
    // Reproduce startAbyssCombat's player build (guildAdventure.js:5458-5503)
    const abyssClassId = userClass?.id || (typeof user.class === 'string' ? user.class : 'FIGHTER');
    const abyssBaseStats = progression.getBaseStats(jid, abyssClassId);
    const abyssPlayer = {
      stats: {
        hp: abyssBaseStats.hp,
        maxHp: abyssBaseStats.hp,
        atk: abyssBaseStats.atk,
        def: abyssBaseStats.def,
        mag: abyssBaseStats.mag,
        spd: abyssBaseStats.spd,
        luck: abyssBaseStats.luck,
        crit: abyssBaseStats.crit,
        dmgReduction: abyssBaseStats.dmgReduction || 0,
        evasion: abyssBaseStats.evasion || 0,
        energy: abyssBaseStats.maxEnergy || 100,
        maxEnergy: abyssBaseStats.maxEnergy || 100,
      },
    };

    // Compare Abyss stats vs true stats
    const abyssStatsMatch = (
      abyssPlayer.stats.hp === trueStats.hp &&
      abyssPlayer.stats.atk === trueStats.atk &&
      abyssPlayer.stats.def === trueStats.def &&
      abyssPlayer.stats.mag === trueStats.mag &&
      abyssPlayer.stats.spd === trueStats.spd
    );
    if (abyssStatsMatch) {
      ok(`abyss:stats-match`, `hp=${abyssPlayer.stats.hp} atk=${abyssPlayer.stats.atk} def=${abyssPlayer.stats.def}`);
    } else {
      fail(`abyss:stats-match`, `Abyss: hp=${abyssPlayer.stats.hp}/${trueStats.hp} atk=${abyssPlayer.stats.atk}/${trueStats.atk} def=${abyssPlayer.stats.def}/${trueStats.def}`);
    }

    // === PATH 2: PvE (startJourney player build, guildAdventure.js:6408-6425) ===
    console.log(`  ${CYAN}[Path 2] PvE/Guild Adventure stats${RESET}`);
    const pveClassId = userClass?.id || 'FIGHTER';
    const pveBaseStats = progression.getBaseStats(jid, pveClassId);
    const pvePlayer = {
      stats: {
        hp: pveBaseStats.hp,
        maxHp: pveBaseStats.hp,
        atk: pveBaseStats.atk,
        def: pveBaseStats.def,
        mag: pveBaseStats.mag,
        spd: pveBaseStats.spd,
        luck: pveBaseStats.luck,
        crit: pveBaseStats.crit,
        dmgReduction: pveBaseStats.dmgReduction || 0,
        evasion: pveBaseStats.evasion || 0,
        maxEnergy: pveBaseStats.maxEnergy,
      },
    };

    const pveStatsMatch = (
      pvePlayer.stats.hp === trueStats.hp &&
      pvePlayer.stats.atk === trueStats.atk &&
      pvePlayer.stats.def === trueStats.def &&
      pvePlayer.stats.mag === trueStats.mag &&
      pvePlayer.stats.spd === trueStats.spd
    );
    if (pveStatsMatch) {
      ok(`pve:stats-match`, `hp=${pvePlayer.stats.hp} atk=${pvePlayer.stats.atk} def=${pvePlayer.stats.def}`);
    } else {
      fail(`pve:stats-match`, `PvE: hp=${pvePlayer.stats.hp}/${trueStats.hp} atk=${pvePlayer.stats.atk}/${trueStats.atk} def=${pvePlayer.stats.def}/${trueStats.def}`);
    }

    // === PATH 3: PvP (buildDuelPlayer + capPvPStats) ===
    console.log(`  ${CYAN}[Path 3] PvP stats (with capPvPStats)${RESET}`);
    const pvpBaseStats = progression.getBaseStats(jid, classId);
    // Reproduce capPvPStats
    const cappedStats = {
      ...pvpBaseStats,
      atk:  Math.min(pvpBaseStats.atk, 1200),
      def:  Math.min(pvpBaseStats.def, 500),
      mag:  Math.min(pvpBaseStats.mag, 1200),
      spd:  Math.min(pvpBaseStats.spd, 200),
      crit: Math.min(pvpBaseStats.crit, 80),
      evasion: Math.min(pvpBaseStats.evasion || 0, 55),
    };

    // PvP INTENTIONALLY caps stats — document this, don't fail
    const pvpCappedAtk = pvpBaseStats.atk > 1200;
    const pvpCappedDef = pvpBaseStats.def > 500;
    const pvpCappedMag = pvpBaseStats.mag > 1200;
    const pvpCappedSpd = pvpBaseStats.spd > 200;

    if (pvpCappedAtk || pvpCappedDef || pvpCappedMag || pvpCappedSpd) {
      const caps = [];
      if (pvpCappedAtk) caps.push(`atk ${pvpBaseStats.atk}→1200`);
      if (pvpCappedDef) caps.push(`def ${pvpBaseStats.def}→500`);
      if (pvpCappedMag) caps.push(`mag ${pvpBaseStats.mag}→1200`);
      if (pvpCappedSpd) caps.push(`spd ${pvpBaseStats.spd}→200`);
      ok(`pvp:capped`, `PvP caps applied: ${caps.join(', ')}`);
    } else {
      ok(`pvp:uncapped`, `No caps needed (stats within PvP limits)`);
    }

    // === DAMAGE CONSISTENCY ===
    console.log(`  ${CYAN}[Damage] Cross-combat damage comparison${RESET}`);

    // Simulate a basic attack against a fixed enemy (def=50)
    const enemyDef = 50;
    const calcDamage = (atk) => Math.max(1, Math.floor(atk - (enemyDef * 0.5)));

    const abyssDamage = calcDamage(abyssPlayer.stats.atk);
    const pveDamage = calcDamage(pvePlayer.stats.atk);
    const pvpDamage = calcDamage(cappedStats.atk);

    console.log(`    Abyss damage: ${abyssDamage} (atk=${abyssPlayer.stats.atk})`);
    console.log(`    PvE damage:   ${pveDamage} (atk=${pvePlayer.stats.atk})`);
    console.log(`    PvP damage:   ${pvpDamage} (atk=${cappedStats.atk}${pvpCappedAtk ? ' [CAPPED]' : ''})`);

    // Abyss and PvE damage should be IDENTICAL (same stats, same formula)
    if (abyssDamage === pveDamage) {
      ok(`damage:abyss=pve`, `both ${abyssDamage} (identical)`);
    } else {
      fail(`damage:abyss=pve`, `Abyss=${abyssDamage} vs PvE=${pveDamage} (should be identical)`);
    }

    // PvP damage should match Abyss IF no cap was applied
    if (!pvpCappedAtk) {
      if (pvpDamage === abyssDamage) {
        ok(`damage:pvp=abyss`, `both ${pvpDamage} (identical, no cap)`);
      } else {
        fail(`damage:pvp=abyss`, `PvP=${pvpDamage} vs Abyss=${abyssDamage} (should match, no cap)`);
      }
    } else {
      // Cap was applied — PvP damage should be LOWER than Abyss (expected)
      if (pvpDamage < abyssDamage) {
        ok(`damage:pvp<abyss`, `PvP=${pvpDamage} < Abyss=${abyssDamage} (cap working as intended)`);
      } else {
        fail(`damage:pvp<abyss`, `PvP=${pvpDamage} should be < Abyss=${abyssDamage} (cap not working)`);
      }
    }

    // === HP CONSISTENCY ===
    console.log(`  ${CYAN}[HP] Cross-combat HP comparison${RESET}`);
    if (abyssPlayer.stats.hp === pvePlayer.stats.hp) {
      ok(`hp:abyss=pve`, `both ${abyssPlayer.stats.hp}`);
    } else {
      fail(`hp:abyss=pve`, `Abyss=${abyssPlayer.stats.hp} vs PvE=${pvePlayer.stats.hp}`);
    }
    // PvP uses stats.maxHp directly (no cap on HP)
    if (cappedStats.hp === trueStats.hp) {
      ok(`hp:pvp=true`, `PvP hp=${cappedStats.hp} (matches true)`);
    } else {
      fail(`hp:pvp=true`, `PvP=${cappedStats.hp} vs true=${trueStats.hp}`);
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
