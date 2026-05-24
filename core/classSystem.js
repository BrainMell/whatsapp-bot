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
        passive: { name: 'Tenacity', desc: `Regenerates 3% of max HP every 2 turns in combat.` },
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
        passive: { name: 'Iron Command', desc: `Reduces all incoming damage to party by 15% in multi-player quests.` },
    },
    
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
        passive: { name: 'Bloodlust', desc: `CRIT chance increases by 1% for every 5% HP missing. Max +20%.` },
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
        passive: { name: 'Hell-Walker', desc: `Damage increases by 2% for every 1% of HP missing. No cap.` },
    },
    
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

        passive: { name: 'Divine Shield', desc: `Reduces all damage taken by 10%. Undead enemies deal -50% damage.` },
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
        passive: { name: 'Holy Retribution', desc: `Reflects 20% of all damage received back at attackers as holy damage.` },
    },
    
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
        passive: { name: 'Dragon Bane', desc: `Deal 3× damage to dragon-type enemies. Immune to fire DoT.` },
        evolves_into: ['DRAGON_GOD'],
    },
    DRAGON_GOD: {
        id: 'DRAGON_GOD',
        name: 'Dragon God',
        icon: '🐲👑',
        desc: `They did not slay the dragon. They became it.`,
        tier: 'ASCENDED',
        evolvedFrom: 'DRAGONSLAYER',
        role: 'TANK',
        stats: { hp: 550, atk: 45, def: 40, mag: 35, spd: 15, luck: 25, crit: 20 },
        requirement: { level: 75, questsCompleted: 200, dragonsKilled: 200, gold: 500000, trialBoss: 'LEVIATHAN' },
        evolutionCost: 500000,
        passive: { name: 'Dragon Heart', desc: `Immune to all status effects. Reduces all damage taken by 50%.` },
    },

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
        passive: { name: 'Shadow Step', desc: `Evasion increased by 15%.` },
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
        passive: { name: `Assassin's Mark`, desc: `10% chance on any attack to deal 10× damage.` },
    },

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
        passive: { name: 'Inner Focus', desc: `+10% accuracy and +10% speed.` },
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
        passive: { name: 'Perfect Form', desc: `Immune to stun.` },
    },

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
        passive: { name: 'Bushido', desc: `+20% ATK after standing still for a turn.` },
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
        passive: { name: `Commander's Will`, desc: `Party deals +20% physical damage.` },
    },

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
        passive: { name: 'Opening Strike', desc: `The first attack is always a critical hit.` },
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
        passive: { name: 'Absolute Stealth', desc: `50% base Evasion.` },
    },

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
        passive: { name: 'Arcane Well', desc: `Regenerates 10 Energy per turn.` },
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
        passive: { name: 'Infinity Flow', desc: `Energy costs reduced by 50%.` },
    },

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
        passive: { name: 'Soul Siphon', desc: `Heals for 8% of magic damage dealt.` },
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
        passive: { name: 'Abyssal Aura', desc: `Reduces nearby enemies' ATK and DEF by 15%.` },
    },

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
        passive: { name: 'Elemental Harmony', desc: `Elemental damage increased by 15%.` },
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
        passive: { name: 'Elemental Avatar', desc: `Automatically match enemy weakness.` },
    },

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
        passive: { name: `Death's Apprentice`, desc: `Summons have +30% stats.` },
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
        passive: { name: 'Phylactery', desc: `Revives at 50% HP once per quest.` },
    },

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
        passive: { name: 'Temporal Flow', desc: `Cooldowns reduced by 1.` },
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
        passive: { name: 'Temporal Mastery', desc: `Takes 2 actions per turn.` },
    },

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

        passive: { name: 'Divine Grace', desc: `Healing spells heal 25% more.` },
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
        passive: { name: 'Sainthood', desc: `All healing is doubled.` },
    },

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
        passive: { name: 'Wild Shape', desc: `Can transform each combat.` },
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
        passive: { name: "Nature's Wrath", desc: `Regenerate 3% max HP per turn.` },
    },

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
        passive: { name: 'Market Advantage', desc: `Earn 50% more Zeni.` },
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
        passive: { name: 'Infinite Capital', desc: `Earns Zeni each turn in combat.` },
    },

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
        passive: { name: 'Inspiring Song', desc: `Party gain +10% to all stats.` },
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
        passive: { name: 'Grand Finale', desc: `Revive fallen allies.` },
    },

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
        passive: { name: 'Overclocked', desc: `Summons deal 40% more damage.` },
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
        passive: { name: 'Master Craftsman', desc: `Double crafting output.` },
    },
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

function canEvolve(currentClassId, userLevel, questsCompleted, dragonsKilled = 0, completedTrials = []) {
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
            const req = evoClass.requirement;
            if (userLevel < (req.level || 0)) missing.push(`Level ${req.level}`);
            if (questsCompleted < (req.questsCompleted || 0)) missing.push(`${req.questsCompleted} Quests`);
            
            // Check gold requirement
            const userGold = arguments[5] || 0; // optional 6th param: userGold
            if (req.gold && userGold < req.gold) missing.push(`${req.gold.toLocaleString()} Gold`);
            
            // Check Trial
            if (req.trialBoss && !completedTrials.includes(req.trialBoss)) {
                missing.push(`Defeat ${req.trialBoss} (${require('../botConfig').getPrefix()} trial)`);
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
    getNextRankRequirements
};
