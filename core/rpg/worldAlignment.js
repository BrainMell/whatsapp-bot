// ============================================
// 🌍 WORLD ALIGNMENT → GUILD WAR LAUNCHER — GW overhaul 2026-10-03
// Alignment = the rare peak Guild War. When the triune alignment window
// opens (cosmology: deterministic ~4-day cadence, 2h window), ONE instance
// claims the window in shared KV and opens an alignment-scale event:
//   - Guild Association official-notice cards DM'd to registered players
//   - registration opens; players join by DM (`join`) or `.j gw join`
// A mod can also manually host an alignment war from a group with
// `.j gw start alignment` (that group becomes the feed HQ).
// ============================================

const { get, set } = require('../utils/system');
const cosmology = require('./cosmology');

const KV_KEY = '_shared_world_alignment_last_event';
const DM_PACE_MS = 1200;
const DM_WAVE_CAP = 500;
// GC broadcast pacing (owner ask: intervals between group sends so the
// announce wave never loads the box / trips flood protection)
const GC_PACE_MS = parseInt(process.env.GW_GC_PACE_MS, 10) || 2500;

function botIdSafe() {
    try { return require('../botConfig').getBotId() || 'global'; } catch (e) { return 'global'; }
}

let _lastFiredKey = null;

function windowKey(win) {
    return `align_gw_${win.start}`;
}

// claim the window once across 3 instances (KV upsert)
async function _claim(key) {
    try {
        const System = require('../models/System');
        const existing = await System.findOne({ key: KV_KEY });
        if (existing && existing.value && existing.value.lastKey === key) return false;
        await System.updateOne(
            { key: KV_KEY },
            { $set: { value: { lastKey: key, at: new Date() } }, $setOnInsert: { key: KV_KEY } },
            { upsert: true }
        );
        return true;
    } catch (e) {
        console.error('[WorldAlignment] claim failed:', e.message);
        return false;
    }
}

async function _invitePlayer(sock, jid, eventId, aligned) {
    const notice = require('./guildWar/noticeCard');
    const guildWar = require('./guildWar');
    try {
        const buf = await notice.renderNotice(
            'The walls between worlds have grown weak. The Guild Association calls all guilds to war across the joined worlds. Registration is OPEN - reply `join` to enter.',
            { title: 'WORLD ALIGNMENT' }
        );
        await sock.sendMessage(jid, {
            image: buf,
            caption: `🌍 *WORLD ALIGNMENT - GUILD WAR*\n\nThe dead worlds overlap: greater dangers, greater glory, the largest Guild Points the system has ever offered.\n\nReply \`join\` to register. The war deploys once registration closes.`,
        });
    } catch (e) {
        // card failed → plain text fallback
        try {
            await sock.sendMessage(jid, { text: `🌍 *WORLD ALIGNMENT - GUILD WAR*\n\nRegistration open - reply \`join\` to enter. (${eventId})` });
        } catch (e2) { /* player unreachable */ }
    }
}

// tick: called from the 60s engine interval (cheap no-op off-window).
// Two independent phases:
//   1. _launchOnce     — ONE instance claims the window and opens the event
//   2. _broadcastOnce  — EVERY instance announces the organic call card to its
//                        own RPG-friendly GCs (per-bot stamp, paced sends)
async function tick(sock, BOT_MARKER) {
    const win = cosmology.triuneWindow(Date.now());
    if (!win || !win.aligned) return { fired: false };
    const launch = await _launchOnce(sock, BOT_MARKER, win);
    const broadcast = await _broadcastOnce(sock, BOT_MARKER, win);
    return { fired: !!(launch && launch.fired), launch, broadcast };
}

async function _launchOnce(sock, BOT_MARKER, win) {
    const key = windowKey(win);
    if (_lastFiredKey === key) return { fired: false, dedup: 'memory' };
    const claimed = await _claim(key);
    if (!claimed) { _lastFiredKey = key; return { fired: false, dedup: 'kv' }; }
    _lastFiredKey = key;

    // auto-launch: alignment event with no host group (DM-driven); a mod can
    // still host one manually per group — MAX_CONCURRENT_EVENTS guards floods
    const guildWar = require('./guildWar');
    const created = await guildWar.state.createEvent({
        type: 'alignment',
        hostGroupId: null,
        initiatedBy: 'guild-association',
        guilds: [],
    });
    if (!created.ok) {
        console.log('[WorldAlignment] window claimed but event not created:', created.reason);
        return { fired: false, reason: created.reason };
    }

    // paced DM notice wave to all registered players
    try {
        const User = require('../models/User');
        const users = await User.find({ registered: true }, { jid: 1 }).lean();
        const targets = users.map((u) => u.jid).filter(Boolean).slice(0, DM_WAVE_CAP);
        let sent = 0;
        for (const jid of targets) {
            try { await _invitePlayer(sock, jid, created.event.eventId, true); sent++; } catch (e) { /* skip */ }
            await new Promise((r) => setTimeout(r, DM_PACE_MS));
        }
        console.log(`[WorldAlignment] alignment war ${created.event.eventId}: notices sent to ${sent}/${targets.length} players`);
        return { fired: true, eventId: created.event.eventId, sent };
    } catch (e) {
        console.error('[WorldAlignment] notice wave failed:', e.message);
        return { fired: true, eventId: created.event.eventId, sent: 0 };
    }
}

// per-instance organic broadcast: the alignment call card goes to every GC
// marked RPG-friendly on THIS bot (`gw rpg on`), paced GC_PACE_MS apart.
// Stamp-guarded per bot per window; self-heals if the event wasn't created
// yet (non-claiming instances retry on the next 60s tick until it exists).
async function _broadcastOnce(sock, BOT_MARKER, win) {
    try {
        const key = windowKey(win);
        const stampKey = `gw_align_announced_${botIdSafe()}`;
        if (get(stampKey, null) === key) return { skipped: 'already' };

        const GuildWarEvent = require('../models/GuildWarEvent');
        const ev = await GuildWarEvent.findOne({ type: 'alignment', state: 'REGISTRATION' })
            .sort({ createdAt: -1 }).lean();
        if (!ev) return { skipped: 'no-event-yet' };

        const gcs = get(`gw_rpg_gcs_${botIdSafe()}`, []) || [];
        if (!gcs.length) { set(stampKey, key); return { skipped: 'no-rpg-gcs' }; }

        const notice = require('./guildWar/noticeCard');
        let buf = null;
        try {
            buf = await notice.renderAlignmentCard({
                regMinutes: ev.registrationEndsAt ? Math.max(0, Math.round((ev.registrationEndsAt - Date.now()) / 60000)) : null,
            });
        } catch (e) { /* text fallback below */ }

        let sent = 0;
        for (const gc of gcs) {
            try {
                if (buf) {
                    await sock.sendMessage(gc, {
                        image: buf,
                        caption: `${BOT_MARKER}🌍 *THE WORLDS ALIGN*\n\nAn alignment-scale Guild War is forming on its own. \`.j gw join\` enters from any group - players deploy into bot DMs.\n_Mark/unmark this GC: \`.j gw rpg off\`_`,
                    });
                } else {
                    await sock.sendMessage(gc, {
                        text: `${BOT_MARKER}🌍 *THE WORLDS ALIGN* - an alignment-scale Guild War is forming. \`.j gw join\` to enter.`,
                    });
                }
                sent++;
            } catch (e) { /* dead group — skip */ }
            await new Promise((r) => setTimeout(r, GC_PACE_MS));
        }
        set(stampKey, key);
        console.log(`[WorldAlignment] organic broadcast: ${sent}/${gcs.length} RPG-friendly GCs (window ${key})`);
        return { sent, total: gcs.length };
    } catch (e) {
        console.error('[WorldAlignment] broadcast failed:', e.message);
        return { skipped: 'error', error: e.message };
    }
}

function status() {
    const win = cosmology.triuneWindow(Date.now());
    return {
        aligned: !!win?.aligned,
        windowKey: win ? windowKey(win) : null,
        minutesLeft: win?.minutesLeft ?? null,
        lastFired: _lastFiredKey,
    };
}

module.exports = { tick, status, _claim, windowKey, _broadcastOnce, GC_PACE_MS };
