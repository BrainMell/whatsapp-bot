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
  for (const [f, fam] of [['Cinzel-Variable.ttf', 'SCCinzel'], ['IMFellEnglish-Regular.ttf', 'SCFell'], ['PressStart2P-Regular.ttf', 'SCPixel'], ['CinzelDecorative-Bold.ttf', 'SCCinzelD'], ['IMFellEnglish-Italic.ttf', 'SCFellI']]) {
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

// ── 📜 Parchment deck-builder card (owner 2026-11-07: "redesign, put soul into it"). Aged paper body, riveted metal frame by
// rarity (iron / verdigris / steel / gold-leaf), arched art window with element sunburst, wax cost seal, hourglass cooldown shield,
// swallowtail title + type ribbons, rule box with italic flavour text, gem pips and an element sigil. Same 300x440 box + signature.
const P = require('../shared/parchment');
const METAL = {
  COMMON:    ['#d3d6dc', '#858b95', '#3a3e46'], UNCOMMON: ['#b6efc9', '#4aa36f', '#1d4f34'],
  RARE:      ['#cbe6ff', '#5392dc', '#1c3c78'], LEGENDARY: ['#fff6bd', '#e3aa2a', '#744508'],
};
const FLAVOR = {
  ifrit: 'Born where the forge-wind never sleeps.', leviathan: 'The tide remembers every ship it has taken.', shiva: 'Silence, then frost, then nothing at all.',
  pyraxis: 'Its wings write letters in the sky. All of them are goodbyes.', colossus: 'It has been standing since before the mountain was named.',
  frostbeard: 'Old, loud, and never once cold.', nauticus: 'Lightning travels farthest through still water.', starnail: 'A fallen star, still arguing with gravity.',
  fireguard: 'Sworn to the flame. The flame has not sworn back.', tidalmaw: 'Patient as the sea floor, hungry as the sea.', lumenmoth: 'Follow the glow. Ignore where it leads.',
  rexor: 'Small arms. Large opinions.', krakenling: 'Still growing into its many opinions.', trickbox: 'Do not open. It knows you want to.',
  emberwick: 'One small flame, held against the whole night.', skitterswarm: 'You will hear them long before you do not.', nocturne: 'It drinks the dark, and the dark is not enough.',
  tuskgore: 'Subtlety was never bred into the line.', wraithveil: 'A whisper in a cold room. It knows your name.', sporelord: 'Everything blooms eventually. Preferably on you.',
  vipertongue: 'Quick words. Quicker fangs.', gelatrix: 'Soft. Stubborn. Surprisingly dense.', frostpeep: 'Adorable right up until the pecking.', plaguefang: 'The bite is not the worst part.', boglurk: 'Roots drink deep. So does patience.',
};
function seal(c, x, y, r, col, fn) { P.waxSeal(c, x, y, r, col, (cc, cx, cy) => { cc.save(); cc.translate(cx, cy); fn(cc); cc.restore(); }); }
function hash(str) { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h || 1; }
function metalGrad(c, m, y0, y1) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, m[0]); g.addColorStop(0.45, m[1]); g.addColorStop(0.55, m[0]); g.addColorStop(1, m[2]); return g; }
function archPath(c, x, y, w, h, top, bot) {
  c.beginPath(); c.moveTo(x, y + top); c.quadraticCurveTo(x, y, x + top, y); c.lineTo(x + w - top, y); c.quadraticCurveTo(x + w, y, x + w, y + top);
  c.lineTo(x + w, y + h - bot); c.quadraticCurveTo(x + w, y + h, x + w - bot, y + h); c.lineTo(x + bot, y + h); c.quadraticCurveTo(x, y + h, x, y + h - bot); c.closePath();
}
function ribbon(c, x, y, w, h, n) { // swallowtail-notched ribbon path
  c.beginPath(); c.moveTo(x + n, y); c.lineTo(x + w - n, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w - n, y + h); c.lineTo(x + n, y + h); c.lineTo(x, y + h / 2); c.closePath();
}
/** Little vector sigils so no card relies on emoji fonts. */
function sigil(c, el, cx, cy, r, col) {
  c.save(); c.translate(cx, cy); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(1.4, r * 0.16); c.lineCap = 'round'; c.lineJoin = 'round';
  const L = (...p) => { c.beginPath(); c.moveTo(p[0] * r, p[1] * r); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] * r, p[i + 1] * r); };
  switch (el) {
    case 'FIRE': c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.8, r * 0.9, 0, r); c.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.9, -r * 0.1, -r * 0.2, -r * 0.45); c.bezierCurveTo(-r * 0.1, -r * 0.2, 0, -r * 0.2, 0, -r); c.fill(); break;
    case 'WATER': case 'POISON': c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 0.95, r * 0.15, r * 0.7, r, 0, r); c.bezierCurveTo(-r * 0.7, r, -r * 0.95, r * 0.15, 0, -r); c.fill(); break;
    case 'ICE': for (let i = 0; i < 3; i++) { c.save(); c.rotate(i * Math.PI / 3); L(0, -1, 0, 1); c.stroke(); L(-0.3, -0.7, 0, -0.4, 0.3, -0.7); c.stroke(); L(-0.3, 0.7, 0, 0.4, 0.3, 0.7); c.stroke(); c.restore(); } break;
    case 'EARTH': L(-1, 0.8, -0.35, -0.5, 0, 0.1, 0.4, -0.9, 1, 0.8); c.closePath(); c.fill(); break;
    case 'LIGHT': c.beginPath(); c.arc(0, 0, r * 0.42, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * Math.PI / 4); L(0, -0.62, 0, -1); c.stroke(); c.restore(); } break;
    case 'LIGHTNING': L(0.25, -1, -0.55, 0.1, -0.05, 0.1, -0.3, 1, 0.6, -0.2, 0.05, -0.2); c.closePath(); c.fill(); break;
    case 'SHADOW': c.beginPath(); c.arc(0, 0, r, 0.45 * Math.PI, 1.55 * Math.PI, false); c.arc(r * 0.45, 0, r * 0.82, 1.4 * Math.PI, 0.6 * Math.PI, true); c.closePath(); c.fill(); break;
    case 'NATURE': c.beginPath(); c.moveTo(-r * 0.9, r * 0.9); c.bezierCurveTo(-r, -r * 0.5, r * 0.2, -r, r, -r); c.bezierCurveTo(r, r * 0.1, -r * 0.1, r, -r * 0.9, r * 0.9); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; L(-0.8, 0.8, 0.5, -0.5); c.stroke(); break;
    case 'PLAGUE': for (const [x, y, k] of [[0, -0.4, 0.5], [-0.5, 0.45, 0.4], [0.5, 0.45, 0.4]]) { c.beginPath(); c.arc(x * r, y * r, k * r, 0, 7); c.fill(); } break;
    case 'BEAST': for (const x of [-0.55, 0, 0.55]) { c.beginPath(); c.moveTo((x - 0.18) * r, -r); c.quadraticCurveTo((x + 0.35) * r, 0, (x - 0.1) * r, r); c.quadraticCurveTo((x + 0.05) * r, 0, (x - 0.18) * r, -r); c.fill(); } break;
    default: for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 4); L(0, -1, 0.16, -0.16, 1, 0, 0.16, 0.16, 0, 1, -0.16, 0.16, -1, 0, -0.16, -0.16); c.closePath(); c.fill(); c.restore(); if (i === 1) break; }
  }
  c.restore();
}
function typeEmblem(c, type, cx, cy, r, col) {
  c.save(); c.translate(cx, cy); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = r * 0.22; c.lineCap = 'round';
  if (type === 'ATTACK') { for (const d of [1, -1]) { c.beginPath(); c.moveTo(-r * d, r); c.lineTo(r * d, -r); c.stroke(); c.beginPath(); c.moveTo((-r * 0.1 * d) - r * 0.45, r * 0.2 * d + r * 0.1); c.lineTo(r * 0.45 - r * 0.1 * d, -r * 0.2 * d - r * 0.1); } c.restore(); return; }
  if (type === 'SKILL') { c.beginPath(); c.moveTo(0, r); c.bezierCurveTo(-r * 1.1, r * 0.3, -r, -r * 0.5, -r, -r * 0.8); c.lineTo(0, -r); c.lineTo(r, -r * 0.8); c.bezierCurveTo(r, -r * 0.5, r * 1.1, r * 0.3, 0, r); c.fill(); c.restore(); return; }
  c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? 0.45 : 1; c.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } c.closePath(); c.fill(); c.restore();
}

/** state: { ready:boolean, turnsLeft:number, affordable:boolean, index:number|null, locked:boolean } */
async function drawCard(c, card, x, y, st = {}) {
  fonts();
  const rar = RARITY[card.rarity] || RARITY.COMMON, ty = TYPE_STYLE[card.type] || TYPE_STYLE.ATTACK, el = ELEMENT_COLORS[card.element] || '#cccccc';
  const M = METAL[card.rarity] || METAL.COMMON, seed = hash(card.id), ink = '#2c1a0c', gold = card.rarity === 'LEGENDARY';
  const afford = st.affordable !== false;
  c.save(); c.translate(x, y); c.textBaseline = 'middle'; c.textAlign = 'center';
  // 1. backing + metal frame
  c.save(); c.shadowColor = hexA(rar.glow, gold ? 0.9 : 0.55); c.shadowBlur = gold ? 24 : 12; c.shadowOffsetY = 3;
  rr(c, 6, 6, CW - 12, CH - 12, 20); c.fillStyle = metalGrad(c, M, 6, CH); c.fill(); c.restore();
  rr(c, 11, 11, CW - 22, CH - 22, 16); c.fillStyle = '#1b120a'; c.fill();
  // 2. parchment body (deckled)
  const px = 15, py = 15, pw = CW - 30, ph = CH - 30;
  c.save(); P.tornPath(c, px, py, pw, ph, { amp: 1.3, step: 9, seed: seed % 97 }); c.clip();
  c.drawImage(P.makePaper(pw, ph, { seed: seed % 53 + 1, tone: card.rarity === 'COMMON' ? 'warm' : 'cream', stains: 0 }), px, py);
  const vg = c.createRadialGradient(CW / 2, CH / 2, 90, CW / 2, CH / 2, 280); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,30,8,0.34)'); c.fillStyle = vg; c.fillRect(px, py, pw, ph);
  c.restore();
  // inner ink keyline + stitching
  rr(c, 18, 18, CW - 36, CH - 36, 11); c.lineWidth = 1.4; c.strokeStyle = 'rgba(44,26,12,0.55)'; c.stroke();
  P.stitch(c, 22, 22, CW - 44, CH - 44, 8, 'rgba(60,34,14,0.38)', 1, [4, 4]);
  // 3. arched art window
  const ax = 28, ay = 58, aw = CW - 56, ah = 162;
  c.save(); archPath(c, ax, ay, aw, ah, 54, 8); c.clip();
  const bgG = c.createLinearGradient(0, ay, 0, ay + ah); bgG.addColorStop(0, '#0d0f16'); bgG.addColorStop(1, hexA(el, 0.45)); c.fillStyle = bgG; c.fillRect(ax, ay, aw, ah);
  const cxA = CW / 2, cyA = ay + ah * 0.62;
  c.save(); c.translate(cxA, cyA); c.fillStyle = hexA(el, 0.17); for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 230, a, a + Math.PI / 14); c.closePath(); c.fill(); } c.restore();
  const og = c.createRadialGradient(cxA, cyA, 6, cxA, cyA, aw * 0.62); og.addColorStop(0, hexA(el, 0.85)); og.addColorStop(0.5, hexA(el, 0.28)); og.addColorStop(1, 'rgba(8,10,16,0.0)'); c.fillStyle = og; c.fillRect(ax, ay, aw, ah);
  c.strokeStyle = hexA(el, 0.5); c.lineWidth = 1.2; c.beginPath(); c.arc(cxA, cyA, 62, 0, 7); c.stroke(); c.setLineDash([3, 5]); c.beginPath(); c.arc(cxA, cyA, 74, 0, 7); c.stroke(); c.setLineDash([]);
  const rn = P.rng(seed); c.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { c.globalAlpha = 0.12 + rn() * 0.4; c.fillRect(ax + rn() * aw, ay + rn() * ah, 1.6, 1.6); } c.globalAlpha = 1;
  const art = st.artOverride || await artFor(card);
  if (art) {
    const k = Math.min((aw - 14) / art.width, (ah - 14) / art.height), iw = art.width * k, ih = art.height * k;
    c.imageSmoothingEnabled = art.width > 256; c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    c.drawImage(art, ax + (aw - iw) / 2, ay + (ah - ih) / 2 + 6 + (st.artBob || 0), iw, ih); c.shadowBlur = 0; c.shadowOffsetY = 0;
  } else { c.fillStyle = 'rgba(255,255,255,0.88)'; c.font = '84px SCCinzelD, SCCinzel, serif'; c.fillText(card.name[0], CW / 2, cyA - 6); }
  const ig = c.createLinearGradient(0, ay, 0, ay + ah); ig.addColorStop(0, 'rgba(0,0,0,0.35)'); ig.addColorStop(0.25, 'rgba(0,0,0,0)'); ig.addColorStop(0.8, 'rgba(0,0,0,0)'); ig.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = ig; c.fillRect(ax, ay, aw, ah);
  c.restore();
  archPath(c, ax, ay, aw, ah, 54, 8); c.lineWidth = 5; c.strokeStyle = metalGrad(c, M, ay, ay + ah); c.stroke();
  archPath(c, ax + 3, ay + 3, aw - 6, ah - 6, 51, 6); c.lineWidth = 1; c.strokeStyle = 'rgba(20,10,2,0.8)'; c.stroke();
  for (const [rx, ry] of [[ax + 6, ay + ah - 6], [ax + aw - 6, ay + ah - 6]]) { c.beginPath(); c.arc(rx, ry, 3.2, 0, 7); c.fillStyle = metalGrad(c, M, ry - 3, ry + 3); c.fill(); }
  // 4. title ribbon
  ribbon(c, 40, 20, CW - 80, 30, 12); c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2; c.fillStyle = '#2a190b'; c.fill(); c.restore();
  ribbon(c, 40, 20, CW - 80, 30, 12); c.lineWidth = 1.6; c.strokeStyle = metalGrad(c, M, 20, 50); c.stroke();
  let f0 = 19; const nm = card.name.toUpperCase(); c.font = `${f0}px SCCinzelD, SCCinzel, serif`;
  while (c.measureText(nm).width > CW - 120 && f0 > 11) { f0--; c.font = `${f0}px SCCinzelD, SCCinzel, serif`; }
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(nm, CW / 2 + 1, 36); c.fillStyle = gold ? '#ffe9a0' : '#f4e6c4'; c.fillText(nm, CW / 2, 35);
  // cost wax seal (top-left) + cooldown shield (top-right)
  seal(c, 36, 41, 22, afford ? '#9b1d1a' : '#4a4a52', (cc) => { cc.fillStyle = '#fff3d0'; cc.font = (String(card.energyCost).length > 1 ? '18px' : '24px') + ' SCCinzelD, SCCinzel, serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.fillText(String(card.energyCost), 0, -3); cc.font = '6px SCCinzel, serif'; cc.fillText('ENERGY', 0, 11); });
  c.save(); c.translate(CW - 36, 41); c.beginPath(); c.moveTo(-17, -19); c.lineTo(17, -19); c.lineTo(17, 6); c.quadraticCurveTo(17, 17, 0, 23); c.quadraticCurveTo(-17, 17, -17, 6); c.closePath();
  c.fillStyle = '#2a190b'; c.fill(); c.lineWidth = 3; c.strokeStyle = metalGrad(c, M, -19, 23); c.stroke();
  c.fillStyle = '#f4e6c4'; c.font = '19px SCCinzelD, SCCinzel, serif'; c.fillText(String(card.cooldownTurns), 0, -3); c.font = '7px SCCinzel, serif'; c.fillStyle = '#d8b04a'; c.fillText('TURNS', 0, 12); c.restore();
  // 5. type ribbon over the art foot
  const tyY = ay + ah - 13; ribbon(c, CW / 2 - 64, tyY, 128, 26, 10); c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 5; c.shadowOffsetY = 2; const tg = c.createLinearGradient(0, tyY, 0, tyY + 26); tg.addColorStop(0, ty.a); tg.addColorStop(1, ty.b); c.fillStyle = tg; c.fill(); c.restore();
  ribbon(c, CW / 2 - 64, tyY, 128, 26, 10); c.lineWidth = 1.5; c.strokeStyle = metalGrad(c, M, tyY, tyY + 26); c.stroke();
  typeEmblem(c, card.type, CW / 2 - 44, tyY + 13, 6, '#fff3d0'); c.fillStyle = '#fff3d0'; c.font = '13px SCCinzelD, SCCinzel, serif'; c.fillText(ty.label, CW / 2 + 6, tyY + 14);
  // 6. rule box
  const ry0 = tyY + 36; c.fillStyle = ink; c.font = '16px SCCinzelD, SCCinzel, serif'; c.fillText(card.abilityName, CW / 2, ry0);
  const dv = ry0 + 14; c.strokeStyle = 'rgba(44,26,12,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(48, dv); c.lineTo(CW / 2 - 9, dv); c.moveTo(CW / 2 + 9, dv); c.lineTo(CW - 48, dv); c.stroke();
  c.save(); c.translate(CW / 2, dv); c.rotate(Math.PI / 4); c.fillStyle = M[1]; c.fillRect(-3.5, -3.5, 7, 7); c.restore();
  c.fillStyle = ink; c.font = '15px SCFell, serif'; const lines = wrap(c, card.description, CW - 74).slice(0, 4);
  lines.forEach((l, i) => c.fillText(l, CW / 2, dv + 17 + i * 17));
  const te = dv + 17 + (lines.length - 1) * 17 + 9, fy = Math.round((te + (CH - 50)) / 2 - 3);
  c.fillStyle = 'rgba(70,40,16,0.85)'; c.font = '12.5px SCFellI, SCFell, serif';
  wrap(c, '“' + (FLAVOR[card.id] || 'A bond sealed in ink and ember.') + '”', CW - 80).slice(0, 2).forEach((l, i) => c.fillText(l, CW / 2, fy + i * 14));
  // 7. footer: element sigil medallion, rarity gems, element name
  const fyy = CH - 33; c.beginPath(); c.arc(42, fyy, 14, 0, 7); c.fillStyle = '#2a190b'; c.fill(); c.lineWidth = 2; c.strokeStyle = metalGrad(c, M, fyy - 14, fyy + 14); c.stroke(); sigil(c, card.element, 42, fyy, 8, el);
  c.fillStyle = ink; c.font = '11px SCCinzel, serif'; c.textAlign = 'left'; c.fillText(card.element, 62, fyy + 1); c.textAlign = 'center';
  const pips = rar.rank + 1; for (let i = 0; i < pips; i++) { const gx = CW - 40 - (pips - 1 - i) * 15, gy = fyy; c.save(); c.translate(gx, gy); c.rotate(Math.PI / 4); c.fillStyle = metalGrad(c, M, -5, 5); c.fillRect(-5, -5, 10, 10); c.lineWidth = 1; c.strokeStyle = 'rgba(20,10,2,0.8)'; c.strokeRect(-5, -5, 10, 10); c.restore(); }
  if (gold) { // gold-leaf sheen sweep + sparkle
    c.save(); rr(c, 6, 6, CW - 12, CH - 12, 20); c.clip(); const sh = c.createLinearGradient(0, 0, CW, CH * 0.6); sh.addColorStop(0.35, 'rgba(255,236,160,0)'); sh.addColorStop(0.5, 'rgba(255,236,160,0.16)'); sh.addColorStop(0.65, 'rgba(255,236,160,0)'); c.fillStyle = sh; c.fillRect(0, 0, CW, CH); c.restore();
  }
  // 8. state overlays
  if (st.ready === false) {
    c.save(); rr(c, 6, 6, CW - 12, CH - 12, 20); c.clip(); c.fillStyle = 'rgba(14,9,4,0.74)'; c.fillRect(0, 0, CW, CH); c.restore();
    c.fillStyle = '#ffd36b'; c.font = '70px SCCinzelD, SCCinzel, serif'; c.fillText(String(st.turnsLeft || 1), CW / 2, CH / 2 - 10);
    c.font = '15px SCCinzel, serif'; c.fillText(st.turnsLeft === 1 ? 'TURN LEFT' : 'TURNS LEFT', CW / 2, CH / 2 + 38);
  } else if (!afford) { c.save(); rr(c, 6, 6, CW - 12, CH - 12, 20); c.clip(); c.fillStyle = 'rgba(14,9,4,0.34)'; c.fillRect(0, 0, CW, CH); c.restore(); }
  if (st.index != null) { // play-by-number badge: wax disc
    seal(c, CW / 2, CH + 14, 18, st.ready === false ? '#59606f' : '#b08a1c', (cc) => { cc.fillStyle = '#1b120a'; cc.font = '20px SCCinzelD, SCCinzel, serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.fillText(String(st.index), 0, 0); });
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

/** 🎞️ `.j summons <n>` showcase: the card with its summon doing its IDLE animation inside the art window (looping MP4 for gifPlayback).
 *  Cards with no idle gif get a gentle float. Returns an mp4 Buffer or null. */
async function renderCardIdleVideo(card, st = {}, scale = 1.5) {
  const { createCanvas } = cv(); const idle = await require('./summonIdle').getIdle(card).catch(() => null);
  const os = require('os'), fsx = require('fs'), pathx = require('path'), { spawn } = require('child_process');
  const s = Math.max(1, Math.min(2, scale)), Wc = Math.round(CW * s / 2) * 2, Hc = Math.round((CH + 40) * s / 2) * 2, FPS = 12, N = 36;
  const dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'cidle-'));
  try {
    const cvs = createCanvas(Wc, Hc), c = cvs.getContext('2d');
    for (let f = 0; f < N; f++) {
      c.clearRect(0, 0, Wc, Hc); c.fillStyle = '#12100c'; c.fillRect(0, 0, Wc, Hc); c.save(); c.scale(s, s);
      const sec = f / FPS;
      await drawCard(c, card, 0, 0, { ...st, artOverride: idle ? require('./summonIdle').frameAt(idle, sec) : null, artBob: idle ? 0 : Math.round(Math.sin(f / N * Math.PI * 2) * 3) });
      c.restore(); fsx.writeFileSync(pathx.join(dir, `f${String(f).padStart(3, '0')}.png`), cvs.toBuffer('image/png'));
    }
    const out = pathx.join(dir, 'o.mp4');
    await new Promise((res, rej) => { const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-stream_loop', '2', '-i', pathx.join(dir, 'f%03d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]); p.on('error', rej); p.on('close', (k) => (k === 0 ? res() : rej(new Error('ffmpeg ' + k)))); });
    return fsx.readFileSync(out);
  } catch (e) { console.warn('[SummonCards] idle video failed:', e.message); return null; }
  finally { try { fsx.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
}

module.exports = { renderCardIdleVideo, renderCardPng, renderCardPngScaled, renderHandPng, drawCard, artFor, paintSummonBackdrop, CW, CH };
