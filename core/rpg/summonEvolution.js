// ═══════════════════════════════════════════════════════════════════════════
//  SUMMON EVOLUTION SYSTEM — Phase 3 of the Summon Progression System
// ═══════════════════════════════════════════════════════════════════════════
//
// Each summon species has an evolutionStages array (defined in summonRegistry).
// Evolution advances the summon to the next stage:
//   Stage 1 (BASE) → Stage 2 (ASCENDED) → Stage 3 (TRANSCENDENT)
//
// Requirements per stage:
//   Stage 2: Level 15 + 1x summon_essence_t2 + 10,000 Zeni
//   Stage 3: Level 30 + 1x summon_essence_t3 + 50,000 Zeni
//
// On evolution:
//   - species changes to the next stage
//   - baseStats update to the new species
//   - tier upgrades (BASE → ASCENDED → TRANSCENDENT)
//   - rarity upgrades to match the new species
//   - level is preserved
//   - allocatedStats are preserved
//   - skill tree is preserved (chosen path + unlocked nodes)
//   - loyalty resets to 100 (fresh bond with the new form)
//   - a global announcement is sent if it's a final-stage evolution

const registry = require('./summonRegistry');
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');
const botConfig = require('../../botConfig');

// Evolution requirements by target tier
const EVOLUTION_REQUIREMENTS = {
  2: {
    levelReq: 15,
    essenceId: 'summon_essence_t2',
    essenceName: 'Summon Essence (T2)',
    zeniCost: 10000,
    tier: 'ASCENDED',
  },
  3: {
    levelReq: 30,
    essenceId: 'summon_essence_t3',
    essenceName: 'Summon Essence (T3)',
    zeniCost: 50000,
    tier: 'TRANSCENDENT',
  },
};

/**
 * Check if a summon can evolve.
 * Returns { canEvolve: boolean, reason?: string, nextSpecies?: string, reqs?: object }
 */
function canEvolve(summon) {
  if (!summon) return { canEvolve: false, reason: 'Invalid summon.' };

  const species = registry.getSpecies(summon.species);
  if (!species) return { canEvolve: false, reason: 'Unknown species.' };

  const stages = species.evolutionStages || [];
  const currentStageIdx = stages.indexOf(summon.species);

  // If the species isn't in its own evolutionStages (edge case), check evolvedFrom
  if (currentStageIdx === -1) {
    return { canEvolve: false, reason: 'This summon cannot evolve.' };
  }

  // Check if already at max stage
  if (currentStageIdx >= stages.length - 1) {
    return { canEvolve: false, reason: 'This summon is already at its final evolution stage.' };
  }

  const nextSpeciesId = stages[currentStageIdx + 1];
  const nextSpecies = registry.getSpecies(nextSpeciesId);
  if (!nextSpecies) {
    return { canEvolve: false, reason: 'Evolution form not yet implemented.' };
  }

  const targetTier = (currentStageIdx + 1) + 1; // stage 0→tier 2, stage 1→tier 3
  const reqs = EVOLUTION_REQUIREMENTS[targetTier];
  if (!reqs) {
    return { canEvolve: false, reason: 'No evolution requirements defined for this tier.' };
  }

  return {
    canEvolve: true,
    nextSpecies: nextSpeciesId,
    nextSpeciesData: nextSpecies,
    targetTier,
    reqs,
  };
}

/**
 * Evolve a summon to its next stage.
 * Consumes essence + Zeni. Updates species, stats, tier, rarity.
 * Returns { success, message }
 */
async function evolveSummon(summon) {
  const check = canEvolve(summon);
  if (!check.canEvolve) {
    return { success: false, message: `❌ ${check.reason}` };
  }

  const { nextSpecies, nextSpeciesData, reqs } = check;
  const ownerJid = summon.ownerJid;

  // Check level
  if (summon.level < reqs.levelReq) {
    return { success: false, message: `❌ Need level ${reqs.levelReq} to evolve (currently L${summon.level}).` };
  }

  // Check essence
  if (!inventorySystem.hasItem(ownerJid, reqs.essenceId, 1)) {
    return { success: false, message: `❌ Need 1x ${reqs.essenceName}. Drop it from Abyss bosses.` };
  }

  // Check Zeni
  const balance = economy.getGold(ownerJid);
  if (balance < reqs.zeniCost) {
    return { success: false, message: `❌ Need ${reqs.zeniCost.toLocaleString()} Zeni (have ${balance.toLocaleString()}).` };
  }

  // Consume resources
  inventorySystem.removeItem(ownerJid, reqs.essenceId, 1);
  economy.removeMoney(ownerJid, reqs.zeniCost, `Summon evolution: ${summon.species} → ${nextSpecies}`);

  // Save old species name for the message
  const oldSpecies = registry.getSpecies(summon.species);
  const oldName = oldSpecies?.name || summon.species;

  // Evolve the summon
  summon.species = nextSpecies;
  summon.archetype = nextSpeciesData.archetype;
  summon.element = nextSpeciesData.element;
  summon.baseStats = {
    hp: nextSpeciesData.baseStats.hp,
    atk: nextSpeciesData.baseStats.atk,
    def: nextSpeciesData.baseStats.def,
    mag: nextSpeciesData.baseStats.mag,
    spd: nextSpeciesData.baseStats.spd,
  };
  summon.tier = reqs.tier;
  summon.rarity = nextSpeciesData.rarity || summon.rarity;
  summon.loyalty = 100; // fresh bond
  await summon.save();

  // Build success message
  const ZENI = botConfig.getCurrency().symbol;
  let msg = `✨ *SUMMON EVOLUTION!*\n\n`;
  msg += `${oldSpecies?.icon || '🐉'} ${oldName} → ${nextSpeciesData.icon} *${nextSpeciesData.name}*\n\n`;
  msg += `📊 *New Stats:*\n`;
  msg += `❤️ HP: ${nextSpeciesData.baseStats.hp}\n`;
  msg += `⚔️ ATK: ${nextSpeciesData.baseStats.atk}\n`;
  msg += `🛡️ DEF: ${nextSpeciesData.baseStats.def}\n`;
  msg += `🔮 MAG: ${nextSpeciesData.baseStats.mag}\n`;
  msg += `💨 SPD: ${nextSpeciesData.baseStats.spd}\n\n`;
  msg += `🏷️ Tier: ${reqs.tier} | Rarity: ${nextSpeciesData.rarity}\n`;
  msg += `💖 Loyalty: Reset to 100\n\n`;
  msg += `_${nextSpeciesData.desc}_\n\n`;
  msg += `_Cost: 1x ${reqs.essenceName} + ${ZENI}${reqs.zeniCost.toLocaleString()}_`;

  // Check if this was the final evolution
  const stages = nextSpeciesData.evolutionStages || [];
  const newStageIdx = stages.indexOf(nextSpecies);
  if (newStageIdx === stages.length - 1) {
    msg += `\n\n🎉 *FINAL EVOLUTION REACHED!* This summon has achieved its ultimate form!`;
  }

  return { success: true, message: msg, summon };
}

module.exports = {
  EVOLUTION_REQUIREMENTS,
  canEvolve,
  evolveSummon,
};
