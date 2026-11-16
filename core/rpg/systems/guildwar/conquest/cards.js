'use strict';
// 🎴 CONQUEST CARDS v2 — big portrait (4:5) cards, painted pixel-art world (NO hex tiles), crisp UI on top.
// World layer is drawn at low resolution and nearest-neighbour upscaled (the "pixel art shader" look: hard pixels, limited
// palette, ink outlines). UI (header, panels, text, icons) is drawn crisp afterwards and is NOT stylised.
const path = require('path'); const fs = require('fs');
const { createCanvas, loadImage, registerFont } = require('canvas');
const map = require('./mapgen');
const ASSETS = path.join(__dirname, '..', '..', '..', '..', 'rpgasset');
const ICON_DIR = path.join(ASSETS, 'packs', 'icons', 'game-icons-net');
let fontsDone = false;
function fonts() { if (fontsDone) return; fontsDone = true; for (const [f, fam] of [['PixeloidSans.ttf', 'Pixeloid'], ['CinzelDecorative-Bold.ttf', 'CinzelD'], ['Cinzel-Variable.ttf', 'Cinzel']]) { try { registerFont(path.join(ASSETS, 'fonts', f), { family: fam }); } catch (e) { /* fallback */ } } }
const INK = '#14101a'; const GOLD = '#f2c75c'; const PAPER = '#f3e7c9';
const OWN = ['#3a86ff', '#ef476f', '#06d6a0', '#ffd166', '#9b5de5', '#fb8500', '#adb5bd', '#c08457'];
const ownerColor = (names, n) => OWN[Math.max(0, names.indexOf(n)) % OWN.length];

const ICONS = { keep: 'delapouite/crenel-crown', fortress: 'delapouite/castle', ruins: 'delapouite/ancient-ruins', shrine: 'delapouite/temple-gate', ley_gate: 'lorc/magic-portal', titan: 'lorc/daemon-skull', village: 'delapouite/huts-village', gem_vein: 'lorc/crystal-shine', pass: 'delapouite/mountain-road', forest: 'lorc/pine-tree', plain: 'lorc/footprint', flag: 'delapouite/flag-objective', boot: 'lorc/walking-boot', swords: 'lorc/crossed-swords', compass: 'lorc/compass', scroll: 'lorc/scroll-unfurled', shield: 'sbed/shield', clock: 'lorc/hourglass' };
const KCOL = { keep: '#ffd166', fortress: '#d9d9e3', ruins: '#c9a0ff', shrine: '#7df9c4', ley_gate: '#6fd3ff', titan: '#ff6b5e', village: '#ffb86b', gem_vein: '#ff7bd5', pass: '#c9c3b8', forest: '#7ed957', plain: '#d9cfa8' };
const iconCache = new Map();
async function rawIcon(key, size) {
    const k = key + '@' + size; if (iconCache.has(k)) return iconCache.get(k);
    const f = path.join(ICON_DIR, (ICONS[key] || key) + '.svg'); let svg; try { svg = fs.readFileSync(f, 'utf8'); } catch (e) { return null; }
    svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '').replace('<svg ', `<svg width="${size}" height="${size}" `).replace(/<path /g, '<path fill="#fff" ').replace(/fill="#fff" fill="#fff"/g, 'fill="#fff"');
    let img; try { img = await loadImage(Buffer.from(svg)); } catch (e) { return null; }
    const c = createCanvas(size, size); c.getContext('2d').drawImage(img, 0, 0, size, size); iconCache.set(k, c); return c;
}
/** coloured icon with a thick ink outline (alpha-dilation) so it reads on any terrain */
async function icon(key, color, size, outline = Math.max(2, Math.round(size / 14))) {
    const base = await rawIcon(key, size); if (!base) return null;
    const pad = outline + 1; const S = size + pad * 2; const c = createCanvas(S, S); const x = c.getContext('2d');
    const tint = createCanvas(size, size); const t = tint.getContext('2d'); t.drawImage(base, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, size, size);
    const ink = createCanvas(size, size); const i = ink.getContext('2d'); i.drawImage(base, 0, 0); i.globalCompositeOperation = 'source-in'; i.fillStyle = INK; i.fillRect(0, 0, size, size);
    for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; x.drawImage(ink, pad + Math.cos(ang) * outline, pad + Math.sin(ang) * outline); }
    x.drawImage(tint, pad, pad); return c;
}

// ── pixel world ──────────────────────────────────────────────────────────────────────────────
const PAL = {
    volcanic: { sea: ['#3b1d33', '#4a2540'], foam: '#ff9d4a', crack: '#ff8a2a', plain: ['#8a7064', '#7d6559'], farm: ['#94766a', '#876c60'], forest: ['#3f6b3c', '#345c33'], hills: ['#a08678', '#ad9486'], mountain: ['#5d5566', '#cfc6d6'], marsh: ['#6a4f72', '#5e4566'], lake: ['#5b3a85', '#684392'] },
    desert: { sea: ['#2b7a9b', '#2f86a8'], foam: '#d9f4ff', plain: ['#e0b963', '#d8af58'], farm: ['#c9a24a', '#bf9a42'], forest: ['#6d8a3c', '#5f7c34'], hills: ['#c48b46', '#cf9a52'], mountain: ['#8b5a3c', '#e7d3b5'], marsh: ['#8a9a55', '#7f8f4c'], lake: ['#2d9cc4', '#37a8d0'] },
    tundra: { sea: ['#2f5f8f', '#366a9c'], foam: '#eaf6ff', plain: ['#dfe9f0', '#d3e0ea'], farm: ['#cbd9e3', '#c0cfdb'], forest: ['#3f6a5a', '#355d4e'], hills: ['#b9c9d6', '#c7d6e2'], mountain: ['#7f8fa0', '#ffffff'], marsh: ['#9fb6c4', '#94acbb'], lake: ['#5fa3d4', '#6bb0df'] },
    highlands: { sea: ['#2a6f97', '#2f7aa4'], foam: '#e4f7ff', plain: ['#6fae4f', '#65a346'], farm: ['#c8b84a', '#6fae4f'], forest: ['#2f6b3a', '#285e32'], hills: ['#8bb55a', '#7ea850'], mountain: ['#6d6f78', '#e9edf0'], marsh: ['#4f8a6a', '#467d5e'], lake: ['#2e86c1', '#3a92cc'] },
    isle: { sea: ['#1f6fa8', '#2679b4'], foam: '#ffffff', plain: ['#e6d393', '#dcc986'], farm: ['#8cc063', '#80b458'], forest: ['#2f7d4a', '#286f41'], hills: ['#8fc068', '#84b45e'], mountain: ['#707682', '#e6eaee'], marsh: ['#4f9a8a', '#468b7c'], lake: ['#2e9fd4', '#3aabde'] },
};
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

/** draw the painted terrain for cells [x0,x0+w) x [y0,y0+h) at S internal px per cell. returns cell->screen mapper */
function paintWorld(ctx, g, snap, x0, y0, w, h, S, IW, IH, opts = {}) {
    const realm = g.realms.find((r) => r.key === snap.realm); const P = PAL[realm.biome] || PAL.highlands; const tiles = g.tiles; const names = (snap.guilds || []).map((q) => q.name);
    const own = {}; for (const t of snap.tiles || []) own[t.id] = t;
    const RP = 0.866; const ox = Math.round((IW - w * S) / 2), oy = Math.round((IH - h * S * RP) / 2);
    const cx = (x, y) => ox + (x - x0 + ((y & 1) ? 0.5 : 0)) * S; const cy = (y) => oy + (y - y0) * S * RP;
    ctx.fillStyle = P.sea[0]; ctx.fillRect(0, 0, IW, IH);
    // sea texture + animated shimmer
    const T = opts.t || 0;
    for (let y = 0; y < IH; y += 2) for (let x = 0; x < IW; x += 2) { const r = hash(x >> 1, y >> 1, 7); if (r > 0.9) px(ctx, x, y, 2, 1, P.sea[1]); else if (r < 0.015 + (opts.lava ? 0.07 : 0)) px(ctx, x, y, 2, 1, P.crack || P.sea[1]); }
    if (opts.waves) { for (let k = 0; k < 90; k++) { const wx = (hash(k, 1, 3) * IW) | 0, wy = (hash(k, 2, 3) * IH) | 0; const ph = (T * 2 + hash(k, 3, 3) * 6.28); if (Math.sin(ph) > 0.4) px(ctx, wx, wy, 3, 1, mix(P.sea[1], '#ffffff', 0.35)); } }
    const cells = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const t = tiles.get(map.tileId(snap.realm, x, y)); if (t) cells.push(t); }
    const has = (x, y) => tiles.has(map.tileId(snap.realm, x, y));
    // land base
    for (const t of cells) {
        const X = cx(t.x, t.y), Y = cy(t.y); const pal = P[t.terrain] || P.plain; const base = pal[0], alt = pal[1];
        const sz = Math.ceil(S + 1);
        ctx.fillStyle = base; ctx.fillRect(Math.floor(X), Math.floor(Y), sz, Math.ceil(S * RP) + 1);
        if (S >= 4) { for (let a = 0; a < S; a += 2) for (let b = 0; b < S; b += 2) if (hash(t.x * 31 + a, t.y * 17 + b, 1) > 0.62) px(ctx, X + a, Y + b, 2, 2, alt); }
        else if (hash(t.x, t.y, 2) > 0.55) px(ctx, X, Y, Math.ceil(S), 1, alt);
    }
    // shore (foam on sea side, lighter land edge)
    for (const t of cells) { const X = cx(t.x, t.y), Y = cy(t.y); let sea = false; for (let d = 0; d < 6; d++) { const [nx, ny] = map.hexNb(t.x, t.y, d); if (!has(nx, ny)) { sea = true; const dx = cx(nx, ny) - X, dy = cy(ny) - Y; const L = Math.hypot(dx, dy) || 1; const fx = X + S / 2 + dx / L * S * 0.62, fy = Y + S * RP / 2 + dy / L * S * 0.5; px(ctx, fx - Math.max(1, S * 0.2), fy - Math.max(1, S * 0.2), Math.max(2, Math.ceil(S * 0.55)), Math.max(1, Math.ceil(S * 0.25)), P.foam); } } if (sea && S >= 4) px(ctx, X, Y, Math.ceil(S), 1, mix((P[t.terrain] || P.plain)[0], '#ffffff', 0.25)); }
    // scenery sprites (depth sorted by row)
    if (S >= 6) {
        for (const t of cells) {
            const X = cx(t.x, t.y), Y = cy(t.y); const r = hash(t.x, t.y, 5);
            if (t.terrain === 'forest') { for (let k = 0; k < 2; k++) { const tx = X + 1 + k * (S / 2 - 1) + (r * 2 | 0), ty = Y + 1 + (k ? 1 : 0); px(ctx, tx + 2, ty + 5, 1, 2, '#3b2a1a'); for (let j = 0; j < 4; j++) px(ctx, tx + 2 - j, ty + 1 + j, 1 + j * 2, 1, j % 2 ? P.forest[1] : mix(P.forest[0], '#0a1a0a', 0.35)); px(ctx, tx + 2, ty, 1, 1, mix(P.forest[1], '#ffffff', 0.2)); } }
            else if (t.terrain === 'mountain') { const mx = X + 1, my = Y + 6; for (let j = 0; j < 6; j++) px(ctx, mx + 3 - j / 1.5 | 0, my - j, 1 + j * 1.3 | 0, 1, j < 2 ? P.mountain[1] : mix(P.mountain[0], '#000000', j % 2 ? 0.15 : 0)); px(ctx, mx + 3, my - 6, 2, 1, P.mountain[1]); }
            else if (t.terrain === 'hills') { px(ctx, X + 1, Y + 4, 6, 2, P.hills[1]); px(ctx, X + 2, Y + 3, 4, 1, P.hills[1]); px(ctx, X + 1, Y + 6, 6, 1, mix(P.hills[0], '#000000', 0.2)); }
            else if (t.terrain === 'marsh') { px(ctx, X + 1, Y + 2, 2, 1, '#7fd3d0'); px(ctx, X + 5, Y + 5, 2, 1, '#7fd3d0'); px(ctx, X + 4, Y + 1, 1, 3, '#a2c45a'); }
            else if (t.terrain === 'farm') { for (let k = 1; k < 7; k += 2) px(ctx, X, Y + k, S, 1, P.farm[1]); }
            else if (t.terrain === 'lake') { px(ctx, X + 2, Y + 3, 3, 1, mix(P.lake[0], '#ffffff', 0.4)); }
            else if (r > 0.8) { px(ctx, X + 2, Y + 4, 1, 2, mix(P.plain[0], '#ffffff', 0.35)); px(ctx, X + 5, Y + 2, 1, 2, mix(P.plain[0], '#000000', 0.2)); }
        }
    } else {
        for (const t of cells) { const X = cx(t.x, t.y), Y = cy(t.y); if (t.terrain === 'mountain') { px(ctx, X, Y - 1, Math.ceil(S), 1, P.mountain[1]); px(ctx, X, Y, Math.ceil(S), Math.ceil(S * RP), P.mountain[0]); } else if (t.terrain === 'forest') px(ctx, X, Y, Math.ceil(S), Math.ceil(S * RP), P.forest[1]); }
    }
    // territory tint + borders
    for (const t of cells) { const o = own[t.id]; if (!o || !o.owner) continue; const col = ownerColor(names, o.owner); const X = cx(t.x, t.y), Y = cy(t.y); ctx.globalAlpha = 0.42; ctx.fillStyle = col; ctx.fillRect(Math.floor(X), Math.floor(Y), Math.ceil(S) + 1, Math.ceil(S * RP) + 1); ctx.globalAlpha = 1; }
    const bw = Math.max(1, Math.round(S / 4));
    for (const t of cells) {
        const o = own[t.id]; const mine = o && o.owner; if (!mine) continue; const col = ownerColor(names, mine); const X = cx(t.x, t.y), Y = cy(t.y);
        for (let d = 0; d < 6; d++) { const [nx, ny] = map.hexNb(t.x, t.y, d); const no = (own[map.tileId(snap.realm, nx, ny)] || {}).owner || null; if (no === mine) continue; const dx = cx(nx, ny) - X, dy = cy(ny) - Y; const L = Math.hypot(dx, dy) || 1; const ex = X + S / 2 + dx / L * S * 0.5, ey = Y + S * RP / 2 + dy / L * S * 0.5 * RP; const contested = no && no !== mine; ctx.fillStyle = contested ? '#ffffff' : col; ctx.fillRect(Math.round(ex - (Math.abs(dy) > Math.abs(dx) ? S * 0.35 : bw / 2)), Math.round(ey - (Math.abs(dy) > Math.abs(dx) ? bw / 2 : S * 0.35)), Math.abs(dy) > Math.abs(dx) ? Math.ceil(S * 0.7) : bw, Math.abs(dy) > Math.abs(dx) ? bw : Math.ceil(S * 0.7)); }
    }
    return { cx, cy, cells, ox, oy, S, RP };
}

function lbl(ctx, text, x, y, size, color = PAPER, align = 'center') { ctx.font = `${size}px Cinzel, serif`; ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = INK; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); }
function panel(ctx, x, y, w, h, r = 6, fill = 'rgba(20,16,26,.92)', stroke = GOLD) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke(); }
function fitText(ctx, text, maxW, size, fam = 'Pixeloid') { let s = size; while (s > 12) { ctx.font = `${s}px ${fam}, sans-serif`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } return s; }

const CW = 1056, CH = 1320; // 4:5 portrait — fills the chat width and most of the screen
function frame(title, sub, right) {
    fonts(); const c = createCanvas(CW, CH); const ctx = c.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, 0, CH); gr.addColorStop(0, '#1c1a22'); gr.addColorStop(1, '#0d0c10'); ctx.fillStyle = gr; ctx.fillRect(0, 0, CW, CH);
    // header
    ctx.fillStyle = '#121016'; ctx.fillRect(0, 0, CW, 138); ctx.fillStyle = GOLD; ctx.fillRect(0, 136, CW, 1.5);
    ctx.textAlign = 'left'; ctx.font = '54px CinzelD, serif'; ctx.fillStyle = '#e8d9a8'; ctx.fillText(title, 30, 76);
    ctx.font = '26px Cinzel, serif'; ctx.fillStyle = '#cdb98a'; ctx.fillText(sub || '', 30, 116);
    if (right) { ctx.textAlign = 'right'; ctx.font = '30px Cinzel, serif'; ctx.fillStyle = '#ff9d6c'; ctx.fillText(right, CW - 30, 60); }
    return { c, ctx };
}
/** blit a low-res canvas into the card with hard pixels */
function blit(ctx, small, x, y, w, h) { ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h); ctx.imageSmoothingEnabled = true; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); }

const MAPX = 12, MAPY = 156, MAPW = CW - 24;

async function worldCard(snap, opts = {}) {
    const g = map.generate(snap.seed); const realm = g.realms.find((r) => r.key === snap.realm); const R = snap.route || null; const over = snap.view === 'overview';
    const cells = [...g.tiles.values()].filter((t) => t.realm === snap.realm); const minx = Math.min(...cells.map((t) => t.x)), maxx = Math.max(...cells.map((t) => t.x)), miny = Math.min(...cells.map((t) => t.y)), maxy = Math.max(...cells.map((t) => t.y));
    const K = over ? 3 : 4; const MAPH = over ? 870 : 792; const IW = MAPW / K, IH = MAPH / K;
    let x0, y0, w, h, S; const me = map.parse(snap.me.at);
    const rp = R ? (R.path || []).map((id) => map.parse(id)).filter((q) => q.realm === snap.realm) : [];
    if (over) { w = maxx - minx + 3; h = maxy - miny + 3; S = Math.max(2, Math.min(IW / (w + 1), IH / (h * 0.866))); x0 = minx - 1; y0 = miny - 1; }
    else if (R && rp.length > 1) { const xs = rp.map((q) => q.x), ys = rp.map((q) => q.y); const ax = Math.min(...xs), bx = Math.max(...xs), ay = Math.min(...ys), by = Math.max(...ys); const cw = bx - ax + 10, ch = by - ay + 8; S = Math.max(2, Math.min(8, Math.floor(IW / (cw + 1)), Math.floor(IH / (ch * 0.866)))); w = Math.floor(IW / S); h = Math.floor(IH / (S * 0.866)); x0 = Math.round((ax + bx) / 2 - w / 2); y0 = Math.round((ay + by) / 2 - h / 2); }
    else { S = 8; w = Math.floor(IW / S); h = Math.floor(IH / (S * 0.866)); x0 = me.x - (w >> 1); y0 = me.y - (h >> 1); }
    if (!over) { x0 = Math.max(minx - 2, Math.min(maxx + 2 - w + 1, x0)); y0 = Math.max(miny - 1, Math.min(maxy + 1 - h + 1, y0)); if (y0 & 1) y0--; }
    const small = createCanvas(IW, IH); const sctx = small.getContext('2d'); const W = paintWorld(sctx, g, snap, x0, y0, w, h, S, IW, IH, { t: opts.t || 0, waves: true, lava: realm.biome === 'volcanic' });
    const left = snap.sub || ''; const title = R ? 'ON THE MARCH' : over ? 'THE REALM' : 'CONQUEST'; const sub = `${snap.title || ''} · ${realm.name}`;
    const { c, ctx } = frame(title, sub, left); blit(ctx, small, MAPX, MAPY, MAPW, MAPH);
    const toX = (x, y) => MAPX + W.cx(x, y) * K + (S * K) / 2, toY = (x, y) => MAPY + (W.cy(y) + (S * W.RP) / 2) * K;
    ctx.save(); ctx.beginPath(); ctx.rect(MAPX, MAPY, MAPW, MAPH); ctx.clip();
    // icons for special tiles
    const own = {}; for (const t of snap.tiles || []) own[t.id] = t; const names = (snap.guilds || []).map((q) => q.name);
    const isz = over ? 26 : 46; const KEYK = over ? ['keep', 'titan', 'ley_gate', 'ruins', 'shrine'] : ['keep', 'titan', 'fortress', 'ruins', 'shrine', 'ley_gate', 'gem_vein'];
    const list = W.cells.filter((t) => KEYK.includes(t.kind) || (own[t.id] && own[t.id].owner && !over && ['fortress', 'keep', 'ruins', 'shrine', 'titan', 'ley_gate', 'gem_vein'].includes(t.kind))).filter((t) => !over || t.kind === 'keep' || t.kind === 'titan' || (own[t.id] && own[t.id].owner) || t.kind === 'ley_gate');
    list.sort((a, b) => a.y - b.y); const taken = []; const placedLbl = [];
    for (const t of list) { const ic = await icon(t.kind, KCOL[t.kind] || '#fff', isz); if (!ic) continue; const X = toX(t.x, t.y), Y = toY(t.x, t.y); if (X < MAPX - 30 || X > MAPX + MAPW + 30) continue; const o = own[t.id]; const oc = o && o.owner ? ownerColor(names, o.owner) : null; ctx.drawImage(ic, X - ic.width / 2, Y - ic.height / 2); if (oc) { ctx.beginPath(); ctx.arc(X + isz * 0.45, Y - isz * 0.45, over ? 6 : 11, 0, 7); ctx.fillStyle = oc; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); } taken.push([X, Y]);
        if (!over && ['keep', 'titan'].includes(t.kind)) { ctx.font = '18px Cinzel, serif'; const tw = ctx.measureText(t.name).width + 8; const bx = X - tw / 2, by = Y + isz * 0.55; if (!placedLbl.some((r) => bx < r[0] + r[2] && bx + tw > r[0] && by < r[1] + r[3] && by + 24 > r[1]) && bx > MAPX && bx + tw < MAPX + MAPW) { placedLbl.push([bx, by, tw, 24]); lbl(ctx, t.name, X, by + 18, 18); } } }
    // route
    if (R && rp.length > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const pts = rp.map((q) => [toX(q.x, q.y), toY(q.x, q.y)]);
        ctx.setLineDash([22, 16]); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#ffe066'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
        const pr = Math.max(0, Math.min(1, R.progress || 0)); const idx = Math.min(pts.length - 1, Math.floor(pr * (pts.length - 1))); const fr = pr * (pts.length - 1) - idx; const a = pts[idx], b = pts[Math.min(pts.length - 1, idx + 1)]; const mx = a[0] + (b[0] - a[0]) * fr, my = a[1] + (b[1] - a[1]) * fr;
        const dest = pts[pts.length - 1]; const fl = await icon('flag', '#ff4d4d', 64); if (fl) ctx.drawImage(fl, dest[0] - 12, dest[1] - fl.height + 18);
        ctx.beginPath(); ctx.arc(mx, my, 24, 0, 7); ctx.fillStyle = 'rgba(255,224,102,.35)'; ctx.fill(); const bt = await icon('boot', '#ffffff', 44); if (bt) ctx.drawImage(bt, mx - bt.width / 2, my - bt.height / 2);
    } else { // you-are-here
        const X = toX(me.x, me.y), Y = toY(me.x, me.y); ctx.beginPath(); ctx.arc(X, Y, over ? 16 : 34, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); lbl(ctx, 'YOU', X, Y - (over ? 22 : 44), over ? 18 : 22, '#fff');
    }
    ctx.restore();
    // bottom panel: standings + legend
    const py = MAPY + MAPH + 24; panel(ctx, 12, py, CW - 24, CH - py - 12);
    const gs = (snap.guilds || []).slice(0, over ? 3 : 5); const mx = Math.max(1, ...gs.map((q) => q.score)); ctx.textAlign = 'left'; ctx.font = '28px CinzelD, serif'; ctx.fillStyle = GOLD; ctx.fillText('STANDINGS', 38, py + 46);
    gs.forEach((q, i) => { const y = py + 76 + i * (over ? 44 : 50); const col = ownerColor(names, q.name); ctx.fillStyle = col; ctx.fillRect(38, y, 30, 30); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(38, y, 30, 30); const s = fitText(ctx, q.name, 250, 26); ctx.font = `${s}px Cinzel, serif`; ctx.fillStyle = PAPER; ctx.textAlign = 'left'; ctx.fillText(q.name, 80, y + 24); ctx.fillStyle = '#2d2438'; ctx.fillRect(330, y + 4, 150, 22); ctx.fillStyle = col; ctx.fillRect(330, y + 4, Math.max(6, 150 * q.score / mx), 22); ctx.textAlign = 'right'; ctx.font = '24px Cinzel, serif'; ctx.fillStyle = PAPER; ctx.fillText(`${q.score} pts · ${q.tiles}▣`, 700, y + 25); });
    // legend
    const L = [['keep', 'Guild Keep'], ['fortress', 'Fortress'], ['titan', 'Titan'], ['ruins', 'Ruins'], ['shrine', 'Shrine'], ['ley_gate', 'Ley Gate'], ['gem_vein', 'Vein'], ['village', 'Village']];
    for (let i = 0; i < L.length; i++) { const col = i % 2, row = Math.floor(i / 2); const X = 722 + col * 160, Y = py + 78 + row * (over ? 42 : 64); const ic = await icon(L[i][0], KCOL[L[i][0]], 36); if (ic) ctx.drawImage(ic, X, Y - 26); ctx.textAlign = 'left'; ctx.font = '19px Cinzel, serif'; ctx.fillStyle = PAPER; ctx.fillText(L[i][1], X + 46, Y + 2); }
    ctx.textAlign = 'center'; ctx.font = '22px Cinzel, serif'; ctx.fillStyle = '#8f7fb0'; ctx.fillText('.j cq targets  ·  .j cq territory  ·  .j cq realm', CW / 2, CH - 28);
    return c;
}


// ── target cards (image instead of a text list) ───────────────────────────────────────────────
const CLAIM = { skirmish: 'SKIRMISH', siege: 'SIEGE', ritual: 'RITUAL', treaty: 'TREATY', titan: 'BOSS FIGHT' };
const CLAIM_COL = { skirmish: '#7ed957', siege: '#ff8a5c', ritual: '#c9a0ff', treaty: '#7df9c4', titan: '#ff4d6d' };

// 🏞️ tile art = the kind's real 3D arena (same engine + pixel/cel shader as the world), cached per kind+biome
const ATH = new Map();
async function arenaArt(g, t) {
    const A = require('./arena'); const biome = (g.realms.find((r) => r.key === t.realm) || {}).biome || 'highlands'; const kind = A.kindToArena(t.kind); const key = kind + '|' + biome + '|' + (t.kind === 'titan' ? t.realm : '');
    if (ATH.has(key)) return ATH.get(key); if (ATH.size > 40) ATH.delete(ATH.keys().next().value);
    const en = t.kind === 'titan' ? [{ cq: `golems/titan_${t.realm}.png`, h: 400 }] : [];
    const { c } = await A.arenaScene({ kind: t.kind, seed: 'thumb:' + key, biome, enemies: en, party: [] }); ATH.set(key, c); return c;
}
function cover(ctx, src, x, y, w, h, fy = 0.5, zoom = 1) { const k = Math.max(w / src.width, h / src.height) * zoom; const sw = w / k, sh = h / k; const cy = Math.max(sh / 2, Math.min(src.height - sh / 2, src.height * fy)); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.drawImage(src, (src.width - sw) / 2, cy - sh / 2, sw, sh, x, y, w, h); ctx.restore(); }
function thumb(g, data, tileId, w, h) { // pixel-art terrain thumbnail around a tile
    const q = map.parse(tileId); const S = 8; const KK = Math.max(3, Math.round(w / 170)); const iw = Math.floor(w / KK), ih = Math.floor(h / KK); const cw = Math.floor(iw / S), ch = Math.floor(ih / (S * 0.866)); const IW2 = iw, IH2 = ih; const c = createCanvas(IW2, IH2); const x = c.getContext('2d');
    const snap = { seed: data.seed, realm: q.realm, tiles: data.owned || [], guilds: data.guilds || [] }; let y0 = q.y - (ch >> 1); if (y0 & 1) y0--;
    const W = paintWorld(x, g, snap, q.x - (cw >> 1), y0, cw, ch, S, IW2, IH2, { waves: false }); return { c, W, q, y0, cw, ch };
}
async function targetsCard(data) {
    fonts(); const g = map.generate(data.seed); const list = data.list || []; const { c, ctx } = frame('TARGETS', `${data.title || ''} · pick a number → .j cq march <#>`, data.pages > 1 ? `page ${data.page}/${data.pages}` : '');
    const names = data.guilds ? data.guilds.map((q) => q.name) : []; const COLS = 2, ROWS = 3; const pad = 14, cw = (CW - pad * 3) / COLS, chh = (CH - 160 - pad * 4 - 40) / ROWS;
    for (let i = 0; i < Math.min(6, list.length); i++) {
        const t = list[i]; const col = i % COLS, row = Math.floor(i / COLS); const X = pad + col * (cw + pad), Y = 154 + pad + row * (chh + pad); const k = map.KINDS[t.kind] || map.KINDS.plain; const cc = CLAIM_COL[k.claim] || GOLD;
        panel(ctx, X, Y, cw, chh, 20, 'rgba(24,18,34,.96)', cc);
        cover(ctx, await arenaArt(g, g.tiles.get(t.id) || t), X + 12, Y + 12, cw - 24, chh * 0.5, 0.45, 1.75);
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(X + 12, Y + 12, cw - 24, chh * 0.5);
        // number badge
        ctx.beginPath(); ctx.arc(X + 44, Y + 44, 30, 0, 7); ctx.fillStyle = cc; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.font = '38px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.fillText(String(t.n), X + 44, Y + 57);
        // claim tag
        ctx.font = '20px Cinzel, serif'; const tag = CLAIM[k.claim] || 'CLAIM'; const tw = ctx.measureText(tag).width + 20; ctx.fillStyle = cc; ctx.fillRect(X + cw - 12 - tw - 6, Y + 18, tw, 30); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(tag, X + cw - 12 - tw / 2 - 6, Y + 40);
        // name + label
        const ty = Y + 12 + chh * 0.5 + 38; ctx.textAlign = 'left'; const fs = fitText(ctx, t.name, cw - 40, 30, 'CinzelD'); ctx.font = `${fs}px CinzelD, serif`; ctx.fillStyle = PAPER; ctx.fillText(t.name, X + 20, ty);
        ctx.font = '22px Cinzel, serif'; ctx.fillStyle = '#b9a9d9'; ctx.fillText(`${k.label}${t.owner ? ' · held by ' + t.owner : ' · unclaimed'}`, X + 20, ty + 32);
        // chips
        const chips = []; if (t.wall) chips.push(['wall', `${t.wall.type}`]); if (t.golems) chips.push(['golem', `×${t.golems}`]); if (t.turrets) chips.push(['turret', `×${t.turrets}`]); if (t.veinLeft) chips.push(['vein', `${t.veinLeft}`]);
        let cx0 = X + 20; ctx.font = '20px Cinzel, serif'; for (const [ty2, txt] of chips) { const lab = ({ wall: 'WALL', golem: 'GOLEM', turret: 'TURRET', vein: 'VEIN' })[ty2] + ' ' + txt; ctx.fillStyle = '#2d2438'; const w2 = ctx.measureText(lab).width + 18; ctx.fillRect(cx0, ty + 46, w2, 28); ctx.fillStyle = PAPER; ctx.fillText(lab, cx0 + 9, ty + 67); cx0 += w2 + 8; }
        // distance + threat
        ctx.textAlign = 'right'; ctx.font = '22px Cinzel, serif'; ctx.fillStyle = '#ffe066'; ctx.fillText(`${t.dist} tile${t.dist === 1 ? '' : 's'} · ~${t.eta}s`, X + cw - 20, ty + 67 - 24 + 0);
        const thr = Math.max(0, Math.min(1, (t.threat || 0) / Math.max(1, (data.myPower || 1) * 2))); ctx.fillStyle = '#2d2438'; ctx.fillRect(X + 20, Y + chh - 22, cw - 40, 10); ctx.fillStyle = thr < 0.5 ? '#7ed957' : thr < 0.85 ? '#ffd166' : '#ff4d6d'; ctx.fillRect(X + 20, Y + chh - 22, Math.max(6, (cw - 40) * thr), 10);
        ctx.textAlign = 'left'; ctx.font = '16px Cinzel, serif'; ctx.fillStyle = '#8f7fb0'; ctx.fillText(`danger ⚔️ ~${t.threat || 0}`, X + 20, Y + chh - 28);
        if (t.owner) { const oc = ownerColor(names, t.owner); ctx.beginPath(); ctx.arc(X + cw - 40, Y + chh * 0.5 + 12 - 12, 0, 0, 1); ctx.fillStyle = oc; }
    }
    if (!list.length) { ctx.textAlign = 'center'; ctx.font = '34px Cinzel, serif'; ctx.fillStyle = PAPER; ctx.fillText('No border targets yet — claim more ground first!', CW / 2, 600); }
    ctx.textAlign = 'center'; ctx.font = '22px Cinzel, serif'; ctx.fillStyle = '#8f7fb0'; ctx.fillText(data.pages > 1 ? `.j cq targets ${Math.min(data.pages, data.page + 1)} for more   ·   .j cq tile <#> for details` : '.j cq tile <#> for details  ·  .j cq muster <#> to bring friends', CW / 2, CH - 22);
    return c;
}

// ── tile detail card ──────────────────────────────────────────────────────────────────────────
async function tileCard(data) {
    fonts(); const g = map.generate(data.seed); const t = data.tile; const k = map.KINDS[t.kind] || map.KINDS.plain; const cc = CLAIM_COL[k.claim] || GOLD;
    const { c, ctx } = frame(t.name.toUpperCase(), `${k.label} · ${t.provName || ''}`, CLAIM[k.claim] || '');
    cover(ctx, await arenaArt(g, g.tiles.get(t.id) || t), 12, 156, CW - 24, 700, 0.5, 1);
    const py = 156 + 700 + 24; panel(ctx, 12, py, CW - 24, CH - py - 12, 18, 'rgba(20,16,26,.95)', cc);
    ctx.textAlign = 'left'; ctx.font = '26px Cinzel, serif'; const rows = data.rows || []; rows.slice(0, 6).forEach(([a, b], i) => { const y = py + 54 + i * 52; ctx.fillStyle = '#9e8fc4'; ctx.fillText(a, 44, y); ctx.fillStyle = PAPER; ctx.textAlign = 'right'; ctx.fillText(String(b), CW - 44, y); ctx.textAlign = 'left'; ctx.fillStyle = '#2d2438'; ctx.fillRect(44, y + 12, CW - 88, 2); });
    ctx.textAlign = 'center'; ctx.font = '22px Cinzel, serif'; ctx.fillStyle = '#ffe066'; ctx.fillText(data.hint || '', CW / 2, CH - 28); return c;
}

// ── territory overview card ───────────────────────────────────────────────────────────────────
async function territoryCard(data) {
    fonts(); const { c, ctx } = frame('TERRITORY', `${data.guild} · ${data.sub || ''}`, data.right || '');
    const stats = data.stats || []; const bw = (CW - 24 - 12 * (Math.min(4, stats.length) - 1)) / Math.min(4, stats.length || 1);
    for (let i = 0; i < Math.min(8, stats.length); i++) { const col = i % 4, row = Math.floor(i / 4); const X = 12 + col * (bw + 12), Y = 160 + row * 150; panel(ctx, X, Y, bw, 134, 16, 'rgba(24,18,34,.96)', stats[i].col || GOLD); const ic = await icon(stats[i].icon || 'flag', stats[i].col || GOLD, 54); if (ic) ctx.drawImage(ic, X + bw / 2 - ic.width / 2, Y + 8); ctx.textAlign = 'center'; ctx.font = '40px Cinzel, serif'; ctx.fillStyle = PAPER; ctx.fillText(String(stats[i].v), X + bw / 2, Y + 100); ctx.font = '18px Cinzel, serif'; ctx.fillStyle = '#9e8fc4'; ctx.fillText(stats[i].k, X + bw / 2, Y + 124); }
    let y = 160 + Math.ceil(Math.min(8, stats.length) / 4) * 150 + 10; panel(ctx, 12, y, CW - 24, CH - y - 12);
    ctx.textAlign = 'left'; ctx.font = '28px CinzelD, serif'; ctx.fillStyle = GOLD; ctx.fillText('YOUR HOLDINGS', 38, y + 46);
    (data.holdings || []).slice(0, 4).forEach((h, i) => { const yy = y + 70 + i * 62; ctx.fillStyle = '#241b30'; ctx.fillRect(30, yy, CW - 84, 52); ctx.fillStyle = h.warn ? '#ff4d6d' : '#7ed957'; ctx.fillRect(30, yy, 8, 52); ctx.font = '24px Cinzel, serif'; ctx.fillStyle = PAPER; ctx.textAlign = 'left'; ctx.fillText(h.name, 54, yy + 34); ctx.textAlign = 'right'; ctx.fillStyle = h.warn ? '#ff9d9d' : '#b9a9d9'; ctx.fillText(h.note, CW - 56, yy + 34); });
    if (data.seed) { // realm minimap with everyone's colours
        const g = map.generate(data.seed); const cells = [...g.tiles.values()].filter((t) => t.realm === data.realm); const minx = Math.min(...cells.map((t) => t.x)), maxx = Math.max(...cells.map((t) => t.x)), miny = Math.min(...cells.map((t) => t.y)), maxy = Math.max(...cells.map((t) => t.y));
        const my = y + 70 + 4 * 62 + 8, mh = CH - my - 28, mw = CW - 52; const K2 = 3; const iw = Math.floor(mw / K2), ih = Math.floor(mh / K2); const w = maxx - minx + 3, h = maxy - miny + 3; const S = Math.max(2, Math.min(iw / (w + 1), ih / (h * 0.866))); const sm = createCanvas(iw, ih);
        paintWorld(sm.getContext('2d'), g, { seed: data.seed, realm: data.realm, tiles: data.owned || [], guilds: data.guilds || [] }, minx - 1, miny - 1, w, h, S, iw, ih, {}); ctx.imageSmoothingEnabled = false; ctx.drawImage(sm, 0, 0, iw, ih, 26, my, iw * K2, ih * K2); ctx.imageSmoothingEnabled = true; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(26, my, iw * K2, ih * K2);
    }
    return c;
}

// ── capture / loss banner card ────────────────────────────────────────────────────────────────
async function captureCard(data) {
    fonts(); const g = map.generate(data.seed); const lost = data.mode === 'lost'; const t = data.tile; const k = map.KINDS[t.kind] || map.KINDS.plain; const col = lost ? '#ff4d6d' : '#ffd166';
    const { c, ctx } = frame(lost ? 'TERRITORY LOST' : 'TERRITORY CAPTURED', `${t.name} · ${k.label}`, '');
    cover(ctx, await arenaArt(g, g.tiles.get(t.id) || t), 12, 156, CW - 24, 900, 0.5);
    ctx.fillStyle = lost ? 'rgba(120,10,30,.35)' : 'rgba(255,209,102,.18)'; ctx.fillRect(12, 156, CW - 24, 900);
    ctx.textAlign = 'center'; ctx.font = '84px CinzelD, serif'; ctx.fillStyle = INK; ctx.fillText(lost ? 'LOST' : 'CAPTURED', CW / 2 + 4, 156 + 850 + 4); ctx.fillStyle = col; ctx.fillText(lost ? 'LOST' : 'CAPTURED', CW / 2, 156 + 850);
    const py = 156 + 900 + 24; panel(ctx, 12, py, CW - 24, CH - py - 12, 18, 'rgba(20,16,26,.95)', col);
    ctx.font = '40px CinzelD, serif'; ctx.fillStyle = PAPER; ctx.fillText(data.headline || '', CW / 2, py + 62); ctx.font = '26px Cinzel, serif'; ctx.fillStyle = '#cdb98a'; (data.lines || []).slice(0, 4).forEach((l, i) => ctx.fillText(l, CW / 2, py + 108 + i * 36)); return c;
}

module.exports = { targetsCard, tileCard, territoryCard, captureCard, worldCard, icon, frame, blit, panel, lbl, fitText, paintWorld, fonts, KCOL, ICONS, OWN, ownerColor, CW, CH, INK, GOLD, PAPER, hash, mix, PAL };
