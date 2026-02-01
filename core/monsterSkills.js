// ============================================
// 👹 MONSTER SKILL SYSTEM - Archetypes & Scaling
// ============================================

const MONSTER_ARCHETYPES = {
    // 🛡️ TANK ARCHETYPE
    TANK: {
        name: 'Guardian',
        skills: {
            harden: {
                name: 'Obsidian Skin',
                levelReq: 1,
                cost: 20,
                effect: (level) => ({ type: 'buff', stat: 'def', value: 20 + (level * 5), duration: 3 }),
                msg: 'turns their skin into impenetrable obsidian!'
            },
            taunt: {
                name: 'Provoke',
                levelReq: 5,
                cost: 15,
                effect: (level) => ({ type: 'cc', cc: 'taunt', duration: 2 }),
                msg: 'roars a deafening challenge!'
            },
            shield_bash: {
                name: 'Crushing Bash',
                levelReq: 10,
                cost: 25,
                effect: (level) => ({ type: 'damage_cc', multiplier: 1.2, cc: 'stun', chance: 30 + level }),
                msg: 'slams forward with a massive shield!'
            }
        }
    },

    // ⚔️ BRUTE ARCHETYPE
    BRUTE: {
        name: 'Ravager',
        skills: {
            smash: {
                name: 'Heavy Smash',
                levelReq: 1,
                cost: 25,
                effect: (level) => ({ type: 'damage', multiplier: 1.5 + (level * 0.1) }),
                msg: 'unleashes a bone-crushing strike!'
            },
            cleave: {
                name: 'Whirlwind Cleave',
                levelReq: 10,
                cost: 40,
                effect: (level) => ({ type: 'aoe', multiplier: 1.1 + (level * 0.05) }),
                msg: 'spins wildly, striking everyone!'
            }
        }
    },

    // 🗡️ STALKER ARCHETYPE
    STALKER: {
        name: 'Assassin',
        skills: {
            backstab: {
                name: 'Vile Strike',
                levelReq: 1,
                cost: 15,
                effect: (level) => ({ type: 'damage', multiplier: 1.8, critChance: 20 + level }),
                msg: 'strikes a vital organ from the shadows!'
            },
            poison: {
                name: 'Toxic Blade',
                levelReq: 5,
                cost: 20,
                effect: (level) => ({ type: 'dot', element: 'poison', value: 10 + level, duration: 3 }),
                msg: 'coats their weapon in a deadly toxin!'
            }
        }
    },

    // 🔮 MAGE ARCHETYPE
    MAGE: {
        name: 'Sorcerer',
        skills: {
            firebolt: {
                name: 'Chaos Bolt',
                levelReq: 1,
                cost: 20,
                effect: (level) => ({ type: 'magic', multiplier: 1.6, element: 'fire' }),
                msg: 'hurls a ball of flickering chaos!'
            },
            curse: {
                name: 'Enfeeble',
                levelReq: 10,
                cost: 30,
                effect: (level) => ({ type: 'debuff', stat: 'all', value: 10 + (level * 2), duration: 4 }),
                msg: 'whispers a debilitating ancient curse!'
            }
        }
    },

    // 💚 SUPPORT ARCHETYPE
    SUPPORT: {
        name: 'Cultist',
        skills: {
            heal: {
                name: 'Dark Mend',
                levelReq: 1,
                cost: 25,
                effect: (level) => ({ type: 'heal', value: 50 + (level * 10) }),
                msg: 'knits wounds together with dark energy!'
            },
            buff: {
                name: 'Unholy Zeal',
                levelReq: 5,
                cost: 20,
                effect: (level) => ({ type: 'buff_team', stat: 'atk', value: 20, duration: 3 }),
                msg: 'empowers their allies with frantic chanting!'
            }
        }
    }
};

module.exports = {
    MONSTER_ARCHETYPES,
    getSkillsForMonster: (archetype, level) => {
        const arch = MONSTER_ARCHETYPES[archetype];
        if (!arch) return [];
        
        return Object.entries(arch.skills)
            .filter(([id, s]) => level >= s.levelReq)
            .map(([id, s]) => ({ id, ...s, currentEffect: s.effect(level) }));
    },
    formatMonsterGuide: () => {
        let msg = `👹 **MONSTER ARCHE TYPES & SKILLS** 👹\n\n`;
        for (const [id, data] of Object.entries(MONSTER_ARCHETYPES)) {
            msg += `◈ *${data.name}* (\`${id}\`)\n`;
            for (const [sid, skill] of Object.entries(data.skills)) {
                msg += `  • *${skill.name}* (Lv.${skill.levelReq})\n`;
                msg += `    _${skill.msg}_\n`;
            }
            msg += `\n`;
        }
        return msg;
    }
};
