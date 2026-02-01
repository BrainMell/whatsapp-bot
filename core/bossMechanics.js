// ============================================
// 👑 BOSS MECHANICS SYSTEM
// ============================================
// Advanced boss fight system featuring:
// - Multi-phase bosses with transitions
// - Enrage timers
// - Add spawning
// - Unique mechanics per boss
// - Phase-specific abilities
// - Interrupt mechanics
// - Soft/hard enrage

// ==========================================
// 🎯 BOSS PHASE SYSTEM
// ==========================================

class BossPhaseManager {
    constructor(boss) {
        this.boss = boss;
        this.currentPhaseIndex = 0;
        this.phaseHistory = [];
        this.mechanicsActive = [];
        this.enrageTimer = null;
        this.softEnrageStacks = 0;
    }
    
    checkPhaseTransition() {
        if (!this.boss.phases) return null;
        
        const currentHP = this.boss.stats.hp;
        const maxHP = this.boss.stats.maxHp;
        const hpPercent = (currentHP / maxHP) * 100;
        
        const nextPhase = this.boss.phases[this.currentPhaseIndex + 1];
        if (nextPhase && hpPercent <= nextPhase.threshold) {
            return this.transitionToPhase(this.currentPhaseIndex + 1);
        }
        
        return null;
    }
    
    transitionToPhase(phaseIndex) {
        if (phaseIndex >= this.boss.phases.length) return null;
        
        this.currentPhaseIndex = phaseIndex;
        const phase = this.boss.phases[phaseIndex];
        
        this.phaseHistory.push({
            index: phaseIndex,
            timestamp: Date.now(),
            hpAtTransition: this.boss.stats.hp
        });
        
        // Update boss abilities for this phase
        this.boss.abilities = phase.abilities || [];
        
        // Apply phase-specific effects
        if (phase.effects) {
            phase.effects.forEach(effect => {
                this.applyPhaseEffect(effect);
            });
        }
        
        return {
            phase: phaseIndex + 1,
            message: phase.message || `Boss enters Phase ${phaseIndex + 1}!`,
            abilities: this.boss.abilities,
            mechanics: phase.mechanics || []
        };
    }
    
    applyPhaseEffect(effect) {
        if (effect.type === 'stat_boost') {
            this.boss.stats[effect.stat] = Math.floor(
                this.boss.stats[effect.stat] * (1 + effect.value / 100)
            );
        } else if (effect.type === 'heal') {
            this.boss.stats.hp = Math.min(
                this.boss.stats.maxHp,
                this.boss.stats.hp + effect.value
            );
        } else if (effect.type === 'summon') {
            this.mechanicsActive.push(effect);
        }
    }
}

// ==========================================
// 👑 GOBLIN KING - Detailed Boss
// ==========================================

const GOBLIN_KING_BOSS = {
    id: 'goblin_king',
    name: 'Gortak the Goblin King',
    icon: '👑👺',
    level: 2,
    
    stats: {
        hp: 400,
        maxHp: 400,
        energy: 150,
        maxEnergy: 150,
        atk: 22,
        def: 15,
        mag: 8,
        spd: 12,
        luck: 10,
        crit: 15
    },
    
    // PHASE 1: 100% - 66% HP
    phases: [
        {
            name: 'Rally the Troops',
            threshold: 100,
            abilities: ['club_smash', 'war_cry', 'summon_goblins'],
            mechanics: [
                {
                    name: 'Goblin Reinforcements',
                    type: 'summon',
                    trigger: 'every_3_turns',
                    summonType: 'goblin_grunt',
                    count: 2,
                    message: 'More goblins rush into battle!'
                }
            ],
            message: '👑 "Weaklings! My tribe will crush you!"'
        },
        
        // PHASE 2: 66% - 33% HP
        {
            name: 'Fury of the King',
            threshold: 66,
            abilities: ['brutal_slam', 'kings_wrath', 'summon_elite'],
            mechanics: [
                {
                    name: 'Reckless Rage',
                    type: 'buff',
                    stat: 'atk',
                    value: 40,
                    duration: 999
                },
                {
                    name: 'Goblin Archers',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'goblin_archer',
                    count: 3,
                    message: 'Archers take position on the walls!'
                },
                {
                    name: 'Rain of Arrows',
                    type: 'aoe_damage',
                    trigger: 'every_2_turns',
                    damage: 30,
                    message: '🏹 Arrows rain down on the party!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 30 }
            ],
            message: '👑 "You dare wound me?! RAGE!"'
        },
        
        // PHASE 3: 33% - 0% HP
        {
            name: 'Last Stand of Gortak',
            threshold: 33,
            abilities: ['berserker_smash', 'final_roar', 'desperate_slam'],
            mechanics: [
                {
                    name: 'Berserker Frenzy',
                    type: 'multi_buff',
                    buffs: [
                        { stat: 'atk', value: 60 },
                        { stat: 'spd', value: 40 }
                    ],
                    duration: 999
                },
                {
                    name: 'Ground Slam',
                    type: 'periodic_aoe',
                    trigger: 'every_turn',
                    damage: 40,
                    effect: 'stun',
                    chance: 50,
                    message: '💥 The ground shakes violently!'
                },
                {
                    name: 'Call of Desperation',
                    type: 'summon',
                    trigger: 'once_per_phase',
                    summonType: 'goblin_champion',
                    count: 1,
                    stats: { hp: 150, atk: 30 },
                    message: '⚔️ The Goblin Champion arrives!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 50 },
                { type: 'stat_boost', stat: 'crit', value: 25 }
            ],
            message: '👑 "I WILL NOT FALL TO THE LIKES OF YOU!"'
        }
    ],
    
    enrageTimer: 20, // 20 turns until enrage
    softEnrage: {
        turnThreshold: 15,
        stacksPerTurn: 1,
        effectPerStack: { stat: 'atk', value: 10 },
        message: '⚠️ The Goblin King grows more violent with time!'
    },
    
    loot: {
        guaranteed: ['goblin_crown', 'kings_club'],
        possible: ['royal_armor', 'goblin_banner', 'war_horn'],
        gold: 1200,
        xp: 600
    }
};

// ==========================================
// 💀 THE LICH - Multi-Mechanic Boss
// ==========================================

const LICH_BOSS = {
    id: 'lich',
    name: 'Malachar the Eternal',
    icon: '💀🧙',
    level: 4,
    
    stats: {
        hp: 500,
        maxHp: 500,
        energy: 250,
        maxEnergy: 250,
        atk: 18,
        def: 12,
        mag: 40,
        spd: 14,
        luck: 12,
        crit: 8
    },
    
    phases: [
        // PHASE 1: Necromancer Phase
        {
            name: 'The Undying Spellcaster',
            threshold: 100,
            abilities: ['death_bolt', 'curse_of_ages', 'summon_skeletons', 'drain_essence'],
            mechanics: [
                {
                    name: 'Phylactery Shield',
                    type: 'damage_reduction',
                    value: 30,
                    until: 'phylactery_destroyed'
                },
                {
                    name: 'Skeleton Guard',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'skeleton_mage',
                    count: 4,
                    respawnOnDeath: true,
                    respawnDelay: 2,
                    message: '💀 Skeleton mages rise from the ground!'
                },
                {
                    name: 'Life Drain Aura',
                    type: 'aura',
                    effect: 'drain_hp',
                    value: 15,
                    trigger: 'every_turn',
                    message: '🩸 The Lich drains life force from all!'
                }
            ],
            interrupt: {
                ability: 'cast_doom',
                channelTime: 3,
                onComplete: 'team_wipe',
                interruptable: true,
                message: '⚠️ THE LICH BEGINS CHANNELING DOOM! INTERRUPT NOW!',
                completeMessage: '💀 DOOM! The party is obliterated!'
            },
            message: '💀 "Foolish mortals. Death comes for you."'
        },
        
        // PHASE 2: Soul Harvester
        {
            name: 'Soul Harvester',
            threshold: 66,
            abilities: ['soul_rend', 'death_field', 'mass_curse', 'spectral_chains'],
            mechanics: [
                {
                    name: 'Phylactery Weakened',
                    type: 'damage_reduction',
                    value: 15
                },
                {
                    name: 'Death Field',
                    type: 'zone_damage',
                    trigger: 'every_2_turns',
                    damage: 35,
                    zones: 3,
                    message: '💀 Death spreads across the battlefield!'
                },
                {
                    name: 'Soul Collection',
                    type: 'mechanic',
                    onPlayerDeath: 'collect_soul',
                    soulsNeeded: 1,
                    onCollect: 'heal_boss_50_percent',
                    message: '💀 The Lich absorbs a fallen soul!'
                },
                {
                    name: 'Wraith Summon',
                    type: 'summon',
                    trigger: 'below_50_hp',
                    summonType: 'wraith',
                    count: 3,
                    abilities: ['life_drain', 'phase'],
                    message: '👻 Wraiths emerge from the shadows!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 30 }
            ],
            message: '💀 "Your souls will fuel my power!"'
        },
        
        // PHASE 3: Ascension
        {
            name: 'Ascended Lich Form',
            threshold: 33,
            abilities: ['apocalypse', 'time_stop', 'death_sentence', 'void_rift'],
            mechanics: [
                {
                    name: 'Phylactery Destroyed',
                    type: 'remove_shield',
                    message: '✨ The phylactery shatters!'
                },
                {
                    name: 'Undead Army',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'death_knight',
                    count: 2,
                    stats: { hp: 180, atk: 35, def: 25 },
                    message: '⚔️💀 Death Knights rise!'
                },
                {
                    name: 'Apocalypse Casting',
                    type: 'channel',
                    channelTime: 4,
                    damage: 150,
                    aoe: true,
                    interruptable: true,
                    trigger: 'every_5_turns',
                    message: '⚠️ APOCALYPSE INCOMING!',
                    completeMessage: '💀☄️ APOCALYPSE! Massive damage to all!'
                },
                {
                    name: 'Resurrection',
                    type: 'revive',
                    trigger: 'on_first_death',
                    reviveHP: 25,
                    message: '💀 "Death? I AM death!" The Lich rises again!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 50 },
                { type: 'stat_boost', stat: 'def', value: 40 },
                { type: 'heal', value: 100 }
            ],
            message: '💀 "BEHOLD MY TRUE POWER!"'
        }
    ],
    
    enrageTimer: 25,
    hardEnrage: {
        atTurn: 30,
        effect: 'instant_wipe',
        message: '💀 "Time has run out!" The Lich consumes all souls!'
    },
    
    loot: {
        guaranteed: ['staff_of_souls', 'lich_robes'],
        possible: ['necro_tome', 'soul_gem', 'death_essence', 'phylactery_shard'],
        gold: 2500,
        xp: 1200
    }
};

// ==========================================
// 😈 DEMON LORD BALTHAZAR
// ==========================================

const DEMON_LORD_BOSS = {
    id: 'demon_lord',
    name: 'Balthazar, Lord of the Burning Hells',
    icon: '😈👑',
    level: 6,
    
    stats: {
        hp: 700,
        maxHp: 700,
        energy: 300,
        maxEnergy: 300,
        atk: 38,
        def: 25,
        mag: 35,
        spd: 18,
        luck: 15,
        crit: 20
    },
    
    phases: [
        // PHASE 1: Demon Form
        {
            name: 'Demon of Pride',
            threshold: 100,
            abilities: ['infernal_slash', 'hellfire', 'dark_pact', 'flame_wave'],
            mechanics: [
                {
                    name: 'Hellfire Pillars',
                    type: 'environmental',
                    trigger: 'every_3_turns',
                    zones: 4,
                    damage: 40,
                    effect: 'burn',
                    duration: 2,
                    message: '🔥 Pillars of hellfire erupt!'
                },
                {
                    name: 'Imp Swarm',
                    type: 'summon',
                    trigger: 'every_4_turns',
                    summonType: 'imp',
                    count: 5,
                    stats: { hp: 30, atk: 15 },
                    message: '👹 A swarm of imps appears!'
                },
                {
                    name: 'Demonic Aura',
                    type: 'aura',
                    effect: 'debuff_all',
                    stat: 'def',
                    value: 20,
                    message: '😈 Fear grips the party!'
                }
            ],
            message: '😈 "Mortals dare challenge ME?!"'
        },
        
        // PHASE 2: True Demon Form
        {
            name: 'Unleashed Fury',
            threshold: 66,
            abilities: ['chaos_storm', 'demonic_possession', 'void_tear', 'infernal_chains'],
            mechanics: [
                {
                    name: 'Transformation',
                    type: 'transform',
                    effects: [
                        { stat: 'atk', value: 40 },
                        { stat: 'mag', value: 40 },
                        { stat: 'spd', value: 30 }
                    ],
                    message: '😈 Balthazar reveals his true form!'
                },
                {
                    name: 'Lesser Demon Summon',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'lesser_demon',
                    count: 3,
                    stats: { hp: 120, atk: 28, mag: 22 },
                    message: '👹 Lesser demons heed the call!'
                },
                {
                    name: 'Chaos Storm',
                    type: 'channel',
                    channelTime: 3,
                    damage: 120,
                    aoe: true,
                    effects: ['burn', 'curse', 'confusion'],
                    trigger: 'every_6_turns',
                    message: '⚠️ A STORM OF CHAOS FORMS!',
                    completeMessage: '😈🌪️ CHAOS STORM UNLEASHED!'
                },
                {
                    name: 'Possession',
                    type: 'mind_control',
                    trigger: 'random',
                    chance: 30,
                    duration: 2,
                    target: 'random_player',
                    message: '😈 "Your will is MINE!"'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 35 },
                { type: 'stat_boost', stat: 'mag', value: 35 }
            ],
            message: '😈 "NOW YOU FACE TRUE POWER!"'
        },
        
        // PHASE 3: Void-Infused
        {
            name: 'Lord of Destruction',
            threshold: 33,
            abilities: ['armageddon', 'void_corruption', 'soul_harvest', 'apocalypse_beam'],
            mechanics: [
                {
                    name: 'Void Portal',
                    type: 'portal',
                    trigger: 'on_phase_start',
                    summonType: 'void_spawn',
                    spawnsPerTurn: 2,
                    message: '🌑 A portal to the void opens!'
                },
                {
                    name: 'Enraged',
                    type: 'buff',
                    stat: 'all',
                    value: 50,
                    duration: 999
                },
                {
                    name: 'Desperation Attack',
                    type: 'ultimate',
                    trigger: 'below_15_hp',
                    ability: 'final_destruction',
                    damage: 200,
                    message: '😈 "IF I FALL, YOU ALL DIE WITH ME!"'
                },
                {
                    name: 'Dark Rebirth',
                    type: 'revive_mechanic',
                    trigger: 'on_death',
                    reviveHP: 30,
                    once: true,
                    requiresInterrupt: true,
                    channelTime: 3,
                    message: '⚠️ BALTHAZAR BEGINS REVIVAL! STOP HIM!',
                    successMessage: '😈 "REBORN IN DARKNESS!"',
                    failMessage: '✨ The ritual is interrupted!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 50 },
                { type: 'heal', value: 150 }
            ],
            message: '😈 "WITNESS THE END OF ALL THINGS!"'
        }
    ],
    
    enrageTimer: 30,
    softEnrage: {
        turnThreshold: 20,
        stacksPerTurn: 2,
        effectPerStack: { stat: 'atk', value: 15, stat2: 'mag', value2: 15 },
        message: '😈 Balthazar\'s fury intensifies!'
    },
    hardEnrage: {
        atTurn: 35,
        effect: 'armageddon_wipe',
        message: '😈 "ENOUGH!" Balthazar obliterates everything!'
    },
    
    loot: {
        guaranteed: ['demon_blade', 'crown_of_hells', 'infernal_armor'],
        possible: ['demon_heart', 'void_essence', 'chaos_gem', 'soul_crystal'],
        gold: 5000,
        xp: 2000
    }
};

// ==========================================
// 🌑 VOID TITAN - Environmental Boss
// ==========================================

const VOID_TITAN_BOSS = {
    id: 'void_titan',
    name: 'The Void Titan',
    icon: '🌑👁️',
    level: 8,
    
    stats: {
        hp: 900,
        maxHp: 900,
        energy: 400,
        maxEnergy: 400,
        atk: 42,
        def: 30,
        mag: 45,
        spd: 16,
        luck: 12,
        crit: 15
    },
    
    phases: [
        {
            name: 'Awakening',
            threshold: 100,
            abilities: ['void_pulse', 'reality_warp', 'tentacle_slam', 'nullify'],
            mechanics: [
                {
                    name: 'Reality Distortion',
                    type: 'environmental',
                    effect: 'random_teleport',
                    trigger: 'every_2_turns',
                    message: '🌀 Reality warps around you!'
                },
                {
                    name: 'Void Tentacles',
                    type: 'summon',
                    trigger: 'every_4_turns',
                    summonType: 'void_tentacle',
                    count: 4,
                    stats: { hp: 100, atk: 25 },
                    regenerate: true,
                    message: '🦑 Tentacles emerge from the void!'
                },
                {
                    name: 'Gravity Well',
                    type: 'pull_mechanic',
                    trigger: 'random',
                    damage: 30,
                    message: '🌀 You\'re pulled toward the Titan!'
                }
            ],
            message: '🌑 *Incomprehensible whispers fill your mind*'
        },
        
        {
            name: 'Dimensional Rift',
            threshold: 66,
            abilities: ['consume', 'void_storm', 'dimensional_tear', 'entropy'],
            mechanics: [
                {
                    name: 'Void Rifts',
                    type: 'portal_network',
                    trigger: 'on_phase_start',
                    portals: 4,
                    effect: 'random_effects',
                    message: '🌑 Rifts tear open across dimensions!'
                },
                {
                    name: 'Consume Reality',
                    type: 'channel',
                    channelTime: 4,
                    effect: 'remove_random_ability',
                    aoe: true,
                    message: '⚠️ THE TITAN CONSUMES REALITY ITSELF!',
                    completeMessage: '🌑 Abilities vanish into the void!'
                },
                {
                    name: 'Void Spawn',
                    type: 'summon',
                    trigger: 'every_3_turns',
                    summonType: 'void_horror',
                    count: 2,
                    stats: { hp: 150, atk: 35, mag: 30 },
                    message: '👁️ Horrors from beyond manifest!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 50 }
            ],
            message: '🌑 *The fabric of reality tears apart*'
        },
        
        {
            name: 'Oblivion',
            threshold: 33,
            abilities: ['heat_death', 'null_zone', 'final_entropy', 'cosmic_horror'],
            mechanics: [
                {
                    name: 'Entropic Decay',
                    type: 'debuff_stacking',
                    trigger: 'every_turn',
                    effect: 'reduce_max_hp',
                    value: 5,
                    message: '🌑 Your very existence begins to fade...'
                },
                {
                    name: 'Void Collapse',
                    type: 'arena_shrink',
                    trigger: 'every_5_turns',
                    damage: 50,
                    message: '⚫ The void closes in!'
                },
                {
                    name: 'Final Form',
                    type: 'buff',
                    stat: 'all',
                    value: 100,
                    duration: 999,
                    message: '🌑 THE TITAN ASSUMES ITS TRUE FORM!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 60 },
                { type: 'heal', value: 200 }
            ],
            message: '🌑 *OBLIVION AWAITS*'
        }
    ],
    
    enrageTimer: 35,
    hardEnrage: {
        atTurn: 40,
        effect: 'void_consumption',
        message: '🌑 *Everything dissolves into nothingness...*'
    },
    
    loot: {
        guaranteed: ['void_blade', 'reality_shard', 'titan_eye'],
        possible: ['void_heart', 'cosmic_dust', 'entropy_crystal', 'null_essence'],
        gold: 8000,
        xp: 3500
    }
};

// ==========================================
// 🌟 PRIMORDIAL CHAOS - Final Boss
// ==========================================

const PRIMORDIAL_CHAOS_BOSS = {
    id: 'primordial_chaos',
    name: 'Primordial Chaos',
    icon: '🌟🌑',
    level: 10,
    
    stats: {
        hp: 1200,
        maxHp: 1200,
        energy: 500,
        maxEnergy: 500,
        atk: 50,
        def: 35,
        mag: 55,
        spd: 22,
        luck: 20,
        crit: 25
    },
    
    phases: [
        // Phase 1: Creation
        {
            name: 'The Beginning',
            threshold: 100,
            abilities: ['genesis_strike', 'cosmic_ray', 'star_birth', 'primordial_flame'],
            mechanics: [
                {
                    name: 'Elemental Genesis',
                    type: 'summon_cycle',
                    trigger: 'every_3_turns',
                    cycle: ['fire_elemental', 'water_elemental', 'earth_elemental', 'air_elemental'],
                    message: '🌟 An elemental is born from chaos!'
                },
                {
                    name: 'Creation Energy',
                    type: 'aura',
                    effect: 'buff_self_over_time',
                    value: 5,
                    message: '✨ Chaos grows stronger!'
                }
            ],
            message: '🌟 "In the beginning, there was Chaos."'
        },
        
        // Phase 2: Order vs Chaos
        {
            name: 'Duality',
            threshold: 80,
            abilities: ['order_beam', 'chaos_burst', 'reality_split', 'paradox'],
            mechanics: [
                {
                    name: 'Split Reality',
                    type: 'arena_split',
                    zones: 2,
                    effects: ['order_zone_buff', 'chaos_zone_damage'],
                    message: '⚖️ Reality splits between Order and Chaos!'
                },
                {
                    name: 'Angel & Demon',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: ['angel_avatar', 'demon_avatar'],
                    message: '😇😈 Avatars of Order and Chaos manifest!'
                }
            ],
            message: '⚖️ "All things exist in balance."'
        },
        
        // Phase 3: Elemental Fury
        {
            name: 'The Four Pillars',
            threshold: 60,
            abilities: ['inferno', 'tsunami', 'earthquake', 'tornado'],
            mechanics: [
                {
                    name: 'Elemental Lords',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: ['fire_lord', 'water_lord', 'earth_lord', 'air_lord'],
                    mustDefeatAll: true,
                    message: '🔥💧🌍💨 The Four Elemental Lords appear!'
                },
                {
                    name: 'Elemental Cycle',
                    type: 'rotating_immunity',
                    elements: ['fire', 'water', 'earth', 'air'],
                    rotateEvery: 2,
                    message: '✨ Chaos shifts elemental affinity!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 40 }
            ],
            message: '🌊🔥 "Feel the raw power of the elements!"'
        },
        
        // Phase 4: Void Corruption
        {
            name: 'Entropy',
            threshold: 40,
            abilities: ['void_cascade', 'heat_death', 'null_everything', 'consume_all'],
            mechanics: [
                {
                    name: 'Void Zone',
                    type: 'expanding_void',
                    growthPerTurn: 10,
                    damage: 40,
                    message: '🌑 The void expands, consuming all!'
                },
                {
                    name: 'Existence Drain',
                    type: 'max_hp_reduction',
                    trigger: 'every_turn',
                    value: 3,
                    message: '💀 Your very existence drains away...'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 50 }
            ],
            message: '🌑 "Return to nothingness!"'
        },
        
        // Phase 5: Big Bang
        {
            name: 'Cosmic Rebirth',
            threshold: 20,
            abilities: ['big_bang', 'supernova', 'black_hole', 'universal_collapse'],
            mechanics: [
                {
                    name: 'Countdown to Annihilation',
                    type: 'doom_timer',
                    turns: 8,
                    effect: 'instant_wipe',
                    message: '⚠️ CHAOS BEGINS THE END OF ALL THINGS!',
                    warningEveryTurn: true,
                    wipMessage: '💥 *EVERYTHING CEASES TO EXIST*'
                },
                {
                    name: 'Cosmic Entities',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'cosmic_horror',
                    count: 3,
                    stats: { hp: 200, atk: 50, mag: 50 },
                    message: '👁️ Ancient cosmic horrors awaken!'
                },
                {
                    name: 'Reality Unravel',
                    type: 'random_chaos',
                    trigger: 'every_turn',
                    effects: 'all_negative',
                    message: '🌀 Reality itself unravels!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 100 },
                { type: 'heal', value: 300 }
            ],
            message: '💥 "WITNESS THE END AND BEGINNING AS ONE!"'
        },
        
        // Final Phase: Singularity
        {
            name: 'The Singularity',
            threshold: 5,
            abilities: ['omega', 'alpha_omega', 'final_judgment', 'reset_universe'],
            mechanics: [
                {
                    name: 'Last Stand',
                    type: 'buff',
                    stat: 'all',
                    value: 200,
                    duration: 999,
                    message: '🌟 CHAOS UNLEASHES INFINITE POWER!'
                },
                {
                    name: 'Auto-Death',
                    type: 'kill_one_per_turn',
                    trigger: 'every_turn',
                    target: 'lowest_hp',
                    message: '💀 One must fall...'
                },
                {
                    name: 'Desperate Resurrection',
                    type: 'revive_all_adds',
                    trigger: 'once',
                    when: 'below_3_percent',
                    message: '🌟 All fallen entities return!'
                }
            ],
            message: '🌟🌑 "I AM THE ALPHA AND OMEGA!"'
        }
    ],
    
    enrageTimer: 50,
    softEnrage: {
        turnThreshold: 30,
        stacksPerTurn: 3,
        effectPerStack: { stat: 'all', value: 10 },
        message: '⚠️ Chaos grows exponentially stronger!'
    },
    hardEnrage: {
        atTurn: 60,
        effect: 'universal_reset',
        message: '🌟 *Time and space collapse into a singularity... GAME OVER*'
    },
    
    loot: {
        guaranteed: ['chaos_blade', 'primordial_armor', 'genesis_staff', 'omega_ring'],
        possible: ['creation_essence', 'void_heart', 'cosmic_crown', 'infinity_stone'],
        gold: 15000,
        xp: 10000
    }
};

// ==========================================
// 🎯 BOSS ABILITY CATALOG
// ==========================================

const BOSS_ABILITIES = {
    // Goblin King Abilities
    club_smash: {
        name: 'Club Smash',
        damage: 1.5,
        targeting: 'single',
        effects: [{ type: 'stun', chance: 40, duration: 1 }]
    },
    war_cry: {
        name: 'War Cry',
        damage: 0,
        targeting: 'self',
        effects: [{ type: 'buff', stat: 'atk', value: 30, duration: 3 }]
    },
    summon_goblins: {
        name: 'Summon Goblins',
        damage: 0,
        targeting: 'summon',
        summon: { type: 'goblin_grunt', count: 2 }
    },
    ground_pound: {
        name: 'Ground Pound',
        damage: 3.0,
        targeting: 'aoe',
        isTelegraphed: true,
        telegraphMessage: ' Gortak raises his massive club high above his head... ⚠️ *DEFEND NOW!*',
        effects: [{ type: 'stun', chance: 100, duration: 1 }]
    },
    
    // Lich Abilities
    death_bolt: {
        name: 'Death Bolt',
        damage: 2.0,
        damageType: 'magical',
        targeting: 'single',
        effects: [{ type: 'curse', duration: 3 }]
    },
    soul_reap: {
        name: 'Soul Reap',
        damage: 4.5,
        damageType: 'magical',
        targeting: 'single',
        isTelegraphed: true,
        telegraphMessage: ' Malachar points a bony finger at a soul... it begins to glow with dark energy! ⚠️ *DEFEND NOW!*',
        effects: [{ type: 'drain', value: 50 }]
    },
    apocalypse: {
        name: 'Apocalypse',
        damage: 3.5,
        damageType: 'magical',
        targeting: 'aoe',
        channelTime: 4,
        effects: [
            { type: 'burn', duration: 3 },
            { type: 'curse', duration: 3 },
            { type: 'poison', duration: 3 }
        ]
    },
    
    // Add more abilities as needed...
};

// ==========================================
// 🎮 BOSS MANAGER CLASS
// ==========================================

class BossFightManager {
    constructor(boss, party) {
        this.boss = boss;
        this.party = party;
        this.phaseManager = new BossPhaseManager(boss);
        this.currentTurn = 0;
        this.summons = [];
        this.activeChannels = [];
    }
    
    processTurn() {
        this.currentTurn++;
        
        // Check phase transition
        const transition = this.phaseManager.checkPhaseTransition();
        if (transition) {
            return {
                type: 'phase_transition',
                data: transition
            };
        }
        
        // Check enrage
        if (this.boss.enrageTimer && this.currentTurn >= this.boss.enrageTimer) {
            return this.triggerEnrage();
        }
        
        // Process soft enrage stacks
        if (this.boss.softEnrage && this.currentTurn >= this.boss.softEnrage.turnThreshold) {
            this.phaseManager.softEnrageStacks++;
            const effect = this.boss.softEnrage.effectPerStack;
            this.boss.stats[effect.stat] += effect.value;
        }
        
        // Process active channels
        const channelResults = this.processChannels();
        if (channelResults.length > 0) {
            return { type: 'channel_complete', data: channelResults };
        }
        
        // Process summons AI
        this.processSummons();
        
        // Boss action
        return this.selectBossAction();
    }
    
    triggerEnrage() {
        if (this.boss.hardEnrage) {
            return {
                type: 'hard_enrage',
                effect: this.boss.hardEnrage.effect,
                message: this.boss.hardEnrage.message
            };
        }
        return null;
    }
    
    processChannels() {
        const completed = [];
        for (let i = this.activeChannels.length - 1; i >= 0; i--) {
            const channel = this.activeChannels[i];
            channel.currentTurn++;
            
            if (channel.currentTurn >= channel.channelTime) {
                completed.push(channel);
                this.activeChannels.splice(i, 1);
            }
        }
        return completed;
    }
    
    processSummons() {
        // AI for summoned units
        this.summons.forEach(summon => {
            if (summon.stats.hp > 0) {
                // Simple AI: attack random target
                const target = this.party[Math.floor(Math.random() * this.party.length)];
                // Attack logic here
            }
        });
    }
    
    selectBossAction() {
        const phase = this.boss.phases[this.phaseManager.currentPhaseIndex];
        const abilities = phase.abilities || [];
        
        // Select random ability weighted by priority
        const ability = abilities[Math.floor(Math.random() * abilities.length)];
        
        return {
            type: 'boss_action',
            ability: ability,
            data: BOSS_ABILITIES[ability]
        };
    }
    
    interruptChannel(channelIndex) {
        if (channelIndex < this.activeChannels.length) {
            const channel = this.activeChannels[channelIndex];
            this.activeChannels.splice(channelIndex, 1);
            return {
                success: true,
                message: `${channel.name} interrupted!`
            };
        }
        return { success: false };
    }
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    GOBLIN_KING_BOSS,
    LICH_BOSS,
    DEMON_LORD_BOSS,
    VOID_TITAN_BOSS,
    PRIMORDIAL_CHAOS_BOSS,
    BOSS_ABILITIES,
    BossPhaseManager,
    BossFightManager,
    
    // Helper function to get boss by act
    getBossForAct: (act) => {
        const bossMap = {
            1: GOBLIN_KING_BOSS,
            2: LICH_BOSS,
            3: DEMON_LORD_BOSS,
            4: VOID_TITAN_BOSS,
            5: PRIMORDIAL_CHAOS_BOSS
        };
        return bossMap[act] || GOBLIN_KING_BOSS;
    }
};
