// ============================================
// 👹 MONSTER SKILL SYSTEM
// ============================================
// Each archetype has a distinct combat identity.
// AI logic tries to match the fantasy of each type.
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
                effect: (lvl) => ({ type: 'buff', stat: 'def', value: 20 + (lvl * 6), duration: 3 }),
                msg: 'hardens their body until their skin resembles volcanic stone!'
            },
            taunt: {
                id: 'taunt', name: 'Provoking Roar', levelReq: 5, cost: 15,
                type: 'debuff',
                effect: (lvl) => ({ type: 'cc', cc: 'taunt', duration: 2 }),
                msg: 'releases a thunderous roar — you cannot ignore this threat!'
            },
            shield_bash: {
                id: 'shield_bash', name: 'Crushing Slam', levelReq: 10, cost: 28,
                type: 'attack',
                effect: (lvl) => ({ type: 'damage_cc', multiplier: 1.3 + (lvl * 0.05), cc: 'stun', chance: 25 + lvl }),
                msg: 'drives forward with an earth-shattering blow!'
            },
            rally: {
                id: 'rally', name: 'Defensive Formation', levelReq: 15, cost: 35,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', stat: 'def', value: 15 + lvl, duration: 3 }),
                msg: 'shouts commands, rallying nearby allies to form up!'
            },
        },
    },

    // ─── BRUTE: High damage, breaks defenses ──────

    BRUTE: {
        name: 'Ravager',
        ai: 'AGGRESSIVE',
        skills: {
            smash: {
                id: 'smash', name: 'Heavy Smash', levelReq: 1, cost: 25,
                type: 'attack',
                effect: (lvl) => ({ type: 'damage', multiplier: 1.6 + (lvl * 0.08) }),
                msg: 'winds up and drives down with bone-crushing force!'
            },
            cleave: {
                id: 'cleave', name: 'Whirlwind', levelReq: 8, cost: 38,
                type: 'aoe',
                effect: (lvl) => ({ type: 'aoe', multiplier: 1.0 + (lvl * 0.06) }),
                msg: 'spins in a wild arc, striking everyone within reach!'
            },
            armor_break: {
                id: 'armor_break', name: 'Rend Armor', levelReq: 12, cost: 22,
                type: 'debuff',
                effect: (lvl) => ({ type: 'debuff', stat: 'def', value: 25 + (lvl * 3), duration: 3 }),
                msg: 'tears through the target\'s armor, exposing them!'
            },
            enrage: {
                id: 'enrage', name: 'Blood Fury', levelReq: 15, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 50,
                effect: (lvl) => ({ type: 'buff', stat: 'atk', value: 40 + (lvl * 5), duration: 4 }),
                msg: 'snaps — wounds fuel an explosive surge of berserker rage!'
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
                effect: (lvl) => ({ type: 'damage', multiplier: 1.8 + (lvl * 0.05), critChance: 20 + lvl }),
                msg: 'darts in from the shadows to strike a vital point!'
            },
            poison: {
                id: 'poison', name: 'Venomous Slash', levelReq: 5, cost: 22,
                type: 'attack',
                effect: (lvl) => ({ type: 'dot', element: 'poison', value: 8 + lvl, duration: 4 }),
                msg: 'coats their blade in dark venom before slashing!'
            },
            mark: {
                id: 'mark', name: 'Predator\'s Mark', levelReq: 10, cost: 15,
                type: 'debuff',
                effect: (lvl) => ({ type: 'debuff', stat: 'evasion', value: 20 + lvl, duration: 3 }),
                msg: 'marks the prey — nowhere to hide now!'
            },
            execute: {
                id: 'execute', name: 'Death Blow', levelReq: 18, cost: 55,
                type: 'attack',
                condition: (hpPct, targetHpPct) => targetHpPct < 30,
                effect: (lvl) => ({ type: 'damage', multiplier: 3.2 + (lvl * 0.1) }),
                msg: 'closes in for the killing blow — no mercy!'
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
                effect: (lvl) => ({ type: 'magic', multiplier: 1.6 + (lvl * 0.06), element: 'fire' }),
                msg: 'hurls a writhing bolt of raw chaos energy!'
            },
            frostwave: {
                id: 'frostwave', name: 'Glacial Wave', levelReq: 5, cost: 28,
                type: 'aoe',
                effect: (lvl) => ({ type: 'magic', multiplier: 0.9 + (lvl * 0.05), element: 'ice', cc: 'slow', ccChance: 60 }),
                msg: 'exhales a wave of freezing air across all targets!'
            },
            curse: {
                id: 'curse', name: 'Withering Curse', levelReq: 10, cost: 30,
                type: 'debuff',
                effect: (lvl) => ({ type: 'debuff', stat: 'all', value: 10 + (lvl * 2), duration: 4 }),
                msg: 'whispers an ancient curse that saps strength and will!'
            },
            meteor_charge: {
                id: 'meteor_charge', name: 'Incantation', levelReq: 18, cost: 55,
                type: 'charge',
                chargeTime: 1,
                nextSkill: 'meteor_impact',
                msg: 'begins chanting in an ancient language... ⚠️ *SOMETHING BIG IS COMING!*'
            },
            meteor_impact: {
                id: 'meteor_impact', name: 'Cataclysm', levelReq: 18, cost: 0,
                type: 'aoe',
                isFollowUp: true,
                effect: (lvl) => ({ type: 'magic', multiplier: 4.5 + (lvl * 0.2), element: 'fire' }),
                msg: 'completes the incantation — fire rains from above!'
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
                effect: (lvl) => ({ type: 'buff_team', stat: 'atk', value: 18 + (lvl * 2), duration: 3 }),
                msg: 'screams a profane blessing — allies fight with renewed ferocity!'
            },
            blood_shield: {
                id: 'blood_shield', name: 'Blood Ward', levelReq: 12, cost: 35,
                type: 'buff_team',
                effect: (lvl) => ({ type: 'buff_team', stat: 'def', value: 20 + (lvl * 3), duration: 3 }),
                msg: 'erects a ward of blood magic around nearby allies!'
            },
            revive: {
                id: 'revive', name: 'Accursed Revival', levelReq: 20, cost: 60,
                type: 'revive',
                condition: (hpPct, targetHpPct, allies) => allies && allies.some(a => a.isDead),
                effect: (lvl) => ({ type: 'revive', hpPercent: 30 + (lvl * 5) }),
                msg: 'drags a fallen ally back from the threshold of death!'
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
                effect: (lvl) => ({ type: 'aoe', multiplier: 2.0 + (lvl * 0.1), cc: 'stun', ccChance: 40 }),
                msg: 'SLAMS the ground with devastating force — the whole area shakes!'
            },
            phase_shift: {
                id: 'phase_shift', name: 'Phase Shift', levelReq: 1, cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 50,
                isPhaseChange: true,
                effect: (lvl) => ({ type: 'buff', stat: 'atk', value: 50, duration: 999, stat2: 'def', value2: 30 }),
                msg: '⚠️ *PHASE 2!* A terrifying transformation — it\'s not holding back anymore!'
            },
            ultimate: {
                id: 'ultimate', name: 'Annihilation', levelReq: 1, cost: 80,
                type: 'aoe',
                chargeTime: 2,
                effect: (lvl) => ({ type: 'magic', multiplier: 6.0 + (lvl * 0.3) }),
                msg: '⚠️ *CHARGING ULTIMATE* ⚠️ — RUN! SURVIVE! USE EVERYTHING!'
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
        (!s.condition || s.condition(hpPct, 1, allies))
    );

    const livePlayers = players.filter(p => !p.isDead && p.currentHP > 0);
    if (livePlayers.length === 0) return { action: 'attack', target: players[0] };

    // Default target: random live player
    let defaultTarget = livePlayers[Math.floor(Math.random() * livePlayers.length)];

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
        if (buffSkill && Math.random() > 0.5) return { action: 'skill', skill: buffSkill, target: enemy, targetType: 'self' };
    }

    // ── OPPORTUNIST (STALKER) AI ────────────────────
    if (aiType === 'OPPORTUNIST') {
        // Execute low-HP targets
        const dyingTarget = livePlayers.find(p => (p.currentHP / (p.maxHp || p.stats?.maxHp || 1)) < 0.3);
        const executeSkill = available.find(s => s.id === 'execute');
        if (dyingTarget && executeSkill) return { action: 'skill', skill: executeSkill, target: dyingTarget };
        
        // Mark then poison the weakest target
        const weakTarget = livePlayers.reduce((prev, curr) => {
            const pRatio = prev.currentHP / (prev.maxHp || prev.stats?.maxHp || 1);
            const cRatio = curr.currentHP / (curr.maxHp || curr.stats?.maxHp || 1);
            return pRatio < cRatio ? prev : curr;
        });
        
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
        if (!hasTauntActive && tauntSkill && Math.random() > 0.35) {
            return { action: 'skill', skill: tauntSkill, target: defaultTarget };
        }
        
        // Priority 2: Harden when below 65% HP
        const hardenSkill = available.find(s => s.id === 'harden');
        if (hardenSkill && hpPct < 0.65 && Math.random() > 0.4) {
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
        if (chargeSkill && hpPct > 0.4 && Math.random() > 0.5) {
            return { action: 'skill', skill: chargeSkill, target: defaultTarget };
        }
        
        // Curse for debuffs early
        const curseSkill = available.find(s => s.id === 'curse');
        if (curseSkill && !livePlayers[0].statusEffects?.some(e => e.type === 'debuff_all') && Math.random() > 0.5) {
            return { action: 'skill', skill: curseSkill, target: defaultTarget };
        }
        
        // AoE if multiple targets
        const aoeSkill = available.find(s => s.type === 'aoe');
        if (livePlayers.length >= 2 && aoeSkill) return { action: 'skill', skill: aoeSkill, target: livePlayers[0] };
        
        // Standard damage spell
        const damageSkill = available.find(s => s.type === 'attack');
        if (damageSkill) return { action: 'skill', skill: damageSkill, target: defaultTarget };
    }

    // ── BOSS AI ─────────────────────────────────────
    if (aiType === 'BOSS') {
        // Phase shift at 50% HP (only once)
        const phaseShift = available.find(s => s.isPhaseChange);
        if (phaseShift && hpPct < 0.5 && !enemy.hasPhaseShifted) {
            enemy.hasPhaseShifted = true;
            return { action: 'skill', skill: phaseShift, target: enemy, targetType: 'self' };
        }
        
        // Ultimate charge when at 25% HP
        const ultimateSkill = available.find(s => s.id === 'ultimate');
        if (ultimateSkill && hpPct < 0.3 && Math.random() > 0.4) {
            return { action: 'skill', skill: ultimateSkill, target: livePlayers[0] };
        }
        
        // AoE slam often
        const slamSkill = available.find(s => s.id === 'slam');
        if (slamSkill && Math.random() > 0.4) return { action: 'skill', skill: slamSkill, target: livePlayers[0] };
    }

    // ── AGGRESSIVE FALLBACK ────────────────────────
    if (available.length > 0 && Math.random() > 0.25) {
        const offensiveSkills = available.filter(s => ['attack', 'magic', 'aoe', 'damage_cc'].includes(s.type));
        if (offensiveSkills.length > 0) {
            const skill = offensiveSkills[Math.floor(Math.random() * offensiveSkills.length)];
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
