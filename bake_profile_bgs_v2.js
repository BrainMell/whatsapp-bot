// bake_profile_bgs_v2.js - re-bake profile card backgrounds so every style
// speaks its cardstyle theme language (matches the Go cardstyle palettes).
// Geometry is FROZEN to layouts.json so all Node text ops keep landing right.
//   bg_1 Stonekeep    - dark slate blocks + light granite plates + rivets + ember
//   bg_2 Golden Arcanum - indigo night + ritual gold hairlines + temple window
//   bg_3 Retro Court  - sepia playbill + burgundy double frame + dotted leaders
//   bg_4 Woodmere     - oak planks + hanging sign + tan paper ledger + amber seal
//   bg_5 Emblem Noir  - near-black + thin gold + gold crest + red wax
//   bg_9 Rune Monolith - basalt + carved glyph band + EMBER accents
// Also bakes extra/wax_noir.png (Noir red wax disc, replaces pixel crystal).
const path = require('path');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');

const FONTS = path.join(__dirname, 'core', 'rpgasset', 'fonts');
function reg(file, family) {
  const p = path.join(FONTS, file);
  if (fs.existsSync(p)) registerFont(p, { family });
}
reg('Cinzel-Variable.ttf', 'Cinzel');
reg('CinzelDecorative-Bold.ttf', 'Cinzel Decorative');
reg('CinzelDecorative-Black.ttf', 'Cinzel Dec Black');
reg('IMFellEnglish-Regular.ttf', 'IM Fell English');
reg('IMFellEnglish-Italic.ttf', 'IM Fell English Italic');
reg('MedievalSharp.ttf', 'MedievalSharp');
reg('PressStart2P-Regular.ttf', 'Press Start 2P');
reg('PixeloidSans.ttf', 'Pixeloid Sans');
reg('dogicapixelbold.otf', 'Dogica Pixel Bold');

const W = 800, H = 1100;
const OUT = process.argv[2] || '/tmp/bake_v5';
fs.mkdirSync(OUT, { recursive: true });

function canvas() {
  const c = createCanvas(W, H);
  return [c, c.getContext('2d')];
}
function rr(ctx, x, y, w, h, r) {
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function vgrad(ctx, y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  return g;
}
function vignette(ctx, a) {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.22, W / 2, H * 0.5, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// deterministic speckle
function speckle(ctx, x, y, w, h, n, col, rMax) {
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.save(); rr(ctx, x, y, w, h, 0); ctx.clip();
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const r = 0.6 + rnd() * (rMax || 1.6);
    ctx.beginPath(); ctx.arc(x + rnd() * w, y + rnd() * h, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function rivet(ctx, x, y, r, base, hi) {
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.42, 0, Math.PI * 2); ctx.fill();
}
function diamond(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.72, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.72, cy);
  ctx.closePath(); ctx.fill();
}
function star4(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx, cy, cx + r * 0.28, cy - r * 0.28);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx + r * 0.28, cy + r * 0.28);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r * 0.28, cy + r * 0.28);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx - r * 0.28, cy - r * 0.28);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.closePath(); ctx.fill();
}
function engrave(ctx, text, x, y, font, fill, hi) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = hi; ctx.fillText(text, x, y + 1.6);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function engraveLA(ctx, text, x, y, font, fill, hi) {
  ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = hi; ctx.fillText(text, x, y + 1.6);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// ─────────────────────────────────────────────── bg_1 STONEKEEP
function bg1() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#43454b', '#33353b');
  ctx.fillRect(0, 0, W, H);
  // slate block seams
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 2;
  for (let y = 0; y <= H; y += 138) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  for (let row = 0; row * 138 < H; row++) {
    const off = row % 2 ? 0 : 200;
    for (let x = off; x <= W; x += 400) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, row * 138); ctx.lineTo(x + 0.5, Math.min(H, (row + 1) * 138)); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.030)';
  for (let row = 0; row * 138 < H; row++) if (row % 2) ctx.fillRect(0, row * 138, W, 138);
  vignette(ctx, 0.34);

  // header: light granite plate
  rr(ctx, 38, 32, 548, 146, 10);
  ctx.fillStyle = vgrad(ctx, 32, 178, '#b2b4b8', '#9a9ca0'); ctx.fill();
  ctx.strokeStyle = '#232529'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.4;
  rr(ctx, 42, 36, 540, 138, 8); ctx.stroke();
  speckle(ctx, 38, 32, 548, 146, 260, 'rgba(40,42,48,0.16)', 1.5);
  // rank stamp: dark steel plate right
  rr(ctx, 596, 40, 128, 68, 8);
  ctx.fillStyle = vgrad(ctx, 40, 108, '#2b2d33', '#1e2024'); ctx.fill();
  ctx.strokeStyle = '#15161a'; ctx.lineWidth = 2.5; ctx.stroke();
  rivet(ctx, 608, 52, 4.4, '#0f1013', '#8d9096');
  rivet(ctx, 712, 52, 4.4, '#0f1013', '#8d9096');
  rivet(ctx, 608, 96, 4.4, '#0f1013', '#8d9096');
  rivet(ctx, 712, 96, 4.4, '#0f1013', '#8d9096');
  // header corner rivets
  [[52, 46], [572, 46], [52, 164], [572, 164]].forEach(([x, y]) => rivet(ctx, x, y, 5.2, '#54565c', '#d8dadd'));

  // portrait: granite-framed recessed window (60,226 300x430)
  rr(ctx, 48, 214, 324, 454, 12);
  ctx.fillStyle = vgrad(ctx, 214, 668, '#a8aaae', '#909296'); ctx.fill();
  ctx.strokeStyle = '#232529'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#15161a'; rr(ctx, 60, 226, 300, 430, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; rr(ctx, 60, 226, 300, 430, 8); ctx.stroke();
  [[60, 226], [360, 226], [60, 656], [360, 656]].forEach(([x, y]) => rivet(ctx, x, y, 5.4, '#4a4c52', '#c6c8cc'));
  // amber keystone gem
  diamond(ctx, 210, 214, 8, '#ffb340');
  // facts: dark steel inset panel (light hardcoded op text stays readable)
  rr(ctx, 402, 214, 364, 420, 10);
  ctx.fillStyle = vgrad(ctx, 214, 634, '#2e3036', '#26282d'); ctx.fill();
  ctx.strokeStyle = '#15161a'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.2; rr(ctx, 407, 219, 354, 410, 8); ctx.stroke();
  rivet(ctx, 414, 226, 3.6, '#0f1013', '#7d8086');
  rivet(ctx, 754, 226, 3.6, '#0f1013', '#7d8086');
  rivet(ctx, 414, 622, 3.6, '#0f1013', '#7d8086');
  rivet(ctx, 754, 622, 3.6, '#0f1013', '#7d8086');

  // stat board: light granite panel y700-1010
  rr(ctx, 38, 698, 728, 314, 12);
  ctx.fillStyle = vgrad(ctx, 698, 1012, '#b0b2b6', '#989a9e'); ctx.fill();
  ctx.strokeStyle = '#232529'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.4; rr(ctx, 42, 702, 720, 306, 9); ctx.stroke();
  speckle(ctx, 38, 698, 728, 314, 340, 'rgba(40,42,48,0.15)', 1.5);
  rivet(ctx, 52, 712, 5, '#54565c', '#d8dadd');
  rivet(ctx, 752, 712, 5, '#54565c', '#d8dadd');
  rivet(ctx, 52, 998, 5, '#54565c', '#d8dadd');
  rivet(ctx, 752, 998, 5, '#54565c', '#d8dadd');
  // ATTRIBUTES chisel header + rule
  engraveLA(ctx, 'ATTRIBUTES', 64, 734, '700 26px "Cinzel"', '#2c2e33', 'rgba(255,255,255,0.5)');
  ctx.strokeStyle = '#232529'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 752.5); ctx.lineTo(300, 752.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(64, 754.5); ctx.lineTo(300, 754.5); ctx.stroke();
  // stat labels engraved
  const labels = ['HP', 'ATK', 'DEF', 'MAG', 'SPD'];
  const rows = [770, 822, 874, 926, 978];
  labels.forEach((t, i) => engraveLA(ctx, t, 64, rows[i], '700 24px "Dogica Pixel Bold"', '#2c2e33', 'rgba(255,255,255,0.5)'));
  // bar tracks (op fills at x185 w430 h20)
  rows.forEach((y) => {
    rr(ctx, 185, y, 430, 20, 10);
    ctx.fillStyle = '#1d1f24'; ctx.fill();
    ctx.strokeStyle = '#232529'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(192, y + 3.5); ctx.lineTo(608, y + 3.5); ctx.stroke();
  });
  // value chips right (op values right-anchored x724)
  rows.forEach((y) => {
    rr(ctx, 628, y - 14, 106, 30, 8);
    ctx.fillStyle = '#26282d'; ctx.fill();
    ctx.strokeStyle = '#15161a'; ctx.lineWidth = 2; ctx.stroke();
  });
  // keystone stamp bottom
  ctx.save(); ctx.translate(400, 1046);
  ctx.strokeStyle = '#5a5c62'; ctx.lineWidth = 2;
  ctx.strokeRect(-70, -20, 140, 40);
  engrave(ctx, 'EST. I', 0, 0, '700 20px "Cinzel"', '#7c7e84', 'rgba(255,255,255,0.18)');
  ctx.restore();
  return c;
}

// ─────────────────────────────────────────── bg_2 GOLDEN ARCANUM
function bg2() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#171232', '#100c24');
  ctx.fillRect(0, 0, W, H);
  // night stars
  let s = 777;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 0.5 + rnd() * 1.1;
    ctx.fillStyle = `rgba(220,214,255,${0.12 + rnd() * 0.22})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 7; i++) star4(ctx, 40 + rnd() * 720, 40 + rnd() * 1000, 3 + rnd() * 3.5, 'rgba(212,175,55,0.55)');
  // gold double frame + corner diamonds
  ctx.strokeStyle = 'rgba(212,175,55,0.85)'; ctx.lineWidth = 2.2; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = 'rgba(212,175,55,0.40)'; ctx.lineWidth = 1; ctx.strokeRect(24, 24, W - 48, H - 48);
  [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]].forEach(([x, y]) => diamond(ctx, x, y, 7, '#d4af37'));
  // name cartouche: hairlines + center diamond (name op at 400,72)
  ctx.strokeStyle = 'rgba(212,175,55,0.75)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(150, 72.5); ctx.lineTo(360, 72.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(440, 72.5); ctx.lineTo(650, 72.5); ctx.stroke();
  diamond(ctx, 400, 40, 5, 'rgba(212,175,55,0.9)');
  diamond(ctx, 400, 104, 5, 'rgba(212,175,55,0.9)');
  diamond(ctx, 150, 72, 4, 'rgba(212,175,55,0.9)');
  diamond(ctx, 650, 72, 4, 'rgba(212,175,55,0.9)');

  // temple window (247,254 306x550): halo + arch + double gold frame + alcove
  const wx = 247, wy = 254, ww = 306, wh = 550;
  // halo ring
  ctx.strokeStyle = 'rgba(212,175,55,0.30)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(400, 470, 218, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(212,175,55,0.16)';
  ctx.beginPath(); ctx.arc(400, 470, 238, 0, Math.PI * 2); ctx.stroke();
  // magic circle behind (spokes + rings)
  ctx.save(); ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(212,175,55,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(400, 470, 150, 0, Math.PI * 2); ctx.stroke();
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(400 + Math.cos(t) * 150, 470 + Math.sin(t) * 150);
    ctx.lineTo(400 + Math.cos(t) * 218, 470 + Math.sin(t) * 218);
    ctx.stroke();
  }
  ctx.restore();
  // alcove
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(wx, wy + 60);
  ctx.arc(wx + ww / 2, wy + 60, ww / 2, Math.PI, 0);
  ctx.lineTo(wx + ww, wy + wh);
  ctx.lineTo(wx, wy + wh);
  ctx.closePath();
  ctx.fillStyle = '#1c1638'; ctx.fill();
  ctx.clip();
  const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, 'rgba(140,200,160,0.10)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
  ctx.restore();
  // gold double frame on same arch path
  const archPath = () => {
    ctx.beginPath();
    ctx.moveTo(wx, wy + 60);
    ctx.arc(wx + ww / 2, wy + 60, ww / 2, Math.PI, 0);
    ctx.lineTo(wx + ww, wy + wh);
    ctx.lineTo(wx, wy + wh);
    ctx.closePath();
  };
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; archPath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(212,175,55,0.45)'; ctx.lineWidth = 1.2; archPath(); ctx.stroke();
  // arch cap diamond + base sill
  diamond(ctx, 400, wy - 6, 7, '#d4af37');
  ctx.fillStyle = '#d4af37'; rr(ctx, 231, wy + wh - 6, ww + 24, 10, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, 231, wy + wh + 4, ww + 24, 4, 2); ctx.fill();

  // class/level rail (op text at 400,832)
  ctx.strokeStyle = 'rgba(212,175,55,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(120, 832.5); ctx.lineTo(284, 832.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(516, 832.5); ctx.lineTo(680, 832.5); ctx.stroke();
  diamond(ctx, 298, 832, 4, 'rgba(212,175,55,0.9)');
  diamond(ctx, 502, 832, 4, 'rgba(212,175,55,0.9)');

  // 4 stat pill outlines (pillfill ops inset 7px fill color)
  const pills = [[95, 902], [420, 902], [95, 958], [420, 958]];
  pills.forEach(([x, y]) => {
    rr(ctx, x, y, 285, 44, 15);
    ctx.fillStyle = '#191434'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    diamond(ctx, x + 10, y + 22, 3.4, 'rgba(212,175,55,0.8)');
  });
  // footer baseline (join at 400,1042)
  ctx.strokeStyle = 'rgba(212,175,55,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(90, 1042.5); ctx.lineTo(710, 1042.5); ctx.stroke();
  diamond(ctx, 400, 1042, 4.5, 'rgba(212,175,55,0.9)');
  return c;
}

// ───────────────────────────────────────────── bg_3 RETRO COURT
function bg3() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#e2d2ae', '#d8c8a2');
  ctx.fillRect(0, 0, W, H);
  // halftone paper grain
  ctx.fillStyle = 'rgba(122,44,58,0.05)';
  for (let y = 8; y < H; y += 12) for (let x = 8; x < W; x += 12) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  vignette(ctx, 0.16);
  // burgundy double border + corner rosettes
  ctx.strokeStyle = '#7a2c3a'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.strokeStyle = 'rgba(122,44,58,0.55)'; ctx.lineWidth = 1.2; ctx.strokeRect(26, 26, W - 52, H - 52);
  [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]].forEach(([x, y]) => {
    ctx.strokeStyle = '#7a2c3a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#7a2c3a'; ctx.fill();
  });
  // masthead ornaments: ornament rule above, double rule below name (400,90)
  ctx.strokeStyle = '#7a2c3a'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(250, 46.5); ctx.lineTo(550, 46.5); ctx.stroke();
  diamond(ctx, 400, 46, 4.5, '#7a2c3a');
  diamond(ctx, 250, 46, 3, 'rgba(122,44,58,0.7)');
  diamond(ctx, 550, 46, 3, 'rgba(122,44,58,0.7)');
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(90, 132.5); ctx.lineTo(710, 132.5); ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(90, 138.5); ctx.lineTo(710, 138.5); ctx.stroke();
  // subtitle rule under join(150)
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(180, 176.5); ctx.lineTo(620, 176.5); ctx.stroke();

  // portrait: burgundy double frame (66,216 250x424)
  ctx.fillStyle = 'rgba(58,44,32,0.14)'; rr(ctx, 66, 216, 250, 424, 4); ctx.fill();
  ctx.strokeStyle = '#7a2c3a'; ctx.lineWidth = 2.4; ctx.strokeRect(66, 216, 250, 424);
  ctx.strokeStyle = 'rgba(122,44,58,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(74, 224, 234, 408);
  [[66, 216], [316, 216], [66, 640], [316, 640]].forEach(([x, y]) => {
    ctx.fillStyle = '#7a2c3a';
    ctx.fillRect(x - 3, y - 3, 6, 6);
  });

  // 6 stat rows right of the portrait: label + dotted leader + track + value slot
  const rows = [250, 320, 390, 460, 530, 600];
  const statNames = ['HEALTH', 'ATTACK', 'DEFENSE', 'MAGIC', 'SPEED', 'LUCK'];
  ctx.textBaseline = 'middle';
  rows.forEach((cy, i) => {
    ctx.font = '600 24px "Cinzel"'; ctx.textAlign = 'left';
    ctx.fillStyle = '#3a2c20';
    ctx.fillText(statNames[i], 340, cy);
    const lw = ctx.measureText(statNames[i]).width;
    // dotted leader
    ctx.fillStyle = 'rgba(110,88,58,0.8)';
    for (let x = 348 + lw; x < 478; x += 9) { ctx.beginPath(); ctx.arc(x, cy + 8, 1.25, 0, Math.PI * 2); ctx.fill(); }
    // recessed track (rpgfills draws h11 fill at x=492, max w 120)
    rr(ctx, 486, cy - 8, 134, 16, 8);
    ctx.fillStyle = 'rgba(58,44,32,0.16)'; ctx.fill();
    ctx.strokeStyle = 'rgba(122,44,58,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  });

  // rank band: double rules around RANKX(874) + subtitle rule under join(926)
  ctx.strokeStyle = '#7a2c3a';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(120, 844.5); ctx.lineTo(680, 844.5); ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(120, 850.5); ctx.lineTo(680, 850.5); ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(150, 954.5); ctx.lineTo(650, 954.5); ctx.stroke();
  diamond(ctx, 400, 978, 3.5, 'rgba(122,44,58,0.7)');
  // mid-panel flourish in the quiet zone
  ctx.strokeStyle = 'rgba(122,44,58,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(300, 735.5); ctx.lineTo(382, 735.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(418, 735.5); ctx.lineTo(500, 735.5); ctx.stroke();
  diamond(ctx, 400, 735, 5, 'rgba(122,44,58,0.55)');
  diamond(ctx, 400, 735, 2, 'rgba(222,206,170,0.9)');
  // footer ticket strip
  ctx.strokeStyle = 'rgba(122,44,58,0.5)'; ctx.lineWidth = 1;
  rr(ctx, 60, 1010, 680, 54, 6); ctx.stroke();
  ctx.font = '700 13px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(122,44,58,0.75)';
  ctx.fillText('GUILD PLAYBILL', 400, 1037);
  return c;
}

// ─────────────────────────────────────────────── bg_4 WOODMERE
function bg4() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#583a22', '#452d1a');
  ctx.fillRect(0, 0, W, H);
  // vertical planks
  for (let x = 0; x <= W; x += 114) {
    ctx.strokeStyle = 'rgba(24,14,6,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,0.06)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 4, 0); ctx.lineTo(x + 4, H); ctx.stroke();
  }
  // grain + knots
  let s = 4242;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.strokeStyle = 'rgba(30,18,8,0.28)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) {
    const px = rnd() * W, py = rnd() * H, len = 40 + rnd() * 130;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + (rnd() - 0.5) * 10, py + len / 2, px + (rnd() - 0.5) * 6, py + len);
    ctx.stroke();
  }
  [[60, 940], [700, 990]].forEach(([kx, ky]) => {
    ctx.strokeStyle = 'rgba(30,18,8,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(kx, ky, 9, 14, 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(kx, ky, 4, 7, 0.3, 0, Math.PI * 2); ctx.stroke();
  });
  vignette(ctx, 0.42);

  // hanging sign (name 400,128 + gtitle 400,190)
  ctx.strokeStyle = '#241509'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, 58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(650, 0); ctx.lineTo(650, 58); ctx.stroke();
  ctx.fillStyle = '#241509'; rr(ctx, 134, 52, 34, 22, 4); ctx.fill();
  ctx.fillStyle = '#241509'; rr(ctx, 634, 52, 34, 22, 4); ctx.fill();
  // board
  rr(ctx, 108, 66, 584, 152, 10);
  ctx.fillStyle = vgrad(ctx, 66, 218, '#6b4829', '#54371f'); ctx.fill();
  ctx.strokeStyle = '#241509'; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,170,0.14)'; ctx.lineWidth = 1.5; rr(ctx, 116, 74, 568, 136, 8); ctx.stroke();
  // notch diamonds on sign
  diamond(ctx, 132, 142, 6, '#f0b45e');
  diamond(ctx, 668, 142, 6, '#f0b45e');

  // tan paper ledger panel
  rr(ctx, 56, 244, 700, 600, 12);
  ctx.fillStyle = vgrad(ctx, 244, 844, '#e6c493', '#dcba86'); ctx.fill();
  ctx.strokeStyle = '#3c2814'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(60,40,20,0.30)'; ctx.lineWidth = 1.2; rr(ctx, 64, 252, 684, 584, 9); ctx.stroke();
  // corner nails
  [[70, 258], [742, 258], [70, 830], [742, 830]].forEach(([x, y]) => rivet(ctx, x, y, 4, '#8a6438', '#f2d8a8'));
  // section diamond + rule (like S04 headers)
  diamond(ctx, 96, 288, 5.5, '#4a7c3c');
  ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(112, 288.5); ctx.lineTo(300, 288.5); ctx.stroke();

  // 6 ruled rows (labels x320 lm, values right-anchor 660, rows y280..765)
  const rows = [280, 377, 474, 571, 668, 765];
  rows.forEach((y) => {
    ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(306, y + 17); ctx.lineTo(744, y + 17); ctx.stroke();
    diamond(ctx, 302, y, 4, 'rgba(214,138,46,0.85)');
  });
  // wooden portrait frame (pfpClip 80,560 140x350 r12; sprite at cx150 top556)
  rr(ctx, 68, 548, 164, 374, 14);
  ctx.fillStyle = vgrad(ctx, 548, 922, '#5d3f22', '#4a3018'); ctx.fill();
  ctx.strokeStyle = '#241509'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#2c1c0e'; rr(ctx, 80, 560, 140, 350, 12); ctx.fill();
  [[80, 560], [220, 560], [80, 910], [220, 910]].forEach(([x, y]) => rivet(ctx, x, y, 4.5, '#1c1006', '#e8c890'));
  // burnt-amber rank seal at (156,292) - op draws rank letter
  ctx.fillStyle = '#a54a1c';
  ctx.beginPath(); ctx.arc(156, 292, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7e3410';
  ctx.beginPath(); ctx.arc(156, 292, 40, 0.2, Math.PI - 0.2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(156, 292, 33, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,190,0.22)';
  ctx.beginPath(); ctx.arc(148, 282, 12, 0, Math.PI * 2); ctx.fill();

  // footer: dark wood strip (join 400,960)
  rr(ctx, 120, 934, 560, 52, 8);
  ctx.fillStyle = vgrad(ctx, 934, 986, '#54371f', '#422a16'); ctx.fill();
  ctx.strokeStyle = '#241509'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,170,0.12)'; ctx.lineWidth = 1; rr(ctx, 126, 940, 548, 40, 6); ctx.stroke();
  return c;
}

// ─────────────────────────────────────────────── bg_5 EMBLEM NOIR
function bg5() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#101013', '#0c0c0e');
  ctx.fillRect(0, 0, W, H);
  // faint vertical grain
  ctx.strokeStyle = 'rgba(255,255,255,0.016)'; ctx.lineWidth = 1;
  for (let x = 6; x < W; x += 7) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  // thin gold double frame + corner squares
  ctx.strokeStyle = 'rgba(198,166,100,0.85)'; ctx.lineWidth = 1.6; ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.strokeStyle = 'rgba(198,166,100,0.38)'; ctx.lineWidth = 1; ctx.strokeRect(25, 25, W - 50, H - 50);
  [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]].forEach(([x, y]) => {
    ctx.fillStyle = '#c6a664'; ctx.fillRect(x - 4, y - 4, 8, 8);
  });
  // gold crest mark top (guild rule under op 400,88)
  ctx.save(); ctx.translate(400, 46);
  ctx.strokeStyle = '#c6a664'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-14, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(60, 0); ctx.stroke();
  diamond(ctx, 0, 0, 8, '#c6a664');
  diamond(ctx, 0, 0, 3.6, '#0c0c0e');
  ctx.restore();
  // rule under guild (y112) + rules around class line (y276)
  ctx.strokeStyle = 'rgba(198,166,100,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(240, 112.5); ctx.lineTo(560, 112.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(150, 276.5); ctx.lineTo(650, 276.5); ctx.stroke();

  // circular portrait: gold double ring + diagonal ticks (cx400 cy556 r172)
  ctx.strokeStyle = 'rgba(198,166,100,0.35)';
  ctx.setLineDash([1, 7]);
  ctx.beginPath(); ctx.arc(400, 556, 196, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c6a664'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(400, 556, 172, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(198,166,100,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(400, 556, 163, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#141418';
  ctx.beginPath(); ctx.arc(400, 556, 162, 0, Math.PI * 2); ctx.fill();
  // inner vignette on disc
  const g = ctx.createRadialGradient(400, 556, 60, 400, 556, 164);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(400, 556, 162, 0, Math.PI * 2); ctx.fill();
  [[244, 400], [556, 400], [244, 712], [556, 712]].forEach(([x, y]) => {
    const a = Math.atan2(y - 556, x - 400);
    const x0 = 400 + Math.cos(a) * 178, y0 = 556 + Math.sin(a) * 178;
    const x1 = 400 + Math.cos(a) * 192, y1 = 556 + Math.sin(a) * 192;
    ctx.strokeStyle = '#c6a664'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  });

  // 2-col stat rows: icon chip + label + thin rule to value anchor
  const rowsL = [['HP', 825], ['ATK', 875], ['DEF', 925], ['MAG', 975]];
  const rowsR = [['SPD', 825], ['LUCK', 875], ['CRIT', 925], ['EVA', 975]];
  const drawRow = (label, y, chipX, valX) => {
    // chip
    ctx.strokeStyle = 'rgba(198,166,100,0.75)'; ctx.lineWidth = 1.4;
    rr(ctx, chipX, y - 13, 26, 26, 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(198,166,100,0.55)';
    ctx.beginPath(); ctx.moveTo(chipX + 7, y); ctx.lineTo(chipX + 19, y); ctx.stroke();
    diamond(ctx, chipX + 13, y, 3, 'rgba(198,166,100,0.8)');
    // label
    ctx.font = '600 24px "Cinzel"'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a89460';
    ctx.fillText(label, chipX + 38, y);
    // rule to value
    ctx.strokeStyle = 'rgba(198,166,100,0.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chipX + 44 + ctx.measureText(label).width, y + 10); ctx.lineTo(valX - 12, y + 10); ctx.stroke();
  };
  rowsL.forEach(([t, y]) => drawRow(t, y, 168, 408));
  rowsR.forEach(([t, y]) => drawRow(t, y, 452, 692));
  // red wax mini-seal near zeni footer
  ctx.fillStyle = '#94202c';
  ctx.beginPath(); ctx.arc(690, 1036, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(690, 1036, 17, 0, Math.PI * 2); ctx.stroke();
  return c;
}

// ──────────────────────────────────────────── bg_9 RUNE MONOLITH
function bg9() {
  const [c, ctx] = canvas();
  ctx.fillStyle = vgrad(ctx, 0, H, '#2c322e', '#1e2220');
  ctx.fillRect(0, 0, W, H);
  // chisel striations
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
  let s = 99;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const y = rnd() * H, x0 = rnd() * W * 0.4, len = 60 + rnd() * 200;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + len, y + (rnd() - 0.5) * 3); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 30; i++) {
    const y = rnd() * H, x0 = rnd() * W * 0.5, len = 40 + rnd() * 160;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + len, y + (rnd() - 0.5) * 3); ctx.stroke();
  }
  // side monolith slabs
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, 0, 26, H);
  ctx.fillRect(W - 26, 0, 26, H);
  ctx.strokeStyle = 'rgba(232,140,64,0.20)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(26.5, 0); ctx.lineTo(26.5, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 26.5, 0); ctx.lineTo(W - 26.5, H); ctx.stroke();
  vignette(ctx, 0.44);

  // ember glyph band top (angular rune strokes)
  const glyphs = [
    // each glyph: strokes within 34x46 box
    [[[8, 0], [8, 44]], [[8, 0], [26, 14]]],
    [[[4, 44], [4, 0], [22, 8], [4, 18]], [[10, 26], [22, 26]]],
    [[[16, 0], [16, 44]], [[4, 10], [28, 10]], [[4, 10], [16, 28]], [[28, 10], [16, 28]]],
    [[[4, 0], [4, 44]], [[4, 0], [24, 22]], [[4, 44], [24, 22]]],
    [[[4, 0], [4, 44]], [[4, 12], [22, 30]], [[22, 30], [22, 44]]],
    [[[4, 44], [4, 0], [22, 0], [22, 16]], [[4, 22], [22, 30]]],
    [[[12, 0], [12, 44]], [[12, 22], [26, 8]], [[12, 22], [26, 36]]],
  ];
  const gx0 = 400 - (glyphs.length * 46 - 12) / 2;
  ctx.strokeStyle = '#e88c40'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  glyphs.forEach((g, gi) => {
    const ox = gx0 + gi * 46, oy = 40;
    g.forEach((st) => {
      ctx.beginPath(); ctx.moveTo(ox + st[0][0], oy + st[0][1]); ctx.lineTo(ox + st[1][0], oy + st[1][1]); ctx.stroke();
    });
  });
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(232,140,64,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(150, 100.5); ctx.lineTo(650, 100.5); ctx.stroke();

  // portrait: stepped basalt frame (250,226 300x370)
  rr(ctx, 238, 214, 324, 394, 6);
  ctx.fillStyle = vgrad(ctx, 214, 608, '#3c443e', '#2e3531'); ctx.fill();
  ctx.strokeStyle = '#12150f'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#161a16'; rr(ctx, 250, 226, 300, 370, 4); ctx.fill();
  // stepped corner notches
  ctx.fillStyle = '#12150f';
  [[238, 214], [562, 214], [238, 608], [562, 608]].forEach(([x, y]) => { ctx.fillRect(x - 5, y - 5, 10, 10); });
  // ember gem top center
  diamond(ctx, 400, 214, 8, '#e88c40');
  diamond(ctx, 400, 214, 3.6, '#ffbe78');

  // rank tablet (rank text 400,653)
  rr(ctx, 300, 618, 200, 68, 6);
  ctx.fillStyle = vgrad(ctx, 618, 686, '#3a423c', '#2c332e'); ctx.fill();
  ctx.strokeStyle = '#12150f'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(232,140,64,0.4)'; ctx.lineWidth = 1; rr(ctx, 306, 624, 188, 56, 4); ctx.stroke();
  diamond(ctx, 400, 618, 5, '#e88c40');

  // stat rows: carved labels + ember rules (labels right-aligned before value anchors)
  const rowsL = [['HP', 726], ['ATK', 798], ['DEF', 870], ['MAG', 942]];
  const rowsR = [['SPD', 726], ['LUCK', 798], ['CRIT', 870], ['EVA', 942]];
  const drawRow = (label, y, labelX, valX) => {
    ctx.font = '600 24px "Cinzel"'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = '#9ca698';
    ctx.fillText(label, labelX, y);
    ctx.strokeStyle = 'rgba(232,140,64,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(labelX + 12, y + 14); ctx.lineTo(valX - 10, y + 14); ctx.stroke();
    diamond(ctx, valX - 2, y + 14, 2.6, 'rgba(232,140,64,0.8)');
  };
  rowsL.forEach(([t, y]) => drawRow(t, y, 300, 396));
  rowsR.forEach(([t, y]) => drawRow(t, y, 656, 752));
  // footer glyph cluster BELOW the join text (join at 400,1036)
  ctx.strokeStyle = 'rgba(232,140,64,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  [[[356, 1064], [356, 1082]], [[366, 1064], [378, 1076]], [[366, 1082], [378, 1070]]].forEach((st) => {
    ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]); ctx.lineTo(st[1][0], st[1][1]); ctx.stroke();
  });
  [[[422, 1064], [422, 1082]], [[422, 1076], [434, 1064]], [[422, 1076], [434, 1082]]].forEach((st) => {
    ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]); ctx.lineTo(st[1][0], st[1][1]); ctx.stroke();
  });
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(232,140,64,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(392, 1073.5); ctx.lineTo(408, 1073.5); ctx.stroke();
  return c;
}

// extra: Noir red wax disc (replaces pixel crystal via op.img)
function waxNoir() {
  const S = 120;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#94202c';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); ctx.fill();
  // wax blob irregularities
  ctx.fillStyle = '#94202c';
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(t) * (S / 2 - 10), S / 2 + Math.sin(t) * (S / 2 - 10), 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,225,200,0.25)';
  ctx.beginPath(); ctx.arc(S / 2 - 14, S / 2 - 16, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(S / 2 + 14, S / 2 + 18, 20, 0, Math.PI * 2); ctx.fill();
  return c;
}

const jobs = [['bg_1.png', bg1], ['bg_2.png', bg2], ['bg_3.png', bg3], ['bg_4.png', bg4], ['bg_5.png', bg5], ['bg_9.png', bg9]];
for (const [name, fn] of jobs) {
  const c = fn();
  fs.writeFileSync(path.join(OUT, name), c.toBuffer('image/png'));
  console.log('baked', name);
}
fs.writeFileSync(path.join(OUT, 'wax_noir.png'), waxNoir().toBuffer('image/png'));
console.log('baked wax_noir.png');
console.log('done ->', OUT);
