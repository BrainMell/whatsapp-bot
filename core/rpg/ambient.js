'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  AMBIENT LIFE LAYER — shared animated flourishes for the hex kingdom cards
//  (homesteadBaseRenderer + guildBaseRenderer). Owner 2026-10-19
//  (msg 1561537407189389343): "improve the animation of the water, i like the
//  little sprinkling but its barely noticeable, also add more slight
//  animations... moving little things shuffling trees maybe birds flying by
//  tint ... just bring it to life".
//
//  Everything here is a PURE function of the loop phase t ∈ [0,1) so every
//  14-frame bake loops seamlessly: all oscillators run at integer multiples
//  of 2π per loop, and anything that travels enters/exits off-card.
//
//  Systems (cheapest first, all screen-space):
//    - animateWater   boosted glint tiles ×2 pass, per-cell sparkle points
//                     with cross rays, shore ripple rings, lava pulse
//    - drawSway       tree sprites redrawn ±1-2px on a sine (the baked static
//                     tree underneath peeks ≤1px at bake scale — reads as wind)
//    - drawBirds      two flocks + two loners crossing the card, flapping
//    - drawButterflies eight flutterers over the meadows
//    - drawCloudShadows three soft dark blobs drifting/breathing (light drift)
//    - drawTint       warm/cool global tint breathing (the "tint")
//    - glints()       the old 64x32 water-art white masks (moved from the
//                     homestead renderer so the guild card can use them too)
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const K = require('./kingdom3d');

// ── old water art (two glint frames, 64x32) → white glint masks ──
let _glints = null;
async function glints() {
    if (_glints) return _glints;
    const { createCanvas, loadImage } = require('canvas');
    const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
    const out = [];
    for (const f of ['base_water_0.png', 'base_water_1.png']) {
        try {
            const img = await loadImage(path.join(ASSETS, f));
            const c = createCanvas(img.width, img.height), x = c.getContext('2d');
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height);
            for (let i = 0; i < d.data.length; i += 4) {
                const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
                const a = d.data[i + 3];
                if (a > 20 && lum > 135) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = Math.min(255, (lum - 120) * 2); }
                else d.data[i + 3] = 0;                                    // keep ONLY the bright glints, drop the diamond fill
            }
            x.putImageData(d, 0, 0);
            out.push(c);
        } catch (e) { /* no glints: water just stays still */ }
    }
    _glints = out;
    return out;
}

// ── water / lava: BOOSTED (was a 0.6-alpha glint tile per cell — barely
//    noticeable at bake scale; now glints are near-opaque with an additive
//    echo, plus per-cell sparkle points that flare with cross rays, plus
//    ripple rings on shore cells) ──
function animateWater(ctx, sc, t, G) {
    const lava = sc.realm === 'volcanic', ice = sc.realm === 'tundra';
    const cellW = 1.9 * 96 * sc.k;                                   // glint tile ≈ one cell wide
    ctx.save();
    for (const cell of sc.water) {
        const h01 = (cell.h % 997) / 997;
        const ph = (t + h01) % 1;
        ctx.save();
        ctx.beginPath(); cell.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip();
        if (lava) {                                                  // molten pulse (stronger than before)
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.22 + 0.20 * Math.sin(ph * Math.PI * 2);
            const g = ctx.createRadialGradient(cell.cx, cell.cy, 2, cell.cx, cell.cy, cellW * 0.75);
            g.addColorStop(0, 'rgba(255,190,70,1)'); g.addColorStop(1, 'rgba(255,70,0,0)');
            ctx.fillStyle = g; ctx.fillRect(cell.cx - cellW, cell.cy - cellW, cellW * 2, cellW * 2);
        }
        if (G && G.length) {
            const g = G[Math.floor(ph * 4) % G.length];              // two old-water frames, cycled
            const drift = Math.sin(ph * Math.PI * 2) * 8 * sc.k * 2;
            ctx.globalCompositeOperation = lava ? 'lighter' : 'source-over';
            ctx.globalAlpha = lava ? 0.62 : ice ? 0.52 : 0.9;        // was 0.5 / 0.35 / 0.6
            ctx.drawImage(g, cell.cx - cellW * 0.56 + drift, cell.cy - cellW * 0.28, cellW * 1.12, cellW * 0.56);
            if (!lava) {                                             // additive echo pass for the pop
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = ice ? 0.20 : 0.34;
                ctx.drawImage(g, cell.cx - cellW * 0.56 + drift * 1.4 + 1.5, cell.cy - cellW * 0.28, cellW * 1.12, cellW * 0.56);
            }
        }
        // ── the sprinkling, made visible: two flare points per cell ──
        const pts = [
            { fx: 0.5 + (((cell.h % 89) / 89) - 0.5) * 0.62, fy: 0.42 + (((cell.h % 53) / 53) - 0.5) * 0.44, off: 0.00 },
            { fx: 0.5 + (((cell.h % 31) / 31) - 0.5) * 0.55, fy: 0.58 + (((cell.h % 17) / 17) - 0.5) * 0.40, off: 0.47 },
        ];
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < pts.length; i++) {
            const ph2 = (t + h01 * 0.73 + pts[i].off + i * 0.21) % 1;
            if (ph2 > 0.34) continue;
            const a = Math.sin((ph2 / 0.34) * Math.PI);
            const sx = cell.cx + (pts[i].fx - 0.5) * cellW;
            const sy = cell.cy + (pts[i].fy - 0.5) * cellW * 0.55;
            const col = lava ? '255,210,130' : ice ? '222,242,255' : '255,255,255';
            const R = (1.8 + (i % 2) * 1.1) * Math.max(0.8, sc.k * 2.2);
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 2.4);
            g.addColorStop(0, `rgba(${col},${(0.95 * a).toFixed(3)})`);
            g.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(sx - R * 2.4, sy - R * 2.4, R * 4.8, R * 4.8);
            // cross rays — the classic map-sparkle read
            ctx.strokeStyle = `rgba(${col},${(0.8 * a).toFixed(3)})`;
            ctx.lineWidth = Math.max(0.8, 1.1 * sc.k * 2.2);
            const L = (4.5 + (i % 2) * 2.5) * Math.max(0.8, sc.k * 2.2);
            ctx.beginPath();
            ctx.moveTo(sx - L, sy); ctx.lineTo(sx + L, sy);
            ctx.moveTo(sx, sy - L * 0.62); ctx.lineTo(sx, sy + L * 0.62);
            ctx.stroke();
        }
        // ── shore ripple rings: expanding, fading ellipses on cells that touch land ──
        if (cell.shore && !lava) {
            const ph3 = (t + h01 * 0.618 + 0.13) % 1;
            const r = (3 + ph3 * 11) * Math.max(0.8, sc.k * 2.2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = ice ? `rgba(226,244,255,${(0.30 * (1 - ph3)).toFixed(3)})` : `rgba(255,255,255,${(0.26 * (1 - ph3)).toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(cell.cx, cell.cy, r, r * 0.52, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

// ── tree sway: clone-draw the tree sprites with a ±1-2px sine offset ──
//    The static baked tree stays underneath; the clone (drawn over it) mostly
//    covers it, and the ≤1px sliver at bake scale reads as wind. Draw order is
//    preserved because clones draw after the objects layer at almost the same
//    position — no re-sorting needed.
const TREE_RE = /^trees_[AB]_(large|medium)|^tree_single_[AB]$/;
async function swayTrees(w, { max = 380 } = {}) {
    const vk = w.viewKey, k = w.scale;
    const out = [];
    for (const o of w.objs) {
        if (o.layer === 'flat') continue;
        if (!TREE_RE.test(o.name)) continue;
        const m = K.spriteMeta(o.name, vk);
        if (!m) continue;
        const p = w.proj(o.x, o.z, o.y);
        if (p.x < -60 || p.x > w.W + 60 || p.y < -80 || p.y > w.H + 80) continue;
        const file = K.biomeFile(m.file, w.biome, vk);
        const img = await K.loadSprite(file, vk);
        if (!img) continue;
        const sc = o.sc || 1;
        const dx = p.x - (o.flip ? (m.w - m.ax) : m.ax) * k * sc;
        const dy = p.y - m.ay * k * sc;
        const w0 = m.w * k * sc, h0 = m.h * k * sc;
        const ph = (K.hashStr(`${o.name}|${o.x.toFixed(1)}|${o.z.toFixed(1)}`) % 997) / 997;
        const amp = (1.1 + ((ph * 7.3) % 1) * 1.2) * Math.max(0.7, Math.min(1.6, w0 / 110));
        out.push({ img, dx, dy, w: w0, h: h0, flip: o.flip, ph, amp });
    }
    if (out.length > max) { out.sort((a, b) => (b.w * b.h) - (a.w * a.h)); out.length = max; }
    return out;
}
function drawSway(ctx, list, t) {
    if (!list || !list.length) return;
    for (const s of list) {
        const off = Math.sin(t * Math.PI * 4 + s.ph * Math.PI * 2) * s.amp;   // 2 sway cycles per loop
        if (s.flip) {
            ctx.save(); ctx.translate(s.dx + off + s.w, s.dy); ctx.scale(-1, 1);
            ctx.drawImage(s.img, 0, 0, s.w, s.h); ctx.restore();
        } else ctx.drawImage(s.img, s.dx + off, s.dy, s.w, s.h);
    }
}

// ── birds: V-flocks + loners crossing the card, with soft ground shadows ──
//    Loop-safe: every bird crosses the card exactly ONCE per loop (u = (t + phase) % 1), so frame 13 → frame 0 has no
//    jump; wingbeats are an integer count per loop. Sized from the card width so they read in a WhatsApp preview.
function birdShape(ctx, x, y, s, flap, lw) {
    const lift = flap * s * 0.95;
    ctx.beginPath();
    ctx.moveTo(x - s, y - lift);
    ctx.quadraticCurveTo(x - s * 0.35, y + s * 0.28, x, y);
    ctx.quadraticCurveTo(x + s * 0.35, y + s * 0.28, x + s, y - lift);
    ctx.lineWidth = lw || Math.max(1.4, s * 0.38);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
}
function drawBirds(ctx, W, H, t, seed) {
    const rnd = (i) => K.mulberry32(seed + 4100 + i)();
    const u0 = W * 0.0042;                                           // base wing span unit (~6 px on a 1800 px card)
    const flocks = [
        { y: H * (0.10 + rnd(1) * 0.10), n: 5, dir: 1, s: u0 * (1.0 + rnd(3) * 0.25), ph: rnd(4), beats: 4 },
        { y: H * (0.24 + rnd(5) * 0.12), n: 3, dir: -1, s: u0 * (1.0 + rnd(7) * 0.25), ph: rnd(8), beats: 3 },
        { y: H * (0.42 + rnd(9) * 0.14), n: 1, dir: 1, s: u0 * 1.25, ph: rnd(10), beats: 3 },
        { y: H * (0.58 + rnd(11) * 0.12), n: 2, dir: -1, s: u0 * 1.1, ph: rnd(12), beats: 4 },
    ];
    const birds = [];
    for (const f of flocks) {
        for (let i = 0; i < f.n; i++) {
            const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;     // V formation: leader first, pairs trailing back
            const u = (t + f.ph) % 1;
            const lead = (-0.12 + u * 1.24) * W;
            const x = f.dir > 0 ? lead - row * f.s * 3.4 : W - lead + row * f.s * 3.4;
            const y = f.y + (i ? side * row * f.s * 1.9 : 0) + Math.sin(u * Math.PI * 2 + i * 0.9) * H * 0.010;
            birds.push({ x, y, s: f.s * (i ? 0.92 : 1), flap: Math.sin(t * Math.PI * 2 * f.beats + i * 1.7 + f.ph * 6.28), dir: f.dir });
        }
    }
    ctx.save();
    for (const b of birds) {                                         // shadows first: flat, faint, thrown down-right onto the land
        if (b.x < -20 || b.x > W + 20) continue;
        ctx.strokeStyle = 'rgba(8,12,24,0.20)';
        birdShape(ctx, b.x + b.s * 5.5, b.y + b.s * 11, b.s * 0.8, b.flap * 0.55, Math.max(1.2, b.s * 0.3));
    }
    for (const b of birds) {
        if (b.x < -20 || b.x > W + 20) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';                  // pale halo so they read over dark forest
        birdShape(ctx, b.x, b.y, b.s, b.flap, Math.max(2.4, b.s * 0.62));
        ctx.strokeStyle = 'rgba(28,30,40,0.92)';
        birdShape(ctx, b.x, b.y, b.s, b.flap);
    }
    ctx.restore();
}

// ── villagers: tiny figures strolling along the roads (ping-pong over 1-3 road cells, one stroll per loop) ──
// owner call (2026-10-19): walkers off — remove the people, keep the birds (boats/smoke/sway untouched)
function buildWalkers(w, seed, { n = 8, maxY = Infinity } = {}) {
    return [];                                                       // villagers disabled; drawWalkers no-ops on empty
    const rnd = K.mulberry32(seed + 5200);
    const key = (c, r) => c + ',' + r;
    const cells = new Map();
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
        const k = w.cell[r][c];
        if (!k.road || k.water || k.river || k.void) continue;
        const hw = K.hexWorld(c, r), p = w.proj(hw.x, hw.z, 0.04);
        if (p.x < 40 || p.x > w.W - 40 || p.y < 60 || p.y > Math.min(w.H - 60, maxY)) continue;
        cells.set(key(c, r), { c, r, x: p.x, y: p.y });
    }
    const nbrs = (cl) => {
        const out = [], a = w.cell[cl.r][cl.c];
        for (let d = 0; d < 6; d++) {
            const [nc, nr] = K.neighbor(cl.c, cl.r, d), nb = cells.get(key(nc, nr));
            if (!nb) continue;
            const b = w.cell[nr][nc];
            if (a.links != null && b.links != null && !((a.links >> d) & 1)) continue;   // explicit street layout: follow the links
            out.push(nb);
        }
        return out;
    };
    const all = [...cells.values()].filter((cl) => nbrs(cl).length);
    const out = [];
    const TUNICS = ['#c4453a', '#3f78c4', '#d9a73a', '#4a9a5c', '#8b5aa8', '#d0703a'];
    for (let i = 0; i < n && all.length; i++) {
        let cur = all[Math.floor(rnd() * all.length)], prev = null;
        const pts = [{ x: cur.x, y: cur.y }];
        const steps = 1 + Math.floor(rnd() * 3);
        for (let s2 = 0; s2 < steps; s2++) {
            const opts = nbrs(cur).filter((q) => q !== prev);
            const nx = (opts.length ? opts : nbrs(cur))[Math.floor(rnd() * (opts.length || nbrs(cur).length))];
            if (!nx) break;
            pts.push({ x: nx.x, y: nx.y }); prev = cur; cur = nx;
        }
        if (pts.length < 2) continue;
        let len = 0; const seg = [];
        for (let q = 1; q < pts.length; q++) { const d = Math.hypot(pts[q].x - pts[q - 1].x, pts[q].y - pts[q - 1].y); seg.push(d); len += d; }
        out.push({ pts, seg, len, ph: rnd(), tunic: TUNICS[i % TUNICS.length], hair: rnd() < 0.5 ? '#3a2a1c' : '#8a5a2a', beats: 6 + (i % 3) * 2 });
    }
    return out;
}
function drawWalkers(ctx, list, t, k) {
    if (!list || !list.length) return;
    const U = k * 2;                                                 // 1 at the 0.5 bake scale
    ctx.save();
    for (const wk of list) {
        const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t + wk.ph));   // 0→1→0, smooth turn-arounds, loops exactly
        const du = Math.sin(Math.PI * 2 * (t + wk.ph));               // sign = travel direction
        let d = u * wk.len, x = wk.pts[0].x, y = wk.pts[0].y;
        for (let q = 0; q < wk.seg.length; q++) {
            if (d <= wk.seg[q] || q === wk.seg.length - 1) { const f = Math.min(1, d / wk.seg[q]); x = wk.pts[q].x + (wk.pts[q + 1].x - wk.pts[q].x) * f; y = wk.pts[q].y + (wk.pts[q + 1].y - wk.pts[q].y) * f; break; }
            d -= wk.seg[q];
        }
        const step = Math.sin(t * Math.PI * 2 * wk.beats + wk.ph * 9);
        const bob = Math.abs(step) * 1.4 * U;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.ellipse(x, y + 1 * U, 4.2 * U, 1.7 * U, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3b2c22'; ctx.lineWidth = 1.7 * U; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 1.1 * U, y - 4.2 * U - bob * 0.3); ctx.lineTo(x - 1.1 * U + step * 2.0 * U * Math.sign(du || 1), y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 1.1 * U, y - 4.2 * U - bob * 0.3); ctx.lineTo(x + 1.1 * U - step * 2.0 * U * Math.sign(du || 1), y); ctx.stroke();
        ctx.fillStyle = wk.tunic;
        ctx.beginPath(); ctx.moveTo(x - 3 * U, y - 4 * U - bob); ctx.lineTo(x + 3 * U, y - 4 * U - bob); ctx.lineTo(x + 2.2 * U, y - 10 * U - bob); ctx.lineTo(x - 2.2 * U, y - 10 * U - bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f0c9a0';
        ctx.beginPath(); ctx.arc(x, y - 12.4 * U - bob, 2.5 * U, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = wk.hair;
        ctx.beginPath(); ctx.arc(x, y - 13.2 * U - bob, 2.6 * U, Math.PI, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ── boats: little sailboats drifting between open-water cells (ping-pong, bobbing, with a wake) ──
function buildBoats(water, seed, k, { max = 2 } = {}) {
    if (!water || water.length < 5) return [];
    const cellW = 1.9 * 96 * k, rnd = K.mulberry32(seed + 5600);
    const interior = water.filter((c) => !c.shore && c.cx > 80 && c.cy > 100);
    const pool = interior.length >= 4 ? interior : water;
    const out = [], used = new Set();
    for (let tries = 0; tries < 60 && out.length < max; tries++) {
        const a = pool[Math.floor(rnd() * pool.length)];
        if (used.has(a)) continue;
        const nb = pool.filter((b) => b !== a && Math.hypot(b.cx - a.cx, b.cy - a.cy) < cellW * 1.25 && !used.has(b));
        if (!nb.length) continue;
        const b = nb[Math.floor(rnd() * nb.length)];
        used.add(a); used.add(b);
        out.push({ a, b, ph: rnd(), hull: ['#8a5a36', '#a8452f', '#4a6fa0'][out.length % 3], sail: out.length % 2 ? '#f4efe0' : '#fff7e8' });
    }
    return out;
}
function drawBoats(ctx, list, t, k) {
    if (!list || !list.length) return;
    const U = k * 2;
    ctx.save();
    for (const bt of list) {
        ctx.save();
        const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t + bt.ph));
        const dir = Math.sign(Math.sin(Math.PI * 2 * (t + bt.ph))) || 1;
        const x = bt.a.cx + (bt.b.cx - bt.a.cx) * u, y = bt.a.cy + (bt.b.cy - bt.a.cy) * u;
        const face = (bt.b.cx - bt.a.cx) * dir >= 0 ? 1 : -1;
        const bob = Math.sin(t * Math.PI * 2 * 3 + bt.ph * 6) * 1.3 * U, roll = Math.sin(t * Math.PI * 2 * 2 + bt.ph * 5) * 0.05;
        const speed = Math.abs(Math.sin(Math.PI * 2 * (t + bt.ph)));
        ctx.strokeStyle = `rgba(255,255,255,${(0.5 * speed).toFixed(3)})`; ctx.lineWidth = 1.6 * U; ctx.lineCap = 'round';   // wake
        ctx.beginPath(); ctx.moveTo(x - face * 9 * U, y + 3.5 * U); ctx.lineTo(x - face * (17 + 7 * speed) * U, y + 2 * U); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - face * 9 * U, y + 5.5 * U); ctx.lineTo(x - face * (15 + 6 * speed) * U, y + 6.5 * U); ctx.stroke();
        ctx.translate(x, y + bob); ctx.rotate(roll); ctx.scale(face, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(1 * U, 5 * U, 11 * U, 2.4 * U, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bt.hull;                                                                                             // hull
        ctx.beginPath(); ctx.moveTo(-10 * U, 0); ctx.lineTo(11 * U, 0); ctx.lineTo(7 * U, 5 * U); ctx.lineTo(-7 * U, 5 * U); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-9 * U, 0, 19 * U, 1.2 * U);
        ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 1.5 * U;                                                                // mast
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16 * U); ctx.stroke();
        ctx.fillStyle = bt.sail;                                                                                             // sail
        ctx.beginPath(); ctx.moveTo(1 * U, -15 * U); ctx.quadraticCurveTo(9 * U, -8 * U, 8 * U, -1.5 * U); ctx.lineTo(1 * U, -1.5 * U); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8dfc8'; ctx.beginPath(); ctx.moveTo(-1 * U, -13 * U); ctx.lineTo(-7 * U, -2.5 * U); ctx.lineTo(-1 * U, -2.5 * U); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

// ── butterflies: eight flutterers over the meadows, 8 wingbeats per loop ──
function drawButterflies(ctx, W, H, t, seed) {
    ctx.save();
    for (let i = 0; i < 8; i++) {
        const r1 = K.mulberry32(seed + 6100 + i)(), r2 = K.mulberry32(seed + 7100 + i)(), r3 = K.mulberry32(seed + 8100 + i)();
        const bx = W * (0.08 + 0.84 * r1), by = H * (0.42 + 0.44 * r2);
        const rx = W * (0.02 + r3 * 0.045), ry = H * (0.015 + r1 * 0.03);
        const f1 = 1 + Math.floor(r2 * 2);                           // 1-2 wander loops per bake loop
        const x = bx + Math.sin(t * Math.PI * 2 * f1 + r3 * 6.28) * rx;
        const y = by + Math.cos(t * Math.PI * 2 * f1 + r1 * 6.28) * ry;
        const flap = Math.abs(Math.sin(t * Math.PI * 2 * 8 + r2 * 6.28));
        const s = 2.6 + r3 * 1.6;
        const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffc36b' : '#f2e6c8';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(x - s * 0.45, y, s * 0.55 * (0.45 + 0.55 * flap), s * 0.32, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.45, y, s * 0.55 * (0.45 + 0.55 * flap), s * 0.32, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(40,32,24,0.9)';
        ctx.fillRect(x - 0.7, y - s * 0.5, 1.4, s);
    }
    ctx.restore();
}

// ── cloud shadows: three soft blobs breathing/drifting (light changes over the land) ──
function drawCloudShadows(ctx, W, H, t, seed) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
        const r1 = K.mulberry32(seed + 8800 + i)(), r2 = K.mulberry32(seed + 9800 + i)();
        const bx = W * (0.15 + 0.7 * r1), by = H * (0.12 + 0.72 * r2);
        const x = bx + Math.sin(t * Math.PI * 2 + r2 * 6.28) * W * 0.07;
        const y = by + Math.cos(t * Math.PI * 2 + r1 * 6.28) * H * 0.028;
        const R = W * (0.16 + r1 * 0.14);
        const a = 0.06 + 0.025 * Math.sin(t * Math.PI * 2 + r2 * 6.28);
        const g = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
        g.addColorStop(0, `rgba(10,14,26,${a.toFixed(3)})`);
        g.addColorStop(1, 'rgba(10,14,26,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
    }
    ctx.restore();
}

// ── tint: a warm gold breath answered by a cool dusk breath — the "tint" ──
function drawTint(ctx, W, H, t) {
    const a = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);                 // 0 → 1 → 0, seamless
    ctx.fillStyle = `rgba(255,208,140,${(0.030 * a).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(96,128,255,${(0.022 * (1 - a)).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);
}

module.exports = { buildWalkers, drawWalkers, buildBoats, drawBoats, glints, animateWater, swayTrees, drawSway, drawBirds, drawButterflies, drawCloudShadows, drawTint };
