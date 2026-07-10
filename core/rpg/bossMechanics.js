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
        if (!this.boss.phases || this.boss.phases.length <= 1) return null;
        
        const currentHP = this.boss.stats.hp;
        const maxHP = this.boss.stats.maxHp || this.boss.stats.hp;
        const hpPercent = (currentHP / maxHP) * 100;
        
        // 💡 Check all future phases, starting from the latest
        for (let i = this.boss.phases.length - 1; i > this.currentPhaseIndex; i--) {
            if (hpPercent <= this.boss.phases[i].threshold) {
                return this.transitionToPhase(i);
            }
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
            // 💡 BUG FIX: Use additive stacking rather than compounded multiplication
            const baseStat = this.boss.stats[effect.stat] || 10;
            const boostAmount = Math.floor(baseStat * (effect.value / 100));
            this.boss.stats[effect.stat] += boostAmount;
        } else if (effect.type === 'heal') {
            const maxHp = this.boss.stats.maxHp || this.boss.stats.hp;
            const healVal = effect.value > 1 ? effect.value : Math.floor(maxHp * effect.value);
            this.boss.stats.hp = Math.min(maxHp, this.boss.stats.hp + healVal);
        } else if (effect.type === 'summon') {
            this.mechanicsActive.push(effect);
        }
    }
}

// ==========================================
// 🦟 HIVE COMMANDER - Swarm Boss
// ==========================================

const HIVE_COMMANDER_BOSS = {
    id: 'HIVE_COMMANDER',
    name: 'The Hive Commander',
    icon: '🦟👑',
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
            name: 'Swarm Directive',
            threshold: 100,
            abilities: ['mandible_strike', 'infection_surge', 'release_swarm'],
            mechanics: [
                {
                    name: 'Drone Reinforcements',
                    type: 'summon',
                    trigger: 'every_3_turns',
                    summonType: 'infected_drone',
                    count: 2,
                    message: '🦟 More Infected Drones surge into the fray!'
                }
            ],
            message: '🦟👑 "The Hive commands — you will be consumed!"'
        },
        
        // PHASE 2: 66% - 33% HP
        {
            name: 'Infestation Frenzy',
            threshold: 66,
            abilities: ['brutal_slam', 'chitin_fury', 'release_elite_drones'],
            mechanics: [
                {
                    name: 'Chitinous Rage',
                    type: 'buff',
                    stat: 'atk',
                    value: 40,
                    duration: 999
                },
                {
                    name: 'Spitter Drones',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'spitter_drone',
                    count: 3,
                    message: '🦠 Spitter Drones take up flanking positions!'
                },
                {
                    name: 'Acid Rain',
                    type: 'aoe_damage',
                    trigger: 'every_2_turns',
                    damage: 30,
                    message: '☣️ Acid spittle rains down on the party!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 30 }
            ],
            message: '🦟👑 "You wounded the Hive?! The swarm RAGES!"'
        },
        
        // PHASE 3: 33% - 0% HP
        {
            name: 'Last Throes of the Hive',
            threshold: 33,
            abilities: ['berserker_smash', 'final_roar', 'desperate_slam'],
            mechanics: [
                {
                    name: 'Swarm Frenzy',
                    type: 'multi_buff',
                    buffs: [
                        { stat: 'atk', value: 60 },
                        { stat: 'spd', value: 40 }
                    ],
                    duration: 999
                },
                {
                    name: 'Ground Thrash',
                    type: 'periodic_aoe',
                    trigger: 'every_turn',
                    damage: 40,
                    effect: 'stun',
                    chance: 50,
                    message: '💥 The Hive Commander thrashes wildly, shaking the ground!'
                },
                {
                    name: 'Call of the Brood',
                    type: 'summon',
                    trigger: 'once_per_phase',
                    summonType: 'brood_champion',
                    count: 1,
                    stats: { hp: 150, atk: 30 },
                    message: '🦟⚔️ The Brood Champion erupts from the ground!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 50 },
                { type: 'stat_boost', stat: 'crit', value: 25 }
            ],
            message: '🦟👑 "THE HIVE WILL NOT DIE WITH ME!"'
        }
    ],
    
    enrageTimer: 20, // 20 turns until enrage
    softEnrage: {
        turnThreshold: 15,
        stacksPerTurn: 1,
        effectPerStack: { stat: 'atk', value: 10 },
        message: '⚠️ The Hive Commander\'s infection spreads faster!'
    },
    
    loot: {
        guaranteed: ['hive_crown', 'chitin_club'],
        possible: ['carapace_armor', 'hive_banner', 'swarm_horn'],
        gold: 1200,
        xp: 600
    }
};

// ==========================================
// ☣️ PLAGUE PRIEST - Multi-Mechanic Boss
// ==========================================

const PLAGUE_PRIEST_BOSS = {
    id: 'PLAGUE_PRIEST',
    name: 'Malachar the Plague Priest',
    icon: '☣️🧙',
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
        // PHASE 1: Plague Caster Phase
        {
            name: 'The Undying Plague Caster',
            threshold: 100,
            abilities: ['plague_bolt', 'curse_of_rot', 'summon_spore_mages', 'toxic_aura'],
            mechanics: [
                {
                    name: 'Spore Shield',
                    type: 'damage_reduction',
                    value: 30,
                    until: 'spore_shield_destroyed'
                },
                {
                    name: 'Spore Mage Guard',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'spore_mage',
                    count: 4,
                    respawnOnDeath: true,
                    respawnDelay: 2,
                    message: '☣️ Spore Mages erupt from infected earth!'
                },
                {
                    name: 'Toxic Aura',
                    type: 'aura',
                    effect: 'drain_hp',
                    value: 15,
                    trigger: 'every_turn',
                    message: '🧪 The Plague Priest\'s toxic aura saps your vitality!'
                }
            ],
            interrupt: {
                ability: 'cast_outbreak',
                channelTime: 3,
                onComplete: 'team_wipe',
                interruptable: true,
                message: '⚠️ THE PLAGUE PRIEST CHANNELS OUTBREAK! INTERRUPT NOW!',
                completeMessage: '☣️ OUTBREAK! The plague consumes the party!'
            },
            message: '☣️ "Foolish mortals. The Infection claims all."'
        },
        
        // PHASE 2: Plague Harvester
        {
            name: 'Plague Harvester',
            threshold: 66,
            abilities: ['soul_rend', 'blight_field', 'mass_infection', 'spore_chains'],
            mechanics: [
                {
                    name: 'Spore Shield Weakened',
                    type: 'damage_reduction',
                    value: 15
                },
                {
                    name: 'Blight Field',
                    type: 'zone_damage',
                    trigger: 'every_2_turns',
                    damage: 35,
                    zones: 3,
                    message: '☣️ Blight spreads across the battlefield!'
                },
                {
                    name: 'Corpse Collection',
                    type: 'mechanic',
                    onPlayerDeath: 'collect_corpse',
                    soulsNeeded: 1,
                    onCollect: 'heal_boss_50_percent',
                    message: '☣️ The Plague Priest absorbs a fallen body into the Infection!'
                },
                {
                    name: 'Plague Wraith Summon',
                    type: 'summon',
                    trigger: 'below_50_hp',
                    summonType: 'plague_wraith',
                    count: 3,
                    abilities: ['toxic_drain', 'spore_phase'],
                    message: '👻 Plague Wraiths billow forth from the miasma!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 30 }
            ],
            message: '☣️ "Your bodies will fuel the Plague\'s spread!"'
        },
        
        // PHASE 3: Ascended Plague Form
        {
            name: 'Ascended Plague Form',
            threshold: 33,
            abilities: ['outbreak', 'time_stop', 'death_sentence', 'void_blight'],
            mechanics: [
                {
                    name: 'Spore Shield Destroyed',
                    type: 'remove_shield',
                    message: '✨ The Spore Shield ruptures in a cloud of contagion!'
                },
                {
                    name: 'Plague Vanguard',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'plague_knight',
                    count: 2,
                    stats: { hp: 180, atk: 35, def: 25 },
                    message: '⚔️☣️ Plague Knights shamble forward!'
                },
                {
                    name: 'Outbreak Casting',
                    type: 'channel',
                    channelTime: 4,
                    damage: 150,
                    aoe: true,
                    interruptable: true,
                    trigger: 'every_5_turns',
                    message: '⚠️ OUTBREAK INCOMING!',
                    completeMessage: '☣️💀 OUTBREAK! Plague devastates all!'
                },
                {
                    name: 'Viral Resurrection',
                    type: 'revive',
                    trigger: 'on_first_death',
                    reviveHP: 25,
                    message: '☣️ "Death? I AM the Plague!" Malachar rises again!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 50 },
                { type: 'stat_boost', stat: 'def', value: 40 },
                { type: 'heal', value: 100 }
            ],
            message: '☣️ "BEHOLD THE TRUE FACE OF THE PLAGUE!"'
        }
    ],
    
    enrageTimer: 25,
    hardEnrage: {
        atTurn: 30,
        effect: 'instant_wipe',
        message: '☣️ "The Infection is absolute!" Malachar\'s plague devours all!'
    },
    
    loot: {
        guaranteed: ['staff_of_plague', 'infected_robes'],
        possible: ['plague_tome', 'spore_gem', 'blight_essence', 'spore_shield_shard'],
        gold: 2500,
        xp: 1200
    }
};

// ==========================================
// 🦠 CORRUPTED OVERLORD
// ==========================================

const CORRUPTED_OVERLORD_BOSS = {
    id: 'CORRUPTED_OVERLORD',
    name: 'The Corrupted Overlord',
    icon: '🦠👑',
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
        // PHASE 1: Corrupted Form
        {
            name: 'Herald of Mutation',
            threshold: 100,
            abilities: ['mutation_slash', 'blight_pulse', 'dark_pact', 'corruption_wave'],
            mechanics: [
                {
                    name: 'Mutagenic Pillars',
                    type: 'environmental',
                    trigger: 'every_3_turns',
                    zones: 4,
                    damage: 40,
                    effect: 'infect',
                    duration: 2,
                    message: '🦠 Mutagenic geysers erupt from the ground!'
                },
                {
                    name: 'Mutant Imp Swarm',
                    type: 'summon',
                    trigger: 'every_4_turns',
                    summonType: 'mutant_imp',
                    count: 5,
                    stats: { hp: 30, atk: 15 },
                    message: '🦠 A swarm of Mutant Imps bubbles forth!'
                },
                {
                    name: 'Mutagenic Field',
                    type: 'aura',
                    effect: 'debuff_all',
                    stat: 'def',
                    value: 20,
                    message: '🦠 The Mutagenic Field weakens all who stand within!'
                }
            ],
            message: '🦠👑 "You dare oppose the Corruption?!"'
        },
        
        // PHASE 2: True Corrupted Form
        {
            name: 'Mutation Unleashed',
            threshold: 66,
            abilities: ['chaos_storm', 'mutagenic_possession', 'void_tear', 'infested_chains'],
            mechanics: [
                {
                    name: 'Corruption Transformation',
                    type: 'transform',
                    effects: [
                        { stat: 'atk', value: 40 },
                        { stat: 'mag', value: 40 },
                        { stat: 'spd', value: 30 }
                    ],
                    message: '🦠👑 The Corrupted Overlord reveals its true grotesque form!'
                },
                {
                    name: 'Mutant Spawn',
                    type: 'summon',
                    trigger: 'on_phase_start',
                    summonType: 'lesser_mutant',
                    count: 3,
                    stats: { hp: 120, atk: 28, mag: 22 },
                    message: '🦠 Lesser Mutants answer the Overlord\'s call!'
                },
                {
                    name: 'Corruption Storm',
                    type: 'channel',
                    channelTime: 3,
                    damage: 120,
                    aoe: true,
                    effects: ['infect', 'mutate', 'confusion'],
                    trigger: 'every_6_turns',
                    message: '⚠️ A STORM OF CORRUPTION COALESCES!',
                    completeMessage: '🦠🌪️ CORRUPTION STORM UNLEASHED!'
                },
                {
                    name: 'Mutagenic Possession',
                    type: 'mind_control',
                    trigger: 'random',
                    chance: 30,
                    duration: 2,
                    target: 'random_player',
                    message: '🦠 "Your body is now OURS!"'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'atk', value: 35 },
                { type: 'stat_boost', stat: 'mag', value: 35 }
            ],
            message: '🦠👑 "NOW WITNESS TRUE CORRUPTION!"'
        },
        
        // PHASE 3: Void-Infused Corruption
        {
            name: 'Overlord of Ruin',
            threshold: 33,
            abilities: ['armageddon', 'void_corruption', 'biomass_harvest', 'plague_beam'],
            mechanics: [
                {
                    name: 'Corruption Portal',
                    type: 'portal',
                    trigger: 'on_phase_start',
                    summonType: 'void_infected',
                    spawnsPerTurn: 2,
                    message: '🌑 A rift tears open, pouring corrupted horrors through!'
                },
                {
                    name: 'Enraged',
                    type: 'buff',
                    stat: 'all',
                    value: 50,
                    duration: 999
                },
                {
                    name: 'Desperation Mutation',
                    type: 'ultimate',
                    trigger: 'below_15_hp',
                    ability: 'final_mutation_burst',
                    damage: 200,
                    message: '🦠 "IF THE OVERLORD FALLS — THE INFECTION CONSUMES ALL!"'
                },
                {
                    name: 'Viral Rebirth',
                    type: 'revive_mechanic',
                    trigger: 'on_death',
                    reviveHP: 30,
                    once: true,
                    requiresInterrupt: true,
                    channelTime: 3,
                    message: '⚠️ THE OVERLORD BEGINS VIRAL REBIRTH! STOP IT!',
                    successMessage: '🦠 "REBORN THROUGH CORRUPTION!"',
                    failMessage: '✨ The viral ritual is disrupted!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 50 },
                { type: 'heal', value: 150 }
            ],
            message: '🦠👑 "WITNESS THE CORRUPTION OF ALL THINGS!"'
        }
    ],
    
    enrageTimer: 30,
    softEnrage: {
        turnThreshold: 20,
        stacksPerTurn: 2,
        effectPerStack: { stat: 'atk', value: 15, stat2: 'mag', value2: 15 },
        message: '🦠 The Corrupted Overlord\'s mutations accelerate!'
    },
    hardEnrage: {
        atTurn: 35,
        effect: 'armageddon_wipe',
        message: '🦠 "ENOUGH!" The Overlord\'s corruption obliterates everything!'
    },
    
    loot: {
        guaranteed: ['mutation_blade', 'overlord_carapace', 'corruption_crown'],
        possible: ['mutant_heart', 'void_essence', 'corruption_gem', 'blight_crystal'],
        gold: 5000,
        xp: 2000
    }
};

// ==========================================
// 🌑 VOID CORRUPTED - Corruption Entity Boss
// ==========================================

const VOID_CORRUPTED_BOSS = {
    id: 'void_corrupted',
    name: 'The Void-Corrupted',
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
            name: 'Corruption Awakening',
            threshold: 100,
            abilities: ['void_pulse', 'reality_warp', 'tentacle_slam', 'nullify'],
            mechanics: [
                {
                    name: 'Corruption Distortion',
                    type: 'environmental',
                    effect: 'random_teleport',
                    trigger: 'every_2_turns',
                    message: '🌀 Corruption warps the space around you!'
                },
                {
                    name: 'Corrupted Tendrils',
                    type: 'summon',
                    trigger: 'every_4_turns',
                    summonType: 'corrupted_tendril',
                    count: 4,
                    stats: { hp: 100, atk: 25 },
                    regenerate: true,
                    message: '🦑 Corrupted tendrils erupt from infected ground!'
                },
                {
                    name: 'Void Gravity Well',
                    type: 'pull_mechanic',
                    trigger: 'random',
                    damage: 30,
                    message: '🌀 You are pulled into the corruption vortex!'
                }
            ],
            message: '🌑 *Corrupted whispers flood your mind with infection...*'
        },
        
        {
            name: 'Corrupted Rift',
            threshold: 66,
            abilities: ['consume', 'void_storm', 'dimensional_tear', 'entropy'],
            mechanics: [
                {
                    name: 'Corruption Rifts',
                    type: 'portal_network',
                    trigger: 'on_phase_start',
                    portals: 4,
                    effect: 'random_effects',
                    message: '🌑 Corruption rifts tear open — infectious energy pours through!'
                },
                {
                    name: 'Consume Sanity',
                    type: 'channel',
                    channelTime: 4,
                    effect: 'remove_random_ability',
                    aoe: true,
                    message: '⚠️ THE VOID-CORRUPTED CONSUMES YOUR WILL!',
                    completeMessage: '🌑 Abilities dissolve into corrupted void!'
                },
                {
                    name: 'Corrupted Horrors',
                    type: 'summon',
                    trigger: 'every_3_turns',
                    summonType: 'void_corrupted_horror',
                    count: 2,
                    stats: { hp: 150, atk: 35, mag: 30 },
                    message: '👁️ Void-Corrupted Horrors materialize from the infection!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 50 }
            ],
            message: '🌑 *The infection tears reality apart*'
        },
        
        {
            name: 'Void Oblivion',
            threshold: 33,
            abilities: ['heat_death', 'null_zone', 'final_entropy', 'cosmic_horror'],
            mechanics: [
                {
                    name: 'Corrupted Entropic Decay',
                    type: 'debuff_stacking',
                    trigger: 'every_turn',
                    effect: 'reduce_max_hp',
                    value: 5,
                    message: '🌑 The corruption erodes your very existence...'
                },
                {
                    name: 'Void Corruption Collapse',
                    type: 'arena_shrink',
                    trigger: 'every_5_turns',
                    damage: 50,
                    message: '⚫ The corrupted void closes in — nowhere left to run!'
                },
                {
                    name: 'Fully Corrupted Form',
                    type: 'buff',
                    stat: 'all',
                    value: 100,
                    duration: 999,
                    message: '🌑 THE VOID-CORRUPTED ASSUMES ITS FINAL FORM!'
                }
            ],
            effects: [
                { type: 'stat_boost', stat: 'all', value: 60 },
                { type: 'heal', value: 200 }
            ],
            message: '🌑 *CORRUPTED OBLIVION AWAITS*'
        }
    ],
    
    enrageTimer: 35,
    hardEnrage: {
        atTurn: 40,
        effect: 'void_consumption',
        message: '🌑 *Everything dissolves into corrupted nothingness...*'
    },
    
    loot: {
        guaranteed: ['void_blade', 'corruption_shard', 'corrupted_eye'],
        possible: ['void_heart', 'corruption_dust', 'entropy_crystal', 'null_essence'],
        gold: 8000,
        xp: 3500
    }
};

// ==========================================
// 🐲 ANCIENT DRAGON - Elemental Predator
// ==========================================

const ANCIENT_DRAGON_BOSS = {
    id: 'ancient_dragon_boss',
    name: 'Igneel the Fire King',
    icon: '🐲🔥',
    level: 15,
    
    stats: {
        hp: 3000,
        maxHp: 3000,
        energy: 400,
        maxEnergy: 400,
        atk: 75,
        def: 60,
        mag: 80,
        spd: 15,
        luck: 30,
        crit: 20
    },
    
    phases: [
        {
            name: 'Dragon Breath',
            threshold: 100,
            abilities: ['dragon_claw', 'fire_breath', 'wing_buffet'],
            message: '🐲 "You dare enter my nesting ground?!"'
        },
        {
            name: 'Inferno',
            threshold: 50,
            abilities: ['fire_storm', 'draconic_roar', 'meteor_strike'],
            effects: [
                { type: 'stat_boost', stat: 'mag', value: 40 },
                { type: 'stat_boost', stat: 'atk', value: 20 }
            ],
            message: '🔥 THE AIR GROWS SCORCHING HOT!'
        }
    ],
    
    enrageTimer: 25,

    // 💡 FIX: add top-level xpReward/goldReward so endCombat reads them.
    // Previously only `loot.xp`/`loot.gold` were defined, which endCombat
    // ignores — the dragon boss fell back to the default 1000 XP / [100,200]
    // gold, less than a D-rank common mob. Now S-rank-appropriate.
    xpReward: 50000,
    goldReward: [20000, 40000],

    loot: {
        guaranteed: ['dragon_heart'],
        possible: ['dragon_scale_armor', 'dragon_fang_dagger'],
        gold: 5000,
        xp: 3000
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
    // ── HIVE COMMANDER (was: Goblin King) Abilities ──
    mandible_strike: {
        name: 'Mandible Strike',
        damage: 1.5,
        targeting: 'single',
        effects: [{ type: 'stun', chance: 40, duration: 1 }]
    },
    infection_surge: {
        name: 'Infection Surge',
        damage: 0,
        targeting: 'self',
        effects: [{ type: 'buff', stat: 'atk', value: 30, duration: 3 }]
    },
    release_swarm: {
        name: 'Release Swarm',
        damage: 0,
        targeting: 'summon',
        summon: { type: 'infected_drone', count: 2 }
    },
    ground_pound: {
        name: 'Ground Thrash',
        damage: 3.0,
        targeting: 'aoe',
        isTelegraphed: true,
        telegraphMessage: ' The Hive Commander rears back, carapace trembling... ⚠️ *DEFEND NOW!*',
        effects: [{ type: 'stun', chance: 100, duration: 1 }]
    },

    // ── PLAGUE PRIEST (was: Lich) Abilities ──
    plague_bolt: {
        name: 'Plague Bolt',
        damage: 2.0,
        damageType: 'magical',
        targeting: 'single',
        effects: [{ type: 'infect', duration: 3 }]
    },
    toxic_aura: {
        name: 'Toxic Aura',
        damage: 0,
        targeting: 'aoe',
        effects: [{ type: 'dot', element: 'poison', value: 15, duration: 2 }]
    },
    summon_spore_mages: {
        name: 'Summon Spore Mages',
        damage: 0,
        targeting: 'summon',
        summon: { type: 'spore_mage', count: 2 }
    },
    spore_reap: {
        name: 'Spore Reap',
        damage: 4.5,
        damageType: 'magical',
        targeting: 'single',
        isTelegraphed: true,
        telegraphMessage: ' Malachar raises his plague staff — a deadly spore cloud condenses! ⚠️ *DEFEND NOW!*',
        effects: [{ type: 'drain', value: 50 }]
    },
    outbreak: {
        name: 'Outbreak',
        damage: 3.5,
        damageType: 'magical',
        targeting: 'aoe',
        channelTime: 4,
        effects: [
            { type: 'infect', duration: 3 },
            { type: 'poison', duration: 3 },
            { type: 'weaken', duration: 3 }
        ]
    },

    // ── CORRUPTED OVERLORD (was: Demon Lord) Abilities ──
    mutation_slash: {
        name: 'Mutation Slash',
        damage: 2.0,
        targeting: 'single',
        effects: [{ type: 'infect', chance: 50, duration: 2 }]
    },
    blight_pulse: {
        name: 'Blight Pulse',
        damage: 1.8,
        damageType: 'magical',
        targeting: 'aoe',
        effects: [{ type: 'dot', element: 'blight', value: 10, duration: 3 }]
    },
    corruption_wave: {
        name: 'Corruption Wave',
        damage: 2.5,
        damageType: 'magical',
        targeting: 'aoe',
        effects: [{ type: 'debuff', stat: 'def', value: 20, duration: 2 }]
    },

    // ── Dragon Abilities (unchanged) ──
    dragon_claw: {
        name: 'Draconic Claw',
        damage: 2.5,
        targeting: 'single',
        effects: [{ type: 'bleed', chance: 50, duration: 3 }]
    },
    fire_breath: {
        name: 'Ancient Fire Breath',
        damage: 3.0,
        damageType: 'magical',
        targeting: 'aoe',
        effects: [{ type: 'burn', chance: 80, duration: 2 }]
    },
    wing_buffet: {
        name: 'Wing Buffet',
        damage: 1.5,
        targeting: 'aoe',
        effects: [{ type: 'stun', chance: 30, duration: 1 }]
    },
    meteor_strike: {
        name: 'Draconic Meteor',
        damage: 5.0,
        damageType: 'magical',
        targeting: 'single',
        isTelegraphed: true,
        telegraphMessage: ' Igneel calls upon the heavens... a massive fire rock descends! ⚠️ *DEFEND NOW!*'
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
        // Hard enrage: instant kill / wipe effect past the turn limit.
        // If a boss has `enrageTimer` set but no `hardEnrage` effect, fall
        // back to a generic enrage message so the turn doesn't end with null.
        if (this.boss.hardEnrage) {
            return {
                type: 'hard_enrage',
                effect: this.boss.hardEnrage.effect,
                message: this.boss.hardEnrage.message
            };
        }
        return {
            type: 'hard_enrage',
            effect: 'instant_wipe',
            message: `⚠️ *ENRAGE TIMER EXPIRED!* ${this.boss.name || 'The boss'} unleashes their full fury!`
        };
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
        const results = [];
        // AI for summoned units
        this.summons.forEach(summon => {
            if (summon.stats.hp > 0) {
                // Simple AI: attack random target
                const aliveParty = this.party.filter(p => !p.isDead && (p.currentHP || p.stats.hp) > 0);
                if (aliveParty.length === 0) return;

                const target = aliveParty[Math.floor(Math.random() * aliveParty.length)];
                const damage = Math.floor((summon.stats.atk || 10) * (0.8 + Math.random() * 0.4));
                
                // Note: Damage application handled by the main engine to ensure consistent logic
                results.push({
                    attacker: summon.name,
                    target: target.name,
                    targetJid: target.jid,
                    damage: damage,
                    animation: summon.icon || '⚔️'
                });
            }
        });
        return results;
    }
    
    selectBossAction() {
        const phase = this.boss.phases[this.phaseManager.currentPhaseIndex];
        const abilities = phase.abilities || [];
        if (abilities.length === 0) {
            return { type: 'boss_action', ability: null, data: null };
        }

        // Select ability weighted by priority (if declared on the ability
        // entry). Ability entries can be either a string (uniform weight) or
        // an object `{ id, priority }`. Higher priority = more frequent.
        // Previously the comment claimed "weighted by priority" but the code
        // did uniform random — that's now fixed.
        const expanded = [];
        for (const ability of abilities) {
            if (typeof ability === 'string') {
                expanded.push(ability);
            } else if (ability && typeof ability === 'object') {
                const weight = Math.max(1, ability.priority || 1);
                for (let i = 0; i < weight; i++) expanded.push(ability.id || ability.name);
            }
        }
        const chosen = expanded[Math.floor(Math.random() * expanded.length)];

        return {
            type: 'boss_action',
            ability: chosen,
            data: BOSS_ABILITIES[chosen]
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

// Boss registry — maps boss ID strings used in DUNGEON_RANKS to the boss data objects
const BOSS_REGISTRY = {
    HIVE_COMMANDER:      HIVE_COMMANDER_BOSS,
    PLAGUE_PRIEST:       PLAGUE_PRIEST_BOSS,
    CORRUPTED_OVERLORD:  CORRUPTED_OVERLORD_BOSS,
    void_corrupted:      VOID_CORRUPTED_BOSS,
    primordial_chaos:    PRIMORDIAL_CHAOS_BOSS,
    ancient_dragon_boss: ANCIENT_DRAGON_BOSS,
};

module.exports = {
    // Retextured legacy bosses (infection/mutation theme)
    HIVE_COMMANDER_BOSS,
    PLAGUE_PRIEST_BOSS,
    CORRUPTED_OVERLORD_BOSS,
    VOID_CORRUPTED_BOSS,
    // Active dungeon bosses
    PRIMORDIAL_CHAOS_BOSS,
    ANCIENT_DRAGON_BOSS,
    // Lookups
    BOSS_REGISTRY,
    BOSS_ABILITIES,
    BossPhaseManager,
    BossFightManager,
    
    // Helper — look up by registry key or fall back to Hive Commander
    getBossById: (id) => BOSS_REGISTRY[id] || HIVE_COMMANDER_BOSS,

    // Helper function to get boss by act (updated to new IDs)
    getBossForAct: (act) => {
        const bossMap = {
            1: HIVE_COMMANDER_BOSS,
            2: PLAGUE_PRIEST_BOSS,
            3: CORRUPTED_OVERLORD_BOSS,
            4: VOID_CORRUPTED_BOSS,
            5: PRIMORDIAL_CHAOS_BOSS
        };
        return bossMap[act] || HIVE_COMMANDER_BOSS;
    }
};
