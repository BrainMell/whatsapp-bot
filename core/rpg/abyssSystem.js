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
  if (floor >= 200) return 'GOD';
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
  SSS: ['ABYSSAL_GOD', 'ELDER_CHAOS', 'VOID_TITAN'],
  ABYSSAL_GOD: ['ABYSSAL_GOD'],
  GOD: ['ABYSSAL_GOD', 'VOID_TITAN', 'ELEMENTAL_ARCHON'],
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
  GOD: 'ABYSSAL_GOD',
};

// ─── REWARDS PER FLOOR ────────────────────────────────────────────────────
function getFloorRewards(floor, isBoss) {
  const tier = getFloorTier(floor);
  const tierMult = { F: 1, C: 2, B: 4, A: 8, S: 20, SS: 50, SSS: 150, ABYSSAL_GOD: 1000, GOD: 5000 };
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
  // 💡 AUTO-RETREAT: if the player has an existing active run that's been
  // inactive for more than 30 minutes, auto-retreat it so they can start
  // a new one. Previously, stale runs would block new entries indefinitely
  // — the player had to manually run .g abyss retreat first.
  const ABYSS_STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const existing = await AbyssRun.findOne({ userId, status: 'active' });
  if (existing) {
    const lastActivity = new Date(existing.updatedAt).getTime();
    const age = Date.now() - lastActivity;
    if (age > ABYSS_STALE_TIMEOUT_MS) {
      // Auto-retreat the stale run
      existing.status = 'completed';
      existing.completedAt = new Date();
      await existing.save();
      console.log(`[Abyss] Auto-retreated stale run for ${userId} (age: ${Math.floor(age / 60000)}min)`);
    } else {
      return {
        success: false,
        message: `❌ You already have an active Abyss run on floor ${existing.currentFloor}.\n_Continue with \`.g abyss status\` or retreat with \`.g abyss retreat\`._`,
      };
    }
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

  // Generate first floor encounter (may be combat, treasure, or event)
  const encounter = generateFloorEncounter(1);
  if (encounter.type === 'combat') {
    run.currentEnemy = encounter.enemy;
    run.currentEncounterType = 'combat';
  } else {
    run.currentEnemy = null;
    run.currentEncounterType = encounter.type;
    run.currentEncounterData = encounter.treasure || encounter.event;
  }
  await run.save();

  let startMsg = `🕳️ *ABYSS RUN STARTED*\n\nYou descend into the Abyss...\n\n`;
  if (encounter.type === 'combat') {
    startMsg += `⚔️ *Floor 1 — ${encounter.enemy.name}*\n_HP: ${encounter.enemy.hp}/${encounter.enemy.maxHp}_\n\n_Attack with \`.g abyss attack\`_\n_Retreat with \`.g abyss retreat\`_`;
  } else if (encounter.type === 'treasure') {
    startMsg += `${encounter.treasure.icon} *Floor 1 — ${encounter.treasure.name}*\n_${encounter.treasure.desc}_\n\n_Collect with \`.g abyss collect\`_\n_Skip with \`.g abyss skip\`_`;
  } else if (encounter.type === 'event') {
    startMsg += `${encounter.event.icon} *Floor 1 — ${encounter.event.name}*\n_${encounter.event.desc}_\n\n`;
    encounter.event.choices.forEach(c => {
      startMsg += `\`${c.id}\` — ${c.text}\n`;
    });
    startMsg += `\n_Choose with \`.g abyss choose <1/2>\`_`;
  }

  return {
    success: true,
    run,
    message: startMsg,
  };
}

// ─── GENERATE FLOOR ENCOUNTER ─────────────────────────────────────────────
// 20% chance of treasure/event instead of combat on non-boss floors.
function generateFloorEncounter(floor) {
  const isBoss = isBossFloor(floor);
  
  // Boss floors are always combat
  if (isBoss) return { type: 'combat', enemy: generateFloorEnemy(floor) };
  
  // Non-boss floors: 20% chance of treasure, 10% chance of event, 70% combat
  const roll = Math.random();
  if (roll < 0.20) {
    return generateTreasureEncounter(floor);
  } else if (roll < 0.30) {
    return generateEventEncounter(floor);
  }
  return { type: 'combat', enemy: generateFloorEnemy(floor) };
}

// ─── TREASURE ENCOUNTERS ──────────────────────────────────────────────────
function generateTreasureEncounter(floor) {
  const tier = getFloorTier(floor);
  const mult = getFloorMultiplier(floor);
  const tierMult = { F: 1, C: 2, B: 4, A: 8, S: 20, SS: 50, SSS: 150, ABYSSAL_GOD: 1000, GOD: 5000 };
  const tm = tierMult[tier] || 1;
  
  const treasures = [
    {
      type: 'GOLD_CACHE',
      name: 'Gold Cache',
      icon: '💰',
      desc: 'A glittering pile of ancient coins!',
      gold: Math.floor(200 * tm * mult),
    },
    {
      type: 'XP_SHRINE',
      name: 'Experience Shrine',
      icon: '✨',
      desc: 'A mystical shrine radiating power.',
      xp: Math.floor(100 * tm * mult),
    },
    {
      type: 'HEALING_FOUNTAIN',
      name: 'Healing Fountain',
      icon: '💚',
      desc: 'A crystal-clear fountain that restores vitality.',
      healPercent: 0.50, // 50% HP restore
    },
    {
      type: 'ENERGY_CRYSTAL',
      name: 'Energy Crystal',
      icon: '⚡',
      desc: 'A pulsating crystal full of raw energy.',
      energyRestore: 50,
    },
    {
      type: 'MYSTERY_CHEST',
      name: 'Mystery Chest',
      icon: '🎁',
      desc: 'An ornate chest — what could be inside?',
      // Random reward: gold, XP, or rune drop chance
      randomReward: true,
      gold: Math.floor(500 * tm * mult),
      xp: Math.floor(300 * tm * mult),
      runeDropChance: floor >= 11 ? 0.25 : 0,
    },
    {
      type: 'RUNE_SHRINE',
      name: 'Rune Shrine',
      icon: '💎',
      desc: 'A glowing shrine radiating ancient power. A rune is guaranteed!',
      guaranteedRune: true,
    },
  ];
  
  const treasure = treasures[Math.floor(Math.random() * treasures.length)];
  return { type: 'treasure', treasure, floor };
}

// ─── EVENT ENCOUNTERS ─────────────────────────────────────────────────────
function generateEventEncounter(floor) {
  const events = [
    {
      type: 'TRAP',
      name: 'Ancient Trap',
      icon: '⚠️',
      desc: 'A pressure plate clicks under your foot!',
      choices: [
        { id: '1', text: 'Endure it (HP check)', stat: 'def', difficulty: 10 + floor, 
          success: { desc: 'You tank the hit!', damage: Math.floor(50 * getFloorMultiplier(floor) * 0.3) },
          failure: { desc: 'The trap bites deep!', damage: Math.floor(50 * getFloorMultiplier(floor) * 0.8) } },
        { id: '2', text: 'Dodge it (SPD check)', stat: 'spd', difficulty: 15 + floor,
          success: { desc: 'You slip past!', damage: 0 },
          failure: { desc: 'Too slow!', damage: Math.floor(50 * getFloorMultiplier(floor) * 0.5) } },
      ],
    },
    {
      type: 'CROSSROADS',
      name: 'Mysterious Crossroads',
      icon: '🗺️',
      desc: 'Two paths lie before you.',
      choices: [
        { id: '1', text: 'Left path (risky, better rewards)', risk: 'high',
          rewards: { gold: Math.floor(300 * getFloorMultiplier(floor)), xp: Math.floor(200 * getFloorMultiplier(floor)) },
          danger: Math.floor(100 * getFloorMultiplier(floor)) },
        { id: '2', text: 'Right path (safe, lesser rewards)', risk: 'low',
          rewards: { gold: Math.floor(100 * getFloorMultiplier(floor)), xp: Math.floor(50 * getFloorMultiplier(floor)) },
          danger: 0 },
      ],
    },
    {
      type: 'SHRINE',
      name: 'Forgotten Shrine',
      icon: '⛪',
      desc: 'A shrine offers a blessing — for a price.',
      choices: [
        { id: '1', text: 'Pray (sacrifice HP for XP)', sacrifice: 'hp', amount: '20%',
          reward: { xp: Math.floor(500 * getFloorMultiplier(floor)) } },
        { id: '2', text: 'Leave it', nothing: true },
      ],
    },
  ];
  
  const event = events[Math.floor(Math.random() * events.length)];
  return { type: 'event', event, floor };
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
  if (!enemy) {
    run.status = 'failed';
    await run.save();
    return { success: false, message: '⚠️ Run data corrupted — auto-failed. Cooldown applies.' };
  }

  // Player attacks first
  let attackMsg = `⚔️ You attack ${enemy.name} for ${playerDamage} damage!\n`;
  enemy.hp = Math.max(0, enemy.hp - playerDamage);

  // Check if enemy died
  if (enemy.hp <= 0) {
    attackMsg += `💀 ${enemy.name} defeated!\n`;
    run.monstersKilled += 1;
    if (enemy.isBoss) run.bossesKilled += 1;

    // 💡 QA FIX: track kills for rank missions (was missing entirely)
    try {
      const economy = require('./economy');
      economy.trackMissionStat(userId, 'kills', 1);
      if (enemy.isBoss) economy.trackMissionStat(userId, 'bossesDefeated', 1);
    } catch (e) {}

    // Award loot
    const rewards = getFloorRewards(run.currentFloor, enemy.isBoss);
    run.lootAccumulator.xp += rewards.xp;
    run.lootAccumulator.gold += rewards.gold;
    attackMsg += `🎁 +${rewards.xp} XP, +${rewards.gold} Zeni\n`;

    // Rune drop chance on boss floors 21+
    if (enemy.isBoss && run.currentFloor >= 11) {
      try {
        const runeSystem = require('./runeSystem');
        const dropChance = run.currentFloor >= 50 ? 0.50 : 0.35;
        let drop = runeSystem.rollRuneDrop(dropChance);
        if (drop && run.currentFloor >= 50 && typeof runeSystem.rollAbyssalRuneDrop === 'function') {
          drop = runeSystem.rollAbyssalRuneDrop(run.currentFloor);
        }
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

    // Advance to next floor using encounter system
    run.currentFloor += 1;
    const nextEncounter = generateFloorEncounter(run.currentFloor);
    if (nextEncounter.type === 'combat') {
      run.currentEnemy = nextEncounter.enemy;
      run.currentEncounterType = 'combat';
      run.currentEncounterData = null;
    } else {
      run.currentEnemy = null;
      run.currentEncounterType = nextEncounter.type;
      run.currentEncounterData = nextEncounter.treasure || nextEncounter.event;
    }
    // Restore some energy between floors
    run.currentEnergy = Math.min(run.playerSnapshot.maxEnergy, run.currentEnergy + 20);
    
    if (nextEncounter.type === 'combat') {
      attackMsg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${nextEncounter.enemy.hp}/${nextEncounter.enemy.maxHp}\n_Attack with \`.g abyss attack\`_`;
    } else if (nextEncounter.type === 'treasure') {
      attackMsg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_${nextEncounter.treasure.desc}_\n\n_Collect with \`.g abyss collect\`_`;
    } else if (nextEncounter.type === 'event') {
      attackMsg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_${nextEncounter.event.desc}_\n\n`;
      nextEncounter.event.choices.forEach(c => {
        attackMsg += `\`${c.id}\` — ${c.text}\n`;
      });
      attackMsg += `_Choose with \`.g abyss choose <1/2>\`_`;
    }
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

// ─── PROCESS TREASURE COLLECTION ──────────────────────────────────────────
async function processTreasure(userId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) return { success: false, message: '❌ No active Abyss run.' };
  if (run.currentEncounterType !== 'treasure') {
    return { success: false, message: '❌ There is no treasure to collect on this floor.' };
  }

  const treasure = run.currentEncounterData;
  if (!treasure) return { success: false, message: '❌ Treasure data missing.' };

  let msg = `${treasure.icon} *${treasure.name} collected!*\n\n`;

  if (treasure.gold) {
    run.lootAccumulator.gold += treasure.gold;
    msg += `💰 +${treasure.gold} Zeni\n`;
  }
  if (treasure.xp) {
    run.lootAccumulator.xp += treasure.xp;
    msg += `✨ +${treasure.xp} XP\n`;
  }
  if (treasure.healPercent) {
    const heal = Math.floor(run.playerSnapshot.maxHp * treasure.healPercent);
    run.currentHp = Math.min(run.playerSnapshot.maxHp, run.currentHp + heal);
    msg += `💚 +${heal} HP restored\n`;
  }
  if (treasure.energyRestore) {
    run.currentEnergy = Math.min(run.playerSnapshot.maxEnergy, run.currentEnergy + treasure.energyRestore);
    msg += `⚡ +${treasure.energyRestore} Energy\n`;
  }
  if (treasure.randomReward) {
    const roll = Math.random();
    if (roll < 0.4 && treasure.gold) {
      run.lootAccumulator.gold += treasure.gold;
      msg += `💰 +${treasure.gold} Zeni (jackpot!)\n`;
    } else if (roll < 0.7 && treasure.xp) {
      run.lootAccumulator.xp += treasure.xp;
      msg += `✨ +${treasure.xp} XP (jackpot!)\n`;
    } else if (treasure.runeDropChance > 0) {
      try {
        const runeSystem = require('./runeSystem');
        const drop = runeSystem.rollRuneDrop(treasure.runeDropChance);
        if (drop) {
          const runeResult = await runeSystem.awardRune(userId, drop.type, drop.tier, `abyss_treasure_floor_${run.currentFloor}`);
          if (runeResult.success) {
            run.lootAccumulator.runes.push(runeResult.rune.runeId);
            msg += runeResult.message + '\n';
          }
        } else {
          run.lootAccumulator.gold += Math.floor(treasure.gold * 0.5);
          msg += `💰 +${Math.floor(treasure.gold * 0.5)} Zeni (consolation)\n`;
        }
      } catch (e) {
        run.lootAccumulator.gold += Math.floor(treasure.gold * 0.5);
        msg += `💰 +${Math.floor(treasure.gold * 0.5)} Zeni\n`;
      }
    } else {
      run.lootAccumulator.gold += Math.floor(treasure.gold * 0.3);
      msg += `💰 +${Math.floor(treasure.gold * 0.3)} Zeni (small find)\n`;
    }
  }

  if (treasure.guaranteedRune) {
    try {
      const runeSystem = require('./runeSystem');
      const drop = (run.currentFloor >= 50 && typeof runeSystem.rollAbyssalRuneDrop === 'function') 
        ? runeSystem.rollAbyssalRuneDrop(run.currentFloor)
        : { type: Object.keys(runeSystem.RUNE_TYPES)[Math.floor(Math.random() * 6)], tier: 'GREATER' };
        
      const runeResult = await runeSystem.awardRune(userId, drop.type, drop.tier, `abyss_shrine_floor_${run.currentFloor}`);
      if (runeResult.success) {
        run.lootAccumulator.runes.push(runeResult.rune.runeId);
        msg += runeResult.message + '\n';
      }
    } catch (e) {
      msg += `💎 The shrine is dormant. (Rune system error)\n`;
    }
  }

  // Advance to next floor
  run.currentFloor += 1;
  const nextEncounter = generateFloorEncounter(run.currentFloor);
  if (nextEncounter.type === 'combat') {
    run.currentEnemy = nextEncounter.enemy;
    run.currentEncounterType = 'combat';
    run.currentEncounterData = null;
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${nextEncounter.enemy.hp}/${nextEncounter.enemy.maxHp}\n_Attack with \`.g abyss attack\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`.g abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`.g abyss choose <1/2>\`_`;
  }

  await run.save();
  return { success: true, message: msg, run };
}

// ─── PROCESS EVENT CHOICE ─────────────────────────────────────────────────
async function processEventChoice(userId, choiceId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) return { success: false, message: '❌ No active Abyss run.' };
  if (run.currentEncounterType !== 'event') {
    return { success: false, message: '❌ There is no event to respond to on this floor.' };
  }

  const event = run.currentEncounterData;
  if (!event) return { success: false, message: '❌ Event data missing.' };

  const choice = event.choices.find(c => c.id === String(choiceId));
  if (!choice) return { success: false, message: `❌ Invalid choice. Use 1 or 2.` };

  let msg = `${event.icon} *${event.name}* — You chose: ${choice.text}\n\n`;

  // Handle TRAP event
  if (event.type === 'TRAP') {
    const playerStats = run.playerSnapshot;
    const statValue = playerStats[choice.stat] || 10;
    const success = statValue >= choice.difficulty;
    if (success) {
      msg += `✅ ${choice.success.desc}\n`;
      if (choice.success.damage > 0) {
        run.currentHp = Math.max(0, run.currentHp - choice.success.damage);
        msg += `💥 ${choice.success.damage} damage taken.\n`;
      }
    } else {
      msg += `❌ ${choice.failure.desc}\n`;
      run.currentHp = Math.max(0, run.currentHp - choice.failure.damage);
      msg += `💥 ${choice.failure.damage} damage taken.\n`;
    }
    msg += `❤️ HP: ${run.currentHp}/${run.playerSnapshot.maxHp}\n`;
  }

  // Handle CROSSROADS event
  if (event.type === 'CROSSROADS') {
    if (choice.risk === 'high') {
      const dangerRoll = Math.random();
      if (dangerRoll < 0.4) {
        msg += `⚠️ Ambush! You take ${choice.danger} damage!\n`;
        run.currentHp = Math.max(0, run.currentHp - choice.danger);
      } else {
        msg += `✅ You found the rewards safely!\n`;
      }
    } else {
      msg += `✅ Safe passage secured.\n`;
    }
    run.lootAccumulator.gold += choice.rewards.gold;
    run.lootAccumulator.xp += choice.rewards.xp;
    msg += `💰 +${choice.rewards.gold} Zeni, ✨ +${choice.rewards.xp} XP\n`;
    msg += `❤️ HP: ${run.currentHp}/${run.playerSnapshot.maxHp}\n`;
  }

  // Handle SHRINE event
  if (event.type === 'SHRINE') {
    if (choice.nothing) {
      msg += `You leave the shrine untouched.\n`;
    } else {
      const sacrifice = Math.floor(run.playerSnapshot.maxHp * 0.20);
      run.currentHp = Math.max(1, run.currentHp - sacrifice);
      run.lootAccumulator.xp += choice.reward.xp;
      msg += `🩸 Sacrificed ${sacrifice} HP for ✨ ${choice.reward.xp} XP\n`;
      msg += `❤️ HP: ${run.currentHp}/${run.playerSnapshot.maxHp}\n`;
    }
  }

  // Check death
  if (run.currentHp <= 0) {
    return await processDeath(userId, run, msg);
  }

  if (treasure.guaranteedRune) {
    try {
      const runeSystem = require('./runeSystem');
      const drop = (run.currentFloor >= 50 && typeof runeSystem.rollAbyssalRuneDrop === 'function') 
        ? runeSystem.rollAbyssalRuneDrop(run.currentFloor)
        : { type: Object.keys(runeSystem.RUNE_TYPES)[Math.floor(Math.random() * 6)], tier: 'GREATER' };
        
      const runeResult = await runeSystem.awardRune(userId, drop.type, drop.tier, `abyss_shrine_floor_${run.currentFloor}`);
      if (runeResult.success) {
        run.lootAccumulator.runes.push(runeResult.rune.runeId);
        msg += runeResult.message + '\n';
      }
    } catch (e) {
      msg += `💎 The shrine is dormant. (Rune system error)\n`;
    }
  }

  // Advance to next floor
  run.currentFloor += 1;
  const nextEncounter = generateFloorEncounter(run.currentFloor);
  if (nextEncounter.type === 'combat') {
    run.currentEnemy = nextEncounter.enemy;
    run.currentEncounterType = 'combat';
    run.currentEncounterData = null;
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${nextEncounter.enemy.hp}/${nextEncounter.enemy.maxHp}\n_Attack with \`.g abyss attack\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`.g abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`.g abyss choose <1/2>\`_`;
  }

  await run.save();
  return { success: true, message: msg, run };
}

// ─── PROCESS SKIP (skip treasure/event floor) ─────────────────────────────
async function processSkip(userId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) return { success: false, message: '❌ No active Abyss run.' };
  if (run.currentEncounterType === 'combat') {
    return { success: false, message: '❌ Cannot skip a combat floor. Attack or retreat!' };
  }

  let msg = `⏭️ You skip floor ${run.currentFloor}.\n`;
  run.currentFloor += 1;
  const nextEncounter = generateFloorEncounter(run.currentFloor);
  if (nextEncounter.type === 'combat') {
    run.currentEnemy = nextEncounter.enemy;
    run.currentEncounterType = 'combat';
    run.currentEncounterData = null;
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${nextEncounter.enemy.hp}/${nextEncounter.enemy.maxHp}\n_Attack with \`.g abyss attack\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`.g abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`.g abyss choose <1/2>\`_`;
  }

  await run.save();
  return { success: true, message: msg, run };
}

// ─── PROCESS DEATH ────────────────────────────────────────────────────────
// Player died — lose 90% of loot, keep 10%, run ends as 'failed'
async function processDeath(userId, run, deathMsg) {
  if (run.status !== 'active') return { success: false, message: 'Run already ended.' };
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

  // 💡 QA FIX: zero lootAccumulator before saving to prevent double-award
  run.lootAccumulator = { xp: 0, gold: 0, runes: [], items: [] };

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
  } catch (e) { console.error('[Abyss] Guild perks failed:', e.message); }

  return { success: true, message: deathMsg, run, died: true };
}

// ─── RETREAT ──────────────────────────────────────────────────────────────
// Player retreats — keep 100% of loot, run ends as 'completed'
async function retreat(userId) {
  const run = await AbyssRun.findOne({ userId, status: 'active' });
  if (!run) {
    return { success: false, message: '❌ No active Abyss run to retreat from.' };
  }
  if (run.status !== 'active') return { success: false, message: 'Run already ended.' };

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

  // 💡 QA FIX: zero lootAccumulator before saving to prevent double-award
  run.lootAccumulator = { xp: 0, gold: 0, runes: [], items: [] };

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
  generateFloorEncounter,
  generateTreasureEncounter,
  generateEventEncounter,
  processTreasure,
  processEventChoice,
  processSkip,
  RUN_COOLDOWN_MS,
  // 💡 Admin functions
  adminResetCooldown,
  adminClearRun,
  adminSetFloor,
  adminPurgeAllRuns,
  adminGetRunById,
};

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN FUNCTIONS (Phase 4 — moderation)
// ═══════════════════════════════════════════════════════════════════════════
// All admin functions are caller-permission-checked in the engine command
// handler — these functions assume the caller is authorized.

// ─── RESET COOLDOWN ───────────────────────────────────────────────────────
// Clears a user's Abyss cooldown by deleting their most recent
// completed/failed run record. Lets them enter immediately.
async function adminResetCooldown(userId) {
  try {
    // Delete completed/failed runs for this user (keep active runs + leaderboard)
    const result = await AbyssRun.deleteMany({
      userId,
      status: { $in: ['completed', 'failed'] },
    });
    return {
      success: true,
      message: `✅ Reset Abyss cooldown for ${userId.split('@')[0]}. Cleared ${result.deletedCount} past run record(s).`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── CLEAR ACTIVE RUN ─────────────────────────────────────────────────────
// Force-ends a user's active Abyss run without rewards. Useful for unsticking
// stuck runs or dealing with exploiters.
async function adminClearRun(userId) {
  try {
    const run = await AbyssRun.findOne({ userId, status: 'active' });
    if (!run) {
      return { success: false, message: `❌ No active Abyss run for ${userId.split('@')[0]}.` };
    }
    run.status = 'failed';
    run.finalScore = 0;
    run.finalFloor = run.currentFloor;
    run.currentEnemy = null;
    run.lootAccumulator = { xp: 0, gold: 0, runes: [], items: [] }; // zero out loot
    await run.save();
    return {
      success: true,
      message: `✅ Cleared active Abyss run for ${userId.split('@')[0]} (floor ${run.currentFloor}). No loot awarded.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── SET FLOOR ────────────────────────────────────────────────────────────
// Sets a user's current floor (testing/debugging). Generates a new enemy
// for the target floor. Only works on active runs.
async function adminSetFloor(userId, floor) {
  try {
    const run = await AbyssRun.findOne({ userId, status: 'active' });
    if (!run) {
      return { success: false, message: `❌ No active Abyss run for ${userId.split('@')[0]}.` };
    }
    const targetFloor = Math.max(1, Math.floor(floor));
    run.currentFloor = targetFloor;
    run.currentEnemy = generateFloorEnemy(targetFloor);
    // Restore player to full HP on floor set (testing convenience)
    run.currentHp = run.playerSnapshot.maxHp;
    run.currentEnergy = run.playerSnapshot.maxEnergy;
    await run.save();
    return {
      success: true,
      message: `✅ Set ${userId.split('@')[0]}'s Abyss floor to ${targetFloor}. Enemy: ${run.currentEnemy.name} (HP ${run.currentEnemy.hp.toLocaleString()}). HP restored to full.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── PURGE ALL ACTIVE RUNS ────────────────────────────────────────────────
// Emergency admin function — ends ALL active Abyss runs without rewards.
// Use when something is broken and runs are stuck.
async function adminPurgeAllRuns() {
  try {
    const result = await AbyssRun.updateMany(
      { status: 'active' },
      {
        $set: {
          status: 'failed',
          finalScore: 0,
          finalFloor: 0,
          currentEnemy: null,
          'lootAccumulator.xp': 0,
          'lootAccumulator.gold': 0,
          'lootAccumulator.runes': [],
          'lootAccumulator.items': [],
        },
      },
    );
    return {
      success: true,
      message: `✅ Purged ${result.modifiedCount} active Abyss run(s). All ended without loot.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── GET RUN BY USER ID (for admin display) ───────────────────────────────
async function adminGetRunById(userId) {
  return await AbyssRun.findOne({ userId, status: 'active' });
}

