'use strict';
// check_kingdom40.js — Task 40 audit of the GUILD v7 KINGDOM layout
// (pure-node replication of guildBaseRenderer constants; renderer stays
// canvas-free to require). Checks: bounds / overlaps / court containment /
// lane frontage for every plot + training + cottages / ASCII map.
const N = 28;

const GUILD_STRUCTS = {
    hall: { id: 'hall', fw: 4, fh: 4, x: 12, y: 12 },
    training: { id: 'training', fw: 3, fh: 3, x: 23, y: 17 },
    treasury: { id: 'treasury', fw: 2, fh: 2, x: 9, y: 16 },
};
const GUILD_PLOTS = [
    { id: 1, x: 3, y: 3 },
    { id: 2, x: 2, y: 10 },
    { id: 3, x: 4, y: 22 },
    { id: 4, x: 12, y: 20 },
    { id: 5, x: 23, y: 12 },
];
const COURT = { x0: 9, y0: 9, x1: 18, y1: 18 };
const COTTAGE_SLOTS = [[12, 24], [16, 24], [10, 26], [14, 26], [18, 25]];
const ALLEE = [[6, 13], [8, 13], [9, 13], [3, 16], [5, 16]];

function stair(a, b) {
    const out = [];
    let [x, y] = a;
    out.push([x, y]);
    while (x !== b[0] || y !== b[1]) {
        const dx = Math.sign(b[0] - x), dy = Math.sign(b[1] - y);
        if (dx && dy) { x += dx; out.push([x, y]); y += dy; out.push([x, y]); }
        else if (dx) { x += dx; out.push([x, y]); }
        else { y += dy; out.push([x, y]); }
    }
    return out;
}
const PATHS = [
    ...stair([0, 14], [8, 14]),
    ...stair([0, 15], [8, 15]),
    ...stair([10, 10], [6, 6]), [6, 5],
    [4, 13],
    ...stair([10, 18], [6, 21]),
    [13, 18], [13, 19],
    ...stair([14, 18], [16, 23]),
    ...stair([18, 11], [22, 11]), [22, 12],
    [17, 18], ...stair([18, 18], [22, 18]),
].filter((c, i, arr) => arr.findIndex((d) => d[0] === c[0] && d[1] === c[1]) === i);

const PLAZA = new Set();
for (let x = COURT.x0; x <= COURT.x1; x++) for (let y = COURT.y0; y <= COURT.y1; y++) PLAZA.add(`${x},${y}`);

let fails = 0;
function ok(cond, label) {
    console.log(`${cond ? '  OK ' : 'FAIL '} ${label}`);
    if (!cond) fails++;
}
const key = (x, y) => `${x},${y}`;
const pathSet = new Set(PATHS.map(([x, y]) => key(x, y)));
const foot = (s) => { const c = []; for (let x = s.x; x < s.x + s.fw; x++) for (let y = s.y; y < s.y + s.fh; y++) c.push(key(x, y)); return c; };

console.log('== bounds ==');
for (const [x, y] of PATHS) ok(x >= 0 && y >= 0 && x < N && y < N, `path cell ${x},${y} in bounds`);
for (const st of Object.values(GUILD_STRUCTS)) ok(st.x >= 0 && st.y >= 0 && st.x + st.fw <= N && st.y + st.fh <= N, `${st.id} footprint in bounds`);

console.log('== court containment ==');
for (const c of foot(GUILD_STRUCTS.hall)) ok(PLAZA.has(c), `castle cell ${c} on the court`);
for (const c of foot(GUILD_STRUCTS.treasury)) ok(PLAZA.has(c), `treasury cell ${c} on the court`);
ok(!PLAZA.has(key(GUILD_STRUCTS.training.x, GUILD_STRUCTS.training.y)), 'training off the court');

console.log('== overlaps ==');
const structCells = new Map();
for (const st of Object.values(GUILD_STRUCTS)) for (const c of foot(st)) structCells.set(c, st.id);
ok(structCells.size === 16 + 9 + 4, `no struct-struct overlap (${structCells.size} cells)`);
for (const [x, y] of PATHS) {
    if (PLAZA.has(key(x, y))) continue; // lanes may start on the court stone
    ok(!structCells.has(key(x, y)), `lane ${x},${y} clear of structs`);
    for (const p of GUILD_PLOTS) ok(!(x >= p.x && x < p.x + 3 && y >= p.y && y < p.y + 3), `lane ${x},${y} clear of plot ${p.id}`);
    for (const [cx2, cy2] of COTTAGE_SLOTS) ok(!(x === cx2 && y === cy2), `lane ${x},${y} clear of cottage ${cx2},${cy2}`);
}
// castle front clearcut (hall.x-2..+6, hall.y+5..+8) must not swallow a lane junction badly — informational
console.log('== frontage (each plot/training touches a lane edge) ==');
for (const p of GUILD_PLOTS) {
    let touch = false;
    for (let x = p.x; x < p.x + 3 && !touch; x++) for (let y = p.y; y < p.y + 3 && !touch; y++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (pathSet.has(key(x + dx, y + dy)) || PLAZA.has(key(x + dx, y + dy))) { touch = true; break; }
    }
    ok(touch, `plot ${p.id} (${p.x},${p.y}) fronts a lane/court`);
}
{
    const t = GUILD_STRUCTS.training;
    let touch = false;
    for (let x = t.x; x < t.x + t.fw && !touch; x++) for (let y = t.y; y < t.y + t.fh && !touch; y++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (pathSet.has(key(x + dx, y + dy))) { touch = true; break; }
    }
    ok(touch, 'training yard fronts the SE lane');
}
{
    // avenue connectivity: west fence → court
    let linked = false;
    for (let x = 0; x < 10; x++) if (pathSet.has(key(x, 14)) && pathSet.has(key(x, 15))) { linked = true; break; }
    ok(linked, 'grand avenue runs gate → court');
    ok(pathSet.has(key(8, 14)) && pathSet.has(key(8, 15)) && PLAZA.has(key(9, 14)) && PLAZA.has(key(9, 15)), 'avenue abuts the court west face');
}
{
    // hamlet lane reaches the cottage rows
    ok(pathSet.has(key(16, 23)), 'hamlet lane reaches the cottage rows');
    let any = false;
    for (const [cx2, cy2] of COTTAGE_SLOTS) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (pathSet.has(key(cx2 + dx, cy2 + dy))) { any = true; break; }
    }
    ok(any, 'a cottage fronts the hamlet lane');
}

console.log('== ASCII (0..27; # lane, O court, C castle, T treasury, Y training, 1-5 plots, c cottage, A allee) ==');
const rows = [];
for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
        const k = key(x, y);
        let ch = null;
        for (const [ax, ay] of ALLEE) if (ax === x && ay === y) ch = 'A';
        for (const p of GUILD_PLOTS) if (x >= p.x && x < p.x + 3 && y >= p.y && y < p.y + 3) ch = String(p.id);
        for (const [cx2, cy2] of COTTAGE_SLOTS) if (cx2 === x && cy2 === y) ch = 'c';
        if (x >= GUILD_STRUCTS.training.x && x < GUILD_STRUCTS.training.x + 3 && y >= GUILD_STRUCTS.training.y && y < GUILD_STRUCTS.training.y + 3) ch = 'Y';
        if (x >= GUILD_STRUCTS.treasury.x && x < GUILD_STRUCTS.treasury.x + 2 && y >= GUILD_STRUCTS.treasury.y && y < GUILD_STRUCTS.treasury.y + 2) ch = 'T';
        if (x >= GUILD_STRUCTS.hall.x && x < GUILD_STRUCTS.hall.x + 4 && y >= GUILD_STRUCTS.hall.y && y < GUILD_STRUCTS.hall.y + 4) ch = 'C';
        if (PLAZA.has(k) && !ch) ch = 'O';
        if (pathSet.has(k) && !ch) ch = '#';
        row += ch || '.';
    }
    rows.push(row);
}
console.log(rows.join('\n'));
console.log(fails === 0 ? `\nALL GREEN (${fails} failures)` : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
