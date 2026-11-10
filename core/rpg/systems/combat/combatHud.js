'use strict';
// ⚔️ COMBAT HUD v6 (owner 2026-11-07 round 2: "the board holding the cards looks like actually shit,
// the rank indicator also looks like shit, and the old hp bars show alongside the new plate - remove it").
// - Rank chip: cut-corner dark metal plaque + gold bevel + engraved rank letter in its rank colour.
//   No "RANK" word — real-game chips (Genshin / Hades / Balatro) show just the emblem.
// - Tray board: low GLASS SHELF — translucent panel fading downward into the scene, hairline gold
//   lip with a soft glow and twin diamond studs (echoes the plate medallion), soft ground shadow.
//   The old mustard rail asset is gone. Card fan geometry unchanged (owner liked the arrangement).
// - Overhead unit bars are deliberately NOT drawn here anymore (Go renderer skips them too via
//   hud:"none-clean") — the plate is the single HP/MP display on the card.
// Deck-builder conventions kept (Slay the Spire / Balatro / Hearthstone studies): no label text on
// the board, shallow fanned hand, newest/active card RAISED + SCALED + GLOWING over the rest.
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
  // monochrome emoji font for status badges (Noto Emoji exists on box1+box2) — glyphs take
  // the current fillStyle colour, so badges stay in the HUD's palette. Without it we fall
  // back to engraved letters.
  try { const ep = '/usr/share/fonts/truetype/noto/NotoEmoji-Regular.ttf'; if (fs.existsSync(ep)) { registerFont(ep, { family: 'NotoEmoji' }); _emojiOk = true; } } catch (e) {}
}
let _emojiOk = false;
async function ui(name) {
  if (_img.has(name)) return _img.get(name);
  let i = null; try { i = await loadImage(path.join(UI, name)); } catch (e) {}
  _img.set(name, i); return i;
}
function uiSync(name) { return _img.get(name) || null; }
async function preload() {
  init();
  await Promise.all(['UI_Flat_Banner02a.png', 'heart.png', 'mana.png', 'hud_plate_ring.png', 'hud_card_frame.png'].map(ui));
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shadowText(c, t, x, y, color, align = 'left') { c.textAlign = align; c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(t, x + 1.5, y + 1.5); c.fillStyle = color; c.fillText(t, x, y); }
function fit(c, t, maxW, px, fam, weight = 'bold') { let s = px; while (s > 9) { c.font = `${weight} ${s}px ${fam}`; if (c.measureText(t).width <= maxW) break; s--; } }
function hexA(hex, a) { const v = parseInt(String(hex || '#000').replace('#', ''), 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; }
function goldGrad(c, x0, x1) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(214,174,78,0.10)'); g.addColorStop(0.14, 'rgba(230,196,110,0.95)'); g.addColorStop(0.5, 'rgba(255,226,150,1)'); g.addColorStop(0.86, 'rgba(230,196,110,0.95)'); g.addColorStop(1, 'rgba(214,174,78,0.10)'); return g; }

const RANK_COLOR = { F: '#6b6b6b', E: '#5b8a2e', D: '#1f7f9e', C: '#2f55c4', B: '#7a35c4', A: '#c0392b', S: '#c98a00', SS: '#d4a017', SSS: '#e0562b' };

/** Top-left rank chip (v6): cut-corner dark metal plaque, gold bevel frame + inner hairline,
 * engraved rank letter in its rank colour over a faint colour core, twin gold studs on the
 * diagonal cuts. No "RANK" word. Non-rank text ("FLOOR 12", "PVP MATCH") renders fitted on
 * the same chip. text e.g. "S RANK" | "FLOOR 12" | "PVP MATCH" */
function drawRankBanner(c, text, s = 1) {
  init();
  const m = /^([A-Z]{1,3}) RANK$/.exec(String(text || '').toUpperCase());
  const rank = m ? m[1] : null;
  const label = rank || String(text || '').trim();
  const W = (rank ? 92 : Math.max(112, 34 + label.length * 15)) * s;
  const H = 52 * s, x = 14 * s, y = 12 * s, cut = 12 * s;
  const cx = x + W / 2, cy = y + H / 2 + 1;
  const plq = () => { c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + W - cut, y); c.lineTo(x + W, y + cut); c.lineTo(x + W, y + H - cut); c.lineTo(x + W - cut, y + H); c.lineTo(x + cut, y + H); c.lineTo(x, y + H - cut); c.lineTo(x, y + cut); c.closePath(); };
  // body: dark metal with a vertical brushed gradient
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 9 * s; c.shadowOffsetY = 3 * s;
  plq();
  const bg = c.createLinearGradient(0, y, 0, y + H);
  bg.addColorStop(0, '#27324b'); bg.addColorStop(0.45, '#161e30'); bg.addColorStop(1, '#0a0e18');
  c.fillStyle = bg; c.fill(); c.restore();
  // faint rank-colour core glow behind the letter
  if (rank) {
    c.save(); plq(); c.clip();
    const cg = c.createRadialGradient(cx, cy, 2, cx, cy, W * 0.62);
    cg.addColorStop(0, hexA(RANK_COLOR[rank] || '#c98a00', 0.30)); cg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = cg; c.fillRect(x, y, W, H); c.restore();
  }
  // engraved hairline highlight along the top inside the frame
  c.save(); plq(); c.clip();
  const tg = c.createLinearGradient(0, y, 0, y + H * 0.55);
  tg.addColorStop(0, 'rgba(255,255,255,0.14)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = tg; c.fillRect(x, y, W, H * 0.55); c.restore();
  // gold bevel frame + inner hairline
  plq(); c.lineWidth = 2 * s; c.strokeStyle = '#d6ae4e'; c.stroke();
  plq2(c, x + 3.5 * s, y + 3.5 * s, W - 7 * s, H - 7 * s, Math.max(2, cut - 3.5 * s));
  c.lineWidth = 0.8 * s; c.strokeStyle = 'rgba(255,226,140,0.42)'; c.stroke();
  // twin gold studs on the diagonal cuts
  for (const [sx2, sy2] of [[x + W - cut * 0.55, y + cut * 0.55], [x + cut * 0.55, y + H - cut * 0.55]]) {
    c.save(); c.translate(sx2, sy2); c.rotate(Math.PI / 4);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 3 * s;
    c.fillStyle = '#e7c766'; const r2 = 2.6 * s; c.fillRect(-r2, -r2, r2 * 2, r2 * 2); c.restore();
  }
  // text: engraved letter (dark offset under, colour over, faint top light)
  c.textBaseline = 'middle'; c.textAlign = 'center';
  if (rank) {
    const col = RANK_COLOR[rank] || '#c98a00';
    fit(c, rank, W - 22 * s, 37 * s, 'HudCinzel, serif');
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(rank, cx + 1.5 * s, cy + 2 * s);
    c.fillStyle = col; c.fillText(rank, cx, cy);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillText(rank, cx, cy - 1.4 * s);
  } else {
    fit(c, label, W - 24 * s, 16 * s, 'HudPixel, monospace');
    c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(label, cx + 1.2 * s, cy + 1.5 * s);
    c.fillStyle = '#f3ecd8'; c.fillText(label, cx, cy);
  }
}
function plq2(c, x, y, w, h, cut) { c.beginPath(); c.moveTo(x + cut, y); c.lineTo(x + w - cut, y); c.lineTo(x + w, y + cut); c.lineTo(x + w, y + h - cut); c.lineTo(x + w - cut, y + h); c.lineTo(x + cut, y + h); c.lineTo(x, y + h - cut); c.lineTo(x, y + cut); c.closePath(); }

/** Parchment banner hung behind the hub plate (owner 2026-11-07: "a nicely designed banner behind it ... the old-RPG rough-paper
 * feel"). Torn-edge aged paper with a swallowtail on the far end, stitched inset, ink rules and a wax seal. Rect is canvas px. */
function drawHubBanner(c, x, y, w, h, s, o = {}) {
  const { makePaper, tornPath, stitch, waxSeal } = require('../shared/parchment');
  const flip = !!o.flip, accent = o.accent || '#a3201c', tail = 20 * s;
  const paper = makePaper(w, h, { seed: o.seed || 11, tone: 'warm', burn: 0.7, stains: 1 });
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 14 * s; c.shadowOffsetY = 5 * s;
  tornPath(c, x, y, w, h, { amp: 2.4 * s, step: 8 * s, seed: o.seed || 11, notch: flip ? 0 : tail, notchLeft: flip ? tail : 0 }); c.fillStyle = '#b89a62'; c.fill(); c.restore();
  c.save(); tornPath(c, x, y, w, h, { amp: 2.4 * s, step: 8 * s, seed: o.seed || 11, notch: flip ? 0 : tail, notchLeft: flip ? tail : 0 }); c.clip(); c.drawImage(paper, x, y);
  // soft top light + bottom shade for thickness
  const lg = c.createLinearGradient(0, y, 0, y + h); lg.addColorStop(0, 'rgba(255,248,225,0.28)'); lg.addColorStop(0.25, 'rgba(255,248,225,0)'); lg.addColorStop(0.8, 'rgba(60,34,14,0)'); lg.addColorStop(1, 'rgba(60,34,14,0.3)'); c.fillStyle = lg; c.fillRect(x, y, w, h);
  c.restore();
  tornPath(c, x, y, w, h, { amp: 2.4 * s, step: 8 * s, seed: o.seed || 11, notch: flip ? 0 : tail, notchLeft: flip ? tail : 0 }); c.lineWidth = 1.5 * s; c.strokeStyle = 'rgba(54,30,12,0.75)'; c.stroke();
  // ink rules + stitch
  const ix = x + (flip ? tail + 6 * s : 8 * s), iw = w - (tail + 14 * s);
  stitch(c, ix, y + 7 * s, iw, h - 14 * s, 4 * s, 'rgba(60,34,14,0.55)', 1.1 * s, [4 * s, 3.5 * s]);
  // diamond fleurons in the stitched corners
  for (const fx of [ix + 8 * s, ix + iw - 8 * s]) for (const fy of [y + 12 * s, y + h - 12 * s]) { c.save(); c.translate(fx, fy); c.rotate(Math.PI / 4); c.fillStyle = 'rgba(40,22,8,0.7)'; c.fillRect(-2.2 * s, -2.2 * s, 4.4 * s, 4.4 * s); c.restore(); }
  // wax seal at the tail
  const sx = flip ? x + tail + 8 * s : x + w - tail - 8 * s;
  waxSeal(c, sx, y + h - 11 * s, 9 * s, accent, (cc, cx, cy, r) => { cc.fillStyle = 'rgba(255,230,190,0.85)'; cc.font = `bold ${r * 1.15}px HudCinzel, serif`; cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.fillText('J', cx, cy + r * 0.06); });
}

/** Compact player plate. Portrait medallion + capsule HP / mana on a parchment banner.
 * hud = {name, hp, maxHp, energy, maxEnergy, level, portrait:Image|Canvas|null, color}
 * opts.flip = mirrored layout for the TOP-RIGHT (PvP opponent): portrait on the right, bars grow right-to-left. opts.banner=false drops the paper. */
function drawPlayerHud(c, hud, s = 1, ox = 18, oy = DH - 104, opts = {}) {
  init();
  const flip = !!opts.flip, banner = opts.banner !== false, PW = 330;
  const ring = uiSync('hud_plate_ring.png');
  const X0 = (flip ? DW - ox - PW : ox) * s, Y = oy * s, R = 38 * s;
  const L = (d, w = 0) => (flip ? X0 + (PW - d - w) * s : X0 + d * s);   // local left edge -> canvas x
  const pcx = flip ? X0 + (PW - 60) * s : X0 + 60 * s, pcy = Y + 49 * s;
  if (banner) drawHubBanner(c, L(46, 284), Y + 7 * s, 284 * s, 84 * s, s, { flip, accent: hud.color && hud.color !== '#d8b04a' ? hud.color : '#a3201c', seed: opts.seed || 11 });
  // portrait socket
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 8 * s; c.shadowOffsetY = 3 * s;
  c.beginPath(); c.arc(pcx, pcy, R, 0, Math.PI * 2); c.fillStyle = '#120c06'; c.fill(); c.restore();
  c.save(); c.beginPath(); c.arc(pcx, pcy, R - 3 * s, 0, Math.PI * 2); c.clip();
  const pg = c.createRadialGradient(pcx, pcy - R * 0.3, 4, pcx, pcy, R); pg.addColorStop(0, '#3b4a66'); pg.addColorStop(1, '#161c2a'); c.fillStyle = pg; c.fillRect(pcx - R, pcy - R, R * 2, R * 2);
  if (hud.portrait) {
    const p = hud.portrait, pw = p.width, ph = p.height, sh = Math.min(ph, pw * 1.1);   // head+shoulders: top slice of the sprite
    const k = (R * 2.05) / Math.max(pw, sh);
    // 🔧 round 10 (owner: "the hub portrait faces right while the opponent faces left"): the
    // PvP P2 portrait comes from the duelist's own FIELD cutout — Go already drew that sprite
    // facing the field (left). Mirroring it here made the medallion contradict the arena. The
    // mirror is now opt-in via opts.mirrorPortrait for sources that natively face right.
    try { c.imageSmoothingEnabled = pw > 200; c.save(); if (flip && opts.mirrorPortrait) { c.translate(pcx * 2, 0); c.scale(-1, 1); } c.drawImage(p, 0, 0, pw, sh, pcx - (pw * k) / 2, pcy - R + 3 * s, pw * k, sh * k); c.restore(); } catch (e) {}
  } else { c.fillStyle = '#f3ecd8'; c.font = `bold ${34 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(hud.name || '?')[0].toUpperCase(), pcx, pcy); }
  c.restore();
  // ornate engraved medallion ring (asset; socket ratio 86/110 -> A = R*2.56)
  if (ring) { const A = R * 2.56; c.drawImage(ring, pcx - A / 2, pcy - A / 2, A, A); }
  else {
    const ringCol = hud.color || '#d8b04a';
    c.beginPath(); c.arc(pcx, pcy, R - 2 * s, 0, Math.PI * 2); c.lineWidth = 4 * s; c.strokeStyle = ringCol; c.stroke();
    c.beginPath(); c.arc(pcx, pcy, R + 1 * s, 0, Math.PI * 2); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(8,5,2,0.95)'; c.stroke();
  }
  if (hud.level) { // diamond level pip (always on the outer-bottom corner of the medallion)
    const lx = pcx + (flip ? -1 : 1) * R * 0.80, ly = pcy + R * 0.80, r = 14 * s;
    c.save(); c.translate(lx, ly); c.rotate(Math.PI / 4);
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 5 * s; c.shadowOffsetY = 2 * s;
    rr(c, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44, 3 * s); c.fillStyle = '#1b1208'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = 2.2 * s; c.strokeStyle = hud.color || '#d8b04a'; c.stroke();
    c.restore();
    c.fillStyle = '#f3ecd8'; c.font = `bold ${11 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(hud.level), lx, ly + 1);
  }
  // name: dark ink on the paper (floating cream text when the banner is off)
  // 🔧 OWNER FIX 2026-11-07 ("the player username on the new hub looks slightly off"):
  // the name row sat at Y+14 — its glyph tops were eaten by the banner's torn top edge and
  // it rode the dashed stitch line, while the HP/energy block left ~26s px of dead parchment
  // at the bottom. Drop the whole text block so the name clears the tear + stitch and the
  // block centers against the medallion (portrait stays at Y+49).
  const hpW = 184, enW = 144, bxL = 116;                  // local left edge of the bars
  const hpX = L(bxL, hpW), enX = L(bxL, enW) + (flip ? (hpW - enW) * s : 0) * 0;
  c.textBaseline = 'middle'; fit(c, String(hud.name || 'Champion'), 168 * s, 20 * s, 'HudCinzel, serif');
  const nameX = flip ? hpX + hpW * s : hpX, nameAlign = flip ? 'right' : 'left', nm = String(hud.name || 'Champion');
  if (banner) { c.textAlign = nameAlign; c.fillStyle = 'rgba(255,246,220,0.75)'; c.fillText(nm, nameX + 0.9 * s, Y + 21.9 * s); c.fillStyle = '#2c1a0c'; c.fillText(nm, nameX, Y + 21 * s); }
  else shadowText(c, nm, nameX, Y + 21 * s, '#f6efdc', nameAlign);
  // HP capsule
  const hpH = 19 * s, hy = Y + 33 * s;
  capsule(c, hpX, hy, hpW * s, hpH, hud.maxHp > 0 ? hud.hp / hud.maxHp : 0, 'hp', `${Math.max(0, Math.floor(hud.hp || 0))}/${Math.max(1, Math.floor(hud.maxHp || 1))}`, s, flip);
  heartIcon(c, flip ? hpX + hpW * s + 1 * s : hpX - 1 * s, hy + hpH / 2, 13 * s);
  // mana capsule (slimmer + shorter), hugging the portrait side
  const enH = 13 * s, ey = hy + hpH + 6 * s, enXr = flip ? hpX + (hpW - enW) * s : hpX;   // Y+58..Y+71 — bottom margin ~20s px, balanced against the top
  capsule(c, enXr, ey, enW * s, enH, hud.maxEnergy > 0 ? hud.energy / hud.maxEnergy : 0, 'en', `${Math.max(0, Math.floor(hud.energy || 0))}/${Math.max(1, Math.floor(hud.maxEnergy || 1))}`, s, flip);
  dropIcon(c, flip ? enXr + enW * s + 1 * s : enXr - 1 * s, ey + enH / 2, 10 * s);
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
function capsule(c, x, y, w, h, pct, kind, label, s, rtl) {
  pct = Math.max(0, Math.min(1, pct)); const r = h / 2;
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 5 * s; c.shadowOffsetY = 2 * s;
  rr(c, x, y, w, h, r); c.fillStyle = 'rgba(14,9,5,0.92)'; c.fill(); c.restore();
  if (pct > 0) {
    const fw = Math.max(h, w * pct), g = c.createLinearGradient(0, y, 0, y + h);
    if (kind === 'hp') { if (pct < 0.25) { g.addColorStop(0, '#ff5a45'); g.addColorStop(1, '#8f1a10'); } else { g.addColorStop(0, '#f0623a'); g.addColorStop(0.55, '#c8321c'); g.addColorStop(1, '#7a170c'); } }
    else { g.addColorStop(0, '#6fb2ff'); g.addColorStop(0.55, '#3a73d1'); g.addColorStop(1, '#1b3a82'); }
    c.save(); rr(c, x + 1.5 * s, y + 1.5 * s, w - 3 * s, h - 3 * s, r); c.clip(); rr(c, rtl ? x + w - fw : x, y, fw, h, r); c.fillStyle = g; c.fill();
    const gl = c.createLinearGradient(0, y, 0, y + h * 0.55); gl.addColorStop(0, 'rgba(255,255,255,0.32)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(rtl ? x + w - fw : x, y, fw, h * 0.55); c.restore();
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

/** Slim overhead HP bar + name for a battlefield unit. v6.1: BACK on the battle card (owner:
 * "keep the one where the players is green and the enemies is red"). Green capsule on the player
 * roster, red on enemies, crimson on bosses. u.yOff lifts the bar above a status-badge row. */
function drawUnitBar(c, a, u, s = 1) {
  const w = Math.max(70, Math.min(120, (a.w || 90) * 0.9)) * s, h = (u.isBoss ? 11 : 8) * s, x = a.x * s - w / 2, y = (a.feetY - (a.h || 120)) * s - 16 * s - (Number(u.yOff) || 0) * s;
  capsuleThin(c, x, y, w, h, u.maxHp > 0 ? u.hp / u.maxHp : 0, u.isBoss ? '#c0392b' : (u.friendly ? '#3fae5a' : '#d2552e'), s);
  // 💀 fresh-wound segment (round 2 "Fix it": the reference clip's dead giveaway was "neither HP bar
  // visibly moves") — paint the chunk the current turn just carved out of THIS bar as a hatched hot
  // segment over [hp, hp+justLost], so a single glance shows the bar dropping. justLost = 0 → nothing.
  const lost = Math.max(0, Math.floor(Number(u.justLost) || 0));
  if (lost > 0 && u.maxHp > 0) {
    const pctNow = Math.max(0, Math.min(1, u.hp / u.maxHp)), pctOld = Math.max(0, Math.min(1, (u.hp + lost) / u.maxHp));
    const x1 = x + w * pctNow, x2 = x + w * pctOld;
    if (x2 - x1 > 1.5 * s) {
      c.save(); rr(c, x, y, w, h, h / 2); c.clip();
      c.fillStyle = 'rgba(255,120,60,0.85)'; c.fillRect(x1, y, x2 - x1, h);
      c.strokeStyle = 'rgba(255,224,170,0.9)'; c.lineWidth = 1 * s;
      for (let hx = x1; hx < x2; hx += 3.2 * s) { c.beginPath(); c.moveTo(hx, y + h); c.lineTo(hx + h * 0.7, y); c.stroke(); }
      c.restore();
    }
  }
  if (u.hitFlash) {  // 🌊 AoE victim rim pulse — "this bar was hit this turn"
    rr(c, x - 1.6 * s, y - 1.6 * s, w + 3.2 * s, h + 3.2 * s, (h + 3.2 * s) / 2);
    c.save(); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.shadowColor = 'rgba(255,255,255,0.8)'; c.shadowBlur = 6 * s; c.stroke(); c.restore();
  }
  if (u.noName !== true) { c.font = `bold ${12 * s}px sans-serif`; c.textBaseline = 'bottom'; shadowText(c, String(u.name || ''), a.x * s, y - 2 * s, '#fbf4e2', 'center'); }  // round 2b: skipped when it would collide with the neighbouring bar's name
}
function capsuleThin(c, x, y, w, h, pct, col, s) {
  pct = Math.max(0, Math.min(1, pct)); rr(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(12,8,4,0.85)'; c.fill();
  if (pct > 0) { c.save(); rr(c, x, y, w, h, h / 2); c.clip(); c.fillStyle = col; c.fillRect(x, y, Math.max(h, w * pct), h); const gl = c.createLinearGradient(0, y, 0, y + h); gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(x, y, w, h); c.restore(); }
  rr(c, x, y, w, h, h / 2); c.lineWidth = 1.3 * s; c.strokeStyle = 'rgba(214,174,78,0.85)'; c.stroke();
}

/** Long summon-card hand along the bottom (v6.1 FLOATING HAND — owner 2026-11-07: the shelf/board
 * chrome still "looks like shit, look up others design"). Reference decks (Slay the Spire,
 * Hearthstone, Balatro) float the hand over the scene with NO board: readability comes from a
 * soft dark scrim behind the band and a per-card contact shadow, not from panel chrome — so the
 * glass shelf, gold lip and studs are retired. All cards sit LEVEL; the always-raised glowing
 * last card is gone (owner: "why is the one card at the far right always the only one lifted up??").
 * Only call when entries.length > 0. entries: [{card, ready, turnsLeft, affordable}] */

// ───────── PASSIVE (RELIC) CARD GROUP — left of the summon hand, split off by a divider line ─────────
const PASSIVE_FAM = { DEFENSE: '#4aa3ff', OFFENSE: '#ef5350', TACTICAL: '#4cc96b' };
const PT_W = 40, PT_H = 54, PT_GAP = 7;   // design px
function passiveBandW(n) { return n > 0 ? n * PT_W + (n - 1) * PT_GAP + 22 : 0; }   // tiles + divider gutter
function passiveGlyph(c, fam, cx, cy, r, col) {
  c.save(); c.translate(cx, cy); c.fillStyle = col; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(1, r * 0.1); c.beginPath();
  if (fam === 'DEFENSE') { c.moveTo(0, -r); c.lineTo(r * 0.85, -r * 0.55); c.lineTo(r * 0.7, r * 0.3); c.quadraticCurveTo(0, r * 1.15, 0, r * 1.1); c.quadraticCurveTo(0, r * 1.15, -r * 0.7, r * 0.3); c.lineTo(-r * 0.85, -r * 0.55); }
  else if (fam === 'OFFENSE') { c.moveTo(0, -r * 1.1); c.lineTo(r * 0.45, r * 0.1); c.lineTo(r * 0.14, r * 0.1); c.lineTo(r * 0.14, r * 0.9); c.lineTo(-r * 0.14, r * 0.9); c.lineTo(-r * 0.14, r * 0.1); c.lineTo(-r * 0.45, r * 0.1); }
  else { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
  c.closePath(); c.fill(); c.stroke(); c.restore();
}
/** Draws the equipped passive tiles starting at x0 (design coords), vertically centred in the hand band, plus the
 * divider line when a summon hand follows. fxIds = ids currently flashing (trigger animation). */
async function drawPassiveGroup(c, ids, s, x0, y0, withDivider, fxIds) {
  try { await require('../passiveCards/cardRenderer').preloadIcons(); } catch (e) {}
  const { PASSIVE_CATALOG } = require('../passiveCards/catalog');
  const RC = { COMMON: '#b8b8b8', RARE: '#4aa3ff', EPIC: '#b66bff', LEGENDARY: '#ffc94a' };
  const X = x0 * s, Y = y0 * s, H = 84 * s, tw = PT_W * s, th = PT_H * s, gap = PT_GAP * s, ty = Y + (H - th) / 2;
  const n = ids.length, bandW = passiveBandW(n) * s;
  c.save();
  const pool = c.createRadialGradient(X + bandW / 2, Y + H / 2, 4 * s, X + bandW / 2, Y + H / 2, bandW * 0.8);
  pool.addColorStop(0, 'rgba(2,4,9,0.45)'); pool.addColorStop(1, 'rgba(2,4,9,0)'); c.translate(X + bandW / 2, Y + H / 2); c.scale(1, 0.55); c.translate(-(X + bandW / 2), -(Y + H / 2)); c.fillStyle = pool; c.beginPath(); c.arc(X + bandW / 2, Y + H / 2, bandW * 0.8, 0, Math.PI * 2); c.fill();
  c.restore();
  for (let i = 0; i < n; i++) {
    const x0t = X + i * (tw + gap);
    if (!PASSIVE_CATALOG[ids[i]]) {   // AVAILABLE slot, nothing equipped: dashed outline
      c.save(); c.setLineDash([5 * s, 4 * s]); c.lineWidth = 1.6 * s; c.strokeStyle = 'rgba(231,199,102,0.55)'; rr(c, x0t, ty, tw, th, 7 * s); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(231,199,102,0.55)'; c.font = `bold ${18 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', x0t + tw / 2, ty + th / 2); c.restore(); continue;
    }
    const card = PASSIVE_CATALOG[ids[i]];
    const x = X + i * (tw + gap), fam = PASSIVE_FAM[card.family] || '#cccccc', rar = RC[card.rarity] || '#b8b8b8', flash = !!(fxIds && fxIds.includes(card.id));
    c.save();
    if (flash) { c.shadowColor = fam; c.shadowBlur = 20 * s; }
    rr(c, x, ty, tw, th, 7 * s); const g = c.createLinearGradient(x, ty, x, ty + th); g.addColorStop(0, '#1b2230'); g.addColorStop(1, '#0c1018'); c.fillStyle = g; c.fill();
    c.shadowBlur = 0; c.lineWidth = (flash ? 3 : 2) * s; c.strokeStyle = rar; c.stroke();
    rr(c, x + 3 * s, ty + 3 * s, tw - 6 * s, 5 * s, 2.5 * s); c.fillStyle = fam; c.fill();                 // family colour band
    { let used = false; try { const cr = require('../passiveCards/cardRenderer'); used = cr.drawIcon(c, cr.iconSync(card.id), x + tw / 2, ty + th * 0.42, 27 * s, '#ffffff', fam); } catch (e) {} if (!used) passiveGlyph(c, card.family, x + tw / 2, ty + th * 0.42, 11 * s, fam); }
    c.font = `bold ${5 * s}px HudCinzel, serif`; c.fillStyle = '#f3e6c4'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let nm = String(card.name).toUpperCase(); while (nm.length > 2 && c.measureText(nm).width > tw - 4 * s) nm = nm.slice(0, -1);
    c.fillText(nm, x + tw / 2, ty + th - 9 * s);
    c.restore();
  }
  if (withDivider) {   // the line that splits regular (passive) cards from summon cards
    const dx = X + bandW - 9 * s, d0 = Y + 4 * s, d1 = Y + H - 4 * s;
    c.save(); const lg = c.createLinearGradient(0, d0, 0, d1); lg.addColorStop(0, 'rgba(231,199,102,0.15)'); lg.addColorStop(0.2, 'rgba(255,225,130,1)'); lg.addColorStop(0.8, 'rgba(255,225,130,1)'); lg.addColorStop(1, 'rgba(231,199,102,0.15)');
    c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 4 * s; c.strokeStyle = lg; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(dx, d0); c.lineTo(dx, d1); c.stroke();
    c.fillStyle = '#e7c766'; c.beginPath(); c.moveTo(dx, Y + H / 2 - 4 * s); c.lineTo(dx + 3.5 * s, Y + H / 2); c.lineTo(dx, Y + H / 2 + 4 * s); c.lineTo(dx - 3.5 * s, Y + H / 2); c.closePath(); c.fill();
    c.restore();
  }
}
/** Equipped passive ids for a battle player (empty when disabled / none equipped). */
function passiveIdsFor(player) {
  try {
    if (process.env.PASSIVE_CARDS === '0') return [];
    const lo = require('../passiveCards/engine').loadoutOf(player); if (!lo.length) return [];
    const slots = require('../passiveCards/engine').slotsOf(player);   // empty (available) slots show as dashed tiles
    const out = lo.slice(0, 5); while (out.length < Math.max(lo.length, slots)) out.push(null); return out;
  } catch (e) { return []; }
}

/** Hand geometry shared by the tray painter and the card-play animation (so a card visibly leaves ITS slot). */
function deckLayout(entries, s = 1, x0 = 330, y0 = DH - 96, x1 = DW - 18, pids) {
  if (pids && pids.length) x0 += passiveBandW(pids.length);
  const X = x0 * s, Y = y0 * s, W = (x1 - x0) * s, H = 84 * s;
  const cw = 52 * s, ch = 70 * s, padL = 26 * s, padR = 16 * s, usable = W - padL - padR, n = entries.length, minStep = cw * 0.66;
  let maxFit = Math.max(1, Math.floor((usable - cw) / minStep) + 1);
  // "+N" pile chip: width grows with the digit count (was a fixed 40px => "+12"/"+120" overflowed) and is RESERVED out of the
  // hand's width so it can never run past the band or overlap the passive group.
  const chipWFor = (m) => (22 + 9.5 * String(m).length) * s;
  let shownN = Math.min(n, maxFit), more = n - shownN;
  if (more > 0) { const reserve = chipWFor(more) + 10 * s; maxFit = Math.max(1, Math.floor((usable - reserve - cw) / minStep) + 1); shownN = Math.min(n, maxFit); more = n - shownN; }
  const handAvail = usable - (more > 0 ? chipWFor(more) + 10 * s : 0);
  const step = shownN > 1 ? Math.min(cw + 12 * s, Math.max(minStep, (handAvail - cw) / (shownN - 1))) : 0;
  const handW = (shownN > 1 ? (shownN - 1) * step : 0) + cw;
  const totalW = handW + (more > 0 ? 6 * s + chipWFor(more) : 0);   // hand + its +N chip are centred as ONE unit
  const startX = X + padL + Math.max(0, (usable - totalW) / 2);
  const slots = [];
  for (let i = 0; i < shownN; i++) slots.push({ x: startX + i * step, y: Y + (H - ch) / 2, w: cw, h: ch, ang: (i - (shownN - 1) / 2) * 1.1 * Math.PI / 180 });
  const chip = more > 0 ? { x: startX + (shownN - 1) * step + cw + 6 * s, y: Y + H / 2 - 13 * s, w: chipWFor(more), h: 26 * s } : null;
  return { X, Y, W, H, cw, ch, startX, step, handW, shownN, more, slots, chip };
}

async function drawDeckTray(c, entries, s = 1, x0 = 330, y0 = DH - 96, x1 = DW - 18, pids, fxIds) {
  init();
  if (pids && pids.length) { await drawPassiveGroup(c, pids, s, x0, y0, entries.length > 0, fxIds); if (!entries.length) return; }
  const { RARITY, ELEMENT_COLORS } = require('../summonCards/catalog');
  const { artFor } = require('../summonCards/cardRenderer');
  const L = deckLayout(entries, s, x0, y0, x1, pids);
  const { X, Y, W, H, cw, ch, startX, step, handW } = L;
  const shown = entries.slice(0, L.shownN), more = L.more;
  // 1. soft ground pool behind the hand — RADIAL, so there are no hard edges on any stage
  //    (battle card scene or the flat hand-image backdrop); readability without board chrome
  const cxm = startX + handW / 2, cym = Y + H * 0.52;
  const poolRx = Math.max(handW * 0.78, 340 * s), poolRy = H * 0.95;
  c.save();
  c.translate(cxm, cym); c.scale(1, poolRy / poolRx); c.translate(-cxm, -cym);
  const pool = c.createRadialGradient(cxm, cym, 10 * s, cxm, cym, poolRx);
  pool.addColorStop(0, 'rgba(2,4,9,0.52)');
  pool.addColorStop(0.6, 'rgba(2,4,9,0.30)');
  pool.addColorStop(1, 'rgba(2,4,9,0)');
  c.fillStyle = pool; c.beginPath(); c.arc(cxm, cym, poolRx, 0, Math.PI * 2); c.fill();
  c.restore();
  // 2. the hand: every card LEVEL, each grounded by its own contact shadow (Slay-the-Spire
  //    grounding — a squashed radial pool under the card's bottom edge)
  for (let i = 0; i < shown.length; i++) {
    const ang = (i - (shown.length - 1) / 2) * 1.1 * Math.PI / 180;
    const x = startX + i * step;
    const y = Y + (H - ch) / 2;
    if (shown[i].hidden) continue;   // card-play animation: this card is in the air
    c.save();
    c.translate(x + cw / 2, y + ch + 3 * s); c.scale(1, 0.2);
    const sh = c.createRadialGradient(0, 0, 2 * s, 0, 0, cw * 0.62);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.beginPath(); c.arc(0, 0, cw * 0.62, 0, Math.PI * 2); c.fill();
    c.restore();
    await drawMiniCard(c, shown[i], i, x, y, cw, ch, { s, sc: 1, ang, standout: false, rar: RARITY, el: ELEMENT_COLORS, artFor });
  }
  if (more > 0 && L.chip) {
    const { x: px, y: py0, w: pw } = L.chip, py = py0 + 13 * s;
    rr(c, px, py - 13 * s, pw, 26 * s, 13 * s); c.fillStyle = 'rgba(12,10,6,0.9)'; c.fill();
    c.lineWidth = 1.6 * s; c.strokeStyle = '#c9a13b'; c.stroke();
    c.fillStyle = '#e7c766'; c.font = `bold ${15 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('+' + more, px + pw / 2, py + 1);
  }
}

/** One mini card in the hand. num = 1-based play number (position in the FULL hand, stable numbering). */
async function drawMiniCard(c, e, idx, x, y, cw, ch, o) {
  const { s, sc, ang, standout, rar, el, artFor } = o;
  const card = e.card;
  const rarC = (rar[card.rarity] || rar.COMMON).color;
  const elC = el[card.element] || '#cccccc';
  c.save();
  c.translate(x + cw / 2, y + ch);          // pivot: bottom-center
  c.rotate(ang || 0); c.scale(sc, sc);
  c.translate(-cw / 2, -ch);
  // body + glow, then the REAL parchment card face (cached, step-downscaled) — old frame/art-window painter retired
  if (standout) { c.shadowColor = '#ffd36b'; c.shadowBlur = 18 * s; }
  else if (e.ready !== false) { c.shadowColor = 'rgba(255,211,107,0.8)'; c.shadowBlur = 10 * s; }
  let faced = false;
  if (process.env.TRAY_OLD_CARD !== '1') {
    try {
      const face = await require('../summonCards/cardRenderer').faceCanvas(card, cw * 2, ch * 2);   // 2x backing so the tray stays sharp when the board is upscaled
      rr(c, 1 * s, 1 * s, cw - 2 * s, ch - 2 * s, 7 * s); c.fillStyle = '#12151d'; c.fill();
      c.shadowBlur = 0; c.imageSmoothingEnabled = true; c.drawImage(face, 0, 0, cw, ch); faced = true;
    } catch (e0) { faced = false; }
  }
  if (!faced) {
  rr(c, 1 * s, 1 * s, cw - 2 * s, ch - 2 * s, 8 * s); c.fillStyle = '#12151d'; c.fill();
  c.shadowBlur = 0;
  // (legacy painter — only when the new face fails to render)
  c.save(); c.beginPath();
  const wx = 0.07 * cw, wy = 0.0515 * ch, ww = 0.855 * cw, wh = 0.5485 * ch;
  c.rect(wx, wy, ww, wh); c.clip();
  const ag = c.createLinearGradient(0, 0, 0, ch * 0.62); ag.addColorStop(0, elC); ag.addColorStop(1, '#0c0e14');
  c.globalAlpha = 0.5; c.fillStyle = ag; c.fillRect(wx, wy, ww, wh); c.globalAlpha = 1;
  try { const art = await artFor(card); if (art) { const k = Math.min(ww / art.width, wh / art.height); c.drawImage(art, wx + (ww - art.width * k) / 2, wy + (wh - art.height * k) / 2, art.width * k, art.height * k); } } catch (e2) {}
  c.restore();
  const frame = uiSync('hud_card_frame.png');
  if (frame) c.drawImage(frame, 0, 0, cw, ch);
  else { rr(c, 0, 0, cw, ch, 8 * s); c.lineWidth = (standout ? 2.8 : 1.8) * s; c.strokeStyle = rarC; c.stroke(); }
  c.font = `bold ${8 * s}px HudCinzel, serif`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#fff';
  c.fillText(String(card.name || '').toUpperCase().slice(0, 9), cw / 2, ch * 0.72);
  }
  c.textBaseline = 'middle'; c.textAlign = 'center';
  if (faced) {   // readable name ribbon (the printed name is a few px tall at tray size)
    const ry = ch * 0.585, rh = 11 * s;
    c.save(); rr(c, 3 * s, ry, cw - 6 * s, rh, 3 * s); c.fillStyle = 'rgba(20,12,6,0.82)'; c.fill(); c.lineWidth = 1 * s; c.strokeStyle = rarC; c.stroke();
    c.font = `bold ${7 * s}px HudCinzel, serif`; c.fillStyle = '#f3e6c4';
    let nm = String(card.name || '').toUpperCase();
    if (c.measureText(nm).width > cw - 12 * s) { while (nm.length > 1 && c.measureText(nm + '…').width > cw - 12 * s) nm = nm.slice(0, -1); nm += '…'; }
    c.fillText(nm, cw / 2, ry + rh / 2 + 0.5 * s); c.restore();
  }
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

// ── unit status visuals (owner 2026-11-06: "some summon skills add a shield — make a shield
// bubble for it; read the skill trees for abilities like that — you're just drawing over the
// image after all") ────────────────────────────────────────────────────────────────────────

// 💡 OWNER FIX round 5 (2026-11-07: "I think the shield the colossus somehow affected them??"):
// 'taunt' wore a GOLD buff ring even on the ENEMIES it is a debuff for — after a Colossus-card
// Stone Bulwark the enemy roster sprouted gold circles that read like the shield had jumped to
// THEM. Taunt is always bad for its holder (forced target) → red debuff ring on either side.
const BUFF_TYPES = new Set(['shield', 'regen', 'haste', 'blessing', 'berserk', 'ccImmune', 'attack_up', 'defense_up', 'aura', 'charge', 'revive_ready']);
const DEBUFF_TYPES = new Set(['poison', 'burn', 'bleed', 'freeze', 'stun', 'sleep', 'root', 'slow', 'curse', 'blind', 'silence', 'shock', 'drown', 'weak', 'vulnerability', 'wet', 'oil', 'brittle', 'charm', 'locked_in_time', 'doom_timer', 'infect', 'taunt']);
function ringFor(type) { if (BUFF_TYPES.has(String(type))) return '#e7c766'; if (DEBUFF_TYPES.has(String(type))) return '#e06a5a'; return '#b9c4d8'; }
function isShieldFx(e) { return e && String(e.type) === 'shield' && (e.value === undefined || Number(e.value) > 0 || Number(e.duration) >= 900); }

/** Translucent shield bubble around a battlefield unit (absorb shield). a = Go layer anchor
 * {x, feetY, w, h} in design space. Drawn over the sprites; icy-blue glass with a glowing rim,
 * specular arc and sparkles — matches the mana capsule family. Optional absorb value shown in
 * a small pill under the unit. */
function drawShieldBubble(c, a, s = 1, value = 0) {
  if (process.env.LEGACY_SHIELD_BUBBLE !== '1') { require('./statusAuras').drawAuras(c, a, [{ type: 'shield', value: value || 1 }], s, 'ground'); require('./statusAuras').drawAuras(c, a, [{ type: 'shield', value: value || 1 }], s, 'front'); return; }
  const cx = a.x * s, feetY = a.feetY * s;
  const h = Math.max(40, (a.h || 120)) * s, w = Math.max(30, (a.w || 90)) * s;
  const cy = feetY - h * 0.54;
  // hug the unit's OWN sprite box (a slightly wide big boss must not bubble its neighbours)
  const rx = Math.max(w * 0.55, 30 * s), ry = Math.max(h * 0.56, 30 * s);
  c.save();
  // glass dome fill (light on the upper-left, clear at the feet so the ground stays visible)
  const g = c.createRadialGradient(cx - rx * 0.25, cy - ry * 0.35, rx * 0.15, cx, cy, rx);
  g.addColorStop(0, 'rgba(165,215,255,0.30)');
  g.addColorStop(0.6, 'rgba(100,155,230,0.15)');
  g.addColorStop(1, 'rgba(70,115,200,0.045)');
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  // glowing rim + outer halo
  c.lineWidth = 2 * s; c.strokeStyle = 'rgba(160,212,255,0.85)';
  c.shadowColor = 'rgba(120,190,255,0.65)'; c.shadowBlur = 7 * s;
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  c.shadowBlur = 0;
  c.lineWidth = 1 * s; c.strokeStyle = 'rgba(195,228,255,0.30)';
  c.beginPath(); c.ellipse(cx, cy, rx * 1.07, ry * 1.07, 0, 0, Math.PI * 2); c.stroke();
  // specular arc top-left (glass highlight)
  c.lineWidth = 2.6 * s; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineCap = 'round';
  c.beginPath(); c.ellipse(cx, cy, rx * 0.85, ry * 0.85, 0, Math.PI * 1.05, Math.PI * 1.45); c.stroke();
  // sparkles
  for (const [dx, dy, r] of [[-rx * 0.42, -ry * 0.38, 1.7], [rx * 0.38, ry * 0.1, 1.2], [rx * 0.1, -ry * 0.55, 1.0]]) {
    c.beginPath(); c.arc(cx + dx, cy + dy, r * s, 0, Math.PI * 2); c.fillStyle = 'rgba(225,242,255,0.85)'; c.fill();
  }
  c.restore();
  // absorb value pill under the unit
  if (value > 0) {
    const label = String(Math.floor(value));
    const pw = Math.max(30 * s, 12 * s + label.length * 7 * s), ph = 15 * s, py = feetY + 4 * s;
    rr(c, cx - pw / 2, py, pw, ph, ph / 2); c.fillStyle = 'rgba(8,14,30,0.88)'; c.fill();
    c.lineWidth = 1.3 * s; c.strokeStyle = 'rgba(140,200,255,0.9)'; c.stroke();
    c.font = `bold ${10 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    shadowText(c, label, cx, py + ph / 2 + 0.5, '#cfe6ff', 'center');
  }
}

/** Status badge row floating above a unit's head: dark circle + category ring (gold = buff,
 * red = debuff, grey-blue = neutral) + the status's own emoji glyph (monochrome Noto Emoji,
 * tinted to the palette). Max 5 shown, then a +N pill. a = Go layer anchor. */
function drawStatusBadges(c, a, effects, s = 1) {
  if (!Array.isArray(effects) || !effects.length) return;
  const list = effects.slice(0, 5);
  const r = 10.5 * s, step = r * 2 + 3 * s;
  const by = a.feetY * s - Math.max(40, (a.h || 120)) * s - 13 * s;
  const x0 = a.x * s - ((list.length - 1) * step) / 2;
  for (let i = 0; i < list.length; i++) {
    const e = list[i], bx = x0 + i * step;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 4 * s; c.shadowOffsetY = 1.5 * s;
    c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fillStyle = 'rgba(8,10,16,0.9)'; c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 1.5 * s; c.strokeStyle = ringFor(e && e.type); c.stroke();
    const icon = String((e && e.icon) || '✨');
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (_emojiOk) {
      c.font = `${11.5 * s}px NotoEmoji`;
      c.fillStyle = '#f2f6ff';
      c.fillText(icon, bx, by + 0.5 * s);
    } else {
      // no emoji font on this host — engraved first letter of the status name
      c.font = `bold ${11 * s}px HudCinzel, serif`;
      c.fillStyle = ringFor(e && e.type);
      c.fillText(icon[0] || '?', bx, by + 0.5 * s);
    }
    c.restore();
  }
  const more = effects.length - list.length;
  if (more > 0) {
    const px = x0 + list.length * step + 2 * s;
    rr(c, px, by - 9 * s, 30 * s, 18 * s, 9 * s); c.fillStyle = 'rgba(8,10,16,0.9)'; c.fill();
    c.lineWidth = 1.2 * s; c.strokeStyle = '#b9c4d8'; c.stroke();
    c.fillStyle = '#dfe7f5'; c.font = `bold ${10 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('+' + more, px + 15 * s, by + 0.5 * s);
  }
}

module.exports = {
  deckLayout, passiveIdsFor, drawPassiveGroup, passiveBandW, preload, drawRankBanner, drawHubBanner, drawPlayerHud, drawUnitBar, drawDeckTray, drawShieldBubble, drawStatusBadges, portraitFromCut, DW, DH, RANK_COLOR, isShieldFx };
