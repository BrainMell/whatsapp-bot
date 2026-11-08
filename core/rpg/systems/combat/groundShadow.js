'use strict';
// 🌑 2.5D side-scroller ground shadows, painted in Node between the Go background and the Go sprite layer.
// Overhead sun (owner 2026-11-08: "sun at the top, not a long streak"): the shadow is a compact, flat, soft oval DIRECTLY under the fighter,
// not a thrown silhouette. Its size comes from the sprite's real stance (width of the lowest ~10% of pixels, so wide stances / a raised foot
// still sit inside it) plus a faint wider penumbra from the body width; its centre is the middle of the stance, not the single lowest pixel.
// Needs only layers.cuts, so it works with the live Go renderer unchanged. Kill switch: NODE_SHADOW=0.
const crypto = require('crypto');
const { createCanvas, loadImage } = require('canvas');
const cache = new Map(); const CACHE_MAX = 80;

async function measure(cut, s) {
  const key = crypto.createHash('md5').update(cut.png).digest('hex') + ':' + Math.round(s * 100) + ':' + Math.round(cut.w) + 'x' + Math.round(cut.h);
  const hit = cache.get(key); if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const w = Math.max(2, Math.round(cut.w * s)), h = Math.max(2, Math.round(cut.h * s));
  const img = await loadImage(Buffer.from(cut.png, 'base64'));
  const cv = createCanvas(w, h), cc = cv.getContext('2d'); cc.drawImage(img, 0, 0, w, h);
  const px = cc.getImageData(0, 0, w, h).data, A = (x, y) => px[(y * w + x) * 4 + 3] > 48;
  let bottom = h - 1;
  for (; bottom > 0; bottom--) { let hit2 = false; for (let x = 0; x < w; x += 2) if (A(x, bottom)) { hit2 = true; break; } if (hit2) break; }
  const span = (y0, y1, lo = 0, hi = 1) => {   // x-extent of visible pixels in rows y0..y1, trimmed to the lo..hi percentile (outliers: weapons, tails, spear shafts, claws)
    const xs = new Uint32Array(w); let tot = 0;
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = 0; x < w; x++) if (A(x, y)) { xs[x]++; tot++; }
    if (!tot) return null; let acc = 0, a = 0, b = w - 1, gotA = false;
    for (let x = 0; x < w; x++) { acc += xs[x]; if (!gotA && acc >= tot * lo) { a = x; gotA = true; } if (acc >= tot * hi) { b = x; break; } }
    return [a, Math.max(a, b)];
  };
  const feet = span(bottom - Math.max(3, Math.round(h * 0.10)), bottom, 0.06, 0.94) || [0, w - 1];
  const body = span(Math.round(h * 0.25), Math.round(h * 0.7), 0.03, 0.97) || feet;
  // centre of mass of the whole sprite (alpha-weighted x): where the weight actually is. A lopsided stance (one foot out, one raised) must not drag
  // the shadow sideways, so the centre is the mass centre clamped INTO the feet span, and the half-width grows just enough to cover both feet.
  let mx = 0, mn = 0; for (let y = 0; y <= bottom; y += 2) for (let x = 0; x < w; x += 2) if (A(x, y)) { mx += x; mn++; }
  const mass = mn ? mx / mn : (feet[0] + feet[1]) / 2;
  const cx = Math.min(feet[1], Math.max(feet[0], mass));
  const reach = Math.max(cx - feet[0], feet[1] - cx) * 2 + 1;
  const rec = {
    footX: cx - w / 2,                               // shadow centre (offset from the cut's centre line)
    footY: bottom + 1 - h,                           // lowest visible pixel (<=0 offset from the cut's bottom edge)
    stance: Math.max(8, Math.min(reach, Math.max(body[1] - body[0] + 1, 8) * 1.1)),   // cover both feet, but never wider than the body itself (+10%)
    bodyW: Math.max(8, body[1] - body[0] + 1),
  };
  cache.set(key, rec); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return rec;
}

function oval(c, cx, cy, rx, ry, a0, a1) {
  c.save(); c.translate(cx, cy); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(8,5,12,${a0})`); g.addColorStop(0.55, `rgba(8,5,12,${a0 * 0.62})`); g.addColorStop(0.85, `rgba(8,5,12,${a1})`); g.addColorStop(1, 'rgba(8,5,12,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
}

function drop(c, fx, gy, stance, bodyW, s, k = 1, maxW = Infinity) {
  const base = Math.min(Math.max(stance * 0.62, bodyW * 0.5, 12 * s), maxW * 0.5);
  oval(c, fx, gy, base * 1.35, base * 0.30, 0.34 * k, 0.10 * k);        // wide soft penumbra
  oval(c, fx, gy, base * 0.95, base * 0.19, 0.62 * k, 0.20 * k);        // body shadow
  oval(c, fx, gy, Math.max(stance * 0.5, 10 * s), Math.max(stance * 0.085, 3.2 * s), 0.55 * k, 0.15 * k);   // dense core right under the soles
}

/** Paint under the sprites. layers: {cuts, anchors}; skip(side,index) → true to omit a unit (e.g. one that is dying). */
async function paintShadows(c, layers, s, skip) {
  if (process.env.NODE_SHADOW === '0' || !layers) return;
  const cuts = Array.isArray(layers.cuts) ? layers.cuts : [], anchors = Array.isArray(layers.anchors) ? layers.anchors : [];
  const done = new Set();
  for (const cut of cuts) {
    if (!cut || !cut.png || skip && skip(cut.side, cut.index)) continue;
    try {
      // Placement comes ONLY from the sprite's visible pixels (anchors/cut boxes can include transparent padding, which made padded sprites look
      // like they hovered). Fliers keep their art-baked hover, so a shadow tucked under their lowest pixel still reads correctly.
      const m = await measure(cut, s);
      const fx = (cut.x + cut.w / 2) * s + m.footX, feetY = (cut.y + cut.h) * s + m.footY;
      drop(c, fx, feetY - 2.5 * s, m.stance, m.bodyW, s, 1, cut.w * s * 0.9);   // tucked up under the soles so the feet sit IN the shadow
      done.add(cut.side + ':' + cut.index);
    } catch (e) { /* cosmetic */ }
  }
  for (const a of anchors) {   // units the cut list does not cover still get a plain drop shadow
    if (!a || done.has(a.side + ':' + a.index) || skip && skip(a.side, a.index)) continue;
    const w = (Number(a.w) || 80) * s; drop(c, a.x * s, a.feetY * s - 2.5 * s, w * 0.5, w * 0.7, s, 0.9);
  }
}

module.exports = { paintShadows };
