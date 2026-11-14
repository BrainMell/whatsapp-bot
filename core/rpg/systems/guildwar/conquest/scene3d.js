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
    const hw = new K.HexWorld(20, 18, { biome: biomeOf(b.biome), scale: 0.52, oobWater: false });
    // the wall runs NW→SE (hex edge dir 1) across the right of the field: invaders stand SW of it, the stronghold lies NE
    const chain = []; let cur = [9, 5]; for (let i = 0; i < 7; i++) { chain.push(cur); cur = nb(cur, 1); }
    const [tL, w1, w2, gt, w3, w4, tR] = chain;
    { const gw0 = K.hexWorld(gt[0], gt[1]); hw.layoutFixed(W, H, gw0.x, gw0.z, 655, 365); }
    const scr = (cc, rr) => { const w = K.hexWorld(cc, rr); return hw.proj(w.x, w.z, 0); };
    if (card.id === 'tide') hw.fillWater((cc, rr) => { const p = scr(cc, rr); return p.x < 380 && p.y > 470; });
    { // a trampled road from the gate out to the field (real KayKit road tiles)
        let rc = gt; for (let i = 0; i < 9; i++) { rc = nb(rc, i % 3 === 2 ? 3 : 2); const k = hw.at(rc[0], rc[1]); if (k && !k.water) k.road = true; }
        const k0 = hw.at(gt[0], gt[1]); if (k0) k0.road = true; }
    hw.resolve(); const dC = colOf(b.defIdx), aC = colOf(b.attIdx); const S = b.sections; const has = !!b.wallType;
    const WS = 1.8, TS = 2.05; // imposing, not toy-sized
    const putPiece = (name, cell, sec, sc, tower, key) => { if (!sec) return; const dead = sec.hp <= 0; const frac = sec.hp / sec.max;
        if (dead) { for (let i = 0; i < 5; i++) hw.put(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'][i], cell[0], cell[1], { dx: (rng() - 0.5) * 1.3, dz: (rng() - 0.5) * 0.9, sort: 0.3, sc: 1.6 + rng() * 0.7 }); if (tower) hw.put('building_destroyed', cell[0], cell[1], { sort: 0.35, sc: 1.1 }); }
        else { hw.put(name, cell[0], cell[1], { sort: 0.3, sc }); hw.overlay((cx, p, k) => { cx.save(); cx.translate(p.x, p.y - (tower ? 150 : 52) * k * 1.6); art.damage(cx, -40, -30, 80, 70, 1 - frac, b.id + key + b.round); cx.restore(); }, cell[0], cell[1]); } };
    // interior: the stronghold behind the wall, dressed by what this tile IS (NE of the gate, two hexes deep)
    const tk = b.kind || 'fortress'; const in1 = nb(gt, 5), in2 = nb(in1, 5), in3 = nb(in1, 0), in4 = nb(in1, 4);
    if (tk === 'keep') hw.put(`building_castle_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.5 });
    else if (tk === 'fortress') { hw.put(`building_barracks_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.35 }); hw.put('weaponrack', in3[0], in3[1], { sort: 0.2, sc: 1.2 }); hw.put('target', in4[0], in4[1], { sort: 0.2, sc: 1.2 }); }
    else if (tk === 'ley_gate') { hw.put('struct_gate_0', in2[0], in2[1], { sort: 0.2, sc: 1.4 }); hw.put(`building_church_${dC}`, in3[0], in3[1], { sort: 0.2, sc: 1.1 }); }
    else if (tk === 'pass') { hw.put('mountain_B', in2[0], in2[1], { sort: 0.2, sc: 1.5 }); hw.put('mountain_A_grass', in3[0], in3[1], { sort: 0.2, sc: 1.2 }); hw.put('weaponrack', in1[0], in1[1], { sort: 0.2 }); }
    else if (tk === 'titan') { hw.put('mountain_C', in2[0], in2[1], { sort: 0.1, sc: 1.8 }); hw.put('mountain_A', in3[0], in3[1], { sort: 0.1, sc: 1.4 }); }
    else { hw.put(`tent_${dC}`, in2[0], in2[1], { sort: 0.2, sc: 1.2 }); }
    const innerCells = []; for (const cell of chain) { const a = nb(cell, 5); innerCells.push(a, nb(a, 5), nb(a, 0)); }
    scatter(hw, rng, innerCells.filter((x) => ![in1, in2, in3, in4].some((y) => y[0] === x[0] && y[1] === x[1])), ['tree_single_A', 'tree_single_B', 'rock_single_E', 'trees_A_small'], 0.35);
    // the wall itself (real KayKit stone wall / gate / towers in the defender's colour)
    if (has) {
        putPiece('wall_straight@1', w1, S.curtain, WS, false, 'c1'); putPiece('wall_straight@1', w2, S.curtain, WS, false, 'c2'); putPiece('wall_straight@1', w3, S.curtain, WS, false, 'c3'); putPiece('wall_straight@1', w4, S.curtain, WS, false, 'c4');
        putPiece('wall_straight_gate@1', gt, S.gate, WS, false, 'g');
        const turs = b.turrets || []; const onL = turs.filter((t) => t.mount === 'towerL'), onR = turs.filter((t) => t.mount === 'towerR'), onG = turs.filter((t) => t.mount === 'gate');
        const tname = (list) => (list.some((t) => t.kind === 'ballista') ? `building_tower_catapult_${dC}` : list.length ? `building_tower_B_${dC}` : `building_tower_A_${dC}`);
        putPiece(tname(onL), tL, S.towerL, TS, true, 'tl'); putPiece(tname(onR), tR, S.towerR, TS, true, 'tr');
        if (onG.length && S.gate && S.gate.hp > 0) hw.put('weaponrack', in1[0], in1[1], { sort: 0.5, sc: 1.4 });
        [[onL, tL, 190], [onR, tR, 190], [onG, in1, 64]].forEach(([list, cell, hh]) => list.forEach((t, i) => hw.overlay((cx, p, k) => { cx.save(); cx.globalAlpha = t._silenced ? 0.3 : 1; const x = p.x + (i - (list.length - 1) / 2) * 30, y = p.y - hh * k * 1.6 - 6; const g = cx.createRadialGradient(x, y, 1, x, y, 15); g.addColorStop(0, TURRET_FX[t.kind]); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, 15, 0, 7); cx.fill(); cx.fillStyle = '#fff'; cx.font = 'bold 10px sans-serif'; cx.textAlign = 'center'; cx.shadowColor = '#000'; cx.shadowBlur = 3; cx.fillText(t.kind.slice(0, 3).toUpperCase() + t.lvl, x, y + 3); cx.restore(); }, cell[0], cell[1])));
    }
    // exterior: what the surrounding MAP really is (neighbour tile kinds → forests, ridges, ore, farms on the invaders' side)
    const sr = b.surround || {}; const outer = []; for (const cell of chain) { const a = nb(cell, 2), a2 = nb(a, 2), a3 = nb(a, 3), a4 = nb(a2, 3); outer.push(a2, a4, nb(a3, 3), nb(a2, 2)); }
    const dens = (n, d) => ((sr[n] || 0) > 0 ? Math.min(0.85, 0.2 + 0.17 * sr[n]) : d);
    const free = outer.filter((x) => { const p = scr(x[0], x[1]); return !(p.x < 560 && p.y > 380); }); // keep the invaders' standing area open
    scatter(hw, rng, free, ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'], dens('forest', 0.16));
    scatter(hw, rng, free, ['mountain_A_grass', 'hills_A', 'hill_single_B', 'hills_B_trees'], dens('pass', 0.05));
    scatter(hw, rng, free, ['resource_stone', 'rock_single_A', 'rock_single_C'], dens('gem_vein', 0.07));
    scatter(hw, rng, free, ['house_cottage', 'building_well', 'house_roundhut_thatch'], sr.village ? 0.28 : 0);
    { const ring = []; for (let r = 0; r < 18; r++) for (let cc = 0; cc < 20; cc++) { const p = scr(cc, r); if (p.y < 150 || p.x > 900 || p.x < 30 || p.y > 700) ring.push([cc, r]); } scatter(hw, rng, ring, ['mountain_A_grass', 'mountain_B_grass', 'hills_A_trees', 'hills_B_trees', 'trees_A_large', 'trees_B_large'], 0.5); }
    { const camp = nb(nb(nb(gt, 2), 2), 3); const c2 = nb(camp, 2); hw.put(`flag_${aC}`, camp[0], camp[1], { dx: 0.5, sort: 0.3, sc: 1.6 }); hw.put(`tent_${aC}`, nb(c2, 3)[0], nb(c2, 3)[1], { sort: 0.3, sc: 1.3 }); hw.put('crate_A_big', c2[0], c2[1], { dx: -0.4, sort: 0.3, sc: 1.2 }); hw.put('barrel', c2[0], c2[1], { dx: 0.5, sort: 0.3, sc: 1.2 }); hw.put('weaponrack', camp[0], camp[1], { dx: -0.6, dz: 0.3, sort: 0.3, sc: 1.3 }); hw.put(`flag_${dC}`, gt[0], gt[1], { dx: 0.2, dz: -0.2, sort: 0.6, sc: 1.8 }); }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, card.palette[0]); g.addColorStop(1, card.palette[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    await hw.draw(ctx, { drawBackdrop: async (cx) => { await K.paintBackdrop(cx, W, H, map.hashStr(b.id), { top: card.palette[0], mid: card.palette[1], bot: '#10161c', clouds: 4, cloudScale: 0.7 }); } });
    const P = (cell, h = 0) => { const w = K.hexWorld(cell[0], cell[1]); return hw.proj(w.x, w.z, h); };
    const fireImg = await SP.asset('fx/fire/1/Fire-Wrath__05.png');
    const burn = (cell, key, size = 150) => { if (b.burning[key] && fireImg) { const p = P(cell, 0.4); ctx.drawImage(fireImg, p.x - size / 2, p.y - size * 0.9, size, size); } };
    [w1, w2, w3, w4].forEach((cl) => burn(cl, 'curtain', 120)); burn(gt, 'gate', 150); burn(tL, 'towerL', 170); burn(tR, 'towerR', 170);
    const reticle = (cell, hh) => { const p = P(cell, 0); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - hh, 30, 0, 7); ctx.moveTo(p.x - 40, p.y - hh); ctx.lineTo(p.x + 40, p.y - hh); ctx.moveTo(p.x, p.y - hh - 40); ctx.lineTo(p.x, p.y - hh + 40); ctx.stroke(); };
    if (has) { if (b.weak === 'gate' && S.gate.hp > 0) reticle(gt, 60); if (b.weak === 'towerL' && S.towerL.hp > 0) reticle(tL, 110); if (b.weak === 'towerR' && S.towerR.hp > 0) reticle(tR, 110); if (b.weak === 'curtain' && S.curtain.hp > 0) { reticle(w1, 50); reticle(w4, 50); } }
    if (has) { for (const mn of b.mines.slice(0, 2)) { const cell = mn.s === 'gate' ? gt : mn.s === 'towerL' ? tL : mn.s === 'towerR' ? tR : w3; const p = P(cell, 0); ctx.fillStyle = '#e6b93b'; ctx.font = 'bold 12px sans-serif'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('SAPPERS', p.x - 28, p.y + 34); ctx.shadowBlur = 0; }
        // HUD: the four wall sections
        if (!opts.noHud) {
        const rows = [['Gate', S.gate], ['Left tower', S.towerL], ['Right tower', S.towerR], ['Curtain wall', S.curtain]]; const hx = 24, hy = 112; ctx.fillStyle = 'rgba(10,8,5,.66)'; ctx.fillRect(hx - 10, hy - 18, 244, 22 + rows.length * 30 + (b.turrets.length ? 26 : 0)); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 13px serif'; ctx.fillText(`${b.wallType.toUpperCase()} WALL`, hx, hy - 3);
        rows.forEach(([n, sec], i) => { const y = hy + 12 + i * 30; ctx.fillStyle = sec.hp > 0 ? '#e8dcc0' : '#e86a5a'; ctx.font = '12px sans-serif'; ctx.fillText(`${n}  ${sec.hp}/${sec.max}`, hx, y); art.bar(ctx, hx, y + 5, 224, sec.hp / sec.max); });
        const tl = b.turrets.filter((t) => !t._silenced); if (b.turrets.length) { ctx.fillStyle = '#c9b27c'; ctx.font = '12px sans-serif'; ctx.fillText(`Turrets firing: ${tl.length}/${b.turrets.length}`, hx, hy + 12 + rows.length * 30 + 8); } }
        }
    // garrison golems (bot enemy sprites) + the invaders: their REAL characters, left of the wall, facing it
    const realm = (b.tileId || '').split(':')[0]; const isTitan = b.isTitan; const gs = b.golems.filter((x) => x.hp > 0); const GH = { clay: 170, stone: 190, iron: 210, rune: 230 };
    for (const [i, gm] of b.golems.entries()) { if (gm.hp <= 0) continue; const titan = isTitan && i === 0 && b.phase !== 'wall'; const im = titan ? await SP.cq(`golems/titan_${realm}.png`) : await SP.cq(`golems/${gm.kind}.png`);
        let x, y, h, a = 1; if (b.phase === 'wall') { const p = P(in1, 0); const p2 = P(in3, 0); x = p2.x + (i - (b.golems.length - 1) / 2) * 40 + 30; y = p2.y + 34; h = 92; a = 0.8; } else { const idx = gs.indexOf(gm); x = 520 + idx * Math.min(150, 330 / Math.max(1, gs.length)); y = 575 - (idx % 2) * 24; h = titan ? 330 : (GH[gm.kind] || 190); }
        SP.standing(ctx, im, 'gol' + gm.kind + (titan ? realm : ''), x, y, h, { alpha: a, flip: true, glow: b.status && b.status.golemSurge > 0 ? '#7ed6c1' : null });
        if (b.phase !== 'wall') { art.bar(ctx, x - 40, y + 8, 80, gm.hp / gm.max, '#d9473a'); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(`[${i + 1}] ${titan ? 'TITAN' : gm.kind} ${gm.hp}/${gm.max}`, x, y + 30); ctx.shadowBlur = 0; ctx.textAlign = 'left'; } }
    const ms = Object.values(b.party); const step = Math.min(112, 440 / Math.max(1, ms.length)); const ch = ms.length > 6 ? 175 : 205;
    for (const [i, m] of ms.entries()) { const x = 70 + step * i + 30; const y = 585 - (i % 2) * 22; const im = m.sprite ? await SP.character(m.sprite) : null; if (im) SP.standing(ctx, im, 'ch' + m.sprite, x, y, ch, { alpha: m.hp > 0 ? 1 : 0.28, smooth: true });
        ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(m.name.slice(0, 12), x, y + 16); ctx.shadowBlur = 0; art.bar(ctx, x - 36, y + 22, 72, m.hp / m.max); ctx.font = '11px sans-serif'; ctx.fillStyle = m.hp > 0 ? '#e8dcc0' : '#e86a5a'; ctx.fillText(m.hp > 0 ? `${m.hp}/${m.max}` : 'DOWN', x, y + 44);
        if (m.hp > 0) { ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = m.action ? '#8be78b' : '#aaa'; ctx.fillText(m.action ? m.action.toUpperCase() : '...', x, y - ch - 6); } ctx.textAlign = 'left'; }
    ctx.fillStyle = art.hex(card.palette[0], ['night', 'eclipse', 'whiteout', 'fog'].includes(card.id) ? 0.38 : 0.12); ctx.fillRect(0, 0, W, H);
    art.weather(ctx, W, H, card, 300, b.id + ':' + b.round);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    return { c, ctx, W, H, card };
}

// ── realm war map ───────────────────────────────────────────────────────────────────────────────
const LAND = { plain: ['hills_A', 'hills_B'], forest: ['hills_A_trees', 'hills_B_trees', 'trees_A_large'], village: null };
async function warMapScene(snap) {
    const g = map.generate(snap.seed); const realm = g.realms.find((r) => r.key === snap.realm); const biome = realm.biome;
    const COLS = map.W, ROWS = map.H; const SC = 0.34; const PANEL = 250;
    const hw = new K.HexWorld(COLS, ROWS, { biome: biomeOf(biome), scale: SC, oobWater: false });
    const lay = hw.layout({ left: 24, right: 24, top: 120, bottom: 40 }); const W = lay.W + PANEL, H = lay.H;
    const { c, ctx } = ctxOf(W, H); const rng = art.RNG(snap.seed + snap.realm);
    hw.resolve();
    const names = snap.guilds.map((x) => x.name); const gi = (n) => names.indexOf(n); const colHex = (n) => HEXCOL[Math.max(0, gi(n)) % HEXCOL.length]; const colName = (n) => colOf(Math.max(0, gi(n)));
    const by = Object.fromEntries(snap.tiles.map((t) => [t.id, t])); const tileAt = (x, y) => g.tiles.get(map.tileId(snap.realm, x, y));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const t = tileAt(x, y); if (!t) continue; const o = by[t.id] || {}; const own = o.owner; const oc = own ? colName(own) : null; const r2 = art.RNG(t.id);
        const put = (n, e = {}) => hw.put(n, x, y, Object.assign({ sort: 0.2 }, e));
        switch (t.kind) {
            case 'keep': put(own ? `building_castle_${oc}` : 'building_castle_blue', { sc: 1.0 }); break;
            case 'fortress': put(`building_barracks_${oc || 'red'}`, { dx: -0.25 }); put(`building_tower_A_${oc || 'red'}`, { dx: 0.5, dz: -0.2, sc: 0.9 }); break;
            case 'ley_gate': put('struct_gate_0', { sc: 0.9 }); break;
            case 'pass': put('mountain_A_grass', { sc: 0.9 }); put('mountain_B_grass', { dx: 0.6, dz: 0.4, sc: 0.6 }); break;
            case 'titan': put('mountain_C_grass', { sc: 1.0 }); break;
            case 'ruins': put('building_destroyed', { sc: 0.9 }); break;
            case 'shrine': put(`building_shrine_${oc || 'green'}`, { sc: 0.9 }); break;
            case 'gem_vein': put('rock_single_C', { sc: 1.0 }); put('rock_single_D', { dx: 0.5, dz: 0.3, sc: 0.7 }); break;
            case 'village': { const hn = K.houseName(r2, biome, {}); if (hn) put(hn, { sc: 0.95 }); put('tree_single_A', { dx: 0.6, dz: 0.45, sc: 0.7 }); break; }
            case 'forest': put('trees_A_large', { dx: -0.1, sc: 0.95 }); put('trees_B_medium', { dx: 0.5, dz: 0.4, sc: 0.8 }); break;
            default: if (r2() < 0.22) put(r2() < 0.5 ? 'tree_single_A' : 'rock_single_A', { dx: (r2() - 0.5) * 0.9, dz: (r2() - 0.5) * 0.7, sc: 0.8 });
        }
        if (own && !['keep', 'fortress', 'village', 'shrine'].includes(t.kind)) hw.put(`flag_${colName(own)}`, x, y, { dx: 0.7, dz: -0.35, sort: 0.3, sc: 0.9 });
        // owner = tinted hex ground
        if (own) hw.underlay((cx) => { const poly = hw.cellPoly(x, y, 0.02, 0.06); cx.beginPath(); poly.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.closePath(); cx.fillStyle = art.hex(colHex(own), 0.5); cx.fill(); cx.lineWidth = 2; cx.strokeStyle = art.hex(colHex(own), 0.9); cx.stroke(); }, x, y);
        if (o.shield) hw.overlay((cx) => { const p = hw.proj(...(() => { const w = K.hexWorld(x, y); return [w.x, w.z, 0.2]; })()); cx.fillStyle = '#fff'; cx.font = 'bold 13px sans-serif'; cx.textAlign = 'center'; cx.fillText('🛡', p.x, p.y - 4); }, x, y);
    }
    // province borders along hex edges (heavy dark line where province changes)
    hw.overlays.push({ x: 0, z: 0, y: 0, fn: (cx) => { cx.save(); cx.lineWidth = 3; cx.strokeStyle = 'rgba(20,10,0,.75)'; cx.lineCap = 'round';
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const poly = hw.cellPoly(x, y, 0.03); const me = map.provOf(x, y); for (let d = 0; d < 6; d++) { const n = K.neighbor(x, y, d); if (n[0] < 0 || n[1] < 0 || n[0] >= COLS || n[1] >= ROWS) continue; if (map.provOf(n[0], n[1]) === me) continue; const a = poly[d], b2 = poly[(d + 1) % 6]; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b2.x, b2.y); cx.stroke(); } } cx.restore(); } });
    hw.W = lay.W; hw.H = H;
    await hw.draw(ctx, { drawBackdrop: async (cx) => { cx.fillStyle = '#14100b'; cx.fillRect(0, 0, W, H); await K.paintBackdrop(cx, lay.W, H, map.hashStr(snap.seed + snap.realm), { top: '#3a4a60', mid: '#8a7a68', bot: '#1c1812', clouds: 0, cloudScale: 0.6 }); } });
    const P = (id) => { const q = map.parse(id); if (q.realm !== snap.realm) return null; const w = K.hexWorld(q.x, q.y); return hw.proj(w.x, w.z, 0.1); };
    // marches
    for (const m of snap.marches || []) { const a = P(m.from), b2 = P(m.to); if (!a || !b2) continue; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.setLineDash([9, 6]); ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b2.x, b2.y, 6, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    // targets
    (snap.targets || []).forEach((id, i) => { const p = P(id); if (!p) return; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(p.x, p.y - 6, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#ffe28a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), p.x, p.y - 2); });
    // you
    const me = P(snap.me.at); if (me) { const im = snap.me.sprite ? await SP.character(snap.me.sprite) : null; ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(me.x, me.y + 2, 16, 6, 0, 0, 7); ctx.fill(); if (im) SP.standing(ctx, im, 'me' + snap.me.sprite, me.x, me.y + 2, 54, { smooth: true, shadow: false }); ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(me.x, me.y + 2, 18, 7, 0, 0, 7); ctx.stroke(); }
    // province labels
    ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'; realm.provinces.forEach((p) => { const pt = hw.proj(...(() => { const w = K.hexWorld(p.col * 5 + 2, p.row * 5 + 2); return [w.x, w.z, 0.3]; })()); ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(p.name).width + 14; ctx.fillRect(pt.x - tw / 2, pt.y - 40, tw, 20); ctx.fillStyle = '#f6e7b8'; ctx.fillText(p.name, pt.x, pt.y - 25); });
    // title + panel
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, 44); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'left'; ctx.fillText(`${snap.title || realm.name} — ${realm.name}`, 14, 29); ctx.font = '15px serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#d9c9a0'; ctx.fillText(snap.sub || '', W - 14, 28); ctx.textAlign = 'left';
    const px = lay.W + 8; ctx.fillStyle = 'rgba(16,12,8,.88)'; ctx.fillRect(px - 8, 52, PANEL, H - 60); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('STANDINGS', px, 78);
    snap.guilds.forEach((gd, i) => { const y = 100 + i * 28; ctx.fillStyle = colHex(gd.name); ctx.fillRect(px, y - 12, 14, 14); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(`${i + 1}. ${gd.name.slice(0, 16)}  ${gd.score}`, px + 22, y); ctx.fillStyle = '#a99c78'; ctx.fillText(`${gd.tiles} tiles`, px + 22 + 150, y); });
    const ly = 100 + snap.guilds.length * 28 + 16; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('LEGEND', px, ly);
    [['keep', 'Guild Keep'], ['fortress', 'Fortress'], ['ley_gate', 'Ley Gate'], ['gem_vein', 'Aether Vein'], ['titan', 'Titan Lair'], ['ruins', 'Ruins'], ['shrine', 'Shrine'], ['village', 'Village'], ['pass', 'Mountain Pass'], ['forest', 'Forest']].forEach(([k, n], i) => { ctx.fillStyle = '#d9cba3'; ctx.font = '13px sans-serif'; ctx.fillText('• ' + n, px, ly + 24 + i * 22); });
    ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; ctx.fillText('① numbers = `cq march <#>` targets', px, H - 24);
    return c;
}

module.exports = { warMapScene, siegeScene, colOf, HEXCOL, biomeOf, ctxOf, scatter };
