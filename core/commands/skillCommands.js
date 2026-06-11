// ============================================
// 🌳 SKILL TREE COMMANDS
// ============================================ 

const economy = require('../rpg/economy');
const progression = require('../rpg/progression');
const skillTree = require('../rpg/skillTree');
const botConfig = require('../../botConfig');

const getPrefix = () => botConfig.getPrefix();

// ==========================================
// 📊 DISPLAY SKILL TREE
// ==========================================

async function displaySkillTree(sock, chatId, senderJid, senderName) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const level = progression.getLevel(senderJid);
    const classSystem = require('../rpg/classSystem');
    
    if (!userClass) {
        await sock.sendMessage(chatId, { 
            text: `❌ No class assigned! Register first with \`${getPrefix()} register\`` 
        });
        return;
    }
    
    if (!user.skills) {
        user.skills = {};
    }
    if (skillTree.ensureSkillPointsInitialized(user, userClass.id, level)) {
        economy.saveUser(senderJid);
    }
    
    const lineage = classSystem.getLineage(userClass.id); // e.g. [ARCHMAGE, MAGE, APPRENTICE]

    let msg = `╔═════════════════════════╗\n`;
    msg += `  🌳 *SKILL TREE: ${userClass.name.toUpperCase()}*\n`;
    msg += `╚═════════════════════════╝\n\n`;
    msg += `${userClass.icon} *${senderName}* — Lv.${level}\n`;
    msg += `📊 *Skill Points Available:* ${user.skillPoints || 0}\n\n`;

    // --- Current class tree (SPECIALIZATION) ---
    const currentTree = skillTree.SKILL_TREES[userClass.id.toUpperCase()];
    if (currentTree) {
        msg += `┏━━━✨ *SPECIALIZATION* ━━━┓\n`;
        for (const [, treeData] of Object.entries(currentTree.trees)) {
            msg += `┃  ${treeData.icon} *${treeData.name}*\n`;
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const curLevel = user.skills[skillId] || 0;
                const canLearn = skillTree.canLearnSkill(user.skills, skill);
                const maxed = curLevel >= skill.maxLevel;

                let icon = '🔒';
                if (maxed) icon = '✅'; // Changed to ✅ for David's style
                else if (curLevel > 0) icon = '✅';
                else if (canLearn) icon = '⭕';

                msg += `┃  ${icon} *${skill.name}*`;
                if (curLevel > 0) msg += ` [${curLevel}/${skill.maxLevel}]`;
                msg += `\n`;
                msg += `┃     ╰─ ${skill.desc || skill.description}\n`;
                if (!maxed && canLearn && (user.skillPoints || 0) > 0) {
                    msg += `┃     ✨ \`${getPrefix()} skill up ${skillId}\`\n`;
                }
            }
        }
        msg += `┗━━━━━━━━━━━━━━━━┛\n\n`;
    }

    // --- Lineage / heritage trees ---
    if (lineage.length > 1) {
        const parents = lineage.slice(1); // skip current class
        for (const parentId of parents) {
            const parentClass = classSystem.getClassById(parentId);
            const parentTree = skillTree.SKILL_TREES[parentId.toUpperCase()];
            if (!parentTree || !parentClass) continue;

            let inheritedSection = '';
            for (const [, treeData] of Object.entries(parentTree.trees)) {
                for (const [skillId, skill] of Object.entries(treeData.skills)) {
                    const curLevel = user.skills[skillId] || 0;
                    const canLearn = skillTree.canLearnSkill(user.skills, skill);
                    const maxed = curLevel >= skill.maxLevel;

                    if (curLevel > 0) {
                        const icon = maxed ? '✅' : '✅';
                        inheritedSection += `┃  ${icon} *${skill.name}* [${curLevel}/${skill.maxLevel}]\n`;
                    } else if (canLearn && (user.skillPoints || 0) > 0) {
                        inheritedSection += `┃  ⭕ *${skill.name}* _(Inherited)_\n`;
                        inheritedSection += `┃     ✨ \`${getPrefix()} skill up ${skillId}\`\n`;
                    } else {
                        inheritedSection += `┃  🔒 *${skill.name}*\n`;
                    }
                }
            }

            if (inheritedSection) {
                msg += `┏━━━ 🔰 *${parentClass.name.toUpperCase()} PATH* ━━┓\n`;
                msg += inheritedSection;
                msg += `┗━━━━━━━━━━━━━━━━┛\n\n`;
            }
        }
    }

    msg += `💡 *Commands:*\n`;
    msg += `• \`${getPrefix()} skill up <name>\` — Invest a point\n`;
    msg += `• \`${getPrefix()} skill reset\` — Refund all points (500 Zeni)\n`;
    msg += `• \`${getPrefix()} abilities\` — View combat ability list`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ==========================================
// ⬆️ UPGRADE SKILL
// ==========================================

async function upgradeSkill(sock, chatId, senderJid, skillId) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const level = progression.getLevel(senderJid);
    const classSystem = require('../rpg/classSystem');
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }
    
    if (!user.skills) {
        user.skills = {};
    }
    if (skillTree.ensureSkillPointsInitialized(user, userClass.id, level)) {
        economy.saveUser(senderJid);
    }
    
    // Search the full class lineage for the skill
    const lineage = classSystem.getLineage(userClass.id);
    let targetSkill = null;
    let foundInClassName = null;
    
    const cleanSearch = skillId.replace(/[\s_]/g, "").toLowerCase();
    
    for (const classId of lineage) {
        const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
        if (!tree) continue;
        for (const [, treeData] of Object.entries(tree.trees)) {
            for (const [sId, skill] of Object.entries(treeData.skills)) {
                const cleanSId = sId.replace(/[\s_]/g, "").toLowerCase();
                const cleanName = skill.name.replace(/[\s_]/g, "").toLowerCase();
                if (cleanSId === cleanSearch || cleanName.includes(cleanSearch)) {
                    targetSkill = { ...skill, id: sId };
                    foundInClassName = classSystem.getClassById(classId)?.name || classId;
                    break;
                }
            }
            if (targetSkill) break;
        }
        if (targetSkill) break;
    }
    
    if (!targetSkill) {
        await sock.sendMessage(chatId, { 
            text: `❌ Skill "*${skillId}*" not found in your class lineage!\n\nUse \`${getPrefix()} skill tree\` to see available skills.` 
        });
        return;
    }
    
    const currentLevel = user.skills[targetSkill.id] || 0;
    
    if (currentLevel >= targetSkill.maxLevel) {
        await sock.sendMessage(chatId, { 
            text: `⭐ *${targetSkill.name}* is already maxed at level ${targetSkill.maxLevel}!` 
        });
        return;
    }
    
    if (!skillTree.canLearnSkill(user.skills, targetSkill) && currentLevel === 0) {
        const reqText = Object.entries(targetSkill.requires)
            .map(([req, lvl]) => `*${req}* Lv.${lvl}`)
            .join(', ');
        await sock.sendMessage(chatId, { 
            text: `🔒 Cannot learn *${targetSkill.name}* yet!\n\nRequires: ${reqText}` 
        });
        return;
    }
    
    let cost = 1;
    if (targetSkill.skillPointCost && targetSkill.skillPointCost[currentLevel] !== undefined) {
        cost = targetSkill.skillPointCost[currentLevel];
    }
    if ((user.skillPoints || 0) < cost) {
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough skill points!\n\nNeed: ${cost} | Have: ${user.skillPoints || 0}\n\n💡 Earn points by leveling up!` 
        });
        return;
    }
    
    user.skills[targetSkill.id] = currentLevel + 1;
    user.skillPoints -= cost;
    economy.saveUser(senderJid);
    
    const newLevel = currentLevel + 1;
    const effect = skillTree.getSkillEffect(targetSkill, newLevel);
    
    const heritageNote = (foundInClassName !== userClass?.name) ? `_(${foundInClassName} Heritage)_\n` : '';
    
    let msg = `✨ *SKILL UPGRADED!*\n\n`;
    msg += heritageNote;
    msg += `🌟 *${targetSkill.name}* → Lv.${newLevel}/${targetSkill.maxLevel}\n\n`;
    msg += `📊 Points Remaining: ${user.skillPoints}\n\n`;
    
    if (effect?.type === 'damage' && effect.multiplier) {
        msg += `💥 Damage: ${Math.floor(effect.multiplier * 100)}% ATK\n`;
    } else if (effect?.type === 'heal') {
        msg += `💚 Healing: ${effect.value} HP\n`;
    } else if (effect?.type === 'buff_self' || effect?.type === 'buff_team') {
        msg += `✨ Buff: +${effect.value || '?'}% ${effect.buffType || ''}\n`;
        if (effect.duration) msg += `⏱️ Duration: ${effect.duration} turns\n`;
    }
    
    if (newLevel === targetSkill.maxLevel) {
        msg += `\n⭐ *FULLY MASTERED!*`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ==========================================
// 🔄 RESET SKILLS
// ==========================================

async function resetSkills(sock, chatId, senderJid) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const level = progression.getLevel(senderJid);
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }

    if (!user.skills) {
        user.skills = {};
    }
    skillTree.ensureSkillPointsInitialized(user, userClass.id, level);
    
    if (Object.keys(user.skills).length === 0) {
        await sock.sendMessage(chatId, { text: '❌ You have no skills to reset!' });
        return;
    }
    
    const RESET_COST = 500;
    const balance = economy.getBalance(senderJid);
    
    if (balance < RESET_COST) {
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough Zeni!\n\nReset Cost: ${RESET_COST.toLocaleString()}\nYour Balance: ${balance.toLocaleString()}` 
        });
        return;
    }
    
    // Refund ALL invested points
    const spentPoints = skillTree.calculateSpentPoints(user, userClass.id);
    const totalPoints = (user.skillPoints || 0) + spentPoints;
    user.skills = {};
    user.skillPoints = totalPoints;
    economy.removeMoney(senderJid, RESET_COST);
    economy.saveUser(senderJid);
    
    await sock.sendMessage(chatId, { 
        text: `🔄 *SKILLS RESET!*\n\n💰 Cost: ${RESET_COST.toLocaleString()} Zeni\n📊 Points Restored: ${totalPoints}\n\n💡 Use \`${getPrefix()} skill tree\` to reinvest!` 
    });
}

// ==========================================
// 📋 VIEW ABILITIES (COMBAT LIST)
// ==========================================

async function viewAbilities(sock, chatId, senderJid, senderName) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const classSystem = require('../rpg/classSystem');
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }
    
    const lineage = classSystem.getLineage(userClass.id);
    
    // Collect ALL learned skills, grouped by class origin
    const abilityGroups = [];
    const seen = new Set();
    
    for (const classId of lineage) {
        const classData = classSystem.getClassById(classId);
        const tree = skillTree.SKILL_TREES[classId.toUpperCase()];
        if (!tree || !classData) continue;

        const learnedInClass = [];
        for (const [, treeData] of Object.entries(tree.trees)) {
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const lvl = (user.skills || {})[skillId] || 0;
                if (lvl > 0 && !seen.has(skillId)) {
                    seen.add(skillId);
                    const getVal = (val, l) => Array.isArray(val) ? val[Math.min(l - 1, val.length - 1)] : val;
                    const cost = skill.cost !== undefined ? skill.cost : (getVal(skill.energyCost, lvl) || 0);
                    const effect = skillTree.getSkillEffect(skill, lvl);
                    learnedInClass.push({
                        ...skill,
                        id: skillId,
                        level: lvl,
                        cost,
                        cooldown: getVal(skill.cooldown, lvl),
                        effect,
                    });
                }
            }
        }

        if (learnedInClass.length > 0) {
            abilityGroups.push({
                className: classData.name,
                classIcon: classData.icon,
                isCurrentClass: classId === userClass.id,
                skills: learnedInClass,
            });
        }
    }

    const mirroredAbilities = (user.borrowedSkills || []).map(s => ({ ...s, level: 1, isMirrored: true }));
    const totalCount = abilityGroups.reduce((sum, g) => sum + g.skills.length, 0) + mirroredAbilities.length;

    if (totalCount === 0) {
        await sock.sendMessage(chatId, { 
            text: `⚡ *No abilities learned yet!*\n\nUse \`${getPrefix()} skill tree\` to invest skill points into abilities.\n\n📊 You earn 1 point per level + bonus points every 10 levels.` 
        });
        return;
    }
    
    let msg = `╔═══════════════════════════╗\n`;
    msg += `    ⚡ *ABILITIES: ${senderName}*\n`;
    msg += `╚═══════════════════════════╝\n\n`;
    msg += `${userClass.icon} *${userClass.name}* • ${totalCount} total abilities\n\n`;

    let count = 1;

    for (const group of abilityGroups) {
        const label = group.isCurrentClass
            ? `${group.classIcon} *${group.className}*`
            : `${group.classIcon} _${group.className} Heritage_`;
        msg += `━━━ ${label} ━━━\n`;
        for (const ability of group.skills) {
            const costDisplay = ability.cost > 0 ? `⚡ ${ability.cost}` : `✨ Passive`;
            const cdDisplay = ability.cooldown > 0 ? ` | ⏱️ CD:${ability.cooldown}` : '';
            const animation = ability.animation || ability.effect?.animation || '🔮';
            
            msg += `*${count}.* ${animation} *${ability.name}* [Lv.${ability.level}/${ability.maxLevel}]\n`;
            msg += `   ${costDisplay}${cdDisplay}\n`;
            
            const e = ability.effect;
            if (e) {
                if (e.type === 'damage' && e.multiplier) {
                    msg += `   💥 ${Math.floor(e.multiplier * 100)}% ${e.damageType === 'magic' ? 'MAG' : 'ATK'} damage\n`;
                } else if (e.type === 'aoe' && e.multiplier) {
                    msg += `   💥 ${Math.floor(e.multiplier * 100)}% ATK — ALL ENEMIES\n`;
                } else if (e.type === 'heal' || e.type === 'heal_team') {
                    msg += `   💚 Heals ${e.value} HP${e.type === 'heal_team' ? ' (Party)' : ''}\n`;
                } else if (e.type === 'buff_self' && e.value) {
                    msg += `   ✨ +${e.value}% ${e.buffType || 'stats'} for ${e.duration}t\n`;
                } else if (e.type === 'buff_team' && e.value) {
                    msg += `   ✨ Party +${e.value}% ${e.buffType || 'stats'} for ${e.duration}t\n`;
                } else if (e.type === 'damage_cc') {
                    msg += `   💥 ${Math.floor((e.multiplier || 1) * 100)}% ATK + ${e.ccChance}% ${e.cc || 'CC'}\n`;
                } else if (e.type === 'execute') {
                    msg += `   ⚡ ${Math.floor((e.multiplier || 2) * 100)}% dmg (Executes <${e.threshold}% HP)\n`;
                } else if (e.type === 'passive') {
                    msg += `   🔹 Passive: ${e.trigger || ''}\n`;
                }
            }
            msg += `\n`;
            count++;
        }
    }

    if (mirroredAbilities.length > 0) {
        msg += `━━━ 🪞 *Mirrored Skills* ━━━\n`;
        for (const ability of mirroredAbilities) {
            const energyCost = ability.cost || (Array.isArray(ability.energyCost) ? ability.energyCost[0] : ability.energyCost) || 0;
            msg += `*${count}.* 🪞 *${ability.name}* _(from ${ability.sourceClass})_\n`;
            msg += `   ⚡ ${Math.floor(energyCost * 1.5)} (mirrored cost)\n\n`;
            count++;
        }
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 \`${getPrefix()} combat ability <num>\` in battle\n`;
    msg += `📊 \`${getPrefix()} skill tree\` to learn more skills`;
    
    await sock.sendMessage(chatId, { text: msg });
}

// ==========================================
// 🔮 LEARN SKILL (Essence Mirror)
// ==========================================

async function learnSkill(sock, chatId, senderJid, skillId) {
    const user = economy.getUser(senderJid);
    if (!user) return;

    if (!economy.hasItem(senderJid, 'essence_mirror')) {
        await sock.sendMessage(chatId, { 
            text: `❌ The 🪞 *Essence Mirror* is required to borrow abilities from other class trees.\n\n💰 Available in the shop for 100,000 Zeni.` 
        });
        return;
    }

    const classSystem = require('../rpg/classSystem');
    const userClass = economy.getUserClass(senderJid);
    const lineage = classSystem.getLineage(userClass?.id || '');

    let targetSkill = null;
    let sourceClassId = null;

    const cleanSearch = skillId.replace(/[\s_]/g, "").toLowerCase();

    // Search ALL trees OUTSIDE the player's own lineage
    for (const [classId, classData] of Object.entries(skillTree.SKILL_TREES)) {
        if (lineage.includes(classId)) continue;
        for (const [, treeData] of Object.entries(classData.trees)) {
            for (const [sId, skill] of Object.entries(treeData.skills)) {
                const cleanSId = sId.replace(/[\s_]/g, "").toLowerCase();
                const cleanName = skill.name.replace(/[\s_]/g, "").toLowerCase();
                if (cleanSId === cleanSearch || cleanName.includes(cleanSearch)) {
                    targetSkill = { ...skill, id: sId };
                    sourceClassId = classId;
                    break;
                }
            }
            if (targetSkill) break;
        }
        if (targetSkill) break;
    }

    if (!targetSkill) {
        await sock.sendMessage(chatId, { 
            text: `❌ Skill "*${skillId}*" not found outside your lineage.\n\n💡 Skills from your own class evolution can be learned with \`${getPrefix()} skill up\`.` 
        });
        return;
    }

    if (!user.borrowedSkills) user.borrowedSkills = [];
    if (user.borrowedSkills.some(s => s.id === targetSkill.id)) {
        await sock.sendMessage(chatId, { text: `❌ You've already mirrored *${targetSkill.name}*!` });
        return;
    }

    const MAX_MIRRORED = 3;
    if (user.borrowedSkills.length >= MAX_MIRRORED) {
        await sock.sendMessage(chatId, { 
            text: `❌ Mirror limit reached (${MAX_MIRRORED} skills max).\n\nRemove one with \`${getPrefix()} skill unmirror <number>\`.` 
        });
        return;
    }

    const sourceClass = classSystem.getClassById(sourceClassId);
    user.borrowedSkills.push({
        ...targetSkill,
        sourceClass: sourceClass?.name || sourceClassId
    });
    economy.saveUser(senderJid);

    await sock.sendMessage(chatId, { 
        text: `🪞 *SKILL MIRRORED!*\n\n*${targetSkill.name}* captured from the *${sourceClass?.name || sourceClassId}* tree!\n\n⚠️ Mirrored skills cost 50% more energy in combat.\n📋 Slots used: ${user.borrowedSkills.length}/${MAX_MIRRORED}` 
    });
}

// ==========================================
// 🔄 EVOLVE CLASS
// ==========================================

async function handleEvolve(sock, chatId, senderJid, senderName, args) {
    const classSystem = require('../rpg/classSystem');
    const user = economy.getUser(senderJid);
    
    if (!user) {
        return sock.sendMessage(chatId, { text: `❌ Not registered! Use \`${getPrefix()} register\` first.` });
    }

    const currentClass = classSystem.getClassById(user.class);
    const level = progression.getLevel(senderJid);
    const questsDone = user.questsCompleted || 0;

    const evolutionCheck = classSystem.canEvolve(
        user.class, level, questsDone, user.stats?.dragonsKilled || 0, user.completedTrials || [], user.wallet || 0
    );

    if (!evolutionCheck.canEvolve) {
        if (currentClass?.tier === 'ASCENDED') {
            return sock.sendMessage(chatId, { 
                text: `✨ *${currentClass.name}* — You stand at the very peak of power.\n\nNo higher path exists. Your legend is written.` 
            });
        }
        return sock.sendMessage(chatId, { text: `❌ *Evolution Not Available*\n\n${evolutionCheck.reason}` });
    }
    
    const allPaths = evolutionCheck.evolutions;
    const nextTier = currentClass?.tier === 'STARTER' ? 'EVOLVED' : 'ASCENDED';
    const requiredStone = nextTier === 'EVOLVED' ? 'evolution_stone' : 'ascension_stone';
    const stoneName = requiredStone === 'evolution_stone' ? '💎 Evolution Stone (T2)' : '🔮 Ascension Stone (T3)';

    if (!args[0]) {
        let text = `┏━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        text += `┃  🌟 *CLASS EVOLUTION*\n`;
        text += `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
        text += `*${currentClass?.icon} ${currentClass?.name}* seeks to evolve...\n\n`;
        
        allPaths.forEach((evo, i) => {
            text += `*${i + 1}. ${evo.icon} ${evo.name}*\n`;
            text += `   📝 ${evo.desc}\n`;
            text += `   🎭 ${evo.role}  |  💰 ${evo.evolutionCost.toLocaleString()} Zeni\n`;
            if (evo.passive) text += `   ⚡ *${evo.passive.name}:* _${evo.passive.desc}_\n`;
            if (evo.evolves_into && evo.evolves_into.length > 0) {
                const nextTierNames = evo.evolves_into.map(evoId => {
                    const c = classSystem.getClassById(evoId);
                    return c ? `${c.icon} ${c.name}` : evoId;
                }).join(', ');
                text += `   ⏫ Next Tier: ${nextTierNames}\n`;
            }
            if (!evo.meetsRequirements) {
                text += `   🔒 Missing: ${evo.missingRequirements.join(', ')}\n`;
            } else {
                text += `   ✅ Available!\n`;
            }
            text += `\n`;
        });
        
        text += `📦 Requires: ${stoneName}\n\n`;
        text += `✅ *Your existing skills are PRESERVED on evolution.*\n`;
        text += `You keep all learned abilities and receive bonus skill points.\n\n`;
        text += `\`${getPrefix()} evolve <number>\` to choose.`;
        
        return sock.sendMessage(chatId, { text });
    }

    const choiceNum = parseInt(args[0]);
    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > allPaths.length) {
        return sock.sendMessage(chatId, { text: '❌ Invalid choice!' });
    }
    
    const chosen = allPaths[choiceNum - 1];
    const nonTrialMissing = chosen.missingRequirements.filter(reqStr => !reqStr.toLowerCase().includes('defeat') && !reqStr.toLowerCase().includes('trial'));
    if (nonTrialMissing.length > 0) {
        return sock.sendMessage(chatId, { 
            text: `🔒 *Path Locked*\n\n*${chosen.name}* requires:\n• ${chosen.missingRequirements.join('\n• ')}` 
        });
    }

    const inventorySystem = require('../rpg/inventorySystem');
    
    if (!inventorySystem.hasItem(senderJid, requiredStone)) {
        return sock.sendMessage(chatId, { text: `❌ You need a *${stoneName}* to evolve! Buy one from the shop.` });
    }

    if (chosen.requirement?.item && !inventorySystem.hasItem(senderJid, chosen.requirement.item)) {
        return sock.sendMessage(chatId, { text: `❌ Special item required: *${chosen.requirement.item}*` });
    }

    const balance = economy.getBalance(senderJid);
    if (balance < chosen.evolutionCost) {
        return sock.sendMessage(chatId, { 
            text: `❌ Need ${chosen.evolutionCost.toLocaleString()} Zeni! (Have: ${balance.toLocaleString()})` 
        });
    }

    // === TRIALS SYSTEM: Trigger Boss Fight if required ===
    if (chosen.requirement?.trialBoss && !(user.completedTrials || []).includes(chosen.requirement.trialBoss)) {
        const guildAdventure = require('../rpg/guildAdventure');
        const sessionKey = `${chatId}_${senderJid}`;
        
        if (guildAdventure.isUserInAdventure(sessionKey)) {
            return sock.sendMessage(chatId, { text: `❌ Finish your current adventure before starting your Class Trial!` });
        }

        const trialMsg = `⚔️ *CLASS TRIAL INITIATED* ⚔️\n\nTo evolve into a *${chosen.name}*, you must first defeat the **${chosen.requirement.trialBoss.replace('_', ' ')}**!\n\nPrepare yourself... the battle begins in 5 seconds.`;
        await sock.sendMessage(chatId, { text: trialMsg });

        setTimeout(async () => {
            const result = await guildAdventure.initAdventure(
                sock, 
                chatId, 
                null, // No Groq required for trials
                'TRIAL', 
                true, // Always solo
                null, // No rank needed
                senderJid, 
                null, // No smartGroqCall
                {
                    trialBoss: chosen.requirement.trialBoss,
                    targetClass: chosen.id,
                    stoneId: requiredStone,
                    cost: chosen.evolutionCost
                }
            );
            if (result && result.msg) {
                await sock.sendMessage(chatId, { text: result.msg });
            }
        }, 5000);
        
        return;
    }

    // === EVOLUTION: PRESERVE SKILLS MODEL (If no trial or trial already won) ===
    inventorySystem.removeItem(senderJid, requiredStone, 1);
    if (chosen.requirement?.item) inventorySystem.removeItem(senderJid, chosen.requirement.item, 1);
    economy.removeMoney(senderJid, chosen.evolutionCost, `Evolved to ${chosen.name}`);
    
    const oldClassName = currentClass?.name || 'Unknown';

    // Calculate HP ratio before changing class to scale it properly
    const oldMaxHp = progression.getBaseStats(senderJid, user.class).hp;
    const currentHp = user.stats?.hp || oldMaxHp;
    const ratio = Math.min(1, currentHp / oldMaxHp);

    user.class = chosen.id;

    // 💡 BUG FIX: Update actual User base stats in the database
    // Ensure the user stats object exists
    if (!user.stats) user.stats = { hp: 100, maxHp: 100, level: 1, xp: 0 };
    
    // Re-initialize base stats to the new class's defaults
    // (Progression.getBaseStats will combine these with level scaling)
    Object.assign(user.stats, chosen.stats);

    // Scale current and max HP based on level growth
    const newMaxHp = progression.getBaseStats(senderJid, chosen.id).hp;
    user.stats.hp = Math.round(newMaxHp * ratio);
    user.stats.maxHp = newMaxHp;

    // PRESERVE SKILLS: Do not wipe user.skills
    if (!user.skills) user.skills = {};
    
    // Initialize skill points if undefined/null
    skillTree.ensureSkillPointsInitialized(user, user.class, level);
    
    // Grant Bonus Points for Evolution Tier
    const bonusPoints = nextTier === 'ASCENDED' ? 10 : 5;
    user.skillPoints = (user.skillPoints || 0) + bonusPoints;
    
    user.evolvedAt = level;
    if (!user.evolutionHistory) user.evolutionHistory = [];
    user.evolutionHistory.push({ from: oldClassName, to: chosen.name, level, timestamp: Date.now() });
    
    economy.saveUser(senderJid);

    const statEmojis = { hp: '❤️', atk: '⚔️', def: '🛡️', mag: '🔮', spd: '💨', luck: '🍀', crit: '💥' };

    let successMsg = `┏━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
    successMsg += `┃   ✨ *EVOLUTION COMPLETE!*\n`;
    successMsg += `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    successMsg += `*${oldClassName}* ──▶ *${chosen.name}* ${chosen.icon}\n\n`;
    
    successMsg += `📊 *New Base Stats:*\n`;
    Object.entries(chosen.stats).forEach(([stat, val]) => {
        successMsg += `${statEmojis[stat] || '•'} ${stat.toUpperCase()}: ${val}\n`;
    });
    
    successMsg += `\n✅ *Skills Preserved!*\n`;
    successMsg += `🎁 *Tier Bonus:* +${bonusPoints} Skill Points\n`;
    successMsg += `📊 *Total Points Available:* ${user.skillPoints}\n\n`;
    
    if (chosen.passive) {
        successMsg += `⚡ *New Passive — ${chosen.passive.name}:*\n`;
        successMsg += `_${chosen.passive.desc}_\n\n`;
    }
    
    successMsg += `🌳 \`${getPrefix()} skill tree\` to continue your path!`;

    return sock.sendMessage(chatId, { text: successMsg });
}

module.exports = {
    displaySkillTree,
    upgradeSkill,
    resetSkills,
    viewAbilities,
    learnSkill,
    handleEvolve,
};
