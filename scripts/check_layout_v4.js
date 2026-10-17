'use strict';
// check_layout_v4.js — pure-node collision + orientation audit of LAYOUT v4
const path = require('path');
const R = require('../core/rpg/homesteadBaseRenderer');
const L = R.LAYOUT;
const structures = require('../core/rpgasset/homestead/structures.json').structures;
const defOf = (t) => structures.find((s) => s.id === t);

const N = L.N;
const paths = new Set(L.paths.map(([x, y]) => `${x},${y}`));
const fixed = [
    ['house', L.house], ['mines', L.mines], ['pond', L.pond], ['hunting', L.hunting],
];
const PLOTS = [{ id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 }];
const demo = [
    ['blacksmith', 8, 1], ['medbay', 13, 7], ['alchemy', 4, 5],
];

let fails = 0;
const fail = (m) => { console.log('FAIL', m); fails++; };
const cells = (x, y, fw, fh) => {
    const out = [];
    for (let ix = 0; ix < fw; ix++) for (let iy = 0; iy < fh; iy++) out.push(`${x + ix},${y + iy}`);
    return out;
};

// 1. bounds
for (const [t, a] of fixed) {
    for (const c of cells(a.x, a.y, a.fw, a.fh)) {
        const [x, y] = c.split(',').map(Number);
        if (x < 0 || y < 0 || x >= N || y >= N) fail(`${t} out of bounds at ${c}`);
    }
}
for (const p of PLOTS) {
    for (const c of cells(p.x, p.y, 3, 3)) {
        const [x, y] = c.split(',').map(Number);
        if (x < 0 || y < 0 || x >= N || y >= N) fail(`plot ${p.id} out of bounds at ${c}`);
    }
}

// 2. structure x plot overlap (fixed footprints must never sit on a plot)
for (const [t, a] of fixed) {
    const sc = new Set(cells(a.x, a.y, a.fw, a.fh));
    for (const p of PLOTS) {
        const hit = cells(p.x, p.y, 3, 3).filter((c) => sc.has(c));
        if (hit.length) fail(`${t} overlaps plot ${p.id} at ${hit.join(' ')}`);
    }
}
// demo builds vs fixed + each other
const allB = [...fixed.map(([t, a]) => [t, a.x, a.y, a.fw, a.fh]), ...demo.map(([t, x, y]) => {
    const d = defOf(t); return [t, x, y, d.fw, d.fh];
})];
for (let i = 0; i < allB.length; i++) for (let j = i + 1; j < allB.length; j++) {
    const [t1, x1, y1, w1, h1] = allB[i], [t2, x2, y2, w2, h2] = allB[j];
    const s1 = new Set(cells(x1, y1, w1, h1));
    const hit = cells(x2, y2, w2, h2).filter((c) => s1.has(c));
    if (hit.length) fail(`${t1} x ${t2} overlap at ${hit.join(' ')}`);
}

// 3. structure x path overlap — ALLOWED only for the gatehouse (street
// passes through its arch); anything else overlapping a path cell fails.
for (const [t, x, y, w, h] of allB) {
    const sc = new Set(cells(x, y, w, h));
    const hit = L.paths.filter(([px, py]) => sc.has(`${px},${py}`));
    if (hit.length && t !== 'hunting') fail(`${t} sits on path cells ${hit.map((p) => p.join(',')).join(' ')}`);
    if (hit.length && t === 'hunting') {
        const onlyStreet = hit.every(([px, py]) => px === 8);
        if (!onlyStreet) fail(`hunting straddles non-street cells ${hit.map((p) => p.join(',')).join(' ')}`);
        else console.log(`ok: main street passes under the gatehouse arch (${hit.map((p) => p.join(',')).join(' ')})`);
    }
}
// plot cells must never contain path cells
for (const p of PLOTS) {
    const sc = new Set(cells(p.x, p.y, 3, 3));
    const hit = L.paths.filter(([px, py]) => sc.has(`${px},${py}`));
    if (hit.length) fail(`plot ${p.id} contains path cells ${hit.map((p2) => p2.join(',')).join(' ')}`);
}

// 4. FACADE audit — which front fires, mirrored or not
const NATURAL_FRONT = { house: 'y', blacksmith: 'y', medbay: 'y', alchemy: 'x', mines: 'y', pond: 'y', hunting: 'y' };
console.log('\n── facade audit ──');
for (const [t, x, y, w, h] of allB) {
    const nat = NATURAL_FRONT[t] || 'y';
    let want = nat;
    const row = [], col = [];
    for (let ix = 0; ix < w; ix++) row.push(`${x + ix},${y + h}`);
    for (let iy = 0; iy < h; iy++) col.push(`${x + w},${y + iy}`);
    if (row.some((k) => paths.has(k))) want = 'y';
    else if (col.some((k) => paths.has(k))) want = 'x';
    console.log(`${t.padEnd(11)} @${x},${y}  natural=${nat} fronts=${want} mirror=${want !== nat ? 'YES' : 'no'}  (row ${row.some((k) => paths.has(k)) ? 'HIT' : '-'}/col ${col.some((k) => paths.has(k)) ? 'HIT' : '-'})`);
}

// 5. woods gate gap rides the walk row
console.log(`\nwoods fence gap: walkY=${L.hunting.walkY} walkH=${L.hunting.walkH} (fence col x=${L.hunting.fenceCol}, rows ${L.hunting.zone.y}..${L.hunting.zone.y + L.hunting.zone.fh - 1})`);
const gapCells = [];
for (let yy = L.hunting.zone.y; yy < L.hunting.zone.y + L.hunting.zone.fh; yy++) {
    if (yy >= L.hunting.walkY && yy < L.hunting.walkY + L.hunting.walkH) gapCells.push(yy);
}
if (gapCells.join(',') !== `${L.hunting.walkY},${L.hunting.walkY + 1}`) fail(`walk gap rows wrong: ${gapCells}`);
else console.log(`ok: gap rows ${gapCells} — the hunting walk (y=9 cells ${L.paths.filter(([x, y]) => y === 9).map((p) => p.join(',')).join(' ')}) reaches it`);

// 6. ASCII map (x→right, y→down; screen-diagonals are the iso axes)
console.log('\n── map (top-left = grid 0,0) ──');
const map = Array.from({ length: N }, () => Array(N).fill('.'));
for (const [x, y] of L.paths) map[y][x] = 'o'; // wait: map[y][x]
for (const p of PLOTS) for (const c of cells(p.x, p.y, 3, 3)) { const [x, y] = c.split(',').map(Number); if (map[y][x] === '.') map[y][x] = p.id; }
for (const [t, x, y, w, h] of allB) {
    const ch = t === 'hunting' ? 'G' : t[0].toUpperCase();
    for (const c of cells(x, y, w, h)) { const [cx2, cy2] = c.split(',').map(Number); if (map[cy2][cx2] === '.') map[cy2][cx2] = ch; }
}
console.log('   ' + Array.from({ length: N }, (_, i) => i % 10).join(' '));
for (let y = 0; y < N; y++) console.log(String(y).padStart(2) + ' ' + map[y].join(' '));
console.log('\nG=gatehouse H=house M=mines P=pond B=blacksmith(medbay) A=alchemy o=cobble 1-4=plots');
console.log(fails === 0 ? `\nALL CHECKS GREEN` : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
