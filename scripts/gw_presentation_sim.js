// ============================================
// 🎮 GW PRESENTATION SIM — end-to-end battery for the 2026-10-04
// presentation & gameplay overhaul (owner spec §23 checklist).
// Drives the REAL guildWar modules against the TEST database, with a mock
// sock that records every payload so the presentation ORDER can be asserted.
//
// Covers: deployment flow (map-first, no parchment), prefixed grammar
// (.j move forward/left/back/right), auto-encounters, combat-hook victory/
// defeat/flee (§22 shadowing verification), teleport anchor (+ combat
// block), return-map style, feed majors, participation GP fix (§22),
// plate-variant selection, ring/lastMoveAt field survival (§22).
// Run: node scripts/gw_presentation_sim.js
// ============================================

process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300'; // fast cooldown for the sim

const fs = require('fs');
const path = require('path');

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail: String(detail).slice(0, 160) });
    console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ` — ${detail}`}`);
}

const mockSock = () => ({
    sent: [],
    async sendMessage(chatId, content) {
        this.sent.push({ chatId, hasImage: !!content.image, hasVideo: !!content.video, text: (content.text || content.caption || '').slice(0, 90) });
    },
});

async function connectDB() {
    // parse .env FIRST and redirect MONGO_URI to the TEST database BEFORE any
    // module that caches the connection loads (same pattern as gw_sim.js)
    try {
        const envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
                const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
                if (m && process.env[m[1]] === undefined) {
                    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
                }
            }
        }
    } catch (e) { /* .env optional */ }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[sim] connected to TEST db: ${mongoose.connection.name}`);
}

async function makeGuild(guilds, name) {
    await guilds.createGuild(name, `u-${name}`, 'ADVENTURER');
    return name;
}

// ── helpers ──
async function freshEvent({ players = 2, host = 'pres@g.us' } = {}) {
    const state = require('../core/rpg/guildWar/state');
    const created = await state.createEvent({ type: 'normal', hostGroupId: host, initiatedBy: 'owner' });
    for (let i = 0; i < players; i++) {
        await state.registerPlayer(created.event.eventId, {
            jid: `pp${i}@s.whatsapp.net`, name: `PP${i}`,
            guildId: 'GwTestA', guildName: 'GwTestA',
        });
    }
    const started = await state.startEvent(created.event.eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    return started.event;
}

function playerOf(doc, jid) { return doc.players.find((p) => p.jid === jid); }

// ═════════ S1: DEPLOYMENT FLOW (§1/§2) ═════════
async function s1_deploy() {
    const gw = require('../core/rpg/guildWar');
    const ev = await freshEvent({ players: 2 });
    const sock = mockSock();
    const n = await gw.dmWarStartCards(sock, '\u200B', ev, '.');
    check('deploy: both champions messaged', n === 2, `n=${n}`);
    const mine = sock.sent.filter((s) => s.chatId === 'pp0@s.whatsapp.net');
    check('deploy: first payload is the TEXT announcement (no parchment image)', mine.length >= 3 && !mine[0].hasImage, JSON.stringify(mine[0] || {}));
    check('deploy: no war-start parchment card at all', !mine.some((s) => /LOOK/i.test(s.text) || /to begin/i.test(s.text)));
    check('deploy: MAP arrives first with YOU ARE HERE', mine[1] && mine[1].hasImage && /YOU ARE HERE/.test(mine[1].text), JSON.stringify(mine[1] || {}));
    check('deploy: SCENE (character in room) arrives second', mine[2] && mine[2].hasImage && mine[1].hasImage, JSON.stringify(mine[2] || {}));
}

// ═════════ S2: PREFIXED GRAMMAR (§11 — the ".j left unknown" fix) ═════════
async function s2_prefixed() {
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const ga = require('../core/rpg/guildAdventure');
    const ev = await freshEvent({ players: 1 });
    const sock = mockSock();

    // stub the combat pipeline: auto-encounters must not explode the sim
    let combatStarts = 0, lastSpec = null;
    const origStart = ga.startRuinsCombat;
    ga.startRuinsCombat = async (s, c, j, spec) => { combatStarts++; lastSpec = spec; return { success: true, sessionKey: 'sim' }; };

    const dm = (txt) => dmRouter.handleDM(sock, 'pp0@s.whatsapp.net', 'pp0@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });

    const res1 = await dm('.j move forward');
    check('prefixed .j move forward consumed', res1 !== null && typeof res1 === 'object', JSON.stringify(res1 || 'null').slice(0, 60));
    const res2 = await dm('.j left');
    check('prefixed .j left consumed (was "unknown command")', res2 !== null, JSON.stringify(res2 || 'null').slice(0, 60));
    const res3 = await dm('.j move back');
    check('prefixed .j move back consumed', res3 !== null, JSON.stringify(res3 || 'null').slice(0, 60));
    const res4 = await dm('.j move right');
    check('prefixed .j move right consumed', res4 !== null, JSON.stringify(res4 || 'null').slice(0, 60));

    // generic prefixed commands must fall through untouched
    check('.j use … falls through to normal pipeline', await dm('.j use elixir') === null);
    check('.j bag falls through to normal pipeline', await dm('.j bag') === null);
    check('.j status falls through to normal pipeline', await dm('.j status') === null);

    // position actually moved
    const fresh = await state.getEvent(ev.eventId, { fresh: true });
    const p0 = playerOf(fresh, 'pp0@s.whatsapp.net');
    check('position changed by prefixed moves', p0.roomId !== p0.spawnRoomId, `${p0.spawnRoomId} → ${p0.roomId}`);

    // §22: lastMoveAt survived the schema (move cooldown clock)
    check('§22 lastMoveAt persisted (cooldown clock works)', (p0.lastMoveAt || 0) > 0);
    ga.startRuinsCombat = origStart;
}

// ═════════ S3: AUTO-ENCOUNTER (§14) ═════════
async function s3_auto_encounter() {
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const GuildWarEvent = require('../../whatsapp-bot/core/models/GuildWarEvent'.replace('../../whatsapp-bot', '..'));
    const ga = require('../core/rpg/guildAdventure');
    const ev = await freshEvent({ players: 1 });

    let combatStarts = 0, lastSpec = null;
    const origStart = ga.startRuinsCombat;
    ga.startRuinsCombat = async (s, c, j, spec) => { combatStarts++; lastSpec = spec; return { success: true, sessionKey: 'sim' }; };

    // force the player next to a combat room, then move in
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const combat = doc.rooms.find((r) => r.type === 'combat' && r.state === 'UNEXPLORED');
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    // find a neighbour of the combat room reachable via an edge
    const neigh = doc.rooms.find((r) => doc.edges.includes(`${r.key}|e`) && doc.edges.includes(`${combat.key}|w`) && r.x + 1 === combat.x)
        || doc.rooms.find((r) => r.key !== combat.key);
    await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: neigh.key, prevRoomId: neigh.key, lastMoveAt: 0 });
    const sock = mockSock();
    await dmRouter.handleDM(sock, me.jid, me.jid, '.j move right', '\u200B', { prefix: '.', prefixed: true });
    // if the right move did not land on the combat room (topology), walk until it does
    let guard = 0;
    while (combatStarts === 0 && guard++ < 10) {
        doc = await state.getEvent(ev.eventId, { fresh: true });
        const cur = playerOf(doc, me.jid);
        if (cur.roomId === combat.key) break;
        if (cur.roomId === combat.key || doc.edges.includes(`${cur.roomId}|n`) ) { await dmRouter.handleDM(sock, me.jid, me.jid, '.j move forward', '\u200B', { prefix: '.', prefixed: true }); continue; }
        await dmRouter.handleDM(sock, me.jid, me.jid, ['forward', 'right', 'back', 'left'][guard % 4], '\u200B', { prefix: '.', prefixed: true });
    }
    check('combat room auto-started the fight (no "fight" typed)', combatStarts >= 1, `starts=${combatStarts}`);
    // ⚔️ owner directive 2026-10-05 23:39Z: the square map panel is GONE from
    // ruins battles — the spec must carry the room key and must NOT carry any
    // map fragment (the fight stays IN the room scene, guildWar/battleScene.js).
    check('combat spec carries room key, NO map fragment (owner 23:39Z)', lastSpec && lastSpec.roomKey && !lastSpec.mapFragment, JSON.stringify(lastSpec ? Object.keys(lastSpec) : 'none'));
    check('no manual fight prompt needed', !sock.sent.some((s) => /type .fight./i.test(s.text)));

    // puzzle rooms must NOT auto-combat
    doc = await state.getEvent(ev.eventId, { fresh: true });
    const puzzle = doc.rooms.find((r) => r.type === 'puzzle');
    if (puzzle) {
        combatStarts = 0;
        await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: puzzle.key, prevRoomId: puzzle.key, lastMoveAt: 0 });
        const sock2 = mockSock();
        await dmRouter.presentRoom(sock2, me.jid, '\u200B', doc, playerOf(doc, me.jid), puzzle, { prefix: '.' });
        check('puzzle room does not auto-start combat', combatStarts === 0);
    }
    ga.startRuinsCombat = origStart;
}

// ═════════ S4: COMBAT HOOKS (§22 shadowing fix verification) ═════════
async function s4_hooks() {
    const state = require('../core/rpg/guildWar/state');
    const gw = require('../core/rpg/guildWar');
    const ga = require('../core/rpg/guildAdventure');

    // capture the hooks the same way the combat engine does
    let captured = null;
    const orig = ga.setRuinsHooks;
    ga.setRuinsHooks = (h) => { captured = h; };
    gw.installCombatHooks();
    ga.setRuinsHooks = orig;
    check('hooks installed with onFlee + onEnd + presentAfterBattle', captured && typeof captured.onEnd === 'function' && typeof captured.onFlee === 'function' && typeof captured.presentAfterBattle === 'function');

    const ev = await freshEvent({ players: 1 });
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    // put the player IN a combat room with a previous room
    const combat = doc.rooms.find((r) => r.type === 'combat') || doc.rooms.find((r) => r.type !== 'empty');
    await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: combat.key, prevRoomId: me.roomId });

    // ── VICTORY: room clears, GP paid, decree-then-map order ──
    const sock = mockSock();
    const session = { ruinsMeta: { eventId: doc.eventId, roomKey: combat.key }, players: [{ jid: me.jid, name: me.name, lives: 3, spawnRoomId: me.spawnRoomId, roomId: combat.key }] };
    // 🔄 ORDERING (owner 2026-10-05 11:48Z): onEnd must be SILENT (the decree
    // end card is sent by endCombat before presentAfterBattle replays the
    // map/encounter) and must return a presentation descriptor.
    const vdesc = await captured.onEnd(session, true, 'sim-key', sock);
    check('victory: onEnd sends NOTHING (decree card goes first)', sock.sent.length === 0, JSON.stringify(sock.sent.map((s) => s.text)));
    check('victory: onEnd returns victory descriptor', vdesc && vdesc.kind === 'victory' && vdesc.claimed === true, JSON.stringify(vdesc));
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const after = playerOf(doc, me.jid);
    check('victory: hook runs without shadowing crash (§22 #1)', true);
    check('victory: room cleared + claimed by winner', (doc.rooms.find((r) => r.key === combat.key) || {}).state === 'CLEARED');
    check('victory: GP awarded', (after.score || 0) > 0, `score=${after.score}`);
    await captured.presentAfterBattle(session, true, 'sim-key', sock, vdesc);
    check('victory: RETURN map image sent AFTER the card slot (§4)', sock.sent.some((s) => s.hasImage && /chamber is yours/i.test(s.text)), JSON.stringify(sock.sent.map((s) => s.text)));

    // ── DEFEAT: life lost, respawn at spawn corner, silent onEnd ──
    const sock2 = mockSock();
    const dsession = { ruinsMeta: { eventId: doc.eventId, roomKey: combat.key }, players: [{ jid: me.jid, name: me.name, lives: 2, spawnRoomId: me.spawnRoomId, roomId: combat.key }] };
    // §23: the hook reads the AUTHORITATIVE event player's lives (the session
    // entity's lives field is ignored), so derive expectations from the DB.
    const preDoc = await state.getEvent(doc.eventId, { fresh: true });
    const preLives = playerOf(preDoc, me.jid).lives ?? 3;
    const ddesc = await captured.onEnd(dsession, false, 'sim-key', sock2);
    check('defeat: onEnd sends NOTHING (decree card goes first)', sock2.sent.length === 0, JSON.stringify(sock2.sent.map((s) => s.text)));
    // 🤝 co-op (2026-10-05): the descriptor is MULTI-PLAYER —
    // { kind:'defeat-multi', players:[{jid,kind:'respawn',name,lives,spawnRoom}] }.
    // The legacy single-player shape ({kind:'respawn',…}) is still accepted.
    const leg = ddesc && ddesc.kind === 'respawn' ? ddesc : null;
    const multi = ddesc && Array.isArray(ddesc.players) ? (ddesc.players.find((x) => x.kind === 'respawn') || null) : null;
    const row = leg || multi;
    check('defeat: onEnd returns respawn descriptor', row && row.lives === Math.max(0, preLives - 1) && row.spawnRoom === me.spawnRoomId, JSON.stringify(ddesc));
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const defeated = playerOf(doc, me.jid);
    check('defeat: life decremented (authoritative, §23)', (defeated.lives || 0) === Math.max(0, preLives - 1), `lives=${defeated.lives} expected=${Math.max(0, preLives - 1)}`);
    check('defeat: respawned at spawn corner with protection', defeated.roomId === me.spawnRoomId && (defeated.protectedUntil || 0) > Date.now() - 1000);
    // 🔄 presentation replay: fall text FIRST, then the map/encounter images
    await captured.presentAfterBattle(dsession, false, 'sim-key', sock2, ddesc);
    const textIdx = sock2.sent.findIndex((s) => /You have fallen/i.test(s.text));
    const imgIdx = sock2.sent.findIndex((s) => s.hasImage);
    check('defeat: fall text sent', textIdx >= 0, JSON.stringify(sock2.sent.map((s) => s.text)));
    check('defeat: respawn map/encounter images sent after the fall text', imgIdx > textIdx, `text@${textIdx} img@${imgIdx}: ${JSON.stringify(sock2.sent.map((s) => s.text))}`);

    // ── FLEE: retreats to previous room ──
    await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: combat.key, prevRoomId: me.spawnRoomId });
    await captured.onFlee({ ruinsMeta: { eventId: doc.eventId, roomKey: combat.key }, players: [{ jid: me.jid }], session: true });
    // the onFlee hook is fire-and-forget by design (the combat engine calls it
    // synchronously mid-teardown) — give the async retreat a beat to land
    await new Promise((r) => setTimeout(r, 200));
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const fled = playerOf(doc, me.jid);
    check('flee: retreated to previous room', fled.roomId === me.spawnRoomId, `roomId=${fled.roomId}`);
}

// ═════════ S5: TELEPORT ANCHOR (§16) ═════════
async function s5_teleport() {
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const ev = await freshEvent({ players: 1 });
    const dm = (txt, sock) => dmRouter.handleDM(sock, 'pp0@s.whatsapp.net', 'pp0@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });

    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = playerOf(doc, 'pp0@s.whatsapp.net');

    // teleport with no anchor → guidance
    await state.updatePlayer(doc.eventId, me.jid, {}, { lastMoveAt: 0 });
    let sock = mockSock();
    let res = await dm('teleport', sock);
    check('teleport without anchor → guidance', res && /anchor/i.test(res.text || ''), (res?.text || '').slice(0, 60));

    // mark here, walk away, teleport back
    await dm('mark', sock);
    doc = await state.getEvent(doc.eventId, { fresh: true });
    check('§16 anchor persisted on player', !!playerOf(doc, me.jid).markedRoom);
    // walk somewhere else (any open edge)
    const topo = doc.edges;
    const cur0 = playerOf(doc, me.jid).roomId;
    const stepEdge = topo.find((e) => e.startsWith(`${cur0}|`));
    const dirMap = { n: 'forward', s: 'back', e: 'right', w: 'left' };
    const dir = stepEdge ? dirMap[stepEdge.split('|')[1]] : 'forward';
    await state.updatePlayer(doc.eventId, me.jid, {}, { lastMoveAt: 0 });
    sock = mockSock();
    await dm(`move ${dir}`, sock);
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const moved = playerOf(doc, me.jid);
    check('moved away from anchor', moved.roomId !== moved.markedRoom, `${moved.roomId} vs ${moved.markedRoom}`);
    await state.updatePlayer(doc.eventId, me.jid, {}, { lastMoveAt: 0 });
    // 🤝 co-op era (2026-10-05): the walk may have auto-started a REAL room
    // fight (flee sessions are cleaned properly now, so nothing blocks the
    // start). §16 teleport must refuse a live fight — that's separately
    // checked below — so settle any live session before testing the anchor.
    require('../core/rpg/guildAdventure').abortRuinsSession('pp0@s.whatsapp.net');
    sock = mockSock();
    res = await dm('teleport', sock);
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const returned = playerOf(doc, me.jid);
    check('teleport returns to the anchored chamber', returned.roomId === returned.markedRoom, `${returned.roomId} vs ${returned.markedRoom} — res=${JSON.stringify(res || null).slice(0, 90)}`);
    check('teleport presented the room visuals', sock.sent.filter((s) => s.hasImage).length >= 2, `images=${sock.sent.filter((s) => s.hasImage).length}`);

    // COMBAT BLOCK (§16: teleport must never skip a live fight)
    doc = await state.getEvent(doc.eventId, { fresh: true });
    const combat = doc.rooms.find((r) => r.type === 'combat' && r.state === 'UNEXPLORED');
    if (combat) {
        await GuildWarEvent.updateOne(
            { eventId: doc.eventId, rooms: { $elemMatch: { key: combat.key } } },
            { $set: { 'rooms.$.state': 'ACTIVE' } }
        );
        await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: combat.key, prevRoomId: combat.key, lastMoveAt: 0 });
        sock = mockSock();
        res = await dm('teleport', sock);
        check('teleport BLOCKED inside an unresolved combat', res && /shut|resolve/i.test(res.text || ''), (res?.text || '').slice(0, 70));
        doc = await state.getEvent(doc.eventId, { fresh: true });
        check('player still in the combat room (no bypass)', playerOf(doc, me.jid).roomId === combat.key);
    }
}

// ═════════ S6: PLATE VARIANT SELECTION (§8) ═════════
async function s6_plates() {
    const roomScene = require('../core/rpg/guildWar/roomScene');
    const ex = (dirs) => dirs.map((d) => ({ dir: d, edge: true }));
    const cases = [
        [['n', 'e', 's', 'w'], 'LFR'], [['n', 'e', 'w'], 'LFR'], [['n', 'e', 's'], 'FR'],
        [['n', 'w'], 'LF'], [['e', 'w', 's'], 'LR'], [['n', 's'], 'F'], [['e'], 'R'],
        [['w'], 'L_a|L_b'], [[], '0'], [['s'], '0'],
    ];
    for (const [dirs, expected] of cases) {
        const got = roomScene.plateKeyFor(ex(dirs), 'seed-x');
        check(`plate ${dirs.join('+') || 'none'} → ${expected}`, expected.split('|').includes(got), `got ${got}`);
    }
    // S never forces a side arch; render smoke for the S-only + full exits
    const fakeEv = { eventId: 'x', seed: 'x', side: 2, rooms: [{ key: '0,0', x: 0, y: 0, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.2 }], edges: [], deadWorld: 'ember', type: 'normal', state: 'ACTIVE' };
    const buf = await roomScene.renderRoomScene(fakeEv, { roomId: '0,0', classId: 'SAMURAI', spriteIndex: 0, discovered: ['0,0'] }, fakeEv.rooms[0], { exits: ex(['s']), prefix: '.' });
    check('S-only room renders (back indicator, no fake arches)', Buffer.isBuffer(buf) && buf.length > 10000, `${buf && buf.length}`);
}

// ═════════ S7: RETURN MAP + EXPLORE MAP (§3/§4) ═════════
async function s7_maps() {
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const ev = await freshEvent({ players: 1 });
    const doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    const ret = await dmRouter.returnMapFor(doc, me, doc.rooms.find((r) => r.key === me.roomId));
    check('return map renders (post-encounter style)', Buffer.isBuffer(ret) && ret.length > 10000, `${ret && ret.length}`);
    const dmRouter2 = require('../core/rpg/guildWar/dmRouter');
    const sock = mockSock();
    const res = await dmRouter2.handleDM(sock, me.jid, me.jid, 'paths', '\u200B', { prefix: '.' });
    check('.j paths returns the RETURN map image', res && Buffer.isBuffer(res.image) && res.image.length > 10000);
}

// ═════════ S8: FEED MAJORS (§17) ═════════
async function s8_feed() {
    const state = require('../core/rpg/guildWar/state');
    const gw = require('../core/rpg/guildWar');
    const ga = require('../core/rpg/guildAdventure');
    const GuildWarEvent = require('../core/models/GuildWarEvent'); // scope fix: my poll below uses it
    let captured = null;
    const orig = ga.setRuinsHooks;
    ga.setRuinsHooks = (h) => { captured = h; };
    gw.installCombatHooks();
    ga.setRuinsHooks = orig;

    const ev = await freshEvent({ players: 1 });
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    const core = doc.rooms.find((r) => r.type === 'core');
    require('../core/models/GuildWarEvent').updateOne(
        { eventId: doc.eventId, rooms: { $elemMatch: { key: core.key } } },
        { $set: { 'rooms.$.state': 'ACTIVE' } }
    ).catch(() => {});
    await state.updatePlayer(doc.eventId, me.jid, {}, { roomId: core.key, prevRoomId: core.key });
    const sock = mockSock();
    await captured.onEnd({ ruinsMeta: { eventId: doc.eventId, roomKey: core.key }, players: [{ jid: me.jid, name: me.name, lives: 3, spawnRoomId: me.spawnRoomId, roomId: core.key }] }, true, 'k', sock);
    const feed = require('../core/rpg/guildWar/feed');
    // ⚔️ mirror-ack aware (2026-10-06 feed dedup): the queued item may have
    // drained from the local mirror into the doc — check both, briefly.
    let queued = feed.st(doc.eventId).queue;
    for (let i = 0; i < 20 && !queued.some((q) => q.tier === 'major'); i++) {
        await new Promise((r) => setTimeout(r, 50));
        const qdoc = await GuildWarEvent.findOne({ eventId: doc.eventId }, { feedQueue: 1 }).lean();
        queued = [...feed.st(doc.eventId).queue, ...((qdoc && qdoc.feedQueue) || [])];
    }
    check('core breach queued a MAJOR headline', queued.some((q) => q.tier === 'major' && /WORLD CORE/i.test(q.text)), JSON.stringify(queued.map((q) => q.tier)));
    check('core breach granted the first-guild GP', (await state.getEvent(doc.eventId, { fresh: true })).coreClaimedBy === 'GwTestA');
}

// ═════════ S9: PARTICIPATION GP (§22 inversion) ═════════
async function s9_participation() {
    const state = require('../core/rpg/guildWar/state');
    const points = require('../core/rpg/guildWar/points');
    const guilds = require('../core/rpg/guilds');
    const ev = await freshEvent({ players: 4 });
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    // P0: scored; P1: acted only (lastActionAt > joinedAt, score 0); P2: idle; P3: quit
    const jids = ['pp0', 'pp1', 'pp2', 'pp3'].map((j) => `${j}@s.whatsapp.net`);
    await points.award(doc.eventId, jids[0], 40, 'room-clear');
    await GuildWarEvent.updateOne({ eventId: doc.eventId, 'players.jid': jids[1] }, { $set: { 'players.$.lastActionAt': Date.now() } });
    await state.updatePlayer(doc.eventId, jids[3], {}, { status: 'quit' });
    doc = await state.getEvent(doc.eventId, { fresh: true });
    // simulate natural joinedAt (set at registration) — idle player keeps score 0 + no action
    const before = guilds.getGuild('GwTestA')?.points || 0;
    const summary = await points.distribute(doc, 'sim');
    check('§22 participation: scorer counted', summary.participation.includes('PP0'), JSON.stringify(summary.participation));
    check('§22 participation: actor (score 0) counted', summary.participation.includes('PP1'), JSON.stringify(summary.participation));
    check('§22 participation: idle NOT paid (was inverted before)', !summary.participation.includes('PP2'), JSON.stringify(summary.participation));
    check('§22 participation: quitter NOT paid', !summary.participation.includes('PP3'), JSON.stringify(summary.participation));
    const after = guilds.getGuild('GwTestA')?.points || 0;
    check('§22 participation paid into guild curve (2 participants × 10)', after - before >= 20, `Δ=${after - before}`);
}

// ═════════ S10: §22 FIELD SURVIVAL (ring / lastMoveAt / ward) ═════════
async function s22_fields() {
    const state = require('../core/rpg/guildWar/state');
    const encounters = require('../core/rpg/guildWar/encounters');
    const ga = require('../core/rpg/guildAdventure');
    const ev = await freshEvent({ players: 2 });
    const doc = await state.getEvent(ev.eventId, { fresh: true });
    check('§22 ring survived the schema (no NaN)', doc.rooms.every((r) => Number.isFinite(r.ring)), doc.rooms.find((r) => !Number.isFinite(r.ring))?.key || 'all finite');
    check('§22 ring varies across the map (scaling input alive)', new Set(doc.rooms.map((r) => Math.round(r.ring * 10))).size > 2);

    // ward relic rides into combat spec (§22 #8)
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    await GuildWarEvent.updateOne({ eventId: doc.eventId, 'players.jid': me.jid }, {
        $push: { 'players.$.relics': { id: 'ward1', name: 'Aegis Ward', tier: 'Epic', category: 'ward_active', charges: 0, meta: { kind: 'def', fights: 1 }, acquiredAt: new Date() } },
    });
    const fresh = await state.getEvent(doc.eventId, { fresh: true });
    const meFresh = playerOf(fresh, me.jid);
    const room = fresh.rooms.find((r) => r.key === meFresh.roomId);
    let spec = null;
    const orig = ga.startRuinsCombat;
    ga.startRuinsCombat = async (s, c, j, sp) => { spec = sp; return { success: true }; };
    await encounters.startRoomCombat(mockSock(), me.jid, meFresh, fresh, room, {});
    ga.startRuinsCombat = orig;
    check('§22 ward buff rides the combat spec (consumable)', spec && spec.ward && spec.ward.type === 'defense', JSON.stringify(spec?.ward || null));
    check('§22 relic consumed after the fight', (await state.getEvent(doc.eventId, { fresh: true })).players.find((p) => p.jid === me.jid).relics.length === 0);
}

(async function main() {
    const filter = process.argv[2] || '';
    await connectDB();
    const guilds = require('../core/rpg/guilds');
    try { await makeGuild(guilds, 'GwTestA'); } catch (e) {}
    try { await guilds.loadGuilds(); } catch (e) {}
    const stateRef0 = require('../core/rpg/guildWar/state');
    const suites = [
        ['S1 deploy', s1_deploy],
        ['S2 prefixed grammar', s2_prefixed],
        ['S3 auto-encounter', s3_auto_encounter],
        ['S4 combat hooks', s4_hooks],
        ['S5 teleport', s5_teleport],
        ['S6 plates', s6_plates],
        ['S7 maps', s7_maps],
        ['S8 feed majors', s8_feed],
        ['S9 participation', s9_participation],
        ['S22 fields', s22_fields],
    ];
    const t0 = Date.now();
    for (const [name, fn] of suites) {
        if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
        console.log(`\n══════ ${name} ══════`);
        try {
            for (const ev of await stateRef0.getActiveEvents()) await stateRef0.abortEvent(ev.eventId, 'suite cleanup');
            await fn();
        } catch (e) {
            console.error(`💥 ${name} CRASHED:`, (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
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
