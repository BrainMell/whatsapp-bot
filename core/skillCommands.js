// ============================================
// 🌳 SKILL TREE COMMANDS
// ============================================ 

const economy = require('./economy');
const progression = require('./progression');
const skillTree = require('./skillTree');
const botConfig = require('../botConfig');

const getPrefix = () => botConfig.getPrefix();

// ==========================================
// 📊 DISPLAY SKILL TREE
// ==========================================

async function displaySkillTree(sock, chatId, senderJid, senderName) {
    // Get user data
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    const level = progression.getLevel(senderJid);
    const classSystem = require('./classSystem');
    
    if (!userClass) {
        await sock.sendMessage(chatId, { 
            text: `❌ No class assigned! Register first with \`${getPrefix()} register\`` 
        });
        return;
    }
    
    // Initialize skills if needed
    if (!user.skills) {
        user.skills = {};
        user.skillPoints = skillTree.calculateSkillPoints(level);
        economy.saveUser(senderJid);
    }
    
    let msg = `╔═════════════════════╗\n`;
    msg += `     🌳 *SKILL TREE: ${userClass.name.toUpperCase()}* \n`;
    msg += `╚═════════════════════╝\n\n`;

    msg += `👤 *Adventurer:* ${senderName}\n`;
    msg += `${userClass.icon} *Class:* ${userClass.name} (Lv.${level})\n`;
    msg += `📊 *Available Points:* ${user.skillPoints || 0}\n\n`;

    // 1. Display Current Specialized Tree (Case-insensitive lookup)
    const treeId = userClass.id.toUpperCase();
    const tree = skillTree.SKILL_TREES[treeId];
    
    if (tree) {
        msg += `┏━━━✨ *SPECIALIZATION* ━━━┓\n`;
        for (const [treeName, treeData] of Object.entries(tree.trees)) {
            msg += `┃  ${treeData.icon} *${treeData.name}*\n`;
            
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const currentLevel = user.skills[skillId] || 0;
                const canLearn = skillTree.canLearnSkill(user.skills, skill);
                const maxed = currentLevel >= skill.maxLevel;
                
                let boxIcon = currentLevel > 0 ? '✅' : (canLearn ? '⭕' : '🔒');
                msg += `┃  ${boxIcon} *${skill.name}*`;
                if (currentLevel > 0) msg += ` [${currentLevel}/${skill.maxLevel}]`;
                msg += `\n┃     ╰─ ${skill.desc || skill.description}\n`;
                
                if (!maxed && canLearn && user.skillPoints > 0) {
                    msg += `┃     ✨ \`${getPrefix()} skill up ${skillId}\`\n`;
                }
            }
        }
        msg += `┗━━━━━━━━━━━━━━━━┛\n\n`;
    }

    // 2. Display Basic Techniques (Inherited Skills)
    if (userClass.evolvedFrom) {
        let baseClassId = userClass.evolvedFrom.toUpperCase();
        const baseClass = classSystem.getClassById(baseClassId);
        const baseTree = skillTree.SKILL_TREES[baseClassId];
        
        if (baseTree) {
            let baseSkillsMsg = "";
            for (const [treeId, treeData] of Object.entries(baseTree.trees)) {
                for (const [skillId, skill] of Object.entries(treeData.skills)) {
                    const currentLevel = user.skills[skillId] || 0;
                    if (currentLevel > 0) {
                        baseSkillsMsg += `┃  • *${skill.name}* (Lv.${currentLevel})\n`;
                    }
                }
            }
            if (baseSkillsMsg) {
                msg += `┏━━━🔰 *BASIC TECHNIQUES* ━┓\n`;
                msg += `┃ _Inherited from ${baseClass.name}_\n`;
                msg += baseSkillsMsg;
                msg += `┗━━━━━━━━━━━━━━━━━━┛\n\n`;
            }
        }
    }

    msg += `💡 *Commands:*
• \`${getPrefix()} skill up <name>\`
• \`${getPrefix()} skill reset\`
• \`${getPrefix()} abilities\``;
    
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
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }
    
    // Initialize skills if needed
    if (!user.skills) {
        user.skills = {};
        user.skillPoints = skillTree.calculateSkillPoints(level);
    }
    
    // Find the skill
    const tree = skillTree.SKILL_TREES[userClass.id];
    let targetSkill = null;
    let treeName = null;
    
    for (const [tName, treeData] of Object.entries(tree.trees)) {
        for (const [sId, skill] of Object.entries(treeData.skills)) {
            if (sId.toLowerCase() === skillId.toLowerCase() || 
                skill.name.toLowerCase().includes(skillId.toLowerCase())) {
                targetSkill = skill;
                treeName = tName;
                break;
            }
        }
        if (targetSkill) break;
    }
    
    if (!targetSkill) {
        await sock.sendMessage(chatId, { 
            text: `❌ Skill "${skillId}" not found!\n\nUse 
	${getPrefix()} skill tree
 to see all skills.` 
        });
        return;
    }
    
    // Check if can learn
    const currentLevel = user.skills[targetSkill.id] || 0;
    
    if (currentLevel >= targetSkill.maxLevel) {
        await sock.sendMessage(chatId, { 
            text: `❌ ${targetSkill.name} is already maxed at level ${targetSkill.maxLevel}!` 
        });
        return;
    }
    
    if (!skillTree.canLearnSkill(user.skills, targetSkill) && currentLevel === 0) {
        const reqText = Object.entries(targetSkill.requires)
            .map(([req, lvl]) => `${req} level ${lvl}`)
            .join(', ');
        await sock.sendMessage(chatId, { 
            text: `❌ Cannot learn ${targetSkill.name}!\n\nRequires: ${reqText}` 
        });
        return;
    }
    
    // Check skill points
    const cost = skillTree.getSkillCost(currentLevel + 1);
    if ((user.skillPoints || 0) < cost) {
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough skill points!\n\nNeed: ${cost}\nHave: ${user.skillPoints || 0}\n\n💡 Gain skill points by leveling up!` 
        });
        return;
    }
    
    // Upgrade!
    user.skills[targetSkill.id] = currentLevel + 1;
    user.skillPoints -= cost;
    economy.saveUser(senderJid);
    
    const newLevel = currentLevel + 1;
    const effect = skillTree.getSkillEffect(targetSkill, newLevel);
    
    let msg = `✨ *SKILL UPGRADED!* ✨\n\n`;
    msg += `${targetSkill.name} → Level ${newLevel}/${targetSkill.maxLevel}\n\n`;
    msg += `📊 Skill Points: ${user.skillPoints} remaining\n\n`;
    
    // Show effect preview
    if (effect.type === 'damage') {
        msg += `💥 Damage: ${Math.floor(effect.multiplier * 100)}% ATK\n`;
    } else if (effect.type === 'heal') {
        msg += `💚 Healing: ${effect.value} HP\n`;
    } else if (effect.type === 'buff_self' || effect.type === 'buff_team') {
        msg += `✨ Buff: +${effect.value}% ${effect.buffType}\n`;
        msg += `⏱️ Duration: ${effect.duration} turns\n`;
    }
    
    if (newLevel === targetSkill.maxLevel) {
        msg += `\n⭐ *MAXED!* This skill is now fully upgraded!`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

// ==========================================
// 🔄 RESET SKILLS
// ==========================================

async function resetSkills(sock, chatId, senderJid) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const level = progression.getLevel(senderJid);
    
    if (!user.skills || Object.keys(user.skills).length === 0) {
        await sock.sendMessage(chatId, { 
            text: '❌ You have no skills to reset!' 
        });
        return;
    }
    
    const RESET_COST = 500;
    const balance = economy.getBalance(senderJid);
    
    if (balance < RESET_COST) {
        await sock.sendMessage(chatId, { 
            text: `❌ Not enough Zeni!\n\nReset Cost: ${RESET_COST}\nYour Balance: ${balance}` 
        });
        return;
    }
    
    // Reset
    const totalPoints = skillTree.calculateSkillPoints(level);
    user.skills = {};
    user.skillPoints = totalPoints;
    economy.removeMoney(senderJid, RESET_COST);
    economy.saveUser(senderJid);
    
    await sock.sendMessage(chatId, { 
        text: `✅ *SKILLS RESET!*

💰 Paid: ${RESET_COST} Zeni
📊 Skill Points: ${totalPoints}

💡 Use 
	${getPrefix()} skill tree
 to reallocate your points!` 
    });
}

// ==========================================
// 📋 VIEW ABILITIES
// ==========================================

async function viewAbilities(sock, chatId, senderJid, senderName) {
    economy.initializeClass(senderJid);
    const user = economy.getUser(senderJid);
    const userClass = economy.getUserClass(senderJid);
    
    if (!userClass) {
        await sock.sendMessage(chatId, { text: '❌ No class assigned!' });
        return;
    }
    
    const hasRegularSkills = user.skills && Object.keys(user.skills).length > 0;
    const hasMirroredSkills = user.borrowedSkills && user.borrowedSkills.length > 0;

    if (!hasRegularSkills && !hasMirroredSkills) {
        await sock.sendMessage(chatId, { 
            text: `❌ No abilities learned yet!\n\n💡 Use ${getPrefix()} skill tree to learn abilities or use the 🪞 Essence Mirror!` 
        });
        return;
    }
    
    let msg = `╔═══════════════════════╗\n`;
    msg += `      ⚡ *YOUR ABILITIES* ⚡\n`;
    msg += `╚═══════════════════════╝\n\n`;
    
    msg += `${userClass.icon} *${userClass.name}*\n\n`;
    
    // Get all learned skills from ALL trees
    const learnedAbilities = [];
    
    for (const [classId, classData] of Object.entries(skillTree.SKILL_TREES)) {
        for (const [treeName, treeData] of Object.entries(classData.trees)) {
            for (const [skillId, skill] of Object.entries(treeData.skills)) {
                const level = user.skills[skillId] || 0;
                if (level > 0 && !learnedAbilities.some(a => a.id === skillId)) {
                    const getVal = (val, lvl) => Array.isArray(val) ? val[Math.min(lvl - 1, val.length - 1)] : val;
                    const actualCost = skill.cost !== undefined ? skill.cost : (getVal(skill.energyCost, level) || 0);
                    
                    learnedAbilities.push({
                        ...skill,
                        id: skillId,
                        level,
                        cost: actualCost,
                        cooldown: getVal(skill.cooldown, level),
                        treeIcon: treeData.icon || '🛡️',
                        treeColor: treeData.color || ''
                    });
                }
            }
        }
    }

    // Add Mirrored Skills to the list
    const mirroredAbilities = [];
    if (user.borrowedSkills && user.borrowedSkills.length > 0) {
        user.borrowedSkills.forEach(s => {
            mirroredAbilities.push({
                ...s,
                level: 1,
                isMirrored: true
            });
        });
    }
    
    if (learnedAbilities.length === 0 && mirroredAbilities.length === 0) {
        msg += `No active abilities learned yet!`;
    } else {
        let count = 1;
        
        if (learnedAbilities.length > 0) {
            msg += `⚔️ *Class Skills:*\n`;
            learnedAbilities.forEach(ability => {
                const colorStr = ability.treeColor ? `${ability.treeColor} ` : '';
                msg += `${count}. ${colorStr}${ability.treeIcon} *${ability.name}* [Lv.${ability.level}]\n`;
                
                const costDisplay = (ability.cost > 0) ? `⚡ Energy: ${ability.cost}` : `✨ Passive`;
                msg += `   ${costDisplay} | ⏱️ CD: ${ability.cooldown || 0}s\n`;
                
                // Show effect
                const effect = skillTree.getSkillEffect(ability, ability.level);
                if (effect.type === 'damage') {
                    msg += `   💥 ${Math.floor(effect.multiplier * 100)}% damage\n`;
                } else if (effect.type === 'heal') {
                    msg += `   💚 Heals ${effect.value} HP\n`;
                }
                msg += `\n`;
                count++;
            });
        }
        
        if (mirroredAbilities.length > 0) {
            msg += `━━━━━━━━━━━━━━━━━\n`;
            msg += `🪞 *MIRRORED SKILLS*\n\n`;
            mirroredAbilities.forEach(ability => {
                const energyCost = ability.cost || (Array.isArray(ability.energyCost) ? ability.energyCost[0] : ability.energyCost) || 0;
                msg += `${count}. 🪞 *${ability.name}* [Lv.1]\n`;
                msg += `   📝 from ${ability.sourceClass}\n`;
                msg += `   ⚡ Energy: ${Math.floor(energyCost * 1.5)}\n\n`;
                count++;
            });
        }
    }
    
    msg += `💡 Use \`${getPrefix()} combat ability <number>\` in battle!`;
    
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
            text: `❌ You need the 🪞 *Essence Mirror* to learn skills from other classes!\n\nBuy it from the shop for 100,000 Zeni.` 
        });
        return;
    }

    // List skills if no ID provided
    if (!skillId) {
        let listMsg = `🔮 *ESSENCE MIRROR: LEARNABLE SKILLS* 🔮\n\n`;
        listMsg += `_You can mirror Tier 1 skills from other classes._\n\n`;
        
        for (const [classId, classData] of Object.entries(skillTree.SKILL_TREES)) {
            let classSkills = [];
            for (const [treeName, treeData] of Object.entries(classData.trees)) {
                for (const [sId, skill] of Object.entries(treeData.skills)) {
                    if (skill.tier === 1) {
                        classSkills.push(`• *${skill.name}* (\`${sId}\`)`);
                    }
                }
            }
            if (classSkills.length > 0) {
                listMsg += `${classData.icon} *${classData.name}:*\n${classSkills.join('\n')}\n\n`;
            }
        }
        
        listMsg += `⚠️ *DISCLAIMERS:*\n`;
        listMsg += `• You can only mirror up to *2 skills*.\n`;
        listMsg += `• Mirrored skills are locked at *Level 1*.\n`;
        listMsg += `• Mirrored skills cost *50% more Energy*.\n\n`;
        listMsg += `⚔️ *COMBAT:* Use \`${botConfig.getPrefix()} abilities\` to see their number, then \`${botConfig.getPrefix()} combat ability <num>\` during your turn.\n\n`;
        listMsg += `👉 Usage: \`${botConfig.getPrefix()} skill learn <skill_id>\``;
        
        await sock.sendMessage(chatId, { text: listMsg });
        return;
    }

    if (!user.borrowedSkills) user.borrowedSkills = [];
    if (user.borrowedSkills.length >= 2) {
        await sock.sendMessage(chatId, { 
            text: `❌ You can only mirror up to 2 skills at a time!` 
        });
        return;
    }

    // Find the skill in any class tree
    let targetSkill = null;
    let skillClass = null;

    for (const [classId, classData] of Object.entries(skillTree.SKILL_TREES)) {
        for (const [treeName, treeData] of Object.entries(classData.trees)) {
            for (const [sId, skill] of Object.entries(treeData.skills)) {
                if (sId.toLowerCase() === skillId.toLowerCase() || 
                    skill.name.toLowerCase().includes(skillId.toLowerCase())) {
                    
                    // Only Tier 1 skills can be mirrored
                    if (skill.tier !== 1) {
                        await sock.sendMessage(chatId, { 
                            text: `❌ You can only mirror Tier 1 skills!` 
                        });
                        return;
                    }
                    
                    targetSkill = skill;
                    skillClass = classData.name;
                    break;
                }
            }
            if (targetSkill) break;
        }
        if (targetSkill) break;
    }

    if (!targetSkill) {
        await sock.sendMessage(chatId, { 
            text: `❌ Skill "${skillId}" not found!` 
        });
        return;
    }

    // Check if player already has this skill (either naturally or mirrored)
    const userClass = economy.getUserClass(senderJid);
    if (skillClass === userClass.name) {
        await sock.sendMessage(chatId, { 
            text: `❌ This is already a skill for your class! Upgrade it normally.` 
        });
        return;
    }

    if (user.borrowedSkills.some(s => s.id === targetSkill.id)) {
        await sock.sendMessage(chatId, { 
            text: `❌ You already learned this skill!` 
        });
        return;
    }

    // Learn it! (Always Lv 1, cannot upgrade)
    user.borrowedSkills.push({
        ...targetSkill,
        level: 1,
        sourceClass: skillClass
    });
    
    economy.saveUser(senderJid);

    await sock.sendMessage(chatId, { 
        text: `✨ *SKILL MIRRORED!* ✨\n\nYou have learned *${targetSkill.name}* from the *${skillClass}* class!\n\n💡 *Combat Usage:* Mirrored skills appear in your \`${botConfig.getPrefix()} abilities\` list and can be used with \`${botConfig.getPrefix()} combat ability <num> [target]\`.\n\n⚠️ *Note:* Mirrored skills stay at Level 1 and cost 50% more Energy.` 
    });
}

// ==========================================
// 📤 EXPORTS
// ==========================================

async function handleEvolve(sock, chatId, senderJid, senderName, args) {
    const progression = require('./progression');
    const classSystem = require('./classSystem');
    const user = economy.getUser(senderJid);
    
    if (!user) {
        return sock.sendMessage(chatId, { text: '❌ You need to start your adventure first! Use `.j register`' });
    }

    const currentClass = classSystem.getClassById(user.class);
    const level = progression.calculateLevel(user.xp || 0);

    // Check if can evolve
    const evolutionCheck = classSystem.canEvolve(
        user.class,
        level,
        user.questsCompleted || 0
    );

    if (!evolutionCheck.canEvolve) {
        if (currentClass.tier === 'ASCENDED') {
            return sock.sendMessage(chatId, { text: '✨ You have reached the pinnacle of power!' });
        }
        
        let reqMsg = `📋 *Evolution Requirements for ${currentClass.name}*\n\n`;
        const nextTier = currentClass.tier === 'STARTER' ? 'EVOLVED' : 'ASCENDED';
        const reqLevel = nextTier === 'EVOLVED' ? 10 : 30;
        const reqQuests = nextTier === 'EVOLVED' ? 3 : 15;
        const reqGold = nextTier === 'EVOLVED' ? 5000 : 50000;

        reqMsg += `• Level: ${level}/${reqLevel} ${level >= reqLevel ? '✅' : '❌'}\n`;
        reqMsg += `• Quests: ${user.questsCompleted || 0}/${reqQuests} ${(user.questsCompleted || 0) >= reqQuests ? '✅' : '❌'}\n`;
        reqMsg += `• Gold: ${user.gold || 0}/${reqGold} ${(user.gold || 0) >= reqGold ? '✅' : '❌'}\n`;
        
        return sock.sendMessage(chatId, { text: reqMsg });
    }
    
    const availablePaths = evolutionCheck.evolutions;

    // If no choice specified, show options
    if (!args[0]) {
        let text = `🌟 *CLASS EVOLUTION AVAILABLE* 🌟\n\n`;
        text += `Choose your evolution path for **${currentClass.name}**!\n\n`;
        
        availablePaths.forEach((evo, i) => {
            text += `*${i + 1}. ${evo.icon} ${evo.name}*\n`;
            text += `📝 ${evo.desc}\n`;
            text += `🎭 **Role:** ${evo.role}\n`;
            text += `💰 **Cost:** ${evo.evolutionCost} Zeni\n`;
            text += `⚡ **Passive:** ${evo.passive.name}\n\n`;
        });

        text += `Use: \`${getPrefix()} evolve <number>\` to choose.\n`;
        text += `⚠️ *Note:* This decision is permanent and will reset your skills!`;
        
        return sock.sendMessage(chatId, { text });
    }

    // Process choice
    const choiceNum = parseInt(args[0]);
    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > availablePaths.length) {
        return sock.sendMessage(chatId, { text: '❌ Invalid choice! Use a number from the list.' });
    }
    
    const chosen = availablePaths[choiceNum - 1];
    const inventorySystem = require('./inventorySystem');
    
    // Check for Evolution/Ascension Stone
    const requiredStone = currentClass.tier === 'STARTER' ? 'evolution_stone' : 'ascension_stone';
    const stoneName = requiredStone === 'evolution_stone' ? 'Evolution Stone (T2)' : 'Ascension Stone (T3)';

    if (!inventorySystem.hasItem(senderJid, requiredStone)) {
        return sock.sendMessage(chatId, { text: `❌ You need an **${stoneName}** to evolve! Buy one from the shop.` });
    }

    // Check gold
    if ((user.gold || 0) < chosen.evolutionCost) {
        return sock.sendMessage(chatId, { text: `❌ You need ${chosen.evolutionCost} Zeni! (You have: ${user.gold || 0})` });
    }

    // Perform evolution
    inventorySystem.removeItem(senderJid, requiredStone, 1);
    user.gold -= chosen.evolutionCost;
    const oldClassName = currentClass.name;
    user.class = chosen.id;

    // Refund ALL skill points (100% refund)
    const currentSkillPoints = user.skillPoints || 0;
    const spentPoints = Object.values(user.skills || {}).reduce((sum, level) => sum + level, 0);
    user.skillPoints = currentSkillPoints + spentPoints;
    user.skills = {}; // Reset skills

    // Mark evolution
    user.evolvedAt = level;
    user.evolutionHistory = user.evolutionHistory || [];
    user.evolutionHistory.push({
        from: oldClassName,
        to: chosen.name,
        level: level,
        timestamp: Date.now()
    });
    
    economy.saveUser(senderJid);

    let successMsg = `✨ *EVOLUTION COMPLETE!* ✨\n\n`;
    successMsg += `**${oldClassName}** ➔ **${chosen.name}** ${chosen.icon}\n\n`;
    
    successMsg += `📊 *New Stats:*\n`;
    Object.entries(chosen.stats).forEach(([stat, val]) => {
        successMsg += `• ${stat.toUpperCase()}: ${val}\n`;
    });
    
    successMsg += `\n💎 *Skill Points Refunded:* ${spentPoints}\n`;
    successMsg += `📊 *Available Points:* ${user.skillPoints}\n\n`;
    
    successMsg += `⚡ *New Passive:* **${chosen.passive.name}**\n`;
    successMsg += `_${chosen.passive.desc}_\n\n`;
    
    successMsg += `💡 Use \`${getPrefix()} skills\` to view your new abilities!`;

    return sock.sendMessage(chatId, { text: successMsg });
}

module.exports = {
    displaySkillTree,
    upgradeSkill,
    resetSkills,
    viewAbilities,
    learnSkill,
    handleEvolve,
    skillTreeCommands: (sock, chatId, senderJid, senderName, command, args) => {
        const lowerCmd = command.toLowerCase();
        if (lowerCmd === 'skills' || lowerCmd === 'skilltree') return displaySkillTree(sock, chatId, senderJid, senderName);
        if (lowerCmd === 'skillup' || lowerCmd === 'upgrade') return upgradeSkill(sock, chatId, senderJid, args[0]);
        if (lowerCmd === 'reset' || lowerCmd === 'skillreset') return resetSkills(sock, chatId, senderJid);
        if (lowerCmd === 'abilities') return viewAbilities(sock, chatId, senderJid, senderName);
        if (lowerCmd === 'skilllearn' || lowerCmd === 'learn') return learnSkill(sock, chatId, senderJid, args[0]);
        if (lowerCmd === 'evolve') return handleEvolve(sock, chatId, senderJid, senderName, args);
    }
};

