'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  BAKE MINEPOV ASSETS — offline bake of the underground mining POV loops
//  (owner 2026-10-23: "let's make a mine card, one that takes place underground
//  with rocks and animations … have the assets saved on the repo, and have
//  them call for said assets and overlay like the fishing so that it's instant").
//
//  Everything ANIMATED is pre-baked HERE and committed to the repo — the
//  runtime lane (core/rpg/minePov.js) never canvas-bakes a scene; it only
//  plasters the loot ribbon (one ffmpeg pass), exactly like the fish lane.
//
//  Output (committed): core/rpgasset/minepov/<loc>_<band>.mp4  (H.264 faststart)
//                      core/rpgasset/minepov/<loc>_<band>.jpg  (poster/thumb)
//  Previews (NOT committed): scripts/minepov_previews/*.png
//
//  Scenes: 4 mining locations × 3 loot bands (low / mid / epic):
//    shimmering_caves  — pale cavern, crystal clusters, cool torchlight
//    deep_vein_shafts  — timbered dark shaft, lantern, gold veins
//    volcanic_hollow   — basalt + pulsing lava cracks + drifting embers
//    void_fissure      — violet rift tear, floating motes, star sparkle
//  Bands: low = quiet loop · mid = vein glints · epic = sparkle surge + glow
//
//  Run: node scripts/bake_minepov_assets.js [--only <loc>:<band>] [--no-previews]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { createCanvas } = require('canvas');

const REPO = path.join(__dirname, '..');
const OUT = path.join(REPO, 'core', 'rpgasset', 'minepov');
const PREVIEWS = path.join(__dirname, 'minepov_previews');

const GW = 480, GH = 360, FRAMES = 36, DELAY_MS = 60; // same geometry as the fish lane

// ── seeded rng ──
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── palettes ────────────────────────────────────────────────────────────────
const LOCS = {
    shimmering_caves: {
        name: 'Shimmering Caves',
        bgTop: '#3d4354', bgBot: '#232734', wall: '#4c5468', wallDark: '#333a4a',
        wallLight: '#6a7590', floor: '#2c3140', dust: '#aebadb',
        torch: '#ffc069', rim: '#8fa2c9',
    },
    deep_vein_shafts: {
        name: 'Deep Vein Shafts',
        bgTop: '#2e2720', bgBot: '#191410', wall: '#3d3428', wallDark: '#28211a',
        wallLight: '#57492f', floor: '#221c15', dust: '#c9b58a',
        torch: '#ffbe5c', rim: '#a98d55',
    },
    volcanic_hollow: {
        name: 'Volcanic Hollow',
        bgTop: '#332326', bgBot: '#1a1013', wall: '#452e30', wallDark: '#2b1c1f',
        wallLight: '#5f3b3a', floor: '#241618', dust: '#e8a26a',
        torch: '#ff9445', rim: '#c96a3a',
    },
    void_fissure: {
        name: 'Void Fissure',
        bgTop: '#292138', bgBot: '#120e1e', wall: '#352a4a', wallDark: '#221a33',
        wallLight: '#4d3d6e', floor: '#1a1428', dust: '#c3aef0',
        torch: '#b98cff', rim: '#8a6fd0',
    },
};
const BANDS = ['low', 'mid', 'epic'];

// ── paint helpers ───────────────────────────────────────────────────────────
function vgrad(ctx, x0, y0, x1, y1, c0, c1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, GW, GH);
}

/** irregular rock blob around (x,y) with seeded jitter */
function rockBlob(ctx, x, y, rx, ry, fill, rng, jag = 0.22) {
    const pts = [];
    const n = 9 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const jr = 1 - jag / 2 + rng() * jag;
        pts.push([x + Math.cos(a) * rx * jr, y + Math.sin(a) * ry * jr]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    return pts;
}

function rockShade(ctx, x, y, rx, ry, dark) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(x, y + ry * 0.35, rx * 0.92, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.restore();
}

function rockLight(ctx, x, y, rx, ry, light) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.beginPath(); ctx.ellipse(x - rx * 0.26, y - ry * 0.44, rx * 0.38, ry * 0.2, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.restore();
}

function glow(ctx, x, y, r, col, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

/** 4-point star sparkle */
function sparkle(ctx, x, y, s, alpha, col = '#ffffff') {
    if (alpha <= 0.02) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s * 0.16, y - s * 0.16, x + s, y);
    ctx.quadraticCurveTo(x + s * 0.16, y + s * 0.16, x, y + s);
    ctx.quadraticCurveTo(x - s * 0.16, y + s * 0.16, x - s, y);
    ctx.quadraticCurveTo(x - s * 0.16, y - s * 0.16, x, y - s);
    ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

/** stalactite fringe along the ceiling */
function ceiling(ctx, P, rng) {
    const n = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
        const x = 10 + (i / n) * (GW - 20) + rng() * 18;
        const w = 14 + rng() * 26, h = 26 + rng() * 66;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, 0); ctx.lineTo(x + w / 2, 0); ctx.lineTo(x, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, 0, x, h);
        g.addColorStop(0, P.wallDark); g.addColorStop(1, P.bgBot);
        ctx.fillStyle = g; ctx.fill();
    }
}

/** scree / rubble strip on the floor */
function floorRubble(ctx, P, rng) {
    ctx.fillStyle = P.floor; ctx.fillRect(0, GH - 46, GW, 46);
    for (let i = 0; i < 22; i++) {
        const x = rng() * GW, y = GH - 40 + rng() * 34;
        const r = 3 + rng() * 9;
        rockBlob(ctx, x, y, r, r * 0.62, rng() < 0.5 ? P.wallDark : P.wall, rng, 0.35);
    }
}

/** timber pit props (deep_vein) */
function timbers(ctx, P, rng) {
    ctx.save();
    const post = (x) => {
        ctx.fillStyle = '#4a3a26'; ctx.fillRect(x, 44, 20, GH - 88);
        ctx.fillStyle = '#5d4a30'; ctx.fillRect(x + 3, 44, 6, GH - 88);
        for (let y = 60; y < GH - 60; y += 26) { ctx.fillStyle = '#3a2d1d'; ctx.fillRect(x, y, 20, 3); }
    };
    post(46); post(GW - 66);
    ctx.fillStyle = '#55422b'; ctx.fillRect(38, 40, GW - 76, 20);
    ctx.fillStyle = '#6b5538'; ctx.fillRect(38, 40, GW - 76, 6);
    ctx.restore();
}

/** crystal clusters (shimmering) — returns glint anchor points */
function crystals(ctx, P, rng, t) {
    const anchors = [];
    const cluster = (cx, cy, s, hue) => {
        const shards = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < shards; i++) {
            const dx = (rng() - 0.5) * s * 1.6, h = s * (0.7 + rng() * 0.9), w = s * (0.22 + rng() * 0.2);
            const bx = cx + dx, by = cy;
            ctx.beginPath();
            ctx.moveTo(bx - w, by); ctx.lineTo(bx + w, by); ctx.lineTo(bx + dx * 0.25, by - h);
            ctx.closePath();
            const g = ctx.createLinearGradient(bx, by, bx, by - h);
            g.addColorStop(0, hue.dark); g.addColorStop(0.55, hue.mid); g.addColorStop(1, hue.hi);
            ctx.fillStyle = g; ctx.fill();
        }
        anchors.push([cx, cy - s * 0.8, s]);
    };
    cluster(296, 244, 24, { dark: '#1f5f78', mid: '#57c4e8', hi: '#eafcff' }); // ON the face — primary glint anchor
    cluster(352, 180, 18, { dark: '#1a4a60', mid: '#49aecf', hi: '#c2eeff' });
    cluster(96, 236, 22, { dark: '#1f5f78', mid: '#57c4e8', hi: '#d8f7ff' });
    cluster(146, 254, 14, { dark: '#1a4a60', mid: '#49aecf', hi: '#c2eeff' });
    // ambient crystal shimmer on the clusters
    for (let i = 0; i < anchors.length; i++) {
        const [ax, ay, as] = anchors[i];
        const a = 0.35 + 0.3 * Math.sin(t * Math.PI * 2 + i * 1.7);
        sparkle(ctx, ax + (rng() - 0.5) * 6, ay - as * 0.4, as * 0.34, a * 0.8, '#eafcff');
    }
    return anchors;
}

/** gold vein (deep_vein) — jagged streak hugging the rock face, glint anchors */
function goldVein(ctx, rng, t) {
    const anchors = [];
    // vein hugs the face's left edge (face ≈ x 250..430, y 150..330)
    const path = [[294, 158], [318, 208], [300, 252], [326, 300], [312, 336]];
    const paint = (pts, w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
            ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        ctx.stroke();
    };
    const jag = path.map(([x, y]) => [x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 8]);
    paint(jag, 7, '#4a3a14');
    paint(jag, 4.5, '#b8862c');
    paint(jag, 2, '#ffd95e');
    for (let i = 0; i < 7; i++) {
        const seg = jag[Math.floor(rng() * jag.length)];
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath(); ctx.arc(seg[0] + (rng() - 0.5) * 14, seg[1] + (rng() - 0.5) * 12, 1.4 + rng() * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    anchors.push([310, 224, 10]);
    anchors.push([322, 296, 8]);
    return anchors;
}

/** lava cracks (volcanic) — branching glowing polylines, pulse with t */
function lavaCracks(ctx, rng, t) {
    const pulse = 0.62 + 0.38 * Math.sin(t * Math.PI * 2);
    const crack = (x0, y0, segs, len, w) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#3a120c'; ctx.lineWidth = w + 3;
        let x = x0, y = y0; ctx.beginPath(); ctx.moveTo(x, y);
        const pts = [[x, y]];
        for (let i = 0; i < segs; i++) { x += (rng() - 0.35) * len; y += len * (0.5 + rng() * 0.7); pts.push([x, y]); ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.strokeStyle = '#ff4d12'; ctx.lineWidth = w; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.strokeStyle = '#ffb03a'; ctx.lineWidth = w * 0.45; ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.restore();
        return pts[Math.floor(pts.length / 2)];
    };
    const mid = crack(292, 196, 6, 24, 4);
    const mid2 = crack(250, 316, 5, 26, 3);
    const mid3 = crack(398, 296, 4, 20, 3);
    glow(ctx, mid[0], mid[1], 66, 'rgba(255,110,30,0.5)', 0.35 + pulse * 0.3);
    glow(ctx, mid2[0], mid2[1], 52, 'rgba(255,110,30,0.45)', 0.3 + pulse * 0.28);
    glow(ctx, mid3[0], mid3[1], 46, 'rgba(255,110,30,0.4)', 0.3 + pulse * 0.25);
    // rising embers
    for (let i = 0; i < 9; i++) {
        const ex = 60 + rng() * 360;
        const speed = 26 + rng() * 30;
        const ey = (GH - ((t * speed + rng() * GH * 2) % (GH + 40))) - 10;
        const ea = Math.max(0, 0.85 - Math.abs(ey - GH * 0.45) / (GH * 0.8));
        ctx.save(); ctx.globalAlpha = ea;
        ctx.fillStyle = rng() < 0.5 ? '#ffab3d' : '#ff6b1f';
        ctx.beginPath(); ctx.arc(ex, ey, 1.4 + rng() * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

/** void rift (void_fissure) — floating tear with inner stars, returns anchors */
function voidRift(ctx, rng, t) {
    const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
    const rx = 40, ry = 104, cx = 352, cy = 158;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.16 + 0.02 * Math.sin(t * Math.PI * 2));
    // outer tear
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) {
        const a = (i / 22) * Math.PI * 2 - Math.PI / 2;
        const jr = 1 - 0.16 + Math.sin(i * 2.7) * 0.14;
        const px = Math.cos(a) * rx * jr, py = Math.sin(a) * ry * jr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, ry);
    g.addColorStop(0, `rgba(240,225,255,${0.85 + pulse * 0.15})`);
    g.addColorStop(0.35, 'rgba(160,106,255,0.9)');
    g.addColorStop(0.75, 'rgba(74,40,140,0.85)');
    g.addColorStop(1, 'rgba(20,12,40,0.9)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(196,150,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    // stars inside the tear
    for (let i = 0; i < 7; i++) {
        const sx = (rng() - 0.5) * rx * 1.1, sy = (rng() - 0.5) * ry * 1.5;
        const sa = 0.3 + 0.6 * Math.abs(Math.sin(t * Math.PI * 2 + i * 1.3));
        ctx.save(); ctx.globalAlpha = sa; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, 1.1 + rng() * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    glow(ctx, cx, cy, 120, 'rgba(140,90,255,0.5)', 0.3 + pulse * 0.25);
    // floating motes
    for (let i = 0; i < 8; i++) {
        const mx2 = 260 + rng() * 170, my0 = 90 + rng() * 190;
        const drift = Math.sin(t * Math.PI * 2 + i * 2.1) * 9;
        ctx.save(); ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * Math.PI * 2 + i);
        ctx.fillStyle = '#cdb4ff';
        ctx.beginPath(); ctx.arc(mx2 + drift, my0 + drift * 0.6, 1.5 + rng() * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    return [[cx, cy, rx]];
}

/** wall torch with flicker — returns light pos */
function torch(ctx, P, x, y, t, seed) {
    const flick = 0.75 + 0.25 * Math.sin(t * Math.PI * 2 * 2 + seed * 3.1) * (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 7 + seed));
    // bracket
    ctx.save();
    ctx.strokeStyle = '#3a2d1d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y + 26); ctx.stroke();
    // flame
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(x - 4, y, 8, 16);
    const fg = ctx.createRadialGradient(x, y - 6, 1, x, y - 6, 16);
    fg.addColorStop(0, '#fff3c4'); fg.addColorStop(0.4, '#ffb640'); fg.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.globalAlpha = 0.9 * flick;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 6, 11 + 2 * flick, 0, 0, Math.PI * 2);
    ctx.fillStyle = fg; ctx.fill();
    ctx.restore();
    glow(ctx, x, y, 118, hexGlow(P.torch), 0.34 * flick);
    return [x, y, flick];
}

function hexGlow(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.55)`;
}

/** ⚙️ the STEAM-DRILL RIG (Task 25, owner: "instead of a person doing that make
 *  it a machine or something") — replaces the miner at the SAME working spot:
 *  crawler tracks, riveted boiler hull, lit cab, spinning flywheel, exhaust
 *  smoke, and a drill bit chewing the face with a steady chip stream. Animated
 *  on t (flywheel spin, bit spiral, hull vibration, puff cycle, chip arcs) —
 *  pre-seeded so the 36-frame loop closes perfectly.
 */
function machine(ctx, P, x, y, s, t, band, rng) {
    const TAU = Math.PI * 2;
    const vib = Math.sin(t * TAU * 6) * 0.9;            // hull vibration
    // ground shadow
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(x - 6 * s, y + 2 * s, 86 * s, 8 * s, 0, 0, TAU); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(x + vib, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // ── crawler tracks
    ctx.fillStyle = '#1d1d24';
    ctx.beginPath(); ctx.moveTo(-80 * s, -16 * s); ctx.lineTo(58 * s, -16 * s);
    ctx.arc(58 * s, -9 * s, 9 * s, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-80 * s, 0); ctx.arc(-80 * s, -9 * s, 9 * s, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a4a56';
    for (const wx of [-62, -30, 2, 36]) { ctx.beginPath(); ctx.arc(wx * s, -9 * s, 6.5 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#101016'; ctx.beginPath(); ctx.arc(wx * s, -9 * s, 2.6 * s, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a4a56'; }
    // ── riveted boiler hull (rust red, torch-warmed)
    ctx.fillStyle = '#8a4a2a'; ctx.strokeStyle = '#2b150a'; ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.moveTo(-70 * s, -24 * s); ctx.lineTo(56 * s, -24 * s); ctx.lineTo(50 * s, -92 * s); ctx.lineTo(-64 * s, -92 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(43,21,10,0.55)'; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(-67 * s, -56 * s); ctx.lineTo(53 * s, -56 * s); ctx.stroke();
    ctx.fillStyle = '#c98a4a';
    for (const [rx, ry] of [[-58, -84], [-58, -32], [44, -84], [44, -32], [-6, -32]]) { ctx.beginPath(); ctx.arc(rx * s, ry * s, 1.8 * s, 0, TAU); ctx.fill(); }
    // torch-side rim light on the hull's left edge
    ctx.strokeStyle = 'rgba(255,214,150,0.4)'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(-70 * s, -24 * s); ctx.lineTo(-64 * s, -92 * s); ctx.stroke();
    // ── cab with a lit window
    ctx.fillStyle = '#a85a32'; ctx.strokeStyle = '#2b150a'; ctx.lineWidth = 2.2 * s;
    ctx.fillRect(14 * s, -136 * s, 42 * s, 44 * s); ctx.strokeRect(14 * s, -136 * s, 42 * s, 44 * s);
    ctx.fillStyle = '#2b150a'; ctx.fillRect(19 * s, -130 * s, 30 * s, 24 * s);
    ctx.fillStyle = '#ffd98a'; ctx.fillRect(21 * s, -128 * s, 26 * s, 20 * s);
    // ── exhaust stack + smoke puffs (loop-closing cycle)
    ctx.fillStyle = '#3c3c46'; ctx.fillRect(-46 * s, -148 * s, 9 * s, 56 * s);
    for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3) % 1;
        const px = -41 * s + Math.sin(ph * 5 + i * 2.1) * 4 * s, py = -152 * s - ph * 26 * s, pr = (4.5 + ph * 8) * s;
        ctx.save(); ctx.globalAlpha = 0.38 * (1 - ph);
        ctx.fillStyle = '#e8e4dc'; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); ctx.restore();
    }
    // ── flywheel (spins with t)
    const fwA = t * TAU;
    ctx.fillStyle = '#33333c'; ctx.beginPath(); ctx.arc(-32 * s, -58 * s, 20 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a6a78'; ctx.lineWidth = 2.4 * s;
    for (let i = 0; i < 6; i++) { const a2 = fwA + i / 6 * TAU; ctx.beginPath(); ctx.moveTo(-32 * s, -58 * s); ctx.lineTo(-32 * s + Math.cos(a2) * 17 * s, -58 * s + Math.sin(a2) * 17 * s); ctx.stroke(); }
    ctx.fillStyle = '#c9a65a'; ctx.beginPath(); ctx.arc(-32 * s, -58 * s, 4 * s, 0, TAU); ctx.fill();
    // ── drill boom + spinning bit (the face is to the RIGHT, contact ≈ +122)
    ctx.strokeStyle = '#5a5a66'; ctx.lineWidth = 9 * s;
    ctx.beginPath(); ctx.moveTo(48 * s, -84 * s); ctx.lineTo(106 * s, -58 * s); ctx.stroke();
    ctx.fillStyle = '#6a6a78'; ctx.beginPath(); ctx.arc(48 * s, -84 * s, 7 * s, 0, TAU); ctx.fill();
    // housing + spiral-striped bit, spiral phase rolls with t
    ctx.fillStyle = '#8a94a2'; ctx.strokeStyle = '#20242c'; ctx.lineWidth = 1.6 * s;
    ctx.fillRect(100 * s, -72 * s, 16 * s, 26 * s); ctx.strokeRect(100 * s, -72 * s, 16 * s, 26 * s);
    const spin = (t * 4) % 1;
    ctx.save(); ctx.beginPath(); ctx.moveTo(116 * s, -70 * s); ctx.lineTo(132 * s, -58 * s); ctx.lineTo(122 * s, -24 * s); ctx.lineTo(108 * s, -40 * s); ctx.closePath(); ctx.clip();
    for (let i = -2; i < 7; i++) {
        const yy = -70 * s + (i + spin) * 7 * s;
        ctx.fillStyle = i % 2 ? '#b9c2cc' : '#828c98';
        ctx.beginPath(); ctx.moveTo(104 * s, yy); ctx.lineTo(134 * s, yy + 4 * s); ctx.lineTo(134 * s, yy + 7 * s); ctx.lineTo(104 * s, yy + 3.4 * s); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#20242c'; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); ctx.moveTo(116 * s, -70 * s); ctx.lineTo(132 * s, -58 * s); ctx.lineTo(122 * s, -24 * s); ctx.stroke();
    // headlamp on the cab's face-side
    const lampA = 0.75 + 0.25 * Math.sin(t * TAU * 3);
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(58 * s, -112 * s, 3.4 * s, 0, TAU); ctx.fill();
    ctx.restore();
    glow(ctx, x + 58 * s, y - 112 * s, 26 * s, 'rgba(255,224,150,0.8)', 0.45 * lampA);

    // ── steady chip stream at the bit contact (pre-seeded, loops close)
    const fx = x + 124 * s, fy = y - 26 * s;
    glow(ctx, fx, fy, 26 * s, 'rgba(255,236,190,0.9)', 0.4 + 0.2 * Math.sin(t * TAU * 8));
    for (let i = 0; i < 6; i++) {
        const ph = (t + i / 6) % 1;
        const crng = mulberry32(0xC41F + i * 17);
        const ca = -1.7 + crng() * 1.4, spd = (30 + crng() * 46) * s;
        const cxp = fx + Math.cos(ca) * spd * ph;
        const cyp = fy + Math.sin(ca) * spd * ph + 110 * s * ph * ph;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - ph * 1.15);
        ctx.fillStyle = i % 2 ? P.wallLight : P.rim;
        ctx.beginPath(); ctx.arc(cxp, cyp, (1.1 + crng() * 1.5) * s, 0, TAU); ctx.fill();
        ctx.restore();
    }
}

/** the miner — silhouette with helmet lamp, pickaxe swing; strike spawns chips */
function miner(ctx, P, x, y, s, t, band, rng) {
    // swing timeline across the loop: windup (0-0.30), strike (0.30-0.42), recover (0.42-1)
    let ang;
    const ease = (u) => u * u * (3 - 2 * u);
    if (t < 0.30) ang = -0.95 - 0.35 * ease(t / 0.30);          // wind up: pick rises behind the head
    else if (t < 0.42) { const u = (t - 0.30) / 0.12; ang = -1.30 + 2.7 * u * u; }   // accelerating strike
    else ang = 1.4 - 2.35 * ease(Math.min(1, (t - 0.42) / 0.58));   // ease back to guard (loop-closes at -0.95)
    const strike = t >= 0.40 && t < 0.46;

    // ground shadow — grounds him
    ctx.save(); ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(x, y + 46 * s, 26 * s, 5.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    // legs
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 5.4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6 * s, 26 * s); ctx.lineTo(-11 * s, 44 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7 * s, 26 * s); ctx.lineTo(13 * s, 44 * s); ctx.stroke();
    // body (lean into the face)
    ctx.save(); ctx.rotate(0.12);
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath(); ctx.ellipse(0, 8 * s, 12 * s, 20 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,150,0.55)'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.ellipse(0, 8 * s, 12 * s, 20 * s, 0, -1.2, 0.9); ctx.stroke();   // torch rim light
    ctx.restore();
    // head + helmet + lamp
    ctx.fillStyle = '#d9a67a';
    ctx.beginPath(); ctx.arc(9 * s, -14 * s, 8.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d2a52c';
    ctx.beginPath(); ctx.arc(9 * s, -16 * s, 8.8 * s, Math.PI * 1.05, Math.PI * 1.98); ctx.fill();
    // lamp + its glow (flicker slight)
    const lampA = 0.75 + 0.25 * Math.sin(t * Math.PI * 2 * 3);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(16 * s, -18 * s, 2.4 * s, 0, Math.PI * 2); ctx.fill();
    glow(ctx, x + 17 * s, y - 19 * s, 34 * s, 'rgba(255,224,150,0.8)', 0.5 * lampA);
    // arms + pickaxe
    const sx = 12 * s, sy = -6 * s; // shoulder pivot
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(ang);
    // handle — thick wooden shaft
    ctx.strokeStyle = '#141009'; ctx.lineWidth = 6.5 * s;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30 * s, 7 * s); ctx.stroke();
    ctx.strokeStyle = '#6b5638'; ctx.lineWidth = 4.4 * s;
    ctx.beginPath(); ctx.moveTo(3 * s, 0.9 * s); ctx.lineTo(29 * s, 7.1 * s); ctx.stroke();
    // pick head — solid steel wedge, dark outline
    ctx.save();
    ctx.translate(31 * s, 7 * s); ctx.rotate(-0.12);
    ctx.fillStyle = '#11151c';
    ctx.beginPath();
    ctx.moveTo(-4 * s, -9 * s); ctx.quadraticCurveTo(10 * s, -13 * s, 20 * s, -3 * s);
    ctx.quadraticCurveTo(10 * s, -5 * s, -4 * s, -1 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a8b4c4';
    ctx.beginPath();
    ctx.moveTo(-3 * s, -8 * s); ctx.quadraticCurveTo(9 * s, -11.5 * s, 18 * s, -3.5 * s);
    ctx.quadraticCurveTo(9 * s, -6 * s, -3 * s, -2 * s);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // far arm holding the face
    ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 4.6 * s;
    ctx.beginPath(); ctx.moveTo(2 * s, 0); ctx.lineTo(-16 * s, -10 * s); ctx.stroke();
    ctx.restore();

    // impact flash + chips fly FROM the rock face contact point (the face is to the miner's right).
    // Particles are PRE-SEEDED (same seed every frame) so each chip follows one smooth arc instead of re-rolling per frame.
    const fx = x + 62 * s, fy = y - 20 * s;
    if (t >= 0.40 && t < 0.50) {
        const fa = 1 - (t - 0.40) / 0.10;
        glow(ctx, fx, fy, 38 * s, 'rgba(255,236,190,0.95)', 0.75 * fa);
        sparkle(ctx, fx, fy, 15 * s * fa, fa, '#fff8e0');
    }
    if (t >= 0.40 && t < 0.80) {
        const chipT = (t - 0.40) / 0.40;                  // 0..1 flight
        const crng = mulberry32(0xC41F);
        for (let i = 0; i < 10; i++) {
            const ca = -1.9 + crng() * 1.5, spd = 38 + crng() * 64, rad = 1.3 + crng() * 1.8;
            const cxp = fx + Math.cos(ca) * spd * chipT;
            const cyp = fy + Math.sin(ca) * spd * chipT + 140 * chipT * chipT;
            ctx.save(); ctx.globalAlpha = Math.max(0, 1 - chipT * chipT * 1.05);
            ctx.fillStyle = i % 2 ? P.wallLight : P.rim;
            ctx.beginPath(); ctx.arc(cxp, cyp, rad, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }
}

// ── the scene painter ───────────────────────────────────────────────────────
function paintFrame(ctx, locId, band, frameIdx) {
    const P = LOCS[locId];
    const t = frameIdx / FRAMES;
    const rng = mulberry32(0xBEEF + 77 * (locId.length) + frameIdx * 13 + (band === 'epic' ? 5 : band === 'mid' ? 3 : 1));

    // cavern wall base
    vgrad(ctx, 0, 0, 0, GH, P.bgTop, P.bgBot);
    // big wall rocks (background mass)
    const wallRng = mulberry32(0xCAFE + locId.length * 31);
    for (let i = 0; i < 7; i++) {
        const wx = wallRng() * GW, wy = 60 + wallRng() * (GH - 130);
        const rx = 60 + wallRng() * 90, ry = 40 + wallRng() * 66;
        rockBlob(ctx, wx, wy, rx, ry, i % 2 ? P.wall : P.wallDark, wallRng, 0.3);
        rockShade(ctx, wx, wy, rx, ry, P.bgBot);
        rockLight(ctx, wx, wy, rx, ry, P.wallLight);
    }
    ceiling(ctx, P, mulberry32(0x51 + locId.length));
    if (locId === 'deep_vein_shafts') timbers(ctx, P, mulberry32(0x77));

    // ── the FOREGROUND rock face the miner strikes (right-of-centre) — drawn
    // first so the location's ore feature sits ON it and the miner works in front
    const faceX = 342, faceY = 258;
    // dark outline pass behind each face blob — separates the face from the bg
    rockBlob(ctx, faceX, faceY - 14, 121, 105, '#0b0912', mulberry32(0xFACE), 0.18);
    rockBlob(ctx, faceX, faceY - 14, 116, 100, P.wallDark, mulberry32(0xFACE), 0.18);
    rockShade(ctx, faceX, faceY - 14, 116, 100, '#0b0912');
    rockBlob(ctx, faceX - 66, faceY + 48, 74, 52, '#0b0912', mulberry32(0xFACE + 7), 0.24);
    rockBlob(ctx, faceX - 66, faceY + 48, 70, 48, P.wallDark, mulberry32(0xFACE + 7), 0.24);
    rockShade(ctx, faceX - 66, faceY + 48, 70, 48, '#0b0912');
    rockBlob(ctx, 452, 306, 62, 44, '#0b0912', mulberry32(0xFACE + 21), 0.26);
    rockBlob(ctx, 452, 306, 58, 40, P.wallDark, mulberry32(0xFACE + 21), 0.26);
    rockShade(ctx, 452, 306, 58, 40, '#0b0912');
    // strong warm kiss on the face's left edge (torch side) so it separates from the bg
    ctx.save();
    const fw = ctx.createRadialGradient(faceX - 92, faceY - 36, 6, faceX - 92, faceY - 36, 130);
    fw.addColorStop(0, hexGlow(P.torch)); fw.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = fw; ctx.fillRect(faceX - 220, faceY - 170, 240, 280);
    ctx.restore();

    // location features — the ORE on the face is the primary glint anchor
    let glints = [];
    if (locId === 'shimmering_caves') glints = crystals(ctx, P, mulberry32(0x99), t);
    if (locId === 'deep_vein_shafts') glints = goldVein(ctx, mulberry32(0x88), t);
    if (locId === 'volcanic_hollow') lavaCracks(ctx, mulberry32(0x66), t);
    if (locId === 'void_fissure') glints = voidRift(ctx, mulberry32(0x55), t);

    // floor
    floorRubble(ctx, P, mulberry32(0xD00D));

    // ⚙️ Task 25 (owner: ".j mine, instead of a person doing that make it a
    // machine or something"): the STEAM-DRILL RIG works the face — same slot
    // the miner held, same contact point, machine animation on t.
    machine(ctx, P, 180, 268, 1.0, t, band, mulberry32(0xC11));

    // ambient dust motes
    const drng = mulberry32(0xD057 + locId.length * 17);
    for (let i = 0; i < 10; i++) {
        const dx = drng() * GW;
        const dy = (GH - ((t * (14 + drng() * 18) + drng() * GH * 2) % (GH + 30))) - 6;
        ctx.save(); ctx.globalAlpha = 0.16 + 0.14 * Math.sin(t * Math.PI * 2 + i);
        ctx.fillStyle = P.dust;
        ctx.beginPath(); ctx.arc(dx, dy, 1 + drng() * 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // torch on the left wall — the constant light source
    torch(ctx, P, 68, 128, t, locId.length);
    // cool rim light from the right (crystal / lava / rift tint)
    glow(ctx, GW - 40, GH * 0.45, 150, hexGlow(P.rim), 0.16);

    // BAND FX — glints on the location's treasure anchors
    if (band !== 'low' && glints.length) {
        const n = band === 'epic' ? 5 : 2;
        for (let i = 0; i < n; i++) {
            const [gx, gy, gs] = glints[i % glints.length];
            const phase = (i * 0.37 + (band === 'epic' ? t * 1.6 : t)) % 1;
            const a = Math.max(0, Math.sin(phase * Math.PI));
            const jx = ((i * 53) % 23) - 11, jy = ((i * 29) % 19) - 9;
            sparkle(ctx, gx + jx, gy + jy, (band === 'epic' ? 11 : 7) * (0.7 + a * 0.6), a, i % 2 ? '#fff6d8' : '#ffffff');
            if (band === 'epic') glow(ctx, gx + jx, gy + jy, 46, hexGlow('#ffe9a8'), 0.22 * a);
        }
        if (band === 'epic') {
            // slow light surge from the treasure — the "strike it rich" wash
            const surge = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
            glow(ctx, GW * 0.62, GH * 0.5, 190, hexGlow(P.torch), 0.10 + surge * 0.10);
        }
    }

    // vignette (carve the cave mouth)
    const vg = ctx.createRadialGradient(GW / 2, GH * 0.52, GH * 0.34, GW / 2, GH * 0.52, GW * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,3,8,0.62)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, GW, GH);
}

// ── encode helpers ──────────────────────────────────────────────────────────
function encodeMp4(framesDir, outPath) {
    execFileSync('ffmpeg', [
        '-y', '-framerate', String(1000 / DELAY_MS), '-i', path.join(framesDir, 'f%02d.png'),
        '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-an', outPath,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    const sz = fs.statSync(outPath).size;
    if (sz < 5000) throw new Error(`mp4 too small (${sz}B): ${outPath}`);
    return sz;
}

function bakeOne(locId, band, doPreviews) {
    const canvas = createCanvas(GW, GH), ctx = canvas.getContext('2d');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minepov-'));
    for (let i = 0; i < FRAMES; i++) {
        paintFrame(ctx, locId, band, i);
        fs.writeFileSync(path.join(tmp, `f${String(i).padStart(2, '0')}.png`), canvas.toBuffer('image/png'));
        if (doPreviews && (i === 0 || i === 14 || i === 20)) {
            fs.mkdirSync(PREVIEWS, { recursive: true });
            fs.writeFileSync(path.join(PREVIEWS, `${locId}_${band}_f${i}.png`), canvas.toBuffer('image/png'));
        }
    }
    const outMp4 = path.join(OUT, `${locId}_${band}.mp4`);
    const outJpg = path.join(OUT, `${locId}_${band}.jpg`);
    const sz = encodeMp4(tmp, outMp4);
    // poster = frame 0 at half size
    execFileSync('ffmpeg', ['-y', '-i', path.join(tmp, 'f00.png'), '-vf', 'scale=240:-2', '-q:v', '5', outJpg],
        { stdio: ['ignore', 'ignore', 'ignore'] });
    fs.rmSync(tmp, { recursive: true, force: true });
    return sz;
}

function main() {
    const args = process.argv.slice(2);
    const onlyIdx = args.indexOf('--only');
    const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
    const noPrev = args.includes('--no-previews');
    fs.mkdirSync(OUT, { recursive: true });
    const jobs = [];
    for (const locId of Object.keys(LOCS)) for (const band of BANDS) {
        if (only && `${locId}:${band}` !== only) continue;
        jobs.push([locId, band]);
    }
    console.log(`baking ${jobs.length} mine POV loops → ${path.relative(REPO, OUT)}`);
    let total = 0;
    for (const [locId, band] of jobs) {
        const sz = bakeOne(locId, band, !noPrev);
        total += sz;
        console.log(`  ✓ ${locId}_${band}.mp4  ${(sz / 1024).toFixed(0)}KB`);
    }
    console.log(`done — ${(total / 1024 / 1024).toFixed(2)}MB total`);
}

main();
