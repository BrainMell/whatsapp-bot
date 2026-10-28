'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CLASS CINEMATICS (owner 2026-10-28: "every skill should be something
//  different that relates to it - the base skill animation plus an idea you come
//  up with as the SEQUENCE, then the attack").
//
//  LAYERS.cinema paints ONE bespoke ~2s intro per class (OVER pass, opaque), then
//  dissolves onto that class's own `world` arena (ultimateFxCosmic.js); the normal
//  class recipe plays after it (shifted by the recipe wrapper).
//
//    ARCHMAGE   SINGULARITY: a black hole swirls the arena away, the fight moves into the void
//    TIMELORD   clockwork: you fall into a clock, hands spin backwards
//    AVATAR     four elements spiral in and merge into the glowing eye
//    DEATH_LORD the moon becomes a skull, bone hands claw up
//    KAGE       ink swallows the frame, eyes open everywhere
//    VOIDWALKER the screen shatters into inverted shards
//    REAPER     one scythe stroke cuts the world in half
//    LICH       frost crawls in from the edges and crystallises the frame
//    GRAND_INVENTOR a blueprint draws itself, then becomes metal
//    WARLOCK    a pentagram burns in under a blood moon
//    ELEMENTALIST the screen splits in four elements that collide
//    VIRTUOSO   curtains open on a stage with a spotlight + equaliser
//  (MAGE keeps the planet / asteroid sequence - LAYERS.cosmic.)
// ═══════════════════════════════════════════════════════════════════════════
const { createCanvas } = require('canvas');

module.exports = function install(LAYERS, H, W_OF, stars) {
    const { glowDot, mulberry, hashS, clamp01, easeOut, easeIn } = H;
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const rrng = (s) => mulberry(hashS(s));

    // draw the first fraction of a polyline
    function partial(c, pts, frac) {
        if (frac <= 0) return;
        let total = 0; const segs = [];
        for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); total += d; }
        let left = total * clamp01(frac);
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length && left > 0; i++) {
            const d = segs[i - 1];
            if (left >= d) { c.lineTo(pts[i][0], pts[i][1]); left -= d; }
            else { const k = left / d; c.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); left = 0; }
        }
        c.stroke();
    }
    const grad = (c, W, Hh, a, b) => { const g = c.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, Hh); };
    const dimSnap = (c, snap, W, Hh, k, col) => { c.drawImage(snap, 0, 0, W, Hh); c.fillStyle = col || '#000'; c.globalAlpha = clamp01(k); c.fillRect(0, 0, W, Hh); c.globalAlpha = 1; };
    function gearPath(c, cx, cy, r, teeth, rot) {
        c.beginPath();
        for (let i = 0; i < teeth * 2; i++) { const a = rot + (i / (teeth * 2)) * TAU, rad = i % 2 ? r * 0.86 : r; const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.closePath();
    }
    function warpOut(c, snap, W, Hh, p) {
        c.globalAlpha = p; c.fillStyle = '#02030a'; c.fillRect(0, 0, W, Hh);
        for (let i = 6; i >= 0; i--) { const k = i / 6, s = lerp(1, 0.1, p) * (1 + k * 0.7 * p); c.globalAlpha = (i === 0 ? 1 : 0.32 * (1 - k)) * (1 - p * 0.55); c.drawImage(snap, W / 2 - W * s / 2, Hh / 2 - Hh * s / 2, W * s, Hh * s); }
        c.globalAlpha = 1;
    }

    const CIN = {};

    // ── ARCHMAGE: SINGULARITY - a black hole eats the arena, the fight moves into the void ──
    CIN.ARCHMAGE = (c, t, D, W, Hh, wd, snap) => {
        const cx = W / 2, cy = Hh * 0.5, RM = Math.hypot(W, Hh) / 2, tw = easeIn(clamp01((t - 0.15) / 1.15)), RINGS = 30;
        c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
        for (let i = RINGS - 1; i >= 0; i--) {            // swirl + pinch: every ring of the frame rotates more the closer it is to the hole
            const r0 = (i / RINGS) * RM, r1 = ((i + 1) / RINGS) * RM + 1.5, k = (i + 0.5) / RINGS;
            c.save(); c.beginPath(); c.arc(cx, cy, r1, 0, TAU); c.arc(cx, cy, r0, 0, TAU, true); c.clip();
            c.translate(cx, cy); c.rotate(tw * 7 * Math.pow(1 - k, 1.6)); const sc = 1 - 0.6 * tw * Math.pow(1 - k, 1.1); c.scale(sc, sc); c.translate(-cx, -cy);
            c.drawImage(snap, 0, 0, W, Hh); c.restore();
        }
        const hole = RM * (0.03 + 0.2 * easeIn(clamp01((t - 0.1) / 1.2))) + RM * 1.3 * easeIn(clamp01((t - 1.3) / 0.45));
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let arm = 0; arm < 5; arm++) { c.strokeStyle = arm % 2 ? 'rgba(190,150,255,0.55)' : 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.beginPath(); for (let k = 0; k <= 40; k++) { const q = k / 40, ang = arm * 1.2566 + t * 3 + q * 5, r = hole * (1.05 + q * 2.4); k ? c.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.55) : c.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.55); } c.stroke(); }
        glowDot(c, cx, cy, hole * 2.2, '#9a6bff', 0.45 * clamp01(t / 0.4)); c.strokeStyle = '#ffe9c4'; c.lineWidth = 4; c.beginPath(); c.ellipse(cx, cy, hole * 1.12, hole * 0.62, 0, 0, TAU); c.stroke();
        c.restore();
        c.fillStyle = '#000'; c.beginPath(); c.arc(cx, cy, hole, 0, TAU); c.fill();
        if (t > 1.5) { stars(c, W, Hh, t, 0, 'void'); c.globalAlpha = clamp01((t - 1.5) / 0.25) * 0.0; c.globalAlpha = 1; }
    };

    // ── TIMELORD: inside the clock ──────────────────────────────────────────
    CIN.TIMELORD = (c, t, D, W, Hh, wd, snap) => {
        const cx = W / 2, cy = Hh / 2, R = Hh * 0.42;
        if (t < 0.3) dimSnap(c, snap, W, Hh, easeIn(t / 0.3) * 0.85, '#120c04'); else grad(c, W, Hh, '#0c0802', '#2a1c06');
        const fadeIn = easeOut(clamp01(t / 0.5));
        c.save(); c.globalAlpha = fadeIn; c.lineCap = 'round';
        for (const [gx, gy, gr, tt, dir] of [[0.08, 0.15, 0.2, 10, 1], [0.92, 0.2, 0.17, 9, -1], [0.1, 0.9, 0.16, 8, -1], [0.9, 0.88, 0.22, 11, 1]]) {
            gearPath(c, W * gx, Hh * gy, Hh * gr, tt, t * 0.9 * dir); c.fillStyle = 'rgba(120,84,20,0.55)'; c.fill(); c.strokeStyle = '#d8a83a'; c.lineWidth = 2; c.stroke();
        }
        c.strokeStyle = '#ffd98a'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * 0.93, 0, TAU); c.stroke();
        for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, big = i % 5 === 0, r0 = R * (big ? 0.8 : 0.87); c.lineWidth = big ? 4 : 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93); c.stroke(); }
        // hands spin BACKWARDS, ghosted for speed
        const spin = (t * t) * 5;
        for (let g = 6; g >= 0; g--) for (const [len, w, mul] of [[0.78, 5, 1], [0.52, 8, 1 / 12]]) {
            const a = -Math.PI / 2 - (spin - g * 0.07) * 1.0 * (mul === 1 ? 1 : 1 / 1) * (mul === 1 ? 1 : 0.35);
            c.strokeStyle = g ? `rgba(255,217,138,${0.12 * (7 - g) / 7})` : '#fff1c4'; c.lineWidth = w;
            c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R * len, cy + Math.sin(a) * R * len); c.stroke();
        }
        c.restore();
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 4; k++) { const q = ((t * 1.4 + k * 0.25) % 1); c.strokeStyle = `rgba(255,217,138,${(0.5 * (1 - q)).toFixed(3)})`; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R * (0.15 + q * 1.1), 0, TAU); c.stroke(); }
        const fl = clamp01((t - (D - 0.85)) / 0.4); if (fl > 0) glowDot(c, cx, cy, R * (0.5 + 1.8 * fl), '#fff1c4', 0.9 * fl);
        c.restore();
    };

    // ── AVATAR: four elements converge into the eye ─────────────────────────
    CIN.AVATAR = (c, t, D, W, Hh, wd, snap) => {
        if (t < 0.4) dimSnap(c, snap, W, Hh, easeIn(t / 0.4) * 0.8, '#06101c'); else grad(c, W, Hh, '#06101c', '#1a2c4a');
        const cx = W / 2, cy = Hh * 0.48, merge = 1.3;
        const els = [['#ff6a2a', '#ffd27a', 0.04, 0.08], ['#3aa0ff', '#d8f2ff', 0.96, 0.08], ['#8a6a3a', '#c9e06a', 0.04, 0.96], ['#e8f4ff', '#ffffff', 0.96, 0.96]];
        c.save(); c.globalCompositeOperation = 'lighter';
        els.forEach(([c1, c2, sx, sy], i) => {
            for (let tr = 0; tr < 16; tr++) {
                const tt = Math.max(0, t - tr * 0.022), q = clamp01((tt - 0.15) / (merge - 0.15)), e = easeIn(q);
                const bx = lerp(W * sx, cx, e), by = lerp(Hh * sy, cy, e), swirl = (1 - e) * Math.sin(q * 9 + i * 1.6) * 90;
                const px = bx + Math.cos(i * 1.57 + q * 5) * swirl * 0.6, py = by + Math.sin(i * 1.57 + q * 5) * swirl * 0.6;
                if (t < 0.15) continue;
                glowDot(c, px, py, (tr === 0 ? 34 : 24) * (1 - tr / 20) + 4, tr % 3 ? c1 : c2, (tr === 0 ? 1 : 0.5) * (1 - tr / 18));
            }
        });
        const m = clamp01((t - merge) / 0.5);
        if (m > 0) {
            glowDot(c, cx, cy, 60 + m * 280, '#ffffff', 0.9 * Math.min(1, m * 1.5));
            c.strokeStyle = '#ffffff'; c.lineWidth = 4 * (1 - m) + 1; c.beginPath(); c.ellipse(cx, cy, 40 + m * 360, 22 + m * 200, 0, 0, TAU); c.stroke();
            for (let r = 0; r < 12; r++) { const a = (r / 12) * TAU + t; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - m)})`; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50); c.lineTo(cx + Math.cos(a) * (60 + m * 420), cy + Math.sin(a) * (60 + m * 420)); c.stroke(); }
        }
        c.restore();
    };

    // ── DEATH_LORD: skull moon + bone hands ─────────────────────────────────
    CIN.DEATH_LORD = (c, t, D, W, Hh, wd, snap) => {
        if (t < 0.35) dimSnap(c, snap, W, Hh, easeIn(t / 0.35) * 0.9, '#10020a'); else grad(c, W, Hh, '#10020a', '#4a0a14');
        const mx = W / 2, my = Hh * 0.33, mr = Hh * 0.22, rise = easeOut(clamp01(t / 0.7));
        c.save(); c.globalAlpha = rise;
        glowDot(c, mx, my, mr * 1.8, '#ff2a40', 0.28);
        const g = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 4, mx, my, mr); g.addColorStop(0, '#f4eadc'); g.addColorStop(1, '#a89a8a'); c.fillStyle = g; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
        const sk = clamp01((t - 0.5) / 0.6);
        if (sk > 0) {
            c.fillStyle = `rgba(20,0,6,${0.95 * sk})`;
            for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(mx + sx * mr * 0.36, my - mr * 0.1, mr * 0.22 * sk, mr * 0.27 * sk, 0, 0, TAU); c.fill(); }
            c.beginPath(); c.moveTo(mx, my + mr * 0.08); c.lineTo(mx - mr * 0.09 * sk, my + mr * 0.34 * sk); c.lineTo(mx + mr * 0.09 * sk, my + mr * 0.34 * sk); c.fill();
            for (let i = -3; i <= 3; i++) c.fillRect(mx + i * mr * 0.1 - mr * 0.035, my + mr * 0.5, mr * 0.07, mr * 0.32 * sk);
            c.save(); c.globalCompositeOperation = 'lighter'; for (const sx of [-1, 1]) glowDot(c, mx + sx * mr * 0.36, my - mr * 0.1, mr * 0.2 * sk, '#ff2a40', 0.9 * sk); c.restore();
        }
        c.restore();
        // bone hands claw up from the ground
        for (let i = 0; i < 8; i++) {
            const q = easeOut(clamp01((t - 0.35 - i * 0.07) / 0.6)); if (q <= 0) continue;
            const bx = W * (0.06 + i * 0.125) + Math.sin(i * 3) * 18, by = Hh + 40 - q * Hh * (0.34 + (i % 3) * 0.07);
            c.strokeStyle = '#e8dcc8'; c.fillStyle = '#e8dcc8'; c.lineCap = 'round'; c.lineWidth = 9;
            c.beginPath(); c.moveTo(bx, Hh + 50); c.lineTo(bx + Math.sin(t * 2 + i) * 6, by + 34); c.stroke();
            c.lineWidth = 4;
            for (let f = -2; f <= 2; f++) { c.beginPath(); c.moveTo(bx + f * 4, by + 34); c.quadraticCurveTo(bx + f * 16, by + 4, bx + f * 22 + Math.sin(t * 3 + f) * 4, by - 18 + Math.abs(f) * 7); c.stroke(); }
        }
        const rr = rrng('souls'); c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 28; i++) { const x = rr() * W + Math.sin(t * 2 + i) * 20, y = Hh - ((rr() * Hh + t * (60 + rr() * 90)) % (Hh * 1.1)); glowDot(c, x, y, 7 + rr() * 8, i % 2 ? '#9ff0c8' : '#ff6a7a', 0.55); }
        const fl = clamp01((t - (D - 0.8)) / 0.4); if (fl > 0) glowDot(c, mx, my, mr * (1 + 3 * fl), '#ff2a40', 0.7 * fl);
        c.restore();
    };

    // ── KAGE: ink swallows the frame, eyes open ─────────────────────────────
    CIN.KAGE = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh);
        const rr = rrng('ink'), spread = easeIn(clamp01(t / 0.9));
        for (let i = 0; i < 9; i++) {
            const x = rr() * W, y = Hh * (0.55 + rr() * 0.45), r = (60 + rr() * 90) + spread * Math.max(W, Hh) * 0.55;
            const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(6,0,14,1)'); g.addColorStop(0.75, 'rgba(6,0,14,0.96)'); g.addColorStop(1, 'rgba(6,0,14,0)');
            c.globalAlpha = clamp01(spread * 1.4); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
            const ex = rr() * W, ey = rr() * Hh * 0.9 + Hh * 0.05, open = clamp01((t - 0.55 - rr() * 0.8) / 0.25), blink = 1 - 0.9 * Math.max(0, Math.sin(t * 3 + i * 5) - 0.93) * 14;
            if (open <= 0) continue; const sz = 9 + rr() * 12, oh = open * Math.max(0.1, blink);
            for (const sx of [-1, 1]) { glowDot(c, ex + sx * sz * 1.3, ey, sz * 1.8, '#b06bff', 0.4 * open); c.fillStyle = '#f4e8ff'; c.beginPath(); c.ellipse(ex + sx * sz * 1.3, ey, sz, sz * 0.32 * oh, sx * 0.25, 0, TAU); c.fill(); }
        }
        c.restore();
    };

    // ── VOIDWALKER: the frame shatters into inverted shards ─────────────────
    CIN.VOIDWALKER = (c, t, D, W, Hh, wd, snap) => {
        const cx = W / 2, cy = Hh / 2, maxR = Math.hypot(W, Hh) * 0.6;
        const pol = (i, ring) => { const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU, r0 = ring ? maxR * 0.34 : 0, r1 = ring ? maxR : maxR * 0.34; return [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]]; };
        const T0 = 0.45, q = easeIn(clamp01((t - T0) / 0.8));
        if (t > T0) { grad(c, W, Hh, '#06000e', '#1c0a34'); stars(c, W, Hh, t, 1, 'vw'); }
        for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 12; i++) {
            const p = pol(i, ring), mid = (i + 0.5) / 12 * TAU, d = q * (ring ? 520 : 300) * (0.7 + ((i * 7) % 5) / 8), rot = q * (((i * 13) % 7) - 3) * 0.12;
            const mx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, my = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
            c.save(); c.translate(mx + Math.cos(mid) * d, my + Math.sin(mid) * d); c.rotate(rot); c.translate(-mx, -my);
            c.beginPath(); p.forEach((pt, k) => (k ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]))); c.closePath(); c.clip();
            c.drawImage(snap, 0, 0, W, Hh);
            if (t > T0) { c.globalCompositeOperation = 'difference'; c.fillStyle = '#ffffff'; c.globalAlpha = clamp01((t - T0) / 0.2); c.fillRect(0, 0, W, Hh); }
            c.restore();
            if (t > T0) { c.save(); c.translate(mx + Math.cos(mid) * d, my + Math.sin(mid) * d); c.rotate(rot); c.translate(-mx, -my); c.strokeStyle = 'rgba(210,180,255,0.9)'; c.lineWidth = 1.5; c.beginPath(); p.forEach((pt, k) => (k ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]))); c.closePath(); c.stroke(); c.restore(); }
        }
        // cracks before it breaks
        if (t < T0 + 0.1) { const cr = rrng('crack'); c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; for (let i = 0; i < 14; i++) { const a = cr() * TAU, L = maxR * 0.7 * easeOut(clamp01(t / 0.35)) * (0.5 + cr() * 0.5); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5 + cr() * 1.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * L * 0.5 + (cr() - 0.5) * 20, cy + Math.sin(a) * L * 0.5); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.stroke(); } c.restore(); }
    };

    // ── REAPER: one cut splits the world ────────────────────────────────────
    CIN.REAPER = (c, t, D, W, Hh, wd, snap) => {
        const ang = -0.55, cx = W / 2, cy = Hh / 2, L = Math.hypot(W, Hh), dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
        const a = [cx - dx * L, cy - dy * L], b = [cx + dx * L, cy + dy * L];
        const cutQ = easeOut(clamp01((t - 0.2) / 0.22)), split = easeIn(clamp01((t - 0.5) / 0.7));
        if (t > 0.5) { grad(c, W, Hh, '#020c10', '#0a3038'); const rr = rrng('rsoul'); c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 40; i++) glowDot(c, rr() * W + Math.sin(t * 2 + i) * 16, Hh - ((rr() * Hh + t * (40 + rr() * 80)) % Hh), 8 + rr() * 10, '#7af0d0', 0.45); c.restore(); }
        for (const side of [-1, 1]) {
            c.save();
            c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b[0] + nx * side * L, b[1] + ny * side * L); c.lineTo(a[0] + nx * side * L, a[1] + ny * side * L); c.closePath(); c.clip();
            c.translate(nx * side * split * 520, ny * side * split * 520 + split * split * 120); c.rotate(side * split * 0.12);
            c.drawImage(snap, 0, 0, W, Hh); c.restore();
        }
        if (cutQ > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; const fade = 1 - clamp01((t - 0.6) / 0.5); const e = [lerp(a[0], b[0], cutQ), lerp(a[1], b[1], cutQ)]; c.strokeStyle = `rgba(150,255,230,${0.5 * fade})`; c.lineWidth = 18; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); c.stroke(); c.strokeStyle = `rgba(255,255,255,${fade})`; c.lineWidth = 5; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); c.stroke(); c.restore(); }
    };

    // ── LICH: frost crystallises the frame ──────────────────────────────────
    CIN.LICH = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh);
        const g = clamp01(t / 1.25), e = easeOut(g), rr = rrng('frost');
        const v = c.createRadialGradient(W / 2, Hh / 2, Hh * (0.9 - 0.75 * e), W / 2, Hh / 2, Hh * 1.1); v.addColorStop(0, 'rgba(170,225,255,0)'); v.addColorStop(1, `rgba(190,235,255,${0.55 + 0.4 * e})`);
        c.fillStyle = v; c.fillRect(0, 0, W, Hh); c.globalAlpha = e * 0.45; c.fillStyle = '#a8dcff'; c.fillRect(0, 0, W, Hh); c.globalAlpha = 1;
        for (let i = 0; i < 70; i++) {
            const per = (i / 70) * 2 * (W + Hh), side = per < W ? 0 : per < W + Hh ? 1 : per < 2 * W + Hh ? 2 : 3, along = side % 2 ? (per - (side === 1 ? W : 2 * W + Hh)) : (side === 0 ? per : per - (W + Hh));
            const len = (40 + rr() * 120) * e, base = 14 + rr() * 16, bx = side === 0 ? along : side === 2 ? W - (along % W) : side === 1 ? W : 0, by = side === 0 ? 0 : side === 2 ? Hh : (along % Hh);
            const ix = W / 2 - bx, iy = Hh / 2 - by, d = Math.hypot(ix, iy) || 1, ux = ix / d, uy = iy / d;
            c.fillStyle = i % 2 ? 'rgba(235,248,255,0.92)' : 'rgba(150,210,250,0.9)'; c.beginPath(); c.moveTo(bx - uy * base, by + ux * base); c.lineTo(bx + ux * len, by + uy * len); c.lineTo(bx + uy * base, by - ux * base); c.closePath(); c.fill();
        }
        if (t > 1.2) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; for (let i = 0; i < 16; i++) { const a = rr() * TAU, L = Hh * 0.7 * easeOut(clamp01((t - 1.2) / 0.3)); c.beginPath(); c.moveTo(W / 2, Hh / 2); c.lineTo(W / 2 + Math.cos(a) * L, Hh / 2 + Math.sin(a) * L); c.stroke(); } glowDot(c, W / 2, Hh / 2, 120 * clamp01((t - 1.3) / 0.3) + 10, '#e8fbff', 0.8); c.restore(); }
    };

    // ── GRAND_INVENTOR: the blueprint draws itself ──────────────────────────
    CIN.GRAND_INVENTOR = (c, t, D, W, Hh, wd, snap) => {
        if (t < 0.3) { dimSnap(c, snap, W, Hh, easeIn(t / 0.3), '#06223a'); return; }
        c.fillStyle = '#06223a'; c.fillRect(0, 0, W, Hh);
        c.strokeStyle = 'rgba(120,200,255,0.12)'; c.lineWidth = 1; for (let x = 0; x < W; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hh); c.stroke(); } for (let y = 0; y < Hh; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        const u = t - 0.3, cx = W * 0.5, cy = Hh * 0.5, R = Hh * 0.3; c.lineCap = 'round'; c.lineJoin = 'round';
        const gear = []; for (let i = 0; i <= 24 * 2; i++) { const a = (i / 48) * TAU, rad = i % 2 ? R * 0.84 : R; gear.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
        c.strokeStyle = '#8fe0ff'; c.lineWidth = 2.5; partial(c, gear, easeOut(clamp01(u / 0.8)));
        c.lineWidth = 1.5; for (const k of [0.55, 0.3, 0.12]) { c.beginPath(); c.arc(cx, cy, R * k, 0, TAU * easeOut(clamp01((u - 0.2) / 0.7))); c.stroke(); }
        const arm = [[W * 0.05, Hh * 0.82], [W * 0.2, Hh * 0.6], [W * 0.3, Hh * 0.66], [W * 0.46, Hh * 0.4]]; partial(c, arm, easeOut(clamp01((u - 0.3) / 0.7)));
        const arm2 = [[W * 0.95, Hh * 0.18], [W * 0.78, Hh * 0.34], [W * 0.7, Hh * 0.3], [W * 0.56, Hh * 0.55]]; partial(c, arm2, easeOut(clamp01((u - 0.45) / 0.7)));
        c.lineWidth = 1; c.strokeStyle = '#bfeaff'; for (let i = 0; i < 6; i++) { const y = Hh * 0.12 + i * 12, x0 = W * 0.06, f = clamp01((u - 0.5 - i * 0.04) / 0.3); if (f > 0) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + 90 * f, y); c.stroke(); } }
        const m = clamp01((u - 1.0) / 0.3);
        if (m > 0) { gearPath(c, cx, cy, R, 24, 0); const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 5, cx, cy, R); g.addColorStop(0, '#e8eef4'); g.addColorStop(0.6, '#7a8794'); g.addColorStop(1, '#2a323c'); c.globalAlpha = m; c.fillStyle = g; c.fill(); c.globalAlpha = 1; const rr = rrng('spk'); c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 40; i++) { const a = rr() * TAU, d = R * (0.3 + rr() * 1.6) * m; glowDot(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rr() * 6, '#ffb24a', 0.9 * (1 - m * 0.5)); } c.restore(); }
    };

    // ── WARLOCK: pentagram burns in ─────────────────────────────────────────
    CIN.WARLOCK = (c, t, D, W, Hh, wd, snap) => {
        if (t < 0.35) dimSnap(c, snap, W, Hh, easeIn(t / 0.35) * 0.9, '#1a0206'); else grad(c, W, Hh, '#120104', '#3a0610');
        const cx = W / 2, cy = Hh * 0.5, R = Hh * 0.36, u = Math.max(0, t - 0.2);
        c.save(); c.globalCompositeOperation = 'lighter'; glowDot(c, cx, cy, R * 1.7, '#ff2a40', 0.25 * easeOut(clamp01(u / 0.6)));
        c.lineCap = 'round'; c.lineJoin = 'round';
        const star = [0, 2, 4, 1, 3, 0].map((k) => { const a = -Math.PI / 2 + (k / 5) * TAU; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
        for (const [lw, col] of [[10, 'rgba(255,40,60,0.35)'], [3, '#ffb0b8']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * easeOut(clamp01(u / 0.8))); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 1.12, -Math.PI / 2, -Math.PI / 2 - TAU * easeOut(clamp01((u - 0.2) / 0.8)), true); c.stroke(); partial(c, star, easeOut(clamp01((u - 0.3) / 1.0))); }
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + t * 0.4, f = clamp01((u - 0.7 - i * 0.02) / 0.2); if (f > 0) { c.strokeStyle = '#ff6a7a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2); c.lineTo(cx + Math.cos(a) * R * (1.2 + 0.07 * f), cy + Math.sin(a) * R * (1.2 + 0.07 * f)); c.stroke(); } }
        const rr = rrng('fire'); for (const side of [0.04, 0.96]) for (let i = 0; i < 26; i++) { const x = W * side + (rr() - 0.5) * 70, y = Hh - ((rr() * Hh * 0.9 + t * (140 + rr() * 120)) % (Hh * 0.9)); glowDot(c, x, y, 16 + rr() * 16, i % 2 ? '#ff5a1a' : '#ffb24a', 0.45); }
        const fl = clamp01((u - 1.1) / 0.3); if (fl > 0) glowDot(c, cx, cy, R * (0.8 + 2.4 * fl), '#ff4a5a', 0.85 * fl);
        c.restore();
    };

    // ── ELEMENTALIST: four elements collide ─────────────────────────────────
    CIN.ELEMENTALIST = (c, t, D, W, Hh, wd, snap) => {
        const e = easeOut(clamp01(t / 0.45)), hw = W / 2, hh = Hh / 2, merge = clamp01((t - 1.15) / 0.35);
        c.drawImage(snap, 0, 0, W, Hh);
        const quads = [[0, 0, 0], [hw, 0, 1], [0, hh, 2], [hw, hh, 3]];
        for (const [qx, qy, k] of quads) {
            const w = hw * e, h = hh * e, x = qx === 0 ? 0 : W - w, y = qy === 0 ? 0 : Hh - h;
            c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
            const rr = rrng('el' + k);
            if (k === 0) { grad(c, W, Hh, '#3a0600', '#ff7a1a'); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 18; i++) { const fx = rr() * hw, base = hh; glowDot(c, fx + Math.sin(t * 6 + i) * 10, base - ((t * 140 + rr() * 200) % (hh * 0.9)), 26 + rr() * 24, i % 2 ? '#ffd27a' : '#ff5a1a', 0.55); } }
            if (k === 1) { grad(c, W, Hh, '#06284a', '#3aa0ff'); c.strokeStyle = 'rgba(220,245,255,0.7)'; c.lineWidth = 3; for (let r = 0; r < 6; r++) { c.beginPath(); for (let X = hw; X <= W; X += 12) { const Y = 40 + r * 38 + Math.sin(X * 0.04 + t * 4 + r) * 12; X === hw ? c.moveTo(X, Y) : c.lineTo(X, Y); } c.stroke(); } }
            if (k === 2) { grad(c, W, Hh, '#2a1a0a', '#8a6a3a'); for (let i = 0; i < 10; i++) { const rx = rr() * hw, rh = (40 + rr() * 90) * easeOut(clamp01((t - 0.1 - i * 0.04) / 0.4)); c.fillStyle = i % 2 ? '#5a4024' : '#7a5a34'; c.beginPath(); c.moveTo(rx - 22, Hh); c.lineTo(rx - 6, Hh - rh); c.lineTo(rx + 8, Hh - rh * 0.8); c.lineTo(rx + 24, Hh); c.fill(); } }
            if (k === 3) { grad(c, W, Hh, '#b8d8ee', '#f4fbff'); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; for (let r = 0; r < 7; r++) { c.beginPath(); c.arc(hw + hw * 0.5, hh + hh * 0.5, 20 + r * 24 + (t * 90 % 24), t * 3 + r, t * 3 + r + 2.4); c.stroke(); } }
            c.restore();
        }
        c.fillStyle = '#fff'; c.globalAlpha = 0.9 * (1 - merge); c.fillRect(hw - 2, 0, 4, Hh * e); c.fillRect(0, hh - 2, W * e, 4); c.globalAlpha = 1;
        if (merge > 0) { c.save(); c.globalCompositeOperation = 'lighter'; for (const [col, sx, sy] of [['#ff6a2a', 0.25, 0.25], ['#3aa0ff', 0.75, 0.25], ['#c99a5a', 0.25, 0.75], ['#ffffff', 0.75, 0.75]]) glowDot(c, lerp(W * sx, hw, merge), lerp(Hh * sy, hh, merge), 90 + merge * 160, col, 0.9); glowDot(c, hw, hh, 400 * merge, '#ffffff', 0.9 * merge); c.restore(); }
    };

    // ── VIRTUOSO: the curtain opens on a stage ──────────────────────────────
    CIN.VIRTUOSO = (c, t, D, W, Hh, wd, snap) => {
        grad(c, W, Hh, '#120a02', '#3a2606');
        const open = easeOut(clamp01((t - 0.25) / 0.7)), cx = W / 2;
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const sw = Math.sin(t * 1.7 + i * 2.1) * W * 0.18, g = c.createLinearGradient(cx + sw, 0, cx + sw * 0.4, Hh); g.addColorStop(0, 'rgba(255,230,140,0.55)'); g.addColorStop(1, 'rgba(255,230,140,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(W * (0.3 + i * 0.2), 0); c.lineTo(W * (0.3 + i * 0.2) + 20, 0); c.lineTo(cx + sw + 170, Hh); c.lineTo(cx + sw - 170, Hh); c.fill(); }
        const eq = clamp01((t - 0.5) / 0.3); for (let i = 0; i < 30; i++) { const h = (20 + 80 * Math.abs(Math.sin(t * 7 + i * 0.9) * Math.cos(t * 3 + i))) * eq; c.fillStyle = i % 2 ? '#ffd24a' : '#ff9a3a'; c.fillRect(W * 0.08 + i * (W * 0.84 / 30), Hh - h - 14, W * 0.84 / 30 - 4, h); }
        const rr = rrng('notes'); for (let i = 0; i < 14; i++) { const x = rr() * W, y = Hh * 0.8 - ((t * (50 + rr() * 60) + rr() * Hh) % (Hh * 0.8)); c.fillStyle = '#fff1b0'; c.beginPath(); c.ellipse(x, y, 7, 5, -0.4, 0, TAU); c.fill(); c.fillRect(x + 5, y - 22, 2.5, 22); }
        c.restore();
        for (const side of [-1, 1]) {
            const w = (W / 2) * (1 - open), x0 = side < 0 ? 0 : W - w;
            if (w < 2) continue;
            const g = c.createLinearGradient(x0, 0, x0 + w, 0); for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, k % 2 ? '#7a0a1a' : '#b01a2c');
            c.fillStyle = g; c.fillRect(x0, 0, w, Hh); c.fillStyle = '#ffd24a'; c.fillRect(side < 0 ? x0 + w - 6 : x0, 0, 6, Hh);
        }
        const fl = clamp01((t - (D - 0.85)) / 0.4); if (fl > 0) { c.save(); c.globalCompositeOperation = 'lighter'; glowDot(c, cx, Hh * 0.5, 160 + 420 * fl, '#fff1b0', 0.9 * fl); c.restore(); }
    };

    // short per-class cinematics for every other class live in their own file
    require('./ultimateFxCinema2')(CIN, { partial, grad, dimSnap, glowDot, rrng, clamp01, easeOut, easeIn, lerp, TAU, gearPath });

    // ── the layer: scratch render, fade in/out, hand the snapshot over ──────
    LAYERS.cinema = (ctx, tr, env) => {
        const t = env.time - tr.at, D = tr.dur || 2.1;
        if (t < 0 || t > D) return;
        const fn = CIN[tr.kind]; if (!fn) return;
        const W = ctx.canvas.width, Hh = ctx.canvas.height;
        let sc = env._cinSc; if (!sc || sc.width !== W || sc.height !== Hh) { sc = env._cinSc = createCanvas(W, Hh); env._cinSn = createCanvas(W, Hh); }
        const sn = env._cinSn, sx = sc.getContext('2d'), nx = sn.getContext('2d');
        if (t < 1.6) { nx.setTransform(1, 0, 0, 1, 0, 0); nx.clearRect(0, 0, W, Hh); nx.drawImage(ctx.canvas, 0, 0); }   // live frame under us (still pre-cinema)
        sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, W, Hh); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'; sx.shadowBlur = 0;
        sx.save(); fn(sx, t, D, W, Hh, W_OF(tr.world), sn); sx.restore();
        const a = clamp01(t / 0.1) * (1 - easeIn(clamp01((t - (D - 0.4)) / 0.4)));
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.drawImage(sc, 0, 0); ctx.restore();
    };
};
