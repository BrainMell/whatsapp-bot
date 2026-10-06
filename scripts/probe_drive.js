// focused probe: why does B's meet-drive fail?
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300';
process.env.GW_NORMAL_DURATION_MS = '75000';
const L = require('./mp_lib');
const RUN = Math.random().toString(36).slice(2, 6);
const state = require('../core/rpg/guildWar/state');
const mapEngine = require('../core/rpg/guildWar/mapEngine');
const GWE = require('../core/models/GuildWarEvent');
const DIR_TOKEN = { n: 'north', e: 'east', s: 'south', w: 'west' };

function bfsPath(doc, from, to) {
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

(async () => {
    await L.connectDB();
    await GWE.deleteMany({}).catch(() => {});
    const roster = L.makeRoster([
        { jid: 'p1' + RUN, name: 'Aria', guild: 'G' + RUN, class: 'FIGHTER', sprite: 0 },
        { jid: 'p2' + RUN, name: 'Boro', guild: 'G' + RUN, class: 'CLERIC', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const [A, B] = roster;
    const sockA = L.makeSock('A'), sockB = L.makeSock('B');
    const ev = await L.startWar(roster);
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const pa = doc.players.find((p) => p.jid === A.jid);
    const pb = doc.players.find((p) => p.jid === B.jid);
    console.log('A spawn', pa.roomId, '| B spawn', pb.roomId);
    const path = bfsPath(doc, pb.roomId, pa.roomId);
    console.log('path:', JSON.stringify(path));
    for (const [roomKey, dir] of path) {
        const res = await L.dm(sockB, B.jid, `.j move ${DIR_TOKEN[dir]}`);
        const t = (res && res.text || '');
        console.log(`move ${dir} (from ${roomKey}) → [${(res && res.image) ? 'IMG' : 'txt'}] ${t.slice(0, 100)}`);
        doc = await state.getEvent(ev.eventId, { fresh: true });
        const row = doc.players.find((p) => p.jid === B.jid);
        console.log('   B now at', row.roomId);
        if (row.roomId === pa.roomId) { console.log('ARRIVED'); break; }
        await L.sleep(400);
    }
    doc = await state.getEvent(ev.eventId, { fresh: true });
    const room = doc.rooms.find((r) => r.key === pa.roomId);
    console.log('dest occupants:', room.occupants, 'A row:', doc.players.find((p) => p.jid === A.jid).roomId);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
