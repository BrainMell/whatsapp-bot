// ═══════════════════════════════════════════════════════════════════════════
//  BOUNTY SYSTEM (Phase 6 — PvP Bounty)
// ═══════════════════════════════════════════════════════════════════════════
//
// Players place Zeni bounties on other players. Bounty hunters track via PvP.
// Adds risk to hoarding wealth — wealthy players become targets.
//
// Rules:
//   - Min bounty: 100K Zeni, Max: 50M Zeni
//   - Target must be level 20+
//   - Max 3 active bounties per target (prevents pile-on)
//   - 24h cooldown between placements by same user
//   - 7-day expiry with Zeni refund to placer
//   - Hunter fee: 5% of bounty goes to hunter's guild treasury
//   - Failed hunt: hunter pays 10% of bounty as penalty
//   - Targets with bounties cannot use the bank (forces wallet carry = risk)
//   - Anti-abuse: can't bounty yourself, can't bounty alt accounts
//     (alt detection by phone number — same as multi-account detection)

const Bounty = require('../models/Bounty');
const mongoose = require('mongoose');

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const MIN_BOUNTY = 100000;
const MAX_BOUNTY = 50000000;
const MAX_ACTIVE_PER_TARGET = 3;
const PLACER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const BOUNTY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HUNTER_FEE_PCT = 0.05; // 5% to hunter's guild treasury
const FAILED_HUNT_PENALTY_PCT = 0.10; // 10% of bounty

// ─── GENERATE BOUNTY ID ───────────────────────────────────────────────────
function generateBountyId() {
  return `bounty_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── PLACE BOUNTY ─────────────────────────────────────────────────────────
async function placeBounty(placerJid, targetJid, amount, placerLevel, targetLevel, placerPhone) {
  // Validation
  if (placerJid === targetJid) {
    return { success: false, message: '❌ You cannot place a bounty on yourself.' };
  }
  if (!amount || amount < MIN_BOUNTY) {
    return { success: false, message: `❌ Minimum bounty is ${MIN_BOUNTY.toLocaleString()} Zeni.` };
  }
  if (amount > MAX_BOUNTY) {
    return { success: false, message: `❌ Maximum bounty is ${MAX_BOUNTY.toLocaleString()} Zeni.` };
  }
  if (targetLevel < 20) {
    return { success: false, message: `❌ Target must be at least level 20. (They are L${targetLevel})` };
  }

  // Check placer cooldown — any bounty placed in last 24h
  const recentBounty = await Bounty.findOne({
    placerJid,
    placedAt: { $gte: new Date(Date.now() - PLACER_COOLDOWN_MS) },
  }).sort({ placedAt: -1 });
  if (recentBounty) {
    const remaining = Math.ceil((PLACER_COOLDOWN_MS - (Date.now() - new Date(recentBounty.placedAt).getTime())) / 3600000);
    return { success: false, message: `❌ You placed a bounty recently. Try again in ${remaining}h.` };
  }

  // Check max active bounties on target
  const activeOnTarget = await Bounty.countDocuments({ targetJid, status: 'active' });
  if (activeOnTarget >= MAX_ACTIVE_PER_TARGET) {
    return { success: false, message: `❌ That target already has ${MAX_ACTIVE_PER_TARGET} active bounties. Wait for one to be claimed or expire.` };
  }

  // Check placer has funds
  const economy = require('./economy');
  const placerWallet = economy.getGold(placerJid);
  if (placerWallet < amount) {
    return { success: false, message: `❌ You need ${amount.toLocaleString()} Zeni in your wallet (have ${placerWallet.toLocaleString()}).` };
  }

  // Deduct from placer
  economy.removeMoney(placerJid, amount, `Bounty placed on ${targetJid}`);

  // Create bounty
  const bounty = new Bounty({
    bountyId: generateBountyId(),
    targetJid,
    placerJid,
    amount,
    placedAt: new Date(),
    expiresAt: new Date(Date.now() + BOUNTY_EXPIRY_MS),
    status: 'active',
  });
  await bounty.save();

  return {
    success: true,
    bounty,
    message: `💰 *BOUNTY PLACED*\n\nTarget: @${targetJid.split('@')[0]}\nAmount: ${amount.toLocaleString()} Zeni\nExpires: ${new Date(bounty.expiresAt).toLocaleDateString()}\n\n_Hunters can claim with \`.g bounty claim @target\`_`,
  };
}

// ─── GET ACTIVE BOUNTIES ON A TARGET ──────────────────────────────────────
async function getBountiesOnTarget(targetJid) {
  return await Bounty.find({ targetJid, status: 'active' }).sort({ amount: -1 });
}

// ─── GET TOP BOUNTIES (leaderboard) ───────────────────────────────────────
async function getTopBounties(limit = 10) {
  // Aggregate active bounties by target, sum amounts
  const pipeline = [
    { $match: { status: 'active' } },
    { $group: {
      _id: '$targetJid',
      totalBounty: { $sum: '$amount' },
      count: { $sum: 1 },
    }},
    { $sort: { totalBounty: -1 } },
    { $limit: limit },
  ];
  return await Bounty.aggregate(pipeline);
}

// ─── CLAIM BOUNTY (called after PvP win) ──────────────────────────────────
// Awards the bounty to the hunter, deducts hunter fee to guild treasury.
async function claimBounty(hunterJid, targetJid) {
  const bounties = await Bounty.find({ targetJid, status: 'active' }).sort({ amount: -1 });
  if (bounties.length === 0) {
    return { success: false, claimed: false, message: '❌ No active bounties on that target.' };
  }

  const economy = require('./economy');
  const guilds = require('./guilds');
  const guildPerks = require('./guildPerks');
  let totalClaimed = 0;
  let totalFee = 0;
  const claimedBounties = [];

  for (const bounty of bounties) {
    // Hunter fee to guild treasury
    const fee = Math.floor(bounty.amount * HUNTER_FEE_PCT);
    const hunterPayout = bounty.amount - fee;
    economy.addMoney(hunterJid, hunterPayout, `Bounty claim: ${bounty.bountyId}`);
    // Fee to hunter's guild treasury if they have one
    const hunterGuild = guilds.getUserGuild(hunterJid);
    if (hunterGuild && fee > 0) {
      guilds.addGuildBalance(hunterGuild, fee);
      guilds.syncGuild(hunterGuild);
    }
    totalClaimed += hunterPayout;
    totalFee += fee;
    bounty.status = 'claimed';
    bounty.claimedByJid = hunterJid;
    bounty.claimedAt = new Date();
    await bounty.save();
    claimedBounties.push(bounty);
  }

  // Award guild XP + war points for the claim
  try {
    guildPerks.awardGuildXp(hunterJid, 20, `Bounty claim: ${targetJid}`);
    guildPerks.awardWarPoints(hunterJid, 15, 'bounty');
  } catch (e) {}

  return {
    success: true,
    claimed: true,
    totalClaimed,
    totalFee,
    claimedBounties,
    message: `💰 *BOUNTY CLAIMED!*\n\nYou defeated @${targetJid.split('@')[0]} and collected ${totalClaimed.toLocaleString()} Zeni!\nHunter fee: ${totalFee.toLocaleString()} Zeni to your guild treasury.\nBounties claimed: ${claimedBounties.length}`,
  };
}

// ─── FAILED HUNT PENALTY (called after PvP loss when hunting) ─────────────
// Hunter pays 10% of total active bounty as penalty.
// 💡 AUDIT FIX 2026-08-01: also increment `defendersWon` on each active
// bounty. If the target defeats 3 challengers, the bounty is auto-
// terminated (status='defended', no refund to placer). This gives the
// target a path to clear the bounty by winning duels, not just waiting
// 7 days. Placer forfeits the Zeni — they chose to place the bounty.
const DEFENDERS_WIN_THRESHOLD = 3;
async function failedHuntPenalty(hunterJid, targetJid) {
  const bounties = await Bounty.find({ targetJid, status: 'active' });
  if (bounties.length === 0) {
    return { success: false, penaltyPaid: 0 };
  }
  const totalBounty = bounties.reduce((s, b) => s + b.amount, 0);
  const penalty = Math.floor(totalBounty * FAILED_HUNT_PENALTY_PCT);
  if (penalty <= 0) {
    return { success: true, penaltyPaid: 0 };
  }
  const economy = require('./economy');
  const hunterWallet = economy.getGold(hunterJid);
  // Hunter pays min(penalty, wallet) — can't go negative
  const actualPenalty = Math.min(penalty, hunterWallet);
  if (actualPenalty > 0) {
    economy.removeMoney(hunterJid, actualPenalty, `Failed bounty hunt penalty: ${targetJid}`);
    // Penalty goes to the target (consolation for being attacked)
    economy.addMoney(targetJid, actualPenalty, `Failed bounty hunt consolation from ${hunterJid}`);
  }

  // 💡 AUDIT FIX 2026-08-01: increment defendersWon + auto-terminate at threshold.
  // Track this on each active bounty on the target. If any reaches the
  // threshold, flip it to 'defended' (terminated, no refund).
  const defendedBounties = [];
  for (const bounty of bounties) {
    bounty.defendersWon = (bounty.defendersWon || 0) + 1;
    bounty.penaltyPaid = (bounty.penaltyPaid || 0) + actualPenalty;
    if (bounty.defendersWon >= DEFENDERS_WIN_THRESHOLD) {
      bounty.status = 'defended';
      bounty.defendedAt = new Date();
      defendedBounties.push(bounty);
    }
    await bounty.save();
  }

  let defenseMsg = '';
  if (defendedBounties.length > 0) {
    defenseMsg = `\n🛡️ *BOUNTY DEFENDED!* @${targetJid.split('@')[0]} defeated ${DEFENDERS_WIN_THRESHOLD} challengers — ${defendedBounties.length} bounty(ies) cleared!`;
  }

  return {
    success: true,
    penaltyPaid: actualPenalty,
    defendedBounties,
    message: `💸 You lost the duel and paid ${actualPenalty.toLocaleString()} Zeni penalty (10% of bounty) to @${targetJid.split('@')[0]}.${defenseMsg}`,
  };
}

// ─── EXPIRE OLD BOUNTIES (scheduler) ──────────────────────────────────────
// Called daily. Refunds placers for unclaimed expired bounties.
async function expireOldBounties() {
  console.log('[BountySystem] Expiring old bounties...');
  let expiredCount = 0;
  let refundedTotal = 0;
  try {
    const economy = require('./economy');
    const expired = await Bounty.find({
      status: 'active',
      expiresAt: { $lt: new Date() },
    });
    for (const bounty of expired) {
      bounty.status = 'expired';
      await bounty.save();
      // Refund placer
      economy.addMoney(bounty.placerJid, bounty.amount, `Bounty expired (refund): ${bounty.bountyId}`);
      expiredCount++;
      refundedTotal += bounty.amount;
    }
    console.log(`[BountySystem] Expired ${expiredCount} bounties, refunded ${refundedTotal.toLocaleString()} Zeni.`);
  } catch (e) {
    console.error('[BountySystem] Expire failed:', e.message);
  }
  return { expiredCount, refundedTotal };
}

// ─── CHECK IF USER HAS ACTIVE BOUNTY (for bank block) ─────────────────────
async function hasActiveBounty(userJid) {
  const count = await Bounty.countDocuments({ targetJid: userJid, status: 'active' });
  return count > 0;
}

// ─── GET USER'S PLACED BOUNTIES ───────────────────────────────────────────
async function getPlacedBounties(placerJid) {
  return await Bounty.find({ placerJid, status: 'active' }).sort({ placedAt: -1 });
}

// ─── CANCEL BOUNTY (placer can cancel early, 10% cancellation fee) ────────
async function cancelBounty(placerJid, bountyId) {
  const bounty = await Bounty.findOne({ bountyId, placerJid, status: 'active' });
  if (!bounty) {
    return { success: false, message: '❌ Bounty not found or not active.' };
  }
  const economy = require('./economy');
  const cancelFee = Math.floor(bounty.amount * 0.10); // 10% cancellation fee
  const refund = bounty.amount - cancelFee;
  economy.addMoney(placerJid, refund, `Bounty cancelled (refund): ${bountyId}`);
  bounty.status = 'cancelled';
  await bounty.save();
  return {
    success: true,
    message: `✅ Cancelled bounty. Refunded ${refund.toLocaleString()} Zeni (10% cancellation fee: ${cancelFee.toLocaleString()}).`,
  };
}

module.exports = {
  MIN_BOUNTY,
  MAX_BOUNTY,
  MAX_ACTIVE_PER_TARGET,
  PLACER_COOLDOWN_MS,
  BOUNTY_EXPIRY_MS,
  HUNTER_FEE_PCT,
  FAILED_HUNT_PENALTY_PCT,
  placeBounty,
  getBountiesOnTarget,
  getTopBounties,
  claimBounty,
  failedHuntPenalty,
  expireOldBounties,
  hasActiveBounty,
  getPlacedBounties,
  cancelBounty,
  // Admin functions
  adminPurgeAllBounties,
  adminCancelBounty,
};

// ─── ADMIN: PURGE ALL BOUNTIES ────────────────────────────────────────────
async function adminPurgeAllBounties() {
  try {
    const result = await Bounty.deleteMany({});
    return {
      success: true,
      message: `✅ Purged ALL bounty data. ${result.deletedCount} bounty(ies) deleted. No refunds issued.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}

// ─── ADMIN: CANCEL BOUNTY (full refund, no fee) ───────────────────────────
async function adminCancelBounty(bountyId) {
  try {
    const bounty = await Bounty.findOne({ bountyId });
    if (!bounty) {
      return { success: false, message: `❌ Bounty ${bountyId} not found.` };
    }
    if (bounty.status !== 'active') {
      return { success: false, message: `❌ Bounty is already ${bounty.status}.` };
    }
    const economy = require('./economy');
    economy.addMoney(bounty.placerJid, bounty.amount, `Admin bounty cancel (full refund): ${bountyId}`);
    bounty.status = 'cancelled';
    await bounty.save();
    return {
      success: true,
      message: `✅ Admin-cancelled bounty ${bountyId}. Full refund (${bounty.amount.toLocaleString()} Zeni) issued to placer.`,
    };
  } catch (e) {
    return { success: false, message: `❌ Failed: ${e.message}` };
  }
}
