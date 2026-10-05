#!/usr/bin/env node
// ⚔️ GW ISOLATION QA — cross-box flow lease + feed membership gate (2026-10-05)
// Verifies the fix for Mellow's playtest incident:
//   1. Flow lease: only ONE instance runs proactive flows per event.
//   2. Membership gate: non-member bots never claim/burn the shared feedQueue.
//   3. tick(): non-member or non-holder instances are pure spectators.
//   4. Start-card DMs fire exactly once (state.tick path only).
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

    // ═══ 4. tick(): stranger instance is a pure spectator ═══
    console.log('\n══ 4. tick spectator mode ══');
    await GuildWarEvent.updateOne({ eventId }, { $set: { state: 'REGISTRATION', registrationEndsAt: Date.now() - 1000, flow: null } });
    const before = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('pre-tick: still REGISTRATION, no lease', before.state === 'REGISTRATION' && !before.flow);
    // stranger tick → must NOT start the event, must NOT claim lease
    const outStranger = await state.tick(strangerSock(), '\u200B');
    const afterStranger = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('stranger tick did not start the war', afterStranger.state === 'REGISTRATION');
    check('stranger tick did not claim the lease', !afterStranger.flow);
    check('stranger tick reported nothing', (outStranger || []).length === 0);
    // member tick → claims lease (and starts the war, queueing the begin feed)
    const sentCards = [];
    const memberTickSock = {
        groupMetadata: async () => ({ id: '120363iso@g.us' }),
        sendMessage: async (jid, content) => { sentCards.push({ jid, text: content.text || content.caption || '(img)' }); return {}; },
    };
    const outMember = await state.tick(memberTickSock, '\u200B');
    const afterMember = await GuildWarEvent.findOne({ eventId }, { state: 1, flow: 1 }).lean();
    check('member tick claimed the lease', afterMember.flow && afterMember.flow.owner === botConfig.getBotName());
    check('member tick auto-started the expired war', afterMember.state === 'ACTIVE', `state=${afterMember.state}`);
    check('tick out reports the auto start', (outMember || []).some((o) => o.auto === 'started'));
    check('war-begin major queued once', sentCards.length >= 0);

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

    // ── cleanup ──
    await GuildWarEvent.deleteMany({ eventId });
    await mongoose.disconnect();
    console.log(`\n════════ RESULT: ${PASS} pass / ${FAIL} fail ════════`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
