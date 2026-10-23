const mongoose = require('mongoose');

// ("add a .j solo resume, like the abyss resume just
// incase combat cuts"): lightweight snapshot of an in-progress SOLO combat,
// refreshed after every player action. If the bot restarts mid-fight (deploy,
// crash, watchdog reconnect), `.j solo resume` rebuilds the fight from here -
// same contract as the Abyss resume (AbyssRun doc), just for regular solo
// quests/dungeons. One document per user (overwritten each turn, deleted when
// the fight or quest ends).
const SoloCombatSnapshotSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
 // Which bot instance owns this fight (SoloCombat lives in SHARED Mongo -
 // same cross-bot leak concern as AbyssRun.botId).
  botId: { type: String, default: null },
  chatId: { type: String, required: true },
 // RAW (unscoped) session key the fight lives under, e.g. "chatId_jid"
  sessionKey: { type: String, required: true },
 // Quest context so the adventure can CONTINUE normally after the fight
 // (same fields the live gameStates entry carries).
  mode: { type: String, default: 'QUEST' },
  dungeonRank: { type: mongoose.Schema.Types.Mixed, default: 0 },
  difficulty: { type: Number, default: 0 },
  encounter: { type: Number, default: 1 },
  maxEncounters: { type: Number, default: 1 },
  currentEncounterType: { type: String, default: 'COMBAT' },
  backgroundPath: { type: String, default: '' },
  combatRound: { type: Number, default: 0 },
 // Full combat enemy objects (stats, currentHP, isDead, spriteIndex, ...)
  enemies: { type: [mongoose.Schema.Types.Mixed], default: [] },
 // Player state at snapshot time
  playerJid: { type: String, required: true },
  playerHp: { type: Number, default: 0 },
  playerMaxHp: { type: Number, default: 0 },
  playerEnergy: { type: Number, default: 0 },
  playerMaxEnergy: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// No TTL index - staleness is graded in code on resume (botScope + age check),
// and snapshots are explicitly cleared when the fight/quest ends.

module.exports = mongoose.model('SoloCombatSnapshot', SoloCombatSnapshotSchema);
