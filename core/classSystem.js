// ============================================
// 🎭 CLASS SYSTEM - Permanent Player Classes
// ============================================
// Players get a random starter class on registration
// Can evolve into specialized classes later

// ==========================================
// 🌟 STARTER CLASSES (4)
// ==========================================

const STARTER_CLASSES = {
    FIGHTER: {
        id: 'FIGHTER',
        name: 'Fighter',
        icon: '⚔️',
        desc: 'Balanced warrior, good at physical combat',
        tier: 'STARTER',
        stats: { hp: 120, atk: 12, def: 10, mag: 4, spd: 8, luck: 6, crit: 8 },
        evolves_into: ['WARRIOR', 'BERSERKER', 'PALADIN', 'DRAGONSLAYER']
    },
    
    SCOUT: {
        id: 'SCOUT',
        name: 'Scout',
        icon: '🗡️',
        desc: 'Quick and agile, focuses on speed',
        tier: 'STARTER',
        stats: { hp: 90, atk: 10, def: 5, mag: 3, spd: 16, luck: 14, crit: 18 },
        evolves_into: ['ROGUE', 'MONK', 'SAMURAI', 'NINJA']
    },
    
    APPRENTICE: {
        id: 'APPRENTICE',
        name: 'Apprentice',
        icon: '🔮',
        desc: 'Beginners who have just started their journey into the arcane. They possess high potential but low initial power. Apprentices can eventually choose paths leading to the mastery of the elements, the manipulation of time, or the dark arts of necromancy and soul-harvesting.',
        tier: 'STARTER',
        stats: { hp: 80, atk: 5, def: 4, mag: 18, spd: 9, luck: 8, crit: 10 },
        evolves_into: ['MAGE', 'WARLOCK', 'ELEMENTALIST', 'NECROMANCER', 'CHRONOMANCER']
    },
    
    ACOLYTE: {
        id: 'ACOLYTE',
        name: 'Acolyte',
        icon: '✨',
        desc: 'Supportive novice with healing abilities',
        tier: 'STARTER',
        stats: { hp: 100, atk: 6, def: 8, mag: 14, spd: 10, luck: 12, crit: 6 },
        evolves_into: ['CLERIC', 'DRUID', 'MERCHANT', 'BARD', 'ARTIFICER']
    }
};

// ==========================================
// 💎 EVOLVED CLASSES (15)
// ==========================================

const EVOLVED_CLASSES = {
    // FIGHTER EVOLUTIONS (Tank Focus)
    WARRIOR: {
        id: 'WARRIOR',
        name: 'Warrior',
        icon: '⚔️',
        desc: 'Frontline tank with high HP and defense',
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 200, atk: 12, def: 15, mag: 2, spd: 5, luck: 5, crit: 5 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Tenacity', desc: 'Slowly regenerates 5 HP per hour.' },
        evolves_into: ['WARLORD']
    },
    WARLORD: {
        id: 'WARLORD',
        name: 'Warlord',
        icon: '🎖️',
        desc: 'Supreme battlefield commander with unmatched defense.',
        tier: 'ASCENDED',
        evolvedFrom: 'WARRIOR',
        role: 'TANK',
        stats: { hp: 450, atk: 25, def: 40, mag: 5, spd: 10, luck: 10, crit: 10 },
        requirement: { level: 30, questsCompleted: 15, victories: 100, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Commander', desc: 'Reduces all incoming damage to party by 15% in quests.' }
    },
    
    BERSERKER: {
        id: 'BERSERKER',
        name: 'Berserker',
        icon: '🪓',
        desc: 'Rage-fueled warrior with high damage',
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 220, atk: 16, def: 10, mag: 1, spd: 6, luck: 4, crit: 12 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Bloodlust', desc: 'Increases Crit chance by 5% in all combat.' },
        evolves_into: ['DOOMSLAYER']
    },
    DOOMSLAYER: {
        id: 'DOOMSLAYER',
        name: 'Doomslayer',
        icon: '🔥🪓',
        desc: 'An unstoppable force of pure destruction.',
        tier: 'ASCENDED',
        evolvedFrom: 'BERSERKER',
        role: 'TANK',
        stats: { hp: 500, atk: 45, def: 20, mag: 2, spd: 15, luck: 5, crit: 25 },
        requirement: { level: 30, questsCompleted: 15, kills: 500, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Hell-Walker', desc: 'Damage increases by 2% for every 1% of HP missing.' }
    },
    
    PALADIN: {
        id: 'PALADIN',
        name: 'Paladin',
        icon: '🛡️',
        desc: 'Holy defender with healing and protection',
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 180, atk: 10, def: 18, mag: 8, spd: 4, luck: 7, crit: 3 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Divine Shield', desc: 'Reduces damage taken in quests by 10%.' },
        evolves_into: ['TEMPLAR']
    },
    TEMPLAR: {
        id: 'TEMPLAR',
        name: 'Templar',
        icon: '⛪',
        desc: 'The ultimate shield of the divine.',
        tier: 'ASCENDED',
        evolvedFrom: 'PALADIN',
        role: 'TANK',
        stats: { hp: 400, atk: 20, def: 45, mag: 25, spd: 8, luck: 15, crit: 10 },
        requirement: { level: 30, questsCompleted: 15, undeadKills: 200, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Holy Retribution', desc: 'Reflects 20% of all damage taken back at the enemy.' }
    },
    
    // SCOUT EVOLUTIONS (DPS Focus)
    ROGUE: {
        id: 'ROGUE',
        name: 'Rogue',
        icon: '🗡️',
        desc: 'Agile assassin with high crit',
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 100, atk: 18, def: 5, mag: 3, spd: 20, luck: 15, crit: 25 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Shadow Cloak', desc: 'Increases Evasion in quests by 15%.' },
        evolves_into: ['NIGHTBLADE']
    },
    NIGHTBLADE: {
        id: 'NIGHTBLADE',
        name: 'Nightblade',
        icon: '🌑🗡️',
        desc: 'One with the shadows, strikes with lethal precision.',
        tier: 'ASCENDED',
        evolvedFrom: 'ROGUE',
        role: 'DPS',
        stats: { hp: 220, atk: 40, def: 10, mag: 10, spd: 45, luck: 30, crit: 40 },
        requirement: { level: 30, questsCompleted: 15, assassinations: 150, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Assassins Mark', desc: 'Has a 10% chance to deal 10x damage on any attack.' }
    },
    
    MONK: {
        id: 'MONK',
        name: 'Monk',
        icon: '🥋',
        desc: 'Martial artist with combo attacks',
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 120, atk: 14, def: 8, mag: 6, spd: 18, luck: 10, crit: 15 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Focus', desc: 'Increases accuracy and speed by 10%.' },
        evolves_into: ['ZENMASTER']
    },
    ZENMASTER: {
        id: 'ZENMASTER',
        name: 'Zenmaster',
        icon: '🧘',
        desc: 'Attained enlightenment, controlling the flow of battle.',
        tier: 'ASCENDED',
        evolvedFrom: 'MONK',
        role: 'DPS',
        stats: { hp: 300, atk: 35, def: 20, mag: 30, spd: 40, luck: 20, crit: 25 },
        requirement: { level: 30, questsCompleted: 15, perfectDodges: 200, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Inner Peace', desc: 'Automatically clears one negative status effect every turn.' }
    },
    
    // APPRENTICE EVOLUTIONS (Magic DPS)
    MAGE: {
        id: 'MAGE',
        name: 'Mage',
        icon: '🔮',
        desc: 'Advanced arcane spellcasters who have moved beyond basic apprenticeships. Mages specialize in massive burst damage and area-of-effect spells. Their control over pure magical energy allows them to restore their own resources during combat, maintaining a consistent offensive presence.',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 85, atk: 5, def: 4, mag: 25, spd: 8, luck: 10, crit: 12 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Arcane Well', desc: 'Restores 10 Mana/Energy per turn in combat.' },
        evolves_into: ['ARCHMAGE']
    },
    ARCHMAGE: {
        id: 'ARCHMAGE',
        name: 'Archmage',
        icon: '🧙‍♂️✨',
        desc: 'The pinnacle of arcane mastery. Archmages have achieved such a deep understanding of magical theory that they can warp reality itself. Their mere presence stabilizes magical fields, allowing them to cast even the most taxing spells with significantly reduced effort. At this level, cooldowns and resource costs become secondary to their overwhelming power.',
        tier: 'ASCENDED',
        evolvedFrom: 'MAGE',
        role: 'MAGIC_DPS',
        stats: { hp: 180, atk: 10, def: 15, mag: 60, spd: 20, luck: 20, crit: 20 },
        requirement: { level: 30, questsCompleted: 15, spellsCast: 1000, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Infinity Flow', desc: 'All ability costs are reduced by 50%.' }
    },
    
    WARLOCK: {
        id: 'WARLOCK',
        name: 'Warlock',
        icon: '👹',
        desc: 'Dark caster who drains life',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 95, atk: 6, def: 5, mag: 22, spd: 7, luck: 8, crit: 10 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Soul Siphon', desc: 'Heals for 5% of all magic damage dealt.' },
        evolves_into: ['VOIDWALKER']
    },
    VOIDWALKER: {
        id: 'VOIDWALKER',
        name: 'Voidwalker',
        icon: '🌑🧙',
        desc: 'Corrupted by the abyss, wielding dark void energy.',
        tier: 'ASCENDED',
        evolvedFrom: 'WARLOCK',
        role: 'MAGIC_DPS',
        stats: { hp: 250, atk: 15, def: 20, mag: 55, spd: 15, luck: 10, crit: 15 },
        requirement: { level: 30, questsCompleted: 15, soulsHarvested: 300, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Abyssal Presence', desc: 'Lower enemy ATK and DEF by 15% just by being present.' }
    },
    
    ELEMENTALIST: {
        id: 'ELEMENTALIST',
        name: 'Elementalist',
        icon: '🌊',
        desc: 'Master of all elements',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 90, atk: 6, def: 5, mag: 24, spd: 9, luck: 9, crit: 11 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Elemental Harmony', desc: 'All elemental damage increased by 15%.' },
        evolves_into: ['AVATAR']
    },

    NECROMANCER: {
        id: 'NECROMANCER',
        name: 'Necromancer',
        icon: '💀',
        desc: 'Master of undeath and dark magic',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 88, atk: 5, def: 4, mag: 23, spd: 7, luck: 7, crit: 9 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Undead Mastery', desc: 'Summons have +30% stats.' },
        evolves_into: ['LICH']
    },

    CHRONOMANCER: {
        id: 'CHRONOMANCER',
        name: 'Chronomancer',
        icon: '⏳',
        desc: 'Manipulator of time itself',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'MAGIC_DPS',
        stats: { hp: 85, atk: 5, def: 5, mag: 24, spd: 12, luck: 11, crit: 10 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Temporal Flux', desc: 'All cooldowns reduced by 1 turn.' },
        evolves_into: ['TIMELORD']
    },

    SAMURAI: {
        id: 'SAMURAI',
        name: 'Samurai',
        icon: '⚔️🌸',
        desc: 'Honor-bound warrior of the blade',
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 130, atk: 17, def: 9, mag: 4, spd: 16, luck: 11, crit: 20 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Bushido', desc: 'Gain +20% ATK and DEF when honorable.' },
        evolves_into: ['SHOGUN']
    },
    SHOGUN: {
        id: 'SHOGUN',
        name: 'Shogun',
        icon: '🏯⚔️',
        desc: 'Supreme military commander, master of the battlefield.',
        tier: 'ASCENDED',
        evolvedFrom: 'SAMURAI',
        role: 'DPS',
        stats: { hp: 280, atk: 45, def: 25, mag: 10, spd: 22, luck: 15, crit: 30 },
        requirement: { level: 30, questsCompleted: 15, victories: 200, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Commanders Will', desc: 'Party deals 20% more physical damage.' }
    },

    NINJA: {
        id: 'NINJA',
        name: 'Ninja',
        icon: '🥷',
        desc: 'Master of stealth and shadow arts',
        tier: 'EVOLVED',
        evolvedFrom: 'SCOUT',
        role: 'DPS',
        stats: { hp: 95, atk: 16, def: 4, mag: 5, spd: 22, luck: 16, crit: 28 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Shadow Arts', desc: 'First strike always guaranteed crit.' },
        evolves_into: ['KAGE']
    },
    KAGE: {
        id: 'KAGE',
        name: 'Kage',
        icon: '🌑🥷',
        desc: 'The shadow that rules from the darkness.',
        tier: 'ASCENDED',
        evolvedFrom: 'NINJA',
        role: 'DPS',
        stats: { hp: 200, atk: 48, def: 12, mag: 15, spd: 50, luck: 25, crit: 45 },
        requirement: { level: 30, questsCompleted: 15, shadowKills: 100, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Absolute Stealth', desc: '50% base Evasion. Never missed by attacks.' }
    },

    DRAGONSLAYER: {
        id: 'DRAGONSLAYER',
        name: 'Dragonslayer',
        icon: '🐲⚔️',
        desc: 'Legendary dragon hunter. Dragonslayers are specialized warriors who have mastered the art of slaying ancient drakes. Their techniques are designed to bypass dragon scales and neutralize elemental breath. Known for their "Dragon-Bane" feat, they deal massive damage to all draconic beings.',
        tier: 'EVOLVED',
        evolvedFrom: 'FIGHTER',
        role: 'TANK',
        stats: { hp: 190, atk: 14, def: 13, mag: 3, spd: 7, luck: 8, crit: 10 },
        requirement: { level: 40, questsCompleted: 30, gold: 150000, item: 'dragon_heart', fighterBase: true },
        evolutionCost: 150000,
        passive: { name: 'Dragon Bane', desc: 'Deal 3x damage to dragons.' },
        evolves_into: ['DRAGON_GOD']
    },
    DRAGON_GOD: {
        id: 'DRAGON_GOD',
        name: 'Dragon God',
        icon: '🐲👑',
        desc: 'The ultimate draconic deity. A Dragonslayer who has bathed in the blood of countless dragons and consumed their hearts to attain divinity. They command the elements of dragonfire and possess the "Dragon Heart" feat, making them immune to status effects and virtually indestructible.',
        tier: 'ASCENDED',
        evolvedFrom: 'DRAGONSLAYER',
        role: 'TANK',
        stats: { hp: 420, atk: 35, def: 35, mag: 20, spd: 12, luck: 15, crit: 15 },
        requirement: { level: 70, questsCompleted: 75, dragonsKilled: 200, gold: 500000 },
        evolutionCost: 500000,
        passive: { name: 'Dragon Heart', desc: 'Immune to all status effects. 50% damage reduction.' }
    },

    CLERIC: {
        id: 'CLERIC',
        name: 'Cleric',
        icon: '✨🙏',
        desc: 'Divine healer and protector',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 110, atk: 7, def: 9, mag: 20, spd: 9, luck: 13, crit: 7 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Divine Grace', desc: 'Healing spells heal for 25% more.' },
        evolves_into: ['SAINT']
    },

    DRUID: {
        id: 'DRUID',
        name: 'Druid',
        icon: '🌿',
        desc: 'Nature shapeshifter',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 115, atk: 8, def: 10, mag: 18, spd: 11, luck: 12, crit: 8 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Wild Shape', desc: 'Can transform into animal forms.' },
        evolves_into: ['ARCHDRUID']
    },

    MERCHANT: {
        id: 'MERCHANT',
        name: 'Merchant',
        icon: '💰',
        desc: 'Wealthy trader using gold as power',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 105, atk: 7, def: 8, mag: 12, spd: 10, luck: 25, crit: 9 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Gold Rush', desc: 'Earn 50% more gold from all sources.' },
        evolves_into: ['TYCOON']
    },

    BARD: {
        id: 'BARD',
        name: 'Bard',
        icon: '🎸',
        desc: 'Musical support buffing allies',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 100, atk: 8, def: 7, mag: 16, spd: 12, luck: 14, crit: 10 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Inspiring Song', desc: 'Party members gain +10% all stats.' },
        evolves_into: ['VIRTUOSO']
    },
    VIRTUOSO: {
        id: 'VIRTUOSO',
        name: 'Virtuoso',
        icon: '🎻✨',
        desc: 'A master of melody whose music can heal souls or break minds.',
        tier: 'ASCENDED',
        evolvedFrom: 'BARD',
        role: 'SUPPORT',
        stats: { hp: 220, atk: 15, def: 15, mag: 40, spd: 25, luck: 30, crit: 20 },
        requirement: { level: 30, questsCompleted: 15, songsPlayed: 500, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Grand Finale', desc: 'When a player dies, 25% chance to revive them instantly with full HP.' }
    },

    ARTIFICER: {
        id: 'ARTIFICER',
        name: 'Artificer',
        icon: '🔧',
        desc: 'Tech genius with gadgets and turrets',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'SUPPORT',
        stats: { hp: 108, atk: 9, def: 9, mag: 15, spd: 11, luck: 11, crit: 11 },
        requirement: { level: 10, questsCompleted: 3, gold: 5000 },
        evolutionCost: 5000,
        passive: { name: 'Tech Mastery', desc: 'Summons deal 40% more damage.' },
        evolves_into: ['GRAND_INVENTOR']
    },
    GRAND_INVENTOR: {
        id: 'GRAND_INVENTOR',
        name: 'Grand Inventor',
        icon: '🦾⚙️',
        desc: 'Pioneer of the arcane-tech revolution.',
        tier: 'ASCENDED',
        evolvedFrom: 'ARTIFICER',
        role: 'SUPPORT',
        stats: { hp: 250, atk: 20, def: 25, mag: 30, spd: 18, luck: 20, crit: 15 },
        requirement: { level: 30, questsCompleted: 15, itemsCrafted: 100, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Hyper-Efficiency', desc: 'Crafting always yields double results. All summons have +50% HP.' }
    },

    GOD_HAND: {
        id: 'GOD_HAND',
        name: 'God Hand',
        icon: '👊✨',
        desc: 'One who has attained divine martial power.',
        tier: 'EVOLVED',
        evolvedFrom: 'ACOLYTE',
        role: 'DPS',
        stats: { hp: 200, atk: 40, def: 20, mag: 20, spd: 30, luck: 15, crit: 15 },
        requirement: { level: 25, questsCompleted: 10, gold: 15000 },
        evolutionCost: 15000,
        passive: { name: 'Divine Fist', desc: 'Basic attacks have a 10% chance to stun for 2 turns.' },
        evolves_into: ['DIVINE_FIST']
    },
    DIVINE_FIST: {
        id: 'DIVINE_FIST',
        name: 'Divine Fist',
        icon: '🌌👊',
        desc: 'A martial legend who can shatter stars with a punch.',
        tier: 'ASCENDED',
        evolvedFrom: 'GOD_HAND',
        role: 'DPS',
        stats: { hp: 400, atk: 70, def: 30, mag: 25, spd: 45, luck: 20, crit: 25 },
        requirement: { level: 40, questsCompleted: 25, bossKills: 10, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'One-Inch Punch', desc: 'Ignores 100% of enemy defense.' }
    },

    REAPER: {
        id: 'REAPER',
        name: 'Reaper',
        icon: '⌛💀',
        desc: 'Collector of souls, harvesting the living.',
        tier: 'EVOLVED',
        evolvedFrom: 'APPRENTICE',
        role: 'DPS',
        stats: { hp: 160, atk: 35, def: 10, mag: 30, spd: 15, luck: 10, crit: 25 },
        requirement: { level: 25, questsCompleted: 10, gold: 12000 },
        evolutionCost: 12000,
        passive: { name: 'Soul Harvest', desc: 'Gain 10% HP and 10% Energy back whenever an enemy dies.' },
        evolves_into: ['DEATH_LORD']
    },
    DEATH_LORD: {
        id: 'DEATH_LORD',
        name: 'Death Lord',
        icon: '🌌💀👑',
        desc: 'The sovereign of the underworld.',
        tier: 'ASCENDED',
        evolvedFrom: 'REAPER',
        role: 'DPS',
        stats: { hp: 350, atk: 65, def: 20, mag: 50, spd: 30, luck: 15, crit: 35 },
        requirement: { level: 40, questsCompleted: 25, soulCount: 1000, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Soul Sovereignty', desc: 'Every kill grants a permanent +1 ATK (Max +500).' }
    },

    AVATAR: {
        id: 'AVATAR',
        name: 'Avatar',
        icon: '🌊🔥⚡🌍',
        desc: 'Master of all four elements.',
        tier: 'ASCENDED',
        evolvedFrom: 'ELEMENTALIST',
        role: 'MAGIC_DPS',
        stats: { hp: 200, atk: 15, def: 18, mag: 65, spd: 25, luck: 20, crit: 22 },
        requirement: { level: 30, questsCompleted: 15, elementalMastery: 100, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Elemental Avatar', desc: 'Can use all elements simultaneously.' }
    },

    LICH: {
        id: 'LICH',
        name: 'Lich',
        icon: '💀👑',
        desc: 'Immortal undead sorcerer.',
        tier: 'ASCENDED',
        evolvedFrom: 'NECROMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 250, atk: 12, def: 20, mag: 58, spd: 18, luck: 15, crit: 18 },
        requirement: { level: 30, questsCompleted: 15, undeadRaised: 500, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Phylactery', desc: 'Cannot die while phylactery exists (revives at 1 HP).' }
    },

    TIMELORD: {
        id: 'TIMELORD',
        name: 'Time Lord',
        icon: '⏳👑',
        desc: 'Supreme controller of time and space.',
        tier: 'ASCENDED',
        evolvedFrom: 'CHRONOMANCER',
        role: 'MAGIC_DPS',
        stats: { hp: 190, atk: 12, def: 16, mag: 62, spd: 50, luck: 25, crit: 20 },
        requirement: { level: 30, questsCompleted: 15, timeManipulations: 200, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Temporal Mastery', desc: 'Can take 2 actions per turn.' }
    },

    SAINT: {
        id: 'SAINT',
        name: 'Saint',
        icon: '😇',
        desc: 'Divine being of pure light.',
        tier: 'ASCENDED',
        evolvedFrom: 'CLERIC',
        role: 'SUPPORT',
        stats: { hp: 280, atk: 18, def: 35, mag: 55, spd: 20, luck: 30, crit: 15 },
        requirement: { level: 30, questsCompleted: 15, alliesHealed: 1000, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: 'Sainthood', desc: 'All healing is doubled. Party gains +20% all stats.' }
    },

    ARCHDRUID: {
        id: 'ARCHDRUID',
        name: 'Archdruid',
        icon: '🌳👑',
        desc: 'Supreme guardian of nature.',
        tier: 'ASCENDED',
        evolvedFrom: 'DRUID',
        role: 'SUPPORT',
        stats: { hp: 320, atk: 22, def: 32, mag: 52, spd: 24, luck: 25, crit: 18 },
        requirement: { level: 30, questsCompleted: 15, transformations: 300, gold: 50000 },
        evolutionCost: 50000,
        passive: { name: "Nature's Wrath", desc: 'Can summon an army of nature spirits.' }
    },

    TYCOON: {
        id: 'TYCOON',
        name: 'Tycoon',
        icon: '💰👑',
        desc: 'Unimaginably wealthy merchant king.',
        tier: 'ASCENDED',
        evolvedFrom: 'MERCHANT',
        role: 'SUPPORT',
        stats: { hp: 240, atk: 20, def: 25, mag: 35, spd: 22, luck: 80, crit: 25 },
        requirement: { level: 30, questsCompleted: 15, goldEarned: 500000, gold: 100000 },
        evolutionCost: 100000,
        passive: { name: 'Infinite Wealth', desc: 'Gold never decreases. Can buy anything.' }
    }
};

// ==========================================
// 🏆 ADVENTURER RANK SYSTEM
// ==========================================

const ADVENTURER_RANKS = {
    F: {
        name: 'F-Rank',
        icon: '🔰',
        color: '⚪',
        requirement: { level: 1, questsCompleted: 0 },
        benefits: { questRewardBonus: 0 }
    },
    E: {
        name: 'E-Rank',
        icon: '🥉',
        color: '🟤',
        requirement: { level: 5, questsCompleted: 3 },
        benefits: { questRewardBonus: 5 }
    },
    D: {
        name: 'D-Rank',
        icon: '🥈',
        color: '⚪',
        requirement: { level: 10, questsCompleted: 7 },
        benefits: { questRewardBonus: 10 }
    },
    C: {
        name: 'C-Rank',
        icon: '🥇',
        color: '🟡',
        requirement: { level: 15, questsCompleted: 15 },
        benefits: { questRewardBonus: 15 }
    },
    B: {
        name: 'B-Rank',
        icon: '💎',
        color: '🔵',
        requirement: { level: 20, questsCompleted: 25 },
        benefits: { questRewardBonus: 20 }
    },
    A: {
        name: 'A-Rank',
        icon: '💠',
        color: '🟢',
        requirement: { level: 30, questsCompleted: 40 },
        benefits: { questRewardBonus: 30 }
    },
    S: {
        name: 'S-Rank',
        icon: '⭐',
        color: '🟣',
        requirement: { level: 40, questsCompleted: 60 },
        benefits: { questRewardBonus: 40 }
    },
    SS: {
        name: 'SS-Rank',
        icon: '🌟',
        color: '🔴',
        requirement: { level: 50, questsCompleted: 100 },
        benefits: { questRewardBonus: 60 }
    },
    SSS: {
        name: 'SSS-Rank',
        icon: '✨',
        color: '🌈',
        requirement: { level: 75, questsCompleted: 200 },
        benefits: { questRewardBonus: 100 }
    }
};

// ==========================================
// 🛒 SHOP ITEMS
// ==========================================

const CLASS_SHOP_ITEMS = {
      class_change_ticket: {
          id: 'class_change_ticket',
          name: 'Class Change Ticket',
          icon: '🎫',
          desc: 'Reroll your starter class (random)',
          cost: 400,
          type: 'CLASS_CHANGE',
          category: 'CLASS'
      },
      
      evolution_stone: {
          id: 'evolution_stone',
          name: 'Evolution Stone (T2)',
          icon: '💎',
          desc: 'Evolve from Starter to Evolved class.',
          cost: 8000,
          type: 'EVOLUTION',
          category: 'CLASS',
          requirement: 'Must be starter class at level 10+'
      },

      ascension_stone: {
          id: 'ascension_stone',
          name: 'Ascension Stone (T3)',
          icon: '🔮',
          desc: 'Evolve from Evolved to Ascended class.',
          cost: 50000,
          type: 'ASCENSION',
          category: 'CLASS',
          requirement: 'Must be evolved class at level 30+'
      },

      dragon_key: {
          id: 'dragon_key',
          name: 'Dragon Hunter Key',
          icon: '🔑🐲',
          desc: 'Unlocks the secret Dragon’s Lair dungeon. Required to become a Dragonslayer.',
          cost: 15000,
          type: 'SPECIAL_KEY',
          category: 'CLASS',
          requirement: 'Must be level 15+'
      },

      dragon_seal_ring: {
          id: 'dragon_seal_ring',
          name: 'Dragon Seal Ring',
          icon: '💍🐲',
          desc: 'Ancient ring required to deal damage to dragons. Without this, your attacks are useless against them.',
          cost: 20000,
          type: 'EQUIPMENT',
          category: 'CLASS',
          requirement: 'Must be level 40+',
          slot: 'ring',
          stats: { atk: 5 }
      },

      stat_manual: {
          id: 'stat_manual',
          name: 'Ancient Stat Manual',
          icon: '📜',
          desc: 'A permanent boost to all your base stats (+5 to all).',
          cost: 100000,
          type: 'STAT_BOOST_PERM',
          category: 'PERMANENT',
          rarity: 'EPIC'
      },    
    skill_reset: {
        id: 'skill_reset',
        name: 'Skill Reset Scroll',
        icon: '📜',
        desc: 'Reset to starter class (refunds 50% evolution cost)',
        cost: 1000,
        type: 'RESET',
        category: 'CLASS'
    },
    
    // Quest consumables
    health_potion_shop: {
        id: 'health_potion_shop',
        name: 'Health Potion',
        icon: '🧪',
        desc: 'Heal 35% of Max HP (usable in quests)',
        cost: 700,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    phoenix_down_shop: {
        id: 'phoenix_down_shop',
        name: 'Phoenix Down',
        icon: '🪶',
        desc: 'Auto-revive at 50% HP (quest only)',
        cost: 3500,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    strength_brew_shop: {
        id: 'strength_brew_shop',
        name: 'Strength Brew',
        icon: '💪',
        desc: '+25% ATK for 3 turns',
        cost: 800,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    lucky_charm_shop: {
        id: 'lucky_charm_shop',
        name: 'Lucky Charm',
        icon: '🍀',
        desc: '+40% LUCK for 3 turns',
        cost: 1000,
        type: 'CONSUMABLE',
        category: 'QUEST'
    },
    
    // Permanent stat boosters
    hp_supplement: {
        id: 'hp_supplement',
        name: 'HP Supplement',
        icon: '❤️',
        desc: 'Permanently increase max HP by 10',
        cost: 3000,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'hp', value: 10 }
    },
    
    attack_manual: {
        id: 'attack_manual',
        name: 'Attack Manual',
        icon: '⚔️',
        desc: 'Permanently increase ATK by 2',
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'atk', value: 2 }
    },
    
    defense_guide: {
        id: 'defense_guide',
        name: 'Defense Guide',
        icon: '🛡️',
        desc: 'Permanently increase DEF by 2',
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'def', value: 2 }
    },
    
    magic_tome: {
        id: 'magic_tome',
        name: 'Magic Tome',
        icon: '📚',
        desc: 'Permanently increase MAG by 2',
        cost: 2400,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'mag', value: 2 }
    },
    
    speed_boots: {
        id: 'speed_boots',
        name: 'Speed Boots',
        icon: '👟',
        desc: 'Permanently increase SPD by 2',
        cost: 2000,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'spd', value: 2 }
    },
    
    // Weapons
    rusty_dagger: {
        id: 'rusty_dagger',
        name: 'Rusted Dagger',
        icon: '🗡️',
        desc: 'A simple blade. (+5 ATK)',
        cost: 1000,
        type: 'EQUIPMENT',
        category: 'EQUIPMENT',
        rarity: 'COMMON',
        stats: { atk: 5 },
        slot: 'weapon'
    },
    iron_sword: {
        id: 'iron_sword',
        name: 'Iron Sword',
        icon: '⚔️',
        desc: 'A sturdy iron blade. (+12 ATK)',
        cost: 5000,
        type: 'EQUIPMENT',
        category: 'EQUIPMENT',
        rarity: 'UNCOMMON',
        stats: { atk: 12 },
        slot: 'weapon'
    },
    arcane_wand: {
        id: 'arcane_wand',
        name: 'Arcane Wand',
        icon: '🪄',
        desc: 'Focuses magical energy. (+15 MAG)',
        cost: 6000,
        type: 'EQUIPMENT',
        category: 'EQUIPMENT',
        rarity: 'RARE',
        stats: { mag: 15 },
        slot: 'weapon'
    },
    
    // Armor
    leather_tunic: {
        id: 'leather_tunic',
        name: 'Leather Tunic',
        icon: '🧥',
        desc: 'Basic protection. (+8 DEF)',
        cost: 1600,
        type: 'EQUIPMENT',
        category: 'EQUIPMENT',
        rarity: 'COMMON',
        stats: { def: 8 },
        slot: 'armor'
    },
    plate_armor: {
        id: 'plate_armor',
        name: 'Plate Armor',
        icon: '🛡️',
        desc: 'Heavy iron protection. (+25 DEF, +20 HP)',
        cost: 12000,
        type: 'EQUIPMENT',
        category: 'EQUIPMENT',
        rarity: 'RARE',
        stats: { def: 25, hp: 20 },
        slot: 'armor'
    },
    
    // Mirror
    essence_mirror: {
        id: 'essence_mirror',
        name: 'Essence Mirror',
        icon: '🪞',
        desc: 'Allows you to mirror skills from other classes.',
        cost: 100000,
        type: 'MISC',
        category: 'MISC',
        rarity: 'LEGENDARY'
    },
    
    fortune_cookie: {
        id: 'fortune_cookie',
        name: 'Fortune Cookie',
        icon: '🥠',
        desc: 'Permanently increase LUCK by 2',
        cost: 1500,
        type: 'STAT_BOOST',
        category: 'PERMANENT',
        boost: { stat: 'luck', value: 2 }
    },
    
    // Misc items
    xp_booster: {
        id: 'xp_booster',
        name: 'XP Booster',
        icon: '⭐',
        desc: 'Double XP from next quest',
        cost: 1000,
        type: 'BOOSTER',
        category: 'MISC'
    },
    
    gold_multiplier: {
        id: 'gold_multiplier',
        name: 'Gold Multiplier',
        icon: '💰',
        desc: 'Double gold from next quest',
        cost: 800,
        type: 'BOOSTER',
        category: 'MISC'
    },
    
    rare_loot_charm: {
        id: 'rare_loot_charm',
        name: 'Rare Loot Charm',
        icon: '🎁',
        desc: 'Increased rare drop chance',
        cost: 2000,
        type: 'BOOSTER',
        category: 'MISC'
    }
};

// ==========================================
// 🔧 HELPER FUNCTIONS
// ==========================================

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
    
    // Check evolvedFrom chain
    let current = classData;
    while (current && current.evolvedFrom) {
        if (current.evolvedFrom === 'FIGHTER') return true;
        current = getClassById(current.evolvedFrom);
    }
    
    return false;
}

function canEvolve(currentClassId, userLevel, questsCompleted, dragonsKilled = 0) {
    const currentClass = getClassById(currentClassId);
    if (!currentClass) {
        return { canEvolve: false, reason: 'Invalid class' };
    }

    if (currentClass.tier === 'ASCENDED') {
        return { canEvolve: false, reason: 'Already reached maximum evolution tier' };
    }
    
    const evolutions = currentClass.evolves_into;
    if (!evolutions || evolutions.length === 0) {
        return { canEvolve: false, reason: 'No further evolutions available for this class' };
    }

    const availableEvolutions = [];
    const allClasses = getAllClasses();
    
    for (const evoId of evolutions) {
        const evoClass = allClasses[evoId];
        if (evoClass) {
            let meetsReqs = 
                userLevel >= (evoClass.requirement?.level || 0) &&
                questsCompleted >= (evoClass.requirement?.questsCompleted || 0) &&
                dragonsKilled >= (evoClass.requirement?.dragonsKilled || 0);
            
            // Check for Fighter Lineage if required (specifically for Dragonslayer)
            if (evoClass.requirement?.fighterBase && !isFighterLineage(currentClassId)) {
                meetsReqs = false;
            }

            if (meetsReqs) {
                availableEvolutions.push(evoClass);
            }
        }
    }
    
    if (availableEvolutions.length === 0) {
        // Find the first evolution to show requirements
        const firstEvoId = evolutions[0];
        const firstEvo = allClasses[firstEvoId];
        
        // Specifically check if it's a lineage issue
        if (firstEvo?.requirement?.fighterBase && !isFighterLineage(currentClassId)) {
            return {
                canEvolve: false,
                reason: `This evolution path is only available to the Fighter lineage!`
            };
        }

        const reqLevel = firstEvo?.requirement?.level || 10;
        const reqQuests = firstEvo?.requirement?.questsCompleted || 3;
        const reqDragons = firstEvo?.requirement?.dragonsKilled || 0;

        let reason = `Need level ${reqLevel} and ${reqQuests} quests completed`;
        if (reqDragons > 0) reason += ` and ${reqDragons} dragons killed`;

        return { 
            canEvolve: false, 
            reason: reason,
            currentLevel: userLevel,
            currentQuests: questsCompleted,
            currentDragons: dragonsKilled
        };
    }
    
    return { canEvolve: true, evolutions: availableEvolutions };
}

function calculateAdventurerRank(level, questsCompleted, gp) {
    // Calculate from highest to lowest
    const ranks = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
    
    for (const rank of ranks) {
        const req = ADVENTURER_RANKS[rank].requirement;
        if (level >= req.level && questsCompleted >= req.questsCompleted) {
            return rank;
        }
    }
    
    return 'F';
}

function getNextRankRequirements(currentRank) {
    const ranks = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const currentIndex = ranks.indexOf(currentRank);
    
    if (currentIndex === -1 || currentIndex === ranks.length - 1) {
        return null; // Max rank
    }
    
    const nextRank = ranks[currentIndex + 1];
    return {
        rank: nextRank,
        requirements: ADVENTURER_RANKS[nextRank].requirement,
        benefits: ADVENTURER_RANKS[nextRank].benefits
    };
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    STARTER_CLASSES,
    EVOLVED_CLASSES,
    ADVENTURER_RANKS,
    CLASS_SHOP_ITEMS,
    getAllClasses,
    getClassById,
    getRandomStarterClass,
    isFighterLineage,
    canEvolve,
    calculateAdventurerRank,
    getNextRankRequirements
};
