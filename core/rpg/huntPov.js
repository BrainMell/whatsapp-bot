'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HUNT POV — the hunting grounds as a living first-person scene (Task 20:
//  "make something like that for hunting too, find the appropriate animal
//  sprites for that sprite sheet, and add the overlay to both" · Task 21:
//  "find sprites of deers that fit and other animals grazing and fill them
//  in. Place some grass around too." + the shared day/night cycle).
//
//  Same contract as the pond (dockPov.js), applied to the hunt:
//    • ANIMAL SPRITE SHEET — rabbit / boar / stag walk+hop cycles drawn in the
//      same flat-shaded style as the base critters, baked ONCE into a single
//      PNG sheet and kept on disk through mediaCache. The scene compositor
//      blits cells from the sheet — no per-frame vector re-draws.
//    • BASE FRAMES — 16 frames per (biome, barracks level), canonical seed so
//      every player shares one bake: drifting clouds, swaying grass, flickering
//      campfire, birds crossing, a rustling bush. Kept on disk (survives
//      restarts/deploys via code-versioned mediaCache keys).
//    • HUNT GIF — kept base frames + THIS hunt's overlay composited on top,
//      keyed ONLY by (biome, level, band): low = rabbit hops the trail, mid =
//      a boar trots through with dust, epic = birds flush and a crowned stag
//      steps out, pauses with an antler glint, bounds off. The band is chosen
//      AFTER the loot roll — the animation never spoils rarity early.
//  Delivery: pure-JS gif89a → { image, gifPlayback: true }. Text fallback
//  stays mandatory upstream (baseBuilder renders the static spotlight card
//  if anything here throws — the roll still happened exactly once).
// ═══════════════════════════════════════════════════════════════════════════
const mediaCache = require('./mediaCache');
const dayNight = require('./dayNight');
const dockPov = require('./dockPov');
const K = require('./kingdom3d');
const hashStr = (s) => K.hashStr(String(s || ''));

const GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120;   // 1.92s loop
const CONTAINER_MAGIC = 'HUNTPOV1';
const SHEET_MAGIC = 'HUNTSPR2';
const CW = 96, CH = 72, COLS = 4;                        // sheet cell geometry
// Task 21: the sheet grew a proper deer herd + other grazing animals —
// rabbit / boar / stag / alert-stag / DOE / DOE-GRAZING / FAWN / SHEEP.
const ROW = { rabbit: 0, boar: 1, stag: 2, alert: 3, doe: 4, graze: 5, fawn: 6, sheep: 7 };
const SHEET_ROWS = 8;
// Uniform fit-scale: the tallest art (stag + antlers ≈ 50u) must stay inside
// the 72px cell — 1.3 keeps every animal whole with a consistent pixel chunk.
const SHEET_FIT = 1.3;

// ── biome palettes (flat, GIF-quantizer friendly) ──────────────────────────
// sky 3 bands · cloud 2 tones · far treeline + dark · meadow far→near ·
// tuft/fg grass · trail dirt + edge · bush · wood/canvas (camp) · rock · fire.
const PALETTES = {
    isle: {
        sky: ['#b8d8e2', '#d8e8de', '#f2e4c0'], sun: '#f8f2d8', cloud: ['#ffffff', '#e2efe6'],
        far: '#2e6e5c', farDark: '#245448', gap: '#e8e2c0',
        meadow: ['#6fae7a', '#5c9e6c', '#4c8e5e'], tuft: '#2e6e48', fg: '#245a3c',
        trail: ['#c8a878', '#b09060'], bush: ['#35784e', '#2a6242'],
        wood: ['#8a6a40', '#6e5232'], canvas: ['#e2d4b0', '#c9b890'], rock: ['#8a8a82', '#6e6e66'],
        fire: '#ff9a2a', fireCore: '#e8541a', glow: '#f2d896', banner: '#d94f3a',
    },
    desert: {
        sky: ['#e8d8ae', '#f0e2b8', '#f8ecc2'], sun: '#fcf4d8', cloud: ['#f8f0dc', '#eadfbe'],
        far: '#a8783e', farDark: '#8a5f30', gap: '#f4e8c4',
        meadow: ['#c2b070', '#b2a062', '#a29054'], tuft: '#8a7a42', fg: '#75683a',
        trail: ['#dcc48c', '#c4ac76'], bush: ['#7a8a4a', '#66743c'],
        wood: ['#a8845a', '#8f6c46'], canvas: ['#f0e4c0', '#d6c8a0'], rock: ['#b09a7a', '#947e62'],
        fire: '#ffb84a', fireCore: '#e86a1a', glow: '#f8e2a0', banner: '#c94f3a',
    },
    tundra: {
        sky: ['#c2d4e0', '#d8e4ea', '#ecf0ee'], sun: '#f4f8f8', cloud: ['#f4f8fa', '#e2ecf0'],
        far: '#3c5468', farDark: '#2e4456', gap: '#e8f0f2',
        meadow: ['#9ab08e', '#8aa280', '#7a9272'], tuft: '#5c7458', fg: '#4c644a',
        trail: ['#c2ccce', '#a8b4b6'], bush: ['#48684e', '#3a5842'],
        wood: ['#7c6248', '#68523c'], canvas: ['#d8dcc0', '#bcc0a4'], rock: ['#9aa4a8', '#7e888c'],
        fire: '#ffae4a', fireCore: '#e8641a', glow: '#eee2b4', banner: '#c05a4a',
    },
    highlands: {
        sky: ['#d8c8a0', '#e8d4a4', '#f4e0ac'], sun: '#f8ecca', cloud: ['#f8f0d4', '#eadfb8'],
        far: '#8a5a24', farDark: '#6e461c', gap: '#f4e4b8',
        meadow: ['#b2a254', '#a2924a', '#928240'], tuft: '#7a6c34', fg: '#665a2c',
        trail: ['#ccb484', '#b49c6e'], bush: ['#6a7c3e', '#586834'],
        wood: ['#8a6238', '#744f2e'], canvas: ['#e8dcb4', '#cec294'], rock: ['#a09888', '#847c6e'],
        fire: '#ffaa3a', fireCore: '#e8601a', glow: '#f6dc9a', banner: '#b8543a',
    },
    volcanic: {
        sky: ['#8a7a72', '#a89284', '#c8a882'], sun: '#f4d8a8', cloud: ['#c0b0a4', '#a8988c'],
        far: '#3c3438', farDark: '#2c262a', gap: '#d8c0a0',
        meadow: ['#6a6a52', '#5c5e48', '#4e5240'], tuft: '#42462f', fg: '#383c28',
        trail: ['#a89070', '#907a5c'], bush: ['#4e5c38', '#404c2e'],
        wood: ['#6a5244', '#574238'], canvas: ['#c8b894', '#ac9c7c'], rock: ['#6e6862', '#585250'],
        fire: '#ffb864', fireCore: '#f07020', glow: '#ffb864', banner: '#a84a3a',
    },
};

// ── layout: horizon, trail gap, camp anchor ────────────────────────────────
const HZ = 0.30, FORE = 0.80;                 // horizon y, foreground band top
const GAPX = 0.45;                            // where the trail meets the treeline

/** One base frame at loop position t∈[0,1). Deterministic per (biome,lvl). */
function paintFrame(ctx, w, h, t, { biome = 'isle', lvl = 1 } = {}) {
    const P = PALETTES[biome] || PALETTES.isle;
    const rng = K.mulberry32(hashStr(`huntpov:${biome}:${lvl}`));
    const hz = Math.round(HZ * h), foreY = Math.round(FORE * h);

    // ── sky: three flat bands (the sun/moon are added per-hour by the
    // day/night cycle — dockPov.paintCelestial — so one base serves every hour) ──
    ctx.fillStyle = P.sky[0]; ctx.fillRect(0, 0, w, Math.round(hz * 0.45));
    ctx.fillStyle = P.sky[1]; ctx.fillRect(0, Math.round(hz * 0.45), w, Math.round(hz * 0.3));
    ctx.fillStyle = P.sky[2]; ctx.fillRect(0, Math.round(hz * 0.75), w, hz - Math.round(hz * 0.75));

    // drifting clouds (flat 2-tone puffs, slow loop drift)
    for (let i = 0; i < 3; i++) {
        const cy = hz * (0.16 + rng() * 0.42), cw2 = w * (0.09 + rng() * 0.07), sp = 0.012 + rng() * 0.014;
        const cx = (((rng() + t * sp) % 1.25) - 0.125) * w;
        ctx.fillStyle = P.cloud[1]; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, cw2, h * 0.014, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.cloud[0]; ctx.beginPath(); ctx.ellipse(cx, cy, cw2, h * 0.014, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + cw2 * 0.5, cy - h * 0.008, cw2 * 0.55, h * 0.011, 0, 0, Math.PI * 2); ctx.fill();
    }
    // a bird or two crossing the sky mid-loop
    for (let i = 0; i < 2; i++) {
        const u = (t * (0.55 + i * 0.22) + i * 0.45) % 1;
        if (u > 0.06 && u < 0.94) {
            const bx2 = u * w * 1.1 - w * 0.05, by2 = hz * (0.2 + i * 0.22);
            const flap = Math.sin(t * Math.PI * 8 + i * 2) * h * 0.006;
            ctx.strokeStyle = P.farDark; ctx.lineWidth = Math.max(1, h * 0.0035); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(bx2 - h * 0.011, by2 + flap); ctx.lineTo(bx2, by2); ctx.lineTo(bx2 + h * 0.011, by2 + flap); ctx.stroke();
        }
    }

    // ── far treeline: seeded canopy bumps with a lighter gap at the trail ──
    ctx.fillStyle = P.farDark;
    for (let x = 0; x < w; x += w / 34) {
        const th = h * (0.045 + rng() * 0.05) * (Math.abs(x / w - GAPX) < 0.06 ? 0.45 : 1);
        ctx.beginPath(); ctx.moveTo(x, hz + 1); ctx.lineTo(x + w / 68, hz - th); ctx.lineTo(x + w / 34, hz + 1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = P.far; ctx.fillRect(0, hz, w, Math.max(2, h * 0.012));
    // the gap: pale opening where the trail enters the deep woods
    ctx.fillStyle = P.gap; ctx.fillRect(w * GAPX - w * 0.028, hz - h * 0.035, w * 0.056, h * 0.047);

    // ── meadow: three flat perspective bands, far (light) → near (rich) ──
    const bands = [[hz, foreY * 0.45], [foreY * 0.45, foreY * 0.68], [foreY * 0.68, h]];
    for (let i = 0; i < 3; i++) { ctx.fillStyle = P.meadow[i]; ctx.fillRect(0, bands[i][0], w, bands[i][1] - bands[i][0] + 1); }

    // ── grass patches (Task 21: "place some grass around too") — soft darker
    // swaths the grazers can stand in, seeded per (biome, lvl) ──
    for (let i = 0; i < 9 + lvl * 2; i++) {
        const f = rng();
        const py = hz + (h - hz) * (0.1 + 0.85 * f), px2 = rng() * w;
        const ps = h * 0.012 * (0.6 + f * 1.6);
        ctx.fillStyle = i % 2 ? P.tuft : P.fg; ctx.globalAlpha = 0.16 + 0.1 * f;
        ctx.beginPath(); ctx.ellipse(px2, py, ps * 2.4, ps * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }

    // ── trail: dirt path from bottom-centre converging to the treeline gap ──
    const tb = [w * 0.30, w * 0.56], tg = [w * (GAPX - 0.024), w * (GAPX + 0.024)];
    ctx.fillStyle = P.trail[1];
    ctx.beginPath(); ctx.moveTo(tb[0] - w * 0.012, h); ctx.lineTo(tg[0] - w * 0.006, hz); ctx.lineTo(tg[1] + w * 0.006, hz); ctx.lineTo(tb[1] + w * 0.012, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.trail[0];
    ctx.beginPath(); ctx.moveTo(tb[0], h); ctx.lineTo(tg[0], hz); ctx.lineTo(tg[1], hz); ctx.lineTo(tb[1], h); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 7; i++) {  // pebbles
        const f = 0.15 + rng() * 0.8, px = tg[0] + (tb[0] - tg[0]) * f + (tb[1] - tg[1]) * f * rng();
        ctx.fillStyle = P.trail[1]; ctx.fillRect(px, hz + (h - hz) * f * 0.92, Math.max(1.5, w * 0.006 * (0.5 + f)), Math.max(1, h * 0.005 * (0.5 + f)));
    }

    // ── bushes: seeded rounded clumps; one rustles once per loop ──
    const rustleAt = 6 + Math.floor(rng() * 4);   // frame index of the rustle
    for (let i = 0; i < 3; i++) {
        const f = 0.35 + i * 0.24 + rng() * 0.08, bx2 = rng() < 0.5 ? w * (0.08 + rng() * 0.16) : w * (0.62 + rng() * 0.24);
        const by2 = hz + (foreY - hz) * f, s = h * 0.02 * (0.6 + f);
        const jx = i === 1 && Math.abs((t * FRAMES) - rustleAt) < 1.2 ? Math.sin(t * Math.PI * 30) * 1.4 : 0;
        ctx.fillStyle = P.bush[1]; ctx.beginPath(); ctx.ellipse(bx2 + jx, by2, s * 1.7, s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.bush[0]; ctx.beginPath(); ctx.ellipse(bx2 - s * 0.4 + jx, by2 - s * 0.45, s * 1.15, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // rocks (static, flat 2-tone)
    for (let i = 0; i < 2; i++) {
        const rx = w * (0.12 + rng() * 0.2 + i * 0.4), ry = hz + (h - hz) * (0.5 + rng() * 0.3), rs = h * (0.014 + rng() * 0.012);
        ctx.fillStyle = P.rock[1]; ctx.beginPath(); ctx.ellipse(rx, ry, rs * 1.6, rs * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.rock[0]; ctx.beginPath(); ctx.ellipse(rx - rs * 0.3, ry - rs * 0.3, rs * 1.1, rs * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ── grass tufts: seeded, blades sway with per-tuft phase. Task 21: the
    // grounds got noticeably lusher — nearly double the tufts. ──
    const ntuft = 44 + lvl * 8;
    for (let i = 0; i < ntuft; i++) {
        const f = rng();                                   // 0=far 1=near
        const ty = hz + (h - hz) * (0.08 + 0.88 * f), tx = rng() * w;
        const ts = (h * 0.008) * (0.45 + f * 1.3);
        const sway = Math.sin(t * Math.PI * 2 + i * 1.9) * ts * 0.7;
        ctx.strokeStyle = P.tuft; ctx.lineWidth = Math.max(1, h * 0.0028 * (0.5 + f)); ctx.lineCap = 'round';
        for (const a of [-0.55, 0, 0.55]) {
            ctx.beginPath(); ctx.moveTo(tx, ty);
            ctx.quadraticCurveTo(tx + a * ts * 0.4, ty - ts * 0.7, tx + a * ts + sway, ty - ts * 1.5); ctx.stroke();
        }
    }

    // ── the camp (right reach): tent + fire, L2+ target + second tent, L3 banner
    const campY = hz + (foreY - hz) * 0.42, campX = w * 0.80;
    ctx.fillStyle = P.canvas[1];                                                          // tent shadow side
    ctx.beginPath(); ctx.moveTo(campX - w * 0.055, campY); ctx.lineTo(campX, campY - h * 0.085); ctx.lineTo(campX + w * 0.055, campY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.canvas[0];                                                          // lit side
    ctx.beginPath(); ctx.moveTo(campX - w * 0.055, campY); ctx.lineTo(campX - w * 0.012, campY - h * 0.082); ctx.lineTo(campX + w * 0.01, campY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.wood[1]; ctx.fillRect(campX - w * 0.014, campY - h * 0.022, w * 0.026, h * 0.022);   // opening
    const flick = (t * FRAMES) % 2 < 1 ? 1 : 0.72;                                        // 2-step flame flicker
    const fx2 = campX - w * 0.075, fy2 = campY + h * 0.012;
    ctx.fillStyle = P.glow; ctx.globalAlpha = 0.16 + 0.1 * flick;
    ctx.beginPath(); ctx.ellipse(fx2, fy2, w * 0.05, h * 0.035, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = P.wood[1]; ctx.lineWidth = Math.max(1.5, h * 0.006);
    ctx.beginPath(); ctx.moveTo(fx2 - h * 0.014, fy2); ctx.lineTo(fx2 + h * 0.014, fy2 - h * 0.008); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx2 - h * 0.014, fy2 - h * 0.008); ctx.lineTo(fx2 + h * 0.014, fy2); ctx.stroke();
    const flame = (hh, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx2 - h * 0.008, fy2 - h * 0.004); ctx.quadraticCurveTo(fx2, fy2 - hh, fx2 + h * 0.008, fy2 - h * 0.004); ctx.closePath(); ctx.fill(); };
    flame(h * (0.024 + 0.008 * flick), P.fireCore); flame(h * (0.016 + 0.006 * flick), P.fire);
    if (lvl >= 2) {                                                                       // archery butt + 2nd tent
        const ax2 = w * 0.66, ay2 = hz + (foreY - hz) * 0.3;
        ctx.fillStyle = P.wood[1]; ctx.fillRect(ax2 - w * 0.004, ay2 - h * 0.045, w * 0.008, h * 0.045);
        ctx.fillStyle = P.canvas[0]; ctx.beginPath(); ctx.arc(ax2, ay2 - h * 0.05, h * 0.026, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.banner; ctx.beginPath(); ctx.arc(ax2, ay2 - h * 0.05, h * 0.017, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.canvas[1]; ctx.beginPath(); ctx.arc(ax2, ay2 - h * 0.05, h * 0.008, 0, Math.PI * 2); ctx.fill();
        const t2x = w * 0.90;
        ctx.fillStyle = P.canvas[1]; ctx.beginPath(); ctx.moveTo(t2x - w * 0.04, campY + h * 0.03); ctx.lineTo(t2x, campY - h * 0.055); ctx.lineTo(t2x + w * 0.04, campY + h * 0.03); ctx.closePath(); ctx.fill();
    }
    if (lvl >= 3) {                                                                       // banner pole + gold pennant
        const px2 = w * 0.925, py2 = hz + (foreY - hz) * 0.5;
        ctx.fillStyle = P.wood[0]; ctx.fillRect(px2, py2 - h * 0.16, Math.max(1.5, w * 0.005), h * 0.16);
        const wave = Math.sin(t * Math.PI * 2) * h * 0.008;
        ctx.fillStyle = '#e2b84a';
        ctx.beginPath(); ctx.moveTo(px2, py2 - h * 0.155); ctx.lineTo(px2 + w * 0.05, py2 - h * 0.145 + wave); ctx.lineTo(px2, py2 - h * 0.125); ctx.closePath(); ctx.fill();
        ctx.fillStyle = P.glow; ctx.globalAlpha = 0.3; ctx.fillRect(px2, py2 - h * 0.16, Math.max(1.5, w * 0.005), h * 0.16); ctx.globalAlpha = 1;
    }

    // ── foreground grass band: dark, tall, swaying blade clusters ──
    ctx.fillStyle = P.fg; ctx.fillRect(0, foreY, w, h - foreY);
    for (let i = 0; i < 13; i++) {
        const gx = (i + rng() * 0.6) * (w / 13), gh2 = (h - foreY) * (0.5 + rng() * 0.5);
        const sway = Math.sin(t * Math.PI * 2 + i * 2.3) * (h - foreY) * 0.12;
        ctx.strokeStyle = P.fg; ctx.lineWidth = Math.max(1.5, h * 0.006); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(gx, h); ctx.quadraticCurveTo(gx + sway * 0.4, h - gh2 * 0.6, gx + sway, h - gh2); ctx.stroke();
        if (i % 2) { ctx.beginPath(); ctx.moveTo(gx + 3, h); ctx.quadraticCurveTo(gx + 3 - sway * 0.3, h - gh2 * 0.45, gx + 3 - sway * 0.7, h - gh2 * 0.75); ctx.stroke(); }
    }
    return { gapX: w * GAPX, hz, foreY };
}

// ── the WILDLIFE PLAN (Task 21: deer herd + other animals grazing) ──────────
// Deterministic per (biome, lvl): a stag + doe by the treeline, a grazing doe
// and her fawn mid-field, two sheep nearer the foreground — kept off the trail
// and clear of the camp. Blitted from the sprite sheet into every base frame.
function wildlifePlan(w, h, { biome = 'isle', lvl = 1 } = {}) {
    const rng = K.mulberry32(hashStr(`wildlife:${biome}:${lvl}`));
    const hz = Math.round(HZ * h);
    const put = (row, xF, depth, flip = false, scaleBump = 0) => {
        const gy = hz + (h - hz) * depth;
        const sc = (0.5 + depth * 0.7) * (1 + scaleBump);
        const jitter = (rng() - 0.5) * w * 0.03;
        return { row, x: w * xF + jitter, y: gy, sc, flip, depth };
    };
    const plan = [
        put(ROW.stag, 0.155, 0.20, true),          // the old stag watches the treeline
        put(ROW.graze, 0.235, 0.25),               // a doe grazes beside him
        put(ROW.fawn, 0.255, 0.46),                // her fawn stays close
        put(ROW.graze, 0.30, 0.52),                // another doe, head down
        put(ROW.sheep, 0.60, 0.72, true),          // two sheep work the near grass
        put(ROW.sheep, 0.665, 0.78, false, 0.05),
        put(ROW.graze, 0.095, 0.66, true),         // a lone doe on the left reach
    ];
    // grass at each grazer's feet — "place some grass around too"
    const tufts = [];
    for (const a of plan) {
        for (let i = 0; i < 5; i++) {
            tufts.push({ x: a.x + (rng() - 0.5) * w * 0.05, y: a.y + (rng() - 0.2) * h * 0.012, s: (h * 0.008) * (0.5 + a.depth * 1.3) });
        }
    }
    return { plan, tufts };
}
function blitWildlife(ctx, w, h, t, sheet, { biome = 'isle', lvl = 1 } = {}) {
    const { plan, tufts } = wildlifePlan(w, h, { biome, lvl });
    // fresh grass right at the hooves, swaying with the rest
    ctx.strokeStyle = (PALETTES[biome] || PALETTES.isle).tuft; ctx.lineCap = 'round';
    for (const tf of tufts) {
        const sway = Math.sin(t * Math.PI * 2 + tf.x) * tf.s * 0.7;
        ctx.lineWidth = Math.max(1, h * 0.0026);
        for (const a of [-0.5, 0, 0.5]) {
            ctx.beginPath(); ctx.moveTo(tf.x, tf.y);
            ctx.quadraticCurveTo(tf.x + a * tf.s * 0.4, tf.y - tf.s * 0.7, tf.x + a * tf.s + sway, tf.y - tf.s * 1.4); ctx.stroke();
        }
    }
    for (const a of plan) {
        let row = a.row, pose = 0;
        if (row === ROW.graze) pose = Math.floor((((t * 1.7 + a.depth) % 1)) * 4);   // slow nibble
        else if (row === ROW.sheep) pose = Math.floor((((t * 1.4 + a.depth) % 1)) * 4);
        else if (row === ROW.fawn) pose = Math.floor((t * 3 + a.depth) % 4);         // hop-shuffle
        blitAnimal(ctx, sheet, row, pose, a.x, a.y, a.sc, a.flip);
    }
}

// ── camp anchors for the night lights (fire + tent opening) ────────────────
function campAnchors(w, h) {
    const hz = Math.round(HZ * h), foreY = Math.round(FORE * h);
    const campY = hz + (foreY - hz) * 0.42, campX = w * 0.80;
    return {
        fire: { x: campX - w * 0.075, y: campY + h * 0.012 },
        tent: { x: campX, y: campY - h * 0.012 },
        butt: { x: w * 0.66, y: hz + (foreY - hz) * 0.3 - h * 0.05 },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANIMAL SPRITE SHEET — Task 21 herd: rabbit / boar / stag walk cycles +
//  head-high alert stag + DOE (walk) + DOE-GRAZING (head down, nibbling) +
//  FAWN (small, spotted) + SHEEP (woolly grazer). Baked ONCE into one PNG
//  and kept through mediaCache ("find sprites of deers that fit and other
//  animals grazing and fill them in" — same flat-shaded style as the camp).
// ═══════════════════════════════════════════════════════════════════════════
function px(ctx, x, y, w2, h2, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w2, h2); }
/** Draw one animal cell at origin (bottom-centre of its cell). pose 0..3. */
function paintAnimal(ctx, kind, pose) {
    const u = 2;                                  // pixel unit
    const legA = [0.5, 0, -0.5, 0][pose % 4];     // simple trot swing
    if (kind === 'rabbit') {
        const squash = pose === 0 ? 1.25 : pose === 2 ? 0.85 : 1;   // crouch/air
        const lift = pose === 2 ? -3 * u : 0;
        const bw = 11 * u, bh = 5 * u * squash, by = -bh - lift;
        px(ctx, -7 * u, by, 14 * u, bh, '#b8a48c');                              // body
        px(ctx, -8 * u, by + 2 * u, 3 * u, 3 * u, '#f0e8d8');                    // tail puff
        px(ctx, 3 * u, by - 2 * u, 5 * u, 4 * u, '#c4b098');                     // head
        px(ctx, 7 * u, by - 1 * u, 1.5 * u, 1.5 * u, '#241a10');                 // eye
        px(ctx, 4 * u, by - 6 * u, 1.5 * u, 5 * u, '#b8a48c');                   // ear 1
        px(ctx, 6 * u, by - 5.5 * u, 1.5 * u, 4.5 * u, '#a89880');               // ear 2
        px(ctx, 4 * u, by + bh, 2 * u, 2.5 * u, '#8a7a64');                      // front leg
        px(ctx, -5 * u, by + bh, 2.5 * u, 2.5 * u + (pose === 1 ? 1.5 * u : 0), '#8a7a64'); // hind leg
        px(ctx, 1 * u, by + bh, 2 * u, 2 * u, '#9a8a72');                        // mid leg
    } else if (kind === 'boar') {
        const by = -6 * u;
        for (const [lx, la] of [[-5, legA], [-2, -legA], [2, legA], [5, -legA]]) {
            px(ctx, lx * u, -3 * u, 1.8 * u, 3 * u + Math.abs(la) * u * 0.4, '#2e2014');   // feet on the ground, top inside the body
        }
        px(ctx, -6 * u, by, 12 * u, 5 * u, '#4a3526');                           // body
        px(ctx, 3 * u, by - 1 * u, 5 * u, 4 * u, '#5c4331');                     // shoulder/head
        px(ctx, 7.5 * u, by + 1 * u, 2.5 * u, 2 * u, '#c99a86');                 // snout
        px(ctx, 7 * u, by + 2.5 * u, 1.2 * u, 2 * u, '#f1e6c8');                 // tusk
        px(ctx, 5 * u, by - 0.5 * u, 1.5 * u, 1.5 * u, '#120a04');               // eye
        px(ctx, 2 * u, by - 2 * u, 2.5 * u, 2 * u, '#4a3526');                   // ear
        px(ctx, -7.5 * u, by - 1 * u, 1.5 * u, 3 * u, '#241810');                // tail nub
        px(ctx, -4 * u, by + 1 * u, 4 * u, 1.2 * u, '#3a2a1c');                  // bristle strip
    } else if (kind === 'doe' || kind === 'graze') {
        // the doe: the stag's frame with NO antlers, slimmer + a lighter coat;
        // 'graze' drops her head into the grass and nibbles (pose varies the bite)
        const grazing = kind === 'graze';
        const by = -9 * u, headDip = grazing ? 6.5 * u + Math.sin(pose * 1.57) * 1.2 * u : 0;
        const tail = pose % 2 ? 1.2 * u : 0;                       // idle tail flick
        for (const [lx, la] of [[-5, legA], [-2.5, -legA], [2.5, legA], [5.5, -legA]]) {
            px(ctx, lx * u, -6 * u, 1.5 * u, 6 * u + Math.abs(la) * u * 0.4, '#7a4c24');
        }
        px(ctx, -6 * u, by, 12 * u, 4.2 * u, '#b07a44');           // body (lighter than the stag)
        px(ctx, -4 * u, by + 3 * u, 8 * u, 1.4 * u, '#e8d0a4');    // belly
        px(ctx, -7.5 * u, by - 0.5 * u - tail, 2 * u, 3 * u, '#f4ead6');   // tail
        px(ctx, 3 * u, by - 5 * u + headDip * 0.4, 2.3 * u, 6 * u, '#b07a44');   // neck
        if (grazing) {
            px(ctx, 4.5 * u, by - 2.6 * u + headDip * 0.9, 4.5 * u, 2.1 * u, '#b07a44');   // head down in the grass
            px(ctx, 8.6 * u, by - 1.8 * u + headDip * 0.9, 1.2 * u, 1.2 * u, '#2a1a0c');
            px(ctx, 6.5 * u, by - 2.2 * u + headDip * 0.9, 1.2 * u, 1.2 * u, '#241810');
            px(ctx, 4 * u, by - 4.2 * u + headDip * 0.9, 1.8 * u, 2.6 * u, '#8a5a2c');     // ear
        } else {
            px(ctx, 4.5 * u, by - 7 * u, 4.5 * u, 2.2 * u, '#b07a44');   // head high
            px(ctx, 8.5 * u, by - 6.4 * u, 1.3 * u, 1.3 * u, '#2a1a0c');
            px(ctx, 6.5 * u, by - 6.8 * u, 1.2 * u, 1.2 * u, '#241810');
            px(ctx, 4 * u, by - 8 * u, 1.8 * u, 3 * u, '#8a5a2c');
        }
    } else if (kind === 'fawn') {
        // the baby: half-size, spotted back; little hop-shuffle poses
        const hop = pose === 1 ? -1.6 * u : 0;
        const by = -5 * u + hop;
        for (const [lx, la] of [[-3.5, legA], [-1.5, -legA], [1.5, legA], [3.5, -legA]]) {
            px(ctx, lx * u, -3 * u, 1.1 * u, 3 * u + Math.abs(la) * u * 0.3, '#7a4c24');
        }
        px(ctx, -4 * u, by, 8 * u, 3 * u, '#c08a50');
        for (const [sx2, sy2] of [[-2.5, 0.5], [-0.5, 1.2], [1.5, 0.5], [-1.5, 1.8], [0.5, 2.1]]) {
            px(ctx, sx2 * u, by + sy2 * u, 0.9 * u, 0.9 * u, '#f0e2c0');   // white spots
        }
        px(ctx, 2.5 * u, by - 3.4 * u, 2 * u, 4 * u, '#c08a50');       // neck
        px(ctx, 3.5 * u, by - 4.6 * u, 3.2 * u, 1.8 * u, '#c08a50');   // head
        px(ctx, 6.2 * u, by - 4.1 * u, 1 * u, 1 * u, '#2a1a0c');       // nose
        px(ctx, 5 * u, by - 4.3 * u, 0.9 * u, 0.9 * u, '#241810');     // eye
        px(ctx, 3 * u, by - 5.6 * u, 1.4 * u, 2 * u, '#9a6a38');       // ear
    } else if (kind === 'sheep') {
        // the other grazer: round woolly body, dark face + legs, nibbling
        const by = -7 * u, headDip = 4.5 * u + Math.sin(pose * 1.57) * 1 * u;
        const wool = '#f0ead8', woolD = '#d8d0bc';
        for (const [lx, la] of [[-4, legA], [-1.5, -legA], [1.5, legA], [4, -legA]]) {
            px(ctx, lx * u, -3 * u, 1.4 * u, 3 * u, '#3a3228');
        }
        px(ctx, -6 * u, by, 12 * u, 4.6 * u, wool);                // wool body
        px(ctx, -5 * u, by - 1 * u, 10 * u, 1.6 * u, woolD);       // wool shading
        px(ctx, 4.5 * u, by - 1.5 * u + headDip * 0.55, 2 * u, 4 * u, '#3a3228');  // neck
        px(ctx, 5 * u, by + headDip, 3.4 * u, 2 * u, '#3a3228');   // head down grazing
        px(ctx, 7.8 * u, by + 1.2 * u + headDip, 1 * u, 1 * u, '#181008'); // eye
        px(ctx, 3.8 * u, by - 2.4 * u + headDip * 0.4, 1.5 * u, 1.5 * u, '#2e2820'); // ear
        px(ctx, -7 * u, by - 0.6 * u, 1.4 * u, 2.4 * u, wool);     // woolly tail
    } else {                                                                       // stag (walk + alert)
        const alert = kind === 'alert';
        const by = -9 * u, headUp = alert ? 2.5 * u : 0;
        for (const [lx, la] of [[-5, legA], [-2.5, -legA], [2.5, legA], [5.5, -legA]]) {
            px(ctx, lx * u, -6 * u, 1.6 * u, 6 * u + Math.abs(la) * u * 0.4, '#6e4220');   // top tucks INTO the body, feet on the ground
        }
        px(ctx, -6 * u, by, 12 * u, 4.5 * u, '#a86a38');                         // body
        px(ctx, -4 * u, by + 3 * u, 8 * u, 1.5 * u, '#e0c08e');                  // belly
        px(ctx, -7.5 * u, by - 0.5 * u, 2 * u, 3 * u, '#f4ead6');                // tail
        px(ctx, 3 * u, by - 5 * u - headUp * 0.4, 2.5 * u, 6 * u, '#a86a38');    // neck
        px(ctx, 4.5 * u, by - 7 * u - headUp, 4.5 * u, 2.2 * u, '#a86a38');      // head
        px(ctx, 8.5 * u, by - 6.4 * u - headUp, 1.3 * u, 1.3 * u, '#2a1a0c');    // nose
        px(ctx, 6.5 * u, by - 6.8 * u - headUp, 1.2 * u, 1.2 * u, '#241810');    // eye
        px(ctx, 4 * u, by - 8 * u - headUp, 1.8 * u, 3 * u, '#8a5a2c');          // ear
        const ay = by - 8.6 * u - headUp, ant = alert ? '#f0e0b0' : '#e6d3a8';   // antlers (brighter when alert)
        px(ctx, 4.5 * u, ay - 4 * u, 1.2 * u, 4.5 * u, ant);
        px(ctx, 3 * u, ay - 3.4 * u, 1.6 * u, 1.2 * u, ant); px(ctx, 6 * u, ay - 3.6 * u, 1.6 * u, 1.2 * u, ant);
        px(ctx, 7 * u, ay - 3.2 * u, 1.2 * u, 3.4 * u, ant);
        px(ctx, 8.2 * u, ay - 2.6 * u, 1.4 * u, 1.2 * u, ant); px(ctx, 6.2 * u, ay - 2.4 * u, 1.4 * u, 1.2 * u, ant);
    }
}
/** Bake (once) the sprite sheet PNG — 8 rows × 4 cols of CW×CH cells. */
async function getHuntSpriteSheet() {
    const out = await mediaCache.cached('huntsprites', 'hs2', async () => {
        const { createCanvas } = require('canvas');
        const cv = createCanvas(CW * COLS, CH * SHEET_ROWS), c2 = cv.getContext('2d');
        c2.imageSmoothingEnabled = false;
        const kinds = Object.keys(ROW);
        for (let r = 0; r < SHEET_ROWS; r++) {
            for (let p = 0; p < COLS; p++) {
                c2.save(); c2.translate(p * CW + CW / 2, (r + 1) * CH - 3);  // col p, row r
                c2.scale(SHEET_FIT, SHEET_FIT);    // fit-scale: whole animal in every cell
                paintAnimal(c2, kinds[r], p);
                c2.restore();
            }
        }
        return { buffer: cv.toBuffer('image/png'), contentType: 'image/png' };
    });
    if (!getHuntSpriteSheet._img || getHuntSpriteSheet._len !== out.buffer.length) {
        const { Image } = require('canvas');
        const im = new Image(); im.src = out.buffer;
        getHuntSpriteSheet._img = im; getHuntSpriteSheet._len = out.buffer.length;
    }
    return getHuntSpriteSheet._img;
}
/** Blit a sheet cell (with ground shadow) — flip for leftward travel. */
function blitAnimal(ctx, sheet, row, col, x, y, scale = 1, flip = false, shadow = true) {
    const dw = CW * scale, dh = CH * scale;
    if (shadow) {
        ctx.fillStyle = 'rgba(20,14,6,0.30)';
        ctx.beginPath(); ctx.ellipse(x, y - 2, dw * 0.3, dh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sheet, col * CW, row * CH, CW, CH, -dw / 2, -dh, dw, dh);
    ctx.restore();
}

// ── hunt overlays (band chosen AFTER the roll — never spoils rarity) ───────
function paintHuntOverlay(ctx, w, h, t, band, sheet) {
    const hz = Math.round(HZ * h);
    if (band === 'low') {
        // rabbit: three hops L→R along the trail, mid-ground
        const u = Math.min(1, Math.max(0, (t - 0.06) / 0.88));
        if (u > 0 && u < 1) {
            const x = w * (0.14 + 0.66 * u), gy = hz + (h - hz) * 0.56;
            const hop = Math.abs(Math.sin(u * Math.PI * 3)) * h * 0.035;
            const pose = Math.floor((u * 3 % 1) * 4) % 4;
            blitAnimal(ctx, sheet, ROW.rabbit, pose, x, gy - hop, 0.62);
        }
    } else if (band === 'mid') {
        // boar: trots in from the right, snout down, dust at its heels
        const u = Math.min(1, Math.max(0, (t - 0.04) / 0.9));
        if (u > 0 && u < 1) {
            const x = w * (0.88 - 0.74 * u), gy = hz + (h - hz) * (0.5 + 0.14 * u);
            const sc = 1.5 + 0.3 * u, pose = Math.floor(u * 10) % 4;
            for (let d = 0; d < 3; d++) {   // dust puffs behind
                const da = Math.min(1, Math.max(0, u * 10 - Math.floor(u * 10)));
                ctx.fillStyle = `rgba(200,180,140,${0.35 * (1 - da) * (1 - d * 0.3)})`;
                ctx.beginPath(); ctx.arc(x + (28 + d * 10) * sc, gy - 3 - d * 3, (3 + d) * sc, 0, Math.PI * 2); ctx.fill();
            }
            blitAnimal(ctx, sheet, ROW.boar, pose, x, gy, sc, true);
        }
    } else if (band === 'epic') {
        // birds flush from the treeline gap first
        if (t > 0.04 && t < 0.26) {
            for (let i = 0; i < 3; i++) {
                const bu = (t - 0.04) / 0.22, bx2 = w * (GAPX - 0.02 + i * 0.025) + bu * w * (0.05 + i * 0.02);
                const by2 = hz - bu * h * (0.16 + i * 0.03), flap = Math.sin(t * Math.PI * 10 + i) * h * 0.006;
                ctx.strokeStyle = 'rgba(30,24,18,0.8)'; ctx.lineWidth = Math.max(1, h * 0.003);
                ctx.beginPath(); ctx.moveTo(bx2 - h * 0.009, by2 + flap); ctx.lineTo(bx2, by2); ctx.lineTo(bx2 + h * 0.009, by2 + flap); ctx.stroke();
            }
        }
        // the crowned stag: walks out, pauses alert with an antler glint, bounds off
        const IN = 0.14, PAUSE0 = 0.55, PAUSE1 = 0.78, OUT = 0.96;
        if (t > IN && t < OUT) {
            let x, gy, sc, row, pose;
            if (t < PAUSE0) {
                const u = (t - IN) / (PAUSE0 - IN);
                x = w * (GAPX + 0.02 - 0.05 * u); gy = hz + (h - hz) * (0.44 + 0.2 * u);
                sc = 0.8 + 0.25 * u; row = ROW.stag; pose = Math.floor(u * 8) % 4;
            } else if (t < PAUSE1) {
                x = w * (GAPX - 0.03); gy = hz + (h - hz) * 0.64; sc = 1.05; row = ROW.alert; pose = 0;
                if (t > 0.6 && t < 0.74) {   // antler glint — the crown reads gold
                    const gl = Math.sin(((t - 0.6) / 0.14) * Math.PI);
                    const gx = x + 26 * sc, gyy = gy - CH * sc + 12 * sc;
                    ctx.strokeStyle = `rgba(244,224,160,${0.5 + 0.5 * gl})`; ctx.lineWidth = Math.max(1, h * 0.004);
                    const r = (4 + gl * 6) * sc;
                    ctx.beginPath(); ctx.moveTo(gx - r, gyy); ctx.lineTo(gx + r, gyy); ctx.moveTo(gx, gyy - r); ctx.lineTo(gx, gyy + r); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(gx - r * 0.5, gyy - r * 0.5); ctx.lineTo(gx + r * 0.5, gyy + r * 0.5); ctx.moveTo(gx + r * 0.5, gyy - r * 0.5); ctx.lineTo(gx - r * 0.5, gyy + r * 0.5); ctx.stroke();
                }
            } else {
                const u = (t - PAUSE1) / (OUT - PAUSE1);
                x = w * (GAPX - 0.03 + 0.5 * u * u); gy = hz + (h - hz) * (0.64 - 0.06 * u);
                sc = 1.05; row = ROW.stag; pose = Math.floor(u * 8) % 4;
            }
            blitAnimal(ctx, sheet, row, pose, x, gy, sc);
        }
    }
}

// ── base-frame container through mediaCache (shared with the pond pipeline) ─
let _imgCache = new Map();
function decodePngs(pngs) {
    const { Image } = require('canvas');
    return pngs.map((p) => { const im = new Image(); im.src = p; return im; });
}

/** Bake (once) the base frames for a biome+level — the clearing WITH its
 *  grazing herd blitted in (Task 21). Every player shares one bake. */
async function getHuntBaseFrames({ biome = 'isle', lvl = 1 } = {}) {
    const key = `hp2:${biome}:L${Math.max(1, Math.min(3, lvl))}`;
    const out = await mediaCache.cached('huntpov', key, async () => {
        const { createCanvas } = require('canvas');
        const sheet = await getHuntSpriteSheet();
        const pngs = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(GW, GH), c2 = cv.getContext('2d');
            paintFrame(c2, GW, GH, i / FRAMES, { biome, lvl });
            // the deer herd + sheep live IN the clearing now (base art, graded
            // with everything else by the day/night cycle at compose time)
            blitWildlife(c2, GW, GH, i / FRAMES, sheet, { biome, lvl });
            pngs.push(cv.toBuffer('image/png'));
        }
        return { buffer: dockPov.packContainer(GW, GH, DELAY_MS, pngs, CONTAINER_MAGIC), contentType: 'application/x-huntpov' };
    });
    const ck = `huntpov:${key}:${out.buffer.length}`;
    if (!_imgCache.has(ck)) {
        const c = dockPov.unpackContainer(out.buffer, CONTAINER_MAGIC);
        if (!c || c.pngs.length !== FRAMES) throw new Error('huntpov container unreadable');
        c.imgs = decodePngs(c.pngs);
        _imgCache.set(ck, c);
        if (_imgCache.size > 12) _imgCache.delete(_imgCache.keys().next().value);
    }
    return _imgCache.get(ck);
}

// ── compose: kept base frames + the hour's grade + night lights + overlay ──
// Cached per (biome, level, phase, band); the loot plate is drawn per catch
// AFTER this so the cache stays tiny while every hunt still explains itself.
async function composeHunt({ biome = 'isle', lvl = 1, phase = null, band = 'low' } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const key = `hgc1:${biome}:L${lvl}:${phase}:${band}`;
    return mediaCache.cached('huntcompose', key, async () => {
        const { createCanvas } = require('canvas');
        const base = await getHuntBaseFrames({ biome, lvl });
        const sheet = await getHuntSpriteSheet();
        const pngs = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(base.gw, base.gh), c2 = cv.getContext('2d');
            c2.drawImage(base.imgs[i], 0, 0, base.gw, base.gh);
            dayNight.grade(c2, base.gw, base.gh, phase);
            if (phase === 'night' || phase === 'dusk') {
                const A = campAnchors(base.gw, base.gh);
                dayNight.light(c2, A.fire.x, A.fire.y, base.gh * 0.13, '#ffb45a', phase === 'night' ? 0.6 : 0.34);
                dayNight.light(c2, A.tent.x, A.tent.y, base.gh * 0.07, '#ffcf7a', phase === 'night' ? 0.34 : 0.18, false);
                if (lvl >= 2) dayNight.light(c2, A.butt.x, A.butt.y, base.gh * 0.05, '#ffcf7a', 0.16, false);
                if (phase === 'night') {
                    dayNight.moonStars(c2, base.gw, base.gh, { seed: 901 + K.hashStr(String(biome)) % 97, moonX: 0.24, moonY: 0.10, stars: 22, skyH: HZ * 0.92 });
                    dayNight.fireflies(c2, base.gw, base.gh, i / FRAMES, 71, 8, { x: 0, y: base.gh * 0.34, w: base.gw, h: base.gh * 0.6 });
                }
            }
            // "add the overlay to both": this hunt's animal + effects drawn OVER
            // the kept clearing animation — same contract as the pond.
            paintHuntOverlay(c2, base.gw, base.gh, i / FRAMES, band, sheet);
            pngs.push(cv.toBuffer('image/png'));
        }
        return { buffer: dockPov.packContainer(base.gw, base.gh, base.delayMs, pngs, CONTAINER_MAGIC), contentType: 'application/x-huntcompose' };
    });
}

/** `.j hunt` — the hunt GIF: kept base frames + hour + THIS hunt's overlay +
 * the grounds/catch plate. Final GIF cached per (biome, lvl, phase, band, loot). */
async function renderHuntGif({ biome = 'isle', lvl = 1, band = 'low', drops = {}, phase = null } = {}) {
    lvl = Math.max(1, Math.min(3, lvl));
    phase = phase || dayNight.phaseAt();
    const lines = dockPov.plateLines('hunt', drops);
    const plateKey = K.hashStr(JSON.stringify(lines));
    const key = `hg2:${biome}:L${lvl}:${phase}:${band}:${plateKey}`;
    return mediaCache.cached('huntgif', key, async () => {
        const { createCanvas } = require('canvas');
        const { encodeGif } = require('../utils/gif89a');
        try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
        const comp = await composeHunt({ biome, lvl, phase, band });
        const c = dockPov.unpackContainer(comp.buffer, CONTAINER_MAGIC);
        if (!c || c.pngs.length !== FRAMES) throw new Error('hunt compose container unreadable');
        const imgs = decodePngs(c.pngs);
        const frames = [];
        for (let i = 0; i < FRAMES; i++) {
            const cv = createCanvas(c.gw, c.gh), c2 = cv.getContext('2d');
            c2.drawImage(imgs[i], 0, 0, c.gw, c.gh);
            dockPov.drawResultPlate(c2, c.gw, c.gh, { title: 'The Hunting Grounds', lines });
            const d = c2.getImageData(0, 0, c.gw, c.gh);
            frames.push(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength));
        }
        const gif = encodeGif({ width: c.gw, height: c.gh, frames, delayMs: c.delayMs, loop: 0 });
        if (!gif || gif.length < 500) throw new Error('hunt gif encode failed');
        return { buffer: gif, contentType: 'image/gif' };
    });
}

/** `.j base hunting` viewer still — the clearing wearing the hour, herd in. */
async function paintStill(ctx, w, h, { biome = 'isle', lvl = 1, phase = null } = {}) {
    phase = phase || dayNight.phaseAt();
    paintFrame(ctx, w, h, 0, { biome, lvl });
    const sheet = await getHuntSpriteSheet();
    blitWildlife(ctx, w, h, 0, sheet, { biome, lvl });
    dockPov.paintCelestial(ctx, w, h, 0, phase, { glitter: false });
    dayNight.grade(ctx, w, h, phase);
    if (phase === 'night' || phase === 'dusk') {
        const A = campAnchors(w, h);
        dayNight.light(ctx, A.fire.x, A.fire.y, h * 0.13, '#ffb45a', phase === 'night' ? 0.6 : 0.34);
        dayNight.light(ctx, A.tent.x, A.tent.y, h * 0.07, '#ffcf7a', phase === 'night' ? 0.34 : 0.18, false);
        if (phase === 'night') {
            dayNight.moonStars(ctx, w, h, { seed: 901 + K.hashStr(String(biome)) % 97, moonX: 0.24, moonY: 0.10, stars: Math.round(22 * w / GW), skyH: HZ * 0.92 });
            dayNight.fireflies(ctx, w, h, 0, 71, 8, { x: 0, y: h * 0.34, w, h: h * 0.6 });
        }
    }
}

module.exports = {
    renderHuntGif, composeHunt, getHuntBaseFrames, getHuntSpriteSheet, paintStill, paintFrame,
    paintHuntOverlay, blitAnimal, blitWildlife, wildlifePlan, campAnchors, paintAnimal,
    PALETTES, ROW, SHEET_ROWS, GW, GH, FRAMES, DELAY_MS,
    CONTAINER_MAGIC, SHEET_MAGIC, CW, CH, COLS,
};
