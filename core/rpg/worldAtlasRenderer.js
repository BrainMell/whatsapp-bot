'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  WORLD ATLAS — "Aldafold" rebuilt in the game's own 3D hex art (owner 2026-10-20: "increase the quality
//  of that map holy shit is it bad … each guild should be showing on the map at once when someone does
//  .j world, all the guild emblems over the location they are assigned to").
//
//  The old chart was a blurry upscaled painting with smeared labels and room for ONE guild. This renders the
//  five continents out of the same pre-baked KayKit hex sprites the guild kingdom and the player base use
//  (crisp at any size, biome-recoloured per realm), with the land silhouettes taken from the realm mask
//  (core/rpgasset/continents/realm_mask.json), and plants EVERY guild's castle — model by hall level, hamlet by
//  member count — on its charter-stone, with the guild emblem floating over it and a name plate under it.
//
//    renderWorldAtlas({ guilds: [{name, continent, marker, emblem, type, buildings, members}], highlight })
//        → Buffer (JPEG) | null          (never throws; caller falls back to text)
//
//  ~0.6-1.2 s cold, memoised per (guild set, highlight).
// ═══════════════════════════════════════════════════════════════════════════
const K = require('./kingdom3d');
const C = require('./continents');
const renderQueue = require('../utils/renderQueue');   // 47-k9: atlas bakes join the one-at-a-time queue
const { emojiFont, fillTextMixed } = require('./emojiFont');   // 2026-10-20: emblem emoji glyphs (owner 'number boxes' bug); color bitmaps (owner 'use colors not hex code')

const CHART_W = 864, CHART_H = 1210;                          // map space ↔ chart pixels (masks are traced from the chart)
const MX0 = 58, MX1 = 810, MY0 = 175, MY1 = 868;              // the chart's drawable ocean area
const CARD_W = 1600, PAD = 60, MW = CARD_W - PAD * 2;
const MH = Math.round(MW * (MY1 - MY0) / (MX1 - MX0));
const TITLE_H = 292;
const KS = parseFloat(process.env.RENDER_ATLAS_SCALE || '0.15') || 0.15;   // sprite scale: hex ≈ 29 px wide

const INK = '#2A1A0D', INK_SOFT = '#5a4630', PARCH = '#EBD9AE', PARCH_DEEP = '#d8c08a', WAX = '#8B1A2B', GOLD = '#c79a3a';
const TEAM = { ADVENTURER: 'red', MERCHANT: 'yellow', RESEARCH: 'green' };
const FLAG = { ADVENTURER: ['#a02c3c', '#7c1e2c'], MERCHANT: ['#b8862e', '#8a6420'], RESEARCH: ['#2a6a6e', '#1e4e52'] };

let _fonts = false;
function fonts() {
    if (_fonts) return; _fonts = true;
    try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
}

// ── noise ─────────────────────────────────────────────────────────────────────
function hash2(seed, x, y) { let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi), c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
    const u = s(xf), v = s(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (seed, x, y) => vnoise(seed, x, y) * 0.6 + vnoise(seed + 7, x * 2.1, y * 2.1) * 0.28 + vnoise(seed + 13, x * 4.3, y * 4.3) * 0.12;

// ── land lookup in chart pixels (the traced mask, hole-filled + slightly dilated so it matches the old silhouette) ──
const PLAQUES = [[350, 275, 515, 312, 'frostreach'], [110, 440, 270, 478, 'wildwood'], [575, 440, 755, 480, 'stormreach'], [180, 665, 340, 705, 'sunscorch'], [545, 658, 715, 698, 'emberfields']];
function realmAtChart(x, y) {
    const probe = (px, py) => C.landAt(px / CHART_W, py / CHART_H);
    let r = probe(x, y);
    if (r) return r;
    for (const [x0, y0, x1, y1, key] of PLAQUES) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return key;   // label holes in the mask are land
    // dilation: the mask was eroded to keep pins off the coast; give the coast back ~7 chart px
    let hit = 0, last = null;
    for (const [dx, dy] of [[7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5]]) { const q = probe(x + dx, y + dy); if (q) { hit++; last = q; } }
    return hit >= 4 ? last : null;
}

// ── guild normalisation ───────────────────────────────────────────────────────
function hallLevel(rec) {
    const b = rec && rec.buildings;
    const h = b && (typeof b.hall === 'object' ? b.hall && b.hall.level : b.hall);
    return Math.max(1, Math.min(5, parseInt(h, 10) || 1));
}
function normGuild(g) {
    const name = g.name || g.guildName || '';
    const place = C.placementOf(name, g);
    const realm = C.get(place.continent);
    const e = g.emblem || {};
    return {
        name, realm: realm.key, biome: realm.biome, marker: place.marker, region: place.marker.region,
        color: /^#[0-9a-fA-F]{3,8}$/.test(e.color || '') ? e.color : null, icon: String(e.icon || '').trim(), img: e.img || null,
        type: TEAM[g.type] ? g.type : 'ADVENTURER', hall: hallLevel(g), members: Array.isArray(g.members) ? g.members.length : (parseInt(g.memberCount, 10) || 1),
        level: g.level || 1,
    };
}

// ── terrain ───────────────────────────────────────────────────────────────────
const PROPS = {
    // per realm: [name list for mountains, hills, forest, scatter]
    frostreach: { mtn: ['mountain_A', 'mountain_B', 'mountain_C', 'mountain_A_grass'], hill: ['hills_A', 'hills_B', 'hills_A_trees'], tree: ['trees_A_large', 'trees_B_large', 'trees_A_medium'], rock: ['rock_single_A', 'rock_single_B', 'rock_single_C'] },
    wildwood: { mtn: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass'], hill: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'hills_A'], tree: ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'], rock: ['rock_single_D', 'rock_single_E'] },
    stormreach: { mtn: ['mountain_A_grass_trees', 'mountain_B_grass'], hill: ['hills_A_trees', 'hills_C_trees', 'hills_B'], tree: ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'tree_single_A', 'tree_single_B'], rock: ['rock_single_A', 'rock_single_C'] },
    sunscorch: { mtn: ['mountain_B', 'mountain_C', 'mountain_A'], hill: ['hills_A', 'hills_B', 'hills_C'], tree: ['tree_single_A', 'tree_single_B', 'trees_A_medium'], rock: ['rock_single_A', 'rock_single_B', 'rock_single_D', 'rock_single_E'] },
    emberfields: { mtn: ['mountain_A', 'mountain_B', 'mountain_C', 'mountain_C'], hill: ['hills_A', 'hills_B', 'hills_C'], tree: ['tree_single_A', 'trees_A_medium'], rock: ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D'] },
};
// how rugged / wooded each realm is: [mountain threshold, hill threshold, forest threshold, forest odds]
const RUGGED = { frostreach: [0.68, 0.58, 0.42, 0.72], wildwood: [0.80, 0.66, 0.40, 0.88], stormreach: [0.82, 0.68, 0.42, 0.8], sunscorch: [0.78, 0.55, 0.70, 0.22], emberfields: [0.58, 0.48, 0.80, 0.12] };

function cellGeom(w, MWpx) { return null; }

async function buildTerrain(guilds) {
    const { createCanvas } = require('canvas');
    const V = K.getView('top');
    const k = KS, S = V.S;
    const cellW = 2 * S * k, rowP = K.SQ3 * V.sinP * S * k;
    const cols = Math.ceil(MW / cellW) + 2, rows = Math.ceil(MH / rowP) + 3;
    const w = new K.HexWorld(cols, rows, { scale: k, biome: null, oobWater: true });
    w.layoutFixed(MW, MH, 0, 0, 0, 0);
    const px = (c, r) => { const hw = K.hexWorld(c, r); const p = w.proj(hw.x, hw.z, 0); return p; };
    const toChart = (p) => [MX0 + (p.x / MW) * (MX1 - MX0), MY0 + (p.y / MH) * (MY1 - MY0)];
    const realm = Array.from({ length: rows }, () => new Array(cols).fill(null));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const [cx, cy] = toChart(px(c, r));
        realm[r][c] = realmAtChart(cx, cy);
    }
    // markers in pixel space (clearings + castle placement)
    const mk = guilds.map((g) => ({ g, x: ((g.marker.x * CHART_W) - MX0) / (MX1 - MX0) * MW, y: ((g.marker.y * CHART_H) - MY0) / (MY1 - MY0) * MH }));
    const nearMarker = (x, y, rad) => mk.some((m) => Math.hypot((m.x - x) * 0.9, (m.y - y) * 1.5) < rad);
    const seed = 9137;
    // 1. land / sea, per-cell biome, lakes
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k0 = w.cell[r][c], rk = realm[r][c];
        if (!rk) { k0.water = true; continue; }
        k0.biome = C.get(rk).biome === 'isle' ? null : C.get(rk).biome;
        k0.realmKey = rk;
    }
    // inland lakes (never under a guild, never touching the coast)
    const coastish = (c, r) => [0, 1, 2, 3, 4, 5].some((d) => { const n = K.neighbor(c, r, d); return !w.inb(n[0], n[1]) || !realm[n[1]][n[0]]; });
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
        const rk = realm[r][c]; if (!rk || coastish(c, r)) continue;
        const p = px(c, r);
        if (nearMarker(p.x, p.y, 70)) continue;
        if (fbm(seed + 31, p.x / 70, p.y / 70) > 0.80 && rk !== 'frostreach' || (rk === 'frostreach' && fbm(seed + 37, p.x / 60, p.y / 60) > 0.78)) w.cell[r][c].water = true;
    }
    w.resolve();
    // shallows take the biome of the shore they touch (turquoise round the dunes, glassy round the ice, lava round Eldheim)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k0 = w.cell[r][c];
        if (!k0.water || k0.biome) continue;
        for (let d = 0; d < 6; d++) { const n = K.neighbor(c, r, d); const nk = w.at(n[0], n[1]); if (nk && !nk.water && nk.biome) { k0.biome = nk.biome; break; } }
    }
    // 2. props
    const rngAt = (c, r, s) => hash2(seed + s, c, r);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k0 = w.cell[r][c], rk = realm[r][c];
        if (!rk || k0.water) continue;
        const P = PROPS[rk], R = RUGGED[rk];
        const p = px(c, r);
        const coast = coastish(c, r) || [0, 1, 2, 3, 4, 5].some((d) => { const n = K.neighbor(c, r, d); const nk = w.at(n[0], n[1]); return nk && nk.water; });
        const clear = nearMarker(p.x, p.y, 62);
        const ele = fbm(seed + 3 + rk.length, p.x / 95, p.y / 95), mst = fbm(seed + 19, p.x / 60, p.y / 60);
        const o = { biome: k0.biome, flip: rngAt(c, r, 5) < 0.5, dx: (rngAt(c, r, 6) - 0.5) * 0.5, dz: (rngAt(c, r, 7) - 0.5) * 0.4 };
        const pick = (arr, s) => arr[Math.floor(rngAt(c, r, s) * arr.length) % arr.length];
        if (clear) { if (rngAt(c, r, 8) < 0.16 && !nearMarker(p.x, p.y, 34)) w.put(pick(P.tree, 9), c, r, { ...o, sc: 0.7 }); continue; }
        if (coast) { if (rngAt(c, r, 10) < 0.2) w.put(pick(rngAt(c, r, 11) < 0.5 ? P.tree : P.rock, 12), c, r, { ...o, sc: 0.8 }); continue; }
        if (ele > R[0]) w.put(pick(P.mtn, 13), c, r, { ...o, sc: 1.0 });
        else if (ele > R[1]) w.put(pick(P.hill, 14), c, r, { ...o });
        else if (mst > R[2] && rngAt(c, r, 15) < R[3]) w.put(pick(P.tree, 16), c, r, { ...o });
        else if (rngAt(c, r, 17) < 0.2) w.put(pick(P.rock, 18), c, r, { ...o, sc: 0.9 });
    }
    // 3. each guild: castle by hall level, hamlet by member count, towers + dirt pad
    const hamletRng = (name) => K.mulberry32(K.hashStr('atlas:' + name));
    const worldOf = (x, y) => { const V2 = w.view; return { x: (x - w.ox) / (V2.S * k), z: (y - w.oy) / (V2.sinP * V2.S * k) }; };
    const castles = [];
    for (const m of mk) {
        const g = m.g, team = TEAM[g.type], bio = C.get(g.realm).biome === 'isle' ? null : C.get(g.realm).biome;
        const wc = worldOf(m.x, m.y);
        const B = (n) => `building_${n}_${team}`;
        const at = (name, dx, dz, o = {}) => w.put(name, 0, 0, { wx: wc.x + dx, wz: wc.z + dz, biome: bio, ...o });
        at('building_dirt', 0, 0.1, { layer: 'flat', sc: 1.7 + g.hall * 0.15, biome: null });
        const rng = hamletRng(g.name);
        const nHouse = Math.min(g.members - 1, 4 + g.hall * 2, 14);
        for (let i = 0; i < nHouse; i++) {
            const a = (i / Math.max(1, nHouse)) * Math.PI * 2 + rng() * 0.5, rr = 1.9 + rng() * 1.0 + g.hall * 0.1;
            const hn = K.houseName(rng, C.get(g.realm).biome, { view: 'top', shop: false });
            if (hn) at(hn, Math.cos(a) * rr, Math.sin(a) * rr * 0.75, { sc: 1.05, flip: rng() < 0.5 });
        }
        const sc = 1.5 + g.hall * 0.1;
        const model = ['tower_A', 'tower_base', 'barracks', 'castle', 'castle'][g.hall - 1];
        if (g.hall === 2) at(B('tower_A'), 0.4, -0.1, { sc });
        at(B(model), g.hall === 2 ? -0.35 : 0, 0, { sc });
        if (g.hall >= 3) { at(B('tower_A'), -1.3, 0.4, { sc: sc * 0.62 }); at(B('tower_A'), 1.3, 0.4, { sc: sc * 0.62 }); }
        if (g.hall >= 5) { at(B('tower_B'), -2.0, -0.3, { sc: sc * 0.6 }); at(B('tower_B'), 2.0, -0.3, { sc: sc * 0.6 }); at('flag_' + team, 0.8, 1.2, { sc: 1.4 }); }
        const meta = K.spriteMeta(B(model), 'top');
        castles.push({ g, x: m.x, y: m.y, topY: m.y - (meta ? meta.ay * k * sc : 40), hall: g.hall });
    }
    // 4. paint
    const canvas = createCanvas(MW, MH), ctx = canvas.getContext('2d');
    await w.draw(ctx, { drawBackdrop: (c2) => { c2.fillStyle = '#2f86c4'; c2.fillRect(0, 0, MW, MH); } });
    return { canvas, castles, realm, cols, rows, px, w };
}

// ── overlays ──────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) { K.roundRect(ctx, x, y, w, h, r); }

async function drawEmblem(ctx, g, x, y, R, crest) {
    const [c1, c2] = FLAG[g.type];
    const col = g.color || c1;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    // heater shield, same heraldry as the castle crest
    const sw = R * 1.75, sh = R * 2.15;
    const sp = () => { ctx.beginPath(); ctx.moveTo(x - sw / 2, y - sh / 2); ctx.lineTo(x + sw / 2, y - sh / 2); ctx.quadraticCurveTo(x + sw / 2, y + sh * 0.1, x, y + sh / 2); ctx.quadraticCurveTo(x - sw / 2, y + sh * 0.1, x - sw / 2, y - sh / 2); ctx.closePath(); };
    sp();
    const gr = ctx.createLinearGradient(x, y - sh / 2, x, y + sh / 2);
    gr.addColorStop(0, col); gr.addColorStop(1, g.color ? '#00000088' : c2);
    ctx.fillStyle = gr; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = Math.max(2, R * 0.16); ctx.stroke();
    ctx.save(); sp(); ctx.clip();
    if (crest) { ctx.drawImage(crest, x - sw / 2, y - sh / 2, sw, sh); }
    ctx.restore();
    if (!crest) {
        const glyph = g.icon || (g.name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (g.icon) { ctx.fillStyle = '#fff4d0'; ctx.font = emojiFont(glyph, R * 1.15); fillTextMixed(ctx, glyph.slice(0, 2), x, y - R * 0.12); }
        else { ctx.font = `${Math.round(R * 1.2)}px "Cinzel Deco B", "Cinzel", serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,14,6,0.85)'; ctx.strokeText(glyph, x, y - R * 0.1); ctx.fillStyle = '#fff4d0'; ctx.fillText(glyph, x, y - R * 0.1); }
    }
    sp(); ctx.strokeStyle = 'rgba(255,244,208,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
}

async function crestImage(g) {
    if (!g.img || typeof g.img !== 'string') return null;
    try { const { loadImage } = require('canvas'); return await loadImage(g.img.startsWith('data:') ? g.img : Buffer.from(g.img, 'base64')); } catch (e) { return null; }
}

function nameplate(ctx, text, x, y, hi) {
    ctx.save();
    ctx.font = `${hi ? 15 : 13}px "Cinzel", serif`;
    const label = text.length > 20 ? text.slice(0, 19) + '…' : text;
    const tw = ctx.measureText(label).width + 16, h = hi ? 22 : 19;
    const rect = { x: x - tw / 2, y: y, w: tw, h };
    ctx.fillStyle = hi ? '#6b2a1c' : '#4a1d17'; ctx.strokeStyle = hi ? '#f0c85a' : '#20100c'; ctx.lineWidth = hi ? 2.4 : 2;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F6E8C6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + h / 2 + 0.5);
    ctx.restore();
    return rect;
}

function compass(ctx, cx, cy, R) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(235,217,174,0.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 - Math.PI / 2, L = i % 2 ? R * 0.55 : R * 0.95, Wd = i % 2 ? R * 0.1 : R * 0.16;
        ctx.fillStyle = i === 0 ? WAX : INK;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * L, Math.sin(a) * L); ctx.lineTo(Math.cos(a + 1.57) * Wd, Math.sin(a + 1.57) * Wd); ctx.lineTo(Math.cos(a - 1.57) * Wd, Math.sin(a - 1.57) * Wd); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = INK; ctx.font = `${Math.round(R * 0.34)}px "Cinzel", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -R - 13);
    ctx.restore();
}

function spacedText(ctx, text, x, y, spacing) {
    const chars = [...text]; let tw = 0; for (const ch of chars) tw += ctx.measureText(ch).width + spacing; tw -= spacing;
    let cx = x - tw / 2; ctx.textAlign = 'left';
    for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
}

// realm label plates: pick the spot of the realm's land farthest from every guild + the coast
function realmLabelPos(t, key, markers) {
    let best = null, bs = -1;
    for (let r = 2; r < t.rows - 2; r += 2) for (let c = 2; c < t.cols - 2; c += 2) {
        if (t.realm[r][c] !== key || t.w.cell[r][c].water) continue;
        const p = t.px(c, r);
        let md = 1e9; for (const m of markers) md = Math.min(md, Math.hypot(p.x - m.x, (p.y - m.y) * 1.4));
        let edge = 9; for (let d = 0; d < 6; d++) { let q = [c, r]; for (let s = 1; s <= 4; s++) { q = K.neighbor(q[0], q[1], d); if (!t.w.inb(q[0], q[1]) || t.realm[q[1]][q[0]] !== key) { edge = Math.min(edge, s); break; } } }
        const sc = Math.min(md, 320) + edge * 28;
        if (sc > bs) { bs = sc; best = p; }
    }
    return best;
}

// ── composition ───────────────────────────────────────────────────────────────
const _memo = new Map();
// 47-k9: route the actual composition through the shared render queue —
// 2026-10-20 03:11Z: `.j world` + `.j base` + `.j guild` landed together and
// three unqueued canvas jobs pushed RSS through the pm2 430M ceiling on a
// 952MB box (memory kill mid-command, no JS stack). Memo hits pay only a
// fast queue slot; a queue rejection → null → caller's legacy-chart fallback.
async function renderWorldAtlas(o = {}) {
    return renderQueue.run('bake:world-atlas', () => renderWorldAtlasUnqueued(o), { timeoutMs: 60000 });
}

async function renderWorldAtlasUnqueued(o = {}) {
    try {
        fonts();
        const guilds = (o.guilds || []).filter((g) => g && (g.name || g.guildName)).map(normGuild)
            .sort((a, b) => a.marker.y - b.marker.y);                                   // back-to-front
        const hi = o.highlight || null;
        const key = K.hashStr(JSON.stringify([guilds.map((g) => [g.name, g.marker, g.hall, Math.min(g.members, 15), g.icon, g.color, g.type, g.img ? g.img.length : 0]), hi]));
        if (_memo.has(key)) return _memo.get(key);

        const { createCanvas } = require('canvas');
        const t = await buildTerrain(guilds);
        // roster layout
        const byRealm = {}; for (const c of C.CONTINENTS) byRealm[c.key] = [];
        for (const g of guilds) byRealm[g.realm].push(g);
        for (const k2 of Object.keys(byRealm)) byRealm[k2].sort((a, b) => b.hall - a.hall || b.members - a.members || a.name.localeCompare(b.name));
        const ROWS_MAX = Math.min(8, Math.max(2, ...Object.values(byRealm).map((a) => a.length)));
        const ROSTER_H = 96 + ROWS_MAX * 30 + 34;
        const H = TITLE_H + MH + 44 + ROSTER_H + 70;
        const canvas = createCanvas(CARD_W, H), ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

        // parchment
        ctx.fillStyle = PARCH; ctx.fillRect(0, 0, CARD_W, H);
        const rnd = K.mulberry32(77);
        for (let i = 0; i < 26; i++) { ctx.fillStyle = PARCH_DEEP; ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.ellipse(rnd() * CARD_W, rnd() * H, 70 + rnd() * 190, 40 + rnd() * 120, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        // outer frame
        ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 3; ctx.strokeRect(24, 24, CARD_W - 48, H - 48);
        ctx.lineWidth = 1.2; ctx.strokeRect(36, 36, CARD_W - 72, H - 72);
        for (const [x, y, sx, sy] of [[36, 36, 1, 1], [CARD_W - 36, 36, -1, 1], [36, H - 36, 1, -1], [CARD_W - 36, H - 36, -1, -1]]) {
            ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + sx * 34, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * 34); ctx.stroke();
            ctx.fillStyle = WAX; ctx.beginPath(); ctx.arc(x + sx * 12, y + sy * 12, 4, 0, Math.PI * 2); ctx.fill();
        }
        // title
        ctx.fillStyle = INK_SOFT; ctx.font = '22px "Cinzel", serif'; ctx.textBaseline = 'alphabetic';
        spacedText(ctx, 'THE MORTAL WORLD OF THE FIRST WORLD', CARD_W / 2, 98, 5);
        ctx.fillStyle = INK; ctx.font = '104px "Cinzel Deco", "Cinzel", serif'; ctx.textAlign = 'center';
        ctx.fillText('ALDAFOLD', CARD_W / 2, 196);
        ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(CARD_W / 2 - 230, 214); ctx.lineTo(CARD_W / 2 + 230, 214); ctx.stroke();
        ctx.fillStyle = WAX; ctx.fillRect(CARD_W / 2 - 7, 207, 14, 15);
        ctx.fillStyle = INK_SOFT; ctx.font = 'italic 24px "IM Fell Italic", serif';
        ctx.fillText(guilds.length ? `${guilds.length} guild${guilds.length === 1 ? '' : 's'} hold charter-stones across five lands` : 'five lands, and not one charter-stone set yet', CARD_W / 2, 252);

        // map: drop shadow + frame
        const mx = PAD, my = TITLE_H;
        ctx.save(); ctx.shadowColor = 'rgba(40,24,8,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#2f86c4'; ctx.fillRect(mx - 6, my - 6, MW + 12, MH + 12); ctx.restore();
        ctx.drawImage(t.canvas, mx, my);
        // sea vignette + a few soft wave strokes
        const vg = ctx.createRadialGradient(mx + MW / 2, my + MH / 2, MH * 0.35, mx + MW / 2, my + MH / 2, MW * 0.78);
        vg.addColorStop(0, 'rgba(10,40,90,0)'); vg.addColorStop(1, 'rgba(10,30,70,0.38)');
        ctx.save(); ctx.beginPath(); ctx.rect(mx, my, MW, MH); ctx.clip(); ctx.fillStyle = vg; ctx.fillRect(mx, my, MW, MH);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        const wr = K.mulberry32(5);
        for (let i = 0; i < 70; i++) {
            const wx = mx + wr() * MW, wy = my + wr() * MH;
            const cc = Math.floor((wx - mx) / 29), rr2 = Math.floor((wy - my) / 17);
            if (t.realm[Math.min(t.rows - 1, rr2)] && t.realm[Math.min(t.rows - 1, rr2)][Math.min(t.cols - 1, cc)]) continue;
            ctx.beginPath(); ctx.moveTo(wx - 14, wy); ctx.quadraticCurveTo(wx - 7, wy - 5, wx, wy); ctx.quadraticCurveTo(wx + 7, wy + 5, wx + 14, wy); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.strokeRect(mx, my, MW, MH);
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(mx + 7, my + 7, MW - 14, MH - 14);
        // tick marks
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        for (let i = 1; i < 16; i++) { const tx = mx + (MW / 16) * i; ctx.beginPath(); ctx.moveTo(tx, my); ctx.lineTo(tx, my + 10); ctx.moveTo(tx, my + MH); ctx.lineTo(tx, my + MH - 10); ctx.stroke(); }

        // realm plates
        const gm = t.castles.map((c) => ({ x: c.x, y: c.y }));
        ctx.save(); ctx.translate(mx, my); ctx.beginPath(); ctx.rect(0, 0, MW, MH); ctx.clip();
        for (const c of C.CONTINENTS) {
            const p = realmLabelPos(t, c.key, gm); if (!p) continue;
            ctx.font = '30px "Cinzel", serif'; const label = c.name.toUpperCase();
            let tw = 0; for (const ch of label) tw += ctx.measureText(ch).width + 7; tw -= 7;
            ctx.font = 'italic 16px "IM Fell Italic", serif'; const ew = ctx.measureText(c.epithet).width;
            const pw = Math.max(tw, ew) + 44;
            ctx.fillStyle = 'rgba(235,217,174,0.92)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
            roundRect(ctx, p.x - pw / 2, p.y - 28, pw, 72, 5); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = GOLD; ctx.lineWidth = 1; roundRect(ctx, p.x - pw / 2 + 4, p.y - 24, pw - 8, 64, 3); ctx.stroke();
            ctx.font = '30px "Cinzel", serif'; ctx.fillStyle = INK; ctx.textBaseline = 'middle'; spacedText(ctx, label, p.x, p.y + 1, 7);
            ctx.font = 'italic 16px "IM Fell Italic", serif'; ctx.fillStyle = INK_SOFT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(c.epithet, p.x, p.y + 32);
        }
        // the sea's name
        ctx.font = 'italic 38px "IM Fell Italic", serif'; ctx.fillStyle = 'rgba(235,245,255,0.8)'; ctx.textAlign = 'center';
        const sx = ((C.CENTRE_SEA.at[0] * CHART_W) - MX0) / (MX1 - MX0) * MW, sy = ((C.CENTRE_SEA.at[1] * CHART_H) - MY0) / (MY1 - MY0) * MH;
        ctx.fillText('The Drowned Sea', sx, sy);
        compass(ctx, 118, MH - 118, 56);

        // guilds: emblem over castle + nameplate (greedy collision avoidance on plates)
        const used = [];
        const crests = await Promise.all(t.castles.map((c) => crestImage(c.g)));
        for (let i = 0; i < t.castles.length; i++) {
            const c = t.castles[i], g = c.g, isHi = hi && g.name === hi;
            const R = isHi ? 19 : 15;
            const ex = c.x, ey = c.topY - R - 14;
            if (isHi) {                                                                       // "you are here" halo
                const hg = ctx.createRadialGradient(c.x, c.y - 24, 6, c.x, c.y - 24, 80);
                hg.addColorStop(0, 'rgba(255,230,120,0.65)'); hg.addColorStop(1, 'rgba(255,230,120,0)');
                ctx.fillStyle = hg; ctx.fillRect(c.x - 90, c.y - 120, 180, 190);
            }
            ctx.strokeStyle = 'rgba(58,42,24,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex, ey + R); ctx.lineTo(ex, c.topY + 4); ctx.stroke();   // pole down to the keep
            await drawEmblem(ctx, g, ex, ey, R, crests[i]);
            // nameplate under the castle
            let py = c.y + 14, rect;
            for (let tries = 0; tries < 6; tries++) {
                ctx.font = '13px "Cinzel", serif';
                const tw = Math.min(ctx.measureText(g.name).width, 210) + 16;
                rect = { x: c.x - tw / 2, y: py, w: tw, h: 20 };
                if (!used.some((u) => rect.x < u.x + u.w && rect.x + rect.w > u.x && rect.y < u.y + u.h && rect.y + rect.h > u.y)) break;
                py += 22;
            }
            const r2 = nameplate(ctx, g.name, c.x, py, isHi); used.push(r2);
        }
        ctx.restore();

        // roster
        const ry = my + MH + 44;
        const colW = (CARD_W - PAD * 2 - 4 * 18) / 5;
        C.CONTINENTS.forEach((c, i) => {
            const x = PAD + i * (colW + 18), list = byRealm[c.key];
            ctx.fillStyle = 'rgba(244,230,190,0.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
            roundRect(ctx, x, ry, colW, ROSTER_H, 5); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = GOLD; ctx.lineWidth = 1; roundRect(ctx, x + 5, ry + 5, colW - 10, ROSTER_H - 10, 3); ctx.stroke();
            ctx.fillStyle = INK; ctx.font = '21px "Cinzel", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(c.name.toUpperCase(), x + colW / 2, ry + 36);
            ctx.fillStyle = INK_SOFT; ctx.font = 'italic 14px "IM Fell Italic", serif';
            ctx.fillText(`${list.length} guild${list.length === 1 ? '' : 's'} · ${c.biome === 'isle' ? 'coast' : c.biome === 'highlands' ? 'autumn wood' : c.biome === 'desert' ? 'dunes' : c.biome === 'tundra' ? 'tundra' : 'ashlands'}`, x + colW / 2, ry + 58);
            ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 24, ry + 70); ctx.lineTo(x + colW - 24, ry + 70); ctx.stroke();
            const shown = list.slice(0, ROWS_MAX === 8 && list.length > 8 ? 7 : 8);
            shown.forEach((g, j) => {
                const yy = ry + 96 + j * 30, hl = hi && g.name === hi;
                if (hl) { ctx.fillStyle = 'rgba(199,154,58,0.35)'; ctx.fillRect(x + 12, yy - 15, colW - 24, 26); }
                ctx.fillStyle = (g.color || FLAG[g.type][0]); ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(x + 20, yy - 11); ctx.lineTo(x + 36, yy - 11); ctx.lineTo(x + 36, yy); ctx.lineTo(x + 28, yy + 8); ctx.lineTo(x + 20, yy); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = INK; ctx.font = '16px "IM Fell", serif'; ctx.textAlign = 'left';
                const nm = g.name.length > 17 ? g.name.slice(0, 16) + '…' : g.name;
                ctx.fillText(nm, x + 46, yy + 4);
                ctx.textAlign = 'right'; ctx.fillStyle = INK_SOFT; ctx.font = '14px "Cinzel", serif'; ctx.fillText(`Hall ${g.hall}`, x + colW - 18, yy + 4);
            });
            if (list.length > shown.length) { ctx.fillStyle = INK_SOFT; ctx.font = 'italic 15px "IM Fell Italic", serif'; ctx.textAlign = 'center'; ctx.fillText(`+ ${list.length - shown.length} more`, x + colW / 2, ry + 96 + shown.length * 30 + 4); }
            if (!list.length) { ctx.fillStyle = INK_SOFT; ctx.font = 'italic 16px "IM Fell Italic", serif'; ctx.textAlign = 'center'; ctx.fillText('unclaimed land', x + colW / 2, ry + 110); }
        });
        // footer
        ctx.fillStyle = INK_SOFT; ctx.font = 'italic 17px "IM Fell Italic", serif'; ctx.textAlign = 'center';
        ctx.fillText('A guild\'s castle grows with its Guild Hall — outpost keep to royal citadel. Found yours with a realm of your choice.', CARD_W / 2, H - 52);

        const buf = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        _memo.set(key, buf);
        while (_memo.size > 6) _memo.delete(_memo.keys().next().value);
        return buf;
    } catch (e) {
        try { console.error('[worldAtlasRenderer] render failed:', e.stack || e.message); } catch (_) { /* noop */ }
        return null;
    }
}

module.exports = { renderWorldAtlas, normGuild, hallLevel };
