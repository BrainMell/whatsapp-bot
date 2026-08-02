// ============================================
// 🎨 COMBAT IMAGE GENERATOR - GO MICROSERVICE CLIENT
// ============================================
// Generates static PNG combat scenes OR animated MP4 combat scenes
// via the Go microservice.
//
// Static PNG  → /api/combat         (default)
// Animated MP4 → /api/combat/animated (when options.action is set)
//
// The animated endpoint falls back to static PNG server-side if anything
// goes wrong, so callers can always assume a successful response contains
// either a PNG (image/png) or MP4 (video/mp4) buffer.

const goService = require('../utils/goImageService'); // 💡 singleton (PERF PATCH 2026-07-27)
const botConfig = require('../../botConfig');

/**
 * Build the standard combat payload (shared by static + animated endpoints).
 */
function buildPayload(players, enemies, options = {}) {
    return {
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
            bossId: String(e.id || e.name || '').toUpperCase().replace(/\s+/g, '_'),
            level: Math.floor(Number(e.level || e.stats?.level || 1))
        })),
        // 💡 Phase 7: Include summons in the combat render payload.
        summons: (options.summons || []).map(s => ({
            name: String(s.name || 'Summon'),
            species: String(s.type || s.species || 'skeleton'),
            currentHP: Math.floor(Number(s.currentHP !== undefined ? s.currentHP : (s.stats?.hp || 0))),
            maxHp: Math.floor(Number(s.stats?.maxHp || s.maxHP || 100)),
            justDied: Boolean(s.justDied),
            ownerIndex: Math.floor(Number(s.ownerIndex) || 0),
            isStationary: Boolean(s.isStationary)
        })),
        combatType: String(options.combatType || 'PVE'),
        rank: String(options.rank || 'F'),
        background: String(options.backgroundPath ? options.backgroundPath.split(/[\/\\]/).pop() : 'forest.png')
    };
}

/**
 * Build the action sub-payload for animated combat.
 * Maps skill info + damage into the format expected by the Go animator.
 *
 * @param {object} action - { attackerSide, attackerIndex, targetSide, targetIndex, skillName, element, vfx, damage, isCrit, missed, heal }
 * @returns {object} - action payload ready for the Go service
 */
function buildActionPayload(action = {}) {
    return {
        attackerSide:  String(action.attackerSide || 'player'),
        attackerIndex: Math.floor(Number(action.attackerIndex) || 0),
        targetSide:    String(action.targetSide || 'enemy'),
        targetIndex:   Math.floor(Number(action.targetIndex) || 0),
        skillName:     String(action.skillName || ''),
        element:       String(action.element || 'physical'),
        vfx:           String(action.vfx || ''),
        damage:        Math.floor(Number(action.damage) || 0),
        isCrit:        Boolean(action.isCrit),
        missed:        Boolean(action.missed),
        heal:          Math.floor(Number(action.heal) || 0)
    };
}

/**
 * Generate a static PNG combat image.
 */
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = buildPayload(players, enemies, options);
        const imageBuffer = await goService.generateCombatImage(payload);
        return { success: true, buffer: imageBuffer, mimeType: 'image/png' };
    } catch (error) {
        console.error('❌ Combat image generation failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate an animated MP4 combat video.
 * Falls back to static PNG on any error.
 *
 * @param {Array} players
 * @param {Array} enemies
 * @param {object} options - { ..., action: { attackerSide, attackerIndex, targetSide, targetIndex, skillName, element, vfx, damage, isCrit, missed, heal } }
 * @returns {Promise<{success: boolean, buffer: Buffer, mimeType: string}>}
 */
async function generateAnimatedCombatImage(players, enemies, options = {}) {
    try {
        const payload = buildPayload(players, enemies, options);
        payload.action = buildActionPayload(options.action);
        const videoBuffer = await goService.generateAnimatedCombat(payload);
        // The Go service returns MP4 on success, or PNG if it fell back to static.
        // Sniff the buffer magic bytes to determine which.
        const mimeType = (videoBuffer && videoBuffer.length > 4 &&
                         videoBuffer[0] === 0x00 && videoBuffer[1] === 0x00 &&
                         videoBuffer[2] === 0x00 && videoBuffer[3] === 0x1C)
                       ? 'video/mp4'  // MP4 magic bytes (ftyp box)
                       : 'image/png'; // PNG magic bytes
        return { success: true, buffer: videoBuffer, mimeType };
    } catch (error) {
        console.error('❌ Animated combat generation failed, falling back to static:', error.message);
        // Fallback to static PNG
        return await generateCombatImage(players, enemies, options);
    }
}

async function updateCombatImage(players, enemies, turnInfo, options = {}) {
    // If turnInfo has an action, use animated; otherwise static
    if (turnInfo && turnInfo.action) {
        return await generateAnimatedCombatImage(players, enemies, { ...options, action: turnInfo.action });
    }
    return await generateCombatImage(players, enemies, options);
}

async function generateEndScreenImage(text, options = {}) {
    try {
        // 💡 UPDATED 2026-07-29: Pass full payload for new gradient + rewards end screen.
        const payload = {
            text: String(text || ''),
            victory: Boolean(options.victory),
            gold: Math.floor(Number(options.gold) || 0),
            xp: Math.floor(Number(options.xp) || 0),
            items: String(options.items || '')
        };
        const imageBuffer = await goService.generateCombatEndScreen(payload);
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ End screen generation failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate a hunting image card.
 * @param {object} data - { playerName, playerClass, biome, animal, animalSprite, item, itemRarity, xp, zeni, rank }
 * @returns {Promise<{success: boolean, buffer: Buffer}>}
 */
async function generateHuntCard(data = {}) {
    try {
        const imageBuffer = await goService.generateHuntCard(data);
        if (!imageBuffer) return { success: false, error: 'Go service returned null' };
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ Hunt card generation failed:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateCombatImage,
    generateAnimatedCombatImage,
    updateCombatImage,
    generateEndScreenImage,
    generateHuntCard,
    // Exported for testing
    _buildPayload: buildPayload,
    _buildActionPayload: buildActionPayload
};
