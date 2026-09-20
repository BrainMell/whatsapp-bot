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
//    3. SIX separate text message boxes carry the player's own thoughts,
//       one per box, growing confusion, human voice
//    4. a closing victory card communicates survival, never a fight
//    5. the run continues as if the encounter had been cleared, because it
//       HAS been cleared - there was simply nothing to fight
//
//  Rewards: none. No gold, no xp, no loot, no kill credit. Nothing died.
//  `.j solo f -d` forces the encounter for testing (state.deadWorldForced).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const renderer = require('./deadWorldRenderer');
const sequences = require('./deadWorldSequences');

// The owner-specified chance for a regular encounter to become a Dead World.
const CHANCE = 0.05;

// Spacing between the six thought boxes. Tunable for QA (mock flows pass a
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
 * Resolve the card options from the adventure state. Mirrors the combat
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
        dungeonName: state.dungeonName || (state.environment && state.environment.name) || 'Deep Dungeon',
        rank: state.dungeonRank || 'F',
        floor: Math.max(1, Math.floor(Number(state.encounter) || 1)),
        backgroundPath: state.backgroundPath || '',
        environmentKey: state.environment && state.environment.asset ? state.environment.asset : '',
    };
}

// economy lookup is best-effort only; the card never blocks on it
function _safeEconomyUser(jid) {
    try { return require('./economy').getUser(jid) || null; } catch (e) { return null; }
}

/**
 * Play the full Dead World sequence into the chat:
 * empty scene card -> six separate thought boxes -> victory card.
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

    const opts = _cardOpts(state);

    // 1. the empty encounter card (image only - the thoughts carry the words)
    try {
        const scene = await renderer.renderDeadWorldScene(opts);
        if (scene && scene.length > 100) {
            await sock.sendMessage(chatId, { image: scene });
        } else {
            await sock.sendMessage(chatId, { text: '_*「 ...it is empty... why is it empty... 」*_' });
        }
    } catch (e) {
        try { console.error('[DeadWorld] scene card failed:', e.message); } catch (_) {}
        try { await sock.sendMessage(chatId, { text: '_*「 ...it is empty... why is it empty... 」*_' }); } catch (e2) {}
    }

    // 2. SIX separate message boxes - the player's own thoughts
    const seqIdx = sequences.pickSequence(chatId);
    const six = sequences.DEAD_WORLD_SEQUENCES[seqIdx] || sequences.DEAD_WORLD_SEQUENCES[0];
    for (let i = 0; i < 6; i++) {
        const thought = six[i] != null ? six[i] : six[six.length - 1];
        try {
            await sock.sendMessage(chatId, { text: sequences.formatThought(thought) });
        } catch (e) {
            try { console.error(`[DeadWorld] thought ${i + 1}/6 failed:`, e.message); } catch (_) {}
        }
        if (i < 5 && _thoughtDelayMs > 0) await _sleep(_thoughtDelayMs + Math.floor(Math.random() * 300));
    }

    // 3. the victory card - survival, never a fight
    try {
        const victory = await renderer.renderDeadWorldVictory(opts);
        if (victory && victory.length > 100) {
            await sock.sendMessage(chatId, { image: victory });
        } else {
            await sock.sendMessage(chatId, { text: '_*「 ...i made it through... whatever that was 」*_' });
        }
    } catch (e) {
        try { console.error('[DeadWorld] victory card failed:', e.message); } catch (_) {}
        try { await sock.sendMessage(chatId, { text: '_*「 ...i made it through... whatever that was 」*_' }); } catch (e2) {}
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
