// ============================================
// 🎭 CLASS COMMANDS
// ============================================

const classSystem = require('./classSystem');
const botConfig = require('../botConfig');

const getPrefix = () => botConfig.getPrefix();

// Tier ordering and labels
const TIER_CONFIG = {
    STARTER: { label: '⚪ STARTER CLASSES', icon: '🌱', desc: 'Where every legend begins.' },
    EVOLVED: { label: '🔵 EVOLVED CLASSES (Tier 2)', icon: '💎', desc: 'The path sharpens.' },
    ASCENDED: { label: '🟣 ASCENDED CLASSES (Tier 3)', icon: '🔮', desc: 'True mastery achieved.' },
};

// Role grouping within each tier
const ROLE_ORDER = ['TANK', 'BRUTE', 'DPS', 'MAGIC_DPS', 'MAGE', 'SUPPORT', 'LEGENDARY'];

async function displayClasses(sock, chatId) {
    const classes = classSystem.getAllClasses();
    
    // Group by tier then role
    const tiers = { STARTER: [], EVOLVED: [], ASCENDED: [] };
    
    Object.values(classes).forEach(c => {
        const tier = c.tier || 'EVOLVED';
        if (tiers[tier]) tiers[tier].push(c);
    });

    let msg = `╔═════════════════╗\n`;
    msg += `   🛡️ *CLASS GUIDE*\n`;
    msg += `╚═════════════════╝\n\n`;
    msg += `_Every adventurer starts somewhere._\n`;
    msg += `_Evolve your class to unlock new power._\n\n`;

    for (const [tierKey, classList] of Object.entries(tiers)) {
        if (classList.length === 0) continue;
        
        const tierConf = TIER_CONFIG[tierKey];
        msg += `━━━━━━━━━━━━━━━━━\n`;
        msg += `${tierConf.icon} *${tierConf.label}*\n`;
        msg += `_${tierConf.desc}_\n\n`;
        
        // Sort by role within tier
        const sorted = [...classList].sort((a, b) => {
            const roleA = ROLE_ORDER.indexOf(a.role || 'DPS');
            const roleB = ROLE_ORDER.indexOf(b.role || 'DPS');
            return (roleA === -1 ? 99 : roleA) - (roleB === -1 ? 99 : roleB);
        });
        
        for (const c of sorted) {
            msg += `${c.icon} *${c.name}*`;
            if (c.role) msg += ` _(${c.role})_`;
            msg += `\n`;
            // Short desc (first sentence only)
            const shortDesc = c.desc.split('.')[0] + '.';
            msg += `   ${shortDesc}\n`;
            
            if (c.passive) {
                msg += `   ⚡ *${c.passive.name}:* _${c.passive.desc}_\n`;
            }
            
            if (c.evolves_into?.length > 0) {
                const evoNames = c.evolves_into.map(id => {
                    const ec = classes[id];
                    return ec ? `${ec.icon} ${ec.name}` : id;
                });
                msg += `   ⏫ → ${evoNames.join(', ')}\n`;
            } else if (c.evolvedFrom) {
                const parent = classes[c.evolvedFrom];
                if (parent) msg += `   ⬆️ From: ${parent.icon} ${parent.name}\n`;
            }
            msg += `\n`;
        }
    }
    
    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 *Commands:*\n`;
    msg += `• \`${getPrefix()} evolve\` — Check your evolution options\n`;
    msg += `• \`${getPrefix()} char\` — View your character sheet\n`;
    msg += `• \`${getPrefix()} skill tree\` — View your skills`;
    
    await sock.sendMessage(chatId, { text: msg });
}

async function displayEvolutionTree(sock, chatId, classId) {
    const classes = classSystem.getAllClasses();
    const targetClass = classSystem.getClassById(classId?.toUpperCase());
    
    if (!targetClass) {
        await sock.sendMessage(chatId, { 
            text: `❌ Class "${classId}" not found.\n\nUse \`${getPrefix()} classes\` to see all classes.` 
        });
        return;
    }
    
    let msg = `┏━━━━━━━━━━━━━━━┓\n`;
    msg += `┃ 🌳 *EVOLUTION*  ┃\n`;
    msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    // Walk up the lineage to find the root
    const lineage = classSystem.getLineage(targetClass.id);
    const root = classSystem.getClassById(lineage[lineage.length - 1]);
    
    // Build tree from root
    function buildTree(cls, depth = 0) {
        const indent = '  '.repeat(depth);
        const connector = depth > 0 ? '└─ ' : '';
        const isTarget = cls.id === targetClass.id;
        const nameStr = isTarget ? `*${cls.icon} ${cls.name}* ◄ YOU` : `${cls.icon} ${cls.name}`;
        
        msg += `${indent}${connector}${nameStr} _(${cls.tier})_\n`;
        
        if (cls.evolves_into?.length > 0) {
            for (const evoId of cls.evolves_into) {
                const evoClass = classes[evoId];
                if (evoClass) buildTree(evoClass, depth + 1);
            }
        }
    }
    
    if (root) buildTree(root);
    
    if (targetClass.requirement) {
        msg += `\n📋 *Requirements for ${targetClass.name}:*\n`;
        const req = targetClass.requirement;
        if (req.level) msg += `• Level ${req.level}\n`;
        if (req.questsCompleted) msg += `• ${req.questsCompleted} Quests Completed\n`;
        if (req.gold) msg += `• ${req.gold.toLocaleString()} Zeni\n`;
        if (req.kills) msg += `• ${req.kills} Kills\n`;
        if (req.victories) msg += `• ${req.victories} PvP Victories\n`;
        if (req.dragonsKilled) msg += `• ${req.dragonsKilled} Dragons Slain\n`;
    }
    
    await sock.sendMessage(chatId, { text: msg });
}

module.exports = {
    displayClasses,
    displayEvolutionTree,
};
