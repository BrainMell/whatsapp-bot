// ============================================
// 🌳 SKILL TREE SYSTEM - Complete Ability Trees
// ============================================

// Each class has a skill tree with multiple tiers
// Players earn skill points from leveling up
// Can unlock and upgrade abilities

// ==========================================
// 🌟 STARTER CLASS SKILL TREES (4)
// ==========================================

const SKILL_TREES = {
    // ==========================================
    // ⚔️ FIGHTER SKILL TREE
    // ==========================================
    FIGHTER: {
        name: 'Fighter',
        icon: '⚔️',
        skillPointsPerLevel: 1,
        trees: {
            OFFENSE: {
                name: 'Offensive Stance',
                icon: '⚔️',
                color: '🔴',
                skills: {
                    slash: {
                        id: 'slash',
                        name: 'Power Slash',
                        tier: 1,
                        maxLevel: 5,
                        cost: 10,
                        cooldown: 1,
                        desc: 'A powerful sword strike',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.2 + (level * 0.1),
                            damageType: 'physical',
                            animation: '⚔️💥'
                        })
                    },
                    cleave: {
                        id: 'cleave',
                        name: 'Cleave',
                        tier: 2,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 2,
                        desc: 'Strike multiple enemies',
                        requires: { slash: 3 },
                        effect: (level) => ({
                            type: 'aoe',
                            multiplier: 1.0 + (level * 0.15),
                            targets: Math.min(2 + Math.floor(level / 2), 4),
                            damageType: 'physical',
                            animation: '⚔️🌀'
                        })
                    },
                    execute: {
                        id: 'execute',
                        name: 'Execute',
                        tier: 3,
                        maxLevel: 3,
                        cost: 25,
                        cooldown: 5,
                        desc: 'Finish off low HP enemies',
                        requires: { cleave: 3 },
                        effect: (level) => ({
                            type: 'execute',
                            multiplier: 2.0 + (level * 0.5),
                            threshold: 30 + (level * 5), // Execute under 30-45% HP
                            damageType: 'physical',
                            animation: '⚔️💀'
                        })
                    }
                }
            },
            DEFENSE: {
                name: 'Defensive Stance',
                icon: '🛡️',
                color: '🔵',
                skills: {
                    guard: {
                        id: 'guard',
                        name: 'Guard',
                        tier: 1,
                        maxLevel: 5,
                        cost: 8,
                        cooldown: 2,
                        desc: 'Raise shield to block damage',
                        requires: null,
                        effect: (level) => ({
                            type: 'buff_self',
                            buffType: 'defense',
                            value: 15 + (level * 5),
                            duration: 2,
                            animation: '🛡️✨'
                        })
                    },
                    shield_bash: {
                        id: 'shield_bash',
                        name: 'Shield Bash',
                        tier: 2,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 3,
                        desc: 'Bash with shield, chance to stun',
                        requires: { guard: 3 },
                        effect: (level) => ({
                            type: 'damage_cc',
                            multiplier: 1.0 + (level * 0.1),
                            cc: 'stun',
                            ccChance: 20 + (level * 10), // 30-70% stun
                            ccDuration: 1,
                            damageType: 'physical',
                            animation: '🛡️💫'
                        })
                    },
                    iron_wall: {
                        id: 'iron_wall',
                        name: 'Iron Wall',
                        tier: 3,
                        maxLevel: 3,
                        cost: 20,
                        cooldown: 6,
                        desc: 'Become nearly invincible',
                        requires: { shield_bash: 3 },
                        effect: (level) => ({
                            type: 'buff_self',
                            buffType: 'damage_reduction',
                            value: 50 + (level * 10), // 60-80% reduction
                            duration: 2 + level,
                            animation: '🛡️🔷'
                        })
                    }
                }
            },
            COMBAT_MASTERY: {
                name: 'Combat Mastery',
                icon: '⚡',
                color: '🟡',
                skills: {
                    rally: {
                        id: 'rally',
                        name: 'Battle Cry',
                        tier: 1,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 4,
                        desc: 'Inspire allies with a war cry',
                        requires: null,
                        effect: (level) => ({
                            type: 'buff_team',
                            buffType: 'attack',
                            value: 10 + (level * 3),
                            duration: 3,
                            animation: '⚡🗣️'
                        })
                    },
                    war_stomp: {
                        id: 'war_stomp',
                        name: 'War Stomp',
                        tier: 2,
                        maxLevel: 5,
                        cost: 18,
                        cooldown: 5,
                        desc: 'Stomp the ground, damaging all enemies',
                        requires: { rally: 3 },
                        effect: (level) => ({
                            type: 'aoe',
                            multiplier: 0.8 + (level * 0.1),
                            targets: 99, // All enemies
                            cc: 'slow',
                            ccChance: 50,
                            ccDuration: 2,
                            damageType: 'physical',
                            animation: '⚡🦶'
                        })
                    },
                    warriors_resolve: {
                        id: 'warriors_resolve',
                        name: "Warrior's Resolve",
                        tier: 3,
                        maxLevel: 3,
                        cost: 0, // Passive
                        cooldown: 0,
                        desc: 'Passive: Gain bonus damage when below 50% HP',
                        requires: { war_stomp: 3 },
                        effect: (level) => ({
                            type: 'passive',
                            trigger: 'low_hp',
                            threshold: 50,
                            buffType: 'attack',
                            value: 15 + (level * 10), // 25-45% bonus
                            animation: '⚡💪'
                        })
                    }
                }
            }
        }
    },

    // ==========================================
    // 🗡️ SCOUT SKILL TREE
    // ==========================================
    SCOUT: {
        name: 'Scout',
        icon: '🗡️',
        skillPointsPerLevel: 1,
        trees: {
            ASSASSINATION: {
                name: 'Assassination',
                icon: '🗡️',
                color: '🔴',
                skills: {
                    quick_strike: {
                        id: 'quick_strike',
                        name: 'Quick Strike',
                        tier: 1,
                        maxLevel: 5,
                        cost: 8,
                        cooldown: 1,
                        desc: 'Fast attack with high crit chance',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.0 + (level * 0.1),
                            critBonus: 15 + (level * 5), // +20-40% crit
                            damageType: 'physical',
                            animation: '🗡️⚡'
                        })
                    },
                    backstab: {
                        id: 'backstab',
                        name: 'Backstab',
                        tier: 2,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 2,
                        desc: 'Massive damage from behind',
                        requires: { quick_strike: 3 },
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.8 + (level * 0.3),
                            critBonus: 30 + (level * 10),
                            damageType: 'physical',
                            animation: '🗡️💀'
                        })
                    },
                    assassinate: {
                        id: 'assassinate',
                        name: 'Assassinate',
                        tier: 3,
                        maxLevel: 3,
                        cost: 35,
                        cooldown: 7,
                        desc: 'Instantly kill low HP enemies',
                        requires: { backstab: 3 },
                        effect: (level) => ({
                            type: 'execute',
                            multiplier: 3.0 + (level * 1.0),
                            threshold: 15 + (level * 5), // Under 20-30% HP
                            guaranteedCrit: true,
                            damageType: 'physical',
                            animation: '🗡️⚫'
                        })
                    }
                }
            },
            EVASION: {
                name: 'Evasion',
                icon: '💨',
                color: '🔵',
                skills: {
                    evade: {
                        id: 'evade',
                        name: 'Evasive Maneuver',
                        tier: 1,
                        maxLevel: 5,
                        cost: 10,
                        cooldown: 2,
                        desc: 'Dodge the next attack',
                        requires: null,
                        effect: (level) => ({
                            type: 'buff_self',
                            buffType: 'evasion',
                            value: 40 + (level * 10), // 50-90% dodge
                            duration: 1,
                            animation: '💨✨'
                        })
                    },
                    smoke_bomb: {
                        id: 'smoke_bomb',
                        name: 'Smoke Bomb',
                        tier: 2,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 3,
                        desc: 'Blind enemies, increasing your evasion',
                        requires: { evade: 3 },
                        effect: (level) => ({
                            type: 'debuff_enemies',
                            debuffType: 'blind',
                            value: 30 + (level * 5), // 35-55% miss chance
                            duration: 2,
                            animation: '💨🌫️'
                        })
                    },
                    shadow_step: {
                        id: 'shadow_step',
                        name: 'Shadow Step',
                        tier: 3,
                        maxLevel: 3,
                        cost: 20,
                        cooldown: 4,
                        desc: 'Teleport behind enemy and strike',
                        requires: { smoke_bomb: 3 },
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.5 + (level * 0.5),
                            guaranteed: true, // Always hits
                            critBonus: 50,
                            damageType: 'physical',
                            animation: '💨🌀'
                        })
                    }
                }
            },
            PRECISION: {
                name: 'Precision',
                icon: '🎯',
                color: '🟡',
                skills: {
                    vital_strike: {
                        id: 'vital_strike',
                        name: 'Vital Strike',
                        tier: 1,
                        maxLevel: 5,
                        cost: 10,
                        cooldown: 2,
                        desc: 'Aim for weak points',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.3 + (level * 0.15),
                            ignoreDefense: 20 + (level * 5), // Ignore 25-45% def
                            damageType: 'physical',
                            animation: '🎯💥'
                        })
                    },
                    marked_for_death: {
                        id: 'marked_for_death',
                        name: 'Marked for Death',
                        tier: 2,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 4,
                        desc: 'Mark enemy, increasing damage taken',
                        requires: { vital_strike: 3 },
                        effect: (level) => ({
                            type: 'debuff_target',
                            debuffType: 'vulnerability',
                            value: 15 + (level * 5), // +20-40% damage taken
                            duration: 3,
                            animation: '🎯☠️'
                        })
                    },
                    deadly_precision: {
                        id: 'deadly_precision',
                        name: 'Deadly Precision',
                        tier: 3,
                        maxLevel: 3,
                        cost: 0, // Passive
                        cooldown: 0,
                        desc: 'Passive: Critical hits deal 50% more damage',
                        requires: { marked_for_death: 3 },
                        effect: (level) => ({
                            type: 'passive',
                            trigger: 'crit',
                            critMultiplier: 1.3 + (level * 0.2), // 1.5x-1.9x
                            animation: '🎯✨'
                        })
                    }
                }
            }
        }
    },

    // ==========================================
    // 🔮 APPRENTICE SKILL TREE
    // ==========================================
    APPRENTICE: {
        name: 'Apprentice',
        icon: '🔮',
        skillPointsPerLevel: 1,
        trees: {
            FIRE_MAGIC: {
                name: 'Pyromancy',
                icon: '🔥',
                color: '🔴',
                skills: {
                    fire_bolt: {
                        id: 'fire_bolt',
                        name: 'Fire Bolt',
                        tier: 1,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 1,
                        desc: 'Hurl a bolt of fire',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.3 + (level * 0.15),
                            damageType: 'magic',
                            element: 'fire',
                            animation: '🔥💥'
                        })
                    },
                    fireball: {
                        id: 'fireball',
                        name: 'Fireball',
                        tier: 2,
                        maxLevel: 5,
                        cost: 18,
                        cooldown: 2,
                        desc: 'Explosive fireball with burn',
                        requires: { fire_bolt: 3 },
                        effect: (level) => ({
                            type: 'damage_dot',
                            multiplier: 1.5 + (level * 0.2),
                            dot: 'burn',
                            dotDamage: 10 + (level * 5),
                            dotDuration: 3,
                            damageType: 'magic',
                            element: 'fire',
                            animation: '🔥🌐'
                        })
                    },
                    meteor: {
                        id: 'meteor',
                        name: 'Meteor Strike',
                        tier: 3,
                        maxLevel: 3,
                        cost: 35,
                        cooldown: 6,
                        desc: 'Call down a meteor',
                        requires: { fireball: 3 },
                        effect: (level) => ({
                            type: 'aoe',
                            multiplier: 2.5 + (level * 0.5),
                            targets: 99,
                            dot: 'burn',
                            dotDamage: 15 + (level * 10),
                            dotDuration: 4,
                            damageType: 'magic',
                            element: 'fire',
                            animation: '🔥☄️'
                        })
                    }
                }
            },
            ICE_MAGIC: {
                name: 'Cryomancy',
                icon: '❄️',
                color: '🔵',
                skills: {
                    frost_bolt: {
                        id: 'frost_bolt',
                        name: 'Frost Bolt',
                        tier: 1,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 1,
                        desc: 'Icy projectile that slows',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage_cc',
                            multiplier: 1.1 + (level * 0.1),
                            cc: 'slow',
                            ccChance: 60 + (level * 8),
                            ccDuration: 2,
                            damageType: 'magic',
                            element: 'ice',
                            animation: '❄️💎'
                        })
                    },
                    ice_shard: {
                        id: 'ice_shard',
                        name: 'Ice Shard',
                        tier: 2,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 2,
                        desc: 'Sharp ice with chance to freeze',
                        requires: { frost_bolt: 3 },
                        effect: (level) => ({
                            type: 'damage_cc',
                            multiplier: 1.4 + (level * 0.2),
                            cc: 'freeze',
                            ccChance: 25 + (level * 5), // 30-50% freeze
                            ccDuration: 1,
                            damageType: 'magic',
                            element: 'ice',
                            animation: '❄️🔷'
                        })
                    },
                    blizzard: {
                        id: 'blizzard',
                        name: 'Blizzard',
                        tier: 3,
                        maxLevel: 3,
                        cost: 30,
                        cooldown: 6,
                        desc: 'Freezing storm hits all enemies',
                        requires: { ice_shard: 3 },
                        effect: (level) => ({
                            type: 'aoe',
                            multiplier: 1.8 + (level * 0.4),
                            targets: 99,
                            cc: 'freeze',
                            ccChance: 50 + (level * 10),
                            ccDuration: 2,
                            damageType: 'magic',
                            element: 'ice',
                            animation: '❄️🌨️'
                        })
                    }
                }
            },
            ARCANE_MAGIC: {
                name: 'Arcane Arts',
                icon: '✨',
                color: '🟣',
                skills: {
                    mana_shield: {
                        id: 'mana_shield',
                        name: 'Mana Shield',
                        tier: 1,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 3,
                        desc: 'Shield that absorbs damage',
                        requires: null,
                        effect: (level) => ({
                            type: 'buff_self',
                            buffType: 'shield',
                            value: 30 + (level * 10), // 40-80 shield
                            duration: 3,
                            animation: '✨🛡️'
                        })
                    },
                    arcane_missiles: {
                        id: 'arcane_missiles',
                        name: 'Arcane Missiles',
                        tier: 2,
                        maxLevel: 5,
                        cost: 20,
                        cooldown: 2,
                        desc: 'Multiple magic missiles',
                        requires: { mana_shield: 3 },
                        effect: (level) => ({
                            type: 'multi_hit',
                            multiplier: 0.6 + (level * 0.1),
                            hits: 3 + Math.floor(level / 2), // 3-5 hits
                            damageType: 'magic',
                            element: 'arcane',
                            animation: '✨🎆'
                        })
                    },
                    time_warp: {
                        id: 'time_warp',
                        name: 'Time Warp',
                        tier: 3,
                        maxLevel: 3,
                        cost: 25,
                        cooldown: 8,
                        desc: 'Slow time, team gets extra turns',
                        requires: { arcane_missiles: 3 },
                        effect: (level) => ({
                            type: 'buff_team',
                            buffType: 'speed',
                            value: 40 + (level * 20), // +60-100% speed
                            duration: 2 + level,
                            animation: '✨⏰'
                        })
                    }
                }
            }
        }
    },

    // ==========================================
    // ✨ ACOLYTE SKILL TREE
    // ==========================================
    ACOLYTE: {
        name: 'Acolyte',
        icon: '✨',
        skillPointsPerLevel: 1,
        trees: {
            HOLY_MAGIC: {
                name: 'Divine Power',
                icon: '✨',
                color: '🟡',
                skills: {
                    smite: {
                        id: 'smite',
                        name: 'Holy Smite',
                        tier: 1,
                        maxLevel: 5,
                        cost: 10,
                        cooldown: 1,
                        desc: 'Strike with holy power',
                        requires: null,
                        effect: (level) => ({
                            type: 'damage',
                            multiplier: 1.2 + (level * 0.15),
                            damageType: 'magic',
                            element: 'holy',
                            animation: '✨⚡'
                        })
                    },
                    holy_fire: {
                        id: 'holy_fire',
                        name: 'Holy Fire',
                        tier: 2,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 2,
                        desc: 'Divine flames that heal allies',
                        requires: { smite: 3 },
                        effect: (level) => ({
                            type: 'damage_heal',
                            multiplier: 1.4 + (level * 0.2),
                            healPercent: 20 + (level * 5), // Heal 25-45% of damage
                            damageType: 'magic',
                            element: 'holy',
                            animation: '✨🔥'
                        })
                    },
                    divine_judgment: {
                        id: 'divine_judgment',
                        name: 'Divine Judgment',
                        tier: 3,
                        maxLevel: 3,
                        cost: 30,
                        cooldown: 6,
                        desc: 'Massive holy damage, stuns undead',
                        requires: { holy_fire: 3 },
                        effect: (level) => ({
                            type: 'damage_cc',
                            multiplier: 2.5 + (level * 0.5),
                            cc: 'stun',
                            ccChance: 100, // Always stuns undead
                            ccDuration: 2,
                            damageType: 'magic',
                            element: 'holy',
                            bonusVsUndead: 100, // +100% vs undead
                            animation: '✨⚡💫'
                        })
                    }
                }
            },
            HEALING: {
                name: 'Restoration',
                icon: '💚',
                color: '🟢',
                skills: {
                    heal: {
                        id: 'heal',
                        name: 'Heal',
                        tier: 1,
                        maxLevel: 5,
                        cost: 15,
                        cooldown: 2,
                        desc: 'Restore ally HP',
                        requires: null,
                        effect: (level) => ({
                            type: 'heal',
                            value: 40 + (level * 10), // 50-90 HP
                            animation: '💚✨'
                        })
                    },
                    group_heal: {
                        id: 'group_heal',
                        name: 'Group Heal',
                        tier: 2,
                        maxLevel: 5,
                        cost: 25,
                        cooldown: 4,
                        desc: 'Heal all allies',
                        requires: { heal: 3 },
                        effect: (level) => ({
                            type: 'heal_team',
                            value: 30 + (level * 8), // 38-62 HP to all
                            animation: '💚🌟'
                        })
                    },
                    resurrection: {
                        id: 'resurrection',
                        name: 'Resurrection',
                        tier: 3,
                        maxLevel: 3,
                        cost: 40,
                        cooldown: 10,
                        desc: 'Revive fallen ally',
                        requires: { group_heal: 3 },
                        effect: (level) => ({
                            type: 'revive',
                            hpPercent: 30 + (level * 10), // 40-60% HP
                            animation: '💚👼'
                        })
                    }
                }
            },
            PROTECTION: {
                name: 'Guardian',
                icon: '🛡️',
                color: '🔵',
                skills: {
                    blessing: {
                        id: 'blessing',
                        name: 'Blessing',
                        tier: 1,
                        maxLevel: 5,
                        cost: 12,
                        cooldown: 3,
                        desc: 'Bless ally with protection',
                        requires: null,
                        effect: (level) => ({
                            type: 'buff_target',
                            buffType: 'defense',
                            value: 15 + (level * 5), // +20-40 def
                            duration: 3,
                            animation: '🛡️✨'
                        })
                    },
                    divine_shield: {
                        id: 'divine_shield',
                        name: 'Divine Shield',
                        tier: 2,
                        maxLevel: 5,
                        cost: 20,
                        cooldown: 5,
                        desc: 'Protect team with holy barrier',
                        requires: { blessing: 3 },
                        effect: (level) => ({
                            type: 'buff_team',
                            buffType: 'damage_reduction',
                            value: 20 + (level * 5), // 25-45% reduction
                            duration: 2,
                            animation: '🛡️💫'
                        })
                    },
                    martyrdom: {
                        id: 'martyrdom',
                        name: 'Martyrdom',
                        tier: 3,
                        maxLevel: 3,
                        cost: 0, // Passive
                        cooldown: 60,
                        desc: 'Passive: Survive fatal damage once per battle',
                        requires: { divine_shield: 3 },
                        effect: (level) => ({
                            type: 'passive',
                            trigger: 'death',
                            surviveHp: 1,
                            cooldown: 60 - (level * 10), // Can trigger every 40-50s
                            animation: '🛡️👼'
                        })
                    }
                }
            }
        }
    },

    // ==========================================
    // ⚔️ WARRIOR (Evolved)
    // ==========================================
    WARRIOR: {
        name: 'Warrior',
        icon: '⚔️',
        skillPointsPerLevel: 2,
        trees: {
            COMBAT: {
                name: 'Warrior Combat',
                icon: '⚔️',
                skills: {
                    shield_bash: {
                        id: 'shield_bash',
                        name: 'Shield Bash',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 2,
                        damageMultiplier: [1.2, 1.35, 1.5, 1.65, 1.8],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: { stun: { chance: [30, 35, 40, 45, 50], duration: 1 } },
                        description: 'Bash enemy with shield, scaling stun chance',
                        animation: '🛡️💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    defensive_stance: {
                        id: 'defensive_stance',
                        name: 'Defensive Stance',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [10, 9, 8, 7, 6],
                        cooldown: 3,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [50, 60, 70, 80, 100], duration: 2 },
                            defBuff: { value: [25, 30, 35, 40, 50], duration: 2 }
                        },
                        description: 'Increase defense and gain shield',
                        animation: '🛡️✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    cleave: {
                        id: 'cleave',
                        name: 'Cleave',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['shield_bash'],
                        energyCost: [20, 19, 18, 16, 15],
                        cooldown: 3,
                        damageMultiplier: [1.4, 1.55, 1.7, 1.85, 2.0],
                        damageType: 'PHYSICAL',
                        targeting: 'CLEAVE',
                        description: 'Strike 2 enemies at once',
                        animation: '⚔️⚔️',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    battle_cry: {
                        id: 'battle_cry',
                        name: 'Battle Cry',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['defensive_stance'],
                        energyCost: [25, 24, 22, 20, 18],
                        cooldown: 4,
                        targeting: 'TEAM',
                        effects: {
                            atkBuff: { value: [20, 25, 30, 35, 40], duration: 3 },
                            defBuff: { value: [10, 12, 15, 18, 20], duration: 3 }
                        },
                        description: 'Rally team, boost ATK and DEF',
                        animation: '📢✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    whirlwind: {
                        id: 'whirlwind',
                        name: 'Whirlwind',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['cleave'],
                        energyCost: [35, 33, 30, 28, 25],
                        cooldown: 4,
                        damageMultiplier: [1.1, 1.25, 1.4, 1.55, 1.7],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE_LARGE',
                        effects: { bleed: { chance: [40, 50, 60, 70, 80], duration: 3, value: [15, 18, 21, 24, 28] } },
                        description: 'Spin attack hitting all enemies with bleed',
                        animation: '🌪️⚔️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    iron_will: {
                        id: 'iron_will',
                        name: 'Iron Will',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['battle_cry'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            defBuff: { value: [50, 60, 70, 80, 100], duration: 2 },
                            immunity: { status: ['stun', 'freeze'], duration: 2 },
                            taunt: { duration: 2 }
                        },
                        description: 'Become unstoppable, taunt all enemies',
                        animation: '💪🛡️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    execute: {
                        id: 'execute',
                        name: 'Execute',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        prerequisite: ['whirlwind'],
                        energyCost: [50, 45, 40],
                        cooldown: 6,
                        damageMultiplier: [2.5, 3.0, 3.5],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: { instantKill: { threshold: [30, 35, 40] } },
                        description: 'Massive damage, instant kill if target below threshold HP',
                        animation: '⚔️💀',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    ROGUE: {
        name: 'Rogue',
        icon: '🗡️',
        skillPointsPerLevel: 2,
        trees: {
            ASSASSINATION: {
                name: 'Assassination',
                icon: '🗡️',
                skills: {
                    backstab: {
                        id: 'backstab',
                        name: 'Backstab',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 2,
                        damageMultiplier: [2.2, 2.4, 2.6, 2.8, 3.0],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: { critBonus: { value: [50, 60, 70, 80, 100] } },
                        description: 'High crit damage from behind',
                        animation: '🗡️💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    smoke_bomb: {
                        id: 'smoke_bomb',
                        name: 'Smoke Bomb',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 16, 15],
                        cooldown: 3,
                        damageMultiplier: [0.5, 0.6, 0.7, 0.8, 0.9],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE_SMALL',
                        effects: { blind: { chance: [70, 75, 80, 85, 90], duration: 2 } },
                        description: 'Blind enemies and evade next attack',
                        animation: '💨😵',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    shadow_step: {
                        id: 'shadow_step',
                        name: 'Shadow Step',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['backstab'],
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.3, 1.45, 1.6, 1.75, 1.9],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: { spdBuff: { value: [30, 35, 40, 45, 50], duration: 2 } },
                        description: 'Teleport strike with evasion',
                        animation: '👤💨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    blade_flurry: {
                        id: 'blade_flurry',
                        name: 'Blade Flurry',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['smoke_bomb'],
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        damageMultiplier: [0.9, 1.0, 1.1, 1.2, 1.3],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        multiHit: 4,
                        effects: { bleed: { chance: [60, 65, 70, 75, 80], duration: 3, value: [12, 14, 16, 18, 20] } },
                        description: '4 rapid strikes causing bleed',
                        animation: '🗡️🗡️🗡️🗡️',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    vanish: {
                        id: 'vanish',
                        name: 'Vanish',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['shadow_step'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            stealth: { duration: 2 },
                            critBuff: { value: 100, duration: 1 },
                            dodgeAll: { duration: 1 }
                        },
                        description: 'Turn invisible, guaranteed crit on next hit',
                        animation: '👻✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    assassinate: {
                        id: 'assassinate',
                        name: 'Assassinate',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        prerequisite: ['shadow_step'],
                        energyCost: [60, 55, 50],
                        cooldown: 7,
                        damageMultiplier: [4.5, 5.0, 5.5],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        effects: { instantKill: { threshold: [20, 25, 30] } },
                        description: 'Lethal strike from shadows',
                        animation: '🗡️💀🌑',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    MAGE: {
        name: 'Mage',
        icon: '🔮',
        skillPointsPerLevel: 2,
        trees: {
            ARCANE: {
                name: 'Arcane Arts',
                icon: '🔮',
                skills: {
                    fireball: {
                        id: 'fireball',
                        name: 'Fireball',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.8], // Buffed from 3.0-4.2
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { burn: { chance: [75, 80, 85, 90, 100], duration: 3, value: [30, 35, 40, 45, 60] } },
                        description: 'Launch blazing fireball',
                        animation: '🔥💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    frost_bolt: {
                        id: 'frost_bolt',
                        name: 'Frost Bolt',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [2.8, 3.1, 3.4, 3.7, 4.1], // Buffed from 2.5-3.4
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { freeze: { chance: [55, 60, 65, 70, 85], duration: 1 } },
                        description: 'Freeze enemy in their tracks',
                        animation: '❄️💎',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    lightning_bolt: {
                        id: 'lightning_bolt',
                        name: 'Lightning Bolt',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['fireball'],
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 3,
                        damageMultiplier: [4.2, 4.6, 5.0, 5.4, 6.0], // Buffed from 3.5-4.8
                        damageType: 'MAGICAL',
                        targeting: 'CHAIN',
                        chainTargets: 3,
                        effects: { shock: { duration: 2, value: [20, 25, 30, 35, 45] } },
                        description: 'Chain lightning between enemies',
                        animation: '⚡🔗',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    arcane_missiles: {
                        id: 'arcane_missiles',
                        name: 'Arcane Missiles',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['frost_bolt'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 3,
                        damageMultiplier: [1.5, 1.7, 1.9, 2.1, 2.4], // 5 hits total
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        multiHit: 5,
                        description: '5 homing arcane missiles',
                        animation: '🔮✨✨✨✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    blizzard: {
                        id: 'blizzard',
                        name: 'Blizzard',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['frost_bolt'],
                        energyCost: [40, 38, 35, 32, 30],
                        cooldown: 5,
                        damageMultiplier: [2.0, 2.2, 2.4, 2.6, 3.0], // Buffed from 1.4-2.0
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: { freeze: { chance: [60, 65, 70, 75, 90], duration: 1 } },
                        description: 'Freeze all enemies',
                        animation: '❄️🌨️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    meteor: {
                        id: 'meteor',
                        name: 'Meteor',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        prerequisite: ['blizzard'],
                        energyCost: [70, 65, 60],
                        cooldown: 6,
                        damageMultiplier: [5.5, 6.5, 8.0], // Massive Ultimate Buff
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            burn: { chance: [90, 95, 100], duration: 4, value: [40, 50, 75] },
                            stun: { chance: [50, 60, 75], duration: 1 }
                        },
                        description: 'Rain destruction from the sky',
                        animation: '☄️💥💥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    },
                    arcane_shield: {
                        id: 'arcane_shield',
                        name: 'Arcane Shield',
                        tier: 1,
                        requiredLevel: 2,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: { 
                            shield: { value: [60, 80, 100, 120, 150], duration: 3 },
                            magBuff: { value: [10, 12, 15, 18, 20], duration: 3 }
                        },
                        description: 'Protective barrier that also boosts Magic Power',
                        animation: '🔮🛡️✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    mana_drain: {
                        id: 'mana_drain',
                        name: 'Mana Drain',
                        tier: 2,
                        requiredLevel: 4,
                        maxLevel: 5,
                        prerequisite: ['arcane_missiles'],
                        energyCost: [10, 8, 6, 4, 2],
                        cooldown: 3,
                        damageMultiplier: [1.1, 1.25, 1.4, 1.55, 1.7],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { 
                            energyRestore: { value: [15, 20, 25, 30, 40] },
                            magDebuff: { value: [10, 15, 20, 25, 30], duration: 2 }
                        },
                        description: 'Siphon energy from an enemy to restore your own',
                        animation: '🔮🌀💧',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    prismatic_burst: {
                        id: 'prismatic_burst',
                        name: 'Prismatic Burst',
                        tier: 2,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['fireball'],
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 3,
                        damageMultiplier: [2.2, 2.4, 2.6, 2.8, 3.0],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { 
                            randomDebuff: { duration: 2, types: ['burn', 'freeze', 'shock', 'poison'] } 
                        },
                        description: 'Unleash a burst of unstable elemental energy',
                        animation: '🌈💥✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    mirror_image: {
                        id: 'mirror_image',
                        name: 'Mirror Image',
                        tier: 3,
                        requiredLevel: 7,
                        maxLevel: 5,
                        prerequisite: ['arcane_shield'],
                        energyCost: [40, 36, 32, 28, 24],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: { 
                            evasion: { value: [50, 60, 70, 80, 100], duration: 2 },
                            critBuff: { value: [20, 25, 30, 35, 40], duration: 2 }
                        },
                        description: 'Create illusions to dodge attacks and find openings',
                        animation: '🔮👥✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    gravity_well: {
                        id: 'gravity_well',
                        name: 'Gravity Well',
                        tier: 3,
                        requiredLevel: 9,
                        maxLevel: 5,
                        prerequisite: ['blizzard'],
                        energyCost: [50, 46, 42, 38, 35],
                        cooldown: 4,
                        damageMultiplier: [1.8, 2.0, 2.2, 2.4, 2.6],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: { 
                            slow: { value: [40, 50, 60, 70, 80], duration: 2 },
                            stun: { chance: [20, 25, 30, 35, 40], duration: 1 }
                        },
                        description: 'Crush enemies with intense gravitational force',
                        animation: '🌑🌀💥',
                        skillPointCost: [3, 4, 5, 6, 7]
                    }
                }
            }
        }
    },

    BERSERKER: {
        name: 'Berserker',
        icon: '🪓',
        skillPointsPerLevel: 2,
        trees: {
            RAGE: {
                name: 'Rage Path',
                icon: '🪓',
                skills: {
                    rage_strike: {
                        id: 'rage_strike',
                        name: 'Rage Strike',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [10, 9, 8, 7, 6],
                        cooldown: 1,
                        damageMultiplier: [1.8, 2.0, 2.2, 2.4, 2.6],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            selfDamage: { value: [8, 7, 6, 5, 4] },
                            rageStack: { value: 1 }
                        },
                        scalesWithMissingHP: true,
                        description: 'Powerful strike, damage self for rage',
                        animation: '🪓💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    blood_frenzy: {
                        id: 'blood_frenzy',
                        name: 'Blood Frenzy',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 3,
                        damageMultiplier: [2.2, 2.4, 2.6, 2.8, 3.0],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            bleedSelf: { value: [10, 9, 8, 7, 6], duration: 3 },
                            lifesteal: { value: [50, 55, 60, 65, 70], duration: 3 }
                        },
                        description: 'Sacrifice HP for massive lifesteal',
                        animation: '🩸⚔️',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    rampage: {
                        id: 'rampage',
                        name: 'Rampage',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['rage_strike'],
                        energyCost: [25, 24, 22, 20, 18],
                        cooldown: 4,
                        damageMultiplier: [1.4, 1.55, 1.7, 1.85, 2.0],
                        damageType: 'PHYSICAL',
                        targeting: 'RANDOM',
                        multiHit: 4,
                        effects: { rageStack: { value: 2 } },
                        description: '4 random strikes gaining rage',
                        animation: '🪓🪓🪓🪓',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    warcry: {
                        id: 'warcry',
                        name: 'Warcry',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['blood_frenzy'],
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            berserk: { duration: 3 },
                            atkBuff: { value: [60, 70, 80, 90, 100], duration: 3 },
                            defDebuff: { value: [30, 25, 20, 15, 10], duration: 3 },
                            immunity: { status: ['fear', 'charm'], duration: 3 }
                        },
                        description: 'Enter berserker rage',
                        animation: '😡🔥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    reckless_assault: {
                        id: 'reckless_assault',
                        name: 'Reckless Assault',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['rampage'],
                        energyCost: [35, 33, 30, 28, 25],
                        cooldown: 5,
                        damageMultiplier: [3.0, 3.3, 3.6, 3.9, 4.2],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            guaranteedCrit: true,
                            selfDamagePercent: { value: [20, 18, 16, 14, 12] },
                            ignoreArmor: { value: [50, 60, 70, 80, 100] }
                        },
                        description: 'Devastating attack damaging self',
                        animation: '⚔️💥💢',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    dimensional_slash: {
                        id: 'dimensional_slash',
                        name: 'Dimensional Slash',
                        tier: 3,
                        requiredLevel: 7,
                        maxLevel: 5,
                        prerequisite: ['warcry'],
                        energyCost: [40, 38, 36, 34, 30],
                        cooldown: 5,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 5.0],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        effects: {
                            vulnerability: { value: [20, 25, 30, 35, 40], duration: 2 },
                            ignoreArmor: { value: 100 }
                        },
                        description: 'Slash through reality, ignoring all armor and weakening the target',
                        animation: '🌌⚔️💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    last_stand: {
                        id: 'last_stand',
                        name: 'Last Stand',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        prerequisite: ['rampage'],
                        energyCost: [50, 45, 40],
                        cooldown: 6,
                        damageMultiplier: [5.0, 5.5, 6.0],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        effects: { atkBuff: { value: [100, 125, 150], duration: 2 } },
                        description: 'Unleash fury based on missing HP',
                        animation: '💀⚔️💥🔥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    PALADIN: {
        name: 'Paladin',
        icon: '🛡️',
        skillPointsPerLevel: 2,
        trees: {
            HOLY: {
                name: 'Holy Path',
                icon: '✨',
                skills: {
                    holy_strike: {
                        id: 'holy_strike',
                        name: 'Holy Strike',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 2,
                        damageMultiplier: [1.4, 1.55, 1.7, 1.85, 2.0],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { healSelf: { value: [15, 18, 21, 24, 28] } },
                        bonusVsUndead: [2.0, 2.2, 2.4, 2.6, 2.8],
                        description: 'Strike with holy power, heal self',
                        animation: '✨⚔️',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    divine_shield: {
                        id: 'divine_shield',
                        name: 'Divine Shield',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [25, 24, 22, 20, 18],
                        cooldown: 4,
                        targeting: 'TEAM',
                        effects: {
                            shield: { value: [40, 48, 56, 64, 72], duration: 2 },
                            statusImmunity: ['curse', 'poison']
                        },
                        description: 'Protect entire team with holy barrier',
                        animation: '🛡️✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    consecration: {
                        id: 'consecration',
                        name: 'Consecration',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['holy_strike'],
                        energyCost: [22, 20, 18, 16, 14],
                        cooldown: 3,
                        damageMultiplier: [1.2, 1.35, 1.5, 1.65, 1.8],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_SMALL',
                        effects: {
                            dot: { element: 'holy', value: [15, 18, 21, 24, 28], duration: 3 },
                            defDebuff: { value: [20, 25, 30, 35, 40], duration: 3 }
                        },
                        bonusVsUndead: [1.8, 2.0, 2.2, 2.4, 2.6],
                        description: 'Holy ground damages evil',
                        animation: '✨🔥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    lay_on_hands: {
                        id: 'lay_on_hands',
                        name: 'Lay on Hands',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['divine_shield'],
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 5,
                        targeting: 'SINGLE_ALLY',
                        effects: {
                            heal: { value: [80, 100, 120, 140, 160] },
                            cleanse: true,
                            defBuff: { value: [30, 35, 40, 45, 50], duration: 2 }
                        },
                        description: 'Powerful healing and cleanse',
                        animation: '🙏💚',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    avenging_wrath: {
                        id: 'avenging_wrath',
                        name: 'Avenging Wrath',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['consecration'],
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            atkBuff: { value: [50, 60, 70, 80, 100], duration: 3 },
                            magBuff: { value: [50, 60, 70, 80, 100], duration: 3 },
                            critBuff: { value: [30, 35, 40, 45, 50], duration: 3 },
                            lifesteal: { value: [30, 35, 40, 45, 50], duration: 3 }
                        },
                        description: 'Channel divine fury',
                        animation: '😇⚔️✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    divine_judgment: {
                        id: 'divine_judgment',
                        name: 'Divine Judgment',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [65, 60, 55],
                        cooldown: 7,
                        damageMultiplier: [3.5, 4.0, 4.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: { stun: { chance: [70, 80, 90], duration: 2 } },
                        bonusVsUndead: [3.0, 3.5, 4.0],
                        description: 'Smite all evil with holy power',
                        animation: '⚡✨💥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    NECROMANCER: {
        name: 'Necromancer',
        icon: '💀',
        skillPointsPerLevel: 2,
        trees: {
            UNDEATH: {
                name: 'Undeath Path',
                icon: '💀',
                skills: {
                    death_bolt: {
                        id: 'death_bolt',
                        name: 'Death Bolt',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.9, 2.1, 2.3, 2.5, 2.7],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { dot: { element: 'shadow', value: [15, 18, 21, 24, 28], duration: 3 } },
                        description: 'Curse enemy with dark magic',
                        animation: '💀⚡',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    drain_life: {
                        id: 'drain_life',
                        name: 'Drain Life',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 2,
                        damageMultiplier: [1.6, 1.75, 1.9, 2.05, 2.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { lifesteal: { value: [60, 65, 70, 75, 80] } },
                        description: 'Steal enemy life force',
                        animation: '🩸💀',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    raise_skeleton: {
                        id: 'raise_skeleton',
                        name: 'Raise Skeleton',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['death_bolt'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'CORPSE',
                        effects: { summon: { unit: 'skeleton', duration: 4, stats: { hp: [80, 100, 120, 140, 160], atk: [15, 20, 25, 30, 35] } } },
                        requiresCorpse: true,
                        description: 'Reanimate fallen as skeleton warrior',
                        animation: '💀⬆️',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    corpse_explosion: {
                        id: 'corpse_explosion',
                        name: 'Corpse Explosion',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['drain_life'],
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 3,
                        damageMultiplier: [2.5, 2.7, 2.9, 3.1, 3.3],
                        damageType: 'MAGICAL',
                        targeting: 'CORPSE_AOE',
                        requiresCorpse: true,
                        description: 'Detonate corpse damaging nearby enemies',
                        animation: '💀💥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    plague: {
                        id: 'plague',
                        name: 'Plague',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['raise_skeleton'],
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 5,
                        damageMultiplier: [1.2, 1.35, 1.5, 1.65, 1.8],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            disease: { duration: 5, value: [20, 25, 30, 35, 40], spreads: true },
                            debuff: { stat: 'all', value: [25, 30, 35, 40, 50], duration: 4 }
                        },
                        description: 'Infectious disease spreading between enemies',
                        animation: '🦠☠️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    army_of_dead: {
                        id: 'army_of_dead',
                        name: 'Army of the Dead',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [75, 70, 65],
                        cooldown: 8,
                        targeting: 'ALL_CORPSES',
                        effects: { summon: { unit: 'skeleton_warrior', count: [3, 4, 5], duration: 5 } },
                        description: 'Raise massive undead army',
                        animation: '💀💀💀⬆️✨',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    CHRONOMANCER: {
        name: 'Chronomancer',
        icon: '⏳',
        skillPointsPerLevel: 2,
        trees: {
            TIME: {
                name: 'Time Path',
                icon: '⏳',
                skills: {
                    time_bolt: {
                        id: 'time_bolt',
                        name: 'Time Bolt',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [16, 15, 14, 13, 12],
                        cooldown: 2,
                        damageMultiplier: [1.7, 1.85, 2.0, 2.15, 2.3],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: { slow: { value: [50, 55, 60, 65, 70], duration: 2 } },
                        description: 'Slow enemy movements',
                        animation: '⏳💫',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    haste: {
                        id: 'haste',
                        name: 'Haste',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'TEAM',
                        effects: {
                            haste: { value: [40, 45, 50, 55, 60], duration: 3 },
                            spdBuff: { value: [35, 40, 45, 50, 60], duration: 3 }
                        },
                        description: 'Accelerate team through time',
                        animation: '⚡⏰',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    time_warp: {
                        id: 'time_warp',
                        name: 'Time Warp',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['haste'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'SINGLE_ALLY',
                        effects: {
                            extraTurn: true,
                            cooldownReset: 'all'
                        },
                        description: 'Grant ally immediate extra turn',
                        animation: '🔄⏰',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    temporal_rift: {
                        id: 'temporal_rift',
                        name: 'Temporal Rift',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['time_bolt'],
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 4,
                        damageMultiplier: [2.4, 2.6, 2.8, 3.0, 3.2],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_SMALL',
                        effects: {
                            stun: { chance: [50, 55, 60, 65, 70], duration: 1 },
                            ageDamage: { percent: [15, 17, 19, 21, 23] }
                        },
                        description: 'Tear fabric of time damaging enemies',
                        animation: '🌀⏰',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    rewind: {
                        id: 'rewind',
                        name: 'Rewind',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['time_warp'],
                        energyCost: [45, 42, 39, 36, 33],
                        cooldown: 6,
                        targeting: 'TEAM',
                        effects: {
                            restoreHp: { percent: [30, 35, 40, 45, 50] },
                            cleanseRecent: true,
                            reviveRecent: { hpPercent: [30, 35, 40, 45, 50] }
                        },
                        description: 'Reverse time restoring party state',
                        animation: '⏮️✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    time_stop: {
                        id: 'time_stop',
                        name: 'Time Stop',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [80, 75, 70],
                        cooldown: 7,
                        targeting: 'ALL_ENEMIES',
                        effects: { freeze: { duration: 2 } },
                        description: 'Freeze time, team acts freely',
                        animation: '⏸️🌀✨',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    MERCHANT: {
        name: 'Merchant',
        icon: '💰',
        skillPointsPerLevel: 2,
        trees: {
            GOLD: {
                name: 'Gold Path',
                icon: '💰',
                skills: {
                    gold_throw: {
                        id: 'gold_throw',
                        name: 'Gold Throw',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [12, 11, 10, 9, 8],
                        cooldown: 1,
                        damageMultiplier: [1.6, 1.75, 1.9, 2.05, 2.2],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'Throw gold for damage',
                        animation: '💰💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    bribe: {
                        id: 'bribe',
                        name: 'Bribe',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        goldCost: [300, 250, 200, 150, 100],
                        cooldown: 4,
                        targeting: 'SINGLE',
                        effects: {
                            charm: { chance: [60, 65, 70, 75, 80], duration: 2 },
                            pacify: { chance: [80, 85, 90, 95, 100], duration: 3 }
                        },
                        description: 'Pay enemy to stop fighting',
                        animation: '💰😊',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    investment: {
                        id: 'investment',
                        name: 'Investment',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['gold_throw'],
                        energyCost: [20, 18, 16, 14, 12],
                        goldCost: [200, 180, 160, 140, 120],
                        cooldown: 3,
                        targeting: 'SELF',
                        effects: {
                            goldReturn: { multiplier: [1.5, 1.6, 1.7, 1.8, 2.0], delay: 2 },
                            luckBuff: { value: [50, 60, 70, 80, 100], duration: 3 }
                        },
                        description: 'Invest gold for profit',
                        animation: '💰📈',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    mercenary: {
                        id: 'mercenary',
                        name: 'Hire Mercenary',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['bribe'],
                        energyCost: [25, 23, 21, 19, 17],
                        goldCost: [500, 450, 400, 350, 300],
                        cooldown: 5,
                        targeting: 'SUMMON',
                        effects: { summon: { unit: 'mercenary', duration: 4, stats: { hp: [120, 140, 160, 180, 200], atk: [25, 30, 35, 40, 45] } } },
                        description: 'Hire fighter to aid in battle',
                        animation: '💰⚔️',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    treasure_hunt: {
                        id: 'treasure_hunt',
                        name: 'Treasure Hunt',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['investment'],
                        energyCost: [30, 27, 24, 21, 18],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            findItems: { count: 3, rarity: 'random' },
                            goldGain: { value: [800, 1000, 1200, 1400, 1600] },
                            luckBuff: { value: [100, 120, 140, 160, 200], duration: 2 }
                        },
                        description: 'Discover hidden treasures',
                        animation: '💰🗺️✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    money_rain: {
                        id: 'money_rain',
                        name: 'Money Rain',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [40, 38, 35],
                        cooldown: 6,
                        damageMultiplier: [3.5, 4.0, 4.5],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        effects: { stun: { chance: [70, 80, 90], duration: 2 } },
                        description: 'Bury enemies in gold coins',
                        animation: '💰💰💰💥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    CLERIC: {
        name: 'Cleric',
        icon: '✨🙏',
        skillPointsPerLevel: 2,
        trees: {
            DIVINE: {
                name: 'Divine Path',
                icon: '✨',
                skills: {
                    heal: {
                        id: 'heal',
                        name: 'Heal',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        targeting: 'SINGLE_ALLY',
                        effects: { heal: { value: [60, 72, 84, 96, 108] } },
                        description: 'Restore ally health',
                        animation: '💚✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    divine_wrath: {
                        id: 'divine_wrath',
                        name: 'Divine Wrath',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [60, 55, 50],
                        cooldown: 6,
                        damageMultiplier: [3.2, 3.6, 4.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: { stun: { chance: [60, 70, 80], duration: 1 } },
                        bonusVsUndead: [4.0, 4.5, 5.0],
                        description: 'Smite enemies while healing allies',
                        animation: '⚡✨💥😇',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    NINJA: {
        name: 'Ninja',
        icon: '🥷',
        skillPointsPerLevel: 2,
        trees: {
            SHADOW: {
                name: 'Shadow Path',
                icon: '🌑',
                skills: {
                    shuriken: {
                        id: 'shuriken',
                        name: 'Shuriken',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [12, 11, 10, 9, 8],
                        cooldown: 1,
                        damageMultiplier: [1.3, 1.45, 1.6, 1.75, 1.9],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'Throw multiple shuriken',
                        animation: '⭐🌟✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    final_eclipse: {
                        id: 'final_eclipse',
                        name: 'Final Eclipse',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [65, 60, 55],
                        cooldown: 8,
                        damageMultiplier: [5.0, 5.5, 6.0],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        effects: { instantKill: { threshold: [25, 30, 35] } },
                        description: 'Ultimate shadow assassination technique',
                        animation: '🌑💀⚡✨',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    MONK: {
        name: 'Monk',
        icon: '🥋',
        skillPointsPerLevel: 2,
        trees: {
            ZEN: {
                name: 'Zen Path',
                icon: '🧘',
                skills: {
                    palm_strike: {
                        id: 'palm_strike',
                        name: 'Palm Strike',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [10, 9, 8, 7, 6],
                        cooldown: 1,
                        damageMultiplier: [1.4, 1.55, 1.7, 1.85, 2.0],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: { stun: { chance: [20, 25, 30, 35, 40], duration: 1 } },
                        description: 'Quick strike with stun chance',
                        animation: '👊💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    enlightenment: {
                        id: 'enlightenment',
                        name: 'Enlightenment',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [50, 45, 40],
                        cooldown: 7,
                        targeting: 'SELF',
                        effects: { buff_self: { stat: 'all', value: [80, 100, 120], duration: 4 } },
                        description: 'Achieve perfect enlightened state',
                        animation: '🧘✨🌟💫',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    DRAGONSLAYER: {
        name: 'Dragonslayer',
        icon: '🐲⚔️',
        skillPointsPerLevel: 2,
        trees: {
            SLAYER: {
                name: 'Dragon Hunting',
                icon: '🐲',
                skills: {
                    dragon_strike: {
                        id: 'dragon_strike',
                        name: 'Dragon Strike',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.6, 1.75, 1.9, 2.05, 2.2],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        bonusVsDragons: [3.0, 3.3, 3.6, 3.9, 4.2],
                        description: 'Devastating blow against dragons.',
                        animation: '⚔️🐲',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    wing_clipper: {
                        id: 'wing_clipper',
                        name: 'Wing Clipper',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        energyCost: [25, 24, 23, 22, 20],
                        cooldown: 4,
                        damageMultiplier: [1.2, 1.3, 1.4, 1.5, 1.6],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: [
                            { type: 'stun', chance: [40, 50, 60, 70, 80], duration: 1 }
                        ],
                        description: 'Grounds a dragon, potentially stunning it.',
                        animation: '✂️🐲',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    scale_breaker: {
                        id: 'scale_breaker',
                        name: 'Scale Breaker',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 3,
                        damageMultiplier: [2.0, 2.2, 2.4, 2.6, 2.8],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        ignoreDefense: [10, 20, 30, 40, 50],
                        description: 'Pierces through thick dragon scales.',
                        animation: '💥🛡️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    tail_cleaver: {
                        id: 'tail_cleaver',
                        name: 'Tail Cleaver',
                        tier: 3,
                        requiredLevel: 6,
                        maxLevel: 5,
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 4,
                        damageMultiplier: [1.5, 1.7, 1.9, 2.1, 2.3],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE',
                        description: 'A wide sweep that strikes all enemies.',
                        animation: '⚔️🌀',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    slayers_focus: {
                        id: 'slayers_focus',
                        name: 'Slayer’s Focus',
                        tier: 3,
                        requiredLevel: 7,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            critBuff: { value: [20, 30, 40, 50, 60], duration: 3 }
                        },
                        description: 'Sharpen your senses, greatly increasing critical hit chance.',
                        animation: '🎯✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    dragonfall: {
                        id: 'dragonfall',
                        name: 'Dragonfall',
                        tier: 4,
                        requiredLevel: 10,
                        maxLevel: 3,
                        energyCost: [70, 65, 60],
                        cooldown: 8,
                        damageMultiplier: [6.0, 6.5, 7.0],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        bonusVsDragons: [10.0, 12.0, 15.0],
                        description: 'The ultimate dragon-killing strike.',
                        animation: '⚔️🐲💀💥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            },
            GUARD: {
                name: 'Dragon Guard',
                icon: '🛡️',
                skills: {
                    ancient_blood: {
                        id: 'ancient_blood',
                        name: 'Ancient Blood',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [10, 9, 8, 7, 5],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            heal: { value: [15, 25, 35, 45, 60] }
                        },
                        description: 'Channel ancient draconic energy to regenerate health.',
                        animation: '🩸✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    dragon_scale: {
                        id: 'dragon_scale',
                        name: 'Dragon Scale',
                        tier: 1,
                        requiredLevel: 2,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            buff_self: { stat: 'defense', value: [20, 30, 40, 50, 60], duration: 3 }
                        },
                        description: 'Hardens skin to mimic dragon scales.',
                        animation: '🛡️🐉',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    fire_resistance: {
                        id: 'fire_resistance',
                        name: 'Dragon Breath Res',
                        tier: 2,
                        requiredLevel: 4,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            buff_self: { stat: 'mag_def', value: [30, 45, 60, 75, 90], duration: 4 }
                        },
                        description: 'Greatly reduces damage from dragon breath.',
                        animation: '🧊🔥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    hunter_roar: {
                        id: 'hunter_roar',
                        name: 'Hunter’s Roar',
                        tier: 3,
                        requiredLevel: 6,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 6,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'attack', value: [15, 20, 25, 30, 40], duration: 3 }
                        },
                        description: 'A terrifying roar that inspires allies, boosting team ATK.',
                        animation: '🦁📢',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    piercing_shout: {
                        id: 'piercing_shout',
                        name: 'Piercing Shout',
                        tier: 4,
                        requiredLevel: 9,
                        maxLevel: 5,
                        energyCost: [45, 43, 41, 39, 37],
                        cooldown: 7,
                        targeting: 'AOE',
                        effects: {
                            debuff: { stat: 'defense', value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Emit a sonic boom that weakens all enemies’ defenses.',
                        animation: '🔊💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    }
                }
            }
        }
    },

    ELEMENTALIST: {
        name: 'Elementalist',
        icon: '🌊🔥⚡🌍',
        skillPointsPerLevel: 2,
        trees: {
            ELEMENTS: {
                name: 'Elements Path',
                icon: '🌀',
                skills: {
                    elemental_bolt: {
                        id: 'elemental_bolt',
                        name: 'Elemental Bolt',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [16, 15, 14, 13, 12],
                        cooldown: 1,
                        damageMultiplier: [1.6, 1.75, 1.9, 2.05, 2.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Strike with random element',
                        animation: '🔥🧊⚡🌍',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    elemental_cataclysm: {
                        id: 'elemental_cataclysm',
                        name: 'Elemental Cataclysm',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [75, 70, 65],
                        cooldown: 8,
                        damageMultiplier: [4.5, 5.0, 5.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Reshape battlefield with elemental fury',
                        animation: '🌋🌊⚡🧊💥',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    WARLORD: {
        name: 'Warlord',
        icon: '🎖️',
        skillPointsPerLevel: 3,
        trees: {
            COMMAND: {
                name: 'Supreme Command',
                icon: '🎖️',
                skills: {
                    tactical_strike: {
                        id: 'tactical_strike',
                        name: 'Tactical Strike',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        damageMultiplier: [2.5, 2.75, 3.0, 3.25, 3.5],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'Masterful strike weakening defenses.',
                        animation: '⚔️📋',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    phalanx_formation: {
                        id: 'phalanx_formation',
                        name: 'Phalanx Formation',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'defense', value: [30, 40, 50, 65, 80], duration: 3 }
                        },
                        description: 'Organize allies into a defensive wall, massively boosting party DEF.',
                        animation: '🛡️🛡️🛡️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    rallying_cry: {
                        id: 'rallying_cry',
                        name: 'Rallying Cry',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 6,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'attack', value: [20, 25, 30, 35, 45], duration: 3 },
                            heal_team: { value: [50, 80, 120, 160, 200] }
                        },
                        description: 'Inspire your team, restoring health and boosting attack.',
                        animation: '📢✨⚔️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    strategic_maneuver: {
                        id: 'strategic_maneuver',
                        name: 'Strategic Maneuver',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 4,
                        targeting: 'TEAM',
                        effects: {
                            haste: { value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Reposition allies for maximum efficiency, increasing party speed.',
                        animation: '🏃‍♂️📋⚡',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    total_war: {
                        id: 'total_war',
                        name: 'Total War',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        isUltimate: true,
                        isAscended: true,
                        energyCost: [100, 90, 80],
                        cooldown: 10,
                        damageMultiplier: [7.0, 8.0, 9.0],
                        damageType: 'TRUE',
                        targeting: 'ALL_ENEMIES',
                        description: 'Unleash total warfare upon all enemies.',
                        animation: '⚔️🎖️💥🔥✨',
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    DOOMSLAYER: {
        name: 'Doomslayer',
        icon: '🔥🪓',
        skillPointsPerLevel: 3,
        trees: {
            DESTRUCTION: {
                name: 'Destruction Path',
                icon: '🔥',
                skills: {
                    rip_and_tear: {
                        id: 'rip_and_tear',
                        name: 'Rip and Tear',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 1,
                        damageMultiplier: [3.0, 3.3, 3.6, 3.9, 4.2],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        description: 'Brutal execution building rage.',
                        animation: '🪓💥🩸',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    eternal_rage: {
                        id: 'eternal_rage',
                        name: 'Eternal Rage',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            berserk: { value: [50, 70, 90, 110, 150], duration: 3 }
                        },
                        description: 'Surrender to the eternal rage, massively increasing damage dealt.',
                        animation: '🩸😡🔥',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    hellfire_blast: {
                        id: 'hellfire_blast',
                        name: 'Hellfire Blast',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 4,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.8],
                        damageType: 'MAGICAL',
                        targeting: 'AOE',
                        effects: {
                            burn: { value: [20, 30, 40, 50, 60], duration: 3 }
                        },
                        description: 'Release a wave of hellfire that incinerates all enemies.',
                        animation: '🔥🌪️💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    blood_siphon: {
                        id: 'blood_siphon',
                        name: 'Blood Siphon',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        damageMultiplier: [2.5, 2.8, 3.1, 3.4, 3.8],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            heal: { value: [40, 60, 80, 100, 150] }
                        },
                        description: 'Siphon the life force of a wounded foe to heal yourself.',
                        animation: '💉🩸✨',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    crucible: {
                        id: 'crucible',
                        name: 'Crucible',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 8,
                        damageMultiplier: [10.0, 12.0, 15.0],
                        damageType: 'TRUE',
                        targeting: 'ALL_ENEMIES',
                        description: 'Ancient weapon of pure destruction.',
                        animation: '⚔️🔥💀⚡💥',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    AVATAR: {
        name: 'Avatar',
        icon: '🌊🔥⚡🌍',
        skillPointsPerLevel: 3,
        trees: {
            ASCENSION: {
                name: 'Ascension Path',
                icon: '✨',
                skills: {
                    elemental_avatar: {
                        id: 'elemental_avatar',
                        name: 'Elemental Avatar',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [0, 0, 0, 0, 0],
                        cooldown: 0,
                        targeting: 'PASSIVE',
                        description: 'Can use all elements simultaneously.',
                        animation: '✨🌀',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    primal_barrier: {
                        id: 'primal_barrier',
                        name: 'Primal Barrier',
                        tier: 2,
                        requiredLevel: 33,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            shield: { value: [30, 40, 50, 60, 80], duration: 3 }
                        },
                        description: 'Surround the party with a barrier of all four elements.',
                        animation: '🌊🔥⚡🌍🛡️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    elemental_nova: {
                        id: 'elemental_nova',
                        name: 'Elemental Nova',
                        tier: 3,
                        requiredLevel: 36,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 4,
                        damageMultiplier: [3.5, 4.0, 4.5, 5.0, 6.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE',
                        description: 'Explode with the power of the four elements.',
                        animation: '💥🌊🔥⚡🌍',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    universal_cataclysm: {
                        id: 'universal_cataclysm',
                        name: 'Universal Cataclysm',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [150, 135, 120],
                        cooldown: 12,
                        damageMultiplier: [15.0, 20.0, 30.0],
                        damageType: 'MAGICAL',
                        targeting: 'ALL_ENEMIES',
                        description: 'The ultimate elemental collapse.',
                        animation: '🌋🌊⚡🌪️💥💀',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    WARLOCK: {
        name: 'Warlock',
        icon: '👹',
        skillPointsPerLevel: 2,
        trees: {
            DARK: {
                name: 'Dark Path',
                icon: '🌑',
                skills: {
                    shadow_bolt: {
                        id: 'shadow_bolt',
                        name: 'Shadow Bolt',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.9, 2.05, 2.2, 2.35, 2.5],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Dark magic corrupting target',
                        animation: '🌑⚡',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    soul_harvest: {
                        id: 'soul_harvest',
                        name: 'Soul Harvest',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [60, 55, 50],
                        cooldown: 7,
                        damageMultiplier: [4.5, 5.0, 5.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Consume souls for power',
                        animation: '💀🌑✨',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    DRUID: {
        name: 'Druid',
        icon: '🌿',
        skillPointsPerLevel: 2,
        trees: {
            NATURE: {
                name: 'Nature Path',
                icon: '🌿',
                skills: {
                    natures_wrath: {
                        id: 'natures_wrath',
                        name: "Nature's Wrath",
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.6, 1.75, 1.9, 2.05, 2.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Strike with nature, entangle enemy',
                        animation: '🌿💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    natures_fury: {
                        id: 'natures_fury',
                        name: "Nature's Fury",
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [65, 60, 55],
                        cooldown: 7,
                        damageMultiplier: [4.0, 4.5, 5.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Unleash the full power of nature',
                        animation: '🌿🌳⚡💚',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    ARTIFICER: {
        name: 'Artificer',
        icon: '🔧',
        skillPointsPerLevel: 2,
        trees: {
            TECH: {
                name: 'Tech Path',
                icon: '⚙️',
                skills: {
                    grenade: {
                        id: 'grenade',
                        name: 'Frag Grenade',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [1.8, 2.0, 2.2, 2.4, 2.6],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE_SMALL',
                        description: 'Explosive damage in area',
                        animation: '💣💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    turret: {
                        id: 'turret',
                        name: 'Deploy Turret',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        targeting: 'SUMMON',
                        effects: { summon: { unit: 'turret', duration: 4, stats: { hp: [60, 75, 90, 105, 120], atk: [18, 22, 26, 30, 35] }, autoAttack: true } },
                        description: 'Deploy automated turret',
                        animation: '🔧🔫',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    shield_generator: {
                        id: 'shield_generator',
                        name: 'Shield Generator',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['turret'],
                        energyCost: [28, 26, 24, 22, 20],
                        cooldown: 4,
                        targeting: 'TEAM',
                        effects: {
                            shield: { value: [35, 45, 55, 65, 80], duration: 3 },
                            regenShield: { value: [10, 12, 14, 16, 20], duration: 3 }
                        },
                        description: 'Generate shields for team',
                        animation: '🛡️⚡',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    emp: {
                        id: 'emp',
                        name: 'EMP Blast',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['grenade'],
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 4,
                        damageMultiplier: [1.5, 1.7, 1.9, 2.1, 2.3],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            silence: { duration: 2 },
                            dispel: true,
                            shock: { duration: 2, value: [15, 18, 21, 24, 28] }
                        },
                        description: 'Disable enemy abilities',
                        animation: '⚡💥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    mech_suit: {
                        id: 'mech_suit',
                        name: 'Mech Suit',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['shield_generator'],
                        energyCost: [45, 42, 39, 36, 33],
                        cooldown: 7,
                        targeting: 'SELF',
                        effects: {
                            transform: { form: 'mech', duration: 4 },
                            hpBuff: { value: [100, 120, 140, 160, 200], duration: 4 },
                            atkBuff: { value: [40, 50, 60, 70, 80], duration: 4 },
                            defBuff: { value: [50, 60, 70, 80, 100], duration: 4 },
                            newAbilities: ['missiles', 'stomp', 'overcharge']
                        },
                        description: 'Transform into powerful mech',
                        animation: '🤖✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    omega_protocol: {
                        id: 'omega_protocol',
                        name: 'Omega Protocol',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [70, 65, 60],
                        cooldown: 8,
                        damageMultiplier: [4.0, 4.5, 5.0],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        description: 'Deploy full arsenal',
                        animation: '🔧⚡💥🤖',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    BARD: {
        name: 'Bard',
        icon: '🎸',
        skillPointsPerLevel: 2,
        trees: {
            MUSIC: {
                name: 'Music Path',
                icon: '🎵',
                skills: {
                    inspire: {
                        id: 'inspire',
                        name: 'Song of Courage',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 3,
                        targeting: 'TEAM',
                        effects: { atkBuff: { value: [25, 30, 35, 40, 45], duration: 3 } },
                        description: 'Inspire allies with heroic song',
                        animation: '🎸✨',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    lullaby: {
                        id: 'lullaby',
                        name: 'Lullaby',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'AOE_SMALL',
                        effects: { sleep: { chance: [65, 70, 75, 80, 85], duration: 2 } },
                        description: 'Put enemies to sleep',
                        animation: '🎵😴',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    battle_hymn: {
                        id: 'battle_hymn',
                        name: 'Battle Hymn',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['inspire'],
                        energyCost: [22, 20, 18, 16, 14],
                        cooldown: 3,
                        damageMultiplier: [1.2, 1.3, 1.4, 1.5, 1.6],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_SMALL',
                        effects: {
                            spdBuff: { value: [20, 25, 30, 35, 40], duration: 3 },
                            critBuff: { value: [15, 18, 21, 24, 28], duration: 3 }
                        },
                        description: 'Battle song empowers team',
                        animation: '🎵⚔️',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    mocking_tune: {
                        id: 'mocking_tune',
                        name: 'Mocking Tune',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        prerequisite: ['lullaby'],
                        energyCost: [18, 16, 14, 12, 10],
                        cooldown: 3,
                        damageMultiplier: [0.8, 0.9, 1.0, 1.1, 1.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: {
                            taunt: { duration: 2 },
                            atkDebuff: { value: [30, 35, 40, 45, 50], duration: 2 },
                            blind: { chance: [50, 55, 60, 65, 70], duration: 1 }
                        },
                        description: 'Taunt and weaken enemy',
                        animation: '🎭😠',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    symphony: {
                        id: 'symphony',
                        name: 'Grand Symphony',
                        tier: 3,
                        requiredLevel: 5,
                        maxLevel: 5,
                        prerequisite: ['battle_hymn'],
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            allBuff: { value: [30, 35, 40, 45, 50], duration: 3 },
                            heal: { value: [50, 60, 70, 80, 100] },
                            cleanse: true,
                            regen: { value: [15, 18, 21, 24, 28], duration: 3 }
                        },
                        description: 'Masterpiece empowering entire party',
                        animation: '🎼✨💫',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    crescendo: {
                        id: 'crescendo',
                        name: 'Crescendo of Chaos',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [55, 50, 45],
                        cooldown: 6,
                        damageMultiplier: [2.8, 3.2, 3.6],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Ultimate performance of power',
                        animation: '🎸🎵💥✨',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    SAMURAI: {
        name: 'Samurai',
        icon: '⚔️🌸',
        skillPointsPerLevel: 2,
        trees: {
            BUSHIDO: {
                name: 'Bushido Path',
                icon: '🌸',
                skills: {
                    iaido: {
                        id: 'iaido',
                        name: 'Iaido',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [16, 15, 14, 13, 12],
                        cooldown: 2,
                        damageMultiplier: [2.0, 2.2, 2.4, 2.6, 2.8],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'Lightning-fast draw attack',
                        animation: '⚔️⚡',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    seven_cuts: {
                        id: 'seven_cuts',
                        name: 'Seven Cuts of Heaven',
                        tier: 4,
                        requiredLevel: 8,
                        maxLevel: 3,
                        energyCost: [60, 55, 50],
                        cooldown: 7,
                        damageMultiplier: [5.5, 6.0, 6.5],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        description: 'Legendary seven-strike technique',
                        animation: '⚔️✨💫🌸',
                        isUltimate: true,
                        skillPointCost: [5, 7, 10]
                    }
                }
            }
        }
    },

    LICH: {
        name: 'Lich',
        icon: '💀👑',
        skillPointsPerLevel: 3,
        trees: {
            IMMORTALITY: {
                name: 'Immortality Path',
                icon: '💀',
                skills: {
                    phylactery: {
                        id: 'phylactery',
                        name: 'Phylactery',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 1,
                        energyCost: [0],
                        cooldown: 0,
                        targeting: 'PASSIVE',
                        description: 'Your soul is bound to a phylactery, granting permanent damage reduction.',
                        animation: '💀✨',
                        skillPointCost: [10]
                    },
                    death_bolt_asc: {
                        id: 'death_bolt_asc',
                        name: 'Death Bolt',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 1,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.8],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'A bolt of absolute death energy.',
                        animation: '💀⚡🌑',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    curse_of_ages: {
                        id: 'curse_of_ages',
                        name: 'Curse of Ages',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 5,
                        targeting: 'AOE',
                        effects: {
                            curse: { value: [20, 30, 40, 50, 65], duration: 3 }
                        },
                        description: 'A dark curse that saps the life and power of all enemies.',
                        animation: '💀💨🌑',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    spectral_shroud: {
                        id: 'spectral_shroud',
                        name: 'Spectral Shroud',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            evasion: { value: [30, 40, 50, 60, 80], duration: 3 }
                        },
                        description: 'Become semi-ethereal, greatly increasing your evasion.',
                        animation: '👻✨🌑',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    soul_bind: {
                        id: 'soul_bind',
                        name: 'Soul Bind',
                        tier: 3,
                        requiredLevel: 38,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 5,
                        targeting: 'SINGLE',
                        effects: {
                            taunt: { duration: 3 }, // Force enemy to attack Lich (who is tanky/revives)
                            vulnerability: { value: [20, 30, 40, 50, 60], duration: 3 }
                        },
                        description: 'Bind an enemy’s soul to yours, forcing them to focus on you while weakening them.',
                        animation: '💀🔗🩸',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    eternal_slumber: {
                        id: 'eternal_slumber',
                        name: 'Eternal Slumber',
                        tier: 3,
                        requiredLevel: 39,
                        maxLevel: 5,
                        energyCost: [50, 47, 44, 41, 38],
                        cooldown: 7,
                        targeting: 'AOE',
                        effects: {
                            sleep: { chance: [40, 55, 70, 85, 100], duration: 2 }
                        },
                        description: 'Lull all enemies into a deep, magical sleep.',
                        animation: '😴🌑✨',
                        skillPointCost: [5, 6, 7, 8, 10]
                    },
                    apocalypse_nova: {
                        id: 'apocalypse_nova',
                        name: 'Apocalypse Nova',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [150, 130, 110],
                        cooldown: 12,
                        damageMultiplier: [12.0, 16.0, 22.0],
                        damageType: 'MAGICAL',
                        targeting: 'ALL_ENEMIES',
                        effects: {
                            dot: { value: [30, 50, 80], duration: 3, element: 'death' }
                        },
                        description: 'Unleash a wave of absolute annihilation.',
                        animation: '💀☄️💥🌑🌌',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    TIMELORD: {
        name: 'Time Lord',
        icon: '⏳👑',
        skillPointsPerLevel: 3,
        trees: {
            MASTERY: {
                name: 'Time Mastery',
                icon: '⏳',
                skills: {
                    temporal_mastery: {
                        id: 'temporal_mastery',
                        name: 'Temporal Mastery',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 1,
                        energyCost: [0],
                        cooldown: 0,
                        targeting: 'PASSIVE',
                        description: 'Your understanding of time grants you permanent speed and initiative.',
                        animation: '⏳⚡',
                        skillPointCost: [10]
                    },
                    chrono_strike: {
                        id: 'chrono_strike',
                        name: 'Chrono Strike',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        damageMultiplier: [3.0, 3.3, 3.6, 3.9, 4.5],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: {
                            slow: { value: [20, 30, 40, 50, 65], duration: 2 }
                        },
                        description: 'Strike an enemy through time, slowing them down significantly.',
                        animation: '⚔️⏳💥',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    time_loop: {
                        id: 'time_loop',
                        name: 'Time Loop',
                        tier: 3,
                        requiredLevel: 35,
                        maxLevel: 5,
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 6,
                        targeting: 'SINGLE',
                        effects: {
                            stun: { chance: [50, 60, 70, 80, 100], duration: 2 }
                        },
                        description: 'Trap an enemy in a localized time loop, stunning them for multiple turns.',
                        animation: '🌀⏳💫',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    temporal_shield: {
                        id: 'temporal_shield',
                        name: 'Temporal Shield',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            evasion: { value: [30, 45, 60, 75, 95], duration: 3 }
                        },
                        description: 'Phase yourself slightly out of time, making you nearly impossible to hit.',
                        animation: '🛡️⏳✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    paradox_wave: {
                        id: 'paradox_wave',
                        name: 'Paradox Wave',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 10,
                        damageMultiplier: [10.0, 14.0, 20.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Unleash a wave of temporal paradoxes that ravage all enemies.',
                        animation: '🌌⏳🌊💥💀',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    SAINT: {
        name: 'Saint',
        icon: '😇',
        skillPointsPerLevel: 3,
        trees: {
            HOLINESS: {
                name: 'Holiness Path',
                icon: '✨',
                skills: {
                    sainthood: {
                        id: 'sainthood',
                        name: 'Sainthood',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 1,
                        energyCost: [0],
                        cooldown: 0,
                        targeting: 'PASSIVE',
                        description: 'All healing is doubled. Party gains +20% all stats.',
                        animation: '😇✨',
                        skillPointCost: [10]
                    },
                    divine_light: {
                        id: 'divine_light',
                        name: 'Divine Light',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 3,
                        targeting: 'TEAM',
                        effects: {
                            heal_team: { value: [100, 150, 200, 250, 350] },
                            blessing: { value: [10, 15, 20, 25, 30], duration: 3 }
                        },
                        description: 'A burst of holy light that heals the party and grants a blessing.',
                        animation: '✨💖🌞',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    holy_resurrection: {
                        id: 'holy_resurrection',
                        name: 'Holy Resurrection',
                        tier: 3,
                        requiredLevel: 35,
                        maxLevel: 3,
                        energyCost: [80, 70, 60],
                        cooldown: 8,
                        targeting: 'SINGLE_DEAD',
                        effects: {
                            revive: { value: [50, 75, 100] }
                        },
                        description: 'Bring a fallen ally back to life with significant HP.',
                        animation: '👼✨🕊️',
                        skillPointCost: [5, 7, 10]
                    },
                    guardian_angel: {
                        id: 'guardian_angel',
                        name: 'Guardian Angel',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 6,
                        targeting: 'SINGLE',
                        effects: {
                            shield: { value: [50, 70, 90, 120, 150], duration: 3 }
                        },
                        description: 'Summon a guardian angel to shield a single ally from all harm.',
                        animation: '👼🛡️✨',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    heavenly_wrath: {
                        id: 'heavenly_wrath',
                        name: 'Heavenly Wrath',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 10,
                        damageMultiplier: [10.0, 12.5, 15.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            stun: { chance: [50, 70, 90], duration: 1 }
                        },
                        description: 'Smite all enemies with divine fire, potentially stunning them.',
                        animation: '⚡🔥⚖️☄️',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    ARCHDRUID: {
        name: 'Archdruid',
        icon: '🌳👑',
        skillPointsPerLevel: 3,
        trees: {
            GUARDIAN: {
                name: 'Guardian Path',
                icon: '🌳',
                skills: {
                    natures_wrath_asc: {
                        id: 'natures_wrath_asc',
                        name: "Nature's Wrath",
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 4,
                        damageMultiplier: [3.5, 4.0, 4.5, 5.0, 5.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Can summon an army of nature spirits.',
                        animation: '🌳👻✨',
                        skillPointCost: [3, 4, 5, 6, 8]
                    },
                    spirit_bond: {
                        id: 'spirit_bond',
                        name: 'Spirit Bond',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 5,
                        targeting: 'SINGLE',
                        effects: {
                            buff_target: { stat: 'attack', value: [20, 30, 40, 50, 65], duration: 3 },
                            heal: { value: [50, 80, 120, 160, 250] }
                        },
                        description: 'Bind your spirit to an ally, healing and boosting their attack.',
                        animation: '🤝🌳✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    thorn_armor: {
                        id: 'thorn_armor',
                        name: 'Thorn Armor',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [40, 60, 80, 100, 130], duration: 3 },
                            bleed: { chance: 100, value: [15, 20, 25, 30, 40], duration: 2 } // Reflective bleed? Or just a buff
                        },
                        description: 'Cover yourself in razor-sharp thorns that absorb damage and wound attackers.',
                        animation: '🛡️🌵🩸',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    ancient_growth: {
                        id: 'ancient_growth',
                        name: 'Ancient Growth',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 6,
                        targeting: 'TEAM',
                        effects: {
                            regen: { value: [20, 30, 40, 50, 70], duration: 4 }
                        },
                        description: 'Heal the entire party over time with primal energy.',
                        animation: '🌿💖🍀',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    gais_judgment: {
                        id: 'gais_judgment',
                        name: "Gaia's Judgment",
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 10,
                        damageMultiplier: [12.0, 15.0, 18.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            root: { chance: [60, 80, 100], duration: 2 }
                        },
                        description: 'The earth rises to swallow your foes, dealing massive damage and rooting them.',
                        animation: '🌍💥🌋🌿',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    TYCOON: {
        name: 'Tycoon',
        icon: '💰👑',
        skillPointsPerLevel: 3,
        trees: {
            WEALTH: {
                name: 'Infinite Wealth',
                icon: '💰',
                skills: {
                    infinite_wealth: {
                        id: 'infinite_wealth',
                        name: 'Infinite Wealth',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 1,
                        energyCost: [0],
                        cooldown: 0,
                        targeting: 'PASSIVE',
                        description: 'Gold never decreases. Can buy anything.',
                        animation: '💰✨👑',
                        skillPointCost: [15]
                    },
                    golden_barrier: {
                        id: 'golden_barrier',
                        name: 'Golden Barrier',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [60, 85, 110, 140, 180], duration: 3 }
                        },
                        description: 'A shield made of pure gold that absorbs extreme damage.',
                        animation: '🛡️💰✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    bribe: {
                        id: 'bribe',
                        name: 'Bribe',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [10, 10, 10, 10, 10],
                        goldCost: [1000, 2000, 3000, 4000, 5000],
                        cooldown: 4,
                        targeting: 'SINGLE',
                        effects: {
                            charm: { chance: [40, 50, 60, 75, 90], duration: 2 }
                        },
                        description: 'Pay an enemy to look the other way (Charm).',
                        animation: '💸🤝💖',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    market_crash: {
                        id: 'market_crash',
                        name: 'Market Crash',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 6,
                        targeting: 'AOE',
                        effects: {
                            debuff: { stat: 'all', value: [15, 20, 25, 30, 40], duration: 3 }
                        },
                        description: 'Devastate the enemy team’s morale and stats.',
                        animation: '📉📉📉',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    zeni_storm: {
                        id: 'zeni_storm',
                        name: 'Zeni Storm',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [50, 45, 40],
                        goldCost: [5000, 10000, 20000],
                        cooldown: 8,
                        damageMultiplier: [15.0, 25.0, 40.0],
                        damageType: 'TRUE',
                        targeting: 'AOE_LARGE',
                        description: 'Rain down heavy gold coins, dealing massive true damage.',
                        animation: '💰⛈️🌪️💥',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    ARCHMAGE: {
        name: 'Archmage',
        icon: '🧙‍♂️✨',
        skillPointsPerLevel: 3,
        trees: {
            ARCANE: {
                name: 'Supreme Arcane',
                icon: '🔮',
                skills: {
                    arcane_mastery: {
                        id: 'arcane_mastery',
                        name: 'Arcane Mastery',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.7],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Pure arcane power',
                        animation: '🔮✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    time_dilation: {
                        id: 'time_dilation',
                        name: 'Time Dilation',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            haste: { value: [20, 25, 30, 35, 40], duration: 3 }
                        },
                        description: 'Slowing time for yourself, acting more often.',
                        animation: '⏳✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    spell_shield: {
                        id: 'spell_shield',
                        name: 'Mana Shield',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [30, 40, 50, 60, 80], duration: 3 }
                        },
                        description: 'Convert mana into a protective barrier.',
                        animation: '🛡️🔮',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    reality_warp: {
                        id: 'reality_warp',
                        name: 'Reality Warp',
                        tier: 3,
                        requiredLevel: 36,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 6,
                        targeting: 'AOE',
                        effects: {
                            confusion: { chance: [30, 40, 50, 60, 75], duration: 2 }
                        },
                        description: 'Distort reality, confusing all enemies.',
                        animation: '🌀✨',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    arcane_rain: {
                        id: 'arcane_rain',
                        name: 'Arcane Rain',
                        tier: 3,
                        requiredLevel: 38,
                        maxLevel: 5,
                        energyCost: [50, 47, 44, 41, 38],
                        cooldown: 5,
                        damageMultiplier: [2.5, 2.8, 3.1, 3.4, 3.8],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Call down a shower of arcane bolts upon all foes.',
                        animation: '🔮🌨️💥',
                        skillPointCost: [5, 6, 7, 8, 10]
                    },
                    mana_surge: {
                        id: 'mana_surge',
                        name: 'Mana Surge',
                        tier: 3,
                        requiredLevel: 39,
                        maxLevel: 5,
                        energyCost: [0, 0, 0, 0, 0],
                        cooldown: 8,
                        targeting: 'SELF',
                        effects: {
                            restore_energy: { value: [30, 45, 60, 80, 100] }
                        },
                        description: 'Overcharge your magical core, restoring massive amounts of energy.',
                        animation: '⚡🔮🔋',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    singularity: {
                        id: 'singularity',
                        name: 'Singularity',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [150, 130, 110],
                        cooldown: 10,
                        damageMultiplier: [20.0, 25.0, 30.0],
                        damageType: 'MAGICAL',
                        targeting: 'ALL_ENEMIES',
                        description: 'Create singularity consuming all',
                        animation: '⚫🔮✨',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    VOIDWALKER: {
        name: 'Voidwalker',
        icon: '🌑🧙',
        skillPointsPerLevel: 3,
        trees: {
            VOID: {
                name: 'Void Path',
                icon: '🌑',
                skills: {
                    void_bolt: {
                        id: 'void_bolt',
                        name: 'Void Bolt',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [22, 21, 20, 19, 17],
                        cooldown: 1,
                        damageMultiplier: [3.5, 3.9, 4.3, 4.7, 5.1],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Dark void energy corrupting target',
                        animation: '🌑⚡',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    void_barrier: {
                        id: 'void_barrier',
                        name: 'Void Barrier',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [40, 50, 60, 70, 90], duration: 3 }
                        },
                        description: 'A shield of pure void energy that absorbs massive damage.',
                        animation: '🛡️🌑',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    essence_drain: {
                        id: 'essence_drain',
                        name: 'Essence Drain',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 4,
                        damageMultiplier: [2.0, 2.3, 2.6, 2.9, 3.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: {
                            heal: { value: [30, 40, 50, 60, 80] } // Lifesteal
                        },
                        description: 'Drain the life force of an enemy to restore your own.',
                        animation: '🧪💀',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    dimensional_rift: {
                        id: 'dimensional_rift',
                        name: 'Dimensional Rift',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [45, 42, 39, 36, 33],
                        cooldown: 7,
                        targeting: 'AOE',
                        effects: {
                            vulnerability: { value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Tear open a rift, weakening all enemies.',
                        animation: '🌑💥🌀',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    abyssal_grasp: {
                        id: 'abyssal_grasp',
                        name: 'Abyssal Grasp',
                        tier: 3,
                        requiredLevel: 38,
                        maxLevel: 5,
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 5,
                        targeting: 'SINGLE',
                        effects: {
                            root: { chance: [50, 65, 80, 100, 100], duration: 2 },
                            dot: { value: [15, 20, 25, 30, 40], duration: 3, element: 'void' }
                        },
                        description: 'Summon shadowy hands to entangle and drain an enemy.',
                        animation: '🌑🤝💀',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    entropy_wave: {
                        id: 'entropy_wave',
                        name: 'Entropy Wave',
                        tier: 3,
                        requiredLevel: 39,
                        maxLevel: 5,
                        energyCost: [55, 52, 49, 46, 43],
                        cooldown: 6,
                        damageMultiplier: [2.8, 3.2, 3.6, 4.0, 4.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Release a wave of pure entropy that ravages everything.',
                        animation: '🌑🌊📉💥',
                        skillPointCost: [5, 6, 7, 8, 10]
                    },
                    oblivion: {
                        id: 'oblivion',
                        name: 'Oblivion',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 10,
                        damageMultiplier: [18.0, 22.0, 25.0],
                        damageType: 'MAGICAL',
                        targeting: 'ALL',
                        description: 'Erase all from existence',
                        animation: '🌑💀⚫✨',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    TEMPLAR: {
        name: 'Templar',
        icon: '⛪',
        skillPointsPerLevel: 3,
        trees: {
            DIVINE: {
                name: 'Divine Stance',
                icon: '⛪',
                skills: {
                    holy_protection: {
                        id: 'holy_protection',
                        name: 'Holy Protection',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            buff_self: { stat: 'defense', value: [40, 55, 70, 85, 100], duration: 3 }
                        },
                        description: 'Surround yourself with holy energy, massively increasing defense.',
                        animation: '🛡️✨⛪',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    judgment_strike: {
                        id: 'judgment_strike',
                        name: 'Judgment Strike',
                        tier: 2,
                        requiredLevel: 33,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 3,
                        damageMultiplier: [3.0, 3.3, 3.6, 3.9, 4.2],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            weak: { value: [15, 20, 25, 30, 40], duration: 2 }
                        },
                        description: 'A heavy strike that judges the target, weakening them.',
                        animation: '⚔️⚖️✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    divine_aura: {
                        id: 'divine_aura',
                        name: 'Divine Aura',
                        tier: 3,
                        requiredLevel: 36,
                        maxLevel: 5,
                        energyCost: [40, 37, 34, 31, 28],
                        cooldown: 6,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'defense', value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Radiate a holy aura that protects the entire party.',
                        animation: '⛪✨🛡️',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    retribution_aura: {
                        id: 'retribution_aura',
                        name: 'Retribution Aura',
                        tier: 3,
                        requiredLevel: 38,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'attack', value: [15, 20, 25, 30, 40], duration: 3 }
                        },
                        description: 'Surround allies with an aura that punishes enemies for attacking.',
                        animation: '⛪✨⚔️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    sacred_ground: {
                        id: 'sacred_ground',
                        name: 'Sacred Ground',
                        tier: 3,
                        requiredLevel: 39,
                        maxLevel: 5,
                        energyCost: [45, 42, 39, 36, 33],
                        cooldown: 7,
                        targeting: 'TEAM',
                        effects: {
                            regen: { value: [25, 35, 45, 60, 80], duration: 4 }
                        },
                        description: 'Hallow the ground, restoring health over time to all allies.',
                        animation: '✨⛪🌱💖',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    heavenly_sanctuary: {
                        id: 'heavenly_sanctuary',
                        name: 'Heavenly Sanctuary',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [100, 90, 80],
                        cooldown: 10,
                        targeting: 'TEAM',
                        effects: {
                            heal_team: { value: [150, 250, 400] },
                            buff_team: { stat: 'all', value: [20, 30, 40], duration: 3 }
                        },
                        description: 'Create a sanctuary of light, healing and buffing the team.',
                        animation: '🏰✨👼',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    },
                    divine_intervention: {
                        id: 'divine_intervention',
                        name: 'Divine Intervention',
                        tier: 4,
                        requiredLevel: 42,
                        maxLevel: 1,
                        energyCost: [150],
                        cooldown: 15,
                        targeting: 'TEAM',
                        effects: {
                            revive_all: { hp: 50 },
                            shield: { value: 100, duration: 2 }
                        },
                        description: 'A miraculous intervention that revives all fallen allies and shields the survivors.',
                        animation: '✨👼🕊️🛡️',
                        isUltimate: true,
                        skillPointCost: [20]
                    }
                }
            }
        }
    },

    NIGHTBLADE: {
        name: 'Nightblade',
        icon: '🌑🗡️',
        skillPointsPerLevel: 3,
        trees: {
            SHADOW: {
                name: 'Ultimate Shadow',
                icon: '🌑',
                skills: {
                    shadow_dance: {
                        id: 'shadow_dance',
                        name: 'Shadow Dance',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 1,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.7],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        description: 'Dance through shadows striking multiple times.',
                        animation: '🌑⚔️💨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    deadly_toxins: {
                        id: 'deadly_toxins',
                        name: 'Deadly Toxins',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'SINGLE',
                        effects: {
                            poison: { value: [30, 45, 60, 80, 110], duration: 4 }
                        },
                        description: 'Coat your blade in lethal toxins, dealing massive poison damage.',
                        animation: '💉💀🩸',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    shadow_clone: {
                        id: 'shadow_clone',
                        name: 'Shadow Clone',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            evasion: { value: [35, 45, 55, 70, 90], duration: 2 }
                        },
                        description: 'Create a clone of yourself to confuse and evade enemies.',
                        animation: '👤🌑✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    eviscerate: {
                        id: 'eviscerate',
                        name: 'Eviscerate',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [35, 32, 29, 26, 23],
                        cooldown: 4,
                        damageMultiplier: [4.0, 4.5, 5.0, 5.5, 6.5],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            bleed: { value: [25, 35, 45, 55, 70], duration: 3 }
                        },
                        description: 'A brutal strike that leaves the target bleeding profusely.',
                        animation: '⚔️🩸💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    eclipse: {
                        id: 'eclipse',
                        name: 'Eclipse',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [100, 90, 80],
                        cooldown: 9,
                        damageMultiplier: [12.0, 14.0, 16.0],
                        damageType: 'TRUE',
                        targeting: 'ALL_ENEMIES',
                        description: 'Total darkness consuming all.',
                        animation: '🌑💀⚔️✨',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    ZENMASTER: {
        name: 'Zenmaster',
        icon: '🧘',
        skillPointsPerLevel: 3,
        trees: {
            ZEN: {
                name: 'Supreme Zen',
                icon: '🧘',
                skills: {
                    perfect_strike: {
                        id: 'perfect_strike',
                        name: 'Perfect Strike',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [0, 0, 0, 0, 0],
                        cooldown: 1,
                        damageMultiplier: [3.0, 3.4, 3.8, 4.2, 4.6],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        description: 'Flawless attack in perfect harmony.',
                        animation: '👊✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    focused_meditation: {
                        id: 'focused_meditation',
                        name: 'Focused Meditation',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [0, 0, 0, 0, 0],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            heal: { value: [60, 100, 150, 200, 300] },
                            haste: { value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Restore your inner peace and speed up your actions.',
                        animation: '🧘✨💫',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    ethereal_dodge: {
                        id: 'ethereal_dodge',
                        name: 'Ethereal Dodge',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [5, 5, 5, 5, 5],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            evasion: { value: [40, 55, 70, 85, 100], duration: 2 }
                        },
                        description: 'Move between dimensions to avoid all incoming attacks.',
                        animation: '💨🧘✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    serene_impact: {
                        id: 'serene_impact',
                        name: 'Serene Impact',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [10, 10, 10, 10, 10],
                        cooldown: 4,
                        damageMultiplier: [3.5, 4.0, 4.5, 5.0, 6.0],
                        damageType: 'TRUE',
                        targeting: 'AOE',
                        effects: {
                            stun: { chance: [30, 45, 60, 75, 90], duration: 1 }
                        },
                        description: 'A calm but forceful wave that stuns and damages all enemies.',
                        animation: '🧘🌊💥⚡',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    one_with_universe: {
                        id: 'one_with_universe',
                        name: 'One With Universe',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [0, 0, 0],
                        cooldown: 10,
                        damageMultiplier: [15.0, 18.0, 20.0],
                        damageType: 'TRUE',
                        targeting: 'ALL',
                        description: 'Transcend mortality achieving oneness.',
                        animation: '🧘✨🌌💫',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    DRAGON_GOD: {
        name: 'Dragon God',
        icon: '🐲👑',
        skillPointsPerLevel: 3,
        trees: {
            DRACO: {
                name: 'Dragon Power',
                icon: '🐲',
                skills: {
                    dragon_breath: {
                        id: 'dragon_breath',
                        name: 'Dragon Breath',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 2,
                        damageMultiplier: [4.5, 5.0, 5.5, 6.0, 6.5],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_SMALL',
                        description: 'Incinerate foes with dragon fire',
                        animation: '🐲🔥💨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    }
                }
            }
        }
    },

    SHOGUN: {
        name: 'Shogun',
        icon: '🏯⚔️',
        skillPointsPerLevel: 3,
        trees: {
            WAR: {
                name: 'War Path',
                icon: '⚔️',
                skills: {
                    shoguns_order: {
                        id: 'shoguns_order',
                        name: 'Shoguns Order',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [25, 24, 23, 22, 20],
                        cooldown: 3,
                        damageMultiplier: [3.5, 3.8, 4.1, 4.4, 4.7],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'A strike that commands respect.',
                        animation: '⚔️🎖️💥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    iaijutsu: {
                        id: 'iaijutsu',
                        name: 'Iaijutsu',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [18, 17, 16, 15, 13],
                        cooldown: 2,
                        damageMultiplier: [3.2, 3.5, 3.8, 4.1, 4.5],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            guaranteedCrit: true
                        },
                        description: 'A lightning-fast draw that always critical hits.',
                        animation: '⚔️⚡🌸',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    daimyo_authority: {
                        id: 'daimyo_authority',
                        name: 'Daimyo’s Authority',
                        tier: 3,
                        requiredLevel: 35,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'attack', value: [20, 25, 30, 35, 45], duration: 3 }
                        },
                        description: 'Command your allies, increasing their attack power.',
                        animation: '🏯📢⚔️',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    empire_strike: {
                        id: 'empire_strike',
                        name: 'Empire Strike',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [110, 100, 90],
                        cooldown: 9,
                        damageMultiplier: [12.0, 15.0, 18.0],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE',
                        description: 'An ultimate strike that decimates all enemies in your wake.',
                        animation: '🏯⚔️💥💨',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    KAGE: {
        name: 'Kage',
        icon: '🌑🥷',
        skillPointsPerLevel: 3,
        trees: {
            SHADOW: {
                name: 'Shadow Realm',
                icon: '🌑',
                skills: {
                    shadow_assassination: {
                        id: 'shadow_assassination',
                        name: 'Shadow Assassination',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 2,
                        damageMultiplier: [5.0, 5.5, 6.0, 6.5, 7.0],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'Strike from the absolute darkness.',
                        animation: '🌑🥷🗡️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    phantom_step: {
                        id: 'phantom_step',
                        name: 'Phantom Step',
                        tier: 2,
                        requiredLevel: 33,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 4,
                        targeting: 'SELF',
                        effects: {
                            evasion: { value: [30, 40, 50, 65, 80], duration: 3 }
                        },
                        description: 'Become like a ghost, making you almost impossible to hit.',
                        animation: '💨🌑✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    poison_needle: {
                        id: 'poison_needle',
                        name: 'Poison Needle',
                        tier: 2,
                        requiredLevel: 35,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 3,
                        damageMultiplier: [1.5, 1.7, 1.9, 2.1, 2.3],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        effects: {
                            poison: { value: [20, 30, 40, 50, 70], duration: 4 }
                        },
                        description: 'A precise needle strike that injects lethal toxin.',
                        animation: '💉💀',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    thousand_shadows: {
                        id: 'thousand_shadows',
                        name: 'Thousand Shadows',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [100, 90, 80],
                        cooldown: 10,
                        damageMultiplier: [8.0, 10.0, 12.0],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE',
                        description: 'Unleash a flurry of shadow clones to strike every foe.',
                        animation: '🌑🥷⚔️🌀',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [8, 12, 15]
                    }
                }
            }
        }
    },

    VIRTUOSO: {
        name: 'Virtuoso',
        icon: '🎻✨',
        skillPointsPerLevel: 3,
        trees: {
            MUSIC: {
                name: 'Grand Music',
                icon: '🎻',
                skills: {
                    heavenly_melody: {
                        id: 'heavenly_melody',
                        name: 'Heavenly Melody',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 3,
                        type: 'heal_team',
                        value: [150, 180, 210, 240, 270],
                        description: 'Heal the entire party with music',
                        animation: '🎻✨💖',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    war_march: {
                        id: 'war_march',
                        name: 'War March',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            buff_team: { stat: 'attack', value: [30, 40, 50, 65, 80], duration: 3 }
                        },
                        description: 'Play a powerful march that pushes allies to their physical limits.',
                        animation: '🥁⚔️🔥',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    serenade_of_peace: {
                        id: 'serenade_of_peace',
                        name: 'Serenade of Peace',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'AOE',
                        effects: {
                            sleep: { chance: [30, 45, 60, 75, 90], duration: 2 }
                        },
                        description: 'A soothing serenade that lulls enemies into a deep sleep.',
                        animation: '🎻💤🌙',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    crescendo: {
                        id: 'crescendo',
                        name: 'Crescendo',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [45, 42, 39, 36, 33],
                        cooldown: 6,
                        damageMultiplier: [4.0, 4.5, 5.0, 5.5, 6.5],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: {
                            stun: { chance: 100, duration: 1 }
                        },
                        description: 'A build-up of sound that finishes with a deafening burst.',
                        animation: '🎻💥📢',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    requiem_of_the_void: {
                        id: 'requiem_of_the_void',
                        name: 'Requiem of the Void',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [120, 110, 100],
                        cooldown: 10,
                        damageMultiplier: [10.0, 12.5, 15.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        effects: {
                            curse: { value: [20, 35, 50], duration: 3 }
                        },
                        description: 'A song of the end that drains the essence of every enemy.',
                        animation: '🎻🌑💀🌌',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    GRAND_INVENTOR: {
        name: 'Grand Inventor',
        icon: '🦾⚙️',
        skillPointsPerLevel: 3,
        trees: {
            TECH: {
                name: 'Hyper Tech',
                icon: '🦾',
                skills: {
                    plasma_cannon: {
                        id: 'plasma_cannon',
                        name: 'Plasma Cannon',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 2,
                        damageMultiplier: [5.5, 6.0, 6.5, 7.0, 7.5],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Fire a beam of pure energy.',
                        animation: '🦾⚡🔥',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    force_field: {
                        id: 'force_field',
                        name: 'Force Field',
                        tier: 2,
                        requiredLevel: 32,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 5,
                        targeting: 'TEAM',
                        effects: {
                            shield: { value: [20, 30, 40, 50, 65], duration: 3 }
                        },
                        description: 'Deploy a high-tech force field to protect the entire party.',
                        animation: '🛡️⚙️✨',
                        skillPointCost: [3, 4, 5, 6, 7]
                    },
                    automated_turret: {
                        id: 'automated_turret',
                        name: 'Auto-Turret',
                        tier: 2,
                        requiredLevel: 34,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 4,
                        damageMultiplier: [1.5, 1.8, 2.1, 2.4, 2.8],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE',
                        description: 'Deploy a turret that sprays bullets at all enemies.',
                        animation: '🤖🔫💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    overclock: {
                        id: 'overclock',
                        name: 'Overclock',
                        tier: 3,
                        requiredLevel: 37,
                        maxLevel: 5,
                        energyCost: [30, 28, 26, 24, 22],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            haste: { value: [40, 55, 70, 85, 100], duration: 3 },
                            buff_self: { stat: 'attack', value: [20, 30, 40, 50, 60], duration: 3 }
                        },
                        description: 'Push your tech to the limit, greatly increasing speed and attack.',
                        animation: '⚙️⚡🔥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    },
                    orbital_strike: {
                        id: 'orbital_strike',
                        name: 'Orbital Strike',
                        tier: 4,
                        requiredLevel: 40,
                        maxLevel: 3,
                        energyCost: [150, 130, 110],
                        cooldown: 12,
                        damageMultiplier: [20.0, 25.0, 35.0],
                        damageType: 'MAGICAL',
                        targeting: 'AOE_LARGE',
                        description: 'Call down a devastating laser from space.',
                        animation: '🛰️⚡☄️💥',
                        isUltimate: true,
                        isAscended: true,
                        skillPointCost: [10, 15, 20]
                    }
                }
            }
        }
    },

    DIVINE_FIST: {
        name: 'Divine Fist',
        icon: '🌌👊',
        skillPointsPerLevel: 3,
        trees: {
            DIVINE: {
                name: 'Divine Might',
                icon: '🌌',
                skills: {
                    star_shatterer: {
                        id: 'star_shatterer',
                        name: 'Star Shatterer',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [40, 38, 36, 34, 32],
                        cooldown: 2,
                        damageMultiplier: [6.0, 6.5, 7.0, 7.5, 8.0],
                        damageType: 'TRUE',
                        targeting: 'SINGLE',
                        description: 'A punch that can break the stars',
                        animation: '👊🌌💥',
                        skillPointCost: [4, 5, 6, 7, 8]
                    }
                }
            }
        }
    },

    REAPER: {
        name: 'Reaper',
        icon: '⌛💀',
        skillPointsPerLevel: 2,
        trees: {
            HARVEST: {
                name: 'Soul Harvest',
                icon: '💀',
                skills: {
                    soul_reap: {
                        id: 'soul_reap',
                        name: 'Soul Reap',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 2,
                        damageMultiplier: [1.8, 2.0, 2.2, 2.4, 2.6],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        effects: {
                            heal: { value: [10, 15, 20, 25, 30] }
                        },
                        description: 'Harvest the soul of an enemy, healing yourself.',
                        animation: '💀✨🩸',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    death_mark: {
                        id: 'death_mark',
                        name: 'Death Mark',
                        tier: 2,
                        requiredLevel: 3,
                        maxLevel: 5,
                        energyCost: [20, 18, 16, 14, 12],
                        cooldown: 4,
                        targeting: 'SINGLE',
                        effects: {
                            vulnerability: { value: [15, 20, 25, 30, 40], duration: 3 }
                        },
                        description: 'Mark an enemy for death, making them take more damage.',
                        animation: '💀🎯',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    soul_shield: {
                        id: 'soul_shield',
                        name: 'Soul Shield',
                        tier: 2,
                        requiredLevel: 5,
                        maxLevel: 5,
                        energyCost: [15, 14, 13, 12, 10],
                        cooldown: 5,
                        targeting: 'SELF',
                        effects: {
                            shield: { value: [25, 35, 45, 60, 80], duration: 3 }
                        },
                        description: 'Form a protective barrier using harvested soul energy.',
                        animation: '🛡️💀✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    grim_reaping: {
                        id: 'grim_reaping',
                        name: 'Grim Reaping',
                        tier: 3,
                        requiredLevel: 7,
                        maxLevel: 5,
                        energyCost: [35, 33, 31, 29, 27],
                        cooldown: 4,
                        damageMultiplier: [2.5, 2.8, 3.1, 3.4, 3.8],
                        damageType: 'PHYSICAL',
                        targeting: 'AOE',
                        description: 'Sweep your scythe in a wide arc, striking all enemies.',
                        animation: '⚔️💀🌪️',
                        skillPointCost: [3, 4, 5, 6, 7]
                    }
                }
            }
        }
    },

    GOD_HAND: {
        name: 'God Hand',
        icon: '👊✨',
        skillPointsPerLevel: 2,
        trees: {
            MARTIAL: {
                name: 'Divine Martial Arts',
                icon: '👊',
                skills: {
                    iron_fist: {
                        id: 'iron_fist',
                        name: 'Iron Fist',
                        tier: 1,
                        requiredLevel: 1,
                        maxLevel: 5,
                        energyCost: [12, 11, 10, 9, 8],
                        cooldown: 1,
                        damageMultiplier: [1.5, 1.7, 1.9, 2.1, 2.3],
                        damageType: 'PHYSICAL',
                        targeting: 'SINGLE',
                        description: 'A powerful punch that can break through steel.',
                        animation: '👊💥',
                        skillPointCost: [1, 2, 3, 4, 5]
                    },
                    pressure_point: {
                        id: 'pressure_point',
                        name: 'Pressure Point',
                        tier: 2,
                        requiredLevel: 4,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 4,
                        targeting: 'SINGLE',
                        effects: {
                            stun: { chance: [30, 40, 50, 65, 80], duration: 1 }
                        },
                        description: 'Strike a precise point to disable the enemy.',
                        animation: '🎯👊💫',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    ki_blast: {
                        id: 'ki_blast',
                        name: 'Ki Blast',
                        tier: 2,
                        requiredLevel: 6,
                        maxLevel: 5,
                        energyCost: [20, 19, 18, 17, 15],
                        cooldown: 2,
                        damageMultiplier: [2.0, 2.3, 2.6, 2.9, 3.2],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Release a concentrated burst of inner energy.',
                        animation: '👊⚡✨',
                        skillPointCost: [2, 3, 4, 5, 6]
                    },
                    meditation: {
                        id: 'meditation',
                        name: 'Meditation',
                        tier: 3,
                        requiredLevel: 8,
                        maxLevel: 5,
                        energyCost: [0, 0, 0, 0, 0],
                        cooldown: 6,
                        targeting: 'SELF',
                        effects: {
                            heal: { value: [40, 60, 85, 110, 150] },
                            restore_energy: { value: [15, 20, 25, 30, 40] }
                        },
                        description: 'Focus your mind to restore health and energy.',
                        animation: '🧘✨🔋',
                        skillPointCost: [3, 4, 5, 6, 7]
                    }
                }
            }
        }
    },

    DEATH_LORD: {
        name: 'Death Lord',
        icon: '🌌💀👑',
        skillPointsPerLevel: 3,
        trees: {
            DEATH: {
                name: 'Sovereign Path',
                icon: '🌌',
                skills: {
                    soul_reaping: {
                        id: 'soul_reaping',
                        name: 'Soul Reaping',
                        tier: 1,
                        requiredLevel: 30,
                        maxLevel: 5,
                        energyCost: [25, 23, 21, 19, 17],
                        cooldown: 1,
                        damageMultiplier: [4.0, 4.5, 5.0, 5.5, 6.0],
                        damageType: 'MAGICAL',
                        targeting: 'SINGLE',
                        description: 'Reap the souls of the living',
                        animation: '💀⌛🌑',
                        skillPointCost: [3, 4, 5, 6, 7]
                    }
                }
            }
        }
    }
};

// ==========================================
// 🛡️ EVOLUTION HELPERS (Integrated)
// ==========================================

// ==========================================
// 🎯 ABILITY MECHANICS
// ==========================================

const ABILITY_MECHANICS = {
    // DAMAGE TYPES
    PHYSICAL: {
        name: 'Physical',
        scaleStat: 'atk',
        reducedBy: 'def',
        effectiveness: 1.0
    },
    MAGICAL: {
        name: 'Magical',
        scaleStat: 'mag',
        reducedBy: 'def',
        defenseMultiplier: 0.5, // Magic partially ignores defense
        effectiveness: 1.0
    },
    TRUE: {
        name: 'True',
        scaleStat: 'atk',
        ignoresDefense: true,
        effectiveness: 1.0
    },
    
    // TARGETING
    SINGLE: { name: 'Single Target', maxTargets: 1 },
    AOE_SMALL: { name: 'Small AOE', maxTargets: 3, damageReduction: 0.8 },
    AOE_LARGE: { name: 'Large AOE', maxTargets: 999, damageReduction: 0.6 },
    CHAIN: { name: 'Chain', maxTargets: 3, damageReduction: 0.7, chainReduction: 0.15 },
    CLEAVE: { name: 'Cleave', maxTargets: 2, damageReduction: 0.9 },
    
    // EFFECTS
    BUFF: { type: 'positive', canStack: true },
    DEBUFF: { type: 'negative', canStack: true },
    DOT: { type: 'damage_over_time', tickRate: 'per_turn' },
    HOT: { type: 'heal_over_time', tickRate: 'per_turn' },
    CONTROL: { type: 'crowd_control', preventAction: true },
    UTILITY: { type: 'utility', special: true }
};

// ==========================================
// 📊 COMBO SYSTEM
// ==========================================

const COMBO_ABILITIES = {
    // WARRIOR + MAGE = Spell Blade
    spell_blade: {
        name: 'Spell Blade',
        requiredClasses: ['WARRIOR', 'MAGE'],
        energyCost: 40,
        cooldown: 5,
        damageMultiplier: 3.0,
        effects: [
            { type: 'hybrid_damage', physical: 0.5, magical: 0.5 },
            { type: 'chain', targets: 2 }
        ],
        description: 'Combine martial and arcane power',
        animation: '⚔️🔥✨'
    },
    
    // ROGUE + MONK = Dual Strike
    dual_strike: {
        name: 'Dual Strike',
        requiredClasses: ['ROGUE', 'MONK'],
        energyCost: 35,
        cooldown: 4,
        damageMultiplier: 2.5,
        multiHit: 2,
        effects: [
            { type: 'guaranteed_crit' },
            { type: 'ignore_armor', value: 50 }
        ],
        description: 'Perfectly coordinated strikes',
        animation: '🗡️🥋💥'
    },
    
    // PALADIN + CLERIC = Divine Intervention
    divine_intervention: {
        name: 'Divine Intervention',
        requiredClasses: ['PALADIN', 'CLERIC'],
        energyCost: 50,
        cooldown: 6,
        effects: [
            { type: 'team_full_heal' },
            { type: 'revive_all', hp: 50 },
            { type: 'buff', stat: 'all', value: 40, duration: 3 },
            { type: 'smite_evil', damage: 200 }
        ],
        description: 'Channel combined holy power',
        animation: '✨😇🙏'
    }
};

// ==========================================
// 🎯 SYNERGY BONUSES
// ==========================================

const CLASS_SYNERGIES = {
    tank_dps: {
        classes: ['WARRIOR', 'PALADIN', 'BERSERKER'],
        with: ['ROGUE', 'MONK'],
        bonus: { name: 'Front & Back', effect: 'DPS gets +20% damage when tank taunts', value: 20 }
    },
    magic_support: {
        classes: ['MAGE', 'WARLOCK', 'ELEMENTALIST'],
        with: ['CLERIC', 'DRUID'],
        bonus: { name: 'Arcane Harmony', effect: 'Mages restore 20 energy when support heals', value: 20 }
    },
    summoner_squad: {
        classes: ['NECROMANCER'],
        with: ['NECROMANCER'],
        bonus: { name: 'Summon Mastery', effect: 'All summons have +50% stats', value: 50 }
    },
    balanced_party: {
        classes: ['TANK', 'DPS', 'MAGIC_DPS', 'SUPPORT'],
        requiresOne: true,
        bonus: { name: 'Perfect Balance', effect: 'Entire team gets +15% all stats', value: 15 }
    }
};

const EVOLUTION_SYSTEM = {
    // Check if player can evolve
    canEvolve: (user, level, questsCompleted) => {
        const classSystem = require('./classSystem');
        const currentClass = classSystem.getClassById(user.class);
        if (!currentClass) return { canEvolve: false };

        // Tier Check
        if (currentClass.tier === 'STARTER' && level >= 20) {
            return { canEvolve: true, type: 'EVOLVED', requirements: currentClass.requirement };
        }
        if (currentClass.tier === 'EVOLVED' && level >= 30) {
            return { canEvolve: true, type: 'ASCENDED', requirements: currentClass.requirement };
        }
        return { canEvolve: false };
    },

    // RPG Authentic Transition: Keep base skills, unlock new path
    evolve: (user, newClassId) => {
        const classSystem = require('./classSystem');
        const newClass = classSystem.getClassById(newClassId);
        
        // 1. Keep current skills (No reset)
        // 2. Update Class
        user.class = newClassId;

        // 3. Mark the evolution level so we know when they shifted
        user.evolvedAt = user.level || 10;
        
        return { success: true, newClassName: newClass.name };
    }
};

function calculateSkillPoints(level) {
    // 1 point per level, bonus points at milestones
    let basePoints = level;
    
    // Bonus points at levels 10, 20, 30, etc.
    const bonusLevels = Math.floor(level / 10);
    const bonusPoints = bonusLevels * 2;
    
    return basePoints + bonusPoints;
}

function getSkillCost(skillLevel) {
    // Cost to upgrade: 1 point per level
    return 1;
}

// ==========================================
// 🔧 SKILL TREE HELPERS
// ==========================================

function getAllSkills(classId) {
    const skillTree = SKILL_TREES[classId];
    if (!skillTree) return [];
    
    const allSkills = [];
    for (const [treeName, tree] of Object.entries(skillTree.trees)) {
        for (const [skillId, skill] of Object.entries(tree.skills)) {
            allSkills.push({
                ...skill,
                treeName,
                treeIcon: tree.icon,
                treeColor: tree.color
            });
        }
    }
    return allSkills;
}

function canLearnSkill(playerSkills, skill) {
    if (!skill.requires) return true;
    
    for (const [reqSkill, reqLevel] of Object.entries(skill.requires)) {
        const currentLevel = playerSkills[reqSkill] || 0;
        if (currentLevel < reqLevel) {
            return false;
        }
    }
    return true;
}

function checkComboAvailable(party) {
    if (!party || !Array.isArray(party)) return [];
    
    const classNames = party.map(p => p.class?.id || p.class?.name || p.class);
    const availableCombos = [];
    
    for (const [key, combo] of Object.entries(COMBO_ABILITIES)) {
        const hasRequired = combo.requiredClasses.every(rc => 
            rc === 'ANY' || classNames.some(cn => cn?.toUpperCase() === rc.toUpperCase())
        );
        if (hasRequired) availableCombos.push(combo);
    }
    
    return availableCombos;
}

function getAllAbilitiesForClass(className) {
    if (!className) return {};
    const classId = className.toUpperCase();
    const tree = SKILL_TREES[classId];
    if (!tree) return {};
    
    const abilities = {};
    for (const [treeName, treeData] of Object.entries(tree.trees)) {
        for (const [skillId, skill] of Object.entries(treeData.skills)) {
            abilities[skillId] = skill;
        }
    }
    return abilities;
}

function getSkill(classId, skillId) {
    const tree = SKILL_TREES[classId];
    if (!tree) return null;
    
    for (const subTree of Object.values(tree.trees)) {
        if (subTree.skills[skillId]) return subTree.skills[skillId];
    }
    return null;
}

function getSkillEffect(skill, level) {
    if (typeof skill.effect === 'function') {
        return skill.effect(level);
    }
    
    // Support for the new structured format (arrays for scaling)
    if (skill.energyCost || skill.damageMultiplier) {
        const lvlIdx = Math.min(level - 1, (skill.maxLevel || 5) - 1);
        const getVal = (val) => Array.isArray(val) ? val[Math.min(lvlIdx, val.length - 1)] : val;
        
        // Determine correct type for engine
        let type = 'none';
        let targets = skill.targets;

        if (skill.targeting === 'CHAIN') {
            type = 'aoe';
            targets = skill.chainTargets;
        } else if (skill.targeting && skill.targeting.includes('AOE')) {
            type = 'aoe';
        } else if (skill.damageMultiplier) {
            type = 'damage';
        }

        const effect = {
            type: (skill.targeting === 'AOE' || skill.targeting === 'AOE_LARGE' || skill.targeting === 'CHAIN') ? 'aoe' : type,
            damageType: (skill.damageType === 'MAGICAL' || skill.damageType === 'magic') ? 'magic' : 'physical',
            targets: (skill.targeting === 'CHAIN') ? (skill.chainTargets || 3) : targets,
            multiplier: getVal(skill.damageMultiplier) || 0,
            cost: getVal(skill.energyCost) || 0,
            goldCost: getVal(skill.goldCost) || 0,
            cooldown: getVal(skill.cooldown) || 0,
            targeting: skill.targeting,
            animation: skill.animation,
            description: skill.description
        };

        // Flatten nested effects for the existing engine
        if (skill.effects) {
            for (const [effId, effData] of Object.entries(skill.effects)) {
                const val = getVal(effData.value);
                const dur = getVal(effData.duration);
                const chance = getVal(effData.chance);

                // Map common effects to existing engine properties
                if (effId === 'stun' || effId === 'freeze' || effId === 'sleep' || effId === 'charm') {
                    effect.cc = effId;
                    effect.ccChance = chance || 100;
                    effect.ccDuration = dur || 1;
                } else if (effId === 'instantKill') {
                    if (effect.type === 'none' || effect.type === 'damage') effect.type = 'execute';
                    const thresholdVal = getVal(effData.threshold);
                    effect.threshold = thresholdVal !== undefined ? thresholdVal : (val?.threshold || val || 30);
                } else if (effId === 'dot' || effId === 'burn' || effId === 'poison' || effId === 'bleed') {
                    effect.dot = effData.element || effId;
                    effect.dotDuration = dur || 3;
                    effect.dotDamage = val || 10;
                } else if (effId === 'shield' || effId === 'buff_self' || effId === 'buff_team' || effId === 'buff_target') {
                    if (effect.type === 'none') effect.type = effId === 'shield' ? 'buff_self' : effId;
                    effect.buffType = effData.stat || 'defense';
                    effect.value = val;
                    effect.duration = dur || 2;
                } else if (effId === 'heal' || effId === 'heal_team') {
                    if (effect.type === 'none') effect.type = effId;
                    effect.value = val;
                } else if (effId === 'evasion' || effId === 'critBuff') {
                    // Specific handling for Mirror Image etc
                    if (effect.type === 'none') effect.type = 'buff_self';
                    effect[effId] = val;
                    effect[effId + 'Duration'] = dur || 2;
                } else {
                    // Generic fallback
                    effect[effId] = val;
                    if (dur) effect[effId + 'Duration'] = dur;
                }
            }
        }

        // Final fallback for SELF targeting
        if (skill.targeting === 'SELF' && effect.type === 'none') {
            effect.type = 'buff_self';
        }
        
        return effect;
    }
    
    return skill.effect;
}

function calculateSpentPoints(user, userClassId) {
    if (!user || !user.skills) return 0;
    const classSystem = require('./classSystem');
    const lineage = classSystem.getLineage(userClassId);
    let totalSpent = 0;

    for (const [skillId, level] of Object.entries(user.skills)) {
        if (level <= 0) continue;
        
        // Find skill definition in lineage
        let targetSkill = null;
        for (const classId of lineage) {
            const tree = SKILL_TREES[classId.toUpperCase()];
            if (!tree) continue;
            for (const [, treeData] of Object.entries(tree.trees)) {
                if (treeData.skills[skillId]) {
                    targetSkill = treeData.skills[skillId];
                    break;
                }
            }
            if (targetSkill) break;
        }

        // If not found in lineage, check all skill trees as fallback
        if (!targetSkill) {
            for (const [, tree] of Object.entries(SKILL_TREES)) {
                for (const [, treeData] of Object.entries(tree.trees)) {
                    if (treeData.skills[skillId]) {
                        targetSkill = treeData.skills[skillId];
                        break;
                    }
                }
                if (targetSkill) break;
            }
        }

        if (targetSkill) {
            for (let i = 1; i <= level; i++) {
                if (targetSkill.skillPointCost && targetSkill.skillPointCost[i - 1] !== undefined) {
                    totalSpent += targetSkill.skillPointCost[i - 1];
                } else {
                    totalSpent += 1;
                }
            }
        } else {
            totalSpent += level;
        }
    }
    return totalSpent;
}

function ensureSkillPointsInitialized(user, userClassId, level) {
    if (!user) return false;
    if (user.skillPoints === undefined || user.skillPoints === null) {
        const spent = calculateSpentPoints(user, userClassId);
        user.skillPoints = Math.max(0, calculateSkillPoints(level) - spent);
        return true;
    }
    return false;
}

// ==========================================
// 📤 EXPORTS
// ==========================================

module.exports = {
    SKILL_TREES,
    EVOLUTION_SYSTEM,
    ABILITY_MECHANICS,
    COMBO_ABILITIES,
    CLASS_SYNERGIES,
    calculateSkillPoints,
    getSkillCost,
    getAllSkills,
    canLearnSkill,
    getSkillEffect,
    checkComboAvailable,
    getAllAbilitiesForClass,
    calculateSpentPoints,
    ensureSkillPointsInitialized
};
