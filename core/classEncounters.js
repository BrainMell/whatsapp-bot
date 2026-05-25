// ============================================
// 🎯 CLASS-BASED ENCOUNTER SYSTEM V2
// ============================================
// Enemies are now "The Infected" - creatures corrupted by elemental forces
// Enemy types determined by player level ranges

const monsterSkills = require('./monsterSkills');

// ==========================================
// 🦠 THE INFECTED - LEVEL-BASED ENEMY POOLS
// ==========================================

const INFECTED_POOLS = {
    // ==========================================
    // 🐲 DRAGON LAIR (Special Dungeon)
    // ==========================================
    DRAGON_LAIR: {
        theme: 'Dragon’s Lair',
        description: 'The ancient nesting ground of drakes and dragons',
        levelRange: [15, 100],
        
        COMMON: [
            {
                id: 'DRAKE_SCOUT',
                name: 'Young Drake',
                icon: '🦎',
                desc: 'A small but aggressive dragon-kin.',
                stats: { hp: 450, atk: 25, def: 18, mag: 10, spd: 15, luck: 10, crit: 12 },
                archetype: 'STALKER',
                xpReward: 400,
                goldReward: [100, 250],
                element: 'fire'
            },
            {
                id: 'FIRE_BREATHER',
                name: 'Lesser Wyvern',
                icon: '🐲',
                desc: 'A winged predator that breathes scorching flames.',
                stats: { hp: 600, atk: 30, def: 25, mag: 25, spd: 12, luck: 15, crit: 10 },
                archetype: 'BRUTE',
                xpReward: 550,
                goldReward: [200, 400],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'ANCIENT_DRAGON',
                name: 'Ancient Dragon',
                icon: '🐉',
                desc: 'A massive, gold-scaled dragon of immense power.',
                stats: { hp: 2500, atk: 65, def: 55, mag: 60, spd: 10, luck: 30, crit: 20 },
                archetype: 'TANK',
                xpReward: 2500,
                goldReward: [1000, 3000],
                element: 'fire'
            }
        ]
    },

    // ==========================================
    // 🔥 FIRE INFECTED (Level 1-10)
    // ==========================================
    FIRE_LOW: {
        theme: 'Corrupted Flames',
        description: 'Corrupted flames taking humanoid shapes',
        levelRange: [1, 10],
        
        COMMON: [
            {
                id: 'FLAME',
                name: 'Flame',
                icon: '🔥',
                desc: 'A simple corrupted flame flickering with malevolence',
                stats: { hp: 45, atk: 14, def: 2, mag: 12, spd: 5, luck: 5, crit: 5 },
                archetype: 'MAGE',
                xpReward: 80,
                goldReward: [10, 22],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'ELDER_FLAME',
                name: 'Elder Flame',
                icon: '🔥✨',
                desc: 'A larger, more intense corrupted flame',
                stats: { hp: 120, atk: 22, def: 6, mag: 18, spd: 10, luck: 10, crit: 10 },
                archetype: 'BRUTE',
                xpReward: 220,
                goldReward: [55, 100],
                element: 'fire'
            }
        ]
    },
    
    // ==========================================
    // 💧 WATER INFECTED (Level 11-20)
    // ==========================================
    WATER_LOW: {
        theme: 'Drowned Corruption',
        description: 'Infected that dwell in poisoned waters',
        levelRange: [11, 20],
        
        COMMON: [
            {
                id: 'DROWNED_ONE',
                name: 'Drowned One',
                icon: '💧',
                desc: 'Waterlogged infected with bloated flesh',
                stats: { hp: 120, atk: 25, def: 8, mag: 4, spd: 10, luck: 8, crit: 8 },
                archetype: 'TANK',
                xpReward: 120,
                goldReward: [20, 42],
                element: 'water'
            },
            {
                id: 'TIDE_LURKER',
                name: 'Tide Lurker',
                icon: '💧',
                desc: 'Aquatic infected with sharp fins',
                stats: { hp: 110, atk: 28, def: 6, mag: 5, spd: 12, luck: 10, crit: 10 },
                archetype: 'STALKER',
                xpReward: 130,
                goldReward: [22, 45],
                element: 'water'
            },
            {
                id: 'MIST_WALKER',
                name: 'Mist Walker',
                icon: '💧',
                desc: 'Ethereal infected formed from corrupted mist',
                stats: { hp: 100, atk: 24, def: 5, mag: 8, spd: 14, luck: 12, crit: 12 },
                archetype: 'MAGE',
                xpReward: 125,
                goldReward: [21, 43],
                element: 'water'
            }
        ],
        
        ELITE: [
            {
                id: 'LEVIATHAN_SPAWN',
                name: 'Leviathan Spawn',
                icon: '💧✨',
                desc: 'Massive aquatic infected with crushing power',
                stats: { hp: 350, atk: 45, def: 15, mag: 10, spd: 14, luck: 12, crit: 12 },
                archetype: 'BRUTE',
                skills: ['Tidal Wave', 'Deep Pressure', 'Whirlpool'],
                xpReward: 320,
                goldReward: [70, 130],
                element: 'water'
            }
        ]
    },
    
    // ==========================================
    // 🪨 EARTH INFECTED (Level 21-30)
    // ==========================================
    EARTH_MID: {
        theme: 'Stone Corruption',
        description: 'Infected with crystallized, rocky bodies',
        levelRange: [21, 30],
        
        COMMON: [
            {
                id: 'STONE_HULK',
                name: 'Stone Hulk',
                icon: '🪨',
                desc: 'Infected with hardened stone skin',
                stats: { hp: 240, atk: 45, def: 25, mag: 4, spd: 8, luck: 10, crit: 10 },
                skills: ['Rock Throw', 'Earthquake'],
                xpReward: 190,
                goldReward: [38, 68],
                element: 'earth'
            },
            {
                id: 'CRYSTAL_CORRUPTED',
                name: 'Crystal Corrupted',
                icon: '💎',
                desc: 'Infected with sharp crystal protrusions',
                stats: { hp: 210, atk: 48, def: 20, mag: 8, spd: 12, luck: 12, crit: 15 },
                skills: ['Crystal Shard', 'Reflection'],
                xpReward: 210,
                goldReward: [42, 75],
                element: 'earth'
            },
            {
                id: 'EARTH_WARDEN',
                name: 'Earth Warden',
                icon: '🪨',
                desc: 'Guardian infected bound to the earth',
                stats: { hp: 260, atk: 40, def: 28, mag: 5, spd: 7, luck: 11, crit: 8 },
                skills: ['Stone Armor', 'Ground Slam'],
                xpReward: 200,
                goldReward: [40, 72],
                element: 'earth'
            }
        ],
        
        ELITE: [
            {
                id: 'GOLEM_KING',
                name: 'Golem King',
                icon: '🪨👑',
                desc: 'Massive stone infected with immense power',
                stats: { hp: 600, atk: 60, def: 40, mag: 10, spd: 10, luck: 14, crit: 12 },
                skills: ['Meteor Strike', 'Stone Prison', 'Landslide'],
                xpReward: 500,
                goldReward: [110, 200],
                element: 'earth'
            }
        ]
    },
    
    // ==========================================
    // ❄️ ICE INFECTED (Level 31-40)
    // ==========================================
    ICE_MID: {
        theme: 'Frozen Corruption',
        description: 'Infected preserved in eternal ice',
        levelRange: [31, 40],
        
        COMMON: [
            {
                id: 'FROST_GHOUL',
                name: 'Frost Ghoul',
                icon: '❄️',
                desc: 'Frozen infected with icy claws',
                stats: { hp: 350, atk: 60, def: 18, mag: 12, spd: 16, luck: 13, crit: 18 },
                skills: ['Ice Claw', 'Freeze'],
                xpReward: 280,
                goldReward: [56, 95],
                element: 'ice'
            },
            {
                id: 'GLACIAL_BEAST',
                name: 'Glacial Beast',
                icon: '❄️',
                desc: 'Beast infected with frozen armor',
                stats: { hp: 400, atk: 55, def: 22, mag: 10, spd: 14, luck: 12, crit: 15 },
                skills: ['Icicle Barrage', 'Cold Snap'],
                xpReward: 300,
                goldReward: [60, 100],
                element: 'ice'
            },
            {
                id: 'BLIZZARD_WRAITH',
                name: 'Blizzard Wraith',
                icon: '❄️',
                desc: 'Spectral infected born from blizzards',
                stats: { hp: 320, atk: 65, def: 15, mag: 15, spd: 20, luck: 15, crit: 22 },
                skills: ['Frost Nova', 'Blizzard'],
                xpReward: 310,
                goldReward: [62, 105],
                element: 'ice'
            }
        ],
        
        ELITE: [
            {
                id: 'PERMAFROST_TITAN',
                name: 'Permafrost Titan',
                icon: '❄️👑',
                desc: 'Ancient infected encased in ancient ice',
                stats: { hp: 900, atk: 80, def: 35, mag: 20, spd: 15, luck: 16, crit: 20 },
                skills: ['Absolute Zero', 'Ice Age', 'Frozen Domain'],
                xpReward: 750,
                goldReward: [160, 280],
                element: 'ice'
            }
        ]
    },
    
    // ==========================================
    // 🔥 FIRE INFECTED ADVANCED (Level 41-50)
    // ==========================================
    FIRE_HIGH: {
        theme: 'Infernal Corruption',
        description: 'Advanced fire infected with devastating power',
        levelRange: [41, 50],
        
        COMMON: [
            {
                id: 'MAGMA_BRUTE',
                name: 'Magma Brute',
                icon: '🌋',
                desc: 'Infected with molten lava flowing through veins',
                stats: { hp: 1200, atk: 34, def: 20, mag: 14, spd: 18, luck: 14, crit: 20 },
                skills: ['Lava Burst', 'Molten Armor'],
                xpReward: 400,
                goldReward: [80, 135],
                element: 'fire'
            },
            {
                id: 'HELLFIRE_DEMON',
                name: 'Hellfire Demon',
                icon: '👹🔥',
                desc: 'Demonic infected wreathed in hellfire',
                stats: { hp: 1100, atk: 38, def: 18, mag: 16, spd: 22, luck: 16, crit: 24 },
                skills: ['Infernal Strike', 'Fire Tornado'],
                xpReward: 430,
                goldReward: [85, 145],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'PHOENIX_CORRUPTED',
                name: 'Corrupted Phoenix',
                icon: '🔥🦅',
                desc: 'Fallen phoenix consumed by corruption',
                stats: { hp: 3200, atk: 42, def: 28, mag: 25, spd: 30, luck: 20, crit: 28 },
                skills: ['Phoenix Dive', 'Rebirth', 'Solar Flare'],
                xpReward: 1100,
                goldReward: [240, 420],
                element: 'fire'
            }
        ]
    },
    
    // ==========================================
    // 💧 WATER INFECTED ADVANCED (Level 51-60)
    // ==========================================
    WATER_HIGH: {
        theme: 'Abyssal Corruption',
        description: 'Deep sea infected from the darkest depths',
        levelRange: [51, 60],
        
        COMMON: [
            {
                id: 'ABYSSAL_HORROR',
                name: 'Abyssal Horror',
                icon: '🐙',
                desc: 'Deep sea infected with tentacles',
                stats: { hp: 1800, atk: 36, def: 22, mag: 20, spd: 20, luck: 18, crit: 22 },
                skills: ['Tentacle Lash', 'Pressure Crush'],
                xpReward: 520,
                goldReward: [105, 170],
                element: 'water'
            },
            {
                id: 'TSUNAMI_WALKER',
                name: 'Tsunami Walker',
                icon: '🌊',
                desc: 'Infected that commands tidal waves',
                stats: { hp: 1700, atk: 40, def: 20, mag: 22, spd: 24, luck: 20, crit: 24 },
                skills: ['Tidal Fury', 'Deluge'],
                xpReward: 550,
                goldReward: [112, 185],
                element: 'water'
            }
        ],
        
        ELITE: [
            {
                id: 'KRAKEN_SPAWN',
                name: 'Kraken Spawn',
                icon: '🐙👑',
                desc: 'Offspring of the ancient kraken',
                stats: { hp: 4500, atk: 44, def: 30, mag: 28, spd: 26, luck: 22, crit: 26 },
                skills: ['Whirlpool Vortex', 'Ink Cloud', 'Crush'],
                xpReward: 1400,
                goldReward: [360, 580],
                element: 'water'
            }
        ]
    },
    
    // ==========================================
    // 🪨 EARTH INFECTED ADVANCED (Level 61-70)
    // ==========================================
    EARTH_HIGH: {
        theme: 'Ancient Stone',
        description: 'Ancient earth infected awakened',
        levelRange: [61, 70],
        
        COMMON: [
            {
                id: 'OBSIDIAN_JUGGERNAUT',
                name: 'Obsidian Juggernaut',
                icon: '🪨',
                desc: 'Infected armored in obsidian',
                stats: { hp: 2800, atk: 38, def: 45, mag: 15, spd: 12, luck: 16, crit: 18 },
                skills: ['Obsidian Slam', 'Lava Shield'],
                xpReward: 700,
                goldReward: [140, 230],
                element: 'earth'
            },
            {
                id: 'DIAMOND_SENTINEL',
                name: 'Diamond Sentinel',
                icon: '💎',
                desc: 'Infected crystalized into diamond',
                stats: { hp: 2500, atk: 42, def: 40, mag: 18, spd: 16, luck: 18, crit: 22 },
                skills: ['Diamond Barrage', 'Crystal Fortress'],
                xpReward: 730,
                goldReward: [145, 240],
                element: 'earth'
            }
        ],
        
        ELITE: [
            {
                id: 'MOUNTAIN_COLOSSUS',
                name: 'Mountain Colossus',
                icon: '⛰️',
                desc: 'Living mountain infected of immense size',
                stats: { hp: 8000, atk: 46, def: 60, mag: 20, spd: 10, luck: 20, crit: 15 },
                skills: ['Avalanche', 'Mountain Crusher', 'Earthquake'],
                xpReward: 1700,
                goldReward: [420, 680],
                element: 'earth'
            }
        ]
    },
    
    // ==========================================
    // 🧬 MUTATED INFECTED (Level 71-80)
    // ==========================================
    MUTATED: {
        theme: 'Twisted Evolution',
        description: 'Grotesquely mutated infected',
        levelRange: [71, 80],
        
        COMMON: [
            {
                id: 'FLESH_ABOMINATION',
                name: 'Flesh Abomination',
                icon: '🧬',
                desc: 'Horrifically mutated infected',
                stats: { hp: 4500, atk: 45, def: 30, mag: 22, spd: 20, luck: 18, crit: 24 },
                skills: ['Toxic Spray', 'Mutation Burst'],
                xpReward: 900,
                goldReward: [185, 295],
                element: 'chaos'
            },
            {
                id: 'CHIMERA_BEAST',
                name: 'Chimera Beast',
                icon: '🧬',
                desc: 'Multi-headed mutated infected',
                stats: { hp: 4200, atk: 50, def: 28, mag: 20, spd: 24, luck: 20, crit: 28 },
                skills: ['Triple Strike', 'Regenerate'],
                xpReward: 950,
                goldReward: [195, 310],
                element: 'chaos'
            }
        ],
        
        ELITE: [
            {
                id: 'PERFECT_MUTATION',
                name: 'Perfect Mutation',
                icon: '🧬👑',
                desc: 'Infected evolved to perfection',
                stats: { hp: 12000, atk: 55, def: 38, mag: 30, spd: 28, luck: 24, crit: 32 },
                skills: ['Adaptive Strike', 'Evolution', 'Bio Hazard'],
                xpReward: 2200,
                goldReward: [520, 840],
                element: 'chaos'
            }
        ]
    },
    
    // ==========================================
    // 🌈 HYBRID INFECTED (Level 81-90)
    // ==========================================
    HYBRID: {
        theme: 'Elemental Fusion',
        description: 'Infected wielding multiple elements',
        levelRange: [81, 90],
        
        COMMON: [
            {
                id: 'FROST_FLAME_WARDEN',
                name: 'Frost-Flame Warden',
                icon: '❄️🔥',
                desc: 'Infected controlling ice and fire',
                stats: { hp: 5500, atk: 48, def: 35, mag: 35, spd: 25, luck: 22, crit: 26 },
                skills: ['Thermal Shock', 'Elemental Fusion'],
                xpReward: 1100,
                goldReward: [230, 380],
                element: 'hybrid'
            },
            {
                id: 'STORM_EARTH_TITAN',
                name: 'Storm-Earth Titan',
                icon: '⚡🪨',
                desc: 'Infected merging lightning and stone',
                stats: { hp: 6000, atk: 52, def: 40, mag: 32, spd: 22, luck: 20, crit: 24 },
                skills: ['Thunder Quake', 'Static Armor'],
                xpReward: 1150,
                goldReward: [240, 400],
                element: 'hybrid'
            }
        ],
        
        ELITE: [
            {
                id: 'ELEMENTAL_SOVEREIGN',
                name: 'Elemental Sovereign',
                icon: '🌈👑',
                desc: 'Master of all elements',
                stats: { hp: 15000, atk: 58, def: 45, mag: 50, spd: 30, luck: 28, crit: 30 },
                skills: ['Elemental Chaos', 'Prismatic Blast', 'Omni-Shield'],
                xpReward: 2800,
                goldReward: [640, 1000],
                element: 'hybrid'
            }
        ]
    },
    
    // ==========================================
    // 🔥 FIRE INFECTED ELITE (Level 91-100)
    // ==========================================
    FIRE_ELITE: {
        theme: 'Apocalyptic Flames',
        description: 'The most powerful fire infected',
        levelRange: [91, 100],
        
        COMMON: [
            {
                id: 'INFERNAL_OVERLORD',
                name: 'Infernal Overlord',
                icon: '🔥👹',
                desc: 'Elite fire infected commander',
                stats: { hp: 8000, atk: 60, def: 42, mag: 45, spd: 32, luck: 26, crit: 34 },
                skills: ['Apocalypse Flame', 'Inferno Domain'],
                xpReward: 1400,
                goldReward: [280, 460],
                element: 'fire'
            },
            {
                id: 'STAR_EATER',
                name: 'Star Eater',
                icon: '☀️🔥',
                desc: 'Infected that consumes stars',
                stats: { hp: 7500, atk: 65, def: 40, mag: 48, spd: 35, luck: 28, crit: 36 },
                skills: ['Solar Destruction', 'Supernova'],
                xpReward: 1500,
                goldReward: [300, 490],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'PRIMORDIAL_FLAME',
                name: 'Primordial Flame',
                icon: '🔥💫',
                desc: 'The first flame, source of all fire',
                stats: { hp: 20000, atk: 70, def: 50, mag: 60, spd: 35, luck: 30, crit: 40 },
                skills: ['Genesis Fire', 'Heat Death', 'Eternal Burn'],
                xpReward: 3500,
                goldReward: [800, 1300],
                element: 'fire'
            }
        ]
    }
};

// ==========================================
// 🎯 BOSS MAPPINGS
// ==========================================

const BOSS_ENCOUNTERS = {
    // Mid-level bosses (30-60)
    MID_LEVEL: [
        {
            id: 'INFECTED_COLOSSUS',
            name: 'The Infected Colossus',
            icon: '👹',
            desc: 'Massive infected amalgamation',
            stats: { hp: 12000, atk: 15, def: 10, mag: 5, spd: 10, luck: 8, crit: 8 },
            skills: ['Colossal Slam', 'Infection Spread', 'Rampage', 'Rage Mode'],
            phases: ['Normal', 'Enraged', 'Desperate'],
            xpReward: 3000,
            goldReward: [800, 1400],
            specialDrop: 'colossus_core',
            levelRange: [1, 60]
        },
        {
            id: 'CORRUPTED_GUARDIAN',
            name: 'Corrupted Guardian',
            icon: '🛡️👹',
            desc: 'Ancient guardian turned by corruption',
            stats: { hp: 15000, atk: 18, def: 15, mag: 8, spd: 8, luck: 10, crit: 10 },
            skills: ['Guardian Strike', 'Ancient Barrier', 'Judgement', 'Corrupted Fury'],
            phases: ['Defensive', 'Balanced', 'Aggressive'],
            xpReward: 3500,
            goldReward: [900, 1600],
            specialDrop: 'guardian_shield',
            levelRange: [1, 60]
        }
    ],
    
    // High-level bosses (61-90)
    HIGH_LEVEL: [
        {
            id: 'ELEMENTAL_ARCHON',
            name: 'Elemental Archon',
            icon: '🌊🔥❄️',
            desc: 'Supreme elemental infected',
            stats: { hp: 35000, atk: 65, def: 50, mag: 80, spd: 35, luck: 30, crit: 30 },
            skills: ['Elemental Storm', 'Prismatic Ray', 'Element Shift', 'Cataclysm'],
            phases: ['Fire Phase', 'Water Phase', 'Final Form'],
            xpReward: 6000,
            goldReward: [1500, 2500],
            specialDrop: 'archon_essence',
            levelRange: [61, 90]
        },
        {
            id: 'MUTATION_PRIME',
            name: 'Mutation Prime',
            icon: '🧬💀',
            desc: 'The perfect mutation specimen',
            stats: { hp: 45000, atk: 70, def: 45, mag: 60, spd: 40, luck: 35, crit: 35 },
            skills: ['Adaptive Assault', 'Genetic Overload', 'Evolution Burst', 'Perfect Form'],
            phases: ['Basic', 'Advanced', 'Perfect'],
            xpReward: 8000,
            goldReward: [2000, 3200],
            specialDrop: 'mutation_sample',
            levelRange: [61, 90]
        }
    ],
    
    // Calamity bosses (91-100+)
    CALAMITY: [
        {
            id: 'VOID_CORRUPTED',
            name: 'Void-Corrupted Entity',
            icon: '🌑',
            desc: 'Infected by the void itself',
            stats: { hp: 85000, atk: 85, def: 60, mag: 100, spd: 45, luck: 40, crit: 45 },
            skills: ['Void Pulse', 'Reality Tear', 'Null Zone', 'Oblivion'],
            phases: ['Contained', 'Unleashed', 'Transcendent'],
            xpReward: 15000,
            goldReward: [4000, 7000],
            specialDrop: 'void_crystal',
            levelRange: [91, 110]
        },
        {
            id: 'PRIMORDIAL_CHAOS',
            name: 'Primordial Chaos',
            icon: '💫🌀',
            desc: 'The source of all corruption',
            stats: { hp: 100000, atk: 90, def: 70, mag: 120, spd: 50, luck: 45, crit: 50 },
            skills: ['Chaos Wave', 'Creation & Destruction', 'Infinity Spiral', 'Big Bang'],
            phases: ['Awakening', 'Chaos Form', 'True Chaos'],
            xpReward: 8000,
            goldReward: [3000, 5000],
            specialDrop: 'chaos_fragment',
            levelRange: [95, 120]
        }
    ],

    // --- EVOLUTION TRIAL BOSSES ---
    TRIALS: [
        { id: 'ARCANE_SENTINEL', name: 'Arcane Sentinel', icon: '🔮🛡️', stats: { hp: 18000, atk: 15, def: 30, mag: 45, spd: 15 }, levelRange: [1, 100] },
        { id: 'LICH_KING', name: 'Lich King', icon: '💀👑', stats: { hp: 60000, atk: 35, def: 40, mag: 85, spd: 25 }, levelRange: [1, 100] },
        { id: 'SHADOW_STALKER', name: 'Shadow Stalker', icon: '👤🗡️', stats: { hp: 15000, atk: 45, def: 15, mag: 10, spd: 40 }, levelRange: [1, 100] },
        { id: 'VOID_ASSASSIN', name: 'Void Assassin', icon: '🌑🗡️', stats: { hp: 55000, atk: 85, def: 25, mag: 30, spd: 65 }, levelRange: [1, 100] },
        { id: 'IRON_BODY_GRANDMASTER', name: 'Iron Body Grandmaster', icon: '🥋', stats: { hp: 22000, atk: 40, def: 40, mag: 5, spd: 35 }, levelRange: [1, 100] },
        { id: 'ANCIENT_WURM', name: 'Ancient Wurm', icon: '🐛', stats: { hp: 25000, atk: 50, def: 35, mag: 5, spd: 20 }, levelRange: [1, 100] },
        { id: 'SOUL_EATER', name: 'Soul Eater', icon: '👻', stats: { hp: 16000, atk: 25, def: 20, mag: 55, spd: 30 }, levelRange: [1, 100] },
        { id: 'ABYSSAL_WHISPER', name: 'Abyssal Whisper', icon: '🌑👁️', stats: { hp: 58000, atk: 40, def: 35, mag: 95, spd: 35 }, levelRange: [1, 100] },
        { id: 'ELEMENTAL_PRIMORDIAL', name: 'Elemental Primordial', icon: '🌈', stats: { hp: 20000, atk: 30, def: 25, mag: 60, spd: 25 }, levelRange: [1, 100] },
        { id: 'PRIME_ELEMENT', name: 'Prime Element', icon: '🌟🌈', stats: { hp: 65000, atk: 50, def: 45, mag: 110, spd: 40 }, levelRange: [1, 100] },
        { id: 'VOID_NECROMANCER', name: 'Void Necromancer', icon: '💀🌑', stats: { hp: 62000, atk: 45, def: 40, mag: 100, spd: 30 }, levelRange: [1, 100] },
        { id: 'CHRONOS_WARDEN', name: 'Chronos Warden', icon: '⏳🛡️', stats: { hp: 17000, atk: 30, def: 25, mag: 50, spd: 100 }, levelRange: [1, 100] },
        { id: 'TIME_EATER', name: 'Time Eater', icon: '⏳👾', stats: { hp: 54000, atk: 55, def: 45, mag: 90, spd: 150 }, levelRange: [1, 100] },
        { id: 'HEAVENLY_GUARDIAN', name: 'Heavenly Guardian', icon: '👼', stats: { hp: 22000, atk: 20, def: 50, mag: 40, spd: 20 }, levelRange: [1, 100] },
        { id: 'SERAPHIM_PRIME', name: 'Seraphim Prime', icon: '👼👑', stats: { hp: 70000, atk: 45, def: 65, mag: 100, spd: 35 }, levelRange: [1, 100] },
        { id: 'FOREST_ANCESTOR', name: 'Forest Ancestor', icon: '🌳', stats: { hp: 24000, atk: 35, def: 35, mag: 35, spd: 15 }, levelRange: [1, 100] },
        { id: 'GAIA_SENTINEL', name: 'Gaia Sentinel', icon: '🌍🛡️', stats: { hp: 75000, atk: 55, def: 70, mag: 60, spd: 20 }, levelRange: [1, 100] },
        { id: 'GOLDEN_GOLEM', name: 'Golden Golem', icon: '💰🗿', stats: { hp: 26000, atk: 40, def: 60, mag: 10, spd: 10 }, levelRange: [1, 100] },
        { id: 'TREASURE_HOARDER', name: 'Treasure Hoarder', icon: '🐲💰', stats: { hp: 68000, atk: 75, def: 50, mag: 40, spd: 40 }, levelRange: [1, 100] },
        { id: 'SOUND_REAPER', name: 'Sound Reaper', icon: '🎸💀', stats: { hp: 19000, atk: 40, def: 20, mag: 45, spd: 35 }, levelRange: [1, 100] },
        { id: 'MAESTRO_OF_VOID', name: 'Maestro of Void', icon: '🎻🌑', stats: { hp: 59000, atk: 60, def: 40, mag: 90, spd: 45 }, levelRange: [1, 100] },
        { id: 'CLOCKWORK_TITAN', name: 'Clockwork Titan', icon: '⚙️🗿', stats: { hp: 23000, atk: 45, def: 45, mag: 20, spd: 15 }, levelRange: [1, 100] },
        { id: 'MECH_GOD', name: 'Mech God', icon: '🦾🤖', stats: { hp: 80000, atk: 80, def: 80, mag: 50, spd: 25 }, levelRange: [1, 100] }
    ]
};

// ==========================================
// 🎯 ENCOUNTER SELECTION
// ==========================================

function getEnemyPoolByLevel(avgLevel) {
    if (avgLevel <= 10) return INFECTED_POOLS.FIRE_LOW;
    if (avgLevel <= 20) return INFECTED_POOLS.WATER_LOW;
    if (avgLevel <= 30) return INFECTED_POOLS.EARTH_MID;
    if (avgLevel <= 40) return INFECTED_POOLS.ICE_MID;
    if (avgLevel <= 50) return INFECTED_POOLS.FIRE_HIGH;
    if (avgLevel <= 60) return INFECTED_POOLS.WATER_HIGH;
    if (avgLevel <= 70) return INFECTED_POOLS.EARTH_HIGH;
    if (avgLevel <= 80) return INFECTED_POOLS.MUTATED;
    if (avgLevel <= 90) return INFECTED_POOLS.HYBRID;
    return INFECTED_POOLS.FIRE_ELITE;
}

function selectRandomEnemy(avgLevel, difficulty = 'COMMON') {
    const pool = getEnemyPoolByLevel(avgLevel);
    
    if (!pool || !pool[difficulty] || pool[difficulty].length === 0) {
        return INFECTED_POOLS.FIRE_LOW.COMMON[0];
    }
    
    const enemies = pool[difficulty];
    const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
    
    return { ...randomEnemy };
}

function selectBoss(avgLevel, forceId = null) {
    // If specific boss requested (for trials etc)
    if (forceId) {
        const allPools = Object.values(BOSS_ENCOUNTERS);
        for (const pool of allPools) {
            const found = pool.find(b => b.id === forceId);
            if (found) return { ...found };
        }
    }

    let pool;
    
    if (avgLevel <= 60) pool = BOSS_ENCOUNTERS.MID_LEVEL;
    else if (avgLevel <= 90) pool = BOSS_ENCOUNTERS.HIGH_LEVEL;
    else pool = BOSS_ENCOUNTERS.CALAMITY;
    
    const validBosses = pool.filter(boss => 
        avgLevel >= boss.levelRange[0] && avgLevel <= boss.levelRange[1]
    );
    
    if (validBosses.length === 0) {
        return pool[0];
    }
    
    const randomBoss = validBosses[Math.floor(Math.random() * validBosses.length)];
    return { ...randomBoss };
}

function getPoolTheme(avgLevel) {
    const pool = getEnemyPoolByLevel(avgLevel);
    return pool ? {
        theme: pool.theme,
        description: pool.description,
        levelRange: pool.levelRange
    } : {
        theme: 'Unknown',
        description: 'Standard encounters',
        levelRange: [1, 100]
    };
}

// ==========================================
// 🎲 ENCOUNTER GENERATION
// ==========================================

function generateEncounter(players, encounterType = 'COMBAT', difficulty = 1.0, options = {}) {
    // Calculate average player level and speed
    const avgLevel = Math.floor(players.reduce((sum, p) => sum + (p.level || 1), 0) / players.length);
    const avgSpeed = Math.floor(players.reduce((sum, p) => sum + (p.stats?.spd || 10), 0) / players.length);
    
    const enemies = [];
    
    if (encounterType === 'BOSS') {
        // Single boss
        const boss = selectBoss(avgLevel, options.forceBossId);
        enemies.push(scaleBossStats(boss, players.length, difficulty, avgLevel, avgSpeed));
    } else if (encounterType === 'ELITE_COMBAT') {
        // 1-2 elite enemies
        const eliteCount = options.maxMobs ? Math.min(options.maxMobs, 4) : Math.min(1 + Math.floor(players.length / 2), 4);
        for (let i = 0; i < eliteCount; i++) {
            const elite = selectRandomEnemy(avgLevel, 'ELITE');
            enemies.push(scaleEnemyStats(elite, players.length, difficulty, i, avgLevel, avgSpeed));
        }
    } else {
        // Regular combat
        let enemyCount;
        if (options.minMobs && options.maxMobs) {
            enemyCount = Math.floor(Math.random() * (options.maxMobs - options.minMobs + 1)) + options.minMobs;
        } else {
            // Default logic: 2-4 common enemies
            enemyCount = Math.min(2 + players.length, 6);
        }
        
        for (let i = 0; i < enemyCount; i++) {
            const enemy = selectRandomEnemy(avgLevel, 'COMMON');
            enemies.push(scaleEnemyStats(enemy, players.length, difficulty, i, avgLevel, avgSpeed));
        }
    }
    
    return {
        type: encounterType,
        enemies,
        theme: getPoolTheme(avgLevel),
        avgLevel,
        avgSpeed
    };
}

function scaleEnemyStats(enemy, partySize, difficulty, enemyIndex = 0, avgLevel = 1, avgPlayerSpeed = 10) {
    const scaled = { ...enemy };
    
    // 💡 NEW SCALING FORMULA (from notes.md)
    // RankIndex is based on difficulty multiplier passed from guildAdventure
    // Formula: Stat * (1 + RankIndex * Multiplier)
    const rankIndex = difficulty; 
    
    // Damage scaling: +12% per rank
    const dmgMult = 1 + (rankIndex * 0.12);
    // Speed scaling: +10% per rank (base)
    const spdMult = 1 + (rankIndex * 0.10);
    // Party scaling: +20% per extra player
    const partyFactor = 1 + ((partySize - 1) * 0.20);
    
    scaled.stats = { ...enemy.stats };
    
    // Check if it's an ELITE enemy (determined by ID or property)
    // notes.md: +25% HP, +20% speed, NO raw damage buff
    const isElite = enemy.id.includes('ELITE') || enemy.id.includes('KING') || enemy.id.includes('BOSS') || (enemy.id === 'ELDER_FLAME' || enemy.id === 'LEVIATHAN_SPAWN' || enemy.id === 'PHOENIX_CORRUPTED');

    // Base Stat Scaling
    scaled.stats.hp = Math.floor((enemy.stats.hp || 100) * partyFactor * (1 + (rankIndex * 0.15))); // HP scales slightly faster
    if (isElite) scaled.stats.hp = Math.floor(scaled.stats.hp * 1.25);
    scaled.stats.maxHp = scaled.stats.hp; // Store max HP for UI and tracking

    // Apply Damage Scaling (ATK/MAG/DEF)
    scaled.stats.atk = Math.floor((enemy.stats.atk || 0) * partyFactor * dmgMult);
    scaled.stats.mag = Math.floor((enemy.stats.mag || 0) * partyFactor * dmgMult);
    scaled.stats.def = Math.floor((enemy.stats.def || 0) * partyFactor * dmgMult);
    
    // Apply Speed Scaling with Rubber-Banding Logic
    // "High level player -> Mob slower. Low level player -> Mob faster."
    // This implies mobs try to match player speed but deviate based on level gap.
    
    let baseSpeed = Math.floor((enemy.stats.spd || 10) * partyFactor * spdMult);
    if (isElite) baseSpeed = Math.floor(baseSpeed * 1.20);
    
    // Rubber Banding:
    // If player is much faster than mob's base level range, slow mob down? 
    // Or if player level is high relative to mob tier?
    // Let's implement relative speed scaling:
    // Mob Speed = Base * (1 +/- (LevelGap * 0.01))
    
    // Actually, user said: "if its high then the mob should be slower of its really lo then the mob shpuld be faster"
    // This sounds like: 
    // Player Level > Enemy Level Pool -> Enemy Speed Penalty (Easier to outspeed)
    // Player Level < Enemy Level Pool -> Enemy Speed Bonus (Harder to outspeed)
    
    // But we are generating enemy FROM level pool, so levels are roughly matched.
    // Let's use the average speed directly.
    
    // Dynamic Speed: Mix of Mob Base Speed and Player Average Speed
    // Weighted towards Mob Base, but pulls towards Player Speed.
    // If Player Speed is HIGH (e.g. 100), and Mob Base is 50. 
    // "if its high then the mob should be slower" -> This implies relative turn frequency.
    // If player is fast, they should feel fast. So mob should NOT scale up fully to match.
    // But if player is slow, mob should be faster.
    
    // Let's implement a randomized relative speed:
    // Mob Speed = (Player Speed * 0.8) + (Random -10% to +10%)
    // This ensures mob is usually slightly slower than player (allowing player initiative), 
    // unless it's a "Fast" archetype.
    
    let targetSpeed = avgPlayerSpeed;
    if (enemy.archetype === 'STALKER' || enemy.archetype === 'ASSASSIN') targetSpeed *= 1.5; // Faster mobs
    if (enemy.archetype === 'TANK' || enemy.archetype === 'BRUTE') targetSpeed *= 0.95; // Slower mobs
    
    // Apply the "High Level = Slower Mob" logic
    // If Average Level > 50, reduce mob speed multiplier by 10%
    if (avgLevel > 50) targetSpeed *= 0.98;
    if (avgLevel < 15) targetSpeed *= 1.3; // Low level -> mobs are scary fast
    
    // Blend with base calculation (Favor player matching more)
    scaled.stats.spd = Math.floor((baseSpeed * 0.4) + (targetSpeed * 0.6));

    // Defense scaling (linear)
    scaled.stats.def = Math.floor(enemy.stats.def * partyFactor * (1 + (rankIndex * 0.08)));

    // Set maxHp in stats for rendering consistency
    scaled.stats.maxHp = scaled.stats.hp;
    
    scaled.currentHP = scaled.stats.hp;
    scaled.maxHP = scaled.stats.hp;
    scaled.mana = 100;
    scaled.maxMana = 100;
    
    // Dynamic skills
    if (enemy.archetype) {
        scaled.abilities = monsterSkills.getSkillsForMonster(enemy.archetype, avgLevel).map(s => s.id);
    } else {
        scaled.abilities = enemy.skills || [];
    }
    
    // Rewards
    scaled.xpReward = Math.floor(enemy.xpReward * (1 + (rankIndex * 0.2)));
    scaled.goldReward = [
        Math.floor(enemy.goldReward[0] * (1 + (rankIndex * 0.15))),
        Math.floor(enemy.goldReward[1] * (1 + (rankIndex * 0.15)))
    ];
    
    scaled.statusEffects = [];
    scaled.isEnemy = true;
    scaled.enemyIndex = enemyIndex;
    
    return scaled;
}

function scaleBossStats(boss, partySize, difficulty, avgLevel = 1, avgPlayerSpeed = 10) {
    const scaled = { ...boss };
    const rankIndex = difficulty;
    
    // Standardize Party Factor to 20% per extra player
    const partyFactor = 1 + ((partySize - 1) * 0.20);
    const dmgMult = 1 + (rankIndex * 0.15);
    const spdMult = 1 + (rankIndex * 0.08);
    
    scaled.stats = { ...boss.stats };
    
    scaled.stats.hp = Math.floor(boss.stats.hp * partyFactor * (1 + (rankIndex * 0.3)));
    scaled.stats.atk = Math.floor(boss.stats.atk * partyFactor * dmgMult);
    scaled.stats.mag = Math.floor(boss.stats.mag * partyFactor * dmgMult);
    
    // Boss Speed Scaling
    let baseSpeed = Math.floor(boss.stats.spd * partyFactor * spdMult);
    
    // Bosses should generally be slightly faster or matched to players to be threatening
    // But respecting the "High Level = Slower" rule:
    let targetSpeed = avgPlayerSpeed * 1.05; // Slightly faster than players
    if (avgLevel > 60) targetSpeed *= 0.95; // High level players get an edge
    
    scaled.stats.spd = Math.floor((baseSpeed * 0.5) + (targetSpeed * 0.5));

    scaled.stats.def = Math.floor(boss.stats.def * partyFactor * (1 + (rankIndex * 0.1)));
    
    scaled.stats.maxHp = scaled.stats.hp;
    scaled.currentHP = scaled.stats.hp;
    scaled.maxHP = scaled.stats.hp;
    scaled.mana = 200;
    scaled.maxMana = 200;
    
    scaled.xpReward = Math.floor(boss.xpReward * (1 + (rankIndex * 0.3)));
    scaled.goldReward = [
        Math.floor(boss.goldReward[0] * (1 + (rankIndex * 0.2))),
        Math.floor(boss.goldReward[1] * (1 + (rankIndex * 0.2)))
    ];
    
    scaled.statusEffects = [];
    scaled.isEnemy = true;
    scaled.isBoss = true;
    scaled.currentPhase = 0;
    // Use BOSS archetype skill objects so AI can evaluate them properly
    const bossArchetype = boss.archetype || 'BOSS';
    scaled.archetype = bossArchetype;
    scaled.abilities = monsterSkills.getSkillsForMonster(bossArchetype, avgLevel).map(s => s.id);
    // Keep raw skill list for phase transitions in guildAdventure
    scaled.skills = boss.skills || [];
    
    return scaled;
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    INFECTED_POOLS,
    BOSS_ENCOUNTERS,
    getEnemyPoolByLevel,
    selectRandomEnemy,
    selectBoss,
    getPoolTheme,
    generateEncounter,
    scaleEnemyStats,
    scaleBossStats
};
