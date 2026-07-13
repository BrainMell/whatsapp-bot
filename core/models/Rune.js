const mongoose = require('mongoose');

// 💡 Phase 3: Rune model — socketable skill augments.
// Each rune is owned by a user, has a type + tier, and may be socketed
// into a specific skill. Unsocketed runes live in the user's rune inventory.
const RuneSchema = new mongoose.Schema({
  runeId: { type: String, required: true, unique: true }, // unique instance ID e.g. "rune_1700000000_abc123"
  ownerJid: { type: String, required: true, index: true },
  type: { type: String, required: true }, // POWER, EFFICIENCY, SPREAD, FOCUS, ENDURANCE, PIERCE
  tier: { type: String, required: true }, // LESSER, NORMAL, GREATER
  // Socketing state
  socketedSkillId: { type: String, default: null }, // skill ID this rune is socketed into
  socketedAt: { type: Date, default: null },
  // Market state (for tradeable runes)
  onMarket: { type: Boolean, default: false },
  marketPrice: { type: Number, default: 0 },
  // Metadata
  obtainedAt: { type: Date, default: Date.now },
  obtainedFrom: { type: String, default: null }, // 'boss_drop', 'raid_reward', 'market_purchase', 'abyss_drop'
}, { timestamps: true });

module.exports = mongoose.model('Rune', RuneSchema);
