const mongoose = require('mongoose');

// ============================================
// 🐉 SUMMON MODEL — persistent companion entities
// ============================================
// Each document = one summon owned by one user.
// Summons are tradeable (mirrors Rune model pattern).
// Combat state (HP, energy, buffs, etc.) is transient —
// rebuilt at combat start from baseStats + level + allocation.
//
// See: /home/z/my-project/download/SUMMONER_SYSTEM_DESIGN.md
// for full architecture.

const SummonSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────
  summonId: { type: String, required: true, unique: true, index: true }, // "sum_<ts>_<rand>"
  ownerJid: { type: String, required: true, index: true },

  // Species key into SUMMON_SPECIES registry (e.g. 'skeleton', 'flame_elemental')
  species: { type: String, required: true, index: true },

  // Combat archetype — keys into monsterSkills.MONSTER_ARCHETYPES
  // (BRUTE, MAGE, TANK, STALKER, SUPPORT, etc.) — reuses monster AI
  archetype: { type: String, required: true },

  // Element for synergy calculations (fire, ice, undead, demon, beast, construct, dragon, etc.)
  element: { type: String, default: 'neutral' },

  // Evolution tier
  tier: { type: String, enum: ['BASE', 'ASCENDED', 'TRANSCENDENT'], default: 'BASE' },

  // Rarity (affects stat caps, slot count, market value)
  rarity: { type: String, enum: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'], default: 'COMMON' },

  nickname: { type: String, default: null },

  // ── Progression ────────────────────────────────────────
  level: { type: Number, default: 1, min: 1, max: 50 },
  xp: { type: Number, default: 0 },
  statPoints: { type: Number, default: 0 },

  // 💡 PHASE 2 (2026-08-01): Summon Skill Tree
  // Each summon gets 1 skill point per level (starting L1, max 50).
  // Players pick ONE of 3 paths (determined by archetype). Each path has
  // 5 nodes unlocked at specific levels. Once a path is chosen, it can't
  // be changed without a Skill Respec Scroll (rare item).
  skillPoints: { type: Number, default: 0 },
  chosenSkillPath: { type: String, default: null }, // 'A' | 'B' | 'C' | null (unchose)
  unlockedSkillNodes: [{ type: String }], // e.g. ['A1', 'A2', 'A3']

  // Player-allocated stat points (mirrors User.allocatedStats pattern)
  allocatedStats: {
    hp: { type: Number, default: 0 },
    atk: { type: Number, default: 0 },
    def: { type: Number, default: 0 },
    mag: { type: Number, default: 0 },
    spd: { type: Number, default: 0 }
  },

  // Pristine base stats from species + rarity — never mutated.
  // Used by recomputeSummonStats to derive effective stats.
  baseStats: {
    hp: { type: Number, required: true },
    atk: { type: Number, required: true },
    def: { type: Number, required: true },
    mag: { type: Number, required: true },
    spd: { type: Number, required: true }
  },

  // ── State ──────────────────────────────────────────────
  // Loyalty is the durability-equivalent (0-100).
  // Gates effective stats via tiers: ≥75=full, ≥50=85%, ≥25=60%, ≥1=30%, 0=refuses to fight.
  // Decays per combat action (base 2%, modified by traits).
  // Restore via Loyalty Crystal consumable.
  loyalty: { type: Number, default: 100, min: 0, max: 100 },

  // Dynamic personality — shifts based on how the player uses the summon.
  // Tracked via behaviorScore; shift triggers at score ≥ 20.
  personality: { type: String, enum: ['STOIC', 'AGGRESSIVE', 'PROTECTIVE', 'CURIOUS', 'VOLATILE'], default: 'STOIC' },
  behaviorScore: {
    aggressive: { type: Number, default: 0 },
    protective: { type: Number, default: 0 },
    curious: { type: Number, default: 0 },
    volatile: { type: Number, default: 0 }
  },

  // ── Lineage (Soul Forging) ─────────────────────────────
  // Ancestry tree — up to 5 generations. Used for purebred/crossbred bonuses.
  lineage: [{
    summonId: String,
    species: String,
    level: Number,
    personality: String,
    forgedAt: Date
  }],

  // ── Runes ──────────────────────────────────────────────
  // Socketed rune instance IDs (mirrors skill socketing pattern).
  // Slot count determined by rarity: COMMON=0, UNCOMMON=1, RARE=2, EPIC+=3.
  socketedRuneIds: [{ type: String }],

  // ── Soul Echo ──────────────────────────────────────────
  // ID into SUMMON_ECHOES registry. Applied to summoner on summon death.
  echoId: { type: String, required: true },

  // ── Trial ──────────────────────────────────────────────
  // True if the summon has completed its species trial (evolves + unlocks player passive).
  trialCompleted: { type: Boolean, default: false },

  // ── Market State (mirrors UserCard.forSale pattern) ────
  forSale: { type: Boolean, default: false },        // disables passive income while listed
  salePrice: { type: Number, default: null },
  onAuction: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },        // prevents trade/sale (per player or mod lock)

  // Soulbound — cannot be traded for N days after Soul Forging.
  // Prevents market flipping of forged summons.
  soulboundUntil: { type: Date, default: null },

  // ── Metadata ───────────────────────────────────────────
  obtainedAt: { type: Date, default: Date.now },
  obtainedFrom: { type: String, default: null }, // 'capture' | 'egg' | 'craft' | 'market' | 'event' | 'daily' | 'forge'
  lastUsedAt: { type: Date, default: null },
  lastTrainedAt: { type: Date, default: null },

  // PHASE 4: Bond, Traits, AI Mode
  bond: { type: Number, default: 0, min: 0, max: 100 },
  bondXp: { type: Number, default: 0 },
  traits: [{ type: String }],
  aiMode: { type: String, enum: ['AGGRESSIVE', 'DEFENSIVE', 'PROTECT_OWNER', 'SUPPORT_ALLY', 'BALANCED'], default: 'BALANCED' },

  // PHASE 5: Summon Equipment
  summonEquipment: {
    claw:  { type: Object, default: null },
    core:  { type: Object, default: null },
    armor: { type: Object, default: null },
    crest: { type: Object, default: null },
    relic: { type: Object, default: null }
  }

}, { timestamps: true });

// Compound indexes for common queries
SummonSchema.index({ ownerJid: 1, species: 1 });
SummonSchema.index({ forSale: 1, salePrice: 1 });
SummonSchema.index({ ownerJid: 1, forSale: 1 });

module.exports = mongoose.models.Summon || mongoose.model('Summon', SummonSchema);
