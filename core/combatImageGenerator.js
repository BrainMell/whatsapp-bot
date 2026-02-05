// ============================================ 
// 🎨 COMBAT IMAGE GENERATOR - GO MICROSERVICE CLIENT 
// ============================================ 

const GoImageService = require('./goImageService');
const botConfig = require('../botConfig');

const goService = new GoImageService();

/**
 * Generate Combat Image using Go Microservice
 */
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = {
            players: players.map(p => ({
                name: p.name,
                class: p.class?.id || p.class || 'FIGHTER', // Handle object or string
                level: p.level || 1,
                hp: p.hp || 0,
                maxHp: p.stats?.maxHp || p.maxHp || 100,
                currentHP: p.currentHP !== undefined ? p.currentHP : (p.hp || 0),
                energy: p.stats?.energy || p.energy || 100,
                maxEnergy: p.stats?.maxEnergy || p.maxEnergy || 100,
                adventurerRank: p.adventurerRank || 'F',
                spriteIndex: p.spriteIndex || 0
            })),
            enemies: enemies.map(e => ({
                name: e.name,
                currentHP: e.currentHP !== undefined ? e.currentHP : (e.stats?.hp || 0),
                maxHp: e.stats?.maxHp || e.stats?.hp || 100,
                isBoss: e.isBoss || false,
                justDied: e.justDied || false,
                spriteIndex: e.spriteIndex || 0
            })),
            combatType: options.combatType || 'PVE',
            rank: options.rank || 'F',
            background: options.backgroundPath ? options.backgroundPath.split(/[/\]/).pop() : 'forest1.png'
        };

        const imageBuffer = await goService.generateCombatImage(payload);
        
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ Combat image generation failed:', error.message);
        return { success: false, error: error.message };
    }
}

async function updateCombatImage(players, enemies, turnInfo, options = {}) {
    return await generateCombatImage(players, enemies, options);
}

async function generateEndScreenImage(text, options = {}) {
    // For now, just return success false so it falls back to text, 
    // or implement a simple text endpoint in Go later if needed.
    // The previous implementation used pureimage for text.
    // We can fallback to text message in the bot logic if this fails.
    return { success: false, error: "Not implemented in Go service yet" };
}

module.exports = {
    generateCombatImage,
    updateCombatImage,
    generateEndScreenImage
};