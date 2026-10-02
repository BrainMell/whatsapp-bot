// ============================================
// 🏋️ GUILD WAR LOAD TEST — overnight requirement (owner brief §9d)
// Large-scale concurrent activity against the REAL modules + TEST db:
//   L1: 40 players   normal-scale
//   L2: 100 players  normal-max
//   L3: 150 players  alignment-scale map
//   L4: 2 concurrent events
// Measures: per-action latency p50/p95/p99, DB ops per action (mongoose
// debug counter), event-loop lag (monitorEventLoopDelay), memory growth,
// map-render throughput. Run: node scripts/gw_load.js
// ============================================

process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const mb = (v) => (v / 1048576).toFixed(0);

async function connectDB() {
    const envPath = fs.existsSync(path.join(ROOT, '.env')) ? path.join(ROOT, '.env') : '/home/ubuntu/whatsapp-bot/.env';
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    let uri = env.MONGO_URI || env.MONGODB_URI || env.MONGO_URL || env.DATABASE_URL;
    uri = uri.replace(/\/([^/?]+)(\?|$)/, '/gwtest$2');
    process.env.MONGO_URI = uri;
    await require('../db')();
}

function pct(arr, p) {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

async function runLoad(label, playerCount, opts = {}) {
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const rooms = require('../core/rpg/guildWar/rooms');
    const GuildWarEvent = require('../core/models/GuildWarEvent');

    // DB op counter via mongoose debug
    let dbOps = 0, counting = false;
    require('mongoose').set('debug', (coll, method) => { if (counting) dbOps++; });

    // event-loop lag monitor
    const delay = monitorEventLoopDelay({ resolution: 20 });
    delay.enable();

    // create + register + start
    const created = await state.createEvent({
        type: opts.alignment ? 'alignment' : 'normal',
        hostGroupId: `load-${label}@g.us`, initiatedBy: 'load',
    });
    const jids = [];
    for (let i = 0; i < playerCount; i++) {
        const jid = `${label}${i}@s.whatsapp.net`;
        jids.push(jid);
        await state.registerPlayer(created.event.eventId, { jid, name: `${label}${i}`, guildId: i % 3 === 0 ? 'GLoadA' : 'GLoadB', guildName: i % 3 === 0 ? 'GLoadA' : 'GLoadB' });
    }
    const tStart = Date.now();
    const started = await state.startEvent(created.event.eventId);
    const startMs = Date.now() - tStart;
    if (!started.ok) { console.log(`[${label}] start FAILED: ${started.reason}`); return; }
    const ev = started.event;

    // mock sock (records sends, zero network)
    const sent = [];
    const sock = { async sendMessage(chatId, content) { sent.push(1); } };

    // ── movement wave: every player moves 5 times, all concurrent per wave ──
    counting = true;
    const latencies = [];
    let failures = 0;
    for (let wave = 0; wave < 5; wave++) {
        const t0 = Date.now();
        await Promise.all(jids.map(async (jid, i) => {
            const dir = ['n', 'e', 's', 'w'][(wave + i) % 4];
            const a = performance.now();
            try {
                await dmRouter.handleDM(sock, jid, jid, `move ${dir}`, 'GW');
            } catch (e) { failures++; }
            latencies.push(performance.now() - a);
        }));
        // cooldown is 6s per player; waves are spaced by cooldown for realism
        await new Promise((r) => setTimeout(r, wave < 4 ? 6200 : 0));
    }
    counting = false;

    // ── map renders: 12 players concurrently ──
    const renderer = require('../core/rpg/guildWar/mapRenderer');
    const renderT0 = performance.now();
    const fresh = await state.getEvent(created.event.eventId, { fresh: true });
    const renderPlayers = fresh.players.slice(0, 12);
    const buffers = await Promise.all(renderPlayers.map((p) => renderer.renderRuinsMap(fresh, p, {})));
    const renderMs = performance.now() - renderT0;
    const avgRender = renderMs / buffers.length;

    delay.disable();
    const lagSamples = [...delay.percentiles(50)].map((d) => d / 1e6); // ns→ms buckets: use mean/max instead
    const memNow = process.memoryUsage().rss;

    const p50 = pct(latencies, 0.5), p95 = pct(latencies, 0.95), p99 = pct(latencies, 0.99);
    const result = {
        label, players: playerCount, side: ev.side, rooms: ev.rooms.length,
        moveActions: latencies.length, moveFailures: failures,
        latency_p50_ms: Math.round(p50), latency_p95_ms: Math.round(p95), latency_p99_ms: Math.round(p99),
        dbOpsPerAction: +(dbOps / Math.max(1, latencies.length)).toFixed(2),
        eventStartMs: startMs,
        render12AvgMs: Math.round(avgRender),
        loopLagMeanMs: +(delay.mean / 1e6).toFixed(2), loopLagMaxMs: +(delay.max / 1e6).toFixed(1),
        rssMB: mb(memNow),
        sendsToHost: sent.length,
    };
    console.log(`[LOAD] ${JSON.stringify(result)}`);
    // cleanup: abort the event so the next run starts clean
    await state.abortEvent(created.event.eventId, 'load cleanup');
    return result;
}

(async () => {
    await connectDB();
    const mongoose = require('mongoose');
    for (const c of ['guildwarevents']) await mongoose.connection.db.collection(c).deleteMany({});
    const t0 = Date.now();
    const mem0 = process.memoryUsage().rss;
    const results = [];
    results.push(await runLoad('L1-40', 40));
    results.push(await runLoad('L2-100', 100));
    results.push(await runLoad('L3-150-align', 150, { alignment: true }));
    // L4: two events at once — run two halves concurrently on separate events
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const mk = async (tag, n) => {
        const created = await state.createEvent({ type: 'normal', hostGroupId: `${tag}@g.us`, initiatedBy: 'load' });
        for (let i = 0; i < n; i++) {
            await state.registerPlayer(created.event.eventId, { jid: `${tag}${i}@s.whatsapp.net`, name: `${tag}${i}`, guildId: 'G', guildName: 'G' });
        }
        const s = await state.startEvent(created.event.eventId);
        return { eventId: created.event.eventId, players: s.event.players.map((p) => p.jid) };
    };
    const t4 = performance.now();
    const [e1, e2] = await Promise.all([mk('L4a', 50), mk('L4b', 50)]);
    let ops4 = 0;
    require('mongoose').set('debug', () => { ops4++; });
    await Promise.all([e1, e2].map((e) => Promise.all(e.players.map((jid, i) =>
        dmRouter.handleDM({ async sendMessage() {} }, jid, jid, `move ${['n', 'e'][i % 2]}`, 'GW')))));
    const dualMs = Math.round(performance.now() - t4);
    console.log(`[LOAD] ${JSON.stringify({ label: 'L4-dual-2x50', dualFirstWaveMs: dualMs, dbOps: ops4, rssMB: mb(process.memoryUsage().rss) })}`);
    console.log(`[LOAD] total wall ${((Date.now() - t0) / 1000).toFixed(1)}s, mem growth ${mb(mem0)}→${mb(process.memoryUsage().rss)}MB`);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
