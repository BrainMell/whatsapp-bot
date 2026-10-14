const mongoose = require('mongoose');

// 💡 2026-10-14 (owner: "Add a continue command for group quests. In fact if
// the bot restarts the game should automatically continue even if the command
// isn't sent - it's usually for solo but make it for group quests too"):
// GROUP twin of SoloCombatSnapshot. One document per GROUP chat (chatId),
// upserted at group-fight start + refreshed after every completed action,
// deleted when the quest/fight ends — so `.j quest resume` can rebuild a
// party fight cut by a restart, and the boot auto-resume sweep can continue
// it WITHOUT anyone typing anything. Same contract as the solo snapshot,
// but the whole party rides along (players[] as Mixed, solo keeps its
// one-player-per-doc shape).
const GroupCombatSnapshotSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  // Which bot instance owns this fight (SHARED Mongo — same cross-bot
  // scoping as SoloCombatSnapshot.botId / AbyssRun.botId).
  botId: { type: String, default: null },
  // RAW (unscoped) session key the fight lives under (= the group chatId
  // for group adventures).
  sessionKey: { type: String, required: true },
  // Quest context so the adventure can CONTINUE normally after the fight.
  mode: { type: String, default: 'QUEST' },
  dungeonRank: { type: mongoose.Schema.Types.Mixed, default: 0 },
  difficulty: { type: Number, default: 0 },
  encounter: { type: Number, default: 1 },
  maxEncounters: { type: Number, default: 1 },
  currentEncounterType: { type: String, default: 'COMBAT' },
  backgroundPath: { type: String, default: '' },
  combatRound: { type: Number, default: 0 },
  // Full combat enemy objects (same shape as SoloCombatSnapshot.enemies).
  enemies: { type: mongoose.Schema.Types.Mixed, default: [] },
  // Full party at snapshot time (jid, name, class, stats incl hp/energy,
  // isDead, equipment, statusEffects, xpEarned/goldEarned/combatStats).
  players: { type: mongoose.Schema.Types.Mixed, default: [] },
  playerJids: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// No TTL index — staleness is graded in code on resume (botScope + 2h age
// check), and the boot sweep bulk-clears stale docs for this botId.

module.exports = mongoose.model('GroupCombatSnapshot', GroupCombatSnapshotSchema);
