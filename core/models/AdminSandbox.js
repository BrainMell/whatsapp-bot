const mongoose = require('mongoose');
const economy = require('../rpg/economy');

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN SANDBOX — Isolated Test Characters for RPG Mods (Item #11)
// ═══════════════════════════════════════════════════════════════════════════
//
//  PROBLEM
//  ───────
//  RPG Mods need to test new skills, classes, boss balance, dungeon flow,
//  evolution trials, and economy features before pushing them to players.
//  Currently they have two bad options:
//    (a) Test on their OWN main account — risks corrupting real progression,
//        and can't test "fresh level 1" scenarios without nuking real stats.
//    (b) Test on a real player's account via `.g admin setlevel` etc. —
//        even worse, mutates a real player's data.
//
//  SOLUTION
//  ────────
//  Each mod (Owner / GlobalMod / RpgMod) gets ONE sandbox test character
//  stored in a SEPARATE MongoDB collection (`adminsandboxes`). The sandbox
//  has its own wallet, stats, class, skills, inventory, equipment, and
//  rank — fully independent from the real User collection. Mods can:
//    - Reset it to level 1 with starting gear
//    - Bump it to any level/class/rank for testing
//    - Run dungeons, combat, and trials against it
//    - Wipe it clean and start over
//
//  ISOLATION GUARANTEES
//  ────────────────────
//  1. Separate collection (adminsandboxes) — never queried by economy.js,
//     progression.js, guildAdventure.js, or any real-player code path.
//  2. The sandbox ownerJid is the mod's real JID, but the sandbox is
//     keyed separately — looking up a user by JID in the real User
//     collection will NEVER return a sandbox doc.
//  3. Sandbox data is never aggregated into leaderboards, guild member
//     lists, economy totals, or wealth tax calculations.
//  4. The sandbox has an `isSandbox: true` flag for defensive filtering.
//
//  SCHEMA
//  ──────
//  ownerJid    — the mod who owns this sandbox (unique, one per mod)
//  name        — display name (default: "Sandbox (ModName)")
//  isSandbox   — always true (defensive flag)
//  createdAt   — when the sandbox was first created
//  lastUsedAt  — last time the mod interacted with it
//  resetCount  — how many times the sandbox has been wiped (audit)
//
//  The rest mirrors the User model's RPG-relevant fields so the sandbox
//  can be passed to combat/dungeon/trial code paths with minimal adapter
//  logic:
//    wallet, bank, class, adventurerRank, spriteIndex,
//    stats { hp, maxHp, level, xp, ... },
//    statBonuses, skillPoints, skills, completedTrials, evolutionHistory,
//    inventory, inventorySlots, equipment,
//    progression { xp, level, gp, statPoints, allocatedStats, ... },
//    questsCompleted, questsWon, bossesDefeated, dragonsKilled
//
//  NOTE: This is a SANDBOX. Fields like `lastDaily`, `lastRob`, `jailUntil`,
//  `profile`, `membership`, `portfolio`, `investments`, `eventTokens` are
//  intentionally OMITTED — they're economy/social features that don't make
//  sense for a test character and would just bloat the schema.

const AdminSandboxSchema = new mongoose.Schema({
  // ── Identity ──
  ownerJid: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Sandbox' },
  isSandbox: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  resetCount: { type: Number, default: 0 },

  // ── Economy (sandbox-scoped, isolated from real economy) ──
  wallet: { type: Number, default: 100000 },   // generous starting cash for testing
  bank: { type: Number, default: 1000000 },     // generous bank for testing

  // ── RPG Identity ──
  class: { type: String, default: 'FIGHTER' },
  adventurerRank: { type: String, default: 'F' },
  spriteIndex: { type: Number, default: 0 },

  // ── Quest / Combat Stats ──
  questsCompleted: { type: Number, default: 0 },
  questsWon: { type: Number, default: 0 },
  questsFailed: { type: Number, default: 0 },
  bossesDefeated: { type: Number, default: 0 },
  dragonsKilled: { type: Number, default: 0 },
  pvpWins: { type: Number, default: 0 },
  pvpLosses: { type: Number, default: 0 },

  // ── Combat Stats (mirrors User.stats) ──
  stats: {
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    kills: { type: Number, default: 0 },
    undeadKills: { type: Number, default: 0 },
  },

  // ── Stat Bonuses (mirrors User.statBonuses) ──
  statBonuses: {
    hp: { type: Number, default: 0 },
    atk: { type: Number, default: 0 },
    def: { type: Number, default: 0 },
    mag: { type: Number, default: 0 },
    spd: { type: Number, default: 0 },
    luck: { type: Number, default: 0 },
    crit: { type: Number, default: 0 },
  },

  // ── Skills ──
  skillPoints: { type: Number, default: 0 },
  skills: { type: Map, of: Number, default: {} },
  completedTrials: { type: [String], default: [] },
  evolutionHistory: { type: Array, default: [] },
  evolvedAt: { type: Number, default: 0 },

  // ── Inventory & Equipment ──
  inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  inventorySlots: { type: Number, default: 50 }, // generous for testing
  equipment: {
    main_hand: { type: Object, default: null },
    off_hand: { type: Object, default: null },
    armor: { type: Object, default: null },
    helmet: { type: Object, default: null },
    boots: { type: Object, default: null },
    ring: { type: Object, default: null },
    amulet: { type: Object, default: null },
    cloak: { type: Object, default: null },
    gloves: { type: Object, default: null },
  },

  // ── Progression (mirrors User.progression) ──
  progression: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    gp: { type: Number, default: 0 },
    totalGP: { type: Number, default: 0 },
    statPoints: { type: Number, default: 0 },
    totalXPEarned: { type: Number, default: 0 },
    commandsUsed: { type: Number, default: 0 },
    allocatedStats: {
      hp: { type: Number, default: 0 },
      atk: { type: Number, default: 0 },
      def: { type: Number, default: 0 },
      mag: { type: Number, default: 0 },
      spd: { type: Number, default: 0 },
      luck: { type: Number, default: 0 },
      crit: { type: Number, default: 0 },
    },
    allocatedStatPoints: {
      hp: { type: Number, default: 0 },
      atk: { type: Number, default: 0 },
      def: { type: Number, default: 0 },
      mag: { type: Number, default: 0 },
      spd: { type: Number, default: 0 },
      luck: { type: Number, default: 0 },
      crit: { type: Number, default: 0 },
    },
    achievements: { type: Array, default: [] },
  },

  // ── Sandbox Test Log (audit trail of admin actions on this sandbox) ──
  testLog: { type: Array, default: [] },

}, { timestamps: true, minimize: false });

// ═══════════════════════════════════════════════════════════════════════════
//  STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Get or create a sandbox for a mod JID. Returns the sandbox doc (lean).
AdminSandboxSchema.statics.getOrCreate = function(ownerJid, ownerName) {
  return this.findOneAndUpdate(
    { ownerJid },
    {
      $setOnInsert: {
        ownerJid,
        name: `Sandbox (${ownerName || economy.getDisplayName(ownerJid)})`,
        isSandbox: true,
      },
      $set: { lastUsedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean().exec();
};

// Reset a sandbox to default starting state. Increments resetCount for audit.
AdminSandboxSchema.statics.reset = function(ownerJid) {
  return this.findOneAndUpdate(
    { ownerJid },
    {
      $set: {
        wallet: 100000,
        bank: 1000000,
        class: 'FIGHTER',
        adventurerRank: 'F',
        spriteIndex: 0,
        questsCompleted: 0,
        questsWon: 0,
        questsFailed: 0,
        bossesDefeated: 0,
        dragonsKilled: 0,
        pvpWins: 0,
        pvpLosses: 0,
        stats: { hp: 100, maxHp: 100, xp: 0, level: 1, totalEarned: 0, totalSpent: 0, kills: 0, undeadKills: 0 },
        statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
        skillPoints: 0,
        skills: {},
        completedTrials: [],
        evolutionHistory: [],
        evolvedAt: 0,
        inventory: {},
        equipment: {},
        progression: {
          xp: 0, level: 1, gp: 0, totalGP: 0, statPoints: 0, totalXPEarned: 0, commandsUsed: 0,
          allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
          allocatedStatPoints: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
          achievements: [],
        },
        lastUsedAt: new Date(),
      },
      $inc: { resetCount: 1 },
      $push: {
        testLog: {
          action: 'reset',
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  ).lean().exec();
};

// Append a test-log entry (audit trail of admin actions on the sandbox).
AdminSandboxSchema.statics.logAction = function(ownerJid, action, details) {
  return this.updateOne(
    { ownerJid },
    {
      $set: { lastUsedAt: new Date() },
      $push: {
        testLog: {
          action,
          details: details || null,
          timestamp: new Date(),
        },
      },
    }
  ).exec();
};

// Update arbitrary fields on the sandbox (used by setlevel, setstat, etc.)
// Pass a partial update object — only the specified fields are mutated.
AdminSandboxSchema.statics.patch = function(ownerJid, updateObj) {
  return this.findOneAndUpdate(
    { ownerJid },
    {
      $set: { ...updateObj, lastUsedAt: new Date() },
      $push: {
        testLog: {
          action: 'patch',
          details: updateObj,
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  ).lean().exec();
};

module.exports = mongoose.model('AdminSandbox', AdminSandboxSchema);
