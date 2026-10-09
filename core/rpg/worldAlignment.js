// ============================================
// 🌍 WORLD ALIGNMENT → GUILD WAR LAUNCHER — GW overhaul 2026-10-03
// Alignment = the rare peak Guild War. When the triune alignment window
// opens (cosmology: deterministic ~4-day cadence, 2h window), ONE instance
// claims the window in shared KV and opens an alignment-scale event:
//   - Guild Association official-notice cards DM'd to registered players
//   - registration opens; players join by DM (`join`) or `${_botPrefix()} gw join`
// A mod can also manually host an alignment war from a group with
// `.j gw start alignment` (that group becomes the feed HQ).
//
// ⚔️ 2026-10-09 OWNER DIRECTIVE (Guild War overhaul): the ~4-day natural
// auto-spawn is DISABLED (CFG.ALIGNMENT_AUTOSPAWN = false) — "Disable the
// 4-day timer for the Ruins Guild War only." Wars are now mod-initiated:
//   `.j war start`       → full-scale (alignment-scale) event, announced in
//                          every RPG-friendly GC via announceAlignmentWar
//   `.j war start -test` → small (normal-scale) war, this GC only
// The cosmology clocks themselves are untouched — only the war launcher is
// silenced. The broadcast phase below now runs EVERY tick (not just inside
// the alignment window) so a mod-called full-scale war announces wherever
// the window is live or not; it self-guards on a REGISTRATION alignment
// event existing + a per-bot per-event stamp.
// ============================================

const { get, set } = require('../utils/system');
const cosmology = require('./cosmology');
const CFG = require('./guildWar/config');
const { resolveBotId } = require('../utils/botInstance');

const KV_KEY = '_shared_world_alignment_last_event';
const DM_PACE_MS = 1200;
const DM_WAVE_CAP = 500;
// GC broadcast pacing (owner ask: intervals between group sends so the
// announce wave never loads the box / trips flood protection)
const GC_PACE_MS = parseInt(process.env.GW_GC_PACE_MS, 10) || 2500;

function botIdSafe() {
    // ⚔️ 2026-10-09: process-level identity (BOT_INSTANCE env) instead of the
    // ALS-backed proxy — the 60s interval has no ALS store, so the old proxy
    // collapsed every instance to 'global' here (shared GC list + shared
    // announce stamp = only one bot ever announced). See utils/botInstance.js.
    return resolveBotId();
}
function _botPrefix() {
    // dynamic per-bot prefix (owner rule: never hardcode .j/.s in card text)
    try { return require('../botConfig').getPrefix() || '.'; } catch (e) { return '.'; }
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

// tick: called from the 60s engine interval (cheap no-ops off-window).
// Three independent phases:
//   1. _launchOnce     — ONE instance claims the window and opens the event
//                        (⚙️ currently disabled: CFG.ALIGNMENT_AUTOSPAWN)
//   2. _broadcastOnce  — EVERY instance announces the alignment call card to
//                        its own RPG-friendly GCs (per-bot stamp, paced
//                        sends). ⚔️ 2026-10-09: runs on EVERY tick now —
//                        self-guards on a REGISTRATION alignment event —
//                        so mod-called full-scale wars announce off-window.
async function tick(sock, BOT_MARKER) {
    const win = cosmology.triuneWindow(Date.now());
    const launch = (win && win.aligned)
        ? await _launchOnce(sock, BOT_MARKER, win)
        : { fired: false };
    const broadcast = await _broadcastOnce(sock, BOT_MARKER, win);
    return { fired: !!(launch && launch.fired), launch, broadcast };
}

async function _launchOnce(sock, BOT_MARKER, win) {
    // ⚔️ 2026-10-09 owner directive: the 4-day natural spawn is OFF. The
    // window is not claimed or consumed — flipping GW_ALIGNMENT_AUTOSPAWN=1
    // restores the organic behavior verbatim.
    if (!CFG.ALIGNMENT_AUTOSPAWN) {
        return { fired: false, reason: 'autospawn-disabled' };
    }
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

// per-instance broadcast: the alignment call card goes to every GC
// marked RPG-friendly on THIS bot (`gw rpg on`), paced GC_PACE_MS apart.
// ⚔️ 2026-10-09 rework:
//   - stamp is keyed by EVENT ID (was: 4-day window key) — every full-scale
//     war announces exactly once per bot, however many wars share a window;
//   - the stamp is written BEFORE the paced loop (synchronous cache write)
//     so the command path and the 60s tick can never double-send on the
//     same process (at-most-once per bot wins);
//   - mod-called wars get their own kicker/caption ("CALLED BY HAND") —
//     the organic "on its own accord" look only fits autospawned wars.
async function announceAlignmentWar(sock, BOT_MARKER, ev) {
    try {
        const botId = botIdSafe();
        const stampKey = `gw_align_announced_${botId}`;
        if (get(stampKey, null) === ev.eventId) return { skipped: 'already' };
        const gcs = get(`gw_rpg_gcs_${botId}`, []) || [];
        // 💡 judge fix: only stamp once we actually HAVE targets — a bot with
        // zero marked GCs stays un-stamped so GCs marked later in the 10-min
        // registration window still receive the call (cheap 60s re-check).
        // (The host GC is excluded below — it already carries the call card.)
        const targets = gcs.filter((gc) => gc && gc !== ev.hostGroupId);
        if (!targets.length) return { skipped: 'no-rpg-gcs', eventId: ev.eventId };
        set(stampKey, ev.eventId);

        const calledByHand = !!(ev.initiatedBy && ev.initiatedBy !== 'guild-association');
        const notice = require('./guildWar/noticeCard');
        let buf = null;
        try {
            buf = await notice.renderAlignmentCard({
                title: calledByHand ? 'A FULL-SCALE WAR RISES' : 'THE WORLDS ALIGN',
                kicker: calledByHand ? 'CALLED BY HAND · FULL SCALE' : null,
                text: calledByHand
                    ? 'A full-scale war has been called BY HAND. The Ruins of a dead world open wider than ever - roughly four times the test grounds, three joined worlds deep, sealed vaults, rival banners and the World Core itself. Registration is open now.'
                    : undefined,
                regMinutes: ev.registrationEndsAt ? Math.max(0, Math.round((ev.registrationEndsAt - Date.now()) / 60000)) : null,
                prefix: _botPrefix(),
            });
        } catch (e) { /* text fallback below */ }

        const prefix = _botPrefix();
        const caption = calledByHand
            ? `${BOT_MARKER}⚔️ *FULL-SCALE GUILD WAR — CALLED BY HAND*

A mod has raised the full-scale call. Every RPG group chat hears the horns: registration is OPEN - \`${prefix} gw join\` enters from any group, players deploy into bot DMs.
_Test skirmishes (\`${prefix} gw start -test\`) stay in their own GC; full-scale calls announce everywhere._`
            : `${BOT_MARKER}🌍 *THE WORLDS ALIGN*

An alignment-scale Guild War is forming on its own. \`${prefix} gw join\` enters from any group - players deploy into bot DMs.
_Mark/unmark this GC: \`${prefix} gw rpg off\`_`;

        let sent = 0;
        for (const gc of targets) {
            try {
                if (buf) {
                    await sock.sendMessage(gc, { image: buf, caption });
                } else {
                    await sock.sendMessage(gc, {
                        text: calledByHand
                            ? `${BOT_MARKER}⚔️ *FULL-SCALE GUILD WAR* called by hand - registration open. \`${prefix} gw join\` to enter.`
                            : `${BOT_MARKER}🌍 *THE WORLDS ALIGN* - an alignment-scale Guild War is forming. \`${prefix} gw join\` to enter.`,
                    });
                }
                sent++;
            } catch (e) { /* dead group — skip */ }
            await new Promise((r) => setTimeout(r, GC_PACE_MS));
        }
        console.log(`[WorldAlignment] full-scale call broadcast: ${sent}/${targets.length} RPG-friendly GCs on ${botId} (event ${ev.eventId}${calledByHand ? ', called by hand' : ', organic'})`);
        return { sent, total: targets.length, eventId: ev.eventId };
    } catch (e) {
        console.error('[WorldAlignment] broadcast failed:', e.message);
        return { skipped: 'error', error: e.message };
    }
}

// tick-path wrapper: announce the newest REGISTRATION alignment event, if
// any (organic autospawn OR mod-called — both announce to RPG GCs).
async function _broadcastOnce(sock, BOT_MARKER, win = null) {
    try {
        const GuildWarEvent = require('../models/GuildWarEvent');
        const ev = await GuildWarEvent.findOne({ type: 'alignment', state: 'REGISTRATION' })
            .sort({ createdAt: -1 }).lean();
        if (!ev) return { skipped: 'no-event' };
        return await announceAlignmentWar(sock, BOT_MARKER, ev);
    } catch (e) {
        console.error('[WorldAlignment] broadcast failed:', e.message);
        return { skipped: 'error', error: e.message };
    }
}

function status() {
    const win = cosmology.triuneWindow(Date.now());
    return {
        aligned: !!win?.aligned,
        autospawn: !!CFG.ALIGNMENT_AUTOSPAWN,
        windowKey: win ? windowKey(win) : null,
        minutesLeft: win?.minutesLeft ?? null,
        lastFired: _lastFiredKey,
    };
}

module.exports = { tick, status, _claim, windowKey, _broadcastOnce, announceAlignmentWar, GC_PACE_MS };
