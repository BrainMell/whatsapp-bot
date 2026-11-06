'use strict';
// ⚔️ COMBAT HUD v5 (owner 2026-11-06: "like the new general layout of the player hp and other stuff on the bottom left…
// just change the assets, same with the cards hud - redesign it, let the last card stand out like in those deck builders,
// the deck hub having SUMMONS written there is just ugly - research real games, take inspiration, find assets, polish").
// Deck-builder conventions (Slay the Spire / Balatro / Hearthstone hand studies): no label text on the rail, cards rest in
// a shallow fanned hand, and the newest/active card is RAISED + SCALED + GLOWING above the rest (visual hierarchy via
// scale, height and colour). Pure canvas painters used by the static PvE battle card + ultimate/skill video HUD.
// Everything is drawn in a 1024x687 design space; pass `s` to scale.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

const UI = path.join(__dirname, '..', '..', '..', 'rpgasset', 'ui');
const FONTS = path.join(__dirname, '..', '..', '..', 'rpgasset', 'fonts');
const DW = 1024, DH = 687;
let _ready = false; const _img = new Map();

function init() {
  if (_ready) return; _ready = true;
  for (const [f, fam] of [['dogicapixelbold.otf', 'HudPixel'], ['Cinzel-Variable.ttf', 'HudCinzel']]) {
    try { const p = path.join(f === 'dogicapixelbold.otf' ? UI : FONTS, f); const q = fs.existsSync(p) ? p : path.join(FONTS, f); if (fs.existsSync(q)) registerFont(q, { family: fam }); } catch (e) {}
  }
}
async function ui(name) {
  if (_img.has(name)) return _img.get(name);
  let i = null; try { i = await loadImage(path.join(UI, name)); } catch (e) {}
  _img.set(name, i); return i;
}
function uiSync(name) { return _img.get(name) || null; }
async function preload() {
  init();
  await Promise.all(['UI_Flat_Banner02a.png', 'heart.png', 'mana.png', 'hud_tray_rail.png', 'hud_plate_ring.png', 'hud_card_frame.png'].map(ui));
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shadowText(c, t, x, y, color, align = 'left') { c.textAlign = align; c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(t, x + 1.5, y + 1.5); c.fillStyle = color; c.fillText(t, x, y); }
function fit(c, t, maxW, px, fam, weight = 'bold') { let s = px; while (s > 9) { c.font = `${weight} ${s}px ${fam}`; if (c.measureText(t).width <= maxW) break; s--; } }

const RANK_COLOR = { F: '#6b6b6b', E: '#5b8a2e', D: '#1f7f9e', C: '#2f55c4', B: '#7a35c4', A: '#c0392b', S: '#c98a00', SS: '#d4a017', SSS: '#e0562b' };

/** Top-left rank ribbon built from the flat pixel banner asset (UI_Flat_Banner02a). text e.g. "S RANK" | "FLOOR 12" | "PVP MATCH" */
function drawRankBanner(c, text, s = 1) {
  init();
  const img = uiSync('UI_Flat_Banner02a.png'); const W = 228 * s, H = 71 * s, x = 14 * s, y = 10 * s;
  const m = /^([A-Z]{1,3}) RANK$/.exec(String(text || '').toUpperCase());
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8 * s; c.shadowOffsetY = 3 * s;
  if (img) { c.imageSmoothingEnabled = false; c.drawImage(img, x, y, W, H); }
  else { rr(c, x, y, W, H * 0.8, 8 * s); c.fillStyle = '#fffdf5'; c.fill(); c.lineWidth = 3 * s; c.strokeStyle = '#ffb35c'; c.stroke(); }
  c.restore();
  const cx = x + W * 0.5, cy = y + H * 0.4;
  c.textBaseline = 'middle';
  if (m) {
    const col = RANK_COLOR[m[1]] || '#3b2a14';
    c.font = `bold ${11 * s}px HudPixel, monospace`; c.fillStyle = '#7a5a30'; c.textAlign = 'left'; c.fillText('RANK', x + W * 0.17, cy);
    c.font = `bold ${30 * s}px HudPixel, monospace`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillText(m[1], cx + W * 0.2 + 1.5 * s, cy + 1.5 * s); c.fillStyle = col; c.fillText(m[1], cx + W * 0.2, cy);
  } else {
    fit(c, String(text || ''), W * 0.62, 20 * s, 'HudPixel, monospace'); c.textAlign = 'center'; c.fillStyle = '#3b2a14'; c.fillText(String(text || ''), cx, cy);
  }
}

/** Compact player plate (layout kept from v4): ornate medallion portrait + capsule HP / mana, no panel box.
 * hud = {name, hp, maxHp, energy, maxEnergy, level, portrait:Image|Canvas|null, color} */
function drawPlayerHud(c, hud, s = 1, ox = 18, oy = DH - 104) {
  init();
  const ring = uiSync('hud_plate_ring.png');
  const X = ox * s, Y = oy * s, R = 38 * s;
  const pcx = X + 60 * s, pcy = Y + 49 * s;
  // portrait socket
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 8 * s; c.shadowOffsetY = 3 * s;
  c.beginPath(); c.arc(pcx, pcy, R, 0, Math.PI * 2); c.fillStyle = '#120c06'; c.fill(); c.restore();
  c.save(); c.beginPath(); c.arc(pcx, pcy, R - 3 * s, 0, Math.PI * 2); c.clip();
  const pg = c.createRadialGradient(pcx, pcy - R * 0.3, 4, pcx, pcy, R); pg.addColorStop(0, '#3b4a66'); pg.addColorStop(1, '#161c2a'); c.fillStyle = pg; c.fillRect(pcx - R, pcy - R, R * 2, R * 2);
  if (hud.portrait) {
    const p = hud.portrait, pw = p.width, ph = p.height, sh = Math.min(ph, pw * 1.1);   // head+shoulders: top slice of the sprite
    const k = (R * 2.05) / Math.max(pw, sh);
    try { c.imageSmoothingEnabled = pw > 200; c.drawImage(p, 0, 0, pw, sh, pcx - (pw * k) / 2, pcy - R + 3 * s, pw * k, sh * k); } catch (e) {}
  } else { c.fillStyle = '#f3ecd8'; c.font = `bold ${34 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(hud.name || '?')[0].toUpperCase(), pcx, pcy); }
  c.restore();
  // ornate engraved medallion ring (asset; socket ratio 86/110 -> A = R*2.56)
  if (ring) { const A = R * 2.56; c.drawImage(ring, pcx - A / 2, pcy - A / 2, A, A); }
  else {
    const ringCol = hud.color || '#d8b04a';
    c.beginPath(); c.arc(pcx, pcy, R - 2 * s, 0, Math.PI * 2); c.lineWidth = 4 * s; c.strokeStyle = ringCol; c.stroke();
    c.beginPath(); c.arc(pcx, pcy, R + 1 * s, 0, Math.PI * 2); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(8,5,2,0.95)'; c.stroke();
  }
  if (hud.level) { // diamond level pip
    const lx = pcx + R * 0.80, ly = pcy + R * 0.80, r = 14 * s;
    c.save(); c.translate(lx, ly); c.rotate(Math.PI / 4);
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 5 * s;
    rr(c, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44, 3 * s); c.fillStyle = '#1b1208'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = 2.2 * s; c.strokeStyle = hud.color || '#d8b04a'; c.stroke();
    c.restore();
    c.fillStyle = '#f3ecd8'; c.font = `bold ${11 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(hud.level), lx, ly + 1);
  }
  // name (floating text, no box)
  const bx = X + 116 * s;
  c.textBaseline = 'middle'; fit(c, String(hud.name || 'Champion'), 150 * s, 19 * s, 'HudCinzel, serif');
  shadowText(c, String(hud.name || 'Champion'), bx, Y + 14 * s, '#f6efdc');
  // HP capsule
  const hpW = 184 * s, hpH = 19 * s, hy = Y + 27 * s;
  capsule(c, bx, hy, hpW, hpH, hud.maxHp > 0 ? hud.hp / hud.maxHp : 0, 'hp', `${Math.max(0, Math.floor(hud.hp || 0))}/${Math.max(1, Math.floor(hud.maxHp || 1))}`, s);
  heartIcon(c, bx - 1 * s, hy + hpH / 2, 13 * s);
  // mana capsule (slimmer + shorter)
  const enW = 144 * s, enH = 13 * s, ey = hy + hpH + 6 * s;
  capsule(c, bx, ey, enW, enH, hud.maxEnergy > 0 ? hud.energy / hud.maxEnergy : 0, 'en', `${Math.max(0, Math.floor(hud.energy || 0))}/${Math.max(1, Math.floor(hud.maxEnergy || 1))}`, s);
  dropIcon(c, bx - 1 * s, ey + enH / 2, 10 * s);
}
function heartIcon(c, cx, cy, r) {
  c.save(); c.translate(cx, cy); c.beginPath(); c.moveTo(0, r * 0.95);
  c.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.8, -r * 1.2, 0, -r * 0.4); c.bezierCurveTo(r * 0.8, -r * 1.2, r * 1.5, -r * 0.1, 0, r * 0.95); c.closePath();
  const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#ff6a5a'); g.addColorStop(1, '#a3141c'); c.fillStyle = g; c.fill(); c.lineWidth = r * 0.22; c.strokeStyle = '#2a0a08'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(-r * 0.45, -r * 0.35, r * 0.18, 0, Math.PI * 2); c.fill(); c.restore();
}
function dropIcon(c, cx, cy, r) {
  c.save(); c.translate(cx, cy); c.beginPath(); c.moveTo(0, -r * 1.2); c.bezierCurveTo(r * 1.1, -r * 0.1, r * 0.9, r * 1.0, 0, r * 1.0); c.bezierCurveTo(-r * 0.9, r * 1.0, -r * 1.1, -r * 0.1, 0, -r * 1.2); c.closePath();
  const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#9bd0ff'); g.addColorStop(1, '#2457b8'); c.fillStyle = g; c.fill(); c.lineWidth = r * 0.22; c.strokeStyle = '#08142e'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(-r * 0.3, 0, r * 0.18, 0, Math.PI * 2); c.fill(); c.restore();
}
function capsule(c, x, y, w, h, pct, kind, label, s) {
  pct = Math.max(0, Math.min(1, pct)); const r = h / 2;
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 5 * s; c.shadowOffsetY = 2 * s;
  rr(c, x, y, w, h, r); c.fillStyle = 'rgba(14,9,5,0.92)'; c.fill(); c.restore();
  if (pct > 0) {
    const fw = Math.max(h, w * pct), g = c.createLinearGradient(0, y, 0, y + h);
    if (kind === 'hp') { if (pct < 0.25) { g.addColorStop(0, '#ff5a45'); g.addColorStop(1, '#8f1a10'); } else { g.addColorStop(0, '#f0623a'); g.addColorStop(0.55, '#c8321c'); g.addColorStop(1, '#7a170c'); } }
    else { g.addColorStop(0, '#6fb2ff'); g.addColorStop(0.55, '#3a73d1'); g.addColorStop(1, '#1b3a82'); }
    c.save(); rr(c, x + 1.5 * s, y + 1.5 * s, w - 3 * s, h - 3 * s, r); c.clip(); rr(c, x, y, fw, h, r); c.fillStyle = g; c.fill();
    const gl = c.createLinearGradient(0, y, 0, y + h * 0.55); gl.addColorStop(0, 'rgba(255,255,255,0.32)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(x, y, fw, h * 0.55); c.restore();
    // engraved quarter ticks over the fill
    c.save(); rr(c, x, y, w, h, r); c.clip(); c.strokeStyle = 'rgba(0,0,0,0.32)'; c.lineWidth = 1 * s;
    for (const t of [0.25, 0.5, 0.75]) { const tx = x + w * t; c.beginPath(); c.moveTo(tx, y + 2 * s); c.lineTo(tx, y + h - 2 * s); c.stroke(); }
    c.restore();
  }
  // double pinstripe frame
  rr(c, x, y, w, h, r); c.lineWidth = 1.6 * s; c.strokeStyle = 'rgba(214,174,78,0.9)'; c.stroke();
  rr(c, x + 2.4 * s, y + 2.4 * s, w - 4.8 * s, h - 4.8 * s, Math.max(1, r - 2.4 * s)); c.lineWidth = 0.8 * s; c.strokeStyle = 'rgba(255,226,140,0.45)'; c.stroke();
  c.font = `bold ${Math.max(9, h * 0.62)}px sans-serif`; c.textBaseline = 'middle'; shadowText(c, label, x + w / 2, y + h / 2 + 1, '#fff7e0', 'center');
}

/** Slim overhead HP bar + name for a battlefield unit (replaces Go's layers-mode omissions). */
function drawUnitBar(c, a, u, s = 1) {
  const w = Math.max(70, Math.min(120, (a.w || 90) * 0.9)) * s, h = (u.isBoss ? 11 : 8) * s, x = a.x * s - w / 2, y = (a.feetY - (a.h || 120)) * s - 16 * s;
  capsuleThin(c, x, y, w, h, u.maxHp > 0 ? u.hp / u.maxHp : 0, u.isBoss ? '#c0392b' : (u.friendly ? '#3fae5a' : '#d2552e'), s);
  c.font = `bold ${12 * s}px sans-serif`; c.textBaseline = 'bottom'; shadowText(c, String(u.name || ''), a.x * s, y - 2 * s, '#fbf4e2', 'center');
}
function capsuleThin(c, x, y, w, h, pct, col, s) {
  pct = Math.max(0, Math.min(1, pct)); rr(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(12,8,4,0.85)'; c.fill();
  if (pct > 0) { c.save(); rr(c, x, y, w, h, h / 2); c.clip(); c.fillStyle = col; c.fillRect(x, y, Math.max(h, w * pct), h); const gl = c.createLinearGradient(0, y, 0, y + h); gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(x, y, w, h); c.restore(); }
  rr(c, x, y, w, h, h / 2); c.lineWidth = 1.3 * s; c.strokeStyle = 'rgba(214,174,78,0.85)'; c.stroke();
}

/** Long summon-card hand rail along the bottom (ornate asset, NO label text). The LAST card is raised,
 * scaled and glowing above the hand - the deck-builder "newest card" convention. Only call when entries.length > 0.
 * entries: [{card, ready, turnsLeft, affordable}] */
async function drawDeckTray(c, entries, s = 1, x0 = 330, y0 = DH - 96, x1 = DW - 18) {
  init();
  const { RARITY, ELEMENT_COLORS } = require('../summonCards/catalog');
  const { artFor } = require('../summonCards/cardRenderer');
  const rail = uiSync('hud_tray_rail.png');
  const X = x0 * s, Y = y0 * s, W = (x1 - x0) * s, H = 84 * s;
  // rail (asset has its own gold bevels, studs and end caps - no text)
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10 * s; c.shadowOffsetY = 4 * s;
  if (rail) c.drawImage(rail, X, Y, W, H);
  else { rr(c, X, Y, W, H, 14 * s); const g = c.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, '#3a2a18'); g.addColorStop(1, '#1a1109'); c.fillStyle = g; c.fill(); }
  c.restore();
  // hand layout: squeeze together like a held hand, never lose the numbering
  const cw = 52 * s, ch = 70 * s, padL = 26 * s, padR = 16 * s;
  const usable = W - padL - padR;
  const n = entries.length;
  const minStep = cw * 0.66;
  const maxFit = Math.max(1, Math.floor((usable - cw) / minStep) + 1);
  const shown = entries.slice(0, Math.min(n, maxFit));
  const more = n - shown.length;
  const step = shown.length > 1 ? Math.min(cw + 5 * s, Math.max(minStep, (usable - cw) / (shown.length - 1))) : 0;
  // spotlight pool under the standout (last) card
  const lift = 16 * s, scale = 1.3;
  const lastX = X + padL + (shown.length - 1) * step + cw / 2;
  const sp = c.createRadialGradient(lastX, Y + H / 2, 4, lastX, Y + H / 2, cw * 1.7);
  sp.addColorStop(0, 'rgba(255,214,102,0.30)'); sp.addColorStop(1, 'rgba(255,214,102,0)');
  c.save(); c.beginPath(); c.ellipse(lastX, Y + H / 2 + 6 * s, cw * 1.8, ch * 0.95, 0, 0, Math.PI * 2); c.fillStyle = sp; c.fill(); c.restore();
  for (let i = 0; i < shown.length; i++) {
    const isLast = i === shown.length - 1;
    const sc2 = isLast ? scale : 1;
    const ang = isLast ? 0 : (i - (shown.length - 1) / 2) * 1.1 * Math.PI / 180;
    const x = X + padL + i * step;
    const y = Y + (H - ch) / 2 - (isLast ? lift : 0);
    await drawMiniCard(c, shown[i], i, x, y, cw, ch, { s, sc: sc2, ang, standout: isLast, rar: RARITY, el: ELEMENT_COLORS, artFor });
  }
  if (more > 0) {
    const px = X + padL + shown.length * step + 4 * s, py = Y + H / 2;
    rr(c, px, py - 13 * s, 40 * s, 26 * s, 13 * s); c.fillStyle = 'rgba(12,10,6,0.9)'; c.fill();
    c.lineWidth = 1.6 * s; c.strokeStyle = '#c9a13b'; c.stroke();
    c.fillStyle = '#e7c766'; c.font = `bold ${15 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('+' + more, px + 20 * s, py + 1);
  }
}

/** One mini card in the hand rail. num = 1-based play number (position in the FULL hand, stable numbering). */
async function drawMiniCard(c, e, idx, x, y, cw, ch, o) {
  const { s, sc, ang, standout, rar, el, artFor } = o;
  const card = e.card;
  const rarC = (rar[card.rarity] || rar.COMMON).color;
  const elC = el[card.element] || '#cccccc';
  c.save();
  c.translate(x + cw / 2, y + ch);          // pivot: bottom-center
  c.rotate(ang || 0); c.scale(sc, sc);
  c.translate(-cw / 2, -ch);
  // body + glow
  if (standout) { c.shadowColor = '#ffd36b'; c.shadowBlur = 18 * s; }
  else if (e.ready !== false) { c.shadowColor = 'rgba(255,211,107,0.8)'; c.shadowBlur = 10 * s; }
  rr(c, 1 * s, 1 * s, cw - 2 * s, ch - 2 * s, 8 * s); c.fillStyle = '#12151d'; c.fill();
  c.shadowBlur = 0;
  // art window (frame asset proportions: 200x272 -> window 14..185 x, 14..163 y) - LOCAL coords
  c.save(); c.beginPath();
  const wx = 0.07 * cw, wy = 0.0515 * ch, ww = 0.855 * cw, wh = 0.5485 * ch;
  c.rect(wx, wy, ww, wh); c.clip();
  const ag = c.createLinearGradient(0, 0, 0, ch * 0.62); ag.addColorStop(0, elC); ag.addColorStop(1, '#0c0e14');
  c.globalAlpha = 0.5; c.fillStyle = ag; c.fillRect(wx, wy, ww, wh); c.globalAlpha = 1;
  try {
    const art = await artFor(card);
    if (art) { const k = Math.min(ww / art.width, wh / art.height); c.imageSmoothingEnabled = art.width > 256; c.drawImage(art, wx + (ww - art.width * k) / 2, wy + (wh - art.height * k) / 2, art.width * k, art.height * k); }
  } catch (e2) { /* art optional */ }
  c.restore();
  // gold frame asset over everything structural
  const frame = uiSync('hud_card_frame.png');
  if (frame) c.drawImage(frame, 0, 0, cw, ch);
  else { rr(c, 0, 0, cw, ch, 8 * s); c.lineWidth = (standout ? 2.8 : 1.8) * s; c.strokeStyle = rarC; c.stroke(); }
  // name strip
  c.font = `bold ${8 * s}px HudCinzel, serif`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#fff';
  fit(c, card.name.toUpperCase(), cw - 12 * s, 8 * s, 'HudCinzel, serif');
  c.fillText(card.name.toUpperCase(), cw / 2, ch * 0.72);
  // energy cost orb (bottom-right, mana-tinted + number)
  const ox2 = cw - 11.5 * s, oy2 = ch - 11.5 * s, or2 = 9 * s;
  c.beginPath(); c.arc(ox2, oy2, or2, 0, Math.PI * 2); c.fillStyle = 'rgba(8,14,30,0.92)'; c.fill();
  c.lineWidth = 1.6 * s; c.strokeStyle = e.affordable === false ? '#7a7a7a' : '#6fb2ff'; c.stroke();
  c.fillStyle = '#cfe6ff'; c.font = `bold ${9 * s}px sans-serif`; c.fillText(String(card.energyCost), ox2, oy2 + 0.5);
  // play-number badge (top-left, rarity ring)
  const nbx = 10.5 * s, nby = 10.5 * s, nbr = 8.5 * s;
  c.beginPath(); c.arc(nbx, nby, nbr, 0, Math.PI * 2); c.fillStyle = 'rgba(10,12,18,0.94)'; c.fill();
  c.lineWidth = 1.6 * s; c.strokeStyle = rarC; c.stroke();
  c.fillStyle = '#fff'; c.font = `bold ${10 * s}px sans-serif`; c.fillText(String(idx + 1), nbx, nby + 0.5);
  // states
  if (e.ready === false) {
    c.save(); rr(c, 1 * s, 1 * s, cw - 2 * s, ch - 2 * s, 8 * s); c.clip();
    c.fillStyle = 'rgba(6,8,12,0.74)'; c.fillRect(0, 0, cw, ch); c.restore();
    c.fillStyle = '#ffd36b'; c.font = `bold ${26 * s}px HudCinzel, serif`; c.fillText(String(e.turnsLeft || 1), cw / 2, ch * 0.36);
  } else if (e.affordable === false) {
    c.save(); rr(c, 1 * s, 1 * s, cw - 2 * s, ch - 2 * s, 8 * s); c.clip();
    c.fillStyle = 'rgba(6,8,12,0.42)'; c.fillRect(0, 0, cw, ch); c.restore();
  }
  // standout rim
  if (standout) {
    rr(c, 0.5 * s, 0.5 * s, cw - 1 * s, ch - 1 * s, 8 * s);
    c.lineWidth = 2.6 * s; c.strokeStyle = 'rgba(255,226,140,0.95)'; c.stroke();
  }
  c.restore();
}

/** Crop the head/shoulders source for the portrait from a player's cut (base64 PNG) or null. */
async function portraitFromCut(cut) { if (!cut || !cut.png) return null; try { return await loadImage(Buffer.from(cut.png, 'base64')); } catch (e) { return null; } }

module.exports = { preload, drawRankBanner, drawPlayerHud, drawUnitBar, drawDeckTray, portraitFromCut, DW, DH, RANK_COLOR };
