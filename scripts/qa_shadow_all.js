// Run the shadow painter over EVERY character/enemy/summon sprite, flag outliers, write contact sheets /tmp/shadow_all_N.png
const fs = require('fs'), path = require('path'); const { createCanvas, loadImage } = require('canvas');
const { paintShadows } = require('../core/rpg/systems/combat/groundShadow');
const R = '/home/claude/bot_genaration/assets/rpgasset/';
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['characters', 'enemies'];
(async () => {
  const files = []; for (const d of dirs) for (const f of fs.readdirSync(R + d).sort()) if (/\.png$/i.test(f)) files.push(d + '/' + f);
  const flagged = [], items = [];
  for (const f of files) {
    let im; try { im = await loadImage(R + f); } catch (e) { continue; }
    const ar = im.width / im.height;
    if (ar > 2.2 || ar < 0.18 || im.width < 24 || im.height < 24) { flagged.push([f, 'looks like a sheet/strip ' + im.width + 'x' + im.height]); continue; }
    const k = Math.min(130 / im.height, 110 / im.width), w = Math.max(2, Math.round(im.width * k)), h = Math.max(2, Math.round(im.height * k));
    const u = createCanvas(w, h); u.getContext('2d').drawImage(im, 0, 0, w, h);
    items.push({ f, w, h, u, png: u.toBuffer('image/png').toString('base64') });
  }
  const per = 40, cols = 8, cw = 170, ch = 170;
  for (let s0 = 0, n = 1; s0 < items.length; s0 += per, n++) {
    const part = items.slice(s0, s0 + per), rows = Math.ceil(part.length / cols), cv = createCanvas(cols * cw, rows * ch), c = cv.getContext('2d');
    c.fillStyle = '#d7b46a'; c.fillRect(0, 0, cv.width, cv.height);
    const cuts = [];
    part.forEach((it, i) => { const r = i / cols | 0, col = i % cols, ground = r * ch + 140, cx = col * cw + cw / 2; c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(col * cw, ground, cw, 1); cuts.push({ side: 'enemy', index: i, x: cx - it.w / 2, y: ground - it.h, w: it.w, h: it.h, png: it.png, it }); c.fillStyle = '#222'; c.font = '9px sans-serif'; c.fillText(it.f.split('/').pop().slice(0, 28), col * cw + 4, r * ch + 11); });
    await paintShadows(c, { cuts, anchors: [] }, 1); for (const q of cuts) c.drawImage(q.it.u, q.x, q.y);
    fs.writeFileSync(`/tmp/shadow_all_${n}.png`, cv.toBuffer('image/png'));
  }
  console.log('sprites', items.length, 'sheets', Math.ceil(items.length / per), 'skipped', flagged.length); flagged.slice(0, 30).forEach((x) => console.log(' skip', x[0], x[1]));
})();
