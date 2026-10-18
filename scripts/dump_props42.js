'use strict';
// dump forest props in the plaza/south region to identify the oak trio
const path = require('path');
const isoForest = require('../core/rpg/isoForest');
const R = require('../core/rpg/homesteadBaseRenderer');
const { LAYOUT, DRESS, N } = R;

const TW = 64, TH = 32, OX = 620, OY = 150;
const isoX = (x, y) => OX + (x - y) * (TW / 2);
const isoY = (x, y) => OY + (x + y) * (TH / 2);

const seedStr = 'Bio1';
let h = 2166136261;
for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
const seed = h >>> 0;

// mirror the renderer's sets
const dressCells = new Set();
for (const arr of [DRESS.dooryard, DRESS.pondEdge, DRESS.minesEdge, DRESS.woodsCamp, DRESS.farm]) {
    for (const d of arr) dressCells.add(`${d.cell[0]},${d.cell[1]}`);
}
for (const c of [...DRESS.well, ...DRESS.bench, ...DRESS.lanterns]) dressCells.add(`${c[0]},${c[1]}`);

const used = new Set();
for (const f of [LAYOUT.house, LAYOUT.mines, LAYOUT.pond, LAYOUT.hunting]) {
    for (let ix = 0; ix < f.fw; ix++) for (let iy = 0; iy < f.fh; iy++) used.add(`${f.x + ix},${f.y + iy}`);
}
const usedMargin = new Set(used);
for (const k of used) {
    const [sx, sy] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) usedMargin.add(`${sx + dx},${sy + dy}`);
}
const PLOTS = [{ x: 8, y: 1 }, { x: 13, y: 7 }, { x: 4, y: 5 }, { x: 2, y: 13 }];
const plotCells = new Set();
for (const p of PLOTS) for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${p.x + ix},${p.y + iy}`);
const hot = [];
for (let xx = LAYOUT.house.x - 1; xx <= LAYOUT.house.x + LAYOUT.house.fw; xx++) {
    for (let yy = LAYOUT.house.y - 1; yy <= LAYOUT.house.y + LAYOUT.house.fh; yy++) {
        if (xx >= LAYOUT.house.x && xx < LAYOUT.house.x + LAYOUT.house.fw && yy >= LAYOUT.house.y && yy < LAYOUT.house.y + LAYOUT.house.fh) continue;
        hot.push([xx, yy]);
    }
}
for (let xx = LAYOUT.hunting.zone.x; xx < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; xx++) {
    for (let yy = LAYOUT.hunting.zone.y; yy < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; yy++) hot.push([xx, yy]);
}
const woodsCells = [];
for (let xx = LAYOUT.hunting.zone.x; xx < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; xx++) {
    for (let yy = LAYOUT.hunting.zone.y; yy < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; yy++) woodsCells.push([xx, yy]);
}

const out = isoForest.islandForest({
    seed, N, isoX, isoY,
    occupied: new Set([...usedMargin, ...dressCells]),
    paths: LAYOUT.paths,
    hot, plotCells, margin: false, haze: false,
    midRate: 0.04, hotRate: 0.05,
    woods: { cells: woodsCells, treeRate: 0.30, underRate: 0.30 },
    clusters: DRESS.clusters,
    structFoots: [LAYOUT.house, LAYOUT.mines, LAYOUT.pond, LAYOUT.hunting].map((f) => [f.x, f.y, f.fw, f.fh]),
});

// invert: for each prop, find nearest cell
function cellOf(px, py) {
    let best = null, bd = 1e9;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        const dx = px - isoX(x + 0.5, y + 0.5), dy = (py - 6) - isoY(x + 0.5, y + 0.5);
        const d = dx * dx / 400 + dy * dy / 100;
        if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
}
console.log('props in x5..13 y8..15 (file @cell):');
for (const p of out) {
    const c = cellOf(p.x, p.y);
    if (c[0] >= 5 && c[0] <= 13 && c[1] >= 8 && c[1] <= 15) {
        console.log(`  ${p.file} @(${c[0]},${c[1]}) sc=${(p.sc || 1).toFixed(2)} px=${p.x.toFixed(0)},${p.y.toFixed(0)}`);
    }
}
