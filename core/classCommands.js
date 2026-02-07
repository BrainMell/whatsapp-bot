const classSystem = require('./classSystem');
const botConfig = require('../botConfig');

const getPrefix = () => botConfig.getPrefix();

async function displayClasses(sock, chatId) {
    const classes = classSystem.getAllClasses();
    
    let msg = `┏━━━━━━━━━━━━━━━┓\n`;
    msg += `┃   🛡️ CLASS TREE \n`;
    msg += `┗━━━━━━━━━━━━━━━┛\n\n`;
    
    // Group classes by role/tier for better organization
    const roles = {
        'STARTER': [],
        'TANK': [],
        'DPS': [],
        'MAGE': [],
        'SUPPORT': [],
        'LEGENDARY': []
    };
    
    Object.values(classes).forEach(c => {
        const roleKey = c.tier === 'STARTER' ? 'STARTER' : (c.role || 'DPS');
        if (roles[roleKey]) {
            roles[roleKey].push(c);
        } else {
            if (!roles[roleKey]) roles[roleKey] = [];
            roles[roleKey].push(c);
        }
    });
    
    const roleOrder = ['STARTER', 'TANK', 'DPS', 'MAGE', 'SUPPORT', 'LEGENDARY'];
    
    for (const role of roleOrder) {
        const classList = roles[role];
        if (!classList || classList.length === 0) continue;
        
        msg += `🔰 *${role} CLASSES*\n`;
        
        classList.forEach(c => {
            msg += `${c.icon} *${c.name}*\n`;
            msg += `   📝 ${c.desc}\n`;
            
            // Show evolution path
            if (c.evolves_into && c.evolves_into.length > 0) {
                const nextEvolutions = c.evolves_into.map(evoId => {
                    const evoClass = classes[evoId];
                    return evoClass ? `${evoClass.icon} ${evoClass.name}` : evoId;
                });
                msg += `   ⏫ Evolves into: ${nextEvolutions.join(', ')}\n`;
            }
            msg += `\n`;
        });
        msg += `━━━━━━━━━━━━━━━\n\n`;
    }
    
    msg += `💡 Use \`${getPrefix()} evolve\` to check your evolution options!`;
    
    await sock.sendMessage(chatId, { text: msg });
}

module.exports = {
    displayClasses
};