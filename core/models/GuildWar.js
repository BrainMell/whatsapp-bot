const mongoose = require('mongoose');

// 💡 Phase 7: GuildWar — weekly multi-event guild competition.
// 4 event types rotate weekly:
//   Week 1: Champion Tournament — admin-curated 1v1 PvP bracket
//   Week 2: Guardian Clash — 3v3 guild team PvP (simulated)
//   Week 3: Monster Hunt — multi-day PvE race (reuses warPoints)
//   Week 4: Stronghold Siege — aggregate activity + RNG
//
// One GuildWar document per week. War runs Monday 00:00 → Sunday 23:00 UTC.
const GuildWarParticipantSchema = new mongoose.Schema({
  guildName: { type: String, required: true },
  points: { type: Number, default: 0 },
  bracket: { type: String, default: null }, // 'champion' or 'open'
  eliminated: { type: Boolean, default: false },
  eliminatedAt: { type: Date, default: null },
  // Champion Tournament: designated champion
  championJid: { type: String, default: null },
  championWins: { type: Number, default: 0 },
  // Guardian Clash: top 3 members
  guardians: [{ type: String }], // jids
  guardianWins: { type: Number, default: 0 },
  // Stronghold Siege
  strongholdLevel: { type: Number, default: 1 },
  strongholdDefended: { type: Boolean, default: true },
}, { _id: false });

const GuildWarSchema = new mongoose.Schema({
  weekKey: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, enum: ['champion_tournament', 'guardian_clash', 'monster_hunt', 'stronghold_siege'] },
  eventName: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true }, // Sunday 23:00 UTC
  status: { type: String, default: 'active', enum: ['active', 'completed'] },
  participants: [GuildWarParticipantSchema],
  // Champion Tournament bracket
  bracket: [{
    round: { type: Number, required: true },
    matchId: { type: String, required: true },
    guildA: { type: String, required: true },
    guildB: { type: String, required: true },
    winner: { type: String, default: null },
    simulated: { type: Boolean, default: true },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
  }],
  // Guardian Clash matchups
  clashMatchups: [{
    round: { type: Number, required: true },
    guildA: { type: String, required: true },
    guildB: { type: String, required: true },
    winner: { type: String, default: null },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
  }],
  // Final results
  results: [{
    rank: { type: Number, required: true },
    guildName: { type: String, required: true },
    points: { type: Number, required: true },
    reward: { type: String, default: null },
  }],
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('GuildWar', GuildWarSchema);
