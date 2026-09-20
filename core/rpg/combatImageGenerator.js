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
            // 💡 TICKET #b4f7aa (2026-09-21): fall back to APPRENTICE, the same
            // fallback the character sheet uses (CLASS_SPRITE_SETS.APPRENTICE in
            // profileCardRenderer) - combat previously fell back to a DIFFERENT
            // class ('FIGHTER'), so unknown/mod-created classes rendered a
            // different sprite in combat than on their character sheet.
            class: String(p.class?.id || p.class || 'APPRENTICE'),
            level: Math.floor(Number(p.level) || 1),
            hp: Math.floor(Number(p.hp || 0)),
            maxHp: Math.floor(Number(p.stats?.maxHp || p.maxHp || 100)),
            currentHP: Math.floor(Number(p.currentHP !== undefined ? p.currentHP : (p.hp || 0))),
            energy: Math.floor(Number(p.stats?.energy || p.energy || 100)),
            maxEnergy: Math.floor(Number(p.stats?.maxEnergy || p.maxEnergy || 100)),
            adventurerRank: String(p.adventurerRank || 'F'),
            // 💡 TICKET #b4f7aa: clamp exactly like the sheet resolver
            // (Math.max(0, ...)) so negative/NaN indices can desync the sprite.
            spriteIndex: Math.max(0, Math.floor(Number(p.spriteIndex) || 0)),
            // 💡 NEW 2026-08-05: Pass mode + species so Go service renders summon sprites
            mode: String(p.mode || (p._isSummon ? 'summon' : '') || ''),
            species: String(p.species || p.type || '')
        })),
        enemies: enemies.map(e => ({
            name: String(e.name || 'Enemy'),
            currentHP: Math.floor(Number(e.currentHP !== undefined ? e.currentHP : (e.stats?.hp || 0))),
            maxHp: Math.floor(Number(e.stats?.maxHp || e.stats?.hp || 100)),
            isBoss: Boolean(e.isBoss),
            justDied: Boolean(e.justDied),
            spriteIndex: Math.floor(Number(e.spriteIndex) || 0),
            // 💡 FIX 2026-09-17: wild summons as ENEMIES (abyss floors) must
            // render their summon species sprite, not a random monster.
            mode: String(e.mode || ((e.isWildSummon || e._isSummon) ? 'summon' : '') || ''),
            species: String(e.species || ((e.isWildSummon || e._isSummon) ? (e.speciesId || e.id) : '') || ''),
            bossId: String(e.id || e.name || '').toUpperCase().replace(/\s+/g, '_'),
            level: Math.floor(Number(e.level || e.stats?.level || 1))
        })),
        // 💡 Phase 7: Include summons in the combat render payload.
        // 💡 TICKET #b4fc58 (2026-09-21): pass each summon's FACING through to
        // the renderer ('right' = facing the enemy side, 'left' = facing its
        // own side). summonAI.performSummonAction updates summonEntity.facing
        // every turn; summonSystem.buildCombatEntity defaults it to 'right'.
        // The Go renderer flips the sprite horizontally when facing === 'left',
        // matching player-sprite facing behavior. Static (turret) summons keep
        // their orientation.
        summons: (options.summons || []).map(s => ({
            name: String(s.name || 'Summon'),
            species: String(s.type || s.species || 'skeleton'),
            currentHP: Math.floor(Number(s.currentHP !== undefined ? s.currentHP : (s.stats?.hp || 0))),
            maxHp: Math.floor(Number(s.stats?.maxHp || s.maxHP || 100)),
            justDied: Boolean(s.justDied),
            ownerIndex: Math.floor(Number(s.ownerIndex) || 0),
            isStationary: Boolean(s.isStationary),
            facing: String(s.facing || 'right')
        })),
        combatType: String(options.combatType || 'PVE'),
        rank: String(options.rank || 'F'),
        floor: Math.floor(Number(options.floor) || 0),
        // 💡 FIX 2026-09-11 R2 (owner directive: "PvP background = montage_E_4
        // style"): the colosseum (spark_15) was rejected by the owner - the
        // duel arena is now spark_5.png (the bright open beach arena from the
        // approved E-series audit renders). The Go service mirrors this guard.
        background: String(options.backgroundPath
            ? options.backgroundPath.split(/[\/\\]/).pop()
            : (String(options.combatType).toUpperCase() === 'PVP' ? 'spark_15.png' : 'spark_1.png'))
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
 *
 * @param {Array} players
 * @param {Array} enemies
 * @param {object} options - { combatType, summons, action, backgroundPath, bypassQueue }
 *   bypassQueue (bool): when true, skip the _enqueue semaphore and POST directly
 *   to the Go service. Used by PvP duel images (static PNGs that must not stall
 *   behind slow GIF renders in the queue). Default false (PvE keeps queued behavior).
 */
/**
 * 💡 2026-09-15 PERF: sniff the buffer's magic bytes instead of hardcoding.
 * The Go static renderer now serves fmt=jpeg (much smaller uploads), and the
 * animated endpoint can still return MP4 or its static fallback - so the
 * mimeType must follow the actual bytes, not an assumption.
 */
function sniffMediaMime(buf) {
    if (!buf || buf.length < 12) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';           // JPEG SOI
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';            // PNG magic
    const brand = buf.slice(4, 12).toString('latin1');
    if (brand.endsWith('ftyp')) return 'video/mp4';                        // MP4 ftyp box
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x1c) return 'video/mp4';
    return 'image/png';
}

async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = buildPayload(players, enemies, options);
        // 💡 FIX 2026-08-03: Pass the action payload to the STATIC renderer
        // so it can draw the turn indicator (golden ellipse under the attacker).
        // The static renderer uses req.Action.AttackerSide + AttackerIndex.
        if (options.action) {
            payload.action = buildActionPayload(options.action);
        }
        // 💡 FIX 2026-08-04: bypassQueue for PvP duel images. Static PNGs render
        // in ~1-3s and should not wait behind slow GIF renders in _enqueue.
        const imageBuffer = options.bypassQueue
            ? await goService.generateCombatImageDirect(payload)
            : await goService.generateCombatImage(payload);
        return { success: true, buffer: imageBuffer, mimeType: sniffMediaMime(imageBuffer) };
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
        // The Go service returns MP4 on success, or a static image if it fell
        // back. Sniff the buffer magic bytes to determine which.
        const mimeType = sniffMediaMime(videoBuffer);
        return { success: true, buffer: videoBuffer, mimeType };
    } catch (error) {
        console.error('❌ Animated combat generation failed, falling back to static:', error.message);
        // Fallback to static PNG
        return await generateCombatImage(players, enemies, options);
    }
}

async function updateCombatImage(players, enemies, turnInfo, options = {}) {
    // 💡 FIX 2026-08-03: Always use the STATIC PNG path (not animated MP4).
    // Animated combat is disabled because the Go service on Box 2 (512MB RAM)
    // takes 6-27s per MP4 encode, exceeding the 10s Go service timeout.
    //
    // The action payload (options.action) is now passed to the static renderer
    // so it can draw the turn indicator (golden ellipse under the attacker).
    // Previously this was only used for the animated path, which is disabled.
    //
    // To re-enable animated combat: restore the old routing:
    //   if (turnInfo && turnInfo.action) {
    //       return await generateAnimatedCombatImage(players, enemies, { ...options, action: turnInfo.action });
    //   }
    return await generateCombatImage(players, enemies, options);
}

async function generateEndScreenImage(text, options = {}) {
    try {
        // 💡 2026-09-14: full payload for the redesigned victory/defeat
        // portrait card (WriteEndCard in the Go service). Legacy fields
        // (text/victory/gold/xp/items) unchanged; the player/enemy/rank/
        // floor/background/caption fields are optional enrichment.
        const payload = {
            text: String(text || ''),
            victory: Boolean(options.victory),
            gold: Math.floor(Number(options.gold) || 0),
            xp: Math.floor(Number(options.xp) || 0),
            items: String(options.items || ''),
            playerName: String(options.playerName || ''),
            playerClass: String(options.playerClass || ''),
            playerIndex: Math.floor(Number(options.playerIndex) || 0),
            playerLevel: Math.floor(Number(options.playerLevel) || 0),
            enemyName: String(options.enemyName || ''),
            enemyLevel: Math.floor(Number(options.enemyLevel) || 0),
            enemyIndex: Math.floor(Number(options.enemyIndex) || 0),
            enemyIsBoss: Boolean(options.enemyIsBoss),
            rank: String(options.rank || ''),
            floor: Math.floor(Number(options.floor) || 0),
            background: String(options.background || ''),
            caption: String(options.caption || '')
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
