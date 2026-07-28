// ============================================
// ⚔️ SOUL FORGING — fuse 2 summons into 1
// ============================================
// One of the 6 original Summoner System mechanics.
// Two summons are fused into a new summon that inherits traits
// from both, with random mutations. Originals are CONSUMED.
//
// Lineage tracking: up to 5 generations of ancestors.
// Purebred bonus: 3+ generations of same species → +10% all stats.
// Crossbred bonus: diverse lineage → +5% all stats + double mutation chance.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md (section 2.5)

const crypto = require('crypto');
const Summon = require('../models/Summon');
const registry = require('./summonRegistry');
const summonSystem = require('./summonSystem');
const economy = require('./economy');

// ─────────────────────────────────────────────────────────────
// FORGING CONFIG
// ─────────────────────────────────────────────────────────────

const FORGE_CONFIG = {
  STAT_BONUS_MULT: 1.10,           // 10% stat bonus on fused summon
  MAX_MUTATIONS: 3,                // 1-3 random mutations
  MUTATION_CHANCE: 0.5,            // 50% chance per mutation slot
  SOULBOUND_DURATION_DAYS: 7,      // can't trade for 7 days after forging
  COOLDOWN_MS: 24 * 60 * 60 * 1000,  // 1 forge per day per player
  MAX_LINEAGE_GENERATIONS: 5,      // keep last 5 ancestors
  PUREBRED_THRESHOLD: 3,           // 3+ generations of same species
  PUREBRED_BONUS: 0.10,            // +10% all stats
  CROSSBRED_BONUS: 0.05,           // +5% all stats + double mutation chance
  GOLD_COST_BASE: 50000,           // 50K Zeni base cost
  GOLD_COST_PER_LEVEL: 1000        // +1K per total level of both parents
};

// ─────────────────────────────────────────────────────────────
// MUTATION TABLE — random trait changes applied to fused summons
// ─────────────────────────────────────────────────────────────

const MUTATIONS = [
  { id: 'brutal_strength', name: 'Brutal Strength', stat: 'atk', bonus: 0.10, desc: '+10% ATK' },
  { id: 'iron_hide', name: 'Iron Hide', stat: 'def', bonus: 0.10, desc: '+10% DEF' },
  { id: 'arcane_power', name: 'Arcane Power', stat: 'mag', bonus: 0.10, desc: '+10% MAG' },
  { id: 'swift_feet', name: 'Swift Feet', stat: 'spd', bonus: 0.10, desc: '+10% SPD' },
  { id: 'vitality', name: 'Vitality', stat: 'hp', bonus: 0.10, desc: '+10% HP' },
  { id: 'frail_power', name: 'Frail Power', stat: 'atk', bonus: 0.20, penalty: { stat: 'def', mult: 0.10 }, desc: '+20% ATK, -10% DEF' },
  { id: 'glass_cannon', name: 'Glass Cannon', stat: 'atk', bonus: 0.25, penalty: { stat: 'hp', mult: 0.15 }, desc: '+25% ATK, -15% HP' },
  { id: 'fortified', name: 'Fortified', stat: 'def', bonus: 0.15, penalty: { stat: 'spd', mult: 0.10 }, desc: '+15% DEF, -10% SPD' },
  { id: 'ferocious', name: 'Ferocious', stat: 'atk', bonus: 0.15, desc: '+15% ATK (no penalty)' },
  { id: 'ancient_bloodline', name: 'Ancient Bloodline', stat: 'hp', bonus: 0.15, desc: '+15% HP (no penalty)' }
];

// ─────────────────────────────────────────────────────────────
// FORGE — fuse two summons
// ─────────────────────────────────────────────────────────────

/**
 * Fuse two summons into a new summon.
 * Both inputs are CONSUMED (deleted). The output is soulbound for 7 days.
 *
 * @param {string} ownerJid - Owner's JID
 * @param {string} summon1Id - First summon's summonId
 * @param {string} summon2Id - Second summon's summonId
 * @returns {Promise<{success: boolean, message: string, summon?: object}>}
 */
async function forgeSummons(ownerJid, summon1Id, summon2Id) {
  const user = economy.getUser(ownerJid);
  if (!user) {
    return { success: false, message: '❌ User not found.' };
  }

  // 1. Check daily cooldown
  const now = Date.now();
  if (user.lastForgedAt && (now - user.lastForgedAt) < FORGE_CONFIG.COOLDOWN_MS) {
    const remaining = FORGE_CONFIG.COOLDOWN_MS - (now - user.lastForgedAt);
    const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
    return { success: false, message: `❌ Soul Forging on cooldown. Try again in ${hoursLeft}h.` };
  }

  // 2. Validate inputs are different
  if (summon1Id === summon2Id) {
    return { success: false, message: '❌ Cannot forge a summon with itself.' };
  }

  // 3. Load both summons
  const summon1 = await Summon.findOne({ summonId: summon1Id, ownerJid });
  const summon2 = await Summon.findOne({ summonId: summon2Id, ownerJid });

  if (!summon1 || !summon2) {
    return { success: false, message: '❌ One or both summons not found in your collection.' };
  }

  // 4. Validate both summons are forgeable
  const validation = validateForgeable(summon1, summon2, user);
  if (!validation.success) {
    return validation;
  }

  // 5. Check gold cost
  const totalLevel = summon1.level + summon2.level;
  const goldCost = FORGE_CONFIG.GOLD_COST_BASE + (totalLevel * FORGE_CONFIG.GOLD_COST_PER_LEVEL);
  if (user.wallet < goldCost) {
    return { success: false, message: `❌ Insufficient Zeni. Soul Forging costs ${goldCost.toLocaleString()} Zeni (you have ${user.wallet.toLocaleString()}).` };
  }

  // 6. Deduct gold
  const removeResult = economy.removeMoney(ownerJid, goldCost, `Soul Forge: ${summon1.species} + ${summon2.species}`);
  if (!removeResult) {
    return { success: false, message: '❌ Failed to deduct Zeni. Please try again.' };
  }

  // 7. Build the fused summon
  const fusedSpecies = determineFusedSpecies(summon1, summon2);
  const species = registry.getSpecies(fusedSpecies);
  if (!species) {
    // Refund gold
    economy.addMoney(ownerJid, goldCost, 'Soul Forge refund (species not found)');
    return { success: false, message: '❌ Forging failed: invalid species combination.' };
  }

  // 8. Compute fused stats
  const fusedBaseStats = computeFusedStats(summon1, summon2);

  // 9. Determine lineage + purebred/crossbred bonuses
  const lineage = buildLineage(summon1, summon2);
  const { isPurebred, isCrossbred } = analyzeLineage(lineage, fusedSpecies);

  // 10. Apply lineage bonuses
  let lineageBonusMult = 1.0;
  if (isPurebred) lineageBonusMult += FORGE_CONFIG.PUREBRED_BONUS;
  if (isCrossbred) lineageBonusMult += FORGE_CONFIG.CROSSBRED_BONUS;

  for (const stat of Object.keys(fusedBaseStats)) {
    fusedBaseStats[stat] = Math.floor(fusedBaseStats[stat] * lineageBonusMult);
  }

  // 11. Roll mutations
  const mutationCount = isCrossbred ? FORGE_CONFIG.MAX_MUTATIONS : Math.floor(FORGE_CONFIG.MAX_MUTATIONS / 2);
  const appliedMutations = rollMutations(mutationCount);
  applyMutations(fusedBaseStats, appliedMutations);

  // 12. Determine personality (random pick from both parents)
  const fusedPersonality = Math.random() < 0.5 ? summon1.personality : summon2.personality;

  // 13. Determine level (floor of average)
  const fusedLevel = Math.max(1, Math.floor((summon1.level + summon2.level) / 2));
  const rarityConfig = registry.getRarityConfig(species.rarity);
  const cappedLevel = Math.min(fusedLevel, rarityConfig.maxLevel);

  // 14. DELETE both parents BEFORE creating the fused summon
  // This prevents duplication if creation fails.
  try {
    await Summon.deleteMany({ summonId: { $in: [summon1Id, summon2Id] } });
  } catch (e) {
    // Refund gold
    economy.addMoney(ownerJid, goldCost, 'Soul Forge refund (delete failed)');
    return { success: false, message: '❌ Forging failed: could not consume parent summons.' };
  }

  // 15. Create the fused summon
  const fusedSummonId = `sum_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const soulboundUntil = new Date(now + (FORGE_CONFIG.SOULBOUND_DURATION_DAYS * 24 * 60 * 60 * 1000));

  const fused = new Summon({
    summonId: fusedSummonId,
    ownerJid,
    species: fusedSpecies,
    archetype: species.archetype,
    element: species.element,
    tier: 'BASE',
    rarity: species.rarity,
    nickname: null,
    level: cappedLevel,
    xp: 0,
    statPoints: 0,
    allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 },
    baseStats: fusedBaseStats,
    loyalty: Math.max(summon1.loyalty, summon2.loyalty),  // inherit higher loyalty
    personality: fusedPersonality,
    behaviorScore: { aggressive: 0, protective: 0, curious: 0, volatile: 0 },
    lineage,
    socketedRuneIds: [],
    echoId: species.echoId,
    trialCompleted: false,
    forSale: false,
    salePrice: null,
    onAuction: false,
    isLocked: false,
    soulboundUntil,
    obtainedAt: new Date(),
    obtainedFrom: 'forge',
    lastUsedAt: null,
    lastTrainedAt: null
  });

  // 16. Apply level growth (so stats match the fused level)
  summonSystem.applyLevelGrowth(fused, cappedLevel);

  // 17. Apply mutations as a special lineage marker
  if (appliedMutations.length > 0) {
    for (const mut of appliedMutations) {
      fused.lineage.push({
        summonId: `mutation_${mut.id}`,
        species: mut.name,
        level: 0,
        personality: 'MUTATION',
        forgedAt: new Date()
      });
    }
  }

  try {
    await fused.save();
  } catch (e) {
    // This is bad — parents are gone but fused didn't save.
    // Log heavily. The gold is already spent. We can't recover the parents.
    console.error('[Forge] CRITICAL: parents deleted but fused summon failed to save:', e?.message || e);
    return { success: false, message: '❌ CRITICAL ERROR: Parents were consumed but the fused summon failed to save. Contact an admin.' };
  }

  // 18. Update user cooldown
  user.lastForgedAt = now;
  if (user.summonStats) {
    user.summonStats.forged = (user.summonStats.forged || 0) + 1;
  }

  // 19. Refresh resonances
  try {
    await summonSystem.refreshUserResonances(user);
  } catch (e) {}

  // 20. Build success message
  let msg = `⚔️ *SOUL FORGED!*\n\n`;
  msg += `${species.icon} A new *${species.name}* has been born from the fusion!\n\n`;
  msg += `📊 Level ${cappedLevel} | ${species.rarity} | ${species.element}\n`;
  msg += `💖 Loyalty: ${fused.loyalty}/100\n`;
  msg += `🧠 Personality: ${fused.personality}\n`;
  msg += `🆔 \`${fusedSummonId.slice(-8)}\`\n\n`;

  if (isPurebred) {
    msg += `✨ *PUREBRED* — 3+ generations of ${species.name} lineage (+10% stats)\n`;
  }
  if (isCrossbred) {
    msg += `🌟 *HYBRID VIGOR* — diverse lineage (+5% stats, enhanced mutations)\n`;
  }
  if (appliedMutations.length > 0) {
    msg += `\n*MUTATIONS:*\n`;
    for (const mut of appliedMutations) {
      msg += `• ${mut.name} — ${mut.desc}\n`;
    }
  }
  msg += `\n🔒 Soulbound for ${FORGE_CONFIG.SOULBOUND_DURATION_DAYS} days (cannot be traded).`;
  msg += `\n💰 Cost: ${goldCost.toLocaleString()} Zeni`;

  return { success: true, message: msg, summon: fused };
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

function validateForgeable(summon1, summon2, user) {
  // Check neither is for sale
  if (summon1.forSale || summon2.forSale) {
    return { success: false, message: '❌ Cannot forge a summon listed for sale. Cancel the listing first.' };
  }

  // Check neither is soulbound
  const now = new Date();
  if (summon1.soulboundUntil && summon1.soulboundUntil > now) {
    return { success: false, message: '❌ One summon is still soulbound from a previous forge.' };
  }
  if (summon2.soulboundUntil && summon2.soulboundUntil > now) {
    return { success: false, message: '❌ One summon is still soulbound from a previous forge.' };
  }

  // Check neither is locked
  if (summon1.isLocked || summon2.isLocked) {
    return { success: false, message: '❌ Cannot forge a locked summon.' };
  }

  // Check neither is the active summon
  if (user.activeSummonId === summon1.summonId || user.activeSummonId === summon2.summonId) {
    return { success: false, message: '❌ Cannot forge your active summon. Dismiss it first.' };
  }

  // Check both have loyalty > 0
  if (summon1.loyalty <= 0 || summon2.loyalty <= 0) {
    return { success: false, message: '❌ Cannot forge a summon with 0 loyalty.' };
  }

  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// FUSED SPECIES DETERMINATION
// ─────────────────────────────────────────────────────────────

function determineFusedSpecies(summon1, summon2) {
  // If same species, use that species (purity path)
  if (summon1.species === summon2.species) {
    return summon1.species;
  }

  // If same element, prefer the higher-rarity species
  const species1 = registry.getSpecies(summon1.species);
  const species2 = registry.getSpecies(summon2.species);
  if (species1 && species2 && species1.element === species2.element) {
    const rarityOrder = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
    const r1 = rarityOrder.indexOf(species1.rarity);
    const r2 = rarityOrder.indexOf(species2.rarity);
    return r1 >= r2 ? summon1.species : summon2.species;
  }

  // Different elements — use the higher-level parent's species
  return summon1.level >= summon2.level ? summon1.species : summon2.species;
}

// ─────────────────────────────────────────────────────────────
// FUSED STATS — average of both parents × 1.10
// ─────────────────────────────────────────────────────────────

function computeFusedStats(summon1, summon2) {
  const stats = {};
  for (const stat of ['hp', 'atk', 'def', 'mag', 'spd']) {
    const avg = ((summon1.baseStats[stat] || 0) + (summon2.baseStats[stat] || 0)) / 2;
    stats[stat] = Math.floor(avg * FORGE_CONFIG.STAT_BONUS_MULT);
  }
  return stats;
}

// ─────────────────────────────────────────────────────────────
// LINEAGE — build ancestry tree from both parents
// ─────────────────────────────────────────────────────────────

function buildLineage(summon1, summon2) {
  const lineage = [];

  // Add both parents as ancestors
  lineage.push({
    summonId: summon1.summonId,
    species: summon1.species,
    level: summon1.level,
    personality: summon1.personality,
    forgedAt: new Date()
  });
  lineage.push({
    summonId: summon2.summonId,
    species: summon2.species,
    level: summon2.level,
    personality: summon2.personality,
    forgedAt: new Date()
  });

  // Inherit parent lineage (up to MAX_LINEAGE_GENERATIONS total)
  const parentLineage = [
    ...(summon1.lineage || []).filter(l => l.personality !== 'MUTATION' && l.personality !== 'TAMED'),
    ...(summon2.lineage || []).filter(l => l.personality !== 'MUTATION' && l.personality !== 'TAMED')
  ];

  // Add parent lineage, keeping only the most recent up to the cap
  lineage.push(...parentLineage);

  // Trim to max generations (keep the most recent)
  if (lineage.length > FORGE_CONFIG.MAX_LINEAGE_GENERATIONS) {
    return lineage.slice(0, FORGE_CONFIG.MAX_LINEAGE_GENERATIONS);
  }

  return lineage;
}

// ─────────────────────────────────────────────────────────────
// LINEAGE ANALYSIS — purebred vs crossbred
// ─────────────────────────────────────────────────────────────

function analyzeLineage(lineage, fusedSpecies) {
  // Count ancestors of the same species
  const sameSpeciesCount = lineage.filter(l => l.species === fusedSpecies).length;

  // Count distinct species
  const distinctSpecies = new Set(lineage.map(l => l.species)).size;

  return {
    isPurebred: sameSpeciesCount >= FORGE_CONFIG.PUREBRED_THRESHOLD,
    isCrossbred: distinctSpecies >= 3  // 3+ distinct species in lineage
  };
}

// ─────────────────────────────────────────────────────────────
// MUTATIONS — random trait changes
// ─────────────────────────────────────────────────────────────

function rollMutations(maxCount) {
  const applied = [];
  const available = [...MUTATIONS];

  for (let i = 0; i < maxCount && available.length > 0; i++) {
    if (Math.random() > FORGE_CONFIG.MUTATION_CHANCE) break;

    const idx = Math.floor(Math.random() * available.length);
    applied.push(available[idx]);
    available.splice(idx, 1);  // no duplicates
  }

  return applied;
}

function applyMutations(stats, mutations) {
  for (const mut of mutations) {
    // Apply bonus
    if (mut.stat && mut.bonus) {
      stats[mut.stat] = Math.floor((stats[mut.stat] || 0) * (1 + mut.bonus));
    }
    // Apply penalty
    if (mut.penalty) {
      stats[mut.penalty.stat] = Math.floor((stats[mut.penalty.stat] || 0) * (1 - mut.penalty.mult));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  FORGE_CONFIG,
  MUTATIONS,
  forgeSummons,
  validateForgeable,
  determineFusedSpecies,
  computeFusedStats,
  buildLineage,
  analyzeLineage,
  rollMutations,
  applyMutations
};
