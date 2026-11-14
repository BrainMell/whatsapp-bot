'use strict';
// 🏰 3D HEX SCENES for conquest, built on the SAME engine, camera and sprites as the guild kingdom, player base and
// world atlas (world/kingdom3d.js: KayKit Medieval Hexagon pre-baked iso sprites, 'top' camera pitch 40, biome recolours).
//   siegeScene(b)   — the Wall Breach diorama: wall/gate/towers on the right, invaders (real character sprites) on the left
//   warMapScene(snap) — the realm war map: every conquest tile IS one hex with its own 3D ground + landmark
const K = require('../../world/kingdom3d'); const SP = require('./sprites'); const art = require('./art'); const envCards = require('./envCards'); const map = require('./mapgen');
const COL = ['blue', 'red', 'green', 'yellow']; const colOf = (i) => COL[((i == null || i < 0 ? 3 : i) % 4 + 4) % 4];
const HEXCOL = ['#3a7bd5', '#d5483a', '#4bb26a', '#e0b030', '#9a5cd0', '#e07a30', '#5c6a78', '#8a5a3a'];
const biomeOf = (b) => (b === 'isle' ? null : b);
const ctxOf = (W, H) => { const { createCanvas } = require('canvas'); const c = createCanvas(W, H); return { c, ctx: c.getContext('2d') }; };
const TURRET_FX = { flame: '#ff7a2a', arc: '#6fd3ff', frost: '#a8e4ff', ballista: '#d8c690' };

function scatter(hw, rng, cells, kinds, density) { for (const [c, r] of cells) { if (rng() > density) continue; const n = kinds[Math.floor(rng() * kinds.length)]; hw.put(n, c, r, { dx: (rng() - 0.5) * 0.7, dz: (rng() - 0.5) * 0.5, sort: 0.1 + rng() * 0.05, sc: 0.8 + rng() * 0.35, flip: rng() < 0.5 }); } }

const nb = (cell, d) => K.neighbor(cell[0], cell[1], d);
async function siegeScene(b, opts = {}) {
    const W = 960, H = 660; const { c, ctx } = ctxOf(W, H); const card = envCards.BY_ID[b.env] || envCards.BY_ID.clear; const rng = art.RNG(b.id + ':' + b.tileId);
    const hw = new K.HexWorld(20, 18, { biome: biomeOf(b.biome), scale: 0.7, oobWater: false });
    // the wall runs straight across the field (E-W): invaders in front (south), the stronghold behind it (north)
    const chain = []; let cur = [6, 8]; for (let i = 0; i < 7; i++) { chain.push(cur); cur = nb(cur, 0); }
    const [tL, w1, w2, gt, w3, w4, tR] = chain;
    { const gw0 = K.hexWorld(gt[0], gt[1]); hw.layoutFixed(W, H, gw0.x, gw0.z, 480, 335); }
    const scr = (cc, rr) => { const w = K.hexWorld(cc, rr); return hw.proj(w.x, w.z, 0); };
    if (card.id === 'tide') hw.fillWater((cc, rr) => { const p = scr(cc, rr); return p.x < 380 && p.y > 470; });
    { // a trampled road from the gate out to the field (real KayKit road tiles)
        let rc = gt; for (let i = 0; i < 9; i++) { rc = nb(rc, i % 2 ? 1 : 2); const k = hw.at(rc[0], rc[1]); if (k && !k.water) k.road = true; }
        const k0 = hw.at(gt[0], gt[1]); if (k0) k0.road = true; }
    hw.resolve(); const dC = colOf(b.defIdx), aC = colOf(b.attIdx); const S = b.sections; const has = !!b.wallType;
    const probe = new K.HexWorld(5, 3, {}); probe.layWall([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], { closed: false, gates: new Set(['2,1']), outside: true });
    const WN = probe.objs.find((o) => o.x === K.hexWorld(1, 1).x).name, GN = probe.objs.find((o) => o.x === K.hexWorld(2, 1).x).name;
    const WS = 1.0, TS = 1.25; // imposing, not toy-sized
    const putPiece = (name, cell, sec, sc, tower, key) => { if (!sec) return; const dead = sec.hp <= 0; const frac = sec.hp / sec.max;
        if (dead) { for (let i = 0; i < 5; i++) hw.put(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'][i], cell[0], cell[1], { dx: (rng() - 0.5) * 1.3, dz: (rng() - 0.5) * 0.9, sort: 0.3, sc: 1.6 + rng() * 0.7 }); if (tower) hw.put('building_destroyed', cell[0], cell[1], { sort: 0.35, sc: 1.1 }); }
        else { hw.put(name, cell[0], cell[1], { sort: 0.3, sc }); if (!tower) hw.overlay((cx, p, k) => { cx.save(); cx.translate(p.x, p.y - (tower ? 150 : 52) * k * 1.6); art.damage(cx, -40, -30, 80, 70, 1 - frac, b.id + key + b.round); cx.restore(); }, cell[0], cell[1]); } };
    // interior: the stronghold behind the wall, dressed by what this tile IS (NE of the gate, two hexes deep)
    const tk = b.kind || 'fortress'; const in1 = nb(gt, 5), in2 = nb(in1, 4), in3 = nb(in1, 0), in4 = nb(in2, 3);
    if (tk === 'keep') hw.put(`building_castle_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.1 });
    else if (tk === 'fortress') { hw.put(`building_barracks_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.35 }); hw.put('weaponrack', in3[0], in3[1], { sort: 0.2, sc: 1.2 }); hw.put('target', in4[0], in4[1], { sort: 0.2, sc: 1.2 }); }
    else if (tk === 'ley_gate') { hw.put('struct_gate_0', in2[0], in2[1], { sort: 0.2, sc: 1.4 }); hw.put(`building_church_${dC}`, in3[0], in3[1], { sort: 0.2, sc: 1.1 }); }
    else if (tk === 'pass') { hw.put('mountain_B', in2[0], in2[1], { sort: 0.2, sc: 1.5 }); hw.put('mountain_A_grass', in3[0], in3[1], { sort: 0.2, sc: 1.2 }); hw.put('weaponrack', in1[0], in1[1], { sort: 0.2 }); }
    else if (tk === 'titan') { hw.put('mountain_C', in2[0], in2[1], { sort: 0.1, sc: 1.8 }); hw.put('mountain_A', in3[0], in3[1], { sort: 0.1, sc: 1.4 }); }
    else { hw.put(`tent_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.2 }); }
    const innerCells = []; for (const cell of chain) { const a = nb(cell, 5); innerCells.push(a, nb(a, 5), nb(a, 0)); }
    scatter(hw, rng, innerCells.filter((x) => ![in1, in2, in3, in4].some((y) => y[0] === x[0] && y[1] === x[1])), ['tree_single_A', 'tree_single_B', 'rock_single_E', 'trees_A_small'], 0.35);
    // the wall itself (real KayKit stone wall / gate / towers in the defender's colour)
    if (has) {
        putPiece(WN, w1, S.curtain, WS, false, 'c1'); putPiece(WN, w2, S.curtain, WS, false, 'c2'); putPiece(WN, w3, S.curtain, WS, false, 'c3'); putPiece(WN, w4, S.curtain, WS, false, 'c4');
        putPiece(GN, gt, S.gate, WS, false, 'g');
        const turs = b.turrets || []; const onL = turs.filter((t) => t.mount === 'towerL'), onR = turs.filter((t) => t.mount === 'towerR'), onG = turs.filter((t) => t.mount === 'gate');
        const tname = (list) => (list.some((t) => t.kind === 'ballista') ? `building_tower_catapult_${dC}` : list.length ? `building_tower_B_${dC}` : `building_tower_A_${dC}`);
        putPiece(tname(onL), tL, S.towerL, TS, true, 'tl'); putPiece(tname(onR), tR, S.towerR, TS, true, 'tr');
        if (onG.length && S.gate && S.gate.hp > 0) hw.put('weaponrack', in1[0], in1[1], { sort: 0.5, sc: 1.4 });
        [[onL, tL, 120], [onR, tR, 120], [onG, in1, 34]].forEach(([list, cell, hh]) => list.forEach((t, i) => hw.overlay((cx, p, k) => { cx.save(); cx.globalAlpha = t._silenced ? 0.3 : 1; const x = p.x + (i - (list.length - 1) / 2) * 30, y = p.y - hh * k * 1.6 - 6; const g = cx.createRadialGradient(x, y, 1, x, y, 15); g.addColorStop(0, TURRET_FX[t.kind]); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, 15, 0, 7); cx.fill(); cx.fillStyle = '#fff'; cx.font = 'bold 10px sans-serif'; cx.textAlign = 'center'; cx.shadowColor = '#000'; cx.shadowBlur = 3; cx.fillText(t.kind.slice(0, 3).toUpperCase() + t.lvl, x, y + 3); cx.restore(); }, cell[0], cell[1])));
    }
    // exterior: what the surrounding MAP really is (neighbour tile kinds → forests, ridges, ore, farms on the invaders' side)
    const sr = b.surround || {}; const outer = []; for (let r = 0; r < 18; r++) for (let cc = 0; cc < 20; cc++) { const p = scr(cc, r); if (p.y > 330 && p.y < 760) outer.push([cc, r]); }
    const dens = (n, d) => ((sr[n] || 0) > 0 ? Math.min(0.85, 0.2 + 0.17 * sr[n]) : d);
    const free = outer.filter((x) => { const p = scr(x[0], x[1]); return !(p.x > 90 && p.x < 870 && p.y > 400 && p.y < 650); }); // keep the invaders' field open
    scatter(hw, rng, free, ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'], dens('forest', 0.16));
    scatter(hw, rng, free, ['mountain_A_grass', 'hills_A', 'hill_single_B', 'hills_B_trees'], dens('pass', 0.05));
    scatter(hw, rng, free, ['resource_stone', 'rock_single_A', 'rock_single_C'], dens('gem_vein', 0.07));
    scatter(hw, rng, free, ['house_cottage', 'building_well', 'house_roundhut_thatch'], sr.village ? 0.28 : 0);
    { const ring = []; for (let r = 0; r < 18; r++) for (let cc = 0; cc < 20; cc++) { const p = scr(cc, r); if (p.y < 150 || p.x > 900 || p.x < 30 || p.y > 700) ring.push([cc, r]); } scatter(hw, rng, ring, ['mountain_A_grass', 'mountain_B_grass', 'hills_A_trees', 'hills_B_trees', 'trees_A_large', 'trees_B_large'], 0.5); }
    { const camp = nb(nb(nb(gt, 2), 1), 3); const c2 = nb(camp, 2); hw.put(`flag_${aC}`, camp[0], camp[1], { dx: 0.5, sort: 0.3, sc: 1.6 }); hw.put(`tent_${aC}`, nb(c2, 3)[0], nb(c2, 3)[1], { sort: 0.3, sc: 1.3 }); hw.put('crate_A_big', c2[0], c2[1], { dx: -0.4, sort: 0.3, sc: 1.2 }); hw.put('barrel', c2[0], c2[1], { dx: 0.5, sort: 0.3, sc: 1.2 }); hw.put('weaponrack', camp[0], camp[1], { dx: -0.6, dz: 0.3, sort: 0.3, sc: 1.3 }); hw.put(`flag_${dC}`, gt[0], gt[1], { dx: 0.2, dz: -0.2, sort: 0.6, sc: 1.8 }); }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, card.palette[0]); g.addColorStop(1, card.palette[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    await hw.draw(ctx, { drawBackdrop: async (cx) => { await K.paintBackdrop(cx, W, H, map.hashStr(b.id), { top: card.palette[0], mid: card.palette[1], bot: '#10161c', clouds: 4, cloudScale: 0.7 }); } });
    const P = (cell, h = 0) => { const w = K.hexWorld(cell[0], cell[1]); return hw.proj(w.x, w.z, h); };
    const fireImg = await SP.asset('fx/fire/1/Fire-Wrath__05.png');
    const burn = (cell, key, size = 150) => { if (b.burning[key] && fireImg) { const p = P(cell, 0.4); ctx.drawImage(fireImg, p.x - size / 2, p.y - size * 0.9, size, size); } };
    [w1, w2, w3, w4].forEach((cl) => burn(cl, 'curtain', 80)); burn(gt, 'gate', 110); burn(tL, 'towerL', 130); burn(tR, 'towerR', 130);
    const reticle = (cell, hh) => { const p = P(cell, 0); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - hh, 30, 0, 7); ctx.moveTo(p.x - 40, p.y - hh); ctx.lineTo(p.x + 40, p.y - hh); ctx.moveTo(p.x, p.y - hh - 40); ctx.lineTo(p.x, p.y - hh + 40); ctx.stroke(); };
    if (has) { if (b.weak === 'gate' && S.gate.hp > 0) reticle(gt, 60); if (b.weak === 'towerL' && S.towerL.hp > 0) reticle(tL, 110); if (b.weak === 'towerR' && S.towerR.hp > 0) reticle(tR, 110); if (b.weak === 'curtain' && S.curtain.hp > 0) { reticle(w1, 36); reticle(w4, 36); } }
    if (has) { for (const mn of b.mines.slice(0, 2)) { const cell = mn.s === 'gate' ? gt : mn.s === 'towerL' ? tL : mn.s === 'towerR' ? tR : w3; const p = P(cell, 0); ctx.fillStyle = '#e6b93b'; ctx.font = 'bold 12px sans-serif'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('SAPPERS', p.x - 28, p.y + 34); ctx.shadowBlur = 0; }
        // HUD: the four wall sections
        if (!opts.noHud) {
        const rows = [['Gate', S.gate], ['Left tower', S.towerL], ['Curtain wall', S.curtain], ['Right tower', S.towerR]]; const bw = 200, bx0 = (W - (bw * 4 + 18 * 3)) / 2, by0 = H - 52;
        ctx.fillStyle = 'rgba(10,8,5,.72)'; ctx.fillRect(bx0 - 12, by0 - 20, bw * 4 + 18 * 3 + 24, 56);
        rows.forEach(([n, sec], i) => { const x = bx0 + i * (bw + 18); ctx.fillStyle = sec.hp > 0 ? '#e8dcc0' : '#e86a5a'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${n}  ${sec.hp}/${sec.max}`, x, by0 - 4); art.bar(ctx, x, by0 + 2, bw, sec.hp / sec.max); });
        const tl = b.turrets.filter((t) => !t._silenced); if (b.turrets.length) { ctx.fillStyle = '#c9b27c'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${b.wallType.toUpperCase()} WALL · turrets ${tl.length}/${b.turrets.length}`, bx0 + bw * 4 + 54, by0 + 30); ctx.textAlign = 'left'; } }
        }
    // garrison golems (bot enemy sprites) + the invaders: their REAL characters, left of the wall, facing it
    const realm = (b.tileId || '').split(':')[0]; const isTitan = b.isTitan; const gs = b.golems.filter((x) => x.hp > 0); const GH = { clay: 92, stone: 100, iron: 108, rune: 116 };
    for (const [i, gm] of b.golems.entries()) { if (gm.hp <= 0 || b.phase === 'wall') continue; const titan = isTitan && i === 0 && b.phase !== 'wall'; const im = titan ? await SP.cq(`golems/titan_${realm}.png`) : await SP.cq(`golems/${gm.kind}.png`);
        let x, y, h, a = 1; if (b.phase === 'wall') { const p = P(in1, 0); const p2 = P(in3, 0); const pg = P(in1, 0); x = pg.x + (i - (b.golems.length - 1) / 2) * 34; y = pg.y + 24; h = 54; a = 0.9; } else { const idx = gs.indexOf(gm); const pg2 = P(gt, 0); x = pg2.x + (idx - (gs.length - 1) / 2) * 96; y = pg2.y + 30 + (idx % 2) * 16; h = titan ? 190 : (GH[gm.kind] || 100); }
        SP.standing(ctx, im, 'gol' + gm.kind + (titan ? realm : ''), x, y, h, { alpha: a, flip: true, glow: b.status && b.status.golemSurge > 0 ? '#7ed6c1' : null });
        if (b.phase !== 'wall') { art.bar(ctx, x - 34, y + 6, 68, gm.hp / gm.max, '#d9473a'); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(`[${i + 1}] ${titan ? 'TITAN' : gm.kind} ${gm.hp}/${gm.max}`, x, y + 26); ctx.shadowBlur = 0; ctx.textAlign = 'left'; } }
    const ms = Object.values(b.party); const per = Math.min(ms.length, 10); const step = Math.min(70, 780 / Math.max(1, per)); const ch = 54;
    for (const [i, m] of ms.entries()) { const row = Math.floor(i / 10), ci = i % 10; const x = 480 + (ci - (Math.min(ms.length - row * 10, 10) - 1) / 2) * step; const y = 520 + row * 52 + (ci % 2) * 14; const im = m.sprite ? await SP.character(m.sprite) : null; if (im) SP.standing(ctx, im, 'ch' + m.sprite, x, y, ch, { alpha: m.hp > 0 ? 1 : 0.28, smooth: true });
        ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(m.name.slice(0, 10), x, y + 11); ctx.shadowBlur = 0; art.bar(ctx, x - 26, y + 15, 52, m.hp / m.max); if (m.hp <= 0) { ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e86a5a'; ctx.fillText('DOWN', x, y + 34); }
        if (m.hp > 0) { ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = m.action ? '#8be78b' : '#aaa'; ctx.fillText(m.action ? m.action.toUpperCase() : '...', x, y - ch - 4); } ctx.textAlign = 'left'; }
    ctx.fillStyle = art.hex(card.palette[0], ['night', 'eclipse'].includes(card.id) ? 0.3 : ['whiteout', 'fog'].includes(card.id) ? 0.2 : 0.1); ctx.fillRect(0, 0, W, H);
    art.weather(ctx, W, H, card, 300, b.id + ':' + b.round);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    return { c, ctx, W, H, card };
}


// scenery by the tile's TERRAIN (coherent regions: mountains, hills, farmland, marsh, plains, woods) — not just trees
function terrainDress(t, put, r2, detail, over) {
    const k = r2(); const j = () => ({ dx: (r2() - 0.5) * 0.8, dz: (r2() - 0.5) * 0.6 });
    switch (t.terrain) {
        case 'mountain': if (k < 0.5) put(['mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass', 'mountain_A_grass_trees'][Math.floor(r2() * 4)], { sc: over ? 0.95 : 0.9 }); else { put(['hill_single_B', 'hill_single_C', 'hills_A_trees'][Math.floor(r2() * 3)], { ...j(), sc: 0.9 }); if (detail) put('rock_single_B', { ...j(), sc: 0.8 }); } break;
        case 'hills': put(['hill_single_A', 'hill_single_B', 'hill_single_C', 'hills_A_trees', 'hills_B_trees', 'hill_single_A'][Math.floor(r2() * 6)], { ...j(), sc: 0.9 }); if (detail && k < 0.4) put('rock_single_A', { ...j(), sc: 0.7 }); break;
        case 'farm': if (!detail) break; if (k < 0.16) put(`building_windmill_${['blue', 'green', 'red', 'yellow'][Math.floor(r2() * 4)]}`, { sc: 0.85 }); else if (k < 0.34) put(`building_home_${r2() < 0.5 ? 'A' : 'B'}_${['blue', 'green', 'red', 'yellow'][Math.floor(r2() * 4)]}`, { dx: -0.2, sc: 0.8 }); else if (k < 0.62) put('tree_single_A_cut', { ...j(), sc: 0.85 }); break;
        case 'marsh': if (!detail) break; put(k < 0.5 ? 'tree_single_B_cut' : 'rock_single_E', { ...j(), sc: 0.9 }); if (k < 0.3) put('trees_B_cut', { ...j(), sc: 0.8 }); break;
        case 'forest': put('trees_A_medium', { ...j(), sc: 0.9 }); break;
        default: if (!detail) break; if (k < 0.18) put(['tree_single_A', 'tree_single_B'][Math.floor(r2() * 2)], { ...j(), sc: 0.9 }); else if (k < 0.28) put(['rock_single_A', 'rock_single_C', 'hill_single_A'][Math.floor(r2() * 3)], { ...j(), sc: 0.9 }); else if (k < 0.34) put('trees_A_small', { ...j(), sc: 0.9 });
    }
}
// ── realm war map ───────────────────────────────────────────────────────────────────────────────
// Every conquest tile is ONE hex of the KayKit world (same engine/camera as the guild kingdom). Sea cells (off the canonical
// land mask) are real water hexes. snap.view = null → a detailed window around the viewer; 'overview' → the whole realm.
async function warMapScene(snap) {
    const g = map.generate(snap.seed); const realm = g.realms.find((r) => r.key === snap.realm); const biome = realm.biome; const over = snap.view === 'overview';
    let x0 = 0, y0 = 0, vw = map.W, vh = map.H;
    if (!over) { vw = snap.vw || 27; vh = snap.vh || 20; const q = map.parse(snap.me.at); x0 = Math.max(0, Math.min(map.W - vw, q.x - (vw >> 1))); y0 = Math.max(0, Math.min(map.H - vh, q.y - (vh >> 1))); if (y0 & 1) y0--; }
    const SC = over ? 0.085 : 0.5; const PANEL = over ? 230 : 270; const detail = !over;
    const hw = new K.HexWorld(vw, vh, { biome: biomeOf(biome), scale: SC, oobWater: true });
    const lay = hw.layout({ left: 16, right: 16, top: 70, bottom: 24 }); const W = lay.W + PANEL, H = lay.H;
    const { c, ctx } = ctxOf(W, H); const rng = art.RNG(snap.seed + snap.realm);
    const byKey = realm; const cont = require('../../world/continents').BY_KEY ? null : null;
    for (let r = 0; r < vh; r++) for (let cc = 0; cc < vw; cc++) if (!g.tiles.has(map.tileId(snap.realm, x0 + cc, y0 + r))) hw.at(cc, r).water = true;
    hw.resolve();
    const names = snap.guilds.map((x) => x.name); const gi = (n) => names.indexOf(n); const colHex = (n) => HEXCOL[Math.max(0, gi(n)) % HEXCOL.length]; const colName = (n) => colOf(Math.max(0, gi(n)));
    const by = Object.fromEntries(snap.tiles.map((t) => [t.id, t])); const inWin = (x, y) => x >= x0 && y >= y0 && x < x0 + vw && y < y0 + vh;
    const LM = { keep: 1, fortress: 1, titan: 1, ley_gate: 1, shrine: 1, ruins: 1, pass: 1 };
    for (let y = y0; y < y0 + vh; y++) for (let x = x0; x < x0 + vw; x++) {
        const t = g.tiles.get(map.tileId(snap.realm, x, y)); if (!t) continue; const lx = x - x0, ly = y - y0; const o = by[t.id] || {}; const own = o.owner; const oc = own ? colName(own) : null; const r2 = art.RNG(t.id);
        const big = over ? 3.2 : 1; const put = (n, e = {}) => hw.put(n, lx, ly, Object.assign({ sort: 0.2 }, e, e.sc ? { sc: e.sc * big } : {}));
        if (over && !LM[t.kind] && !own) { terrainDress(t, put, r2, false, true); continue; }
        switch (t.kind) {
            case 'keep': put(own ? `building_castle_${oc}` : 'building_castle_blue', { sc: 1.0 }); break;
            case 'fortress': put(`building_barracks_${oc || 'red'}`, { dx: -0.25, sc: 1 }); if (detail) put(`building_tower_A_${oc || 'red'}`, { dx: 0.5, dz: -0.2, sc: 0.9 }); break;
            case 'ley_gate': put('struct_gate_0', { sc: 0.9 }); break;
            case 'pass': put('mountain_A_grass', { sc: 0.9 }); if (detail) put('mountain_B_grass', { dx: 0.6, dz: 0.4, sc: 0.6 }); break;
            case 'titan': put('mountain_C_grass', { sc: 1.0 }); if (detail) put('rock_single_D', { dx: -0.7, dz: 0.5, sc: 0.9 }); break;
            case 'ruins': put('building_destroyed', { sc: 0.9 }); break;
            case 'shrine': put(`building_shrine_${oc || 'green'}`, { sc: 0.9 }); break;
            case 'gem_vein': put('rock_single_C', { sc: 1.0 }); if (detail) { put('rock_single_D', { dx: 0.5, dz: 0.3, sc: 0.7 }); put('crystal_A', { dx: -0.4, dz: 0.2, sc: 0.8 }); } break;
            case 'village': { const hn = K.houseName(r2, biome, {}); if (hn) put(hn, { sc: 0.95 }); if (detail) { put('tree_single_A', { dx: 0.6, dz: 0.45, sc: 0.7 }); if (r2() < 0.5) put('building_well', { dx: -0.6, dz: 0.4, sc: 0.8 }); } break; }
            case 'forest': put(r2() < 0.5 ? 'trees_A_large' : 'trees_B_large', { dx: -0.1, sc: 0.95 }); if (detail) put('trees_B_medium', { dx: 0.5, dz: 0.4, sc: 0.8 }); break;
            default: terrainDress(t, put, r2, detail, over);
        }
        if (own && detail && !['keep', 'fortress', 'village', 'shrine'].includes(t.kind)) hw.put(`flag_${colName(own)}`, lx, ly, { dx: 0.7, dz: -0.35, sort: 0.3, sc: 0.9 });
        if (own) hw.underlay((cx) => { const poly = hw.cellPoly(lx, ly, 0.02, over ? 0 : 0.06); cx.beginPath(); poly.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.closePath(); cx.fillStyle = art.hex(colHex(own), over ? 0.85 : 0.62); cx.fill(); if (!over) { cx.lineWidth = 2; cx.strokeStyle = art.hex(colHex(own), 0.9); cx.stroke(); } }, lx, ly);
        if (o.shield && detail) hw.overlay((cx) => { const w = K.hexWorld(lx, ly); const p = hw.proj(w.x, w.z, 0.2); cx.fillStyle = '#fff'; cx.font = 'bold 13px sans-serif'; cx.textAlign = 'center'; cx.fillText('🛡', p.x, p.y - 4); }, lx, ly);
    }
    // province borders along hex edges
    hw.overlays.push({ x: 0, z: 0, y: 0, fn: (cx) => { cx.save(); cx.lineWidth = over ? 1.6 : 3; cx.strokeStyle = 'rgba(20,10,0,.75)'; cx.lineCap = 'round';
        for (let y = y0; y < y0 + vh; y++) for (let x = x0; x < x0 + vw; x++) { if (!g.tiles.has(map.tileId(snap.realm, x, y))) continue; const poly = hw.cellPoly(x - x0, y - y0, 0.03); const me = map.provOf(x, y); for (let d = 0; d < 6; d++) { const n = K.neighbor(x, y, d); if (!g.tiles.has(map.tileId(snap.realm, n[0], n[1])) || map.provOf(n[0], n[1]) === me) continue; const a = poly[d], b2 = poly[(d + 1) % 6]; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b2.x, b2.y); cx.stroke(); } } cx.restore(); } });
    hw.W = lay.W; hw.H = H;
    await hw.draw(ctx, { drawBackdrop: async (cx) => { cx.fillStyle = '#14100b'; cx.fillRect(0, 0, W, H); await K.paintBackdrop(cx, lay.W, H, map.hashStr(snap.seed + snap.realm), { top: '#3a4a60', mid: '#8a7a68', bot: '#1c1812', clouds: 0, cloudScale: 0.6 }); } });
    const P = (id) => { const q = map.parse(id); if (q.realm !== snap.realm || !inWin(q.x, q.y)) return null; const w = K.hexWorld(q.x - x0, q.y - y0); return hw.proj(w.x, w.z, 0.1); };
    for (const m of snap.marches || []) { const a = P(m.from), b2 = P(m.to); if (!a || !b2) continue; ctx.strokeStyle = '#fff'; ctx.lineWidth = over ? 2 : 3.5; ctx.setLineDash([9, 6]); ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b2.x, b2.y, over ? 3 : 6, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    if (detail) (snap.targets || []).forEach((id, i) => { const p = P(id); if (!p) return; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(p.x, p.y - 6, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#ffe28a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), p.x, p.y - 2); });
    const me = P(snap.me.at); if (me) { if (over) { ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(me.x, me.y, 9, 0, 7); ctx.stroke(); } else { const im = snap.me.sprite ? await SP.character(snap.me.sprite) : null; ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(me.x, me.y + 2, 16, 6, 0, 0, 7); ctx.fill(); if (im) SP.standing(ctx, im, 'me' + snap.me.sprite, me.x, me.y + 2, 54, { smooth: true, shadow: false }); ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(me.x, me.y + 2, 18, 7, 0, 0, 7); ctx.stroke(); } }
    ctx.font = over ? 'bold 13px serif' : 'bold 15px serif'; ctx.textAlign = 'center'; realm.provinces.forEach((p) => { const ts = p.tiles.map((id) => map.parse(id)).filter((q) => inWin(q.x, q.y)); if (ts.length < (over ? 20 : 30)) return; const q = ts[ts.length >> 1]; const w = K.hexWorld(q.x - x0, q.y - y0); const pt = hw.proj(w.x, w.z, 0.3); ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(p.name).width + 14; ctx.fillRect(pt.x - tw / 2, pt.y - 40, tw, 20); ctx.fillStyle = '#f6e7b8'; ctx.fillText(p.name, pt.x, pt.y - 25); });
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, 44); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'left'; ctx.fillText(`${snap.title || realm.name} — ${realm.name}${over ? ' · overview' : ''}`, 14, 29); ctx.font = '15px serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#d9c9a0'; ctx.fillText(snap.sub || '', W - 14, 28); ctx.textAlign = 'left';
    const px = lay.W + 8; ctx.fillStyle = 'rgba(16,12,8,.88)'; ctx.fillRect(px - 8, 52, PANEL, H - 60); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('STANDINGS', px, 78);
    snap.guilds.forEach((gd, i) => { const y = 100 + i * 28; ctx.fillStyle = colHex(gd.name); ctx.fillRect(px, y - 12, 14, 14); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(`${i + 1}. ${gd.name.slice(0, 14)}  ${gd.score}`, px + 22, y); ctx.fillStyle = '#a99c78'; ctx.fillText(`${gd.tiles}t`, px + 22 + 160, y); });
    const ly = 100 + snap.guilds.length * 28 + 16; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('LEGEND', px, ly);
    [['Guild Keep'], ['Fortress'], ['Ley Gate'], ['Aether Vein'], ['Titan Lair'], ['Ruins'], ['Shrine'], ['Village'], ['Mountain Pass'], ['Forest']].forEach(([n], i) => { ctx.fillStyle = '#d9cba3'; ctx.font = '13px sans-serif'; ctx.fillText('• ' + n, px, ly + 24 + i * 22); });
    ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; ctx.fillText(over ? '`cq map` = close-up' : '① = `cq march <#>` · `cq realm` = overview', px, H - 24);
    return c;
}

module.exports = { warMapScene, siegeScene, colOf, HEXCOL, biomeOf, ctxOf, scatter };
