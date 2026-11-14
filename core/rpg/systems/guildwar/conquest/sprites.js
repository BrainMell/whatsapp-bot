'use strict';
// 🧩 Asset access for conquest renderers: ONLY real art — bot sprites (characters/, enemies/, environment/cards/) and the baked
// CC0 DCSS/RLTiles pieces in rpgasset/guildwar/conquest/. Cached loaders + alpha content boxes for foot alignment.
const path = require('path'); const fs = require('fs');
const ASSETS = path.join(__dirname, '..', '..', '..', '..', 'rpgasset'); const CQ = path.join(ASSETS, 'guildwar', 'conquest');
const _img = new Map(); const _box = new Map();
async function load(abs) { if (_img.has(abs)) return _img.get(abs); const { loadImage } = require('canvas'); const p = fs.existsSync(abs) ? loadImage(abs).catch(() => null) : Promise.resolve(null); _img.set(abs, p); return p; }
const cq = (rel) => load(path.join(CQ, rel)); const asset = (rel) => load(path.join(ASSETS, rel));
async function character(file) { return (await load(path.join(ASSETS, 'characters', 'clean', file))) || (await load(path.join(ASSETS, 'characters', file))); }
/** alpha bounding box (natural px) so sprites stand on a ground line regardless of padding */
function contentBox(key, img) {
    if (_box.has(key)) return _box.get(key); const { createCanvas } = require('canvas'); const s = Math.max(1, Math.round(Math.max(img.width, img.height) / 128)); const w = Math.ceil(img.width / s), h = Math.ceil(img.height / s);
    const c = createCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    const b = x1 >= x0 ? { x: x0 * s, y: y0 * s, w: (x1 - x0 + 1) * s, h: (y1 - y0 + 1) * s } : { x: 0, y: 0, w: img.width, h: img.height }; _box.set(key, b); return b;
}
/** draw a sprite standing on groundY with visible height ch, centred on cx. crisp (pixel art) unless smooth */
function standing(ctx, img, key, cx, groundY, ch, { flip = false, alpha = 1, smooth = false, shadow = true } = {}) {
    if (!img) return null; const b = contentBox(key, img); const sc = ch / b.h; const dw = img.width * sc, dh = img.height * sc;
    if (shadow) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(cx, groundY - 2, b.w * sc * 0.42, Math.max(6, ch * 0.05), 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.imageSmoothingEnabled = smooth; if (alpha < 1) ctx.globalAlpha = alpha;
    const dx = cx - (b.x + b.w / 2) * sc, dy = groundY - (b.y + b.h) * sc;
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.drawImage(img, -(b.x + b.w / 2) * sc, dy, dw, dh); }
    else ctx.drawImage(img, dx, dy, dw, dh); ctx.restore(); return { x: cx - b.w * sc / 2, y: groundY - ch, w: b.w * sc, h: ch };
}
/** tile a 32px texture over a rect, crisp, variant per cell from rng() */
function tileFill(ctx, imgs, x, y, w, h, scale, rng, smooth = false) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = !!smooth; const t = 32 * scale; for (let yy = y; yy < y + h; yy += t) for (let xx = x; xx < x + w; xx += t) { const im = imgs[Math.floor(rng() * imgs.length)]; if (im) ctx.drawImage(im, xx, yy, t, t); } ctx.restore(); }
async function variants(kind, fam, n = 6) { const out = []; for (let i = 0; i < n; i++) { const im = await cq(`${kind}/${fam}_${i}.png`); if (im) out.push(im); } return out; }
/** cover-fit a photo background */
function cover(ctx, img, W, H) { if (!img) return; const s = Math.max(W / img.width, H / img.height); const dw = img.width * s, dh = img.height * s; ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
const BIOME_BG = { isle: 'environment/cards/sea.jpg', desert: 'environment/cards/desert.jpg', tundra: 'environment/cards/ice.jpg', highlands: 'environment/cards/forest.jpg', volcanic: 'environment/cards/fire.jpg' };
const CARD_BG = { thunder: 'environment/cards/storm.jpg', tide: 'environment/cards/sea.jpg', lava: 'environment/cards/fire.jpg', quake: 'environment/cards/ash.jpg', heatwave: 'environment/cards/desert.jpg', whiteout: 'environment/cards/ice.jpg', thinice: 'environment/cards/ice.jpg', tar: 'environment/cards/toxic.jpg', rockslide: 'environment/cards/ash.jpg' };
const FLOOR_FAM = { isle: 'isle', desert: 'desert', tundra: 'tundra', highlands: 'highlands', volcanic: 'volcanic' };
module.exports = { ASSETS, CQ, load, cq, asset, character, contentBox, standing, tileFill, variants, cover, BIOME_BG, CARD_BG, FLOOR_FAM };
