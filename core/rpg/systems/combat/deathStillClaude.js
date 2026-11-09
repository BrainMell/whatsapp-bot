'use strict';
// ☠️ DEATH STILLS (owner 2026-11-09): enemy deaths are ONE image, not a clip. The dying enemy's own cutout is frozen
// mid-death by kind — FIRE (burst), ICE (shatter), WATER (dissolve+splash), EARTH (crumble), VOID (spiral), DUST (ash) —
// with a BOSS variant (bigger, shockwave + flash). Premade layers (glow/smoke/ember/shockwave art) are baked ONCE per
// kind to prebaked/deathstill-v1 (committed, seeded on boot); only the sprite fragmentation is live (one pass, ~tens of ms).
// Same idea as the card's ult-nova (hitFx.js): paint the event onto the still instead of animating it.
//   const jpeg = await renderDeathStill({ layers, dying:[{index, kind, boss}], deadIdx:Set, chrome })
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const KINDS = ['FIRE', 'ICE', 'WATER', 'EARTH', 'VOID', 'DUST'];
const COL = {
  FIRE: ['#fff4c2', '#ffb43a', '#e8431f', '#3a1208'], ICE: ['#ffffff', '#bfeaff', '#5fb7f0', '#1d4f8a'],
  WATER: ['#ffffff', '#9fe3ff', '#3a9be0', '#16427a'], EARTH: ['#f1e3c4', '#b89a6a', '#7a5a38', '#2c2118'],
  VOID: ['#f2d9ff', '#a65cff', '#5a1fa8', '#0b0414'], DUST: ['#ffffff', '#e8e2d4', '#a89e8a', '#4a443a'],
};
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const seedOf = (str) => { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const glow = (c, x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore(); };

// ───────── PREMADE LAYERS (512x512, centred) — baked once per kind/boss ─────────
const U = 512, M = U / 2;
function premade(kind, boss, layer) {
  const cv = createCanvas(U, U), c = cv.getContext('2d'), R = rng(seedOf(kind + (boss ? 'B' : '') + layer)), P = COL[kind];
  const k = boss ? 1 : 0.8;
  if (layer === 'back') {                       // under the fragments: glow, smoke, ground effect
    glow(c, M, M, 230 * k, P[2], 0.55); glow(c, M, M, 140 * k, P[1], 0.55);
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = 40 + R() * 150 * k; glow(c, M + Math.cos(a) * d, M + Math.sin(a) * d * 0.7 + 30, 40 + R() * 50, kind === 'FIRE' || kind === 'VOID' ? P[3] : P[2], 0.5); }
    if (kind === 'VOID') for (let i = 0; i < 4; i++) { c.strokeStyle = i % 2 ? P[1] : P[2]; c.globalAlpha = 0.6 - i * 0.1; c.lineWidth = 6 - i; c.beginPath(); c.ellipse(M, M + 10, 90 + i * 38, 36 + i * 15, 0.2 * i, 0, 6.28); c.stroke(); }
    if (kind === 'WATER') for (let i = 0; i < 3; i++) { c.strokeStyle = P[1]; c.globalAlpha = 0.65 - i * 0.18; c.lineWidth = 5; c.beginPath(); c.ellipse(M, M + 95, 70 + i * 55, 20 + i * 12, 0, 0, 6.28); c.stroke(); }
    if (kind === 'EARTH' || kind === 'DUST') for (let i = 0; i < 12; i++) glow(c, M + (R() - 0.5) * 300, M + 90 + R() * 30, 30 + R() * 45, P[2], 0.55);
    if (kind === 'ICE') for (let i = 0; i < 8; i++) glow(c, M + (R() - 0.5) * 280, M + 85 + R() * 25, 35 + R() * 35, P[1], 0.4);
  } else {                                      // over the fragments: hot core, shockwave, sparks/embers/shards
    glow(c, M, M, 120 * k, P[0], 0.95); glow(c, M, M, 60 * k, '#ffffff', 0.9);
    c.strokeStyle = P[0]; c.lineWidth = boss ? 9 : 5; c.globalAlpha = 0.85; c.beginPath(); c.ellipse(M, M, 150 * k, 150 * k * 0.62, 0, 0, 6.28); c.stroke();
    if (boss) { c.lineWidth = 4; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(M, M, 215, 135, 0, 0, 6.28); c.stroke(); }
    c.globalAlpha = 1;
    const n = boss ? 46 : 28;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = 70 + R() * 170 * k, x = M + Math.cos(a) * d, y = M + Math.sin(a) * d * 0.75, r = 3 + R() * 7;
      c.fillStyle = P[R() < 0.5 ? 0 : 1];
      if (kind === 'ICE' || kind === 'EARTH') { c.beginPath(); c.moveTo(x, y - r * 1.6); c.lineTo(x + r, y + r); c.lineTo(x - r, y + r * 0.6); c.closePath(); c.fill(); }
      else { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); if (kind === 'WATER') { c.fillStyle = '#fff'; c.globalAlpha = 0.8; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); c.fill(); c.globalAlpha = 1; } }
    }
    c.strokeStyle = P[0]; c.lineWidth = 3; c.globalAlpha = 0.8;      // radial impact streaks
    for (let i = 0; i < (boss ? 18 : 10); i++) { const a = (i / (boss ? 18 : 10)) * 6.28 + R() * 0.2, d0 = 55, d1 = 120 + R() * 90 * k; c.beginPath(); c.moveTo(M + Math.cos(a) * d0, M + Math.sin(a) * d0 * 0.75); c.lineTo(M + Math.cos(a) * d1, M + Math.sin(a) * d1 * 0.75); c.stroke(); }
  }
  return cv;
}
let _pcache = null;
function premadeCache() { if (!_pcache) { _pcache = require('../../../utils/assetBake').makeBakeCache({ ns: 'deathstill', version: 'v1', maxMB: 20, ext: 'png' }); } return _pcache; }
async function getPremade(kind, boss, layer) {
  const cache = premadeCache(), key = cache.key(kind, !!boss, layer);
  const buf = await cache.getOrBake(key, async () => premade(kind, !!boss, layer).toBuffer('image/png', { compressionLevel: 6 }));
  return loadImage(buf);
}
async function bakeAllPremade() { let n = 0; for (const k of KINDS) for (const b of [false, true]) for (const l of ['back', 'front']) { await getPremade(k, b, l); n++; } return n; }

// ───────── SPRITE FRAGMENTATION (live) ─────────
function tint(img, w, h, kind, boss) {
  const cv = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))), c = cv.getContext('2d'), P = COL[kind];
  c.drawImage(img, 0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, 0, 0, cv.height);
  if (kind === 'FIRE') { g.addColorStop(0, 'rgba(40,12,6,0.55)'); g.addColorStop(1, 'rgba(255,120,30,0.7)'); }
  else if (kind === 'ICE') { g.addColorStop(0, 'rgba(210,240,255,0.65)'); g.addColorStop(1, 'rgba(110,190,255,0.55)'); }
  else if (kind === 'WATER') { g.addColorStop(0, 'rgba(120,200,255,0.35)'); g.addColorStop(1, 'rgba(30,110,200,0.55)'); }
  else if (kind === 'EARTH') { g.addColorStop(0, 'rgba(150,130,100,0.55)'); g.addColorStop(1, 'rgba(70,52,34,0.6)'); }
  else if (kind === 'VOID') { g.addColorStop(0, 'rgba(120,50,220,0.55)'); g.addColorStop(1, 'rgba(20,4,40,0.65)'); }
  else { g.addColorStop(0, 'rgba(240,236,226,0.4)'); g.addColorStop(1, 'rgba(150,140,124,0.5)'); }
  c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  if (boss) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18; c.fillStyle = P[0]; c.fillRect(0, 0, cv.width, cv.height); }
  return cv;
}
// Split the (tinted) sprite into jittered grid cells (triangles for shatter kinds, squares for ash) and fling each cell by fn().
function shards(c, src, box, o, R) {
  const { x, y, w, h } = box, cols = o.cols, rows = o.rows, cw = w / cols, ch = h / rows;
  const jit = (i, j) => [(R() - 0.5) * cw * 0.5 * (i > 0 && i < cols ? 1 : 0), (R() - 0.5) * ch * 0.5 * (j > 0 && j < rows ? 1 : 0)];
  const pts = []; for (let j = 0; j <= rows; j++) { pts[j] = []; for (let i = 0; i <= cols; i++) { const [jx, jy] = jit(i, j); pts[j][i] = [i * cw + jx, j * ch + jy]; } }
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pts[j][i], b = pts[j][i + 1], d = pts[j + 1][i], e = pts[j + 1][i + 1];
    if (o.shape === 'rect') cells.push([a, b, e, d]); else { cells.push([a, b, d]); cells.push([b, e, d]); }
  }
  // draw far-falling pieces first so the near/intact pieces overlap them
  const items = cells.map((poly) => { const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length; return { poly, cx, cy, f: o.fn(cx / w, cy / h, R) }; });
  items.sort((p, q) => (p.f.z || 0) - (q.f.z || 0));
  for (const it of items) {
    const f = it.f; if (f.a <= 0.02) continue;
    c.save();
    c.globalAlpha = clamp(f.a, 0, 1);
    c.translate(x + it.cx + (f.dx || 0), y + it.cy + (f.dy || 0)); c.rotate(f.rot || 0); c.scale(f.sc == null ? 1 : f.sc, f.sc == null ? 1 : f.sc);
    c.beginPath(); it.poly.forEach((p, n) => { n ? c.lineTo(p[0] - it.cx, p[1] - it.cy) : c.moveTo(p[0] - it.cx, p[1] - it.cy); }); c.closePath(); c.clip();
    c.drawImage(src, -it.cx, -it.cy, w, h);
    if (f.edge) { c.strokeStyle = f.edge; c.lineWidth = 2; c.stroke(); }
    c.restore();
  }
}
const PARAMS = (kind, boss, box) => {
  const B = boss ? 1.35 : 1, W = box.w, H = box.h;
  switch (kind) {
    case 'FIRE': return { cols: 7, rows: 9, shape: 'tri', fn: (u, v, R) => { const dx = (u - 0.5), dy = (v - 0.45), d = Math.hypot(dx, dy) + 0.05, k = (0.25 + R() * 0.9) * B; return { dx: (dx / d) * W * 0.38 * k, dy: (dy / d) * H * 0.3 * k - H * 0.05, rot: (R() - 0.5) * 2.4, a: 0.95 - d * 0.5 * R(), sc: 0.85 - R() * 0.25, edge: 'rgba(255,170,60,0.9)', z: d }; } };
    case 'ICE': return { cols: 6, rows: 8, shape: 'tri', fn: (u, v, R) => { const dx = (u - 0.5), dy = (v - 0.5), d = Math.hypot(dx, dy) + 0.05, k = (0.12 + R() * 0.55) * B; return { dx: (dx / d) * W * 0.3 * k, dy: (dy / d) * H * 0.22 * k + H * 0.03 * R(), rot: (R() - 0.5) * 1.1, a: 0.98, sc: 0.97, edge: 'rgba(235,250,255,0.95)', z: d }; } };
    case 'WATER': return { cols: 8, rows: 10, shape: 'rect', fn: (u, v, R) => { const fade = clamp((0.62 - v) * 2.1 + R() * 0.35, 0, 1); const dissolve = v < 0.55 ? 0 : (v - 0.5) * 2; return { dx: (R() - 0.5) * W * 0.5 * (1 - fade) * (v < 0.5 ? 1.2 : 0.4), dy: (v < 0.5 ? -(0.2 - R() * 0.1) * H * (0.5 - v) * 1.1 : 0) + dissolve * 0, rot: (R() - 0.5) * 0.5, a: v > 0.55 ? 0.95 - dissolve * 0.25 : clamp(0.1 + fade * 0.7, 0, 0.8), sc: 0.9, z: v }; } };
    case 'EARTH': return { cols: 5, rows: 7, shape: 'tri', fn: (u, v, R) => { const drop = Math.pow(v, 1.4); return { dx: (u - 0.5) * W * 0.35 * (0.3 + R()) * B, dy: drop * H * 0.18 * (0.5 + R() * 0.8) - (1 - v) * H * 0.02, rot: (R() - 0.5) * 0.7 * (1 - v * 0.4), a: 1, sc: 0.98, edge: 'rgba(40,28,16,0.8)', z: v }; } };
    case 'VOID': return { cols: 8, rows: 10, shape: 'tri', fn: (u, v, R) => { const dx = (u - 0.5), dy = (v - 0.5), d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) + d * 5.2 * B, tr = d * (0.55 + R() * 0.25); return { dx: Math.cos(ang) * tr * W - dx * W, dy: Math.sin(ang) * tr * H * 0.8 - dy * H, rot: ang * 0.8 + (R() - 0.5), a: clamp(1.05 - d * 0.9 * R(), 0.15, 1), sc: clamp(0.95 - d * 0.7, 0.3, 1), edge: 'rgba(190,120,255,0.8)', z: -d }; } };
    default: return { cols: 14, rows: 18, shape: 'rect', fn: (u, v, R) => { const t = clamp((u * 0.9 + (1 - v) * 0.25 + R() * 0.25 - 0.28) * 1.6, 0, 1.2); const gone = t > 0.55; return { dx: t * W * 0.55 * (0.4 + R()), dy: -t * H * 0.35 * (0.2 + R()) + t * t * H * 0.06, rot: (R() - 0.5) * 1.5 * t, a: gone ? clamp(0.8 - (t - 0.55) * 1.4, 0, 0.8) : 1, sc: gone ? 0.55 : 0.97, z: t }; } };
  }
};
// crack lines (ice/earth/fire) across the still-standing core, so the freeze-frame reads as "about to break"
function cracks(c, box, kind, R, boss) {
  const P = COL[kind]; c.save(); c.strokeStyle = kind === 'FIRE' ? P[1] : kind === 'EARTH' ? '#1a120a' : P[0]; c.globalAlpha = 0.85; c.lineWidth = boss ? 3.5 : 2.2; c.lineJoin = 'round';
  const n = boss ? 7 : 4;
  for (let i = 0; i < n; i++) { let x = box.x + box.w * (0.3 + R() * 0.4), y = box.y + box.h * (0.2 + R() * 0.3); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * box.w * 0.22; y += box.h * (0.08 + R() * 0.1); c.lineTo(x, y); } c.stroke(); }
  c.restore();
}
async function paintDying(c, cut, kind, boss, key) {
  if (!KINDS.includes(kind)) kind = 'DUST';
  const img = await loadImage(Buffer.from(cut.png, 'base64'));
  const box = { x: Number(cut.x) || 0, y: Number(cut.y) || 0, w: Number(cut.w) || img.width, h: Number(cut.h) || img.height };
  const R = rng(seedOf(kind + key));
  const cx = box.x + box.w / 2, cy = box.y + box.h * 0.52, span = Math.max(box.w, box.h) * (boss ? 2.2 : 1.8);
  const back = await getPremade(kind, boss, 'back'), front = await getPremade(kind, boss, 'front');
  c.drawImage(back, cx - span / 2, cy - span / 2, span, span);
  const src = tint(img, box.w, box.h, kind, boss);
  shards(c, src, box, PARAMS(kind, boss, box), R);
  if (kind === 'ICE' || kind === 'EARTH' || kind === 'FIRE') cracks(c, box, kind, R, boss);
  c.drawImage(front, cx - span / 2, cy - span / 2, span, span);
  if (boss) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, cx, cy, span * 0.55, COL[kind][1], 0.35); c.restore(); }
}

// ───────── FULL STILL: battlefield minus the fallen + dying frozen mid-death + the card's HUD chrome ─────────
async function renderDeathStill({ layers, dying, deadIdx, chrome, quality = 0.9 }) {
  const W = Number(layers.w) || 1024, H = Number(layers.h) || 687;
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  const bg = await loadImage(layers.bg); c.drawImage(bg, 0, 0, W, H);
  const dyingIdx = new Set(dying.map((d) => Math.floor(Number(d.index) || 0)));
  const dead = deadIdx instanceof Set ? deadIdx : new Set(Array.isArray(deadIdx) ? deadIdx : []);
  const gone = new Set([...dyingIdx, ...dead]);
  if (gone.size && Array.isArray(layers.anchors)) {   // erase Go-baked overhead bars of the fallen
    for (const a of layers.anchors) {
      if (!a || String(a.side) !== 'enemy' || !gone.has(Math.floor(Number(a.index) || 0))) continue;
      const bw = 100, bh = 12, pad = 6, bx = (Number(a.x) || 0) - bw / 2 - pad, by = (Number(a.feetY) || 0) - Math.max(24, Number(a.h) || 0) - 15 - pad;
      const sw = bw + pad * 2, sh = bh + pad * 2, sy = Math.max(0, by - sh - 2), shh = Math.min(sh, Math.max(2, by - sy));
      try { c.drawImage(bg, bx, sy, sw, shh, bx, by, sw, sh); } catch (e) {}
    }
  }
  const cuts = (layers.cuts || []).filter((x) => x && x.png && !(String(x.side) === 'enemy' && gone.has(Math.floor(Number(x.index) || 0))));
  cuts.sort((a, b) => (Number(a.y) + Number(a.h)) - (Number(b.y) + Number(b.h)));
  try { await require('./groundShadow').paintShadows(c, { cuts, anchors: [] }, 1); } catch (e) {}
  const dyingCuts = dying.map((d) => ({ d, cut: (layers.cuts || []).find((x) => x && x.png && String(x.side) === 'enemy' && Math.floor(Number(x.index) || 0) === Math.floor(Number(d.index) || 0)) })).filter((x) => x.cut);
  // paint in depth order with the survivors so a dying enemy never overlaps one standing in front of it
  const all = cuts.map((x) => ({ y: Number(x.y) + Number(x.h), cut: x })).concat(dyingCuts.map((x) => ({ y: Number(x.cut.y) + Number(x.cut.h), dying: x })));
  all.sort((a, b) => a.y - b.y);
  for (const it of all) {
    if (it.dying) { try { await paintDying(c, it.dying.cut, String(it.dying.d.kind || 'DUST').toUpperCase(), !!it.dying.d.boss, String(it.dying.d.index)); } catch (e) { console.warn('[DeathStill] paint failed:', e.message); } }
    else { try { c.drawImage(await loadImage(Buffer.from(it.cut.png, 'base64')), it.cut.x, it.cut.y, it.cut.w, it.cut.h); } catch (e) {} }
  }
  if (chrome) { try { await require('./combatCardNode').paintChrome(c, 1, { ...chrome, layers, hide: gone }); } catch (e) {} }
  return cv.toBuffer('image/jpeg', { quality });
}
module.exports = { renderDeathStill, paintDying, bakeAllPremade, getPremade, KINDS };
