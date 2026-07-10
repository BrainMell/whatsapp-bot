const mongoose = require('mongoose');

// 💡 Phase 5: RaidBoss — server-wide weekly raid.
// Spawns every Sunday 00:00 UTC. Players join and merge into "The Avatar".
// Each round, players vote on which skill the Avatar uses. Boss responds.
// Continues until boss dies (win) or all players dead (loss) or 24h elapsed.
const RaidAttackerSchema = new mongoose.Schema({
  jid: { type: String, required: true },
  class: { type: String, default: null },
  level: { type: Number, default: 1 },
  joinedAt: { type: Date, default: Date.now },
  damageDealt: { type: Number, default: 0 },
  votesCast: { type: Number, default: 0 },
  isDead: { type: Boolean, default: false },
  contribution: { type: Number, default: 0 }, // weighted contribution score
}, { _id: false });

const RaidVoteSchema = new mongoose.Schema({
  jid: { type: String, required: true },
  skillIndex: { type: Number, required: true }, // 0-4
  castAt: { type: Date, default: Date.now },
}, { _id: false });

const RaidBossSchema = new mongoose.Schema({
  weekKey: { type: String, required: true, unique: true, index: true }, // e.g. "2026-W28"
  bossId: { type: String, required: true }, // rotates: ELDER_CHAOS, VOID_TITAN, ABYSSAL_GOD, ANCIENT_DRAGON
  bossName: { type: String, required: true },
  bossHp: { type: Number, required: true },
  bossMaxHp: { type: Number, required: true },
  bossAtk: { type: Number, default: 0 },
  bossDef: { type: Number, default: 0 },
  bossLevel: { type: Number, default: 100 },
  bossPhase: { type: Number, default: 1 }, // 1, 2, 3 (phases trigger at HP thresholds)
  // Avatar state — the merged player entity
  avatar: {
    class: { type: String, default: null },      // most common class among participants
    className: { type: String, default: 'Avatar' },
    hp: { type: Number, default: 0 },
    maxHp: { type: Number, default: 0 },
    atk: { type: Number, default: 0 },
    def: { type: Number, default: 0 },
    spd: { type: Number, default: 0 },
    energy: { type: Number, default: 100 },
    maxEnergy: { type: Number, default: 100 },
    skills: [{ type: mongoose.Schema.Types.Mixed }], // 5 skills from top 5 classes
  },
  // Attackers — all joined players
  attackers: [RaidAttackerSchema],
  attackerCount: { type: Number, default: 0 },
  // Current round's votes
  currentVotes: [RaidVoteSchema],
  votingRound: { type: Number, default: 0 },
  votingClosesAt: { type: Date, default: null }, // 60s window
  // Status: 'spawning', 'active', 'won', 'lost', 'fled'
  status: { type: String, default: 'spawning' },
  round: { type: Number, default: 0 },
  spawnedAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true }, // 24h after spawn
  resolvedAt: { type: Date, default: null },
  // Combat log — last N rounds for display
  combatLog: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('RaidBoss', RaidBossSchema);
