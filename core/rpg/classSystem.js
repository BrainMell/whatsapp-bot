// ============================================
// 🎭 CLASS SYSTEM
// ============================================
// Class evolution philosophy:
//   Starter → Evolved (Lv.20) → Ascended (Lv.50)
// Stats shown here are BASE stats at class unlock.
// Actual in-combat stats scale with level via progression.js.
// ============================================

// ==========================================
// 🌟 STARTER CLASSES (4)
// ==========================================

const STARTER_CLASSES = {
    FIGHTER: {
        id: 'FIGHTER',
        name: 'Fighter',
        icon: '⚔️',
        desc: `A well-rounded warrior who has hardened their body through relentless training. Fighters are the backbone of any party.`,
        tier: 'STARTER',
        role: 'TANK',
        stats: { hp: 120, atk: 12, def: 10, mag: 4, spd: 8, luck: 6, crit: 8 },
        evolves_into: ['WARRIOR', 'BERSERKER', 'PALADIN', 'DRAGONSLAYER'],
    },
    
    SCOUT: {
        id: 'SCOUT',
        name: 'Scout',
        icon: '🗡️',
        desc: `Sworn to the shadows and the wind, Scouts move faster than the eye can follow.`,
        tier: 'STARTER',
        role: 'DPS',
        stats: { hp: 90, atk: 10, def: 5, mag: 3, spd: 16, luck: 14, crit: 18 },
        evolves_into: ['ROGUE', 'MONK', 'SAMURAI', 'NINJA'],
    },
    
    APPRENTICE: {
        id: 'APPRENTICE',
        name: 'Apprentice',
        icon: '🔮',
        desc: `Magic is not learned — it is remembered. Apprentices are those who hear the ancient language of the world.`,
        tier: 'STARTER',
        role: 'MAGIC_DPS',
        stats: { hp: 80, atk: 5, def: 4, mag: 18, spd: 9, luck: 8, crit: 10 },
        evolves_into: ['MAGE', 'WARLOCK', 'ELEMENTALIST', 'NECROMANCER', 'CHRONOMANCER'],
    },
    
    ACOLYTE: {
        id: 'ACOLYTE',
        name: 'Acolyte',
        icon: '✨',
        desc: `The Acolyte has heard a calling — whether from gods, nature, or the people around them.`,
        tier: 'STARTER',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 6, def: 8, mag: 14, spd: 10, luck: 12, crit: 6 },
        evolves_into: ['CLERIC', 'DRUID', 'MERCHANT', 'BARD', 'ARTIFICER'],
    },
};

// ==========================================
// 💎 EVOLVED CLASSES
// ==========================================

const EVOLVED_CLASSES = {
// ═══════════════════════════════════════════════════════════════════════════
// 💡 PEAK TIER CLASSES (contributed by @Daviddey — github.com/Daviddey)
// PR #7: "Add new classes and evolution paths"
// 19 new PEAK tier classes that evolve from ASCENDED classes.
// Currently SHELVED — trial bosses, skill trees, and sprites not yet
// implemented. Uncomment the shelved blocks below once content is ready.
// ═══════════════════════════════════════════════════════════════════════════
    // ─── FIGHTER LINE ────────────────────────────

    WARRIOR: {
        id: 'WARRIOR',
        name: 'Warrior',
        icon: '⚔️',
        desc: `A wall of iron and will. Warriors anchor the battlefield with sheer endurance.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 220, atk: 18, def: 22, mag: 2, spd: 5, luck: 5, crit: 5 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'INFECTED_COLOSSUS' },
        evolutionCost: 0,
        passive: { name: 'Tenacity', desc: `Regenerates 3% of max HP every 2 turns in combat.`, effect: 'regen', value: 3 },
        evolves_into: ['WARLORD'],
    },
    WARLORD: {
        id: 'WARLORD',
        name: 'Warlord',
        icon: '🎖️',
        desc: `They have survived a hundred battles and emerged from every one of them covered in scars and glory.`,
        tier: 'ASCENDED',
        evolvedFrom: 'WARRIOR',
        role: 'TANK',
        stats: { hp: 550, atk: 28, def: 48, mag: 5, spd: 12, luck: 10, crit: 12 },
        requirement: { level: 50, questsCompleted: 100, victories: 100, gold: 100000, trialBoss: 'VOID_CORRUPTED' },
        evolutionCost: 100000,
        passive: { name: 'Iron Command', desc: `Reduces all incoming damage to party by 15% in multi-player quests.`, effect: 'damage_reduction', value: 15 },
        // SHELVED: evolves_into: ['WAREMPEROR'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "WAREMPEROR" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // WAREMPEROR: {
    //     id: 'WAREMPEROR',
    //     name: 'Waremperor',
    //     icon: '🎖️',
    //     desc: `The last war he loses hasn't been invented yet..`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'WARLORD',
    //     role: 'TANK',
    //     stats: { hp: 900, atk: 40, def: 75, mag: 10, spd: 20, luck: 15, crit: 20 },
    //     requirement: { level: 90, questsCompleted: 500, victories: 500, gold: 1000000, trialBoss: 'ETERNAL_CONQUEROR' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Absolute Command', desc: `Party immune to debuffs; -25% incoming damage to party at all times`, effect: 'damage_reduction', value: 25 },
    // },
    BERSERKER: {
        id: 'BERSERKER',
        name: 'Berserker',
        icon: '🪓',
        desc: `They hit things until things stop moving.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 220, atk: 18, def: 12, mag: 1, spd: 6, luck: 4, crit: 15 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'MUTATION_PRIME' },
        evolutionCost: 0,
        passive: { name: 'Bloodlust', desc: `CRIT chance increases by 1% for every 5% HP missing. Max +20%.`, effect: 'crit_when_low', value: 20 },
        evolves_into: ['DOOMSLAYER'],
    },
    DOOMSLAYER: {
        id: 'DOOMSLAYER',
        name: 'Doomslayer',
        icon: '🔥🪓',
        desc: `Formerly a Berserker who pushed past every limit the body has.`,
        tier: 'ASCENDED',
        evolvedFrom: 'BERSERKER',
        role: 'TANK',
        stats: { hp: 600, atk: 55, def: 25, mag: 2, spd: 18, luck: 5, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, kills: 500, gold: 100000, trialBoss: 'DEMON_LORD' },
        evolutionCost: 100000,
        passive: { name: 'Hell-Walker', desc: `Damage increases by 2% for every 1% of HP missing. No cap.`, effect: 'scaling_damage', value: 2 },
        // SHELVED: evolves_into: ['ANNIHILATOR'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "ANNIHILATOR" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // ANNIHILATOR: {
    //     id: 'ANNIHILATOR',
    //     name: 'Annihilator',
    //     icon: '🎖️',
    //     desc: `There is no "too far." Only "not yet."`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'DOOMSLAYER',
    //     role: 'TANK',
    //     stats: { hp: 950, atk: 80, def: 40, mag: 5, spd: 30, luck: 10, crit: 45 },
    //     requirement: { level: 90, questsCompleted: 500, kills: 1000, gold: 1000000, trialBoss: 'APOCALYPSE_BRINGER' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Endless Wrath', desc: `Damage +3% per 1% HP missing + 20% lifesteal on all attacks`, effect: 'damage_when_low_hp', value: 75 },
    // },
    PALADIN: {
        id: 'PALADIN',
        name: 'Paladin',
        icon: '🛡️',
        desc: `Blessed by divine authority, they interpose themselves between harm and their allies.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 180, atk: 10, def: 22, mag: 8, spd: 4, luck: 10, crit: 5 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'CORRUPTED_GUARDIAN' },
        evolutionCost: 0,

        passive: { name: 'Divine Shield', desc: `Reduces all damage taken by 10%. Undead enemies deal -50% damage.`, effect: 'damage_reduction', value: 10 },
        evolves_into: ['TEMPLAR'],
    },
    TEMPLAR: {
        id: 'TEMPLAR',
        name: 'Templar',
        icon: '⛪',
        desc: `Anointed by the highest divine authority.`,
        tier: 'ASCENDED',
        evolvedFrom: 'PALADIN',
        role: 'TANK',
        stats: { hp: 460, atk: 22, def: 52, mag: 30, spd: 10, luck: 20, crit: 12 },
        requirement: { level: 50, questsCompleted: 100, undeadKills: 200, gold: 100000, trialBoss: 'PRIMORDIAL_CHAOS' },
        evolutionCost: 100000,
        passive: { name: 'Holy Retribution', desc: `Reflects 20% of all damage received back at attackers as holy damage.`, effect: 'damage_reduction', value: 15 },
        // SHELVED: evolves_into: ['SERAPH']
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "SERAPH" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // SERAPH: {
    //     id: 'SERAPH',
    //     name: 'Seraph',
    //     icon: '🎖️',
    //     desc: `Judgment doesn't ask permission.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'TEMPLAR',
    //     role: 'TANK',
    //     stats: { hp: 715, atk: 35, def: 80, mag: 45, spd: 15, luck: 30, crit: 20 },
    //     requirement: { level: 90, questsCompleted: 500, undeadKills: 700, gold: 1000000, trialBoss: 'FALLEN_SERAPH' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Absolute Retribution', desc: `Reflect 40% damage received, immune to debuffs.`, effect: 'damage_reduction', value: 30 },
    // },
    DRAGONSLAYER: {
        id: 'DRAGONSLAYER',
        name: 'Dragonslayer',
        icon: '🐲⚔️',
        desc: `Mastered anti-dragon combat techniques.`,
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 190, atk: 16, def: 15, mag: 4, spd: 8, luck: 8, crit: 12 },
        requirement: { level: 40, questsCompleted: 30, gold: 150000, trialBoss: 'ELDER_FLAME' },
        evolutionCost: 150000,
        passive: { name: 'Dragon Bane', desc: `Deal 3× damage to dragon-type enemies. Immune to fire DoT.`, effect: 'dragon_3x', value: 3 },
        evolves_into: ['DRAGON_GOD', 'DRAGON_LORD'],
    },
    DRAGON_GOD: {
        id: 'DRAGON_GOD',
        name: 'Dragon God',
        icon: '🐲👑',
        desc: `They did not slay the dragon. They became it. *One-of-one — the first to fall the Leviathan, forever.*`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRAGONSLAYER',
        role: 'TANK',
        stats: { hp: 550, atk: 45, def: 40, mag: 35, spd: 15, luck: 25, crit: 20 },
        requirement: { level: 75, questsCompleted: 200, dragonsKilled: 25, gold: 500000, trialBoss: 'LEVIATHAN' }, // 💡 reduced from 100 to 25
        evolutionCost: 500000,
        passive: { name: 'Dragon Heart', desc: `Immune to all status effects. Reduces all damage taken by 50%.`, effect: 'damage_reduction', value: 50 },
        // SHELVED: evolves_into: ['ASTRALWYRM'],
        isUnique: true, // 💡 Only ONE player may hold this class — ever.
        uniqueLockId: 'LEVIATHAN', // matches DragonGod model's bossId
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "ASTRALWYRM" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // ASTRALWYRM: {
    //     id: 'ASTRALWYRM',
    //     name: 'Astralwyrm',
    //     icon: '🎖️',
    //     desc: `Stars burn brighter just to stay out of his way.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'DRAGONGOD',
    //     role: 'TANK',
    //     stats: { hp: 850, atk: 70, def: 60, mag: 55, spd: 25, luck: 40, crit: 30 },
    //     requirement: { level: 90, questsCompleted: 500, dragonsKilled: 100, gold: 2000000, trialBoss: 'PRIMORDIAL_WYRM' },
    //     evolutionCost: 2000000,
    //     passive: { name: 'Astral Dominion', desc: `Immune to all status, -65% damage taken, reflect 15% as dragonfire.`, effect: 'damage_reduction', value: 65 },
    //     isUnique: true, // 💡 Only the Dragon God can ascend to this class
    //     uniqueLockId: 'PRIMODIAL_WYRM',
    // },
    // ────────────────────────────────────────────────────────────────────────
    //  DRAGON LORD — successor class to Dragon God.
    //  Once the Leviathan has been slain and a Dragon God crowned, every
    //  future Dragonslayer who completes their ascension becomes a Dragon
    //  Lord instead. Same tier, similar power curve, distinct mechanics.
    //  Trial boss: LEVIATHAN_SPAWN_ALPHA — a stronger Leviathan Spawn
    //  (NOT the original Leviathan, who has been defeated forever).
    // ────────────────────────────────────────────────────────────────────────
    DRAGON_LORD: {
        id: 'DRAGON_LORD',
        name: 'Dragon Lord',
        icon: '🐉⚔️',
        desc: `The Leviathan is gone, but its children remain. A Lord rules them.`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRAGONSLAYER',
        role: 'TANK',
        stats: { hp: 540, atk: 48, def: 38, mag: 30, spd: 18, luck: 22, crit: 22 },
        requirement: { level: 75, questsCompleted: 200, dragonsKilled: 25, gold: 500000, trialBoss: 'LEVIATHAN_SPAWN_ALPHA' },
        evolutionCost: 500000,
        passive: { name: 'Wyrmguard', desc: `Immune to fear and stun. Reflects 25% of melee damage as fire damage. Damage taken from non-dragons reduced by 35%.`, effect: 'damage_reduction', value: 35 },
        // SHELVED: evolves_into: ['BROOD_SOVEREIGN'],
        isSuccessor: true,    // marks this as the post-first-Leviathan-kill path
        succeeds: 'DRAGON_GOD', // documents the lineage
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "BROOD_SOVEREIGN" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  BROOD_SOVEREIGN: {
    //     id: 'BROOD_SOVEREIGN',
    //     name: 'Brood_Sovereign',
    //     icon: '🎖️',
    //     desc: `Every dragon that draws breath answers to him.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'DRAGON_LORD',
    //     role: 'TANK',
    //     stats: { hp: 835, atk: 65, def: 50, mag: 45, spd: 25, luck: 35, crit: 20 },
    //     requirement: { level: 90, questsCompleted: 500, dragonsKilled: 100, gold: 2000000, trialBoss: 'WYRM_EMPEROR' },
    //     evolutionCost: 2000000,
    //     passive: { name: 'Supreme Wyrmguard', desc: `Immune to fear/stun/Silence, reflect 40% melee as fire, -50% dmg from non dragons.`, effect: 'damage_reduction', value: 50 },
    //      isSuccessor: true,
    //      succeeds: 'ASTRALWYRM',
    // },

    // ─── SCOUT LINE ──────────────────────────────

    ROGUE: {
        id: 'ROGUE',
        name: 'Rogue',
        icon: '🗡️',
        desc: `Blending into shadows comes naturally to them now.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 100, atk: 18, def: 5, mag: 3, spd: 20, luck: 15, crit: 25 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'SHADOW_STALKER' },
        evolutionCost: 0,
        passive: { name: 'Shadow Step', desc: `Evasion increased by 15%.`, effect: 'dodge_chance', value: 15 },
        evolves_into: ['NIGHTBLADE'],
    },
    NIGHTBLADE: {
        id: 'NIGHTBLADE',
        name: 'Nightblade',
        icon: '🌑🗡️',
        desc: `One with the dark between stars.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ROGUE',
        role: 'DPS',
        stats: { hp: 250, atk: 42, def: 12, mag: 15, spd: 50, luck: 35, crit: 45 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'VOID_ASSASSIN' },
        evolutionCost: 100000,
        passive: { name: `Assassin's Mark`, desc: `10% chance on any attack to deal 10× damage.`, effect: 'damage_per_hit', value: 25 },
        // SHELVED: evolves_into: ['NEMESIS'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "NEMESIS" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  NEMESIS: {
    //     id: 'NEMESIS',
    //     name: 'Nemesis',
    //     icon: '🎖️',
    //     desc: `The last thing you'll never see coming.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'NIGHTBLADE',
    //     role: 'DPS',
    //     stats: { hp: 390, atk: 65, def: 20, mag: 25, spd: 80, luck: 55, crit: 70 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'VOID_SOVEREIGN' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Flawless Mark', desc: `25% chance any attack deals 15x more dmg.`, effect: 'damage_per_hit', value: 50 },
    // },

    MONK: {
        id: 'MONK',
        name: 'Monk',
        icon: '🥋',
        desc: `The Monk has transcended ordinary combat training.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 120, atk: 14, def: 8, mag: 6, spd: 18, luck: 10, crit: 15 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'IRON_BODY_GRANDMASTER' },
        evolutionCost: 0,
        passive: { name: 'Inner Focus', desc: `+10% accuracy and +10% speed.`, effect: 'all_stats', value: 10 },
        evolves_into: ['ZENMASTER'],
    },
    ZENMASTER: {
        id: 'ZENMASTER',
        name: 'Zenmaster',
        icon: '🧘',
        desc: `There is a state beyond thought, beyond training, beyond even intent.`,
        tier: 'ASCENDED',
        evolvedFrom: 'MONK',
        role: 'DPS',
        stats: { hp: 350, atk: 38, def: 22, mag: 35, spd: 45, luck: 25, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'ETERNAL_DRAGON' },
        evolutionCost: 100000,
        passive: { name: 'Perfect Form', desc: `Immune to stun.`, effect: 'dodge_chance', value: 10 },
        // SHELVED: evolves_into: ['BUDDHA'],
    },
    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "BUDDHA" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // BUUDHA: {
    //     id: 'BUDDHA',
    //     name: 'Buddha',
    //     icon: '🎖️',
    //     desc: `One with the Universe.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'ZENMASTER',
    //     role: 'DPS',
    //     stats: { hp: 540, atk: 60, def: 35, mag: 55, spd: 70, luck: 40, crit: 45 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'BUDDHA' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Transcendence', desc: `Immune to stun/silence, all skills cost 0 EP.`, effect: 'all_stats', value: 25 },
    // },

    SAMURAI: {
        id: 'SAMURAI',
        name: 'Samurai',
        icon: '⚔️🌸',
        desc: `The blade is not a tool. It is an oath.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 130, atk: 17, def: 9, mag: 4, spd: 16, luck: 11, crit: 20 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'ANCIENT_WURM' },
        evolutionCost: 0,
        passive: { name: 'Bushido', desc: `+20% ATK after standing still for a turn.`, effect: 'first_turn_bonus', value: 20 },
        evolves_into: ['SHOGUN'],
    },
    SHOGUN: {
        id: 'SHOGUN',
        name: 'Shogun',
        icon: '🏯⚔️',
        desc: `More than a warrior — a tactician, a symbol, a force of history.`,
        tier: 'ASCENDED',
        evolvedFrom: 'SAMURAI',
        role: 'DPS',
        stats: { hp: 320, atk: 50, def: 28, mag: 15, spd: 25, luck: 20, crit: 35 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'VOID_TITAN' },
        evolutionCost: 100000,
        passive: { name: `Commander's Will`, desc: `Party deals +20% physical damage.`, effect: 'party_physical_buff', value: 20 },
        // SHELVED: evolves_into: ['TENNO'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "TENNO" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    // TENNO: {
    //     id: 'TENNO',
    //     name: 'Tenno',
    //     icon: '🎖️',
    //     desc: `An empire, distilled into one blade.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'SHOGUN',
    //     role: 'DPS',
    //     stats: { hp: 495, atk: 80, def: 45, mag: 25, spd: 40, luck: 30, crit: 55 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'EMPEROR_OF_VOID' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Absolute Command', desc: `Party +35% physical dmg.`, effect: 'all_stats', value: 25 },
    // },
    NINJA: {
        id: 'NINJA',
        name: 'Ninja',
        icon: '🥷',
        desc: `The art of the Ninja is the art of the impossible.`,
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 95, atk: 16, def: 4, mag: 5, spd: 22, luck: 16, crit: 28 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'SHADOW_LORD' },
        evolutionCost: 0,
        passive: { name: 'Opening Strike', desc: `The first attack is always a critical hit.`, effect: 'first_turn_bonus', value: 30 },
        evolves_into: ['KAGE'],
    },
    KAGE: {
        id: 'KAGE',
        name: 'Kage',
        icon: '🌑🥷',
        desc: `The Kage is not a person. They are a legend.`,
        tier: 'ASCENDED',
        evolvedFrom: 'NINJA',
        role: 'DPS',
        stats: { hp: 220, atk: 52, def: 15, mag: 20, spd: 55, luck: 30, crit: 50 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'PRIMORDIAL_EVIL' },
        evolutionCost: 100000,
        passive: { name: 'Absolute Stealth', desc: `50% base Evasion.`, effect: 'dodge_chance', value: 50 },
        // SHELVED: evolves_into: ['YAMI'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "YAMI" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  YAMI: {
    //     id: 'YAMI',
    //     name: 'Yami',
    //     icon: '🎖️',
    //     desc: `Darkness had a name before it had a shape. This is it.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'KAGE',
    //     role: 'DPS',
    //     stats: { hp: 340, atk: 80, def: 25, mag: 30, spd: 85, luck: 45, crit: 80 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'SHADOW_GOD' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Complete Stealth', desc: `75% base evasion; first hit each combat is guaranteed instakill on non-boss enemies`, effect: 'dodge_chance', value: 75 },
    // },

    // ─── APPRENTICE LINE ──────────────────────────

    MAGE: {
        id: 'MAGE',
        name: 'Mage',
        icon: '🔮',
        desc: `A master of the arcane arts.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 110, atk: 8, def: 8, mag: 35, spd: 12, luck: 12, crit: 8 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'ARCANE_SENTINEL' },
        evolutionCost: 0,
        passive: { name: 'Arcane Well', desc: `Regenerates 10 Energy per turn.`, effect: 'energy_regen', value: 10 },
        evolves_into: ['ARCHMAGE'],
    },
    ARCHMAGE: {
        id: 'ARCHMAGE',
        name: 'Archmage',
        icon: '🧙‍♂️✨',
        desc: `Arcane commands reality.`,
        tier: 'ASCENDED',
        evolvedFrom: 'MAGE',
        role: 'MAGIC_DPS',
        stats: { hp: 200, atk: 12, def: 18, mag: 75, spd: 22, luck: 22, crit: 22 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'LICH_KING' },
        evolutionCost: 100000,
        passive: { name: 'Infinity Flow', desc: `Energy costs reduced by 50%.`, effect: 'energy_cost_reduction', value: 50 },
        // SHELVED: evolves_into: ['DEMIURGE'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "DEMIURGE" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  DEMIURGE: {
    //     id: 'DEMIURGE',
    //     name: 'Demiurge',
    //     icon: '🎖️',
    //     desc: `Didn't learn the rules of magic. Wrote new ones.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'ARCHMAGE',
    //     role: 'MAGIC_DPS',
    //     stats: { hp: 310, atk: 20, def: 30, mag: 125, spd: 35, luck: 35, crit: 35 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'COSMIC_ARCHITECT' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Ominiscience', desc: `Energy costs reduced to 0; +30% MAG.`, effect: 'magic_damage', value: 40 },
    // },

    WARLOCK: {
        id: 'WARLOCK',
        name: 'Warlock',
        icon: '👹',
        desc: `Made a bargain for power.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 100, atk: 7, def: 6, mag: 26, spd: 8, luck: 10, crit: 12 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'SOUL_EATER' },
        evolutionCost: 0,
        passive: { name: 'Soul Siphon', desc: `Heals for 8% of magic damage dealt.`, effect: 'lifesteal', value: 8 },
        evolves_into: ['VOIDWALKER'],
    },
    VOIDWALKER: {
        id: 'VOIDWALKER',
        name: 'Voidwalker',
        icon: '🌑🧙',
        desc: `The void between stars hungers.`,
        tier: 'ASCENDED',
        evolvedFrom: 'WARLOCK',
        role: 'MAGIC_DPS',
        stats: { hp: 300, atk: 18, def: 25, mag: 65, spd: 18, luck: 15, crit: 18 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'ABYSSAL_WHISPER' },
        evolutionCost: 100000,
        passive: { name: 'Abyssal Aura', desc: `Reduces nearby enemies' ATK and DEF by 15%.`, effect: 'enemy_debuff', value: 15 },
        // SHELVED: evolves_into: ['VOIDLORD'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "VOIDLORD" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  VOIDLORD: {
    //     id: 'VOIDLORD',
    //     name: 'VoidLord',
    //     icon: '🎖️',
    //     desc: `The void doesn't hunger anymore — it's full of him.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'VOIDWALKER',
    //     role: 'MAGIC_DPS',
    //     stats: { hp: 450, atk: 30, def: 40, mag: 90, spd: 30, luck: 25, crit: 30 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'ABYSS_RULER' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Total Darkness', desc: `-30% nearby enemy ATK/DEF; Immune to all CC.`, effect: 'magic_damage', value: 35 },
    // },

    ELEMENTALIST: {
        id: 'ELEMENTALIST',
        name: 'Elementalist',
        icon: '🌊',
        desc: `Binding themselves to primal forces.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 95, atk: 7, def: 6, mag: 28, spd: 10, luck: 11, crit: 13 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'ELEMENTAL_PRIMORDIAL' },
        evolutionCost: 0,
        passive: { name: 'Elemental Harmony', desc: `Elemental damage increased by 15%.`, effect: 'rotate_elements', value: 15 },
        evolves_into: ['AVATAR'],
    },
    AVATAR: {
        id: 'AVATAR',
        name: 'Avatar',
        icon: '🌊🔥⚡🌍',
        desc: `They ARE the elements.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ELEMENTALIST',
        role: 'MAGIC_DPS',
        stats: { hp: 250, atk: 20, def: 22, mag: 70, spd: 28, luck: 25, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'PRIME_ELEMENT' },
        evolutionCost: 100000,
        passive: { name: 'Elemental Avatar', desc: `Automatically match enemy weakness.`, effect: 'rotate_elements', value: 30 },
        // SHELVED: evolves_into: ['PRIMORDIAL'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "PRIMORDIAL" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  PRIMORDIAL: {
    //     id: 'PRIMORDIAL',
    //     name: 'Primordial',
    //     icon: '🎖️',
    //     desc: `Before the elements had names, he had a shape.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'AVATAR',
    //     role: 'MAGIC_DPS',
    //     stats: { hp: 390, atk: 30, def: 35, mag: 100, spd: 45, luck: 35, crit: 40 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'ELEMENTAL_GOD' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Primordial Avatar', desc: `Immune to all elemental dmg; always crits enemy elemental weakness.`, effect: 'rotate_elements', value: 50 },
    // },

    NECROMANCER: {
        id: 'NECROMANCER',
        name: 'Necromancer',
        icon: '💀',
        desc: `Death is a resource.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 92, atk: 6, def: 5, mag: 27, spd: 8, luck: 9, crit: 11 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'GRAVEYARD_LORD' },
        evolutionCost: 0,
        // 💡 Phase 3 fix: changed effect from 'magic_damage' (which gave the
        // player +15% magic damage — unrelated to summons) to 'summon_buff'.
        // The actual +30% undead summon stat bonus is applied via
        // summonCapture.applyClassSummonBonus in summonSystem.buildCombatEntity.
        // The 'value: 30' now matches the description (+30% stats).
        passive: { name: `Death's Apprentice`, desc: `Undead summons have +30% stats.`, effect: 'summon_buff', value: 30 },
        evolves_into: ['LICH'],
    },
    LICH: {
        id: 'LICH',
        name: 'Lich',
        icon: '💀👑',
        desc: `Escape from death itself.`,
        tier: 'ASCENDED',
        evolvedFrom: 'NECROMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 300, atk: 15, def: 25, mag: 68, spd: 20, luck: 18, crit: 20 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'VOID_NECROMANCER' },
        evolutionCost: 100000,
        passive: { name: 'Phylactery', desc: `Revives at 50% HP once per quest.`, effect: 'revive', value: 50 },
        // SHELVED: evolves_into: ['NEKROS'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "NEKROS" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  NEKROS: {
    //     id: 'NEKROS',
    //     name: 'Nekros',
    //     icon: '🎖️',
    //     desc: `Death retired. He's covering the shift.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'LICH',
    //     role: 'TANK',
    //     stats: { hp: 465, atk: 25, def: 40, mag: 95, spd: 30, luck: 30, crit: 30 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'DEATH' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Undying Sovereign', desc: `Revives at full HP, twice per quest.`, effect: 'damage_reduction', value: 40 },
    // },

    CHRONOMANCER: {
        id: 'CHRONOMANCER',
        name: 'Chronomancer',
        icon: '⏳',
        desc: `Weaving time into spellwork.`,
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 88, atk: 6, def: 6, mag: 28, spd: 14, luck: 13, crit: 12 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'CHRONOS_WARDEN' },
        evolutionCost: 0,
        passive: { name: 'Temporal Flow', desc: `Cooldowns reduced by 1.`, effect: 'cooldown_reduction', value: 1 },
        evolves_into: ['TIMELORD'],
    },
    TIMELORD: {
        id: 'TIMELORD',
        name: 'Time Lord',
        icon: '⏳👑',
        desc: `Unshackled from the present.`,
        tier: 'ASCENDED',
        evolvedFrom: 'CHRONOMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 240, atk: 15, def: 20, mag: 72, spd: 60, luck: 30, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'TIME_EATER' },
        evolutionCost: 100000,
        passive: { name: 'Temporal Mastery', desc: `Takes 2 actions per turn.`, effect: 'extra_action', value: 1 },
        // SHELVED: evolves_into: ['CHRONARCH'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "CHRONARCH" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  CHRONARCH: {
    //     id: 'CHRONARCH',
    //     name: 'Chronarch',
    //     icon: '🎖️',
    //     desc: `Every clock in existence answers to him.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'TIMELORD',
    //     role: 'MAGIC_DPS',
    //     stats: { hp: 370, atk: 25, def: 30, mag: 105, spd: 95, luck: 40, crit: 40 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'FATHER_TIME' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Ruler of Time', desc: `Takes 3 actions per turn; skills have no cooldown.`, effect: 'all_stats', value: 30 },
    // },

    // ─── ACOLYTE LINE ────────────────────────────

    CLERIC: {
        id: 'CLERIC',
        name: 'Cleric',
        icon: '✨🙏',
        desc: `Spine of any party.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 110, atk: 7, def: 9, mag: 20, spd: 9, luck: 13, crit: 7 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'CORRUPTED_GUARDIAN' },
        evolutionCost: 0,

        passive: { name: 'Divine Grace', desc: `Healing spells heal 25% more.`, effect: 'healing_boost', value: 25 },
        evolves_into: ['SAINT'],
    },
    SAINT: {
        id: 'SAINT',
        name: 'Saint',
        icon: '😇',
        desc: `Aligned with forces of life and light.`,
        tier: 'ASCENDED',
        evolvedFrom: 'CLERIC',
        role: 'SUPPORT',
        stats: { hp: 350, atk: 22, def: 40, mag: 65, spd: 22, luck: 35, crit: 18 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'SERAPHIM_PRIME' },
        evolutionCost: 100000,
        passive: { name: 'Sainthood', desc: `All healing is doubled.`, effect: 'healing_boost', value: 50 },
        // SHELVED: evolves_into: ['EMPYREAN'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "EMPYREAN" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  EMPYREAN: {
    //     id: 'EMPYREAN',
    //     name: 'Empyrean',
    //     icon: '🎖️',
    //     desc: `Heaven sent one more, just in case.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'SAINT',
    //     role: 'SUPPORT',
    //     stats: { hp: 540, atk: 35, def: 60, mag: 100, spd: 35, luck: 55, crit: 20 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'FALLEN_AMGEL' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Pure Grace', desc: `Healing tripled; Party immune to death once per battle.`, effect: 'healing_boost', value: 75 },
    // },
    DRUID: {
        id: 'DRUID',
        name: 'Druid',
        icon: '🌿',
        desc: `Nature IS the combatant.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 115, atk: 8, def: 10, mag: 18, spd: 11, luck: 12, crit: 8 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'FOREST_ANCESTOR' },
        evolutionCost: 0,
        passive: { name: 'Wild Shape', desc: `Can transform each combat.`, effect: 'all_stats', value: 10 },
        evolves_into: ['ARCHDRUID'],
    },
    ARCHDRUID: {
        id: 'ARCHDRUID',
        name: 'Archdruid',
        icon: '🌳👑',
        desc: `The forest obeys them.`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRUID',
        role: 'SUPPORT',
        stats: { hp: 400, atk: 28, def: 38, mag: 60, spd: 28, luck: 30, crit: 22 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'GAIA_SENTINEL' },
        evolutionCost: 100000,
        passive: { name: "Nature's Wrath", desc: `Regenerate 3% max HP per turn.`, effect: 'regen', value: 5 },
        // SHELVED: evolves_into: ['SYLVANUS'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "SYLVANUS" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  SYLVANUS: {
    //     id: 'SYLVANUS',
    //     name: 'Sylvanus',
    //     icon: '🎖️',
    //     desc: `The forest doesn't just obey him — it remembers him.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'ARCHDRUID',
    //     role: 'SUPPORT',
    //     stats: { hp: 620, atk: 45, def: 60, mag: 95, spd: 45, luck: 45, crit: 35 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'WORLD_TREE_GUARDIAN' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Worlds Will', desc: `Self regen 6% HP/turn; party regen 3% HP/turn.`, effect: 'regen', value: 8 },
    // },

    MERCHANT: {
        id: 'MERCHANT',
        name: 'Merchant',
        icon: '💰',
        desc: `Wealth is a form of power.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 105, atk: 7, def: 8, mag: 12, spd: 10, luck: 25, crit: 9 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'GOLDEN_GOLEM' },
        evolutionCost: 0,
        passive: { name: 'Market Advantage', desc: `Earn 50% more Zeni.`, effect: 'gold_find', value: 50 },
        evolves_into: ['TYCOON'],
    },
    TYCOON: {
        id: 'TYCOON',
        name: 'Tycoon',
        icon: '💰👑',
        desc: `Financial empire generates income passively.`,
        tier: 'ASCENDED',
        evolvedFrom: 'MERCHANT',
        role: 'SUPPORT',
        stats: { hp: 300, atk: 25, def: 30, mag: 40, spd: 25, luck: 100, crit: 30 },
        requirement: { level: 50, questsCompleted: 100, goldEarned: 500000, gold: 200000, trialBoss: 'TREASURE_HOARDER' },
        evolutionCost: 200000,
        passive: { name: 'Infinite Capital', desc: `Earns Zeni each turn in combat.`, effect: 'gold_find', value: 100 },
        // SHELVED: evolves_into: ['PLUTOCRAT'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "PLUTOCRAT" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  PLUTOCRAT: {
    //     id: 'PLUTOCRAT',
    //     name: 'Plutocrat',
    //     icon: '🎖️',
    //     desc: `Owns the debt on every soul in the room.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'TYCOON',
    //     role: 'SUPPORT',
    //     stats: { hp: 465, atk: 40, def: 45, mag: 65, spd: 40, luck: 105, crit: 40 },
    //     requirement: { level: 90, questsCompleted: 500, goldEarned: 2000000, gold: 3000000, trialBoss: 'KING_MIDAS' },
    //     evolutionCost: 3000000,
    //     passive: { name: 'MIDAS TOUCH', desc: `Gold never decreases; +100% zeni earned.`, effect: 'gold_find', value: 200 },
    // },

    BARD: {
        id: 'BARD',
        name: 'Bard',
        icon: '🎸',
        desc: `Music is magic.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 8, def: 7, mag: 16, spd: 12, luck: 14, crit: 10 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'SOUND_REAPER' },
        evolutionCost: 0,
        passive: { name: 'Inspiring Song', desc: `Party gain +10% to all stats.`, effect: 'party_all_buff', value: 10 },
        evolves_into: ['VIRTUOSO'],
    },
    VIRTUOSO: {
        id: 'VIRTUOSO',
        name: 'Virtuoso',
        icon: '🎻✨',
        desc: `Found the frequency at which the universe vibrates.`,
        tier: 'ASCENDED',
        evolvedFrom: 'BARD',
        role: 'SUPPORT',
        stats: { hp: 280, atk: 18, def: 20, mag: 55, spd: 30, luck: 40, crit: 25 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'MAESTRO_OF_VOID' },
        evolutionCost: 100000,
        passive: { name: 'Grand Finale', desc: `Revive fallen allies.`, effect: 'revive', value: 30 },
        // SHELVED: evolves_into: ['HARMONIA'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "HARMONIA" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  HARMONIA: {
    //     id: 'HARMONIA',
    //     name: 'Harmonia',
    //     icon: '🎖️',
    //     desc: `The song the universe hums when no one's listening.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'VIRTUOSO',
    //     role: 'SUPPORT',
    //     stats: { hp: 435, atk: 30, def: 30, mag: 85, spd: 45, luck: 60, crit: 40 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'SILENCE_ITSELF' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Eternal Muse', desc: `Revives one fallen ally each turn automatically; party immune to silence.`, effect: 'healing_boost', value: 50 },
    // },

    ARTIFICER: {
        id: 'ARTIFICER',
        name: 'Artificer',
        icon: '🔧',
        desc: `Combination of arcane theory and engineering.`,
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 108, atk: 9, def: 9, mag: 15, spd: 11, luck: 11, crit: 11 },
        requirement: { level: 15, questsCompleted: 15, trialBoss: 'CLOCKWORK_TITAN' },
        evolutionCost: 0,
        passive: { name: 'Overclocked', desc: `Summons deal 40% more damage.`, effect: 'damage_per_hit', value: 20 },
        evolves_into: ['GRAND_INVENTOR'],
    },
    GRAND_INVENTOR: {
        id: 'GRAND_INVENTOR',
        name: 'Grand Inventor',
        icon: '🦾⚙️',
        desc: `Workshop produces wonders.`,
        tier: 'ASCENDED',
        evolvedFrom: 'ARTIFICER',
        role: 'SUPPORT',
        stats: { hp: 320, atk: 25, def: 35, mag: 35, spd: 22, luck: 25, crit: 20 },
        requirement: { level: 50, questsCompleted: 100, gold: 100000, trialBoss: 'MECH_GOD' },
        evolutionCost: 100000,
        passive: { name: 'Master Craftsman', desc: `Double crafting output.`, effect: 'all_stats', value: 15 },
        // SHELVED: evolves_into: ['TECHNARCH'],
    },

    // ═══════════════════════════════════════════════════════════════
    // 🚧 SHELVED — PEAK tier class "TECHNARCH" (contributed by @Daviddey via PR #7)
    // Trial bosses, skill trees, and Go sprites not yet implemented.
    // Uncomment this block once content is ready.
    // ═══════════════════════════════════════════════════════════════
    //  TECHNARCH: {
    //     id: 'TECHNARCH',
    //     name: 'Technarch',
    //     icon: '🎖️',
    //     desc: `Built a machine that started building itself. On purpose.`,
    //     tier: 'PEAK',
    //     evolvedFrom: 'GRAND_INVENTOR',
    //     role: 'SUPPORT',
    //     stats: { hp: 495, atk: 40, def: 55, mag: 55, spd: 35, luck: 40, crit: 30 },
    //     requirement: { level: 90, questsCompleted: 500, gold: 1000000, trialBoss: 'SINGULARITY_ENGINE' },
    //     evolutionCost: 1000000,
    //     passive: { name: 'Omega Craftsman', desc: `Triple crafting output; summons deal +80% dmg`, effect: 'damage_per_hit', value: 40 },
    // },
};

// ==========================================
// 🏆 ADVENTURER RANK SYSTEM
// ==========================================

const ADVENTURER_RANKS = {
    F: {
        name: 'F-Rank', icon: '🔰', color: '⚪',
        requirement: { level: 1, questsCompleted: 0, gp: 0 },
        benefits: { questRewardBonus: 0 }
    },
    E: {
        name: 'E-Rank', icon: '🥉', color: '⚪',
        requirement: { level: 10, questsCompleted: 10, gp: 50 },
        benefits: { questRewardBonus: 5 }
    },
    D: {
        name: 'D-Rank', icon: '🥈', color: '🔵',
        requirement: { level: 20, questsCompleted: 25, gp: 150 },
        benefits: { questRewardBonus: 10 }
    },
    C: {
        name: 'C-Rank', icon: '🥇', color: '🔵',
        requirement: { level: 30, questsCompleted: 50, gp: 400 },
        benefits: { questRewardBonus: 15 }
    },
    B: {
        name: 'B-Rank', icon: '💎', color: '🔴',
        requirement: { level: 40, questsCompleted: 80, gp: 800 },
        benefits: { questRewardBonus: 20 }
    },
    A: {
        name: 'A-Rank', icon: '💠', color: '🔴',
        requirement: { level: 50, questsCompleted: 120, gp: 1500 },
        benefits: { questRewardBonus: 30 }
    },
    S: {
        name: 'S-Rank', icon: '⭐', color: '🟡',
        requirement: { level: 60, questsCompleted: 180, gp: 3000 },
        benefits: { questRewardBonus: 40 }
    },
    SS: {
        name: 'SS-Rank', icon: '🌟', color: '🟡',
        requirement: { level: 75, questsCompleted: 250, gp: 6000 },
        benefits: { questRewardBonus: 60 }
    },
    SSS: {
        name: 'SSS-Rank', icon: '✨', color: '⚪',
        requirement: { level: 90, questsCompleted: 500, gp: 12000 },
        benefits: { questRewardBonus: 100 }
    },
    GOD: {
        name: 'GOD-Rank', icon: '♾️', color: '⚪',
        requirement: { level: 100, questsCompleted: 1000, gp: 25000 },
        benefits: { questRewardBonus: 200 }
    }
};

// ==========================================
// 🎯 RANK MISSION SYSTEM
// ==========================================
// Every 2 rank promotions, the player must complete a rank mission
// before they can advance further. The gate is:
//   F→E, E→D: Free (no mission)
//   D→C:      Mission 1 required (the Trial of Combat)
//   C→B:      Free
//   B→A:      Mission 2 required (the Trial of Mastery)
//   A→S:      Free
//   S→SS:     Mission 3 required (the Trial of Legend)
//   SS→SSS:   Free
//   SSS→GOD:  Mission 4 required (the Trial of Divinity)
//
// Each mission has a set of objectives that must ALL be completed.
// Objectives are tracked cumulatively (lifetime stats) so the player
// can work on them over time — they don't have to do everything in
// one session.

const RANK_MISSIONS = {
    // Mission 1: Unlocks C-rank (gate after D)
    1: {
        id: 1,
        name: 'Trial of Combat',
        icon: '⚔️',
        desc: 'Prove your worth as a warrior by mastering combat across multiple disciplines.',
        unlocksRank: 'C',
        objectives: [
            { id: 'quests_won', label: 'Win 20 quests', target: 20, statKey: 'questsWon' },
            { id: 'bosses_killed', label: 'Defeat 5 bosses', target: 5, statKey: 'bossesDefeated' },
            { id: 'pvp_wins', label: 'Win 3 PvP duels', target: 3, statKey: 'pvpWins' },
        ]
    },
    // Mission 2: Unlocks A-rank (gate after B)
    2: {
        id: 2,
        name: 'Trial of Mastery',
        icon: '🏆',
        desc: 'Show that you have mastered the crafting and progression systems.',
        unlocksRank: 'A',
        objectives: [
            { id: 'quests_won', label: 'Win 50 quests', target: 50, statKey: 'questsWon' },
            { id: 'items_crafted', label: 'Craft 15 items', target: 15, statKey: 'itemsCrafted' },
            { id: 'items_equipped', label: 'Equip 10 different items', target: 10, statKey: 'itemsEquipped' },
        ]
    },
    // Mission 3: Unlocks SS-rank (gate after S)
    3: {
        id: 3,
        name: 'Trial of Legend',
        icon: '🌟',
        desc: 'Only true legends pass this trial. Prove your dominance in all aspects of the game.',
        unlocksRank: 'SS',
        objectives: [
            { id: 'quests_won', label: 'Win 100 quests', target: 100, statKey: 'questsWon' },
            { id: 'bosses_killed', label: 'Defeat 20 bosses', target: 20, statKey: 'bossesDefeated' },
            { id: 'pvp_wins', label: 'Win 10 PvP duels', target: 10, statKey: 'pvpWins' },
            { id: 'dragon_kills', label: 'Slay 10 dragons', target: 10, statKey: 'dragonsKilled' },
        ]
    },
    // Mission 4: Unlocks GOD-rank (gate after SSS)
    4: {
        id: 4,
        name: 'Trial of Divinity',
        icon: '♾️',
        desc: 'The ultimate trial. Only those who have truly conquered everything may ascend to godhood.',
        unlocksRank: 'GOD',
        objectives: [
            { id: 'quests_won', label: 'Win 200 quests', target: 200, statKey: 'questsWon' },
            { id: 'bosses_killed', label: 'Defeat 50 bosses', target: 50, statKey: 'bossesDefeated' },
            { id: 'pvp_wins', label: 'Win 25 PvP duels', target: 25, statKey: 'pvpWins' },
            { id: 'dragon_kills', label: 'Slay 50 dragons', target: 50, statKey: 'dragonsKilled' },
            { id: 'items_crafted', label: 'Craft 50 items', target: 50, statKey: 'itemsCrafted' },
        ]
    },
};

// Map: which rank requires which mission to be completed before promotion?
// null = no mission required (free promotion).
const RANK_MISSION_GATES = {
    'F': null,  // F→E: free
    'E': null,  // E→D: free
    'D': 1,     // D→C: need Mission 1 (Trial of Combat)
    'C': null,  // C→B: free
    'B': 2,     // B→A: need Mission 2 (Trial of Mastery)
    'A': null,  // A→S: free
    'S': 3,     // S→SS: need Mission 3 (Trial of Legend)
    'SS': null,  // SS→SSS: free
    'SSS': 4,    // SSS→GOD: need Mission 4 (Trial of Divinity)
};

/**
 * Check if a player is allowed to be promoted from `currentRank` to the
 * next rank. Returns { canPromote, blockedByMission, mission }.
 */
function checkRankPromotionEligibility(currentRank, completedMissions) {
    const gate = RANK_MISSION_GATES[currentRank];
    if (gate === null || gate === undefined) {
        return { canPromote: true, blockedByMission: null, mission: null };
    }
    const mission = RANK_MISSIONS[gate];
    const completed = (completedMissions || []).includes(gate);
    if (!completed) {
        return { canPromote: false, blockedByMission: gate, mission };
    }
    return { canPromote: true, blockedByMission: null, mission };
}

/**
 * Get the mission that gates promotion from the player's current rank.
 * Returns null if no mission is required.
 */
function getGateMissionForRank(currentRank) {
    const gate = RANK_MISSION_GATES[currentRank];
    if (gate === null || gate === undefined) return null;
    return RANK_MISSIONS[gate];
}

/**
 * Get a mission by ID.
 */
function getRankMission(missionId) {
    return RANK_MISSIONS[missionId] || null;
}

/**
 * Check if a mission's objectives are all complete given the player's stats.
 * Returns { complete, progress: [{ objective, current, target, done }] }.
 */
function checkMissionProgress(missionId, playerStats) {
    const mission = RANK_MISSIONS[missionId];
    if (!mission) return { complete: false, progress: [] };

    const progress = mission.objectives.map(obj => {
        const current = Math.min(playerStats[obj.statKey] || 0, obj.target);
        return {
            id: obj.id,
            label: obj.label,
            statKey: obj.statKey,
            current,
            target: obj.target,
            done: current >= obj.target,
        };
    });

    const complete = progress.every(p => p.done);
    return { complete, progress };
}

const CLASS_SHOP_ITEMS = {
      class_change_ticket: {
          id: 'class_change_ticket', name: 'Class Change Ticket', icon: '🎫',
          desc: `Reroll your starter class to a random one.`,
          cost: 400, type: 'CLASS_CHANGE', category: 'CLASS'
      },
      evolution_stone: {
          id: 'evolution_stone', name: 'Evolution Stone (T2)', icon: '💎',
          desc: `Evolve from a Starter class to an Evolved class.`,
          cost: 8000, type: 'EVOLUTION', category: 'CLASS'
      },
      ascension_stone: {
          id: 'ascension_stone', name: 'Ascension Stone (T3)', icon: '🔮',
          desc: `Ascend from an Evolved class to an Ascended class.`,
          cost: 50000, type: 'ASCENSION', category: 'CLASS'
      },
      skill_reset: {
        id: 'skill_reset', name: 'Skill Reset Scroll', icon: '📜',
        desc: `Refund all invested skill points.`,
        cost: 1000, type: 'RESET', category: 'CLASS'
    }
};

function getAllClasses() {
    return { ...STARTER_CLASSES, ...EVOLVED_CLASSES };
}

function getClassById(classId) {
    const allClasses = getAllClasses();
    return allClasses[classId] || null;
}

function getRandomStarterClass() {
    const starterKeys = Object.keys(STARTER_CLASSES);
    const randomKey = starterKeys[Math.floor(Math.random() * starterKeys.length)];
    return STARTER_CLASSES[randomKey];
}

function isFighterLineage(classId) {
    if (!classId) return false;
    if (classId === 'FIGHTER') return true;
    const classData = getClassById(classId);
    if (!classData) return false;
    let current = classData;
    while (current && current.evolvedFrom) {
        if (current.evolvedFrom === 'FIGHTER') return true;
        current = getClassById(current.evolvedFrom);
    }
    return false;
}

function canEvolve(currentClassId, userLevel, questsCompleted, dragonsKilled = 0, completedTrials = [], userContext = {}) {
    // userContext is an optional bag of additional gating data:
    //   { gold, goldEarned, victories, undeadKills }
    // We use it instead of `arguments[5]` (which was unreadable, broken in
    // arrow functions, and didn't include goldEarned / dragonsKilled / victories
    // checks that several evolution requirements actually need).
    const currentClass = getClassById(currentClassId);
    if (!currentClass) return { canEvolve: false, reason: 'Invalid class' };
    if (currentClass.tier === 'ASCENDED') return { canEvolve: false, reason: 'Max tier reached' };

    const evolutionIds = currentClass.evolves_into;
    if (!evolutionIds || evolutionIds.length === 0) return { canEvolve: false, reason: 'No evolutions' };

    const evolutions = [];
    const allClasses = getAllClasses();

    for (const evoId of evolutionIds) {
        const evoClass = allClasses[evoId];
        if (evoClass) {
            const missing = [];
            const req = evoClass.requirement || {};
            if (userLevel < (req.level || 0)) missing.push(`Level ${req.level}`);
            if (questsCompleted < (req.questsCompleted || 0)) missing.push(`${req.questsCompleted} Quests`);

            // Gold on hand (one-time cost)
            if (req.gold && (userContext.gold || 0) < req.gold) {
                missing.push(`${req.gold.toLocaleString()} Gold`);
            }
            // Lifetime gold earned (e.g. Tycoon requires 500k earned)
            if (req.goldEarned && (userContext.goldEarned || 0) < req.goldEarned) {
                missing.push(`${req.goldEarned.toLocaleString()} Gold Earned (lifetime)`);
            }
            // Lifetime dragon kills (e.g. Dragon God requires 200)
            if (req.dragonsKilled && (dragonsKilled || 0) < req.dragonsKilled) {
                missing.push(`${req.dragonsKilled} Dragons Killed`);
            }
            // Lifetime victories (e.g. Warlord requires 100)
            if (req.victories && (userContext.victories || 0) < req.victories) {
                missing.push(`${req.victories} Victories`);
            }
            // Undead kills (e.g. Templar requires 200)
            if (req.undeadKills && (userContext.undeadKills || 0) < req.undeadKills) {
                missing.push(`${req.undeadKills} Undead Kills`);
            }
            // 💡 FIX: Total lifetime kills (e.g. DOOMSLAYER requires 500). Was
            // silently ignored — DOOMSLAYER was achievable without the kill count.
            if (req.kills && (userContext.kills || 0) < req.kills) {
                missing.push(`${req.kills} Total Kills`);
            }

            // Trial boss must be in completedTrials
            if (req.trialBoss && !completedTrials.includes(req.trialBoss)) {
                // 💡 FIX: hint used to say '.g trial' — but that command did
                // not exist. The actual trigger is `.g evolve <number>` which
                // auto-starts the trial boss fight when the player picks an
                // evolution that requires one. `.g trial` is now a real
                // command (see engine.js) that lists pending trials and can
                // also start them.
                missing.push(`Defeat ${req.trialBoss} (use ${require('../../botConfig').getPrefix()} evolve or ${require('../../botConfig').getPrefix()} trial)`);
            }

            evolutions.push({
                ...evoClass,
                meetsRequirements: missing.length === 0,
                missingRequirements: missing
            });
        }
    }
    return { canEvolve: true, evolutions };
}

function calculateAdventurerRank(level, questsCompleted, gp) {
    // GP is NO LONGER a requirement for adventurer rank. Ranks are now earned
    // by completing guild ranking missions (see the ranking mission system).
    // Previously GP was required, but that meant players could grind GP
    // without actually doing anything meaningful. Now rank promotions
    // require completing specific missions.
    //
    // IMPORTANT: This function only checks level + questsCompleted. The actual
    // rank assignment happens via ranking missions. If a player has a rank
    // already assigned (stored on user.adventurerRank), it's preserved —
    // this function is only used for INITIAL rank calculation when a player
    // has no rank assigned yet.
    const ranks = ['GOD', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    for (const rank of ranks) {
        const req = ADVENTURER_RANKS[rank].requirement;
        if (level >= req.level && questsCompleted >= req.questsCompleted) return rank;
    }
    return 'F';
}

function getNextRankRequirements(currentRank) {
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
    const currentIndex = ranks.indexOf(currentRank);
    if (currentIndex === -1 || currentIndex === ranks.length - 1) return null;
    const nextRank = ranks[currentIndex + 1];
    return {
        rank: nextRank,
        requirements: ADVENTURER_RANKS[nextRank].requirement,
        benefits: ADVENTURER_RANKS[nextRank].benefits
    };
}

function getLineage(classId) {
    const lineage = [];
    let currentId = classId;
    while (currentId) {
        lineage.push(currentId);
        const classData = getClassById(currentId);
        if (!classData?.evolvedFrom) break;
        currentId = classData.evolvedFrom;
    }
    return lineage;
}

module.exports = {
    STARTER_CLASSES,
    EVOLVED_CLASSES,
    ADVENTURER_RANKS,
    CLASS_SHOP_ITEMS,
    getAllClasses,
    getClassById,
    getRandomStarterClass,
    isFighterLineage,
    getLineage,
    canEvolve,
    calculateAdventurerRank,
    getNextRankRequirements,
    // Rank Mission System
    RANK_MISSIONS,
    RANK_MISSION_GATES,
    checkRankPromotionEligibility,
    getGateMissionForRank,
    getRankMission,
    checkMissionProgress,
};
