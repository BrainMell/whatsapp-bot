// Contact sheet: many different sprites (characters + enemies + floaters) each on a flat ground line with the shadow painter. -> /tmp/shadow_sheet.png
const fs = require('fs'); const { createCanvas, loadImage } = require('canvas');
const { paintShadows } = require('../core/rpg/systems/combat/groundShadow');
const A = '/home/claude/bot_genaration/assets/rpgasset/';
const pick = process.argv.slice(2).length ? process.argv.slice(2) : ['characters/Fighter1.png', 'characters/Monk.png', 'characters/Berserker1.png', 'characters/DoomSlayer1.png', 'enemies/bat_single.png', 'enemies/boar_still.png', 'enemies/bear_lpc.png', 'enemies/boss_0_S.png', 'enemies/boss_5_S.png', 'enemies/boss_10_S.png', 'enemies/crab_frame.png', 'enemies/Werewolf_0004_brown.png'];
(async () => {
  const cols = 6, cw = 220, ch = 260, rows = Math.ceil(pick.length / cols), W = cols * cw, H = rows * ch;
  const cv = createCanvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#d7b46a'; c.fillRect(0, 0, W, H);
  const cuts = [], draws = [], anchors = [], floatSet = new Set([4, 7]);   // units 4 and 7 hover 55px above the ground line (anchor keeps the true ground)
  for (let i = 0; i < pick.length; i++) {
    const im = await loadImage(A + pick[i]); const r = i / cols | 0, col = i % cols, ground = r * ch + 215, cx = col * cw + cw / 2;
    const k = Math.min(170 / im.height, 150 / im.width), w = Math.round(im.width * k), h = Math.round(im.height * k);
    const u = createCanvas(w, h); u.getContext('2d').drawImage(im, 0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(col * cw, ground, cw, 1);
    const lift = floatSet.has(i) ? 55 : 0; anchors.push({ side: 'enemy', index: i, x: cx, feetY: ground, w, h });
    const cut = { side: 'enemy', index: i, x: cx - w / 2, y: ground - h - lift, w, h, png: u.toBuffer('image/png').toString('base64') };
    cuts.push(cut); draws.push([u, cut.x, cut.y]);
    c.fillStyle = '#222'; c.font = '11px sans-serif'; c.fillText(pick[i].split('/').pop().slice(0, 26), col * cw + 6, r * ch + 14);
  }
  await paintShadows(c, { cuts, anchors }, 1);
  for (const [u, x, y] of draws) c.drawImage(u, x, y);
  fs.writeFileSync('/tmp/shadow_sheet.png', cv.toBuffer('image/png')); console.log('wrote /tmp/shadow_sheet.png');
})();
