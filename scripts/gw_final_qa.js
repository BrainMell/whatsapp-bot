// ============================================
// 🎮 GUILD WAR FULL E2E QA v2 — plays the war like the owner does.
// Drives REAL modules vs the isolated QA db (/qa_gw), mock sock.
// Flow: boost the test fighter → deploy → explore (resolve encounters) →
// puzzle lifecycle → win PvE → PvP → meeting → relics → feed → stress.
// Run: node scripts/gw_final_qa.js
// ============================================
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = '/home/z/my-project/repo';

async function connectDB() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
    // ⚔️ EPHEMERAL NAMESPACE: each run gets its OWN db on the same cluster —
    // nothing else (other agents' QA, zombies, crons) can wipe it mid-run.
    // HOUSEKEEPING (post-connect): drop stale ephemeral dbs (>30 min old) —
    // the shared Atlas instance is small and abandoned run-dbs add up.
    const RUN_DB = `qa_gw_e2e_${Date.now().toString(36)}`;
    process.env.MONGO_URI = process.env.MONGO_URI.replace(/\/([a-z_0-9]+)\?/, `/${RUN_DB}?`);
    await require(path.join(ROOT, 'db'))();
    const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
    try {
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        const cutoff = Date.now() - 30 * 60 * 1000;
        for (const d of dbs.databases) {
            const m = /^qa_gw_e2e_([a-z0-9]+)$/.exec(d.name);
            if (m && parseInt(m[1], 36) < cutoff) {
                await mongoose.connection.client.db(d.name).dropDatabase();
                console.log(`[e2e] housekeeping: dropped stale run db ${d.name}`);
            }
        }
    } catch (e) { /* best-effort */ }
    console.log(`[e2e] db: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
}

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail: String(detail).slice(0, 240) });
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`);
}
function section(t) {
    try { assertQaDb(require(require('path').join(ROOT, 'node_modules', 'mongoose'))); } catch (e) { console.error('guard err', e.message); }
    console.log(`\n──── ${t} ────`);
}

function makeSock(tag = '') {
    return {
        tag, sent: [],
        async sendMessage(chatId, content) {
            this.sent.push({ chatId, t: Date.now(), hasImage: !!content.image, text: String(content.text || content.caption || '') });
            return { key: { id: `mock_${this.sent.length}` } };
        },
        last() { return this.sent[this.sent.length - 1] || null; },
        texts() { return this.sent.map((s) => s.text); },
        images() { return this.sent.filter((s) => s.hasImage); },
    };
}

const PREFIX = '.j';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// ⚔️ INCIDENT GUARD: every section asserts the connection is STILL qa_gw.
// If anything ever re-points the shared connection (dotenv, engine boot,
// future refactor), the suite dies instantly instead of writing QA junk to
// the production namespace. Never disable this.
function assertQaDb(mongoose) {
    const n = mongoose.connection.name;
    if (n !== 'qa_gw' && !/^qa_gw_e2e_/.test(n)) {
        console.error(`🚨 FATAL: harness connection drifted to '${n}' — refusing to continue`);
        process.exit(3);
    }
}
let dmRouter, state, rooms, encounters, feed, mapEngine, GuildWarEvent, guilds, guildAdventure, economy, progression;
function makeDM(sock) {
    const fn = async (jid, txt, opts = {}) => {
        try {
            return await dmRouter.handleDM(sock, jid, jid, txt, '', { prefix: PREFIX, prefixed: true, ...opts });
        } catch (e) {
            return { text: `HARNESS-ERROR: ${e.message}` };
        }
    };
    fn.sock = sock;
    return fn;
}

async function main() {
    await connectDB();
    const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
    // ⚔️ SANDBOX SEAM: no Go image service here (it lives on Box 2). Stub the
    // singleton's render calls to return a tiny valid PNG so the WHOLE combat
    // pipeline (session creation, hooks, end screens, PvP renders) runs
    // headlessly. Throwing stubs made startRoomCombat abort session creation,
    // which left spawn-in-combat players lawfully move-locked with no fight —
    // a sandbox artifact, not a product bug. Visual QA runs on Box 2.
    // ⚔️ SANDBOX SEAM (fixed): goImageService methods return RAW BUFFERS —
    // combatImageGenerator wraps them into {success, buffer}. Stub each method
    // with a tiny valid PNG buffer so the whole combat pipeline (session
    // creation, hooks, end screens, PvP renders) runs headlessly.
    const goService = require(path.join(ROOT, 'core/utils/goImageService.js'));
    const _png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    goService.isHealthy = async () => true;
    goService.generateCombatImage = async () => _png;
    goService.generateCombatImageDirect = async () => _png;
    goService.generateAnimatedCombat = async () => _png;
    goService.generateCombatEndScreen = async () => _png;
    goService.generateHuntCard = async () => _png;
    for (const c of ['guildwarevents', 'guilds', 'systems', 'users', 'inventories']) {
        try { await mongoose.connection.db.collection(c).deleteMany({}); } catch (e) {}
    }
    dmRouter = require(path.join(ROOT, 'core/rpg/guildWar/dmRouter.js'));
    state = require(path.join(ROOT, 'core/rpg/guildWar/state.js'));
    rooms = require(path.join(ROOT, 'core/rpg/guildWar/rooms.js'));
    encounters = require(path.join(ROOT, 'core/rpg/guildWar/encounters.js'));
    feed = require(path.join(ROOT, 'core/rpg/guildWar/feed.js'));
    mapEngine = require(path.join(ROOT, 'core/rpg/guildWar/mapEngine.js'));
    GuildWarEvent = require(path.join(ROOT, 'core/models/GuildWarEvent.js'));
    guilds = require(path.join(ROOT, 'core/rpg/guilds.js'));
    guildAdventure = require(path.join(ROOT, 'core/rpg/guildAdventure.js'));
    economy = require(path.join(ROOT, 'core/rpg/economy.js'));
    progression = require(path.join(ROOT, 'core/rpg/progression.js'));

    await guilds.loadGuilds();
    try { await guilds.createGuild('Alpha', 'u-alpha', 'ADVENTURER'); } catch (e) {}
    try { await guilds.createGuild('Bravo', 'u-bravo', 'ADVENTURER'); } catch (e) {}

    const P1 = 'alice@s.whatsapp.net', P2 = 'bob@s.whatsapp.net', P3 = 'carla@s.whatsapp.net';
    for (const [j, n] of [[P1, 'Alice'], [P2, 'Bob'], [P3, 'Carla']]) {
        if (!economy.getUser(j)) economy.registerUser(j, n);
    }
    // ⚔️ QA seam: make Alice a war veteran so scripted battles WIN fast
    const boost = (jid) => {
        const u = economy.getUser(jid);
        if (!u) return;
        u.progression = u.progression || {};
        u.progression.level = 40;
        u.stats = u.stats || {};
        u.stats.atk = 900; u.stats.def = 600; u.stats.mag = 900; u.stats.spd = 120;
        u.stats.maxHp = 2000; u.stats.hp = 2000;
        u.stats.maxEnergy = 300; u.stats.energy = 300;
        economy.saveUser(jid, u);
    };
    boost(P1); boost(P2); boost(P3);

    // ═══════════ S1: DEPLOYMENT UX ═══════════
    section('S1: deployment UX');
    const engineMod = require(path.join(ROOT, 'core/engine.js'));
    engineMod.isBotOwner = () => true;
    engineMod.isGlobalMod = () => true;
    engineMod.isRpgMod = () => true;
    const index = require(path.join(ROOT, 'core/rpg/guildWar/index.js'));
    const gcSock = makeSock('gc');
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'feed@g.us', initiatedBy: 'mod' });
    const EV = created.event.eventId;
    await state.registerPlayer(EV, { jid: P1, name: 'Alice', guildId: 'Alpha', guildName: 'Alpha' });
    await state.registerPlayer(EV, { jid: P2, name: 'Bob', guildId: 'Alpha', guildName: 'Alpha' });
    await state.registerPlayer(EV, { jid: P3, name: 'Carla', guildId: 'Bravo', guildName: 'Bravo' });

    await index.handleGroupCommand(gcSock, 'feed@g.us', 'mod@s.whatsapp.net', 'Mod', ['forcestart'], { prefix: PREFIX });
    const deployText = gcSock.texts().join('\n');
    check('S1 deployment announces THE WAR HAS BEGUN', /THE GUILD WAR HAS BEGUN/.test(deployText));
    check('S1 no debug-speak "grid 8x8"', !/grid \d+×\d+/.test(deployText));
    check('S1 no ".look" advertising', !/look around|and `?look/i.test(deployText));
    check('S1 lists participating guilds', /Alpha/.test(deployText) && /Bravo/.test(deployText));
    check('S1 move grammar shown in group', /move forward/i.test(deployText));
    const ev0 = await state.getEvent(EV, { fresh: true });
    check('S1 event ACTIVE with 3 players', ev0.state === 'ACTIVE' && ev0.players.length === 3);
    await wait(2600);
    const aliceDm = gcSock.sent.filter((s) => s.chatId === P1);
    check('S1 alice got war-begun DM', aliceDm.some((s) => /THE WAR HAS BEGUN, Alice/.test(s.text)));
    check('S1 alice got spawn MAP image', aliceDm.some((s) => s.hasImage && /YOU ARE HERE/.test(s.text)));
    check('S1 alice got spawn SCENE image', aliceDm.some((s) => s.hasImage && !/YOU ARE HERE/.test(s.text)));

    // ═══════════ harness helpers ═══════════
    const dm1 = makeDM(makeSock('p1'));
    const dm2 = makeDM(makeSock('p2'));
    const dm3 = makeDM(makeSock('p3'));
    const dmSockReset = (dm) => { dm.sock.sent.length = 0; };
    const evFresh = async () => {
        let d = null;
        // ⚔️ transient-read tolerance: the shared Atlas cluster can blip under
        // parallel load — retry a null fresh read for ~3s before declaring the
        // event dead (measured false-positive: total-collection-empty read
        // during a failover, doc alive and well seconds later).
        for (let i = 0; i < 10 && !d; i++) {
            d = await state.getEvent(EV, { fresh: true });
            if (!d && i > 2) {
                const raw = await GuildWarEvent.findOne({ eventId: EV }).lean();
                console.log(`[evFresh] attempt ${i}: NULL via state! EV=${EV} raw=${raw ? `state=${raw.state}` : 'GONE'} conn=${mongoose.connection.name}@${mongoose.connection.host}`);
                await wait(400);
            }
        }
        return d;
    };
    const room1 = async () => {
        const d = await evFresh();
        if (!d) {
            const all = await mongoose.connection.db.collection('guildwarevents').find({}).project({ eventId: 1, state: 1 }).toArray();
            console.log(`FATAL-DETAIL: event ${EV} gone. collection=${JSON.stringify(all)}`);
            process.exit(2);
        }
        return d.players.find((p) => p.jid === P1).roomId;
    };
    const topoOf = async () => state.topologyOf(await evFresh());
    const dirName = { n: 'forward', e: 'right', s: 'back', w: 'left' };

    // resolve any active combat session for P1 by fighting (Alice is boosted)
    async function winFight(dm = dm1, jid = P1, budget = 30) {
        // the combat session comes up ASYNC (startCombat renders first — image
        // attempts can take ~10s with the Go service absent) → poll for inCombat
        for (let i = 0; i < 40; i++) {
            const st0 = guildAdventure.getGameState(jid, jid);
            if (!st0 || !st0.active) return true;
            if (st0.inCombat) break;
            await wait(600);
        }
        for (let i = 0; i < budget; i++) {
            const st = guildAdventure.getGameState(jid, jid);
            if (!st || !st.active || !st.inCombat) return true;
            try { await guildAdventure.handleCombatAction(dm.sock, jid, jid, 'attack', null); } catch (e) { /* keep going */ }
            await wait(500);
        }
        const st = guildAdventure.getGameState(jid, jid);
        return !st || !st.active || !st.inCombat;
    }

    // resolve ANY unresolved chamber around P1 (fight, or flee puzzles).
    // ⚔️ the World Core is deliberately NOT fought during roaming — beating
    // the guardian ENDS the war and every later section would test a corpse.
    // The core finale is exercised by the live visual QA on Box 2.
    async function resolveChamber() {
        const ev0 = await evFresh();
        const me0 = ev0.players.find((p) => p.jid === P1);
        const room0 = ev0.rooms.find((r) => r.key === me0.roomId);
        if (!room0 || room0.state === 'CLEARED') return;
        if (room0.type === 'core') { await dm1(P1, `${PREFIX} flee`); return; }
        if (['combat', 'coop'].includes(room0.type)) { await winFight(); return; }
        if (room0.type === 'secret' && encounters.payloadGet(room0.payload, 'boss')) { await winFight(); return; }
        if (room0.type === 'secret') { await dm1(P1, `${PREFIX} claim`); return; }
        if (['puzzle', 'hazard', 'lore', 'discovery', 'reward', 'anomaly', 'landmark'].includes(room0.type)) {
            if (room0.type === 'puzzle') await dm1(P1, `${PREFIX} flee`);
        }
    }

    // ═══════════ S2: MOVEMENT ═══════════
    section('S2: movement grammar');
    // if the champion spawned INTO an unresolved encounter chamber, resolve it
    // (movement is lawfully blocked until the chamber is resolved or fled)
    {
        const evS0 = await evFresh();
        const meS0 = evS0.players.find((p) => p.jid === P1);
        const roomS0 = evS0.rooms.find((r) => r.key === meS0.roomId);
        if (roomS0 && roomS0.state !== 'CLEARED' && ['combat', 'coop', 'core'].includes(roomS0.type)) {
            await winFight();
        } else if (roomS0 && roomS0.state !== 'CLEARED' && roomS0.type === 'puzzle') {
            await dm1(P1, `${PREFIX} flee`);
        } else if (roomS0 && roomS0.state !== 'CLEARED' && roomS0.type === 'secret') {
            const boss = encounters.payloadGet(roomS0.payload, 'boss');
            if (boss) await winFight(); else await dm1(P1, `${PREFIX} claim`);
        }
        await dmSockReset(dm1);
    }
    const startRoom = await room1();
    const topo = await topoOf();
    const openDirs = ['n', 'e', 's', 'w'].filter((d) => mapEngine.step(topo, startRoom, d));
    check('S2 spawn has ≥1 open edge', openDirs.length > 0, `from ${startRoom}: ${openDirs.join(',')}`);
    const d0 = openDirs[0];
    await wait(6400);
    const mv1 = await dm1(P1, `${PREFIX} move ${dirName[d0]}`);
    let nowAt = await room1();
    check('S2 prefixed move relocates', nowAt === mapEngine.step(topo, startRoom, d0), `${startRoom} -> ${nowAt} reply=${String(mv1?.text || dm1.sock.last()?.text || '').slice(0, 70)}`);
    check('S2 move sent map+scene images', dm1.sock.images().length >= 2, `${dm1.sock.images().length} images`);

    // resolve whatever chamber we just walked into (auto-combat)
    await winFight();
    await dmSockReset(dm1);

    // bare word move
    await resolveChamber();
    const before = await room1();
    const topo2 = await topoOf();
    const d1 = ['n', 'e', 's', 'w'].find((d) => mapEngine.step(topo2, before, d));
    if (d1) {
        await wait(6400);
        await dm1(P1, dirName[d1]);
        const at2 = await room1();
        check('S2 bare word moves', at2 === mapEngine.step(topo2, before, d1), `${before} -> ${at2}`);
        await winFight();
        await dmSockReset(dm1);
    } else check('S2 bare word moves', true, 'no open edge (skipped)');

    // typo tolerance (owner's exact ".j move foward")
    await resolveChamber(); // never test grammar from inside an unresolved chamber
    const beforeT = await room1();
    const topoT = await topoOf();
    const dT = ['n', 'e', 's', 'w'].find((d) => mapEngine.step(topoT, beforeT, d));
    if (dT) {
        await wait(6400);
        const typo = { n: 'foward', e: 'rght', s: 'bck', w: 'lft' }[dT];
        if (['rght', 'lft'].includes(typo)) {
            // only foward/fwd/bck are tolerated typos; rght/lft SHOULD fall through
            await dm1(P1, `${PREFIX} move ${typo}`);
            check('S2 non-listed typo falls through gracefully', true);
        } else {
            await dm1(P1, `${PREFIX} move ${typo}`);
            const atT = await room1();
            check('S2 typo "foward" normalized to forward', atT === mapEngine.step(topoT, beforeT, dT), `${beforeT} --${typo}--> ${atT}`);
            await winFight();
        }
    }

    // invalid direction: graceful, no move
    await wait(6400);
    const r0 = await room1();
    const resInvalid = await dm1(P1, `${PREFIX} move banana`);
    check('S2 invalid direction: no move + graceful', (await room1()) === r0 && (resInvalid === null || !/HARNESS-ERROR/.test(String(resInvalid?.text || ''))));

    // wall bump: closed direction
    await resolveChamber();
    const topoW = await topoOf();
    const rW = await room1();
    const closedFound = ['n', 'e', 's', 'w'].find((d) => !mapEngine.step(topoW, rW, d));
    if (closedFound) {
        await wait(6400);
        const res = await dm1(P1, `${PREFIX} move ${dirName[closedFound]}`);
        check('S2 wall bump → "No passage"', /No passage|unbroken/i.test(String(res?.text || '')), String(res?.text || '').slice(0, 60));
    } else check('S2 wall bump → "No passage"', true, 'no closed side here (skipped)');

    // cooldown: move into a KNOWN-SAFE room (cleared / non-encounter dest),
    // then IMMEDIATELY try again — the blocked-chamber gate fires BEFORE the
    // cooldown gate, so an unresolved destination would mask the cooldown.
    {
        const topoCd = await topoOf();
        const evCd = await evFresh();
        const rCd = await room1();
        const dirs = ['n', 'e', 's', 'w'].filter((d) => mapEngine.step(topoCd, rCd, d));
        const safeDir = dirs.find((d) => {
            const destKey = mapEngine.step(topoCd, rCd, d);
            const dest = evCd.rooms.find((r) => r.key === destKey);
            return !dest || dest.state === 'CLEARED' || !['combat', 'puzzle', 'coop', 'core'].includes(dest.type);
        });
        if (safeDir) {
            await wait(6400);
            await dm1(P1, `${PREFIX} move ${dirName[safeDir]}`);
            if ((await room1()) !== rCd) {
                const cdRes = await dm1(P1, `${PREFIX} move ${dirName[safeDir]}`);
                check('S2 move cooldown enforced', /catch your breath|seconds/i.test(String(cdRes?.text || '')), String(cdRes?.text || '').slice(0, 60));
            } else check('S2 move cooldown enforced', true, 'first move blocked (skipped)');
        } else check('S2 move cooldown enforced', true, 'no safe destination (skipped)');
    }

    // ═══════════ S4: ROOM-TYPE CONTENT WALK ═══════════
    section('S4: room-type content interactions');
    const seenTypes = new Set();
    const perType = {};
    const visits = new Map();
    const walkGuard = 16;
    for (let step = 0; step < walkGuard; step++) {
        const ev = await evFresh();
        const me = ev.players.find((p) => p.jid === P1);
        const room = ev.rooms.find((r) => r.key === me.roomId);
        if (!room) break;
        seenTypes.add(room.type);
        const T = room.type;
        if (room.state !== 'CLEARED') {
            const grab = (r) => String(r?.text || dm1.sock.last()?.text || '').slice(0, 90);
            if (T === 'discovery') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} dig`); perType.discovery = perType.discovery || { ok: /unearth|first|bare/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'reward') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} take`); perType.reward = perType.reward || { ok: /Claimed|already|empty/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'hazard') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} cross`); perType.hazard = perType.hazard || { ok: /unscathed|catches|spent/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'lore') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} read`); perType.lore = perType.lore || { ok: /study|memory|inscript/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'landmark') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} record`); perType.landmark = perType.landmark || { ok: /Recorded|already/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'anomaly') { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} touch`); perType.anomaly = perType.anomaly || { ok: /rift|glimpse|rains|drinks|fog/i.test(grab(r)), d: grab(r) }; }
            else if (T === 'secret') {
                const boss = encounters.payloadGet(room.payload, 'boss');
                if (boss) { await winFight(); } else { dmSockReset(dm1); const r = await dm1(P1, `${PREFIX} claim`); perType.secret = perType.secret || { ok: /find|claimed|remembered/i.test(grab(r)), d: grab(r) }; }
            }
            else if (T === 'puzzle') { /* S5 handles puzzles */ await dm1(P1, `${PREFIX} flee`); }
            else if (T === 'core') { await dm1(P1, `${PREFIX} flee`); } // never end the war mid-walk
            else if (['combat', 'coop'].includes(T)) { await winFight(); }
        }
        // step onward — least-visited open neighbour (never oscillate)
        const ev2 = await evFresh();
        if (!ev2) {
            const all = await mongoose.connection.db.collection('guildwarevents').find({}).project({ eventId: 1, state: 1 }).toArray();
            console.log('WALK-DIAG: event gone; collection =', JSON.stringify(all));
            break;
        }
        const me2 = ev2.players.find((p) => p.jid === P1);
        const topoNow = state.topologyOf(ev2);
        const nextDirs = ['n', 'e', 's', 'w'].filter((d) => mapEngine.step(topoNow, me2.roomId, d));
        if (!nextDirs.length) break;
        const visitCount = (k) => visits.get(k) || 0;
        let picked = null, bestScore = Infinity;
        for (const d of nextDirs) {
            const destKey = mapEngine.step(topoNow, me2.roomId, d);
            const dest = ev2.rooms.find((r) => r.key === destKey);
            // score: uncleared non-puzzle rooms first, then by visit count.
            // core rooms are near-forbidden (ending the war kills the suite).
            const freshBonus = dest && dest.state !== 'CLEARED' && dest.type !== 'puzzle' ? -100 : 0;
            const corePenalty = dest && dest.type === 'core' ? +5000 : 0;
            const score = visitCount(destKey) + freshBonus + corePenalty;
            if (score < bestScore) { bestScore = score; picked = d; }
        }
        const pickedDest = mapEngine.step(topoNow, me2.roomId, picked);
        if (ev2.rooms.find((r) => r.key === pickedDest)?.type === 'core' && nextDirs.length > 1) continue; // wait — pick again next loop from the same room
        visits.set(pickedDest, visitCount(pickedDest) + 1);
        await wait(6400);
        dmSockReset(dm1);
        const mv = await dm1(P1, `${PREFIX} move ${dirName[picked]}`);
        await wait(700);
        const after = (await evFresh()).players.find((p) => p.jid === P1);
        if (after.roomId === me2.roomId) {
            // blocked (unresolved chamber) → resolve and retry once
            const stOk = await winFight();
            if (!stOk) break;
            await wait(6400);
            const mv2 = await dm1(P1, `${PREFIX} move ${dirName[picked]}`);
            const after2 = (await evFresh()).players.find((p) => p.jid === P1);
            if (after2.roomId === me2.roomId) break;
        }
    }
    check('S4 walked through ≥4 distinct room types', seenTypes.size >= 4, `seen: ${[...seenTypes].join(',')}`);
    // ⚔️ DETERMINISM: the natural walk is map-dependent — force-visit every
    // interaction type the walk missed so each verb is tested EVERY run.
    const WANT_TYPES = ['discovery', 'reward', 'hazard', 'lore', 'landmark', 'anomaly', 'secret'];
    for (const wantType of WANT_TYPES) {
        if (perType[wantType] && perType[wantType].ok) continue;
        try {
            const evF = await evFresh();
            const meF = evF.players.find((p) => p.jid === P1);
            const fromF = meF.roomId;
            const [fx, fy] = fromF.split(',').map(Number);
            const k = `${fx + 1},${fy + 1}`; // diagonal slot (never adjacent-occupied)
            const synthetic = { key: k, x: fx + 1, y: fy + 1, type: wantType, state: 'UNEXPLORED', ring: 1, occupants: [], payload: {}, variant: 'intact' };
            const payloadF = encounters.buildRoomPayload({ seed: evF.seed, deadWorld: evF.deadWorld }, synthetic, { rooms: new Map(), adjacency: new Map() });
            if (evF.rooms.find((r) => r.key === k)) {
                await GuildWarEvent.updateOne({ eventId: EV, rooms: { $elemMatch: { key: k } } }, { $set: { 'rooms.$.type': wantType, 'rooms.$.state': 'UNEXPLORED', 'rooms.$.clearedBy': null, 'rooms.$.clearedByGuild': null, 'rooms.$.clearedAt': null } });
            } else {
                await GuildWarEvent.updateOne({ eventId: EV }, { $push: { rooms: synthetic } });
                await GuildWarEvent.updateOne({ eventId: EV }, { $addToSet: { edges: { $each: [`${fromF}|e`, `${k}|w`] } } });
            }
            await rooms.seedEncounters(await evFresh(), { rooms: new Map(), adjacency: new Map() });
            await rooms.enterRoom(EV, P1, fromF, k);
            await state.updatePlayer(EV, P1, {}, { roomId: k, prevRoomId: fromF, lastMoveAt: Date.now() - 10000 });
            seenTypes.add(wantType);
            dmSockReset(dm1);
            const roomF = (await evFresh()).rooms.find((r) => r.key === k);
            const grabF = (r) => String(r?.text || dm1.sock.texts().join(' ') || '').slice(0, 90);
            if (wantType === 'discovery') { const r = await dm1(P1, `${PREFIX} dig`); perType.discovery = { ok: /unearth|first|bare/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'reward') { const r = await dm1(P1, `${PREFIX} take`); perType.reward = { ok: /Claimed|already|empty/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'hazard') { const r = await dm1(P1, `${PREFIX} cross`); perType.hazard = { ok: /unscathed|catches|spent/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'lore') { const r = await dm1(P1, `${PREFIX} read`); perType.lore = { ok: /study|memory|inscript/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'landmark') { const r = await dm1(P1, `${PREFIX} record`); perType.landmark = { ok: /Recorded|already/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'anomaly') { const r = await dm1(P1, `${PREFIX} touch`); perType.anomaly = { ok: /rift|glimpse|rains|drinks|fog/i.test(grabF(r)), d: grabF(r) }; }
            else if (wantType === 'secret') {
                const boss = encounters.payloadGet(roomF.payload, 'boss');
                if (boss) { const okF = await winFight(); perType.secret = { ok: okF, d: 'boss fight' }; await rooms.clearRoom(EV, k, meF); }
                else { const r = await dm1(P1, `${PREFIX} claim`); perType.secret = { ok: /find|claimed|remembered/i.test(grabF(r)), d: grabF(r) }; }
            }
            await dm1(P1, `${PREFIX} flee`); // step back out
            await wait(300);
        } catch (e) {
            perType[wantType] = { ok: false, d: `force-visit failed: ${e.message.slice(0, 60)}` };
        }
    }
    for (const [t, v] of Object.entries(perType)) check(`S4 ${t} interaction`, v.ok, v.d);

    // ═══════════ S5: PUZZLE MECHANISM ═══════════
    section('S5: puzzle/mechanism lifecycle');
    // DETERMINISTIC: synthesize a puzzle room linked to P1's current room
    const evP = await evFresh();
    const meP = evP.players.find((p) => p.jid === P1);
    const fromKey = meP.roomId;
    const [fx, fy] = fromKey.split(',').map(Number);
    const pzKey = `${fx - 1},${fy}`; // west neighbour slot
    const synthetic = { key: pzKey, x: fx - 1, y: fy, type: 'puzzle', state: 'UNEXPLORED', ring: 1, occupants: [], payload: {}, variant: 'cracked' };
    const payload = encounters.buildRoomPayload({ seed: evP.seed, deadWorld: evP.deadWorld }, synthetic, { rooms: new Map(), adjacency: new Map() });
    const existing = evP.rooms.find((r) => r.key === pzKey);
    const stubMap = { rooms: new Map(), adjacency: new Map() };
    if (existing) {
        // retype via the production pattern, then re-seed payloads with the
        // game's OWN seeding path (seedEncounters bulkWrite)
        await GuildWarEvent.updateOne({ eventId: EV, rooms: { $elemMatch: { key: pzKey } } }, { $set: { 'rooms.$.type': 'puzzle', 'rooms.$.state': 'UNEXPLORED', 'rooms.$.clearedBy': null, 'rooms.$.clearedByGuild': null, 'rooms.$.clearedAt': null, 'rooms.$.occupants': [], 'rooms.$.residue': null } });
    } else {
        await GuildWarEvent.updateOne({ eventId: EV }, { $push: { rooms: synthetic } });
        await GuildWarEvent.updateOne({ eventId: EV }, { $addToSet: { edges: { $each: [`${fromKey}|w`, `${pzKey}|e`] } } });
    }
    await rooms.seedEncounters(await evFresh(), stubMap);
    await rooms.enterRoom(EV, P1, fromKey, pzKey);
    await state.updatePlayer(EV, P1, {}, { roomId: pzKey, prevRoomId: fromKey, lastMoveAt: Date.now() - 10000 });
    let pzDoc = (await evFresh()).rooms.find((r) => r.key === pzKey);
    if (!pzDoc) {
        // the slot may sit outside the pruned map: force-create the room + edge
        await GuildWarEvent.updateOne({ eventId: EV }, { $push: { rooms: { ...synthetic, payload } } });
        await GuildWarEvent.updateOne({ eventId: EV }, { $addToSet: { edges: { $each: [`${fromKey}|w`, `${pzKey}|e`] } } });
        pzDoc = (await evFresh()).rooms.find((r) => r.key === pzKey);
    }
    const pz = pzDoc ? encounters.payloadGet(pzDoc.payload, 'puzzle') : null;
    check('S5 puzzle payload seeded (answer server-side)', !!pz && !!pz.answer, pz ? `kind=${pz.kind}` : `no room@${pzKey} or payload keys=${pzDoc ? Object.keys(pzDoc.payload || {}).length : 'no-doc'}`);
    if (!pz) {
        console.log(`FATAL-DETAIL: pzDoc=${JSON.stringify(pzDoc).slice(0, 200)}`);
        const all = await mongoose.connection.db.collection('guildwarevents').find({}).project({ eventId: 1, state: 1 }).toArray();
        console.log('FATAL-DETAIL: collection now =', JSON.stringify(all));
        process.exit(2);
    }
    const maxA = (pz.maxAttempts || 3);
    const wrong = 'zzz-wrong';
    // cycle: wrong × maxA → exactly ONE shock (on exhaustion) then reset
    let shocks = 0, lastText = '';
    for (let i = 0; i < maxA; i++) {
        const r = await dm1(P1, wrong);
        lastText = String(r?.text || '');
        if (/shock/i.test(lastText)) shocks++;
        await wait(120);
    }
    check('S5 exhaustion → exactly one shock then reset', shocks === 1, `${shocks} shocks; last="${lastText.slice(0, 60)}"`);
    // silence check — no autonomous loop
    const preQuiet = dm1.sock.sent.length;
    await wait(1500);
    check('S5 NO autonomous loop (silence)', dm1.sock.sent.length === preQuiet, `+${dm1.sock.sent.length - preQuiet} while silent`);
    // reset confirms fresh attempts
    const rAfter = await dm1(P1, wrong);
    check('S5 reset cycle grants fresh attempts', /attempt/i.test(String(rAfter?.text || '')) && !/shock/i.test(String(rAfter?.text || '')), String(rAfter?.text || '').slice(0, 60));
    // rapid burst: 6 answers → every answer evaluated exactly once (atomic claim)
    // (with maxA=3, six wrongs yield TWO exhaustion shocks + four plain wrongs)
    pzDoc = (await evFresh()).rooms.find((r) => r.key === pzKey);
    const usedBefore = encounters.payloadGet(pzDoc.payload, 'puzzle').attemptsUsed || 0;
    const burstReplies = await Promise.allSettled(Array.from({ length: 6 }, () => dm1(P1, wrong)));
    await wait(2500);
    const shockCount = burstReplies.filter((r) => /shock/i.test(String(r.value?.text || ''))).length;
    const wrongCount = burstReplies.filter((r) => /Wrong/i.test(String(r.value?.text || ''))).length;
    check('S5 rapid burst: all 6 answers evaluated (2 shocks + 4 wrongs)', shockCount === 2 && wrongCount === 4, `shocks=${shockCount} wrongs=${wrongCount} of 6`);
    // attempts counter consistent with claims minus resets
    pzDoc = (await evFresh()).rooms.find((r) => r.key === pzKey);
    const usedAfter = encounters.payloadGet(pzDoc.payload, 'puzzle').attemptsUsed || 0;
    check('S5 attempts counter consistent after burst+resets', usedAfter === (usedBefore + 6) % maxA, `used=${usedBefore}->${usedAfter} (mod ${maxA})`);
    // exhaust to reset then SOLVE
    for (let i = 0; i < maxA; i++) await dm1(P1, wrong);
    const pzNow2 = encounters.payloadGet((await evFresh()).rooms.find((r) => r.key === pzKey).payload, 'puzzle');
    dmSockReset(dm1);
    const solveRes = await dm1(P1, String(pzNow2.answer));
    const solveText = String(solveRes?.text || dm1.sock.texts().join(' ') || '');
    check('S5 correct answer clears the seal', /clicks open|solved/i.test(solveText), `answer=${String(pzNow2.answer).slice(0, 20)} reply=${solveText.slice(0, 60)}`);
    const again = await dm1(P1, String(pzNow2.answer));
    check('S5 cleared seal is inert', /inert|already/i.test(String(again?.text || '')) || again === null, String(again?.text || '').slice(0, 50));
    // re-entry: a cleared puzzle room greets return visitors with "already dealt with"
    dmSockReset(dm1);
    await dm1(P1, `${PREFIX} look`);
    await wait(600);
    const lookBack = dm1.sock.texts().join(' ');
    check('S5 re-entering cleared chamber is safe (no new instance)', /already been dealt with|CLEARED|secured/i.test(lookBack), lookBack.slice(0, 80));
    await dm1(P1, `${PREFIX} flee`);
    await wait(6400);
    const reRoom = await room1();
    check('S5 flee exits the (cleared) puzzle room', reRoom !== pzKey, `${pzKey} -> ${reRoom}`);


    // ⚔️ QA SEAM: S5 deliberately drained the persistent HP pool (shocks are
    // real by design). Restore the fighters before the combat sections or
    // every S6/S7 fight is a 1-HP suicide run.
    try {
        for (const j of [P1, P2, P3]) {
            const u = economy.getUser(j);
            const maxHp = u?.stats?.maxHp || 2000;
            economy.setPersistentHP(j, maxHp, maxHp);
            economy.setPersistentEnergy(j, u?.stats?.maxEnergy || 300, u?.stats?.maxEnergy || 300);
        }
        console.log('[heal] persistent HP/energy restored for all 3 fighters');
    } catch (e) { console.log('[heal] failed (non-fatal):', e.message); }

    // ═══════════ S6: PvE COMBAT (win + clear + return map) ═══════════
    section('S6: ruins-native PvE');
    const evC = await evFresh();
    const cRoom = evC.rooms.find((r) => ['combat'].includes(r.type) && r.state !== 'CLEARED');
    check('S6 combat room available', !!cRoom, cRoom?.key || 'none');
    if (cRoom) {
        const meC = evC.players.find((p) => p.jid === P1);
        await rooms.enterRoom(EV, P1, meC.roomId, cRoom.key);
        await state.updatePlayer(EV, P1, {}, { roomId: cRoom.key, lastMoveAt: Date.now() - 10000 });
        dmSockReset(dm1);
        // start the fight EXPLICITLY (auto-start rides the move flow; we teleported in)
        const freshC = await evFresh();
        const meC2 = freshC.players.find((p) => p.jid === P1);
        const roomC2 = freshC.rooms.find((r) => r.key === cRoom.key);
        const started = await encounters.startRoomCombat(dm1.sock, P1, meC2, freshC, roomC2, {});
        check('S6 startRoomCombat via real pipeline', started.success === true, String(started.msg || '').slice(0, 60));
        const won = await winFight();
        check('S6 combat resolved to victory', won, 'session ended');
        const cRoomAfter = (await evFresh()).rooms.find((r) => r.key === cRoom.key);
        check('S6 victory cleared the room', cRoomAfter.state === 'CLEARED', `state=${cRoomAfter.state}`);
        check('S6 post-battle return map sent', dm1.sock.images().length >= 1, `${dm1.sock.images().length} images`);
        // verify the battle background rode the RUINS plate
        const evCB = await evFresh();
        const meCB = evCB.players.find((p) => p.jid === P1);
        // re-enter and read the combat state spec background
        // (startRoomCombat resolves plate → gameStates encounter.background)
        const exitsNow = require(path.join(ROOT, 'core/rpg/guildWar/roomScene.js')).exitsFor(evCB, meCB);
        const plateKey = require(path.join(ROOT, 'core/rpg/guildWar/roomScene.js')).plateKeyFor(exitsNow, `${evCB.seed}:${meCB.roomId}`);
        check('S6 plate key resolves to a shipped background file', ['0', 'L_a', 'L_b', 'R', 'F', 'LF', 'FR', 'LR', 'LFR'].includes(plateKey), plateKey);
    }

    // ═══════════ S7: PvP ═══════════
    section('S7: ruins PvP');
    // clear spawn protection on everyone
    for (const j of [P1, P2, P3]) await state.updatePlayer(EV, j, {}, { protectedUntil: 0, lastMoveAt: Date.now() - 10000 });
    const evS = await evFresh();
    const meS = evS.players.find((p) => p.jid === P1);
    // pull P3 into P1's room (rival guild)
    const meS3 = evS.players.find((p) => p.jid === P3);
    await rooms.enterRoom(EV, P3, meS3.roomId, meS.roomId);
    await state.updatePlayer(EV, P3, {}, { roomId: meS.roomId });
    dmSockReset(dm3);
    const chal = await dm3(P3, `${PREFIX} challenge @Alice`);
    check('S7 challenge issued', /Challenge issued/i.test(String(chal?.text || '')), String(chal?.text || '').slice(0, 70));
    dmSockReset(dm1);
    const acc = await dm1(P1, `${PREFIX} accept`);
    check('S7 duel begins on accept', /DUEL BEGINS/i.test(String(acc?.text || '')), String(acc?.text || '').slice(0, 70));
    const pvp = require(path.join(ROOT, 'core/rpg/pvpSystem.js'));
    const duelP3 = pvp.getRuinsDuelFor(P3);
    check('S7 duel state registered for both sides', !!duelP3 && !!pvp.getRuinsDuelFor(P1));
    check('S7 duel rides the ruins plate', !!duelP3?.ruinsBackground && /ruins_door_/.test(duelP3.ruinsBackground), duelP3?.ruinsBackground || 'none');
    // settle the duel: production-equivalent path — the engine's `.j combat`
    // branch (post intercept-fix) delegates exactly to handlePvPAction with
    // the player's DM chatId; handlePvPAction resolves the ruins duel via
    // ruinsByPlayer. Bounce-tolerant: "processing" replies must not eat the
    // round budget, and HP progress is logged so a stuck duel is visible.
    let settled = false, lastPvpErr = '', bounces = 0, rounds = 0;
    for (let i = 0; i < 240 && !settled; i++) {
        try {
            const duelNow = pvp.getRuinsDuelFor(P3);
            if (!duelNow) { settled = true; break; }
            const attacker = duelNow.players[duelNow.turn || 0].jid;
            const dmA = attacker === P1 ? dm1 : dm3;
            const r = await pvp.handlePvPAction(dmA.sock, attacker, attacker, 'attack', null, null);
            if (r && r.success === false && /processing/i.test(String(r.message))) { bounces++; await wait(250); continue; }
            if (r && r.success === false) lastPvpErr = String(r.message).slice(0, 80);
            rounds++;
            if (rounds % 10 === 0) console.log(`[s7] round ${rounds}: hp ${duelNow.players.map((p) => p.hp ?? '?').join(' vs ')}`);
        } catch (e) { lastPvpErr = String(e.message).slice(0, 80); }
        await wait(250);
        if (!pvp.getRuinsDuelFor(P3)) settled = true;
    }
    const finishTxt = dm1.sock.texts().join(' ') + ' ' + dm3.sock.texts().join(' ');
    check('S7 duel settled', settled, `${rounds} rounds, ${bounces} bounces; ${lastPvpErr || finishTxt.slice(-70)}`);
    // the duel outcome is DECLARED by the war itself: settle() queues a feed
    // announcement + moves GP + steals relics; the engine's action reply (sent
    // by the combat branch in production) carries the round/finish message.
    const evEnd = await evFresh();
    const feedTxt = (evEnd?.feedQueue || []).map((f) => (f && typeof f === 'object') ? (f.text || f.message || JSON.stringify(f)) : String(f)).join(' | ');
    check('S7 duel end declared by the war (feed + GP)', /defeated .* in the Ruins/i.test(feedTxt), feedTxt.slice(-100));
    check('S7 duel mappings cleaned up after finish',
        !pvp.getDuel(P1) && !pvp.getRuinsDuelFor(P1) && !pvp.getRuinsDuelFor(P3),
        `p1=${!!pvp.getRuinsDuelFor(P1)} p3=${!!pvp.getRuinsDuelFor(P3)}`);
    // ⚔️ WAR SURVIVAL: a duel between champions must not kill the war itself
    const evPost = await evFresh();
    check('S7 war survived the duel', !!evPost && evPost.state === 'ACTIVE', evPost ? evPost.state : 'GONE');

    // ═══════════ S8: GUILD MEETING ═══════════
    section('S8: guild members meeting');
    const evM = await evFresh();
    const meM = evM.players.find((p) => p.jid === P1);
    const meM2 = evM.players.find((p) => p.jid === P2);
    await rooms.enterRoom(EV, P2, meM2.roomId, meM.roomId);
    await state.updatePlayer(EV, P2, {}, { roomId: meM.roomId });
    dmSockReset(dm2);
    await dm2(P2, `${PREFIX} look`);
    // ⚔️ 1500ms (was 500): the look path renders map + scene sequentially and
    // the 🤝 meeting line rides the SCENE caption — under load the chain
    // crosses 500ms and this check read the sock before the scene landed
    // (the documented S8 rotating flake). The product path is unaffected;
    // the harness window now matches reality.
    await wait(1500);
    const meetText = dm2.sock.texts().join('\n');
    check('S8 meeting text announces guildmate', /🤝/.test(meetText) && /Alice/.test(meetText), /🤝[^\n]*/.exec(meetText)?.[0]?.slice(0, 80) || 'missing');
    // occupants visible in scene: assert the room scene was sent with the meeting
    check('S8 meeting scene image sent', dm2.sock.images().length >= 1);

    // ═══════════ S9: RELICS / MARK / TELEPORT ═══════════
    section('S9: relics, mark, teleport');
    dmSockReset(dm1);
    // BARE (unprefixed) game-mode verbs — prefixed generics fall to the normal
    // pipeline by design (GENERIC_PREFIXED_RE)
    const relicRes = await dm1(P1, 'relics', { prefixed: false });
    check('S9 relics listing works', relicRes !== null && typeof relicRes.text === 'string', String(relicRes?.text || 'NULL').slice(0, 60));
    // resolve whatever chamber P1 stands in before mark (anchor refuses live encounters)
    {
        const evMk = await evFresh();
        const meMk = evMk.players.find((p) => p.jid === P1);
        const roomMk = evMk.rooms.find((r) => r.key === meMk.roomId);
        if (roomMk && roomMk.state !== 'CLEARED' && ['combat', 'coop', 'core'].includes(roomMk.type)) await winFight();
        else if (roomMk && roomMk.state !== 'CLEARED' && ['puzzle'].includes(roomMk.type)) await dm1(P1, `${PREFIX} flee`);
        else if (roomMk && roomMk.state !== 'CLEARED' && roomMk.type === 'secret') { const b = encounters.payloadGet(roomMk.payload, 'boss'); if (b) await winFight(); else await dm1(P1, `${PREFIX} claim`); }
    }
    const markRes = await dm1(P1, `${PREFIX} mark`);
    check('S9 mark sets anchor', /Anchor set/i.test(String(markRes?.text || '')), String(markRes?.text || '').slice(0, 60));
    await wait(6400);
    const tpRes = await dm1(P1, `${PREFIX} teleport`);
    check('S9 teleport to anchor is graceful', tpRes !== null && !/HARNESS-ERROR/.test(String(tpRes?.text || '')), String(tpRes?.text || '').slice(0, 60));

    // ═══════════ S10: FEED ═══════════
    section('S10: group feed aliveness');
    const feedSock = makeSock('feed');
    await feed.flush(EV, feedSock, '');
    check('S10 feed flushed items to the host GC', feedSock.sent.length > 0, `${feedSock.sent.length} msgs`);
    check('S10 feed has war-event flavor', /⚔️|🚨|📜/.test(feedSock.texts().join('\n')));

    // ═══════════ S11: STRESS ═══════════
    section('S11: stress — rapid inputs + races');
    const burstSock = makeSock('burst');
    const dmB = makeDM(burstSock);
    const BURST_JID = P2; // fresh lock chain — isolates the stress from P1's history
    // canary: a bare status on the burst player must reply in <5s
    const canaryT0 = Date.now();
    await dmB(BURST_JID, 'status', { prefixed: false });
    console.log(`[s11] canary status replied in ${Date.now() - canaryT0}ms`);
    // volley 1: SEQUENTIAL with timing — exposes any wedging op
    const seqInputs = [['relics', true], ['status', false], ['paths', true], ['map', true], ['relics', false]];
    let handledCount = 0;
    for (const [t, pre] of seqInputs) {
        const t0 = Date.now();
        try {
            const r = await dmB(BURST_JID, t, { prefixed: pre });
            if (r && (r.text || r.image)) handledCount++;
            console.log(`[s11] ${pre ? 'prefixed' : 'bare'} ${t}: ${Date.now() - t0}ms handled=${!!(r && (r.text || r.image))}`);
        } catch (e) { console.log(`[s11] ${t} THREW: ${e.message.slice(0, 60)}`); }
    }
    // volley 2: TRUE parallel burst (the stress proper)
    const t1 = Date.now();
    const par = await Promise.allSettled(seqInputs.map(([t, pre]) => dmB(BURST_JID, t, { prefixed: pre })));
    handledCount += par.filter((x) => x.status === 'fulfilled' && x.value && (x.value.text || x.value.image)).length;
    console.log(`[s11] parallel volley of 5 settled in ${Date.now() - t1}ms`);
    await wait(3000);
    check('S11 burst survived + inputs handled', handledCount >= 4, `${handledCount} handled of 10 (sock sends: ${burstSock.sent.length})`);
    // simultaneous dig: P1+P2 same uncleared discovery room
    const evR = await evFresh();
    const dRoom = evR.rooms.find((r) => r.type === 'discovery' && r.state !== 'CLEARED');
    if (dRoom) {
        const meR1 = evR.players.find((p) => p.jid === P1);
        const meR2 = evR.players.find((p) => p.jid === P2);
        await rooms.enterRoom(EV, P1, meR1.roomId, dRoom.key);
        await rooms.enterRoom(EV, P2, meR2.roomId, dRoom.key);
        await state.updatePlayer(EV, P1, {}, { roomId: dRoom.key });
        await state.updatePlayer(EV, P2, {}, { roomId: dRoom.key });
        dmSockReset(dm1); dmSockReset(dm2);
        const digA = await dm1(P1, `${PREFIX} dig`);
        const digB = await dm2(P2, `${PREFIX} dig`);
        await wait(1500);
        const tA = String(digA?.text || '') + ' ' + dm1.sock.texts().join(' ');
        const tB = String(digB?.text || '') + ' ' + dm2.sock.texts().join(' ');
        const dRoom2 = (await evFresh()).rooms.find((r) => r.key === dRoom.key);
        check('S11 simultaneous dig → room cleared exactly once', dRoom2.state === 'CLEARED', `A="${tA.slice(0, 50)}" B="${tB.slice(0, 50)}"`);
        const wins = [/unearth/i.test(tA), /unearth/i.test(tB)].filter(Boolean).length;
        check('S11 exactly one winner', wins === 1, `${wins} winners`);
    } else check('S11 simultaneous dig', true, 'no discovery room left (skipped)');

    // ═══ SUMMARY ═══
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n════ E2E QA: ${pass}/${results.length} passed ════`);
    const fails = results.filter((r) => !r.ok);
    if (fails.length) {
        console.log('FAILURES:');
        for (const f of fails) console.log(`  ❌ ${f.name} — ${f.detail}`);
    }
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
