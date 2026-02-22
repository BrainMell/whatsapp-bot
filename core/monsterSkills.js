// ============================================
// 👹 MONSTER SKILL SYSTEM - Archetypes & AI
// ============================================

const MONSTER_ARCHETYPES = {
    // 🛡️ TANK: Protects allies, high def, taunts
    TANK: {
        name: 'Guardian',
        ai: 'PROTECTOR',
        skills: {
            harden: {
                id: 'harden',
                name: 'Obsidian Skin',
                levelReq: 1,
                cost: 20,
                type: 'buff_self',
                effect: (level) => ({ type: 'buff', stat: 'def', value: 20 + (level * 5), duration: 3 }),
                msg: 'turns their skin into impenetrable obsidian!'
            },
            taunt: {
                id: 'taunt',
                name: 'Provoke',
                levelReq: 5,
                cost: 15,
                type: 'debuff',
                effect: (level) => ({ type: 'cc', cc: 'taunt', duration: 2 }),
                msg: 'roars a deafening challenge, forcing you to attack them!'
            },
            shield_bash: {
                id: 'shield_bash',
                name: 'Crushing Bash',
                levelReq: 10,
                cost: 25,
                type: 'attack',
                effect: (level) => ({ type: 'damage_cc', multiplier: 1.2, cc: 'stun', chance: 30 + level }),
                msg: 'slams forward with a massive shield!'
            }
        }
    },

    // ⚔️ BRUTE: High damage, simple logic, breaks defenses
    BRUTE: {
        name: 'Ravager',
        ai: 'AGGRESSIVE',
        skills: {
            smash: {
                id: 'smash',
                name: 'Heavy Smash',
                levelReq: 1,
                cost: 25,
                type: 'attack',
                effect: (level) => ({ type: 'damage', multiplier: 1.5 + (level * 0.1) }),
                msg: 'unleashes a bone-crushing strike!'
            },
            cleave: {
                id: 'cleave',
                name: 'Whirlwind',
                levelReq: 10,
                cost: 40,
                type: 'aoe',
                effect: (level) => ({ type: 'aoe', multiplier: 1.1 + (level * 0.05) }),
                msg: 'spins wildly, striking everyone!'
            },
            enrage: {
                id: 'enrage',
                name: 'Blood Fury',
                levelReq: 15,
                cost: 0,
                type: 'buff_self',
                condition: (hpPct) => hpPct < 50,
                effect: (level) => ({ type: 'buff', stat: 'atk', value: 50, duration: 3 }),
                msg: 'goes into a frenzy as their blood boils!'
            }
        }
    },

    // 🗡️ STALKER: Targets weak/low HP, high crit, poisons
    STALKER: {
        name: 'Assassin',
        ai: 'OPPORTUNIST',
        skills: {
            backstab: {
                id: 'backstab',
                name: 'Vile Strike',
                levelReq: 1,
                cost: 15,
                type: 'attack',
                effect: (level) => ({ type: 'damage', multiplier: 1.8, critChance: 20 + level }),
                msg: 'strikes a vital organ from the shadows!'
            },
            poison: {
                id: 'poison',
                name: 'Toxic Blade',
                levelReq: 5,
                cost: 20,
                type: 'attack',
                effect: (level) => ({ type: 'dot', element: 'poison', value: 10 + level, duration: 3 }),
                msg: 'coats their weapon in a deadly toxin!'
            },
            execute: {
                id: 'execute',
                name: 'Throat Slit',
                levelReq: 20,
                cost: 50,
                type: 'attack',
                condition: (hpPct, targetHpPct) => targetHpPct < 30,
                effect: (level) => ({ type: 'damage', multiplier: 3.0 }),
                msg: 'attempts to end it with a single cut!'
            }
        }
    },

    // 🔮 MAGE: AoE, status effects, charging attacks
    MAGE: {
        name: 'Sorcerer',
        ai: 'TACTICAL',
        skills: {
            firebolt: {
                id: 'firebolt',
                name: 'Chaos Bolt',
                levelReq: 1,
                cost: 20,
                type: 'attack',
                effect: (level) => ({ type: 'magic', multiplier: 1.6, element: 'fire' }),
                msg: 'hurls a ball of flickering chaos!'
            },
            curse: {
                id: 'curse',
                name: 'Enfeeble',
                levelReq: 10,
                cost: 30,
                type: 'debuff',
                effect: (level) => ({ type: 'debuff', stat: 'all', value: 10 + (level * 2), duration: 4 }),
                msg: 'whispers a debilitating ancient curse!'
            },
            meteor_charge: {
                id: 'meteor_charge',
                name: 'Incantation',
                levelReq: 20,
                cost: 50,
                type: 'charge',
                chargeTime: 1,
                nextSkill: 'meteor_impact',
                msg: 'begins chanting a catastrophic spell... (⚠️ CHARGING!)'
            },
            meteor_impact: {
                id: 'meteor_impact',
                name: 'Cataclysm',
                levelReq: 20,
                cost: 0,
                type: 'aoe',
                isFollowUp: true,
                effect: (level) => ({ type: 'magic', multiplier: 4.0, element: 'fire' }),
                msg: 'completes the spell, raining destruction!'
            }
        }
    },

    // 💚 SUPPORT: Heals allies, buffs
    SUPPORT: {
        name: 'Cultist',
        ai: 'HEALER',
        skills: {
            heal: {
                id: 'heal',
                name: 'Dark Mend',
                levelReq: 1,
                cost: 25,
                type: 'heal',
                effect: (level) => ({ type: 'heal', value: 50 + (level * 10) }),
                msg: 'knits wounds together with dark energy!'
            },
            buff: {
                id: 'buff',
                name: 'Unholy Zeal',
                levelReq: 5,
                cost: 20,
                type: 'buff_team',
                effect: (level) => ({ type: 'buff_team', stat: 'atk', value: 20, duration: 3 }),
                msg: 'empowers their allies with frantic chanting!'
            }
        }
    }
};

// ==========================================
// 🧠 MONSTER AI ENGINE
// ==========================================

function evaluateAction(enemy, players, allies) {
    // 1. Check for Charge/Stun/CC
    if (enemy.isCharging) {
        return { action: 'release_charge', skillId: enemy.chargingSkill };
    }
    if (enemy.statusEffects && enemy.statusEffects.some(e => e.type === 'stun' || e.type === 'freeze' || e.type === 'sleep')) {
        return { action: 'skip', msg: 'is unable to move!' };
    }

    const archetype = MONSTER_ARCHETYPES[enemy.archetype] || MONSTER_ARCHETYPES.BRUTE;
    const aiType = archetype.ai || 'AGGRESSIVE';
    const skills = getSkillsForMonster(enemy.archetype, enemy.level || 1);
    
    // Filter skills by cooldown/cost
    const availableSkills = skills.filter(s => 
        (!enemy.cooldowns || !enemy.cooldowns[s.id]) && 
        (enemy.mana >= s.cost)
    );

    let bestAction = { action: 'attack', target: getRandomTarget(players) };

    // --- AI LOGIC ---

    if (aiType === 'HEALER') {
        // Check for low HP allies
        const lowHpAlly = allies.find(a => (a.currentHP / a.maxHP) < 0.5);
        const healSkill = availableSkills.find(s => s.type === 'heal');
        
        if (lowHpAlly && healSkill) {
            return { action: 'skill', skill: healSkill, target: lowHpAlly, targetType: 'ally' };
        }
        // If everyone healthy, try to buff
        const buffSkill = availableSkills.find(s => s.type === 'buff_team');
        if (buffSkill && Math.random() > 0.5) {
            return { action: 'skill', skill: buffSkill, target: enemy, targetType: 'self' }; // Team buffs usually target self as origin
        }
    }

    if (aiType === 'OPPORTUNIST') { // Assassin logic
        // Find execute targets (<30% HP)
        const executeTarget = players.find(p => (p.currentHP / p.maxHp) < 0.3);
        const executeSkill = availableSkills.find(s => s.condition && s.condition(enemy.currentHP/enemy.maxHP, executeTarget ? 0.2 : 1.0));
        
        if (executeTarget && executeSkill) {
            return { action: 'skill', skill: executeSkill, target: executeTarget };
        }
        
        // Otherwise target lowest HP %
        const weakTarget = players.reduce((prev, curr) => (prev.currentHP/prev.maxHp < curr.currentHP/curr.maxHp) ? prev : curr);
        const bestDmgSkill = availableSkills.sort((a,b) => (b.currentEffect?.multiplier || 0) - (a.currentEffect?.multiplier || 0))[0];
        
        if (bestDmgSkill) {
            return { action: 'skill', skill: bestDmgSkill, target: weakTarget };
        }
        bestAction.target = weakTarget;
    }

    if (aiType === 'PROTECTOR') { // Tank logic
        // Taunt if not taunting
        const tauntSkill = availableSkills.find(s => s.id === 'taunt');
        if (tauntSkill && Math.random() > 0.3) {
            return { action: 'skill', skill: tauntSkill, target: getRandomTarget(players) };
        }
        // Shield self if lowish
        const shieldSkill = availableSkills.find(s => s.id === 'harden');
        if (shieldSkill && (enemy.currentHP / enemy.maxHP) < 0.7) {
            return { action: 'skill', skill: shieldSkill, target: enemy, targetType: 'self' };
        }
        // Attack highest HP threat (to hold aggro logic simulation)
        const strongTarget = players.reduce((prev, curr) => (prev.currentHP > curr.currentHP) ? prev : curr);
        bestAction.target = strongTarget;
    }

    if (aiType === 'TACTICAL') { // Mage logic
        // If charging skill available and healthy, try to charge
        const chargeSkill = availableSkills.find(s => s.type === 'charge');
        if (chargeSkill && (enemy.currentHP / enemy.maxHP) > 0.4 && Math.random() > 0.4) {
            return { action: 'skill', skill: chargeSkill, target: getRandomTarget(players) };
        }
        
        // Use AoE if many players
        const aoeSkill = availableSkills.find(s => s.type === 'aoe' || s.id === 'cleave'); // Cleave is brute but checking here just in case
        if (players.length >= 2 && aoeSkill) {
            return { action: 'skill', skill: aoeSkill, target: players[0] }; // Target doesn't matter for AoE
        }
    }

    // Default / Aggressive Fallback
    if (availableSkills.length > 0 && Math.random() > 0.3) {
        // Pick random offensive skill
        const offSkills = availableSkills.filter(s => s.type === 'attack' || s.type === 'magic' || s.type === 'damage_cc');
        if (offSkills.length > 0) {
            const skill = offSkills[Math.floor(Math.random() * offSkills.length)];
            return { action: 'skill', skill: skill, target: bestAction.target };
        }
    }

    return bestAction;
}

function getRandomTarget(players) {
    const live = players.filter(p => !p.isDead);
    if (live.length === 0) return players[0];
    return live[Math.floor(Math.random() * live.length)];
}

function getSkillsForMonster(archetype, level) {
    const arch = MONSTER_ARCHETYPES[archetype];
    if (!arch) return [];
    
    return Object.entries(arch.skills)
        .filter(([id, s]) => !s.isFollowUp && level >= s.levelReq) // Don't return hidden follow-up skills
        .map(([id, s]) => ({ id, ...s, currentEffect: typeof s.effect === 'function' ? s.effect(level) : s.effect }));
}

function getSkillById(archetype, skillId) {
    const arch = MONSTER_ARCHETYPES[archetype];
    if (!arch || !arch.skills[skillId]) return null;
    return { id: skillId, ...arch.skills[skillId] };
}

module.exports = {
    MONSTER_ARCHETYPES,
    getSkillsForMonster,
    getSkillById,
    evaluateAction,
    formatMonsterGuide: () => {
        let msg = `👹 *MONSTER ARCHE TYPES & SKILLS* 👹\n\n`;
        for (const [id, data] of Object.entries(MONSTER_ARCHETYPES)) {
            msg += `◈ *${data.name}* [${data.ai}]\n`;
            for (const [sid, skill] of Object.entries(data.skills)) {
                if(skill.isFollowUp) continue;
                msg += `  • *${skill.name}* (Lv.${skill.levelReq})\n`;
                msg += `    _${skill.msg}_\n`;
            }
            msg += `\n`;
        }
        return msg;
    }
};
