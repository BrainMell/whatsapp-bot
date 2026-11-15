'use strict';
// 🎨 ALDAFOLD WORLD STYLE — one shared look for the stylised world art (hex maps, siege/encounter scenes, characters, monsters).
// WORLD LAYER ONLY: never run this over UI panels, text, VFX cards or ability art. Callers stylise the world canvas, then draw UI on top.
//   outlined(img,px,color)  solid silhouette outline of a sprite (cached) — drawn UNDER the sprite so it reads as a thick ink line
//   drawOutlined(ctx,img,x,y,w,h,opt) convenience: outline + sprite
//   grade(canvas,preset)    posterise (soft) + colour grade + graphic shadow bands/halftone + optional pixelation (in place)
// ALDA_STYLE=0 turns every effect off (bit-identical to the old renderer).
// Pixel-art shader pass ported from the CC0 Godot shader "Outline, Posterization, Color Palette and Dithering"
// (https://godotshaders.com/shader/outline-posterization-color-palette-and-dithering/): Sobel-Feldman edge outline,
// per-channel posterize, nearest-palette snap and a 4x4 Bayer ordered dither - done per pixel on the world canvas (no GPU needed).
const { createCanvas } = require('canvas');
const BAYER = [0, 0.5, 0.125, 0.625, 0.75, 0.25, 0.875, 0.375, 0.1875, 0.6875, 0.0625, 0.5625, 0.9375, 0.4375, 1.0, 0.8125];
const ON = process.env.ALDA_STYLE !== '0';   // ON by default; ALDA_STYLE=0 restores the old look
const INK = '#1a120d';
const PRESETS = {
    // default for the realm map / siege / encounters
    aldafold: { outline: { px: 1.9, color: INK }, posterize: { levels: 7, mix: 0.45 }, grade: { contrast: 1.06, sat: 1.04, warm: 0.02 }, shadeBand: { below: 0.34, dark: 0.18 }, edge: { thick: 1, thresh: 0.42, color: INK, strength: 0.45 }, pixel: 0 },
    // lighter touch (large overview maps where objects are tiny)
    overview: { outline: { px: 1.2, color: INK }, posterize: { levels: 8, mix: 0.35 }, grade: { contrast: 1.05, sat: 1.1, warm: 0 }, shadeBand: null, edge: null, pixel: 0 },
    // chunky pixel identity (opt-in)
    pixel: { outline: { px: 3, color: INK }, posterize: { levels: 6, mix: 0.6 }, grade: { contrast: 1.08, sat: 1.15, warm: 0.02 }, shadeBand: { below: 0.34, dark: 0.2 }, edge: { thick: 1, thresh: 0.2, color: INK, strength: 0.9 }, pixel: 2 },
};
const preset = (p) => (typeof p === 'string' ? PRESETS[p] : p) || PRESETS.aldafold;

const cache = new WeakMap();
/** silhouette outline canvas: the sprite's alpha dilated by `px` in the given colour. size = sprite size + 2*pad */
function outlined(img, px = 2, color = INK) {
    const t = Math.max(1, Math.round(px)); let m = cache.get(img); if (!m) cache.set(img, (m = new Map()));
    const key = t + color; let c = m.get(key); if (c) return c;
    const w = img.width, h = img.height, pad = t + 1; c = createCanvas(w + pad * 2, h + pad * 2); const x = c.getContext('2d');
    const tmp = createCanvas(c.width, c.height), tx = tmp.getContext('2d'); const N = Math.max(12, t * 6);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; tx.drawImage(img, pad + Math.cos(a) * t, pad + Math.sin(a) * t); }
    tx.drawImage(img, pad, pad); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, tmp.width, tmp.height);
    x.drawImage(tmp, 0, 0); c.pad = pad; c.t = t; m.set(key, c); return c;
}
/** draw `img` into (x,y,w,h) with a solid outline of `px` SCREEN pixels. */
function drawOutlined(ctx, img, x, y, w, h, o = {}) {
    if (!ON || o.outline === false || !w || !h) return ctx.drawImage(img, x, y, w, h);
    const px = o.px == null ? PRESETS.aldafold.outline.px : o.px; const k = w / img.width;   // screen px per sprite px
    const tn = Math.max(1, Math.round(px / k)); const oc = outlined(img, tn, o.color || INK); const sc = k, pad = oc.pad * sc;
    if (o.flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(oc, -pad, -pad, oc.width * sc, oc.height * sc); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); return; }
    ctx.drawImage(oc, x - pad, y - pad, oc.width * sc, oc.height * sc); ctx.drawImage(img, x, y, w, h);
}
/** soft posterise + grade + shade bands, in place. */
function grade(cv, p) {
    if (!ON) return cv; p = preset(p); const W = cv.width, H = cv.height; let ctx = cv.getContext('2d');
    if (p.pixel > 1) { const s = createCanvas(Math.ceil(W / p.pixel), Math.ceil(H / p.pixel)), sx = s.getContext('2d'); sx.imageSmoothingEnabled = true; sx.drawImage(cv, 0, 0, s.width, s.height); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H); ctx.drawImage(s, 0, 0, W, H); ctx.restore(); }
    const id = ctx.getImageData(0, 0, W, H), d = id.data; const g = p.grade || {}, ps = p.posterize, sb = p.shadeBand; const L = ps ? ps.levels - 1 : 0;
    for (let i = 0, n = W * H; i < n; i++) {
        const o = i * 4; if (d[o + 3] === 0) continue; let r = d[o] / 255, gg = d[o + 1] / 255, b = d[o + 2] / 255;
        if (g.contrast) { r = (r - 0.5) * g.contrast + 0.5; gg = (gg - 0.5) * g.contrast + 0.5; b = (b - 0.5) * g.contrast + 0.5; }
        const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
        if (g.sat) { r = lum + (r - lum) * g.sat; gg = lum + (gg - lum) * g.sat; b = lum + (b - lum) * g.sat; }
        if (g.warm) { r += g.warm; b -= g.warm; }
        if (ps) { const q = (v) => Math.round(v * L) / L; r = r + (q(r) - r) * ps.mix; gg = gg + (q(gg) - gg) * ps.mix; b = b + (q(b) - b) * ps.mix; }
        if (sb && lum < sb.below) { const x = i % W, y = (i / W) | 0; if (BAYER[(x & 3) + (y & 3) * 4] > lum / sb.below) { r *= 1 - sb.dark; gg *= 1 - sb.dark; b *= 1 - sb.dark; } }   // ordered-dither graphic shadow band
        d[o] = r < 0 ? 0 : r > 1 ? 255 : r * 255; d[o + 1] = gg < 0 ? 0 : gg > 1 ? 255 : gg * 255; d[o + 2] = b < 0 ? 0 : b > 1 ? 255 : b * 255;
    }
    if (p.edge) edgePass(id, W, H, p.edge);
    ctx.putImageData(id, 0, 0); return cv;
}
/** Sobel-Feldman on luminance (no depth/normal buffers in a 2D render) -> blends the ink colour over strong edges. */
function edgePass(id, W, H, e) {
    const d = id.data, lum = new Float32Array(W * H); for (let i = 0; i < W * H; i++) lum[i] = (0.2125 * d[i * 4] + 0.7154 * d[i * 4 + 1] + 0.0721 * d[i * 4 + 2]) / 255;
    const t = Math.max(1, e.thick | 0), ink = hex(e.color || INK), out = new Float32Array(W * H);
    for (let y = t; y < H - t; y++) for (let x = t; x < W - t; x++) {
        const i = y * W + x, a = lum[i - W * t - t], b = lum[i - W * t], c = lum[i - W * t + t], dd = lum[i - t], f = lum[i + t], g = lum[i + W * t - t], h = lum[i + W * t], k = lum[i + W * t + t];
        const gx = -a - 2 * dd - g + c + 2 * f + k, gy = -a - 2 * b - c + g + 2 * h + k; const m = Math.sqrt(gx * gx + gy * gy); out[i] = m > e.thresh ? Math.min(1, (m - e.thresh) * 3) * e.strength : 0;
    }
    for (let i = 0; i < W * H; i++) { const m = out[i]; if (m > 0 && d[i * 4 + 3] > 0) { d[i * 4] += (ink[0] - d[i * 4]) * m; d[i * 4 + 1] += (ink[1] - d[i * 4 + 1]) * m; d[i * 4 + 2] += (ink[2] - d[i * 4 + 2]) * m; } }
}
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
module.exports = { ON, INK, PRESETS, preset, outlined, drawOutlined, grade };
