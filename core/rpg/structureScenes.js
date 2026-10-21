'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  STRUCTURE SCENES — the zoomed-in "inside the place" cards (owner 2026-10-20:
//  "if someone tries to mine … a zoomed in card that's on the mines with an
//  overlay containing something appropriate … same for everything else — the
//  shop gets the merchant model, hunting grounds, pond, summons barracks").
//
//  One iso close-up per base structure, built from the same KayKit sprites as the
//  base map but at ~2x zoom, with a parchment INFO PANEL (name, level, stats, the
//  commands that work here) and an optional RESULT RIBBON (what you just mined /
//  caught / hunted). Static JPEG, disk-cached by content so repeat views are free.
// ═══════════════════════════════════════════════════════════════════════════
const K = require('./kingdom3d');
const mediaCache = require('./mediaCache');

const W = 1400, H = 1000, PANEL_H = 250;
const SCALE = 0.76;
const COLS = 21, ROWS = 21, CC = 10, CR = 10;
const TEAMS = ['blue', 'green', 'red', 'yellow'];
const mulberry32 = K.mulberry32, hashStr = (s) => K.hashStr(String(s || ''));

function fonts() { try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ } }

// ── parchment info panel + result ribbon (shared with the guild-hall card) ──
function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
}
/**
 * spec: { title, subtitle, rows:[[label,value],...] (≤6), actions:[string,...] (≤5), footer,
 *         banner:{ head, lines:[...] } , accent:'#c9a65a' }
 */
function drawPanel(ctx, w, h, spec = {}) {
    const accent = spec.accent || '#c9a65a';
    // result ribbon floats over the art, top-centre
    if (spec.banner && (spec.banner.head || (spec.banner.lines || []).length)) {
        const lines = (spec.banner.lines || []).slice(0, 6);
        const bw = Math.min(w - 120, 760), bh = 64 + lines.length * 34 + 18;
        const bx = (w - bw) / 2, by = 36;
        ctx.save();
        ctx.fillStyle = 'rgba(28,19,10,0.90)'; K.roundRect(ctx, bx, by, bw, bh, 18); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 3; K.roundRect(ctx, bx, by, bw, bh, 18); ctx.stroke();
        ctx.strokeStyle = 'rgba(201,166,90,0.35)'; ctx.lineWidth = 1; K.roundRect(ctx, bx + 7, by + 7, bw - 14, bh - 14, 13); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '34px "Cinzel Deco", Cinzel'; ctx.fillStyle = '#f2dfa8';
        ctx.fillText(String(spec.banner.head || '').slice(0, 42), w / 2, by + 40);
        ctx.font = '25px Cinzel'; ctx.fillStyle = '#e8d5a3';
        lines.forEach((ln, i) => ctx.fillText(String(ln).slice(0, 56), w / 2, by + 84 + i * 34));
        ctx.restore();
    }
    const x0 = 28, pw = w - 56, y0 = h - PANEL_H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.90)'; K.roundRect(ctx, x0, y0, pw, PANEL_H, 18); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = 3; K.roundRect(ctx, x0 + 5, y0 + 5, pw - 10, PANEL_H - 10, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)'; ctx.lineWidth = 1; K.roundRect(ctx, x0 + 11, y0 + 11, pw - 22, PANEL_H - 22, 9); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // left block: name + form
    ctx.fillStyle = '#ecd9a6';
    let tf = 40; ctx.font = `${tf}px "Cinzel Deco", Cinzel`;
    while (tf > 22 && ctx.measureText(String(spec.title || '')).width > 405) { tf -= 2; ctx.font = `${tf}px "Cinzel Deco", Cinzel`; }
    ctx.fillText(String(spec.title || '').slice(0, 26), x0 + 34, y0 + 50);
    ctx.font = '23px Medieval'; ctx.fillStyle = accent;
    ctx.fillText(String(spec.subtitle || '').slice(0, 34), x0 + 36, y0 + 92);
    if (spec.note) {
        ctx.font = '19px "IM Fell", Medieval'; ctx.fillStyle = '#b9a173';
        wrap(ctx, spec.note, 400).slice(0, 3).forEach((ln, i) => ctx.fillText(ln, x0 + 36, y0 + 130 + i * 26));
    }
    // middle: stat rows (label dim, value bright)
    const rows = (spec.rows || []).slice(0, 6);
    const mx = x0 + 460, colW = 245;
    rows.forEach(([lab, val], i) => {
        const cx = mx + (i % 2) * colW, cy = y0 + 46 + Math.floor(i / 2) * 50;
        ctx.font = '17px Medieval'; ctx.fillStyle = '#9c8455'; ctx.fillText(String(lab).toUpperCase(), cx, cy);
        ctx.font = '24px Cinzel'; ctx.fillStyle = '#ecd9a6'; ctx.fillText(String(val).slice(0, 14), cx, cy + 24);
    });
    // right: the commands that work here
    const acts = (spec.actions || []).slice(0, 5);
    const ax = x0 + pw - 420;
    ctx.strokeStyle = 'rgba(166,124,46,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax - 22, y0 + 28); ctx.lineTo(ax - 22, y0 + PANEL_H - 28); ctx.stroke();
    ctx.font = '17px Cinzel'; ctx.fillStyle = '#9c8455'; ctx.fillText('HERE YOU CAN', ax, y0 + 38);
    acts.forEach((a, i) => { ctx.font = '21px Medieval'; ctx.fillStyle = '#e8d5a3'; ctx.fillText(String(a).slice(0, 34), ax, y0 + 76 + i * 33); });
    if (spec.footer) {
        ctx.textAlign = 'center'; ctx.font = '17px Medieval'; ctx.fillStyle = '#7a663f';
        ctx.fillText(String(spec.footer).slice(0, 90), x0 + pw / 2, y0 + PANEL_H - 22);
    }
    ctx.restore();
}


// ── hunting-ground critters + campfire (procedural, no animal sprites in the pack) ──
function shade(ctx, x, y, rx, ry, a = 0.28) { ctx.save(); ctx.fillStyle = `rgba(20,14,6,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawDeer(ctx, x, y, s, flip = false, stag = true) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.05 * s, 1.15 * s, 0.26 * s);
    const body = '#a86a38', dark = '#6e4220', belly = '#e0c08e';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // far legs, body, near legs
    ctx.strokeStyle = dark; ctx.lineWidth = 0.13 * s;
    for (const [lx, o] of [[-0.62, 0.05], [0.55, -0.04]]) { ctx.beginPath(); ctx.moveTo(lx + 0.12 * s, -0.75 * s); ctx.lineTo(lx * s + o * s, -0.02 * s); ctx.stroke(); }
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.ellipse(0, -0.95 * s, 0.95 * s, 0.46 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0.05 * s, -0.72 * s, 0.7 * s, 0.17 * s, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 0.13 * s;
    for (const [lx, o] of [[-0.45, -0.04], [0.7, 0.05]]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.7 * s); ctx.lineTo(lx * s + o * s, -0.02 * s); ctx.stroke(); }
    // tail
    ctx.fillStyle = '#f4ead6'; ctx.beginPath(); ctx.ellipse(-0.98 * s, -1.08 * s, 0.1 * s, 0.17 * s, -0.5, 0, Math.PI * 2); ctx.fill();
    // neck + head
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.moveTo(0.65 * s, -1.25 * s); ctx.lineTo(1.0 * s, -1.95 * s); ctx.lineTo(1.28 * s, -1.85 * s); ctx.lineTo(1.0 * s, -1.0 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(1.28 * s, -1.9 * s, 0.3 * s, 0.17 * s, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1a0c'; ctx.beginPath(); ctx.arc(1.52 * s, -1.84 * s, 0.045 * s, 0, Math.PI * 2); ctx.fill();        // nose
    ctx.beginPath(); ctx.arc(1.3 * s, -1.95 * s, 0.035 * s, 0, Math.PI * 2); ctx.fill();                                    // eye
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(1.05 * s, -2.05 * s, 0.1 * s, 0.2 * s, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // ear
    if (stag) {                                                                                                              // antlers
        ctx.strokeStyle = '#e6d3a8'; ctx.lineWidth = 0.06 * s;
        const br = (bx, by, dx, dy) => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * s, by + dy * s); ctx.stroke(); };
        const ax = 1.12 * s, ay = -2.1 * s;
        br(ax, ay, -0.12, -0.55); br(ax - 0.12 * s, ay - 0.55 * s, -0.22, -0.18); br(ax - 0.12 * s, ay - 0.55 * s, 0.14, -0.2); br(ax - 0.05 * s, ay - 0.3 * s, 0.25, -0.12);
        br(ax + 0.12 * s, ay + 0.02 * s, 0.1, -0.5); br(ax + 0.22 * s, ay - 0.48 * s, 0.2, -0.14); br(ax + 0.22 * s, ay - 0.48 * s, -0.08, -0.22);
    }
    ctx.restore();
}
function drawBoar(ctx, x, y, s, flip = false) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.05 * s, 1.0 * s, 0.24 * s);
    const body = '#4a3526', dark = '#241810';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = dark; ctx.lineWidth = 0.14 * s;
    for (const lx of [-0.55, -0.25, 0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.5 * s); ctx.lineTo(lx * s, -0.02 * s); ctx.stroke(); }
    ctx.fillStyle = body; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.ellipse(0, -0.78 * s, 0.9 * s, 0.5 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5c4331'; ctx.beginPath(); ctx.ellipse(0.7 * s, -0.8 * s, 0.42 * s, 0.4 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();           // shoulder / head mass
    ctx.fillStyle = '#c99a86'; ctx.beginPath(); ctx.ellipse(1.12 * s, -0.7 * s, 0.17 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();           // snout
    ctx.strokeStyle = '#f1e6c8'; ctx.lineWidth = 0.06 * s; ctx.beginPath(); ctx.moveTo(1.02 * s, -0.62 * s); ctx.quadraticCurveTo(1.12 * s, -0.42 * s, 1.0 * s, -0.4 * s); ctx.stroke();   // tusk
    ctx.fillStyle = '#120a04'; ctx.beginPath(); ctx.arc(0.92 * s, -0.92 * s, 0.045 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.04 * s; ctx.beginPath(); ctx.moveTo(0.62 * s, -1.12 * s); ctx.lineTo(0.78 * s, -1.38 * s); ctx.lineTo(0.9 * s, -1.08 * s); ctx.closePath(); ctx.fill(); ctx.stroke();   // ear
    ctx.strokeStyle = dark; ctx.lineWidth = 0.07 * s; ctx.beginPath(); ctx.moveTo(-0.85 * s, -0.9 * s); ctx.quadraticCurveTo(-1.1 * s, -1.0 * s, -1.05 * s, -0.78 * s); ctx.stroke();   // tail
    ctx.restore();
}
function drawCampfire(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, -0.3 * s, 0.1 * s, 0, -0.3 * s, 2.4 * s);
    g.addColorStop(0, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.2 * s, 2.6 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 0.28 * s;
    ctx.beginPath(); ctx.moveTo(-0.7 * s, -0.05 * s); ctx.lineTo(0.7 * s, -0.35 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.7 * s, -0.35 * s); ctx.lineTo(0.7 * s, -0.05 * s); ctx.stroke();
    const flame = (w0, h0, col, dy) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w0, -0.25 * s + dy); ctx.quadraticCurveTo(-w0 * 1.1, -h0 * 0.55 + dy, 0, -h0 + dy); ctx.quadraticCurveTo(w0 * 1.1, -h0 * 0.55 + dy, w0, -0.25 * s + dy); ctx.closePath(); ctx.fill(); };
    flame(0.55 * s, 1.5 * s, '#e8541a', 0); flame(0.4 * s, 1.15 * s, '#ff9a2a', 0); flame(0.22 * s, 0.75 * s, '#ffe27a', 0);
    ctx.restore();
}

// ── per-structure close-up compositions ──
const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
const SMALL = ['tree_single_A', 'tree_single_B', 'rock_single_A', 'rock_single_B', 'rock_single_C'];
const ROCKY = new Set(['desert', 'volcanic']);

function buildScene(type, lvl, biome, seed) {
    const rng = mulberry32(seed);
    const team = TEAMS[Math.floor(rng() * 4)];
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome, oobWater: false, view: 'iso' });
    const cen = K.hexWorld(CC, CR);
    const P = (n, o = {}) => w.put(n, 0, 0, { wx: cen.x, wz: cen.z, ...o });
    const B = (n) => `building_${n}_${team}`;
    const has = (n) => K.hasSprite(n, 'iso');

    // pond: carve the lake first (direction varies per owner), before terrain resolves
    let pier = null, hunt = false;
    if (type === 'pond') {
        const ang = rng() * Math.PI * 2;
        const lw = { x: cen.x + Math.cos(ang) * 3.9, z: cen.z + Math.sin(ang) * 3.2 };
        let best = [CC, CR], bd = 1e9;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = K.hexWorld(c, r); const d = Math.hypot(q.x - lw.x, q.z - lw.z); if (d < bd) { bd = d; best = [c, r]; } }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const d = K.hexDist(best[0], best[1], c, r);
            if ((d <= 1 || (d === 2 && rng() < 0.3)) && K.hexDist(CC, CR, c, r) >= 3) { const k = w.cell[r][c]; k.water = true; k.lake = true; }
        }
        pier = { lake: best, lw };
    }
    w.resolve();

    // the ground the place stands on
    if (type !== 'pond') P('building_dirt', { layer: 'flat', sc: 2.3 });
    if (type === 'pond') {
        // shore cell = land cell nearest the lake centre, pier heads straight at the water
        const [lc, lr] = pier.lake;
        let sc = [CC, CR], sd = 1e9;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const k = w.cell[r][c]; if (k.water || k.river) continue;
            const d = K.hexDist(lc, lr, c, r); if (d < sd && K.hexDist(CC, CR, c, r) <= 4) { sd = d; sc = [c, r]; }
        }
        let pd = 0, pb = 1e9;
        for (let e = 0; e < 6; e++) { const nb = K.neighbor(sc[0], sc[1], e); const d = K.hexDist(nb[0], nb[1], lc, lr); if (d < pb) { pb = d; pd = e; } }
        const len = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
        w.resolve();
        { let cc = sc[0], rr = sc[1]; for (let i = 0; i < len; i++) { const nb = K.neighbor(cc, rr, pd); const kk = w.at(nb[0], nb[1]); if (kk) { kk.water = true; kk.lake = true; kk.river = false; } cc = nb[0]; rr = nb[1]; } }
        w.resolve();
        const cells = w.layPier(sc[0], sc[1], pd, len);
        const last = cells[cells.length - 1];
        if (last) { w.put('barrel', last[0], last[1], { dx: 0.15, dz: 0.2, h: 0.12, sc: 0.9 }); w.put('bucket_water', last[0], last[1], { dx: -0.3, dz: -0.2, h: 0.12 }); }
        const s0 = K.hexWorld(sc[0], sc[1]), s1 = K.hexWorld(...K.neighbor(sc[0], sc[1], pd));
        const vx = s1.x - s0.x, vz = s1.z - s0.z, px = -vz, pz = vx;
        const dry = (x, z) => { let bd2 = 1e9, ok = false; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = K.hexWorld(c, r); const d = Math.hypot(q.x - x, q.z - z); if (d < bd2) { bd2 = d; ok = !w.cell[r][c].water && !w.cell[r][c].river; } } return ok; };
        const put = (n, a, b, o = {}) => { for (let t = 0; t < 4; t++) { const x = s0.x - vx * (a + t * 0.7) + px * b, z = s0.z - vz * (a + t * 0.7) + pz * b; if (dry(x, z)) { w.put(n, 0, 0, { wx: x, wz: z, ...o }); return; } } };
        put('barrel', 1.0, 0.7, { sc: 1.1 }); put('crate_open', 0.8, -0.9, { sc: 1.1 }); put('bucket_water', 1.3, 0.1);
        put('sack', 1.7, 1.0); if (lvl >= 2) put('resource_lumber', 1.5, -1.5, { sc: 1.1 });
        if (lvl >= 3 && has(B('watermill'))) put(B('watermill'), 2.8, 0.3, { sc: 1.3 });
        else put('tent', 2.6, 0.4, { sc: 1.5 });
        const rl = ['waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B'];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.tile === 'hex_water' && k.lake && rng() < 0.2) w.put(rl[Math.floor(rng() * 4)], c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6, h: -0.2 }); }
        return { w, cen, team, water: true, focus: { x: cen.x * 0.35 + pier.lw.x * 0.65, z: cen.z * 0.35 + pier.lw.z * 0.65 } };
    }
    switch (type) {
        case 'mines': {
            const mt = biome === 'desert' || biome === 'volcanic' ? ['mountain_A', 'mountain_B', 'mountain_C'] : ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'];
            P(mt[0], { dx: -3.4, dz: -3.1, sc: 1.1 }); P(mt[1], { dx: 2.6, dz: -3.7, sc: 1.1 }); P(mt[2 % mt.length], { dx: -0.4, dz: -4.4, sc: 1.2 });
            if (has(B('mine'))) P(B('mine'), { sc: lvl === 1 ? 2.9 : lvl === 2 ? 3.2 : 3.5, dx: 0.1, dz: 0.1 });
            else P('struct_mine_cave', { sc: 3.0 });
            P('resource_stone', { dx: 2.3, dz: 1.6, sc: 1.5 }); P('resource_stone', { dx: 3.1, dz: 0.9, sc: 1.2 });
            P('wheelbarrow', { dx: 1.5, dz: 2.4, sc: 1.2 });
            if (lvl >= 2) { P('ladder', { dx: -2.2, dz: 0.8, sc: 1.4 }); P('crate_long_A', { dx: -2.9, dz: 1.7, sc: 1.2 }); }
            if (lvl >= 3) { P('building_scaffolding', { dx: -2.6, dz: -0.6, sc: 1.5, flip: true }); P('resource_lumber', { dx: 0.4, dz: 2.9, sc: 1.2 }); P('crate_B_big', { dx: -1.6, dz: 2.5, sc: 1.1 }); }
            break;
        }
        case 'shop': {
            P(B('market'), { sc: lvl === 1 ? 2.3 : lvl === 2 ? 2.7 : 3.1 });
            P('crate_A_big', { dx: 2.5, dz: 1.3, sc: 1.3 }); P('barrel', { dx: -2.4, dz: 1.5, sc: 1.4 }); P('sack', { dx: 3.1, dz: 0.5, sc: 1.3 });
            P('crate_open', { dx: -3.1, dz: 0.6, sc: 1.3 });
            if (lvl >= 2) { P('crate_long_A', { dx: -2.0, dz: 2.4, sc: 1.2 }); P('wheelbarrow', { dx: 1.0, dz: 2.6, sc: 1.3 }); P('flag_' + team, { dx: 2.7, dz: -1.6, sc: 1.3 }); P('flag_' + team, { dx: -2.7, dz: -1.6, sc: 1.3 }); }
            if (lvl >= 3) { P(B('market'), { dx: -4.4, dz: -0.8, sc: 1.8, flip: true }); P(B('market'), { dx: 4.6, dz: -0.6, sc: 1.8 }); P('crate_B_big', { dx: 3.4, dz: 2.2, sc: 1.3 }); P(B('well'), { dx: 0.2, dz: 3.4, sc: 1.8 }); }
            break;
        }
        case 'barracks': {
            if (lvl === 1) { P('tent', { sc: 3.0 }); P('tent', { dx: 3.0, dz: 0.8, sc: 2.2 }); P('tent', { dx: -3.0, dz: 0.9, sc: 2.2, flip: true }); }
            else P(B('barracks'), { sc: lvl === 2 ? 2.5 : 3.0 });
            P('weaponrack', { dx: -2.6, dz: 2.0, sc: 1.5 }); P('target', { dx: 2.8, dz: 2.1, sc: 1.4 }); P('target', { dx: 3.9, dz: 1.2, sc: 1.4 }); P('bucket_arrows', { dx: 1.8, dz: 2.9, sc: 1.3 });
            if (lvl >= 2) { P('flag_' + team, { dx: -1.6, dz: -2.3, sc: 1.4 }); P('flag_' + team, { dx: 1.8, dz: -2.3, sc: 1.4 }); }
            if (lvl >= 3) { P(B('tower_A'), { dx: -4.2, dz: -0.6, sc: 1.6 }); P(B('tower_A'), { dx: 4.3, dz: -0.8, sc: 1.6 }); P('weaponrack', { dx: -1.4, dz: 3.2, sc: 1.4 }); }
            break;
        }
        case 'hunting': {
            // a proper HUNTING GROUND (owner 2026-10-20): a stockaded camp in a forest clearing — hunter's lodge, archery range,
            // target lane, fire pit with log seats, drying racks, trophy-ready weapon racks — and game wandering the glade.
            P(has(B('archeryrange')) ? B('archeryrange') : B('barracks'), { sc: 2.2, dx: -1.6, dz: -1.2 });
            P(has('house_roundhut_thatch') ? 'house_roundhut_thatch' : 'tent', { dx: 3.0, dz: -1.5, sc: 2.1 });
            P('tent', { dx: 4.4, dz: 0.2, sc: 1.8, flip: true }); P('tent', { dx: 1.2, dz: -2.6, sc: 1.6 });
            // fire pit: ring of stones + two log seats
            for (let i = 0; i < 6; i++) { const a2 = i * Math.PI / 3; P(['rock_single_A', 'rock_single_B', 'rock_single_C'][i % 3], { dx: 0.9 + Math.cos(a2) * 0.62, dz: 1.5 + Math.sin(a2) * 0.5, sc: 0.8 }); }
            P('resource_lumber', { dx: -0.4, dz: 1.9, sc: 0.85 }); P('resource_lumber', { dx: 2.2, dz: 1.2, sc: 0.85, flip: true });
            // target lane + firing line
            for (let i = 0; i < 4; i++) P('target', { dx: -3.2 - i * 0.55, dz: 2.6 + i * 0.95, sc: 1.4 });
            P('bucket_arrows', { dx: -1.4, dz: 2.2, sc: 1.4 }); P('weaponrack', { dx: -2.4, dz: 1.2, sc: 1.4 }); P('weaponrack', { dx: 1.9, dz: -0.4, sc: 1.3, flip: true });
            // drying racks + butchering table
            P('pallet', { dx: 4.0, dz: 2.1, sc: 1.2 }); P('crate_long_A', { dx: 3.2, dz: 1.9, sc: 1.1 }); P('barrel', { dx: 2.6, dz: 2.5, sc: 1.2 });
            P('tree_single_A_cut', { dx: -0.6, dz: -3.4, sc: 1.2 }); P('tree_single_B_cut', { dx: 5.0, dz: -1.0, sc: 1.1 });
            // stockade behind the camp, with a gate
            for (let i = -5; i <= 5; i++) P(i === 1 ? 'fence_wood_straight_gate@0' : 'fence_wood_straight@0', { dx: i * 1.15 - 0.4, dz: -4.4, sc: 1.0 });
            // canvas overlays: the campfire flame + wandering game
            const wp = (dx, dz) => ({ x: cen.x + dx, z: cen.z + dz });
            const fire = wp(0.9, 1.5);
            w.overlay((ctx, p, k) => drawCampfire(ctx, p.x, p.y, 44 * k * 2 / 1.5), 0, 0, { dx: fire.x, dz: fire.z });
            const deer = [[-0.6, 4.9, false, true, 44], [6.6, 3.9, true, false, 40], [5.4, -3.2, true, true, 46]];
            for (const [dx, dz, fl, st2, sz] of deer) { const q = wp(dx, dz); w.overlay((ctx, p, k) => drawDeer(ctx, p.x, p.y, sz * k * 2 / 1.5, fl, st2), 0, 0, { dx: q.x, dz: q.z }); }
            { const q = wp(-6.6, 0.4); w.overlay((ctx, p, k) => drawBoar(ctx, p.x, p.y, 40 * k * 2 / 1.5, false), 0, 0, { dx: q.x, dz: q.z }); }
            hunt = true;
            break;
        }
        case 'blacksmith': {
            P(B('blacksmith'), { sc: lvl === 1 ? 2.4 : lvl === 2 ? 2.8 : 3.2 });
            P('weaponrack', { dx: -2.7, dz: 1.8, sc: 1.5 }); P('resource_stone', { dx: 2.7, dz: 1.9, sc: 1.4 }); P('crate_A_small', { dx: 3.1, dz: 0.4, sc: 1.2 });
            if (lvl >= 3) { P('wheelbarrow', { dx: 1.2, dz: 2.8, sc: 1.3 }); P('barrel', { dx: -1.6, dz: 2.9, sc: 1.3 }); }
            break;
        }
        case 'medbay': {
            if (has('struct_med_tent')) P(['struct_med_tent', 'struct_med_infirmary', 'struct_med_sanatorium'][lvl - 1], { sc: lvl === 1 ? 3.4 : lvl === 2 ? 3.0 : 2.8 });
            else P(lvl === 1 ? 'tent' : B('church'), { sc: 2.6 });
            P('bucket_water', { dx: -2.6, dz: 1.8, sc: 1.4 }); P('sack', { dx: 2.7, dz: 1.8, sc: 1.4 });
            if (lvl >= 3) { P('flag_' + team, { dx: 3.2, dz: 0.3, sc: 1.4 }); P(B('well'), { dx: -3.4, dz: 0.2, sc: 1.8 }); }
            break;
        }
        case 'alchemy': {
            if (lvl === 1) { P('barrel', { sc: 3.0 }); P('crate_open', { dx: -2.4, dz: 1.2, sc: 1.4 }); }
            else P(B('tavern'), { sc: lvl === 2 ? 2.6 : 3.0 });
            P('bucket_water', { dx: 2.6, dz: 1.7, sc: 1.4 });
            if (lvl >= 3) P(B('windmill'), { dx: -4.2, dz: -0.8, sc: 1.8 });
            break;
        }
        default: P(B('home_A'), { sc: 2.4 }); break;
    }
    // wilds ring: trees / rocks beyond ~4.5 cells so the scene sits in its biome
    const trees = hunt ? TREES : (ROCKY.has(biome) ? SMALL : TREES);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = K.hexDist(CC, CR, c, r), k = w.cell[r][c];
        if (d < (hunt ? 5 : 4) || k.water || k.river) continue;
        if (rng() < (hunt ? (d >= 6 ? 0.97 : 0.88) : (d >= 7 ? 0.7 : 0.45))) w.put(trees[Math.floor(rng() * trees.length)], c, r, { flip: rng() < 0.5, sc: 0.95 + rng() * 0.2 });
    }
    return { w, cen, team, water: false };
}

const BD = { isle: { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } };

/**
 * renderStructureCard({ type, level, biome, seed, spec }) → { buffer, contentType }
 * spec → drawPanel(); everything in spec is part of the cache key.
 */
async function renderStructureCard(o = {}) {
    const type = String(o.type || 'mines'), lvl = Math.max(1, Math.min(3, o.level || 1));
    const biome = o.biome || 'isle';
    const seed = hashStr(`${o.seed || 'x'}:${type}`);
    const key = hashStr(JSON.stringify(['sc1', type, lvl, biome, seed, o.spec || {}]));
    return mediaCache.cached('structcard', key, async () => {
        fonts();
        const { createCanvas } = require('canvas');
        const { w, cen, focus } = buildScene(type, lvl, biome, seed);
        const bi = (K.biomeInfo('iso').biomes || {})[biome];
        const bd = biome === 'isle' ? BD.isle : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : { top: '#356f6a', mid: '#1f4a4c', bot: '#0d2527' };
        w.layoutFixed(W, H, (focus || cen).x, (focus || cen).z, W / 2, (H - PANEL_H) * 0.52);
        const cv = createCanvas(W, H), ctx = cv.getContext('2d');
        await w.draw(ctx, { drawBackdrop: (c2) => { const g = c2.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bd.top); g.addColorStop(0.5, bd.mid); g.addColorStop(1, bd.bot); c2.fillStyle = g; c2.fillRect(0, 0, W, H); } });
        // soft vignette so the panel + ribbon always read
        const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.45, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        drawPanel(ctx, W, H, o.spec || {});
        return { buffer: cv.toBuffer('image/jpeg', { quality: 0.9 }), contentType: 'image/jpeg' };
    });
}

module.exports = { renderStructureCard, drawPanel, drawDeer, drawBoar, drawCampfire, PANEL_H, W, H };
