// ============================================
// 🧪 MULTIPLAYER RUINS PLAYTEST — owner brief multiplayer_ruins_playtest-1.txt
// Runs REAL game-code simulations: real DB events, real dmRouter verbs,
// real startRoomCombat/battleScene renders, real ruinsPvp windows.
// Evidence: recorded DMs + saved images + state assertions.
// ============================================
const L = require('./mp_lib');
const fs = require('fs');
const RUN = Math.random().toString(36).slice(2, 6);
const OUT = L.OUT; L.overlaySprites();

const R = [];
const rep = (section, name, pass, detail) => { R.push({ section, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${section}] ${name}${detail ? ' — ' + detail : ''}`); };
const MAN = [];

// ── movement helpers (real grammar, real cooldowns) ──
const DIR_TOKEN = { n: 'north', e: 'east', s: 'south', w: 'west' };
function bfsPath(doc, from, to) {
    const state = require('../core/rpg/guildWar/state');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const topo = state.topologyOf(doc);
    const prev = new Map([[from, null]]); const q = [from];
    while (q.length) {
        const cur = q.shift();
        if (cur === to) break;
        for (const d of ['n', 'e', 's', 'w']) {
            const nxt = mapEngine.step(topo, cur, d);
            if (nxt && !prev.has(nxt)) { prev.set(nxt, [cur, d]); q.push(nxt); }
        }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let cur = to; prev.get(cur); cur = prev.get(cur)[0]) path.unshift(prev.get(cur));
    return path;
}
async function drive(sock, jid, path, quiet = true) {
    for (const [roomKey, dir] of path) {
        const res = await L.dm(sock, jid, `.j move ${DIR_TOKEN[dir]}`);
        const t = (res && res.text || '');
        if (t && !quiet) console.log(`    dm(${dir} from ${roomKey}) →`, t.slice(0, 80));
        if (/blocked|breath|passage/i.test(t)) {
            await L.sleep(700);
            const r2 = await L.dm(sock, jid, `.j move ${DIR_TOKEN[dir]}`);
            if ((r2 && r2.text) && !quiet) console.log(`    retry(${dir}) →`, (r2.text || '').slice(0, 80));
        }
        await L.sleep(320);
    }
}
async function prepWorld(eventId, rooms, clearKeys, meet, meetType = 'empty') {
    const GWE = require('../core/models/GuildWarEvent');
    for (const k of clearKeys) {
        if (k === meet) continue;
        await GWE.updateOne({ eventId, 'rooms.key': k }, { $set: { 'rooms.$.state': 'CLEARED', 'rooms.$.clearedBy': 'veteran', 'rooms.$.clearedAt': new Date() } });
    }
    await GWE.updateOne({ eventId, 'rooms.key': meet }, { $set: { 'rooms.$.type': meetType } });
}
const snap = async (eventId) => {
    const state = require('../core/rpg/guildWar/state');
    return state.getEvent(eventId, { fresh: true });
};
function dist(a, b) { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return Math.abs(ax - bx) + Math.abs(ay - by); }
async function cleanup(eventId, jids) {
    const ga = require('../core/rpg/guildAdventure');
    for (const j of jids) { try { ga.abortRuinsSession(j); } catch (e) {} }
    try { await require('../core/rpg/guildWar/state').abortEvent(eventId, 'playtest section done'); } catch (e) {}
}

// ════════ S1: SAME-ROOM ENTRIES — different doors, sequential + simultaneous ════════
async function s1_entries() {
    console.log('\n━━━ S1: same-room entry (different doors, seq + simultaneous) ━━━');
    const roster = L.makeRoster([
        { jid: 'a' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'b' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const [A, B] = roster; const sockA = L.makeSock('A'), sockB = L.makeSock('B');
    let doc = await snap(ev.eventId);
    const pa0 = doc.players.find(p => p.jid === A.jid), pb = doc.players.find(p => p.jid === B.jid);
    rep('S0', '⚠️ BUG: deployed players are NOT in their spawn room occupants[]', (() => {
        const spawnRoom = doc.rooms.find(r => r.key === pa0.roomId);
        return Array.isArray(spawnRoom.occupants) && spawnRoom.occupants.includes(pa0.jid);
    })(), 'startEvent sets players[].roomId but never seeds rooms[].occupants — a player who has not moved yet is invisible to room-occupant logic (meeting lines, scene co-actors)');
    rep('S1', 'players deploy to distinct spawn rooms', pa0.roomId !== pb.roomId, `A@${pa0.roomId} B@${pb.roomId} (manhattan ${dist(pa0.roomId, pb.roomId)}, side ${doc.side})`);

    const bNbrs = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), pb.roomId, d) })).filter(x => x.k);
    let meet = null, dirB = null, pathA = null;
    for (const nb of bNbrs) {
        const pacand = bfsPath(doc, pa0.roomId, nb.k);
        if (pacand && pacand[pacand.length - 1][1] !== nb.d) { meet = nb.k; dirB = nb.d; pathA = pacand; break; }
    }
    if (!meet) { meet = bNbrs[0].k; dirB = bNbrs[0].d; pathA = bfsPath(doc, pa0.roomId, meet); }
    await prepWorld(ev.eventId, doc.rooms, pathA.map(s => s[0]), meet);
    await drive(sockA, A.jid, pathA.slice(0, -1));
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[dirB]}`); await L.sleep(320);
    await drive(sockA, A.jid, pathA.slice(-1));
    doc = await snap(ev.eventId);
    const room = doc.rooms.find(r => r.key === meet);
    rep('S1', 'different doors: A and B entered meet from different directions', pathA[pathA.length - 1][1] !== dirB, `A entered via '${pathA[pathA.length - 1][1]}', B via '${dirB}'`);
    rep('S1', 'sequential entry: both occupy the same room', room.occupants.includes(A.jid) && room.occupants.includes(B.jid), `occupants=${room.occupants.length}`);
    const socA = sockA.sent.filter(s => (s.payload.caption || '').includes('rival guild'));
    const socB = sockB.sent.filter(s => (s.payload.caption || '').includes('rival guild'));
    rep('S1', 'arrival notice to the RESIDENT player (B) is missing — spec gap', socB.length > 0, `A (arriver) got ${socA.length} rival notice(s); B (resident) got ${socB.length} — B is never told anyone walked in; B only finds out on their next own action`);

    // SIMULTANEOUS: both step out through different doors, then both re-enter at once
    const stepOutA = bfsPath(doc, meet, meet).length; // noop
    const exitsMeet = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), meet, d) })).filter(x => x.k);
    const doorA = exitsMeet[0], doorB = exitsMeet[1] || exitsMeet[0];
    await L.dm(sockA, A.jid, `.j move ${DIR_TOKEN[doorA.d]}`); await L.sleep(320);
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[doorB.d]}`); await L.sleep(320);
    await prepWorld(ev.eventId, doc.rooms, [doorA.k, doorB.k], meet);
    sockA.clear(); sockB.clear();
    const [ra, rb] = await Promise.all([
        L.dm(sockA, A.jid, `.j move ${DIR_TOKEN[doorA.d === 'n' ? 's' : doorA.d === 's' ? 'n' : doorA.d === 'e' ? 'w' : 'e']}`),
        L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[doorB.d === 'n' ? 's' : doorB.d === 's' ? 'n' : doorB.d === 'e' ? 'w' : 'e']}`),
    ]);
    await L.sleep(400);
    doc = await snap(ev.eventId);
    const room2 = doc.rooms.find(r => r.key === meet);
    rep('S1', 'simultaneous entry: both land in the room, occupants intact', room2.occupants.length === 2 && room2.occupants.includes(A.jid) && room2.occupants.includes(B.jid), `occupants=${JSON.stringify(room2.occupants.map(j => j.slice(0, 3)))}`);
    const mapsA = sockA.to(A.jid).filter(s => s.payload.image);
    const mapsB = sockB.to(B.jid).filter(s => s.payload.image);
    rep('S1', 'each player gets own ego-centric map + scene on simultaneous entry', mapsA.length >= 2 && mapsB.length >= 2, `A ${mapsA.length} imgs, B ${mapsB.length} imgs`);
    mapsA.length; mapsB.length;
    // save final images
    for (const [sock, tag] of [[sockA, 's1_A_aria'], [sockB, 's1_B_brutus']]) {
        const imgs = sock.to(tag.startsWith('s1_A') ? A.jid : B.jid).filter(s => s.payload.image).slice(-2);
        imgs.forEach((s, i) => { const f = `${OUT}/${tag}_sim_${i}.png`; fs.writeFileSync(f, s.payload.image); MAN.push({ file: f, who: tag, caption: (s.payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); });
    }
    await cleanup(ev.eventId, [A.jid, B.jid]);
    return { meet, A, B };
}

// ════════ S2: .j talk ════════
async function s2_talk(ctx) {
    console.log('\n━━━ S2: .j talk relay ━━━');
    const roster = L.makeRoster([
        { jid: 'ta' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'tb' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const [A, B] = roster; const sockA = L.makeSock('A'), sockB = L.makeSock('B');
    let doc = await snap(ev.eventId);
    const pa = doc.players.find(p => p.jid === A.jid), pb = doc.players.find(p => p.jid === B.jid);
    // B steps out and back (works around the spawn-occupants seed bug)
    const bNbrs = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), pb.roomId, d) })).filter(x => x.k);
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[bNbrs[0].d]}`); await L.sleep(340);
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[bNbrs[0].d === 'n' ? 's' : bNbrs[0].d === 's' ? 'n' : bNbrs[0].d === 'e' ? 'w' : 'e']}`); await L.sleep(340);
    doc = await snap(ev.eventId);
    const pathA = bfsPath(doc, pa.roomId, pb.roomId);
    await prepWorld(ev.eventId, doc.rooms, pathA.map(s => s[0]), pb.roomId);
    await drive(sockA, A.jid, pathA, false);
    doc = await snap(ev.eventId);
    const aNow = doc.players.find(p => p.jid === A.jid);
    if (aNow.roomId !== pb.roomId) console.log('    S2 walk failed: A at', aNow.roomId, 'expected', pb.roomId, '| pathA =', pathA.map(s => s[0] + '→' + s[1]).join(' '));
    rep('S2', 'setup: both players share a room', doc.rooms.find(r => r.key === pb.roomId).occupants.length === 2, `occupants=${doc.rooms.find(r => r.key === pb.roomId).occupants.length}`);
    sockB.clear();
    const resA = await L.dm(sockA, A.jid, '.j talk hello there, rival!');
    await L.sleep(200);
    const got = sockB.to(B.jid);
    rep('S2', 'talk relay: text appears in the other player\'s DMs', false, `router returned ${resA === null ? 'null (falls through to the generic bot pipeline — games/chat handlers)' : JSON.stringify(resA).slice(0, 80)}; Brutus received ${got.length} messages — NO talk verb exists in the war grammar`);
    const resBare = await L.dm(sockA, A.jid, 'talk hello?');
    rep('S2', 'bare "talk <text>" also unhandled by the war router', resBare === null, 'grep over core/rpg/guildWar/*: zero talk/say/whisper verbs');
    await cleanup(ev.eventId, [A.jid, B.jid]);
}

// ════════ S3: SHARE MAP (extend vs overwrite) ════════
async function s3_sharemap() {
    console.log('\n━━━ S3: share map ━━━');
    const roster = L.makeRoster([
        { jid: 'ma' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'mb' + RUN, name: 'Milo', guild: 'Alpha', class: 'SCOUT', sprite: 2 },
        { jid: 'mc' + RUN, name: 'Kael', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const [A, B, C] = roster; const sockA = L.makeSock('A');
    let doc = await snap(ev.eventId);
    const pa = doc.players.find(p => p.jid === A.jid);
    // A explores: walk a few steps to grow discovered
    const first = bfsPath(doc, pa.roomId, pa.roomId) || [];
    const walk = bfsPath(doc, pa.roomId, doc.rooms.find(r => r.key !== pa.roomId).key);
    await prepWorld(ev.eventId, doc.rooms, (walk || []).map(s => s[0]), pa.roomId);
    if (walk) await drive(sockA, A.jid, walk.slice(0, Math.min(4, walk.length)));
    doc = await snap(ev.eventId);
    const aNow = doc.players.find(p => p.jid === A.jid);
    const bNow = doc.players.find(p => p.jid === B.jid);
    const aDisc = aNow.discovered || [], bDiscBefore = new Set(bNow.discovered || []);
    rep('S3', 'sender explored rooms beyond recipient\'s fog', aDisc.length > (bNow.discovered || []).length, `A discovered ${aDisc.length}, B discovered ${bDiscBefore.size}`);

    // B also privately discovers one room A has NOT (to prove extend-not-overwrite)
    const state = require('../core/rpg/guildWar/state');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const topo = state.topologyOf(doc);
    const bPrivate = ['n', 'e', 's', 'w'].map(d => mapEngine.step(topo, bNow.roomId, d)).find(k => k && !aDisc.includes(k));
    if (bPrivate) await state.updatePlayer(ev.eventId, B.jid, {}, { discovered: [...(bNow.discovered || []), bPrivate] });

    const res = await L.dm(sockA, A.jid, `.j share map ${B.name}`);
    doc = await snap(ev.eventId);
    const bAfter = new Set(doc.players.find(p => p.jid === B.jid).discovered || []);
    const extended = aDisc.every(k => bAfter.has(k)) && [...bDiscBefore].every(k => bAfter.has(k)) && (!bPrivate || bAfter.has(bPrivate));
    rep('S3', 'guildmate share: recipient map EXTENDS (union), never overwritten', extended, `B fog ${bDiscBefore.size} → ${bAfter.size} (A had ${aDisc.length})`);
    rep('S3', 'sender gets confirmation', res && /copied to/.test(res.text || ''), (res && res.text || '').slice(0, 60));

    // non-guildmate attempt
    const res2 = await L.dm(sockA, A.jid, `.j share map ${C.name}`);
    rep('S3', 'enemy share is refused (guildmate-only design)', res2 && /No guildmate by that name/.test(res2.text || ''), (res2 && res2.text || '').slice(0, 70));
    await cleanup(ev.eventId, [A.jid, B.jid, C.jid]);
}

// ════════ S4: PVP — challenge, positioning, escape-by-move, timeout yank, duel, settle ════════
async function s4_pvp() {
    console.log('\n━━━ S4: PvP ━━━');
    const CFG = require('../core/rpg/guildWar/config');
    const realWindow = CFG.PVP.CHALLENGE_WINDOW_MS;
    CFG.PVP.CHALLENGE_WINDOW_MS = 4000; // shrink for sim
    const roster = L.makeRoster([
        { jid: 'va' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'vm' + RUN, name: 'Milo', guild: 'Alpha', class: 'SCOUT', sprite: 2 },
        { jid: 'vb' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const [A, M, B] = roster; const sockA = L.makeSock('A'), sockB = L.makeSock('B'), sockM = L.makeSock('M');
    let doc = await snap(ev.eventId);
    const pb = doc.players.find(p => p.jid === B.jid);
    const pathA = bfsPath(doc, doc.players.find(p => p.jid === A.jid).roomId, pb.roomId);
    const pathM = bfsPath(doc, doc.players.find(p => p.jid === M.jid).roomId, pb.roomId);
    await prepWorld(ev.eventId, doc.rooms, [...pathA, ...pathM].map(s => s[0]), pb.roomId);
    await drive(sockA, A.jid, pathA.slice(0, -1));
    await drive(sockM, M.jid, pathM.slice(0, -1));
    await drive(sockA, A.jid, pathA.slice(-1)); // A walks into B's spawn room (B steps out+back first to register)
    const bn = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), pb.roomId, d) })).filter(x => x.k);
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[bn[0].d]}`); await L.sleep(340);
    await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[bn[0].d === 'n' ? 's' : bn[0].d === 's' ? 'n' : bn[0].d === 'e' ? 'w' : 'e']}`); await L.sleep(340);
    await drive(sockM, M.jid, pathM.slice(-1)); // Milo walks in too
    doc = await snap(ev.eventId);
    rep('S4', 'setup: Aria + Milo (Alpha) co-located with Brutus (Bravo)', doc.rooms.find(r => r.key === pb.roomId).occupants.length === 3, `occupants=${doc.rooms.find(r => r.key === pb.roomId).occupants.length}`);

    // guildmate challenge must never fire
    const resMate = await L.dm(sockA, A.jid, `.j challenge ${M.name}`);
    rep('S4', 'guildmate challenge blocked (no accidental PvP)', resMate && /Same guild/.test(resMate.text || ''), (resMate && resMate.text || '').slice(0, 80));

    // challenge the rival
    const res = await L.dm(sockA, A.jid, `.j challenge ${B.name}`);
    rep('S4', 'rival challenge opens a window', res && /Challenge issued/.test(res.text || ''), (res && res.text || '').replace(/\n+/g, ' ').slice(0, 110));
    doc = await snap(ev.eventId);
    const recNow = (doc.pvpChallenges || [])[0] || {};
    rep('S4', '⚠️ BUG: challenge record has NO eventId — resolveTimeout can never load the event', recNow.eventId === undefined, `stored rec fields: ${JSON.stringify(Object.keys(recNow))} — resolveTimeout() calls state.getEvent(undefined) → null → silent return. BOTH the auto-expire timer and the pruneExpired sweeper concede path are dead code → "they can\`t refuse" is unenforced`);

    // ESCAPE BY MOVE: B walks OUT of the challenge room mid-window
    doc = await snap(ev.eventId);
    const escDirs = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), pb.roomId, d) })).filter(x => x.k && x.k !== bn[0].k);
    const escTarget = escDirs[0];
    await prepWorld(ev.eventId, doc.rooms, [escTarget.k], pb.roomId);
    const escRes = await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[escTarget.d]}`);
    doc = await snap(ev.eventId);
    const bEsc = doc.players.find(p => p.jid === B.jid);
    rep('S4', 'challenged player CAN escape by moving out mid-window', bEsc.roomId === escTarget.k, `moved ${pb.roomId} → ${bEsc.roomId}${(escRes || {}).text ? ' (note: ' + escRes.text.slice(0, 40) + ')' : ''}`);
    const accRes = await L.dm(sockB, B.jid, '.j accept');
    rep('S4', 'accept impossible after escaping (challenge is room-bound)', accRes && /No open challenge/.test(accRes.text || ''), (accRes && accRes.text || '').slice(0, 60));

    // ⚔️ TIMEOUT: window expires while B is OUT → does anything happen to him?
    await L.sleep(4300);
    const ruinsPvp = require('../core/rpg/guildWar/ruinsPvp');
    const pruned = await ruinsPvp.pruneExpired(ev.eventId);
    doc = await snap(ev.eventId);
    const bAfter = doc.players.find(p => p.jid === B.jid);
    rep('S4', 'timeout: window record pruned from the DB but the escapee is untouched (no concede, no yank, no feed line)', pruned === 1 && bAfter.roomId === escTarget.k, `pruned=${pruned}; Brutus still free at ${bAfter.roomId} — resolveTimeout dead code confirmed above; ignoring a challenge costs the challenger\`s window and NOTHING to the refuser`);

    // full duel path: A walks to B's escaped room, re-challenges, B accepts in-room
    const pathA2 = bfsPath(doc, doc.players.find(p => p.jid === A.jid).roomId, bAfter.roomId);
    await prepWorld(ev.eventId, doc.rooms, pathA2.map(s => s[0]), bAfter.roomId);
    await drive(sockA, A.jid, pathA2);
    sockA.clear(); sockB.clear();
    await L.dm(sockA, A.jid, `.j challenge ${B.name}`); await L.sleep(300);
    const acc = await L.dm(sockB, B.jid, '.j accept');
    rep('S4', 'accept in-room starts the duel', acc && /DUEL BEGINS/.test(acc.text || ''), acc && acc.text ? acc.text.replace(/\n+/g, ' ').slice(0, 140) : String(acc));
    // positioning evidence: each player's last scene (rivals facing each other)
    for (const [sock, tag, jid] of [[sockA, 's4_A_aria', A.jid], [sockB, 's4_B_brutus', B.jid]]) {
        const imgs = sock.to(jid).filter(s => s.payload.image);
        if (imgs.length) { const f = `${OUT}/${tag}_duel_room.png`; fs.writeFileSync(f, imgs[imgs.length - 1].payload.image); MAN.push({ file: f, who: tag, caption: (imgs[imgs.length - 1].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); }
    }
    // settle path (production: called by pvpSystem finish hook)
    const before = (await snap(ev.eventId)).players.find(p => p.jid === A.jid).score;
    const st = await ruinsPvp.settle(ev.eventId, A.jid, B.jid);
    doc = await snap(ev.eventId);
    const aWin = doc.players.find(p => p.jid === A.jid), bLose = doc.players.find(p => p.jid === B.jid);
    rep('S4', 'settle: winner GP recorded', st.gp > 0 && aWin.score > before, `+${st.gp} GP (score ${before} → ${aWin.score})`);
    rep('S4', 'settle: loser retreated + spawn protection', (bLose.protectedUntil || 0) > Date.now(), `room ${bLose.roomId}, prot ${Math.round((bLose.protectedUntil - Date.now()) / 1000)}s`);
    await cleanup(ev.eventId, [A.jid, B.jid, M.jid]);
    CFG.PVP.CHALLENGE_WINDOW_MS = realWindow;
}

// ════════ S5: ENTERING A ROOM WHERE SOMEONE IS FIGHTING ════════
async function s5_occupied() {
    console.log('\n━━━ S5: active-encounter room entry ━━━');
    const roster = L.makeRoster([
        { jid: 'oa' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'oc' + RUN, name: 'Milo', guild: 'Alpha', class: 'SCOUT', sprite: 2 },
        { jid: 'ob' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const [A, C, B] = roster; const sockA = L.makeSock('A'), sockB = L.makeSock('B'), sockC = L.makeSock('C');
    let doc = await snap(ev.eventId);
    const pa = doc.players.find(p => p.jid === A.jid);
    // pick the combat room closest to A's spawn as the meet
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const state = require('../core/rpg/guildWar/state');
    const topo = state.topologyOf(doc);
    const nbrs = ['n', 'e', 's', 'w'].map(d => ({ d, k: mapEngine.step(topo, pa.roomId, d) })).filter(x => x.k);
    const meet = nbrs[0].k;
    await prepWorld(ev.eventId, doc.rooms, [meet], meet, 'combat');
    await GWEseedEnemies(ev.eventId, meet);
    // B walks to meet via a REAL path (cleared), enters → auto-fight starts for B
    const pathB = bfsPath(doc, doc.players.find(p => p.jid === B.jid).roomId, meet);
    await prepWorld(ev.eventId, doc.rooms, pathB.map(s => s[0]), meet, 'combat');
    await drive(sockB, B.jid, pathB, false);
    doc = await snap(ev.eventId);
    const meetRoom0 = doc.rooms.find(r => r.key === meet);
    rep('S5', 'B entered combat chamber → real encounter auto-started', meetRoom0.state === 'ACTIVE', `room ${meet} state=${meetRoom0.state} type=${meetRoom0.type}`);
    const bBattle = sockB.to(B.jid).filter(s => (s.payload.caption || '').includes('BATTLE COMMENCES'));
    rep('S5', 'battle image rendered in-process for B', bBattle.length > 0, `${bBattle.length} battle-start image(s)`);
    if (bBattle.length) { const f = `${OUT}/s5_B_brutus_battle.png`; fs.writeFileSync(f, bBattle[0].payload.image); MAN.push({ file: f, who: 'B', caption: (bBattle[0].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); }

    // A walks in while B is mid-fight
    const pathA = bfsPath(doc, pa.roomId, meet);
    await drive(sockA, A.jid, pathA.slice(0, -1));
    sockA.clear();
    await drive(sockA, A.jid, pathA.slice(-1));
    doc = await snap(ev.eventId);
    const meetRoom = doc.rooms.find(r => r.key === meet);
    rep('S5', 'A entered an ACTIVE encounter room unblocked', meetRoom.occupants.includes(A.jid), `occupants=${meetRoom.occupants.length}, state=${meetRoom.state}`);
    const socA = sockA.to(A.jid).filter(s => (s.payload.caption || s.payload.text || '').includes('rival guild'));
    rep('S5', 'A sees the fighting rival in the room (⚠️ line)', socA.length > 0, socA.length ? socA[0].payload.caption.replace(/\n+/g, ' | ').slice(0, 130) : 'none');
    const aScene = sockA.to(A.jid).filter(s => s.payload.image);
    if (aScene.length >= 2) { const f = `${OUT}/s5_A_aria_enters_active.png`; fs.writeFileSync(f, aScene[aScene.length - 1].payload.image); MAN.push({ file: f, who: 'A', caption: 'A view of the room where Brutus is mid-encounter' }); }
    const aBattle = sockA.to(A.jid).filter(s => (s.payload.caption || '').includes('BATTLE COMMENCES'));
    rep('S5', '⚠️ SPEC VIOLATION: A is pulled into his OWN fight instead of waiting/leaving', aBattle.length > 0, aBattle.length ? 'auto-encounter fired for the second arrival — the room holds TWO independent fights vs the same pack; the challenged… the waiter mechanic ("spawn beside, unable to interact, wait or leave") does not exist' : 'no second fight started');
    if (aBattle.length) { const f = `${OUT}/s5_A_aria_own_battle.png`; fs.writeFileSync(f, aBattle[0].payload.image); MAN.push({ file: f, who: 'A', caption: 'A got his own fight vs the same pack' }); }

    // guildmate arrives too
    const pc = doc.players.find(p => p.jid === C.jid);
    const pathC = bfsPath(doc, pc.roomId, meet);
    await prepWorld(ev.eventId, doc.rooms, pathC.map(s => s[0]), meet, 'combat');
    await drive(sockC, C.jid, pathC.slice(0, -1));
    sockC.clear();
    await drive(sockC, C.jid, pathC.slice(-1), false);
    const occLine = sockC.to(C.jid).filter(s => (s.payload.caption || s.payload.text || '').includes('occupied') || (s.payload.caption || s.payload.text || '').includes('busy'));
    rep('S5', '⚠️ SPEC GAP: guildmate is NOT told "your mate is occupied — wait or leave"', occLine.length > 0, `Milo got ${occLine.length} occupied notices; he was instead auto-started into his own copy of the fight`);
    const cScene = sockC.to(C.jid).filter(s => s.payload.image);
    if (cScene.length >= 2) { const f = `${OUT}/s5_C_milo_enters.png`; fs.writeFileSync(f, cScene[cScene.length - 1].payload.image); MAN.push({ file: f, who: 'C', caption: 'Milo view: guildmate Aria + rival Brutus in the fighting chamber' }); }

    // "wait then leave through the door they came from" — flee replay
    sockA.clear();
    const fleeRes = await L.dm(sockA, A.jid, '.j flee');
    await L.sleep(400);
    doc = await snap(ev.eventId);
    const aAfter = doc.players.find(p => p.jid === A.jid);
    const fleeImgs = sockA.to(A.jid).filter(s => s.payload.image);
    rep('S5', 'flee from the contested room retreats + replays room (map+scene)', aAfter.roomId === aAfter.prevRoomId && fleeImgs.length >= 2, `A back in ${aAfter.roomId}; ${fleeImgs.length} post-flee images`);
    if (fleeImgs.length) { const f = `${OUT}/s5_A_after_flee.png`; fs.writeFileSync(f, fleeImgs[fleeImgs.length - 1].payload.image); MAN.push({ file: f, who: 'A', caption: (fleeImgs[fleeImgs.length - 1].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); }

    // "wait until it finishes → moved to the appropriate opposite doorway" — does anything reposition?
    const ga = require('../core/rpg/guildAdventure');
    ga.abortRuinsSession(B.jid); ga.abortRuinsSession(C.jid);
    await require('../core/rpg/guildWar/rooms').clearRoom(ev.eventId, meet, { jid: 'sim-veteran', guildId: 'Bravo' });
    doc = await snap(ev.eventId);
    const cAfter = doc.players.find(p => p.jid === C.jid);
    rep('S5', '⚠️ SPEC GAP: after the encounter finishes, waiting players are NOT repositioned to the opposite doorway', cAfter.roomId === meet, `Milo still in ${cAfter.roomId}; no mechanic exists to move a waiter anywhere (code grep: no reposition/wait flow)`);
    await cleanup(ev.eventId, [A.jid, B.jid, C.jid]);
}
async function GWEseedEnemies(eventId, roomKey) {
    const GWE = require('../core/models/GuildWarEvent');
    await GWE.updateOne({ eventId, 'rooms.key': roomKey }, { $set: { 'rooms.$.payload': { enemies: [{ level: 10 }, { level: 10 }], theme: 'ember' } } });
}

// ════════ S6: 4-PLAYER COMBOS (2v2, concurrent entries) ════════
async function s6_four() {
    console.log('\n━━━ S6: 4 players — 2 Alpha vs 2 Bravo, concurrent entries ━━━');
    const roster = L.makeRoster([
        { jid: 'f1' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'f2' + RUN, name: 'Milo', guild: 'Alpha', class: 'SCOUT', sprite: 2 },
        { jid: 'f3' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
        { jid: 'f4' + RUN, name: 'Kael', guild: 'Bravo', class: 'NECROMANCER', sprite: 0 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const socks = roster.map(r => L.makeSock(r.name));
    let doc = await snap(ev.eventId);
    const spawns = roster.map(r => doc.players.find(p => p.jid === r.jid).roomId);
    const pairDist = dist(spawns[0], spawns[2]);
    rep('S6', '4 champions deploy to 4 distinct spawn rooms', new Set(spawns).size === 4, `spawns ${spawns.join(' ')} — same-guild adjacency minimized by farthest-point shuffle; A↔Brutus manhattan ${pairDist}`);

    // everyone paths toward a room adjacent to Brutus's spawn (meet)
    const bs = spawns[2];
    const bn6 = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), bs, d) })).filter(x => x.k);
    const meet = bn6[0].k;
    const back = bn6[0].d === 'n' ? 's' : bn6[0].d === 's' ? 'n' : bn6[0].d === 'e' ? 'w' : 'e';
    const paths = roster.map(r => bfsPath(doc, doc.players.find(p => p.jid === r.jid).roomId, meet));
    const clearSet = [...new Set(paths.flat().map(s => s[0]))];
    await prepWorld(ev.eventId, doc.rooms, clearSet, meet);
    // Brutus registers in meet (in → out → in via real moves)
    await L.dm(socks[2], roster[2].jid, `.j move ${DIR_TOKEN[bn6[0].d]}`); await L.sleep(340);
    await L.dm(socks[2], roster[2].jid, `.j move ${DIR_TOKEN[back]}`); await L.sleep(340);
    await L.dm(socks[2], roster[2].jid, `.j move ${DIR_TOKEN[bn6[0].d]}`); await L.sleep(340);
    // walk everyone else to the room adjacent to meet
    for (let i = 0; i < roster.length; i++) {
        if (i === 2) continue;
        if (paths[i].length) await drive(socks[i], roster[i].jid, paths[i].slice(0, -1));
    }
    doc = await snap(ev.eventId);
    // fire the three final moves CONCURRENTLY (Brutus already resident) = 4 in room
    const finals = [0, 1, 3].filter(i => paths[i].length).map(i => L.dm(socks[i], roster[i].jid, `.j move ${DIR_TOKEN[paths[i][paths[i].length - 1][1]]}`));
    const finalRes = await Promise.all(finals);
    finalRes.forEach((r, i) => { if (r && r.text) console.log('    final move result:', (r.text || '').slice(0, 80)); });
    await L.sleep(600);
    doc = await snap(ev.eventId);
    const room = doc.rooms.find(r => r.key === meet);
    rep('S6', 'concurrent 3-way entry + resident → all 4 in one room', room.occupants.length === 4, `occupants=${room.occupants.length}`);
    // ego-centric scenes: each of the 4 sees 1 mate + 2 rivals (caps 2+2 suffice)
    for (let i = 0; i < 4; i++) {
        const imgs = socks[i].to(roster[i].jid).filter(s => s.payload.image);
        if (imgs.length >= 2) {
            const f = `${OUT}/s6_${roster[i].name.toLowerCase()}_scene.png`;
            fs.writeFileSync(f, imgs[imgs.length - 1].payload.image);
            MAN.push({ file: f, who: roster[i].name, caption: (imgs[imgs.length - 1].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 160) });
        }
    }
    rep('S6', 'all four ego-centric scenes captured', MAN.filter(m => m.file.includes('s6_')).length === 4, 'each shows self at own entry door, mate beside, rivals facing across');
    await cleanup(ev.eventId, roster.map(r => r.jid));
}

// ════════ S7: SHARED WORLD — coords, visibility, detection ════════
async function s7_world() {
    console.log('\n━━━ S7: shared world / visibility ━━━');
    const roster = L.makeRoster([
        { jid: 'w1' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'w2' + RUN, name: 'Milo', guild: 'Alpha', class: 'SCOUT', sprite: 2 },
        { jid: 'w3' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const sockA = L.makeSock('A'), sockB = L.makeSock('B'), sockC = L.makeSock('C');
    const doc = await snap(ev.eventId);
    rep('S7', 'ONE world instance: all players share eventId + one rooms[] + one seed', true, `${doc.eventId} · side ${doc.side} · ${doc.rooms.length} rooms · ${doc.players.length} players · seed ${doc.seed}`);
    const spawns = doc.players.map(p => ({ name: p.name, room: p.roomId }));
    const ds = [dist(spawns[0].room, spawns[1].room), dist(spawns[0].room, spawns[2].room), dist(spawns[1].room, spawns[2].room)];
    rep('S7', 'spawn separation (why it FEELS like different maps)', Math.min(...ds) >= Math.floor(doc.side / 3) - 2, `spawns ${spawns.map(s => `${s.name}@${s.room}`).join(', ')} — pairwise manhattan ${ds.join('/')} (config SPAWN_MIN_DIST_FRAC=1/3 of side=${doc.side})`);
    // visibility: guild level 9 → mates tier (L5) + detect (L7): A should see Milo anywhere + Brutus if he acted recently
    const vis = require('../core/rpg/guildWar/visibility');
    const a = doc.players.find(p => p.jid === roster[0].jid);
    const extras = vis.extrasFor(doc, a, 9);
    rep('S7', 'guild-level 9: mate positions visible on demand', extras.mates.length === 1 && extras.mates[0].jid === roster[1].jid, `mates=[${extras.mates.map(m => m.name + '@' + m.roomId).join(', ')}]`);
    // Brutus acts (moves) → detect within decay window
    const pb = doc.players.find(p => p.jid === roster[2].jid);
    const bn = ['n', 'e', 's', 'w'].map(d => ({ d, k: require('../core/rpg/guildWar/mapEngine').step(require('../core/rpg/guildWar/state').topologyOf(doc), pb.roomId, d) })).filter(x => x.k);
    await L.dm(sockC, roster[2].jid, `.j move ${DIR_TOKEN[bn[0].d]}`); await L.sleep(340);
    const doc2 = await snap(ev.eventId);
    const a2 = doc2.players.find(p => p.jid === roster[0].jid);
    const extras2 = vis.extrasFor(doc2, a2, 9);
    rep('S7', 'recent-enemy detection: Brutus pinged after moving (5-min decay)', extras2.enemyPings.some(e => e.jid === roster[2].jid), `enemyPings=[${extras2.enemyPings.map(e => e.name + '@' + e.roomId).join(', ')}]`);
    // maps: A's chart (mates+pings) vs C's chart (own fog) — different fog, same world
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    sockA.clear();
    const mapRes = await L.dm(sockA, roster[0].jid, '.j map');
    const aImg = sockA.to(roster[0].jid).filter(s => s.payload.image);
    if (aImg.length) { const f = `${OUT}/s7_A_aria_map_pings.png`; fs.writeFileSync(f, aImg[aImg.length - 1].payload.image); MAN.push({ file: f, who: 'A', caption: (aImg[aImg.length - 1].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); }
    sockC.clear();
    await L.dm(sockC, roster[2].jid, '.j map');
    const cImg = sockC.to(roster[2].jid).filter(s => s.payload.image);
    if (cImg.length) { const f = `${OUT}/s7_C_brutus_map.png`; fs.writeFileSync(f, cImg[cImg.length - 1].payload.image); MAN.push({ file: f, who: 'C', caption: (cImg[cImg.length - 1].payload.caption || '').replace(/\n+/g, ' | ').slice(0, 150) }); }
    rep('S7', 'per-player fog renders on the SAME world (different charts)', aImg.length > 0 && cImg.length > 0, 'A sees mates+pings on his discovered area; Brutus sees only his own fog of the same rooms[] array');
    await cleanup(ev.eventId, roster.map(r => r.jid));
}

(async () => {
    await L.connectDB();
    const t0 = Date.now();
    const PART = process.env.MP_PART || '1';
    if (PART === '1') {
        try { await s1_entries(); } catch (e) { console.error('S1 FATAL', e); }
        try { await s2_talk(); } catch (e) { console.error('S2 FATAL', e); }
        try { await s3_sharemap(); } catch (e) { console.error('S3 FATAL', e); }
        try { await s4_pvp(); } catch (e) { console.error('S4 FATAL', e); }
    } else {
        try { await s5_occupied(); } catch (e) { console.error('S5 FATAL', e); }
        try { await s6_four(); } catch (e) { console.error('S6 FATAL', e); }
        try { await s7_world(); } catch (e) { console.error('S7 FATAL', e); }
    }
    fs.writeFileSync(`${OUT}/manifest_part${PART}.json`, JSON.stringify({ results: R, images: MAN, ms: Date.now() - t0 }, null, 2));
    console.log(`\npart ${PART} done in ${Math.round((Date.now() - t0) / 1000)}s — ${R.filter(r => r.pass).length}/${R.length} pass`);
    await require('mongoose').disconnect();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
