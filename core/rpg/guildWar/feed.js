// ============================================
// 📢 EVENT FEED — Guild War Overhaul 2026-10-03
// Batched, tiered group announcer. Minors merge into a digest; normals are
// rate-capped; majors (image cards) always go. Hard cap protects the group
// from spam and WhatsApp rate limits. Never blocks the event loop.
// ============================================

const CFG = require('./config');
const state = require('./state');

// per-event feed state (memory; a crash loses at most one flush window)
const feedStates = new Map(); // eventId → { queue: [], lastNormalAt, windowStart, windowCount, hostGroupId, scoreboardAt }

function st(eventId) {
    let s = feedStates.get(eventId);
    if (!s) {
        s = { queue: [], lastNormalAt: 0, windowStart: 0, windowCount: 0, scoreboardAt: 0 };
        feedStates.set(eventId, s);
    }
    return s;
}

function tierRank(t) { return t === 'major' ? 2 : t === 'normal' ? 1 : 0; }

// queue a feed item; flushes happen on the event sweeper tick (60s) AND on a
// shorter internal cadence via tickAll called from the same sweeper
function queue(eventId, tier, text) {
    if (!text) return;
    const s = st(eventId);
    s.queue.push({ tier, text: String(text).slice(0, 300), t: Date.now() });
    if (s.queue.length > 200) s.queue.splice(0, s.queue.length - 200); // bound
}

// rate-window accounting: max MAX_MSGS_PER_5MIN group messages
function windowAllows(s) {
    const now = Date.now();
    if (now - s.windowStart > 5 * 60 * 1000) { s.windowStart = now; s.windowCount = 0; }
    return s.windowCount < CFG.FEED.MAX_MSGS_PER_5MIN;
}

function markSent(s) { s.windowCount++; s.lastNormalAt = Date.now(); }

// build digest text from queued minors (+normals if over cap)
function buildDigest(items) {
    const lines = items.slice(0, CFG.FEED.MINOR_MAX_LINES).map((i) => `• ${i.text}`);
    if (items.length > CFG.FEED.MINOR_MAX_LINES) lines.push(`• …and ${items.length - CFG.FEED.MINOR_MAX_LINES} more`);
    return lines.join('\n').slice(0, 900);
}

// flush one event's queue; returns list of {text, isCard} to send
async function flush(eventId, sock, BOT_MARKER) {
    const s = st(eventId);
    if (!s.queue.length) return;
    const ev = await state.getEvent(eventId, { fresh: false });
    if (!ev) return;
    const host = ev.hostGroupId;
    if (!host) { s.queue = []; return; }

    const minors = s.queue.filter((i) => tierRank(i.tier) === 0);
    const normals = s.queue.filter((i) => tierRank(i.tier) === 1);
    const majors = s.queue.filter((i) => tierRank(i.tier) === 2);
    s.queue = [];

    // majors: always sent (they are the designed image-card moments)
    for (const m of majors) {
        if (windowAllows(s)) {
            await sendToGroup(sock, host, BOT_MARKER + `🚨 *${m.text}*`, true);
            markSent(s);
        } else {
            minors.push(m); // degrade to digest under pressure
        }
    }

    // normals: rate-limited
    for (const n of normals) {
        if (windowAllows(s) && Date.now() - s.lastNormalAt >= CFG.FEED.NORMAL_GAP_MS) {
            await sendToGroup(sock, host, BOT_MARKER + `⚔️ ${n.text}`, false);
            markSent(s);
        } else {
            minors.push(n);
        }
    }

    // minors: one digest per flush
    if (minors.length && windowAllows(s)) {
        await sendToGroup(sock, host, BOT_MARKER + `📜 *Ruins digest*\n${buildDigest(minors)}`, false);
        markSent(s);
    }
}

async function sendToGroup(sock, host, text, isCard) {
    try {
        if (isCard) {
            // major cards: reuse official-notice renderer when available
            const notice = require('./noticeCard');
            const buf = await notice.renderNotice(text.replace(/^\S+\s*/, '').slice(0, 180));
            await sock.sendMessage(host, { image: buf, caption: text.slice(0, CFG.FEED.MAX_CAPTION) });
        } else {
            await sock.sendMessage(host, { text });
        }
    } catch (e) {
        console.error('[GWFeed] send failed:', e.message);
    }
}

// scoreboard post (called on cadence by tickAll)
async function postScoreboard(eventId, sock, BOT_MARKER) {
    const ev = await state.getEvent(eventId);
    if (!ev || ev.state !== 'ACTIVE') return;
    const s = st(eventId);
    if (Date.now() - s.scoreboardAt < CFG.FEED.SCOREBOARD_EVERY_MS) return;
    s.scoreboardAt = Date.now();
    const rows = computeScoreboard(ev);
    const text = rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} ${r.name} — ${r.points} GP`).join('\n').slice(0, 700);
    if (windowAllows(s)) {
        await sendToGroup(sock, ev.hostGroupId, BOT_MARKER + `🏆 *Guild War standings*\n${text}`, false);
        markSent(s);
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

async function tickAll(sock, BOT_MARKER) {
    for (const eventId of [...feedStates.keys()]) {
        try {
            await flush(eventId, sock, BOT_MARKER);
            await postScoreboard(eventId, sock, BOT_MARKER);
        } catch (e) {
            console.error('[GWFeed] tick error:', e.message);
        }
    }
}

function dispose(eventId) { feedStates.delete(eventId); }

module.exports = { queue, tickAll, flush, dispose, computeScoreboard, buildDigest, st, _states: feedStates };
