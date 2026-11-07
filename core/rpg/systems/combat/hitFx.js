'use strict';
// 💥 Static HIT REACTION for the battle cards (owner 2026-11-07: "how do other turn-based RPGs do it - a slash effect then a hurt animation;
// can we get that feel with a still image?"). Classic JRPG hit = (1) slash sprite across the target, (2) target recoils away from the
// attacker and flashes, (3) damage number pops. On a still frame we freeze the strongest moment: the target's red-flashed copy is
// knocked back + tilted over its own (unmoved) sprite so it reads as a motion double-image, a tapered slash with a white core crosses
// the body, an impact star bursts at the contact point, and the number floats above. Misses show a sidestep ghost + "MISS"; heals a
// green glow + number. Crits get a bigger star, extra slash and a "CRITICAL" tag.
const { createCanvas, loadImage } = require('canvas');
const { ELEMENT_COLORS } = require('../summonCards/catalog');

const TAU = Math.PI * 2;
const a2 = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function slash(c, len, wid, core, glow) { // tapered crescent: thin tips, fat belly, white core
  c.save(); c.beginPath(); c.moveTo(-len / 2, 0); c.quadraticCurveTo(0, -wid * 1.15, len / 2, 0); c.quadraticCurveTo(0, wid * 0.55, -len / 2, 0); c.closePath();
  c.shadowColor = glow; c.shadowBlur = wid * 1.4; c.fillStyle = glow; c.fill(); c.shadowBlur = 0; c.fillStyle = core; c.save(); c.scale(1, 0.45); c.fill(); c.restore(); c.restore();
}
function star(c, r, col) { c.save(); c.fillStyle = col; c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, k = i % 2 ? 0.34 : 1; c.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } c.closePath(); c.fill(); c.restore(); }

/** act = {attackerSide, attackerIndex, targetSide, targetIndex, damage, isCrit, missed, heal, element}. */
async function drawHitReaction(c, layers, anchors, act, s) {
  if (!act || !act.targetSide || !Array.isArray(layers.cuts)) return;
  const tIdx = Number(act.targetIndex) || 0, cut = layers.cuts.find((x) => x.side === act.targetSide && x.index === tIdx);
  const an = anchors.find((x) => x.side === act.targetSide && x.index === tIdx);
  if (!cut || !cut.png || !an) return;
  const att = anchors.find((x) => x.side === (act.attackerSide || 'player') && x.index === (Number(act.attackerIndex) || 0));
  const dir = att ? Math.sign(an.x - att.x) || 1 : (act.attackerSide === 'enemy' ? -1 : 1);   // knock-back direction (away from attacker)
  const el = ELEMENT_COLORS[String(act.element || '').toUpperCase()] || null, col = el || '#ffffff';
  const dmg = Math.floor(Number(act.damage) || 0), crit = !!act.isCrit, miss = !!act.missed, heal = !!act.heal;
  const cx = an.x * s, cy = (an.feetY - (an.h || cut.h) * 0.52) * s, w = (an.w || cut.w) * s, h = (an.h || cut.h) * s;
  let im; try { im = await loadImage(Buffer.from(cut.png, 'base64')); } catch (e) { return; }
  const tint = (rgba) => { const t = createCanvas(cut.w, cut.h), tc = t.getContext('2d'); tc.drawImage(im, 0, 0, cut.w, cut.h); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = rgba; tc.fillRect(0, 0, cut.w, cut.h); return t; };
  const drawCut = (img, dx, dy, rot, alpha) => { c.save(); c.globalAlpha = alpha; c.translate(cut.x * s + cut.w * s / 2 + dx, cut.y * s + cut.h * s + dy); c.rotate(rot); c.drawImage(img, -cut.w * s / 2, -cut.h * s, cut.w * s, cut.h * s); c.restore(); };
  if (heal) { const g = c.createRadialGradient(cx, cy, 6 * s, cx, cy, h * 0.8); g.addColorStop(0, 'rgba(120,255,170,0.42)'); g.addColorStop(1, 'rgba(120,255,170,0)'); c.fillStyle = g; c.fillRect(cx - h, cy - h, h * 2, h * 2); }
  else if (miss) { drawCut(tint('rgba(255,255,255,0.0)'), dir * -18 * s, 0, 0, 0.0); drawCut(im, -dir * 22 * s, 0, -dir * 0.05, 0.38); } // sidestep afterimage
  else {
    drawCut(tint('rgba(255,235,225,0.55)'), 0, 0, 0, 0.35);                               // white-hot flash on the original
    drawCut(tint('rgba(255,40,30,0.42)'), dir * 15 * s, -2 * s, dir * 0.075, 0.95);      // knocked-back red copy (double image)
    // slash(es) crossing the body, swinging down from the attacker's side
    const ang = dir * 0.62 + (dir > 0 ? 0.0 : Math.PI), n = crit ? 3 : 2;
    for (let i = 0; i < n; i++) {
      c.save(); c.translate(cx + (i - (n - 1) / 2) * 20 * s * dir, cy + (i - (n - 1) / 2) * 24 * s); c.rotate(ang + (i - (n - 1) / 2) * 0.1);
      slash(c, Math.max(h * 1.15, 100 * s) * (i === 1 && n === 3 ? 1.2 : 1), (crit ? 16 : 11) * s, '#ffffff', a2(el ? col : '#bfe3ff', 0.9)); c.restore();
    }
    // impact star + sparks at the contact point
    c.save(); c.translate(cx - dir * w * 0.08, cy); c.globalCompositeOperation = 'lighter'; star(c, (crit ? 62 : 40) * s, a2(col, 0.55)); star(c, (crit ? 36 : 22) * s, 'rgba(255,255,255,0.9)'); c.globalCompositeOperation = 'source-over';
    c.fillStyle = a2(col, 0.95); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2, r = (46 + (i * 37 % 40)) * s; c.fillRect(Math.cos(a) * r - 1.5 * s, Math.sin(a) * r - 1.5 * s, (2 + (i % 3)) * s, (2 + (i % 3)) * s); } c.restore();
  }
  // damage / miss / heal number floating above the head
  const label = miss ? 'MISS' : (heal ? '+' + dmg : (dmg > 0 ? String(dmg) : ''));
  if (label) {
    const fy = an.feetY * s - h - 46 * s, size = (crit ? 40 : 30) * s;
    c.save(); c.translate(cx + dir * 6 * s, fy); c.rotate(crit ? -0.05 : 0); c.font = `bold ${size}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 6 * s; c.strokeStyle = '#1b0f05';
    c.strokeText(label, 0, 0); c.fillStyle = miss ? '#e6e2d6' : (heal ? '#8ff0ad' : (crit ? '#ffd24a' : '#ff8a70')); c.fillText(label, 0, 0);
    if (crit && !miss && !heal) { c.font = `bold ${13 * s}px HudCinzel, serif`; c.lineWidth = 4 * s; c.strokeText('CRITICAL', 0, -size * 0.72); c.fillStyle = '#fff2b0'; c.fillText('CRITICAL', 0, -size * 0.72); }
    c.restore();
  }
}
module.exports = { drawHitReaction };
