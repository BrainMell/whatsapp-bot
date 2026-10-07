#!/usr/bin/env node
// ⚔️ GW WARDENS + SCALING QA — Test Run 2 directive pass (2026-10-07)
// Verifies the owner brief: "4 bosses on the map, randomly placed, the map
// increasing in size with a higher number of players" + the Test Run 2 bug
// report fixes that ship with them:
//   A. wardens rise AT WAR START (ledger, lair rooms, fog reveal, feed major)
//   B. war ends when all four fall; clock-out = one-time hourglass grace
//   C. map side scales from the SIZE_RANGES table
//   D. PvE/PvP overlap guards (challenge/accept refuse mid-combat, move blocked mid-duel)
//   E. exactly-once duel timeout concede (timer vs sweeper claim)
//   F. cross-instance discovery milestone dedupe
//   G. prompt guarantee (nextTurn text fallback) + render-pool parallelism (source pins)
//   H. rank card truth (pvpWins merged into the mission snapshot)
// DB sections use the gwtest database (same pattern as gw_isolation_qa.js).
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const ROOT = path.join(__dirname, '..');
const CFG = require('../core/rpg/guildWar/config');
const mapEngine = require('../core/rpg/guildWar/mapEngine');

// ── A3/C: config surface ──
console.log('\n— A/C: config surface —');
check('FINALE.FROM_START is true', CFG.FINALE.FROM_START === true);
check('FINALE.BOSS_COUNT is 4', CFG.FINALE.BOSS_COUNT === 4);
check('SIZE_RANGES table present with >=4 bands', Array.isArray(CFG.MAP.SIZE_RANGES) && CFG.MAP.SIZE_RANGES.length >= 4);

// ── C: map scaling (pure) ──
console.log('\n— C: map scaling —');
const EXPECT = [[2, 10], [3, 10], [4, 12], [6, 12], [7, 14], [9, 14], [10, 16], [14, 16], [15, 19], [21, 19], [22, 22], [30, 22], [31, 26], [45, 26], [46, 30], [80, 30]];
for (const [players, want] of EXPECT) {
    const m = mapEngine.generate(`scale:${players}`, players, {});
    check(`side for ${players} players == ${want} (got ${m.side})`, m.side === want);
}
{
    const al = mapEngine.generate('scale:align', 10, { alignment: true });
    check('alignment map keeps its own sizing (side >= 24)', al.side >= 24, `got ${al.side}`);
    const small = mapEngine.generate('scale:small', 1, {});
    const med = mapEngine.generate('scale:med', 12, {});
    check('room count == side^2 (12p)', med.rooms.size === med.side * med.side);
    check('monotonic: side(1) < side(12)', small.side < med.side);
}
var placementP = null;

// ── A1: warden placement (pure, synthetic doc) ──
console.log('\n— A1: warden placement —');
{
    const big = mapEngine.generate('wardens:place', 12, {});
    const rooms = [...big.rooms.values()].map((r) => ({ ...r, payload: {} }));
    const players = big.spawns.slice(0, 6).map((k, i) => ({ jid: `p${i}@x`, spawnRoomId: k, status: 'active' }));
    const fakeDoc = { eventId: 'qa', side: big.side, rooms, players, deadWorld: null };
    // stub the DB writes: spawnFinaleBosses bulk-writes rooms + ledger + fog.
    // For the pure pass we exercise the PLACEMENT logic by monkey-patching the model.
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const origUpdate = GuildWarEvent.updateOne.bind(GuildWarEvent);
    const origBulk = GuildWarEvent.bulkWrite ? GuildWarEvent.bulkWrite.bind(GuildWarEvent) : null;
    const origFindOneAndUpdate = GuildWarEvent.findOneAndUpdate.bind(GuildWarEvent);
    const written = { bulk: [], ledger: null };
    GuildWarEvent.bulkWrite = async (ops) => { written.bulk = ops; return { ok: 1 }; };
    GuildWarEvent.updateOne = async (filter, update) => {
        if (filter['finale.bosses.index'] !== undefined) return {}; // _wardenDown-shaped
        if (update && update.$set && update.$set['finale.bosses']) written.ledger = update.$set['finale.bosses'];
        return {};
    };
    GuildWarEvent.findOneAndUpdate = async () => null; // fog writes are best-effort
    // Call the real spawner (pure placement math, zero DB). Awaited by the
    // main runner before it exits.
    global.__placementP = (async () => {
        const roomsMod = require('../core/rpg/guildWar/rooms');
        const res = await roomsMod.spawnFinaleBosses(fakeDoc);
        GuildWarEvent.updateOne = origUpdate;
        GuildWarEvent.findOneAndUpdate = origFindOneAndUpdate;
        if (origBulk) GuildWarEvent.bulkWrite = origBulk;
        check('spawn ok on a 12x12 map', res.ok === true);
        check('exactly 4 warden rooms written', written.bulk.length === 4, `got ${written.bulk.length}`);
        check('ledger has 4 entries', Array.isArray(written.ledger) && written.ledger.length === 4);
        const lairKeys = (written.ledger || []).map((b) => b.key);
        check('no lair on a spawn hall', lairKeys.every((k) => !big.spawns.includes(k)));
        check('no lair on the World Core', lairKeys.every((k) => k !== big.coreKey));
        const lairXY = lairKeys.map((k) => k.split(',').map(Number));
        const md = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        let minSep = 99;
        for (let i = 0; i < lairXY.length; i++) for (let j = i + 1; j < lairXY.length; j++) minSep = Math.min(minSep, md(lairXY[i], lairXY[j]));
        check('lairs scattered (pairwise separation >= 2)', minSep >= 2, `min ${minSep}`);
        const types = written.bulk.map((op) => op.updateOne.update.$set['rooms.$.type']);
        check('all lair rooms typed finale', types.every((t) => t === 'finale'));
        const names = (written.ledger || []).map((b) => b.name);
        check('warden names are the four configured wardens', names.every((n) => CFG.FINALE.WARDEN_NAMES.includes(n)) && new Set(names).size === 4);
    })();
}

// ── source pins (prompt guarantee / pools / ack / copy) ──
console.log('\n— G: source pins —');
{
    const ga = fs.readFileSync(path.join(ROOT, 'core/rpg/guildAdventure.js'), 'utf8');
    check('nextTurn failed-render branch degrades to text', /} else \{\s*\n\s*\/\/ ⚔️ PROMPT GUARANTEE/.test(ga));
    check('ruins multicast retries + text-degrades', /COMBAT UI GUARANTEE/.test(ga) && /text: payload\.caption \|\| payload\.text/.test(ga));
    const rs = fs.readFileSync(path.join(ROOT, 'core/rpg/guildWar/roomScene.js'), 'utf8');
    check('room pool spawns multiple children (max 6)', /max: 6/.test(rs) && /_pickChild/.test(rs));
    const mr = fs.readFileSync(path.join(ROOT, 'core/rpg/guildWar/mapRenderer.js'), 'utf8');
    check('map pool spawns multiple children (max 4)', /max: 4/.test(mr) && /_pickChild/.test(mr));
    const eng = fs.readFileSync(path.join(ROOT, 'core/engine.js'), 'utf8');
    check('war-verb deadline ack guards the generic pipeline', /The Ruins are still turning/.test(eng) && /_gwActive/.test(eng));
    const dm = fs.readFileSync(path.join(ROOT, 'core/rpg/guildWar/dmRouter.js'), 'utf8');
    check('field manual goal names the four wardens from start', /FOUR \*wardens\* hold the Ruins/.test(dm));
    check('move blocked while an active duel holds the player', /The duel demands your attention/.test(dm));
    check('status clock line shows the warden tally', /wardens slain /.test(dm));
    const enc = fs.readFileSync(path.join(ROOT, 'core/rpg/guildWar/encounters.js'), 'utf8');
    check('finale room intro copy = boss hunt from start', /holds this .*hall — one of the FOUR WARDENS/.test(enc));
}

// ── H: rank mission snapshot (pure) ──
console.log('\n— H: rank card truth —');
{
    const classSystem = require('../core/rpg/classSystem');
    const userDoc = { stats: { questsWon: 20, bossesDefeated: 2 }, pvpWins: 1 };
    const merged = { ...(userDoc.stats || {}), pvpWins: userDoc.pvpWins ?? (userDoc.stats?.pvpWins ?? 0) };
    const mp = classSystem.checkMissionProgress(1, merged);
    check('mission 1 has 3 objectives', mp.progress.length === 3);
    const pvpObj = mp.progress.find((o) => o.statKey === 'pvpWins');
    check('pvpWins objective reads the TOP-LEVEL counter (1/3)', pvpObj && pvpObj.current === 1, JSON.stringify(pvpObj));
    const bossObj = mp.progress.find((o) => o.statKey === 'bossesDefeated');
    check('bosses objective reads stats (2/5)', bossObj && bossObj.current === 2);
    const pcSrc = fs.readFileSync(path.join(ROOT, 'core/commands/progressionCommands.js'), 'utf8');
    // 🔄 auto-claim era (26090dae): the merge is a MAX of both doc shapes
    // (schema defaults made `??` fall-through impossible), and the trial line
    // promises automatic advancement instead of the hidden claim verb.
    check('rank command merges top-level pvpWins (max of both shapes)', /Math\.max\(userDoc\?\.stats\?\.pvpWins \|\| 0, userDoc\?\.pvpWins \|\| 0\)/.test(pcSrc));
    check('rank card caps image bars at 3 + caption overflow', /progress\.slice\(0, 3\)/.test(pcSrc) && /progress\.slice\(3\)/.test(pcSrc));
    check('rank caption spells out the trial + auto-advance', /advances automatically|advances the moment you check it/.test(pcSrc));
}

// ── DB sections (gwtest) ──
async function connectDB() {
    const envPath = path.join(ROOT, '.env');
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

(async () => {
    if (global.__placementP) await global.__placementP; // pure placement checks finish first
    try {
        await connectDB();
    } catch (e) {
        console.log(`\n[qa] no DB reachable (${e.message}) — DB sections skipped`);
        finish();
        return;
    }
    const mongoose = require('mongoose');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const state = require('../core/rpg/guildWar/state');
    const roomsMod = require('../core/rpg/guildWar/rooms');
    const ruinsPvp = require('../core/rpg/guildWar/ruinsPvp');

    // ── A2: startEvent spawns the wardens; hourglass + end paths ──
    console.log('\n— A2: wardens at war start (DB) —');
    const eventId = `gw_wardqa_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId });
    await GuildWarEvent.create({
        eventId, state: 'REGISTRATION', hostGroupId: '120363wardqa@g.us',
        registrationEndsAt: Date.now() - 1000,
        players: [
            { jid: 'w1@s.whatsapp.net', name: 'W1', guildId: 'g1', guildName: 'G1', status: 'active' },
            { jid: 'w2@s.whatsapp.net', name: 'W2', guildId: 'g2', guildName: 'G2', status: 'active' },
        ],
    });
    const started = await state.startEvent(eventId);
    check('startEvent ok', started.ok === true, started.reason || '');
    await new Promise((r) => setTimeout(r, 1500)); // feed.queue's DB mirror is async — let it land
    const ev1 = await GuildWarEvent.findOne({ eventId }).lean();
    check('finale ledger opened at start', ev1.finale && ev1.finale.started === true);
    check('ledger carries 4 bosses', Array.isArray(ev1.finale.bosses) && ev1.finale.bosses.length === 4);
    const lairs = ev1.rooms.filter((r) => r.type === 'finale');
    check('4 finale lair rooms baked', lairs.length === 4);
    check('no lair at a spawn room', lairs.every((r) => !ev1.players.some((p) => p.spawnRoomId === r.key)));
    check('lairs carry warden payloads', lairs.every((r) => r.payload && (r.payload.get ? r.payload.get('finaleBoss') : r.payload.finaleBoss)));
    const w1 = ev1.players.find((p) => p.jid === 'w1@s.whatsapp.net');
    check('lairs revealed on champion fog', (ev1.finale.bosses || []).every((b) => (w1.discovered || []).includes(b.key)));
    check('feed queued the warden major', (ev1.feedQueue || []).some((i) => /WARDENS HOLD THE RUINS/.test(i.text)));

    // ── B: hourglass grace (one-time) ──
    console.log('\n— B: hourglass grace (DB) —');
    const sockCalls = [];
    const mockSock = { sendMessage: async (jid, payload) => { sockCalls.push({ jid, text: payload.text || payload.caption || '' }); return {}; }, groupMetadata: async () => ({ id: '120363wardqa@g.us' }) };
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    await GuildWarEvent.updateOne({ eventId }, { $set: { endsAt: Date.now() - 1000 } });
    await state.tick(mockSock, '\u200B');
    await settle(2500); // tickAll's flush is fire-and-forget — let it drain before asserting
    let ev2 = await GuildWarEvent.findOne({ eventId }).lean();
    check('hourglass flipped once at clock-out', ev2.finale && ev2.finale.hourglass === true);
    check('war still ACTIVE during the grace', ev2.state === 'ACTIVE');
    const dmAfter1 = sockCalls.filter((c) => /war timer has run out/.test(c.text)).length;
    check('hourglass announced to champions (2 DMs)', dmAfter1 === 2, `got ${dmAfter1}; calls=${JSON.stringify(sockCalls.map((c) => c.text.slice(0, 40)))}`);
    const feedLen = (ev2.feedQueue || []).length;
    await state.tick(mockSock, '\u200B');
    await settle(2500);
    ev2 = await GuildWarEvent.findOne({ eventId }).lean();
    check('second tick does NOT re-announce (no hourglass item left)', !(ev2.feedQueue || []).some((i) => /HOURGLASS IS EMPTY/.test(i.text)) && feedLen >= 0);
    check('second tick sends no more hourglass DMs', sockCalls.filter((c) => /war timer has run out/.test(c.text)).length === 2);

    // ── B: all wardens dead → war ends ──
    console.log('\n— B: hunt conclusion (DB) —');
    await GuildWarEvent.updateOne({ eventId, 'finale.bosses.index': 0 }, { $set: { 'finale.bosses.$[b].dead': true } }, { arrayFilters: [{ 'b.index': 0 }] });
    await state.tick(mockSock, '\u200B');
    let ev3 = await GuildWarEvent.findOne({ eventId }).lean();
    check('1/4 dead → war still on', ev3.state === 'ACTIVE');
    await GuildWarEvent.updateOne({ eventId }, { $set: { 'finale.bosses.$[].dead': true } });
    await state.tick(mockSock, '\u200B');
    ev3 = await GuildWarEvent.findOne({ eventId }).lean();
    check('4/4 dead → war ENDED', ev3.state === 'ENDED' || ev3.state === 'REWARDS');

    // ── B: safety timeout closes an abandoned hunt ──
    console.log('\n— B: safety timeout (DB) —');
    const eventId2 = `gw_wardqb_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId2 });
    await GuildWarEvent.create({
        eventId: eventId2, state: 'REGISTRATION', hostGroupId: '120363wardqa@g.us',
        registrationEndsAt: Date.now() - 1000,
        players: [
            { jid: 'x1@s.whatsapp.net', name: 'X1', guildId: 'g1', guildName: 'G1', status: 'active' },
            { jid: 'x2@s.whatsapp.net', name: 'X2', guildId: 'g2', guildName: 'G2', status: 'active' },
        ],
    });
    await state.startEvent(eventId2);
    const past = Date.now() - (CFG.FINALE.TIMEOUT_MS + 5000);
    await GuildWarEvent.updateOne({ eventId: eventId2 }, { $set: { endsAt: past, 'finale.hourglass': true } });
    await state.tick(mockSock, '\u200B');
    const ev4 = await GuildWarEvent.findOne({ eventId: eventId2 }).lean();
    check('grace timeout → war ENDED', ev4.state === 'ENDED' || ev4.state === 'REWARDS');

    // ── D/E: PvP guards + exactly-once concede (DB) ──
    console.log('\n— D/E: duel guards + exactly-once concede (DB) —');
    const eventId3 = `gw_pvpqa_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId3 });
    const roomKey = '2,2';
    await GuildWarEvent.create({
        eventId: eventId3, state: 'ACTIVE', hostGroupId: '120363pvpqa@g.us', side: 5, coreKey: '2,2',
        rooms: [{ key: roomKey, x: 2, y: 2, type: 'empty', state: 'UNEXPLORED', payload: {}, occupants: [] }],
        players: [
            { jid: 'pa@s.whatsapp.net', name: 'PA', guildId: 'ga', guildName: 'GA', status: 'active', roomId: roomKey, prevRoomId: roomKey, spawnRoomId: roomKey },
            { jid: 'pb@s.whatsapp.net', name: 'PB', guildId: 'gb', guildName: 'GB', status: 'active', roomId: roomKey, prevRoomId: roomKey, spawnRoomId: roomKey },
            { jid: 'pc@s.whatsapp.net', name: 'PC', guildId: 'gc', guildName: 'GC', status: 'active', roomId: roomKey, prevRoomId: roomKey, spawnRoomId: roomKey },
        ],
    });
    const pvpDoc = await GuildWarEvent.findOne({ eventId: eventId3 }).lean();
    const pa = pvpDoc.players.find((p) => p.jid === 'pa@s.whatsapp.net');
    const pb = pvpDoc.players.find((p) => p.jid === 'pb@s.whatsapp.net');

    // E: exactly-once concede — expired record claimed by the timer, sweeper gets nothing
    const expKey = `${eventId3}:${roomKey}:pb@s.whatsapp.net`;
    await GuildWarEvent.updateOne({ eventId: eventId3 }, { $push: { pvpChallenges: { key: expKey, eventId: eventId3, challengerJid: pa.jid, challengedJid: pb.jid, roomKey, expiresAt: Date.now() - 1000 } } });
    const claimed = await ruinsPvp.claimExpiredRecord(eventId3, expKey);
    check('expired record claim returns the record', !!claimed);
    const claimedAgain = await ruinsPvp.claimExpiredRecord(eventId3, expKey);
    check('second claim of the same record returns null', claimedAgain === null);
    const pruned = await ruinsPvp.pruneExpired(eventId3);
    check('sweeper has nothing left to resolve (no double concede)', pruned === 0);

    // D: an active duel binds the player — challenge refuses
    const economy = require('../core/rpg/economy');
    for (const [uj, un] of [['pa@s.whatsapp.net', 'PA'], ['pc@s.whatsapp.net', 'PC']]) {
        if (!economy.isRegistered(uj)) economy.registerUser(uj, un);
    }
    const pvp = require('../core/rpg/pvpSystem');
    const begun = pvp.beginRuinsDuel('pa@s.whatsapp.net', 'pc@s.whatsapp.net', { eventId: eventId3, roomKey, virtualChatId: `ruins:qa:${Date.now()}` });
    check('test duel began', begun.success === true, begun.message || '');
    if (begun.success) {
        const freshDoc = await GuildWarEvent.findOne({ eventId: eventId3 }).lean();
        const paRow = freshDoc.players.find((p) => p.jid === 'pa@s.whatsapp.net');
        const pbRow = freshDoc.players.find((p) => p.jid === 'pb@s.whatsapp.net');
        const refused = await ruinsPvp.challenge(freshDoc, paRow, pbRow.jid);
        check('challenge refused while the challenger is mid-duel', refused.ok === false && /duel/.test(refused.text), refused.text || '');
        // a rival challenging the mid-duel player is refused too
        const pcRow = freshDoc.players.find((p) => p.jid === 'pc@s.whatsapp.net');
        // pc is bound as the duel OPPONENT — use a 4th neutral player row for the target-side test
        await GuildWarEvent.updateOne({ eventId: eventId3 }, { $push: { players: { jid: 'pd@s.whatsapp.net', name: 'PD', guildId: 'gd', guildName: 'GD', status: 'active', roomId: roomKey, prevRoomId: roomKey, spawnRoomId: roomKey } } });
        const doc4 = await GuildWarEvent.findOne({ eventId: eventId3 }).lean();
        const pdRow = doc4.players.find((p) => p.jid === 'pd@s.whatsapp.net');
        const refused2 = await ruinsPvp.challenge(doc4, pdRow, 'pa@s.whatsapp.net');
        check('challenge refused when the TARGET is mid-duel', refused2.ok === false && /duel/.test(refused2.text), refused2.text || '');
    }

    // ── F: milestone dedupe (DB) ──
    console.log('\n— F: milestone dedupe (DB) —');
    const eventId4 = `gw_msqa_${Date.now().toString(36)}`;
    await GuildWarEvent.deleteMany({ eventId4 });
    const discovered = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) discovered.push(`${i},${j}`); // 25 rooms
    await GuildWarEvent.create({
        eventId: eventId4, state: 'ACTIVE', hostGroupId: '120363msqa@g.us', side: 5, coreKey: '2,2',
        rooms: discovered.map((k) => { const [x, y] = k.split(',').map(Number); return { key: k, x, y, type: 'empty', state: 'UNEXPLORED', payload: {}, occupants: [] }; }),
        players: [{ jid: 'ms@s.whatsapp.net', name: 'MS', guildId: 'g1', guildName: 'G1', status: 'active', roomId: '0,0', discovered, milestoneClaimed: 0 }],
    });
    const msDoc = await GuildWarEvent.findOne({ eventId: eventId4 }).lean();
    const msPlayer = msDoc.players[0];
    const encountersMod = require('../core/rpg/guildWar/encounters');
    await encountersMod.maybeDiscoveryMilestone(msDoc, msPlayer);
    await new Promise((r) => setTimeout(r, 1500)); // feed.queue's DB mirror is async — let it land
    let msAfter = await GuildWarEvent.findOne({ eventId: eventId4 }).lean();
    const msFeed1 = (msAfter.feedQueue || []).filter((i) => /charted 25 chambers/.test(i.text)).length;
    check('first milestone call queues exactly one feed line', msFeed1 === 1, `got ${msFeed1}`);
    check('milestoneClaimed advanced to 25', msAfter.players[0].milestoneClaimed === 25);
    // second instance sees the same 25-room snapshot (stale read) → must NOT re-announce
    await encountersMod.maybeDiscoveryMilestone(msDoc, msPlayer);
    msAfter = await GuildWarEvent.findOne({ eventId: eventId4 }).lean();
    const msFeed2 = (msAfter.feedQueue || []).filter((i) => /charted 25 chambers/.test(i.text)).length;
    check('stale second call does NOT duplicate the milestone', msFeed2 === 1, `got ${msFeed2}`);

    finish();

    function finish() {
        console.log(`\n════════════════════════════`);
        console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
        console.log(`════════════════════════════`);
        process.exit(FAIL ? 1 : 0);
    }
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
