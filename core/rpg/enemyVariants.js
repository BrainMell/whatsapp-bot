// ═══════════════════════════════════════════════════════════════════════════
//  ENEMY VARIANTS — player-variant enemies & NPC encounters (pass 3, §1)
// ═══════════════════════════════════════════════════════════════════════════
//
//  IMPLEMENTATION of implementation/enemy_variants.md (owner-confirmed
//  direction: "Add variations of the player character as enemies. Add random
//  NPC characters using player sprites. NPCs should be capable of having
//  their own skill trees and abilities.")
//
//  V1 vocabulary (design §3):
//    E1 MIRROR <CLASS>        the player's own class, stats slightly skewed
//    E2 WANDERER <CLASS>      a random OTHER class, standard pool math
//    E3 OTHER BANNER <CLASS>  class + "palette shift" (other-banner naming)
//                             + a class-flavored archetype (its abilities)
//    E4 TIMELINE DRIFTER      rare, deep; distorted; dialogue-first intro
//
//  Contract rules (design §7 — what must NOT happen):
//    - No player-stat theft/debuff framing. "He fights like you" is lore.
//    - No new card kinds. Standard enemy pipeline end to end (sprite +
//      ability set + recordEnemyKill hooks). The mystery lives in naming,
//      behaviour and dialogue.
//    - Variants are DEFINITIONS referencing existing content — no live
//      enemy files are touched, no new mechanics invented.
//    - Recognition stays deniable: variants never confirm they are "you".
//
//  Ability subset (v1): each variant equips an existing MONSTER_ARCHETYPES
//  table matching its class role (TANK/BRUTE/STALKER/MAGE/SUPPORT) — a data
//  level reuse of existing ability rows, per design §4. True per-NPC skill
//  trees remain a V2 proposal (owner sign-off), never stored on User.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const classSystem = require('./classSystem');

// ─── CLASS → ARCHETYPE MAP (existing ability tables only) ────────────────────
// Roles come from classSystem (TANK / DPS / MAGIC_DPS / SUPPORT). The fighter
// lineage fights like a BRUTE, the scout lineage like a STALKER.
const ROLE_ARCHETYPE = {
    TANK: 'TANK',
    DPS: 'STALKER',
    MAGIC_DPS: 'MAGE',
    SUPPORT: 'SUPPORT',
};

// Classes whose fantasy is "raw force" even inside the DPS role.
const BRUTE_CLASSES = new Set([
    'FIGHTER', 'WARRIOR', 'WARLORD', 'BERSERKER', 'DRAGONSLAYER', 'SAMURAI',
]);

// ─── VARIANT VISUAL SHEETS ───────────────────────────────────────────────────
// The Go service renders enemies from `core/rpgasset/enemies/` by 0-based
// spriteIndex (C-locale sorted directory order; slot 0 = Bat, documented in
// docs/UI-INVENTORY.md). Person-shaped sheets for person-shaped variants:
const HUMANOID_SHEETS = {
    kobold: 64,   // kobold_0000_red.png
    gnoll: 45,    // gnoll sheet.png
    goblin: 46,   // goblin sheet.png
    werewolf: 1,  // Werewolf_0004_brown.png
    sahuagin: 79, // sahuagin sheet.png
    skeleton: 80, // skelleton sheet.png
};
const VARIANT_SHEET_CYCLE = ['kobold', 'gnoll', 'goblin', 'sahuagin', 'werewolf', 'skeleton'];

// ─── ABYSS SPRITE MAP (fix: every abyss enemy currently renders slot 0) ─────
// enemy id → 0-based enemy-sheet index, matched by element family.
const ABYSS_SPRITE_MAP = {
    // F-tier creatures
    RABID_RAT: 86,        // wolf_0001_brown.png (closest small vermin pack body)
    CAVE_BAT: 0,          // Bat_0000_dark.png
    EMBER_SPAWN: 40,      // fire (11).png
    FROST_WISP: 61,       // ice (1).png
    SLIME: 81,            // slime waterB sheet.png
    // C-tier
    STONE_HULK: 35,       // earth (1).png
    MUTATED_HOUND: 72,    // mutated (1).png
    CRYSTAL_GOLEM: 36,    // earth (2).png
    SHADOW_STALKER: 54,   // hybrides (1).png
    VENOM_SPIDER: 73,     // mutated (2).png
    // B-tier
    INFERNO_KNIGHT: 41,   // fire (5).png
    TIDAL_FURY: 83,       // water (4).png
    BOULDER_TITAN: 37,    // earth (3).png
    GLACIAL_WRAITH: 62,   // ice (2).png
    // A-tier
    STORM_CALLER: 84,     // water (6).png
    VOID_HARBINGER: 55,   // hybrides (2).png
    BLOOD_REAVER: 74,     // mutated (3).png
    ANCIENT_GUARDIAN: 38, // earth (4).png
    // S+ tier
    ELDER_CHAOS: 28,        // calamaties (1).png
    PRIMORDIAL_CHAOS: 29,   // calamaties (2).png
    VOID_CORRUPTED: 56,     // hybrides (3).png
    VOID_TITAN: 30,         // calamaties (3).png
    MUTATION_PRIME: 75,     // mutated (4).png
    ELEMENTAL_ARCHON: 47,   // highlevelbosses (10).png
    ABYSSAL_GOD: 33,        // calamaties (6).png
    // Boss pool ids
    INFECTED_COLOSSUS: 65,    // midlevelbosses (1).png
    CORRUPTED_GUARDIAN: 66,   // midlevelbosses (2).png
    MUTATED_OVERSEER: 78,     // mutated (7).png
    INFERNO_LORD: 43,         // fire (7).png
};

/** Resolve the render index for an abyss enemy id (fallback: a stable
 *  pseudo-random sheet so pools at least stop rendering as one bat). */
function abyssSpriteIndex(enemyId) {
    // NOTE: index 0 (the bat sheet) is falsy — compare against undefined.
    if (ABYSS_SPRITE_MAP[enemyId] !== undefined) return ABYSS_SPRITE_MAP[enemyId];
    let h = 0;
    const s = String(enemyId || 'unknown');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return HUMANOID_SHEETS[VARIANT_SHEET_CYCLE[h % VARIANT_SHEET_CYCLE.length]];
}

// ─── CLASS ROSTER (for variant naming) ───────────────────────────────────────
function _variantClassList() {
    try {
        const all = classSystem.getAllClasses() || [];
        const list = all.filter(c => c && c.id && c.name && !c.isUnique)
            .map(c => ({ id: c.id, name: c.name, role: c.role || 'DPS' }));
        return list.length > 0 ? list : [{ id: 'FIGHTER', name: 'Fighter', role: 'TANK' }];
    } catch (e) {
        return [{ id: 'FIGHTER', name: 'Fighter', role: 'TANK' }];
    }
}

function _classById(classId) {
    try {
        const c = classSystem.getClassById(classId);
        if (c) return { id: c.id, name: c.name, role: c.role || 'DPS' };
    } catch (e) {}
    return { id: 'FIGHTER', name: 'Fighter', role: 'TANK' };
}

function archetypeForClass(classId) {
    const c = _classById(classId);
    if (BRUTE_CLASSES.has(c.id)) return 'BRUTE';
    return ROLE_ARCHETYPE[c.role] || 'BRUTE';
}

// ─── ABYSS STAT MATH (mirrors abyssSystem.generateFloorEnemy exactly) ────────
function abyssFloorMultiplier(floor) {
    return 1.0 + (floor - 1) * 0.15 + Math.pow(floor - 1, 1.5) * 0.05;
}

function _skew(base, min, max) {
    return Math.max(1, Math.floor(base * (min + Math.random() * (max - min))));
}

/**
 * Build a variant enemy with abyss floor math.
 * @param {'MIRROR'|'WANDERER'|'OTHER_BANNER'|'TIMELINE_DRIFTER'} kind
 * @param {object} ctx { floor, isBoss, playerClassId, tier }
 */
function buildVariantEnemy(kind, ctx = {}) {
    const floor = Math.max(1, Math.floor(Number(ctx.floor) || 1));
    const isBoss = !!ctx.isBoss;
    const mult = abyssFloorMultiplier(floor);
    const variantClass = kind === 'MIRROR'
        ? _classById(ctx.playerClassId)
        : _pickOtherClass(ctx.playerClassId);
    const archetype = archetypeForClass(variantClass.id);

    // Base stat templates: abyss pool math; MIRROR skews toward the player's
    // own class template ("same openings, same lazy left guard" — lore, not
    // stat theft). Skew windows keep it slightly OFF the player, never exact.
    const cls = _variantClassStats(variantClass.id);
    let hp, atk, def, spd;
    if (isBoss) {
        hp = _skew(2000 * mult, 0.9, 1.05);
        atk = _skew(80 * mult, 0.9, 1.05);
        def = _skew(30 * mult, 0.9, 1.05);
        spd = _skew(20 * mult, 0.9, 1.05);
    } else if (kind === 'MIRROR') {
        // Player-class flavored: HP from class template (scaled), skewed.
        hp = _skew(cls.hp * mult, 0.85, 1.1);
        atk = _skew(cls.atk * mult, 0.85, 1.1);
        def = _skew(cls.def * mult, 0.85, 1.1);
        spd = _skew(cls.spd * mult, 0.85, 1.1);
    } else {
        hp = Math.floor(500 * mult);
        atk = Math.floor(40 * mult);
        def = Math.floor(15 * mult);
        spd = Math.floor(15 * mult);
    }

    const prefix = {
        MIRROR: 'MIRROR',
        WANDERER: 'WANDERER',
        OTHER_BANNER: 'OTHER BANNER',
        TIMELINE_DRIFTER: 'TIMELINE DRIFTER',
    }[kind] || 'WANDERER';

    const tagMap = {
        MIRROR: 'self',
        WANDERER: 'player',
        OTHER_BANNER: 'player',
        TIMELINE_DRIFTER: 'timeline',
    };

    const enemy = {
        id: `abyss_variant_${kind}_${floor}_${Date.now()}`,
        name: `${prefix} ${variantClass.name}`,
        hp,
        maxHp: hp,
        atk,
        def,
        spd,
        isBoss,
        level: Math.max(1, floor),
        icon: kind === 'TIMELINE_DRIFTER' ? '🜁' : (isBoss ? '👹' : '♟️'),
        archetype,
        humanoid: true,
        variantTag: tagMap[kind] || 'player',
        variantKind: kind,
        spriteIndex: HUMANOID_SHEETS[
            VARIANT_SHEET_CYCLE[(floor + (kind === 'TIMELINE_DRIFTER' ? 3 : 0)) % VARIANT_SHEET_CYCLE.length]
        ],
        // Dialogue-first intro (deep drifter) — an opener line may be
        // attached by the encounter text builders; never a mechanical tell.
        dialogueFirst: kind === 'TIMELINE_DRIFTER',
    };
    return enemy;
}

function _variantClassStats(classId) {
    // Class base stats (classSystem) shaped into abyss-ish magnitudes.
    const c = _classById(classId);
    const s = (classSystem.getClassById(classId) || {}).stats || { hp: 120, atk: 12, def: 10, spd: 8 };
    return {
        hp: Math.max(80, s.hp * 4),   // ~500 at F-tier scale
        atk: Math.max(8, s.atk * 3),
        def: Math.max(4, s.def * 2),
        spd: Math.max(4, s.spd * 2),
    };
}

function _pickOtherClass(playerClassId) {
    const list = _variantClassList();
    const others = list.filter(c => c.id !== playerClassId);
    const pool = others.length > 0 ? others : list;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ─── SPAWN POLICY (design §5) ────────────────────────────────────────────────
// Abyss: floors 31+ add player-variant weights (escalation by depth);
// floor 90+ adds TIMELINE_DRIFTER; MIRROR can replace BOSS-floor enemies
// from floor 31+ (a boss that fights like you — rare, deniable).
// Anywhere: a small global chance to swap a dungeon mob for a WANDERER.

const VARIANT_CHANCE = {
    EARLY: 0.00,   // floors 1-30: creatures only (heuristic routing stays clean)
    MID: 0.12,     // floors 31-49
    DEEP: 0.20,    // floors 50-89
    ABYSSAL: 0.25, // floors 90+
};
const MIRROR_BOSS_CHANCE = 0.15;      // boss floors 31+
const DRIFTER_SHARE_DEEP = 0.0;       // no drifters before 90
const DRIFTER_SHARE_ABYSSAL = 0.40;   // of variants at 90+

/**
 * Roll a player-variant enemy for an abyss floor. Returns null when the
 * floor keeps its regular creature pool.
 * @param {number} floor
 * @param {boolean} isBoss
 * @param {string} playerClassId
 * @returns {object|null} variant enemy or null
 */
function rollAbyssVariant(floor, isBoss, playerClassId) {
    try {
        const f = Math.floor(Number(floor) || 1);
        if (isBoss) {
            if (f >= 31 && Math.random() < MIRROR_BOSS_CHANCE) {
                return buildVariantEnemy('MIRROR', { floor: f, isBoss: true, playerClassId });
            }
            return null;
        }
        let chance = VARIANT_CHANCE.EARLY;
        if (f >= 90) chance = VARIANT_CHANCE.ABYSSAL;
        else if (f >= 50) chance = VARIANT_CHANCE.DEEP;
        else if (f >= 31) chance = VARIANT_CHANCE.MID;
        if (chance === 0 || Math.random() >= chance) return null;

        if (f >= 90 && Math.random() < DRIFTER_SHARE_ABYSSAL) {
            return buildVariantEnemy('TIMELINE_DRIFTER', { floor: f, isBoss: false, playerClassId });
        }
        // Deep floors favor OTHER BANNER (signature archetype behavior);
        // mid floors favor WANDERER.
        const kind = f >= 50 && Math.random() < 0.5 ? 'OTHER_BANNER' : 'WANDERER';
        return buildVariantEnemy(kind, { floor: f, isBoss: false, playerClassId });
    } catch (e) {
        try { console.error('[enemyVariants] rollAbyssVariant error:', e.message); } catch (_) {}
        return null;
    }
}

/**
 * GLOBAL WANDERER SWAP ("the world feels inhabited by others").
 * Small chance that ONE mob in a standard dungeon encounter is a
 * WANDERER <CLASS> — same stats (data-level swap: naming, archetype
 * behaviour, humanoid sprite, variant tag), no balance change.
 *
 * @param {Array} enemies  encounter.enemies array (mutated copy returned)
 * @param {string} playerClassId
 * @param {object} [opts] { chance }
 * @returns {Array} the (possibly) modified enemies array
 */
const GLOBAL_WANDERER_CHANCE = 0.05;

function maybeSwapWanderer(enemies, playerClassId, opts = {}) {
    try {
        if (!Array.isArray(enemies) || enemies.length === 0) return enemies;
        const chance = Number.isFinite(opts.chance) ? opts.chance : GLOBAL_WANDERER_CHANCE;
        if (Math.random() >= chance) return enemies;
        const idx = Math.floor(Math.random() * enemies.length);
        const host = enemies[idx];
        if (!host || host.isBoss || host.isWildSummon) return enemies;

        const variantClass = _pickOtherClass(playerClassId);
        const kind = Math.random() < 0.3 ? 'OTHER_BANNER' : 'WANDERER';
        const prefix = kind === 'OTHER_BANNER' ? 'OTHER BANNER' : 'WANDERER';
        host.name = `${prefix} ${variantClass.name}`;
        host.humanoid = true;
        host.variantTag = 'player';
        host.variantKind = kind;
        host.archetype = archetypeForClass(variantClass.id);
        host.spriteIndex = HUMANOID_SHEETS[
            VARIANT_SHEET_CYCLE[(host.enemyIndex || idx || 0) % VARIANT_SHEET_CYCLE.length]
        ];
        return enemies;
    } catch (e) {
        try { console.error('[enemyVariants] maybeSwapWanderer error:', e.message); } catch (_) {}
        return enemies;
    }
}

/**
 * Friendly NPC SIGHTING decision ("random NPC characters using player
 * sprites — occasionally encountered anywhere"). v1 = text-only moment on
 * NON-HOSTILE floors (treasure/event): a person at rest, a passerby, no
 * mechanics. Returns true when a sighting beat should be attached.
 */
const NPC_SIGHTING_CHANCE = 0.08;

function maybeNpcSighting() {
    return Math.random() < NPC_SIGHTING_CHANCE;
}

module.exports = {
    ROLE_ARCHETYPE,
    HUMANOID_SHEETS,
    VARIANT_SHEET_CYCLE,
    ABYSS_SPRITE_MAP,
    abyssSpriteIndex,
    archetypeForClass,
    buildVariantEnemy,
    rollAbyssVariant,
    maybeSwapWanderer,
    maybeNpcSighting,
    GLOBAL_WANDERER_CHANCE,
    NPC_SIGHTING_CHANCE,
};
