const mongoose = require('mongoose');

// 💡 Phase 4: AbyssRun — tracks a single player's active Abyss run.
// One active run per user at a time. Deleted on death or retreat.
// Leaderboard entries (AbyssLeaderboard) persist after the run ends.
const AbyssRunSchema = new mongoose.Schema({
  // 💡 QA FIX: removed `unique: true` — it prevented players from starting
  // new runs after their first run completed/died (E11000 duplicate key).
  // Now multiple AbyssRun documents can exist per user (active + history).
  userId: { type: String, required: true, index: true },
  currentFloor: { type: Number, default: 1 },
  monstersKilled: { type: Number, default: 0 },
  bossesKilled: { type: Number, default: 0 },
  // Loot accumulator — tracks XP + gold earned during the run.
  // On death: player keeps 10%. On retreat: player keeps 100%.
  lootAccumulator: {
    xp: { type: Number, default: 0 },
    gold: { type: Number, default: 0 },
    runes: [{ type: String }], // runeIds dropped during the run
    items: [{ type: String }], // itemIds dropped during the run
  },
  // Combat state — the current floor's enemy/boss
  // 💡 FIX 2026-08-31: changed from a strict flat sub-schema to Mixed.
  // Wild-summon encounters store their stats NESTED (enemy.stats.{hp,...})
  // plus extra fields (isWildSummon, icon, abilities, xpReward, goldReward)
  // — the strict sub-schema stripped all of them on save, feeding NaN-HP
  // unkillable enemies into startAbyssCombat. Readers already handle both
  // shapes (`enemy.stats?.hp ?? enemy.hp`), so Mixed is safe for regular
  // flat enemies too.
  currentEnemy: { type: mongoose.Schema.Types.Mixed, default: null },
  // 💡 FIX 2026-07-31 Bug #1: These fields were referenced in code but NOT
  // in the schema. Mongoose strict mode silently stripped them on save,
  // causing treasure/event floors to be completely broken (the encounter
  // type was lost between commands). Now properly defined.
  currentEncounterType: { type: String, default: 'combat' }, // 'combat' | 'treasure' | 'event' | 'wild_summon'
  currentEncounterData: { type: mongoose.Schema.Types.Mixed, default: null },
  // Player state snapshot at run start (so we can restore on death)
  // 💡 FIX 2026-08-31: added atk/def/spd — TRAP events roll against these
  // stats (playerStats[choice.stat]), but only hp/energy were snapshotted,
  // so def/spd checks always fell back to 10 and ALWAYS failed.
  playerSnapshot: {
    hp: { type: Number, default: 0 },
    maxHp: { type: Number, default: 0 },
    energy: { type: Number, default: 0 },
    maxEnergy: { type: Number, default: 0 },
    atk: { type: Number, default: 10 },
    def: { type: Number, default: 5 },
    spd: { type: Number, default: 5 },
  },
  // Current player HP/energy during the run (separate from playerSnapshot
  // so we can track damage taken during the run)
  currentHp: { type: Number, default: 0 },
  currentEnergy: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  lastActionAt: { type: Date, default: Date.now },
  // Status: 'active', 'completed' (retreated), 'failed' (died)
  status: { type: String, default: 'active' },
  // Run score (computed on death/retreat)
  finalScore: { type: Number, default: 0 },
  finalFloor: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('AbyssRun', AbyssRunSchema);
