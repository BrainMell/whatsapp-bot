'use strict';
// 🃏 PASSIVE CARD TRIGGER ANIMATION — when a regular (passive) card fires on its own, its tile lifts out of the hand,
// hovers over the owner (family-coloured aura + name ribbon), then plays an effect unique to THAT card, and fades.
// Same pipeline as summonCards/cardPlayScene (real battle scene as the base, raw BGRA frames -> ffmpeg -> H.264 MP4).
// Returns an mp4 Buffer or null (caller just skips the animation — the 🃏 line is already in the war log).
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const { createCanvas } = require('canvas');
const { PASSIVE_CATALOG } = require('./catalog');
const FPS = 20, N = 32, OUT_W = 768;
const FAM = { DEFENSE: '#4aa3ff', OFFENSE: '#ef5350', TACTICAL: '#4cc96b' };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)); const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - Math.pow(1 - k, 3); const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); const lerp = (a, b, k) => a + (b - a) * k;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// card id -> effect primitive (+ colour). Every card has its OWN look: primitive + palette + seed.
const FX = {
  mirror_guard: ['mirror', '#bfe6ff'], phoenix_feather: ['feather', '#ff9a3c'], frost_barrier: ['shell', '#9fe3ff'], last_stand: ['dome', '#ffd36b'],
  iron_will: ['chain', '#c9d3e6'], thorn_mantle: ['thorns', '#6fd16f'], emergency_draught: ['potion', '#7df0a0'],
  blood_debt: ['blood', '#c0152b'], static_charge: ['bolt', '#ffe45c'], predators_instinct: ['mark', '#ff6a4a'], combo_master: ['combo', '#ffb15c'],
  vampiric_charm: ['drain', '#d13a6a'], hunters_mark: ['cross', '#ff4a4a'],
  second_wind: ['swirl', '#8ff0d8'], grave_robber: ['coins', '#ffd24a'], overcharge: ['rings', '#6fc3ff'], focus_loop: ['orbit', '#b79cff'], battle_hymn: ['notes', '#ffe9a0'], lucky_charm: ['stars', '#5fe08a'], berserkers_oath: ['feather', '#ff3b2f'],
};
function startEncoder(dir, W, H) {
  const out = path.join(dir, 'out.mp4');
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0', '-vf', `scale=${OUT_W}:-2:flags=bicubic`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((res, rej) => { p.on('error', rej); p.stdin.on('error', () => {}); p.on('close', (code) => (code === 0 ? res(fs.readFileSync(out)) : rej(new Error('ffmpeg ' + code + ' ' + err.slice(0, 160))))); });
  done.catch(() => {});
  return { async write(b) { if (!p.stdin.write(b)) await new Promise((r) => p.stdin.once('drain', r)); }, end() { p.stdin.end(); return done; } };
}

/** Paint ONE effect frame. k = 0..1 progress of the effect phase, cp = caster pt, tp = target pt, s = scale. */
function paintFx(c, prim, col, k, cp, tp, s, R, seed) {
  const fade = 1 - seg(k, 0.7, 1), line = (a, b, w, al) => { c.strokeStyle = rgba(col, al); c.lineWidth = w * s; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalCompositeOperation = 'lighter';
  const glow = (p, r, al) => { const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, r); g.addColorStop(0, rgba(col, al)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); };
  const body = { x: cp.x, y: cp.y };
  switch (prim) {
    case 'mirror': { for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + k, r = (60 + 20 * Math.sin(k * 6 + i)) * s, x = body.x + Math.cos(a) * r, y = body.y + Math.sin(a) * r * 0.8; c.fillStyle = rgba(col, 0.55 * fade); c.beginPath(); for (let j = 0; j < 4; j++) { const q = a + j * 1.57; c.lineTo(x + Math.cos(q) * 20 * s, y + Math.sin(q) * 26 * s); } c.closePath(); c.fill(); }
      const kb = seg(k, 0.3, 0.9); line({ x: tp.x, y: tp.y }, { x: lerp(tp.x, body.x, 1 - kb), y: lerp(tp.y, body.y, 1 - kb) }, 6, 0.9 * fade); glow(body, 90 * s, 0.35 * fade); break; }
    case 'feather': for (let i = 0; i < 34; i++) { const u = (k * 1.2 + i / 34) % 1, x = body.x + (R() - 0.5) * 90 * s + Math.sin(u * 9 + i) * 14 * s, y = body.y + 40 * s - u * 190 * s; c.fillStyle = rgba(i % 3 ? '#ffd36b' : col, (1 - u) * fade); c.beginPath(); c.arc(x, y, (2 + R() * 4) * s, 0, 7); c.fill(); } glow({ x: body.x, y: body.y - 30 * s }, 120 * s, 0.4 * fade); break;
    case 'shell': { const r = (40 + 70 * easeOut(seg(k, 0, 0.5))) * s; c.strokeStyle = rgba('#ffffff', 0.9 * fade); c.lineWidth = 4 * s; c.beginPath(); c.ellipse(body.x, body.y, r, r * 1.15, 0, 0, 7); c.stroke(); glow(body, r, 0.35 * fade); for (let i = 0; i < 10; i++) { const a = i * 0.628 + 0.2; c.fillStyle = rgba('#e8fbff', 0.9 * fade); c.beginPath(); c.moveTo(body.x + Math.cos(a) * r, body.y + Math.sin(a) * r * 1.15); c.lineTo(body.x + Math.cos(a + 0.1) * (r + 22 * s), body.y + Math.sin(a + 0.1) * (r + 22 * s) * 1.15); c.lineTo(body.x + Math.cos(a + 0.2) * r, body.y + Math.sin(a + 0.2) * r * 1.15); c.fill(); } break; }
    case 'dome': { const r = (70 + 12 * Math.sin(k * 14)) * s; c.strokeStyle = rgba(col, 0.9 * fade); c.lineWidth = 5 * s; c.beginPath(); c.arc(body.x, body.y + 40 * s, r, Math.PI, 0); c.stroke(); glow({ x: body.x, y: body.y }, r * 1.2, 0.3 * fade); for (let i = 0; i < 3; i++) { c.strokeStyle = rgba(col, 0.4 * fade); c.beginPath(); c.arc(body.x, body.y + 40 * s, r + i * 14 * s, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); } break; }
    case 'chain': for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283 + k * 2, r = 62 * s; c.strokeStyle = rgba(col, 0.9 * fade); c.lineWidth = 4 * s; c.beginPath(); c.ellipse(body.x + Math.cos(a) * r, body.y + Math.sin(a) * r * 0.85, 10 * s, 6 * s, a, 0, 7); c.stroke(); } glow(body, 80 * s, 0.25 * fade); break;
    case 'thorns': { const kk = easeOut(seg(k, 0, 0.5)); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, r0 = 30 * s, r1 = (30 + 62 * kk) * s; c.fillStyle = rgba(col, 0.9 * fade); c.beginPath(); c.moveTo(body.x + Math.cos(a - 0.12) * r0, body.y + Math.sin(a - 0.12) * r0); c.lineTo(body.x + Math.cos(a) * r1, body.y + Math.sin(a) * r1); c.lineTo(body.x + Math.cos(a + 0.12) * r0, body.y + Math.sin(a + 0.12) * r0); c.fill(); } const kb = seg(k, 0.4, 0.9); if (kb > 0) line(body, { x: lerp(body.x, tp.x, kb), y: lerp(body.y, tp.y, kb) }, 5, 0.9 * fade); break; }
    case 'potion': for (let i = 0; i < 22; i++) { const u = (k * 1.1 + i / 22) % 1; c.strokeStyle = rgba(col, (1 - u) * fade); c.lineWidth = 2 * s; c.beginPath(); c.arc(body.x + Math.sin(i * 5.1) * 44 * s, body.y + 50 * s - u * 150 * s, (3 + (i % 4)) * s, 0, 7); c.stroke(); } c.fillStyle = rgba('#ffffff', 0.9 * fade); c.fillRect(body.x - 4 * s, body.y - 60 * s - k * 20 * s, 8 * s, 26 * s); c.fillRect(body.x - 13 * s, body.y - 51 * s - k * 20 * s, 26 * s, 8 * s); glow(body, 90 * s, 0.3 * fade); break;
    case 'blood': for (let i = 0; i < 18; i++) { const u = clamp(k * 1.25 - i * 0.02), a = (i / 18) * 6.283, x = lerp(body.x + Math.cos(a) * 120 * s, body.x, easeInOut(u)), y = lerp(body.y + Math.sin(a) * 90 * s, body.y, easeInOut(u)); c.fillStyle = rgba(col, (1 - u * 0.7) * fade); c.beginPath(); c.arc(x, y, (4 + (i % 3) * 2) * s, 0, 7); c.fill(); } glow(body, 70 * s, 0.35 * seg(k, 0.4, 0.8) * fade); break;
    case 'bolt': { const kk = seg(k, 0.1, 0.5); if (kk > 0) for (let b = 0; b < 3; b++) { c.strokeStyle = rgba(b ? col : '#ffffff', (b ? 0.8 : 1) * fade); c.lineWidth = (b ? 3 : 5) * s; c.beginPath(); let x = body.x, y = body.y; c.moveTo(x, y); for (let i = 1; i <= 8; i++) { const u = i / 8 * kk; x = lerp(body.x, tp.x, u) + (R() - 0.5) * 38 * s; y = lerp(body.y, tp.y, u) + (R() - 0.5) * 38 * s; c.lineTo(x, y); } c.stroke(); } glow(tp, 80 * s * kk, 0.5 * fade); break; }
    case 'mark': { const kk = easeOut(seg(k, 0, 0.4)), r = (70 - 30 * kk) * s; c.strokeStyle = rgba(col, 0.9 * fade); c.lineWidth = 4 * s; c.beginPath(); c.ellipse(tp.x, tp.y, r, r * 0.6, 0, 0, 7); c.stroke(); c.beginPath(); c.moveTo(tp.x - r - 12 * s, tp.y); c.lineTo(tp.x + r + 12 * s, tp.y); c.stroke(); const ks = seg(k, 0.45, 0.8); if (ks > 0) line({ x: tp.x - 55 * s + ks * 30 * s, y: tp.y - 50 * s }, { x: tp.x + 55 * s + ks * 30 * s, y: tp.y + 50 * s }, 9, (1 - ks) * 0.95 * fade + 0.05); break; }
    case 'combo': for (let i = 0; i < 4; i++) { const u = seg(k, i * 0.14, i * 0.14 + 0.3); if (u <= 0 || u >= 1) continue; const a = (i - 1.5) * 0.5; c.strokeStyle = rgba(i % 2 ? '#ffffff' : col, 1 - u); c.lineWidth = (9 - u * 6) * s; c.beginPath(); c.moveTo(tp.x - 60 * s * Math.cos(a), tp.y - 60 * s * Math.sin(a)); c.lineTo(tp.x + 60 * s * Math.cos(a), tp.y + 60 * s * Math.sin(a)); c.stroke(); glow(tp, 55 * s * (1 - u * 0.4), 0.45 * (1 - u)); } break;
    case 'drain': for (let i = 0; i < 16; i++) { const u = clamp(k * 1.3 - i * 0.025), p0 = tp, p1 = { x: (tp.x + body.x) / 2, y: Math.min(tp.y, body.y) - 60 * s - (i % 4) * 14 * s }, v = 1 - u, x = v * v * p0.x + 2 * v * u * p1.x + u * u * body.x, y = v * v * p0.y + 2 * v * u * p1.y + u * u * body.y; if (u > 0 && u < 1) { c.fillStyle = rgba(col, 0.9 * fade); c.beginPath(); c.arc(x, y, (3 + (i % 3)) * s, 0, 7); c.fill(); } } glow(body, 80 * s, 0.3 * seg(k, 0.5, 0.9) * fade); break;
    case 'cross': { const kk = easeOut(seg(k, 0, 0.35)), r = (95 - 45 * kk) * s; c.strokeStyle = rgba(col, 0.95 * fade); c.lineWidth = 4 * s; c.beginPath(); c.arc(tp.x, tp.y, r, 0, 7); c.stroke(); for (let i = 0; i < 4; i++) { const a = i * 1.5708; c.beginPath(); c.moveTo(tp.x + Math.cos(a) * (r - 14 * s), tp.y + Math.sin(a) * (r - 14 * s)); c.lineTo(tp.x + Math.cos(a) * (r + 22 * s), tp.y + Math.sin(a) * (r + 22 * s)); c.stroke(); } glow(tp, 60 * s, 0.35 * fade); break; }
    case 'swirl': for (let j = 0; j < 3; j++) { c.strokeStyle = rgba(col, (0.9 - j * 0.2) * fade); c.lineWidth = (5 - j) * s; c.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30, a = u * 9 + k * 8 + j * 2.1, r = (20 + u * 70) * s; const x = body.x + Math.cos(a) * r, y = body.y + 50 * s - u * 130 * s + Math.sin(a) * r * 0.3; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } break;
    case 'coins': for (let i = 0; i < 14; i++) { const u = clamp(k * 1.3 - i * 0.03), p1 = { x: (tp.x + body.x) / 2, y: Math.min(tp.y, body.y) - 90 * s }, v = 1 - u, x = v * v * tp.x + 2 * v * u * p1.x + u * u * body.x, y = v * v * tp.y + 2 * v * u * p1.y + u * u * body.y; if (u > 0 && u < 1) { c.fillStyle = rgba(i % 2 ? col : '#fff3b0', 0.95 * fade); c.beginPath(); c.ellipse(x, y, 7 * s, 7 * s * Math.abs(Math.cos(u * 12 + i)), 0, 0, 7); c.fill(); } } glow(body, 70 * s, 0.25 * seg(k, 0.5, 0.9) * fade); break;
    case 'rings': for (let i = 0; i < 3; i++) { const u = clamp(k * 1.4 - i * 0.16); if (u <= 0) continue; c.strokeStyle = rgba(col, (1 - u) * 0.95 * fade); c.lineWidth = (8 * (1 - u) + 2) * s; c.beginPath(); c.ellipse(body.x, body.y + 30 * s, (30 + u * 120) * s, (14 + u * 50) * s, 0, 0, 7); c.stroke(); } glow(body, 80 * s, 0.4 * Math.sin(k * 3.14) * fade); break;
    case 'orbit': for (let i = 0; i < 3; i++) { const a = k * 9 + i * 2.094, r = 66 * s; glow({ x: body.x + Math.cos(a) * r, y: body.y + Math.sin(a) * r * 0.6 }, 26 * s, 0.9 * fade); } c.strokeStyle = rgba(col, 0.5 * fade); c.lineWidth = 2 * s; c.beginPath(); c.ellipse(body.x, body.y, 66 * s, 40 * s, 0, 0, 7); c.stroke(); break;
    case 'notes': for (let i = 0; i < 10; i++) { const u = (k * 1.1 + i / 10) % 1, x = body.x + Math.sin(i * 2.3 + u * 5) * 70 * s, y = body.y + 40 * s - u * 170 * s; c.fillStyle = rgba(col, (1 - u) * fade); c.beginPath(); c.ellipse(x, y, 6 * s, 4.5 * s, -0.4, 0, 7); c.fill(); c.strokeStyle = rgba(col, (1 - u) * fade); c.lineWidth = 2 * s; c.beginPath(); c.moveTo(x + 5 * s, y); c.lineTo(x + 5 * s, y - 16 * s); c.stroke(); } glow(body, 100 * s, 0.25 * fade); break;
    default: /* stars */ for (let i = 0; i < 16; i++) { const u = (k * 1.2 + i / 16) % 1, a = i * 2.4, r = (30 + u * 80) * s, x = body.x + Math.cos(a) * r, y = body.y + Math.sin(a) * r * 0.8 - u * 30 * s, sz = (4 + (i % 3) * 3) * s * (1 - u * 0.5); c.fillStyle = rgba(i % 2 ? col : '#ffffff', (1 - u) * fade); c.beginPath(); for (let j = 0; j < 8; j++) { const q = j * 0.785, rr = j % 2 ? sz * 0.35 : sz; c.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); } c.closePath(); c.fill(); } glow(body, 90 * s, 0.25 * fade);
  }
  c.restore();
}

/** a: { events:[{cardId,...}] (first drives the clip), players, enemies, playerIndex, entries, sceneOptions, api, flat? (QA: skip Go scene) }
 *  opts.frames = collect a few canvases for QA instead of encoding. */
async function renderPassivePop(a, opts = {}) {
  const hud = require('../combat/combatHud'); const cardNode = require('../combat/combatCardNode');
  const ev = (a.events || []).find((e) => e && PASSIVE_CATALOG[e.cardId]); if (!ev) return null;
  const card = PASSIVE_CATALOG[ev.cardId], [prim, col] = FX[ev.cardId] || ['stars', FAM[card.family] || '#ffd36b'], fam = FAM[card.family] || col;
  const players = a.players || [], pIdx = Math.max(0, a.playerIndex || 0), pids = hud.passiveIdsFor(players[pIdx]);
  let slotI = pids.indexOf(ev.cardId); if (slotI < 0) slotI = 0;
  const sceneOut = {}; let base = null;
  if (!a.flat) base = await cardNode.renderNodeCard(players, a.enemies || [], { ...(a.sceneOptions || {}), hud: 'v2', combatType: 'PVE', _sceneOut: sceneOut, _skipTray: true, action: { attackerSide: 'player', attackerIndex: pIdx } }, a.api).catch(() => null);
  if (!base || !sceneOut.canvas) {
    const flat = createCanvas(1024, 687), fc0 = flat.getContext('2d'); const g = fc0.createLinearGradient(0, 0, 0, 687); g.addColorStop(0, '#1a1f2e'); g.addColorStop(1, '#151a26'); fc0.fillStyle = g; fc0.fillRect(0, 0, 1024, 687);
    sceneOut.canvas = flat; sceneOut.s = 1; sceneOut.anchors = [{ side: 'player', index: pIdx, x: 300, feetY: 560, w: 120, h: 160 }, { side: 'enemy', index: 0, x: 680, feetY: 560, w: 120, h: 160 }];
  }
  const A = sceneOut.canvas, W = A.width, H = A.height, s = sceneOut.s || 1, anchors = sceneOut.anchors || [];
  const find = (side, i) => anchors.find((x) => x.side === side && x.index === i) || anchors.find((x) => x.side === side);
  const ca = find('player', pIdx) || { x: 300, feetY: 560, h: 160 }, ta = find('enemy', Number(ev.targetIndex) || 0) || { x: 680, feetY: 560, h: 160 };
  const cp = { x: ca.x * s, y: (ca.feetY - (ca.h || 160) * 0.5) * s }, tp = { x: ta.x * s, y: (ta.feetY - (ta.h || 160) * 0.5) * s };
  const B = createCanvas(W, H), bc = B.getContext('2d'); bc.drawImage(A, 0, 0);
  try { const sc = require('../summonCards'); const entries = a.entries || []; await hud.drawDeckTray(bc, entries, s, 330, hud.DH - 96, hud.DW - 18, pids, [ev.cardId]); } catch (e) { /* tray optional */ }
  const tw = 40 * s, th = 54 * s, start = { x: (330 + slotI * 47) * s + tw / 2, y: (hud.DH - 96 + 15) * s + th / 2 };
  const hover = { x: cp.x, y: Math.max(th * 1.2, cp.y - 120 * s) }; const ctrl = { x: (start.x + hover.x) / 2, y: Math.min(start.y, hover.y) - 90 * s };
  const bez = (p0, p1, p2, k) => { const u = 1 - k; return { x: u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x, y: u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y }; };
  const tile = createCanvas(Math.ceil(tw * 2.6), Math.ceil(th * 2.6)), tc = tile.getContext('2d'); // enlarged tile (re-using the hand painter)
  try { const big = 2.6; await hud.drawPassiveGroup(tc, [ev.cardId], s * big, -(0) , 0, false, [ev.cardId]); } catch (e) { /* tile optional */ }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfx-')); const fcv = createCanvas(W, H), c = fcv.getContext('2d');
  const enc = opts.frames ? null : startEncoder(dir, W, H); const R = rng(ev.cardId.length * 131 + 7);
  try {
    let last = null;
    for (let f = 0; f < N; f++) {
      const t = f / (N - 1), kLift = seg(t, 0.04, 0.30), kFx = seg(t, 0.28, 0.86), kOut = seg(t, 0.80, 1);
      c.clearRect(0, 0, W, H); c.drawImage(B, 0, 0);
      const dim = 0.22 * Math.min(seg(t, 0.05, 0.25), 1 - seg(t, 0.8, 1)); if (dim > 0) { c.fillStyle = `rgba(6,4,2,${dim})`; c.fillRect(0, 0, W, H); }
      const pos = kLift < 1 ? bez(start, ctrl, hover, easeInOut(kLift)) : { x: hover.x, y: hover.y + Math.sin(t * 18) * 3 * s };
      const sc = lerp(1, 2.0, easeOut(kLift)) * (1 - 0.2 * easeOut(kOut)), al = 1 - easeOut(kOut);
      if (t > 0.04) {
        const aura = seg(t, 0.2, 0.34) * al; if (aura > 0) { const g = c.createRadialGradient(pos.x, pos.y, 10 * s, pos.x, pos.y, 100 * s); g.addColorStop(0, rgba(fam, 0.55 * aura)); g.addColorStop(1, rgba(fam, 0)); c.fillStyle = g; c.beginPath(); c.arc(pos.x, pos.y, 100 * s, 0, 7); c.fill(); }
        c.save(); c.globalAlpha = al; c.translate(pos.x, pos.y); c.scale(sc / 2.6, sc / 2.6); c.drawImage(tile, -tile.width / 2 / 1, -tile.height / 2 / 1 + 0, tile.width, tile.height); c.restore();
      }
      if (kFx > 0) paintFx(c, prim, col, kFx, cp, tp, s, rng(f * 7 + 3), 0);
      const kB = Math.min(seg(t, 0.18, 0.30), 1 - seg(t, 0.78, 0.9));
      if (kB > 0) { const label = card.name.toUpperCase(), bw = 250 * s, bh = 34 * s, bx = W / 2 - bw / 2, by = 24 * s - (1 - easeOut(kB)) * 60 * s; c.save(); c.globalAlpha = clamp(kB * 1.4); c.fillStyle = 'rgba(14,10,6,0.88)'; c.strokeStyle = fam; c.lineWidth = 2.2 * s; c.beginPath(); c.roundRect ? c.roundRect(bx, by, bw, bh, 8 * s) : c.rect(bx, by, bw, bh); c.fill(); c.stroke(); c.fillStyle = '#f3e6c4'; c.font = `bold ${17 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, W / 2, by + bh / 2 + 1); c.restore(); }
      if (opts.frames) { const cc = createCanvas(W, H); cc.getContext('2d').drawImage(fcv, 0, 0); opts.frames.push(cc); continue; }
      last = fcv.toBuffer('raw'); await enc.write(last);
    }
    if (opts.frames) return null;
    for (let h = 0; h < 4; h++) await enc.write(last);
    return await enc.end();
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
}
module.exports = { renderPassivePop, paintFx, FX };
