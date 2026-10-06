// ============================================
// 📢 EVENT FEED — Guild War Overhaul 2026-10-03 · Phase 2 RESURRECTION
// Batched, tiered group announcer. Minors merge into a digest; normals are
// rate-capped; majors (image cards) always go with a text fallback.
//
// PHASE 2 (why the war felt invisible — all fixed here):
//  1. Queue used to be PER-PROCESS MEMORY: a restart lost it and only the
//     instance that queued could flush it. Now the queue lives in the event
//     DOC (feedQueue[]) — atomic $push to enqueue, atomic claim-and-clear to
//     flush, so ANY instance can flush ANY queue and restarts lose nothing.
//  2. hostless (organic alignment) wars wiped the queue every flush because
//     hostGroupId was null. They now route to this bot's RPG-friendly GCs.
//  3. Send failures used to burn the item AND the rate window. Failed sends
//     now requeue (tries+1, drop after 3) and only SUCCESS marks the window.
//  4. Majors had no text fallback — now they degrade to text, never void.
//  5. feedStates leaked forever after a war ended — flush now disposes its
//     state once the event is over and the queue is drained.
//  6. A fast internal cadence (CFG.FEED.FLUSH_MS) makes the feed feel live
//     instead of waiting for the 60s sweeper piggyback.
// ============================================

const CFG = require('./config');
const state = require('./state');

// per-event feed state (memory): pacing windows + sock registration only —
// the ITEMS themselves live in the event doc (multi-instance + restart safe)
const feedStates = new Map(); // eventId → { windowStart, windowCount, lastNormalAt, scoreboardAt, hostOk }

let _sock = null, _marker = '\u200B', _fastTimer = null;

function st(eventId) {
    let s = feedStates.get(eventId);
    if (!s) {
        // `queue` = this instance's local mirror (QA/sim seam + zero-latency
        // flush source); the DOC's feedQueue[] remains the shared truth.
        s = { queue: [], windowStart: 0, windowCount: 0, lastNormalAt: 0, scoreboardAt: 0, hostOk: null };
        feedStates.set(eventId, s);
    }
    if (!s.queue) s.queue = [];
    return s;
}

// the sweeper calls this every 60s; the fast flush cadence reuses the sock
function registerSock(sock, BOT_MARKER) {
    if (sock) _sock = sock;
    if (BOT_MARKER) _marker = BOT_MARKER;
    if (!_fastTimer && CFG.FEED.FLUSH_MS > 0) {
        _fastTimer = setInterval(() => {
            tickAll(_sock, _marker).catch((e) => console.error('[GWFeed] fast tick:', e.message));
        }, CFG.FEED.FLUSH_MS);
        if (_fastTimer.unref) _fastTimer.unref();
    }
}

let _seq = 0;
function tierRank(t) { return t === 'major' ? 2 : t === 'normal' ? 1 : 0; }

// 💬 COPY OVERHAUL (owner 2026-10-05: "the group chat messages are so bland
// and boring fix that"): feed copy now carries its own emoji. When the queued
// text ALREADY opens with one, skip the tier prefix — no more "⚔️ 💀 has
// fallen" double-emoji stutters. Anything below U+2500 (letters, digits,
// markdown) still earns its tier badge.
function hasLeadEmoji(t) {
    try { return (t.codePointAt(0) || 0) >= 0x2500; } catch (e) { return false; }
}

// ⚔️ CROSS-BOX MEMBERSHIP GATE (2026-10-05): both servers share one MongoDB,
// so every instance sees every war's queue. A bot that is NOT a participant
// of the destination group used to claim the shared queue and burn items on
// guaranteed "forbidden" sends (300+ dropped messages/day observed on Box1).
// Membership is cached per group — positives 10 min, negatives 5 min.
// Unknown sock types (QA mocks) count as members to keep legacy sims alive.
const _memberCache = new WeakMap(); // sock → Map(jid → { ok, at })  [per-BOT cache: membership is bot-scoped, never jid-global]
async function isMemberOf(sock, jid) {
    if (!sock || !jid) return true;                            // nothing to verify → legacy path
    if (typeof sock.groupMetadata !== 'function') return true; // mock sock (QA/sim)
    let cache = _memberCache.get(sock);
    if (!cache) { cache = new Map(); _memberCache.set(sock, cache); }
    const now = Date.now();
    const hit = cache.get(jid);
    if (hit && now - hit.at < (hit.ok ? 10 : 5) * 60 * 1000) return hit.ok;
    let ok = false;
    try { const meta = await sock.groupMetadata(jid); ok = !!(meta && meta.id); }
    catch (e) { ok = false; }
    cache.set(jid, { ok, at: now });
    return ok;
}
async function reachableDests(sock, dests) {
    const out = [];
    for (const d of dests || []) if (await isMemberOf(sock, d)) out.push(d);
    return out;
}

// digest headers rotate so a war-long spectator never reads the same line twice
const DIGEST_HEADERS = [
    '📜 *Ruins digest*',
    '📜 *Dispatches from the Ruins*',
    '📜 *Whispers from the dead world*',
    '📜 *Word from the deep chambers*',
];
let _digestSeq = 0;
function digestHeader() { return DIGEST_HEADERS[_digestSeq++ % DIGEST_HEADERS.length]; }

// queue a feed item. Sync-local push (callers/sim read st().queue) + async
// mirror into the event doc so any instance / post-restart flush can send it.
// ⚔️ DOUBLE-SEND FIX (owner 2026-10-06 20:01Z: "bot double-sending Ruins
// updates… different bots responding"): the local mirror used to live on
// forever, so when ANOTHER instance claimed the doc copy and sent it, this
// instance's next flush still found the item locally and sent it AGAIN (3
// instances × 20s flush cadence = routine dupes). Now:
//   • the doc mirror ACK is the handoff — once $push resolves, the local copy
//     is dropped and the DOC is the item's only source;
//   • flush() awaits the mirror-settled promise before claiming, so a flush
//     racing our own pending write can never see the item twice;
//   • a DB-mirror failure keeps the item local-only (single source, no dup).
function queue(eventId, tier, text) {
    if (!text) return;
    const item = { id: `fq_${Date.now().toString(36)}_${(_seq++).toString(36)}`, tier, text: String(text).slice(0, 300), t: Date.now(), tries: 0 };
    const s = st(eventId);
    s.queue.push(item);
    // DB mirror (source of truth; bounded, atomic, multi-instance safe)
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const write = GuildWarEvent.updateOne(
        { eventId },
        { $push: { feedQueue: { $each: [item], $slice: -250 } } }
    ).then(() => {
        const cur = st(eventId);
        cur.queue = (cur.queue || []).filter((q) => q.id !== item.id);
    }).catch((e) => console.error('[GWFeed] queue mirror failed (item stays local-only):', e.message));
    s.mirror = (s.mirror || Promise.resolve()).then(() => write.catch(() => {}));
}

// rate-window accounting: max MAX_MSGS_PER_5MIN group messages
function windowAllows(s) {
    const now = Date.now();
    if (now - s.windowStart > 5 * 60 * 1000) { s.windowStart = now; s.windowCount = 0; }
    return s.windowCount < CFG.FEED.MAX_MSGS_PER_5MIN;
}

// only a SUCCESSFUL send may burn the rate window (Phase 2 #3)
function markSent(s) { s.windowCount++; s.lastNormalAt = Date.now(); }

// build digest text from queued minors (+normals if over cap)
function buildDigest(items) {
    const lines = items.slice(0, CFG.FEED.MINOR_MAX_LINES).map((i) => `• ${i.text}`);
    if (items.length > CFG.FEED.MINOR_MAX_LINES) lines.push(`• …and ${items.length - CFG.FEED.MINOR_MAX_LINES} more`);
    return lines.join('\n').slice(0, 900);
}

// where does this event's feed go?
// explicit host GC for hosted wars. For hostless (organic alignment) wars the
// destination used to be THIS BOT'S OWN rpg-GC list — whichever instance won
// the claim sent the wave to a DIFFERENT set of group chats (owner 2026-10-06:
// "sometimes responding in different group chats, and sometimes even different
// bots responding"). Now the destination set is resolved ONCE and pinned on
// the event doc (feedDestinations) with an atomic first-writer-wins update —
// every instance then routes identical waves to identical chats.
async function destinationsFor(ev) {
    if (ev.hostGroupId) return [ev.hostGroupId];
    if (Array.isArray(ev.feedDestinations) && ev.feedDestinations.length) return ev.feedDestinations.slice(0, 4);
    let mine = [];
    try {
        const botId = require('../../../botConfig').getBotId() || 'global';
        const list = require('../../../core/utils/system').get(`gw_rpg_gcs_${botId}`, []) || [];
        mine = list.slice(0, 4); // pace: at most 4 groups per flush wave
    } catch (e) { mine = []; }
    if (!mine.length) return [];
    // pin: only the FIRST instance to reach the doc wins; losers re-read and
    // route to the winner's set (atomic — no read-modify-write race).
    try {
        const GuildWarEvent = require('../../models/GuildWarEvent');
        // {field: null} matches BOTH missing and stored-null (the schema
        // default) — $exists:false alone missed stored nulls and the pin
        // never landed (caught by gw_feed_routing_qa S4).
        const r = await GuildWarEvent.updateOne(
            { eventId: ev.eventId, $or: [{ feedDestinations: null }, { feedDestinations: { $size: 0 } }] },
            { $set: { feedDestinations: mine } }
        );
        if (r && r.modifiedCount) return mine;
        const doc = await GuildWarEvent.findOne({ eventId: ev.eventId }, { feedDestinations: 1 }).lean();
        if (doc && Array.isArray(doc.feedDestinations) && doc.feedDestinations.length) return doc.feedDestinations.slice(0, 4);
    } catch (e) { /* fall through to local list */ }
    return mine;
}

// atomic claim: whoever's findOneAndUpdate matches FIRST gets the items and
// clears the queue in the same server-side op — no double-flush across the
// 3 instances. Returns the claimed array (possibly empty).
async function claimFromDoc(eventId) {
    try {
        const GuildWarEvent = require('../../models/GuildWarEvent');
        const prev = await GuildWarEvent.findOneAndUpdate(
            { eventId, 'feedQueue.0': { $exists: true } },
            { $set: { feedQueue: [] } },
            { new: false, projection: { feedQueue: 1 } }
        ).lean();
        return prev?.feedQueue || [];
    } catch (e) { return []; }
}

async function requeueToDoc(eventId, items) {
    if (!items.length) return;
    try {
        const GuildWarEvent = require('../../models/GuildWarEvent');
        await GuildWarEvent.updateOne(
            { eventId },
            { $push: { feedQueue: { $each: items, $slice: -250 } } }
        );
    } catch (e) { /* items age out via the stale filter */ }
}

// flush one event's queue; returns list of {text, isCard} sent
async function flush(eventId, sock, BOT_MARKER) {
    const s = st(eventId);
    const useSock = sock || _sock;
    const useMarker = BOT_MARKER || _marker;
    if (!useSock) return;
    // ⚔️ same-instance mutex: the 20s fast timer and the 60s sweeper can
    // overlap on a slow send wave; two concurrent flushes on ONE instance
    // claim+splice independently and both send the local mirror.
    if (s.flushing) return;
    s.flushing = true;
    try {
        return await _flushLocked(eventId, s, useSock, useMarker);
    } finally {
        s.flushing = false;
    }
}

async function _flushLocked(eventId, s, useSock, useMarker) {
    // ⚔️ mirror-settled barrier: pending queue() writes must land (or fail)
    // BEFORE the claim — otherwise a claim by anyone sees neither the doc
    // copy nor ours and the item later double-posts from the doc.
    try { if (s.mirror) await s.mirror; } catch (e) {}

    // ⚔️ membership gate BEFORE claiming: resolve the destination first and
    // leave the queue untouched when this bot cannot post to it — a member
    // instance will claim and deliver. Claiming here used to burn items with
    // 3× "forbidden" retries on cross-box wars (never succeedable).
    const GuildWarEventEarly = require('../../models/GuildWarEvent');
    // eventId rides the projection — destinationsFor pins feedDestinations
    // via ev.eventId (a lean doc without it can never pin — caught by S4).
    const evGate = await GuildWarEventEarly.findOne({ eventId }, { eventId: 1, hostGroupId: 1, feedDestinations: 1, state: 1 }).lean().catch(() => null);
    if (evGate) {
        const gateDests = await destinationsFor(evGate);
        const reachable = await reachableDests(useSock, gateDests);
        if (gateDests.length && !reachable.length) {
            if (Date.now() - (s.lastGateLog || 0) > 5 * 60 * 1000) {
                s.lastGateLog = Date.now();
                console.error(`[GWFeed] ${eventId}: not a member of ${gateDests.join(',')} — leaving queue for a member bot`);
            }
            await maybeDispose(eventId);
            return;
        }
    }

    // claim the DB queue + merge any items queued locally this instant
    const claimed = await claimFromDoc(eventId);
    const local = (s.queue || []).splice(0, (s.queue || []).length);
    const seen = new Set();
    const now = Date.now();
    const items = [];
    for (const it of [...claimed, ...local]) {
        if (!it || seen.has(it.id)) continue;
        if (now - (it.t || 0) > 10 * 60 * 1000) continue;      // stale: dropped silently
        if ((it.tries || 0) >= 3) continue;                     // failed 3×: give up (logged below)
        seen.add(it.id);
        items.push(it);
    }
    if (!items.length) { await maybeDispose(eventId); return; }

    // projected read: flush only needs routing info (hostGroupId + state) —
    // a full 1800-room lean read here stalled the loop at alignment scale.
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const evLite = await GuildWarEvent.findOne({ eventId }, { eventId: 1, hostGroupId: 1, feedDestinations: 1, state: 1 }).lean();
    if (!evLite) { await maybeDispose(eventId); return; }
    const dests = await destinationsFor(evLite);
    if (!dests.length) {
        // no destination on THIS bot: keep items for a bot that has one
        const back = items.map((i) => ({ ...i, tries: (i.tries || 0) + 1 }));
        await requeueToDoc(eventId, back);
        return;
    }
    // NOTE (2026-10-05 cross-box isolation): the membership gate ABOVE now
    // refuses the claim when this bot cannot reach any destination, so the
    // "guaranteed-forbidden send" case is gone. Failed sends on MEMBER bots
    // still requeue (tries+1) instead of burning items; drop after 3 tries.

    const minors = items.filter((i) => tierRank(i.tier) === 0);
    const normals = items.filter((i) => tierRank(i.tier) === 1);
    const majors = items.filter((i) => tierRank(i.tier) === 2);
    const failed = [];

    // majors: always sent (they are the designed image-card moments)
    for (const m of majors) {
        if (windowAllows(s)) {
            const ok = await sendToGroup(useSock, dests, useMarker + `${hasLeadEmoji(m.text) ? '' : '🚨 '}*${m.text}*`, true);
            if (ok) markSent(s); else failed.push({ ...m, tries: (m.tries || 0) + 1 });
        } else {
            minors.push(m); // degrade to digest under pressure
        }
    }

    // normals: rate-limited
    for (const n of normals) {
        if (windowAllows(s) && Date.now() - s.lastNormalAt >= CFG.FEED.NORMAL_GAP_MS) {
            const ok = await sendToGroup(useSock, dests, useMarker + `${hasLeadEmoji(n.text) ? '' : '⚔️ '}${n.text}`, false);
            if (ok) markSent(s); else failed.push({ ...n, tries: (n.tries || 0) + 1 });
        } else {
            minors.push(n);
        }
    }

    // minors: one digest per flush
    if (minors.length && windowAllows(s)) {
        const ok = await sendToGroup(useSock, dests, useMarker + `${digestHeader()}\n${buildDigest(minors)}`, false);
        if (!ok) failed.push(...minors.map((m) => ({ ...m, tries: (m.tries || 0) + 1 })));
    } else if (minors.length) {
        failed.push(...minors.map((m) => ({ ...m, tries: (m.tries || 0) + 1 })));
    }

    if (failed.length) {
        console.error(`[GWFeed] ${eventId}: ${failed.length} item(s) requeued (send failed / window pressure)`);
        await requeueToDoc(eventId, failed);
    }
    await maybeDispose(eventId);
}

// over-war cleanup (Phase 2 #7): once the event is neither registering nor
// active AND its queue is drained, drop this instance's feed memory.
async function maybeDispose(eventId) {
    try {
        const ev = await state.getEvent(eventId, { fresh: true });
        if (!ev || !['ACTIVE', 'REGISTRATION'].includes(ev.state)) {
            const GuildWarEvent = require('../../models/GuildWarEvent');
            const doc = await GuildWarEvent.findOne({ eventId }, { feedQueue: 1 }).lean();
            if (!doc || !(doc.feedQueue || []).length) dispose(eventId);
        }
    } catch (e) { /* keep state on error — harmless */ }
}

// one send to every destination; returns true when at least one landed.
// majors (isCard) degrade to plain text when the card render fails (Phase 2 #5).
async function sendToGroup(sock, dests, text, isCard) {
    let any = false;
    for (const dest of dests) {
        try {
            if (isCard) {
                let buf = null;
                try {
                    const notice = require('./noticeCard');
                    buf = await notice.renderNotice(text.replace(/^\S+\s*/, '').slice(0, 180));
                } catch (e) { buf = null; }
                if (buf) await sock.sendMessage(dest, { image: buf, caption: text.slice(0, CFG.FEED.MAX_CAPTION) });
                else await sock.sendMessage(dest, { text: text.slice(0, CFG.FEED.MAX_CAPTION) }); // text fallback
            } else {
                await sock.sendMessage(dest, { text });
            }
            any = true;
        } catch (e) {
            console.error('[GWFeed] send failed:', e.message);
        }
    }
    return any;
}

// scoreboard post (called on cadence by tickAll)
// ⚔️ Phase 2 #bookkeeping fix: scoreboardAt is NO LONGER pre-bumped — a
// rate-window block used to eat the post AND reset its timer.
async function postScoreboard(eventId, sock, BOT_MARKER) {
    const ev = await state.getEvent(eventId);
    if (!ev || ev.state !== 'ACTIVE') return;
    const s = st(eventId);
    if (Date.now() - s.scoreboardAt < CFG.FEED.SCOREBOARD_EVERY_MS) return;
    const dests = await destinationsFor(ev);
    if (!dests.length) return;
    // ⚔️ cross-box gate: a non-member bot must not even TRY the scoreboard
    // (it cannot succeed; the member bot's own tickAll posts it there)
    if (!(await reachableDests(sock || _sock, dests)).length) return;
    const rows = computeScoreboard(ev);
    const text = rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} *${r.name}* — ${r.points} GP`).join('\n').slice(0, 700);
    // 💬 live pulse line: the standings should read like a war bulletin,
    // not a database dump (owner 2026-10-05 copy overhaul)
    const cleared = (ev.rooms || []).filter((r) => r && r.state === 'CLEARED').length;
    const alive = (ev.players || []).filter((p) => p.status === 'active').length;
    const pulse = `_${cleared} chamber${cleared === 1 ? '' : 's'} cleared · ${alive} champion${alive === 1 ? '' : 's'} still standing_`;
    if (windowAllows(s)) {
        const useSock = sock || _sock;
        if (!useSock) return;
        const ok = await sendToGroup(useSock, dests, (BOT_MARKER || _marker) + `🏆 *War standings — the Association's ledger*\n${pulse}\n${text}`, false);
        if (ok) { s.scoreboardAt = Date.now(); markSent(s); }
    }
}

function computeScoreboard(ev) {
    const byGuild = new Map();
    for (const p of ev.players) {
        const g = byGuild.get(p.guildId) || { guildId: p.guildId, name: p.guildName || p.guildId, points: 0 };
        g.points += p.score || 0;
        byGuild.set(p.guildId, g);
    }
    return [...byGuild.values()].sort((a, b) => b.points - a.points);
}

// flush every queue we know about: local feedStates keys ∪ the actives the
// sweeper already fetched (cross-instance pickup — another bot's items flush
// from THIS bot if this bot is the one that can reach the destination).
async function tickAll(sock, BOT_MARKER, actives = null) {
    registerSock(sock, BOT_MARKER);
    const ids = new Set(feedStates.keys());
    if (Array.isArray(actives)) for (const ev of actives) ids.add(ev.eventId);
    for (const eventId of ids) {
        try {
            await flush(eventId, sock, BOT_MARKER);
            await postScoreboard(eventId, sock, BOT_MARKER);
        } catch (e) {
            console.error('[GWFeed] tick error:', e.message);
        }
    }
}

function dispose(eventId) { feedStates.delete(eventId); }

module.exports = { queue, tickAll, flush, dispose, registerSock, computeScoreboard, buildDigest, st, isMemberOf, reachableDests, _states: feedStates };
