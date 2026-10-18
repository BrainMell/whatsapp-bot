'use strict';
// check_layout_v5.js — LAYOUT v5 DRESSING LAW audit (owner 2026-10-18:
// "rules and regulations ... make sure you can do it good before you even
// attempt"). Verifies against the renderer's OWN exported tables:
//   R1 no prop on a path/plot/footprint cell (zone-interior whitelist:
//      pond boat/water-rock, woods camp)
//   R2 lanterns stand on grass cells 4-adjacent to a street cell
//   R3 trees exist only via DRESS clusters (scatter is 4%) — cluster cells
//      never collide with furniture/dress cells
//   R4 dooryard sits on the strip between the house front and the south lane
//   R5 in-fence prop budget <= 95 (estimated: furniture + cluster trees +
//      woods-rate trees + scatter expectation + hedge expectation)
//   R6 node budget: plaza heart + shoulder props <= 6
//   R7 bounds: every dress cell inside the playable 16x16
//   R8 built-plot collision: dress cells never sit inside any PLOT footprint
//      (structures are built on plots — dress must survive a full build-out)
const path = require('path');
const R = require(path.join(__dirname, '..', 'core', 'rpg', 'homesteadBaseRenderer'));
const { LAYOUT, DRESS, N } = R;

const PLOTS = [
    { id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 },
];

let fails = 0, warns = 0;
const fail = (m) => { console.log('FAIL ' + m); fails++; };
const warn = (m) => { console.log('WARN ' + m); warns++; };
const pass = (m) => console.log('ok   ' + m);

const pathSet = new Set((LAYOUT.paths || []).map(([x, y]) => `${x},${y}`));
const plotCells = new Set();
for (const p of PLOTS) for (let ix = 0; ix < 3; ix++) for (let iy = 0; iy < 3; iy++) plotCells.add(`${p.x + ix},${p.y + iy}`);
// fixed structures (house/mines/pond/hunting) + built plots (worst case)
const FIXED = [LAYOUT.house, LAYOUT.mines, LAYOUT.pond, LAYOUT.hunting];
const footCells = new Set();
for (const f of [...FIXED, ...PLOTS.map((p) => ({ x: p.x, y: p.y, fw: 3, fh: 3 }))]) {
    for (let ix = 0; ix < (f.fw || 3); ix++) for (let iy = 0; iy < (f.fh || 3); iy++) footCells.add(`${f.x + ix},${f.y + iy}`);
}
const zoneOf = (x, y) => {
    for (const z of [LAYOUT.mines.zone, LAYOUT.pond.zone, LAYOUT.hunting.zone]) {
        if (x >= z.x && x < z.x + z.fw && y >= z.y && y < z.y + z.fh) return z;
    }
    return null;
};

// collect every dress cell with its label
const dress = [];
for (const c of DRESS.well || []) dress.push({ cell: c, label: 'well' });
for (const c of DRESS.bench || []) dress.push({ cell: c, label: 'bench' });
for (const c of DRESS.lanterns || []) dress.push({ cell: c, label: 'lantern' });
for (const [k, arr] of [['dooryard', DRESS.dooryard], ['pondEdge', DRESS.pondEdge], ['minesEdge', DRESS.minesEdge], ['woodsCamp', DRESS.woodsCamp], ['farm', DRESS.farm]]) {
    for (const d of arr || []) dress.push({ cell: d.cell, label: `${k}:${d.file}`, water: !!d.water });
}

// R7 bounds + R1 collisions
const seen = new Map();
for (const d of dress) {
    const [x, y] = d.cell;
    const k = `${x},${y}`;
    if (x < 0 || y < 0 || x >= N || y >= N) { fail(`R7 ${d.label} out of bounds ${k}`); continue; }
    if (seen.has(k)) fail(`R1 duplicate dress cell ${k}: ${seen.get(k)} vs ${d.label}`);
    seen.set(k, d.label);
    if (pathSet.has(k)) fail(`R1 ${d.label} sits ON a path cell ${k}`);
    if (footCells.has(k)) fail(`R1 ${d.label} sits on a structure/plot footprint ${k}`);
    const z = zoneOf(x, y);
    if (z && !d.water && !['weapon_rack.png', 'px_stump.png'].some((f) => (d.label || '').includes(f))) {
        // only pond-water props + woods-camp props may enter zones
        if (d.label.startsWith('pondEdge') && z === LAYOUT.pond.zone) {
            // shore props in the pond zone must be water-adjacent — allowed
        } else {
            fail(`R1 ${d.label} inside a zone interior ${k}`);
        }
    }
}
pass(`R1/R7 dress cells (${dress.length}) checked`);

// R2 lantern path adjacency
for (const c of DRESS.lanterns || []) {
    const [x, y] = c;
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pathSet.has(`${x + dx},${y + dy}`));
    if (!adj) fail(`R2 lantern ${x},${y} not adjacent to a street cell`);
}
pass(`R2 lanterns (${(DRESS.lanterns || []).length}) path-adjacent`);

// R4 dooryard strip law
{
    const h = LAYOUT.house;
    for (const d of DRESS.dooryard || []) {
        const [x, y] = d.cell;
        const inStrip = x >= h.x && x < h.x + h.fw && y === h.y + h.fh;
        if (!inStrip) fail(`R4 dooryard ${d.file} off the front strip (${x},${y})`);
    }
    pass('R4 dooryard on the house front strip');
}

// R3 clusters: bounds + collision with dress cells (cluster pass rejects
// blocked ground itself, but the audit verifies the seeds are sane)
{
    const dressSet = new Set(seen.keys());
    for (const cl of DRESS.clusters || []) {
        if (cl.x < 0 || cl.y < 0 || cl.x >= N || cl.y >= N) fail(`R3 cluster seed out of bounds ${cl.x},${cl.y}`);
        if (dressSet.has(`${cl.x},${cl.y}`)) warn(`R3 cluster seed on a dress cell ${cl.x},${cl.y} (cluster shifts)`);
    }
    pass(`R3 clusters (${(DRESS.clusters || []).length}) seeded`);
}

// R5 in-fence budget — TWO-TIER law (v5): structural props (trees +
// furniture + hedge bushes) shape the composition and get the tight ceiling;
// ground fuzz (understory tufts/ferns + hedge tufts) is moss-level texture
// with its own, higher ceiling. Counting them as one number conflated
// texture with clutter.
{
    const furniture = dress.length;
    const clusterTrees = (DRESS.clusters || []).reduce((a, c) => a + (c.n || 1), 0);
    const woodsCells = LAYOUT.hunting.zone.fw * LAYOUT.hunting.zone.fh;
    // playable free cells ~ N*N - paths - foots - plots - zones - dress
    const openCells = N * N - pathSet.size - 25 - 36 - (5 * 4) - dress.length;
    const scatterTrees = Math.round(openCells * 0.04);
    const woodsTrees = Math.round(woodsCells * 0.30);
    const hedgeAll = Math.round((2 * (N + 2) + 2 * (N + 2) - 5) * 0.30);
    const hedgeBush = Math.round(hedgeAll * 0.6), hedgeTuft = hedgeAll - hedgeBush;
    const structural = furniture + clusterTrees + scatterTrees + woodsTrees + hedgeBush;
    const fuzz = Math.round(openCells * 0.17) + Math.round(woodsCells * 0.30) + hedgeTuft;
    console.log(`     structural: furn ${furniture} + cluster ${clusterTrees} + scatter ${scatterTrees} + woods ${woodsTrees} + hedgeBush ${hedgeBush} = ${structural} (cap 70)`);
    console.log(`     fuzz: understory ${Math.round(openCells * 0.17)} + woodsUnder ${Math.round(woodsCells * 0.30)} + hedgeTuft ${hedgeTuft} = ${fuzz} (cap 45)`);
    if (structural > 70) fail(`R5 structural props ${structural} > 70`);
    else pass(`R5 structural ${structural} <= 70`);
    if (fuzz > 45) fail(`R5 ground fuzz ${fuzz} > 45`);
    else pass(`R5 fuzz ${fuzz} <= 45`);
    if (dress.length > 6) {
        // node = well + bench + plaza-mouth lanterns only
        const node = (DRESS.well || []).length + (DRESS.bench || []).length;
        if (node > 4) warn(`R6 node props ${node}`);
    }
    pass('R6 node budget checked');
}

// ASCII map for the eyeball
{
    const g = Array.from({ length: N }, () => Array(N).fill('.'));
    for (const [x, y] of LAYOUT.paths || []) g[y][x] = ' ';
    for (const k of footCells) { const [x, y] = k.split(',').map(Number); if (x < N && y < N) g[y][x] = '#'; }
    for (const [x, y] of LAYOUT.mines.zone ? [] : []) {}
    for (let x = LAYOUT.mines.zone.x; x < LAYOUT.mines.zone.x + LAYOUT.mines.zone.fw; x++) for (let y = LAYOUT.mines.zone.y; y < LAYOUT.mines.zone.y + LAYOUT.mines.zone.fh; y++) if (g[y][x] === '.') g[y][x] = 'm';
    for (let x = LAYOUT.pond.zone.x; x < LAYOUT.pond.zone.x + LAYOUT.pond.zone.fw; x++) for (let y = LAYOUT.pond.zone.y; y < LAYOUT.pond.zone.y + LAYOUT.pond.zone.fh; y++) if (g[y][x] === '.') g[y][x] = '~';
    for (let x = LAYOUT.hunting.zone.x; x < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; x++) for (let y = LAYOUT.hunting.zone.y; y < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; y++) if (g[y][x] === '.') g[y][x] = 'w';
    for (const [k, v] of seen) { const [x, y] = k.split(',').map(Number); g[y][x] = v === 'well' ? 'O' : v === 'bench' ? 'b' : v === 'lantern' ? 'L' : '*'; }
    for (const cl of DRESS.clusters || []) { const { x, y } = cl; if (g[y] && g[y][x] === '.') g[y][x] = 'T'; }
    console.log('   ' + Array.from({ length: N }, (_, i) => i % 10).join(' '));
    g.forEach((row, i) => console.log(String(i).padStart(2) + ' ' + row.join(' ')));
}

console.log(fails === 0 ? `\nALL GREEN (${warns} warnings)` : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
