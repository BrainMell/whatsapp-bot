'use strict';
// 🎞️ Node-side card-play GIF (works for every catalog card, no Go change needed). Real GIF89a via ffmpeg palette pass.
// Beats: card slams in -> burst + summon sprite rises -> effect hit (slashes/shockwave or shield/heal rings) -> number pops.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ELEMENT_COLORS } = require('./catalog');
const { drawCard, CW, CH } = require('./cardRenderer');

const W = 420, H = 280, FPS = 14, N = 18;
const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

async function renderCardPlayGif(card, info = {}) {
  const { createCanvas } = require('canvas');
  const el = ELEMENT_COLORS[card.element] || '#ffffff';
  const attack = card.type === 'ATTACK';
  // pre-render the card once
  const cc = createCanvas(CW, CH + 40); await drawCard(cc.getContext('2d'), card, 0, 0, {});
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scgif-'));
  const R = rnd(card.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7));
  const parts = Array.from({ length: 36 }, () => ({ a: R() * Math.PI * 2, v: 40 + R() * 150, s: 2 + R() * 4, d: R() * 0.3 }));
  const dmg = info.damage || 0, heal = info.healing || 0;
  const label = info.missed ? 'MISS' : (dmg > 0 ? '-' + dmg : (heal > 0 ? '+' + heal : card.abilityName.toUpperCase()));
  for (let f = 0; f < N; f++) {
    const t = f / (N - 1);
    // backdrop
    const bg = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 300); bg.addColorStop(0, hexA(el, 0.35 + 0.25 * Math.sin(t * 3))); bg.addColorStop(1, '#07080d');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.12; c.strokeStyle = el; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.6; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(W / 2 + Math.cos(a) * 400, H / 2 + Math.sin(a) * 400); c.lineWidth = 6; c.stroke(); } c.globalAlpha = 1;
    // phase A (0-.3): card slams in; B (.3-.55): burst, card shrinks to corner; C: effect
    const a = ease(t / 0.3), b = ease((t - 0.3) / 0.25);
    const cardScale = t < 0.3 ? 0.35 + 0.5 * a : 0.85 - 0.35 * b;
    const cx = t < 0.3 ? W / 2 : W / 2 - 150 * b, cy = t < 0.3 ? H + 120 - (H / 2 + 120) * a : H / 2 - 20 * b;
    // rings
    if (t > 0.28 && t < 0.75) { const k = (t - 0.28) / 0.47; c.strokeStyle = hexA(el, 1 - k); c.lineWidth = 10 * (1 - k) + 2; c.beginPath(); c.arc(W / 2 - 30, H / 2, 20 + k * 260, 0, Math.PI * 2); c.stroke(); }
    // particles
    if (t > 0.28) for (const p of parts) { const k = Math.max(0, t - 0.28 - p.d * 0.1) * 1.4; const x = W / 2 - 30 + Math.cos(p.a) * p.v * k * 2, y = H / 2 + Math.sin(p.a) * p.v * k * 2 + k * k * 30; c.fillStyle = hexA(el, Math.max(0, 1 - k * 1.2)); c.fillRect(x, y, p.s, p.s); }
    // effect beat
    if (t > 0.45) {
      const k = (t - 0.45) / 0.55;
      if (attack || (dmg > 0)) {
        c.save(); c.translate(W / 2 + 120, H / 2); c.strokeStyle = hexA('#ffffff', 1 - k); c.lineWidth = 8 * (1 - k) + 1;
        for (let i = 0; i < 3; i++) { const o = (i - 1) * 26; c.beginPath(); c.moveTo(-70 + k * 40, -60 + o); c.lineTo(70 + k * 40, 60 + o); c.stroke(); }
        c.fillStyle = hexA(el, 0.6 * (1 - k)); c.beginPath(); c.arc(0, 0, 30 + k * 90, 0, Math.PI * 2); c.fill(); c.restore();
      } else {
        for (let i = 0; i < 3; i++) { c.strokeStyle = hexA(el, Math.max(0, 1 - k - i * 0.15)); c.lineWidth = 6; c.beginPath(); c.arc(W / 2 + 110, H / 2, 30 + k * 70 + i * 22, 0, Math.PI * 2); c.stroke(); }
      }
      // number / label pop
      const pop = Math.min(1, k * 3); c.save(); c.translate(W / 2 + 110, H / 2 - 20 - k * 28); c.scale(0.6 + 0.5 * ease(pop), 0.6 + 0.5 * ease(pop));
      c.font = `bold ${label.length > 6 ? 26 : 54}px SCCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = '#0b0d12';
      c.strokeText(label, 0, 0); c.fillStyle = info.missed ? '#b9bec7' : (dmg > 0 ? '#ff6b5f' : '#5fe88a'); c.globalAlpha = Math.min(1, 2 - k * 1.2); c.fillText(label, 0, 0); c.restore();
    }
    c.save(); c.translate(cx, cy); c.rotate(t < 0.3 ? (1 - a) * -0.3 : 0); c.scale(cardScale, cardScale); c.drawImage(cc, -CW / 2, -CH / 2); c.restore();
    if (t > 0.28 && t < 0.4) { c.fillStyle = `rgba(255,255,255,${0.7 * (1 - (t - 0.28) / 0.12)})`; c.fillRect(0, 0, W, H); }
    fs.writeFileSync(path.join(dir, `f${String(f).padStart(3, '0')}.png`), cv.toBuffer('image/png'));
  }
  const out = path.join(dir, 'out.gif');
  await new Promise((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=200:stats_mode=single:reserve_transparent=0[p];[b][p]paletteuse=new=1:dither=sierra2_4a', '-gifflags', '-transdiff', '-loop', '0', out], { stdio: 'ignore' });
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} reject(new Error('gif timeout')); }, 20000);
    p.on('error', reject); p.on('close', (code) => { clearTimeout(to); code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)); });
  });
  const gif = fs.readFileSync(out);
  if (process.env.SCGIF_KEEP) console.log('kept', dir); else { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  if (gif.subarray(0, 3).toString('ascii') !== 'GIF') throw new Error('not a GIF');
  return gif;
}
module.exports = { renderCardPlayGif };
