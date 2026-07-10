// ═══════════════════════════════════════════════════════════════════════════
//  ABYSS SYSTEM (Phase 4 — Endless Dungeon)
// ═══════════════════════════════════════════════════════════════════════════
//
// Procedural endless dungeon. Each floor gets harder. Death = lose 90% of
// run loot. Retreat = keep 100%. Weekly leaderboard resets every Monday.
//
// Floor structure:
//   1-10:   F→A rank enemies, normal bosses every 5th floor
//   11-20:  S rank, mini-bosses every 3rd floor
//   21-49:  SS+ rank, every floor has a boss
//   50+:    SSS rank, every floor is a boss + environmental hazard
//   100:    The Abyssal God (final boss, unique drops)
//
// Entry: free, but only 1 run per 12 hours (anti-farm).
// Score = deepestFloor × 100 + monstersKilled × 5

const AbyssRun = require('../models/AbyssRun');
const AbyssLeaderboard = require('../models/AbyssLeaderboard');
const mongoose = require('mongoose');

// ─── FLOOR TIER DEFINITIONS ───────────────────────────────────────────────
function getFloorTier(floor) {
  if (floor >= 100) return 'ABYSSAL_GOD';
  if (floor >= 50) return 'SSS';
  if (floor >= 21) return 'SS';
  if (floor >= 11) return 'S';
  if (floor >= 7) return 'A';
  if (floor >= 5) return 'B';
  if (floor >= 3) return 'C';
  return 'F';
}

function isBossFloor(floor) {
  if (floor >= 21) return true;        // every floor 21+ is a boss
  if (floor >= 11) return floor % 3 === 0; // mini-boss every 3rd floor
  return floor % 5 === 0;              // boss every 5th floor in 1-10
}

// ─── ENEMY SCALING ────────────────────────────────────────────────────────
// Abyss enemies scale exponentially with floor to keep the challenge real.
// Base stats from the enemy template, multiplied by floor scaling.
function getFloorMultiplier(floor) {
  return 1.0 + (floor - 1) * 0.15 + Math.pow(floor - 1, 1.5) * 0.05;
}

// ─── ENEMY POOLS BY FLOOR TIER ────────────────────────────────────────────
const ABYSS_ENEMY_POOLS = {
  F: ['FLAME', 'DROWNED_ONE', 'STONE_HULK', 'FROST_WISP', 'EMBER_SPAWN'],
  C: ['MUTATED_HOUND', 'CRYSTAL_GOLEM', 'SHADOW_STALKER', 'VENOM_SPIDER'],
  B: ['INFERNO_KNIGHT', 'TIDAL_FURY', 'BOULDER_TITAN', 'GLACIAL_WRAITH'],
  A: ['STORM_CALLER', 'VOID_HARBINGER', 'BLOOD_REAVER', 'ANCIENT_GUARDIAN'],
  S: ['ELDER_CHAOS', 'PRIMORDIAL_CHAOS', 'VOID_CORRUPTED'],
  SS: ['VOID_TITAN', 'MUTATION_PRIME', 'ELEMENTAL_ARCHON'],
  SSS: ['ABYSSAL_GOD', 'ELDER_CHAOS', 'VOID_TITAN'], // SSS mixes all
  ABYSSAL_GOD: ['ABYSSAL_GOD'],
};

const ABYSS_BOSS_POOL = {
  F: 'INFECTED_COLOSSUS',
  C: 'CORRUPTED_GUARDIAN',
  B: 'MUTATION_PRIME',
  A: 'ELEMENTAL_ARCHON',
  S: 'ELDER_CHAOS',
  SS: 'VOID_TITAN',
  SSS: 'ABYSSAL_GOD',
  ABYSSAL_GOD: 'ABYSSAL_GOD',
};

// ─── REWARDS PER FLOOR ────────────────────────────────────────────────────
function getFloorRewards(floor, isBoss) {
  const tier = getFloorTier(floor);
  const tierMult = { F: 1, C: 2, B: 4, A: 8, S: 20, SS: 50, SSS: 150, ABYSSAL_GOD: 1000 };
  const mult = tierMult[tier] || 1;
  const bossMult = isBoss ? 5 : 1;
  return {
    xp: Math.floor(50 * mult * bossMult * getFloorMultiplier(floor)),
    gold: Math.floor(100 * mult * bossMult * getFloorMultiplier(floor)),
  };
}

// ─── RUN COOLDOWN ─────────────────────────────────────────────────────────
const RUN_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours

// ─── START A NEW ABYSS RUN ────────────────────────────────────────────────
async function startRun(userId, playerStats) {
  // Check for existing active run
  const existing = await AbyssRun.findOne({ userId, status: 'active' });
  if (existing) {
    return {
      success: false,
      message: `❌ You already have an active Abyss run on floor ${existing.currentFloor}.\n_Continue with \`.g abyss status\` or retreat with \`.g abyss retreat\`._`,
    };
  }

  // Check cooldown — look at most recent completed/failed run
  const lastRun = await AbyssRun.findOne({ userId, status: { $in: ['completed', 'failed'] } }).sort({ updatedAt: -1 });
  if (lastRun) {
    const elapsed = Date.now() - new Date(lastRun.updatedAt).getTime();
    if (elapsed < RUN_COOLDOWN_MS) {
      const remaining = Math.ceil((RUN_COOLDOWN_MS - elapsed) / 3600000);
      return {
        success: false,
        message: `❌ Abyss cooldown. Try again in ${remaining}h.\n_The Abyss needs time to reform between challenges._`,
      };
    }
  }

  // Create new run
  const run = new AbyssRun({
    userId,
    currentFloor: 1,
    lootAccumulator: { xp: 0, gold: 0, runes: [], items: [] },
    playerSnapshot: {
      hp: playerStats.hp,
      maxHp: playerStats.maxHp,
      energy: playerStats.energy,
      maxEnergy: playerStats.maxEnergy,
    },
    currentHp: playerStats.hp,
    currentEnergy: playerStats.energy,
    status: 'active',
  });

  // Generate first floor enemy
  const enemy = generateFloorEnemy(1);
  run.currentEnemy = enemy;
  await run.save();

  return {
    success: true,
    run,
    message: `🕳️ *ABYSS RUN STARTED*\n\nYou descend into the Abyss...\n\n_Floor 1 — ${enemy.name}_\n_HP: ${enemy.hp}/${enemy.maxHp}_\n\n_Attack with \`.g abyss attack\`_\n_Retreat with \`.g abyss retreat\`_`,
  };
}

// ─── GENERATE FLOOR ENEMY ─────────────────────────────────────────────────
function generateFloorEnemy(floor) {
  const tier = getFloorTier(floor);
  const isBoss = isBossFloor(floor);
  const mult = getFloorMultiplier(floor);

  let name, baseStats;
  if (isBoss) {
    const bossId = ABYSS_BOSS_POOL[tier] || 'INFECTED_COLOSSUS';
    name = bossId.replace(/_/g, ' ');
    // Boss base stats — scaled hard
    baseStats = {
      hp: 2000 * mult,
      maxHp: 2000 * mult,
      atk: Math.floor(80 * mult),
      def: Math.floor(30 * mult),
      spd: Math.floor(20 * mult),
    };
  } else {
    const pool = ABYSS_ENEMY_POOLS[tier] || ABYSS_ENEMY_POOLS.F;
    const enemyId = pool[Math.floor(Math.random() * pool.length)];
    name = enemyId.replace(/_/g, ' ');
    baseStats = {
      hp: Math.floor(500 * mult),
      maxHp: Math.floor(500 * mult),
      atk: Math.floor(40 * mult),
      def: Math.floor(15 * mult),
      spd: Math.floor(15 * mult),
    };
  }

  return {
    id: `abyss_${tier}_${floor}_${Date.now()}`,
    name: isBoss ? `⚡ ${name}` : name,
    hp: baseStats.hp,
    maxHp: baseStats.maxHp,
    atk: baseStats.atk,
    def: baseStats.def,
    spd: baseStats.spd,
    isBoss,
    level: Math.max(1, floor),
  };
}

// ─── PROCESS ATTACK ───────────────────────────────────────────────────────
// Player attacks the current floor's enemy. Returns result with messages.
// Damage is calculated from the player's stats (passed in).
async function processAttack(userId, playerDamage, playerStats) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) {
    return { success: false, message: '❌ No active Abyss run. Start one with `.g abyss enter`.' };
  }

  run.lastActionAt = new Date();
  const enemy = run.currentEnemy;

  // Player attacks first
  let attackMsg = `⚔️ You attack ${enemy.name} for ${playerDamage} damage!\n`;
  enemy.hp = Math.max(0, enemy.hp - playerDamage);

  // Check if enemy died
  if (enemy.hp <= 0) {
    attackMsg += `💀 ${enemy.name} defeated!\n`;
    run.monstersKilled += 1;
    if (enemy.isBoss) run.bossesKilled += 1;

    // Award loot
    const rewards = getFloorRewards(run.currentFloor, enemy.isBoss);
    run.lootAccumulator.xp += rewards.xp;
    run.lootAccumulator.gold += rewards.gold;
    attackMsg += `🎁 +${rewards.xp} XP, +${rewards.gold} Zeni\n`;

    // Rune drop chance on boss floors 21+
    if (enemy.isBoss && run.currentFloor >= 21) {
      try {
        const runeSystem = require('./runeSystem');
        const dropChance = run.currentFloor >= 50 ? 0.30 : 0.15;
        const drop = runeSystem.rollRuneDrop(dropChance);
        if (drop) {
          const runeResult = await runeSystem.awardRune(userId, drop.type, drop.tier, `abyss_floor_${run.currentFloor}`);
          if (runeResult.success) {
            run.lootAccumulator.runes.push(runeResult.rune.runeId);
            attackMsg += runeResult.message + '\n';
          }
        }
      } catch (e) {
        console.error('[Abyss] Rune drop failed:', e.message);
      }
    }

    // Advance to next floor
    run.currentFloor += 1;
    const nextEnemy = generateFloorEnemy(run.currentFloor);
    run.currentEnemy = nextEnemy;
    // Restore some energy between floors
    run.currentEnergy = Math.min(run.playerSnapshot.maxEnergy, run.currentEnergy + 20);
    attackMsg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEnemy.name}\nHP: ${nextEnemy.hp}/${nextEnemy.maxHp}\n_Attack with \`.g abyss attack\`_`;
    await run.save();
    return { success: true, message: attackMsg, run, enemyDefeated: true };
  }

  // Enemy survives — counterattack
  const enemyDamage = Math.max(1, Math.floor(enemy.atk * (1 - (playerStats.def || 0) / 200)));
  run.currentHp = Math.max(0, run.currentHp - enemyDamage);
  attackMsg += `💥 ${enemy.name} counterattacks for ${enemyDamage} damage!\n`;
  attackMsg += `❤️ Your HP: ${run.currentHp}/${run.playerSnapshot.maxHp}\n`;
  attackMsg += `👹 ${enemy.name} HP: ${enemy.hp}/${enemy.maxHp}\n`;

  // Check if player died
  if (run.currentHp <= 0) {
    return await processDeath(userId, run, attackMsg);
  }

  await run.save();
  return { success: true, message: attackMsg, run, enemyDefeated: false };
}

// ─── PROCESS DEATH ────────────────────────────────────────────────────────
// Player died — lose 90% of loot, keep 10%, run ends as 'failed'
async function processDeath(userId, run, deathMsg) {
  const keptXp = Math.floor(run.lootAccumulator.xp * 0.10);
  const keptGold = Math.floor(run.lootAccumulator.gold * 0.10);
  const score = run.currentFloor * 100 + run.monstersKilled * 5;

  deathMsg += `\n💀 *YOU DIED IN THE ABYSS*\n\n`;
  deathMsg += `🕳️ Reached Floor: ${run.currentFloor}\n`;
  deathMsg += `☠️ Monsters Slain: ${run.monstersKilled}\n`;
  deathMsg += `👑 Bosses Slain: ${run.bossesKilled}\n`;
  deathMsg += `📊 Score: ${score}\n\n`;
  deathMsg += `💀 Death Penalty: Lost 90% of run loot\n`;
  deathMsg += `🎁 Kept: ${keptXp} XP, ${keptGold} Zeni\n`;

  // Award the kept loot
  try {
    const economy = require('./economy');
    const progression = require('./progression');
    if (keptXp > 0) progression.awardXP(userId, keptXp);
    if (keptGold > 0) economy.addMoney(userId, keptGold, 'Abyss run (10% death recovery)');
  } catch (e) {
    console.error('[Abyss] Failed to award death recovery:', e.message);
  }

  // Update run record
  run.status = 'failed';
  run.finalScore = score;
  run.finalFloor = run.currentFloor;
  run.currentEnemy = null;
  await run.save();

  // Add to leaderboard
  await addToLeaderboard(userId, run.currentFloor, run.monstersKilled, run.bossesKilled, score, 'death');

  // Award guild XP + war points (reduced on death)
  try {
    const guildPerks = require('./guildPerks');
    guildPerks.awardGuildXp(userId, Math.floor(score / 100), `Abyss run (death, F${run.currentFloor})`);
    guildPerks.awardWarPoints(userId, Math.floor(score / 50), 'abyss');
  } catch (e) {}

  return { success: true, message: deathMsg, run, died: true };
}

// ─── RETREAT ──────────────────────────────────────────────────────────────
// Player retreats — keep 100% of loot, run ends as 'completed'
async function retreat(userId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) {
    return { success: false, message: '❌ No active Abyss run to retreat from.' };
  }

  const keptXp = run.lootAccumulator.xp;
  const keptGold = run.lootAccumulator.gold;
  const score = run.currentFloor * 100 + run.monstersKilled * 5;

  let msg = `🏃 *ABYSS RETREAT*\n\n`;
  msg += `You extract safely from the Abyss.\n\n`;
  msg += `🕳️ Reached Floor: ${run.currentFloor}\n`;
  msg += `☠️ Monsters Slain: ${run.monstersKilled}\n`;
  msg += `👑 Bosses Slain: ${run.bossesKilled}\n`;
  msg += `📊 Score: ${score}\n\n`;
  msg += `🎁 Rewards Kept (100%):\n`;
  msg += `• ${keptXp.toLocaleString()} XP\n`;
  msg += `• ${keptGold.toLocaleString()} Zeni\n`;
  if (run.lootAccumulator.runes.length > 0) {
    msg += `• ${run.lootAccumulator.runes.length} runes\n`;
  }

  // Award full loot
  try {
    const economy = require('./economy');
    const progression = require('./progression');
    if (keptXp > 0) progression.awardXP(userId, keptXp);
    if (keptGold > 0) economy.addMoney(userId, keptGold, 'Abyss run (retreat)');
  } catch (e) {
    console.error('[Abyss] Failed to award retreat loot:', e.message);
  }

  // Update run record
  run.status = 'completed';
  run.finalScore = score;
  run.finalFloor = run.currentFloor;
  run.currentEnemy = null;
  await run.save();

  // Add to leaderboard
  await addToLeaderboard(userId, run.currentFloor, run.monstersKilled, run.bossesKilled, score, 'retreat');

  // Award guild XP + war points (full on retreat)
  try {
    const guildPerks = require('./guildPerks');
    guildPerks.awardGuildXp(userId, Math.floor(score / 50), `Abyss run (retreat, F${run.currentFloor})`);
    guildPerks.awardWarPoints(userId, Math.floor(score / 25), 'abyss');
  } catch (e) {}

  return { success: true, message: msg, run };
}

// ─── ADD TO LEADERBOARD ───────────────────────────────────────────────────
async function addToLeaderboard(userId, deepestFloor, monstersKilled, bossesKilled, score, result) {
  try {
    // Get current week key
    const guildPerks = require('./guildPerks');
    const weekKey = guildPerks.getWeekKey(new Date());
    const entry = new AbyssLeaderboard({
      userId,
      deepestFloor,
      monstersKilled,
      bossesKilled,
      score,
      result,
      weekKey,
      rewardsClaimed: false,
    });
    await entry.save();
  } catch (e) {
    console.error('[Abyss] Failed to add leaderboard entry:', e.message);
  }
}

// ─── GET RUN STATUS ───────────────────────────────────────────────────────
async function getRunStatus(userId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) return null;
  return run;
}

// ─── GET WEEKLY LEADERBOARD ───────────────────────────────────────────────
async function getWeeklyLeaderboard(limit = 20) {
  try {
    const guildPerks = require('./guildPerks');
    const weekKey = guildPerks.getWeekKey(new Date());
    return await AbyssLeaderboard.find({ weekKey })
      .sort({ score: -1 })
      .limit(limit);
  } catch (e) {
    return [];
  }
}

// ─── GET PLAYER'S BEST RUN ────────────────────────────────────────────────
async function getPlayerBest(userId) {
  return await AbyssLeaderboard.findOne({ userId }).sort({ score: -1 });
}

// ─── RESET WEEKLY LEADERBOARD ─────────────────────────────────────────────
// Called by the weekly scheduler. Doesn't delete old entries — just marks
// them as previous week. New entries will use the new week key automatically.
async function resetWeeklyLeaderboard() {
  console.log('[Abyss] Weekly leaderboard reset (new week started).');
  // No deletion needed — entries are scoped by weekKey.
  // Future enhancement: archive old week entries to a separate collection.
  return { success: true };
}

module.exports = {
  startRun,
  processAttack,
  retreat,
  processDeath,
  getRunStatus,
  getWeeklyLeaderboard,
  getPlayerBest,
  resetWeeklyLeaderboard,
  getFloorTier,
  isBossFloor,
  getFloorMultiplier,
  getFloorRewards,
  generateFloorEnemy,
  RUN_COOLDOWN_MS,
};
