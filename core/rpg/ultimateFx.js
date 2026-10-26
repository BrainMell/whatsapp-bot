'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  ULTIMATE FX — sprite-sheet driven class ultimates (rewrite 2026-10-25,
//  owner: "choppy and poorly animated, not free sets taken from across the web").
//
//  The old ultimates were hand-stroked canvas lines in a 6-frame GIF. This
//  engine composites REAL pixel-art VFX frame sets (core/rpgasset/vfx: magic /
//  holy / dark / attack strips) over the battle card on a timeline
//  (charge → cast → impact → settle) with camera shake, hit-stop, zoom punch,
//  additive glow, tint, particles and a title banner, rendered at 15fps and
//  encoded to H.264 MP4 (the only lane WhatsApp plays as an animation).
//
//  renderUltimateVideo({ baseBuffer, entry, classId, name, side, palette })
//     → { mp4: Buffer, thumb: Buffer(JPEG) } | null
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createCanvas, loadImage } = require('canvas');

const DIR = path.join(__dirname, '..', 'rpgasset', 'vfx');
const W = 640, H = 480, FPS = 15;
const DURATION = 2.7;                 // seconds (incl. settle hold)
const IMPACT = 1.05;                  // seconds: the hit lands

// ── sprite sets ─────────────────────────────────────────────────────────────
const SETS = {
    fire_bomb:  { dir: 'magic', prefix: 'Fire-bomb', n: 15, fps: 16 },
    lightning:  { dir: 'magic', prefix: 'Lightning', n: 11, fps: 18 },
    dark_bolt:  { dir: 'magic', prefix: 'Dark-Bolt', n: 12, fps: 16 },
    holy_burst: { dir: 'holy',  prefix: 'Holy VFX 02 ', n: 16, fps: 18 },
    holy_start: { dir: 'holy',  prefix: 'Holy VFX 01 Initial', n: 2, fps: 8 },
    holy_loop:  { dir: 'holy',  prefix: 'Holy VFX 01 Repeatable', n: 8, fps: 16 },
    holy_pillar:{ dir: 'holy',  prefix: 'Holy VFX 01 Impact', n: 7, fps: 14 },
    dark_a:     { dir: 'dark',  prefix: 'Dark VFX 1 (40x32)', n: 17, fps: 18 },
    dark_b:     { dir: 'dark',  prefix: 'Dark VFX 2 (48x64)', n: 16, fps: 16 },
    ice_shards: { strip: 'attack1.png', n: 4, fps: 8 },
    white_burst:{ strip: 'attack2.png', n: 4, fps: 10 },
    ice_beam:   { strip: 'attack3.png', n: 4, fps: 9 },
    fire_blast: { strip: 'attack4.png', n: 4, fps: 8 },
    fire_slash: { strip: 'attack5.png', n: 4, fps: 10 },
    vine_slash: { strip: 'attack6.png', n: 4, fps: 8 },
    claw:       { strip: 'attack7.png', n: 4, fps: 10 },
    // CC0 Foozle/Baldur pixel strips (48px tall) + Kenney smoke/explosion sets, see rpgasset/vfx/CREDITS.md
    necro1:     { root: 'foozle_necro_attack01.png', n: 7, fps: 12 },
    necro2:     { root: 'foozle_necro_attack02.png', n: 7, fps: 12 },
    necro3:     { root: 'foozle_necro_attack03.png', n: 12, fps: 14 },
    destroy:    { root: 'foozle_destroy.png', n: 6, fps: 12 },
    wave_big:   { root: 'foozle_wave_big.png', n: 3, fps: 8 },
    k_ground:   { kdir: 'ground_', n: 9, fps: 18, smooth: true },
    k_regular:  { kdir: 'regular_', n: 9, fps: 18, smooth: true },
    k_pixel:    { kdir: 'pixel_', n: 9, fps: 18 },
    k_simple:   { kdir: 'simple_', n: 9, fps: 18, smooth: true },
    k_sonic:    { kdir: 'sonic_', n: 9, fps: 20, smooth: true },
    k_sexp:     { kdir: 'sexp_', n: 5, fps: 12, smooth: true },
    k_flash:    { kdir: 'flash_', n: 5, fps: 14, smooth: true },
    k_puff:     { kdir: 'puff_', n: 13, fps: 16, smooth: true },
    k_bsmoke:   { kdir: 'bsmoke_', n: 13, fps: 14, smooth: true },
    k_gas:      { kdir: 'gas_', n: 5, fps: 8, smooth: true },
};
const LAYERS = (() => { try { return require('./ultimateFxLayers').LAYERS; } catch (e) { console.warn('[UltFx] layers unavailable:', e.message); return {}; } })();
const RECIPE_PACK = (() => { try { return require('./ultimateFxRecipes'); } catch (e) { console.warn('[UltFx] class recipes unavailable:', e.message); return null; } })();
const _singles = new Map();
async function loadSingles() {
    if (_singles.size) return _singles;
    const dir = path.join(DIR, 'kenney');
    try { for (const f of fs.readdirSync(dir)) if (/^p_.*\.png$/.test(f)) _singles.set(f.replace('.png', ''), await loadImage(path.join(dir, f))); } catch (e) { /* layers draw without sprites */ }
    return _singles;
}
const _frames = new Map();
const _tinted = new Map();

async function loadSet(name) {
    if (_frames.has(name)) return _frames.get(name);
    const def = SETS[name];
    const out = [];
    try {
        if (def.kdir) {
            for (let i = 1; i <= def.n; i++) out.push(await loadImage(path.join(DIR, 'kenney', `${def.kdir}${i}.png`)));
        } else if (def.strip || def.root) {
            const img = await loadImage(def.root ? path.join(DIR, def.root) : path.join(DIR, 'attack', def.strip));
            const fw = Math.floor(img.width / def.n);
            for (let i = 0; i < def.n; i++) {
                const c = createCanvas(fw, img.height);
                c.getContext('2d').drawImage(img, i * fw, 0, fw, img.height, 0, 0, fw, img.height);
                out.push(c);
            }
        } else {
            for (let i = 1; i <= def.n; i++) out.push(await loadImage(path.join(DIR, def.dir, `${def.prefix}${i}.png`)));
        }
    } catch (e) { out.length = 0; }
    _frames.set(name, out);
    return out;
}

function tintFrame(img, color, strength, key) {
    const k = key + '|' + color + '|' + strength;
    if (_tinted.has(k)) return _tinted.get(k);
    const c = createCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = strength;
    g.fillStyle = color;
    g.fillRect(0, 0, img.width, img.height);
    _tinted.set(k, c);
    return c;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 2);
function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── recipes ────────────────────────────────────────────────────────────────
// track: { fx, at (s), pos:'T'|'C'|'F'|[fx,fy], off:[px,py], to:'T'|'C'|[..] (travel over `dur`),
//          w (px width), dur, loop, alpha, add (additive), flip, rot, tint:[css,strength], n, jit:[jx,jy], gap (s between n) }
const RECIPES = {
    fire: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#ff7a1a', 0.35], add: true, alpha: 0.9 },
        { fx: 'fire_blast', at: IMPACT - 0.35, pos: 'T', w: 120, off: [0, -150], to: 'T', dur: 0.35, loop: true, alpha: 1 },
        { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 360, n: 3, jit: [70, 40], gap: 0.1, off: [0, 0] },
        { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 250, n: 2, jit: [30, 20], gap: 0.12, rot: [0.4, -0.7] },
        { fx: 'fire_bomb', at: IMPACT + 0.15, pos: 'T', w: 300, off: [0, -10], add: true, alpha: 0.85 },
    ],
    ice: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#59c8ff', 0.8], add: true, alpha: 0.9 },
        { fx: 'ice_beam', at: IMPACT - 0.45, pos: 'C', to: 'T', dur: 0.45, w: 220, loop: true },
        { fx: 'ice_beam', at: IMPACT, pos: 'T', w: 330, n: 2, jit: [60, 30], gap: 0.1 },
        { fx: 'ice_shards', at: IMPACT + 0.05, pos: 'T', w: 300, n: 3, jit: [70, 50], gap: 0.09 },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 260, add: true },
    ],
    slash: (p) => [
        { fx: 'white_burst', at: 0.1, pos: 'C', w: 160, dur: 0.8, add: true, alpha: 0.7, tint: [p[1], 0.6] },
        { fx: 'claw', at: IMPACT - 0.1, pos: 'T', w: 300, n: 4, jit: [50, 45], gap: 0.09, rot: [-0.5, 0.3, -0.2, 0.6] },
        { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 280, n: 2, jit: [25, 15], gap: 0.13, rot: [0.5, -0.9], tint: [p[1], 0.45] },
        { fx: 'white_burst', at: IMPACT + 0.02, pos: 'T', w: 300, add: true },
    ],
    shadow: (p) => [
        { fx: 'dark_a', at: 0.05, pos: 'C', w: 150, dur: 0.9, loop: true, alpha: 0.8 },
        { fx: 'dark_a', at: IMPACT - 0.45, pos: 'C', to: 'T', dur: 0.45, w: 150, n: 3, jit: [0, 40], gap: 0.06, loop: true },
        { fx: 'claw', at: IMPACT, pos: 'T', w: 300, n: 4, jit: [60, 50], gap: 0.08, rot: [-0.7, 0.5, -0.3, 0.8], tint: ['#9d86ff', 0.8] },
        { fx: 'dark_b', at: IMPACT + 0.05, pos: 'T', w: 300, off: [0, -20] },
    ],
    holy: (p) => [
        { fx: 'holy_start', at: 0.05, pos: 'C', w: 120, dur: 0.9, loop: true, add: true },
        { fx: 'holy_burst', at: 0.15, pos: 'C', w: 220, dur: 0.9, add: true, alpha: 0.7 },
        { fx: 'holy_pillar', at: IMPACT - 0.2, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [90, 0], gap: 0.08 },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 380, add: true },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 300, add: true },
    ],
    holySelf: (p) => [
        { fx: 'holy_burst', at: 0.05, pos: 'C', w: 330, add: true },
        { fx: 'holy_loop', at: 0.2, pos: 'C', w: 180, off: [0, -40], dur: 1.6, loop: true, add: true },
        { fx: 'holy_pillar', at: IMPACT - 0.3, pos: 'C', w: 300, off: [0, -130], n: 2, jit: [60, 0], gap: 0.12 },
        { fx: 'holy_burst', at: IMPACT, pos: 'C', w: 420, add: true, alpha: 0.9 },
    ],
    dark: (p) => [
        { fx: 'dark_b', at: 0.05, pos: 'C', w: 200, dur: 0.9, loop: true, alpha: 0.85 },
        { fx: 'dark_bolt', at: IMPACT - 0.5, pos: 'C', to: 'T', dur: 0.5, w: 210 },
        { fx: 'dark_bolt', at: IMPACT, pos: 'T', w: 340, n: 2, jit: [50, 30], gap: 0.1 },
        { fx: 'dark_b', at: IMPACT + 0.05, pos: 'T', w: 330, n: 2, jit: [60, 30], gap: 0.14, off: [0, -20] },
        { fx: 'dark_a', at: IMPACT + 0.1, pos: 'T', w: 180, n: 4, jit: [110, 70], gap: 0.07 },
    ],
    storm: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#7de7ff', 0.7], add: true },
        { fx: 'lightning', at: IMPACT - 0.35, pos: 'T', w: 300, off: [-10, -60], n: 5, jit: [95, 25], gap: 0.07 },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 320, add: true },
        { fx: 'lightning', at: IMPACT + 0.25, pos: 'T', w: 260, n: 3, jit: [80, 30], gap: 0.09 },
    ],
    nature: (p) => [
        { fx: 'vine_slash', at: 0.05, pos: 'C', w: 180, dur: 0.9, loop: true, alpha: 0.9 },
        { fx: 'vine_slash', at: IMPACT - 0.3, pos: 'T', w: 330, n: 4, jit: [70, 45], gap: 0.1, rot: [0, 0.8, -0.8, 1.6] },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 300, tint: ['#55d65b', 0.85], add: true },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 240, tint: ['#9cff7a', 0.6], add: true },
    ],
    gold: (p) => [
        { fx: 'holy_burst', at: 0.05, pos: 'C', w: 240, add: true, tint: ['#ffc531', 0.9] },
        { fx: 'holy_pillar', at: IMPACT - 0.3, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [100, 0], gap: 0.07, tint: ['#ffcf3a', 0.85] },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 380, add: true, tint: ['#ffcf3a', 0.9] },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 260, add: true, tint: ['#ffe27a', 0.8] },
    ],
    cataclysm: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 160, dur: 0.9, add: true },
        { fx: 'ice_shards', at: IMPACT - 0.3, pos: 'T', w: 300, n: 2, jit: [80, 40], gap: 0.1 },
        { fx: 'lightning', at: IMPACT - 0.25, pos: 'T', w: 280, n: 3, jit: [100, 20], gap: 0.08 },
        { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 400, n: 3, jit: [80, 45], gap: 0.1 },
        { fx: 'fire_bomb', at: IMPACT + 0.1, pos: 'T', w: 340, add: true },
    ],
    void: (p) => [
        { fx: 'dark_b', at: 0.0, pos: 'T', w: 260, dur: 1.0, loop: true, alpha: 0.9, off: [0, -10] },
        { fx: 'dark_b', at: 0.2, pos: 'T', w: 360, dur: 0.9, loop: true, alpha: 0.6, tint: ['#7a4cff', 0.5], add: true },
        { fx: 'dark_bolt', at: IMPACT - 0.2, pos: 'T', w: 360, n: 3, jit: [60, 40], gap: 0.09, tint: ['#9d6bff', 0.6] },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 280, add: true, tint: ['#b794ff', 0.7] },
    ],
};

const STYLE_RECIPE = {
    FIGHTER: 'slash', WARRIOR: 'slash', SAMURAI: 'slash', SHOGUN: 'slash', BERSERKER: 'fireSlash',
    SCOUT: 'slash', ROGUE: 'shadow', NINJA: 'shadow', KAGE: 'shadow', NIGHTBLADE: 'shadow',
    APPRENTICE: 'fire', MAGE: 'fire', DRAGONSLAYER: 'fire', DRAGON_GOD: 'fire', DRAGON_LORD: 'fire', DOOMSLAYER: 'fire', WARLORD: 'fire',
    ELEMENTALIST: 'cataclysm', AVATAR: 'cataclysm',
    ACOLYTE: 'holy', PALADIN: 'holy', CLERIC: 'holy', SAINT: 'holy', DIVINE_FIST: 'holySelf', MONK: 'holySelf', ZENMASTER: 'holySelf', TEMPLAR: 'holySelf', GOD_HAND: 'holySelf',
    NECROMANCER: 'dark', WARLOCK: 'dark', LICH: 'dark', DEATH_LORD: 'dark', REAPER: 'dark', VIRTUOSO: 'dark',
    VOIDWALKER: 'void', ARCHMAGE: 'void',
    CHRONOMANCER: 'storm', TIMELORD: 'storm', ARTIFICER: 'storm', GRAND_INVENTOR: 'storm', BARD: 'ice',
    DRUID: 'nature', ARCHDRUID: 'nature',
    MERCHANT: 'gold', TYCOON: 'gold',
};
RECIPES.fireSlash = (p) => [
    ...RECIPES.slash(p).slice(0, 2),
    { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 320, n: 2, jit: [60, 35], gap: 0.1 },
    { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 300, n: 2, jit: [25, 15], gap: 0.13, rot: [0.5, -0.9] },
];

// ── drawing ─────────────────────────────────────────────────────────────────
function anchor(spec, A) {
    if (Array.isArray(spec)) return [spec[0] * W, spec[1] * H];
    return A[spec] || A.T;
}

function drawTrackInstances(ctx, tr, sets, A, time, rng, palette) {
    const frames = sets[tr.fx];
    if (!frames || !frames.length) return;
    const def = SETS[tr.fx];
    const n = tr.n || 1, gap = tr.gap || 0;
    for (let i = 0; i < n; i++) {
        const t0 = tr.at + i * gap;
        const dur = tr.dur || (frames.length / def.fps);
        let lt = time - t0;
        if (lt < 0) continue;
        if (!tr.loop && lt > dur + 0.04) continue;
        if (tr.loop && tr.dur && lt > tr.dur) continue;
        // per-instance deterministic jitter
        const jr = mulberry(hash(tr.fx + i + tr.at));
        const jx = tr.jit ? (jr() - 0.5) * 2 * tr.jit[0] : 0, jy = tr.jit ? (jr() - 0.5) * 2 * tr.jit[1] : 0;
        let [px, py] = tr._pt ? [tr._pt[0], tr._pt[1]] : anchor(tr.pos, A);
        if (tr.to) {
            const [qx, qy] = tr._ptTo ? [tr._ptTo[0], tr._ptTo[1]] : anchor(tr.to, A);
            const u = easeIn(lt / (tr.dur || 0.4));
            px = px + (qx - px) * u; py = py + (qy - py) * u;
        }
        px += (tr.off ? tr.off[0] : 0) + jx; py += (tr.off ? tr.off[1] : 0) + jy;
        const fi = tr.loop ? Math.floor(lt * def.fps) % frames.length : Math.min(frames.length - 1, Math.floor(lt * def.fps * (frames.length / (dur * def.fps))));
        let img = frames[fi];
        if (tr.tint) img = tintFrame(img, tr.tint[0], tr.tint[1], tr.fx + fi);
        const w = tr.w || 200, h = w * (img.height / img.width);
        const fade = tr.loop ? 1 : Math.min(1, (dur - lt) / 0.2 + 0.2);
        const rot = Array.isArray(tr.rot) ? tr.rot[i % tr.rot.length] : (tr.rot || 0);
        ctx.save();
        // 💡 GLITCH FIX (2026-10-26, owner: "weird rectangle thing where the
        // monster was"): these fx sheets are 48-64px pixel art that get blown
        // up 3-5x on the 640x480 video - nearest-neighbour at that ratio
        // shatters the sprite into hard red/black blocks (the necro3 crown
        // read as corrupted glitch rectangles around the sinking monster).
        // Smooth every upscale; keep the sheet's own crispness at 1x / down.
        const upscaling = w > img.width * 1.5;
        ctx.imageSmoothingEnabled = upscaling || !!def.smooth;
        if (upscaling) ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = (tr.alpha !== undefined ? tr.alpha : 1) * Math.min(1, fade) * Math.min(1, lt / 0.06 + 0.25);
        if (tr.add) ctx.globalCompositeOperation = 'lighter';
        ctx.translate(px, py);
        if (rot) ctx.rotate(rot);
        if (tr.flip || (tr.to && A.T[0] < A.C[0])) ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
}

function glow(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', String(a)));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

function rgba(hex, a) {
    const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function embers(ctx, A, time, palette, seed) {
    const r = mulberry(seed);
    for (let i = 0; i < 26; i++) {
        const born = r() * (DURATION - 0.6), life = 0.7 + r() * 0.7;
        const lt = time - born; if (lt < 0 || lt > life) continue;
        const near = born < IMPACT ? A.C : A.T;
        const bx = near[0] + (r() - 0.5) * 120, by = near[1] + (r() - 0.2) * 60;
        const vx = (r() - 0.5) * 90, vy = -50 - r() * 90;
        const x = bx + vx * lt, y = by + vy * lt + 60 * lt * lt;
        const s = 3 + Math.floor(r() * 3) * 2;
        ctx.save(); ctx.globalAlpha = (1 - lt / life) * 0.9; ctx.fillStyle = palette[Math.floor(r() * 3)];
        ctx.fillRect(Math.round(x), Math.round(y), s, s); ctx.restore();
    }
}

function banner(ctx, time, name, color, lvl, maxLvl) {
    const a = Math.min(1, time / 0.2) * (time < 1.6 ? 1 : Math.max(0, 1 - (time - 1.6) / 0.35));
    if (a <= 0 || !name) return;
    const slide = (1 - easeOut(time / 0.3)) * 60;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = String(name).toUpperCase();
    const w = ctx.measureText(txt).width + 70;
    const x = W / 2 - slide, y = 54;
    ctx.fillStyle = 'rgba(6,6,14,0.62)';
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 18, y + 24); ctx.lineTo(x - w / 2, y - 24); ctx.lineTo(x + w / 2 + 18, y - 24); ctx.lineTo(x + w / 2, y + 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(txt, x, y + 1);
    ctx.fillStyle = '#fff6d6'; ctx.fillText(txt, x, y + 1);
    if (lvl && maxLvl && maxLvl > 1) {   // skill-level pips under the name
        const n = Math.min(maxLvl, 5), gap = 16, x0 = x - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + i * gap, y + 34, 5, 0, 7); ctx.fillStyle = i < lvl ? color : 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke(); }
    }
    ctx.restore();
}

function fallbackBase() {
    const c = createCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171e35'); gr.addColorStop(0.63, '#32344a'); gr.addColorStop(1, '#10121f');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c;
}

// 💡 MULTI-TARGET SPRITE FX (2026-10-26, owner: "fix up the vfx for individual
// and multiple opponents - instead of pulling down a cut out of the sprite and
// the background just grab the individual or multiple enemy sprites and affect
// them"): tint a REAL fighter cutout (transparent PNG from the Go layers
// payload) with the class colour. The silhouette keeps a hint of the original
// sprite detail so the fighter still reads through the colour, and the affect
// layer composites it additively over the untouched overlay - the colour lands
// ONLY on the fighter's own pixels, never as a rectangle patch of the frame.
function tintCutout(img, hex) {
    if (!img) return null;
    try {
        const c = createCanvas(img.width, img.height), g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = hex;
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 0.45;
        g.globalCompositeOperation = 'source-over';
        g.drawImage(img, 0, 0);
        return c;
    } catch (e) { return null; }
}

// ── video HUD - medieval bottom-left plate (2026-10-26 round 2) ────────────
// Owner round 2: "simple at the bottom left, name + hp + energy, medieval rpg
// themed" - the dark-glass neo rail is GONE. The ultimate video's base frame
// is a hud:"none" battlefield, so effects can never bake over the panel; this
// painter draws the caster's plate as the FINAL pass (after flash/vignette/
// banner, outside the camera transform). Same recipe as the Go renderer's
// battle plate (box1 e1af254): walnut panel, gold trim + corner accents, the
// game's own heart.png / mana.png icons, deep red HP + mana-blue energy bars
// with numeric readouts. Bottom-left corner - sprite feet cap ~307 in video
// space, the plate starts at y=368, so it can never cover a fighter.
const _hudIcons = new Map();
async function loadHudIcons() {
    if (_hudIcons.has('set')) return _hudIcons.get('set');
    const set = { heart: null, mana: null };
    try { set.heart = await loadImage(path.join(__dirname, '..', 'rpgasset', 'ui', 'heart.png')); } catch (e) { /* fallback shape */ }
    try { set.mana = await loadImage(path.join(__dirname, '..', 'rpgasset', 'ui', 'mana.png')); } catch (e) { /* fallback shape */ }
    _hudIcons.set('set', set);
    return set;
}

function hudFitText(ctx, text, cx, y, maxW, px, color) {
    let size = px;
    while (size >= 9) {
        ctx.font = 'bold ' + Math.round(size) + 'px sans-serif';
        if (ctx.measureText(text).width <= maxW || size <= 9) break;
        size -= 1;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(text, cx + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(text, cx, y);
}

function hudRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function hudMedievalPanel(ctx, x0, y0, w, h) {
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, 'rgba(43,31,17,0.97)'); grad.addColorStop(0.55, 'rgba(29,20,9,0.98)'); grad.addColorStop(1, 'rgba(18,11,4,0.99)');
    ctx.fillStyle = grad; ctx.fillRect(x0, y0, w, h);
    // faint top sheen so the name strip reads slightly lit
    const sh = ctx.createLinearGradient(0, y0, 0, y0 + 46);
    sh.addColorStop(0, 'rgba(255,223,158,0.10)'); sh.addColorStop(1, 'rgba(255,223,158,0)');
    ctx.fillStyle = sh; ctx.fillRect(x0, y0, w, 46);
    // near-black outer frame
    ctx.strokeStyle = 'rgba(6,3,2,1)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    // gold trim + corner accents
    const tx0 = x0 + 5, ty0 = y0 + 5, tx1 = x0 + w - 5, ty1 = y0 + h - 5;
    ctx.strokeStyle = 'rgba(201,161,59,0.9)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    ctx.fillStyle = 'rgba(231,199,102,1)';
    const cl = 12, ct = 3;
    ctx.fillRect(tx0 - 1, ty0 - 1, cl, ct); ctx.fillRect(tx0 - 1, ty0 - 1, ct, cl);
    ctx.fillRect(tx1 + 1 - cl, ty0 - 1, cl, ct); ctx.fillRect(tx1 + 1 - ct, ty0 - 1, ct, cl);
    ctx.fillRect(tx0 - 1, ty1 + 1 - ct, cl, ct); ctx.fillRect(tx0 - 1, ty1 + 1 - cl, ct, cl);
    ctx.fillRect(tx1 + 1 - cl, ty1 + 1 - ct, cl, ct); ctx.fillRect(tx1 + 1 - ct, ty1 + 1 - cl, ct, cl);
}

function hudBarMedieval(ctx, x, y, w, h, pct, kind, label) {
    pct = Math.max(0, Math.min(1, pct));
    hudRoundRect(ctx, x, y, w, h, 5); ctx.fillStyle = 'rgba(16,11,6,0.95)'; ctx.fill();
    if (pct > 0) {
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        if (kind === 'hp') {
            if (pct < 0.25) { grad.addColorStop(0, '#c0392b'); grad.addColorStop(0.5, '#8f1a10'); grad.addColorStop(1, '#5c0f08'); }
            else { grad.addColorStop(0, '#d2552e'); grad.addColorStop(0.5, '#a52a18'); grad.addColorStop(1, '#6e150c'); }
        } else { grad.addColorStop(0, '#4b7fc4'); grad.addColorStop(0.5, '#2c549b'); grad.addColorStop(1, '#16315e'); }
        hudRoundRect(ctx, x, y, Math.max(w * pct, h * 0.8), h, 5); ctx.fillStyle = grad; ctx.fill();
        const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
        gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        hudRoundRect(ctx, x + 1.5, y + 1.5, Math.max(w * pct - 3, h * 0.4), h * 0.5, 4); ctx.fillStyle = gl; ctx.fill();
    }
    hudRoundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5);
    ctx.strokeStyle = 'rgba(201,161,59,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    // numeric readout (right of the bar)
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, x + w + 7, y + h / 2 + 1);
    ctx.fillStyle = '#f3ecd8'; ctx.fillText(label, x + w + 6, y + h / 2);
}

function drawVideoHud(ctx, hud, icons) {
    if (!hud || typeof hud !== 'object' || !icons) return;
    const PX = -10, PY = 368, PW = 262, PH = 118; // bottom-left corner bleed, same proportions as the Go plate
    hudMedievalPanel(ctx, PX, PY, PW, PH);
    const visCx = PX + PW / 2 + 6; // compensate the left bleed like the Go plate

    // name
    hudFitText(ctx, String(hud.name || 'Champion'), visCx, PY + 22, PW - 46, 15, '#f3ecd8');

    // gold divider with center diamond
    const dvy = PY + 39.75;
    ctx.fillStyle = 'rgba(201,161,59,0.85)'; ctx.fillRect(visCx - 106, dvy - 0.75, 212, 1.5);
    const dr = 4;
    ctx.beginPath();
    ctx.moveTo(visCx, dvy - dr); ctx.lineTo(visCx + dr, dvy); ctx.lineTo(visCx, dvy + dr); ctx.lineTo(visCx - dr, dvy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(231,199,102,1)'; ctx.fill();

    // HP row: heart icon + red bar + numerics
    if (icons.heart) {
        ctx.drawImage(icons.heart, PX + 16, PY + 46, 20, 24);
    } else {
        ctx.fillStyle = '#b3202a';
        ctx.beginPath(); ctx.arc(PX + 21, PY + 55, 5.5, 0, Math.PI * 2); ctx.arc(PX + 27, PY + 55, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(PX + 15.5, PY + 57); ctx.lineTo(PX + 24, PY + 70); ctx.lineTo(PX + 32.5, PY + 57); ctx.closePath(); ctx.fill();
    }
    hudBarMedieval(ctx, PX + 42, PY + 51, 140, 13,
        hud.maxHp > 0 ? hud.hp / hud.maxHp : 0, 'hp',
        `${Math.max(0, Math.floor(hud.hp || 0))} / ${Math.max(1, Math.floor(hud.maxHp || 1))}`);

    // Energy row: mana icon + blue bar + numerics
    if (icons.mana) {
        ctx.drawImage(icons.mana, PX + 18, PY + 74, 16, 24);
    } else {
        ctx.fillStyle = '#2f6bbf';
        ctx.beginPath(); ctx.arc(PX + 26, PY + 90, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(PX + 20.5, PY + 88); ctx.lineTo(PX + 26, PY + 76); ctx.lineTo(PX + 31.5, PY + 88); ctx.closePath(); ctx.fill();
    }
    hudBarMedieval(ctx, PX + 42, PY + 78, 140, 12,
        hud.maxEnergy > 0 ? hud.energy / hud.maxEnergy : 0, 'en',
        `${Math.max(0, Math.floor(hud.energy || 0))} / ${Math.max(1, Math.floor(hud.maxEnergy || 1))}`);
}

// ── encode ──────────────────────────────────────────────────────────────────
function encodeMp4(frames) {
    return new Promise((resolve, reject) => {
        const out = path.join(os.tmpdir(), `ult_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`);
        const args = ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22', '-movflags', '+faststart', '-an', out];
        const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
        p.on('error', reject);
        p.on('exit', (code) => {
            try {
                if (code !== 0) return reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-300)));
                const b = fs.readFileSync(out); fs.unlinkSync(out); resolve(b);
            } catch (e) { reject(e); }
        });
        (async () => {
            for (const f of frames) { if (!p.stdin.write(f)) await new Promise((r) => p.stdin.once('drain', r)); }
            p.stdin.end();
        })().catch((e) => { try { p.kill('SIGKILL'); } catch (e2) {} reject(e); });
    });
}

// ── main ────────────────────────────────────────────────────────────────────
// 🔴 HP DROP painter (owner: "the hp bar drops"): 1:1 mimic of the Go
// drawOverheadHPBar look (dark rounded track + left→right darkred→orange
// fill, 1px inset) at the Go bars' exact geometry - enemy bars 100x12 @
// (center-50, top-15), player/duelist bars 80x10 @ (center-40, top-12),
// scaled Go-canvas → video. The track is padded 1.5px so the baked bar in
// the base scene NEVER peeks out from behind the animated repaint.
function drawVictimHpBar(ctx, x, y, w, h, pct, flashK) {
    pct = Math.max(0, Math.min(1, pct));
    const pad = 1.5, r = Math.max(1.5, 3 * (w / 100));
    ctx.save();
    hudRoundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, r);
    ctx.fillStyle = 'rgba(10,10,15,0.94)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    const ix = x + 1, iy = y + 1, ih = h - 2;
    const iw = (w - 2) * pct;
    if (iw >= 0.75) {
        const fillW = Math.max(iw, 1.5);
        const grad = ctx.createLinearGradient(ix, 0, ix + fillW, 0);
        grad.addColorStop(0, '#db1f1a'); grad.addColorStop(1, '#ffab26');
        hudRoundRect(ctx, ix, iy, fillW, ih, Math.max(1, r - 0.75));
        ctx.fillStyle = grad; ctx.fill();
        // 2-frame white hit-flash on the fill the moment the bar starts dropping
        if (flashK > 0) {
            ctx.fillStyle = `rgba(255,244,224,${(0.8 * flashK).toFixed(3)})`;
            ctx.fill();
        }
    }
    ctx.restore();
}

async function renderUltimateVideo(o) {
    const palette = o.palette && o.palette.length >= 3 ? o.palette : ['#fff1b0', '#ffcb45', '#e85a37'];
    const recipeKey = STYLE_RECIPE[String(o.classId || '').toUpperCase()] || 'fire';
    const sets = {};
    const classTracks = RECIPE_PACK && RECIPE_PACK.classRecipe ? RECIPE_PACK.classRecipe(String(o.classId || '').toUpperCase(), palette, { IMPACT }) : null;
    let tracks = classTracks || RECIPES[recipeKey](palette);
    // skill level -> intensity (see ultimateFxRecipes.scaleTracks); 0..1, default 0 = the original look (level 1)
    const K = Number.isFinite(Number(o.intensity)) ? Math.max(0, Math.min(1, Number(o.intensity))) : 0;
    if (RECIPE_PACK && RECIPE_PACK.scaleTracks) tracks = RECIPE_PACK.scaleTracks(tracks, K, palette, IMPACT);
    for (const t of tracks) {
        for (const nm of [t.fx, t.land]) if (nm && SETS[nm] && !sets[nm]) sets[nm] = await loadSet(nm);
    }
    const singles = await loadSingles();
    if (!Object.values(sets).some((s) => s && s.length) && !tracks.some((t) => t.layer)) return null;     // assets missing → caller falls back to the legacy renderer

    // 💡 VFX LAYERS (2026-10-26, owner VFX-alignment round): optional layered
    // base from the Go renderer - bg WITHOUT combatants + a transparent
    // combatants overlay + the isolated focus combatant + exact per-combatant
    // feet anchors. This is what makes ground fx render UNDER the fighters
    // (summon circles, army-of-dead rift) and air fx OVER them (hands, bolts),
    // with every spell origin pinned to the real sprite feet.
    let layers = null;
    let sprImg = null, focImg = null;
    if (o.layers && Buffer.isBuffer(o.layers.bg) && Buffer.isBuffer(o.layers.sprites)) {
        try { sprImg = await loadImage(o.layers.sprites); } catch (e) { sprImg = null; }
        if (sprImg && o.layers.focus) { try { focImg = await loadImage(o.layers.focus); } catch (e) { focImg = null; } }
        if (sprImg) layers = o.layers; else console.warn('[UltFx] layers payload broken (sprites undecodable) - plain base');
    }

    let base = null;
    if (layers && Buffer.isBuffer(layers.bg)) { try { base = await loadImage(layers.bg); } catch (e) { base = null; } }
    if (!base && Buffer.isBuffer(o.baseBuffer) && o.baseBuffer.length > 1000) { try { base = await loadImage(o.baseBuffer); } catch (e) { base = null; } }
    if (!base) base = fallbackBase();
    const hudIcons = o.hud && typeof o.hud === 'object' ? await loadHudIcons() : null;

    const self = o.side === 'self';
    const A = { C: [W * 0.27, H * 0.62], T: self ? [W * 0.27, H * 0.58] : [W * 0.72, H * 0.58], F: [W * 0.5, H * 0.55] };
    // 💡 VFX LAYERS: pin C/T to the REAL sprite feet ("spells starting points
    // not on the players" - the old fixed 0.27W/0.72W fractions missed the
    // caster whenever the formation moved). Go canvas -> video space scale.
    let focRect = null, casterRect = null;
    if (layers && Array.isArray(layers.anchors) && layers.anchors.length) {
        const kx = W / (Number(layers.w) || 1024), ky = H / (Number(layers.h) || 687);
        const find = (side, idx) => layers.anchors.find((v) => v && v.side === side && v.index === idx);
        const rectOf = (a) => [a.x * kx, a.feetY * ky, Math.max(24, a.w * kx), Math.max(24, a.h * ky)];
        const caster = find('player', Math.max(0, Math.floor(Number(o.casterIndex) || 0))) || find('player', 0);
        if (caster) { A.C = [caster.x * kx, caster.feetY * ky]; casterRect = rectOf(caster); }
        if (self) { A.T = A.C.slice(); }
        else {
            // 💡 PVP VFX (2026-10-26, owner: "I dont see the vfx in pvps dude"):
            // in duels the target is the OTHER DUELIST, which the Go layers
            // payload also reports as side "player". targetSide picks which
            // roster the target anchor is looked up on (PvP casts pass 'player').
            const tSide = String(o.targetSide || 'enemy');
            // focusIndex = the defender's real roster index (PvP) - targetIndex
            // 0 is the pseudo-enemy index and would anchor the wrong duelist
            const ti = Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined
                ? Math.max(0, Math.floor(Number(o.focusIndex)))
                : Math.max(0, Math.floor(Number(o.targetIndex) || 0));
            const tgt = find(tSide, ti)
                || layers.anchors.find((v) => v && v.side === tSide);
            if (tgt) { A.T = [tgt.x * kx, tgt.feetY * ky]; if (!focRect) focRect = rectOf(tgt); }
        }
        const fa = find(String(o.focusSide || String(o.targetSide || 'enemy')), Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined ? Math.max(0, Math.floor(Number(o.focusIndex))) : Math.max(0, Math.floor(Number(o.targetIndex) || 0)));
        if (fa) focRect = rectOf(fa);
    }
    // the isolated focus monster is drawn BY the hands layer while it sinks
    const sinkOwnsFocus = !!(layers && focImg && !self && tracks.some((t) => t.layer === 'hands' && t.sink));

    // 💡 MULTI-TARGET SPRITE FX (2026-10-26, owner: "fix up the vfx for
    // individual and multiple opponents - instead of pulling down a cut out of
    // the sprite and the background just grab the individual or multiple enemy
    // sprites and affect them"): the Go layers payload now ships every fighter
    // as its own transparent cutout. Resolve the affected set - the single
    // target (the caster for self-casts), or the WHOLE enemy roster when the
    // cast is AoE - and pre-tint each REAL sprite once. The affect layer draws
    // these tinted fighters exactly over their originals every frame.
    const kxL = layers ? W / (Number(layers.w) || 1024) : 1;
    const kyL = layers ? H / (Number(layers.h) || 687) : 1;
    const tSideAll = String(o.targetSide || 'enemy');
    const casterIdxAll = Math.max(0, Math.floor(Number(o.casterIndex) || 0));
    const focusIdxAll = Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined
        ? Math.max(0, Math.floor(Number(o.focusIndex)))
        : Math.max(0, Math.floor(Number(o.targetIndex) || 0));
    let affectList = [];
    // 🔴 HURT FLASH list (owner: "when the attack hits make the victim have a
    // hurt red flashing overlay animation"): the SAME affected cutouts, tinted
    // hurt-red, pulsed by LAYERS.hurt at the impact moment. Offensive casts
    // only - a heal/buff never reads as "hurt".
    let hurtList = [];
    if (layers && Array.isArray(layers.cuts) && layers.cuts.length) {
        const cutImgs = [];
        await Promise.all(layers.cuts.map(async (c) => {
            if (!c || !c.png) return;
            try {
                cutImgs.push({
                    side: String(c.side || ''), index: Math.floor(Number(c.index) || 0),
                    x: (Number(c.x) || 0) * kxL, y: (Number(c.y) || 0) * kyL,
                    w: Math.max(4, (Number(c.w) || 0) * kxL), h: Math.max(4, (Number(c.h) || 0) * kyL),
                    img: await loadImage(Buffer.from(c.png, 'base64')),
                });
            } catch (e) { /* a broken cutout never kills the video */ }
        }));
        const findCut = (side, idx) => cutImgs.find((c) => c.side === side && c.index === idx);
        // the roster that gets hit: enemy side for offenses, the party for
        // self-casts; the caster is never affected by their own offense
        const roster = cutImgs.filter((c) => c.side === (self ? 'player' : tSideAll))
            .filter((c) => self || !(tSideAll === 'player' && c.index === casterIdxAll));
        let affected = [];
        if (self) affected = o.aoe ? roster.slice() : (findCut('player', casterIdxAll) ? [findCut('player', casterIdxAll)] : []);
        else if (o.aoe) affected = roster.slice();
        else {
            const fc = findCut(tSideAll, focusIdxAll) || cutImgs.find((c) => c.side === tSideAll) || null;
            if (fc) affected = [fc];
        }
        // a sinking focus is owned by the hands layer - tinting its original
        // position would ghost above the descending sprite
        if (sinkOwnsFocus) affected = affected.filter((c) => !(c.side === tSideAll && c.index === focusIdxAll));
        const tintHex = self ? '#ffe9a8' : (palette[1] || '#ffffff');
        for (const c of affected) {
            const tinted = tintCutout(c.img, tintHex);
            if (tinted) affectList.push({ x: c.x, y: c.y, w: c.w, h: c.h, tinted });
            if (!self) {
                const red = tintCutout(c.img, '#ff2222');
                if (red) hurtList.push({ x: c.x, y: c.y, w: c.w, h: c.h, tinted: red });
            }
        }
    }

    // 💡 AoE FAN (same owner quote): when the cast is AoE, every track flagged
    // spread:'enemies' is replicated per enemy anchor so meteors / arrows /
    // shards / rings / pillars / vines hit EACH opponent - not one shared
    // impact point. Single-target casts keep the focused timeline untouched.
    if (layers && o.aoe && Array.isArray(layers.anchors) && layers.anchors.length) {
        const casterIdxFan = casterIdxAll;
        const fanPts = layers.anchors
            .filter((v) => v && v.side === (self ? 'player' : tSideAll))
            .filter((v) => self || !(v.side === 'player' && v.index === casterIdxFan))
            .sort((a, b) => a.x - b.x)
            .map((a) => [a.x * kxL, a.feetY * kyL]);
        if (fanPts.length > 1) {
            const expanded = [];
            for (const tr of tracks) {
                if (tr.spread === 'enemies' && tr.layer !== 'hands') {
                    fanPts.forEach((p2, i) => {
                        const rep = Object.assign({}, tr, { _pt: p2, _ptTo: p2 });
                        if (i > 0) rep.at = (Number(tr.at) || 0) + i * (tr.fanGap || 0.06);
                        expanded.push(rep);
                    });
                } else expanded.push(tr);
            }
            tracks = expanded;
        }
    }

    // 🔴 HP DROP victims (owner: "the hp bar drops"): the overhead bars are
    // BAKED into the Go base scene at pre-hit values, so a landed ultimate
    // used to read as "nothing happened to that bar". Repaint the VICTIMS'
    // bars from the impact onward: white hit-flash, then the fill chips down
    // a proportional chunk (24-42% of the CURRENT bar, deterministic per cast
    // - real damage resolves after the video plays; the post-ult combat card
    // stays authoritative) and holds. Single-target drops the focus bar, AoE
    // drops every victim bar with the same small stagger as the impact fan.
    const victims = new Map();
    if (Array.isArray(o.targets)) {
        for (const t of o.targets) {
            const idx = Math.floor(Number(t && t.index) || 0);
            const hp = Number(t && t.hp), maxHp = Number(t && t.maxHp);
            if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0 || hp <= 0) continue;
            const pct0 = Math.max(0.02, Math.min(1, hp / maxHp));
            const rv = mulberry(hash('hpdrop' + idx + (o.classId || '') + (o.name || '')))();
            const p1 = Math.max(0.03, pct0 * (0.58 + 0.18 * rv));
            victims.set(idx, { pct0, p1 });
        }
    }
    const dropAll = !!o.aoe;

    // every ultimate gets the per-fighter impact unless the recipe ships its
    // own affect track; self-casts glow warm gold, offenses in the class colour.
    // 💡 QA round: 'hold' curve + 1.25s so the colour wash is still readable
    // on the fighters AFTER the impact fx fade (a bell at IMPACT was buried
    // under the explosion sprites and read as invisible; the tail now lingers
    // into the settle for a clear "this fighter was hit by THAT spell" read).
    if (layers && affectList.length && !tracks.some((t) => t.layer === 'affect')) {
        tracks.push({ layer: 'affect', at: IMPACT, dur: 1.25, curve: 'hold', a: self ? 0.7 : 0.9 });
    }
    // 🔴 HURT FLASH auto-track: fires on every offensive cast that has real
    // victim cutouts - flash + echo land BEFORE the class-colour wash above
    // settles, so the hit reads red first, class colour second.
    if (layers && hurtList.length && !tracks.some((t) => t.layer === 'hurt')) {
        tracks.push({ layer: 'hurt', at: IMPACT + 0.01, dur: 0.5, a: 0.85 });
    }
    const seed = hash((o.classId || '') + (o.name || ''));
    const total = Math.round(DURATION * FPS);
    const frames = [];
    let thumb = null;
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    for (let f = 0; f < total; f++) {
        const time = f / FPS;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true;
        // camera: slow push-in while charging, punch + shake on impact, hit-stop (freeze) 2 frames
        const sinceHit = time - IMPACT;
        const hitStop = sinceHit >= 0 && sinceHit < 2 / FPS;
        // CAMERA-CALM (owner: "VFX background movement unnatural"): the old
        // 0.05 push + wide pan made the whole battlefield swim. Zoom stays,
        // drift is now barely-there; impact punch + shake untouched.
        const push = time < IMPACT ? easeIn(time / IMPACT) * 0.03 : 0.03 * (1 - easeOut((sinceHit - 0.1) / 0.8));
        const punch = sinceHit >= 0 ? Math.max(0, 1 - sinceHit / 0.35) * 0.07 : 0;
        const zoom = 1 + push + punch;
        const shk = 1 + 0.6 * K;   // skill level -> camera punch
        const amp = hitStop ? 0 : (sinceHit >= 0 && sinceHit < 0.7 ? 16 * shk * Math.pow(1 - sinceHit / 0.7, 2) : (time < IMPACT ? 1.2 * shk * easeIn(time / IMPACT) : 0));
        const sx = Math.sin(f * 2.31 + seed) * amp, sy = Math.cos(f * 3.17 + seed) * amp * 0.6;
        const fx = A.T[0] / W, fy = A.T[1] / H;
        ctx.save();
        ctx.translate(W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18) + sx, H * (0.5 + (fy - 0.5) * 0.12) + sy);
        ctx.scale(zoom, zoom);
        ctx.translate(-W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18), -H * (0.5 + (fy - 0.5) * 0.12));
        ctx.drawImage(base, 0, 0, W, H);
        // 💡 VFX LAYERS round (2026-10-26): layered compositing finally matches
        // real game VFX layering -
        //   bg → ground fx (UNDER) → combatants → veil → air fx (OVER).
        // Ground fx = every track flagged under:true (rune circles, rifts,
        // cracks). The isolated focus combatant is skipped here when a sink
        // recipe owns it (the hands layer draws it, sinking into the rift).
        const env = { A, time, W, H, base, self, seed, sets, spr: (n) => singles.get(n) || null,
            layers: !!layers, sprImg, focImg, focRect, casterRect, affectList, hurtList };
        if (env.layers) {
            for (const tr of tracks) {
                if (!tr.under) continue;
                if (tr.layer) { const L = LAYERS[tr.layer]; if (L) { ctx.save(); try { L(ctx, tr, env); } catch (e) { /* a bad layer never kills the clip */ } ctx.restore(); } }
                else drawTrackInstances(ctx, tr, sets, A, time, mulberry(seed + f), palette);
            }
            ctx.drawImage(sprImg, 0, 0, W, H);
            if (focImg && !sinkOwnsFocus) ctx.drawImage(focImg, 0, 0, W, H);
            // 🔴 HP DROP: repaint the victims' overhead bars over the baked
            // ones (exact Go geometry via anchors) BEFORE the veil so they dim
            // and shake exactly like the base scene they cover. Hidden until
            // the impact so the windup shows the untouched baked bar.
            if (victims.size && Array.isArray(layers.anchors)) {
                const fanAnchors = layers.anchors
                    .filter((v2) => v2 && v2.side === tSideAll && victims.has(Math.floor(Number(v2.index) || 0)) && (dropAll || Math.floor(Number(v2.index) || 0) === focusIdxAll))
                    .sort((a2, b2) => a2.x - b2.x);
                let vi = 0;
                for (const a2 of fanAnchors) {
                    const v = victims.get(Math.floor(Number(a2.index) || 0));
                    if (!v) continue;
                    const isPlayerSide = a2.side === 'player';
                    const bw = (isPlayerSide ? 80 : 100) * kxL, bh = (isPlayerSide ? 10 : 12) * kyL;
                    const bxc = (Number(a2.x) - (isPlayerSide ? 40 : 50)) * kxL;
                    const byc = (Number(a2.feetY) - Math.max(24, Number(a2.h) || 0)) * kyL - (isPlayerSide ? 12 : 15) * kyL;
                    const at = IMPACT + vi * 0.06;
                    vi++;
                    if (time < at) continue;
                    const du = clamp01((time - at) / 0.45);
                    const pct = v.pct0 + (v.p1 - v.pct0) * (1 - Math.pow(1 - du, 3));
                    drawVictimHpBar(ctx, bxc, byc, bw, bh, pct, time - at < 2 / FPS ? 1 : 0);
                }
            }
        }
        // dim the field while charging so effects pop; lift after the hit
        // (layered: AFTER the combatants so they dim exactly like the flat base)
        const veil = time < IMPACT ? 0.12 + 0.3 * easeIn(time / IMPACT) : 0.42 * (1 - easeOut((sinceHit) / 0.6)) + 0.08;
        ctx.fillStyle = rgba('#05060f', veil); ctx.fillRect(-40, -40, W + 80, H + 80);
        // charge aura at the caster
        if (time < IMPACT + 0.25) {
            const k = easeIn(time / IMPACT);
            glow(ctx, A.C[0], A.C[1], 70 + 90 * k + Math.sin(f * 1.7) * 6, rgba(palette[1], 'A'), 0.35 + 0.45 * k);
        }
        // sprite tracks, ordered (under:true tracks already painted in the
        // ground pass above)
        for (const tr of tracks) {
            if (tr.under) continue;
            if (tr.layer) { const L = LAYERS[tr.layer]; if (L) { ctx.save(); try { L(ctx, tr, env); } catch (e) { /* a bad layer never kills the clip */ } ctx.restore(); } }
            else drawTrackInstances(ctx, tr, sets, A, time, mulberry(seed + f), palette);
        }
        // impact glow
        if (sinceHit >= 0 && sinceHit < 0.5) glow(ctx, A.T[0], A.T[1], 200 * easeOut(sinceHit / 0.25) + 40, rgba(palette[0], 'A'), 0.85 * (1 - sinceHit / 0.5));
        // 🔴 HURT FLASH fallback (no cutouts → no hurtList): same double-pulse
        // timing as LAYERS.hurt, as a red radial burn on the victim anchor so
        // the "that got HIT" read survives the plain-base lane too.
        if (!self && !hurtList.length && sinceHit >= 0 && sinceHit < 0.45) {
            // bell() lives in ultimateFxLayers - inline the sine envelope here
            const k = Math.min(1, Math.sin(Math.PI * clamp01(sinceHit / 0.15)) + 0.62 * Math.sin(Math.PI * clamp01((sinceHit - 0.2) / 0.17)));
            glow(ctx, A.T[0], A.T[1] - 26, 130, rgba('#ff2222', 'A'), 0.5 * k);
        }
        embers(ctx, A, time, palette, seed);
        ctx.restore();
        // full-screen flash frames (soft, 2 frames) + vignette
        if (sinceHit >= 0 && sinceHit < 0.07) { ctx.fillStyle = rgba(palette[0], 0.55 * (1 - sinceHit / 0.07)); ctx.fillRect(0, 0, W, H); }
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        banner(ctx, time, o.name, palette[1], o.skillLevel, o.maxLevel);
        // 💡 HUD 2026-10-26 round 2: the caster's medieval plate is the LAST
        // pass - above the flash, vignette, banner and every effect, and
        // outside the camera transform, so nothing ever covers or dims it.
        if (hudIcons) drawVideoHud(ctx, o.hud, hudIcons);
        if (f === Math.round(IMPACT * FPS) + 1) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
        frames.push(canvas.toBuffer('raw'));
    }
    if (!thumb) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    const mp4 = await encodeMp4(frames);
    return { mp4, thumb };
}

module.exports = { renderUltimateVideo, RECIPES, STYLE_RECIPE, W, H, FPS, DURATION };
