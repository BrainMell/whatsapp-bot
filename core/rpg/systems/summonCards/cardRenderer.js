'use strict';
// 🃏 Summon-card renderer (Node canvas). Slay-the-Spire style cards, a fanned HAND strip for combat and a grid for the collection.
// Art swap: drop core/rpgasset/summoncards/<cardId>.png (see README there). No Go dependency.
const fs = require('fs');
const path = require('path');
const { RARITY, TYPE_STYLE, ELEMENT_COLORS } = require('./catalog');

const ASSET = path.join(__dirname, '..', '..', '..', 'rpgasset');
const ART_DIR = path.join(ASSET, 'summoncards');
const LEGACY_DIR = path.join(ASSET, 'summons', 'sparklinlabs_abyss');
const CW = 300, CH = 440;           // one card
let _cv = null; const _imgs = new Map(); let _fonts = false;

function cv() { if (!_cv) _cv = require('canvas'); return _cv; }
function fonts() {
  if (_fonts) return; _fonts = true;
  const { registerFont } = cv();
  for (const [f, fam] of [['Cinzel-Variable.ttf', 'SCCinzel'], ['IMFellEnglish-Regular.ttf', 'SCFell'], ['PressStart2P-Regular.ttf', 'SCPixel']]) {
    try { const p = path.join(ASSET, 'fonts', f); if (fs.existsSync(p)) registerFont(p, { family: fam }); } catch (e) {}
  }
}
async function img(p) {
  if (_imgs.has(p)) return _imgs.get(p);
  let r = null; try { r = await cv().loadImage(p); } catch (e) {}
  _imgs.set(p, r); return r;
}
async function artFor(card) {
  const cands = [path.join(ART_DIR, card.id + '.png'), path.join(ART_DIR, card.id + '.webp'), path.join(ART_DIR, card.id + '.jpg')];
  if (card.art) cands.push(path.resolve(LEGACY_DIR, card.art));
  for (const p of cands) { if (fs.existsSync(p)) { const i = await img(p); if (i) return i; } }
  return null;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

/** state: { ready:boolean, turnsLeft:number, affordable:boolean, index:number|null, locked:boolean } */
async function drawCard(c, card, x, y, st = {}) {
  fonts();
  const rar = RARITY[card.rarity] || RARITY.COMMON, ty = TYPE_STYLE[card.type] || TYPE_STYLE.ATTACK, el = ELEMENT_COLORS[card.element] || '#cccccc';
  c.save(); c.translate(x, y);
  // outer glow + frame
  c.shadowColor = rar.glow; c.shadowBlur = card.rarity === 'LEGENDARY' ? 26 : 14;
  rr(c, 6, 6, CW - 12, CH - 12, 22); const fg = c.createLinearGradient(0, 0, 0, CH); fg.addColorStop(0, rar.color); fg.addColorStop(1, rar.glow); c.fillStyle = fg; c.fill(); c.shadowBlur = 0;
  rr(c, 14, 14, CW - 28, CH - 28, 16); const bg = c.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#20232e'); bg.addColorStop(1, '#101219'); c.fillStyle = bg; c.fill();
  // art window
  const ax = 26, ay = 62, aw = CW - 52, ah = 186;
  c.save(); rr(c, ax, ay, aw, ah, 10); c.clip();
  const ag = c.createRadialGradient(CW / 2, ay + ah * 0.55, 8, CW / 2, ay + ah * 0.55, aw * 0.8); ag.addColorStop(0, hexA(el, 0.75)); ag.addColorStop(0.6, hexA(el, 0.25)); ag.addColorStop(1, '#0b0d12');
  c.fillStyle = ag; c.fillRect(ax, ay, aw, ah);
  c.globalAlpha = 0.18; c.fillStyle = '#fff'; for (let i = 0; i < 14; i++) { const px = ax + ((i * 67) % aw), py = ay + ((i * 41) % ah); c.fillRect(px, py, 2, 2); } c.globalAlpha = 1;
  const art = await artFor(card);
  if (art) {
    const k = Math.min((aw - 16) / art.width, (ah - 12) / art.height) * (art.width <= 200 ? 1 : 1);
    const iw = art.width * k, ih = art.height * k;
    c.imageSmoothingEnabled = art.width > 256; c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12;
    c.drawImage(art, ax + (aw - iw) / 2, ay + (ah - ih) / 2 + 4, iw, ih); c.shadowBlur = 0;
  } else {
    c.fillStyle = hexA('#ffffff', 0.85); c.font = 'bold 84px SCCinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(card.name[0], CW / 2, ay + ah / 2);
  }
  c.restore(); rr(c, ax, ay, aw, ah, 10); c.lineWidth = 3; c.strokeStyle = rar.color; c.stroke();
  // title banner
  rr(c, 40, 22, CW - 80, 34, 8); const tg = c.createLinearGradient(0, 22, 0, 56); tg.addColorStop(0, '#2c3140'); tg.addColorStop(1, '#171a24'); c.fillStyle = tg; c.fill(); c.lineWidth = 2; c.strokeStyle = rar.color; c.stroke();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs0 = 21; c.font = `bold ${fs0}px SCCinzel, serif`;
  while (c.measureText(card.name.toUpperCase()).width > CW - 108 && fs0 > 12) { fs0--; c.font = `bold ${fs0}px SCCinzel, serif`; }
  c.fillText(card.name.toUpperCase(), CW / 2 + 8, 40);
  // type ribbon
  rr(c, CW / 2 - 52, ay + ah - 12, 104, 24, 6); const rg = c.createLinearGradient(0, 0, 0, 1); c.fillStyle = ty.a; c.fill(); c.lineWidth = 2; c.strokeStyle = '#0b0d12'; c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 13px SCCinzel, serif'; c.fillText(ty.label, CW / 2, ay + ah); 
  // ability name + description
  c.fillStyle = rar.color; c.font = 'bold 17px SCCinzel, serif'; c.fillText(card.abilityName, CW / 2, ay + ah + 30);
  c.fillStyle = '#dfe3ee'; c.font = '16px SCFell, serif'; const lines = wrap(c, card.description, CW - 76);
  lines.slice(0, 4).forEach((l, i) => c.fillText(l, CW / 2, ay + ah + 56 + i * 20));
  // footer chips
  c.font = 'bold 12px SCCinzel, serif'; c.textAlign = 'left';
  c.fillStyle = hexA(el, 0.9); rr(c, 28, CH - 52, 82, 22, 6); c.fill(); c.fillStyle = '#0b0d12'; c.textAlign = 'center'; c.fillText(card.element, 69, CH - 41);
  c.fillStyle = '#2a2f3d'; rr(c, CW - 118, CH - 52, 90, 22, 6); c.fill(); c.fillStyle = '#cfd5e6'; c.fillText(`⏱ CD ${card.cooldownTurns}`.replace('⏱', 'CD:').replace('CD: CD', 'CD'), CW - 73, CH - 41);
  // cost orb
  const afford = st.affordable !== false;
  const og = c.createRadialGradient(40, 36, 2, 40, 36, 26); og.addColorStop(0, afford ? '#7fd1ff' : '#ff8a8a'); og.addColorStop(1, afford ? '#1b5fa8' : '#8a1f1f');
  c.beginPath(); c.arc(38, 40, 25, 0, Math.PI * 2); c.fillStyle = og; c.fill(); c.lineWidth = 4; c.strokeStyle = rar.color; c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 22px SCCinzel, serif'; c.textAlign = 'center'; c.fillText(String(card.energyCost), 38, 41);
  c.font = 'bold 9px SCCinzel, serif'; c.fillText('EN', 38, 56);
  // state overlays
  if (st.ready === false) {
    c.save(); rr(c, 6, 6, CW - 12, CH - 12, 22); c.clip(); c.fillStyle = 'rgba(8,10,16,0.72)'; c.fillRect(0, 0, CW, CH); c.restore();
    c.fillStyle = '#ffd36b'; c.font = 'bold 70px SCCinzel, serif'; c.textAlign = 'center'; c.fillText(String(st.turnsLeft || 1), CW / 2, CH / 2 - 10);
    c.font = 'bold 15px SCCinzel, serif'; c.fillText(st.turnsLeft === 1 ? 'TURN LEFT' : 'TURNS LEFT', CW / 2, CH / 2 + 38);
  } else if (!afford) {
    c.save(); rr(c, 6, 6, CW - 12, CH - 12, 22); c.clip(); c.fillStyle = 'rgba(8,10,16,0.38)'; c.fillRect(0, 0, CW, CH); c.restore();
  }
  if (st.index != null) { // play-by-number badge
    c.beginPath(); c.arc(CW / 2, CH + 14, 18, 0, Math.PI * 2); c.fillStyle = st.ready === false ? '#59606f' : '#ffd36b'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#0b0d12'; c.stroke();
    c.fillStyle = '#0b0d12'; c.font = 'bold 20px SCCinzel, serif'; c.fillText(String(st.index), CW / 2, CH + 15);
  }
  c.restore();
}

/** One card as a PNG buffer. */
async function renderCardPng(card, st = {}) {
  const { createCanvas } = cv(); const cvs = createCanvas(CW, CH + 40); const c = cvs.getContext('2d');
  await drawCard(c, card, 0, 0, st); return cvs.toBuffer('image/png');
}

/** One card as a PNG buffer rendered at `scale` — canvas transform keeps text/frames crisp
 *  (used by `.j summons <n>` standalone showcase cards). */
async function renderCardPngScaled(card, st = {}, scale = 2) {
  const { createCanvas } = cv(); const s = Math.max(1, Math.min(3, Number(scale) || 2));
  const cvs = createCanvas(Math.round(CW * s), Math.round((CH + 40) * s)); const c = cvs.getContext('2d');
  c.scale(s, s); await drawCard(c, card, 0, 0, st); return cvs.toBuffer('image/png');
}

/** 🕯️ Fitting arcane backdrop for the deck showcase (owner 2026-11-07: "revert to the old
 *  design, but give it a fitting background"): the old fanned-strip painter keeps its layout,
 *  but the flat pinstriped gradient gives way to a deep dungeon-navy backdrop with a GOLD
 *  SUMMONING CIRCLE behind the hand — double ring, tick ring, arcane diamond, soft floor
 *  glow, gold dust and a corner vignette, all in the HUD's own golds (#d4a017/#ffd666). */
function paintSummonBackdrop(c, W, H) {
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#171a26'); bg.addColorStop(1, '#0a0b11'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, H * 0.62, H * 0.08, W / 2, H * 0.62, W * 0.55);
  glow.addColorStop(0, 'rgba(212,160,23,0.12)'); glow.addColorStop(0.55, 'rgba(212,160,23,0.045)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.58, R = Math.min(W, H) * 0.48;
  c.save(); c.translate(cx, cy);
  c.strokeStyle = 'rgba(212,160,23,0.34)'; c.lineWidth = Math.max(2, H * 0.012);
  c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(255,214,102,0.22)'; c.lineWidth = Math.max(1, H * 0.006);
  c.beginPath(); c.arc(0, 0, R * 0.86, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.62, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(212,160,23,0.30)'; c.lineWidth = Math.max(1, H * 0.006);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, r0 = R * 0.86, r1 = R;
    c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
  }
  c.strokeStyle = 'rgba(255,214,102,0.15)';
  c.beginPath(); c.moveTo(0, -R * 0.62); c.lineTo(R * 0.62, 0); c.lineTo(0, R * 0.62); c.lineTo(-R * 0.62, 0); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(-R * 0.62, 0); c.lineTo(R * 0.62, 0); c.moveTo(0, -R * 0.62); c.lineTo(0, R * 0.62); c.stroke();
  c.restore();
  let sd = 7;
  const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  c.fillStyle = 'rgba(255,214,102,0.5)';
  for (let i = 0; i < 46; i++) { const px = rnd() * W, py = rnd() * H, pr = rnd() * 1.6 + 0.4; c.globalAlpha = 0.10 + rnd() * 0.30; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  const vg = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,8,0.55)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

/** Combat hand: fanned row (max 6 per row). entries: [{card, ready, turnsLeft, affordable}] */
async function renderHandPng(entries, opts = {}) {
  fonts(); const { createCanvas } = cv();
  const per = 6, rows = Math.ceil(entries.length / per), scale = opts.scale || 0.78;
  const w = Math.round(CW * scale), h = Math.round((CH + 40) * scale), pad = 46, gap = Math.round(w * 0.06);
  const cols = Math.min(per, entries.length);
  const W = pad * 2 + cols * w + (cols - 1) * gap, H = 70 + rows * (h + 26) + 22;
  const cvs = createCanvas(W, H), c = cvs.getContext('2d');
  paintSummonBackdrop(c, W, H);   // 🕯️ old layout, arcane backdrop (owner: "give it a fitting background")
  c.fillStyle = '#ffd36b'; c.font = 'bold 28px SCCinzel, serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(opts.title || 'SUMMON HAND', pad, 34);
  if (opts.energy != null) { c.textAlign = 'right'; c.fillStyle = '#7fd1ff'; c.fillText(`ENERGY ${Math.floor(opts.energy)}${opts.maxEnergy ? ' / ' + Math.floor(opts.maxEnergy) : ''}`, W - pad, 34); }
  const tmp = createCanvas(CW, CH + 40);
  for (let i = 0; i < entries.length; i++) {
    const r = Math.floor(i / per), col = i % per, rowN = Math.min(per, entries.length - r * per);
    const ox = (cols - rowN) * (w + gap) / 2, mid = (rowN - 1) / 2, rel = rowN > 1 ? (col - mid) / mid : 0;
    const x = pad + ox + col * (w + gap) + w / 2, y = 70 + r * (h + 26) + h / 2 + Math.abs(rel) * 14, ang = rel * 0.07;
    const t = tmp.getContext('2d'); t.clearRect(0, 0, CW, CH + 40);
    await drawCard(t, entries[i].card, 0, 0, { ready: entries[i].ready, turnsLeft: entries[i].turnsLeft, affordable: entries[i].affordable, index: i + 1 });
    c.save(); c.translate(x, y); c.rotate(ang); c.drawImage(tmp, -w / 2, -h / 2, w, h); c.restore();
  }
  return cvs.toBuffer('image/png');
}

module.exports = { renderCardPng, renderCardPngScaled, renderHandPng, drawCard, artFor, paintSummonBackdrop, CW, CH };
