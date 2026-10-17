'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD BASE RENDERER — outdoor isometric base hub (Sections 6/7/10)
//  16x16 outdoor map: grass terrain, fixed zones (mines rock, pond water,
//  fenced hunting grounds), expansion plots, upgradeable structures drawn
//  1:1 with the SAME shadow engine as the room (isoShadow.js) so both views
//  share one light model and one grounding law.
//  Animated: water shimmer, chimney/forge smoke, gate torch, fireflies.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const isoShadow = require('./isoShadow');
const isoForest = require('./isoForest');
const isoOutlands = require('./isoOutlands');
const mediaCache = require('./mediaCache');

const SS = 2;
const TW = 64, TH = 32;
const N = 16;                 // base tiles per side
const ART_W = 1240, ART_H = 850;
const OX = ART_W / 2;
const OY = 150;
const FRAMES = 14, FRAME_MS = 110;

const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

let STRUCT_DEF = null;
function structures() {
    if (!STRUCT_DEF) {
        try { STRUCT_DEF = JSON.parse(fs.readFileSync(path.join(ASSETS, 'structures.json'), 'utf8')); }
        catch (e) { STRUCT_DEF = { structures: [] }; }
    }
    return STRUCT_DEF;
}
function structDef(type) { return structures().structures.find((s) => s.id === type); }

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        for (const [f, o] of [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ]) {
            const p = path.join(FONTS, f);
            if (fs.existsSync(p)) { try { registerFont(p, o); } catch (e) { /* skip */ } }
        }
        fontsReady = true;
        return true;
    } catch (e) { return false; }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const _img = new Map();
async function img(file) {
    if (_img.has(file)) return _img.get(file);
    let out = null;
    try { out = await require('canvas').loadImage(path.join(ASSETS, file)); } catch (e) { out = null; }
    _img.set(file, out);
    return out;
}

function isoX(x, y) { return OX + (x - y) * (TW / 2); }
function isoY(x, y) { return OY + (x + y) * (TH / 2); }
function footCenter(x, y, fw, fh) {
    return { x: isoX(x + fw / 2, y + fh / 2), y: isoY(x + fw / 2, y + fh / 2) };
}
// POLYY ART LAW (owner 2026-10-17: base art swapped to Polyy's Village
// Buildings + Foozle mine renders) — sprites are exported so their base
// diamond bottom sits at the bbox bottom, so the anchor is the footprint's
// SOUTH CORNER (+4px sink so bases read grounded into their tile).
function anchorOf(x, y, fw, fh) {
    const c = footCenter(x, y, fw, fh);
    return { cx: c.x, ay: c.y + (fw + fh) * (TH / 4) + 4 };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── LAYOUT v2 (owner 2026-10-16 17:27Z "the layout trash, the house too
// big"): village-grade plan — house anchored centre-south on a proper plaza,
// one clean spine north splitting to mines (NW) and pond (NE), west walk to
// the hunting gate, south walk serving the plots. No more diagonal scrawl.
const LAYOUT = {
    N,
    house: { x: 6, y: 7, fw: 3, fh: 3 },
    mines: { x: 1, y: 1, fw: 2, fh: 2, zone: { x: 0, y: 0, fw: 5, fh: 4 } },
    pond: { x: 12, y: 1, fw: 2, fh: 2, zone: { x: 11, y: 0, fw: 5, fh: 4 } },
    hunting: { x: 3, y: 8, fw: 2, fh: 2, zone: { x: 0, y: 5, fw: 4, fh: 8 }, fenceCol: 4 },
    paths: [
        // plaza around the house (south face + west/east stubs)
        [5, 8], [5, 9], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [9, 9], [9, 8],
        // north spine from the plaza top to the field crossroads
        [7, 3], [7, 4], [7, 5], [7, 6],
        // west branch to the mines
        [3, 3], [4, 3], [5, 3], [6, 3],
        // east branch to the pond
        [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
        // west walk to the hunting gate
        [1, 9], [2, 9], [3, 9], [4, 9],
        // south walk serving the plots
        [9, 11], [9, 12], [9, 13], [8, 14], [7, 14], [6, 14], [5, 14],
    ],
};

// per-structure draw scale — POLYY ART LAW: sprites are pre-scaled in
// scripts/build_poly_sprites.py so their base diamond ≈ footprint diamond
// (fw+fh)*TW/2; scale stays ~1.0 and only tunes minor over/undershoot.
const STRUCT_SCALE = {
    house: 1.0, blacksmith: 1.0, medbay: 1.0, alchemy: 1.0,
    mines: 1.0, pond: 1.0, hunting: 1.0,
};

// FENCE PAD (owner 2026-10-17 "the fence should be further away because the
// space is bigger"): the pixel palisade now stands `P` tiles OUTSIDE the
// playable ring, enclosing a yard meadow around the buildable 16x16. The
// world beyond the fence is the per-player procedural outlands.
const P = 3;

function inZone(z, x, y) { return x >= z.x && x < z.x + z.fw && y >= z.y && y < z.y + z.fh; }

// ═══════════════════════════════════════════════════════════════════════════
// ONE FRAME
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    ensureFonts();
    const canvas = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.imageSmoothingEnabled = false;

    const seed = hashStr(state.owner || 'base');

    // ── FOREST LAW (owner 2026-10-16 11:57Z): the whole thing is a forest —
    // no sky, deep canopy wall + treelines + god rays behind the island ──
    await isoForest.paintBackdrop(ctx, ART_W, ART_H, frame, FRAMES, isoY(0, 0) - 16, isoY(N - 1, N - 1) + 16);

    // ── terrain — mossy forest floor, and it now STRETCHES PAST THE CARD
    // BORDERS (owner: "the ground itself stretching past the borders of the
    // gif/card") — margin tiles continue the world outside the playable ring
    // so there is no floating-island void anywhere.
    const grass = ['forest_moss_a.png', 'forest_moss_b.png', 'forest_moss_c.png'];
    const waterF = frame % 4 < 2 ? 'forest_water_0.png' : 'forest_water_1.png';
    const M = 12; // full coverage to the card corners (owner: ground past borders)
    // PER-PLAYER PROCEDURAL OUTLANDS (owner 2026-10-17): the world beyond the
    // fence is rolled once per owner seed — biome (forest / highlands /
    // ruins / coast), terrain overrides and prop placements all derive from
    // it, so every render of the same player shows the same wilds.
    const outlands = isoOutlands.outlandProps({ seedStr: state.owner || 'base', N, P, isoX, isoY, M, gates: [[5, N - 1 + P]] });
    const wildTile = new Map(outlands.tiles.map((t) => [`${t.x},${t.y}`, t.tile]));
    // ── STONE WALKWAY LAW (owner 2026-10-17, v81 stack: "you left the stone
    // roads out of the base one, the guild???") — the base gets the SAME
    // cobble walkways as the guild grounds: every path cell bakes cobble
    // (forest_cobble_a/b/c, per-cell seeded pick so runs never repeat), and
    // the old dirt trail stays alive as WORN SHOULDERS hugging every walk
    // (4-neighbour cells at a 50% seeded roll) for the two-texture detail.
    const COBBLE = ['forest_cobble_a.png', 'forest_cobble_b.png', 'forest_cobble_c.png'];
    const pathSet = new Set((LAYOUT.paths || []).map(([x2, y2]) => `${x2},${y2}`));
    const shoulder = new Set();
    for (const [px2, py2] of LAYOUT.paths || []) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${px2 + dx},${py2 + dy}`;
            if (!pathSet.has(k)) shoulder.add(k);
        }
    }
    // ── PER-BAKE TERRAIN LAYER (shutdown fix, part 2): the tiles+trail+rim
    // plane is frame-independent except the 2-state water shimmer — bakes
    // pass an opts.terrainLayers store so it paints ONCE per state instead
    // of 14x; single-frame callers get a transient layer (same output).
    const layerStore = opts.terrainLayers || null;
    let ground = layerStore ? layerStore[waterF] : null;
    if (!ground) {
        ground = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
        const g = ground.getContext('2d');
        g.scale(SS, SS);
        g.imageSmoothingEnabled = false;
        if (layerStore) layerStore[waterF] = ground;
        const TCTX = g;   // terrain target for this block
    for (let x = -M; x < N + M; x++) {
        for (let y = -M; y < N + M; y++) {
            const px = isoX(x, y), py = isoY(x, y);
            if (px < -TW || px > ART_W + TW || py < -TH || py > ART_H + TH) continue;
            const r = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17)();
            const r2 = mulberry32(seed + (x + 40) * 131 + (y + 40) * 17 + 7)();
            const inside = x >= 0 && y >= 0 && x < N && y < N;
            const inFence = x >= -P && x <= N - 1 + P && y >= -P && y <= N - 1 + P;
            let tile;
            if (inside) {
                if (inZone(LAYOUT.mines.zone, x, y)) tile = r < 0.85 ? 'forest_rock_tile.png' : 'forest_moss_c.png';
                else if (inZone(LAYOUT.pond.zone, x, y)) tile = r < 0.92 ? waterF : 'forest_moss_c.png';
                else if (pathSet.has(`${x},${y}`)) tile = COBBLE[Math.floor(r2 * 13) % 3];              // stone walkway
                else if (shoulder.has(`${x},${y}`) && r2 < 0.5) tile = 'forest_trail.png';              // worn dirt shoulder
                else tile = r < 0.07 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else if (inFence) {
                // the YARD — tamed meadow between playable ring and fence
                tile = r < 0.04 ? 'forest_moss_shrooms.png' : grass[Math.floor(r * 3) % 3];
            } else {
                // beyond the fence: per-player wilds (biome terrain)
                const wt = wildTile.get(`${x},${y}`);
                if (wt === 'water') tile = waterF;
                else if (wt) tile = wt;
                else tile = grass[Math.floor(r * 3) % 3];
            }
            const timg = await img(tile);
            if (timg) TCTX.drawImage(timg, px - TW / 2, py - TH / 2);
        }
    }
    // gate trail: the walk runs out the south gate — cobble across the yard
    // and a cobble apron at the gate mouth, then the old dirt walk fading
    // into the per-player wilds (same two-texture law as the guild grounds)
    {
        const trailImg = await img('forest_trail.png');
        const cob0 = await img(COBBLE[0]);
        const cob1 = await img(COBBLE[1]);
        if (trailImg) {
            const trailCells = [];
            for (let y = N; y <= N - 1 + P; y++) trailCells.push([5, y, 1]);   // yard walk = cobble
            trailCells.push([5, N + P, 1], [4, N + P + 1, 0], [4, N + P + 2, 0], [3, N + P + 3, 0]); // apron, then dirt fade
            for (const [tx, ty, stone] of trailCells) {
                const im = stone ? ((tx + ty) % 2 === 0 ? cob0 : cob1) : trailImg;
                if (im) TCTX.drawImage(im, isoX(tx + 0.5, ty + 0.5) - TW / 2, isoY(tx + 0.5, ty + 0.5) - TH / 2);
            }
        }
    }
    // playable-area rim — now a SOFT moss shadow instead of a hard island edge
    TCTX.strokeStyle = 'rgba(24,32,14,0.22)';
    TCTX.lineWidth = 3;
    TCTX.beginPath();
    TCTX.moveTo(isoX(0, N), isoY(0, N));
    TCTX.lineTo(isoX(N, N), isoY(N, N));
    TCTX.lineTo(isoX(N, 0), isoY(N, 0));
    TCTX.stroke();
    }
    ctx.drawImage(ground, 0, 0, ART_W, ART_H);

    // ── wild haze floor wash (owner pre-restart promise: "everything behind
    // [the fence] = dense hazed forest") — now clipped to the FENCE diamond:
    // the yard inside the fence stays bright and tamed; only the procedural
    // wilds beyond the palisade recede.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-8, -8, ART_W + 16, ART_H + 16);
    ctx.moveTo(isoX(-P, -P), isoY(-P, -P));
    ctx.lineTo(isoX(N + P, -P), isoY(N + P, -P));
    ctx.lineTo(isoX(N + P, N + P), isoY(N + P, N + P));
    ctx.lineTo(isoX(-P, N + P), isoY(-P, N + P));
    ctx.closePath();
    ctx.clip('evenodd');
    const hz = ctx.createLinearGradient(0, isoY(-P, -P) - 60, 0, isoY(N + P, N + P) + 30);
    hz.addColorStop(0, 'rgba(18,28,14,0.38)');
    hz.addColorStop(0.5, 'rgba(24,36,16,0.26)');
    hz.addColorStop(1, 'rgba(12,20,10,0.44)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();

    // ── hunting grounds fence (east boundary, gate gap) ──
    const fenceImg = await img('base_fence.png');
    if (fenceImg) {
        const z = LAYOUT.hunting;
        for (let yy = z.zone.y; yy < z.zone.y + z.zone.fh; yy++) {
            if (yy >= z.y && yy < z.y + z.fh) continue; // gate gap
            ctx.drawImage(fenceImg, isoX(z.fenceCol, yy) - 32, isoY(z.fenceCol, yy) - 14);
        }
        // north run of the fence (along x, at y = zone.y)
        for (let xx = 0; xx < z.zone.fw; xx++) {
            ctx.drawImage(fenceImg, isoX(xx + 0.5, z.zone.y) - 33, isoY(xx + 0.5, z.zone.y) - 30);
        }
    }
    // ── FOREST PROP LAW — dense tree wall on the border ring, clearing
    // trees around the player house, understory everywhere else. Plots,
    // structures, paths and the fenced hunting meadow stay walkable.
    const props = [];
    const used = new Set();
    for (const st of state.structures || []) {
        const d = structDef(st.type);
        if (!d) continue;
        for (let ix = 0; ix < d.fw; ix++) for (let iy = 0; iy < d.fh; iy++) used.add(`${st.x + ix},${st.y + iy}`);
    }
    // keep a 1-tile clearing around every structure so buildings stay readable
    const usedMargin = new Set(used);
    for (const key of used) {
        const [sx, sy] = key.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) usedMargin.add(`${sx + dx},${sy + dy}`);
    }
    const plotCells = new Set();
    for (const plot of state.freePlots || []) {
        for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${plot.x + ix},${plot.y + iy}`);
    }
    // hot cells: ring around the house footprint (trees right by the house)
    const hot = [];
    {
        const h = LAYOUT.house;
        for (let xx = h.x - 1; xx <= h.x + h.fw; xx++) {
            for (let yy = h.y - 1; yy <= h.y + h.fh; yy++) {
                if (xx >= h.x && xx < h.x + h.fw && yy >= h.y && yy < h.y + h.fh) continue;
                hot.push([xx, yy]);
            }
        }
        // the hunting woods stay wooded
        for (let xx = LAYOUT.hunting.zone.x; xx < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; xx++) {
            for (let yy = LAYOUT.hunting.zone.y; yy < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; yy++) hot.push([xx, yy]);
        }
    }
    const forestProps = isoForest.islandForest({
        seed, N, isoX, isoY,
        occupied: usedMargin,
        paths: LAYOUT.paths || [],
        hot, plotCells,
        margin: false, // outside the fence is the outlands module's domain now
        haze: false,
        // owner 2026-10-17 v91 stack: "too many trees inside" — the yard's
        // mid ring + house hot ring thin way down; the playable ring stays
        // an open settlement with tree garnish, the woodland lives OUTSIDE
        // as the outlands' rolled forest patches
        midRate: 0.13,
        hotRate: 0.15,
        structFoots: (state.structures || [])
            .map((st) => { const d = structDef(st.type); return d ? [st.x, st.y, d.fw, d.fh] : null; })
            .filter(Boolean),
    });
    for (const f of forestProps) {
        const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await img(f.file);
        if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
    }
    // PER-PLAYER OUTLANDS PROPS — biome placements beyond the fence (rocks,
    // mountains, ruins, shore) + yard meadow dressing; hazed by tint there.
    for (const f of outlands.props) {
        const im = f.tint ? await isoForest.tinted(f.file, f.tint, f.sc || 1) : await img(f.file);
        if (im) props.push({ img: im, x: f.x, y: f.y, sc: f.tint ? 1 : (f.sc || 1) });
    }
    // ── pixel fence ring — pushed OUTWARD by P tiles (owner: "the fence
    // should be further away because the space is bigger"), gate gap where
    // the south walk leaves the compound (5, N-1+P)
    for (const seg of isoForest.fenceRing(N, isoX, isoY, [[5, N - 1 + P]], P)) {
        const fim = await img(seg.file);
        if (fim) props.push({ img: fim, x: seg.x, y: seg.y, sc: 1 });
    }
    // zone garnish (owner: "the pond and mines and everything else? Doesn't
    // exist") — boulders ringing the mines zone, reeds/bushes by the pond so
    // both read instantly as landmarks
    {
        const gRnd = mulberry32(seed + 4711);
        const zoneFree = (x, y) => {
            for (const st of state.structures || []) {
                const d = structDef(st.type);
                if (!d) continue;
                if (x >= st.x - 1 && x < st.x + d.fw + 1 && y >= st.y - 1 && y < st.y + d.fh + 1) return false;
            }
            return !(LAYOUT.paths || []).some(([px2, py2]) => px2 === x && py2 === y);
        };
        const mz = LAYOUT.mines.zone, pz = LAYOUT.pond.zone;
        const garnish = [];
        for (let i = 0; i < 6; i++) {
            const gx = mz.x + Math.floor(gRnd() * mz.fw), gy = mz.y + Math.floor(gRnd() * mz.fh);
            if (zoneFree(gx, gy)) garnish.push({ file: gRnd() < 0.6 ? 'px_boulder.png' : 'px_rock.png', x: isoX(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 30, y: isoY(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 14 });
        }
        for (let i = 0; i < 5; i++) {
            const gx = pz.x + Math.floor(gRnd() * pz.fw), gy = pz.y + Math.floor(gRnd() * pz.fh);
            if (zoneFree(gx, gy)) garnish.push({ file: gRnd() < 0.55 ? 'px_fern.png' : 'px_bush_a.png', x: isoX(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 30, y: isoY(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 14 });
        }
        for (const g of garnish) {
            const im = await img(g.file);
            if (im) props.push({ img: im, x: g.x, y: g.y, sc: 1 });
        }
    }

    // ── plot markers for free expansion plots ──
    const plotImg = await img('base_plot_marker.png');
    for (const plot of state.freePlots || []) {
        if (!plotImg) break;
        const c = footCenter(plot.x, plot.y, 3, 3);
        const bob = Math.sin((frame / FRAMES) * Math.PI * 2 + plot.id) * 1.2;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(plotImg, c.x - plotImg.width / 2, isoY(plot.x + 1, plot.y + 1) - plotImg.height / 2 + bob);
        ctx.font = '15px Medieval, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(35,25,12,0.9)';
        ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1, plot.y + 1) + 5 + bob);
        ctx.fillStyle = '#f2e2b8';
        ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1, plot.y + 1) + 4 + bob);
        ctx.restore();
    }

    // ── structures: back→front depth sort ──
    const structs = (state.structures || [])
        .map((st) => ({ ...st, def: structDef(st.type) }))
        .filter((st) => st.def)
        .sort((a, b) => (a.x + a.y) - (b.x + b.y));

    const drawn = [];
    for (const st of structs) {
        const lv = st.def.levels.find((l) => l.level === st.level) || st.def.levels[0];
        const spr = await img(`${lv.sprite}.png`);
        if (!spr) continue;
        const { cx, ay } = anchorOf(st.x, st.y, st.def.fw, st.def.fh);
        const sc = STRUCT_SCALE[st.type] || 0.85;
        drawn.push({ st, spr, cx, ay, w: spr.width * sc, h: spr.height * sc, sc, lv });
    }

    // props behind structures merge into the same depth pass.
    // DEPTH LAW (fixes owner 20:20Z "houses seem to be on top of the trees"):
    // a struct's depth is its footprint's SOUTH CORNER (the max x+y vertex —
    // the point nearest the camera); a prop's depth is its anchor tile.
    // +2 bias makes ties at the south corner resolve prop-in-front, so a
    // tree's canopy may overlap a house base, never the reverse. The old
    // sort compared structs' UNDEFINED .y -> NaN comparator -> arbitrary
    // draw order, which let houses paint over trees standing in front.
    const drawables = [
        ...props.map((p) => ({ kind: 'prop', depth: p.y, x: p.x, y: p.y, img: p.img, sc: p.sc || 1 })),
        ...drawn.map((d) => ({ kind: 'struct', depth: isoY(d.st.x + d.st.def.fw, d.st.y + d.st.def.fh) + 2, ...d })),
    ].sort((a, b) => a.depth - b.depth);

    // shadows first (floor level)
    for (const d of drawables) {
        if (d.kind === 'prop') {
            if (d.img && d.img.height * (d.sc || 1) > 26) {
                isoShadow.drawItemShadow(ctx, { img: d.img, key: `prop${d.x}|${d.y}`, scale: d.sc || 1, ax: d.x, ay: d.y + 2, alpha: 0.8 });
            }
            continue;
        }
        isoShadow.drawItemShadow(ctx, {
            img: d.spr, key: `${d.st.type}_${d.st.level}`, scale: d.sc,
            ax: d.cx, ay: d.ay, alpha: 1,
        });
    }
    // sprites (pixel-snap prop draw — keeps the chunky look crisp)
    for (const d of drawables) {
        if (d.kind === 'prop') {
            const pw = d.img.width * (d.sc || 1), ph = d.img.height * (d.sc || 1);
            ctx.drawImage(d.img, (d.x - pw / 2) | 0, (d.y - ph) | 0, pw | 0, ph | 0);
            continue;
        }
        ctx.drawImage(d.spr, d.cx - d.w / 2, d.ay - d.h, d.w, d.h);
    }

    // ── animations ──
    // gate torch flicker
    const gate = structs.find((s) => s.type === 'hunting');
    if (gate) {
        const fl = Math.sin(frame * 1.9) * 0.5 + 0.5;
        const gx = isoX(gate.x + 1.9, gate.y), gy = isoY(gate.x + 1.9, gate.y) - 66;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const R = 22 + fl * 6;
        const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, R);
        g.addColorStop(0, 'rgba(255,190,90,0.5)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    // chimney/forge smoke: house L2+, smithy L2+
    const t = frame / FRAMES;
    for (const d of drawn) {
        let smokes = 0, sxo = 0, syo = 0;
        if (d.st.type === 'house' && d.st.level >= 2) { smokes = 3; sxo = 40 * d.sc; syo = -d.h + 14; }
        if (d.st.type === 'blacksmith' && d.st.level >= 2) { smokes = 4; sxo = 52 * d.sc; syo = -d.h + 30; }
        if (!smokes) continue;
        ctx.save();
        for (let i = 0; i < smokes; i++) {
            const ph = (t + i / smokes) % 1;
            ctx.globalAlpha = 0.30 * (1 - ph);
            ctx.fillStyle = '#e8e4da';
            ctx.beginPath();
            ctx.ellipse(d.cx + sxo + Math.sin(ph * 5 + i) * 8, d.ay + syo - ph * 44, 4 + ph * 10, 3 + ph * 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    // pond sparkle + alchemy sparks
    const pond = structs.find((s) => s.type === 'pond');
    if (pond && pond.level >= 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sp = (t * 3) % 1;
        ctx.globalAlpha = 0.6 * (1 - sp);
        ctx.fillStyle = '#dff6fa';
        ctx.beginPath(); ctx.arc(pond.cx + Math.sin(t * 6.28) * 20, pond.ay - 30 - sp * 24, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    const alch = structs.find((s) => s.type === 'alchemy');
    if (alch) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const ph = (t + i / 3) % 1;
            ctx.globalAlpha = 0.5 * (1 - ph);
            ctx.fillStyle = '#aef0b8';
            ctx.beginPath(); ctx.arc(alch.cx + 70 + Math.sin(ph * 9 + i * 2) * 10, alch.ay - 8 - ph * 30, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    // fireflies (dusk ambience near grass)
    ctx.save();
    for (let i = 0; i < 6; i++) {
        const r1 = mulberry32(seed + 3000 + i)();
        const ph = (t + r1) % 1;
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(OX + (r1 - 0.5) * 700, OY + 300 + (i % 3) * 90 - ph * 26, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(OX, OY + 340, 380, OX, OY + 340, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,6,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, ART_W, ART_H);

    drawHud(ctx, state, opts);
    // RAW ENCODER (owner 2026-10-17 "sometimes when I do .j base the bot
    // shuts down??? Investigate"): 14 sync PNG encodes at 1.1-2.7s each
    // starved the event loop for 15-40s straight -> the liveness canary
    // SIGKILLed the bake mid-flight. opts.encoder='raw' returns the cairo
    // surface as a BGRA memcpy (toBuffer('raw'), ~40ms) for ffmpeg to
    // encode directly — the PNG round-trip is skipped entirely.
    if (opts.encoder === 'raw') {
        return { raw: canvas.toBuffer('raw'), w: canvas.width, h: canvas.height };
    }
    return canvas.toBuffer('image/png');
}

// ── HUD plate ──
function drawHud(ctx, state, opts) {
    const H = 132, Wp = ART_W - 60;
    const x0 = 30, y0 = ART_H - H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.88)';
    roundRect(ctx, x0, y0, Wp, H, 14);
    ctx.fill();
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, H - 8, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, H - 18, 8);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(String(state.owner || 'Adventurer').slice(0, 22), x0 + 26, y0 + 38);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`The base of ${state.owner}`, x0 + 26, y0 + 64);

    const count = (state.structures || []).length;
    ctx.textAlign = 'center';
    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${count}`, x0 + Wp - 250, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('STRUCTURES', x0 + Wp - 250, y0 + 62);

    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${(state.freePlots || []).length}`, x0 + Wp - 90, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('FREE PLOTS', x0 + Wp - 90, y0 + 62);

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    ctx.fillText(opts.hint || 'base build <type> [plot]  •  base upgrade <type|#>  •  base house 1  •  base info', x0 + Wp / 2, y0 + H - 26);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: base animation (WhatsApp GIF = mp4) with PNG fallback
// ═══════════════════════════════════════════════════════════════════════════
async function encodeFramesToMp4(frames) {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg'); } catch (e) { /* engine sets it too */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    const out = path.join(tmp, 'base.mp4');
    try {
        // RAW PATH — frames rendered via opts.encoder='raw' ({ raw, w, h }):
        // concat the BGRA memcpys and let ffmpeg demux rawvideo. This skips
        // 13 PNG encodes (~15-35s of sync event-loop blocking per bake).
        if (frames.length && frames[0] && frames[0].raw) {
            const { w, h } = frames[0];
            const rawFile = path.join(tmp, 'frames.raw');
            const fd = fs.openSync(rawFile, 'w');
            try { for (const f of frames) fs.writeSync(fd, f.raw); }
            finally { fs.closeSync(fd); }
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(rawFile)
                    .inputOptions(['-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${w}x${h}`, '-framerate', `${1000 / FRAME_MS}`])
                    .outputOptions([
                        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                        '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                        '-movflags', '+faststart', '-an', '-y',
                    ])
                    .output(out)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            return fs.readFileSync(out);
        }
        // PNG PATH — plain buffers (QA smoke bakes / 3-frame renders)
        frames.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b));
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmp, 'f%03d.png'))
                .inputOptions(['-framerate', `${1000 / FRAME_MS}`])
                .outputOptions([
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                    '-movflags', '+faststart', '-an', '-y',
                ])
                .output(out)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        return fs.readFileSync(out);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.owner, state.structures, state.freePlots, opts.hint || '', opts.static ? 1 : 0]));
}

// EVENT-LOOP BREATH — a real setTimeout between frames lets timers/IO run
// during a bake (hot-cache promise chains only yield microtasks, which do
// NOT feed the heartbeat interval — a full 14-frame bake starved the canary
// heartbeat past the 75s stall threshold and the process got SIGKILLed).
const FRAME_BREATH_MS = 8;
const breath = () => new Promise((r) => setTimeout(r, FRAME_BREATH_MS));

// Media matrix (owner 2026-10-16 10:09Z "bring gifs back and make the
// generation faster"): the BASE VIEW ("house idle") is an ANIMATED GIF again
// — water shimmer, forge/chimney smoke, gate torch, fireflies; build/upgrade
// transformation stays ANIMATED (opts.celebrate). Speed: bake is disk-cached
// per stateHash (mediaCache.js) — first view renders, repeats are instant.
async function renderBaseImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('base', key, async () => {
        const frames = [];
        const frameCount = opts.static ? 1 : FRAMES;
        // animated bakes: ALL frames raw (13 sync PNG encodes removed) + a
        // shared terrain-layer store; PNG only re-renders if mp4 fails
        const layers = opts.static ? null : {};
        for (let f = 0; f < frameCount; f++) {
            frames.push(await renderFrame(state, f, layers ? { ...opts, encoder: 'raw', terrainLayers: layers } : opts));
            await breath();
        }
        let out = layers ? null : { buffer: frames[0], contentType: 'image/png' };
        if (layers) {
            try {
                const mp4 = await encodeFramesToMp4(frames);
                if (mp4 && mp4.length > 1000) out = { buffer: mp4, contentType: 'video/mp4' };
            } catch (e) {
                console.error('[baseRenderer] mp4 encode failed, PNG fallback:', e.message);
            }
            if (!out) out = { buffer: await renderFrame(state, 0, opts), contentType: 'image/png' };  // PNG re-render for fallback
        }
        return out;
    });
    if (_renderCache.size > 120) _renderCache.clear();
    _renderCache.set(key, { ...out, ts: Date.now() });
    return out;
}

module.exports = { LAYOUT, N, FRAMES, renderFrame, renderBaseImage, encodeFramesToMp4, structDef, structures };
