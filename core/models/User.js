const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  phoneHash: { type: String, default: null, index: true }, // 💡 Phase 6: alt detection
  
  // Basic Econ
  wallet: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  registered: { type: Boolean, default: false },
  nickname: { type: String, default: 'Adventurer' },

  // Timers
  lastDaily: { type: Number, default: 0 },
  lastRob: { type: Number, default: 0 },
  jailUntil: { type: Number, default: 0 },
  prisonUntil: { type: Number, default: 0 },
  robberyStrikes: { type: Number, default: 0 },
  lastClassChange: { type: Number, default: 0 },
  lastFishReset: { type: Number, default: 0 },
  fishCount: { type: Number, default: 0 },
  classChangeCount: { type: Number, default: 0 },
  lastClassChangeReset: { type: Number, default: 0 },

  // RPG Stats
  class: { type: String, default: null },
  adventurerRank: { type: String, default: 'F' },
  spriteIndex: { type: Number, default: 0 },
  
  questGold: { type: Number, default: 0 },
  questsCompleted: { type: Number, default: 0 },
  questsWon: { type: Number, default: 0 },
  questsFailed: { type: Number, default: 0 },
  pvpWins: { type: Number, default: 0 },
  pvpLosses: { type: Number, default: 0 },
  
  // Flexible Objects
  inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  inventorySlots: { type: Number, default: 20 }, // Persistent inventory cap (was missing — caused reset-to-20 bug)
  
  equipment: {
    main_hand: { type: Object, default: null },
    off_hand: { type: Object, default: null },
    armor: { type: Object, default: null },
    helmet: { type: Object, default: null },
    boots: { type: Object, default: null },
    ring: { type: Object, default: null },
    amulet: { type: Object, default: null },
    cloak: { type: Object, default: null },
    gloves: { type: Object, default: null }
  },
  
  stats: {
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalGambled: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    gamesLost: { type: Number, default: 0 },
    biggestWin: { type: Number, default: 0 },
    biggestLoss: { type: Number, default: 0 },
    questsCompleted: { type: Number, default: 0 },
    questsWon: { type: Number, default: 0 },       // Rank mission tracking
    bossesDefeated: { type: Number, default: 0 },   // Rank mission tracking
    dragonsKilled: { type: Number, default: 0 },
    itemsCrafted: { type: Number, default: 0 },     // Rank mission tracking
    itemsEquipped: { type: Number, default: 0 },    // Rank mission tracking
    undeadKills: { type: Number, default: 0 },      // Required for TEMPLAR ascension (was missing — class permanently locked)
    kills: { type: Number, default: 0 },            // Total lifetime kills — required for DOOMSLAYER (req.kills: 500)
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    // 💡 PERSISTENT HP SYSTEM (2026-07-31): currentHP persists across combat.
    // HP lost in any combat (dungeon, raid, PvP, abyss, boss) remains after
    // combat ends. Players heal via .g hospital (free) or rest events.
    // -1 = "not initialized" → first access sets it to maxHP.
    currentHP: { type: Number, default: -1 },
  },
  
  // 💡 AUDIT FIX 2026-08-01: hospital cooldown timestamp. Set by healToFull()
  // when the player uses .g hospital. 12h cooldown prevents free-heal spam
  // and gives the out-of-combat passive regen system room to matter.
  lastHospitalUse: { type: Date, default: null },
  
  statBonuses: {
    hp: { type: Number, default: 0 },
    atk: { type: Number, default: 0 },
    def: { type: Number, default: 0 },
    mag: { type: Number, default: 0 },
    spd: { type: Number, default: 0 },
    luck: { type: Number, default: 0 },
    crit: { type: Number, default: 0 }
  },
  
  professions: {
    mining: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } },
    crafting: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } }
  },
  
  membership: {
    tier: { type: String, default: 'BASIC' },
    expires: { type: Number, default: 0 }
  },
  
  // Banking & Assets
  frozenAssets: {
    wallet: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    reason: { type: String, default: "" }
  },
  portfolio: { type: Map, of: Number, default: {} }, // Stocks
  investments: { type: Array, default: [] }, // Fixed Deposits
  
  // Skills & History
  skillPoints: { type: Number, default: 0 },
  skills: { type: Map, of: Number, default: {} }, // Skill levels
  borrowedSkills: { type: Array, default: [] },
  completedTrials: { type: [String], default: [] },
  evolutionHistory: { type: Array, default: [] },
  evolvedAt: { type: Number, default: 0 },
  history: { type: Array, default: [] }, // Transaction logs

  // Merged Progression Data
  progression: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    gp: { type: Number, default: 0 },
    totalGP: { type: Number, default: 0 },
    statPoints: { type: Number, default: 0 },
    totalXPEarned: { type: Number, default: 0 },
    totalLevelsGained: { type: Number, default: 0 },
    commandsUsed: { type: Number, default: 0 },
    allocatedStats: {
        hp: { type: Number, default: 0 },
        atk: { type: Number, default: 0 },
        def: { type: Number, default: 0 },
        mag: { type: Number, default: 0 },
        spd: { type: Number, default: 0 },
        luck: { type: Number, default: 0 },
        crit: { type: Number, default: 0 }
    },
    // 💡 QA FIX: was missing from schema — Mongoose strict mode stripped it
    // on save, causing the stat soft cap (20 points) to be disabled and
    // resetStats to refund wrong amounts.
    allocatedStatPoints: {
        hp: { type: Number, default: 0 },
        atk: { type: Number, default: 0 },
        def: { type: Number, default: 0 },
        mag: { type: Number, default: 0 },
        spd: { type: Number, default: 0 },
        luck: { type: Number, default: 0 },
        crit: { type: Number, default: 0 }
    },
    achievements: { type: Array, default: [] }
  },

  // Gambling Limits
  gamblingLimits: {
    roulette: {
      count: { type: Number, default: 0 },
      startTime: { type: Number, default: 0 }
    }
  },

  // 💡 CRITICAL FIX 2026-08-31: gamblingProfile / dailyQuests / debt were
  // NEVER in the schema — Mongoose strict mode silently stripped them from
  // every saveUser() $set, so on every restart the daily gambling anti-abuse
  // (house edge ramp, forced-loss, 2M/day net cap, wallet cap), the 5/day
  // quest cap, and auto-debt tracking all reset. Adding the paths makes them
  // persist. Field set mirrors economy.js:449-453 / gambling.js:73-88 /
  // economy.js:2313.
  gamblingProfile: {
    dayKey: { type: String, default: '' },
    roundsToday: { type: Number, default: 0 },
    entryWalletToday: { type: Number, default: 0 },
    withdrawnToday: { type: Number, default: 0 },
    netToday: { type: Number, default: 0 },
  },
  dailyQuests: {
    date: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },
  debt: {
    amount: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    setAt: { type: Number, default: 0 },
  },

  // Event Tokens (for token events — earned by claiming cards, spent in eShop)
  eventTokens: { type: Number, default: 0 },

  // Rank Mission System
  completedRankMissions: { type: [Number], default: [] }, // [1, 2, 3, 4]

  // ── Summoner System ──────────────────────────────────────
  // See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md
  // Summons are stored in a separate Mongoose collection (Summon model),
  // referenced by summonId. This keeps the User document lean.
  summonSlots: { type: Number, default: 3 },                // expandable to 5 via guild perks + rank
  activeSummonId: { type: String, default: null },          // currently deployed summon
  unlockedSummonPassives: { type: [String], default: [] },  // from completing summon trials
  activeResonances: { type: [String], default: [] },        // cached, recomputed on summon changes
  lastSummonTrained: { type: Number, default: 0 },          // daily training cooldown (shared across all summons)
  lastForgedAt: { type: Number, default: 0 },                // Soul Forging cooldown (1 forge/day)
  summonAchievements: { type: [String], default: [] },        // unlocked summon achievements (pilots the achievement system)
  summonStats: {
    captured: { type: Number, default: 0 },
    forged: { type: Number, default: 0 },
    evolved: { type: Number, default: 0 },
    trialsCompleted: { type: Number, default: 0 },
    echoesAbsorbed: { type: Number, default: 0 },
    arenaWins: { type: Number, default: 0 },
    arenaLosses: { type: Number, default: 0 }
  },

  // Taming progress per enemy type (Necromancer capture pipeline).
  // Keyed by enemyType ID, value = kill count. At 10 kills, species is "tamed".
  tamingProgress: { type: Map, of: Number, default: {} },

  // AI Memory & Profile Data
  profile: {
    whatsappName: { type: String, default: null },
    nickname: { type: String, default: null },
    notes: { type: Array, default: [] },
    memories: {
        likes: { type: Array, default: [] },
        dislikes: { type: Array, default: [] },
        hobbies: { type: Array, default: [] },
        personal: { type: Array, default: [] },
        other: { type: Array, default: [] }
    },
    stats: {
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        messageCount: { type: Number, default: 0 }
    },
    relationships: { type: Map, of: Number, default: {} }
  }

}, { timestamps: true, minimize: false });

module.exports = mongoose.model('User', UserSchema);
