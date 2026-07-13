const mongoose = require('mongoose');

// 💡 Phase 4: AbyssLeaderboard — persists top Abyss runs.
// Reset weekly by the scheduler in index.js.
// Score = deepestFloor × 100 + monstersKilled × 5
const AbyssLeaderboardSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  deepestFloor: { type: Number, required: true },
  monstersKilled: { type: Number, default: 0 },
  bossesKilled: { type: Number, default: 0 },
  score: { type: Number, required: true },
  result: { type: String, enum: ['retreat', 'death'], required: true },
  weekKey: { type: String, required: true, index: true }, // e.g. "2026-W28"
  completedAt: { type: Date, default: Date.now },
  // Rewards claimed flag — prevents double-claiming
  rewardsClaimed: { type: Boolean, default: false },
}, { timestamps: true });

AbyssLeaderboardSchema.index({ weekKey: 1, score: -1 });

module.exports = mongoose.model('AbyssLeaderboard', AbyssLeaderboardSchema);
