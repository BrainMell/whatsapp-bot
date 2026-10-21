'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  DOCK POV — the real first-person fishing scene (owner 2026-10-21, Task 19:
//  "the fishing should be a gif you generate it once and keep it and overlay
//  the new stuff as the generation comes on" + spec §Pond: "see the pond from
//  the point of view of someone standing at the end of the dock").
//
//  What this replaces: the v1 `.j fish` card approximated the POV with the
//  overhead pier zoom — owner called that out, so this is the true composition:
//  water fills the upper frame (horizon near the top), dock planks run to the
//  dock edge in the lower foreground, rod + line + bobber in the water, ambient
//  fish silhouettes cruising beneath the surface.
//
//  Cache model ("generate it once and keep it"):
//    • base frames  — 16 PNG frames per (biome, pond level), canonical seed so
//      EVERY player shares one bake. Stored through mediaCache (disk L2, code-
//      versioned) → survives restarts and deploys. Repeat casts never re-bake.
//    • catch GIF    — the per-catch animation is the base frames + a catch
//      overlay (bobber bite, ripples, big-fish approach on RARE/EPIC, splash),
//      keyed ONLY by (biome, level, band) — no user data — so every common
//      catch after the first is a disk read. Loot text rides the WhatsApp
//      caption (spec §Message ordering / §20-4: cached animation + caption).
//
//  Delivery: pure-JS gif89a (same encoder as the abyss floor card) → sent as
//  { image, gifPlayback: true } — the card-system-proven GIF path. No ffmpeg,
//  no new deps, no MP4 budget. Text fallback stays mandatory upstream.
// ═══════════════════════════════════════════════════════════════════════════
const mediaCache = require('./mediaCache');
const K = require('./kingdom3d');
const hashStr = (s) => K.hashStr(String(s || ''));

const GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120;   // 1.92s loop
const CONTAINER_MAGIC = 'DOCKPOV1';

// ── the float (owner Task 20: "the tip of the fishing thing to be on top of
// the water, appearing to be bobbing in and out of it") ──
// Geometry shared by the base painter and the catch overlay so both agree to
// the pixel: rest centre (bx,by), body radius bs, and the FIXED waterline the
// body rises through / sinks under. One full in/out cycle per GIF loop.
function floatGeom(w, h) {
    const hz = Math.round(HORIZON * h), edgeY = Math.round(DOCK_EDGE * h);
    const by = hz + (edgeY - hz) * 0.46;
    const bs = h * 0.024;
    return { bx: w * 0.52, by, bs, wlY: by + bs * 0.55 };
}
function floatBob(t, bs) { return Math.sin(t * Math.PI * 2) * bs * 0.45; }
function floatY(t, h, dip = 0) { const g = floatGeom(480, h); return g.by + floatBob(t, g.bs) + dip; }
/** Rod + line + float. The body is drawn twice against a clipped waterline —
 *  dry colours above it, wet-tinted below — so it visibly crosses the surface;
 *  the antenna tip rides highest and is the last thing a bite pulls under. */
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
    const drawAll = (wet) => {  // red/white body + antenna + tip knob, wet = under waterline
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

// ── biome palettes (flat, palette-friendly — the GIF quantizer loves these) ─
// sky: [upper, mid, horizon glow] · water: far→near · shore/wood/trim props.
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

// ── layout (all proportional so the same painter serves the GIF and the card) ─
const HORIZON = 0.16, DOCK_EDGE = 0.63;

/** One base frame at loop position t∈[0,1). Deterministic per (biome,lvl). */
function paintFrame(ctx, w, h, t, { biome = 'isle', lvl = 1, fish = true } = {}) {
    const P = PALETTES[biome] || PALETTES.isle;
    const rng = K.mulberry32(hashStr(`dockpov:${biome}:${lvl}`));
    const hz = Math.round(HORIZON * h), edgeY = Math.round(DOCK_EDGE * h);
    const wh = edgeY - hz; // water height

    // ── sky: three flat bands + sun + distant ridge line ──
    ctx.fillStyle = P.sky[0]; ctx.fillRect(0, 0, w, Math.round(hz * 0.45));
    ctx.fillStyle = P.sky[1]; ctx.fillRect(0, Math.round(hz * 0.45), w, Math.round(hz * 0.3));
    ctx.fillStyle = P.sky[2]; ctx.fillRect(0, Math.round(hz * 0.75), w, hz - Math.round(hz * 0.75));
    const sx = w * 0.68, sy = hz * 0.42, sr = h * 0.055;
    ctx.fillStyle = P.sun; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    // far shoreline: low irregular ridge across the horizon (behind water)
    ctx.fillStyle = P.ridge;
    ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, hz - (2 + Math.floor(rng() * 4)) * (h / 360) * (rng() < 0.28 ? 3 : 1));
    ctx.lineTo(w, hz + 1); ctx.lineTo(0, hz + 1); ctx.closePath(); ctx.fill();

    // ── water: flat perspective bands, far (thin, dark) → near (tall, light) ──
    let y = hz; const steps = P.water.length;
    let span = wh * 0.028;
    for (let i = 0; i < steps; i++) {
        const y2 = i === steps - 1 ? edgeY : Math.min(edgeY, y + span);
        ctx.fillStyle = P.water[i]; ctx.fillRect(0, y, w, y2 - y + 1);
        y = y2 + 1; span *= 1.55;
    }
    // sun glitter path: drifting dashes down the sun column (flat 2 tones)
    for (let i = 0; i < 14; i++) {
        const ph = (t + rng()) % 1;
        const gy = hz + wh * (0.08 + 0.84 * ph);
        const gw2 = w * 0.02 + (gy - hz) / wh * w * 0.045;
        ctx.fillStyle = P.shimmer[i % 2];
        ctx.fillRect(sx - gw2 / 2 + Math.sin(ph * 9 + i) * gw2 * 0.3, gy, gw2, Math.max(1, h * 0.006));
    }
    // ambient sparkles across the whole surface
    for (let i = 0; i < 10; i++) {
        const ph = (t * 0.7 + rng() * 3) % 1;
        const gx = rng() * w, gy = hz + wh * (0.1 + 0.85 * ((rng() + ph) % 1));
        ctx.fillStyle = P.glint; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(ph * Math.PI);
        ctx.fillRect(gx, gy, w * 0.012 + 2, Math.max(1, h * 0.004)); ctx.globalAlpha = 1;
    }

    // ── ambient fish silhouettes: submerged feel = pre-blended darks, no alpha ─
    if (fish) {
        const nf = 5 + Math.max(0, lvl - 1);
        for (let i = 0; i < nf; i++) {
            const depth = 0.25 + 0.7 * rng();               // 0=horizon 1=dock edge
            const fy = hz + wh * depth;
            const fs = (h * 0.018) * (0.55 + depth);        // nearer = bigger
            const speed = 0.016 + rng() * 0.03;
            const fx = ((rng() + t * speed * (rng() < 0.5 ? -1 : 1)) % 1 + 1) % 1 * w;
            const wig = Math.sin(t * Math.PI * 4 + i * 1.7);
            const yy = fy + Math.sin(t * Math.PI * 2 + i) * fs * 0.5;
            ctx.fillStyle = P.fish[depth > 0.6 ? 0 : 1];
            ctx.save(); ctx.translate(fx, yy);
            ctx.beginPath(); ctx.ellipse(0, 0, fs * 1.15, fs * 0.34, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-fs * 1.05, 0);
            ctx.lineTo(-fs * 1.6, (-0.3 + wig * 0.22) * fs); ctx.lineTo(-fs * 1.6, (0.3 + wig * 0.22) * fs);
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
    // 6 longitudinal plank strips converging gently toward the centre
    const seams = [-0.5, -0.28, -0.06, 0.16, 0.38, 0.6];
    ctx.strokeStyle = P.wood[2]; ctx.lineWidth = Math.max(1.5, h * 0.008);
    for (const s of seams) {
        const xb = w * (0.5 + s);                    // x at the bottom of frame
        const xe = w * (0.5 + s * 0.72);             // x at the dock edge (converged)
        ctx.beginPath(); ctx.moveTo(xb, h); ctx.lineTo(xe, edgeY); ctx.stroke();
        // cross-board seams per strip (staggered)
        const per = 3 + (i0(s) % 2 ? 2 : 0);
        for (let k = 1; k <= per; k++) {
            const f = k / (per + 1);
            const px = xb + (xe - xb) * f, py = h + (edgeY - h) * f;
            ctx.beginPath(); ctx.moveTo(px - w * 0.018, py); ctx.lineTo(px + w * 0.018, py); ctx.stroke();
        }
    }
    // plank top-light tone + edge board face
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

    // ── rod + line + float, ON the water and bobbing in and out of it (Task 20)
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
    // the bite: float is pulled UNDER at t≈0.72..0.95 (antenna tip last to go)
    const bite = t > 0.7 && t < 0.95 ? Math.sin(((t - 0.7) / 0.25) * Math.PI) : 0;
    const dip = bite * bs * 1.35;
    const byy = G.by + floatBob(t, bs) + dip;
    const bx = G.bx;
    // expanding rings on the bite
    if (bite > 0.05) {
        const rr = 4 + bite * (band === 'epic' ? h * 0.05 : h * 0.03);
        ctx.strokeStyle = 'rgba(235,250,252,0.7)'; ctx.lineWidth = Math.max(1.5, h * 0.005);
        for (const f of [1, 0.6, 0.3]) {
            ctx.globalAlpha = f * bite; ctx.beginPath();
            ctx.ellipse(bx, byy, rr * f, rr * f * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    // 'mid': a carp-sized shadow circles in from the right during t 0.15→0.7
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
    // 'epic': the big one — koi-long silhouette gliding in from the left + gold
    // glint + splash burst at the bite (only AFTER the EPIC roll is known).
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
        // splash droplets at the bite peak
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
    // re-draw the line+float ON TOP of the overlay so the bite reads through —
    // same paintFloat as the base (rod tip FIXED, float pulled under by `dip`)
    paintFloat(ctx, w, h, t, P, { rod: false, line: true, dip });
}

// ── base-frame container (PNG frames + tiny header) through mediaCache ─────
// mediaCache stores ONE buffer per key: header line + JSON {gw,gh,delayMs,lens}
// followed by the PNG blobs. Code-versioned keys mean art edits auto-invalidate.
function packContainer(gw, gh, delayMs, pngs, magic = CONTAINER_MAGIC) {
    const lens = pngs.map((p) => p.length);
    const meta = JSON.stringify({ v: 1, gw, gh, delayMs, lens });
    const head = Buffer.from(`${magic}\n${meta}\n`, 'utf8');
    return Buffer.concat([head, ...pngs]);
}
function unpackContainer(buf, magic = CONTAINER_MAGIC) {
    try {
        const headEnd = buf.indexOf(0x0A, buf.indexOf(0x0A) + 1);   // end of meta line
        const tag = buf.slice(0, buf.indexOf(0x0A)).toString('utf8');
        if (tag !== magic) return null;
        const meta = JSON.parse(buf.slice(buf.indexOf(0x0A) + 1, headEnd).toString('utf8'));
        const pngs = []; let off = headEnd + 1;
        for (const l of meta.lens) { pngs.push(buf.slice(off, off + l)); off += l; }
        return { gw: meta.gw, gh: meta.gh, delayMs: meta.delayMs, pngs };
    } catch (e) { return null; }
}

let _imgCache = new Map(); // (kind:key) → decoded Image[] (hot path, process-wide)
function decodePngs(pngs) {
    const { Image } = require('canvas');
    return pngs.map((p) => { const im = new Image(); im.src = p; return im; });
}

/** Bake (once) the base frames for a biome+level. Every player shares one bake. */
async function getBaseFrames({ biome = 'isle', lvl = 1 } = {}) {
    const key = `dp1:${biome}:L${Math.max(1, Math.min(3, lvl))}`;
    const out = await mediaCache.cached('dockpov', key, async () => {
        const { createCanvas } = require('canvas');
        const pngs = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(GW, GH), c2 = cv.getContext('2d');
            paintFrame(c2, GW, GH, i / FRAMES, { biome, lvl });
            pngs.push(cv.toBuffer('image/png'));
        }
        return { buffer: packContainer(GW, GH, DELAY_MS, pngs), contentType: 'application/x-dockpov' };
    });
    const ck = `dockpov:${key}:${out.buffer.length}`;
    if (!_imgCache.has(ck)) {
        const c = unpackContainer(out.buffer);
        if (!c || c.pngs.length !== FRAMES) throw new Error('dockpov container unreadable');
        c.imgs = decodePngs(c.pngs);                     // decoded once per process
        _imgCache.set(ck, c);
        if (_imgCache.size > 12) _imgCache.delete(_imgCache.keys().next().value); // small hot set
    }
    return _imgCache.get(ck);
}

/** Resting-bobber anchor — kept for API compat; the float now owns its
 *  geometry via floatGeom() (base painter and overlay both call that). */
function anchorFor(w, h) {
    const g = floatGeom(w, h);
    return { bx: g.bx, by: g.by };
}

/** `.j fish` — the catch GIF: kept base frames + THIS catch's overlay, GIF89a. */
async function renderFishingGif({ biome = 'isle', lvl = 1, band = 'low' } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    const key = `fg1:${biome}:L${lvl}:${band}`;
    return mediaCache.cached('fishgif', key, async () => {
        const { createCanvas } = require('canvas');
        const { encodeGif } = require('../utils/gif89a');
        const base = await getBaseFrames({ biome, lvl });
        const anchor = anchorFor(base.gw, base.gh);
        const P = PALETTES[biome] || PALETTES.isle;
        const frames = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(base.gw, base.gh), c2 = cv.getContext('2d');
            c2.drawImage(base.imgs[i], 0, 0, base.gw, base.gh);
            // "overlay the new stuff as the generation comes on": this catch's
            // bite/ripples/approach/splash drawn OVER the kept base animation.
            paintCatchOverlay(c2, base.gw, base.gh, i / FRAMES, band, anchor, P);
            const d = c2.getImageData(0, 0, base.gw, base.gh);
            frames.push(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength));
        }
        const gif = encodeGif({ width: base.gw, height: base.gh, frames, delayMs: base.delayMs, loop: 0 });
        if (!gif || gif.length < 500) throw new Error('fish gif encode failed');
        return { buffer: gif, contentType: 'image/gif' };
    });
}

/** `.j base pond` viewer still — same dock-POV composition, clean (spec §Pond). */
function paintStill(ctx, w, h, { biome = 'isle', lvl = 1 } = {}) {
    return paintFrame(ctx, w, h, 0, { biome, lvl });
}

module.exports = { renderFishingGif, getBaseFrames, paintStill, paintFrame, paintCatchOverlay, paintFloat, floatGeom, floatBob, floatY, packContainer, unpackContainer, anchorFor, PALETTES, GW, GH, FRAMES, DELAY_MS, CONTAINER_MAGIC };
