// Crowd layout QA: synthetic Go response (single-row sardine line) -> relayout -> side-by-side. node scripts/qa_crowd_layout.js <outdir>
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const { relayout } = require('../core/rpg/systems/combat/crowdLayout');
const W = 1024, H = 687;
function figure(w, h, hue) { const c = createCanvas(w, h), g = c.getContext('2d'); g.fillStyle = `hsl(${hue},55%,45%)`; g.beginPath(); g.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.38, 0, 0, 7); g.fill(); g.beginPath(); g.arc(w / 2, h * 0.2, w * 0.24, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(w * 0.36, h * 0.16, w * 0.1, h * 0.05); g.fillRect(w * 0.54, h * 0.16, w * 0.1, h * 0.05); return c; }
function fake(n, bossIdx = -1) {
  const anchors = [], cuts = [], base = createCanvas(W, H), bc = base.getContext('2d');
  const add = (side, index, x, w, h, hue) => { const feetY = 520, fig = figure(w, h, hue); anchors.push({ side, index, x, feetY, w, h }); cuts.push({ side, index, x: x - w / 2, y: feetY - h, w, h, png: fig.toBuffer('image/png').toString('base64') }); bc.drawImage(fig, x - w / 2, feetY - h); };
  add('player', 0, 200, 150, 220, 210);
  const step = 480 / n; for (let i = 0; i < n; i++) add('enemy', i, 500 + step * (i + 0.5), i === bossIdx ? 190 : 130, i === bossIdx ? 260 : 170, (i * 47) % 360);
  const bg = createCanvas(W, H), g = bg.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#3b4a63'); gr.addColorStop(0.55, '#51684a'); gr.addColorStop(1, '#2c3a2b'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return { success: true, w: W, h: H, bg: bg.toBuffer('image/png'), sprites: base.toBuffer('image/png'), focus: null, anchors, cuts, _n: n };
}
(async () => {
  const out = process.argv[2] || '/tmp'; const cases = [[2, -1], [3, -1], [4, -1], [6, -1], [6, 2], [8, -1]];
  const sheet = createCanvas(W, 330 * cases.length * 0 + 330 * cases.length / 1), sc = sheet.getContext('2d'); let bad = 0; sheet.width = W; sheet.height = 335 * cases.length;
  for (let i = 0; i < cases.length; i++) {
    const [n, b] = cases[i]; const L = fake(n, b); const payload = { enemies: Array.from({ length: n }, (_, k) => ({ isBoss: k === b })), focusSide: 'enemy', focusIndex: 1 };
    const R = await relayout({ ...L, anchors: L.anchors.slice(), cuts: L.cuts.slice() }, payload);
    const ok = n < 3 ? R.sprites === L.sprites : (R.crowd && R.anchors.length === L.anchors.length && R.focus); if (!ok) bad++;
    // overlap metric among enemy anchors (box overlap area / smaller box area)
    const ov = (A) => { const e = A.filter((a) => a.side === 'enemy'); let worst = 0; for (let p = 0; p < e.length; p++) for (let q = p + 1; q < e.length; q++) { const a = e[p], c = e[q]; const x = Math.max(0, Math.min(a.x + a.w / 2, c.x + c.w / 2) - Math.max(a.x - a.w / 2, c.x - c.w / 2)); const y = Math.max(0, Math.min(a.feetY, c.feetY) - Math.max(a.feetY - a.h, c.feetY - c.h)); worst = Math.max(worst, (x * y) / Math.min(a.w * a.h, c.w * c.h)); } return worst; };
    console.log(ok ? 'PASS' : 'FAIL', n + ' enemies' + (b >= 0 ? ' +boss' : ''), 'worst overlap before', ov(L.anchors).toFixed(2), 'after', ov(R.anchors).toFixed(2));
    for (const [j, LL] of [[0, L], [1, R]]) { const cv = createCanvas(W, H), c = cv.getContext('2d'); c.drawImage(await loadImage(LL.bg), 0, 0); c.drawImage(await loadImage(LL.sprites), 0, 0); sc.drawImage(cv, j * W / 2, i * 335, W / 2, 335 * 0.5 * 2 * 0.5 + 0); }
    sc.drawImage(sheet, 0, 0, 0, 0);
  }
  fs.writeFileSync(path.join(out, 'crowd_layout.png'), sheet.toBuffer('image/png')); console.log(bad ? 'FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
