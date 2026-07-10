const mongoose = require('mongoose');

// 💡 Phase 6: Bounty — Zeni bounty placed on a player. Claimed via PvP.
// Max 3 active bounties per target. 7-day expiry with Zeni refund.
// Targets with bounties cannot use the bank (forces wallet carry = risk).
const BountySchema = new mongoose.Schema({
  bountyId: { type: String, required: true, unique: true }, // e.g. "bounty_1700000000_abc"
  targetJid: { type: String, required: true, index: true },
  placerJid: { type: String, required: true },
  amount: { type: Number, required: true }, // Zeni
  placedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // 7 days from placedAt
  status: { type: String, enum: ['active', 'claimed', 'expired', 'cancelled'], default: 'active' },
  // Claim info (when status = 'claimed')
  claimedByJid: { type: String, default: null },
  claimedAt: { type: Date, default: null },
  // Penalty info (when a hunter lost the duel — 10% of bounty paid as penalty)
  penaltyPaid: { type: Number, default: 0 },
}, { timestamps: true });

BountySchema.index({ targetJid: 1, status: 1 });
BountySchema.index({ placerJid: 1, status: 1 });
BountySchema.index({ expiresAt: 1, status: 1 });

module.exports = mongoose.model('Bounty', BountySchema);
