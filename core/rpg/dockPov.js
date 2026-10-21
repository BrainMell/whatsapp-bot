'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  THE POND — dock-POV fishing GIF (Task 22 UNDO + REBUILD, owner 18:01Z:
//  "I meant GIF, not girl… UNDO that fishing bullshit you just did. I keep
//  saying ANIMATE it so that the thing in the pond is bobbing up and down,
//  the water looks like it's moving, and the fish too.").
//
//  What changed in Task 22:
//    • THE GIRL IS GONE — the Task 21 character scene is reverted to the
//      Task 19/20 dock-POV composition (water fills the upper frame, dock
//      planks in the lower foreground, rod + line + float on the water).
//    • THE WATER MOVES — traveling wave crests on every band (nearer bands
//      drift faster = parallax), two drifting ripple rings, the sun-glitter
//      path and ambient sparkles from Task 20.
//    • THE FISH SWIM — 2-4× the old speed with stronger tail wiggle, so the
//      crossing is obvious inside the 1.92s loop.
//    • THE FLOAT BOBS — Task 20 geometry verbatim: red/white body crossing
//      the waterline every loop, contact ripple breathing with the bob.
//    • RESULT OVERLAY = THE ESTABLISHED STYLE — the custom Task 21 plate is
//      DELETED; loot rides the shared drawBanner() ribbon (structureScenes),
//      the same top-centre gold banner every other base command uses.
//    • DAY/NIGHT stays (owner asked for it across every render — never
//      retracted): biome wash + per-phase celestial + grade + night lights.
//
//  Cache model ("generated once, saved permanently"):
//    • DAY MASTER — 16 PNG frames per pond level, baked ONCE by
//      scripts/bake_pond.js and COMMITTED to the repo at
//      core/assets/scenes/pond_l{1,2,3}_v2.bin (replaces the girl assets).
//      Runtime READS the committed asset; a bake only happens as fallback.
//    • COMPOSE — master + biome wash + hour + lights, cached per
//      (biome, level, phase, band). The catch overlay rides in here.
//    • FINAL GIF — compose + established loot banner, cached per
//      (biome, level, phase, band, banner-lines) so repeat catches are
//      disk hits. Loot text also rides the WhatsApp caption upstream.
//  Delivery: pure-JS gif89a → { video, gifPlayback: true } — WhatsApp ONLY
//  animates GIFs carried on a videoMessage; on imageMessage the flag is
//  dropped and the phone shows a still (owner hit this 4× on 2026-10-21).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const mediaCache = require('./mediaCache');
const dayNight = require('./dayNight');
const K = require('./kingdom3d');
const hashStr = (s) => K.hashStr(String(s || ''));

const GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120;   // 1.92s loop
const CONTAINER_MAGIC = 'PONDPOV2';
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'scenes');
const ASSET_VER = 'v2';

// ── the float (Task 20 geometry verbatim — owner approved this bob) ────────
function floatGeom(w, h) {
    const hz = Math.round(HORIZON * h), edgeY = Math.round(DOCK_EDGE * h);
    const by = hz + (edgeY - hz) * 0.46;
    const bs = h * 0.024;
    return { bx: w * 0.52, by, bs, wlY: by + bs * 0.55 };
}
function floatBob(t, bs) { return Math.sin(t * Math.PI * 2) * bs * 0.45; }
function floatY(t, h, dip = 0) { const g = floatGeom(480, h); return g.by + floatBob(t, g.bs) + dip; }
/** Rod + line + float. Body drawn twice against a clipped waterline — dry
 *  colours above, wet-tinted below — so it visibly crosses the surface; the
 *  antenna tip rides highest and is the last thing a bite pulls under. */
function paintFloat(ctx, w, h, t, P, { rod = true, line = true, dip = 0 } = {}) {
    const { bx, by, bs, wlY } = floatGeom(w, h);
    const byy = by + floatBob(t, bs) + dip;
    const tipX = bx + w * 0.17, tipY = by - h * 0.16;
    if (rod) {
        ctx.strokeStyle = P.wood[0]; ctx.lineWidth = Math.max(2, h * 0.011);
        ctx.beginPath(); ctx.moveTo(w * 1.0, h * 0.99); ctx.quadraticCurveTo(bx + w * 0.24, by - h * 0.02, tipX, tipY); ctx.stroke();
    }
    if (line) {
        ctx.strokeStyle = 'rgba(244,246,240,0.75)'; ctx.lineWidth = Math.max(1, h * 0.0035);
        ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bx, byy - bs * 1.5); ctx.stroke();
    }
    const drawAll = (wet) => {
        ctx.fillStyle = wet ? '#8f3a2c' : '#d94f3a';
        ctx.beginPath(); ctx.arc(bx, byy, bs, Math.PI, 0); ctx.fill();
        ctx.fillStyle = wet ? '#a8c4bc' : '#f4f1e6';
        ctx.beginPath(); ctx.arc(bx, byy, bs, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = wet ? '#241a10' : '#3a2a1a'; ctx.lineWidth = Math.max(1, bs * 0.16);
        ctx.beginPath(); ctx.moveTo(bx, byy - bs * 0.72); ctx.lineTo(bx, byy - bs * 1.5); ctx.stroke();
        ctx.fillStyle = wet ? '#c8b284' : '#f2e2b0';
        ctx.beginPath(); ctx.arc(bx, byy - bs * 1.5, bs * 0.26, 0, Math.PI * 2); ctx.fill();
    };
    ctx.save(); ctx.beginPath(); ctx.rect(bx - bs * 1.3, 0, bs * 2.6, wlY); ctx.clip(); drawAll(false); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(bx - bs * 1.3, wlY, bs * 2.6, h - wlY); ctx.clip(); drawAll(true); ctx.restore();
    // contact ripple at the waterline, breathing with the bob
    ctx.strokeStyle = P.glint; ctx.globalAlpha = 0.2 + 0.1 * Math.sin(t * Math.PI * 2);
    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.beginPath(); ctx.ellipse(bx, wlY, bs * (1.5 + 0.25 * Math.sin(t * Math.PI * 2)), bs * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return { bx, byy, wlY, bs };
}

// ── base palette (isle master — other biomes arrive as washes at compose) ──
const PALETTES = {
    isle: {
        sky: ['#b8d8e2', '#d8e8de', '#f2e4c0'], sun: '#f8f2d8',
        ridge: '#2e6e5c', water: ['#143f46', '#17505a', '#1c6169', '#247476', '#2e867c', '#3b987f'],
        glint: '#d8f0e2', shimmer: ['#9fd8c8', '#c8ecdc'], fish: ['#0c3236', '#0a282c'],
        wood: ['#8a6a40', '#755732', '#5c4326'], rope: '#c9b088', lantern: '#f2d896',
    },
    desert: {
        sky: ['#e8d8ae', '#f0e2b8', '#f8ecc2'], sun: '#fcf4d8',
        ridge: '#a8783e', water: ['#1e5a54', '#256a5e', '#2e7a66', '#3a8a6c', '#489a70', '#58aa74'],
        glint: '#f4ecd2', shimmer: ['#c8e8b8', '#e2f4cc'], fish: ['#123c34', '#0c2c26'],
        wood: ['#a8845a', '#8f6c46', '#6e5234'], rope: '#d8c098', lantern: '#f8e2a0',
    },
    tundra: {
        sky: ['#c2d4e0', '#d8e4ea', '#ecf0ee'], sun: '#f4f8f8',
        ridge: '#3c5468', water: ['#173248', '#1c3e54', '#224a5e', '#2a5668', '#33626e', '#3e6e74'],
        glint: '#e2f0f4', shimmer: ['#a8ccd8', '#cce4ea'], fish: ['#0e2432', '#0a1c28'],
        wood: ['#7c6248', '#68523c', '#523e2e'], rope: '#c0b49c', lantern: '#eee2b4',
    },
    highlands: {
        sky: ['#d8c8a0', '#e8d4a4', '#f4e0ac'], sun: '#f8ecca',
        ridge: '#8a5a24', water: ['#1c4a44', '#225a50', '#2a6a58', '#347a60', '#408a66', '#4e9a6a'],
        glint: '#f4e4bc', shimmer: ['#d8e8a8', '#e8f2bc'], fish: ['#103430', '#0a2624'],
        wood: ['#8a6238', '#744f2e', '#5a3d24'], rope: '#ccb284', lantern: '#f6dc9a',
    },
    volcanic: {
        sky: ['#8a7a72', '#a89284', '#c8a882'], sun: '#f4d8a8',
        ridge: '#3c3438', water: ['#22262c', '#2a3038', '#323c44', '#3c4a50', '#46585c', '#526666'],
        glint: '#f8c890', shimmer: ['#e8a05c', '#f4bc78'], fish: ['#141a20', '#0e1216'],
        wood: ['#6a5244', '#574238', '#423229'], rope: '#a89078', lantern: '#ffb864',
    },
};

// ── biome washes (Task 21 — master is isle; other realms wear their sky) ───
const WASHERS = {
    isle: null,
    desert: { sky: 'rgba(238,208,128,0.42)', water: 'rgba(58,150,104,0.30)', all: 'rgba(206,174,102,0.10)' },
    tundra: { sky: 'rgba(186,214,236,0.44)', water: 'rgba(28,78,124,0.34)', all: 'rgba(150,185,208,0.10)' },
    highlands: { sky: 'rgba(232,200,118,0.40)', water: 'rgba(34,114,84,0.28)', all: 'rgba(190,160,90,0.10)' },
    volcanic: { sky: 'rgba(88,68,62,0.46)', water: 'rgba(28,30,38,0.44)', all: 'rgba(70,40,32,0.20)' },
};

// ── layout ──────────────────────────────────────────────────────────────────
const HORIZON = 0.16, DOCK_EDGE = 0.63;

/** One base frame at loop position t∈[0,1). Deterministic per (biome,lvl). */
function paintFrame(ctx, w, h, t, { biome = 'isle', lvl = 1, fish = true } = {}) {
    const P = PALETTES[biome] || PALETTES.isle;
    const rng = K.mulberry32(hashStr(`dockpov:${biome}:${lvl}`));
    const hz = Math.round(HORIZON * h), edgeY = Math.round(DOCK_EDGE * h);
    const wh = edgeY - hz; // water height

    // ── sky: three flat bands + distant ridge line (NO baked sun — the compose
    // step paints the per-phase celestial: dawn/day/golden/dusk sun, night moon) ──
    ctx.fillStyle = P.sky[0]; ctx.fillRect(0, 0, w, Math.round(hz * 0.45));
    ctx.fillStyle = P.sky[1]; ctx.fillRect(0, Math.round(hz * 0.45), w, Math.round(hz * 0.3));
    ctx.fillStyle = P.sky[2]; ctx.fillRect(0, Math.round(hz * 0.75), w, hz - Math.round(hz * 0.75));
    // far shoreline: low irregular ridge across the horizon (behind water)
    ctx.fillStyle = P.ridge;
    ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, hz - (2 + Math.floor(rng() * 4)) * (h / 360) * (rng() < 0.28 ? 3 : 1));
    ctx.lineTo(w, hz + 1); ctx.lineTo(0, hz + 1); ctx.closePath(); ctx.fill();

    // ── water: flat perspective bands, far (thin, dark) → near (tall, light) ──
    let y = hz; const steps = P.water.length;
    let span = wh * 0.028;
    const bandYs = [hz];
    for (let i = 0; i < steps; i++) {
        const y2 = i === steps - 1 ? edgeY : Math.min(edgeY, y + span);
        ctx.fillStyle = P.water[i]; ctx.fillRect(0, y, w, y2 - y + 1);
        y = y2 + 1; span *= 1.55;
        bandYs.push(Math.min(edgeY, y));
    }
    // ── THE WATER MOVES (Task 22): traveling wave crests per band — light
    // dashes drifting horizontally, nearer bands faster (parallax), directions
    // alternating so the surface clearly flows in every frame of the loop. ──
    for (let b = 1; b < steps; b++) {
        const y0 = bandYs[b], y1 = (b + 1 <= steps - 1 ? bandYs[b + 1] : edgeY);
        if (y1 - y0 < 2) continue;
        const n = b < 3 ? 1 : 2;
        for (let k = 0; k < n; k++) {
            const sp = 0.045 + b * 0.02;                       // nearer = faster
            const dir = b % 2 ? 1 : -1;
            const ph = (((t * sp * dir) + k * 0.5 + b * 0.31) % 1 + 1) % 1;
            const cx = ph * (w * 1.3) - w * 0.15;              // wraps offscreen
            const cy = y0 + (y1 - y0) * (0.3 + 0.4 * ((k + b) % 2));
            const lw = w * (0.05 + 0.018 * (b % 3));
            ctx.fillStyle = P.shimmer[b % 2]; ctx.globalAlpha = 0.35;
            ctx.fillRect(cx, cy, lw, Math.max(1, h * 0.0045));
            ctx.globalAlpha = 1;
        }
    }
    // ── drifting ripple rings — two slow expanding circles, staggered so one
    // is always alive; they swell, fade, and re-seed offscreen-ish. ──
    for (let k = 0; k < 2; k++) {
        const ph = (t * 0.5 + k * 0.5) % 1;
        const rx = w * (0.28 + 0.36 * k), ry2 = hz + wh * (0.34 + 0.22 * k);
        const rr = (0.03 + ph * 0.09) * w;
        ctx.strokeStyle = P.glint; ctx.globalAlpha = 0.32 * (1 - ph);
        ctx.lineWidth = Math.max(1, h * 0.0035);
        ctx.beginPath(); ctx.ellipse(rx, ry2, rr, rr * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
    }
    // sun glitter path: drifting dashes down the sun column (flat 2 tones)
    // (the DAY column at x=0.68 — compose's phase celestial lines up with it)
    const sgx = w * 0.68;
    for (let i = 0; i < 14; i++) {
        const ph = (t + rng()) % 1;
        const gy = hz + wh * (0.08 + 0.84 * ph);
        const gw2 = w * 0.02 + (gy - hz) / wh * w * 0.045;
        ctx.fillStyle = P.shimmer[i % 2];
        ctx.fillRect(sgx - gw2 / 2 + Math.sin(ph * 9 + i) * gw2 * 0.3, gy, gw2, Math.max(1, h * 0.006));
    }
    // ambient sparkles across the whole surface
    for (let i = 0; i < 10; i++) {
        const ph = (t * 0.7 + rng() * 3) % 1;
        const gx = rng() * w, gy = hz + wh * (0.1 + 0.85 * ((rng() + ph) % 1));
        ctx.fillStyle = P.glint; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(ph * Math.PI);
        ctx.fillRect(gx, gy, w * 0.012 + 2, Math.max(1, h * 0.004)); ctx.globalAlpha = 1;
    }

    // ── THE FISH SWIM (Task 22): ambient silhouettes crossing the frame at
    // 2-4× the old speed with a strong tail beat — their motion reads in a
    // single 1.92s loop instead of needing three. ──
    if (fish) {
        const nf = 6 + Math.max(0, lvl - 1);
        for (let i = 0; i < nf; i++) {
            const depth = 0.25 + 0.7 * rng();               // 0=horizon 1=dock edge
            const fy = hz + wh * depth;
            const fs = (h * 0.019) * (0.55 + depth);        // nearer = bigger
            const speed = 0.05 + rng() * 0.06;              // Task 22: was 0.016-0.046
            const fx = ((rng() + t * speed * (rng() < 0.5 ? -1 : 1)) % 1 + 1) % 1 * w;
            const wig = Math.sin(t * Math.PI * 6 + i * 1.7);
            const yy = fy + Math.sin(t * Math.PI * 2 + i) * fs * 0.7;
            ctx.fillStyle = P.fish[depth > 0.6 ? 0 : 1];
            ctx.save(); ctx.translate(fx, yy);
            ctx.beginPath(); ctx.ellipse(0, 0, fs * 1.15, fs * 0.34, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-fs * 1.05, 0);
            ctx.lineTo(-fs * 1.6, (-0.3 + wig * 0.3) * fs); ctx.lineTo(-fs * 1.6, (0.3 + wig * 0.3) * fs);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }

    // ── lvl dressing: rowboat silhouette (L2+) bobbing on the left reach ──
    if (lvl >= 2) {
        const by2 = hz + wh * 0.34, bx2 = w * 0.16;
        const bob = Math.sin(t * Math.PI * 2) * h * 0.004;
        ctx.fillStyle = P.wood[2];
        ctx.save(); ctx.translate(bx2, by2 + bob);
        ctx.beginPath(); ctx.moveTo(-w * 0.055, 0);
        ctx.quadraticCurveTo(-w * 0.03, h * 0.022, 0, h * 0.024);
        ctx.quadraticCurveTo(w * 0.03, h * 0.022, w * 0.055, 0);
        ctx.lineTo(w * 0.047, -h * 0.012); ctx.lineTo(-w * 0.047, -h * 0.012); ctx.closePath(); ctx.fill();
        ctx.fillStyle = P.wood[1]; ctx.fillRect(-w * 0.05, -h * 0.015, w * 0.1, h * 0.004);
        ctx.restore();
    }

    // ── the dock: planks in perspective, edge board at the water line ──
    ctx.fillStyle = P.wood[1]; ctx.fillRect(0, edgeY, w, h - edgeY);
    const seams = [-0.5, -0.28, -0.06, 0.16, 0.38, 0.6];
    ctx.strokeStyle = P.wood[2]; ctx.lineWidth = Math.max(1.5, h * 0.008);
    for (const s of seams) {
        const xb = w * (0.5 + s);
        const xe = w * (0.5 + s * 0.72);
        ctx.beginPath(); ctx.moveTo(xb, h); ctx.lineTo(xe, edgeY); ctx.stroke();
        const per = 3 + (i0(s) % 2 ? 2 : 0);
        for (let k = 1; k <= per; k++) {
            const f = k / (per + 1);
            const px = xb + (xe - xb) * f, py = h + (edgeY - h) * f;
            ctx.beginPath(); ctx.moveTo(px - w * 0.018, py); ctx.lineTo(px + w * 0.018, py); ctx.stroke();
        }
    }
    ctx.fillStyle = P.wood[0]; ctx.fillRect(0, edgeY, w, Math.max(2, h * 0.012));
    ctx.fillStyle = P.wood[2]; ctx.fillRect(0, edgeY + Math.max(2, h * 0.012), w, Math.max(3, h * 0.02));
    // mooring post (right) + rope running to the left edge
    const postX = w * 0.86, postW = w * 0.035;
    ctx.fillStyle = P.wood[0]; ctx.fillRect(postX, edgeY - h * 0.1, postW, h * 0.1 + (h - edgeY) * 0.35);
    ctx.fillStyle = P.wood[2]; ctx.fillRect(postX, edgeY - h * 0.1, postW * 0.35, h * 0.1 + (h - edgeY) * 0.35);
    ctx.fillStyle = P.wood[2]; ctx.fillRect(postX - postW * 0.25, edgeY - h * 0.115, postW * 1.5, h * 0.016);
    ctx.strokeStyle = P.rope; ctx.lineWidth = Math.max(1.5, h * 0.007);
    ctx.beginPath(); ctx.moveTo(postX, edgeY - h * 0.05);
    ctx.quadraticCurveTo(w * 0.4, edgeY + h * 0.06, w * 0.02, edgeY + h * 0.02); ctx.stroke();
    // tackle box + (L2+) lantern glow pooled on the planks, left foreground
    ctx.fillStyle = P.wood[2]; ctx.fillRect(w * 0.06, h * 0.86, w * 0.1, h * 0.09);
    ctx.fillStyle = P.wood[0]; ctx.fillRect(w * 0.06, h * 0.86, w * 0.1, h * 0.024);
    if (lvl >= 2) {
        ctx.fillStyle = P.lantern; ctx.globalAlpha = 0.34;
        ctx.beginPath(); ctx.ellipse(w * 0.2, h * 0.9, w * 0.13, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.lantern; ctx.fillRect(w * 0.185, h * 0.8, w * 0.03, h * 0.06);
    }
    if (lvl >= 3) { // gold trim on the edge board — a kept, well-funded pond
        ctx.fillStyle = P.lantern; ctx.globalAlpha = 0.8;
        ctx.fillRect(0, edgeY, w, Math.max(1.5, h * 0.004)); ctx.globalAlpha = 1;
    }

    // ── rod + line + float, ON the water and bobbing in and out of it ──
    paintFloat(ctx, w, h, t, P, { rod: true, line: true });
    const __g = floatGeom(w, h);
    return { bx: __g.bx, by: __g.by };
}
function i0(s) { return Math.abs(Math.round(s * 100)); }

// ── catch overlays ("the new stuff" layered over the kept base frames) ──────
// band: 'low' = subtle bite · 'mid' = medium fish closes in · 'epic' = big
// approach + splash. Drawn AFTER the roll is known — never pre-signals rarity.
function paintCatchOverlay(ctx, w, h, t, band, _anchor, P = PALETTES.isle) {
    const G = floatGeom(w, h), bs = G.bs;
    const bite = t > 0.7 && t < 0.95 ? Math.sin(((t - 0.7) / 0.25) * Math.PI) : 0;
    const dip = bite * bs * 1.35;
    const byy = G.by + floatBob(t, bs) + dip;
    const bx = G.bx;
    if (bite > 0.05) {
        const rr = 4 + bite * (band === 'epic' ? h * 0.05 : h * 0.03);
        ctx.strokeStyle = 'rgba(235,250,252,0.7)'; ctx.lineWidth = Math.max(1.5, h * 0.005);
        for (const f of [1, 0.6, 0.3]) {
            ctx.globalAlpha = f * bite; ctx.beginPath();
            ctx.ellipse(bx, byy, rr * f, rr * f * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    if (band === 'mid' || band === 'epic') {
        const ap = Math.min(1, Math.max(0, (t - 0.12) / 0.58));
        const fx = bx + w * (1 - ap) * 0.36, fy = byy - h * 0.01 + Math.sin(t * 9) * h * 0.004;
        const fs = h * 0.03 * (0.6 + 0.4 * ap);
        if (ap > 0.02) {
            ctx.fillStyle = 'rgba(12,50,54,0.42)';
            ctx.save(); ctx.translate(fx, fy);
            ctx.beginPath(); ctx.ellipse(0, 0, fs * 1.2, fs * 0.36, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-fs * 1.1, 0); ctx.lineTo(-fs * 1.7, (-0.3 + Math.sin(t * 14) * 0.24) * fs);
            ctx.lineTo(-fs * 1.7, (0.3 + Math.sin(t * 14) * 0.24) * fs); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }
    if (band === 'epic') {
        const ap = Math.min(1, Math.max(0, (t - 0.05) / 0.6));
        const fx = bx - w * (1 - ap) * 0.42, fy = byy + h * 0.012 + Math.sin(t * 7) * h * 0.005;
        const fs = h * 0.052 * (0.55 + 0.45 * ap);
        if (ap > 0.02) {
            ctx.save(); ctx.translate(fx, fy);
            ctx.fillStyle = 'rgba(10,44,48,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 0, fs * 1.3, fs * 0.38, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-fs * 1.2, 0); ctx.lineTo(-fs * 1.85, (-0.28 + Math.sin(t * 11) * 0.26) * fs);
            ctx.lineTo(-fs * 1.85, (0.28 + Math.sin(t * 11) * 0.26) * fs); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(244,222,150,0.5)'; ctx.beginPath(); ctx.ellipse(0, -fs * 0.12, fs * 0.55, fs * 0.1, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        if (bite > 0.35) {
            ctx.strokeStyle = 'rgba(244,246,240,0.85)'; ctx.lineWidth = Math.max(1.5, h * 0.005);
            for (let d = 0; d < 7; d++) {
                const a = -Math.PI * (0.18 + d * 0.11), r = bite * h * 0.045;
                ctx.globalAlpha = bite;
                ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r * 0.5, byy + Math.sin(a) * r * 0.5);
                ctx.lineTo(bx + Math.cos(a) * r, byy + Math.sin(a) * r); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }
    // the line + float ride ON TOP of the overlay so the bite reads through
    paintFloat(ctx, w, h, t, P, { rod: false, line: true, dip });
}

// ── far-shoreline silhouette — the MOUNTAINS the sun sets behind ───────────
// ⚠⚠ MUST stay byte-identical with paintFrame's far-shoreline loop below
// (same seed, same rng call order — the ridge is paintFrame's FIRST rng
// consumer, so a fresh generator seeded the same reproduces it exactly).
// This shape is the occluder paintCelestial repaints OVER the sun so the disc
// physically sinks behind the horizon instead of floating on the water
// (owner 2026-10-21: "why is the sun not disappearing behind the horizon with
// mountains? why is it overlaying the image???").
function ridgeSilhouette(w, h, lvl = 1) {
    const rng = K.mulberry32(hashStr(`dockpov:isle:${Math.max(1, Math.min(3, lvl))}`));
    const hz = Math.round(HORIZON * h), pts = [];
    for (let x = 0; x <= w; x += w / 24) {
        const hgt = (2 + Math.floor(rng() * 4)) * (h / 360) * (rng() < 0.28 ? 3 : 1);
        pts.push(hz - hgt);
    }
    return { step: w / 24, pts, hz };
}

// ── hour dressing: celestial body + sun/moon glitter on the water ──────────
// The glow + disc are clipped to the SKY and the far skyline is REPAINTED over
// them, so dawn/golden/dusk discs are physically cut by the mountains — dusk
// leaves only a sliver above the ridge. `sink` = fraction of the disc below
// the skyline (0 = touching the peaks, 1 = fully set). `occluder` lets other
// scenes (the hunt treeline) supply their own skyline:
//   { lineAt(x) → y, repaint(ctx) }.
function paintCelestial(ctx, w, h, t, phase, { glitter = true, lvl = 1, occluder = null } = {}) {
    const hz = Math.round(HORIZON * h);
    if (phase === 'night') return;                    // moonStars() owns the night sky
    const conf = {
        dawn:   { x: 0.18, sink: 0.10, r: 0.050, col: '#ffd9a8', glow: 'rgba(255,190,130,0.35)' },
        day:    { x: 0.68, y: 0.085,   r: 0.042, col: '#f8f2d8', glow: 'rgba(255,246,210,0.28)' },
        golden: { x: 0.80, sink: 0.55, r: 0.055, col: '#ffc478', glow: 'rgba(255,160,80,0.40)' },
        dusk:   { x: 0.80, sink: 0.82, r: 0.060, col: '#ff9a5a', glow: 'rgba(255,120,60,0.42)' },
    }[phase];
    if (!conf) return;
    const sx = w * conf.x, sr = h * conf.r;
    // skyline the sun sinks behind: caller's occluder, else the pond ridge
    const occ = occluder || (() => {
        const yAt = (x) => {
            const sil = ridgeSilhouette(w, h, lvl);
            const i = Math.max(0, Math.min(sil.pts.length - 1, Math.round(x / sil.step)));
            return sil.pts[i];
        };
        return { lineAt: yAt, repaint: (c) => _repaintRidge(c, w, h, lvl) };
    })();
    const lineY = occ.lineAt(sx);
    // sun centre: explicit y (day) or sunk against the skyline (rise/set)
    const sy = conf.y != null ? h * conf.y : lineY - sr * (1 - 2 * conf.sink);
    // glow + disc live in the SKY only — never wash over the water (the
    // reflection lives in the glitter path below)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, Math.max(1, Math.min(h, lineY + 2))); ctx.clip();
    const g = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 3);
    g.addColorStop(0, conf.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = conf.col; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the mountains EAT the disc — repaint the skyline over the sun
    if (occ.repaint) occ.repaint(ctx);
    // glitter path down the sun column (skips the dock planks below the edge)
    if (glitter) {
        const edgeY = Math.round(DOCK_EDGE * h);
        const rng = K.mulberry32(hashStr(`glitter:${phase}`));
        const wh = h - hz;
        for (let i = 0; i < 13; i++) {
            const ph = (t + rng()) % 1;
            const gy = hz + wh * (0.05 + 0.8 * ph);
            const gw2 = w * 0.018 + (gy - hz) / wh * w * 0.04;
            const gx = sx - gw2 / 2 + Math.sin(ph * 9 + i) * gw2 * 0.3;
            if (gy > edgeY) continue;                  // no glitter on the dock
            ctx.globalAlpha = phase === 'dusk' ? 0.5 : 0.72;
            ctx.fillStyle = phase === 'dusk' ? '#ffb27a' : PALETTES.isle.shimmer[i % 2];
            ctx.fillRect(gx, gy, gw2, Math.max(1, h * 0.005));
        }
        ctx.globalAlpha = 1;
    }
}

// the ridge re-draw (occluder) — ⚠ shapes identical to paintFrame's loop
function _repaintRidge(ctx, w, h, lvl = 1) {
    const sil = ridgeSilhouette(w, h, lvl);
    ctx.fillStyle = PALETTES.isle.ridge;
    ctx.beginPath(); ctx.moveTo(0, sil.pts[0]);
    for (let i = 1; i < sil.pts.length; i++) ctx.lineTo(i * sil.step, sil.pts[i]);
    ctx.lineTo(w, sil.hz + 1); ctx.lineTo(0, sil.hz + 1); ctx.closePath(); ctx.fill();
}

// ── base-frame container (PNG frames + tiny header) through mediaCache ─────
function packContainer(gw, gh, delayMs, pngs, magic = CONTAINER_MAGIC) {
    const lens = pngs.map((p) => p.length);
    const meta = JSON.stringify({ v: 1, gw, gh, delayMs, lens });
    const head = Buffer.from(`${magic}\n${meta}\n`, 'utf8');
    return Buffer.concat([head, ...pngs]);
}
function unpackContainer(buf, magic = CONTAINER_MAGIC) {
    try {
        const headEnd = buf.indexOf(0x0A, buf.indexOf(0x0A) + 1);
        const tag = buf.slice(0, buf.indexOf(0x0A)).toString('utf8');
        if (tag !== magic) return null;
        const meta = JSON.parse(buf.slice(buf.indexOf(0x0A) + 1, headEnd).toString('utf8'));
        const pngs = []; let off = headEnd + 1;
        for (const l of meta.lens) { pngs.push(buf.slice(off, off + l)); off += l; }
        return { gw: meta.gw, gh: meta.gh, delayMs: meta.delayMs, pngs };
    } catch (e) { return null; }
}

let _imgCache = new Map();
function decodePngs(pngs) {
    const { Image } = require('canvas');
    return pngs.map((p) => { const im = new Image(); im.src = p; return im; });
}

/** Bake the day master frames for one pond level (used by the repo bake script
 *  AND as the fallback if the committed asset is ever missing). */
function bakeLevelFrames(lvl = 1) {
    const { createCanvas } = require('canvas');
    const pngs = [];
    for (let i = 0; i < FRAMES; i++) {
        const cv = createCanvas(GW, GH), c2 = cv.getContext('2d');
        paintFrame(c2, GW, GH, i / FRAMES, { lvl });
        pngs.push(cv.toBuffer('image/png'));
    }
    return packContainer(GW, GH, DELAY_MS, pngs);
}

/** The committed repo asset (generated once, saved permanently) — read, never
 *  re-baked. Falls back to an in-place bake only if the file is missing. */
function loadCommitted(lvl = 1) {
    const p = path.join(ASSET_DIR, `pond_l${Math.max(1, Math.min(3, lvl))}_${ASSET_VER}.bin`);
    try {
        const buf = fs.readFileSync(p);
        const c = unpackContainer(buf);
        if (c && c.pngs.length === FRAMES) return { buf, committed: true };
    } catch (e) { /* fall through */ }
    return { buf: bakeLevelFrames(lvl), committed: false };
}

/** Day master frames for a pond level — every player shares the one asset. */
async function getBaseFrames({ lvl = 1 } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    const ck = `pondpov:L${lvl}`;
    if (_imgCache.has(ck)) return _imgCache.get(ck);
    const { buf, committed } = loadCommitted(lvl);
    const c = unpackContainer(buf);
    if (!c || c.pngs.length !== FRAMES) throw new Error('pond master unreadable');
    c.imgs = decodePngs(c.pngs);
    c.committed = committed;
    _imgCache.set(ck, c);
    return c;
}

// night-light anchors on the RESTORED dock: the mooring post lantern + the
// warm pool the L2 lantern casts over the planks.
function dockAnchors(w, h, lvl = 1) {
    const edgeY = Math.round(DOCK_EDGE * h);
    return {
        post: { x: w * 0.877, y: edgeY - h * 0.1 },
        pool: { x: w * 0.2, y: h * 0.9 },
    };
}

/** `.j base pond` viewer still — the dock-POV scene at any size, wearing the hour. */
function paintStill(ctx, w, h, { lvl = 1, biome = 'isle', phase = null, t = 0 } = {}) {
    phase = phase || dayNight.phaseAt();
    paintFrame(ctx, w, h, t, { lvl });
    const wash = WASHERS[biome];
    if (wash) {
        const hz = Math.round(HORIZON * h);
        ctx.fillStyle = wash.sky; ctx.fillRect(0, 0, w, hz);
        ctx.fillStyle = wash.water; ctx.fillRect(0, hz, w, h - hz);
        if (wash.all) { ctx.fillStyle = wash.all; ctx.fillRect(0, 0, w, h); }
    }
    paintCelestial(ctx, w, h, t, phase, { lvl });
    dayNight.grade(ctx, w, h, phase);
    if (phase === 'night' || phase === 'dusk') {
        const A = dockAnchors(w, h, lvl);
        dayNight.light(ctx, A.post.x, A.post.y, h * 0.14, '#ffcf7a', phase === 'night' ? 0.5 : 0.3);
        if (lvl >= 2) dayNight.light(ctx, A.pool.x, A.pool.y, h * 0.1, '#ffc98a', phase === 'night' ? 0.22 : 0.12, false);
        if (phase === 'night') {
            dayNight.moonStars(ctx, w, h, { seed: 17, moonX: 0.18, moonY: 0.09, stars: Math.round(20 * w / GW), starAlpha: 0.85, skyH: HORIZON * 0.92 });
            dayNight.light(ctx, w * 0.18, h * 0.52, h * 0.15, '#cfe0ff', 0.15, false);   // moon glint on the water
        }
    }
}

// ── compose: master + biome wash + hour + lights + catch overlay ───────────
// Cached per (biome, level, phase, band) — the loot banner is drawn per catch
// AFTER this, so the cache stays tiny while every catch still explains itself.
async function composePond({ biome = 'isle', lvl = 1, phase = null, band = 'low' } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const key = `pgc2:${biome}:L${lvl}:${phase}:${band}`;
    return mediaCache.cached('pondcompose', key, async () => {
        const { createCanvas } = require('canvas');
        const master = await getBaseFrames({ lvl });
        const wash = WASHERS[biome] || null;
        const pngs = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(master.gw, master.gh), c2 = cv.getContext('2d');
            c2.drawImage(master.imgs[i], 0, 0, master.gw, master.gh);
            if (wash) {
                const hz = Math.round(HORIZON * master.gh);
                c2.fillStyle = wash.sky; c2.fillRect(0, 0, master.gw, hz);
                c2.fillStyle = wash.water; c2.fillRect(0, hz, master.gw, master.gh - hz);
                if (wash.all) { c2.fillStyle = wash.all; c2.fillRect(0, 0, master.gw, master.gh); }
            }
            paintCelestial(c2, master.gw, master.gh, i / FRAMES, phase, { lvl });
            dayNight.grade(c2, master.gw, master.gh, phase);
            if (phase === 'night' || phase === 'dusk') {
                const A = dockAnchors(master.gw, master.gh, lvl);
                dayNight.light(c2, A.post.x, A.post.y, master.gh * 0.15, '#ffcf7a', phase === 'night' ? 0.55 : 0.32);
                if (lvl >= 2) dayNight.light(c2, A.pool.x, A.pool.y, master.gh * 0.1, '#ffc98a', phase === 'night' ? 0.24 : 0.13, false);
                if (phase === 'night') {   // moon over the pond + glint + warm pool on the deck
                    dayNight.moonStars(c2, master.gw, master.gh, { seed: 17, moonX: 0.18, moonY: 0.09, stars: 20, starAlpha: 0.85, skyH: HORIZON * 0.92 });
                    dayNight.light(c2, master.gw * 0.18, master.gh * 0.52, master.gh * 0.16, '#cfe0ff', 0.16, false);
                }
            }
            paintCatchOverlay(c2, master.gw, master.gh, i / FRAMES, band);
            pngs.push(cv.toBuffer('image/png'));
        }
        return { buffer: packContainer(master.gw, master.gh, master.delayMs, pngs), contentType: 'application/x-pondcompose' };
    });
}

// ── loot lines for the banner when the caller has no res.banner (fallback) ──
const RARITY_COL = { COMMON: '#e8e8e0', UNCOMMON: '#8ee08e', RARE: '#7ab8f0', EPIC: '#c9a0ff', LEGENDARY: '#f0c060' };
function plateLines(kind = 'fish', drops = {}) {
    const NAMES = {
        fish: { raw_fish: ['Pond Minnow', 'COMMON', 40], river_trout: ['River Trout', 'UNCOMMON', 140], silver_carp: ['Silver Carp', 'RARE', 480], crystal_koi: ['Crystal Koi', 'EPIC', 1800] },
        hunt: { rabbit_pelt: ['Rabbit Pelt', 'COMMON', 50], venison: ['Venison Haunch', 'UNCOMMON', 160], boar_tusk: ['Boar Tusk', 'RARE', 520], stag_antler: ['Stag Antler', 'EPIC', 2000] },
    }[kind] || {};
    return Object.entries(drops || {})
        .sort((a, b) => (NAMES[b[0]] ? NAMES[b[0]][2] * b[1] : 0) - (NAMES[a[0]] ? NAMES[a[0]][2] * a[1] : 0))
        .slice(0, 3)
        .map(([id, q]) => `${q}× ${(NAMES[id] || [id])[0]}`);
}

// ── `.j fish` — the catch GIF: kept master + hour + THIS catch's overlay +
// the ESTABLISHED loot ribbon (structureScenes.drawBanner — the same style the
// other base commands use; owner Task 22). Cached per (biome,lvl,phase,band,loot).
const BANNER_FROM_FRAME = FRAMES - 5;   // ribbon rides the last 5 frames (~0.6s)
async function renderFishingGif({ biome = 'isle', lvl = 1, band = 'low', drops = {}, phase = null, banner = null } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const ribbon = banner && (banner.head || (banner.lines || []).length)
        ? { head: String(banner.head || 'The Pond'), lines: (banner.lines || []).slice(0, 6) }
        : { head: 'The Pond', lines: plateLines('fish', drops) };
    const plateKey = hashStr(JSON.stringify(ribbon));
    const key = `pg3:${biome}:L${lvl}:${phase}:${band}:${plateKey}`;
    return mediaCache.cached('fishgif', key, async () => {
        const { createCanvas } = require('canvas');
        const { encodeGif } = require('../utils/gif89a');
        const scenes = require('./structureScenes');
        try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
        const comp = await composePond({ biome, lvl, phase, band });
        const c = unpackContainer(comp.buffer);
        if (!c || c.pngs.length !== FRAMES) throw new Error('pond compose container unreadable');
        const imgs = decodePngs(c.pngs);
        const frames = [];
        let thumb = null;
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(c.gw, c.gh), c2 = cv.getContext('2d');
            c2.drawImage(imgs[i], 0, 0, c.gw, c.gh);
            if (i >= BANNER_FROM_FRAME) scenes.drawBanner(c2, c.gw, c.gh, ribbon);
            if (i === 0) {
                // real frame-0 JPEG for the video-bubble preview — GIFs now go
                // out as { video, gifPlayback: true } (WhatsApp proto) and the
                // engine patch stamps a gray square on videos without one.
                try {
                    const tw = 240, th = Math.round(240 * c.gh / c.gw);
                    const tc = createCanvas(tw, th), tc2 = tc.getContext('2d');
                    tc2.drawImage(cv, 0, 0, tw, th);
                    thumb = tc.toBuffer('image/jpeg');
                } catch (e) { thumb = null; }
            }
            const d = c2.getImageData(0, 0, c.gw, c.gh);
            frames.push(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength));
        }
        const gif = encodeGif({ width: c.gw, height: c.gh, frames, delayMs: c.delayMs, loop: 0 });
        if (!gif || gif.length < 500) throw new Error('pond gif encode failed');
        return { buffer: gif, contentType: 'image/gif', thumb };
    });
}

function anchorFor(w, h) { const g = floatGeom(w, h); return { bx: g.bx, by: g.by }; }

module.exports = {
    renderFishingGif, getBaseFrames, composePond, paintStill, paintFrame,
    paintCatchOverlay, paintFloat, floatGeom, floatBob, floatY, paintCelestial,
    plateLines, packContainer, unpackContainer, anchorFor, bakeLevelFrames, loadCommitted,
    dockAnchors, PALETTES, WASHERS, RARITY_COL, GW, GH, FRAMES, DELAY_MS, CONTAINER_MAGIC, ASSET_VER, ASSET_DIR,
};
