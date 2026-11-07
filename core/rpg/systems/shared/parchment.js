'use strict';
// 📜 PARCHMENT KIT (owner 2026-11-07: "consistent theme that fits the RPG - the old-RPG rough-paper feel of the default profile card").
// One procedural paper generator + torn/swallowtail edge paths + wax seals + stitched borders, shared by the hub banner, the summon
// cards and the card animation so everything reads as the same aged-paper world. Pure node-canvas, no assets, cached per size.
const { createCanvas } = require('canvas');

const _cache = new Map();
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const TONES = {
  warm:  { a: '#ead7a8', b: '#cdb27c', ink: '#2c1a0c', edge: '70,38,12', fiber: '120,84,40' },
  cream: { a: '#f1e4c0', b: '#d9c394', ink: '#2c1a0c', edge: '84,50,18', fiber: '130,96,50' },
  dark:  { a: '#5a4a35', b: '#34291c', ink: '#f1e4c0', edge: '10,6,2', fiber: '170,140,90' },
};

/** Aged paper texture canvas (cached). opts: {seed, tone, burn(0-1), stains(count)} */
function makePaper(w, h, opts = {}) {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  const tone = TONES[opts.tone] || TONES.warm, seed = opts.seed || 1, burn = opts.burn == null ? 0.55 : opts.burn;
  const key = `${w}x${h}:${seed}:${opts.tone || 'warm'}:${burn}:${opts.stains == null ? 2 : opts.stains}`;
  if (_cache.has(key)) return _cache.get(key);
  const R = rng(seed * 977 + w * 13 + h), cv = createCanvas(w, h), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, tone.a); g.addColorStop(1, tone.b); c.fillStyle = g; c.fillRect(0, 0, w, h);
  // mottling: big soft blotches, light and dark
  for (let i = 0; i < 46; i++) {
    const x = R() * w, y = R() * h, r = 24 + R() * Math.max(w, h) * 0.28, dark = R() < 0.55, a = 0.035 + R() * 0.06;
    const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, dark ? `rgba(${tone.fiber},${a})` : `rgba(255,248,225,${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fibres: short curved hairs
  c.lineCap = 'round';
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    const x = R() * w, y = R() * h, l = 6 + R() * 22, a = R() * Math.PI * 2;
    c.strokeStyle = `rgba(${tone.fiber},${0.05 + R() * 0.08})`; c.lineWidth = 0.6 + R() * 0.7;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + R() * 4, y + Math.sin(a) * l * 0.5 + R() * 4, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  // tea-ring stains
  for (let i = 0; i < (opts.stains == null ? 2 : opts.stains); i++) {
    const x = R() * w, y = R() * h, r = 14 + R() * Math.min(w, h) * 0.18;
    const rg = c.createRadialGradient(x, y, r * 0.7, x, y, r); rg.addColorStop(0, 'rgba(120,76,28,0)'); rg.addColorStop(0.82, 'rgba(120,76,28,0.07)'); rg.addColorStop(0.95, 'rgba(96,58,20,0.16)'); rg.addColorStop(1, 'rgba(96,58,20,0)');
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine grain (per-pixel luminance jitter)
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
  c.putImageData(img, 0, 0);
  // burnt, darkened edges (multiply-ish): four soft gradients + corner pools
  if (burn > 0) {
    const depth = Math.min(w, h) * 0.2;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, depth, 0, 0, w, depth], [0, h, 0, h - depth, 0, h - depth, w, depth], [0, 0, depth, 0, 0, 0, depth, h], [w, 0, w - depth, 0, w - depth, 0, depth, h]]) {
      const eg = c.createLinearGradient(x0, y0, x1, y1); eg.addColorStop(0, `rgba(${tone.edge},${0.62 * burn})`); eg.addColorStop(1, `rgba(${tone.edge},0)`); c.fillStyle = eg; c.fillRect(rx, ry, rw, rh);
    }
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) { const rg = c.createRadialGradient(x, y, 0, x, y, depth * 1.7); rg.addColorStop(0, `rgba(${tone.edge},${0.55 * burn})`); rg.addColorStop(1, `rgba(${tone.edge},0)`); c.fillStyle = rg; c.fillRect(x - depth * 1.7, y - depth * 1.7, depth * 3.4, depth * 3.4); }
  }
  if (_cache.size > 24) _cache.delete(_cache.keys().next().value);
  _cache.set(key, cv);
  return cv;
}

/** Torn/deckled rectangle path. notch>0 cuts a swallowtail into the RIGHT end (notchLeft cuts the left). */
function tornPath(c, x, y, w, h, o = {}) {
  const R = rng(o.seed || 7), amp = o.amp == null ? 2.2 : o.amp, step = o.step || 7, nR = o.notch || 0, nL = o.notchLeft || 0;
  c.beginPath(); c.moveTo(x, y + (R() - 0.5) * amp);
  for (let px = x + step; px < x + w - step * 0.5; px += step * (0.6 + R() * 0.8)) c.lineTo(px, y + (R() - 0.5) * amp * 2);
  c.lineTo(x + w, y + (R() - 0.5) * amp);
  if (nR) { c.lineTo(x + w - nR, y + h / 2); }
  c.lineTo(x + w, y + h + (R() - 0.5) * amp);
  for (let px = x + w - step; px > x + step * 0.5; px -= step * (0.6 + R() * 0.8)) c.lineTo(px, y + h + (R() - 0.5) * amp * 2);
  c.lineTo(x, y + h + (R() - 0.5) * amp);
  if (nL) { c.lineTo(x + nL, y + h / 2); }
  c.closePath();
}

/** Stitched (dashed) inset border following a rounded rect. */
function stitch(c, x, y, w, h, r, color = 'rgba(60,34,14,0.7)', lw = 1.2, dash = [5, 4]) {
  c.save(); c.setLineDash(dash); c.lineWidth = lw; c.strokeStyle = color; c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.stroke(); c.restore();
}

/** Wax seal: lumpy blob, embossed ring and optional centre text/glyph painter. */
function waxSeal(c, cx, cy, r, color = '#a3201c', draw) {
  const R = rng(Math.round(cx * 31 + cy * 17 + r)), pts = [];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rr = r * (0.9 + R() * 0.16); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = r * 0.5; c.shadowOffsetY = r * 0.18;
  c.beginPath(); pts.forEach(([x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length], mx = (x + nx) / 2, my = (y + ny) / 2; if (!i) c.moveTo(mx, my); c.quadraticCurveTo(nx, ny, (nx + pts[(i + 2) % pts.length][0]) / 2, (ny + pts[(i + 2) % pts.length][1]) / 2); });
  c.closePath(); const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05); g.addColorStop(0, '#ffffff55'); g.addColorStop(0.25, color); g.addColorStop(1, '#00000099'); c.fillStyle = color; c.fill(); c.fillStyle = g; c.fill(); c.restore();
  c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.lineWidth = Math.max(1, r * 0.12); c.strokeStyle = 'rgba(0,0,0,0.38)'; c.stroke();
  c.beginPath(); c.arc(cx + r * 0.02, cy + r * 0.04, r * 0.72, Math.PI * 1.05, Math.PI * 1.9); c.lineWidth = Math.max(1, r * 0.08); c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
  if (draw) draw(c, cx, cy, r);
}

/** Draw `paper` clipped to the path already set on c, with a soft inner edge shadow for thickness. */
function fillPaper(c, paper, x, y) { c.save(); c.clip(); c.drawImage(paper, x, y); c.restore(); }

module.exports = { makePaper, tornPath, stitch, waxSeal, fillPaper, rng, TONES };
