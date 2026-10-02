// ═══════════════════════════════════════════════════════════════════════════
// WORLD ALIGNMENT EVENT LAYER (2026-10-02, owner brief #fec956)
// ═══════════════════════════════════════════════════════════════════════════
// Fires the world-alignment EVENT exactly ONCE per triune alignment window:
//   1. the worlds align (cosmology.triuneWindow - deterministic ~4-day
//      cadence, 2h window),
//   2. affected players/guilds are determined (DEFAULT: every registered
//      player and, through them, their guilds - the owner will map the
//      real rules with the encounter mechanics),
//   3. each affected player gets the new DM encounter via the encounter
//      framework (paced DMs - never a burst),
//   4. the fired window key is claimed in the SHARED system KV so all bot
//      instances and restarts dedupe cleanly.
//
// Engine hook: call tick(sock, BOT_MARKER) from a periodic interval.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const cosmology = require('./cosmology');
const encounterFramework = require('./encounterFramework');

const EVENT_STATE_KEY = '_shared_world_alignment_last_event';
const ENCOUNTER_TYPE = process.env.ALIGNMENT_ENCOUNTER_TYPE || 'alignment_trial';
const DM_PACE_MS = (parseFloat(process.env.ALIGNMENT_DM_PACE_MS, 10) || 1200); // ~50 DMs/min default
const DM_WAVE_CAP = 250; // hard cap per window (registered players << this today)

let _inflight = false;
let _lastFiredKey = null; // in-process dedup (KV covers restarts)

function _windowKey(win) {
    return `align_${win.start}`;
}

async function _claim(key) {
    // Best-effort shared claim: the in-memory guard is the primary dedup
    // (all instances share this process); the KV claim covers restarts.
    const System = require('../models/System');
    const existing = await System.findOne({ key: EVENT_STATE_KEY }).lean();
    if (existing && existing.value === key) return false;
    await System.updateOne(
        { key: EVENT_STATE_KEY },
        { $set: { value: key, firedAt: new Date() } },
        { upsert: true }
    );
    return true;
}

/** Announce + begin the DM encounter for one player. */
async function _invitePlayer(sock, jid, win) {
    const minsLeft = win.minutesLeft;
    const started = encounterFramework.beginEncounter(jid, ENCOUNTER_TYPE, { jid, windowStart: win.start });
    if (!started.ok) {
        // already in an encounter - nudge instead of failing the wave
        await sock.sendMessage(jid, { text: `🌌 The worlds align - but you are already mid-encounter. Finish it first.` }).catch(() => {});
        return 'busy';
    }
    const banner = `🌌 *WORLD ALIGNMENT*\n\nThe Three are aligned *right now* (window closes in ~${minsLeft} min).\nYou have been chosen to be attuned.\n\n━━━━━━━━━━━━━━━\n`;
    await sock.sendMessage(jid, { text: banner + started.text }).catch(() => {});
    return 'invited';
}

/**
 * Periodic check (cheap when not aligned). Call from an engine interval
 * that has the instance sock in scope.
 */
async function tick(sock, BOT_MARKER) {
    if (_inflight) return { fired: false, reason: 'inflight' };
    const win = cosmology.triuneWindow(Date.now());
    if (!win.aligned) {
        _inflight = false;
        return { fired: false, aligned: false, nextStart: win.nextStart };
    }
    const key = _windowKey(win);
    if (_lastFiredKey === key) return { fired: false, reason: 'already-fired-this-window' };

    _inflight = true;
    try {
        const claimed = await _claim(key);
        if (!claimed) { _lastFiredKey = key; return { fired: false, reason: 'claimed-elsewhere' }; }

        // affected players: every registered player (rules TBD by owner)
        const User = require('../models/User');
        const players = await User.find({ registered: true }, { userId: 1 }).lean();
        const jids = players.map((p) => p.userId).filter(Boolean).slice(0, DM_WAVE_CAP);

        console.log(`🌍 [WorldAlignment] window ${key}: firing ${ENCOUNTER_TYPE} for ${jids.length} player(s)`);
        let invited = 0, busy = 0;
        for (const jid of jids) {
            try {
                const r = await _invitePlayer(sock, jid, win);
                if (r === 'invited') invited++; else busy++;
            } catch (e) {
                console.error(`[WorldAlignment] invite failed for ${jid}:`, e.message);
            }
            await new Promise((res) => setTimeout(res, DM_PACE_MS));
        }
        _lastFiredKey = key;
        encounterFramework.cleanupExpired();
        console.log(`🌍 [WorldAlignment] wave complete: ${invited} invited, ${busy} busy, window ${key}`);
        return { fired: true, key, invited, busy };
    } catch (e) {
        console.error('[WorldAlignment] tick error:', e.message);
        return { fired: false, reason: 'error', error: e.message };
    } finally {
        _inflight = false;
    }
}

/** Status for ops checks / QA. */
function status() {
    const win = cosmology.triuneWindow(Date.now());
    return {
        aligned: win.aligned,
        minutesLeft: win.minutesLeft,
        nextStart: new Date(win.nextStart).toISOString(),
        periodHours: Math.round(win.periodMs / 3600000),
        encounterType: ENCOUNTER_TYPE,
        lastFiredKey: _lastFiredKey,
    };
}

module.exports = { tick, status, _internal: { _windowKey, _claim, _invitePlayer } };
