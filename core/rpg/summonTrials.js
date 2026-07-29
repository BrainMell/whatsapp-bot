// ============================================
// ⚔️ SUMMON TRIALS — solo evolution trials
// ============================================
// One of the 6 original Summoner System mechanics.
// Each summon species has a trial. The summon must solo-kill
// the trial boss to evolve + unlock a permanent player passive.
//
// The passive is active whenever the player owns ANY summon of
// that species (doesn't need to be deployed).
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md (section 2.6)

const Summon = require('../models/Summon');
const SummonTrial = require('../models/SummonTrial');
const registry = require('./summonRegistry');
const summonSystem = require('./summonSystem');
const economy = require('./economy');

// ─────────────────────────────────────────────────────────────
// TRIAL DEFINITIONS — static data for all 14 species
// ─────────────────────────────────────────────────────────────
// In a full implementation, these would be in MongoDB (SummonTrial model).
// For Phase 5, we define them statically here and seed them on first access.
// Each trial defines: boss ID, boss level, required summon level,
// reward passive ID, and evolution target.

const TRIAL_DEFINITIONS = {
  // Undead trials
  skeleton: {
    trialId: 'trial_skeleton',
    species: 'skeleton',
    bossId: 'FROST_GHOUL',
    bossLevel: 10,
    requiredSummonLevel: 10,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'bone_armor_passive',
    name: 'Trial of Bones',
    description: 'Your Skeleton must solo-kill a Frost Ghoul to evolve into a Skeleton Knight.'
  },
  skeleton_knight: {
    trialId: 'trial_skeleton_knight',
    species: 'skeleton_knight',
    bossId: 'BLIZZARD_WRAITH',
    bossLevel: 25,
    requiredSummonLevel: 25,
    requiredTier: 'ASCENDED',
    rewardEvolution: 'TRANSCENDENT',
    rewardPassive: 'bone_command_passive',
    name: 'Trial of the Knight',
    description: 'Your Skeleton Knight must solo-kill a Blizzard Wraith to evolve into a Skeleton King.'
  },
  lich_minion: {
    trialId: 'trial_lich_minion',
    species: 'lich_minion',
    bossId: 'FLESH_ABOMINATION',
    bossLevel: 15,
    requiredSummonLevel: 15,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'necrotic_mastery_passive',
    name: 'Trial of Necromancy',
    description: 'Your Lich Minion must solo-kill a Flesh Abomination to evolve.'
  },

  // Demon trials
  imp: {
    trialId: 'trial_imp',
    species: 'imp',
    bossId: 'HELLFIRE_DEMON',
    bossLevel: 12,
    requiredSummonLevel: 12,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'demon_pact_passive',
    name: 'Trial of Flames',
    description: 'Your Imp must solo-kill a Hellfire Demon to evolve.'
  },
  void_walker: {
    trialId: 'trial_void_walker',
    species: 'void_walker',
    bossId: 'ABYSSAL_HORROR',
    bossLevel: 20,
    requiredSummonLevel: 20,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'void_shield_passive',
    name: 'Trial of the Void',
    description: 'Your Void Walker must solo-kill an Abyssal Horror to evolve.'
  },

  // Elemental trials
  flame_elemental: {
    trialId: 'trial_flame',
    species: 'flame_elemental',
    bossId: 'MAGMA_BRUTE',
    bossLevel: 12,
    requiredSummonLevel: 12,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'inner_fire_passive',
    name: 'Trial of Embers',
    description: 'Your Flame Elemental must solo-kill a Magma Brute to evolve.'
  },
  frost_elemental: {
    trialId: 'trial_frost',
    species: 'frost_elemental',
    bossId: 'PERMAFROST_TITAN',
    bossLevel: 15,
    requiredSummonLevel: 15,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'ice_veins_passive',
    name: 'Trial of Frost',
    description: 'Your Frost Elemental must solo-kill a Permafrost Titan to evolve.'
  },
  storm_elemental: {
    trialId: 'trial_storm',
    species: 'storm_elemental',
    bossId: 'FROST_FLAME_WARDEN',
    bossLevel: 18,
    requiredSummonLevel: 18,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'storm_power_passive',
    name: 'Trial of Storms',
    description: 'Your Storm Elemental must solo-kill a Frost Flame Warden to evolve.'
  },

  // Beast trials
  wolf: {
    trialId: 'trial_wolf',
    species: 'wolf',
    bossId: 'SHADOW_STALKER_MUTANT',
    bossLevel: 10,
    requiredSummonLevel: 10,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'pack_leader_passive',
    name: 'Trial of the Pack',
    description: 'Your Wolf must solo-kill a Shadow Stalker Mutant to evolve.'
  },
  bear: {
    trialId: 'trial_bear',
    species: 'bear',
    bossId: 'CHIMERA_BEAST',
    bossLevel: 15,
    requiredSummonLevel: 15,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'guardian_might_passive',
    name: 'Trial of the Cave',
    description: 'Your Bear must solo-kill a Chimera Beast to evolve.'
  },

  // Construct trials
  turret_mk1: {
    trialId: 'trial_turret_mk1',
    species: 'turret_mk1',
    bossId: 'CRYSTAL_CORRUPTED',
    bossLevel: 10,
    requiredSummonLevel: 10,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'engineers_eye_passive',
    name: 'Trial of the Forge',
    description: 'Your Auto-Turret MK-I must solo-kill a Crystal Corrupted to evolve.'
  },
  cannon_turret: {
    trialId: 'trial_cannon_turret',
    species: 'cannon_turret',
    bossId: 'GOLEM_KING',
    bossLevel: 18,
    requiredSummonLevel: 18,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'artillery_master_passive',
    name: 'Trial of Siege',
    description: 'Your Cannon Turret must solo-kill a Golem King to evolve.'
  },

  // Dragon trials
  wyrmling: {
    trialId: 'trial_wyrmling',
    species: 'wyrmling',
    bossId: 'FIRE_BREATHER',
    bossLevel: 20,
    requiredSummonLevel: 20,
    requiredTier: 'BASE',
    rewardEvolution: 'ASCENDED',
    rewardPassive: 'dragon_blood_passive',
    name: 'Trial of the Wyrmling',
    description: 'Your Wyrmling must solo-kill a Fire Breather to evolve into a Juvenile Dragon.'
  },
  juvenile_dragon: {
    trialId: 'trial_juvenile_dragon',
    species: 'juvenile_dragon',
    bossId: 'KRAKEN_SPAWN',
    bossLevel: 35,
    requiredSummonLevel: 30,
    requiredTier: 'ASCENDED',
    rewardEvolution: 'TRANSCENDENT',
    rewardPassive: 'dragonfear_passive',
    name: 'Trial of the Dragon',
    description: 'Your Juvenile Dragon must solo-kill a Kraken Spawn to evolve into an Adult Dragon.'
  }
};

// ─────────────────────────────────────────────────────────────
// PLAYER PASSIVE DEFINITIONS
// ─────────────────────────────────────────────────────────────
// Unlocked when the player completes a summon trial.
// Active whenever the player owns ANY summon of that species.

const PLAYER_PASSIVES = {
  bone_armor_passive: { name: 'Bone Armor', desc: '+5% physical defense when you own an undead summon', bonus: { def: 5 }, condition: { element: 'undead' } },
  bone_command_passive: { name: 'Bone Command', desc: '+10% physical defense when you own an undead summon', bonus: { def: 10 }, condition: { element: 'undead' } },
  necrotic_mastery_passive: { name: 'Necrotic Mastery', desc: '+5% magic damage when you own an undead summon', bonus: { mag: 5 }, condition: { element: 'undead' } },
  demon_pact_passive: { name: 'Demon Pact', desc: '+5% attack when you own a demon summon', bonus: { atk: 5 }, condition: { element: 'demon' } },
  void_shield_passive: { name: 'Void Shield', desc: '+5% damage reduction when you own a demon summon', bonus: { dmgReduction: 5 }, condition: { element: 'demon' } },
  inner_fire_passive: { name: 'Inner Fire', desc: '+5% fire damage when you own a fire summon', bonus: { fireDmg: 5 }, condition: { element: 'fire' } },
  ice_veins_passive: { name: 'Ice Veins', desc: '+5% ice damage when you own an ice summon', bonus: { iceDmg: 5 }, condition: { element: 'ice' } },
  storm_power_passive: { name: 'Storm Power', desc: '+5% lightning damage when you own a lightning summon', bonus: { lightningDmg: 5 }, condition: { element: 'lightning' } },
  pack_leader_passive: { name: 'Pack Leader', desc: '+5% speed when you own a beast summon', bonus: { spd: 5 }, condition: { element: 'beast' } },
  guardian_might_passive: { name: 'Guardian Might', desc: '+5% HP when you own a beast summon', bonus: { hp: 5 }, condition: { element: 'beast' } },
  engineers_eye_passive: { name: "Engineer's Eye", desc: '+5% crit when you own a construct summon', bonus: { crit: 5 }, condition: { element: 'construct' } },
  artillery_master_passive: { name: 'Artillery Master', desc: '+10% attack when you own a construct summon', bonus: { atk: 10 }, condition: { element: 'construct' } },
  dragon_blood_passive: { name: 'Dragon Blood', desc: '+5% HP when you own a dragon summon', bonus: { hp: 5 }, condition: { element: 'dragon' } },
  dragonfear_passive: { name: 'Dragonfear', desc: '-5% enemy attack when you own a dragon summon', bonus: { enemyAtkReduction: 5 }, condition: { element: 'dragon' } }
};

// ─────────────────────────────────────────────────────────────
// TRIAL ATTEMPT — check requirements + simulate solo combat
// ─────────────────────────────────────────────────────────────

/**
 * Attempt a summon trial.
 * Checks requirements, then simulates a solo combat between the summon
 * and the trial boss. On victory, evolves the summon + unlocks the passive.
 *
 * @param {string} ownerJid - Owner's JID
 * @param {string} summonId - Summon's summonId
 * @returns {Promise<{success: boolean, message: string, evolved?: boolean}>}
 */
async function attemptTrial(ownerJid, summonId) {
  const user = economy.getUser(ownerJid);
  if (!user) {
    return { success: false, message: '❌ User not found.' };
  }

  const summon = await Summon.findOne({ summonId, ownerJid });
  if (!summon) {
    return { success: false, message: '❌ Summon not found in your collection.' };
  }

  if (summon.forSale) {
    return { success: false, message: '❌ Cannot trial a summon listed for sale.' };
  }

  if (summon.trialCompleted) {
    return { success: false, message: '❌ This summon has already completed its trial.' };
  }

  // Get the trial definition
  const trial = TRIAL_DEFINITIONS[summon.species];
  if (!trial) {
    return { success: false, message: '❌ No trial defined for this summon species.' };
  }

  // Check summon level requirement
  if (summon.level < trial.requiredSummonLevel) {
    return { success: false, message: `❌ Summon must be level ${trial.requiredSummonLevel} to attempt this trial (currently ${summon.level}).` };
  }

  // Check tier requirement
  if (summon.tier !== trial.requiredTier) {
    return { success: false, message: `❌ Summon must be ${trial.requiredTier} tier to attempt this trial (currently ${summon.tier}).` };
  }

  // Check if player already has this passive unlocked
  if (user.unlockedSummonPassives && user.unlockedSummonPassives.includes(trial.rewardPassive)) {
    return { success: false, message: '❌ You have already unlocked this trial\'s passive. The summon can still evolve, but no new passive will be granted.' };
  }

  // Simulate the trial combat
  const result = await simulateTrialCombat(summon, trial);

  if (!result.victory) {
    return {
      success: false,
      message: `❌ *TRIAL FAILED*\n\n${summon.nickname || registry.getSpecies(summon.species)?.name || summon.species} was defeated by the ${trial.bossId}!\n\n${result.log}\n\nThe summon survived but needs to train more before trying again. No loyalty lost.`
    };
  }

  // VICTORY — evolve the summon
  const evolvedSpeciesId = registry.getEvolvedSpeciesId(summon.species, trial.rewardEvolution);
  const evolvedSpecies = registry.getSpecies(evolvedSpeciesId);
  const oldName = summon.nickname || registry.getSpecies(summon.species)?.name || summon.species;

  summon.species = evolvedSpeciesId;
  summon.archetype = evolvedSpecies.archetype;
  summon.element = evolvedSpecies.element;
  summon.tier = trial.rewardEvolution;
  summon.echoId = evolvedSpecies.echoId;
  summon.trialCompleted = true;
  summon.rarity = evolvedSpecies.rarity;

  // Apply evolution stat bonus (BASE→ASCENDED = 1.2×, handled by computeEffectiveStats tier mult)
  // Also bump base stats to the evolved species base + level growth
  summonSystem.applyLevelGrowth(summon, summon.level);

  await summon.save();

  // Unlock the player passive
  if (!user.unlockedSummonPassives) user.unlockedSummonPassives = [];
  if (!user.unlockedSummonPassives.includes(trial.rewardPassive)) {
    user.unlockedSummonPassives.push(trial.rewardPassive);
  }

  // Update summon stats
  if (user.summonStats) {
    user.summonStats.evolved = (user.summonStats.evolved || 0) + 1;
    user.summonStats.trialsCompleted = (user.summonStats.trialsCompleted || 0) + 1;
  }

  // Refresh resonances (species may have changed element)
  try {
    await summonSystem.refreshUserResonances(user);
  } catch (e) {}

  const passive = PLAYER_PASSIVES[trial.rewardPassive];
  let msg = `⚔️ *TRIAL COMPLETE!*\n\n`;
  msg += `${oldName} has evolved into ${evolvedSpecies.icon} *${evolvedSpecies.name}*!\n\n`;
  msg += `📊 Tier: ${summon.tier}\n`;
  msg += `📊 Level: ${summon.level}\n`;
  msg += `📊 Rarity: ${summon.rarity}\n\n`;
  msg += `✨ *PLAYER PASSIVE UNLOCKED:*\n`;
  msg += `${passive?.name || trial.rewardPassive} — ${passive?.desc || 'Unknown effect'}\n\n`;
  msg += `This passive is active whenever you own any ${evolvedSpecies.element} summon.`;

  return { success: true, message: msg, evolved: true };
}

// ─────────────────────────────────────────────────────────────
// SIMULATE TRIAL COMBAT — simplified solo fight
// ─────────────────────────────────────────────────────────────
// This is a simplified auto-battle. The summon fights the trial boss
// in a 1v1 with no player input. The outcome is deterministic based
// on stats — higher-level summons with good stats will win.

async function simulateTrialCombat(summon, trial) {
  const summonStats = summonSystem.computeEffectiveStats(summon);
  const species = registry.getSpecies(summon.species);

  // Build a simplified boss from the trial definition
  // Boss stats scale from the trial's bossLevel
  const bossLevel = trial.bossLevel;
  const bossStats = {
    hp: Math.floor(100 * (1 + (bossLevel - 1) * 0.5)),
    atk: Math.floor(15 * (1 + (bossLevel - 1) * 0.15)),
    def: Math.floor(8 * (1 + (bossLevel - 1) * 0.10)),
    spd: Math.floor(10 * (1 + (bossLevel - 1) * 0.08))
  };

  let summonHp = summonStats.hp;
  let bossHp = bossStats.hp;
  const log = [];
  let round = 0;
  const maxRounds = 20;  // prevent infinite loops

  while (summonHp > 0 && bossHp > 0 && round < maxRounds) {
    round++;

    // Summon attacks
    const summonDmg = Math.max(1, Math.floor(summonStats.atk * (1 + Math.random() * 0.3) - bossStats.def * 0.5));
    bossHp -= summonDmg;
    log.push(`Round ${round}: ${species?.name || 'Summon'} deals ${summonDmg} damage.`);

    if (bossHp <= 0) break;

    // Boss attacks
    const bossDmg = Math.max(1, Math.floor(bossStats.atk * (1 + Math.random() * 0.3) - summonStats.def * 0.5));
    summonHp -= bossDmg;
    log.push(`Round ${round}: Boss deals ${bossDmg} damage.`);
  }

  const victory = bossHp <= 0 && summonHp > 0;

  return {
    victory,
    log: log.join('\n'),
    finalSummonHp: Math.max(0, summonHp),
    finalBossHp: Math.max(0, bossHp),
    rounds: round
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function getTrial(speciesId) {
  return TRIAL_DEFINITIONS[speciesId] || null;
}

function getPassive(passiveId) {
  return PLAYER_PASSIVES[passiveId] || null;
}

function getAllTrials() {
  return Object.values(TRIAL_DEFINITIONS);
}

/**
 * Get all active player passives for a user.
 * Returns the passive objects that the user has unlocked.
 * @param {object} user - Economy user object
 * @returns {array}
 */
function getActivePlayerPassives(user) {
  if (!user || !user.unlockedSummonPassives) return [];
  return user.unlockedSummonPassives
    .map(id => PLAYER_PASSIVES[id])
    .filter(p => p);
}

/**
 * Compute the total passive bonus for a player, given their owned summons.
 * Only includes passives whose condition is met (player owns a summon of
 * the required element).
 * @param {object} user - Economy user object
 * @param {array} ownedSummons - Array of Summon documents
 * @returns {object} - Combined bonus object
 */
function computePassiveBonuses(user, ownedSummons) {
  const passives = getActivePlayerPassives(user);
  if (passives.length === 0 || !ownedSummons || ownedSummons.length === 0) {
    return {};
  }

  // Get the set of elements the player owns (loyalty > 0, not for sale)
  const ownedElements = new Set();
  for (const s of ownedSummons) {
    if (s.loyalty > 0 && !s.forSale) {
      ownedElements.add(s.element);
    }
  }

  // Aggregate bonuses from all active passives whose condition is met
  const combined = {};
  for (const passive of passives) {
    if (passive.condition && passive.condition.element && !ownedElements.has(passive.condition.element)) {
      continue;  // condition not met
    }
    for (const [key, val] of Object.entries(passive.bonus)) {
      combined[key] = (combined[key] || 0) + val;
    }
  }

  return combined;
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  TRIAL_DEFINITIONS,
  PLAYER_PASSIVES,
  attemptTrial,
  getTrial,
  getPassive,
  getAllTrials,
  getActivePlayerPassives,
  computePassiveBonuses,
  simulateTrialCombat
};
