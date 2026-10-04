// Visual QA: landscape map in both styles (explore + return).
process.env.GW_TEST = '1';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'qa_out');
fs.mkdirSync(OUT, { recursive: true });

function fakeEvent(side) {
    const rooms = [];
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        rooms.push({ key: `${x},${y}`, x, y, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: +(Math.hypot(x - side / 2, y - side / 2) / (side / 2)).toFixed(2) });
    }
    rooms.find((r) => r.key === `${Math.floor(side / 2)},${Math.floor(side / 2)}`).type = 'core';
    const types = ['combat', 'puzzle', 'discovery', 'reward', 'hazard', 'lore', 'secret', 'landmark', 'anomaly'];
    let i = 0;
    for (const r of rooms) if (r.type === 'empty' && (i++ % 3 === 0)) r.type = types[i % types.length];
    const edges = [];
    for (const r of rooms) {
        const [x, y] = r.key.split(',').map(Number);
        if (x + 1 < side && (x + y) % 5 !== 0) edges.push(`${r.key}|e`);
        if (y + 1 < side && (x * y) % 4 !== 0) edges.push(`${r.key}|s`);
    }
    const marked = rooms.filter((r) => r.x < 3 && r.y < 3).map((r) => { r.state = 'CLEARED'; return r; });
    rooms.find((r) => r.key === '2,2').state = 'ACTIVE';
    void marked;
    return {
        eventId: 'qa', seed: 'qa', side, rooms, edges, coreKey: `${Math.floor(side / 2)},${Math.floor(side / 2)}`,
        deadWorld: 'ember', type: 'normal', state: 'ACTIVE', endsAt: Date.now() + 42 * 60000, players: [],
    };
}

async function main() {
    const renderer = require('../core/rpg/guildWar/mapRenderer');
    const ev = fakeEvent(12);
    const player = {
        jid: 'qa@x', name: 'QA', guildName: 'Iron Vanguards', score: 145, lives: 2,
        roomId: '2,2', discovered: ev.rooms.filter((r) => r.x < 4 && r.y < 4).map((r) => r.key),
        relics: [{ name: 'Ember Seal', tier: 'Rare' }],
    };
    const explore = await renderer.renderRuinsMap(ev, player, { title: 'Charted Reaches', ring: 0.4, mates: [{ roomId: '3,3' }], enemyPings: [{ roomId: '1,3' }], style: 'explore' });
    fs.writeFileSync(path.join(OUT, 'map_explore.png'), explore);
    const ret = await renderer.renderRuinsMap(ev, player, { title: 'Charted Reaches', ring: 0.4, style: 'return' });
    fs.writeFileSync(path.join(OUT, 'map_return.png'), ret);
    // big-map legibility (alignment scale)
    const big = await renderer.renderRuinsMap(fakeEvent(30), { ...player, discovered: ev.rooms.filter((r) => r.x < 6 && r.y < 6).map((r) => r.key) }, { title: 'Alignment Reach', ring: 0.7, style: 'explore' });
    fs.writeFileSync(path.join(OUT, 'map_big.png'), big);
    console.log('done');
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
