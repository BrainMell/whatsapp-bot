'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  THE POND — girl at the water (owner 2026-10-21, Task 21, 4th ask — verbatim:
//  "I want the .j fish image to NOT be an image, but a girl that has the
//  floating thing on the water, bobbing up and down slightly. And I want this
//  generated once and saved on the server, or in the repo permanently, as a
//  usable asset and an overlay like the others. We should implement an overlay
//  that also explains this is the pond and shows what you caught.")
//
//  What this is now:
//    • THE SCENE — an angler girl seated on the dock edge, rod in her hands,
//      red/white float ON the water bobbing gently in and out of it. Painted
//      in the base's flat-shaded style, with a diegetic "THE POND" sign on a
//      post, her bucket, a rod stand and a lantern (the lantern is a night
//      light source).
//    • GENERATED ONCE, SAVED FOREVER — the day master is baked ONCE by
//      scripts/bake_pond_girl.js and COMMITTED to the repo at
//      core/assets/scenes/pond_girl_l{1,2,3}.bin (16 PNG frames each, one per
//      pond level: L2 adds the rowboat, L3 the gold edge trim). At runtime the
//      committed asset is READ, never re-baked; if it is somehow missing the
//      painter falls back to baking in place so nothing ever breaks.
//    • OVERLAY LIKE THE OTHERS — per catch, the kept master frames get the
//      catch overlay composited on top (bite pulls the float under, ripples,
//      RARE carp closes in, EPIC koi + splash) plus a RESULT PLATE that
//      explains this is the pond and shows what you caught (rarity-coloured).
//    • DAY & NIGHT — the master is day-lit true colour; compose wears the
//      shared dayNight cycle (dawn/golden/dusk/night grade) and lights the
//      lantern + moon glints at night. Composites are disk-cached per
//      (biome, level, phase, band); the final GIF is cached per loot plate.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const mediaCache = require('./mediaCache');
const dayNight = require('./dayNight');
const K = require('./kingdom3d');
const hashStr = (s) => K.hashStr(String(s || ''));

const GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120;   // 1.92s loop
const CONTAINER_MAGIC = 'PONDGIRL1';
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'scenes');
const ASSET_VER = 'v1';

// ── the float (Task 20, kept: "the tip of the fishing thing to be on top of
// the water, appearing to be bobbing in and out of it" — Task 21 softens the
// bob: "bobbing up and down slightly") ──
const BOB_AMP = 0.24;                                     // gentle idle bob (× body radius)
function floatGeom(w, h) {
    const hz = Math.round(HORIZON * h);
    const by = hz + (h - hz) * 0.26;                      // sits in the near-middle reach
    const bs = h * 0.026;
    return { bx: w * 0.355, by, bs, wlY: by + bs * 0.55 };
}
function floatBob(t, bs) { return Math.sin(t * Math.PI * 2) * bs * BOB_AMP; }
function floatY(t, h, dip = 0) { const g = floatGeom(480, h); return g.by + floatBob(t, g.bs) + dip; }
/** Rod + line + float. Body drawn twice against the waterline clip — dry
 *  colours above, wet-tinted below — so it visibly crosses the surface; the
 *  antenna tip rides highest and is the last thing a bite pulls under. */
function paintFloat(ctx, w, h, t, P, { rod = true, line = true, dip = 0, rodFrom = null, rodTip = null } = {}) {
    const { bx, by, bs, wlY } = floatGeom(w, h);
    const byy = by + floatBob(t, bs) + dip;
    const tipX = rodTip ? rodTip.x : bx + w * 0.075, tipY = rodTip ? rodTip.y : by - h * 0.185;
    if (rod) {
        const hx = rodFrom ? rodFrom.x : w * 0.685, hy = rodFrom ? rodFrom.y : h * 0.615;
        ctx.strokeStyle = P.wood[0]; ctx.lineWidth = Math.max(1.4, h * 0.0055);
        ctx.beginPath(); ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo((hx + tipX) / 2 - w * 0.008, (hy + tipY) / 2 - h * 0.03, tipX, tipY);
        ctx.stroke();
    }
    if (line) {
        ctx.strokeStyle = 'rgba(244,246,240,0.72)'; ctx.lineWidth = Math.max(1, h * 0.0032);
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
    ctx.beginPath(); ctx.ellipse(bx, wlY, bs * (1.5 + 0.22 * Math.sin(t * Math.PI * 2)), bs * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return { bx, byy, wlY, bs };
}

// ── layout: horizon, dock geometry ─────────────────────────────────────────
const HORIZON = 0.24;
const DOCK_X0 = 0.545;                                    // dock's left edge at frame bottom
function dockEdgeY(w, h, x) {                             // water-facing edge line
    const f = Math.max(0, Math.min(1, (x - w * DOCK_X0) / (w * (1 - DOCK_X0))));
    return h * (0.715 - f * 0.105);
}

// ── day palettes (the master is painted in `isle`; other biomes are washes) ─
const PALETTES = {
    isle: {
        sky: ['#a8d4e4', '#cde8dc', '#eee6c2'],
        ridge: '#2e6e5c', water: ['#16444a', '#1a5560', '#20666e', '#2a7878', '#358a7e', '#449c82'],
        glint: '#d8f0e2', shimmer: ['#9fd8c8', '#c8ecdc'], fish: ['#0c3236', '#0a282c'],
        wood: ['#8a6a40', '#755732', '#5c4326'], rope: '#c9b088', lantern: '#f2d896',
    },
};
PALETTES.desert = { ...PALETTES.isle };
PALETTES.tundra = { ...PALETTES.isle };
PALETTES.highlands = { ...PALETTES.isle };
PALETTES.volcanic = { ...PALETTES.isle };

// Biome washes over the committed day master (sky band, water band, all-over).
// Strong enough that each realm reads differently at a glance.
const WASHERS = {
    isle: null,
    desert: { sky: 'rgba(238,208,128,0.42)', water: 'rgba(58,150,104,0.30)', all: 'rgba(206,174,102,0.10)' },
    tundra: { sky: 'rgba(186,214,236,0.44)', water: 'rgba(28,78,124,0.34)', all: 'rgba(150,185,208,0.10)' },
    highlands: { sky: 'rgba(232,200,118,0.40)', water: 'rgba(34,114,84,0.28)', all: 'rgba(190,160,90,0.10)' },
    volcanic: { sky: 'rgba(88,68,62,0.46)', water: 'rgba(28,30,38,0.44)', all: 'rgba(70,40,32,0.20)' },
};

// ── THE GIRL — seated on the dock edge, rod in her hands, flat-shaded ──────
// Anchor (gx, gy) = where she sits on the edge. Faces left (over the water).
function paintGirl(ctx, w, h, t, P) {
    const u = h / 360;
    const gx = w * 0.745, gy = dockEdgeY(w, h, w * 0.745) - 2 * u;
    const breathe = Math.sin(t * Math.PI * 2) * 1.3 * u;          // idle breathing
    const sway = Math.sin(t * Math.PI * 2 + 0.9) * 1.6 * u;       // ponytail sway
    const kick = Math.sin(t * Math.PI * 2 + 2.1) * 1.4 * u;       // dangling boots
    const y = (dy) => gy + dy + breathe;                          // local y helper
    const skin = '#e8b48c', skinD = '#cf9873';
    const hair = '#5a3820', hairHi = '#6e4628';
    const dress = '#3e7c78', dressD = '#2e5e5c';
    const straw = '#d8b86a', strawD = '#b8974c', band = '#b05a48';
    const boot = '#5c4430';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // dangling legs (far leg slightly behind, both kick gently out of phase)
    ctx.strokeStyle = skinD; ctx.lineWidth = 4.4 * u;
    ctx.beginPath(); ctx.moveTo(gx - 2 * u, y(-8 * u)); ctx.quadraticCurveTo(gx - 12 * u, y(-2 * u), gx - 13 * u, y(12 * u + kick)); ctx.stroke();
    ctx.fillStyle = boot; ctx.beginPath();
    ctx.ellipse(gx - 14 * u, y(14 * u + kick), 4.4 * u, 3 * u, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = 4.6 * u;
    ctx.beginPath(); ctx.moveTo(gx - 5 * u, y(-7 * u)); ctx.quadraticCurveTo(gx - 15 * u, y(-1 * u), gx - 17 * u, y(11 * u - kick)); ctx.stroke();
    ctx.fillStyle = boot; ctx.beginPath();
    ctx.ellipse(gx - 18 * u, y(13 * u - kick), 4.6 * u, 3.1 * u, 0.5, 0, Math.PI * 2); ctx.fill();

    // dress skirt spilling over the edge + torso
    ctx.fillStyle = dressD; ctx.beginPath();
    ctx.moveTo(gx + 9 * u, y(-6 * u)); ctx.quadraticCurveTo(gx + 2 * u, y(8 * u), gx - 8 * u, y(9 * u));
    ctx.quadraticCurveTo(gx + 1 * u, y(2 * u), gx - 3 * u, y(-6 * u)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dress; ctx.beginPath();
    ctx.moveTo(gx + 7 * u, y(-30 * u));                                   // torso
    ctx.quadraticCurveTo(gx + 9 * u, y(-16 * u), gx + 8 * u, y(-5 * u));
    ctx.lineTo(gx - 5 * u, y(-5 * u));
    ctx.quadraticCurveTo(gx - 7 * u, y(-18 * u), gx - 5 * u, y(-30 * u));
    ctx.closePath(); ctx.fill();
    // rolled sleeves
    ctx.fillStyle = dressD; ctx.beginPath();
    ctx.ellipse(gx - 4 * u, y(-26 * u), 3.4 * u, 2.6 * u, -0.5, 0, Math.PI * 2); ctx.fill();

    // arms reaching forward-down to the rod grip
    ctx.strokeStyle = skin; ctx.lineWidth = 3.6 * u;
    ctx.beginPath(); ctx.moveTo(gx - 3 * u, y(-27 * u)); ctx.quadraticCurveTo(gx - 10 * u, y(-25 * u), gx - 15 * u, y(-21 * u)); ctx.stroke();
    ctx.strokeStyle = skinD; ctx.lineWidth = 3.4 * u;
    ctx.beginPath(); ctx.moveTo(gx - 2 * u, y(-24 * u)); ctx.quadraticCurveTo(gx - 9 * u, y(-21 * u), gx - 14 * u, y(-18 * u)); ctx.stroke();

    // head + face
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(gx - 8 * u, y(-38 * u), 6.4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241a10'; ctx.beginPath(); ctx.arc(gx - 11.4 * u, y(-39 * u), 0.9 * u, 0, Math.PI * 2); ctx.fill(); // eye
    ctx.strokeStyle = skinD; ctx.lineWidth = 1.1 * u;
    ctx.beginPath(); ctx.arc(gx - 11 * u, y(-36.4 * u), 1.6 * u, 0.15, 1.35); ctx.stroke();                              // smile

    // hair: crown + long ponytail behind, swaying
    ctx.fillStyle = hair; ctx.beginPath();
    ctx.arc(gx - 8 * u, y(-40 * u), 6.8 * u, Math.PI * 0.86, Math.PI * 2.05); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(gx - 3 * u, y(-42 * u));
    ctx.quadraticCurveTo(gx + 5 * u + sway, y(-38 * u), gx + 6 * u + sway, y(-24 * u));
    ctx.quadraticCurveTo(gx + 2 * u + sway * 0.5, y(-26 * u), gx - 1 * u, y(-35 * u));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hairHi; ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(gx + 2 * u + sway * 0.6, y(-36 * u)); ctx.quadraticCurveTo(gx + 5 * u + sway, y(-31 * u), gx + 5 * u + sway, y(-26 * u)); ctx.stroke();

    // straw hat with a red band (the angler's signature)
    ctx.fillStyle = strawD; ctx.beginPath();
    ctx.ellipse(gx - 8 * u, y(-44.5 * u), 10.5 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = straw; ctx.beginPath();
    ctx.ellipse(gx - 8 * u, y(-46.5 * u), 6.8 * u, 4.2 * u, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = band; ctx.fillRect(gx - 14.6 * u, y(-47.6 * u), 13.2 * u, 2.2 * u);
    ctx.restore();
    return { gx, gy: y(-30 * u), hands: { x: gx - 15 * u, y: y(-20 * u) } };
}

// ── dock, sign, bucket, lantern ─────────────────────────────────────────────
function paintDock(ctx, w, h, t, P, { lvl = 1 } = {}) {
    const u = h / 360;
    const x0 = w * DOCK_X0;
    // deck surface
    ctx.fillStyle = P.wood[1];
    ctx.beginPath(); ctx.moveTo(x0, h); ctx.lineTo(x0, dockEdgeY(w, h, x0));
    ctx.lineTo(w, dockEdgeY(w, h, w)); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // board rows: lines parallel to the water-facing edge = the planks
    ctx.strokeStyle = P.wood[2]; ctx.lineWidth = Math.max(1.2, h * 0.005);
    for (const off of [0.10, 0.23, 0.38, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(x0 + w * off * 0.35, h);
        ctx.lineTo(x0 + w * off, dockEdgeY(w, h, x0 + w * off) + h * 0.016 + (h - dockEdgeY(w, h, x0 + w * off)) * off * 0.18);
        ctx.stroke();
    }
    // edge board highlight + the front face dropping to the water
    ctx.strokeStyle = P.wood[0]; ctx.lineWidth = Math.max(2.4, h * 0.011);
    ctx.beginPath(); ctx.moveTo(x0, dockEdgeY(w, h, x0)); ctx.lineTo(w, dockEdgeY(w, h, w)); ctx.stroke();
    ctx.fillStyle = P.wood[2];
    ctx.beginPath(); ctx.moveTo(x0, dockEdgeY(w, h, x0)); ctx.lineTo(w, dockEdgeY(w, h, w));
    ctx.lineTo(w, dockEdgeY(w, h, w) + h * 0.035); ctx.lineTo(x0, dockEdgeY(w, h, x0) + h * 0.05); ctx.closePath(); ctx.fill();
    if (lvl >= 3) {   // kept well-funded pond: gold trim on the edge board
        ctx.save(); ctx.strokeStyle = '#e2b84a'; ctx.lineWidth = Math.max(1.4, h * 0.005); ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x0, dockEdgeY(w, h, x0) + 1); ctx.lineTo(w, dockEdgeY(w, h, w) + 1); ctx.stroke(); ctx.restore();
    }

    // mooring post at the left corner with a coiled rope on top (no long sweep
    // across the water — it read as a second fishing line)
    const postX = x0 + w * 0.012, postTop = dockEdgeY(w, h, x0) - h * 0.075;
    ctx.fillStyle = P.wood[0]; ctx.fillRect(postX, postTop, w * 0.024, h * 0.075 + h * 0.03);
    ctx.fillStyle = P.wood[2]; ctx.fillRect(postX, postTop, w * 0.008, h * 0.075 + h * 0.03);
    ctx.strokeStyle = P.rope; ctx.lineWidth = Math.max(1.2, h * 0.005);
    ctx.beginPath(); ctx.ellipse(postX + w * 0.012, postTop - h * 0.004, w * 0.014, h * 0.006, 0, 0, Math.PI * 2); ctx.stroke();

    // ── the sign: "THE POND" on a post at the dock corner (the overlay that
    // explains the place, diegetic — baked into the master) ──
    const sgx = x0 + w * 0.075, sgy = dockEdgeY(w, h, sgx);
    ctx.fillStyle = P.wood[0]; ctx.fillRect(sgx - w * 0.004, sgy - h * 0.115, w * 0.009, h * 0.115);
    const bw = w * 0.128, bh = h * 0.062, bx = sgx - bw * 0.5, by = sgy - h * 0.175;
    ctx.fillStyle = '#e8d9ae'; ctx.strokeStyle = P.wood[2]; ctx.lineWidth = Math.max(1.4, h * 0.006);
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,64,32,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(bx + 2.5 * u, by + 2.5 * u, bw - 5 * u, bh - 5 * u); ctx.stroke();
    ctx.fillStyle = '#4a3418';
    ctx.font = `bold ${Math.max(8, Math.round(h * 0.031))}px "Cinzel", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('THE POND', sgx, by + bh * 0.56);

    // bucket (her keep-box) on the deck, right of the sign
    const bck = w * 0.885, bcy = dockEdgeY(w, h, bck) + h * 0.055;
    ctx.fillStyle = P.wood[2]; ctx.beginPath();
    ctx.moveTo(bck - w * 0.024, bcy - h * 0.052); ctx.lineTo(bck + w * 0.024, bcy - h * 0.052);
    ctx.lineTo(bck + w * 0.019, bcy); ctx.lineTo(bck - w * 0.019, bcy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.wood[0]; ctx.fillRect(bck - w * 0.024, bcy - h * 0.052, w * 0.048, h * 0.012);
    ctx.strokeStyle = P.rope; ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.beginPath(); ctx.arc(bck, bcy - h * 0.05, w * 0.02, Math.PI, 0); ctx.stroke();

    // lantern post at the right edge — the pond's night light
    const lpx = w * 0.965, lpy = dockEdgeY(w, h, lpx);
    ctx.fillStyle = P.wood[0]; ctx.fillRect(lpx - w * 0.004, lpy - h * 0.21, w * 0.008, h * 0.21);
    ctx.fillRect(lpx - w * 0.004, lpy - h * 0.21, w * 0.034, h * 0.008);
    const lx = lpx + w * 0.026, ly = lpy - h * 0.185;
    ctx.strokeStyle = P.wood[2]; ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.beginPath(); ctx.moveTo(lx, lpy - h * 0.202); ctx.lineTo(lx, ly + h * 0.03); ctx.stroke();
    ctx.fillStyle = P.lantern; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx - w * 0.011, ly, w * 0.022, h * 0.032, 2) : ctx.rect(lx - w * 0.011, ly, w * 0.022, h * 0.032); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.wood[2]; ctx.stroke();
    return { lantern: { x: lx, y: ly + h * 0.016 }, sign: { x: sgx, y: by + bh / 2 } };
}

// ── one master frame (day-lit true colour; NO sun — compose adds the hour) ─
function paintFrame(ctx, w, h, t, { lvl = 1 } = {}) {
    const P = PALETTES.isle;
    const rng = K.mulberry32(hashStr(`pondgirl:${ASSET_VER}:${lvl}`));
    const hz = Math.round(HORIZON * h);
    const wh = h - hz;

    // sky: three flat bands + drifting clouds
    ctx.fillStyle = P.sky[0]; ctx.fillRect(0, 0, w, Math.round(hz * 0.45));
    ctx.fillStyle = P.sky[1]; ctx.fillRect(0, Math.round(hz * 0.45), w, Math.round(hz * 0.3));
    ctx.fillStyle = P.sky[2]; ctx.fillRect(0, Math.round(hz * 0.75), w, hz - Math.round(hz * 0.75));
    for (let i = 0; i < 3; i++) {
        const cy = hz * (0.18 + rng() * 0.4), cw2 = w * (0.08 + rng() * 0.06), sp = 0.01 + rng() * 0.012;
        const cx = (((rng() + t * sp) % 1.25) - 0.125) * w;
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(cx, cy, cw2, h * 0.014, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + cw2 * 0.5, cy - h * 0.008, cw2 * 0.55, h * 0.011, 0, 0, Math.PI * 2); ctx.fill();
    }

    // far shoreline ridge
    ctx.fillStyle = P.ridge;
    ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= w; x += w / 26) ctx.lineTo(x, hz - (2 + Math.floor(rng() * 4)) * (h / 360) * (rng() < 0.3 ? 2.6 : 1));
    ctx.lineTo(w, hz + 1); ctx.lineTo(0, hz + 1); ctx.closePath(); ctx.fill();

    // water: flat perspective bands, far (thin, dark) → near (tall, light)
    let y = hz; const steps = P.water.length;
    let span = wh * 0.02;
    for (let i = 0; i < steps; i++) {
        const y2 = i === steps - 1 ? h : Math.min(h, y + span);
        ctx.fillStyle = P.water[i]; ctx.fillRect(0, y, w, y2 - y + 1);
        y = y2 + 1; span *= 1.5;
    }
    // ambient sparkles
    for (let i = 0; i < 11; i++) {
        const ph = (t * 0.7 + rng() * 3) % 1;
        const gx = rng() * w, gy = hz + wh * (0.08 + 0.86 * ((rng() + ph) % 1));
        ctx.fillStyle = P.glint; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(ph * Math.PI);
        ctx.fillRect(gx, gy, w * 0.011 + 2, Math.max(1, h * 0.004)); ctx.globalAlpha = 1;
    }

    // fish silhouettes beneath the surface
    const nf = 4 + Math.max(0, lvl - 1);
    for (let i = 0; i < nf; i++) {
        const depth = 0.2 + 0.62 * rng();
        const fy = hz + wh * depth;
        const fs = (h * 0.02) * (0.55 + depth);
        const speed = 0.014 + rng() * 0.028;
        const fx = ((rng() + t * speed * (rng() < 0.5 ? -1 : 1)) % 1 + 1) % 1 * w;
        const wig = Math.sin(t * Math.PI * 4 + i * 1.7);
        const yy = fy + Math.sin(t * Math.PI * 2 + i) * fs * 0.5;
        ctx.fillStyle = P.fish[depth > 0.55 ? 0 : 1];
        ctx.save(); ctx.translate(fx, yy);
        ctx.beginPath(); ctx.ellipse(0, 0, fs * 1.15, fs * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-fs * 1.05, 0);
        ctx.lineTo(-fs * 1.6, (-0.3 + wig * 0.22) * fs); ctx.lineTo(-fs * 1.6, (0.3 + wig * 0.22) * fs);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    // L2+ rowboat moored on the left reach
    if (lvl >= 2) {
        const by2 = hz + wh * 0.30, bx2 = w * 0.14;
        const bob = Math.sin(t * Math.PI * 2) * h * 0.004;
        ctx.fillStyle = P.wood[2];
        ctx.save(); ctx.translate(bx2, by2 + bob);
        ctx.beginPath(); ctx.moveTo(-w * 0.05, 0);
        ctx.quadraticCurveTo(-w * 0.028, h * 0.02, 0, h * 0.022);
        ctx.quadraticCurveTo(w * 0.028, h * 0.02, w * 0.05, 0);
        ctx.lineTo(w * 0.043, -h * 0.011); ctx.lineTo(-w * 0.043, -h * 0.011); ctx.closePath(); ctx.fill();
        ctx.fillStyle = P.wood[1]; ctx.fillRect(-w * 0.046, -h * 0.014, w * 0.092, h * 0.004);
        ctx.strokeStyle = P.rope; ctx.lineWidth = Math.max(1, h * 0.003);
        ctx.beginPath(); ctx.moveTo(bx2 + w * 0.05, by2 + bob); ctx.lineTo(w * 0.015, by2 + h * 0.03); ctx.stroke();
        ctx.restore();
    }

    // dock + props + girl + rod + float
    const props = paintDock(ctx, w, h, t, P, { lvl });
    const girl = paintGirl(ctx, w, h, t, P);
    paintFloat(ctx, w, h, t, P, { rod: true, line: true, rodFrom: girl.hands, rodTip: { x: w * 0.525, y: h * 0.465 } });
    return { ...props, girl };
}

// ── catch overlays ("the new stuff" over the kept master, rarity-safe) ─────
function paintCatchOverlay(ctx, w, h, t, band, P = PALETTES.isle) {
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
        const fx = bx + w * (1 - ap) * 0.38, fy = byy - h * 0.01 + Math.sin(t * 9) * h * 0.004;
        const fs = h * 0.032 * (0.6 + 0.4 * ap);
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
        const fx = bx - w * (1 - ap) * 0.44, fy = byy + h * 0.012 + Math.sin(t * 7) * h * 0.005;
        const fs = h * 0.055 * (0.55 + 0.45 * ap);
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
    // the line + float ride ON TOP of the overlay (rod tip fixed, float pulled under)
    const girl = paintGirl(ctx, w, h, t, P);   // cheap re-draw keeps her arms over the line
    paintFloat(ctx, w, h, t, P, { rod: false, line: true, dip, rodFrom: girl.hands, rodTip: { x: w * 0.525, y: h * 0.465 } });
}

// ── hour dressing: celestial body + sun/moon glitter on the water ──────────
function paintCelestial(ctx, w, h, t, phase, { glitter = true } = {}) {
    const hz = Math.round(HORIZON * h);
    if (phase === 'night') return;                    // moonStars() owns the night sky
    const conf = {
        dawn: { x: 0.18, y: 0.145, r: 0.05, col: '#ffd9a8', glow: 'rgba(255,190,130,0.35)' },
        day: { x: 0.22, y: 0.085, r: 0.042, col: '#f8f2d8', glow: 'rgba(255,246,210,0.28)' },
        golden: { x: 0.80, y: 0.155, r: 0.055, col: '#ffc478', glow: 'rgba(255,160,80,0.4)' },
        dusk: { x: 0.80, y: 0.20, r: 0.06, col: '#ff9a5a', glow: 'rgba(255,120,60,0.42)' },
    }[phase];
    if (!conf) return;
    const sx = w * conf.x, sy = h * conf.y, sr = h * conf.r;
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 3);
    g.addColorStop(0, conf.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = conf.col; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // glitter path down the sun column (reflecting water scenes only)
    if (glitter && (phase === 'dawn' || phase === 'day' || phase === 'golden' || phase === 'dusk')) {
        const rng = K.mulberry32(hashStr(`glitter:${phase}`));
        const wh = h - hz;
        for (let i = 0; i < 13; i++) {
            const ph = (t + rng()) % 1;
            const gy = hz + wh * (0.05 + 0.8 * ph);
            const gw2 = w * 0.018 + (gy - hz) / wh * w * 0.04;
            const gx = sx - gw2 / 2 + Math.sin(ph * 9 + i) * gw2 * 0.3;
            if (gx > w * DOCK_X0 && gy > dockEdgeY(w, h, gx)) continue;   // no glitter on the dock
            ctx.globalAlpha = phase === 'dusk' ? 0.5 : 0.72;
            ctx.fillStyle = phase === 'dusk' ? '#ffb27a' : PALETTES.isle.shimmer[i % 2];
            ctx.fillRect(gx, gy, gw2, Math.max(1, h * 0.005));
        }
        ctx.globalAlpha = 1;
    }
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
    const p = path.join(ASSET_DIR, `pond_girl_l${Math.max(1, Math.min(3, lvl))}_${ASSET_VER}.bin`);
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
    const ck = `pondgirl:L${lvl}`;
    if (_imgCache.has(ck)) return _imgCache.get(ck);
    const { buf, committed } = loadCommitted(lvl);
    const c = unpackContainer(buf);
    if (!c || c.pngs.length !== FRAMES) throw new Error('pond master unreadable');
    c.imgs = decodePngs(c.pngs);
    c.committed = committed;
    _imgCache.set(ck, c);
    return c;
}

/** `.j base pond` viewer still — the girl scene at any size, wearing the hour. */
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
    paintCelestial(ctx, w, h, t, phase);
    dayNight.grade(ctx, w, h, phase);
    if (phase === 'night' || phase === 'dusk') {
        const { lantern } = paintDockAnchors(w, h, lvl);
        dayNight.light(ctx, lantern.x, lantern.y, h * 0.14, '#ffcf7a', phase === 'night' ? 0.5 : 0.3);
        if (phase === 'night') {
            dayNight.moonStars(ctx, w, h, { seed: 17, moonX: 0.18, moonY: 0.09, stars: Math.round(20 * w / GW), starAlpha: 0.85, skyH: HORIZON * 0.92 });
            const gx = dockEdgeY(w, h, w * 0.745);
            dayNight.light(ctx, w * 0.72, gx + h * 0.02, h * 0.1, '#ffc98a', 0.14, false);
            dayNight.light(ctx, w * 0.18, h * 0.52, h * 0.15, '#cfe0ff', 0.15, false);   // moon glint on the water
        }
    }
}

function paintDockAnchors(w, h, lvl) {
    const x0 = w * DOCK_X0;
    const lpx = w * 0.965, lpy = dockEdgeY(w, h, lpx);
    return { lantern: { x: lpx + w * 0.026, y: lpy - h * 0.169 }, sign: { x: x0 + w * 0.075, y: 0 } };
}

// ── compose: master + biome wash + hour + lights + catch overlay ───────────
// Cached per (biome, level, phase, band) — the plate (loot text) is drawn per
// catch AFTER this, so the cache stays tiny while every catch still explains
// itself on the image.
async function composePond({ biome = 'isle', lvl = 1, phase = null, band = 'low' } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const key = `pgc1:${biome}:L${lvl}:${phase}:${band}`;
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
            paintCelestial(c2, master.gw, master.gh, i / FRAMES, phase);
            dayNight.grade(c2, master.gw, master.gh, phase);
            if (phase === 'night' || phase === 'dusk') {
                const { lantern } = paintDockAnchors(master.gw, master.gh, lvl);
                dayNight.light(c2, lantern.x, lantern.y, master.gh * 0.15, '#ffcf7a', phase === 'night' ? 0.55 : 0.32);
                if (phase === 'night') {   // moon over the pond + glint + warm pool on the deck
                    dayNight.moonStars(c2, master.gw, master.gh, { seed: 17, moonX: 0.18, moonY: 0.09, stars: 20, starAlpha: 0.85, skyH: HORIZON * 0.92 });
                    dayNight.light(c2, master.gw * 0.18, master.gh * 0.52, master.gh * 0.16, '#cfe0ff', 0.16, false);
                    dayNight.light(c2, master.gw * 0.72, master.gh * 0.74, master.gh * 0.1, '#ffc98a', 0.15, false);
                }
            }
            paintCatchOverlay(c2, master.gw, master.gh, i / FRAMES, band);
            pngs.push(cv.toBuffer('image/png'));
        }
        return { buffer: packContainer(master.gw, master.gh, master.delayMs, pngs), contentType: 'application/x-pondcompose' };
    });
}

// ── the RESULT PLATE — "explains this is the pond and shows what you caught" ─
const RARITY_COL = { COMMON: '#e8e8e0', UNCOMMON: '#8ee08e', RARE: '#7ab8f0', EPIC: '#c9a0ff', LEGENDARY: '#f0c060' };
function drawResultPlate(ctx, w, h, { title, lines = [] }) {
    const u = h / 360;
    const shown = lines.slice(0, 3);
    const titleW = 7.4 * u * String(title || '').length;
    const pw = Math.min(w * 0.62, Math.max(130 * u, titleW, ...shown.map((l) => 6.4 * u * l.text.length)) + 20 * u);
    const ph = 26 * u + shown.length * 20 * u;
    const x = 10 * u, y = h - ph - 10 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(20,16,10,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, 8 * u); else ctx.rect(x, y, pw, ph);
    ctx.fill();
    ctx.strokeStyle = 'rgba(201,166,90,0.85)'; ctx.lineWidth = Math.max(1.2, 1.6 * u); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(13 * u)}px "Cinzel", "Cinzel Deco", sans-serif`;
    ctx.fillStyle = '#f2dfa8';
    ctx.fillText(String(title || '').toUpperCase().slice(0, 22), x + 10 * u, y + 13 * u);
    shown.forEach((l, i) => {
        ctx.font = `bold ${Math.round(12.5 * u)}px "DejaVu Sans", sans-serif`;
        ctx.fillStyle = l.color || '#f0ead8';
        ctx.fillText(String(l.text).slice(0, 40), x + 10 * u, y + 30 * u + i * 20 * u);
    });
    ctx.restore();
}

function plateLines(kind = 'fish', drops = {}) {
    const NAMES = {
        fish: { raw_fish: ['Pond Minnow', 'COMMON', 40], river_trout: ['River Trout', 'UNCOMMON', 140], silver_carp: ['Silver Carp', 'RARE', 480], crystal_koi: ['Crystal Koi', 'EPIC', 1800] },
        hunt: { rabbit_pelt: ['Rabbit Pelt', 'COMMON', 50], venison: ['Venison Haunch', 'UNCOMMON', 160], boar_tusk: ['Boar Tusk', 'RARE', 520], stag_antler: ['Stag Antler', 'EPIC', 2000] },
    }[kind] || {};
    return Object.entries(drops || {})
        .sort((a, b) => (NAMES[b[0]] ? NAMES[b[0]][2] * b[1] : 0) - (NAMES[a[0]] ? NAMES[a[0]][2] * a[1] : 0))
        .slice(0, 3)
        .map(([id, q]) => {
            const n = NAMES[id] || [id, 'COMMON', 0];
            return { text: `${q}× ${n[0]}`, color: RARITY_COL[n[1]] || '#f0ead8' };
        });
}

// ── `.j fish` — the catch GIF: kept master + hour + THIS catch's overlay +
// the pond/catch plate. Final GIF cached per (biome, lvl, phase, band, loot). ─
async function renderFishingGif({ biome = 'isle', lvl = 1, band = 'low', drops = {}, phase = null } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const lines = plateLines('fish', drops);
    const plateKey = hashStr(JSON.stringify(lines));
    const key = `pg2:${biome}:L${lvl}:${phase}:${band}:${plateKey}`;
    return mediaCache.cached('fishgif', key, async () => {
        const { createCanvas } = require('canvas');
        const { encodeGif } = require('../utils/gif89a');
        try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
        const comp = await composePond({ biome, lvl, phase, band });
        const c = unpackContainer(comp.buffer, 'PONDGIRL1');
        if (!c || c.pngs.length !== FRAMES) throw new Error('pond compose container unreadable');
        const imgs = decodePngs(c.pngs);
        const frames = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(c.gw, c.gh), c2 = cv.getContext('2d');
            c2.drawImage(imgs[i], 0, 0, c.gw, c.gh);
            drawResultPlate(c2, c.gw, c.gh, { title: 'The Pond', lines });
            const d = c2.getImageData(0, 0, c.gw, c.gh);
            frames.push(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength));
        }
        const gif = encodeGif({ width: c.gw, height: c.gh, frames, delayMs: c.delayMs, loop: 0 });
        if (!gif || gif.length < 500) throw new Error('pond gif encode failed');
        return { buffer: gif, contentType: 'image/gif' };
    });
}

function anchorFor(w, h) { const g = floatGeom(w, h); return { bx: g.bx, by: g.by }; }

module.exports = {
    renderFishingGif, getBaseFrames, composePond, paintStill, paintFrame, paintGirl, paintDock,
    paintCatchOverlay, paintFloat, floatGeom, floatBob, floatY, paintCelestial, drawResultPlate,
    plateLines, packContainer, unpackContainer, anchorFor, bakeLevelFrames, loadCommitted,
    PALETTES, WASHERS, RARITY_COL, GW, GH, FRAMES, DELAY_MS, CONTAINER_MAGIC, ASSET_VER, ASSET_DIR,
};
