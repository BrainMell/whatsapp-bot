'use strict';
// 🎴 In-scene card-play animation (owner 2026-11-07: "if the card is in the visible deck you should physically SEE it move, come in
// front of the player, then do its thing - and if it's in the +N pile it should come out of that spot").
// Deck-builder motion language (Slay the Spire / Hearthstone / Inscryption): anticipation dip -> lift out of the slot on an arc with a
// little rotation + overshoot, hover in front of the caster with a soft element glow, reveal the summon rising out of the art, fire the
// effect (projectile -> impact + shake + number pop, or rings for skills/heals), then the card burns to element sparks.
// The base scene is the real Node battle card (same bg/sprites/bars/hub) so it reads as the SAME screen; the hand is painted from the
// shared deckLayout so the card leaves exactly its own slot. Returns an H.264 MP4 buffer (guildAdventure already sends mp4+gifPlayback).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createCanvas } = require('canvas');
const { ELEMENT_COLORS } = require('./catalog');
const { drawCard, artFor, CW, CH } = require('./cardRenderer');

const FPS = 20, N = 44, OUT_W = 768;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeBack = (k) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function bez(p0, p1, p2, k) { const u = 1 - k; return { x: u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x, y: u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y }; }

function encode(dir) {
  return new Promise((resolve, reject) => {
    const out = path.join(dir, 'out.mp4');
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%03d.jpg'),
      '-vf', `scale=${OUT_W}:-2:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(fs.readFileSync(out)) : reject(new Error('ffmpeg ' + code + ' ' + err.slice(0, 200)))));
  });
}

/**
 * @param {object} a { card, players, enemies, playerIndex, targetIndex, entries (hand entries, full, hand order), info{damage,healing,missed},
 *                     sceneOptions{rank,floor,backgroundPath,combatState}, api{buildPayload,generateCombatLayers} }
 * @returns {Promise<Buffer|null>} mp4 bytes, or null when the scene could not be built (caller falls back to the generic GIF)
 */
async function renderCardPlayScene(a) {
  const t0 = Date.now();
  const hud = require('../combat/combatHud');
  const cardNode = require('../combat/combatCardNode');
  const renderNodeCard = a.pvp ? cardNode.renderNodePvpCard : cardNode.renderNodeCard;   // PvP duels reuse the whole scene (both duelists are side 'player')
  const tgtSide = a.pvp ? 'player' : 'enemy';
  const { card, players, enemies, entries = [], info = {} } = a;
  const pIdx = Math.max(0, a.playerIndex || 0), tIdx = Math.max(0, a.targetIndex || 0);
  const attack = card.type === 'ATTACK' || (info.damage || 0) > 0;
  const sceneOut = {};
  // 🔧 owner 2026-11-07: "in some of these the enemy isn't even on the card and the attack hits the player". The card had ALREADY resolved,
  // so a killed target was dead/hp 0 and dropped from the layered scene -> no enemy anchor -> the old code fell back to the CASTER as the
  // target. The base scene is now rendered from the PRE-hit roster (a.enemiesPre) so the enemy is standing there when the card lands; if
  // it died, the final frames cross-fade to the real post-hit scene so you see it fall.
  const preEnemies = Array.isArray(a.enemiesPre) ? a.enemiesPre : enemies;
  const base = await renderNodeCard(players, preEnemies, {
    ...(a.sceneOptions || {}), hud: 'v2', combatType: a.pvp ? 'PVP' : 'PVE', _sceneOut: sceneOut, _skipTray: true,
    action: { attackerSide: 'player', attackerIndex: pIdx },
  }, a.api);
  if (!base || !sceneOut.canvas) return null;
  let A2 = null;
  if (preEnemies !== enemies && !info.mergeDeath) {   // mergeDeath: the real death clip is appended after this scene, so the target must still be standing at the end
    try { const so2 = {}; const r2 = await renderNodeCard(players, enemies, { ...(a.sceneOptions || {}), hud: 'v2', combatType: 'PVE', _sceneOut: so2, _skipTray: true, action: { attackerSide: 'player', attackerIndex: pIdx } }, a.api); if (r2 && so2.canvas) A2 = so2.canvas; } catch (e) { A2 = null; }
  }
  const W = sceneOut.canvas.width, H = sceneOut.canvas.height, s = sceneOut.s, anchors = sceneOut.anchors || [];
  const el = ELEMENT_COLORS[card.element] || '#ffd36b';
  // A = scene without hand; B = scene with hand. Frames draw B and erase the played slot back to A.
  const A = sceneOut.canvas, B = createCanvas(W, H), bc = B.getContext('2d'); bc.drawImage(A, 0, 0);
  const layout = hud.deckLayout(entries, s);
  const B1 = createCanvas(W, H), b1 = B1.getContext('2d'); b1.drawImage(A, 0, 0);
  if (entries.length) await hud.drawDeckTray(bc, entries, s);
  const hi0 = Math.max(0, entries.findIndex((e) => e.card && e.card.id === card.id));
  if (entries.length) await hud.drawDeckTray(b1, entries.map((e, i) => (i === hi0 ? { ...e, hidden: true } : e)), s);
  const handIdx = Math.max(0, entries.findIndex((e) => e.card && e.card.id === card.id));
  const fromPile = handIdx >= layout.shownN && !!layout.chip;
  const slot = !fromPile ? layout.slots[Math.min(handIdx, layout.slots.length - 1)] : null;
  const find = (side, idx) => anchors.find((x) => x.side === side && x.index === idx) || anchors.find((x) => x.side === side) || null;
  const caster = find('player', pIdx) || { x: W / (2 * s), feetY: H / s * 0.7, w: 120, h: 160 };
  const anyEnemy = anchors.find((x) => x.side === tgtSide && !(a.pvp && x.index === pIdx));
  const targ = attack ? (find(tgtSide, tIdx) || anyEnemy || { x: W * 0.72 / s, feetY: H * 0.7 / s, w: 120, h: 160 }) : caster;
  const cp = { x: caster.x * s, y: (caster.feetY - (caster.h || 160) * 0.5) * s }, tp = { x: targ.x * s, y: (targ.feetY - (targ.h || 160) * 0.5) * s };
  // card sprite (pre-rendered once) + summon art
  const cardImg0 = createCanvas(CW, CH + 10); await drawCard(cardImg0.getContext('2d'), card, 0, 0, { ready: true, affordable: true });
  const idle0 = await require('./summonIdle').getIdle(card).catch(() => null);
  // one pre-rendered card per idle frame so the summon is ALREADY animating inside the card while it flies, then lifts out of it
  const cardVariants = [];
  if (idle0) for (const fr of idle0.frames) { const cc = createCanvas(CW, CH + 10); await drawCard(cc.getContext('2d'), card, 0, 0, { ready: true, affordable: true, artOverride: fr }); cardVariants.push(cc); }
  let cardImg = cardImg0;
  const art0 = await artFor(card).catch(() => null);
  const idle = await require('./summonIdle').getIdle(card).catch(() => null);   // the summon's own idle animation (owner: reuse it)
  // geometry (all in 1024-scaled px)
  const fw = 150 * s, fh = fw * (CH / CW);                                    // flight size
  const startC = fromPile
    ? { x: layout.chip.x + layout.chip.w / 2, y: layout.chip.y + layout.chip.h / 2, w: 22 * s, h: 22 * s * CH / CW }
    : { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2, w: slot.w, h: slot.h };
  const hover = { x: cp.x + (tp.x > cp.x ? 70 : -70) * s * 0.0 + 0, y: Math.max(fh * 0.55 + 14 * s, cp.y - 118 * s) };
  const ctrl = { x: (startC.x + hover.x) / 2 + (startC.x < hover.x ? -80 : 80) * s, y: Math.min(startC.y, hover.y) - 120 * s };
  const R = rnd(card.id.length * 977 + 13);
  const sparks = Array.from({ length: 46 }, () => ({ a: R() * Math.PI * 2, v: 60 + R() * 260, r: 1.5 + R() * 3.5, d: R() * 0.25, up: R() }));
  const dust = Array.from({ length: 18 }, () => ({ x: (R() - 0.5) * 120, y: (R() - 0.5) * 160, r: 1 + R() * 2.2, d: R() }));
  const dmg = info.damage || 0, heal = info.healing || 0;
  const label = info.missed ? 'MISS' : (dmg > 0 ? '-' + dmg : (heal > 0 ? '+' + heal : String(card.abilityName || '').toUpperCase()));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-'));
  const fc = createCanvas(W, H), c = fc.getContext('2d');

  for (let f = 0; f < N; f++) {
    const t = f / (N - 1);
    // phases
    const kAnt = seg(t, 0.04, 0.12), kLift = seg(t, 0.12, 0.36), kHover = seg(t, 0.36, 0.58), kReveal = seg(t, 0.40, 0.58), kFx = seg(t, 0.52, 0.80), kOut = seg(t, 0.74, 0.92);
    // screen shake on impact
    const impact = attack && !info.missed ? seg(t, 0.64, 0.72) * (1 - seg(t, 0.72, 0.84)) : 0;
    const shx = Math.sin(f * 7.3) * 7 * s * impact, shy = Math.cos(f * 5.1) * 5 * s * impact;
    c.save(); c.clearRect(0, 0, W, H); c.translate(shx, shy);
    c.drawImage(t > 0.05 ? B1 : B, 0, 0);
    if (A2 && attack) { // the target fell: fade its area over to the post-hit scene right after the impact
      const kD = seg(t, 0.74, 0.86);
      if (kD > 0) { const bw = ((targ.w || 120) * 1.5) * s, bh = ((targ.h || 160) * 1.5) * s; c.save(); c.globalAlpha = kD; c.beginPath(); c.rect(tp.x - bw / 2, tp.y - bh * 0.62, bw, bh); c.clip(); c.drawImage(A2, 0, 0); c.restore(); }
    }
    // erase the played slot (the card is "in the air") — repaint scene-without-hand there
    // darken the scene slightly while the card is the star
    const dim = 0.28 * Math.min(seg(t, 0.14, 0.30), 1 - seg(t, 0.80, 0.95));
    if (dim > 0) { c.fillStyle = `rgba(6,4,2,${dim})`; c.fillRect(-20, -20, W + 40, H + 40); }
    // pile pop: the +N chip kicks, a puff of parchment fans out of it
    if (fromPile && t > 0.04 && t < 0.30) {
      const k = seg(t, 0.04, 0.30), cx = startC.x, cy = startC.y;
      c.save(); c.translate(cx, cy); c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = '#e7c766'; c.lineWidth = 2.2 * s;
      c.beginPath(); c.arc(0, 0, (8 + k * 40) * s, 0, 7); c.stroke(); c.restore();
    }
    // --- the card ---
    if (t >= 0.04 && kOut < 1) {
      let pos, sc, ang, alpha = 1;
      if (kLift <= 0) { // anticipation: tiny dip + squeeze at the slot
        const k = easeOut(kAnt);
        pos = { x: startC.x, y: startC.y + 5 * s * Math.sin(k * Math.PI) };
        sc = (startC.w / fw) * (1 - 0.04 * Math.sin(k * Math.PI)); ang = slot ? slot.ang : 0; alpha = fromPile ? k : 1;
      } else if (kHover < 1 && kLift < 1) { // flight on an arc, rotation settles, scale overshoots
        const k = easeInOut(kLift); pos = bez(startC, ctrl, hover, k);
        sc = lerp(startC.w / fw, 1, easeBack(clamp(kLift * 1.05))); ang = lerp(slot ? slot.ang : 0, 0, k) + Math.sin(k * Math.PI) * (startC.x < hover.x ? 0.16 : -0.16);
      } else { // hover (gentle bob), then sink toward the caster as the effect launches
        const bob = Math.sin(t * 20) * 3 * s, sink = easeOut(kFx) * 22 * s;
        pos = { x: hover.x, y: hover.y + bob + sink }; sc = 1 - 0.06 * easeOut(kFx); ang = Math.sin(t * 11) * 0.02;
      }
      // trail ghosts while in flight
      if (kLift > 0 && kLift < 1) for (let g = 3; g >= 1; g--) {
        const kg = easeInOut(clamp(kLift - g * 0.06)), pg = bez(startC, ctrl, hover, kg);
        c.save(); c.globalAlpha = 0.16 * (4 - g) / 3; c.translate(pg.x, pg.y); c.rotate(ang); const sg = lerp(startC.w / fw, 1, kg) * 0.96; c.scale(sg, sg); c.drawImage(cardImg, -fw / 2, -fh / 2, fw, fh); c.restore();
      }
      // glow aura (element) once it is in front of the player
      const aura = seg(t, 0.28, 0.40) * (1 - kOut);
      if (aura > 0) { const g = c.createRadialGradient(pos.x, pos.y, fw * 0.2, pos.x, pos.y, fw * 1.05); g.addColorStop(0, rgba(el, 0.5 * aura)); g.addColorStop(1, rgba(el, 0)); c.fillStyle = g; c.fillRect(pos.x - fw * 1.2, pos.y - fh, fw * 2.4, fh * 2); }
      // card burns away (kOut): shrink + fade, sparks emitted below
      const burn = easeOut(kOut); alpha *= 1 - burn; sc *= 1 + 0.08 * burn;
      c.save(); c.globalAlpha = clamp(alpha); c.translate(pos.x, pos.y); c.rotate(ang); c.scale(sc, sc);
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16 * s; c.shadowOffsetY = 8 * s;
      c.drawImage(cardImg, -fw / 2, -fh / 2, fw, fh);
      if (kOut > 0) { c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(el, 0.5 * kOut); c.fillRect(-fw / 2, -fh / 2, fw, fh); }
      c.restore();
      // floating dust motes around the hovering card
      if (kHover > 0 && kOut < 1) for (const d of dust) { const k = (t * 1.6 + d.d) % 1; c.fillStyle = rgba('#fff3c0', 0.55 * Math.sin(k * Math.PI) * (1 - kOut)); c.beginPath(); c.arc(pos.x + d.x * s, pos.y + d.y * s - k * 30 * s, d.r * s, 0, 7); c.fill(); }
      if (kOut > 0) for (const p of sparks) { const k = clamp((kOut - p.d) * 1.5); c.fillStyle = rgba(el, (1 - k) * 0.9); c.fillRect(pos.x + Math.cos(p.a) * p.v * k * s * 0.7 - p.r * s / 2, pos.y + Math.sin(p.a) * p.v * k * s * 0.7 - p.up * 90 * k * s, p.r * s, p.r * s); }
    }
    // --- the summon rises out of the card art ---
    const art = idle ? require('./summonIdle').frameAt(idle, f / FPS) : art0;
    if (cardVariants.length) cardImg = cardVariants[Math.floor((f / FPS) * idle0.fps) % cardVariants.length];
    if (kReveal > 0 && art && kFx < 1.01) {
      const k = easeOut(kReveal), fade = 1 - seg(t, 0.78, 0.9), sz = (art.height > 0 ? 150 : 150) * s * (0.8 + 0.3 * k), asp = art.width / art.height;
      const ah = sz, aw = sz * asp, ay = hover.y - fh * 0.2 - k * 60 * s, ax = hover.x + (tp.x > cp.x ? -1 : 1) * 0;
      c.save(); c.globalAlpha = clamp(k * fade); c.shadowColor = rgba(el, 0.9); c.shadowBlur = 24 * s; c.imageSmoothingEnabled = art.width > 256; c.drawImage(art, ax - aw / 2, ay - ah / 2, aw, ah); c.restore();
    }
    // --- the effect ---
    if (kFx > 0) {
      if (attack) {
        const kP = seg(kFx, 0, 0.55), from = { x: hover.x, y: hover.y }, to = tp;
        if (kP < 1) { // projectile + comet trail
          for (let g = 0; g < 7; g++) { const kg = clamp(kP - g * 0.04), pg = bez(from, { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 70 * s }, to, easeInOut(kg)); c.fillStyle = rgba(el, 0.7 * (1 - g / 7)); c.beginPath(); c.arc(pg.x, pg.y, (16 - g * 1.6) * s, 0, 7); c.fill(); }
          const pg = bez(from, { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 70 * s }, to, easeInOut(kP)); c.fillStyle = '#fff'; c.beginPath(); c.arc(pg.x, pg.y, 7 * s, 0, 7); c.fill();
        }
        const kI = seg(kFx, 0.55, 1);
        if (kI > 0 && !info.missed) { // impact: flash disc, shock ring, claw slashes
          c.save(); c.translate(tp.x, tp.y); c.globalCompositeOperation = 'lighter';
          const g = c.createRadialGradient(0, 0, 4, 0, 0, (50 + kI * 90) * s); g.addColorStop(0, rgba('#ffffff', 0.9 * (1 - kI))); g.addColorStop(0.4, rgba(el, 0.6 * (1 - kI))); g.addColorStop(1, rgba(el, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, (50 + kI * 90) * s, 0, 7); c.fill();
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba('#ffffff', 1 - kI); c.lineWidth = (7 * (1 - kI) + 1) * s;
          for (let i = 0; i < 3; i++) { const o = (i - 1) * 22 * s; c.beginPath(); c.moveTo(-60 * s + kI * 30 * s, -56 * s + o); c.lineTo(60 * s + kI * 30 * s, 56 * s + o); c.stroke(); }
          for (const p of sparks.slice(0, 22)) { const k = clamp(kI * 1.3 - p.d); c.fillStyle = rgba(el, 1 - k); c.fillRect(Math.cos(p.a) * p.v * k * s * 0.6, Math.sin(p.a) * p.v * k * s * 0.6 + k * k * 40 * s, p.r * s, p.r * s); }
          c.restore();
        }
      } else { // skill / heal / power: concentric rings blooming on the caster (or ally)
        for (let i = 0; i < 3; i++) { const k = clamp(kFx * 1.3 - i * 0.14); if (k <= 0) continue; c.strokeStyle = rgba(el, (1 - k) * 0.9); c.lineWidth = (7 * (1 - k) + 2) * s; c.beginPath(); c.ellipse(cp.x, cp.y + 40 * s, (30 + k * 120) * s, (12 + k * 46) * s, 0, 0, 7); c.stroke(); }
        const g = c.createRadialGradient(cp.x, cp.y, 10 * s, cp.x, cp.y, 150 * s); g.addColorStop(0, rgba(el, 0.4 * Math.sin(kFx * Math.PI))); g.addColorStop(1, rgba(el, 0)); c.fillStyle = g; c.fillRect(cp.x - 160 * s, cp.y - 160 * s, 320 * s, 320 * s);
      }
      // number / label pop
      const kN = seg(kFx, attack ? 0.6 : 0.25, 1);
      if (kN > 0) {
        const px = attack ? tp.x : cp.x, py = (attack ? tp.y : cp.y) - 70 * s - easeOut(kN) * 46 * s, big = label.length <= 6;
        c.save(); c.translate(px, py); const pop = 0.7 + 0.45 * easeBack(clamp(kN * 2)); c.scale(pop, pop);
        c.font = `${(big ? 54 : 26) * s}px SCCinzelD, SCCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8 * s; c.lineJoin = 'round'; c.strokeStyle = '#1b0f05';
        c.globalAlpha = clamp(2.2 - kN * 1.5); c.strokeText(label, 0, 0); c.fillStyle = info.missed ? '#d8d4c8' : (dmg > 0 ? '#ff7a64' : (heal > 0 ? '#7df0a0' : '#ffe9a0')); c.fillText(label, 0, 0); c.restore();
      }
    }
    // ability banner: parchment ribbon slides in at the top during the hover
    const kB = Math.min(seg(t, 0.30, 0.40), 1 - seg(t, 0.74, 0.84));
    if (kB > 0) {
      const bw = 330 * s, bh = 38 * s, bx = W / 2 - bw / 2, by = 22 * s - (1 - easeOut(kB)) * 70 * s;
      c.save(); c.globalAlpha = clamp(kB * 1.5); const P = require('../shared/parchment');
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8 * s; c.shadowOffsetY = 3 * s; P.tornPath(c, bx, by, bw, bh, { amp: 1.6 * s, step: 9 * s, seed: 5, notch: 14 * s, notchLeft: 14 * s }); c.fillStyle = '#e6d19b'; c.fill(); c.shadowBlur = 0;
      c.clip(); c.drawImage(P.makePaper(bw, bh, { seed: 21, tone: 'cream', stains: 0 }), bx, by); c.restore();
      c.save(); c.globalAlpha = clamp(kB * 1.5); c.fillStyle = '#2c1a0c'; c.font = `${19 * s}px SCCinzelD, SCCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(card.abilityName || card.name).toUpperCase(), W / 2, by + bh / 2 + 1 * s); c.restore();
    }
    c.restore();
    fs.writeFileSync(path.join(dir, `f${String(f).padStart(3, '0')}.jpg`), fc.toBuffer('image/jpeg', { quality: 0.86 }));
  }
  // hold the last frame a beat so the result is readable
  for (let h = 0; h < 8; h++) fs.copyFileSync(path.join(dir, `f${String(N - 1).padStart(3, '0')}.jpg`), path.join(dir, `f${String(N + h).padStart(3, '0')}.jpg`));
  try { const mp4 = await encode(dir); console.log(`[CardScene] ${card.id} ${fromPile ? 'pile' : 'slot ' + (handIdx + 1)} ${mp4.length}B in ${Date.now() - t0}ms`); return mp4; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* tmp */ } }
}

module.exports = { renderCardPlayScene };
