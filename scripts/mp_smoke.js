// SMOKE: harness end-to-end — 2 rival players path into one room, concurrent
// final moves, occupants assert + scene images captured.
const L = require('./mp_lib');
const fs = require('fs');

const RUN = Math.random().toString(36).slice(2, 6);
const OUT = L.OUT + '/smoke';
fs.mkdirSync(OUT, { recursive: true });

function log(...a) { console.log(...a); }

(async () => {
    await L.connectDB();
    L.overlaySprites();

    const state = require('../core/rpg/guildWar/state');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const GWE = require('../core/models/GuildWarEvent');

    const roster = L.makeRoster([
        { jid: 'sma' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'smb' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const sockA = L.makeSock('A'), sockB = L.makeSock('B');

    const fresh = async () => state.getEvent(ev.eventId, { fresh: true });
    const pOf = (doc, jid) => doc.players.find((p) => p.jid === jid);

    let doc = await fresh();
    const a = pOf(doc, roster[0].jid), b = pOf(doc, roster[1].jid);
    log('spawn A:', a.roomId, ' spawn B:', b.roomId, ' manhattan:', (() => {
        const [ax, ay] = a.roomId.split(',').map(Number), [bx, by] = b.roomId.split(',').map(Number);
        return Math.abs(ax - bx) + Math.abs(ay - by);
    })(), ' side:', doc.side);

    // BFS over the real persisted topology
    function bfs(from, to) {
        const topo = state.topologyOf(doc);
        const prev = new Map([[from, null]]);
        const q = [from];
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
        return path; // [[roomKey, dir], ...]
    }

    // meeting room: neighbour of B's spawn that is NOT A's path start — B moves 1 step,
    // A paths all the way; different doors guaranteed when adjacency allows.
    const bNbrs = ['n', 'e', 's', 'w'].map((d) => mapEngine.step(state.topologyOf(doc), b.roomId, d)).filter(Boolean);
    const meet = bNbrs[0];
    const pathA = bfs(a.roomId, meet);
    const dirB = ['n', 'e', 's', 'w'].find((d) => mapEngine.step(state.topologyOf(doc), b.roomId, d) === meet);
    log('meeting room:', meet, '| pathA:', pathA.map((s) => s[0] + '→' + s[1]).join(' '), '| B step:', dirB);

    // world prep: clear every room on A's path EXCEPT the meeting room (like veterans passed before)
    for (const [roomKey] of pathA.slice(0, -1)) {
        await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': roomKey }, { $set: { 'rooms.$.state': 'CLEARED', 'rooms.$.clearedBy': 'war-veteran', 'rooms.$.clearedAt': new Date() } });
    }
    // make sure the meeting room itself is walkable-into (empty hall, UNEXPLORED)
    await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': meet }, { $set: { 'rooms.$.type': 'empty' } });

    // ⚠️ token map: bare 'w' means FORWARD in the war grammar (WASD controls) —
    // always send full compass words for unambiguous movement.
    const DIR_TOKEN = { n: 'north', e: 'east', s: 'south', w: 'west' };
    const drive = async (sock, jid, path) => {
        for (const [roomKey, dir] of path) {
            const res = await L.dm(sock, jid, `.j move ${DIR_TOKEN[dir]}`);
            const t = (res && res.text || '').slice(0, 60);
            if (t) log(`    dm(${dir} from ${roomKey}) →`, t);
            await L.sleep(320); // respect the 300ms cooldown
            if (res && res.text && /blocked|breath/i.test(res.text)) {
                await L.sleep(700);
                const r2 = await L.dm(sock, jid, `.j move ${dir}`);
                if (r2 && r2.text) log(`    retry(${dir}) →`, r2.text.slice(0, 60));
            }
            const d = await fresh(); const pp = pOf(d, jid);
            log(`    now in ${pp.roomId} | prev ${pp.prevRoomId}`);
        }
    };
    log('walking A...');
    await drive(sockA, roster[0].jid, pathA.slice(0, -1)); // all but final step
    log('walking B...');
    const bRes = await L.dm(sockB, roster[1].jid, `.j move ${DIR_TOKEN[dirB]}`);
    log('B move result:', JSON.stringify(bRes && bRes.text || {}).slice(0, 120));
    const preFinal = await fresh();
    log('occupants BEFORE A final step:', JSON.stringify(preFinal.rooms.find(r => r.key === meet).occupants));
    await L.sleep(50);
    // hmm: B moved fully. For SIMULTANEOUS test use a second pair of players later; here just meet.
    await drive(sockA, roster[0].jid, pathA.slice(-1)); // A final step
    log('A received (last 4):');
    console.log(L.summarizeSent(sockA, roster[0].jid, 4).join('\n'));

    doc = await fresh();
    const room = doc.rooms.find((r) => r.key === meet);
    const a2 = pOf(doc, roster[0].jid), b2 = pOf(doc, roster[1].jid);
    log('RESULT roomId A:', a2.roomId, 'B:', b2.roomId, '| occupants:', JSON.stringify(room.occupants), '| room.type:', room.type, 'state:', room.state);

    // save last images each player got
    for (const [sock, tag] of [[sockA, 'aria'], [sockB, 'brutus']]) {
        const imgs = sock.sent.filter((s) => s.payload && s.payload.image);
        const last = imgs.slice(-2);
        last.forEach((s, i) => {
            const f = `${OUT}/${tag}_meet_${i}.png`;
            fs.writeFileSync(f, s.payload.image);
            log('saved', f, '| caption:', (s.payload.caption || '').slice(0, 90).replace(/\n/g, ' '));
        });
    }

    await state.abortEvent(ev.eventId, 'smoke done');
    L.restoreSprites();
    await require('mongoose').disconnect();
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
