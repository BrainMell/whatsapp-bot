// ============================================ 
// 🎨 COMBAT IMAGE GENERATOR - GO MICROSERVICE CLIENT 
// ============================================ 

const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)
const botConfig = require('../../botConfig');

/*
 * Generate Combat Image using Go Microservice
 */
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = {
            players: players.map(p => ({
                name: String(p.name || 'Unknown'),
                class: String(p.class?.id || p.class || 'FIGHTER'),
                level: Math.floor(Number(p.level) || 1),
                hp: Math.floor(Number(p.hp || 0)),
                maxHp: Math.floor(Number(p.stats?.maxHp || p.maxHp || 100)),
                currentHP: Math.floor(Number(p.currentHP !== undefined ? p.currentHP : (p.hp || 0))),
                energy: Math.floor(Number(p.stats?.energy || p.energy || 100)),
                maxEnergy: Math.floor(Number(p.stats?.maxEnergy || p.maxEnergy || 100)),
                adventurerRank: String(p.adventurerRank || 'F'),
                spriteIndex: Math.floor(Number(p.spriteIndex) || 0)
            })),
            enemies: enemies.map(e => ({
                name: String(e.name || 'Enemy'),
                currentHP: Math.floor(Number(e.currentHP !== undefined ? e.currentHP : (e.stats?.hp || 0))),
                maxHp: Math.floor(Number(e.stats?.maxHp || e.stats?.hp || 100)),
                isBoss: Boolean(e.isBoss),
                justDied: Boolean(e.justDied),
                spriteIndex: Math.floor(Number(e.spriteIndex) || 0),
                // 💡 FIX: pass bossId so the Go service can pick distinct sprites
                // per boss name instead of only keying on level. Currently the Go
                // service ignores this field, but adding it to the payload now
                // means the Go side can use it without another JS change.
                bossId: String(e.id || e.name || '').toUpperCase().replace(/\s+/g, '_'),
                level: Math.floor(Number(e.level || e.stats?.level || 1))
            })),
            combatType: String(options.combatType || 'PVE'),
            rank: String(options.rank || 'F'),
            background: String(options.backgroundPath ? options.backgroundPath.split(/[\/\\]/).pop() : 'forest1.png')
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
    try {
        const imageBuffer = await goService.generateCombatEndScreen(text);
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ End screen generation failed:', error.message);
        return { success: false, error: error.message };
    }
}
module.exports = {
    generateCombatImage,
    updateCombatImage,
    generateEndScreenImage
};