// fix_bg9_center.js - re-center the style 9 (Rune Monolith) profile stats block.
// Measured defect: baked stat grid spans x 96..752 (center 424) while the card
// frame centers on 400 -> whole HP/SPD grid sits 24px right of center.
// Fix: copy the stats block region, redraw it shifted -24px, fill the exposed
// strip with per-row sampled background, and update layouts.json value anchors
// 396->372 / 752->728 so runtime values follow the lines.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const STYLES = '/home/ubuntu/whatsapp-bot/core/rpgasset/ui/styles';
const BG = path.join(STYLES, 'bg_9.png');
const LAYOUTS = path.join(STYLES, 'layouts.json');

const SHIFT = -24;
// stats block bounds (labels top ~712, last divider 974, lines end 752)
const BX = 88, BY = 702, BW = 684, BH = 286; // covers 88..772? no: 88+684=772
// keep block inside frame (frame at 22..778): use 88..760
const BW2 = 672; // 88..760

(async () => {
  const img = await loadImage(BG);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // 1. snapshot the stats block
  const block = createCanvas(BW2, BH);
  block.getContext('2d').drawImage(c, BX, BY, BW2, BH, 0, 0, BW2, BH);

  // 2. sample per-row background color from the clean left margin (x 30..86)
  //    BEFORE any edits, so the fill matches the vertical gradient.
  const sample = ctx.getImageData(30, BY, 56, BH);
  const rowCol = [];
  for (let y = 0; y < BH; y++) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < 56; x++) {
      const i = (y * 56 + x) * 4;
      r += sample.data[i]; g += sample.data[i + 1]; b += sample.data[i + 2];
    }
    rowCol.push([Math.round(r / 56), Math.round(g / 56), Math.round(b / 56)]);
  }

  // 3. wipe the whole block region first (removes old art), fill with sampled bg
  for (let y = 0; y < BH; y++) {
    const [r, g, b] = rowCol[y];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(BX, BY + y, BW2, 1);
  }

  // 4. redraw block shifted left 24px
  ctx.drawImage(block, BX + SHIFT, BY);

  // 5. save
  fs.writeFileSync(BG, c.toBuffer('image/png'));
  console.log('bg_9.png rewritten: stats block shifted', SHIFT, 'px');

  // 6. patch layouts.json value anchors
  const L = JSON.parse(fs.readFileSync(LAYOUTS, 'utf8'));
  const s9 = L['9'];
  let patched = 0;
  for (const op of s9.ops) {
    if (op.op === 'statvals' && Array.isArray(op.vals)) {
      for (const v of op.vals) {
        if (v.x === 396) { v.x = 372; patched++; }
        else if (v.x === 752) { v.x = 728; patched++; }
      }
    }
  }
  fs.writeFileSync(LAYOUTS, JSON.stringify(L, null, 1) + '\n');
  console.log('layouts.json statvals patched:', patched, '(expect 8)');
})();
