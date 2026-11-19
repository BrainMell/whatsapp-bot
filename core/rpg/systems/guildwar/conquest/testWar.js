'use strict';
// 🧪 STANDALONE TEST WAR (2026-11-19). `.j cqtest [@friends]` — no guild, no GuildWarEvent doc, no mod gate beyond
// the caller (war.js / engine gate it). It builds its own in-memory event, launches a fast test war (~7x timers,
// 2 NPC rival guilds) and runs its OWN ticker so marches arrive, siege rounds resolve and arena/capture cards post
// exactly like a real war. Then use `cq dbg` to jump straight to any encounter type.
const store = require('./store');
const TICK_MS = 4000;
const _tickers = new Map(); // key -> interval

async function start(sock, chatId, jid, prefix, { name = 'Champion', extra = [] } = {}) {
    const cq = require('./index'); if (!cq.enabled()) return { ok: false, reason: 'Conquest is off (GW_CONQUEST=0).' };
    const guilds = require('../guilds'); let gname = null; try { gname = guilds.getUserGuild(jid); } catch (e) { /* none */ }
    const guildName = gname || 'Test Company';
    const eventId = `cqtest-${String(chatId).split('@')[0]}-${Date.now().toString(36)}`;
    const jids = [...new Set([jid, ...extra])];
    const players = jids.map((j) => ({ jid: j, name: j === jid ? name : String(j).split('@')[0], guildName, status: 'active' }));
    const ev = { eventId, hostGroupId: chatId, players, type: 'normal' };
    // stop any earlier test war this chat started
    for (const [k, t] of _tickers) if (k.startsWith(`cqtest-${String(chatId).split('@')[0]}-`)) { clearInterval(t); _tickers.delete(k); }
    const r = await require('./launch').launch(sock, ev, { chatId, prefix, test: true });
    startTicker(sock, ev);
    return { ok: true, eventId, guild: guildName, players: players.length, ...r };
}

function startTicker(sock, ev) {
    const { tickWar } = require('./ticker');
    let busy = false; const t0 = Date.now();
    const timer = setInterval(async () => {
        if (busy) return; busy = true;
        try {
            const s = await store.load(ev.eventId);
            if (!s || s.status !== 'active' || Date.now() - t0 > 3 * 3600e3) { clearInterval(timer); _tickers.delete(ev.eventId); return; }
            await tickWar(ev, sock);
        } catch (e) { console.warn('[cqtest] tick:', e && e.message); } finally { busy = false; }
    }, TICK_MS);
    if (timer.unref) timer.unref();
    _tickers.set(ev.eventId, timer);
}

module.exports = { start, startTicker, TICK_MS };
