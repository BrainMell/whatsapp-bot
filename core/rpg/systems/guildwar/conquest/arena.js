'use strict';
// 🏟️ ARENAS — big portrait (4:5) encounter scenes built on the same 3D hex engine as the world map, so a march that
// "cuts in" to a location lands in a hand-composed arena for that location type (titan lair, ruins, shrine, village,
// vein cave, ley gate, field camp). Real sprite characters/monsters stand IN the scene, lit and graded to match.
const K = require('../../world/kingdom3d'); const SP = require('./sprites'); const art = require('./art'); const map = require('./mapgen');
const { createCanvas } = require('canvas');
const W = 1056, H = 1320;
const COLS = 20, ROWS = 26;
const biomeOf = (b) => (b === 'isle' ? null : b);
const nb = (c, d) => K.neighbor(c[0], c[1], d);
const GRASS = { highlands: ['#5f8f3c', '#7fae4a', '#9cc45e'], isle: ['#5b9a3f', '#7bb84e', '#a3cf63'], tundra: ['#8aa89a', '#a9c3b4', '#d7e6e0'], desert: ['#a8a057', '#c2b565', '#d9cf86'], volcanic: ['#6d5a4a', '#8a6f55', '#b08a5a'] };
// per-kind mood: sky/backdrop, colour wash, light shaft tint
const MOOD = {
    titan: { top: '#2a1a1e', mid: '#6a3a2a', wash: ['#ff6a2a', 0.1], shaft: 'rgba(255,170,90,.10)' },
    ruins: { top: '#1d2238', mid: '#4a4f78', wash: ['#7a78ff', 0.1], shaft: 'rgba(170,180,255,.10)' },
    shrine: { top: '#2b2a22', mid: '#8a7a4a', wash: ['#ffd66a', 0.08], shaft: 'rgba(255,230,150,.14)' },
    village: { top: '#52748f', mid: '#b8c4b0', wash: ['#ffd9a0', 0.05], shaft: 'rgba(255,240,200,.10)' },
    gem_vein: { top: '#1c1a2a', mid: '#4a3a62', wash: ['#c05aff', 0.09], shaft: 'rgba(220,150,255,.10)' },
    ley_gate: { top: '#122338', mid: '#2f5f8a', wash: ['#4fb8ff', 0.1], shaft: 'rgba(130,210,255,.12)' },
    field: { top: '#5f87ad', mid: '#c4cfb8', wash: ['#fff2c8', 0.04], shaft: 'rgba(255,245,210,.10)' },
};
const kindToArena = (k) => ({ titan: 'titan', ruins: 'ruins', shrine: 'shrine', village: 'village', gem_vein: 'gem_vein', ley_gate: 'ley_gate' }[k] || 'field');

function tufts(hw, rng, cells, pal, dens) { // grass tufts + wildflowers painted on the ground, under every object
    hw.underlay((cx) => { for (const [c, r] of cells) { const k = hw.at(c, r); if (!k || k.water || k.road) continue; const w = K.hexWorld(c, r); const n = Math.floor(dens * 14); for (let i = 0; i < n; i++) { const dx = (rng() - 0.5) * 1.9, dz = (rng() - 0.5) * 1.6; const p = hw.proj(w.x + dx, w.z + dz, 0.02); const h = 7 + rng() * 9; cx.strokeStyle = pal[(rng() * pal.length) | 0]; cx.lineWidth = 1.6; cx.lineCap = 'round'; for (let b = -1; b <= 1; b++) { cx.beginPath(); cx.moveTo(p.x + b * 2.2, p.y); cx.quadraticCurveTo(p.x + b * 4, p.y - h * 0.6, p.x + b * 6 + (rng() - 0.5) * 3, p.y - h); cx.stroke(); } if (rng() < 0.05) { cx.fillStyle = rng() < 0.5 ? '#f4efe0' : '#f2c14e'; cx.beginPath(); cx.arc(p.x + 3, p.y - h - 1, 2.2, 0, 7); cx.fill(); } } } });
}
function scatter(hw, rng, cells, kinds, density, scMin = 0.8, scMax = 1.2) { for (const [c, r] of cells) { if (rng() > density) continue; const n = kinds[Math.floor(rng() * kinds.length)]; hw.put(n, c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6, sort: 0.1 + rng() * 0.05, sc: scMin + rng() * (scMax - scMin), flip: rng() < 0.5 }); } }

async function arenaScene(o) {
    const kind = kindToArena(o.kind); const mood = MOOD[kind]; const seed = o.seed || 'arena'; const rng = art.RNG(seed + ':' + kind); const biome = o.biome || 'highlands'; const pal = GRASS[biome] || GRASS.highlands;
    const SCALE = 0.62; const hw = new K.HexWorld(COLS, ROWS, { biome: biomeOf(biome), scale: SCALE, oobWater: false, style: 'aldafold' });
    const isoProps = []; { const put0 = hw.put.bind(hw); hw.put = (n, c, r, op = {}) => (K.hasSprite(n, 'top') ? put0(n, c, r, op) : isoProps.push([n, c, r, op])); }
    const cc = [10, 14]; // arena centre cell
    const cw = K.hexWorld(cc[0], cc[1]); hw.layoutFixed(W, H, cw.x, cw.z, W / 2, H * 0.53);
    const cells = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push([c, r]);
    const d = (c, r) => K.hexDist(c, r, cc[0], cc[1]);
    // dirt floor of the arena (real KayKit road tiles) — radius 3
    hw.underlay((cx) => { const w0 = K.hexWorld(cc[0], cc[1]); const ell = (rr, col, a) => { cx.fillStyle = col; cx.globalAlpha = a; cx.beginPath(); for (let t = 0; t <= 48; t++) { const ang = t / 48 * Math.PI * 2; const wob = 1 + Math.sin(ang * 5 + 1) * 0.05 + Math.sin(ang * 9) * 0.03; const p = hw.proj(w0.x + Math.cos(ang) * rr * wob, w0.z + Math.sin(ang) * rr * wob, 0.01); t ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); } cx.closePath(); cx.fill(); }; ell(3.9, '#6b5a3c', 0.35); ell(3.5, '#8a7650', 0.75); ell(2.6, '#9a8660', 0.55); cx.globalAlpha = 1; for (let i = 0; i < 90; i++) { const a = rng() * 6.28, q = Math.sqrt(rng()) * 3.3; const p = hw.proj(w0.x + Math.cos(a) * q, w0.z + Math.sin(a) * q, 0.02); cx.fillStyle = rng() < 0.5 ? 'rgba(60,45,28,.35)' : 'rgba(190,170,130,.35)'; cx.fillRect(p.x, p.y, 3, 2); } });
    hw.resolve();
    const ring = (n) => K.ring(cc[0], cc[1], n).filter(([c, r]) => hw.inb(c, r)); const sideC = (c) => ({ c: nb(cc, c) });
    const P = (cell, h = 0, dx = 0, dz = 0) => { const w = K.hexWorld(cell[0], cell[1]); return hw.proj(w.x + dx, w.z + dz, h); };
    const colr = o.color || 'red';
    // ── arena dressing per kind ─────────────────────────────────────────────────────────────────────
    const r4 = ring(4), r5 = ring(5), r3 = ring(3);
    const torch = (cell, sc = 1.4) => hw.put('coc_torch', cell[0], cell[1], { sort: 0.3, sc });
    if (kind === 'titan') {
        r4.forEach(([c, r], i) => hw.put(i % 3 === 0 ? 'coc_skull_ancient' : ['rock_single_D', 'rock_single_E', 'rock_single_C'][i % 3], c, r, { sort: 0.25, sc: i % 3 === 0 ? 1.5 : 2.1, dx: (rng() - 0.5) * 0.4 }));
        r3.filter((_, i) => i % 3 === 0).forEach((cell) => torch(cell, 1.5));
        for (let i = 0; i < 3; i++) { const m = [cc[0] - 3 + i * 3, cc[1] - 8 + (i % 2)]; hw.put('mountain_C', m[0], m[1], { sort: 0.1, sc: 2.3 }); }
        hw.put('coc_statue_dragon', cc[0], cc[1] - 5, { sort: 0.2, sc: 1.8 });
    } else if (kind === 'ruins') {
        r4.forEach(([c, r], i) => hw.put(i % 4 === 0 ? 'coc_statue_wizard' : i % 4 === 1 ? 'building_destroyed' : 'rock_single_B', c, r, { sort: 0.25, sc: i % 4 === 0 ? 1.6 : 1.4, flip: i % 2 === 0 }));
        r3.filter((_, i) => i % 3 === 1).forEach((cell) => torch(cell, 1.5));
        hw.put('building_destroyed', cc[0] - 1, cc[1] - 7, { sort: 0.1, sc: 2.2 }); hw.put('building_destroyed', cc[0] + 2, cc[1] - 7, { sort: 0.1, sc: 1.8 });
        // glowing ritual circle on the ground
        hw.underlay((cx) => { const p0 = P(cc, 0.05); for (const [rr, a, w] of [[3.1, 0.55, 3], [2.4, 0.4, 2], [1.4, 0.35, 2]]) { cx.strokeStyle = `rgba(150,160,255,${a})`; cx.lineWidth = w; cx.beginPath(); for (let t = 0; t <= 72; t++) { const ang = t / 72 * Math.PI * 2; const p = hw.proj(K.hexWorld(cc[0], cc[1]).x + Math.cos(ang) * rr, K.hexWorld(cc[0], cc[1]).z + Math.sin(ang) * rr, 0.05); t ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); } cx.stroke(); } const glyphs = ['ᚠ', 'ᚦ', 'ᚱ', 'ᚲ', 'ᛉ', 'ᛟ', 'ᛞ', 'ᛗ']; cx.fillStyle = 'rgba(190,200,255,.75)'; cx.font = '34px serif'; cx.textAlign = 'center'; glyphs.forEach((gl, i) => { const ang = i / 8 * Math.PI * 2; const p = hw.proj(K.hexWorld(cc[0], cc[1]).x + Math.cos(ang) * 2.75, K.hexWorld(cc[0], cc[1]).z + Math.sin(ang) * 2.75, 0.06); cx.save(); cx.translate(p.x, p.y); cx.scale(1, 0.62); cx.fillText(gl, 0, 0); cx.restore(); }); });
    } else if (kind === 'shrine') {
        hw.put(`building_church_${colr === 'red' ? 'green' : colr}`, cc[0], cc[1] - 4, { sort: 0.2, sc: 1.5 });
        r4.filter((_, i) => i % 2 === 0).forEach((cell, i) => { if (cell[1] < cc[1] - 1) return; hw.put(i % 2 ? 'coc_statue_mighty' : 'tree_single_A', cell[0], cell[1], { sort: 0.25, sc: 1.4 }); });
        r3.filter((_, i) => i % 2 === 0).forEach((cell) => torch(cell, 1.4)); hw.put('coc_statue_wizard', cc[0] - 2, cc[1] - 3, { sort: 0.3, sc: 1.4 });
    } else if (kind === 'village') {
        [[-3, -3, 'house_cottage_orange'], [0, -4, 'house_barn_red'], [3, -3, 'house_cottage_blue'], [-4, 1, 'house_roundhut_thatch'], [4, 1, 'house_stone_green'], [-2, 4, 'building_well_blue'], [3, 4, 'building_grain']].forEach(([dx, dy, n]) => hw.put(n, cc[0] + dx, cc[1] + dy, { sort: 0.2, sc: 1.25 }));
        scatter(hw, rng, r4, ['crate_A_big', 'barrel', 'wheelbarrow', 'sack', 'pallet'], 0.5, 1.0, 1.3);
    } else if (kind === 'gem_vein') {
        hw.put('struct_mine_cave', cc[0], cc[1] - 5, { sort: 0.1, sc: 1.8 }); hw.put('coc_mine_l3', cc[0] + 3, cc[1] - 3, { sort: 0.2, sc: 1.3 });
        r4.forEach(([c, r], i) => hw.put(['resource_stone', 'rock_single_C', 'rock_single_A'][i % 3], c, r, { sort: 0.25, sc: 1.8 }));
        r3.filter((_, i) => i % 3 === 0).forEach((cell) => torch(cell, 1.3));
        hw.overlay((cx) => { for (let i = 0; i < 16; i++) { const cell = r4[i % r4.length]; const p = P(cell, 0.5, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.6); const s = 10 + rng() * 16; cx.fillStyle = `hsla(${290 + rng() * 40},90%,70%,.9)`; cx.beginPath(); cx.moveTo(p.x, p.y - s * 1.3); cx.lineTo(p.x + s * 0.5, p.y - s * 0.2); cx.lineTo(p.x, p.y + s * 0.4); cx.lineTo(p.x - s * 0.5, p.y - s * 0.2); cx.closePath(); cx.fill(); cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.lineWidth = 1.5; cx.stroke(); } }, cc[0], cc[1]);
    } else if (kind === 'ley_gate') {
        K.ring(cc[0], cc[1], 4).filter(([c, r]) => hw.inb(c, r)).forEach(([c, r], i) => hw.put(i % 2 ? 'struct_gate_30' : 'coc_statue_mighty', c, r, { sort: 0.25, sc: 1.3 }));
        hw.put('struct_gate_0', cc[0], cc[1] - 4, { sort: 0.3, sc: 2.0 }); r3.filter((_, i) => i % 3 === 0).forEach((cell) => torch(cell, 1.3));
        hw.overlay((cx) => { const p = P([cc[0], cc[1] - 4], 0.2, 0, 0); const g = cx.createRadialGradient(p.x, p.y - 150, 8, p.x, p.y - 150, 150); g.addColorStop(0, 'rgba(210,245,255,.95)'); g.addColorStop(0.4, 'rgba(90,190,255,.55)'); g.addColorStop(1, 'rgba(40,90,200,0)'); cx.fillStyle = g; cx.beginPath(); cx.ellipse(p.x, p.y - 150, 110, 170, 0, 0, 7); cx.fill(); }, cc[0], cc[1]);
    } else { // field camp / skirmish
        hw.put(`flag_${['red','blue','green','yellow'].includes(colr)?colr:'red'}`, cc[0] - 3, cc[1] - 3, { sort: 0.3, sc: 1.8 }); hw.put(`tent_${['red','blue','green','yellow'].includes(colr)?colr:'red'}`, cc[0] - 4, cc[1] - 2, { sort: 0.3, sc: 1.4 }); hw.put('weaponrack', cc[0] + 3, cc[1] - 3, { sort: 0.3, sc: 1.5 }); hw.put('target', cc[0] + 4, cc[1] - 2, { sort: 0.3, sc: 1.4 });
        scatter(hw, rng, r4, ['rock_single_A', 'rock_single_C', 'crate_A_small', 'barrel'], 0.35, 1.0, 1.4);
    }
    // surrounding wilderness: forest/ridges close the arena in so it feels carved out of a bigger world
    const outer = cells.filter(([c, r]) => d(c, r) >= 6 && d(c, r) <= 11);
    const northRidge = outer.filter(([c, r]) => r < cc[1] - 4); const rest = outer.filter(([c, r]) => !(r < cc[1] - 4));
    scatter(hw, rng, northRidge, ['mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass', 'hills_A_trees', 'hills_B_trees', 'trees_A_large'], 0.55, 1.1, 1.6);
    scatter(hw, rng, rest, ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'hills_A_trees', 'rock_single_E'], kind === 'village' ? 0.3 : 0.5, 0.9, 1.4);
    scatter(hw, rng, cells.filter(([c, r]) => d(c, r) === 5), ['tree_single_A', 'tree_single_B', 'rock_single_A', 'trees_A_small'], kind === 'village' ? 0.15 : 0.3, 0.8, 1.1);
    tufts(hw, rng, cells.filter(([c, r]) => d(c, r) >= 3 && d(c, r) <= 7), pal, biome === 'volcanic' ? 0.35 : 0.9);
    // ── draw ────────────────────────────────────────────────────────────────────────────────────────
    const c = createCanvas(W, H); const ctx = c.getContext('2d');
    await hw.draw(ctx, { drawBackdrop: async (cx) => { await K.paintBackdrop(cx, W, H, map.hashStr(seed), { top: mood.top, mid: mood.mid, bot: '#0d0f12', clouds: kind === 'village' || kind === 'field' ? 5 : 2, cloudScale: 0.9 }); } });
    // iso-only props (torches, statues, skulls, mine cave) are placed as sprites on the same ground
    isoProps.sort((a, b2) => K.hexWorld(a[1], a[2]).z - K.hexWorld(b2[1], b2[2]).z); for (const [n, pc, pr, op] of isoProps) { const im = await SP.asset('kingdom3d_iso/' + n + '.png').catch(() => null); if (!im) continue; const p = hw.proj(K.hexWorld(pc, pr).x + (op.dx || 0), K.hexWorld(pc, pr).z + (op.dz || 0), 0); const k = (op.sc || 1) * SCALE * 0.9; const w = im.width * k, h = im.height * k; ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, w * 0.3, w * 0.1, 0, 0, 7); ctx.fill(); ctx.drawImage(im, p.x - w / 2, p.y - h + 8, w, h); }
    // sprites standing in the arena
    const SPR = { enemies: [], party: [] };
    const en = o.enemies || []; const cx0 = W / 2; const baseY = H * 0.5;
    for (const [i, e] of en.entries()) { const im = e.cq ? await SP.cq(e.cq).catch(() => null) : e.asset ? await SP.asset(e.asset).catch(() => null) : e.character ? await SP.character(/\.png$/.test(e.character) ? e.character : e.character + '.png').catch(() => null) : null; if (!im) continue; const x = cx0 + (i - (en.length - 1) / 2) * (e.gap || 210) - (e.big ? 0 : 0); const y = baseY - (e.big ? 20 : 0) + (i % 2) * 30; const h = (e.h || 260) * 0.55; (ctx.save(), ctx.fillStyle = 'rgba(10,8,14,.5)', ctx.beginPath(), ctx.ellipse(x + 8, y + 2, h * 0.36, h * 0.09, 0, 0, 7), ctx.fill(), ctx.restore(), 0) || SP.standing(ctx, im, 'en' + (e.asset || e.character) + i, x, y, h, { flip: e.flip !== false, glow: e.glow || null }); SPR.enemies.push({ x, y, h, e }); }
    const pm = o.party || []; const per = Math.min(5, Math.max(1, pm.length)); const rows = Math.ceil(pm.length / 5);
    for (const [i, m] of pm.entries()) { const row = Math.floor(i / 5), ci = i % 5; const inRow = Math.min(5, pm.length - row * 5); const x = W / 2 + (ci - (inRow - 1) / 2) * 96 + (row % 2) * 30; const y = H * 0.64 + row * 46 + (ci % 2) * 16; const im = m.sprite ? await SP.character(/\.png$/.test(m.sprite) ? m.sprite : m.sprite + '.png').catch(() => null) : null; if (im) (ctx.save(), ctx.fillStyle = 'rgba(10,8,14,.5)', ctx.beginPath(), ctx.ellipse(x + 5, y + 2, 28, 7, 0, 0, 7), ctx.fill(), ctx.restore(), 0) || SP.standing(ctx, im, 'pm' + m.sprite, x, y, 92, { smooth: true, alpha: m.hp === 0 ? 0.3 : 1 }); SPR.party.push({ x, y, m }); }
    // shadows are baked in before the shader so sprites and world get the same pixelation/palette
    require('../../world/stylize').grade(c, process.env.CONQUEST_SHADER || 'conquest');
    // atmosphere: colour wash, god-rays, drifting motes, vignette
    ctx.globalAlpha = mood.wash[1]; ctx.fillStyle = mood.wash[0]; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) { const x = 140 + i * 230 + rng() * 60; const g = ctx.createLinearGradient(x, 0, x + 160, H * 0.7); g.addColorStop(0, mood.shaft); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 330, H * 0.75); ctx.lineTo(x + 130, H * 0.75); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 70; i++) { const x = rng() * W, y = rng() * H; ctx.fillStyle = `rgba(255,255,255,${0.1 + rng() * 0.2})`; ctx.fillRect(x, y, 2, 2); }
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, H * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    return { c, ctx, SPR };
}

// HUD frame for an arena: slim title band on top, status band at the bottom. Restrained: serif type, thin rules.
async function arenaCard(o) {
    const { c, ctx, SPR } = await arenaScene(o); const L = (s, x, y, size, col, al = 'left', fam = 'IMFell, Cinzel, serif') => { ctx.font = `${size}px ${fam}`; ctx.textAlign = al; ctx.fillStyle = col; ctx.fillText(s, x, y); };
    require('./cards').fonts();
    const gt = ctx.createLinearGradient(0, 0, 0, 170); gt.addColorStop(0, 'rgba(8,6,10,.92)'); gt.addColorStop(1, 'rgba(8,6,10,0)'); ctx.fillStyle = gt; ctx.fillRect(0, 0, W, 170);
    L(String(o.title || '').toUpperCase(), 40, 78, 54, '#e8d9a8', 'left', 'CinzelD, Cinzel, serif'); L(o.sub || '', 42, 116, 27, '#bfae84');
    if (o.right) L(o.right, W - 40, 70, 28, '#e0a070', 'right');
    // enemy plates
    for (const s of SPR.enemies) { const e = s.e; if (e.hp == null) continue; const bw = 200; const x = s.x - bw / 2, y = s.y + 18; ctx.fillStyle = 'rgba(8,6,10,.75)'; ctx.fillRect(x - 6, y - 4, bw + 12, 44); L(e.name || '', s.x, y + 14, 20, '#e8d9a8', 'center'); ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x, y + 22, bw, 9); ctx.fillStyle = '#b8403a'; ctx.fillRect(x, y + 22, bw * Math.max(0, e.hp / e.max), 9); }
    for (const s of SPR.party) { const m = s.m; if (m.hp == null) continue; const bw = 96; const x = s.x - bw / 2, y = s.y + 8; L(m.name.slice(0, 12), s.x, y + 14, 19, '#efe3c0', 'center'); ctx.fillStyle = '#1e2a1e'; ctx.fillRect(x, y + 20, bw, 7); ctx.fillStyle = '#5fae5a'; ctx.fillRect(x, y + 20, bw * Math.max(0, m.hp / m.max), 7); if (m.tag) L(m.tag, s.x, s.y - 104, 17, '#9ed89a', 'center'); }
    // bottom band
    const gb = ctx.createLinearGradient(0, H - 250, 0, H); gb.addColorStop(0, 'rgba(8,6,10,0)'); gb.addColorStop(0.35, 'rgba(8,6,10,.88)'); gb.addColorStop(1, 'rgba(8,6,10,.96)'); ctx.fillStyle = gb; ctx.fillRect(0, H - 250, W, 250);
    ctx.strokeStyle = 'rgba(201,168,90,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(40, H - 176); ctx.lineTo(W - 40, H - 176); ctx.stroke();
    (o.lines || []).slice(0, 4).forEach((ln, i) => L(ln, W / 2, H - 134 + i * 40, i === 0 ? 31 : 25, i === 0 ? '#f0e2b4' : '#c7b98f', 'center'));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(201,168,90,.8)'; ctx.strokeRect(6, 6, W - 12, H - 12);
    return c;
}
module.exports = { arenaScene, arenaCard, kindToArena, W, H };
