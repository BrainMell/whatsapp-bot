// ═══════════════════════════════════════════════════════════════════════════
//  DEAD WORLD ENCOUNTER RUNNER
// ═══════════════════════════════════════════════════════════════════════════
//
//  2026-09-21 owner ticket. A regular dungeon encounter (plain COMBAT only,
//  never bosses or elites) has a 5% chance to become a Dead World encounter:
//
//    1. the dungeon behaves completely normally until the spawn point
//    2. at the spawn point, nothing spawns - a card shows the player alone
//       in the environment, clearly wrong, the player visibly confused
//    3. TEN separate text message boxes carry the player's own thoughts,
//       one per box, growing confusion, human voice (owner: "make it 10")
//    4. a closing victory card communicates survival, never a fight
//    5. the encounter ENDS after the sequence and the run does NOT continue
//       into the normal dungeon flow (owner 2026-09-21: "the encounter ends
//       after the Dead World sequence and does not continue") - the victory
//       card is the closing beat; the runner's caller cleans the run up
//
//  Rewards: none. No gold, no xp, no loot, no kill credit. Nothing died.
//  `.j solo f -d` forces the encounter for testing (state.deadWorldForced).
//
//  CARD GENERATION (owner 2026-09-21: "learn from how we already generate
//  these"): both cards come from the SAME pipeline as the regular encounter
//  cards, the Go image service:
//    scene   = the standard combat scene renderer with an EMPTY enemy side
//              (players[], enemies[]) - sprite facing, character model and
//              ground shadow are therefore identical to every other
//              encounter card, and no floor number is shown (floor 0)
//    victory = the standard VICTORY end card (WriteEndCard) with no enemy
//              and a Dead World congratulation caption (VICTORY_CAPTIONS)
//  The local node-canvas renderer is ONLY a fallback for when the Go service
//  is unreachable, and it follows the same house rules (no floor plate,
//  native sprite facing, grounded shadow).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const renderer = require('./deadWorldRenderer');
const sequences = require('./deadWorldSequences');

// The owner-specified chance for a regular encounter to become a Dead World.
const CHANCE = 0.05;

// Spacing between the ten thought boxes. Tunable for QA (mock flows pass a
// tiny delay); production default keeps each thought a beat apart.
let _thoughtDelayMs = 1500;
function setThoughtDelayMs(ms) {
    _thoughtDelayMs = Math.max(0, Math.floor(Number(ms) || 0));
}
function getThoughtDelayMs() {
    return _thoughtDelayMs;
}

/**
 * Should this regular COMBAT encounter become the Dead World encounter?
 * Once per run, whichever branch fires first (forced or rolled).
 * @param {object} state - the adventure state (gameStates entry)
 * @returns {boolean}
 */
function shouldTrigger(state) {
    if (!state) return false;
    if (state.deadWorldDone) return false;
    if (state.deadWorldForced) return true;
    return Math.random() < CHANCE;
}

/**
 * Marker stored on the adventure state so `.j status` and the flow logs see
 * a consistent encounter shape while the sequence plays out.
 */
function marker(encounterNumber) {
    return {
        type: 'DEAD_WORLD',
        name: 'Strange Silence',
        description: 'The encounter point is empty. Nothing spawns. Nothing moves.',
        encounterNumber: Math.max(1, Math.floor(Number(encounterNumber) || 1)),
    };
}

function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve identity fields from the adventure state. Mirrors the combat
 * payload's sprite resolution (class fallback APPRENTICE, clamped index) so
 * the sprite on these cards matches the battle scenes and the character
 * sheet (ticket #b4f7aa parity).
 */
function _cardOpts(state) {
    const p = (state.players && state.players[0]) || {};
    const eco = p.jid ? _safeEconomyUser(p.jid) : null;
    const classId = (p.class && (p.class.id || p.class)) || (eco && eco.class) || 'APPRENTICE';
    return {
        playerName: p.name || (eco && eco.nickname) || 'You',
        playerClass: String(classId).toUpperCase(),
        spriteIndex: Math.max(0, Math.floor(Number(p.spriteIndex !== undefined ? p.spriteIndex : (eco && eco.spriteIndex)) || 0)),
        level: Math.max(1, Math.floor(Number(p.level || (eco && eco.progression && eco.progression.level)) || 1)),
        adventurerRank: String(p.adventurerRank || (eco && eco.adventurerRank) || 'F'),
        dungeonName: state.dungeonName || (state.environment && state.environment.name) || 'Deep Dungeon',
        rank: state.dungeonRank || 'F',
        // 💡 NO FLOOR (owner 2026-09-21): the floor number must not appear in
        // the Dead World UI. The Go payload and the fallback plate both omit it.
        backgroundPath: state.backgroundPath || '',
        environmentKey: state.environment && state.environment.asset ? state.environment.asset : '',
    };
}

/**
 * Build the player entity EXACTLY like the regular combat flow passes it to
 * the Go service (combatImageGenerator.buildPayload reads this shape), so the
 * Dead World scene card is pixel-identical in sprite treatment to any other
 * encounter card. enemies = [] : nothing spawns.
 */
function _combatEntities(state) {
    const o = _cardOpts(state);
    const p = (state.players && state.players[0]) || {};
    const stats = p.stats || {};
    const currentHP = Number(p.currentHP !== undefined ? p.currentHP : stats.hp) || 0;
    const entity = {
        name: o.playerName,
        class: o.playerClass,
        level: o.level,
        hp: currentHP,
        maxHp: Math.floor(Number(stats.maxHp) || 100),
        currentHP,
        energy: Math.floor(Number(stats.energy) || 100),
        maxEnergy: Math.floor(Number(stats.maxEnergy) || 100),
        adventurerRank: o.adventurerRank,
        spriteIndex: o.spriteIndex,
    };
    return { player: entity, opts: o };
}

// economy lookup is best-effort only; the card never blocks on it
function _safeEconomyUser(jid) {
    try { return require('./economy').getUser(jid) || null; } catch (e) { return null; }
}

/**
 * The empty scene card: the REGULAR encounter card, generated by the same Go
 * service call the combat flow uses, with an empty enemy side. Falls back to
 * the local canvas renderer (fixed to match: native facing, grounded shadow,
 * no floor plate) when the Go service is unavailable.
 */
async function _renderScene(state) {
    const { player, opts } = _combatEntities(state);
    try {
        const combatImageGen = require('./combatImageGenerator');
        const res = await combatImageGen.generateCombatImage([player], [], {
            combatType: 'PVE',
            rank: opts.rank,
            floor: 0, // no floor number in the Dead World UI (owner 2026-09-21)
            backgroundPath: opts.backgroundPath,
        });
        if (res && res.success && res.buffer && res.buffer.length > 100) return res.buffer;
    } catch (e) {
        try { console.error('[DeadWorld] Go scene card failed, using fallback:', e.message); } catch (_) {}
    }
    return renderer.renderDeadWorldScene(opts);
}

/**
 * The victory card: the REGULAR encounter victory end card (WriteEndCard,
 * the same VICTORY portrait every cleared encounter uses) with no enemy and
 * a Dead World congratulation caption. Falls back to the local canvas
 * renderer when the Go service is unavailable.
 */
async function _renderVictory(state) {
    const { player, opts } = _combatEntities(state);
    const congrats = sequences.pickVictory(state.chatId || String(opts.dungeonName));
    try {
        const combatImageGen = require('./combatImageGenerator');
        const res = await combatImageGen.generateEndScreenImage('VICTORY', {
            victory: true,
            gold: 0,
            xp: 0,
            items: '',
            playerName: player.name,
            playerClass: player.class,
            playerIndex: player.spriteIndex,
            playerLevel: player.level,
            // no enemy: nothing was fought, none is named or shown
            enemyName: '',
            enemyLevel: 0,
            enemyIndex: 0,
            enemyIsBoss: false,
            enemySpecies: '',
            rank: opts.rank,
            floor: 0, // no floor number in the Dead World UI (owner 2026-09-21)
            background: String(opts.backgroundPath || '').split(/[\/\\]/).pop(),
            caption: congrats.card,
        });
        if (res && res.success && res.buffer && res.buffer.length > 100) {
            return { buffer: res.buffer, caption: congrats.text };
        }
    } catch (e) {
        try { console.error('[DeadWorld] Go victory card failed, using fallback:', e.message); } catch (_) {}
    }
    const buf = await renderer.renderDeadWorldVictory(opts);
    return { buffer: buf, caption: congrats.text };
}

/**
 * Play the full Dead World sequence into the chat:
 * empty scene card -> ten separate thought boxes -> victory card.
 * Every send is individually guarded: a failed message must not break the
 * sequence or the run.
 * @param {object} sock
 * @param {object} state - the adventure state
 * @returns {Promise<void>}
 */
async function runEncounter(sock, state) {
    if (!sock || !state || !state.chatId) return;
    const chatId = state.chatId;
    state.deadWorldDone = true;

    // 1. the empty encounter card (image only - the thoughts carry the words)
    try {
        const scene = await _renderScene(state);
        if (scene && scene.length > 100) {
            await sock.sendMessage(chatId, { image: scene });
        } else {
            await sock.sendMessage(chatId, { text: '_*「 ...it is empty... why is it empty... 」*_' });
        }
    } catch (e) {
        try { console.error('[DeadWorld] scene card failed:', e.message); } catch (_) {}
        try { await sock.sendMessage(chatId, { text: '_*「 ...it is empty... why is it empty... 」*_' }); } catch (e2) {}
    }

    // 2. TEN separate message boxes - the player's own thoughts
    const seqIdx = sequences.pickSequence(chatId);
    const ten = sequences.DEAD_WORLD_SEQUENCES[seqIdx] || sequences.DEAD_WORLD_SEQUENCES[0];
    for (let i = 0; i < 10; i++) {
        const thought = ten[i] != null ? ten[i] : ten[ten.length - 1];
        try {
            await sock.sendMessage(chatId, { text: sequences.formatThought(thought) });
        } catch (e) {
            try { console.error(`[DeadWorld] thought ${i + 1}/10 failed:`, e.message); } catch (_) {}
        }
        if (i < 9 && _thoughtDelayMs > 0) await _sleep(_thoughtDelayMs + Math.floor(Math.random() * 300));
    }

    // 3. the victory card - a regular encounter victory card with a Dead
    //    World congratulation caption (survival, never a fight)
    try {
        const victory = await _renderVictory(state);
        if (victory.buffer && victory.buffer.length > 100) {
            await sock.sendMessage(chatId, { image: victory.buffer, caption: victory.caption });
        } else {
            await sock.sendMessage(chatId, { text: victory.caption });
        }
    } catch (e) {
        try { console.error('[DeadWorld] victory card failed:', e.message); } catch (_) {}
        try {
            const congrats = sequences.pickVictory(chatId);
            await sock.sendMessage(chatId, { text: congrats.text });
        } catch (e2) {}
    }
}

module.exports = {
    CHANCE,
    shouldTrigger,
    marker,
    runEncounter,
    setThoughtDelayMs,
    getThoughtDelayMs,
};
