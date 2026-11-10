'use strict';
// 🃏 PASSIVE (RELIC) CARD VISUALS — an independent card category: dark engraved "relic" face (NOT the summon parchment),
// rarity-coloured metal frame, family-coloured art window whose picture is the card's own trigger effect frozen mid-burst
// (same painters as the trigger animation => collection art and activation FX are one visual identity).
const { createCanvas } = require('canvas');
const { PASSIVE_CATALOG, RARITY, SYNERGIES } = require('./catalog');
const { paintFx, FX } = require('./fxScene');
const FAM = { DEFENSE: '#4aa3ff', OFFENSE: '#ef5350', TACTICAL: '#4cc96b' };
const FAM_NAME = { DEFENSE: 'DEFENSE', OFFENSE: 'OFFENSE', TACTICAL: 'TACTICAL' };
const RARC = { COMMON: ['#d7dbe3', '#7d8594'], RARE: ['#8cc8ff', '#2d6fb8'], EPIC: ['#d9a8ff', '#7a3fc4'], LEGENDARY: ['#fff0a8', '#c8901c'] };
const CW = 200, CH = 284;
// game-icons.net icons (CC BY 3.0 — see core/rpgasset/passive_icons/CREDITS.md). White glyphs, tinted per use. Cached; null => glyph fallback.
const path = require('path'); const { loadImage } = require('canvas');
const ICON_DIR = path.join(__dirname, '..', '..', '..', 'rpgasset', 'passive_icons'); const _icons = new Map();
async function loadIcon(id) { if (_icons.has(id)) return _icons.get(id); let img = null; try { img = await loadImage(path.join(ICON_DIR, id + '.svg')); } catch (e) { img = null; } _icons.set(id, img); return img; }
function iconSync(id) { return _icons.get(id) || null; }
/** draw the white icon tinted with `col` (solid) centred at cx,cy size px, with a soft glow */
function drawIcon(c, img, cx, cy, size, col, glowCol) {
  if (!img) return false; const t = createCanvas(256, 256), tc = t.getContext('2d'); tc.drawImage(img, 0, 0, 256, 256); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = col; tc.fillRect(0, 0, 256, 256);
  c.save(); if (glowCol) { c.shadowColor = glowCol; c.shadowBlur = size * 0.22; } c.drawImage(t, cx - size / 2, cy - size / 2, size, size); c.restore(); return true;
}
const TRIG = { incoming_hit: 'WHEN HIT', lethal_hit: 'ON LETHAL HIT', low_hp: 'AT LOW HP', outgoing_hit: 'ON ATTACK', crit: 'ON CRIT', miss: 'ON MISS', kill: 'ON KILL', combo: 'ON COMBO', first_ability: 'FIRST ABILITY', always: 'ALWAYS ON' };
const trigText = (c) => (c.trigger === 'turn_counter' && c.v && c.v.every ? `EVERY ${c.v.every} TURNS` : (TRIG[c.trigger] || 'PASSIVE'));
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
function wrap(c, text, maxW) { const words = String(text).split(/\s+/), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
function glyph(c, fam, cx, cy, r, col) {
  c.save(); c.translate(cx, cy); c.fillStyle = col; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(1, r * 0.12); c.beginPath();
  if (fam === 'DEFENSE') { c.moveTo(0, -r); c.lineTo(r * 0.85, -r * 0.55); c.lineTo(r * 0.7, r * 0.3); c.quadraticCurveTo(0, r * 1.15, 0, r * 1.1); c.quadraticCurveTo(0, r * 1.15, -r * 0.7, r * 0.3); c.lineTo(-r * 0.85, -r * 0.55); }
  else if (fam === 'OFFENSE') { c.moveTo(0, -r * 1.1); c.lineTo(r * 0.45, r * 0.1); c.lineTo(r * 0.14, r * 0.1); c.lineTo(r * 0.14, r * 0.9); c.lineTo(-r * 0.14, r * 0.9); c.lineTo(-r * 0.14, r * 0.1); c.lineTo(-r * 0.45, r * 0.1); }
  else for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath(); c.fill(); c.stroke(); c.restore();
}
/** state: 'owned' | 'active' | 'unowned'.  o: { slot (1-based when active), num (collection number) } */
function drawPassiveCard(c, card, x, y, w, h, state = 'owned', o = {}) {
  const k = w / CW; const fam = FAM[card.family] || '#ccc', [rc0, rc1] = RARC[card.rarity] || RARC.COMMON;
  c.save(); c.translate(x, y); c.scale(k, k);
  if (state === 'active') { c.shadowColor = fam; c.shadowBlur = 26; }
  rr(c, 0, 0, CW, CH, 14); const fg = c.createLinearGradient(0, 0, CW, CH); fg.addColorStop(0, rc0); fg.addColorStop(0.5, rc1); fg.addColorStop(1, rc0); c.fillStyle = fg; c.fill(); c.shadowBlur = 0;   // metal frame
  rr(c, 5, 5, CW - 10, CH - 10, 10); const bg = c.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#171c28'); bg.addColorStop(1, '#0a0d14'); c.fillStyle = bg; c.fill();
  // name plate
  rr(c, 12, 12, CW - 24, 30, 7); const np = c.createLinearGradient(0, 12, 0, 42); np.addColorStop(0, 'rgba(255,255,255,0.12)'); np.addColorStop(1, 'rgba(255,255,255,0.03)'); c.fillStyle = np; c.fill(); c.lineWidth = 1.5; c.strokeStyle = rc1; c.stroke();
  c.fillStyle = '#f6ead0'; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs = 15; c.font = `bold ${fs}px HudCinzel, serif`; while (c.measureText(card.name.toUpperCase()).width > CW - 70 && fs > 9) { fs--; c.font = `bold ${fs}px HudCinzel, serif`; } c.fillText(card.name.toUpperCase(), CW / 2 + 8, 28);
  c.beginPath(); c.arc(28, 27, 12, 0, 7); c.fillStyle = '#0b0e15'; c.fill(); c.lineWidth = 2; c.strokeStyle = fam; c.stroke(); glyph(c, card.family, 28, 27, 7, fam);
  // art window
  const ax = 12, ay = 50, aw = CW - 24, ah = 112;
  c.save(); rr(c, ax, ay, aw, ah, 8); c.clip();
  const ag = c.createRadialGradient(ax + aw / 2, ay + ah * 0.55, 6, ax + aw / 2, ay + ah * 0.55, aw * 0.75); ag.addColorStop(0, fam + 'aa'); ag.addColorStop(0.55, fam + '33'); ag.addColorStop(1, '#06080d'); c.fillStyle = ag; c.fillRect(ax, ay, aw, ah);
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1; for (let i = -ah; i < aw; i += 14) { c.beginPath(); c.moveTo(ax + i, ay + ah); c.lineTo(ax + i + ah, ay); c.stroke(); }   // engraved hatch
  { const ic = iconSync(card.id); if (ic) { drawIcon(c, ic, ax + aw / 2, ay + ah / 2 + 2, ah * 0.86, '#ffffff', fam); } }
  try { const fx = FX[card.id]; if (fx) { const R = (() => { let s = card.id.length * 977 + 13; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })(); c.globalAlpha = iconSync(card.id) ? 0.55 : 1; paintFx(c, fx[0], fx[1], 0.42, { x: ax + aw * 0.42, y: ay + ah * 0.55 }, { x: ax + aw * 0.78, y: ay + ah * 0.5 }, (['shell', 'dome', 'rings', 'swirl'].includes(fx[0]) ? 0.46 : 0.62), R, 0); c.globalAlpha = 1; } } catch (e) { /* art optional */ }
  c.restore(); rr(c, ax, ay, aw, ah, 8); c.lineWidth = 2; c.strokeStyle = rc1; c.stroke();
  // trigger chip straddling the art edge
  c.font = 'bold 9.5px HudCinzel, serif'; const tt = trigText(card), tw = c.measureText(tt).width + 18; rr(c, CW / 2 - tw / 2, ay + ah - 9, tw, 18, 9); c.fillStyle = '#0b0e15'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = fam; c.stroke(); c.fillStyle = '#ffe9a8'; c.fillText(tt, CW / 2, ay + ah + 0.5);
  // description
  c.fillStyle = '#d9d2c0'; c.font = '11.5px HudCinzel, serif'; c.textAlign = 'center';
  const lines = wrap(c, card.desc, CW - 34).slice(0, 5); lines.forEach((ln, i) => c.fillText(ln, CW / 2, ay + ah + 28 + i * 14.5));
  // footer: family + rarity gem
  c.fillStyle = fam; c.font = 'bold 9.5px HudCinzel, serif'; c.textAlign = 'left'; c.fillText(FAM_NAME[card.family] || '', 16, CH - 17);
  c.textAlign = 'right'; c.fillStyle = rc0; c.fillText(card.rarity, CW - 30, CH - 17);
  c.save(); c.translate(CW - 20, CH - 17); c.rotate(Math.PI / 4); c.fillStyle = rc0; c.fillRect(-4.5, -4.5, 9, 9); c.lineWidth = 1; c.strokeStyle = '#000'; c.strokeRect(-4.5, -4.5, 9, 9); c.restore();
  if (o.num) { c.beginPath(); c.arc(CW - 20, 27, 0.01, 0, 1); c.fillStyle = 'rgba(0,0,0,0)'; c.fill(); c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#9aa3b5'; c.fillText('#' + o.num, 28, CH - 36); }
  if (state === 'active') {
    rr(c, CW / 2 - 52, CH - 4, 104, 22, 11); c.fillStyle = fam; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 12px HudCinzel, serif'; c.fillText('EQUIPPED' + (o.slot ? ' · ' + o.slot : ''), CW / 2, CH + 7.5);
  }
  if (state === 'unowned') {
    rr(c, 0, 0, CW, CH, 14); c.fillStyle = 'rgba(5,7,11,0.72)'; c.fill();
    c.fillStyle = '#e6dcc4'; c.font = 'bold 15px HudCinzel, serif'; c.textAlign = 'center'; c.fillText('NOT OWNED', CW / 2, 106);
    c.lineWidth = 3; c.strokeStyle = '#e6dcc4'; rr(c, CW / 2 - 12, 118, 24, 18, 3); c.stroke(); c.beginPath(); c.arc(CW / 2, 116, 8, Math.PI, 0); c.stroke();
  }
  c.restore();
}
async function preloadIcons() { await Promise.all(Object.keys(PASSIVE_CATALOG).map(loadIcon)); }
/** Whole-collection sheet for `.j passive`. info = { owned:[card], loadout:[id], slots, maxSlots, rankForSlot(n), rank, synergies:[{text}] , name } */
async function renderCollection(info) {
  try { await require('../combat/combatHud').preload(); } catch (e) {}
  await preloadIcons();
  const all = Object.values(PASSIVE_CATALOG).filter((p) => !p.silent || true);
  const ownedIds = new Set(info.owned.map((p) => p.id)); const unowned = all.filter((p) => !ownedIds.has(p.id));
  const cols = 5, cw = CW, ch = CH, gap = 16, pad = 28, W = pad * 2 + cols * cw + (cols - 1) * gap;
  const list = info.owned.map((p, i) => ({ p, n: i + 1, st: info.loadout.includes(p.id) ? 'active' : 'owned' })).concat(unowned.map((p) => ({ p, n: 0, st: 'unowned' })));
  const rows = Math.ceil(list.length / cols), slotH = 150, headH = 84 + slotH + 84;
  const H = headH + rows * (ch + gap + 14) + pad;
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#10141f'); bg.addColorStop(1, '#07090e'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(214,174,78,0.35)'; c.lineWidth = 2; rr(c, 8, 8, W - 16, H - 16, 14); c.stroke();
  c.fillStyle = '#f3e6c4'; c.font = 'bold 34px HudCinzel, serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('PASSIVE CARDS', pad, 46);
  c.font = '15px HudCinzel, serif'; c.fillStyle = '#9aa3b5'; c.textAlign = 'right'; c.fillText(`${info.name ? info.name + ' · ' : ''}RANK ${info.rank} · ${info.owned.length}/${all.length} COLLECTED · ${info.loadout.length}/${info.slots} EQUIPPED`, W - pad, 46);
  // loadout row: 5 slots — filled / empty / locked(by rank)
  const sy = 84, sw = 110, sh = 154, sgap = (W - pad * 2 - 5 * sw) / 4;
  for (let i = 0; i < info.maxSlots; i++) {
    const sx = pad + i * (sw + sgap), id = info.loadout[i], unlocked = i < info.slots;
    if (id) { drawPassiveCard(c, PASSIVE_CATALOG[id], sx, sy - 4, sw, sh, 'active', { slot: i + 1 }); continue; }
    rr(c, sx, sy, sw, sh - 24, 10); c.fillStyle = unlocked ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.45)'; c.fill(); c.setLineDash(unlocked ? [8, 6] : []); c.lineWidth = 2; c.strokeStyle = unlocked ? 'rgba(214,174,78,0.6)' : 'rgba(120,120,130,0.4)'; c.stroke(); c.setLineDash([]);
    c.textAlign = 'center'; c.fillStyle = unlocked ? '#e7c766' : '#7c8190'; c.font = 'bold 16px HudCinzel, serif'; c.fillText(`SLOT ${i + 1}`, sx + sw / 2, sy + 40);
    c.font = '12px HudCinzel, serif'; c.fillText(unlocked ? 'EMPTY' : 'LOCKED', sx + sw / 2, sy + 62);
    if (!unlocked) { c.fillStyle = '#9aa3b5'; c.fillText('RANK ' + info.rankForSlot(i + 1), sx + sw / 2, sy + 82); c.lineWidth = 2.4; c.strokeStyle = '#7c8190'; rr(c, sx + sw / 2 - 9, sy + 100, 18, 13, 3); c.stroke(); c.beginPath(); c.arc(sx + sw / 2, sy + 100, 6, Math.PI, 0); c.stroke(); }
  }
  if (info.synergies && info.synergies.length) { c.textAlign = 'left'; c.fillStyle = '#ffe9a8'; c.font = '14px HudCinzel, serif'; c.fillText('✦ SYNERGY: ' + info.synergies.map((s) => s.text).join('  ✦  ').slice(0, 150), pad, sy + sh + 24); }
  c.textAlign = 'left'; c.fillStyle = '#c9a13b'; c.font = 'bold 17px HudCinzel, serif'; c.fillText('COLLECTION', pad, headH - 14);
  list.forEach((e, i) => { const x = pad + (i % cols) * (cw + gap), y = headH + Math.floor(i / cols) * (ch + gap + 14); drawPassiveCard(c, e.p, x, y, cw, ch, e.st, { num: e.n || 0, slot: info.loadout.indexOf(e.p.id) + 1 }); });
  return cv.toBuffer('image/jpeg', { quality: 0.9 });
}
module.exports = { loadIcon, iconSync, drawIcon, preloadIcons, drawPassiveCard, renderCollection, CW, CH, trigText };
