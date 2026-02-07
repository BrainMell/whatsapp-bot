const classSystem = require('./classSystem');
const botConfig = require('../botConfig');

const getPrefix = () => botConfig.getPrefix();

async function displayClasses(sock, chatId) {
    const classes = classSystem.CLASSES;
    const evolutions = classSystem.CLASS_EVOLUTIONS;
    
    let msg = `┏━━━━━━━━━━━━━━━┓
`;
    msg += `┃   🛡️ CLASS TREE 
`;
    msg += `┗━━━━━━━━━━━━━━━┛

`;
    
    // Group classes by role
    const roles = {
        STARTER: [],
        TANK: [],
        DPS: [],
        MAGE: [],
        SUPPORT: [],
        LEGENDARY: []
    };
    
    Object.values(classes).forEach(c => {
        if (roles[c.role]) {
            roles[c.role].push(c);
        } else {
            // Fallback for custom roles
            if (!roles[c.role]) roles[c.role] = [];
            roles[c.role].push(c);
        }
    });
    
    for (const [role, classList] of Object.entries(roles)) {
        if (classList.length === 0) continue;
        
        msg += `🔰 *${role} CLASSES*
`;
        
        classList.forEach(c => {
            msg += `${c.icon} *${c.name}*
`;
            msg += `   📝 ${c.desc}
`;
            
            // Show evolution path
            const nextEvolutions = [];
            for (const [baseId, evos] of Object.entries(evolutions)) {
                if (baseId === c.id) {
                    evos.forEach(e => {
                        const evoClass = classes[e.id];
                        if (evoClass) nextEvolutions.push(`${evoClass.icon} ${evoClass.name}`);
                    });
                }
            }
            
            if (nextEvolutions.length > 0) {
                msg += `   ⏫ Evolves into: ${nextEvolutions.join(', ')}
`;
            }
            msg += `
`;
        });
        msg += `━━━━━━━━━━━━━━━

`;
    }
    
    msg += `💡 Use \`${getPrefix()} evolve\` to check your evolution options!`;
    
    await sock.sendMessage(chatId, { text: msg });
}

module.exports = {
    displayClasses
};
