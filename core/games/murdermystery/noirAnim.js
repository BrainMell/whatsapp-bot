'use strict';
// ============================================
// NOIR ANIM — animated clips for the rebuilt Murder Mystery
// ("Blackvale: Dead of Night"). Every moment that used to be a
// flat image card is a short h.264 clip (15fps, 640x480 — the one
// size WhatsApp plays inline without a fight):
//   intro cast roll · the crime · phase instruction cards ·
//   the case board · dawn (murder / saved / quiet) · the verdict.
//
// Every clip returns { mp4, thumb, still } or null. Callers fall back
// to the still, then to plain text — a failed encode NEVER blocks a
// phase (design rule 5: state commits before media, media never blocks).
// ============================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const cards = require('./cards');
const characters = require('./characters');

const { AsyncLocalStorage } = require('async_hooks');
const W = 640, H = 480, FPS = 15;
// 2026-10-25 owner: "videos look blurry and low quality" — draw at 1.5x (960x720), encode slower/cleaner.
const Q = 1.5;
const als = new AsyncLocalStorage();
const C = cards.C;
const NOCLIP = process.env.MM_NOIR_NOCLIP === '1';

// char id -> sprite file stem (wave-2c ids reuse base-roster sprite files)
function spriteStem(charId) {
  const ch = characters.CHARACTERS.find((x) => x.id === charId);
  return String((ch && ch.sprite) || (String(charId || '') + '.png')).replace(/\.png$/i, '');
}

// ---------- math ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 2);
const easeBack = (t) => { t = clamp01(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- encode ----------
// frames arrive from an async generator — drawn one at a time, streamed
// straight into ffmpeg, never a full clip held in memory.
function encodeMP4(frameGen) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `noir_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`);
    const args = ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-video_size', `${Math.round(W * Q)}x${Math.round(H * Q)}`, '-framerate', String(FPS), '-i', 'pipe:0',
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
      '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', '-an', out];
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
    p.on('error', reject);
    p.on('exit', (code) => {
      try {
        if (code !== 0) return reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-300)));
        const b = fs.readFileSync(out);
        fs.unlinkSync(out);
        resolve(b);
      } catch (e) { reject(e); }
    });
    (async () => {
      for await (const f of frameGen) {
        if (!p.stdin.write(f)) await new Promise((r) => p.stdin.once('drain', r));
      }
      p.stdin.end();
    })().catch((e) => { try { p.kill('SIGKILL'); } catch (e2) {} reject(e); });
  });
}

// renderClip — drawFrame(ctx, t, f, total) paints one complete frame.
async function renderClip(seconds, drawFrame, thumbAt = 0.62) {
  const store = als.getStore();
  const stillOnly = !!(store && store.still);
  if (NOCLIP && !stillOnly) return null;
  try {
    cards.registerFonts();
    const { createCanvas } = cards.cv();
    const total = Math.max(3, Math.round(seconds * FPS));
    const PW = Math.round(W * Q), PH = Math.round(H * Q);
    const canvas = createCanvas(PW, PH);
    const ctx = canvas.getContext('2d');
    const paint = async (t, f) => { ctx.setTransform(Q, 0, 0, Q, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; await drawFrame(ctx, t, f, total); };
    if (stillOnly) {
      await paint(1, total - 1);
      return { mp4: null, thumb: canvas.toBuffer('image/jpeg', { quality: 0.86 }), still: canvas.toBuffer('image/png') };
    }
    const frameGen = (async function * () {
      for (let f = 0; f < total; f++) {
        await paint(f / (total - 1), f);
        const { data } = ctx.getImageData(0, 0, PW, PH);
        yield Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      }
    })();
    const mp4 = await encodeMP4(frameGen);
    await paint(thumbAt, Math.round(thumbAt * (total - 1)));
    const thumb = canvas.toBuffer('image/jpeg', { quality: 0.86 });
    await paint(1, total - 1);
    const still = canvas.toBuffer('image/png');
    return { mp4, thumb, still };
  } catch (e) {
    console.error('[NoirAnim] clip render failed, caller will fall back to still/text:', e.message);
    return null;
  }
}

/** render any clip function as a single high-res still (no encode): stillOf(phaseClip, args) → {still, thumb} */
function stillOf(fn, args) { return als.run({ still: true }, () => fn(args)); }

// ---------- shared painters ----------
// Room background with a slow Ken-Burns push + noir atmosphere.
async function roomBase(ctx, bgId, zoom = 1.06, dark = 0.66, seed = 7) {
  const bg = await cards.loadBg(bgId);
  const r = rng(seed);
  const jx = (r() - 0.5) * 10, jy = (r() - 0.5) * 8;
  const dw = W * zoom, dh = H * zoom;
  ctx.drawImage(bg, (W - dw) / 2 + jx * (1 - zoom * 0.5), (H - dh) / 2 + jy, dw, dh, 0, 0, W, H);
  cards.atmosphere(ctx, W, H, { dark, frameColor: 'rgba(236,226,200,0.30)' });
}

function kicker(ctx, text, y, color = C.amber, size = 20) {
  ctx.save();
  ctx.font = `${size}px "Type"`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  cards.spaced(ctx, text.toUpperCase(), W / 2, y, 4);
  ctx.restore();
}

function plate(ctx, x, y, w, h, alpha = 0.72) {
  ctx.save();
  ctx.fillStyle = `rgba(10,8,14,${alpha})`;
  ctx.strokeStyle = 'rgba(236,226,200,0.35)';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

function bigTitle(ctx, text, y, size = 54, color = C.ivory, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px "PF-Black"`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

// countdown ring, top-right (the "1.7m" badge on the phase cards)
function ringTimer(ctx, label, frac, alpha = 1) {
  const cx = W - 62, cy = 62, r = 26;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(1 - frac));
  ctx.strokeStyle = 'rgba(201,161,59,0.25)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(frac));
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.font = '15px "EB-Semi"';
  ctx.fillStyle = C.ivory;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function stepRow(ctx, n, text, y, alpha = 1, width = 520) {
  const x = (W - width) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  plate(ctx, x, y, width, 40, 0.66);
  ctx.font = '17px "EB-Semi"';
  ctx.fillStyle = C.amber;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + 16, y + 20);
  ctx.font = '16px "EB-Reg"';
  ctx.fillStyle = C.ivory;
  const t = String(text);
  ctx.fillText(t.length > 46 ? t.slice(0, 45) + '…' : t, x + 40, y + 20);
  ctx.restore();
}

function typedLine(ctx, text, y, alpha = 1, color = C.ivory, size = 15, maxWidth = 540) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px "Type"`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * 20) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * 20));
  ctx.restore();
}

// ============================================
// 1. INTRO — manor title card, then the cast roll
// ============================================
async function introClip({ cast, subtitle }) {
  const castImgs = [];
  for (const c of cast.slice(0, 8)) castImgs.push({ img: await cards.loadSprite(spriteStem(c.charId)), name: c.name, title: c.title });
  const manor = await cards.loadBg('manor');
  const hall = await cards.loadBg('greatroom');
  return renderClip(7, (ctx, t, f) => {
    const intro = t < 0.32;
    if (intro) {
      const zi = 1.05 + t * 0.05;
      const dw = W * zi, dh = H * zi;
      ctx.drawImage(manor, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
      cards.atmosphere(ctx, W, H, { dark: 0.58 });
      const a = easeOut(t / 0.32);
      bigTitle(ctx, 'BLACKVALE MANOR', 196, 52, C.ivory, a);
      cards.ornament(ctx, W / 2, 238, 180, C.amber);
      typedLine(ctx, subtitle || 'A dinner. A death. A liar among the guests.', 262, a, C.ivoryDim || '#b3a98e', 16);
    } else {
      const tb = (t - 0.32) / 0.68;
      const zd = 1.05 + tb * 0.05;
      const dw = W * zd, dh = H * zd;
      ctx.drawImage(hall, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
      cards.atmosphere(ctx, W, H, { dark: 0.7 });
      kicker(ctx, 'The guests', 52);
      const n = castImgs.length;
      const slotW = Math.min(76, (W - 80) / n);
      const totalW = slotW * n;
      const x0 = (W - totalW) / 2 + slotW / 2;
      for (let i = 0; i < n; i++) {
        const delay = 0.10 + i * 0.055;
        const a = clamp01((tb - delay) / 0.22);
        if (a <= 0) continue;
        const rise = (1 - easeBack(a)) * 26;
        const cx = x0 + i * slotW;
        const img = castImgs[i].img;
        const scale = Math.min(64 / img.height, slotW * 0.86 / img.width);
        const w = img.width * scale, h = img.height * scale;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(img, cx - w / 2, 210 - h + rise, w, h);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = clamp01((a - 0.4) / 0.6);
        ctx.font = '11px "EB-Semi"';
        ctx.fillStyle = C.ivory;
        ctx.textAlign = 'center';
        ctx.fillText(castImgs[i].name.split(' ').pop(), cx, 224);
        ctx.font = '9px "EB-Reg"';
        ctx.fillStyle = 'rgba(236,226,200,0.6)';
        ctx.fillText(String(castImgs[i].title || '').replace(/^the /i, ''), cx, 238);
        ctx.restore();
      }
      bigTitle(ctx, 'ONE OF THEM LIES', 318, 40, C.crimsonHi, clamp01((tb - 0.5) / 0.3));
      typedLine(ctx, 'Every guest will be contacted privately. Watch your DMs.', 356, clamp01((tb - 0.6) / 0.3), 'rgba(236,226,200,0.75)', 14);
    }
  });
}

// ============================================
// 2. CRIME — "11:00 PM · THE LIBRARY — <VICTIM> IS DEAD"
// ============================================
async function crimeClip({ roomId, roomName, victimName, method, clueImg, clueLine }) {
  const bg = await cards.loadBg(roomId);
  let clue = null;
  try { if (clueImg) clue = await cards.loadClue(clueImg); } catch (e) { clue = null; }
  const r = rng(11);
  const splats = [];
  for (let i = 0; i < 7; i++) splats.push({ x: 90 + r() * 460, y: 300 + r() * 130, s: 3 + r() * 9 });
  return renderClip(7, (ctx, t) => {
    const z = 1.02 + easeIn(t) * 0.09;
    const dw = W * z, dh = H * z;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(120,10,24,' + (0.05 + 0.05 * Math.sin(t * Math.PI * 6)) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.16 * (1 - t * 0.3);
    ctx.fillStyle = C.crimsonDeep;
    for (const s of splats) { ctx.beginPath(); ctx.arc(s.x, s.y, s.s * (0.6 + t * 0.8), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    cards.atmosphere(ctx, W, H, { dark: 0.6 });
    kicker(ctx, '11:00 PM · ' + String(roomName || 'Blackvale Manor').toUpperCase(), 54);
    const name1 = String(victimName || 'The Master').toUpperCase();
    const a1 = easeOut(t / 0.22);
    bigTitle(ctx, name1, 150, Math.min(54, Math.floor(500 / Math.max(6, name1.length) * 2.4)), C.ivory, a1);
    bigTitle(ctx, 'IS DEAD', 210, 58, C.crimsonHi, easeOut((t - 0.08) / 0.22));
    const pa = clamp01((t - 0.3) / 0.25);
    if (pa > 0) {
      plate(ctx, 90, 268, 460, 120, 0.74 * pa);
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.font = '15px "EB-Semi"';
      ctx.fillStyle = C.amber;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAUSE OF DEATH', 110, 290);
      ctx.font = '17px "EB-Reg"';
      ctx.fillStyle = C.ivory;
      ctx.fillText(String(method || 'violence'), 110, 314);
      if (clue) {
        const cs = 74;
        ctx.drawImage(clue, 440, 276, cs, cs);
        ctx.strokeStyle = 'rgba(236,226,200,0.4)';
        ctx.strokeRect(440.5, 276.5, cs, cs);
      }
      if (clueLine) typedLine(ctx, 'Found at the scene: ' + clueLine, 362, clamp01((t - 0.5) / 0.3), 'rgba(236,226,200,0.85)', 13, 430);
      ctx.restore();
    }
  });
}

// ============================================
// 3. PHASE — instruction card: what this phase is, what to do
// ============================================
async function phaseClip({ bgId, kicker: kick, title, steps, secondsLeft, footer }) {
  const bg = await cards.loadBg(bgId || 'hallway_a');
  const label = secondsLeft != null ? (secondsLeft >= 60 ? Math.round(secondsLeft / 60) + 'm' : Math.round(secondsLeft) + 's') : null;
  return renderClip(5, (ctx, t, f) => {
    const z = 1.08 - easeOut(t) * 0.03;
    const dw = W * z, dh = H * z;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
    cards.atmosphere(ctx, W, H, { dark: 0.72 });
    if (label) ringTimer(ctx, label, 1 - (f / (FPS * 5)), 0.9);
    kicker(ctx, kick || 'Blackvale Manor', 56);
    const aT = easeBack(t / 0.3);
    bigTitle(ctx, String(title || 'SEARCH').toUpperCase(), 128, 46, C.ivory, clamp01(aT));
    cards.ornament(ctx, W / 2, 168, 140, C.amber);
    const n = Math.min(4, (steps || []).length);
    for (let i = 0; i < n; i++) {
      const a = clamp01((t - 0.28 - i * 0.12) / 0.2);
      if (a <= 0) continue;
      stepRow(ctx, i + 1, steps[i], 196 + i * 52, a);
    }
    if (footer) typedLine(ctx, footer, 420, clamp01((t - 0.7) / 0.25), 'rgba(201,161,59,0.9)', 14);
  });
}

// ============================================
// 4. CASE BOARD — suspects polaroids + public notes + hint
// ============================================
async function boardClip({ round, rounds, players, notes, hint }) {
  const bg = await cards.loadBg('gallery');
  const imgs = [];
  for (const p of players.slice(0, 8)) {
    let img = null;
    try { img = await cards.loadSprite(spriteStem(p.charId)); } catch (e) { img = null; }
    imgs.push({ img, name: p.short || p.name, alive: p.alive !== false });
  }
  return renderClip(6, (ctx, t, f) => {
    ctx.drawImage(bg, 0, 0, W, H);
    cards.atmosphere(ctx, W, H, { dark: 0.74, frameColor: 'rgba(201,161,59,0.4)' });
    kicker(ctx, 'The case board · Round ' + (round || 1) + ' of ' + (rounds || 3), 50);
    const n = imgs.length;
    const cols = n <= 4 ? n : Math.ceil(n / 2);
    const rows = n <= 4 ? 1 : 2;
    const cw = 116, ch = 128;
    const gx = (W - cols * (cw + 10) + 10) / 2;
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const a = clamp01((t - 0.15 - i * 0.06) / 0.2);
      if (a <= 0) continue;
      const x = gx + col * (cw + 10), y = 84 + row * (ch + 12) - (1 - easeBack(a)) * 14;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(236,226,200,0.92)';
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = 'rgba(20,16,12,0.9)';
      ctx.fillRect(x + 5, y + 5, cw - 10, ch - 34);
      const im = imgs[i].img;
      if (im) {
        const sh = im.height * 0.30, sw = sh;
        const sx = (im.width - sw) / 2;
        const scale = Math.min((cw - 14) / sw, (ch - 44) / sh);
        const dw2 = sw * scale, dh2 = sh * scale;
        ctx.drawImage(im, sx, 0, sw, sh, x + (cw - dw2) / 2, y + 5 + (ch - 44 - dh2) / 2, dw2, dh2);
        if (!imgs[i].alive) {
          ctx.filter = 'none';
          ctx.fillStyle = 'rgba(13,11,16,0.55)';
          ctx.fillRect(x + 5, y + 5, cw - 10, ch - 44);
        }
      }
      ctx.font = '11px "EB-Semi"';
      ctx.fillStyle = '#1a1512';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(imgs[i].name, x + cw / 2, y + ch - 14);
      if (!imgs[i].alive) {
        ctx.strokeStyle = C.crimsonHi;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 12); ctx.lineTo(x + cw - 18, y + ch - 48);
        ctx.moveTo(x + cw - 18, y + 12); ctx.lineTo(x + 18, y + ch - 48);
        ctx.stroke();
      }
      ctx.restore();
    }
    const na = clamp01((t - 0.5) / 0.3);
    if (na > 0 && (notes || []).length) {
      const ny = Math.min(356, 84 + rows * (ch + 12) + 4);
      plate(ctx, 60, ny, 520, 62, 0.7 * na);
      ctx.save();
      ctx.globalAlpha = na;
      ctx.font = '12px "Type"';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const shown = (notes || []).slice(0, 2);
      shown.forEach((note, i) => {
        const y = ny + 16 + i * 22;
        ctx.fillStyle = note.kind === 'claim' ? C.amber : C.crimsonHi;
        ctx.beginPath(); ctx.arc(74, y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.ivory;
        const txt = String(note.text || '');
        ctx.fillText(txt.length > 68 ? txt.slice(0, 67) + '…' : txt, 86, y);
      });
      ctx.restore();
    }
    if (hint) typedLine(ctx, hint, 446, clamp01((t - 0.7) / 0.25), 'rgba(236,226,200,0.8)', 13, 540);
  });
}

// ============================================
// 5. DAWN — murder / saved / quiet
// ============================================
async function dawnClip({ outcome, victim, line }) {
  const bg = await cards.loadBg('hallway_b');
  let haveSprite = false;
  if (victim && victim.charId) { try { await cards.loadSprite(spriteStem(victim.charId)); haveSprite = true; } catch (e) { haveSprite = false; } }
  const o = String(outcome || 'quiet');
  return renderClip(5, async (ctx, t) => {
    const z = 1.06 - easeOut(t) * 0.04;
    const dw = W * z, dh = H * z;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
    cards.atmosphere(ctx, W, H, { dark: o === 'saved' ? 0.62 : 0.74 });
    if (haveSprite) {
      const rise = o === 'murder' ? (1 - easeOut(t / 0.4)) * 30 : 0;
      const sprite = await cards.loadSprite(spriteStem(victim.charId));
      const fit = Math.min(230 / sprite.height, 210 / sprite.width);
      const w = sprite.width * fit, h = sprite.height * fit;
      if (o === 'murder') {
        // grayscale + cool tint via the shared pixel helper (ctx.filter is not
        // reliable on node-canvas) — draws with its own shadow at cx/bottomY.
        await cards.drawSpriteGray(ctx, spriteStem(victim.charId), W / 2, 340 + rise, h, { maxW: w });
      } else {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 24;
        ctx.drawImage(sprite, W / 2 - w / 2, 336 - h + rise, w, h);
        ctx.restore();
      }
    }
    if (o === 'murder') {
      bigTitle(ctx, 'MURDERED', 120, 48, C.crimsonHi, easeOut(t / 0.25));
      if (victim && victim.name) bigTitle(ctx, String(victim.name).toUpperCase(), 306, 30, C.ivory, clamp01((t - 0.2) / 0.25));
    } else if (o === 'saved') {
      bigTitle(ctx, 'SAVED', 120, 48, C.ghostHi, easeOut(t / 0.25));
      typedLine(ctx, 'Someone stood watch. The blade found a locked door.', 306, clamp01((t - 0.25) / 0.25), C.ghost, 15);
    } else {
      bigTitle(ctx, 'THE HOUSE SLEPT', 120, 42, C.ivory, easeOut(t / 0.25));
    }
    if (line) typedLine(ctx, line, 380, clamp01((t - 0.4) / 0.3), 'rgba(236,226,200,0.85)', 14);
  });
}

// ============================================
// 6. VERDICT — the house points at…
// ============================================
async function verdictClip({ accused, killer, townWins, reason }) {
  const bg = await cards.loadBg('entrance');
  let sprite = null;
  if (accused && accused.charId) { try { sprite = await cards.loadSprite(spriteStem(accused.charId)); } catch (e) { sprite = null; } }
  const wrong = !townWins;
  return renderClip(7, (ctx, t) => {
    const z = 1.08 - easeOut(t) * 0.05;
    const dw = W * z, dh = H * z;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh, 0, 0, W, H);
    cards.atmosphere(ctx, W, H, { dark: 0.76 });
    kicker(ctx, wrong ? 'The house points at…' : 'The murderer was', 54);
    if (sprite) {
      const fit = Math.min(215 / sprite.height, 190 / sprite.width);
      const w = sprite.width * fit, h = sprite.height * fit;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 26;
      ctx.drawImage(sprite, W / 2 - w / 2, 292 - h, w, h);
      ctx.restore();
    }
    const aN = clamp01((t - 0.25) / 0.25);
    bigTitle(ctx, String((accused && accused.name) || 'NO ONE').toUpperCase(), 322, 42, C.crimsonHi, aN);
    if (wrong) {
      const sa = clamp01((t - 0.45) / 0.2);
      ctx.save();
      ctx.globalAlpha = sa * 0.85;
      ctx.translate(W / 2, 196);
      ctx.rotate(-0.16);
      ctx.font = '58px "PF-Black"';
      ctx.strokeStyle = C.ivory;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(236,226,200,0.14)';
      const tw = ctx.measureText('INNOCENT').width;
      ctx.fillText('INNOCENT', -tw / 2, 0);
      ctx.strokeText('INNOCENT', -tw / 2, 0);
      ctx.restore();
      if (killer && killer.name && killer.name !== (accused && accused.name)) {
        typedLine(ctx, 'The true murderer walks: ' + killer.name + '.', 366, clamp01((t - 0.6) / 0.25), 'rgba(236,226,200,0.9)', 15);
      } else {
        typedLine(ctx, 'No verdict. The murderer walks free.', 366, clamp01((t - 0.6) / 0.25), 'rgba(236,226,200,0.9)', 15);
      }
    } else {
      typedLine(ctx, 'The house is quiet again.', 366, clamp01((t - 0.6) / 0.25), 'rgba(201,161,59,0.95)', 15);
    }
    if (reason) typedLine(ctx, reason, 402, clamp01((t - 0.7) / 0.25), 'rgba(236,226,200,0.7)', 13);
  });
}

module.exports = { W, H, FPS, Q, stillOf, renderClip, introClip, crimeClip, phaseClip, boardClip, dawnClip, verdictClip };
