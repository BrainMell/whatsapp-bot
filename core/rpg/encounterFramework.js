// ═══════════════════════════════════════════════════════════════════════════
// ENCOUNTER FRAMEWORK (2026-10-02, owner brief #fec956)
// ═══════════════════════════════════════════════════════════════════════════
// DM-based encounter sessions with proper state tracking, progression,
// outcomes, and cleanup - the STRUCTURE the owner asked for so the new
// encounter's actual mechanics can be mapped out separately instead of
// being hard-coded around assumptions.
//
// DESIGN
//   - An encounter TYPE is a registered spec: { id, title, intro, steps,
//     onComplete } - a linear DM conversation the player walks through.
//     New mechanics = new/edited specs, zero changes to the engine.
//   - Sessions are per-player (one active encounter per player), persisted
//     in the shared system KV (survives restarts, shared by all instances),
//     and expire on inactivity (cleanup sweep + lazy check).
//   - The engine only needs two hooks: handleDM() (DM message routing) and
//     the worldAlignment monitor for scheduled encounters.
//
// GW OVERHAUL 2026-10-03: the placeholder trial was removed. Alignment now
// launches a real alignment-scale Guild War (worldAlignment.js). The
// framework remains the generic step-based DM encounter host for future
// encounter types; Ruins event actions route through guildWar/dmRouter.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const system = require('../utils/system');
const economy = require('./economy');

const SESSIONS_KEY = '_shared_encounter_sessions';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity -> abandon

// ── spec registry ──────────────────────────────────────────────────────────
const specs = new Map(); // typeId -> spec

function registerEncounterType(spec) {
    if (!spec || !spec.id) throw new Error('encounter spec needs an id');
    specs.set(spec.id, spec);
}

// ── session store (memory + shared KV) ─────────────────────────────────────
let sessions = null; // jid -> session
let _loaded = false;

function _load() {
    if (_loaded) return;
    sessions = new Map(Object.entries(system.get(SESSIONS_KEY, {}) || {}));
    // drop expired on load
    const now = Date.now();
    for (const [jid, s] of sessions) {
        if (!s || now - (s.lastTouch || 0) > SESSION_TTL_MS) sessions.delete(jid);
    }
    _loaded = true;
}

function _persist() {
    if (!_loaded) return;
    try { JSON.stringify(Object.fromEntries(sessions)); } catch (e) { return; } // defensive
    system.set(SESSIONS_KEY, Object.fromEntries(sessions));
}

// ── public API ──────────────────────────────────────────────────────────────
function hasActive(jid) {
    _load();
    const s = sessions.get(jid);
    if (!s) return false;
    if (Date.now() - (s.lastTouch || 0) > SESSION_TTL_MS) { sessions.delete(jid); _persist(); return false; }
    return true;
}

function getActive(jid) {
    _load();
    const s = sessions.get(jid);
    if (!s) return null;
    const spec = specs.get(s.typeId);
    return spec ? { session: s, spec } : null;
}

/** Begin an encounter for a player. Returns intro text or an error string. */
function beginEncounter(jid, typeId, meta = {}) {
    _load();
    if (hasActive(jid)) return { ok: false, reason: 'already-in-encounter' };
    const spec = specs.get(typeId);
    if (!spec) return { ok: false, reason: 'unknown-encounter-type' };
    const session = {
        typeId,
        stepIndex: 0,
        answers: {},
        meta,
        startedAt: Date.now(),
        lastTouch: Date.now(),
    };
    sessions.set(jid, session);
    _persist();
    console.log(`[Encounter] begin ${typeId} for ${jid}`);
    return { ok: true, text: typeof spec.intro === 'function' ? spec.intro(session) : spec.intro };
}

/**
 * Route a DM message into the player's active encounter.
 * Returns true if the message was consumed by the framework.
 */
async function handleDM(sock, senderJid, chatId, txt, BOT_MARKER) {
    if (!hasActive(senderJid)) return false;
    const active = getActive(senderJid);
    if (!active) { abandon(senderJid, 'unknown-type'); return false; }
    const { session, spec } = active;
    session.lastTouch = Date.now();
    const step = (spec.steps || [])[session.stepIndex];
    const input = String(txt || '').trim();

    // allow exit at any step
    if (/^(quit|leave|exit|abandon|stop)$/i.test(input)) {
        return _finish(sock, senderJid, chatId, BOT_MARKER, `${BOT_MARKER}🌫️ You slip away from the encounter. It will remember.`);
    }

    if (step) {
        const validation = step.validate ? step.validate(input, session) : { ok: true };
        if (validation && validation.ok === false) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + (validation.message || '❓ Try again.') });
            return true;
        }
        session.answers[step.key] = validation && validation.value !== undefined ? validation.value : input;
        session.stepIndex += 1;
        session.lastTouch = Date.now();
        _persist();
        const next = (spec.steps || [])[session.stepIndex];
        if (next) {
            await sock.sendMessage(chatId, { text: BOT_MARKER + (typeof next.prompt === 'function' ? next.prompt(session) : next.prompt) });
            return true;
        }
    }

    // out of steps -> complete
    let outcome = { summaryText: 'The encounter fades. Nothing changes - yet.', rewards: null };
    try {
        if (spec.onComplete) outcome = (await spec.onComplete(session, { sock, chatId })) || outcome;
    } catch (e) {
        console.error('[Encounter] onComplete error:', e.message);
    }
    return _finish(sock, senderJid, chatId, BOT_MARKER, BOT_MARKER + outcome.summaryText, outcome);
}

function _finish(sock, senderJid, chatId, BOT_MARKER, text, outcome = null) {
    sessions.delete(senderJid);
    _persist();
    sock.sendMessage(chatId, { text }).catch(() => {});
    if (outcome && outcome.rewards) {
        // Reward application is a hook the owner maps with the mechanics.
        // Kept deliberately inert until then (no silent economy changes).
        console.log(`[Encounter] rewards pending owner mapping:`, JSON.stringify(outcome.rewards));
    }
    return true;
}

/** Abandon a player's session (admin/cleanup). */
function abandon(jid, reason) {
    _load();
    if (sessions.delete(jid)) { _persist(); console.log(`[Encounter] abandoned ${jid}: ${reason || 'manual'}`); return true; }
    return false;
}

/** Sweep expired sessions (call from a periodic tick). */
function cleanupExpired() {
    _load();
    const now = Date.now();
    let swept = 0;
    for (const [jid, s] of sessions) {
        if (!s || now - (s.lastTouch || 0) > SESSION_TTL_MS) { sessions.delete(jid); swept++; }
    }
    if (swept) _persist();
    return swept;
}

// (alignment_trial placeholder REMOVED 2026-10-03 — alignment now launches the
// real alignment-scale Guild War via worldAlignment.js / guildWar module.);

// QA/testing seam
const _internal = { specs, get sessions() { _load(); return sessions; } };

module.exports = {
    registerEncounterType, beginEncounter, handleDM, hasActive, getActive,
    abandon, cleanupExpired, _internal,
};
