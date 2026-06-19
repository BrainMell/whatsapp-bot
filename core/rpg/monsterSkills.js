// ============================================
// 👹 MONSTER SKILL SYSTEM — ENHANCED v2.0
// ============================================
// Each archetype has a distinct combat identity.
// AI logic tries to match the fantasy of each type.
// New mechanics: spell absorption, mana burn, formation
// synergy, adaptive counters, damage reflection, etc.
// ============================================

const MONSTER_ARCHETYPES = {

    // ─── TANK: Endures, protects, taunts ─────────

    TANK: {
        name: 'Guardian',
        ai: 'PROTECTOR',
        skills: {
            harden: {
                id: 'harden', name: 'Obsidian Skin', levelReq: 1, cost: 20,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'defense', value: 20 + (lvl * 6), duration: 3 }),
                msg: 'hardens their body until their skin resembles volcanic stone!'
            },
            taunt: {
                id: 'taunt', name: 'Provoking Roar', levelReq: 1, cost: 15,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 0.2, cc: 'taunt', ccDuration: 2, ccChance: 85 }),
                msg: 'releases a thunderous roar — you cannot ignore this threat!'
            },
            shield_bash: {
                id: 'shield_bash', name: 'Crushing Slam', levelReq: 5, cost: 25,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.3 + (lvl * 0.05), cc: 'stun', ccDuration: 1, ccChance: 25 + lvl }),
                msg: 'drives forward with an earth-shattering blow!'
            },
            rally: {
                id: 'rally', name: 'Defensive Formation', levelReq: 10, cost: 30,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', buffType: 'defense', value: 15 + lvl, duration: 3 }),
                msg: 'shouts commands, rallying nearby allies to form up!'
            },
            earth_rupture: {
                id: 'earth_rupture', name: 'Cataclysmic Rupture', levelReq: 1, cost: 40,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'physical', multiplier: 2.2 + (lvl * 0.1), cc: 'stun', ccDuration: 1, ccChance: 30 + lvl }),
                msg: 'shatters the bedrock, unleashing a surging wave of jagged stone spikes!'
            },
            // NEW: Damage reflection shell
            thornwall: {
                id: 'thornwall', name: 'Thornwall', levelReq: 15, cost: 35,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'reflect', value: 20 + lvl * 2, duration: 2 }),
                msg: 'erupts in a crackling barrier of jagged spikes — hit me and bleed!'
            },
        },
    },

    // ─── BRUTE: High damage, breaks defenses ──────

    BRUTE: {
        name: 'Ravager',
        ai: 'AGGRESSIVE',
        skills: {
            smash: {
                id: 'smash', name: 'Heavy Smash', levelReq: 1, cost: 20,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.6 + (lvl * 0.08) }),
                msg: 'winds up and drives down with bone-crushing force!'
            },
            cleave: {
                id: 'cleave', name: 'Whirlwind', levelReq: 5, cost: 30,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', multiplier: 1.0 + (lvl * 0.06) }),
                msg: 'spins in a wild arc, striking everyone within reach!'
            },
            armor_break: {
                id: 'armor_break', name: 'Rend Armor', levelReq: 8, cost: 22,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'defense', value: 25 + (lvl * 3), duration: 3 }),
                msg: 'tears through the target\'s armor, exposing them!'
            },
            enrage: {
                id: 'enrage', name: 'Blood Fury', levelReq: 10, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.5,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'attack', value: 40 + (lvl * 5), duration: 4 }),
                msg: 'snaps — wounds fuel an explosive surge of berserker rage!'
            },
            obliterate: {
                id: 'obliterate', name: 'World Obliteration', levelReq: 1, cost: 45,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'physical', multiplier: 3.5 + (lvl * 0.15), ignoreDefense: 40 }),
                msg: 'focuses all their brutal strength into a singular, devastating strike that ignores defense!'
            },
            // NEW: Punish players who stack buffs heavily
            shatter_will: {
                id: 'shatter_will', name: 'Shatter Will', levelReq: 20, cost: 35,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'all', value: 30 + lvl * 2, duration: 3, clearBuffs: true }),
                msg: 'howls with primal fury — strips all buffs and crushes their will to fight!'
            },
        },
    },

    // ─── STALKER: Picks weak targets, poisons ─────

    STALKER: {
        name: 'Stalker',
        ai: 'OPPORTUNIST',
        skills: {
            backstab: {
                id: 'backstab', name: 'Vital Strike', levelReq: 1, cost: 18,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.8 + (lvl * 0.05), critBonus: 20 + lvl }),
                msg: 'darts in from the shadows to strike a vital point!'
            },
            poison: {
                id: 'poison', name: 'Venomous Slash', levelReq: 5, cost: 22,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.0, dot: 'poison', dotDuration: 4, dotDamage: 8 + lvl }),
                msg: 'coats their blade in dark venom before slashing!'
            },
            mark: {
                id: 'mark', name: 'Predator\'s Mark', levelReq: 8, cost: 15,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'evasion', value: 20 + lvl, duration: 3 }),
                msg: 'marks the prey — nowhere to hide now!'
            },
            execute: {
                id: 'execute', name: 'Death Blow', levelReq: 12, cost: 50,
                type: 'execute',
                condition: (hpPct, targetHpPct) => targetHpPct === undefined || targetHpPct < 0.3,
                effect: (lvl) => ({ type: 'execute', multiplier: 3.2 + (lvl * 0.1), threshold: 30 }),
                msg: 'closes in for the killing blow — no mercy!'
            },
            shadow_strike: {
                id: 'shadow_strike', name: 'Assassinate', levelReq: 1, cost: 45,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'physical', multiplier: 2.8 + (lvl * 0.12), guaranteedCrit: true }),
                msg: 'blurs out of existence and strikes from behind with lethal precision!'
            },
            // NEW: Drain energy to punish skill-spamming players
            energy_siphon: {
                id: 'energy_siphon', name: 'Energy Siphon', levelReq: 18, cost: 20,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'energy', value: 30 + lvl * 3, duration: 1, drainEnergy: true }),
                msg: 'plunges their hand into the target\'s aura, ripping away their energy reserves!'
            },
        },
    },

    // ─── MAGE: AoE, charges, status effects ───────

    MAGE: {
        name: 'Sorcerer',
        ai: 'TACTICAL',
        skills: {
            firebolt: {
                id: 'firebolt', name: 'Chaos Bolt', levelReq: 1, cost: 22,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'magic', multiplier: 1.6 + (lvl * 0.06), element: 'fire' }),
                msg: 'hurls a writhing bolt of raw chaos energy!'
            },
            frostwave: {
                id: 'frostwave', name: 'Glacial Wave', levelReq: 5, cost: 28,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 0.9 + (lvl * 0.05), element: 'ice', cc: 'slow', ccDuration: 2, ccChance: 60 }),
                msg: 'exhales a wave of freezing air across all targets!'
            },
            curse: {
                id: 'curse', name: 'Withering Curse', levelReq: 8, cost: 30,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'defense', value: 15 + (lvl * 2), duration: 4 }),
                msg: 'whispers an ancient curse that saps strength and will!'
            },
            meteor_charge: {
                id: 'meteor_charge', name: 'Incantation', levelReq: 12, cost: 55,
                type: 'charge',
                chargeTime: 1,
                nextSkill: 'meteor_impact',
                msg: 'begins chanting in an ancient language... ⚠️ *SOMETHING BIG IS COMING!*'
            },
            meteor_impact: {
                id: 'meteor_impact', name: 'Cataclysm', levelReq: 12, cost: 0,
                type: 'aoe',
                isFollowUp: true,
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 4.5 + (lvl * 0.2), element: 'fire' }),
                msg: 'completes the incantation — fire rains from above!'
            },
            abyssal_void: {
                id: 'abyssal_void', name: 'Abyssal Singularity', levelReq: 1, cost: 60,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 2.5 + (lvl * 0.12), cc: 'freeze', ccDuration: 1, ccChance: 40 }),
                msg: 'summons a collapsing vortex of dark energy, crushing and freezing all targets!'
            },
        },
    },

    // ─── SUPPORT: Heals allies, buffs team ────────

    SUPPORT: {
        name: 'Cultist',
        ai: 'HEALER',
        skills: {
            dark_mend: {
                id: 'dark_mend', name: 'Dark Mend', levelReq: 1, cost: 28,
                type: 'heal',
                effect: (lvl) => ({ type: 'heal', value: 45 + (lvl * 12) }),
                msg: 'threads dark energy through a wound, knitting it closed!'
            },
            unholy_zeal: {
                id: 'unholy_zeal', name: 'Unholy Zeal', levelReq: 5, cost: 20,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', buffType: 'attack', value: 18 + (lvl * 2), duration: 3 }),
                msg: 'screams a profane blessing — allies fight with renewed ferocity!'
            },
            blood_shield: {
                id: 'blood_shield', name: 'Blood Ward', levelReq: 10, cost: 35,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', buffType: 'defense', value: 20 + (lvl * 3), duration: 3 }),
                msg: 'erects a ward of blood magic around nearby allies!'
            },
            revive: {
                id: 'revive', name: 'Accursed Revival', levelReq: 15, cost: 60,
                type: 'revive',
                condition: (hpPct, targetHpPct, allies) => allies && allies.some(a => a.isDead),
                effect: (lvl) => ({ type: 'revive', hpPercent: 30 + (lvl * 5) }),
                msg: 'drags a fallen ally back from the threshold of death!'
            },
            divine_retribution: {
                id: 'divine_retribution', name: 'Corrupt Retribution', levelReq: 1, cost: 40,
                type: 'attack',
                effect: (lvl) => ({
                    type: 'attack',
                    damageType: 'magic',
                    multiplier: 2.4 + (lvl * 0.1),
                    resolvedEffects: {
                        debuff_target: { stat: 'attack', value: 20, duration: 3 }
                    }
                }),
                msg: 'releases a burst of dark light, burning the target and cursing their resolve!'
            },
        },
    },

    // ─── BOSS: Unique mechanics, phases ───────────

    BOSS: {
        name: 'Apex Predator',
        ai: 'BOSS',
        skills: {
            slam: {
                id: 'slam', name: 'Titanic Slam', levelReq: 1, cost: 0,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', multiplier: 2.0 + (lvl * 0.1), cc: 'stun', ccDuration: 1, ccChance: 40 }),
                msg: 'SLAMS the ground with devastating force — the whole area shakes!'
            },
            phase_shift: {
                id: 'phase_shift', name: 'Phase Shift', levelReq: 1, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.5,
                isPhaseChange: true,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'attack', value: 50, duration: 999 }),
                msg: '⚠️ *PHASE 2!* A terrifying transformation — it\'s not holding back anymore!'
            },
            ultimate: {
                id: 'ultimate', name: 'Annihilation', levelReq: 1, cost: 80,
                type: 'aoe',
                chargeTime: 2,
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 6.0 + (lvl * 0.3) }),
                msg: '⚠️ *CHARGING ULTIMATE* ⚠️ — RUN! SURVIVE! USE EVERYTHING!'
            },
        },
    },

    // ─── SPELLBREAKER: Silences, drains, counters casters ─────────────────
    // Designed to punish heavy magic/AOE strategies like Singularity/Meteor spam

    SPELLBREAKER: {
        name: 'Spellbreaker',
        ai: 'COUNTERMAGE',
        skills: {
            arcane_silence: {
                id: 'arcane_silence', name: 'Arcane Silence', levelReq: 1, cost: 25,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'silence', value: 0, duration: 2, silenceTarget: true }),
                msg: 'seals their arcane channels — no spells can be cast!'
            },
            mana_drain: {
                id: 'mana_drain', name: 'Mana Drain', levelReq: 5, cost: 20,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'energy', value: 0, duration: 1, drainEnergy: true, drainAmount: 40 + lvl * 3 }),
                msg: 'tears the magical energy straight from their grasp!'
            },
            spell_absorption: {
                id: 'spell_absorption', name: 'Spell Absorption', levelReq: 8, cost: 35,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'spellAbsorb', value: 60 + lvl * 5, duration: 2, spellAbsorb: true }),
                msg: 'erects a crystalline field that absorbs incoming spell damage!'
            },
            runic_punishment: {
                id: 'runic_punishment', name: 'Runic Punishment', levelReq: 12, cost: 40,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'magic', multiplier: 2.0 + lvl * 0.08, scaledByTargetMana: true }),
                msg: 'reads their energy signature and fires back with a resonant bolt — the more mana you have, the harder this hits!'
            },
            counterspell: {
                id: 'counterspell', name: 'Counterspell', levelReq: 1, cost: 30,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'magic', multiplier: 1.5 + lvl * 0.06, cc: 'stun', ccDuration: 1, ccChance: 50, interruptCharge: true }),
                msg: 'senses an incoming spell and blasts it apart at the source — stunned!'
            },
            arcane_feedback: {
                id: 'arcane_feedback', name: 'Arcane Feedback', levelReq: 18, cost: 45,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 1.8 + lvl * 0.07, cc: 'slow', ccDuration: 2, ccChance: 70 }),
                msg: 'floods the arena with dissonant arcane feedback — overwhelming everyone\'s senses!'
            },
        },
    },

    // ─── PHALANX: Formation combat synergies ──────────────────────────────
    // Members buff each other; killing one triggers enrage in others

    PHALANX: {
        name: 'Phalanx Soldier',
        ai: 'FORMATION',
        skills: {
            shield_wall: {
                id: 'shield_wall', name: 'Shield Wall', levelReq: 1, cost: 25,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', buffType: 'defense', value: 25 + lvl * 4, duration: 3 }),
                msg: 'locks shields with their brothers — they form an impenetrable wall!'
            },
            coordinated_strike: {
                id: 'coordinated_strike', name: 'Coordinated Strike', levelReq: 5, cost: 30,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.4 + lvl * 0.06, bonusPerAlly: 0.3 }),
                msg: 'signals their comrades to attack in perfect unison!'
            },
            vengeance_oath: {
                id: 'vengeance_oath', name: 'Vengeance Oath', levelReq: 8, cost: 0,
                type: 'buff_self',
                condition: (hpPct, targetHpPct, allies) => allies && allies.some(a => a.isDead || a.currentHP <= 0),
                effect: (lvl) => ({ type: 'buff_self', buffType: 'attack', value: 60 + lvl * 5, duration: 999, triggered_by_death: true }),
                msg: 'lets out a battle cry over their fallen comrade — a terrifying killing intent fills the air!'
            },
            spear_volley: {
                id: 'spear_volley', name: 'Spear Volley', levelReq: 10, cost: 35,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'physical', multiplier: 1.2 + lvl * 0.05, cc: 'slow', ccDuration: 1, ccChance: 40 }),
                msg: 'launches a devastating volley of synchronized spear throws!'
            },
            last_stand: {
                id: 'last_stand', name: 'Last Stand', levelReq: 15, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.25,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'all', value: 45 + lvl * 3, duration: 3 }),
                msg: 'plants their feet and roars — they will not fall without a fight!'
            },
        },
    },

    // ─── NEMESIS: Adapts to the player's dominant strategy ────────────────
    // Learns what type of damage the player is dealing most and resists it

    NEMESIS: {
        name: 'Nemesis',
        ai: 'ADAPTIVE',
        skills: {
            null_field: {
                id: 'null_field', name: 'Null Field', levelReq: 1, cost: 30,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'dmgReduction', value: 20 + lvl * 3, duration: 3, adaptiveResist: true }),
                msg: 'analyzes the threat and sculpts a null-field that dampens incoming attacks!'
            },
            mirror_strike: {
                id: 'mirror_strike', name: 'Mirror Strike', levelReq: 5, cost: 35,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 1.6 + lvl * 0.07, mirrorDamageType: true }),
                msg: 'copies the player\'s fighting style and turns it against them!'
            },
            void_anchor: {
                id: 'void_anchor', name: 'Void Anchor', levelReq: 8, cost: 40,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'slow', value: 0, duration: 2, cc: 'slow', ccDuration: 2, ccChance: 90 }),
                msg: 'tears a void anchor beneath them — no escape, no tricks, just survival!'
            },
            nemesis_form: {
                id: 'nemesis_form', name: 'Nemesis Form', levelReq: 12, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.6,
                isPhaseChange: true,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'all', value: 35 + lvl * 3, duration: 999 }),
                msg: '⚠️ *ADAPTING!* It has studied your patterns and evolved — this fight just changed!'
            },
            fate_seal: {
                id: 'fate_seal', name: 'Fate Seal', levelReq: 18, cost: 50,
                type: 'debuff_target',
                effect: (lvl) => ({ type: 'debuff_target', debuffType: 'cooldownExtend', value: 2, duration: 2, extendCooldowns: true }),
                msg: 'seals the target\'s fate — their abilities recoil and slam their cooldowns back!'
            },
        },
    },

    // ─── BERSERKER_MOB: Enemy version of player berserker fantasy ─────────
    // Fast, unpredictable, gets stronger as it takes damage

    BERSERKER_MOB: {
        name: 'Berserker',
        ai: 'FRENZY',
        skills: {
            reckless_charge: {
                id: 'reckless_charge', name: 'Reckless Charge', levelReq: 1, cost: 20,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', multiplier: 2.0 + lvl * 0.09, selfDamage: 0.05 }),
                msg: 'hurls themselves forward with suicidal force, ignoring the damage to themselves!'
            },
            bloodlust: {
                id: 'bloodlust', name: 'Bloodlust', levelReq: 5, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.7,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'attack', value: 15 + lvl * 2, duration: 4 }),
                msg: 'wounds awaken something ancient — their eyes go red!'
            },
            frenzy_cleave: {
                id: 'frenzy_cleave', name: 'Frenzy Cleave', levelReq: 8, cost: 30,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'physical', multiplier: 1.5 + lvl * 0.07, cc: 'stun', ccDuration: 1, ccChance: 20 + lvl }),
                msg: 'erupts in a storm of wild, uncontrolled strikes that hit everything!'
            },
            war_cry: {
                id: 'war_cry', name: 'War Cry', levelReq: 10, cost: 25,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'spd', value: 30 + lvl * 3, duration: 3 }),
                msg: 'bellows a war cry that surges their blood — they move faster, strike harder!'
            },
            death_or_glory: {
                id: 'death_or_glory', name: 'Death or Glory', levelReq: 15, cost: 0,
                type: 'attack',
                condition: (hpPct) => hpPct < 0.3,
                effect: (lvl) => ({ type: 'attack', damageType: 'physical', multiplier: 4.5 + lvl * 0.15, ignoreDefense: 60 }),
                msg: 'at death\'s door, explodes into a final, desperate strike!'
            },
        },
    },

    // ─── VOID_WALKER: Phasing, evasion, position swaps ────────────────────
    // Hard to pin down; punishes players who rely on single-target focus

    VOID_WALKER: {
        name: 'Void Walker',
        ai: 'EVASIVE',
        skills: {
            phase_step: {
                id: 'phase_step', name: 'Phase Step', levelReq: 1, cost: 20,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'evasion', value: 35 + lvl * 3, duration: 2 }),
                msg: 'blinks between dimensions — strikes pass through them like smoke!'
            },
            void_lash: {
                id: 'void_lash', name: 'Void Lash', levelReq: 5, cost: 28,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'magic', multiplier: 1.8 + lvl * 0.07, element: 'VOID', ignoreDefense: 20 }),
                msg: 'reaches through the void and strikes from an impossible angle — ignoring armor!'
            },
            shadow_mimic: {
                id: 'shadow_mimic', name: 'Shadow Mimic', levelReq: 8, cost: 35,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'dmgReduction', value: 30 + lvl * 3, duration: 2 }),
                msg: 'fractures into shadow copies — which one is real?'
            },
            entropy_blast: {
                id: 'entropy_blast', name: 'Entropy Blast', levelReq: 12, cost: 45,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'magic', multiplier: 2.2 + lvl * 0.09, element: 'VOID', cc: 'slow', ccDuration: 2, ccChance: 55 }),
                msg: 'tears a rift in reality, blasting all nearby enemies with entropic energy!'
            },
            void_collapse: {
                id: 'void_collapse', name: 'Void Collapse', levelReq: 18, cost: 60,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'magic', multiplier: 3.8 + lvl * 0.12, element: 'VOID', cc: 'stun', ccDuration: 2, ccChance: 45 }),
                msg: 'collapses a pocket of void energy directly on a target — time stops for a moment!'
            },
        },
    },

    // ─── COLOSSUS: Reflects damage, immune to crowd control ───────────────
    // Brute force is counter-productive; players must adapt their strategy

    COLOSSUS: {
        name: 'Colossus',
        ai: 'IMMOVABLE',
        skills: {
            iron_rebuke: {
                id: 'iron_rebuke', name: 'Iron Rebuke', levelReq: 1, cost: 30,
                type: 'buff_self',
                effect: (lvl) => ({ type: 'buff_self', buffType: 'reflect', value: 25 + lvl * 3, duration: 3 }),
                msg: 'hardens to an extreme — physical strikes are partially reflected back!'
            },
            titan_stomp: {
                id: 'titan_stomp', name: 'Titan Stomp', levelReq: 5, cost: 35,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'physical', multiplier: 2.8 + lvl * 0.1, cc: 'stun', ccDuration: 2, ccChance: 40 }),
                msg: 'brings their titanic foot down, sending shockwaves in all directions!'
            },
            immovable: {
                id: 'immovable', name: 'Immovable', levelReq: 8, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 0.8,
                effect: (lvl) => ({ type: 'buff_self', buffType: 'ccImmune', value: 1, duration: 2, ccImmune: true }),
                msg: 'plunges their fist into the ground — rooted, unshakeable, immovable!'
            },
            world_break: {
                id: 'world_break', name: 'World Break', levelReq: 12, cost: 50,
                type: 'attack',
                effect: (lvl) => ({ type: 'attack', damageType: 'physical', multiplier: 4.0 + lvl * 0.13, ignoreDefense: 50 }),
                msg: 'gathers all momentum and delivers a strike that warps the air — this can\'t be blocked!'
            },
            seismic_slam: {
                id: 'seismic_slam', name: 'Seismic Slam', levelReq: 18, cost: 55,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', damageType: 'physical', multiplier: 3.2 + lvl * 0.11, cc: 'stun', ccDuration: 1, ccChance: 60 }),
                msg: 'slams with enough force to crack the earth itself!'
            },
        },
    },

};

// ==========================================
// 🧠 MONSTER AI ENGINE
// ==========================================

function evaluateAction(enemy, players, allies = []) {
    // 1. Resolve pending charges first
    if (enemy.isCharging) {
        return { action: 'release_charge', skillId: enemy.chargingSkill };
    }

    // 2. Skip if CC'd
    if (enemy.statusEffects?.some(e => ['stun', 'freeze', 'sleep'].includes(e.type))) {
        return { action: 'skip', msg: 'cannot move!' };
    }

    const archetype = MONSTER_ARCHETYPES[enemy.archetype] || MONSTER_ARCHETYPES.BRUTE;
    const aiType = archetype.ai || 'AGGRESSIVE';
    const skills = getSkillsForMonster(enemy.archetype, enemy.level || 1);

    const hpPct = enemy.currentHP / Math.max(1, enemy.maxHP);

    // Filter to usable skills (off cooldown, have mana)
    const available = skills.filter(s =>
        (!enemy.cooldowns?.[s.id]) &&
        (enemy.mana ?? 100) >= s.cost &&
        (!s.condition || s.condition(hpPct, 0.15, allies))
    );

    const livePlayers = players.filter(p => !p.isDead && p.currentHP > 0);
    if (livePlayers.length === 0) return { action: 'attack', target: players[0] };

    // ── SMARTER TARGET SELECTION ────────────────────
    // Previously: random live player. Now: prioritize vulnerable targets.
    // 1. First priority: execute-eligible targets (below 30% HP) — finish them off.
    // 2. Second priority: CC'd targets (stunned/frozen — can't dodge).
    // 3. Third priority: lowest-HP target (focus fire to reduce party DPS).
    // 4. Fallback: random (adds variety so the AI isn't 100% predictable).
    const executeThreshold = 0.30;
    const vulnerableTarget = livePlayers.find(p => {
        const maxHp = p.maxHp || p.stats?.maxHp || 100;
        return (p.currentHP / maxHp) < executeThreshold;
    });
    const ccTarget = livePlayers.find(p =>
        p.statusEffects?.some(e => ['stun', 'freeze', 'sleep', 'root'].includes(e.type))
    );
    const lowestHpTarget = livePlayers.reduce((lowest, p) => {
        const pRatio = p.currentHP / (p.maxHp || p.stats?.maxHp || 1);
        const lRatio = lowest.currentHP / (lowest.maxHp || lowest.stats?.maxHp || 1);
        return pRatio < lRatio ? p : lowest;
    }, livePlayers[0]);

    // 70% chance to pick a smart target, 30% random (keeps some unpredictability).
    let defaultTarget;
    if (vulnerableTarget && Math.random() < 0.75) {
        defaultTarget = vulnerableTarget; // Finish the kill
    } else if (ccTarget && Math.random() < 0.6) {
        defaultTarget = ccTarget; // Punish CC'd players
    } else if (Math.random() < 0.65) {
        defaultTarget = lowestHpTarget; // Focus fire
    } else {
        defaultTarget = livePlayers[Math.floor(Math.random() * livePlayers.length)];
    }

    // ── COUNTERMAGE (SPELLBREAKER) AI ────────────────
    if (aiType === 'COUNTERMAGE') {
        // Priority 1: Silence the player if they have high energy (ready to cast)
        const highEnergyTarget = livePlayers.reduce((best, p) => {
            const en = p.stats?.energy || 0;
            const maxEn = p.stats?.maxEnergy || 100;
            return (en / maxEn) > ((best.stats?.energy || 0) / (best.stats?.maxEnergy || 100)) ? p : best;
        }, livePlayers[0]);
        const silenceSkill = available.find(s => s.id === 'arcane_silence');
        const highEnergyRatio = (highEnergyTarget.stats?.energy || 0) / Math.max(1, highEnergyTarget.stats?.maxEnergy || 100);
        if (silenceSkill && highEnergyRatio > 0.6 && Math.random() > 0.15) {
            return { action: 'skill', skill: silenceSkill, target: highEnergyTarget };
        }

        // Priority 2: Spell Absorption shield when HP > 60%
        const absorbSkill = available.find(s => s.id === 'spell_absorption');
        if (absorbSkill && hpPct > 0.4 && !enemy.statusEffects?.some(e => e.type === 'spellAbsorb') && Math.random() > 0.20) {
            return { action: 'skill', skill: absorbSkill, target: enemy, targetType: 'self' };
        }

        // Priority 3: Mana Drain the highest-energy target
        const manaDrainSkill = available.find(s => s.id === 'mana_drain');
        if (manaDrainSkill && Math.random() > 0.20) {
            return { action: 'skill', skill: manaDrainSkill, target: highEnergyTarget };
        }

        // Priority 4: Runic Punishment (scales with their mana)
        const runicSkill = available.find(s => s.id === 'runic_punishment');
        if (runicSkill && Math.random() > 0.20) {
            return { action: 'skill', skill: runicSkill, target: defaultTarget };
        }

        // Priority 5: Arcane Feedback AoE
        const feedbackSkill = available.find(s => s.id === 'arcane_feedback');
        if (feedbackSkill && Math.random() > 0.25) {
            return { action: 'skill', skill: feedbackSkill, target: defaultTarget };
        }

        // Counterspell as fallback
        const counterSkill = available.find(s => s.id === 'counterspell');
        if (counterSkill) return { action: 'skill', skill: counterSkill, target: defaultTarget };
    }

    // ── FORMATION (PHALANX) AI ────────────────────────
    if (aiType === 'FORMATION') {
        const liveAllies = allies.filter(a => !a.isDead && a.currentHP > 0);
        const deadAlly = allies.find(a => a.isDead || a.currentHP <= 0);

        // Priority 1: Vengeance Oath if an ally just died
        const vengeanceSkill = available.find(s => s.id === 'vengeance_oath');
        if (vengeanceSkill && deadAlly) {
            return { action: 'skill', skill: vengeanceSkill, target: enemy, targetType: 'self' };
        }

        // Priority 2: Last Stand if critical HP
        const lastStandSkill = available.find(s => s.id === 'last_stand');
        if (lastStandSkill && hpPct < 0.25 && Math.random() > 0.10) {
            return { action: 'skill', skill: lastStandSkill, target: enemy, targetType: 'self' };
        }

        // Priority 3: Shield Wall when allies present
        const shieldWall = available.find(s => s.id === 'shield_wall');
        if (shieldWall && liveAllies.length >= 2 && !enemy.statusEffects?.some(e => e.type === 'defense') && Math.random() > 0.20) {
            return { action: 'skill', skill: shieldWall, target: enemy, targetType: 'self' };
        }

        // Priority 4: Spear Volley AoE
        const spearVolley = available.find(s => s.id === 'spear_volley');
        if (spearVolley && Math.random() > 0.20) {
            return { action: 'skill', skill: spearVolley, target: livePlayers[0] };
        }

        // Priority 5: Coordinated Strike with ally bonus
        const coordStrike = available.find(s => s.id === 'coordinated_strike');
        if (coordStrike && Math.random() > 0.15) {
            return { action: 'skill', skill: coordStrike, target: defaultTarget };
        }

        return { action: 'attack', target: defaultTarget };
    }

    // ── ADAPTIVE (NEMESIS) AI ─────────────────────────
    if (aiType === 'ADAPTIVE') {
        // Priority 1: Phase change when triggered
        const nemesisForm = available.find(s => s.id === 'nemesis_form');
        if (nemesisForm && hpPct < 0.6 && !enemy.hasPhaseShifted) {
            enemy.hasPhaseShifted = true;
            return { action: 'skill', skill: nemesisForm, target: enemy, targetType: 'self' };
        }

        // Priority 2: Fate Seal to punish skill usage
        const fateSkill = available.find(s => s.id === 'fate_seal');
        if (fateSkill && Math.random() > 0.20) {
            return { action: 'skill', skill: fateSkill, target: defaultTarget };
        }

        // Priority 3: Null Field to adapt resist
        const nullField = available.find(s => s.id === 'null_field');
        if (nullField && !enemy.statusEffects?.some(e => e.type === 'dmgReduction') && Math.random() > 0.20) {
            return { action: 'skill', skill: nullField, target: enemy, targetType: 'self' };
        }

        // Priority 4: Void Anchor to slow
        const voidAnchor = available.find(s => s.id === 'void_anchor');
        if (voidAnchor && Math.random() > 0.25) {
            return { action: 'skill', skill: voidAnchor, target: defaultTarget };
        }

        // Mirror Strike
        const mirrorStrike = available.find(s => s.id === 'mirror_strike');
        if (mirrorStrike) return { action: 'skill', skill: mirrorStrike, target: defaultTarget };
    }

    // ── FRENZY (BERSERKER_MOB) AI ─────────────────────
    if (aiType === 'FRENZY') {
        // Death or Glory at critical HP
        const dogSkill = available.find(s => s.id === 'death_or_glory');
        if (dogSkill && hpPct < 0.3) {
            return { action: 'skill', skill: dogSkill, target: defaultTarget };
        }

        // War Cry for speed
        const warCry = available.find(s => s.id === 'war_cry');
        if (warCry && !enemy.statusEffects?.some(e => e.type === 'spd') && Math.random() > 0.25) {
            return { action: 'skill', skill: warCry, target: enemy, targetType: 'self' };
        }

        // Bloodlust when wounded
        const bloodlust = available.find(s => s.id === 'bloodlust');
        if (bloodlust && hpPct < 0.7 && Math.random() > 0.20) {
            return { action: 'skill', skill: bloodlust, target: enemy, targetType: 'self' };
        }

        // Frenzy Cleave AoE
        const frenzySkill = available.find(s => s.id === 'frenzy_cleave');
        if (frenzySkill && Math.random() > 0.15) {
            return { action: 'skill', skill: frenzySkill, target: livePlayers[0] };
        }

        // Reckless Charge
        const chargeSkill = available.find(s => s.id === 'reckless_charge');
        if (chargeSkill) return { action: 'skill', skill: chargeSkill, target: defaultTarget };
    }

    // ── EVASIVE (VOID_WALKER) AI ──────────────────────
    if (aiType === 'EVASIVE') {
        // Void Collapse signature move
        const voidCollapse = available.find(s => s.id === 'void_collapse');
        if (voidCollapse && hpPct < 0.5 && Math.random() > 0.20) {
            return { action: 'skill', skill: voidCollapse, target: defaultTarget };
        }

        // Phase Step before combat
        const phaseStep = available.find(s => s.id === 'phase_step');
        if (phaseStep && !enemy.statusEffects?.some(e => e.type === 'evasion') && Math.random() > 0.20) {
            return { action: 'skill', skill: phaseStep, target: enemy, targetType: 'self' };
        }

        // Shadow Mimic for dmg reduction
        const shadowMimic = available.find(s => s.id === 'shadow_mimic');
        if (shadowMimic && hpPct < 0.6 && Math.random() > 0.20) {
            return { action: 'skill', skill: shadowMimic, target: enemy, targetType: 'self' };
        }

        // Entropy Blast AoE
        const entropyBlast = available.find(s => s.id === 'entropy_blast');
        if (entropyBlast && Math.random() > 0.25) {
            return { action: 'skill', skill: entropyBlast, target: livePlayers[0] };
        }

        // Void Lash single target
        const voidLash = available.find(s => s.id === 'void_lash');
        if (voidLash) return { action: 'skill', skill: voidLash, target: defaultTarget };
    }

    // ── IMMOVABLE (COLOSSUS) AI ───────────────────────
    if (aiType === 'IMMOVABLE') {
        // Immovable CC immunity when HP drops
        const immovableSkill = available.find(s => s.id === 'immovable');
        if (immovableSkill && hpPct < 0.8 && !enemy.statusEffects?.some(e => e.type === 'ccImmune') && Math.random() > 0.20) {
            return { action: 'skill', skill: immovableSkill, target: enemy, targetType: 'self' };
        }

        // Iron Rebuke reflect
        const rebukeSkill = available.find(s => s.id === 'iron_rebuke');
        if (rebukeSkill && !enemy.statusEffects?.some(e => e.type === 'reflect') && Math.random() > 0.15) {
            return { action: 'skill', skill: rebukeSkill, target: enemy, targetType: 'self' };
        }

        // World Break at high HP to punish over-aggression
        const worldBreak = available.find(s => s.id === 'world_break');
        if (worldBreak && Math.random() > 0.20) {
            return { action: 'skill', skill: worldBreak, target: defaultTarget };
        }

        // Seismic Slam AoE
        const seismicSlam = available.find(s => s.id === 'seismic_slam');
        if (seismicSlam && Math.random() > 0.20) {
            return { action: 'skill', skill: seismicSlam, target: livePlayers[0] };
        }

        // Titan Stomp
        const titanStomp = available.find(s => s.id === 'titan_stomp');
        if (titanStomp) return { action: 'skill', skill: titanStomp, target: livePlayers[0] };
    }

    // ── HEALER AI ──────────────────────────────────
    if (aiType === 'HEALER') {
        // Priority 1: Revive dead allies
        const deadAlly = allies.find(a => a.isDead || a.currentHP <= 0);
        const reviveSkill = available.find(s => s.type === 'revive');
        if (deadAlly && reviveSkill) return { action: 'skill', skill: reviveSkill, target: deadAlly, targetType: 'ally' };

        // Priority 2: Heal lowest HP ally
        const lowHpAlly = allies.filter(a => !a.isDead).sort((a, b) => (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP))[0];
        const healSkill = available.find(s => s.type === 'heal');
        if (lowHpAlly && healSkill && (lowHpAlly.currentHP / lowHpAlly.maxHP) < 0.6) {
            return { action: 'skill', skill: healSkill, target: lowHpAlly, targetType: 'ally' };
        }

        // Priority 3: Buff team
        const buffSkill = available.find(s => s.type === 'buff_team');
        if (buffSkill && Math.random() > 0.25) return { action: 'skill', skill: buffSkill, target: enemy, targetType: 'self' };

        // Priority 4: Attack / Divine Retribution
        const divRet = available.find(s => s.id === 'divine_retribution');
        if (divRet && Math.random() > 0.20) {
            return { action: 'skill', skill: divRet, target: defaultTarget };
        }
    }

    // ── OPPORTUNIST (STALKER) AI ────────────────────
    if (aiType === 'OPPORTUNIST') {
        // Execute low-HP targets
        const dyingTarget = livePlayers.find(p => (p.currentHP / (p.maxHp || p.stats?.maxHp || 1)) < 0.3);
        const executeSkill = available.find(s => s.id === 'execute');
        if (dyingTarget && executeSkill) return { action: 'skill', skill: executeSkill, target: dyingTarget };

        // Energy Siphon to drain active casters
        const siphonSkill = available.find(s => s.id === 'energy_siphon');
        const highEnTarget = livePlayers.reduce((best, p) => {
            const en = p.stats?.energy || 0;
            return en > (best.stats?.energy || 0) ? p : best;
        }, livePlayers[0]);
        if (siphonSkill && (highEnTarget.stats?.energy || 0) > 50 && Math.random() > 0.20) {
            return { action: 'skill', skill: siphonSkill, target: highEnTarget };
        }

        // Shadow strike
        const weakTarget = livePlayers.reduce((prev, curr) => {
            const pRatio = prev.currentHP / (prev.maxHp || prev.stats?.maxHp || 1);
            const cRatio = curr.currentHP / (curr.maxHp || curr.stats?.maxHp || 1);
            return pRatio < cRatio ? prev : curr;
        });

        const shadowStrike = available.find(s => s.id === 'shadow_strike');
        if (shadowStrike && Math.random() > 0.10) {
            return { action: 'skill', skill: shadowStrike, target: weakTarget };
        }

        const markSkill = available.find(s => s.id === 'mark');
        if (markSkill && !weakTarget.statusEffects?.some(e => e.type === 'marked')) {
            return { action: 'skill', skill: markSkill, target: weakTarget };
        }

        const poisonSkill = available.find(s => s.id === 'poison');
        if (poisonSkill && !weakTarget.statusEffects?.some(e => e.type === 'poison')) {
            return { action: 'skill', skill: poisonSkill, target: weakTarget };
        }

        const backstab = available.find(s => s.id === 'backstab');
        if (backstab) return { action: 'skill', skill: backstab, target: weakTarget };

        return { action: 'attack', target: weakTarget };
    }

    // ── PROTECTOR (TANK) AI ────────────────────────
    if (aiType === 'PROTECTOR') {
        // Priority 1: Taunt if not already taunting
        const hasTauntActive = livePlayers.some(p => p.statusEffects?.some(e => e.type === 'taunt'));
        const tauntSkill = available.find(s => s.id === 'taunt');
        if (!hasTauntActive && tauntSkill && Math.random() > 0.15) {
            return { action: 'skill', skill: tauntSkill, target: defaultTarget };
        }

        // Priority 2: Thornwall reflect when low HP
        const thornwall = available.find(s => s.id === 'thornwall');
        if (thornwall && hpPct < 0.5 && !enemy.statusEffects?.some(e => e.type === 'reflect') && Math.random() > 0.15) {
            return { action: 'skill', skill: thornwall, target: enemy, targetType: 'self' };
        }

        // Priority 3: Rupture if multiple players
        const earthRupture = available.find(s => s.id === 'earth_rupture');
        if (earthRupture && livePlayers.length >= 2 && Math.random() > 0.10) {
            return { action: 'skill', skill: earthRupture, target: defaultTarget };
        }

        // Priority 4: Harden when below 65% HP
        const hardenSkill = available.find(s => s.id === 'harden');
        if (hardenSkill && hpPct < 0.65 && Math.random() > 0.20) {
            return { action: 'skill', skill: hardenSkill, target: enemy, targetType: 'self' };
        }

        // Rally allies when possible
        const rallySkill = available.find(s => s.id === 'rally');
        if (rallySkill && allies.length > 0 && Math.random() > 0.6) {
            return { action: 'skill', skill: rallySkill, target: enemy, targetType: 'self' };
        }

        // Attack highest-threat target
        const strongestPlayer = livePlayers.reduce((prev, curr) => prev.currentHP > curr.currentHP ? prev : curr);
        return { action: 'attack', target: strongestPlayer };
    }

    // ── TACTICAL (MAGE) AI ─────────────────────────
    if (aiType === 'TACTICAL') {
        // If above 50% HP, consider charging ultimate
        const chargeSkill = available.find(s => s.type === 'charge' && s.id === 'meteor_charge');
        if (chargeSkill && hpPct > 0.4 && Math.random() > 0.25) {
            return { action: 'skill', skill: chargeSkill, target: defaultTarget };
        }

        // Singularity if multiple targets
        const abyssalVoid = available.find(s => s.id === 'abyssal_void');
        if (abyssalVoid && livePlayers.length >= 2 && Math.random() > 0.10) {
            return { action: 'skill', skill: abyssalVoid, target: defaultTarget };
        }

        // Curse for debuffs early
        const curseSkill = available.find(s => s.id === 'curse');
        if (curseSkill && !livePlayers[0].statusEffects?.some(e => e.type === 'debuff_all') && Math.random() > 0.25) {
            return { action: 'skill', skill: curseSkill, target: defaultTarget };
        }

        // AoE if multiple targets
        const aoeSkill = available.find(s => s.type === 'aoe');
        if (livePlayers.length >= 2 && aoeSkill) return { action: 'skill', skill: aoeSkill, target: livePlayers[0] };

        // Standard damage spell
        const damageSkill = available.find(s => s.type === 'attack');
        if (damageSkill) return { action: 'skill', skill: damageSkill, target: defaultTarget };
    }

    // ── AGGRESSIVE (BRUTE) AI ──────────────────────
    if (aiType === 'AGGRESSIVE') {
        // Shatter Will to strip player buffs
        const shatterWill = available.find(s => s.id === 'shatter_will');
        const playerWithBuffs = livePlayers.find(p => p.buffs && p.buffs.length > 0);
        if (shatterWill && playerWithBuffs && Math.random() > 0.20) {
            return { action: 'skill', skill: shatterWill, target: playerWithBuffs };
        }

        const obliterate = available.find(s => s.id === 'obliterate');
        if (obliterate && Math.random() > 0.10) {
            return { action: 'skill', skill: obliterate, target: defaultTarget };
        }
        const cleave = available.find(s => s.id === 'cleave');
        if (cleave && livePlayers.length >= 2 && Math.random() > 0.20) {
            return { action: 'skill', skill: cleave, target: defaultTarget };
        }
        const armorBreak = available.find(s => s.id === 'armor_break');
        if (armorBreak && Math.random() > 0.20) {
            return { action: 'skill', skill: armorBreak, target: defaultTarget };
        }
        const smash = available.find(s => s.id === 'smash');
        if (smash && Math.random() > 0.10) {
            return { action: 'skill', skill: smash, target: defaultTarget };
        }
    }

    // ── BOSS AI ─────────────────────────────────────
    if (aiType === 'BOSS') {
        // Phase shift at 50% HP (only once)
        const phaseShift = available.find(s => s.isPhaseChange);
        if (phaseShift && hpPct < 0.5 && !enemy.hasPhaseShifted) {
            enemy.hasPhaseShifted = true;
            return { action: 'skill', skill: phaseShift, target: enemy, targetType: 'self' };
        }

        // 💡 HARDER BOSS AI: charge ultimate earlier (50% HP instead of 30%)
        // and more often (80% chance instead of 80%). Bosses now threaten
        // the party sooner and more reliably.
        const ultimateSkill = available.find(s => s.id === 'ultimate' || s.chargeTime);
        if (ultimateSkill && hpPct < 0.5 && Math.random() > 0.10) {
            return { action: 'skill', skill: ultimateSkill, target: defaultTarget };
        }

        // AoE slam — id is 'slam' in BOSS archetype. 💡 HARDER: 85% chance
        // (was 80%) and smart-target the lowest-HP player for pressure.
        const slamSkill = available.find(s => s.id === 'slam' || s.type === 'aoe');
        if (slamSkill && Math.random() > 0.05) return { action: 'skill', skill: slamSkill, target: defaultTarget };

        // Fallback: use any available offensive skill
        const offSkill = available.find(s => ['attack', 'magic', 'aoe', 'damage_cc', 'execute'].includes(s.type));
        if (offSkill) return { action: 'skill', skill: offSkill, target: defaultTarget };
    }

    // ── AGGRESSIVE FALLBACK ────────────────────────
    // 💡 HARDER AI: Previously only 75% chance to use a skill (25% default attack).
    // Now 90% chance to use a skill — enemies lead with their strongest
    // available offensive ability instead of default-attacking. Default
    // attack is now the last resort, not the norm.
    if (available.length > 0 && Math.random() < 0.90) {
        const offensiveSkills = available.filter(s => ['attack', 'magic', 'aoe', 'damage_cc', 'execute', 'charge'].includes(s.type));
        if (offensiveSkills.length > 0) {
            // 💡 SMARTER SKILL PICK: prefer the highest-multiplier skill that's
            // off cooldown, instead of purely random. This makes enemies feel
            // like they're actually trying to win rather than just reacting.
            offensiveSkills.sort((a, b) => {
                const aEff = a.currentEffect || (typeof a.effect === 'function' ? a.effect(enemy.level || 1) : a.effect);
                const bEff = b.currentEffect || (typeof b.effect === 'function' ? b.effect(enemy.level || 1) : b.effect);
                const aMult = aEff?.multiplier || 1.0;
                const bMult = bEff?.multiplier || 1.0;
                return bMult - aMult;
            });
            // Pick from the top 2 strongest (adds slight variety)
            const topN = Math.min(2, offensiveSkills.length);
            const skill = offensiveSkills[Math.floor(Math.random() * topN)];
            return { action: 'skill', skill, target: defaultTarget };
        }
    }

    return { action: 'attack', target: defaultTarget };
}

// ==========================================
// 🔧 HELPER FUNCTIONS
// ==========================================

function getRandomTarget(players) {
    const live = players.filter(p => !p.isDead && p.currentHP > 0);
    if (live.length === 0) return players[0];
    return live[Math.floor(Math.random() * live.length)];
}

function getSkillsForMonster(archetype, level) {
    const arch = MONSTER_ARCHETYPES[archetype];
    if (!arch) return [];

    return Object.entries(arch.skills)
        .filter(([, s]) => !s.isFollowUp && level >= s.levelReq)
        .map(([id, s]) => ({
            id, ...s,
            currentEffect: typeof s.effect === 'function' ? s.effect(level) : s.effect
        }));
}

function getSkillById(archetype, skillId) {
    const arch = MONSTER_ARCHETYPES[archetype];
    if (!arch?.skills[skillId]) return null;
    return { id: skillId, ...arch.skills[skillId] };
}

function formatMonsterGuide() {
    let msg = `👹 *MONSTER ARCHETYPES*\n\n`;
    for (const [id, data] of Object.entries(MONSTER_ARCHETYPES)) {
        msg += `◈ *${data.name}* [${data.ai}]\n`;
        for (const [, skill] of Object.entries(data.skills)) {
            if (skill.isFollowUp) continue;
            msg += `  • *${skill.name}* (Lv.${skill.levelReq}+)\n`;
            msg += `    _"${skill.msg}"_\n`;
        }
        msg += `\n`;
    }
    return msg;
}

module.exports = {
    MONSTER_ARCHETYPES,
    getSkillsForMonster,
    getSkillById,
    evaluateAction,
    formatMonsterGuide,
};
