// Visual harness: real sprites on a real background, with/without the new 2.5D shadow → /tmp/shadow_cmp.png
const fs = require('fs'); const { createCanvas, loadImage } = require('canvas');
const { paintShadows } = require('../core/rpg/systems/combat/groundShadow');
const A = '/home/claude/bot_genaration/assets/rpgasset/';
(async () => {
  const W = 1024, H = 687, bg = await loadImage(A + 'backgrounds/background2.png');
  const mk = async (file, x, feet, h, flip) => { const im = await loadImage(A + file); const w = Math.round(h * im.width / im.height); const cv = createCanvas(w, h), c = cv.getContext('2d'); if (flip) { c.translate(w, 0); c.scale(-1, 1); } c.drawImage(im, 0, 0, w, h); return { im: cv, cut: { side: flip ? 'enemy' : 'player', index: 0, x: x - w / 2, y: feet - h, w, h, png: cv.toBuffer('image/png').toString('base64') } }; };
  const units = [await mk('characters/Fighter1.png', 250, 520, 250), await mk('characters/Monk.png', 420, 560, 230), await mk('characters/Berserker1.png', 760, 520, 270, true)];
  const render = async (shadow) => { const cv = createCanvas(W, H), c = cv.getContext('2d'); c.drawImage(bg, 0, 0, W, H); if (shadow) await paintShadows(c, { cuts: units.map((u) => u.cut), anchors: [] }, 1); for (const u of units) c.drawImage(u.im, u.cut.x, u.cut.y); return cv; };
  const a = await render(false); let t = Date.now(); const b = await render(true); console.log('shadow render ms', Date.now() - t); t = Date.now(); await render(true); console.log('warm ms', Date.now() - t);
  const out = createCanvas(W, H * 2), o = out.getContext('2d'); o.drawImage(a, 0, 0); o.drawImage(b, 0, H); fs.writeFileSync('/tmp/shadow_cmp.png', out.toBuffer('image/png')); console.log('wrote /tmp/shadow_cmp.png');
})();
