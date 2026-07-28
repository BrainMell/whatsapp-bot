// ═══════════════════════════════════════════════════════════════════════════
//  GUILD PERKS SYSTEM (Phase 2 — Guild Polish)
// ═══════════════════════════════════════════════════════════════════════════
//
// Centralizes ALL guild perk calculations so they're applied consistently
// across the codebase. Previously the guild system declared perks in flavor
// text (GUILD_ARCHETYPES, GUILD_UPGRADES) but never wired them up — this
// module is the wiring.
//
// Perk sources:
//   1. Archetype perks (ADVENTURER / MERCHANT / RESEARCH)
//   2. Building perks (hall = member cap, training = +XP%, treasury = +gold%)
//   3. Guild level perks (unlocked at guild levels 2/3/5/7/10)
//
// Usage: call the getXpMultiplier / getGoldMultiplier / getSellMultiplier /
// getCraftCostMultiplier functions with a userId, and they return a multiplier
// (1.0 = no bonus, 1.15 = +15%, etc.) that you apply to the base value.

const guilds = require('./guilds');

// ─── ARCHETYPE PERKS ──────────────────────────────────────────────────────
// These are the declared perks from GUILD_ARCHETYPES in guilds.js, now
// actually applied. Values are the bonus percentage (0.15 = +15%).
const ARCHETYPE_PERKS = {
  ADVENTURER: {
    xpMultiplier: 0.15,       // +15% XP from monsters/dungeons
    goldMultiplier: 0.0,
    sellMultiplier: 0.0,
    craftCostReduction: 0.0,
  },
  MERCHANT: {
    xpMultiplier: 0.0,
    goldMultiplier: 0.10,     // +10% gold from dungeons
    sellMultiplier: 0.10,     // +10% sell value
    craftCostReduction: 0.0,
  },
  RESEARCH: {
    xpMultiplier: 0.0,
    goldMultiplier: 0.0,
    sellMultiplier: 0.0,
    craftCostReduction: 0.10, // -10% crafting material cost
  },
};

// ─── BUILDING PERKS ───────────────────────────────────────────────────────
// Per-level bonuses from guild buildings. These stack with archetype perks.
const BUILDING_PERKS = {
  // Hall: +5 max members per level (base 20, +5/level, max 45 at L5)
  hall: {
    memberCapBonus: (level) => level * 5,
  },
  // Training: +5% XP per level (max +25% at L5)
  training: {
    xpMultiplier: (level) => level * 0.05,
  },
  // Treasury: +10% gold per level (max +50% at L5) + enables bank interest
  treasury: {
    goldMultiplier: (level) => level * 0.10,
    interestRate: (level) => level * 0.005, // 0.5% per level per day, max 2.5%
  },
  // 💡 Summoner System (Phase 9): Summon Sanctuary
  // L1: +1 summon slot for all members
  // L2: +5% summon XP
  // L3: +5% summon damage in guild adventures
  // L4: +1 summon slot
  // L5: +10% summon damage
  summonSanctum: {
    slotBonus: (level) => (level >= 1 ? 1 : 0) + (level >= 4 ? 1 : 0),
    xpMultiplier: (level) => level >= 2 ? 0.05 + (level - 2) * 0.02 : 0,
    damageMultiplier: (level) => level >= 3 ? 0.05 + Math.max(0, level - 3) * 0.025 : 0,
  },
};

// ─── GUILD LEVEL PERKS ────────────────────────────────────────────────────
// Unlocked at specific guild levels. These are global perks that apply to
// all members regardless of archetype.
//
// 💡 AUDIT FIX: descriptions now match the actual implemented behavior.
// Previously L5 said "1% daily interest" but the real rate is 0.5% per
// treasury level (max 2.5% at treasury L5). L10 said "Access to GUILD-rank
// dungeon" but no such dungeon exists yet — desc now reflects that. L7 is
// now actually wired up (see economy.js checkAndPromoteRank).
const GUILD_LEVEL_PERKS = {
  2:  { xpBonus: 0.05, desc: '+5% XP for all members' },
  3:  { goldBonus: 0.05, desc: '+5% gold for all members' },
  5:  { bankInterest: true, desc: 'Unlocks guild bank interest (0.5% per Treasury level, max 2.5%)' },
  7:  { skillPointOnRankUp: 1, desc: '+1 skill point (GP) on adventurer rank-up' },
  10: { guildDungeonAccess: true, desc: 'GUILD-rank dungeon access (coming soon)' },
};

// ─── HELPER: get user's guild object ──────────────────────────────────────
function getUserGuildData(userId) {
  if (!userId) return null;
  const guildName = guilds.getUserGuild(userId);
  if (!guildName) return null;
  const guild = guilds.getGuild(guildName);
  if (!guild) return null;
  return { name: guildName, guild };
}

// ─── HELPER: get building level safely ────────────────────────────────────
function getBuildingLevel(guild, buildingId) {
  if (!guild || !guild.buildings) return 0;
  const b = guild.buildings[buildingId];
  return (b && typeof b.level === 'number') ? b.level : 0;
}

// ─── XP MULTIPLIER ─────────────────────────────────────────────────────────
// Returns the total XP multiplier for a user from their guild.
// 1.0 = no bonus. 1.20 = +20% XP.
// Sources: archetype (ADVENTURER +15%) + training building (+5%/level) +
// guild level perks (+5% at L2).
function getXpMultiplier(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 1.0;

  const { guild } = data;
  let bonus = 0;

  // Archetype perk
  const arch = ARCHETYPE_PERKS[guild.type] || ARCHETYPE_PERKS.ADVENTURER;
  bonus += arch.xpMultiplier;

  // Training building
  const trainingLvl = getBuildingLevel(guild, 'training');
  bonus += BUILDING_PERKS.training.xpMultiplier(trainingLvl);

  // Guild level perk (L2 = +5%)
  if (guild.level >= 2) bonus += GUILD_LEVEL_PERKS[2].xpBonus;

  return 1.0 + bonus;
}

// ─── GOLD MULTIPLIER (dungeon rewards) ────────────────────────────────────
// Sources: archetype (MERCHANT +10%) + treasury building (+10%/level) +
// guild level perks (+5% at L3).
function getGoldMultiplier(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 1.0;

  const { guild } = data;
  let bonus = 0;

  const arch = ARCHETYPE_PERKS[guild.type] || ARCHETYPE_PERKS.ADVENTURER;
  bonus += arch.goldMultiplier;

  const treasuryLvl = getBuildingLevel(guild, 'treasury');
  bonus += BUILDING_PERKS.treasury.goldMultiplier(treasuryLvl);

  if (guild.level >= 3) bonus += GUILD_LEVEL_PERKS[3].goldBonus;

  return 1.0 + bonus;
}

// ─── SELL MULTIPLIER (item sell value) ────────────────────────────────────
// Sources: archetype (MERCHANT +10%).
function getSellMultiplier(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 1.0;

  const { guild } = data;
  const arch = ARCHETYPE_PERKS[guild.type] || ARCHETYPE_PERKS.ADVENTURER;
  return 1.0 + arch.sellMultiplier;
}

// ─── CRAFT COST REDUCTION ─────────────────────────────────────────────────
// Returns a fraction (0.0 = no reduction, 0.10 = -10% materials needed).
// Sources: archetype (RESEARCH -10%).
// Applied to material quantities in craftingSystem.js.
function getCraftCostReduction(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 0.0;

  const { guild } = data;
  const arch = ARCHETYPE_PERKS[guild.type] || ARCHETYPE_PERKS.ADVENTURER;
  return arch.craftCostReduction;
}

// ─── SUMMON SANCTUARY PERKS (Phase 9) ─────────────────────────────────────
// Returns summon-related bonuses from the Summon Sanctuary building.
// L1: +1 slot, L2: +5% XP, L3: +5% damage, L4: +1 slot, L5: +10% damage
function getSummonSlotBonus(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 0;
  const { guild } = data;
  const lvl = getBuildingLevel(guild, 'summonSanctum');
  return BUILDING_PERKS.summonSanctum.slotBonus(lvl);
}

function getSummonXpMultiplier(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 0;
  const { guild } = data;
  const lvl = getBuildingLevel(guild, 'summonSanctum');
  return BUILDING_PERKS.summonSanctum.xpMultiplier(lvl);
}

function getSummonDamageMultiplier(userId) {
  const data = getUserGuildData(userId);
  if (!data) return 0;
  const { guild } = data;
  const lvl = getBuildingLevel(guild, 'summonSanctum');
  return BUILDING_PERKS.summonSanctum.damageMultiplier(lvl);
}

// ─── MEMBER CAP ───────────────────────────────────────────────────────────
// Base 20 + 5/level of hall building. Max 45 at hall L5.
function getMemberCap(guild) {
  if (!guild) return 20;
  const hallLvl = getBuildingLevel(guild, 'hall');
  return 20 + BUILDING_PERKS.hall.memberCapBonus(hallLvl);
}

// ─── BANK INTEREST RATE ───────────────────────────────────────────────────
// Returns daily interest rate for guild bank. 0 = no interest.
// Sources: treasury building (0.5%/level) + guild level 5 perk (enables it).
function getBankInterestRate(guild) {
  if (!guild) return 0;
  // Guild level 5 perk required to unlock interest
  if (guild.level < 5) return 0;
  const treasuryLvl = getBuildingLevel(guild, 'treasury');
  return BUILDING_PERKS.treasury.interestRate(treasuryLvl);
}

// ─── GUILD XP AWARD ───────────────────────────────────────────────────────
// Awards guild XP when a member does something noteworthy.
// Called from: dungeon clear, boss kill, PvP win, raid participation.
function awardGuildXp(userId, amount, reason) {
  if (!userId || !amount || amount <= 0) return;
  const guildName = guilds.getUserGuild(userId);
  if (!guildName) return;
  try {
    guilds.addGuildPoints(guildName, Math.floor(amount), reason);
  } catch (e) {
    console.error('[GuildPerks] Failed to award guild XP:', e.message);
  }
}

// ─── GUILD WAR POINTS (for Phase 7) ───────────────────────────────────────
// Awards war points to the user's guild. Called from dungeon/boss/PvP/raid.
function awardWarPoints(userId, amount, reason) {
  if (!userId || !amount || amount <= 0) return;
  const guildName = guilds.getUserGuild(userId);
  if (!guildName) return;
  try {
    const guild = guilds.getGuild(guildName);
    if (!guild) return;
    // Get current week key
    const now = new Date();
    const weekKey = getWeekKey(now);
    // Reset if new week
    if (guild.warPointsWeek !== weekKey) {
      guild.warPointsWeek = weekKey;
      guild.warPoints = 0;
    }
    guild.warPoints = (guild.warPoints || 0) + Math.floor(amount);
    // Note: persistence happens via guilds.syncGuild which is called periodically
  } catch (e) {
    console.error('[GuildPerks] Failed to award war points:', e.message);
  }
}

function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.ceil(((d - firstThursday) / 86400000 + firstThursday.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── GUILD PERK SUMMARY (for display) ─────────────────────────────────────
// Returns a human-readable list of active perks for a user's guild.
function getPerkSummary(userId) {
  const data = getUserGuildData(userId);
  if (!data) return [];

  const { guild } = data;
  const perks = [];

  // Archetype
  const arch = ARCHETYPE_PERKS[guild.type];
  if (arch) {
    if (arch.xpMultiplier > 0) perks.push(`${arch.xpMultiplier * 100}% XP bonus (archetype)`);
    if (arch.goldMultiplier > 0) perks.push(`${arch.goldMultiplier * 100}% gold bonus (archetype)`);
    if (arch.sellMultiplier > 0) perks.push(`${arch.sellMultiplier * 100}% sell value (archetype)`);
    if (arch.craftCostReduction > 0) perks.push(`${arch.craftCostReduction * 100}% craft cost reduction (archetype)`);
  }

  // Buildings
  const hallLvl = getBuildingLevel(guild, 'hall');
  const trainingLvl = getBuildingLevel(guild, 'training');
  const treasuryLvl = getBuildingLevel(guild, 'treasury');

  if (hallLvl > 0) perks.push(`+${hallLvl * 5} member cap (Hall L${hallLvl})`);
  if (trainingLvl > 0) perks.push(`${trainingLvl * 5}% XP bonus (Training L${trainingLvl})`);
  if (treasuryLvl > 0) perks.push(`${treasuryLvl * 10}% gold bonus (Treasury L${treasuryLvl})`);

  // Guild level perks
  for (const [lvl, perk] of Object.entries(GUILD_LEVEL_PERKS)) {
    if (guild.level >= parseInt(lvl)) {
      perks.push(`${perk.desc} (Guild L${lvl})`);
    }
  }

  return perks;
}

// ─── DAILY BANK INTEREST ──────────────────────────────────────────────────
// Runs daily (scheduled from index.js). Awards interest to guild banks
// based on treasury building level + guild level 5 perk.
// Interest rate: 0.5% per treasury level, max 2.5% at L5.
// Only fires if guild level >= 5 (the perk unlock threshold).
// Capped at 1M interest per day to prevent runaway growth.
async function runDailyInterest() {
  console.log('[GuildPerks] Running daily guild bank interest...');
  let totalPaid = 0;
  let guildsPaid = 0;

  try {
    const guildsModule = require('./guilds');
    const guildData = guildsModule.getGuildInfo();
    if (!guildData || !guildData.guilds) return;

    for (const [guildName, guild] of Object.entries(guildData.guilds)) {
      if (!guild) continue;
      const balance = guild.balance || 0;
      if (balance <= 0) continue;

      const rate = getBankInterestRate(guild);
      if (rate <= 0) continue; // guild level < 5 or treasury L0

      let interest = Math.floor(balance * rate);
      // Cap at 1M per day
      interest = Math.min(interest, 1000000);
      if (interest <= 0) continue;

      guild.balance = balance + interest;
      totalPaid += interest;
      guildsPaid++;

      // Log the interest
      if (guild.pointsHistory) {
        guild.pointsHistory.push({
          type: 'interest',
          amount: interest,
          timestamp: Date.now(),
        });
        if (guild.pointsHistory.length > 50) guild.pointsHistory.shift();
      }

      // Persist
      try {
        guild.lastInterestPayout = new Date();
        guildsModule.syncGuild(guildName);
      } catch (e) {}
    }
  } catch (e) {
    console.error('[GuildPerks] Daily interest failed:', e.message);
  }

  console.log(`[GuildPerks] Interest done. Paid ${guildsPaid} guilds, total ${totalPaid.toLocaleString()} Zeni.`);
  return { guildsPaid, totalPaid };
}

// ─── MEMBER CAP CHECK ─────────────────────────────────────────────────────
// Returns { canRecruit, currentMembers, cap, message }
function canRecruitMember(guild) {
  if (!guild || !guild.members) return { canRecruit: false, message: 'Guild not found' };
  const current = guild.members.length;
  const cap = getMemberCap(guild);
  if (current >= cap) {
    return {
      canRecruit: false,
      currentMembers: current,
      cap,
      message: `❌ Guild is full (${current}/${cap} members). Upgrade the Guild Hall to increase the cap.`,
    };
  }
  return {
    canRecruit: true,
    currentMembers: current,
    cap,
    message: `✅ Slot available (${current}/${cap} members).`,
  };
}

module.exports = {
  ARCHETYPE_PERKS,
  BUILDING_PERKS,
  GUILD_LEVEL_PERKS,
  getXpMultiplier,
  getGoldMultiplier,
  getSellMultiplier,
  getCraftCostReduction,
  getMemberCap,
  getBankInterestRate,
  awardGuildXp,
  awardWarPoints,
  getPerkSummary,
  getUserGuildData,
  getWeekKey,
  runDailyInterest,
  canRecruitMember,
  runDailyLoanProcessing,
  // 💡 Phase 9: Summon Sanctuary perks
  getSummonSlotBonus,
  getSummonXpMultiplier,
  getSummonDamageMultiplier,
};

// ─── DAILY LOAN PROCESSING ─────────────────────────────────────────────────
// Runs daily alongside runDailyInterest. For each overdue loan:
//   - Auto-deduct 10% from the borrower's wallet (forced repayment)
//   - Apply the deducted amount to the loan principal
//   - If wallet is empty, the loan stays overdue and accrues a 5% penalty
//     added to the principal (compounding — encourages repayment)
// Called from index.js scheduler (same as runDailyInterest).
async function runDailyLoanProcessing() {
  console.log('[GuildPerks] Running daily loan processing...');
  let loansProcessed = 0;
  let totalRecovered = 0;
  let penaltiesApplied = 0;

  try {
    const guildsModule = require('./guilds');
    const economy = require('./economy');
    const guildData = guildsModule.getGuildInfo();
    if (!guildData || !guildData.guilds) return;

    const now = Date.now();
    for (const [guildName, guild] of Object.entries(guildData.guilds)) {
      if (!guild || !guild.loans || guild.loans.length === 0) continue;

      for (const loan of guild.loans) {
        if (loan.repaid) continue;
        const dueAt = new Date(loan.dueAt).getTime();
        if (dueAt > now) continue; // not overdue yet

        loansProcessed++;
        // Try to auto-deduct 10% from borrower's wallet
        const deduction = Math.floor(loan.amount * 0.10);
        if (deduction <= 0) continue;

        const borrowerWallet = economy.getGold(loan.borrowerJid);
        if (borrowerWallet >= deduction) {
          // Force-deduct
          economy.removeMoney(loan.borrowerJid, deduction, `Auto-repayment for overdue guild loan`);
          loan.amount -= deduction;
          totalRecovered += deduction;
          // Add deducted amount back to guild bank
          guild.balance = (guild.balance || 0) + deduction;
          if (loan.amount <= 0) {
            loan.repaid = true;
            loan.repaidAt = new Date();
          }
        } else {
          // Borrower can't pay — apply 5% penalty to principal (compounds)
          const penalty = Math.floor(loan.amount * 0.05);
          loan.amount += penalty;
          penaltiesApplied += penalty;
        }
      }

      // Persist
      try { guildsModule.syncGuild(guildName); } catch (e) {}
    }
  } catch (e) {
    console.error('[GuildPerks] Daily loan processing failed:', e.message);
  }

  console.log(`[GuildPerks] Loans done. Processed ${loansProcessed} overdue loans, recovered ${totalRecovered.toLocaleString()} Zeni, applied ${penaltiesApplied.toLocaleString()} in penalties.`);
  return { loansProcessed, totalRecovered, penaltiesApplied };
}


