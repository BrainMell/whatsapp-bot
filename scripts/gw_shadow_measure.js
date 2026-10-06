// gw_shadow_measure.js — numeric contact-shadow audit on the 3x probe crops.
// Anchor in crop px: (630, 810) = item base line (canvas 820,700 × CROP 610,430 × 3).
// For each scene: mean luminance in horizontal bands BELOW the base (the spill
// pool zone), the wing zones LEFT/RIGHT outside the silhouette, and a far-floor
// control band — then reports the contrast. A shadow that "touches the thing"
// must show a clearly darker near-base band than the control, on BOTH metrics.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const DIR = process.argv[2] || '/home/z/my-project/download/gw_item_shadow_v2';
// scene → anchor + silhouette half-width in CROP px (probe crops differ per scene)
const GEO = {
  d_active:  { ax: 630, ay: 810, sil: 170 },
  d_fresh:   { ax: 630, ay: 810, sil: 65 },
  d_looted:  { ax: 630, ay: 810, sil: 100 },
  r_active:  { ax: 630, ay: 810, sil: 84 },
  r_fresh:   { ax: 630, ay: 810, sil: 84 },
  r_looted:  { ax: 630, ay: 810, sil: 84 },
  s_fresh:   { ax: 630, ay: 810, sil: 62 },
  s_looted:  { ax: 630, ay: 810, sil: 62 },
  h_active:  { ax: 630, ay: 810, sil: 60 },
  l_active:  { ax: 630, ay: 810, sil: 52 },
  p_active:  { ax: 540, ay: 498, sil: 55 },   // crop {880,560}, anchor [1060,726]
};

function lum(x, y, d, w) {
  const k = (y * w + x) * 4;
  return 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
}

(async () => {
  for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.png') && !n.includes('zoom'))) {
    const tag = f.replace('.png', '');
    const img = await loadImage(path.join(DIR, f));
    const c = createCanvas(img.width, img.height), x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const { ax: AX, ay: AY, sil } = GEO[tag] || { ax: 630, ay: 810, sil: 70 };
    const cx0 = Math.max(0, AX - Math.round(sil * 0.55)), cx1 = Math.min(img.width - 1, AX + Math.round(sil * 0.55));
    const bandAvg = (y0, y1, bx0, bx1) => {
      let s = 0, n = 0;
      for (let j = y0; j < Math.min(y1, img.height); j++) for (let i = bx0; i <= bx1; i++) { s += lum(i, j, d, img.width); n++; }
      return n ? s / n : -1;
    };
    // under-base bands (spill zone), centre 55% of silhouette
    const under = [];
    for (let b = 0; b < 4; b++) under.push(bandAvg(AY + 3 + b * 8, AY + 11 + b * 8, cx0, cx1).toFixed(1));
    // wings: just outside the silhouette, at base rows
    const wingL = bandAvg(AY - 6, AY + 14, Math.max(0, AX - sil - 42), Math.max(0, AX - sil - 8)).toFixed(1);
    const wingR = bandAvg(AY - 6, AY + 14, Math.min(img.width - 1, AX + sil + 8), Math.min(img.width - 1, AX + sil + 42)).toFixed(1);
    // far-floor control: 90-150px below base
    const ctrl = bandAvg(AY + 90, AY + 150, cx0, cx1).toFixed(1);
    const u0 = parseFloat(under[0]), cf = parseFloat(ctrl);
    console.log(`${tag.padEnd(9)} under:[${under.join(' ')}] wings L${wingL} R${wingR} ctrl ${ctrl}  → near-contrast ${(cf - u0).toFixed(1)}`);
  }
})();
