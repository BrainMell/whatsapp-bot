'use strict';
// 🌑 2.5D side-scroller ground shadows, painted in Node between the Go background and the Go sprite layer.
// Owner 2026-11-08: the old Go shadow was a round blob with varying darkness (and the live box now draws none). A side-scroller shadow
// FOLLOWS THE SPRITE: the silhouette is projected onto the ground plane — flattened, sheared away from the light (upper-left), faded toward
// the tip, with a tight dense contact patch under the feet. Needs only layers.cuts (per-fighter transparent PNGs) so it works with the live
// Go renderer unchanged. Kill switch: NODE_SHADOW=0.
const crypto = require('crypto');
const { createCanvas, loadImage } = require('canvas');

const SHEAR = 0.82;      // horizontal throw per unit of sprite height (light from upper-left → shadows fall right)
const LIFT = 0.075;      // shadow falls BEHIND the fighter: the head lands this fraction of height ABOVE the feet line (never below it — that read as floating)
const MAX_ALPHA = 0.76;
const cache = new Map(); const CACHE_MAX = 40;

async function silhouette(cut, s) {
  const key = crypto.createHash('md5').update(cut.png).digest('hex') + ':' + Math.round(s * 100) + ':' + Math.round(cut.w) + 'x' + Math.round(cut.h);
  const hit = cache.get(key); if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const w = Math.max(2, Math.round(cut.w * s)), h = Math.max(2, Math.round(cut.h * s));
  const img = await loadImage(Buffer.from(cut.png, 'base64'));
  // true feet: lowest row that holds visible pixels + the centre of the lowest band (cut boxes can carry transparent padding under the boots)
  const probe = createCanvas(w, h), pc = probe.getContext('2d'); pc.drawImage(img, 0, 0, w, h);
  const px = pc.getImageData(0, 0, w, h).data; let bottom = h - 1;
  for (; bottom > 0; bottom--) { let hit = false; for (let x = 0; x < w; x += 2) if (px[(bottom * w + x) * 4 + 3] > 48) { hit = true; break; } if (hit) break; }
  let sx = 0, n = 0; for (let y = Math.max(0, bottom - Math.round(h * 0.05)); y <= bottom; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 48) { sx += x; n++; }
  const footX = n ? sx / n - w / 2 : 0, footY = bottom + 1 - h;   // offsets from the cut's bottom-centre (footY<=0)
  const padL = Math.ceil(w * 0.25), throwX = Math.ceil(h * SHEAR), padB = 14;
  const SW = padL + w / 2 + throwX + w * 0.5 + 16, SH = Math.ceil(h * LIFT) + padB + 12;
  const sw = Math.ceil(SW), sh = Math.ceil(SH), ox = padL + Math.ceil(w / 2), oy = Math.ceil(h * LIFT) + 6;   // feet origin inside the shadow sprite
  // 1) project the silhouette onto the ground: X = u + SHEAR*|v|, Y = -LIFT*|v|  (u across, v up from the feet)
  const sil = createCanvas(sw, sh), sc = sil.getContext('2d');
  // affine map [a b c d e f]: X = a*u + c*v + e ; Y = b*u + d*v + f  with v<0 above the feet → c=-SHEAR, d=+LIFT
  sc.setTransform(1, 0, -SHEAR, LIFT, ox, oy);
  sc.drawImage(img, -w / 2 - footX, -h - footY, w, h);   // feet (not the padded box edge) sit on the shadow origin
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = 'source-in'; sc.fillStyle = 'rgb(10,6,16)'; sc.fillRect(0, 0, sw, sh);
  // 2) fade along the throw direction (dense at the feet → gone at the tip)
  sc.globalCompositeOperation = 'destination-in';
  const gx = ox + h * SHEAR, gy = oy - h * LIFT;
  const g = sc.createLinearGradient(ox, oy, gx, gy);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fillStyle = g; sc.fillRect(0, 0, sw, sh);
  // 3) soften: down/up scale blur so the penumbra grows away from the feet (contact edge stays tight because of the gradient above)
  const sm = createCanvas(Math.max(2, sw >> 2), Math.max(2, sh >> 2)), smc = sm.getContext('2d'); smc.imageSmoothingEnabled = true; smc.drawImage(sil, 0, 0, sm.width, sm.height);
  const out = createCanvas(sw, sh), oc = out.getContext('2d'); oc.imageSmoothingEnabled = true;
  oc.globalAlpha = 0.55; oc.drawImage(sil, 0, 0); oc.globalAlpha = 0.75; oc.drawImage(sm, 0, 0, sw, sh);
  const rec = { cv: out, ox, oy, footX, footY };
  cache.set(key, rec); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return rec;
}

function contact(c, fx, fy, w, s, alpha = 1) {
  const rx = Math.max(18 * s, w * 0.46), ry = Math.max(6 * s, w * 0.095);
  c.save(); c.translate(fx, fy - ry * 0.25); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(8,5,12,${0.78 * alpha})`); g.addColorStop(0.5, `rgba(8,5,12,${0.46 * alpha})`); g.addColorStop(1, 'rgba(8,5,12,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
}

/** Paint under the sprites. layers: {cuts, anchors}; skip(side,index) → true to omit a unit (e.g. one that is dying). */
async function paintShadows(c, layers, s, skip) {
  if (process.env.NODE_SHADOW === '0' || !layers) return;
  const cuts = Array.isArray(layers.cuts) ? layers.cuts : [], anchors = Array.isArray(layers.anchors) ? layers.anchors : [];
  const done = new Set();
  const anchorOf = (side, index) => anchors.find((x) => x && x.side === side && Number(x.index) === Number(index));
  for (const cut of cuts) {
    if (!cut || !cut.png || skip && skip(cut.side, cut.index)) continue;
    try {
      const rec = await silhouette(cut, s), an = anchorOf(cut.side, cut.index);
      const fx = (cut.x + cut.w / 2) * s + rec.footX, feetY = (cut.y + cut.h) * s + rec.footY;
      // ground line: Go's anchor feetY when present. A sprite whose lowest pixel sits well ABOVE that line is airborne (bat, ghost, flier):
      // a cast silhouette would hang under the body, so it gets a small soft contact ellipse ON the ground, fainter the higher it floats.
      const ground = an && Number.isFinite(Number(an.feetY)) ? Number(an.feetY) * s : feetY;
      const air = ground - feetY, airborne = air > Math.max(14 * s, cut.h * s * 0.12);
      if (airborne) contact(c, fx, ground - 1 * s, cut.w * s * 0.8, s, Math.max(0.35, 0.85 - air / (cut.h * s * 1.2)));
      else {
        const fy = feetY - 1 * s;   // grounded: trust the sprite's real soles
        contact(c, fx, fy, cut.w * s, s);
        c.save(); c.globalAlpha = MAX_ALPHA; c.drawImage(rec.cv, fx - rec.ox, fy - rec.oy); c.restore();
      }
      done.add(cut.side + ':' + cut.index);
    } catch (e) { /* cosmetic */ }
  }
  for (const a of anchors) {   // units the cut list does not cover still get the contact patch
    if (!a || done.has(a.side + ':' + a.index) || skip && skip(a.side, a.index)) continue;
    contact(c, a.x * s, a.feetY * s - 2 * s, (Number(a.w) || 80) * s, s, 0.9);
  }
}

module.exports = { paintShadows };
