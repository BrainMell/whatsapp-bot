#!/usr/bin/env node
// ⚔️ GW ISOLATION QA — cross-box flow lease + feed reachability gate (2026-10-05,
// updated 2026-10-07 for GC COEXISTENCE — owner scrapped "one group per bot")
// Verifies:
//   1. Reachability primitives (capability check — NOT a group assignment).
//   2. Flow lease: only ONE instance runs proactive flows per event.
//   3. Feed flush: a bot that cannot reach the destination never claims/burns
//      the shared feedQueue (capability check; with all bots in the GC every
//      instance passes and the atomic claim picks the single sender).
//   4. tick(): coexistence — ANY instance may lease and run flows; the lease
//      still guarantees exactly ONE runner (no spectator concept anymore).
//   5. Start-card DMs fire exactly once (state.tick path only).
//   6. 🤝 Cross-instance command claim (msgClaim): first instance wins the
//      E11000 race, second instance skips, same-instance backfill skips too.
//   7. 🤝 Scoreboard window claimed on the DOC (one poster per window across
//      instances — was per-instance memory → triple posts in shared GCs).
// Uses the gwtest DB + mock socks (same pattern as gw_presentation_sim.js).
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function connectDB() {
    // parse .env FIRST and redirect MONGO_URI to the TEST database BEFORE any
    // module that caches the connection loads (same pattern as gw_sim.js)
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

function memberSock() {
    return { groupMetadata: async () => ({ id: 'g-ok@g.us', subject: 'x' }) };
}
function strangerSock() {
    return { groupMetadata: async () => { throw new Error('forbidden'); } };
}

(async () => {
    await connectDB();
    const mongoose = require('mongoose');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const state = require('../core/rpg/guildWar/state');
    const feed = require('../core/rpg/guildWar/feed');

    // ── seed a minimal event doc ──
    const eventId = `gw_isoqa_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId });
    const ev = await GuildWarEvent.create({
        eventId, state: 'REGISTRATION', hostGroupId: '120363iso@g.us',
        registrationEndsAt: Date.now() - 1000, // expired → auto-start eligible
        players: [
            { jid: 'a@s.whatsapp.net', name: 'A', guildId: 'g1', guildName: 'G1', status: 'registered' },
            { jid: 'b@s.whatsapp.net', name: 'B', guildId: 'g2', guildName: 'G2', status: 'registered' },
        ],
    });

    // ═══ 1. isMemberOf / reachableDests ═══
    console.log('\n══ 1. membership gate primitives ══');
    check('member sock → member', await feed.isMemberOf(memberSock(), '120363iso@g.us') === true);
    check('stranger sock → NOT member', await feed.isMemberOf(strangerSock(), '120363iso@g.us') === false);
    check('mock sock (no groupMetadata) → assumed member', await feed.isMemberOf({}, '120363iso@g.us') === true);
    check('null jid → legacy true', await feed.isMemberOf(memberSock(), null) === true);
    const reach = await feed.reachableDests(memberSock(), ['120363iso@g.us']);
    check('reachableDests keeps member dest', reach.length === 1);
    const reach2 = await feed.reachableDests(strangerSock(), ['120363iso@g.us']);
    check('reachableDests drops stranger dest', reach2.length === 0);

    // ═══ 2. flow lease ═══
    console.log('\n══ 2. flow lease (claimFlow) ══');
    // fake tenant A
    const botConfig = require('../botConfig');
    const realName = botConfig.getBotName;
    botConfig.getBotName = () => 'TenantA';
    const c1 = await state.claimFlow(eventId);
    check('tenant A claims fresh event', c1 === true);
    botConfig.getBotName = () => 'TenantB';
    const c2 = await state.claimFlow(eventId);
    check('tenant B blocked while A holds lease', c2 === false);
    botConfig.getBotName = () => 'TenantA';
    const c3 = await state.claimFlow(eventId);
    check('tenant A refresh is free', c3 === true);
    // expiry takeover
    await GuildWarEvent.updateOne({ eventId }, { $set: { 'flow.at': Date.now() - 91 * 1000 } });
    botConfig.getBotName = () => 'TenantB';
    const c4 = await state.claimFlow(eventId);
    check('tenant B takes over after 90s TTL', c4 === true);
    botConfig.getBotName = () => 'TenantC';
    const c5 = await state.claimFlow(eventId);
    check('tenant C blocked after B takeover', c5 === false);
    botConfig.getBotName = realName;

    // ═══ 3. feed flush: non-member never claims the shared queue ═══
    console.log('\n══ 3. feed queue protection ══');
    feed.dispose(eventId);
    feed.queue(eventId, 'major', 'The war has begun! (must survive a stranger bot)');
    await new Promise((r) => setTimeout(r, 120)); // let the DB mirror land
    let doc = await GuildWarEvent.findOne({ eventId }, { feedQueue: 1 }).lean();
    const queuedBefore = (doc.feedQueue || []).length;
    check('item mirrored into shared doc queue', queuedBefore >= 1, `got ${queuedBefore}`);
    await feed.flush(eventId, strangerSock(), '\u200B');
    doc = await GuildWarEvent.findOne({ eventId }, { feedQueue: 1 }).lean();
    check('stranger bot left the queue untouched', (doc.feedQueue || []).length === queuedBefore,
        `before=${queuedBefore} after=${(doc.feedQueue || []).length}`);
    const sent = [];
    const capturingSock = {
        groupMetadata: async () => ({ id: '120363iso@g.us' }),
        sendMessage: async (jid, content) => { sent.push({ jid, text: content.text || content.caption || '(image)' }); return {}; },
    };
    await feed.flush(eventId, capturingSock, '\u200B');
    doc = await GuildWarEvent.findOne({ eventId }, { feedQueue: 1 }).lean();
    check('member bot claimed + delivered the item', sent.length >= 1 && (doc.feedQueue || []).length === 0,
        `sent=${sent.length} left=${(doc.feedQueue || []).length}`);
    check('major actually rendered a card or text', sent.length >= 1);

    // ═══ 4. tick(): coexistence — any instance may run flows, exactly once ═══
    console.log('\n══ 4. tick coexistence (spectator concept scrapped) ══');
    await GuildWarEvent.updateOne({ eventId }, { $set: { state: 'REGISTRATION', registrationEndsAt: Date.now() - 1000, flow: null } });
    const before = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('pre-tick: still REGISTRATION, no lease', before.state === 'REGISTRATION' && !before.flow);
    // 🤝 the "stranger" sock (member of NO real group) now behaves like any
    // instance: it may WIN the lease and run the flows. The lease — not
    // membership — is what single-executes. Tenant identity comes from
    // botConfig.getBotName (patched per tick like §2 does).
    const savedName4 = botConfig.getBotName;
    botConfig.getBotName = () => 'TenantA';
    const outA = await state.tick(strangerSock(), '\u200B');
    const afterA = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('any instance may claim the lease (no membership filter)', !!afterA.flow && afterA.flow.owner === 'TenantA',
        JSON.stringify(afterA.flow));
    check('lease holder auto-started the expired war', afterA.state === 'ACTIVE', `state=${afterA.state}`);
    check('tick out reports the auto start once', (outA || []).filter((o) => o.auto === 'started').length === 1);
    // second instance: lease HELD by TenantA → must not re-run flows. Reset
    // the state back to REGISTRATION while KEEPING the lease to prove it.
    await GuildWarEvent.updateOne({ eventId }, { $set: { state: 'REGISTRATION', registrationEndsAt: Date.now() - 1000 } });
    botConfig.getBotName = () => 'TenantB';
    const outB = await state.tick(strangerSock(), '\u200B');
    const afterB = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('second instance blocked by the held lease (no re-start)', afterB.state === 'REGISTRATION' && (outB || []).length === 0,
        `state=${afterB.state} out=${JSON.stringify(outB)}`);
    check('lease still held by TenantA after B attempt', afterB.flow && afterB.flow.owner === 'TenantA', JSON.stringify(afterB.flow));
    botConfig.getBotName = savedName4;
    // restore ACTIVE for cleanup symmetry
    await GuildWarEvent.updateOne({ eventId }, { $set: { state: 'ACTIVE' } });

    // ═══ 5. start-card DM fires exactly once per instance ═══
    console.log('\n══ 5. single-source start cards ══');
    const gwIndex = require('../core/rpg/guildWar');
    check('dmWarStartCards exists on guildWar index', typeof gwIndex.dmWarStartCards === 'function');
    // the dedupe is structural: engine.js no longer re-DMs. verify by source scan:
    const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
    const sweeper = engineSrc.slice(engineSrc.indexOf('GUILD WAR sweeper'), engineSrc.indexOf('GUILD WAR sweeper') + 800);
    check('engine sweeper no longer re-DMs start cards', !sweeper.includes('dmWarStartCards'));
    const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'state.js'), 'utf8');
    check('state.tick keeps its single dmWarStartCards call', (stateSrc.match(/dmWarStartCards/g) || []).length === 1);

    // ═══ 6. 🤝 cross-instance command claim (msgClaim) ═══
    console.log('\n══ 6. GC coexistence command claim ══');
    const { claimGroupCommand } = require('../core/utils/msgClaim');
    const ck = { chat: '120363coexist@g.us', sender: '15554440001@s.whatsapp.net', id: `MSGQA${Date.now()}` };
    const w1 = await claimGroupCommand(ck.chat, ck.sender, ck.id);
    check('first instance wins the claim', w1 === true);
    const w2 = await claimGroupCommand(ck.chat, ck.sender, ck.id);
    check('second instance loses (E11000 duplicate)', w2 === false);
    // reconnect backfill: the SAME instance re-offered the same stanza must
    // also skip — identical behavior, proven by the same duplicate key.
    const w3 = await claimGroupCommand(ck.chat, ck.sender, ck.id);
    check('backfill copy of the same message skips too', w3 === false);
    // different message id → separate claim
    const w4 = await claimGroupCommand(ck.chat, ck.sender, `MSGQA${Date.now()}-b`);
    check('a different message claims cleanly', w4 === true);
    // degenerate input → legacy behavior (fail-open)
    check('missing msgId → legacy true', await claimGroupCommand(ck.chat, ck.sender, null) === true);

    // ═══ 7. 🤝 scoreboard window lives on the DOC ═══
    console.log('\n══ 7. scoreboard DB claim (one poster per window) ══');
    const GuildWarEventModel = GuildWarEvent; // same model
    const evScore = `gw_isoqa_score_${Date.now().toString(36)}`;
    await GuildWarEventModel.deleteMany({ eventId: evScore });
    await GuildWarEventModel.create({
        eventId: evScore, state: 'ACTIVE', hostGroupId: '120363iso@g.us',
        scoreboardAt: 0,
        players: [
            { jid: 'a@s.whatsapp.net', name: 'A', guildId: 'g1', guildName: 'G1', status: 'active', score: 5 },
            { jid: 'b@s.whatsapp.net', name: 'B', guildId: 'g2', guildName: 'G2', status: 'active', score: 3 },
        ],
        rooms: [], edges: [],
    });
    const sentBoard = [];
    const boardSock = {
        groupMetadata: async () => ({ id: '120363iso@g.us' }),
        sendMessage: async (jid, content) => { sentBoard.push(content.text || content.caption || '(img)'); return {}; },
    };
    await feed.postScoreboard(evScore, boardSock, '\u200B');
    const boardAfterFirst = sentBoard.length;
    check('first instance posts the standings', boardAfterFirst === 1, `sent=${boardAfterFirst}`);
    await feed.postScoreboard(evScore, boardSock, '\u200B');
    check('second instance within the window is silent', sentBoard.length === 1, `sent=${sentBoard.length}`);
    const scoreDoc = await GuildWarEventModel.findOne({ eventId: evScore }, { scoreboardAt: 1 }).lean();
    check('scoreboardAt persisted on the doc', scoreDoc.scoreboardAt > 0, String(scoreDoc.scoreboardAt));
    // expire the window → the next post wins again
    await GuildWarEventModel.updateOne({ eventId: evScore }, { $set: { scoreboardAt: Date.now() - 11 * 60 * 1000 } });
    await feed.postScoreboard(evScore, boardSock, '\u200B');
    check('window expiry allows the next poster', sentBoard.length === 2, `sent=${sentBoard.length}`);
    await GuildWarEventModel.deleteMany({ eventId: evScore });

    // ── cleanup ──
    await GuildWarEvent.deleteMany({ eventId });
    await mongoose.disconnect();
    console.log(`\n════════ RESULT: ${PASS} pass / ${FAIL} fail ════════`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
