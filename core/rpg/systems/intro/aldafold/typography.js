'use strict';
// Kinetic typography: word-by-word narration and tracked-in gold shouts — drawn as part of the scene, not as subtitles.
const path = require('path');
const K = require('./paperKit');
const { clamp, smooth, easeOut, seg, lerp } = K;
const { registerFont } = require('canvas');
let _fonts = false;
function fonts() {
  if (_fonts) return; _fonts = true;
  const dir = path.join(__dirname, '..', '..', '..', '..', 'rpgasset', 'fonts');
  try { registerFont(path.join(dir, 'CinzelDecorative-Bold.ttf'), { family: 'AldCinzelDeco', weight: 'bold' }); } catch (e) {}
  try { registerFont(path.join(dir, 'Cinzel-Variable.ttf'), { family: 'AldCinzel' }); } catch (e) {}
  try { registerFont(path.join(dir, 'IMFellEnglish-Italic.ttf'), { family: 'AldFell', style: 'italic' }); } catch (e) {}
  try { registerFont(path.join(dir, 'IMFellEnglish-Regular.ttf'), { family: 'AldFellR' }); } catch (e) {}
  try { registerFont(path.join(dir, 'NotoSansRunic-Regular.ttf'), { family: 'AldRunic' }); } catch (e) {}
}
const Y = { high: 0.27, mid: 0.5, low: 0.8 };

// parse "{g}Order{/}" colour tags into words with colours
function parseLine(line) {
  const out = []; let col = null;
  line.split(/(\{[gc/]\})/).forEach((tok) => { if (tok === '{g}') col = 'g'; else if (tok === '{c}') col = 'c'; else if (tok === '{/}') col = null; else tok.split(' ').forEach((w) => { if (w) out.push({ w, col }); }); });
  return out;
}

function drawNarr(ctx, W, H, b, t) {
  const slow = b.slow || 1, dur = b.t1 - b.t0, local = t - b.t0, fadeOut = 1 - smooth(seg(t, b.t1 - 0.7, b.t1));
  const size = 28, lh = 36, cy = H * Y[b.y] - ((b.lines.length - 1) * lh) / 2;
  ctx.save(); ctx.font = `italic ${size}px AldFell, serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const allWords = b.lines.map(parseLine), total = allWords.reduce((n, l) => n + l.length, 0), perWord = Math.min(0.34 * slow, (dur - 1.4) / Math.max(1, total)); let wi = 0;
  // soft darkening pocket behind the text so it reads over any scene
  const bandA = fadeOut * smooth(seg(local, 0, 0.6)) * 0.55, ph = lh * b.lines.length + 54;
  const gr = ctx.createLinearGradient(0, cy - ph / 2 - 20, 0, cy + ph / 2 + 20); gr.addColorStop(0, 'rgba(4,3,10,0)'); gr.addColorStop(0.5, `rgba(4,3,10,${bandA})`); gr.addColorStop(1, 'rgba(4,3,10,0)'); ctx.fillStyle = gr; ctx.fillRect(0, cy - ph / 2 - 20, W, ph + 40);
  b.lines.forEach((_, li) => {
    const words = allWords[li], widths = words.map((o) => ctx.measureText(o.w + ' ').width), tw = widths.reduce((a, c) => a + c, 0) - ctx.measureText(' ').width; let x = (W - tw) / 2; const y = cy + li * lh;
    words.forEach((o, k) => {
      const t0 = 0.25 + wi * perWord, p = smooth(seg(local, t0, t0 + 0.7 * slow)); wi++;
      if (p > 0) {
        const a = p * fadeOut; ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 2;
        const col = o.col === 'g' ? '#f3dc9a' : o.col === 'c' ? '#e0605a' : '#efe6cf'; ctx.fillStyle = col;
        ctx.save(); ctx.translate(x, y + (1 - p) * 7); ctx.scale(1 + (1 - p) * 0.05, 1 + (1 - p) * 0.05); ctx.fillText(o.w, 0, 0);
        if (o.col) { ctx.shadowColor = o.col === 'g' ? 'rgba(243,220,154,0.7)' : 'rgba(224,70,60,0.7)'; ctx.shadowBlur = 16 * p; ctx.fillText(o.w, 0, 0); }
        ctx.restore();
      }
      x += widths[k];
    });
  });
  ctx.restore();
}

function tracked(ctx, text, cx, cy, spacing) {                    // draw centred text with manual letter-spacing; returns nothing
  const ws = [...text].map((ch) => ctx.measureText(ch).width), tw = ws.reduce((a, c) => a + c, 0) + spacing * (ws.length - 1); let x = cx - tw / 2;
  [...text].forEach((ch, i) => { ctx.fillText(ch, x, cy); x += ws[i] + spacing; });
}
function drawShout(ctx, W, H, b, t, frame) {
  const slow = b.slow || 1, local = t - b.t0, fadeOut = 1 - smooth(seg(t, b.t1 - 0.9, b.t1)), size = b.size || 40, lh = size * 1.32, cy0 = H * Y[b.y] - ((b.lines.length - 1) * lh) / 2;
  ctx.save(); ctx.font = `bold ${size}px AldCinzelDeco, serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  // dark pocket
  const bandA = fadeOut * smooth(seg(local, 0, 0.8)) * 0.5, ph = lh * b.lines.length + 70;
  const gr = ctx.createLinearGradient(0, cy0 - 40, 0, cy0 + ph); gr.addColorStop(0, 'rgba(4,3,10,0)'); gr.addColorStop(0.45, `rgba(4,3,10,${bandA})`); gr.addColorStop(1, 'rgba(4,3,10,0)'); ctx.fillStyle = gr; ctx.fillRect(0, cy0 - 50, W, ph + 40);
  b.lines.forEach((line, i) => {
    const st = (b.stagger && b.stagger[i]) || 0, p = smooth(seg(local, st + 0.1, st + 1.9 * slow)), a = p * fadeOut; if (a <= 0.001) return;
    const spacing = lerp(size * 0.55, size * 0.1, easeOut(p)), sc = lerp(b.big ? 1.12 : 1.06, 1, easeOut(p)), y = cy0 + i * lh;
    let shake = 0; if (b.big && local - st < 0.5) shake = (1 - (local - st) / 0.5) * 3;
    ctx.save(); ctx.translate(W / 2 + (Math.sin(frame * 3.7) * shake), y + Math.cos(frame * 2.9) * shake); ctx.scale(sc, sc); ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
    if (b.violet) { grad.addColorStop(0, '#f2e9ff'); grad.addColorStop(0.55, '#b8a6f2'); grad.addColorStop(1, '#6c55b8'); } else { grad.addColorStop(0, '#fff6dc'); grad.addColorStop(0.5, '#f3dc9a'); grad.addColorStop(1, '#b98a3c'); }
    // glow pass, then crisp pass, then dark outline underneath for legibility
    ctx.shadowColor = b.violet ? 'rgba(150,120,255,0.85)' : 'rgba(255,200,110,0.8)'; ctx.shadowBlur = 22 * a; ctx.fillStyle = grad; tracked(ctx, line, 0, 0, spacing);
    ctx.shadowBlur = 0; ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(8,5,16,0.75)'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'destination-over'; // outline behind fill
    const ws = [...line].map((ch) => ctx.measureText(ch).width), tw = ws.reduce((x, c) => x + c, 0) + spacing * (ws.length - 1); let x = -tw / 2; [...line].forEach((ch, k) => { ctx.strokeText(ch, x, 0); x += ws[k] + spacing; });
    ctx.restore();
  });
  ctx.restore();
}
function drawText(ctx, W, H, blocks, t, frame) {
  fonts();
  for (const b of blocks) { if (t < b.t0 || t > b.t1 + 0.05) continue; if (b.kind === 'shout') drawShout(ctx, W, H, b, t, frame); else drawNarr(ctx, W, H, b, t); }
}
module.exports = { drawText, fonts };
