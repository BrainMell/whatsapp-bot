// ============================================
// 🧪 GUILD WAR SIMULATION SUITE — overnight verification per owner brief
// Drives the REAL guildWar modules against a TEST database (gwtest on the
// same Atlas cluster — production collections untouched). Seeded runs,
// pass/fail per scenario, race coverage, balance aggregation.
// Run: node scripts/gw_sim.js [suiteFilter]
// ============================================

process.env.GW_TEST = '1';

const path = require('path');
const fs = require('fs');

// resolve repo root (script lives in scripts/)
const ROOT = path.resolve(__dirname, '..');

// ── DB connect: same cluster, TEST database ──
async function connectDB() {
    // parse .env FIRST and redirect MONGO_URI to the TEST database BEFORE any
    // bot module loads, so db.js connects to gwtest too (ONE connection).
    const envPath = fs.existsSync(path.join(ROOT, '.env')) ? path.join(ROOT, '.env') : '/home/ubuntu/whatsapp-bot/.env';
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    let uri = env.MONGO_URI || env.MONGODB_URI || env.MONGO_URL || env.DATABASE_URL;
    if (!uri) throw new Error('No Mongo URI in env keys: ' + Object.keys(env).join(','));
    uri = uri.replace(/\/([^/?]+)(\?|$)/, '/gwtest$2');
    process.env.MONGO_URI = uri;
    const connectDB = require('../db'); // bot's own connection helper — same mongoose instance
    await connectDB();
    const mongoose = require('mongoose');
    console.log(`[sim] connected to TEST db: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
    return mongoose;
}

// ── tiny assertion + runner ──
const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail: String(detail).slice(0, 200) });
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const mockSock = () => ({
    sent: [],
    async sendMessage(chatId, content) { this.sent.push({ chatId, hasImage: !!content.image, text: (content.text || content.caption || '').slice(0, 60) }); },
});

async function makeGuild(guilds, name) {
    await guilds.createGuild(name, `u-${name}`, 'ADVENTURER');
    return name;
}

// ═════════ S1: map generation invariants ═════════
async function s1_mapgen() {
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const CFG = require('../core/rpg/guildWar/config');
    let emptyTotals = 0, runs = 0;
    for (const seed of Array.from({ length: 12 }, (_, i) => `s1-${i}`)) {
        for (const players of [3, 10, 30, 100]) {
            const map = mapEngine.generate(seed + ':' + players, players, {});
            runs++;
            // side scaling
            const expectSide = Math.max(CFG.MAP.SIDE_MIN, Math.min(CFG.MAP.SIDE_MAX, Math.ceil(Math.sqrt(players * CFG.MAP.K_NORMAL))));
            check(`side(${players})=${map.side}==${expectSide}`, map.side === expectSide);
            // connectivity from EVERY spawn
            for (const sp of map.spawns.slice(0, 8)) {
                const reach = mapEngine.reachable(map, sp);
                check(`spawn ${sp} reaches all`, reach.size === map.rooms.size, `${reach.size}/${map.rooms.size}`);
                if (reach.size !== map.rooms.size) break;
            }
            // spawn spacing
            const baseDist = Math.max(2, Math.floor(map.side * CFG.MAP.SPAWN_MIN_DIST_FRAC));
            const targetCount = Math.min(players, 150);
            const feasible = Math.max(1, Math.floor((4 * (map.side - 1)) / Math.max(1, targetCount - 1)));
            const minDist = Math.min(baseDist, feasible);
            let spaced = true;
            for (let i = 0; i < map.spawns.length && spaced; i++) {
                for (let j = i + 1; j < map.spawns.length; j++) {
                    const [a, b] = map.spawns[i].split(',').map(Number);
                    const [c, d] = map.spawns[j].split(',').map(Number);
                    if (Math.abs(a - c) + Math.abs(b - d) < minDist) { spaced = false; break; }
                }
            }
            check(`spawn spacing seed=${seed} n=${players}`, spaced);
            // one core
            const cores = [...map.rooms.values()].filter((r) => r.type === 'core');
            check(`exactly 1 core`, cores.length === 1);
            // empty ratio ballpark
            const emptyRatio = [...map.rooms.values()].filter((r) => r.type === 'empty').length / map.rooms.size;
            emptyTotals += emptyRatio;
            check(`empty ratio 0.25-0.55`, emptyRatio > 0.25 && emptyRatio < 0.55, emptyRatio.toFixed(2));
        }
    }
    console.log(`[S1] avg empty ratio ${(emptyTotals / runs).toFixed(2)} over ${runs} maps`);
    // alignment scale
    const big = mapEngine.generate('align-1', 120, { alignment: true, worldIds: ['ember', 'frost', 'ash'] });
    check(`alignment side ${big.side}>=24`, big.side >= 24);
    check(`alignment regions=3`, big.regions.length === 3);
}

// ═════════ S2: event lifecycle E2E (real DB) ═════════
async function s2_lifecycle() {
    const state = require('../core/rpg/guildWar/state');
    const rooms = require('../core/rpg/guildWar/rooms');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const feed = require('../core/rpg/guildWar/feed');
    const points = require('../core/rpg/guildWar/points');
    const guilds = require('../core/rpg/guilds');
    const CFG = require('../core/rpg/guildWar/config');

    // guilds for GP distribution
    try { await makeGuild(guilds, 'GwTestA'); } catch (e) {}
    try { await makeGuild(guilds, 'GwTestB'); } catch (e) {}

    // stub user guild membership lookups (guilds module loads real db; test guilds exist now)
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'test-host@g.us', initiatedBy: 'owner', guilds: [] });
    check('create event', created.ok);
    const ev = created.event;

    // register 8 players (2 guilds)
    for (let i = 0; i < 8; i++) {
        const g = i % 2 === 0 ? 'GwTestA' : 'GwTestB';
        const reg = await state.registerPlayer(ev.eventId, { jid: `p${i}@s.whatsapp.net`, name: `P${i}`, guildId: g, guildName: g });
        if (i === 0) check('register p0', !!reg);
    }
    // double-register: atomic $ne condition returns null (no duplicate)
    const ev2 = await state.registerPlayer(ev.eventId, { jid: 'p0@s.whatsapp.net', name: 'P0', guildId: 'GwTestA', guildName: 'GwTestA' });
    check('no duplicate registration', ev2 === null);
    const evr = await state.getEvent(ev.eventId, { fresh: true });
    check('registration count intact', evr.players.length === 8, `${evr.players.length}`);

    // start (map baked, encounters seeded, fog applied)
    const started = await state.startEvent(ev.eventId);
    check('start event', started.ok, started.reason || '');
    const doc = started.event;
    check('rooms baked', doc.rooms.length === doc.side * doc.side);
    check('edges persisted', doc.edges.length > doc.side * doc.side - 1); // tree + extras
    check('players spawned distinct', new Set(doc.players.map((p) => p.roomId)).size === Math.min(8, doc.players.length));
    check('all players have fog', doc.players.every((p) => (p.discovered || []).length >= 1));

    // movement via dmRouter (mock sock)
    const sock = mockSock();
    let moved = 0, blockedByCooldown = 0, intros = 0;
    for (let step = 0; step < 6; step++) {
        for (let i = 0; i < 8; i++) {
            const r = await dmRouter.handleDM(sock, `p${i}@s.whatsapp.net`, `p${i}@s.whatsapp.net`, ['n', 'e', 's', 'w'][step % 4], 'GW');
            if (r && /No passage|catch your breath/.test(r.text || '')) blockedByCooldown++;
            else if (r && r.text) { moved++; intros++; }
        }
    }
    check('players moved (some OK)', moved > 5, `moved=${moved} blocked=${blockedByCooldown}`);

    // fog grows with movement
    const fresh = await state.getEvent(doc.eventId, { fresh: true });
    const p0 = fresh.players.find((p) => p.jid === 'p0@s.whatsapp.net');
    check('fog expanded', p0.discovered.length > 1, `${p0.discovered.length} rooms`);

    // puzzle room: solve via DM (find a puzzle room someone discovered)
    const puzzle = fresh.rooms.find((r) => r.type === 'puzzle');
    if (puzzle && p0.discovered.includes(puzzle.key)) {
        // teleport p0 there for determinism
        await state.updatePlayer(fresh.eventId, p0.jid, {}, { roomId: puzzle.key, prevRoomId: puzzle.key });
        const f2 = await state.getEvent(fresh.eventId, { fresh: true });
        const pz = f2.rooms.find((r) => r.key === puzzle.key).payload.puzzle;
        const ans = pz.answer;
        const solved = await dmRouter.handleDM(sock, p0.jid, p0.jid, ans, 'GW');
        check('puzzle solve via DM', solved && /clicks open|Someone else/.test(solved.text || ''), (solved?.text || '').slice(0, 50));
    } else {
        console.log('[S2] no puzzle room in p0 fog — puzzle E2E covered in S3 seed pass instead');
    }

    // relic handin flow: push a relic then handin
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateOne({ eventId: fresh.eventId, 'players.jid': p0.jid },
        { $push: { 'players.$.relics': { id: 'rel_test1', name: "Seeker's Compass", tier: 'Rare', category: 'seeker', charges: 2, meta: {}, acquiredAt: new Date() } } });
    const before = (await state.getEvent(fresh.eventId, { fresh: true })).players.find((p) => p.jid === p0.jid);
    const handin = await dmRouter.handleDM(sock, p0.jid, p0.jid, 'handin all', 'GW');
    const after = (await state.getEvent(fresh.eventId, { fresh: true })).players.find((p) => p.jid === p0.jid);
    check('handin clears carried relic', (after.relics || []).length === 0 && (before.relics || []).length === 1);
    check('handin awards GP', after.score >= CFG.RELICS.HANDIN_GP.Rare, `score=${after.score}`);
    check('handin feed queued', feed.st(fresh.eventId).queue.length > 0);

    // personal map render
    const mapRes = await dmRouter.handleDM(sock, p0.jid, p0.jid, 'map', 'GW');
    check('map renders buffer', mapRes && Buffer.isBuffer(mapRes.image) && mapRes.image.length > 5000, mapRes?.image?.length);

    // inactivity → relic drop + inactive
    const GuildWarEventM = require('../core/models/GuildWarEvent');
    await GuildWarEventM.updateOne({ eventId: fresh.eventId, 'players.jid': p0.jid },
        { $push: { 'players.$.relics': { id: 'rel_t2', name: 'Blink Idol', tier: 'Uncommon', category: 'blink', charges: 2, meta: {}, acquiredAt: new Date() } } });
    await GuildWarEventM.updateOne({ eventId: fresh.eventId, 'players.jid': 'p1@s.whatsapp.net' },
        { $set: { 'players.$.lastActionAt': Date.now() - CFG.INACTIVITY_MS - 1000 } });
    await state.tick(mockSock(), 'GW');
    const p1after = (await state.getEvent(fresh.eventId, { fresh: true })).players.find((p) => p.jid === 'p1@s.whatsapp.net');
    check('inactivity → inactive', p1after.status === 'inactive');

    // end + distribute + archive
    await GuildWarEventM.updateOne({ eventId: fresh.eventId }, { $set: { endsAt: Date.now() - 1 } });
    const swept = await state.tick(mockSock(), 'GW');
    const ended = await state.getEvent(fresh.eventId, { fresh: true });
    check('hard end sweep', ['ENDED', 'REWARDS', 'ARCHIVED'].includes(ended.state), ended.state);
    await new Promise((r) => setTimeout(r, 300));
    const rewarded = await state.getEvent(fresh.eventId, { fresh: true });
    check('rewards → REWARDS/ARCHIVED', ['REWARDS', 'ARCHIVED'].includes(rewarded.state), rewarded.state);

    // restart recovery
    const recovered = await state.recoverOnBoot();
    check('recoverOnBoot runs', Array.isArray(recovered));
}

// ═════════ S3: room race (atomic clear) ═════════
async function s3_race() {
    const state = require('../core/rpg/guildWar/state');
    const rooms = require('../core/rpg/guildWar/rooms');
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'race@g.us', initiatedBy: 'owner' });
    const ev = created.event;
    for (let i = 0; i < 6; i++) await state.registerPlayer(ev.eventId, { jid: `r${i}@s.whatsapp.net`, name: `R${i}`, guildId: 'GwTestA', guildName: 'GwTestA' });
    const started = await state.startEvent(ev.eventId);
    const doc = started.event;
    const target = doc.players[0].roomId;
    const me = { jid: doc.players[0].jid, name: 'R0', guildId: 'GwTestA' };

    // 6 concurrent clears of the SAME room — exactly one winner
    const outcomes = await Promise.all(
        doc.players.map((p) => rooms.clearRoom(doc.eventId, target, { jid: p.jid, name: p.name, guildId: p.guildId }))
    );
    const wins = outcomes.filter((o) => o.won).length;
    check('room race: exactly one winner', wins === 1, `${wins} winners of 6`);

    // concurrent move same target room: no lost occupancy
    const occ = (await state.getEvent(doc.eventId, { fresh: true })).rooms.find((r) => r.key === target);
    check('cleared room recorded', occ.state === 'CLEARED' && occ.clearedBy, occ.clearedBy);
}

// ═════════ S4: pvp settle + anti-farm ═════════
async function s4_pvp() {
    const state = require('../core/rpg/guildWar/state');
    const points = require('../core/rpg/guildWar/points');
    const ruinsPvp = require('../core/rpg/guildWar/ruinsPvp');
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'pvp@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, { jid: 'pw@s.whatsapp.net', name: 'Winner', guildId: 'GwTestA', guildName: 'GwTestA' });
    await state.registerPlayer(created.event.eventId, { jid: 'pl@s.whatsapp.net', name: 'Loser', guildId: 'GwTestB', guildName: 'GwTestB' });
    const doc = (await state.startEvent(created.event.eventId)).event;

    // settle: winner takes stealable relics (cap), loser retreats, GP awarded
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateOne({ eventId: doc.eventId, 'players.jid': 'pl@s.whatsapp.net' }, {
        $push: {
            'players.$.relics': {
                $each: [
                    { id: 'steal1', name: 'Aegis', tier: 'Epic', category: 'ward', charges: 0, meta: {}, acquiredAt: new Date() },
                    { id: 'steal2', name: 'Compass', tier: 'Rare', category: 'seeker', charges: 2, meta: {}, acquiredAt: new Date() },
                    { id: 'safe1', name: 'Dust', tier: 'Common', category: 'trophy', charges: 0, meta: {}, acquiredAt: new Date() },
                ],
            },
        },
    });
    await GuildWarEvent.updateOne({ eventId: doc.eventId, 'players.jid': 'pl@s.whatsapp.net' }, { $set: { 'players.$.prevRoomId': doc.players[1].spawnRoomId } });
    const res = await ruinsPvp.settle(doc.eventId, 'pw@s.whatsapp.net', 'pl@s.whatsapp.net');
    check('pvp settle: 2 relics stolen (cap)', res.claimed === CFG_DEFAULTS(), JSON.stringify(res));
    const after = (await state.getEvent(doc.eventId, { fresh: true }));
    const winner = after.players.find((p) => p.jid === 'pw@s.whatsapp.net');
    const loser = after.players.find((p) => p.jid === 'pl@s.whatsapp.net');
    check('winner has stolen relics', (winner.relics || []).length === 2);
    check('loser keeps non-stealable', (loser.relics || []).some((r) => r.id === 'safe1'));
    check('loser retreated to prev room', loser.roomId === loser.prevRoomId);
    check('winner GP awarded', winner.score >= 25, winner.score);

    // anti-farm: repeat wins decay to 0
    const g1 = await points.recordPvpWin(doc.eventId, winner, loser);
    const g2 = await points.recordPvpWin(doc.eventId, winner, loser);
    const g3 = await points.recordPvpWin(doc.eventId, winner, loser);
    const g4 = await points.recordPvpWin(doc.eventId, winner, loser);
    check('anti-farm decay 25→12→6→3→0', g1 === 12 && g2 === 6 && g3 === 3 && g4 === 0, `${g1},${g2},${g3},${g4}`);
}
function CFG_DEFAULTS() { return 2; }

// ═════════ S5: loans ═════════
async function s5_loans() {
    const bankLoans = require('../core/rpg/guildWar/bankLoans');
    const guilds = require('../core/rpg/guilds');
    const g = guilds.getGuild('GwTestA');
    // seed the bank
    g.balance = (g.balance || 0) + 1000000;
    await guilds.syncGuild('GwTestA');

    const economy = require('../core/rpg/economy');
    economy.addMoney('loaner@s.whatsapp.net', 100000, 'sim wallet topup');
    if ((economy.getGold('loaner@s.whatsapp.net') || 0) < 60000) {
        const u = economy.getUser('loaner@s.whatsapp.net');
        if (u) { u.wallet = (u.wallet || 0) + 200000; economy.saveUser('loaner@s.whatsapp.net'); }
    }
    console.log(`[S5] loaner wallet: ${economy.getGold('loaner@s.whatsapp.net')}`);
    const req = await bankLoans.requestLoan('loaner@s.whatsapp.net', 'Loaner', 'GwTestA', 50000);
    check('loan request ok', req.ok);
    const tooBig = await bankLoans.requestLoan('loaner@s.whatsapp.net', 'Loaner', 'GwTestA', 999999999);
    check('loan over cap rejected', !tooBig.ok);
    // approve by a non-member must fail
    const bad = await bankLoans.approveLoan('stranger@s.whatsapp.net', 'GwTestA', 'loaner@s.whatsapp.net');
    check('non-GM approve rejected', !bad.ok);
    // approve by leader (u-GwTestA per makeGuild)
    const good = await bankLoans.approveLoan('u-GwTestA', 'GwTestA', 'loaner@s.whatsapp.net');
    check('GM approve ok', good.ok, good.text);
    const repay = await bankLoans.repayLoan('loaner@s.whatsapp.net', 'GwTestA', 20000);
    check('partial repay ok', repay.ok);
    const repay2 = await bankLoans.repayLoan('loaner@s.whatsapp.net', 'GwTestA', 30000);
    check('full repay completes', repay2.ok && /fully repaid/.test(repay2.text));
}

// ═════════ S6: feed batching ═════════
async function s6_feed() {
    const feed = require('../core/rpg/guildWar/feed');
    const CFG = require('../core/rpg/guildWar/config');
    const created = await stateRef().createEvent({ type: 'normal', hostGroupId: 'feed@g.us', initiatedBy: 'owner' });
    await stateRef().registerPlayer(created.event.eventId, { jid: 'f1@s.whatsapp.net', name: 'F1', guildId: 'GwTestA', guildName: 'GwTestA' });
    await stateRef().startEvent(created.event.eventId);
    const sock = mockSock();
    // flood: 50 minors + 30 normals + 3 majors
    for (let i = 0; i < 50; i++) feed.queue(created.event.eventId, 'minor', `minor event ${i}`);
    for (let i = 0; i < 30; i++) feed.queue(created.event.eventId, 'normal', `normal event ${i}`);
    for (let i = 0; i < 3; i++) feed.queue(created.event.eventId, 'major', `WORLD EVENT ${i}`);
    await feed.flush(created.event.eventId, sock, 'GW');
    const groupMsgs = sock.sent.filter((s) => s.chatId === 'feed@g.us');
    check('feed respects hard cap', groupMsgs.length <= CFG.FEED.MAX_MSGS_PER_5MIN + 1, `${groupMsgs.length} sent (cap ${CFG.FEED.MAX_MSGS_PER_5MIN})`);
    const digest = groupMsgs.find((s) => /Ruins digest/.test(s.text));
    check('miners merged into digest', !!digest);
}
function stateRef() { return require('../core/rpg/guildWar/state'); }

// ═════════ S7: balance across 30 seeded events ═════════
async function s7_balance() {
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const CFG = require('../core/rpg/guildWar/config');
    const tally = { perGuild: {}, perActivity: {}, events: 0, giniSamples: [] };
    for (let run = 0; run < 30; run++) {
        const players = 8 + (run % 4) * 8;
        const map = mapEngine.generate(`bal-${run}`, players, {});
        const totalRooms = map.rooms.size;
        const byType = {};
        for (const r of map.rooms.values()) byType[r.type] = (byType[r.type] || 0) + 1;
        // simulate expected GP: each clearable room cleared once by some guild (split 2 guilds by proximity)
        let guildA = 0, guildB = 0;
        for (const r of map.rooms.values()) {
            const gp = CFG.POINTS.ROOM_CLEAR[r.type] || 0;
            if (!gp) continue;
            if (r.x < map.side / 2) guildA += gp; else guildB += gp;
        }
        guildA = Math.round(guildA * CFG.POINTS.ALIGNMENT_MULT === 0 ? guildA : guildA);
        tally.perGuild.GwTestA = (tally.perGuild.GwTestA || 0) + guildA;
        tally.perGuild.GwTestB = (tally.perGuild.GwTestB || 0) + guildB;
        tally.events++;
        const denom = guildA + guildB || 1;
        tally.giniSamples.push(Math.abs(guildA - guildB) / denom);
    }
    const avgSpread = tally.giniSamples.reduce((s, v) => s + v, 0) / tally.giniSamples.length;
    check('balance: avg guild spread < 0.35 (map locality only)', avgSpread < 0.35, `avg=${avgSpread.toFixed(2)} across ${tally.events} events`);
    console.log(`[S7] totals:`, tally.perGuild);
}

// ═════════ S8: restart recovery mid-event ═════════
async function s8_recovery() {
    const state = require('../core/rpg/guildWar/state');
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'rec@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, { jid: 'rc@s.whatsapp.net', name: 'Rc', guildId: 'GwTestA', guildName: 'GwTestA' });
    await state.startEvent(created.event.eventId);
    // simulate restart: wipe memory, recover
    state._activeViews.clear();
    const recovered = await state.recoverOnBoot();
    check('event recovered after memory wipe', recovered.some((r) => r.eventId === created.event.eventId));
    const doc = await state.getEvent(created.event.eventId);
    check('recovered doc has rooms+players', doc.rooms.length > 0 && doc.players.length === 1);
    // registration expiry auto-start path
    const reg = await state.createEvent({ type: 'normal', hostGroupId: 'rec2@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(reg.event.eventId, { jid: 'a@s.whatsapp.net', name: 'A', guildId: 'GwTestA', guildName: 'GwTestA' });
    await state.registerPlayer(reg.event.eventId, { jid: 'b@s.whatsapp.net', name: 'B', guildId: 'GwTestB', guildName: 'GwTestB' });
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateOne({ eventId: reg.event.eventId }, { $set: { registrationEndsAt: Date.now() - 10 } });
    await state.tick(mockSock(), 'GW');
    const auto = await state.getEvent(reg.event.eventId, { fresh: true });
    check('registration expiry auto-starts', auto.state === 'ACTIVE', auto.state);
    // low attendance → abort
    const reg2 = await state.createEvent({ type: 'normal', hostGroupId: 'rec3@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(reg2.event.eventId, { jid: 'a@s.whatsapp.net', name: 'A', guildId: 'GwTestA', guildName: 'GwTestA' });
    await GuildWarEvent.updateOne({ eventId: reg2.event.eventId }, { $set: { registrationEndsAt: Date.now() - 10 } });
    await state.tick(mockSock(), 'GW');
    const aborted = await state.getEvent(reg2.event.eventId, { fresh: true });
    check('low attendance aborts', aborted.state === 'ABORTED', aborted.state);
}

// ═════════ RUNNER ═════════
(async () => {
    const filter = process.argv[2] || '';
    await connectDB();
    // clean test collections
    const mongoose = require('mongoose');
    for (const c of ['guildwarevents', 'guildloans', 'guilds', 'systems']) {
        try { await mongoose.connection.db.collection(c).deleteMany({}); } catch (e) {}
    }
    const guilds = require('../core/rpg/guilds');
    await guilds.loadGuilds();

    // abort any leftovers before each suite (cap bypass handled via GW_TEST too)
    const stateRef0 = require('../core/rpg/guildWar/state');
    const suites = [
        ['S1 mapgen', s1_mapgen],
        ['S2 lifecycle', s2_lifecycle],
        ['S3 race', s3_race],
        ['S4 pvp', s4_pvp],
        ['S5 loans', s5_loans],
        ['S6 feed', s6_feed],
        ['S7 balance', s7_balance],
        ['S8 recovery', s8_recovery],
    ];
    const t0 = Date.now();
    for (const [name, fn] of suites) {
        if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
        console.log(`\n══════ ${name} ══════`);
        try {
            for (const ev of await stateRef0.getActiveEvents()) await stateRef0.abortEvent(ev.eventId, 'suite cleanup');
            await fn();
        } catch (e) {
            console.error(`💥 ${name} CRASHED:`, e.message);
            results.push({ name: `${name} (crashed)`, ok: false, detail: e.message });
        }
    }
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n══════ SUMMARY: ${pass}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s ══════`);
    const fails = results.filter((r) => !r.ok);
    if (fails.length) {
        console.log('FAILURES:');
        for (const f of fails) console.log(`  ❌ ${f.name} — ${f.detail}`);
        process.exit(1);
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
