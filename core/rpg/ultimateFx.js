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
        let [px, py] = anchor(tr.pos, A);
        if (tr.to) {
            const [qx, qy] = anchor(tr.to, A);
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
        ctx.imageSmoothingEnabled = !!def.smooth;
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

function banner(ctx, time, name, color) {
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
    ctx.restore();
}

function fallbackBase() {
    const c = createCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171e35'); gr.addColorStop(0.63, '#32344a'); gr.addColorStop(1, '#10121f');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c;
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
async function renderUltimateVideo(o) {
    const palette = o.palette && o.palette.length >= 3 ? o.palette : ['#fff1b0', '#ffcb45', '#e85a37'];
    const recipeKey = STYLE_RECIPE[String(o.classId || '').toUpperCase()] || 'fire';
    const sets = {};
    const classTracks = RECIPE_PACK && RECIPE_PACK.classRecipe ? RECIPE_PACK.classRecipe(String(o.classId || '').toUpperCase(), palette, { IMPACT }) : null;
    const tracks = classTracks || RECIPES[recipeKey](palette);
    for (const t of tracks) {
        for (const nm of [t.fx, t.land]) if (nm && SETS[nm] && !sets[nm]) sets[nm] = await loadSet(nm);
    }
    const singles = await loadSingles();
    if (!Object.values(sets).some((s) => s && s.length) && !tracks.some((t) => t.layer)) return null;     // assets missing → caller falls back to the legacy renderer

    let base = null;
    if (Buffer.isBuffer(o.baseBuffer) && o.baseBuffer.length > 1000) { try { base = await loadImage(o.baseBuffer); } catch (e) { base = null; } }
    if (!base) base = fallbackBase();

    const self = o.side === 'self';
    const A = { C: [W * 0.27, H * 0.62], T: self ? [W * 0.27, H * 0.58] : [W * 0.72, H * 0.58], F: [W * 0.5, H * 0.55] };
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
        const push = time < IMPACT ? easeIn(time / IMPACT) * 0.05 : 0.05 * (1 - easeOut((sinceHit - 0.1) / 0.8));
        const punch = sinceHit >= 0 ? Math.max(0, 1 - sinceHit / 0.35) * 0.07 : 0;
        const zoom = 1 + push + punch;
        const amp = hitStop ? 0 : (sinceHit >= 0 && sinceHit < 0.7 ? 16 * Math.pow(1 - sinceHit / 0.7, 2) : (time < IMPACT ? 1.2 * easeIn(time / IMPACT) : 0));
        const sx = Math.sin(f * 2.31 + seed) * amp, sy = Math.cos(f * 3.17 + seed) * amp * 0.6;
        const fx = A.T[0] / W, fy = A.T[1] / H;
        ctx.save();
        ctx.translate(W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.5) + sx, H * (0.5 + (fy - 0.5) * 0.4) + sy);
        ctx.scale(zoom, zoom);
        ctx.translate(-W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.5), -H * (0.5 + (fy - 0.5) * 0.4));
        ctx.drawImage(base, 0, 0, W, H);
        // dim the field while charging so effects pop; lift after the hit
        const veil = time < IMPACT ? 0.12 + 0.3 * easeIn(time / IMPACT) : 0.42 * (1 - easeOut((sinceHit) / 0.6)) + 0.08;
        ctx.fillStyle = rgba('#05060f', veil); ctx.fillRect(-40, -40, W + 80, H + 80);
        // charge aura at the caster
        if (time < IMPACT + 0.25) {
            const k = easeIn(time / IMPACT);
            glow(ctx, A.C[0], A.C[1], 70 + 90 * k + Math.sin(f * 1.7) * 6, rgba(palette[1], 'A'), 0.35 + 0.45 * k);
        }
        // sprite tracks, ordered
        const env = { A, time, W, H, base, self, seed, sets, spr: (n) => singles.get(n) || null };
        for (const tr of tracks) {
            if (tr.layer) { const L = LAYERS[tr.layer]; if (L) { ctx.save(); try { L(ctx, tr, env); } catch (e) { /* a bad layer never kills the clip */ } ctx.restore(); } }
            else drawTrackInstances(ctx, tr, sets, A, time, mulberry(seed + f), palette);
        }
        // impact glow
        if (sinceHit >= 0 && sinceHit < 0.5) glow(ctx, A.T[0], A.T[1], 200 * easeOut(sinceHit / 0.25) + 40, rgba(palette[0], 'A'), 0.85 * (1 - sinceHit / 0.5));
        embers(ctx, A, time, palette, seed);
        ctx.restore();
        // full-screen flash frames (soft, 2 frames) + vignette
        if (sinceHit >= 0 && sinceHit < 0.07) { ctx.fillStyle = rgba(palette[0], 0.55 * (1 - sinceHit / 0.07)); ctx.fillRect(0, 0, W, H); }
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        banner(ctx, time, o.name, palette[1]);
        if (f === Math.round(IMPACT * FPS) + 1) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
        frames.push(canvas.toBuffer('raw'));
    }
    if (!thumb) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    const mp4 = await encodeMp4(frames);
    return { mp4, thumb };
}

module.exports = { renderUltimateVideo, RECIPES, STYLE_RECIPE, W, H, FPS, DURATION };
