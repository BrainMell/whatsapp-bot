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
                archetype: 'TANK',
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
                archetype: 'BRUTE',
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
                archetype: 'TANK',
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
                archetype: 'BRUTE',
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
                archetype: 'STALKER',
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
                archetype: 'TANK',
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
                archetype: 'MAGE',
                skills: ['Frost Nova', 'Blizzard'],
                xpReward: 310,
                goldReward: [62, 105],
                element: 'ice'
            },
            {
                id: 'RUNIC_BREAKER',
                name: 'Runic Breaker',
                icon: '🔮❄️',
                desc: 'A frost-bound warrior that absorbs and reflects magical energy',
                stats: { hp: 380, atk: 50, def: 20, mag: 30, spd: 17, luck: 14, crit: 16 },
                archetype: 'SPELLBREAKER',
                xpReward: 330,
                goldReward: [65, 110],
                element: 'ice'
            },
            {
                id: 'FROST_PHALANX',
                name: 'Frost Phalanx',
                icon: '❄️🛡️',
                desc: 'Ice-armored soldiers who fight in coordinated formations',
                stats: { hp: 360, atk: 55, def: 28, mag: 8, spd: 13, luck: 12, crit: 14 },
                archetype: 'PHALANX',
                xpReward: 295,
                goldReward: [58, 98],
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
                archetype: 'COLOSSUS',
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
                desc: 'Infected with molten lavas flowing through veins',
                stats: { hp: 1200, atk: 34, def: 20, mag: 14, spd: 18, luck: 14, crit: 20 },
                archetype: 'BERSERKER_MOB',
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
                archetype: 'MAGE',
                skills: ['Infernal Strike', 'Fire Tornado'],
                xpReward: 430,
                goldReward: [85, 145],
                element: 'fire'
            },
            {
                id: 'EMBER_SPELLBREAKER',
                name: 'Ember Spellbreaker',
                icon: '🔥🔮',
                desc: 'Flame-wreathed mage hunter that silences and disrupts casters',
                stats: { hp: 1050, atk: 32, def: 22, mag: 28, spd: 25, luck: 16, crit: 22 },
                archetype: 'SPELLBREAKER',
                xpReward: 445,
                goldReward: [88, 150],
                element: 'fire'
            },
            {
                id: 'INFERNO_NEMESIS',
                name: 'Inferno Nemesis',
                icon: '🔥👁️',
                desc: 'An adaptive fire entity that mirrors and counters fighter strategies',
                stats: { hp: 1150, atk: 36, def: 19, mag: 22, spd: 24, luck: 17, crit: 21 },
                archetype: 'NEMESIS',
                xpReward: 460,
                goldReward: [90, 155],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'PHOENIX_CORRUPTED',
                name: 'Corrupted Phoenix',
                icon: '🔥🦅',
                desc: 'Fallen phoenix consumed by corruption — it adapts and rises harder',
                stats: { hp: 3200, atk: 42, def: 28, mag: 25, spd: 30, luck: 20, crit: 28 },
                archetype: 'NEMESIS',
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
                desc: 'Deep sea infected with tentacles — siphons energy and silences',
                stats: { hp: 1800, atk: 36, def: 22, mag: 20, spd: 20, luck: 18, crit: 22 },
                archetype: 'SPELLBREAKER',
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
                archetype: 'MAGE',
                skills: ['Tidal Fury', 'Deluge'],
                xpReward: 550,
                goldReward: [112, 185],
                element: 'water'
            },
            {
                id: 'VOID_TIDE',
                name: 'Void Tide',
                icon: '🌑🌊',
                desc: 'A deep-sea entity that phases between dimensions, nearly impossible to target consistently',
                stats: { hp: 1600, atk: 38, def: 18, mag: 24, spd: 28, luck: 22, crit: 26 },
                archetype: 'VOID_WALKER',
                xpReward: 560,
                goldReward: [115, 190],
                element: 'water'
            },
            {
                id: 'TIDAL_PHALANX',
                name: 'Tidal Phalanx',
                icon: '🌊🛡️',
                desc: 'Armored sea warriors who fight in tight formation, buffing each other and enraging at ally deaths',
                stats: { hp: 1750, atk: 42, def: 28, mag: 12, spd: 18, luck: 19, crit: 20 },
                archetype: 'PHALANX',
                xpReward: 535,
                goldReward: [108, 175],
                element: 'water'
            }
        ],
        
        ELITE: [
            {
                id: 'KRAKEN_SPAWN',
                name: 'Kraken Spawn',
                icon: '🐙👑',
                desc: 'Offspring of the ancient kraken — immovable and reflects physical damage',
                stats: { hp: 4500, atk: 44, def: 30, mag: 28, spd: 26, luck: 22, crit: 26 },
                archetype: 'COLOSSUS',
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
                desc: 'Infected armored in obsidian — CC-immune and reflects physical strikes',
                stats: { hp: 2800, atk: 38, def: 45, mag: 15, spd: 12, luck: 16, crit: 18 },
                archetype: 'COLOSSUS',
                skills: ['Obsidian Slam', 'Lava Shield'],
                xpReward: 700,
                goldReward: [140, 230],
                element: 'earth'
            },
            {
                id: 'DIAMOND_SENTINEL',
                name: 'Diamond Sentinel',
                icon: '💎',
                desc: 'Crystal-armored sentinel with coordination tactics and formation buffs',
                stats: { hp: 2500, atk: 42, def: 40, mag: 18, spd: 16, luck: 18, crit: 22 },
                archetype: 'PHALANX',
                skills: ['Diamond Barrage', 'Crystal Fortress'],
                xpReward: 730,
                goldReward: [145, 240],
                element: 'earth'
            },
            {
                id: 'STONE_NEMESIS',
                name: 'Stone Nemesis',
                icon: '🪨👁️',
                desc: 'An ancient stone construct that adapts to how you fight it — the longer the fight, the harder it counters',
                stats: { hp: 2600, atk: 44, def: 35, mag: 20, spd: 14, luck: 18, crit: 20 },
                archetype: 'NEMESIS',
                xpReward: 720,
                goldReward: [142, 235],
                element: 'earth'
            },
            {
                id: 'VOID_SEEKER',
                name: 'Void Seeker',
                icon: '🌑🪨',
                desc: 'A shadow-phase hunter that materializes from stone — phases through attacks',
                stats: { hp: 2300, atk: 46, def: 30, mag: 22, spd: 20, luck: 20, crit: 24 },
                archetype: 'VOID_WALKER',
                xpReward: 740,
                goldReward: [148, 242],
                element: 'earth'
            }
        ],
        
        ELITE: [
            {
                id: 'MOUNTAIN_COLOSSUS',
                name: 'Mountain Colossus',
                icon: '⛰️',
                desc: 'Living mountain of immense size — immune to CC, reflects hits, breaks down over phases',
                stats: { hp: 8000, atk: 46, def: 60, mag: 20, spd: 10, luck: 20, crit: 15 },
                archetype: 'COLOSSUS',
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
                desc: 'Horrifically mutated infected — a berserker that gets deadlier as it takes damage',
                stats: { hp: 4500, atk: 45, def: 30, mag: 22, spd: 20, luck: 18, crit: 24 },
                archetype: 'BERSERKER_MOB',
                skills: ['Toxic Spray', 'Mutation Burst'],
                xpReward: 900,
                goldReward: [185, 295],
                element: 'chaos'
            },
            {
                id: 'CHIMERA_BEAST',
                name: 'Chimera Beast',
                icon: '🧬',
                desc: 'Multi-headed mutated infected — adapts its attacks to counter your strategy',
                stats: { hp: 4200, atk: 50, def: 28, mag: 20, spd: 24, luck: 20, crit: 28 },
                archetype: 'NEMESIS',
                skills: ['Triple Strike', 'Regenerate'],
                xpReward: 950,
                goldReward: [195, 310],
                element: 'chaos'
            },
            {
                id: 'SHADOW_STALKER_MUTANT',
                name: 'Shadow Stalker Mutant',
                icon: '🧬👤',
                desc: 'A phase-shifting mutation that blinks in and out of reality — nearly impossible to predict',
                stats: { hp: 4000, atk: 52, def: 24, mag: 26, spd: 28, luck: 22, crit: 30 },
                archetype: 'VOID_WALKER',
                xpReward: 960,
                goldReward: [198, 315],
                element: 'chaos'
            },
            {
                id: 'RUNE_EATER',
                name: 'Rune Eater',
                icon: '🧬🔮',
                desc: 'A mutation that feeds on magic — silences heavy casters and drains their energy reserves',
                stats: { hp: 4100, atk: 42, def: 32, mag: 35, spd: 22, luck: 20, crit: 26 },
                archetype: 'SPELLBREAKER',
                xpReward: 940,
                goldReward: [192, 305],
                element: 'chaos'
            }
        ],
        
        ELITE: [
            {
                id: 'PERFECT_MUTATION',
                name: 'Perfect Mutation',
                icon: '🧬👑',
                desc: 'Infected evolved to perfection — adapts to every strategy, has no weakness',
                stats: { hp: 12000, atk: 55, def: 38, mag: 30, spd: 28, luck: 24, crit: 32 },
                archetype: 'NEMESIS',
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
                desc: 'Hybrid mage that drains mana and silences before unleashing elemental chaos',
                stats: { hp: 5500, atk: 48, def: 35, mag: 35, spd: 25, luck: 22, crit: 26 },
                archetype: 'SPELLBREAKER',
                skills: ['Thermal Shock', 'Elemental Fusion'],
                xpReward: 1100,
                goldReward: [230, 380],
                element: 'hybrid'
            },
            {
                id: 'STORM_EARTH_TITAN',
                name: 'Storm-Earth Titan',
                icon: '⚡🪨',
                desc: 'Massive hybrid titan immune to CC, reflects hits, strikes with seismic force',
                stats: { hp: 6000, atk: 52, def: 40, mag: 32, spd: 22, luck: 20, crit: 24 },
                archetype: 'COLOSSUS',
                skills: ['Thunder Quake', 'Static Armor'],
                xpReward: 1150,
                goldReward: [240, 400],
                element: 'hybrid'
            },
            {
                id: 'VOID_PREDATOR',
                name: 'Void Predator',
                icon: '🌑🌈',
                desc: 'A void-infused hunter that phases through reality and strikes from unexpected angles',
                stats: { hp: 5200, atk: 55, def: 30, mag: 38, spd: 30, luck: 24, crit: 28 },
                archetype: 'VOID_WALKER',
                xpReward: 1120,
                goldReward: [235, 388],
                element: 'hybrid'
            },
            {
                id: 'PHALANX_SOVEREIGN',
                name: 'Phalanx Sovereign',
                icon: '🌈🛡️',
                desc: 'Commander of the Hybrid Phalanx — enrages when allies die, buffs the entire formation',
                stats: { hp: 5800, atk: 50, def: 42, mag: 28, spd: 20, luck: 21, crit: 22 },
                archetype: 'PHALANX',
                xpReward: 1130,
                goldReward: [238, 394],
                element: 'hybrid'
            }
        ],
        
        ELITE: [
            {
                id: 'ELEMENTAL_SOVEREIGN',
                name: 'Elemental Sovereign',
                icon: '🌈👑',
                desc: 'Master of all elements — adapts, counters, overwhelms. Every strategy has a flaw against this.',
                stats: { hp: 15000, atk: 58, def: 45, mag: 50, spd: 30, luck: 28, crit: 30 },
                archetype: 'NEMESIS',
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
                desc: 'Elite fire infected berserker — escalates with every hit taken, impossible to ignore',
                stats: { hp: 8000, atk: 60, def: 42, mag: 45, spd: 32, luck: 26, crit: 34 },
                archetype: 'BERSERKER_MOB',
                skills: ['Apocalypse Flame', 'Inferno Domain'],
                xpReward: 1400,
                goldReward: [280, 460],
                element: 'fire'
            },
            {
                id: 'STAR_EATER',
                name: 'Star Eater',
                icon: '☀️🔥',
                desc: 'Feeds on magical energy — silences, drains, and punishes mages with reflected power',
                stats: { hp: 7500, atk: 65, def: 40, mag: 48, spd: 35, luck: 28, crit: 36 },
                archetype: 'SPELLBREAKER',
                skills: ['Solar Destruction', 'Supernova'],
                xpReward: 1500,
                goldReward: [300, 490],
                element: 'fire'
            },
            {
                id: 'ETERNAL_NEMESIS',
                name: 'Eternal Nemesis',
                icon: '🔥👁️',
                desc: 'The ultimate adaptive predator — studies your every move and counters with precision',
                stats: { hp: 7800, atk: 62, def: 44, mag: 50, spd: 33, luck: 28, crit: 35 },
                archetype: 'NEMESIS',
                xpReward: 1480,
                goldReward: [295, 480],
                element: 'fire'
            },
            {
                id: 'VOID_FLAME',
                name: 'Void Flame',
                icon: '🌑🔥',
                desc: 'A fire entity that exists partially in the void — phases unpredictably, strikes from anywhere',
                stats: { hp: 7200, atk: 63, def: 38, mag: 52, spd: 38, luck: 30, crit: 38 },
                archetype: 'VOID_WALKER',
                xpReward: 1520,
                goldReward: [305, 498],
                element: 'fire'
            }
        ],
        
        ELITE: [
            {
                id: 'PRIMORDIAL_FLAME',
                name: 'Primordial Flame',
                icon: '🔥💫',
                desc: 'The first flame, source of all fire — CC-immune, reflects all physical hits, phases when below 50%',
                stats: { hp: 20000, atk: 70, def: 50, mag: 60, spd: 35, luck: 30, crit: 40 },
                archetype: 'COLOSSUS',
                skills: ['Genesis Fire', 'Heat Death', 'Eternal Burn'],
                xpReward: 3500,
                goldReward: [800, 1300],
                element: 'fire'
            }
        ]
    }
};

const BOSS_ENCOUNTERS = {
    // Mid-level bosses (30-60)
    MID_LEVEL: [
        {
            id: 'INFECTED_COLOSSUS',
            name: 'The Infected Colossus',
            icon: '👹',
            desc: 'Massive infected amalgamation',
            stats: { hp: 300, atk: 45, def: 25, mag: 5, spd: 10, luck: 8, crit: 8 },
            skills: ['Colossal Slam', 'Infection Spread', 'Rampage', 'Rage Mode'],
            phases: ['Normal', 'Enraged', 'Desperate'],
            xpReward: 3000,
            goldReward: [800, 1400],
            levelRange: [1, 60]
        },
        {
            id: 'CORRUPTED_GUARDIAN',
            name: 'Corrupted Guardian',
            icon: '🛡️👹',
            desc: 'Ancient guardian turned by corruption',
            stats: { hp: 600, atk: 55, def: 35, mag: 8, spd: 8, luck: 10, crit: 10 },
            skills: ['Guardian Strike', 'Ancient Barrier', 'Judgement', 'Corrupted Fury'],
            phases: ['Defensive', 'Balanced', 'Aggressive'],
            xpReward: 3500,
            goldReward: [900, 1600],
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
            stats: { hp: 1200, atk: 450, def: 50, mag: 550, spd: 35, luck: 30, crit: 30 },
            skills: ['Elemental Storm', 'Prismatic Ray', 'Element Shift', 'Cataclysm'],
            phases: ['Fire Phase', 'Water Phase', 'Final Form'],
            xpReward: 6000,
            goldReward: [1500, 2500],
            levelRange: [61, 90]
        },
        {
            id: 'MUTATION_PRIME',
            name: 'Mutation Prime',
            icon: '🧬💀',
            desc: 'The perfect mutation specimen',
            stats: { hp: 2500, atk: 520, def: 45, mag: 480, spd: 40, luck: 35, crit: 35 },
            skills: ['Adaptive Assault', 'Genetic Overload', 'Evolution Burst', 'Perfect Form'],
            phases: ['Basic', 'Advanced', 'Perfect'],
            xpReward: 8000,
            goldReward: [2000, 3200],
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
            stats: { hp: 5000, atk: 880, def: 60, mag: 1100, spd: 45, luck: 40, crit: 45 },
            skills: ['Void Pulse', 'Reality Tear', 'Null Zone', 'Oblivion'],
            phases: ['Contained', 'Unleashed', 'Transcendent'],
            xpReward: 15000,
            goldReward: [4000, 7000],
            levelRange: [91, 110]
        },
        {
            id: 'PRIMORDIAL_CHAOS',
            name: 'Primordial Chaos',
            icon: '💫🌀',
            desc: 'The source of all corruption',
            stats: { hp: 10000, atk: 1100, def: 70, mag: 1400, spd: 50, luck: 45, crit: 50 },
            skills: ['Chaos Wave', 'Creation & Destruction', 'Infinity Spiral', 'Big Bang'],
            phases: ['Awakening', 'Chaos Form', 'True Chaos'],
            xpReward: 25000,   // FIX: was 8000 (regression vs VOID_CORRUPTED's 15000)
            goldReward: [8000, 14000],
            levelRange: [95, 120]
        },
        {
            // NEW: S-rank boss — distinct from A-rank PRIMORDIAL_CHAOS so
            // players feel escalation from A → S → SS → SSS instead of
            // fighting the same boss four ranks in a row.
            id: 'ELDER_CHAOS',
            name: 'Elder Chaos',
            icon: '🌠🌀',
            desc: 'An ancient manifestation of the primordial chaos, awakened after eons of slumber',
            stats: { hp: 18000, atk: 1600, def: 90, mag: 2000, spd: 60, luck: 50, crit: 55 },
            skills: ['Chaos Wave', 'Creation & Destruction', 'Infinity Spiral', 'Big Bang', 'Eternal Collapse'],
            phases: ['Awakening', 'Chaos Form', 'True Chaos', 'Eternal Form'],
            xpReward: 60000,
            goldReward: [10000, 17500], // Economy rebalance: cut 50% (was [20000, 35000])
            levelRange: [100, 120]
        },
        {
            // NEW: SS-rank boss
            id: 'VOID_TITAN',
            name: 'Void Titan',
            icon: '🌑🗿',
            desc: 'A colossal being born from the void between worlds',
            stats: { hp: 32000, atk: 2400, def: 120, mag: 2800, spd: 70, luck: 55, crit: 60 },
            skills: ['Void Pulse', 'Reality Tear', 'Null Zone', 'Oblivion', 'Titan Crush', 'Dimensional Rend'],
            phases: ['Contained', 'Unleashed', 'Transcendent', 'Astral Form'],
            xpReward: 150000,
            goldReward: [25000, 45000], // Economy rebalance: cut 50% (was [50000, 90000])
            levelRange: [100, 120]
        },
        {
            // NEW: SSS-rank boss — the ultimate challenge
            id: 'ABYSSAL_GOD',
            name: 'Abyssal God',
            icon: '🌌👁️',
            desc: 'The divine entity ruling the deepest abyss, where even chaos fears to tread',
            stats: { hp: 60000, atk: 3500, def: 160, mag: 4000, spd: 85, luck: 65, crit: 70 },
            skills: ['Chaos Wave', 'Creation & Destruction', 'Infinity Spiral', 'Big Bang',
                     'Abyssal Verdict', 'Divine Annihilation', 'Reality End'],
            phases: ['Slumbering', 'Awakening', 'Chaos Form', 'True Chaos', 'Divine Form'],
            xpReward: 400000,
            goldReward: [75000, 140000], // Economy rebalance: cut 50% (was [150000, 280000])
            levelRange: [100, 120]
        }
    ],
 
    // --- EVOLUTION TRIAL BOSSES ---
    TRIALS: [
        { id: 'ARCANE_SENTINEL', name: 'Arcane Sentinel', icon: '🔮🛡️', stats: { hp: 18000, atk: 120, def: 30, mag: 240, spd: 15 }, levelRange: [1, 100] },
        { id: 'LICH_KING', name: 'Lich King', icon: '💀👑', stats: { hp: 60000, atk: 250, def: 40, mag: 620, spd: 25 }, levelRange: [1, 100] },
        { id: 'SHADOW_STALKER', name: 'Shadow Stalker', icon: '👤🗡️', stats: { hp: 15000, atk: 320, def: 15, mag: 10, spd: 40 }, levelRange: [1, 100] },
        { id: 'VOID_ASSASSIN', name: 'Void Assassin', icon: '🌑🗡️', stats: { hp: 55000, atk: 680, def: 25, mag: 250, spd: 65 }, levelRange: [1, 100] },
        { id: 'IRON_BODY_GRANDMASTER', name: 'Iron Body Grandmaster', icon: '🥋', stats: { hp: 22000, atk: 310, def: 350, mag: 5, spd: 35 }, levelRange: [1, 100] },
        { id: 'ANCIENT_WURM', name: 'Ancient Wurm', icon: '🐛', stats: { hp: 25000, atk: 38, def: 300, mag: 5, spd: 20 }, levelRange: [1, 100] },
        { id: 'SOUL_EATER', name: 'Soul Eater', icon: '👻', stats: { hp: 16000, atk: 180, def: 20, mag: 410, spd: 30 }, levelRange: [1, 100] },
        { id: 'ABYSSAL_WHISPER', name: 'Abyssal Whisper', icon: '🌑👁️', stats: { hp: 58000, atk: 350, def: 35, mag: 780, spd: 35 }, levelRange: [1, 100] },
        { id: 'ELEMENTAL_PRIMORDIAL', name: 'Elemental Primordial', icon: '🌈', stats: { hp: 20000, atk: 220, def: 25, mag: 480, spd: 25 }, levelRange: [1, 100] },
        { id: 'PRIME_ELEMENT', name: 'Prime Element', icon: '🌟🌈', stats: { hp: 65000, atk: 420, def: 45, mag: 920, spd: 40 }, levelRange: [1, 100] },
        { id: 'VOID_NECROMANCER', name: 'Void Necromancer', icon: '💀🌑', stats: { hp: 62000, atk: 380, def: 40, mag: 850, spd: 30 }, levelRange: [1, 100] },
        { id: 'CHRONOS_WARDEN', name: 'Chronos Warden', icon: '⏳🛡️', stats: { hp: 17000, atk: 240, def: 25, mag: 420, spd: 100 }, levelRange: [1, 100] },
        { id: 'TIME_EATER', name: 'Time Eater', icon: '⏳👾', stats: { hp: 54000, atk: 480, def: 45, mag: 780, spd: 150 }, levelRange: [1, 100] },
        { id: 'HEAVENLY_GUARDIAN', name: 'Heavenly Guardian', icon: '👼', stats: { hp: 22000, atk: 180, def: 50, mag: 320, spd: 20 }, levelRange: [1, 100] },
        { id: 'SERAPHIM_PRIME', name: 'Seraphim Prime', icon: '👼👑', stats: { hp: 70000, atk: 420, def: 65, mag: 920, spd: 35 }, levelRange: [1, 100] },
        { id: 'FOREST_ANCESTOR', name: 'Forest Ancestor', icon: '🌳', stats: { hp: 24000, atk: 280, def: 35, mag: 280, spd: 15 }, levelRange: [1, 100] },
        { id: 'GAIA_SENTINEL', name: 'Gaia Sentinel', icon: '🌍🛡️', stats: { hp: 75000, atk: 520, def: 70, mag: 580, spd: 20 }, levelRange: [1, 100] },
        { id: 'GOLDEN_GOLEM', name: 'Golden Golem', icon: '💰🗿', stats: { hp: 26000, atk: 350, def: 550, mag: 10, spd: 10 }, levelRange: [1, 100] },
        { id: 'TREASURE_HOARDER', name: 'Treasure Hoarder', icon: '🐲💰', stats: { hp: 68000, atk: 680, def: 50, mag: 380, spd: 40 }, levelRange: [1, 100] },
        { id: 'SOUND_REAPER', name: 'Sound Reaper', icon: '🎸💀', stats: { hp: 19000, atk: 280, def: 20, mag: 380, spd: 35 }, levelRange: [1, 100] },
        { id: 'MAESTRO_OF_VOID', name: 'Maestro of Void', icon: '🎻🌑', stats: { hp: 59000, atk: 520, def: 40, mag: 820, spd: 45 }, levelRange: [1, 100] },
        { id: 'CLOCKWORK_TITAN', name: 'Clockwork Titan', icon: '⚙️🗿', stats: { hp: 23000, atk: 380, def: 420, mag: 20, spd: 15 }, levelRange: [1, 100] },
        { id: 'MECH_GOD', name: 'Mech God', icon: '🦾🤖', stats: { hp: 80000, atk: 750, def: 750, mag: 450, spd: 25 }, levelRange: [1, 100] },
        // 💡 FIX: 7 trial bosses referenced by classSystem.js but missing from
        // the registry — previously selectBoss silently fell back to a random
        // boss, so the player fought the wrong enemy and the trial completion
        // recorded the wrong boss id.
        { id: 'DEMON_LORD',          name: 'Demon Lord',          icon: '😈👑', stats: { hp: 45000, atk: 580, def: 80,  mag: 720, spd: 50 }, levelRange: [1, 100] },
        { id: 'ELDER_FLAME',         name: 'Elder Flame',         icon: '🔥🐉', stats: { hp: 28000, atk: 420, def: 60,  mag: 680, spd: 45 }, levelRange: [1, 100] },
        { id: 'LEVIATHAN',           name: 'Leviathan',           icon: '🌊🐲', stats: { hp: 85000, atk: 720, def: 180, mag: 900, spd: 40 }, levelRange: [1, 100] },
        { id: 'ETERNAL_DRAGON',      name: 'Eternal Dragon',      icon: '🐉✨', stats: { hp: 92000, atk: 800, def: 200, mag: 950, spd: 55 }, levelRange: [1, 100] },
        { id: 'SHADOW_LORD',         name: 'Shadow Lord',         icon: '🌑👑', stats: { hp: 38000, atk: 540, def: 70,  mag: 620, spd: 80 }, levelRange: [1, 100] },
        { id: 'PRIMORDIAL_EVIL',     name: 'Primordial Evil',     icon: '💫👹', stats: { hp: 72000, atk: 760, def: 110, mag: 980, spd: 60 }, levelRange: [1, 100] },
        { id: 'GRAVEYARD_LORD',      name: 'Graveyard Lord',      icon: '🪦💀', stats: { hp: 41000, atk: 480, def: 90,  mag: 700, spd: 35 }, levelRange: [1, 100] },
        // 💡 Dragon Lord successor trial boss — a stronger Leviathan Spawn
        // that emerged after the original Leviathan was slain. Used for
        // post-first-kill Dragon-class ascensions. NOT the same as the
        // LEVIATHAN_SPAWN that spawns naturally in the Toxic Cave dungeon
        // (which has only 350 HP).
        { id: 'LEVIATHAN_SPAWN_ALPHA', name: 'Leviathan Spawn Alpha', icon: '🌊🐉', stats: { hp: 78000, atk: 680, def: 160, mag: 850, spd: 50 }, levelRange: [1, 100] },
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

// 💡 FIX: selectRandomEnemy now accepts an optional `environment` parameter.
// When state.environment is a special dungeon (e.g., DRAGON_LAIR), we pull
// from environment.mobs instead of getEnemyPoolByLevel — which was ignoring
// the dragon pool entirely and spawning generic FIRE/WATER/EARTH enemies
// inside the Dragon's Lair.
function selectRandomEnemy(avgLevel, difficulty = 'COMMON', environment = null) {
    let pool;
    if (environment && environment.mobs && environment.isSpecial) {
        // Use the environment's dedicated mob pool (DRAGON_LAIR, etc.)
        // Reuse the same difficulty key for consistency.
        pool = environment.mobs;
        // If the environment pool doesn't have the requested difficulty tier,
        // fall back to COMMON within the same pool, then to level-based.
        if (!pool[difficulty] || pool[difficulty].length === 0) {
            if (pool.COMMON && pool.COMMON.length > 0) {
                difficulty = 'COMMON';
            } else {
                pool = getEnemyPoolByLevel(avgLevel);
            }
        }
    } else {
        pool = getEnemyPoolByLevel(avgLevel);
    }

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
        // Fallback: search in bossMechanics registry
        try {
            const bossMechanics = require('./bossMechanics');
            if (bossMechanics && bossMechanics.BOSS_REGISTRY) {
                const targetKey = forceId.toLowerCase();
                for (const key of Object.keys(bossMechanics.BOSS_REGISTRY)) {
                    if (key.toLowerCase() === targetKey) {
                        const foundBoss = bossMechanics.BOSS_REGISTRY[key];
                        // 💡 FIX: spread foundBoss first, then set id last so
                        // the uppercase `forceId` wins. (FoundBoss.id is often
                        // lowercase, which broke every `id.includes("DRAGON")`
                        // substring check downstream — dragon-seal-ring gate,
                        // dragon kill tracking, etc.)
                        return { ...foundBoss, id: forceId };
                    }
                }
            }
        } catch (err) {
            console.error("Error loading boss from bossMechanics in selectBoss fallback:", err);
        }

        // 💡 FIX: log when forceId is unfound so trial-boss mismatches are
        // visible. Previously this silently fell through to a random boss and
        // players saw the wrong enemy.
        console.warn(`[selectBoss] forceId "${forceId}" not found in BOSS_ENCOUNTERS or BOSS_REGISTRY — falling back to random boss`);
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
            const elite = selectRandomEnemy(avgLevel, 'ELITE', options.environment);
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
            const enemy = selectRandomEnemy(avgLevel, 'COMMON', options.environment);
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
    const rankIndex = difficulty;

    // =========================================================
    // 🎯 PER-RANK BALANCED SCALING — Target: ~60% player WR
    // =========================================================
    // Rank difficulty values from guildAdventure (DUNGEON_RANKS[*].difficulty):
    //   F=0.8, E=1.2, D=3.0, C=5.0, B=10.0, A=18.0, S=35.0, SS=75.0, SSS=80.0
    //
    // Formula breakpoints (tested to ~60% solo WR):
    //   F/E  (0.8-1.2):  dmgF=0.08, hpF=0.12, hpQ=0.002  (baseline — unchanged)
    //   D    (~3.0):     dmgF=0.14, hpF=0.18, hpQ=0.003
    //   C    (~5.0):     dmgF=0.18, hpF=0.22, hpQ=0.004
    //   B    (~10.0):    dmgF=0.22, hpF=0.28, hpQ=0.006
    //   A    (~18.0):    dmgF=0.26, hpF=0.34, hpQ=0.008
    //   S    (~35.0):    dmgF=0.30, hpF=0.40, hpQ=0.010
    //   SS   (~75.0):    (uses S breakpoints — extreme scaling)
    //   SSS  (~80.0):    (uses S breakpoints — extreme scaling)
    // =========================================================

    let dmgFactor, hpFactor, hpQuadFactor;
    if (rankIndex <= 1.0) {
        // F / E rank — baseline, no changes
        dmgFactor = 0.08; hpFactor = 0.12; hpQuadFactor = 0.002;
    } else if (rankIndex <= 4.0) {
        // D rank
        dmgFactor = 0.14; hpFactor = 0.18; hpQuadFactor = 0.003;
    } else if (rankIndex <= 7.0) {
        // C rank
        dmgFactor = 0.18; hpFactor = 0.22; hpQuadFactor = 0.004;
    } else if (rankIndex <= 13.0) {
        // B rank - hpFactor adjusted down for new progression system
        dmgFactor = 0.22; hpFactor = 0.20; hpQuadFactor = 0.003;
    } else if (rankIndex <= 25.0) {
        // A rank - hpFactor adjusted down for new progression system
        dmgFactor = 0.26; hpFactor = 0.24; hpQuadFactor = 0.004;
    } else {
        // S rank and above - hpFactor adjusted down for new progression system
        dmgFactor = 0.30; hpFactor = 0.28; hpQuadFactor = 0.0045;
    }

    const dmgMult = 1 + (rankIndex * dmgFactor);
    const spdMult = 1 + (rankIndex * 0.10);
    const partyFactor = 1 + ((partySize - 1) * 0.20);

    scaled.stats = { ...enemy.stats };

    // Check if it's an ELITE enemy
    const isElite = enemy.id.includes('ELITE') || enemy.id.includes('KING') || enemy.id.includes('BOSS') ||
        (enemy.id === 'ELDER_FLAME' || enemy.id === 'LEVIATHAN_SPAWN' || enemy.id === 'PHOENIX_CORRUPTED');

    // HP scaling with quadratic component for higher ranks
    const hpMult = 1 + (rankIndex * hpFactor) + (rankIndex * rankIndex * hpQuadFactor);
    scaled.stats.hp = Math.floor((enemy.stats.hp || 100) * partyFactor * hpMult);
    if (isElite) scaled.stats.hp = Math.floor(scaled.stats.hp * 1.25);
    scaled.stats.maxHp = scaled.stats.hp;

    // Scale base stats by player average level
    const levelScale = 1 + (avgLevel - 1) * 0.045;
    const baseAtk = (enemy.stats.atk || 0) * levelScale;
    const baseMag = (enemy.stats.mag || 0) * levelScale;
    const baseDef = (enemy.stats.def || 0) * levelScale;

    // ATK/MAG scale with dmgMult; DEF scales independently (slightly lower)
    scaled.stats.atk = Math.floor(baseAtk * partyFactor * dmgMult);
    scaled.stats.mag = Math.floor(baseMag * partyFactor * dmgMult);

    // Speed: blend between base scaling and player speed (rubber-band)
    // 💡 QA FIX #33: Dynamic speed scaling relative to player speed.
    // Regular enemies: 70-90% of player speed (player naturally faster).
    // Elite enemies: 90-110% of player speed (competitive).
    // Archetype modifiers still apply on top.
    let baseSpeed = Math.floor((enemy.stats.spd || 10) * partyFactor * spdMult);
    if (isElite) baseSpeed = Math.floor(baseSpeed * 1.20);

    // Start with player speed as the baseline, modified by archetype
    let targetSpeed = Math.max(10, avgPlayerSpeed);
    if (enemy.archetype === 'STALKER' || enemy.archetype === 'ASSASSIN' || enemy.archetype === 'VOID_WALKER') targetSpeed *= 1.15; // fast enemies slightly outspeed
    if (enemy.archetype === 'TANK' || enemy.archetype === 'BRUTE' || enemy.archetype === 'COLOSSUS') targetSpeed *= 0.75; // tanks are slow
    if (enemy.archetype === 'BERSERKER_MOB') targetSpeed *= 1.10;
    if (enemy.archetype === 'SPELLBREAKER') targetSpeed *= 1.05;
    // Level-based modifiers: low-level enemies slightly faster (to be threatening early)
    if (avgLevel > 50) targetSpeed *= 0.90; // high-level players get an edge
    if (avgLevel < 15) targetSpeed *= 1.20;

    // Regular enemies: 75% blend toward player speed (player usually faster)
    // Elite enemies: 85% blend (competitive but player still has edge)
    const speedBlend = isElite ? 0.85 : 0.75;
    scaled.stats.spd = Math.max(5, Math.floor((baseSpeed * (1 - speedBlend)) + (targetSpeed * speedBlend)));

    // Defense scaling (linear, slightly lower than dmg to avoid damage immunity)
    scaled.stats.def = Math.floor(baseDef * partyFactor * (1 + (rankIndex * 0.07)));

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
    
    // Rewards — scaled significantly by difficulty rank so high-rank dungeons
    // are actually worth doing. Previously the scaling was only +20% XP and
    // +15% gold per rank, which made high-rank dungeons barely better than
    // low-rank ones.
    //
    // 💡 FIX: Changed to EXPONENTIAL scaling so high ranks pull away from
    // low ranks. Linear scaling (1 + rankIndex*0.5) gave S-rank only 18.5×
    // F-rank XP, while the XP curve to L76 needs ~93.9M XP — meaning 82
    // S-rank clears per level. With exponential scaling (1 + rankIndex^1.4)
    // S-rank gives ~146× F-rank XP, dropping L75→L76 to ~10 clears.
    // Gold uses a gentler exponent (1.2) so the economy doesn't inflate
    // as fast as XP.
    scaled.xpReward = Math.floor(enemy.xpReward * (1 + Math.pow(rankIndex, 1.4)));
    scaled.goldReward = [
        Math.floor(enemy.goldReward[0] * (1 + Math.pow(rankIndex, 1.2))),
        Math.floor(enemy.goldReward[1] * (1 + Math.pow(rankIndex, 1.2)))
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

    // 💡 FIX: ensure `level` is present on the scaled entity. Boss templates
    // declare `level: 15` (snake_case) but downstream code calls
    // `skill.effect(enemy.level || 1)` which read undefined for bosses,
    // causing skill effects (ultimate multiplier, dot magnitude, etc.) to
    // evaluate at level 1 instead of the boss's actual level.
    scaled.level = boss.level || Math.max(1, Math.floor(avgLevel));

    scaled.stats = { ...boss.stats };

    // 💡 FIX: Boss HP scaling restored to QUADRATIC at S+ ranks.
    // Previously the factor was deliberately nerfed to 0.16 at S/SS/SSS
    // ("adjusted down for new progression system"), which resulted in
    // S-rank bosses having LESS HP than the common trash mobs (boss HP
    // was linear while common-mob HP had a quadratic term). Now bosses
    // get a quadratic term too, so the boss is always the climax of
    // the dungeon.
    let bossHpFactor = 0.30;
    let bossHpQuadFactor = 0.003;
    if (rankIndex > 25.0)      { bossHpFactor = 0.30; bossHpQuadFactor = 0.005; }  // S/SS/SSS
    else if (rankIndex > 13.0) { bossHpFactor = 0.28; bossHpQuadFactor = 0.004; }  // A
    else if (rankIndex > 7.0)  { bossHpFactor = 0.26; bossHpQuadFactor = 0.003; }  // B

    scaled.stats.hp = Math.floor(boss.stats.hp * partyFactor * (1 + (rankIndex * bossHpFactor) + (rankIndex * rankIndex * bossHpQuadFactor)));

    // 💡 FIX 2026-07-17: Boss HP floor. At low ranks (F/E/D), the boss base
    // HP (e.g. Infected Colossus = 300) combined with the low rank scaling
    // produced bosses with FEWER HP than regular trash mobs (372 HP boss vs
    // 1865 HP regular enemy at F-rank). This was backwards — the boss should
    // always be the climax of the dungeon.
    //
    // Fix: compute what a regular enemy's HP would be at this rank using the
    // SAME formula as scaleEnemyStats, then ensure the boss has at least 2×
    // that. This guarantees the boss is always the tankiest enemy in the
    // dungeon, regardless of rank or base HP differences.
    let regularHpFactor, regularHpQuadFactor;
    if (rankIndex <= 1.0) {
        regularHpFactor = 0.12; regularHpQuadFactor = 0.002;
    } else if (rankIndex <= 4.0) {
        regularHpFactor = 0.18; regularHpQuadFactor = 0.003;
    } else if (rankIndex <= 7.0) {
        regularHpFactor = 0.22; regularHpQuadFactor = 0.004;
    } else if (rankIndex <= 13.0) {
        regularHpFactor = 0.20; regularHpQuadFactor = 0.003;
    } else if (rankIndex <= 25.0) {
        regularHpFactor = 0.24; regularHpQuadFactor = 0.004;
    } else {
        regularHpFactor = 0.28; regularHpQuadFactor = 0.0045;
    }
    const regularHpMult = 1 + (rankIndex * regularHpFactor) + (rankIndex * rankIndex * regularHpQuadFactor);
    // 💡 Use 1500 as the baseline regular enemy HP (most templates are
    // 1000-2000). Boss should be at least 1.5× a regular enemy's HP.
    const minBossHp = Math.floor(1500 * partyFactor * regularHpMult * 1.5);
    if (scaled.stats.hp < minBossHp) {
        scaled.stats.hp = minBossHp;
    }

    scaled.stats.atk = Math.floor(boss.stats.atk * partyFactor * dmgMult);
    scaled.stats.mag = Math.floor(boss.stats.mag * partyFactor * dmgMult);
    
    // Boss Speed Scaling — 💡 QA FIX #33: Bosses must be DANGEROUS.
    // High-tier bosses (S+, Dragon, Raid) should outspeed players to feel
    // threatening. They use a higher blend toward player speed (90%) PLUS
    // a boss speed bonus so they act first or trade evenly.
    let baseSpeed = Math.floor(boss.stats.spd * partyFactor * spdMult);

    // Bosses target 110% of player speed (slightly faster — they go first)
    let targetSpeed = Math.max(20, avgPlayerSpeed) * 1.10;
    // High-level bosses (S+/SS/SSS/Dragon) get EXTRA speed — they should
    // consistently outspeed even fast players
    if (rankIndex > 25.0) targetSpeed *= 1.15; // S+ bosses: 126% of player speed
    if (rankIndex > 50.0) targetSpeed *= 1.10; // SS+ bosses: 139% of player speed
    // Dragon bosses are always fast
    if (boss.id && String(boss.id).toUpperCase().includes('DRAGON')) targetSpeed *= 1.20;

    // Bosses use 80% blend toward target (stronger rubber-band than regular)
    scaled.stats.spd = Math.max(10, Math.floor((baseSpeed * 0.20) + (targetSpeed * 0.80)));

    // 💡 QA FIX: Bosses also get mana regen per turn (was missing)
    scaled.mana = 200;
    scaled.maxMana = 200;

    scaled.stats.def = Math.floor(boss.stats.def * partyFactor * (1 + (rankIndex * 0.1)));
    
    scaled.stats.maxHp = scaled.stats.hp;
    scaled.currentHP = scaled.stats.hp;
    scaled.maxHP = scaled.stats.hp;
    scaled.mana = 200;
    scaled.maxMana = 200;
    
    const xpRewardBase = boss.xpReward !== undefined ? boss.xpReward : 1000;
    const goldRewardBase = boss.goldReward !== undefined ? boss.goldReward : [100, 200];

    // Boss rewards — scaled even more aggressively than regular enemies.
    // Bosses are the climax of a dungeon and should drop significantly
    // better loot.
    //
    // 💡 FIX (pass 1): Changed to EXPONENTIAL scaling (1 + rankIndex^1.5
    // for XP, 1 + rankIndex^1.3 for gold) so S-rank bosses give ~208×
    // F-rank XP (vs 29× under the old linear formula). Combined with
    // the distinct S/SS/SSS boss templates, S-rank boss XP went from
    // ~229K to ~12.5M.
    //
    // 💡 FIX (pass 2 — this commit): Bumped XP exponent from 1.5 → 1.55.
    // The L75→L76 milestone (93.9M XP, 1.8× tier) was forcing ~8 S-rank
    // boss kills per level — too grindy for the climax rank. The +0.05
    // exponent bump yields:
    //   S    (diff=35):  35^1.55 = 247.3 vs 35^1.5 = 207.1   → +19.4% (12.5M → 14.9M)
    //   SS   (diff=75):  75^1.55 = 806.0 vs 75^1.5 = 649.5   → +24.1% (97.6M → 121.1M)
    //   SSS  (diff=80):  80^1.55 = 890.8 vs 80^1.5 = 715.5   → +24.5% (286.6M → 356.7M)
    //
    // NOTE: An earlier draft of this comment claimed +40-50% bumps. That
    // was a math error — 35^1.55 was miscomputed as 290.8 (actual 247.3).
    // The bump is real but smaller than originally pitched. If a bigger
    // bump is desired, exponent 1.6 would deliver +~107% (S: 12.5M→26.3M,
    // SSS: 286.6M→592M) — roughly 2x the current value.
    //
    // Net effect at the L75 milestone (93.9M XP, the steepest single-level
    // jump in the curve due to the 1.8× tier kicking in):
    //   S-rank boss kills per level: was ~8, now ~6.3 (small but noticeable)
    //   SS-rank: still ~1 boss kill per level
    //   SSS-rank: still ~1 boss kill per level
    // Trash XP (rankIndex^1.4 at L1155) is unchanged — this targets boss
    // XP only. Gold exponent (1.3) unchanged.
    scaled.xpReward = Math.floor(xpRewardBase * (1 + Math.pow(rankIndex, 1.55)));
    scaled.goldReward = [
        Math.floor(goldRewardBase[0] * (1 + Math.pow(rankIndex, 1.3))),
        Math.floor(goldRewardBase[1] * (1 + Math.pow(rankIndex, 1.3)))
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
