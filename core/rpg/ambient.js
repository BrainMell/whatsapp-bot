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

// ── birds: two V-flocks + two loners crossing the card, 3 wingbeats per loop ──
function birdShape(ctx, x, y, s, flap) {
    const lift = flap * s * 0.95;
    ctx.beginPath();
    ctx.moveTo(x - s, y - lift);
    ctx.quadraticCurveTo(x - s * 0.35, y + s * 0.28, x, y);
    ctx.quadraticCurveTo(x + s * 0.35, y + s * 0.28, x + s, y - lift);
    ctx.lineWidth = Math.max(1, s * 0.42);
    ctx.stroke();
}
function drawBirds(ctx, W, H, t, seed) {
    const rnd = (i) => K.mulberry32(seed + 4100 + i)();
    ctx.save();
    ctx.strokeStyle = 'rgba(30,32,42,0.82)';
    const flocks = [
        { y: H * (0.09 + rnd(1) * 0.10), n: 4, sp: 0.5 + rnd(2) * 0.2, dir: 1, s: 3.2 + rnd(3) * 1.4, ph: rnd(4) },
        { y: H * (0.20 + rnd(5) * 0.12), n: 3, sp: 0.42 + rnd(6) * 0.18, dir: -1, s: 2.8 + rnd(7) * 1.2, ph: rnd(8) },
    ];
    for (const f of flocks) {
        for (let i = 0; i < f.n; i++) {
            const u = (t * f.sp + i * 0.045 + f.ph) % 1;
            const x = (f.dir > 0 ? (-0.18 + u * 1.36) * W : (1.18 - u * 1.36) * W) - f.dir * i * f.s * 3.2;
            const y = f.y + Math.sin(u * Math.PI * 2 + i * 0.9) * H * 0.012 + i * f.s * 2.0;
            birdShape(ctx, x, y, f.s, Math.sin(t * Math.PI * 2 * 3 + i * 1.9 + f.ph * 6));
        }
    }
    for (let i = 0; i < 2; i++) {                                    // slow loners, lower
        const sp = 0.3 + rnd(10 + i) * 0.1, dir = i ? -1 : 1, ph = rnd(12 + i);
        const u = (t * sp + ph) % 1;
        const x = dir > 0 ? (-0.15 + u * 1.3) * W : (1.15 - u * 1.3) * W;
        const y = H * (0.34 + rnd(14 + i) * 0.2) + Math.sin(u * Math.PI * 2) * 8;
        birdShape(ctx, x, y, 2.5, Math.sin(t * Math.PI * 2 * 3 + i * 2.4));
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

module.exports = { glints, animateWater, swayTrees, drawSway, drawBirds, drawButterflies, drawCloudShadows, drawTint };
