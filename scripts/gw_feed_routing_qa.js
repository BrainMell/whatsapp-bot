#!/usr/bin/env node
// ⚔️ GW FEED ROUTING QA — double-send + destination-pin + flush-mutex fixes
// (owner 2026-10-06 20:01Z: "bot double-sending Ruins updates, sometimes
// responding in different group chats, and sometimes even different bots
// responding — find the actual cause, not another symptom patch")
//
//   S1. Cross-instance mirror handoff: when instance B claims the doc queue,
//       instance A's local mirror is ALREADY drained → no duplicate send.
//   S2. DB-mirror failure keeps the item local-only → still sent exactly once.
//   S3. Same-instance flush mutex: concurrent flushes (fast timer + sweeper)
//       send each item once.
//   S4. Hostless destination pin: first flusher pins feedDestinations on the
//       event doc; a DIFFERENT bot's later flush routes to the SAME chats
//       (never to its own list).
//   S5. Retry semantics intact: failed sends requeue (tries+1), next flush
//       delivers; drop-after-3 untouched.
//   S6. Engine source pins: abortive GC ownership claim + msg-id dedup LRU.
// Uses the gwtest DB + mock socks (same pattern as gw_isolation_qa.js).
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
}

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

function memberSock(sendLog) {
    return {
        groupMetadata: async () => ({ id: 'g-ok@g.us' }),
        sendMessage: async (jid, content) => {
            if (sendLog) sendLog.push({ jid, text: (content.text || content.caption || '(image)').slice(0, 60) });
            return {};
        },
    };
}
async function waitFor(fn, ms = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 50)); }
    return false;
}

(async () => {
    await connectDB();
    const mongoose = require('mongoose');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const feed = require('../core/rpg/guildWar/feed');
    const botConfig = require('../botConfig');
    const system = require('../core/utils/system');
    const realGetBotId = botConfig.getBotId;
    const realSystemGet = system.get;
    const systemStub = (lists) => (k, d) => (k.startsWith('gw_rpg_gcs_') && lists && lists[k] !== undefined ? lists[k] : realSystemGet.call(system, k, d));

    const mkEvent = async (extra = {}) => {
        const eventId = `gw_feedqa_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
        await GuildWarEvent.create({ eventId, state: 'ACTIVE', players: [
            { jid: 'fx@s.whatsapp.net', name: 'FX', guildId: 'g1', guildName: 'G1', status: 'active' },
        ], ...extra });
        return eventId;
    };
    const cleanup = async (ids) => { await GuildWarEvent.deleteMany({ eventId: { $in: ids } }); };

    // ═══ S1: cross-instance mirror handoff — the double-send kill ═══
    console.log('\n══ S1. mirror handoff: claim by B ⇒ A cannot resend ══');
    botConfig.getBotId = () => 'bota';
    const ev1 = await mkEvent({ hostGroupId: '120363feed1@g.us' });
    feed.queue(ev1, 'normal', 'S1 dup probe — must send exactly once');
    const mirrored = await waitFor(async () => {
        const d = await GuildWarEvent.findOne({ eventId: ev1 }, { feedQueue: 1 }).lean();
        return (d.feedQueue || []).length >= 1 && feed.st(ev1).queue.length === 0;
    });
    check('S1: mirror ACK drained the local copy (doc = single source)', mirrored);
    const sentB = [], sentA = [];
    await feed.flush(ev1, memberSock(sentB), '\u200B');
    check('S1: instance B claimed + delivered the wave', sentB.length === 1, JSON.stringify(sentB));
    await feed.flush(ev1, memberSock(sentA), '\u200B');
    check('S1: instance A sent NOTHING afterwards (old code re-sent from the local mirror)', sentA.length === 0, JSON.stringify(sentA));
    const d1 = await GuildWarEvent.findOne({ eventId: ev1 }, { feedQueue: 1 }).lean();
    check('S1: doc queue fully drained', (d1.feedQueue || []).length === 0);

    // ═══ S2: mirror failure → local-only fallback, still exactly once ═══
    console.log('\n══ S2. DB-mirror failure keeps the item local-only ══');
    const realUpdateOne = GuildWarEvent.updateOne.bind(GuildWarEvent);
    GuildWarEvent.updateOne = () => Promise.reject(new Error('qa forced mirror failure'));
    const ev2 = await mkEvent({ hostGroupId: '120363feed2@g.us' });
    feed.queue(ev2, 'normal', 'S2 local-only probe');
    await new Promise((r) => setTimeout(r, 150));
    check('S2: failed mirror keeps the item in the local mirror', feed.st(ev2).queue.length === 1, `local=${feed.st(ev2).queue.length}`);
    const d2pre = await GuildWarEvent.findOne({ eventId: ev2 }, { feedQueue: 1 }).lean();
    check('S2: doc queue NOT polluted by the failed write', (d2pre.feedQueue || []).length === 0);
    const sent2 = [];
    await feed.flush(ev2, memberSock(sent2), '\u200B');
    check('S2: local-only item still delivered exactly once', sent2.length === 1, JSON.stringify(sent2));
    GuildWarEvent.updateOne = realUpdateOne;

    // ═══ S3: same-instance flush mutex ═══
    console.log('\n══ S3. concurrent flushes on ONE instance send once ══');
    const ev3 = await mkEvent({ hostGroupId: '120363feed3@g.us' });
    feed.queue(ev3, 'normal', 'S3 mutex probe');
    await waitFor(async () => feed.st(ev3).queue.length === 0);
    const slowLog = [];
    const slowSock = {
        groupMetadata: async () => ({ id: 'g-ok@g.us' }),
        sendMessage: async (jid, content) => { await new Promise((r) => setTimeout(r, 250)); slowLog.push(jid); return {}; },
    };
    await Promise.all([feed.flush(ev3, slowSock, '\u200B'), feed.flush(ev3, slowSock, '\u200B')]);
    check('S3: overlapping flushes produced exactly ONE send', slowLog.length === 1, `sends=${slowLog.length}`);

    // ═══ S4: hostless destination pin ═══
    console.log('\n══ S4. hostless events pin ONE destination set on the doc ══');
    botConfig.getBotId = () => 'bota';
    system.get = systemStub({ gw_rpg_gcs_bota: ['120363a1@g.us', '120363a2@g.us'], gw_rpg_gcs_botb: ['120363b1@g.us'] });
    const ev4 = await mkEvent({ hostGroupId: null, feedDestinations: null });
    const sentA4 = [];
    await feed.queue(ev4, 'normal', 'S4 pinned wave 1 (from bot A)');
    await waitFor(async () => feed.st(ev4).queue.length === 0);
    await feed.flush(ev4, memberSock(sentA4), '\u200B');
    const d4 = await GuildWarEvent.findOne({ eventId: ev4 }, { feedDestinations: 1 }).lean();
    check('S4: first flusher pinned ITS list on the doc', JSON.stringify(d4.feedDestinations) === JSON.stringify(['120363a1@g.us', '120363a2@g.us']), JSON.stringify(d4.feedDestinations));
    check('S4: bot A delivered to the pinned chats', sentA4.length >= 1 && sentA4.every((s) => s.jid === '120363a1@g.us' || s.jid === '120363a2@g.us'), JSON.stringify(sentA4.map((s) => s.jid)));
    // a DIFFERENT bot flushes next: same pinned destinations, never its own
    botConfig.getBotId = () => 'botb';
    const sentB4 = [];
    await feed.queue(ev4, 'normal', 'S4 pinned wave 2 (from bot B)');
    await waitFor(async () => feed.st(ev4).queue.length === 0);
    await feed.flush(ev4, memberSock(sentB4), '\u200B');
    check('S4: bot B routed to the SAME pinned chats (not its own list)', sentB4.length >= 1 && sentB4.every((s) => s.jid === '120363a1@g.us' || s.jid === '120363a2@g.us'), JSON.stringify(sentB4.map((s) => s.jid)));
    check('S4: bot B never touched its own rpg list', !sentB4.some((s) => s.jid === '120363b1@g.us'));
    system.get = realSystemGet;

    // ═══ S5: retry semantics intact ═══
    console.log('\n══ S5. failed sends requeue (tries+1), next flush delivers ══');
    const ev5 = await mkEvent({ hostGroupId: '120363feed5@g.us' });
    feed.queue(ev5, 'normal', 'S5 retry probe');
    await waitFor(async () => feed.st(ev5).queue.length === 0);
    const failSock = { groupMetadata: async () => ({ id: 'g-ok@g.us' }), sendMessage: async () => { throw new Error('qa send failure'); } };
    await feed.flush(ev5, failSock, '\u200B');
    let d5 = await GuildWarEvent.findOne({ eventId: ev5 }, { feedQueue: 1 }).lean();
    check('S5: failed item requeued with tries+1', (d5.feedQueue || []).length === 1 && (d5.feedQueue[0].tries || 0) === 1, JSON.stringify(d5.feedQueue && d5.feedQueue[0] && d5.feedQueue[0].tries));
    const sent5 = [];
    await feed.flush(ev5, memberSock(sent5), '\u200B');
    d5 = await GuildWarEvent.findOne({ eventId: ev5 }, { feedQueue: 1 }).lean();
    check('S5: next flush delivers the retried item + drains', sent5.length === 1 && (d5.feedQueue || []).length === 0);

    // ═══ S6: engine source pins (abortive claim + msg-id dedup) ═══
    console.log('\n══ S6. engine.js routing pins ══');
    const eng = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
    check('S6: GC ownership claim is ABORTIVE (awaited, losers drop the message)', eng.includes('const _won = await claimGcOwnership(chatId);') && eng.includes('if (!_won) return;'));
    check('S6: concurrent claims share one in-flight promise', eng.includes('_gcClaimInflight'));
    check('S6: re-delivery dedup LRU present (Baileys same-id replays dropped)', eng.includes('_processedMsgIds') && eng.includes('_processedMsgIds.size > 800'));
    const feedSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'feed.js'), 'utf8');
    check('S6: feed flush holds a per-event mutex', feedSrc.includes('if (s.flushing) return;'));
    check('S6: flush awaits the mirror-settled barrier', feedSrc.includes('await s.mirror'));
    check('S6: destination pin is atomic first-writer-wins', feedSrc.includes('feedDestinations: null }, { feedDestinations: { $size: 0 }'));

    // ═══ cleanup ═══
    botConfig.getBotId = realGetBotId;
    feed.dispose(ev1); feed.dispose(ev2); feed.dispose(ev3); feed.dispose(ev4); feed.dispose(ev5);
    await cleanup([ev1, ev2, ev3, ev4, ev5]);
    await mongoose.disconnect();
    console.log(`\n════════════════════════════════════`);
    console.log(`  RESULT: ${PASS} passed, ${FAIL} failed`);
    console.log(`════════════════════════════════════`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
