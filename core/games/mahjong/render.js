'use strict';
// Mahjong renderer: tile faces drawn in code (no assets), board stills and animated clips.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { createCanvas } = require('canvas');
const T = require('./tiles');

const W = 1000, H = 760;           // canvas (both even: h264 needs it)
const TW = 60, TH = 76, D = 8;     // tile face size and slab depth
const HW = 30, HH = 38;            // px per half-unit
const OX = 50, OY = 118;           // board origin
const FPS = 15;

// ---- fonts: CJK glyphs if the box has them, Latin fallbacks otherwise -----------------------------
let HAS_CJK = process.env.MJ_NO_CJK !== '1';
if (HAS_CJK) { try { HAS_CJK = /cjk|wenquanyi|noto sans sc|noto serif sc/i.test(String(execSync('fc-list :lang=zh family', { timeout: 4000 }))); } catch (e) { HAS_CJK = false; } }
const CJK = '"Noto Sans CJK SC","Noto Sans CJK JP","Noto Serif CJK SC","WenQuanYi Zen Hei",sans-serif';
const UI = '"Poppins","DejaVu Sans",sans-serif';

const INK = '#1b1b1b', RED = '#c62828', GREEN = '#1b7a3a', BLUE = '#1c4fa3', GOLD = '#ffd24a';

const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

// ---- face glyphs -----------------------------------------------------------------------------------
const DOT_POS = {
  1: [[.5, .5]], 2: [[.5, .27], [.5, .73]], 3: [[.27, .2], [.5, .5], [.73, .8]],
  4: [[.3, .27], [.7, .27], [.3, .73], [.7, .73]], 5: [[.3, .27], [.7, .27], [.5, .5], [.3, .73], [.7, .73]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.22, .17], [.5, .27], [.78, .37], [.3, .62], [.7, .62], [.3, .84], [.7, .84]],
  8: [[.3, .15], [.7, .15], [.3, .38], [.7, .38], [.3, .62], [.7, .62], [.3, .85], [.7, .85]],
  9: [[.2, .2], [.5, .2], [.8, .2], [.2, .5], [.5, .5], [.8, .5], [.2, .8], [.5, .8], [.8, .8]],
};
function dot(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r * 0.62, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r * 0.38, 0, 7); c.fill();
}
function drawDots(c, n) {
  const pts = DOT_POS[n]; const r = n === 1 ? 17 : n <= 3 ? 9.5 : n <= 6 ? 8.5 : 7;
  pts.forEach(([u, v], i) => {
    const col = n === 1 ? RED : (n === 5 && i === 2) ? RED : (i % 3 === 0 ? GREEN : i % 3 === 1 ? BLUE : RED);
    dot(c, 8 + u * (TW - 16), 8 + v * (TH - 16), r, col);
  });
}
const BAM_POS = {
  2: [[.5, .27], [.5, .73]], 3: [[.5, .27], [.3, .73], [.7, .73]], 4: [[.3, .27], [.7, .27], [.3, .73], [.7, .73]],
  5: [[.3, .27], [.7, .27], [.5, .5], [.3, .73], [.7, .73]], 6: [[.25, .27], [.5, .27], [.75, .27], [.25, .73], [.5, .73], [.75, .73]],
  7: [[.5, .2], [.25, .55], [.5, .55], [.75, .55], [.25, .86], [.5, .86], [.75, .86]],
  8: [[.2, .27], [.4, .27], [.6, .27], [.8, .27], [.2, .73], [.4, .73], [.6, .73], [.8, .73]],
  9: [[.25, .2], [.5, .2], [.75, .2], [.25, .5], [.5, .5], [.75, .5], [.25, .8], [.5, .8], [.75, .8]],
};
function stick(c, x, y, w, h, col) {
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, col); g.addColorStop(.5, '#fff'); g.addColorStop(1, col);
  c.fillStyle = col; rr(c, x - w / 2, y - h / 2, w, h, w / 2.4); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - w / 2 + 1.5, y - h / 2 + 3, 1.6, h - 6);
  c.fillStyle = '#0b3d1c'; c.fillRect(x - w / 2, y - 0.8, w, 1.6);
}
function drawBamboo(c, n) {
  if (n === 1) { // the bird
    c.fillStyle = GREEN; c.beginPath(); c.ellipse(30, 44, 14, 17, -0.25, 0, 7); c.fill();
    c.fillStyle = RED; c.beginPath(); c.ellipse(36, 24, 8, 9, 0, 0, 7); c.fill();
    c.fillStyle = GREEN; c.beginPath(); c.ellipse(22, 62, 6, 9, 0.5, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(38, 22, 2.6, 0, 7); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(38.6, 22, 1.2, 0, 7); c.fill();
    c.fillStyle = GOLD; c.beginPath(); c.moveTo(43, 24); c.lineTo(52, 27); c.lineTo(43, 29); c.fill();
    return;
  }
  const w = n >= 8 ? 6 : 8, h = n >= 7 ? 21 : 24;
  BAM_POS[n].forEach(([u, v], i) => stick(c, 8 + u * (TW - 16), 8 + v * (TH - 16), w, h, (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1) ? RED : GREEN));
}
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
function text(c, s, x, y, size, col, font = CJK, weight = 'bold') {
  c.font = `${weight} ${size}px ${font}`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}
function drawChar(c, n) {
  if (HAS_CJK) { text(c, NUM[n - 1], 30, 25, 31, INK); text(c, '萬', 30, 54, 29, RED); }
  else { text(c, String(n), 30, 26, 32, INK, UI); text(c, 'WAN', 30, 56, 15, RED, UI); }
}
function flower(c, x, y, r, col) {
  c.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; c.beginPath(); c.arc(x + Math.cos(a) * r * .62, y + Math.sin(a) * r * .62, r * .46, 0, 7); c.fill(); }
  c.fillStyle = GOLD; c.beginPath(); c.arc(x, y, r * .3, 0, 7); c.fill();
}
function sun(c, x, y, r, col) {
  c.strokeStyle = col; c.lineWidth = 2.4; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(x + Math.cos(a) * r * .75, y + Math.sin(a) * r * .75); c.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); c.stroke(); }
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r * .6, 0, 7); c.fill();
}
function drawFace(c, kind) {
  const s = kind[0], n = Number(kind[1]);
  if (/^D[1-9]$/.test(kind)) return drawDots(c, n);
  if (/^B[1-9]$/.test(kind)) return drawBamboo(c, n);
  if (/^C[1-9]$/.test(kind)) return drawChar(c, n);
  if (kind === 'WE' || kind === 'WS' || kind === 'WW' || kind === 'WN') {
    const i = ['WE', 'WS', 'WW', 'WN'].indexOf(kind);
    if (HAS_CJK) text(c, '東南西北'[i], 30, 39, 44, i % 2 ? BLUE : INK); else text(c, 'ESWN'[i], 30, 39, 40, i % 2 ? BLUE : INK, UI);
    return;
  }
  if (kind === 'DR') return HAS_CJK ? text(c, '中', 30, 39, 48, RED) : text(c, 'R', 30, 39, 44, RED, UI);
  if (kind === 'DG') return HAS_CJK ? text(c, '發', 30, 39, 46, GREEN) : text(c, 'G', 30, 39, 44, GREEN, UI);
  if (kind === 'DW') { c.strokeStyle = BLUE; c.lineWidth = 3; rr(c, 11, 13, 38, 50, 5); c.stroke(); c.lineWidth = 1.6; rr(c, 16, 18, 28, 40, 3); c.stroke(); return; }
  if (s === 'F') {
    const cols = ['#e0457b', '#8e44ad', '#f39c12', '#16a085'];
    flower(c, 30, 24, 15, cols[n - 1]);
    if (HAS_CJK) text(c, '梅蘭菊竹'[n - 1], 30, 55, 27, cols[n - 1]); else text(c, 'F' + n, 30, 55, 20, cols[n - 1], UI);
    return;
  }
  if (s === 'S') {
    const cols = ['#27ae60', '#e67e22', '#c0392b', '#2980b9'];
    sun(c, 30, 24, 13, cols[n - 1]);
    if (HAS_CJK) text(c, '春夏秋冬'[n - 1], 30, 55, 27, cols[n - 1]); else text(c, 'S' + n, 30, 55, 20, cols[n - 1], UI);
  }
}

// ---- tile sprites (cached): face + jade slab ------------------------------------------------------
const sprites = new Map();
function slab(c) {
  const g = c.createLinearGradient(0, TH, TW + D, TH + D); g.addColorStop(0, '#2c8a63'); g.addColorStop(1, '#0f4a34');
  c.fillStyle = g; rr(c, D, D, TW, TH, 9); c.fill();
}
function sprite(kind, mode) { // mode: 'n' normal, 'd' dimmed, 'b' back
  const key = kind + mode; if (sprites.has(key)) return sprites.get(key);
  const cv = createCanvas(TW + D, TH + D); const c = cv.getContext('2d');
  slab(c);
  const g = c.createLinearGradient(0, 0, TW, TH); g.addColorStop(0, '#fffdf3'); g.addColorStop(1, '#efe6c8');
  c.fillStyle = mode === 'b' ? '#1f9a6d' : g; rr(c, 0, 0, TW, TH, 9); c.fill();
  c.strokeStyle = mode === 'b' ? '#0f4a34' : '#cdbf93'; c.lineWidth = 1.4; rr(c, 0.7, 0.7, TW - 1.4, TH - 1.4, 8.5); c.stroke();
  if (mode === 'b') { c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; rr(c, 8, 8, TW - 16, TH - 16, 6); c.stroke(); }
  else drawFace(c, kind);
  if (mode === 'd') { c.fillStyle = 'rgba(8,24,18,.46)'; rr(c, 0, 0, TW, TH, 9); c.fill(); c.save(); c.globalCompositeOperation = 'source-atop'; c.restore(); }
  sprites.set(key, cv); return cv;
}

// ---- board drawing -----------------------------------------------------------------------------------
function pos(t) { return { x: OX + t.x * HW - t.z * D, y: OY + t.y * HH - t.z * D }; }

function background(c) {
  const g = c.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 640); g.addColorStop(0, '#14513c'); g.addColorStop(1, '#06201a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalAlpha = .05; c.strokeStyle = '#fff'; c.lineWidth = 1;
  for (let i = -H; i < W; i += 36) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); }
  c.globalAlpha = 1;
}
function header(c, info) {
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, 84);
  c.fillStyle = GOLD; c.fillRect(0, 84, W, 3);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `bold 38px ${UI}`; c.fillStyle = GOLD; c.fillText(HAS_CJK ? '麻雀  MAHJONG' : 'MAHJONG', 34, 36);
  c.font = `500 18px ${UI}`; c.fillStyle = '#bfe8d6'; c.fillText(info.sub || "", 36, 70);
  const stats = [['TILES', info.left], ['SCORE', info.score], ['MOVES', info.moves], ['TIME', info.time]];
  stats.forEach(([k, v], i) => {
    const x = 520 + i * 118;
    c.textAlign = 'center'; c.font = `500 13px ${UI}`; c.fillStyle = '#8fc9b0'; c.fillText(k, x, 26);
    c.font = `bold 28px ${UI}`; c.fillStyle = '#fff'; c.fillText(String(v), x, 54);
  });
}
function badge(c, t) {
  const p = pos(t); const s = String(t.id);
  c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(p.x + 14, p.y + 14, 14, 0, 7); c.fill();
  c.strokeStyle = '#7a5a00'; c.lineWidth = 1.6; c.stroke();
  c.font = `bold ${s.length > 2 ? 13 : 16}px ${UI}`; c.fillStyle = '#2b1d00'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, p.x + 14, p.y + 15);
}
/**
 * opts: hidden:Set(ids not drawn) badges:bool hint:[ids] pulse:number back:bool offsets:Map(id->{dx,dy}) fall:Map(z->0..1)
 */
function drawBoard(c, tiles, info, opts = {}) {
  background(c); header(c, info);
  const alive = tiles.filter((t) => t.alive && !(opts.hidden && opts.hidden.has(t.id)));
  const free = new Set(T.freeTiles(tiles.filter((t) => t.alive)).map((t) => t.id));
  const list = alive.slice().sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  for (const t of list) {
    const isFree = free.has(t.id); const p = pos(t); let { x, y } = p; let alpha = 1;
    if (opts.fall && opts.fall.has(t.z)) { const k = opts.fall.get(t.z); if (k <= 0) continue; y -= (1 - k) * 90; alpha = Math.min(1, k * 1.6); }
    if (opts.offsets && opts.offsets.has(t.id)) { const o = opts.offsets.get(t.id); x += o.dx; y += o.dy; }
    c.globalAlpha = alpha;
    // soft contact shadow so stacks read as 3-D
    c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, x + D + 3, y + D + 4, TW, TH, 9); c.fill();
    c.drawImage(sprite(t.kind, opts.back ? 'b' : (isFree || opts.noDim) ? 'n' : 'd'), x, y);
    if (isFree && !opts.back) { c.strokeStyle = 'rgba(255,214,74,.9)'; c.lineWidth = 2.2; rr(c, x + 1, y + 1, TW - 2, TH - 2, 8); c.stroke(); }
    c.globalAlpha = 1;
  }
  if (opts.badges) for (const t of list) if (free.has(t.id)) badge(c, t);
  if (opts.hint) {
    const k = 0.5 + 0.5 * Math.sin((opts.pulse || 0) * 6);
    for (const id of opts.hint) { const t = tiles.find((q) => q.id === id); if (!t) continue; const p = pos(t);
      c.strokeStyle = `rgba(80,235,255,${0.55 + 0.45 * k})`; c.lineWidth = 5; c.shadowColor = '#4ff'; c.shadowBlur = 14 + 10 * k; rr(c, p.x - 2, p.y - 2, TW + 4, TH + 4, 10); c.stroke(); c.shadowBlur = 0; }
  }
}

function still(tiles, info, opts) {
  const cv = createCanvas(W, H); drawBoard(cv.getContext('2d'), tiles, info, { badges: true, ...(opts || {}) });
  return cv.toBuffer('image/jpeg', { quality: 0.92 });
}

// ---- clips ------------------------------------------------------------------------------------------------
function encodeMP4(frames) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `mj_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`);
    const args = ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', '-an', out];
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    p.on('error', reject);
    p.on('exit', (code) => { try { if (code !== 0) return reject(new Error('ffmpeg ' + code + ' ' + err.slice(-200))); const b = fs.readFileSync(out); fs.unlinkSync(out); resolve(b); } catch (e) { reject(e); } });
    (async () => { for (const f of frames()) { if (!p.stdin.write(f)) await new Promise((r) => p.stdin.once('drain', r)); } p.stdin.end(); })().catch((e) => { try { p.kill('SIGKILL'); } catch (e2) {} reject(e); });
  });
}
const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const back = (t) => { t = Math.max(0, Math.min(1, t)); const c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const raw = (cv) => cv.toBuffer('raw');

function particles(n, cx, cy, seed = 1) {
  const out = []; let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, sp = 80 + rnd() * 260; out.push({ cx, cy, a, sp, r: 2 + rnd() * 4, col: ['#ffd24a', '#fff', '#7ff', '#ff8ad8', '#9f9'][i % 5], spin: rnd() * 6 }); }
  return out;
}
function star(c, x, y, r, rot) {
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4; const rad = i % 2 ? r * .4 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); c.fill();
}

/** a matched pair: pulse -> fly together -> burst. `tiles` is the state BEFORE removal. */
function matchClip(tiles, a, b, info, gain) {
  const cv = createCanvas(W, H); const c = cv.getContext('2d');
  const pa = pos(a), pb = pos(b); const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  const parts = particles(34, mx + TW / 2, my + TH / 2, a.id * 7 + b.id);
  const after = tiles.map((t) => (t === a || t === b ? { ...t, alive: false } : t));
  const hidden = new Set([a.id, b.id]);
  return encodeMP4(function* () {
    const total = 20;
    for (let f = 0; f < total; f++) {
      drawBoard(c, tiles, info, { hidden, noDim: false });
      const t1 = f / 5, t2 = (f - 5) / 6, t3 = (f - 11) / 9;
      for (const [t, p] of [[a, pa], [b, pb]]) {
        let x = p.x, y = p.y, s = 1, rot = 0;
        if (f < 5) { s = 1 + 0.16 * Math.sin(Math.min(1, t1) * Math.PI); y -= 10 * ease(t1); }
        else if (f < 11) { const k = ease(t2); x = p.x + (mx - p.x) * k; y = p.y - 10 + (my - p.y + 10) * k; s = 1.06 - 0.2 * k; rot = (p === pa ? -1 : 1) * 0.35 * k; }
        else continue;
        c.save(); c.translate(x + TW / 2, y + TH / 2); c.rotate(rot); c.scale(s, s);
        c.shadowColor = '#ffe27a'; c.shadowBlur = 24; c.drawImage(sprite(t.kind, 'n'), -TW / 2, -TH / 2); c.restore();
      }
      if (f >= 10) { // flash ring + particles
        const k = (f - 10) / 9; c.globalAlpha = Math.max(0, 1 - k);
        c.strokeStyle = '#fff6c9'; c.lineWidth = 8 * (1 - k) + 1; c.beginPath(); c.arc(mx + TW / 2, my + TH / 2, 20 + 130 * ease(k), 0, 7); c.stroke();
        for (const p of parts) { const d = p.sp * ease(k) * 0.9; c.fillStyle = p.col; star(c, p.cx + Math.cos(p.a) * d, p.cy + Math.sin(p.a) * d + 50 * k * k, p.r * (1.6 - k), p.spin + k * 6); }
        c.globalAlpha = 1;
        if (gain) { c.font = `bold 34px ${UI}`; c.fillStyle = '#fff'; c.strokeStyle = '#0a3d2c'; c.lineWidth = 5; c.textAlign = 'center'; const ty = my - 20 - 60 * ease(k); c.globalAlpha = Math.max(0, 1 - Math.max(0, k - .55) * 2.2); c.strokeText('+' + gain, mx + TW / 2, ty); c.fillText('+' + gain, mx + TW / 2, ty); c.globalAlpha = 1; }
      }
      yield raw(cv);
    }
    drawBoard(c, after, info, { badges: true });          // settle on the labelled board
    const settle = raw(cv); for (let i = 0; i < 40; i++) yield settle;
  });
}

/** opening deal: layers drop onto the felt one after another */
function dealClip(tiles, info) {
  const cv = createCanvas(W, H); const c = cv.getContext('2d');
  return encodeMP4(function* () {
    const per = 6, layers = 5;
    for (let f = 0; f < per * layers + 4; f++) {
      const fall = new Map();
      for (let z = 0; z < layers; z++) fall.set(z, ease((f - z * per + 2) / per));
      drawBoard(c, tiles, info, { fall, noDim: true });
      yield raw(cv);
    }
    drawBoard(c, tiles, info, { badges: true }); const s = raw(cv); for (let i = 0; i < 45; i++) yield s;
  });
}

/** stuck -> reshuffle: tiles shake, flip to their backs, flip back as new faces */
function shuffleClip(before, after, info) {
  const cv = createCanvas(W, H); const c = cv.getContext('2d');
  return encodeMP4(function* () {
    for (let f = 0; f < 26; f++) {
      const ph = f < 8 ? 'shake' : f < 18 ? 'back' : 'new';
      const offsets = new Map(); const amp = ph === 'shake' ? 6 : ph === 'back' ? 10 : 0;
      for (const t of after) if (t.alive) offsets.set(t.id, { dx: Math.sin(f * 2.1 + t.id) * amp, dy: Math.cos(f * 1.7 + t.id * 2) * amp * .6 });
      drawBoard(c, ph === 'new' ? after : before, info, { back: ph === 'back', offsets, noDim: true });
      if (ph !== 'new' || f < 20) { c.font = `bold 44px ${UI}`; c.fillStyle = '#fff'; c.strokeStyle = '#0a3d2c'; c.lineWidth = 7; c.textAlign = 'center'; c.strokeText('NO MOVES - SHUFFLING', W / 2, H - 46); c.fillText('NO MOVES - SHUFFLING', W / 2, H - 46); }
      yield raw(cv);
    }
    drawBoard(c, after, info, { badges: true }); const s = raw(cv); for (let i = 0; i < 40; i++) yield s;
  });
}

function winClip(info, lines) {
  const cv = createCanvas(W, H); const c = cv.getContext('2d');
  const conf = []; for (let i = 0; i < 140; i++) conf.push({ x: Math.random() * W, y: -Math.random() * H, v: 140 + Math.random() * 260, w: 5 + Math.random() * 9, col: ['#ffd24a', '#ff6b9a', '#6bf', '#8f8', '#fff', '#f96'][i % 6], r: Math.random() * 6, rs: (Math.random() - .5) * 8, sw: Math.random() * 6 });
  return encodeMP4(function* () {
    for (let f = 0; f < 60; f++) {
      const t = f / FPS;
      background(c); header(c, info);
      // three jade tiles spelling the win
      const faces = ['DR', 'DG', 'DW'];
      faces.forEach((k, i) => { const k2 = back((t - i * 0.18) / 0.5); if (k2 < 0.02) return; c.save(); c.translate(W / 2 + (i - 1) * 140, 270); c.rotate((i - 1) * 0.1 * k2); c.scale(2.4 * k2, 2.4 * k2); c.drawImage(sprite(k, 'n'), -TW / 2, -TH / 2); c.restore(); });
      const k = back((t - 0.5) / 0.5);
      if (k >= 0.02) { c.save(); c.translate(W / 2, 470); c.scale(k, k); c.font = `bold 66px ${UI}`; c.fillStyle = GOLD; c.strokeStyle = '#0a3d2c'; c.lineWidth = 10; c.textAlign = 'center'; c.strokeText('BOARD CLEARED!', 0, 0); c.fillText('BOARD CLEARED!', 0, 0); c.restore(); }
      c.globalAlpha = Math.min(1, Math.max(0, (t - 1) * 2)); c.font = `600 28px ${UI}`; c.fillStyle = '#fff'; c.textAlign = 'center';
      lines.forEach((l, i) => c.fillText(l, W / 2, 545 + i * 40)); c.globalAlpha = 1;
      for (const p of conf) { const y = ((p.y + p.v * t) % (H + 80)); const x = p.x + Math.sin(t * 3 + p.sw) * 30; c.save(); c.translate(x, y); c.rotate(p.r + p.rs * t); c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); c.restore(); }
      yield raw(cv);
    }
  });
}

module.exports = { still, matchClip, dealClip, shuffleClip, winClip, W, H, HAS_CJK, sprite, drawBoard };
