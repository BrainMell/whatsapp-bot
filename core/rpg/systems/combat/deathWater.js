'use strict';
// 💧 WATER death stamp v8 — "the body collapses into a splash crown" (owner 2026-11-10: both earlier waters were trash).
// Language: a wobbly rising water COLUMN (where the body stood) that is flung outward into a ring of curved CROWN PETALS
// with a detached droplet at each tip, rippling puddle rings on the ground, and see-through bubbles. No spikes, no ball.
const { createCanvas } = require('canvas');

function paintWater(c, cx, gy, A, rnd) {
  const water = (x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(235,250,255,0.95)'); g.addColorStop(0.35, 'rgba(120,200,245,0.88)'); g.addColorStop(1, 'rgba(26,96,185,0.85)'); return g; };
  const blob = (x, y, rx, ry, col0, col1) => { c.save(); c.translate(x, y); c.scale(1, ry / rx); const g = c.createRadialGradient(0, 0, 1, 0, 0, rx); g.addColorStop(0, col0); g.addColorStop(1, col1); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore(); };
  // 1. puddle + ripples
  blob(cx, gy + 6, 200 * A, 38 * A, 'rgba(30,100,190,0.85)', 'rgba(30,100,190,0)');
  for (let r = 0; r < 4; r++) { c.strokeStyle = `rgba(220,244,255,${0.8 - r * 0.17})`; c.lineWidth = 3.4 - r * 0.6; c.beginPath(); c.ellipse(cx, gy + 8, (70 + r * 42) * A, (13 + r * 7) * A, 0, 0, Math.PI * 2); c.stroke(); }
  // 2. back petals (the far half of the crown, darker) then column, then front petals
  const petal = (ang, h, wid, back) => {
    const bx = cx + Math.cos(ang) * 66 * A, by = gy + Math.sin(ang) * 14 * A;       // base on the ground ellipse
    const out = Math.cos(ang), tx = bx + out * 62 * A, ty = by - h;                  // tip leans outward
    const w = wid * A;
    c.save();
    c.beginPath(); c.moveTo(bx - w, by);
    c.bezierCurveTo(bx - w * 0.9 + out * 10 * A, by - h * 0.55, tx - w * 0.5, ty + h * 0.2, tx, ty);
    c.bezierCurveTo(tx + w * 0.4, ty + h * 0.3, bx + w * 0.8 + out * 12 * A, by - h * 0.5, bx + w, by);
    c.closePath();
    c.fillStyle = back ? 'rgba(60,130,210,0.75)' : water(bx, ty, bx, by);
    c.fill(); c.lineWidth = 2.2; c.strokeStyle = back ? 'rgba(30,90,170,0.7)' : 'rgba(20,80,160,0.85)'; c.stroke();
    if (!back) { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx - w * 0.35, by - h * 0.15); c.quadraticCurveTo(bx - w * 0.3 + out * 6 * A, by - h * 0.6, tx - w * 0.15, ty + h * 0.12); c.stroke(); }
    c.restore();
    // detached droplet beyond the tip
    const dx = tx + out * 14 * A, dy = ty - 16 * A - rnd() * 14 * A, r = (6 + rnd() * 4) * A;
    c.fillStyle = back ? 'rgba(90,160,225,0.8)' : water(dx, dy - r, dx, dy + r); c.beginPath(); c.arc(dx, dy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(20,80,160,0.7)'; c.lineWidth = 1.4; c.stroke();
    if (!back) { c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(dx - r * 0.3, dy - r * 0.3, r * 0.32, 0, Math.PI * 2); c.fill(); }
  };
  const N = Math.round(11 * (A > 1 ? 1.2 : 1));
  const angs = []; for (let i = 0; i < N; i++) angs.push((i / N) * Math.PI * 2 + 0.2);
  const hOf = (i) => (130 + ((i * 37) % 50)) * A * (0.8 + 0.4 * rnd());
  angs.filter((a) => Math.sin(a) < 0).forEach((a, i) => petal(a, hOf(i), 14, true));
  // 3. the column: wobbly sides, rises from the puddle where the body stood
  const colH = 80 * A, w0 = 92 * A;
  c.save(); c.beginPath(); c.moveTo(cx - w0, gy);
  for (let s = 1; s <= 8; s++) { const t = s / 8, y = gy - colH * t, w = w0 * Math.sqrt(1 - t * t * 0.96) + Math.sin(t * 9) * 3 * A; c.lineTo(cx - w, y); }
  c.quadraticCurveTo(cx, gy - colH - 14 * A, cx + w0 * 0.2, gy - colH);
  for (let s = 8; s >= 1; s--) { const t = s / 8, y = gy - colH * t, w = w0 * Math.sqrt(1 - t * t * 0.96) + Math.cos(t * 8) * 3 * A; c.lineTo(cx + w, y); }
  c.lineTo(cx + w0, gy); c.closePath();
  const cg = c.createLinearGradient(cx - w0, 0, cx + w0, 0); cg.addColorStop(0, 'rgba(26,100,190,0.9)'); cg.addColorStop(0.35, 'rgba(150,215,250,0.92)'); cg.addColorStop(0.55, 'rgba(236,250,255,0.95)'); cg.addColorStop(1, 'rgba(40,120,205,0.9)');
  c.fillStyle = cg; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(16,70,150,0.8)'; c.stroke(); c.restore();
  // column highlights + the dissolving cap (bulb of water at the top)
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - w0 * 0.45, gy - 20 * A); c.quadraticCurveTo(cx - w0 * 0.5, gy - colH * 0.5, cx - w0 * 0.2, gy - colH * 0.9); c.stroke();
  // 4. front petals over the column base
  angs.filter((a) => Math.sin(a) >= 0).forEach((a, i) => petal(a, hOf(i + 5) * 0.8, 15, false));
  // 5. bubbles + fine spray
  for (let i = 0; i < 12 * A; i++) {
    const x = cx + (rnd() - 0.5) * 230 * A, y = gy - 40 * A - rnd() * 250 * A, r = (4 + rnd() * 9) * A;
    c.fillStyle = 'rgba(200,236,255,0.18)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(230,248,255,0.9)'; c.lineWidth = 1.8; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 26 * A; i++) { const x = cx + (rnd() - 0.5) * 300 * A, y = gy - 30 * A - rnd() * 280 * A, r = 1.4 + rnd() * 2.6; c.fillStyle = ['rgba(176,226,255,0.95)', 'rgba(255,255,255,0.95)', 'rgba(110,180,240,0.9)'][Math.floor(rnd() * 3)]; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
}
module.exports = { paintWater };
