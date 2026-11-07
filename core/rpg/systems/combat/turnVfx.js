'use strict';
// ⚔️ TURN-CARD ANIMATOR (round 10, owner: "the cards aren't animated ... translate the solo
// feel to pvp"): duel boards stop being a slideshow — an actionable turn plays a short
// Node-composed clip (dash → swing → impact → knock-back → settle, or the dodge → whiff for
// misses) that ENDS on the exact static board the chat already knows, so captions and game
// logic don't change. Composed from the same Go layers the still uses (bg + per-duelist
// cutouts + anchors); chrome (hubs, trays, badges) is painted once onto a transparent plate
// and blitted over every frame. Encoded with the death-clip recipe (raw BGRA → x264
// ultrafast, 768x516 @ 15fps). Any failure returns null and the caller sends the still.
// Kill switch: PVP_TURN_ANIM=0.
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const fx = require('./hitFx');
const { ELEMENT_COLORS } = require('../summonCards/catalog');

const OUT_W = 768, OUT_H = 516, FPS = 15, HOLD = 4, N = 21;

function easeIn(t) { return t * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function encodeRaw(frames, w, h, fps) {
  return new Promise((resolve) => {
    const outPath = path.join(os.tmpdir(), `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
    const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${w}x${h}`, '-framerate', String(fps), '-i', 'pipe:0',
      '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'baseline', '-crf', '24', '-threads', '2', '-movflags', '+faststart', '-an', outPath];
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '', done = false;
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 15000);
    p.stderr.on('data', (d) => { if (err.length < 3000) err += d; });
    p.stdin.on('error', () => {});
    p.on('error', () => { if (!done) { done = true; clearTimeout(to); resolve(null); } });
    p.on('close', (code) => {
      if (done) return; done = true; clearTimeout(to);
      if (code === 0) { try { resolve(fs.readFileSync(outPath)); } finally { try { fs.unlinkSync(outPath); } catch (e) {} } }
      else { console.warn('[TurnVfx] encode stderr:', err.slice(0, 200)); resolve(null); }
    });
    (async () => { for (const b of frames) { if (done) return; await new Promise((r) => p.stdin.write(b, r)); } try { p.stdin.end(); } catch (e) {} })();
  });
}

async function animatePvpTurn({ cv, layers, act, players, s, W, H, chrome }) {
  const t0 = Date.now();
  try {
    if (!cv || !layers || !layers.bg || !chrome || !act || !act.targetSide) return null;
    const missed = !!act.missed, dmg = Math.floor(Number(act.damage) || 0), crit = !!act.isCrit;
    if (!missed && dmg <= 0) return null;                     // heal/zero-value turns stay still (v1)
    const aIdx = Math.max(0, Number(act.attackerIndex) || 0), tIdx = Math.max(0, Number(act.targetIndex) || 0);
    const cutA = (layers.cuts || []).find((x) => x.side === 'player' && x.index === aIdx);
    const cutT = (layers.cuts || []).find((x) => x.side === 'player' && x.index === tIdx);
    const anA = (layers.anchors || []).find((x) => x.side === 'player' && x.index === aIdx);
    const anT = (layers.anchors || []).find((x) => x.side === 'player' && x.index === tIdx);
    if (!cutA || !cutT || !anA || !anT || !cutA.png || !cutT.png) return null;
    const imgA = await loadImage(Buffer.from(cutA.png, 'base64'));
    const imgT = await loadImage(Buffer.from(cutT.png, 'base64'));
    const bg = await loadImage(layers.bg);
    const dir = Math.sign(anT.x - anA.x) || 1;
    const el = ELEMENT_COLORS[String(act.element || '').toUpperCase()] || null;
    const col = el || '#ffffff', pale = el || '#cfd8e8';
    const others = [];
    for (const c0 of (layers.cuts || [])) {
      if (c0.side !== 'player' || c0.index === aIdx || c0.index === tIdx || !c0.png) continue;
      try { others.push({ c: c0, img: await loadImage(Buffer.from(c0.png, 'base64')) }); } catch (e) {}
    }
    const tinted = (img, cut, rgba) => {
      const t = createCanvas(Math.max(1, cut.w), Math.max(1, cut.h)); const tc = t.getContext('2d');
      tc.drawImage(img, 0, 0, cut.w, cut.h); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = rgba; tc.fillRect(0, 0, cut.w, cut.h); return t;
    };
    const tRed = tinted(imgT, cutT, 'rgba(255,40,30,0.42)'), tWhite = tinted(imgT, cutT, 'rgba(255,235,225,0.55)');
    const drawCut = (g, img, cut, dx, dy, rot, alpha) => {
      if (!img) return;
      g.save(); if (alpha !== undefined) g.globalAlpha = alpha;
      g.translate(cut.x * s + cut.w * s / 2 + dx, (cut.y + cut.h) * s + dy);
      g.rotate(rot || 0); g.drawImage(img, -cut.w * s / 2, -cut.h * s, cut.w * s, cut.h * s); g.restore();
    };
    const dist = Math.abs(anT.x - anA.x);
    const lunge = clamp((dist - 120 * s) * 0.55, 60 * s, 200 * s);
    const bodyH = (anT.h || 150) * s;
    const hitY = anT.feetY * s - bodyH * 0.52;                 // target body centre
    const headY = anT.feetY * s - bodyH - 46 * s;              // floating-number height
    const oldX = anT.x * s;                                    // where the body WAS (vacated spot)
    const numBase = (crit ? 40 : 30) * s;
    const frames = [];
    const paintNum = (g, x, y, size, alpha) => {
      const label = missed ? 'MISS' : String(dmg);
      g.save(); g.translate(x, y); g.rotate(crit && !missed ? -0.05 : 0);
      g.font = `bold ${size}px HudCinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.globalAlpha = alpha; g.lineWidth = 6 * s; g.strokeStyle = '#1b0f05'; g.strokeText(label, 0, 0);
      g.fillStyle = missed ? '#e8e2d2' : (crit ? '#ffd24a' : '#ff8a70'); g.fillText(label, 0, 0);
      if (crit && !missed) { g.font = `bold ${13 * s}px HudCinzel, serif`; g.lineWidth = 4 * s; g.strokeText('CRITICAL', 0, -size * 0.72); g.fillStyle = '#fff2b0'; g.fillText('CRITICAL', 0, -size * 0.72); }
      g.restore();
    };
    const stab = (g, alpha) => {                                // ease into the held static hit pose
      g.save(); g.globalAlpha = alpha;
      fx.slashPattern(0, g, oldX, hitY, bodyH, dir, el, crit, s);
      fx.impactBurst(0, g, oldX, hitY, dir, el, crit, s);
      g.restore();
    };
    const whiffStatic = (g, alpha) => {                         // the held static whiff pose
      const ang = dir * 0.5 + (dir > 0 ? 0.0 : Math.PI);
      for (let i = 0; i < 2; i++) {
        g.save(); g.translate(oldX + (i - 0.5) * 14 * s * dir, hitY - 8 * s * (i ? -1 : 1)); g.rotate(ang + (i - 0.5) * 0.2);
        g.globalAlpha = alpha; fx.slash(g, Math.max(bodyH * 1.05, 100 * s), 7 * s, '#ffffff', fx.a2(pale, 0.7)); g.restore();
      }
    };
    for (let f = 0; f < N; f++) {
      const fc = createCanvas(W, H), g = fc.getContext('2d');
      g.drawImage(bg, 0, 0, W, H);
      for (const o of others) drawCut(g, o.img, o.c, 0, 0, 0, 1);
      const last = f >= N - HOLD;
      if (last) {
        g.drawImage(cv, 0, 0, W, H);                            // settle EXACTLY on the known static board
      } else if (!missed) {
        // ── HIT: dash → sweep → impact → knock-back → settle ──
        let adx = 0, lean = 0, tdx = 0, tilt = 0, red = 0, white = 0;
        if (f <= 3) { const p = (f + 1) / 4; adx = dir * lunge * easeIn(p); lean = dir * 0.055 * p; }
        else if (f === 4) { adx = dir * lunge; lean = dir * 0.055; }
        else if (f <= 10) {
          const k = clamp((f - 5) / 5, 0, 1);
          adx = f <= 6 ? dir * lunge : dir * lunge * (1 - 0.9 * easeOut(clamp((f - 6) / 4, 0, 1)));
          tdx = dir * (8 + 20 * (1 - easeOut(k))); tilt = dir * (0.03 + 0.05 * (1 - k));
          red = 0.08 + 0.34 * (1 - k); white = f === 6 ? 0.5 : (f === 5 ? 0.22 : 0);
        } else { const q = clamp((f - 10) / 6, 0, 1); adx = dir * lunge * (1 - easeInOut(q)); }
        if (f <= 6 && adx !== 0) for (let i = 0; i < 3; i++) fx.streak(g, anA.x * s - dir * (30 + i * 26) * s + adx, (anA.feetY - 44 - i * 26) * s, (60 + i * 14) * s, 4 * s, pale, 0.42 - i * 0.1);
        drawCut(g, imgA, cutA, adx, 0, lean, 1);
        if (white > 0) drawCut(g, tWhite, cutT, 0, 0, 0, white);
        drawCut(g, imgT, cutT, tdx, -2 * s, tilt, 1);
        if (red > 0) drawCut(g, tRed, cutT, tdx + dir * 15 * s, -2 * s, tilt + dir * 0.075, Math.min(1, red + 0.25));
        if (f === 5 || f === 6) {                               // the swing sweeping across the body
          const ang = dir * 0.62 + (dir > 0 ? 0.0 : Math.PI);
          g.save(); g.translate(oldX + (f === 5 ? -14 : 10) * s * dir, hitY); g.rotate(ang + (f === 5 ? -0.7 : 0.28));
          g.globalAlpha = f === 5 ? 0.8 : 0.95; fx.slash(g, Math.max(bodyH * 1.15, 110 * s), (crit ? 16 : 12) * s, '#ffffff', fx.a2(col, 0.9)); g.restore();
        }
        if (f >= 6 && f <= 9) {                                 // impact star + sparks radiating
          const k = (f - 6) / 3, rr1 = (40 + 26 * (1 - Math.abs(0.5 - k) * 2)) * s;
          g.save(); g.translate(oldX, hitY); g.globalCompositeOperation = 'lighter';
          fx.star(g, rr1, fx.a2(col, 0.5)); fx.star(g, rr1 * 0.55, 'rgba(255,255,255,0.9)'); g.globalCompositeOperation = 'source-over';
          g.fillStyle = fx.a2(col, 0.95);
          for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.2, r = (34 + k * 40 + (i * 37 % 30)) * s; g.fillRect(Math.cos(a) * r - 1.5 * s, Math.sin(a) * r - 1.5 * s, 2.5 * s, 2.5 * s); }
          g.restore();
        }
        if (f >= 11 && f <= 16) stab(g, 0.25 + 0.55 * clamp((f - 11) / 5, 0, 1));
        if (f >= 6) { const k = clamp((f - 6) / 3, 0, 1); paintNum(g, oldX + dir * 6 * s, headY - (1 - easeOut(k)) * 10 * s, numBase * (1.75 - 0.75 * easeOut(k)), Math.min(1, 0.4 + k)); }
      } else {
        // ── MISS: the target visually vacates the swing line, blade whiffs the empty air ──
        let adx = 0, lean = 0, tdX = 0, tdY = 0, tilt = 0;
        const dodgeX = dir * 46 * s, hopA = 14 * s;
        if (f <= 3) { const p = (f + 1) / 4; adx = dir * lunge * easeIn(p); lean = dir * 0.05 * p; }
        else if (f <= 5) { adx = dir * lunge; const d = clamp((f - 1) / 4, 0, 1); tdX = dodgeX * easeOut(d); tdY = -hopA * Math.sin(Math.PI * d); tilt = -dir * 0.10 * d; }
        else if (f <= 9) { const o = easeOut(clamp((f - 5) / 4, 0, 1)); adx = dir * (lunge + 36 * s * o); }
        else { const q = clamp((f - 9) / 7, 0, 1); adx = dir * (lunge + 36 * s) * (1 - easeInOut(q)); }
        if (f >= 2) {                                           // the dodge + pinned afterimages
          tdX = dodgeX; tilt = -dir * 0.10;
          if (f <= 5) { const d = clamp((f - 1) / 4, 0, 1); tdX = dodgeX * easeOut(d); tdY = -hopA * Math.sin(Math.PI * d); }
          drawCut(g, imgT, cutT, dir * -10 * s, 0, 0, 0.34);
          drawCut(g, imgT, cutT, dir * -22 * s, -2 * s, dir * 0.05, 0.14);
          drawCut(g, imgT, cutT, tdX, tdY, tilt, 1);
        } else drawCut(g, imgT, cutT, 0, 0, 0, 1);
        drawCut(g, imgA, cutA, adx, 0, lean, 1);
        if (f >= 2 && f <= 4) fx.dustPuff(g, oldX + dir * 8 * s, anT.feetY * s - 4 * s, 1.0 - (f - 2) * 0.15, s);
        if (f >= 5 && f <= 7) fx.dustPuff(g, oldX + dodgeX + dir * 6 * s, anT.feetY * s - 2 * s, 0.72 - (f - 5) * 0.15, s);
        if (f >= 4 && f <= 6) {                                 // whiff sweep through the vacated spot
          const ang = dir * 0.5 + (dir > 0 ? 0.0 : Math.PI);
          g.save(); g.translate(oldX, hitY - 8 * s); g.rotate(ang + (f - 5) * 0.42); g.globalAlpha = 0.6;
          fx.slash(g, Math.max(bodyH * 1.05, 100 * s), 8 * s, '#ffffff', fx.a2(pale, 0.75)); g.restore();
          for (let i = 0; i < 3; i++) fx.streak(g, oldX + dir * (30 + i * 30) * s, hitY - 22 * s + i * 14 * s, (76 + i * 16) * s, 4.5 * s, pale, 0.5 - i * 0.12);
        }
        if (f >= 7) whiffStatic(g, 0.55);
        if (f >= 7) {                                           // MISS plaque stamps the empty air
          const k = easeOut(clamp((f - 7) / 3, 0, 1));
          g.save(); g.translate(oldX, anT.feetY * s - bodyH - 40 * s); g.scale(1.35 - 0.35 * k, 1.35 - 0.35 * k);
          fx.missPlaque(g, 0, 0, s); g.restore();
        }
      }
      g.drawImage(chrome, 0, 0, W, H);
      const oc = createCanvas(OUT_W, OUT_H).getContext('2d');
      oc.drawImage(fc, 0, 0, OUT_W, OUT_H);
      frames.push(oc.canvas.toBuffer('raw'));
    }
    const mp4 = await encodeRaw(frames, OUT_W, OUT_H, FPS);
    console.log(`[TurnVfx] ${missed ? 'MISS' : 'HIT'} turn clip ${mp4 ? mp4.length + 'B' : 'NULL'} in ${Date.now() - t0}ms (${N}f @${FPS}fps)`);
    return mp4;
  } catch (e) { console.warn('[TurnVfx] animate failed:', e && e.message); return null; }
}

module.exports = { animatePvpTurn, OUT_W, OUT_H, FPS };
