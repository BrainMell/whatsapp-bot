const mongoose = require('mongoose');
const economy = require('../rpg/economy');

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN SANDBOX - Isolated Test Characters for RPG Mods (Item #11)
// ═══════════════════════════════════════════════════════════════════════════
//
//  PROBLEM
//  ───────
//  RPG Mods need to test new skills, classes, boss balance, dungeon flow,
//  evolution trials, and economy features before pushing them to players.
//  Currently they have two bad options:
//    (a) Test on their OWN main account - risks corrupting real progression,
//        and can't test "fresh level 1" scenarios without nuking real stats.
//    (b) Test on a real player's account via `.g admin setlevel` etc. -
//        even worse, mutates a real player's data.
//
//  SOLUTION
//  ────────
//  Each mod (Owner / GlobalMod / RpgMod) gets ONE sandbox test character
//  stored in a SEPARATE MongoDB collection (`adminsandboxes`). The sandbox
//  has its own wallet, stats, class, skills, inventory, equipment, and
//  rank - fully independent from the real User collection. Mods can:
//    - Reset it to a fully stacked test state (level 100 / GOD rank)
//    - Bump it to any level/class/rank for testing
//    - Run dungeons, combat, and trials against it
//    - Wipe it clean and start over
//
//  ISOLATION GUARANTEES
//  ────────────────────
//  1. Separate collection (adminsandboxes) - never queried by economy.js,
//     progression.js, guildAdventure.js, or any real-player code path.
//  2. The sandbox ownerJid is the mod's real JID, but the sandbox is
//     keyed separately - looking up a user by JID in the real User
//     collection will NEVER return a sandbox doc.
//  3. Sandbox data is never aggregated into leaderboards, guild member
//     lists, economy totals, or wealth tax calculations.
//  4. The sandbox has an `isSandbox: true` flag for defensive filtering.
//
//  SCHEMA
//  ──────
//  ownerJid    - the mod who owns this sandbox (unique, one per mod)
//  name        - display name (default: "Sandbox (ModName)")
//  isSandbox   - always true (defensive flag)
//  createdAt   - when the sandbox was first created
//  lastUsedAt  - last time the mod interacted with it
//  resetCount  - how many times the sandbox has been wiped (audit)
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
//  intentionally OMITTED - they're economy/social features that don't make
//  sense for a test character and would just bloat the schema.

const AdminSandboxSchema = new mongoose.Schema({
  // ── Identity ──
  ownerJid: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Sandbox' },
  isSandbox: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  resetCount: { type: Number, default: 0 },
  // Missing on legacy records; new records carry the current migration version.
  schemaVersion: { type: Number },

  // ── Economy (sandbox-scoped, isolated from real economy) ──
  wallet: { type: Number, default: 999999999 }, // stacked sandbox wallet
  bank: { type: Number, default: 999999999 },   // stacked sandbox bank

  // ── RPG Identity ──
  class: { type: String, default: 'WARLORD' },
  adventurerRank: { type: String, default: 'GOD' },
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
    hp: { type: Number, default: 99999 },
    maxHp: { type: Number, default: 99999 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 100 },
    totalEarned: { type: Number, default: 999999999 },
    totalSpent: { type: Number, default: 0 },
    kills: { type: Number, default: 9999 },
    undeadKills: { type: Number, default: 9999 },
  },

  // ── Stat Bonuses (mirrors User.statBonuses) ──
  statBonuses: {
    hp: { type: Number, default: 5000 },
    atk: { type: Number, default: 5000 },
    def: { type: Number, default: 5000 },
    mag: { type: Number, default: 5000 },
    spd: { type: Number, default: 5000 },
    luck: { type: Number, default: 5000 },
    crit: { type: Number, default: 500 },
  },

  // ── Skills ──
  skillPoints: { type: Number, default: 999 },
  skills: { type: Map, of: Number, default: {} },
  completedTrials: { type: [String], default: [
    'INFECTED_COLOSSUS', 'MUTATION_PRIME', 'CORRUPTED_GUARDIAN', 'SHADOW_STALKER',
    'IRON_BODY_GRANDMASTER', 'ANCIENT_WURM', 'SHADOW_LORD', 'ARCANE_SENTINEL',
    'SOUL_EATER', 'ELEMENTAL_PRIMORDIAL', 'GRAVEYARD_LORD', 'CHRONOS_WARDEN',
    'GOLDEN_GOLEM', 'SOUND_REAPER', 'CLOCKWORK_TITAN', 'ELDER_FLAME', 'LEVIATHAN',
    'LEVIATHAN_SPAWN_ALPHA', 'LICH_KING', 'VOID_ASSASSIN', 'ETERNAL_DRAGON',
    'VOID_TITAN', 'PRIMORDIAL_EVIL', 'PRIMORDIAL_CHAOS', 'DEMON_LORD',
    'VOID_CORRUPTED', 'ABYSSAL_WHISPER', 'PRIME_ELEMENT', 'TIME_EATER',
    'SERAPHIM_PRIME', 'GAIA_SENTINEL', 'TREASURE_HOARDER', 'MAESTRO_OF_VOID',
    'MECH_GOD', 'VOID_NECROMANCER'
  ] },
  evolutionHistory: { type: Array, default: [
    { from: 'Fighter', to: 'Warrior', level: 15, timestamp: 0 },
    { from: 'Warrior', to: 'Warlord', level: 50, timestamp: 0 }
  ] },
  evolvedAt: { type: Number, default: 50 },

  // ── Inventory & Equipment ──
  inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  inventorySlots: { type: Number, default: 999 }, // effectively unlimited for testing
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
    level: { type: Number, default: 100 },
    gp: { type: Number, default: 99999 },
    totalGP: { type: Number, default: 99999 },
    statPoints: { type: Number, default: 999 },
    totalXPEarned: { type: Number, default: 0 },
    commandsUsed: { type: Number, default: 0 },
    allocatedStats: {
      hp: { type: Number, default: 100 },
      atk: { type: Number, default: 100 },
      def: { type: Number, default: 100 },
      mag: { type: Number, default: 100 },
      spd: { type: Number, default: 100 },
      luck: { type: Number, default: 100 },
      crit: { type: Number, default: 100 },
    },
    allocatedStatPoints: {
      hp: { type: Number, default: 100 },
      atk: { type: Number, default: 100 },
      def: { type: Number, default: 100 },
      mag: { type: Number, default: 100 },
      spd: { type: Number, default: 100 },
      luck: { type: Number, default: 100 },
      crit: { type: Number, default: 100 },
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
        schemaVersion: 2,
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
        schemaVersion: 2,
        wallet: 999999999,
        bank: 999999999,
        class: 'WARLORD',
        adventurerRank: 'GOD',
        spriteIndex: 0,
        questsCompleted: 0,
        questsWon: 0,
        questsFailed: 0,
        bossesDefeated: 0,
        dragonsKilled: 0,
        pvpWins: 0,
        pvpLosses: 0,
        stats: { hp: 99999, maxHp: 99999, xp: 0, level: 100, totalEarned: 999999999, totalSpent: 0, kills: 9999, undeadKills: 9999 },
        statBonuses: { hp: 5000, atk: 5000, def: 5000, mag: 5000, spd: 5000, luck: 5000, crit: 500 },
        skillPoints: 999,
        skills: {},
        completedTrials: [
          'INFECTED_COLOSSUS', 'MUTATION_PRIME', 'CORRUPTED_GUARDIAN', 'SHADOW_STALKER',
          'IRON_BODY_GRANDMASTER', 'ANCIENT_WURM', 'SHADOW_LORD', 'ARCANE_SENTINEL',
          'SOUL_EATER', 'ELEMENTAL_PRIMORDIAL', 'GRAVEYARD_LORD', 'CHRONOS_WARDEN',
          'GOLDEN_GOLEM', 'SOUND_REAPER', 'CLOCKWORK_TITAN', 'ELDER_FLAME', 'LEVIATHAN',
          'LEVIATHAN_SPAWN_ALPHA', 'LICH_KING', 'VOID_ASSASSIN', 'ETERNAL_DRAGON',
          'VOID_TITAN', 'PRIMORDIAL_EVIL', 'PRIMORDIAL_CHAOS', 'DEMON_LORD',
          'VOID_CORRUPTED', 'ABYSSAL_WHISPER', 'PRIME_ELEMENT', 'TIME_EATER',
          'SERAPHIM_PRIME', 'GAIA_SENTINEL', 'TREASURE_HOARDER', 'MAESTRO_OF_VOID',
          'MECH_GOD', 'VOID_NECROMANCER'
        ],
        evolutionHistory: [
          { from: 'Fighter', to: 'Warrior', level: 15, timestamp: Date.now() },
          { from: 'Warrior', to: 'Warlord', level: 50, timestamp: Date.now() }
        ],
        evolvedAt: 50,
        inventory: {},
        inventorySlots: 999,
        equipment: {},
        progression: {
          xp: 0, level: 100, gp: 99999, totalGP: 99999, statPoints: 999, totalXPEarned: 999999999, commandsUsed: 0,
          allocatedStats: { hp: 100, atk: 100, def: 100, mag: 100, spd: 100, luck: 100, crit: 100 },
          allocatedStatPoints: { hp: 100, atk: 100, def: 100, mag: 100, spd: 100, luck: 100, crit: 100 },
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
// Pass a partial update object - only the specified fields are mutated.
AdminSandboxSchema.statics.patch = async function(ownerJid, updateObj) {
  const updated = await this.findOneAndUpdate(
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

  // Keep the in-memory sandbox user in sync while it is active. Before this,
  // setlevel/setclass/setrank/setstat and inventory/skill grants often updated
  // MongoDB only, while gameplay continued using stale level/class/skills.
  try {
    const engine = require('../engine');
    const sandboxJid = engine.getSandboxJid(ownerJid);
    const live = sandboxJid && economy.economyData.get(sandboxJid);
    if (live && updateObj && typeof updateObj === 'object') {
      for (const [rawPath, value] of Object.entries(updateObj)) {
        const keys = rawPath.split('.');
        let cursor = live;
        for (const key of keys.slice(0, -1)) {
          const next = cursor instanceof Map ? cursor.get(key) : cursor[key];
          if (!next || typeof next !== 'object') {
            const created = {};
            if (cursor instanceof Map) cursor.set(key, created);
            else cursor[key] = created;
          }
          cursor = cursor instanceof Map ? cursor.get(key) : cursor[key];
        }
        const last = keys[keys.length - 1];
        if (cursor instanceof Map) cursor.set(last, value);
        else cursor[last] = value;
      }
    }
  } catch (e) {
    // Database persistence remains authoritative; syncing is best-effort if
    // the engine is not fully initialized during boot or shutdown.
  }

  return updated;
};

module.exports = mongoose.model('AdminSandbox', AdminSandboxSchema);
