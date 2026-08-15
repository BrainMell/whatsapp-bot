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
const botConfig = require('../../botConfig');
const P = () => botConfig.getPrefix();

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
      // 💡 FIX 2026-07-31 Bug #4: Auto-retreat stale runs properly —
      // award loot, add to leaderboard, zero accumulator. Previously
      // just set status='completed' without paying out loot or recording
      // on the leaderboard.
      console.log(`[Abyss] Auto-retreating stale run for ${userId} (age: ${Math.floor(age / 60000)}min)`);
      try {
        // Award full loot (same as manual retreat)
        // 💡 FIX 2026-08-15: require progression + economy locally — they
        // were referenced but never imported at this scope, causing
        // "progression is not defined" ReferenceError.
        const progression = require('./progression');
        const economy = require('./economy');
        const loot = existing.lootAccumulator || {};
        if (loot.xp > 0) progression.awardXP(userId, loot.xp, 'Abyss (auto-retreat)');
        if (loot.gold > 0) economy.addMoney(userId, loot.gold, 'Abyss (auto-retreat)', 'abyss');
        // Add to leaderboard
        const score = existing.currentFloor * 100 + (existing.monstersKilled || 0) * 5;
        await addToLeaderboard(userId, existing.currentFloor, existing.monstersKilled, existing.bossesKilled, score, 'retreat');
        // Mark as completed
        existing.status = 'completed';
        existing.finalScore = score;
        existing.finalFloor = existing.currentFloor;
        existing.lootAccumulator = { xp: 0, gold: 0, runes: [], items: [] };
        await existing.save();
      } catch (retreatErr) {
        console.error('[Abyss] Auto-retreat error:', retreatErr.message);
        // Force-complete even if loot payout fails
        existing.status = 'completed';
        await existing.save();
      }
    } else {
      return {
        success: false,
        message: `❌ You already have an active Abyss run on floor ${existing.currentFloor}.\n_Continue with \`${P()} abyss status\` or retreat with \`${P()} abyss retreat\`._`,
      };
    }
  }

  // Check cooldown — look at most recent completed/failed run
  // 💡 RPG Mods AND the bot owner are immune to the Abyss cooldown.
  // Owner bypass added 2026-08-03 per user request: owner account should
  // be able to test Abyss at any time without waiting 12h.
  const lastRun = await AbyssRun.findOne({ userId, status: { $in: ['completed', 'failed'] } }).sort({ updatedAt: -1 });
  if (lastRun) {
    const elapsed = Date.now() - new Date(lastRun.updatedAt).getTime();
    if (elapsed < RUN_COOLDOWN_MS) {
      // Check if user is the bot owner OR an RPG mod — bypass cooldown if so
      let isOwner = false;
      let isRpgMod = false;
      try {
        const engine = require('../engine');
        if (typeof engine.isBotOwner === 'function') {
          isOwner = engine.isBotOwner(userId);
        }
        if (typeof engine.isRpgMod === 'function') {
          isRpgMod = engine.isRpgMod(userId);
        }
      } catch (e) {}

      if (!isOwner && !isRpgMod) {
        const remaining = Math.ceil((RUN_COOLDOWN_MS - elapsed) / 3600000);
        return {
          success: false,
          message: `❌ Abyss cooldown. Try again in ${remaining}h.\n_The Abyss needs time to reform between challenges._`,
        };
      }
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

  // Generate first floor encounter (may be combat, treasure, event, or wild_summon)
  const encounter = generateFloorEncounter(1);
  if (encounter.type === 'combat' || encounter.type === 'wild_summon') {
    run.currentEnemy = encounter.enemy;
    run.currentEncounterType = encounter.type;
    if (encounter.type === 'wild_summon') {
      run.currentEncounterData = {
        species: encounter.wildSummonSpecies,
        rarity: encounter.wildSummonRarity,
      };
    }
  } else {
    run.currentEnemy = null;
    run.currentEncounterType = encounter.type;
    run.currentEncounterData = encounter.treasure || encounter.event;
  }
  await run.save();

  let startMsg = '🕳️ *ABYSS RUN STARTED*\n\nYou descend into the Abyss...\n\n';
  if (encounter.type === 'combat') {
    startMsg += '⚔️ *Floor 1 — ' + encounter.enemy.name + '*\n_HP: ' + (encounter.enemy.stats?.hp ?? encounter.enemy.hp) + '/' + (encounter.enemy.stats?.maxHp ?? encounter.enemy.maxHp) + '_\n\n_Attack with `' + P() + ' combat atk`_\n_Retreat with `' + P() + ' abyss retreat`_';
  } else if (encounter.type === 'wild_summon') {
    const species = encounter.wildSummonSpecies;
    startMsg += '🐉 *Floor 1 — Wild ' + species + ' appeared!*\n_HP: ' + encounter.enemy.stats.hp + '/' + encounter.enemy.stats.maxHp + '_\n⚠️ _Defeat it to earn Summon Fragments!_\n\n_Attack with `' + P() + ' combat atk`_\n_Retreat with `' + P() + ' abyss retreat`_';
  } else if (encounter.type === 'treasure') {
    startMsg += `${encounter.treasure.icon} *Floor 1 — ${encounter.treasure.name}*\n_${encounter.treasure.desc}_\n\n_Collect with \`${P()} abyss collect\`_\n_Skip with \`${P()} abyss skip\`_`;
  } else if (encounter.type === 'event') {
    startMsg += `${encounter.event.icon} *Floor 1 — ${encounter.event.name}*\n_${encounter.event.desc}_\n\n`;
    encounter.event.choices.forEach(c => {
      startMsg += `\`${c.id}\` — ${c.text}\n`;
    });
    startMsg += `\n_Choose with \`${P()} abyss choose <1/2>\`_`;
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

  // 💡 SUMMON PROGRESSION SYSTEM (2026-08-01): 10% chance of wild summon encounter.
  // When triggered, the player fights a wild summon species. Winning drops
  // summon fragments (tiered by floor depth) which can be crafted into eggs.
  // This is the primary source of summon fragments — the core progression loop.
  const WILD_SUMMON_CHANCE = 0.10; // 10% per non-boss floor
  if (Math.random() < WILD_SUMMON_CHANCE) {
    try {
      const summonEggSystem = require('./summonEggSystem');
      const wildEncounter = summonEggSystem.generateWildSummonEncounter(floor);
      if (wildEncounter) {
        return {
          type: 'wild_summon',
          enemy: wildEncounter.enemy,
          wildSummonSpecies: wildEncounter.speciesId,
          wildSummonRarity: wildEncounter.species.rarity,
        };
      }
    } catch (e) {
      console.error('[Abyss] Wild summon encounter failed:', e.message);
    }
  }

  // Non-boss floors: 20% chance of treasure, 10% chance of event, remaining combat
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

// ─── PROCESS ATTACK [REMOVED — DEAD CODE] ─────────────────────────────────
// 💡 REMOVED 2026-08-03: processAttack() was legacy code from the old
// Abyss system. It was never called by any module — the real Abyss combat
// path goes through guildAdventure.startAbyssCombat() → calculateDamage().
// Keeping it caused confusion and potential conflicts with the new system.
// All Abyss combat now uses the standard combat commands:
//   `${P()} combat attack` / `${P()} combat skill <#>` / `${P()} combat item`
// ──────────────────────────────────────────────────────────────────────────

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
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${Math.floor(nextEncounter.enemy.stats?.hp ?? nextEncounter.enemy.hp)}/${Math.floor(nextEncounter.enemy.stats?.maxHp ?? nextEncounter.enemy.maxHp)}\n_Attack with \`${P()} combat atk\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`${P()} abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`${P()} abyss choose <1/2>\`_`;
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
    msg += `❤️ HP: ${Math.floor(run.currentHp)}/${Math.floor(run.playerSnapshot.maxHp)}\n`;
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
    msg += `❤️ HP: ${Math.floor(run.currentHp)}/${Math.floor(run.playerSnapshot.maxHp)}\n`;
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
      msg += `❤️ HP: ${Math.floor(run.currentHp)}/${Math.floor(run.playerSnapshot.maxHp)}\n`;
    }
  }

  // Check death
  if (run.currentHp <= 0) {
    return await processDeath(userId, run, msg);
  }

  // 💡 FIX 2026-07-31 Bug #2: Removed orphaned `treasure.guaranteedRune`
  // block — `treasure` was undefined in processEventChoice (copy-paste
  // from processTreasure). This would throw ReferenceError after Bug #1
  // fix made event floors actually reachable.

  // Advance to next floor
  run.currentFloor += 1;
  const nextEncounter = generateFloorEncounter(run.currentFloor);
  if (nextEncounter.type === 'combat') {
    run.currentEnemy = nextEncounter.enemy;
    run.currentEncounterType = 'combat';
    run.currentEncounterData = null;
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${Math.floor(nextEncounter.enemy.stats?.hp ?? nextEncounter.enemy.hp)}/${Math.floor(nextEncounter.enemy.stats?.maxHp ?? nextEncounter.enemy.maxHp)}\n_Attack with \`${P()} combat atk\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`${P()} abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`${P()} abyss choose <1/2>\`_`;
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
    msg += `\n🕳️ *Floor ${run.currentFloor}* — ${nextEncounter.enemy.name}\nHP: ${Math.floor(nextEncounter.enemy.stats?.hp ?? nextEncounter.enemy.hp)}/${Math.floor(nextEncounter.enemy.stats?.maxHp ?? nextEncounter.enemy.maxHp)}\n_Attack with \`${P()} combat atk\`_`;
  } else if (nextEncounter.type === 'treasure') {
    run.currentEnemy = null;
    run.currentEncounterType = 'treasure';
    run.currentEncounterData = nextEncounter.treasure;
    msg += `\n${nextEncounter.treasure.icon} *Floor ${run.currentFloor}* — ${nextEncounter.treasure.name}\n_Collect with \`${P()} abyss collect\`_`;
  } else if (nextEncounter.type === 'event') {
    run.currentEnemy = null;
    run.currentEncounterType = 'event';
    run.currentEncounterData = nextEncounter.event;
    msg += `\n${nextEncounter.event.icon} *Floor ${run.currentFloor}* — ${nextEncounter.event.name}\n_Choose with \`${P()} abyss choose <1/2>\`_`;
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

