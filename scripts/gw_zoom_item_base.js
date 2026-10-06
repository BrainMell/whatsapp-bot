// gw_zoom_item_base.js — 3x zoom crops of the item base contact zone.
// Auto-detects the gold/gold-trimmed item per render (anchor drifts per seed).
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const SRC = process.argv[2] || '/home/z/my-project/download/gw_item_shadow_v2';
const OUT = path.join(SRC, '_base_zoom');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  for (const f of fs.readdirSync(SRC).filter(n => n.endsWith('.png') && !n.includes('zoom'))) {
    const file = path.join(SRC, f);
    const img = await loadImage(file);
    const c = createCanvas(img.width, img.height), x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    // gold pixels (bright gold trim) — the reliquary family + coins are all gold-trimmed
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const k = (j * img.width + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2], a = d[k + 3];
      if (a > 200 && r > 175 && g > 120 && b < 105) {
        if (i < minX) minX = i; if (i > maxX) maxX = i;
        if (j < minY) minY = j; if (j > maxY) maxY = j;
      }
    }
    if (maxX < 0) { console.log('no gold px in', f); continue; }
    const ax = (minX + maxX) / 2, ay = maxY;   // item base ≈ lowest gold px
    const ch = maxY - minY;
    const cw = Math.max(340, ch * 2), chh = ch + 84;
    const cx0 = Math.max(0, Math.round(ax - cw / 2)), cy0 = Math.max(0, Math.round(ay - ch + 30 - 40));
    const z = createCanvas(Math.min(cw, img.width - cx0) * 3, Math.min(chh, img.height - cy0) * 3), zx = z.getContext('2d');
    zx.imageSmoothingEnabled = false;
    zx.drawImage(c, cx0, cy0, Math.min(cw, img.width - cx0), Math.min(chh, img.height - cy0), 0, 0, z.width, z.height);
    fs.writeFileSync(path.join(OUT, f.replace('.png', '_zoom.png')), z.toBuffer('image/png'));
    console.log('zoomed', f, 'item bbox x' + minX + '-' + maxX + ' y' + minY + '-' + maxY);
  }
  console.log('done →', OUT);
})();
