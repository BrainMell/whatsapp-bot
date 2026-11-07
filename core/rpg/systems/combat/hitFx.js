'use strict';
// 💥 Static HIT REACTION for the battle cards (owner 2026-11-07: "how do other turn-based RPGs do it - a slash effect then a hurt animation;
// can we get that feel with a still image?"). Classic JRPG hit = (1) slash sprite across the target, (2) target recoils away from the
// attacker and flashes, (3) damage number pops. On a still frame we freeze the strongest moment: the target's red-flashed copy is
// knocked back + tilted over its own (unmoved) sprite so it reads as a motion double-image, a tapered slash with a white core crosses
// the body, an impact star bursts at the contact point, and the number floats above.
//
// 🔧 OWNER WORK-ORDER ROUND 8 (2026-11-07, "Combat UI and Attack Effects"):
//   #4 ATTACK VARIATIONS - "Reusing the same attack visual for every basic attack gets repetitive. Create multiple variations of the
//   existing attack presentation and cycle through them." → four slash compositions (cross fan / triple heavy / thrust / overhead
//   cleave) cycled by act.attackSeed (the turn counter), with a stable hash fallback so identical-looking turns still diverge.
//   #2 MISSED ATTACK IMAGE - "Create an equivalent visual for missed attacks so misses have their own distinct combat presentation."
//   → the target now DODGES: its sprite leans away from the attacker with a motion-trail ghost at the old spot, the attacker's blade
//   whiffs through the vacated space as a pale double arc with speed streaks, and a stencilled MISS plaque pops over the head.
//   #3 CONSUMABLE USAGE IMAGES - "Each consumable type should have its own recognisable visual treatment displayed on the combat
//   image" (static, no animation) → a hand-drawn emblem set keyed on the item's effect family: potion flask (heal), salve vial with
//   droplets (regen), bolt crystal (energy), dispel vial with sparkle crosses (cure), tonic with rising arrows (buffs), phoenix
//   feather (revive), black-powder bomb (damage items), smoke puff (flee/bribe) — each on its own glow, floating over the target.
const { createCanvas, loadImage } = require('canvas');
const { ELEMENT_COLORS } = require('../summonCards/catalog');

const TAU = Math.PI * 2;
const a2 = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function slash(c, len, wid, core, glow) { // tapered crescent: thin tips, fat belly, white core
  c.save(); c.beginPath(); c.moveTo(-len / 2, 0); c.quadraticCurveTo(0, -wid * 1.15, len / 2, 0); c.quadraticCurveTo(0, wid * 0.55, -len / 2, 0); c.closePath();
  c.shadowColor = glow; c.shadowBlur = wid * 1.4; c.fillStyle = glow; c.fill(); c.shadowBlur = 0; c.fillStyle = core; c.save(); c.scale(1, 0.45); c.fill(); c.restore(); c.restore();
}
function star(c, r, col) { c.save(); c.fillStyle = col; c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, k = i % 2 ? 0.34 : 1; c.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } c.closePath(); c.fill(); c.restore(); }
// thin speed streak (attack passing through empty air)
function streak(c, x, y, len, wid, col, a) {
  c.save(); c.globalAlpha = a; const g = c.createLinearGradient(x - len / 2, y, x + len / 2, y);
  g.addColorStop(0, a2(col, 0)); g.addColorStop(0.5, a2(col, 0.9)); g.addColorStop(1, a2(col, 0));
  c.fillStyle = g; const r = wid / 2; c.beginPath(); c.moveTo(x - len / 2 + r, y - r); c.lineTo(x + len / 2 - r, y - r * 0.4); c.lineTo(x + len / 2 - r, y + r * 0.4); c.lineTo(x - len / 2 + r, y + r); c.closePath(); c.fill(); c.restore();
}

// ── #4: the four basic-attack compositions ──────────────────────────────
// dir = knock-back direction (attacker → target sign), el = element colour or null.
function slashPattern(variant, c, cx, cy, h, dir, el, crit, s) {
  const col = el || '#bfe3ff';
  if (variant === 0) {                       // CROSS FAN — the original look, two parallel slashes
    const ang = dir * 0.62 + (dir > 0 ? 0.0 : Math.PI), n = crit ? 3 : 2;
    for (let i = 0; i < n; i++) {
      c.save(); c.translate(cx + (i - (n - 1) / 2) * 20 * s * dir, cy + (i - (n - 1) / 2) * 24 * s); c.rotate(ang + (i - (n - 1) / 2) * 0.1);
      slash(c, Math.max(h * 1.15, 100 * s) * (i === 1 && n === 3 ? 1.2 : 1), (crit ? 16 : 11) * s, '#ffffff', a2(col, 0.9)); c.restore();
    }
  } else if (variant === 1) {                // TRIPLE HEAVY — three fat steep cuts, fanned high→low
    const ang = dir * 0.95 + (dir > 0 ? 0.0 : Math.PI);
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(cx - dir * (18 - i * 18) * s, cy + (i - 1) * 30 * s); c.rotate(ang - dir * (i - 1) * 0.16);
      slash(c, Math.max(h * (1.05 + i * 0.12), 100 * s), (crit ? 18 : 14) * s, '#ffffff', a2(col, 0.85)); c.restore();
    }
  } else if (variant === 2) {                // THRUST — one deep stab through the body + short finisher
    const ang = dir * 0.12 + (dir > 0 ? 0.0 : Math.PI);
    c.save(); c.translate(cx + dir * 10 * s, cy); c.rotate(ang);
    slash(c, Math.max(h * 1.55, 120 * s), 9 * s, '#ffffff', a2(col, 0.95)); c.restore();
    c.save(); c.translate(cx - dir * 26 * s, cy + 26 * s); c.rotate(ang + dir * 0.5);
    slash(c, Math.max(h * 0.75, 80 * s), 8 * s, '#ffffff', a2(col, 0.7)); c.restore();
  } else {                                   // OVERHEAD CLEAVE — one big diagonal + falling ember sparks
    const ang = dir * 1.25 + (dir > 0 ? 0.0 : Math.PI);
    c.save(); c.translate(cx, cy + 6 * s); c.rotate(ang);
    slash(c, Math.max(h * 1.45, 130 * s) * (crit ? 1.25 : 1), (crit ? 20 : 16) * s, '#ffffff', a2(col, 0.92)); c.restore();
  }
}
function impactBurst(variant, c, cx, cy, dir, el, crit, s) {
  const col = el || '#ffffff';
  const r1 = (variant === 1 ? 58 : variant === 3 ? 66 : crit ? 62 : 40) * s, r2 = (crit ? 36 : 22) * s;
  c.save(); c.translate(cx - dir * (variant === 2 ? 10 : 0) * s, cy + (variant === 3 ? 6 : 0) * s);
  c.globalCompositeOperation = 'lighter'; star(c, r1, a2(col, 0.55)); star(c, r2, 'rgba(255,255,255,0.9)'); c.globalCompositeOperation = 'source-over';
  c.fillStyle = a2(col, 0.95);
  const n = variant === 3 ? 18 : 12;
  for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.2, r = ((variant === 3 ? 58 : 46) + (i * 37 % 40)) * s; c.fillRect(Math.cos(a) * r - 1.5 * s, Math.sin(a) * r - 1.5 * s, (2 + (i % 3)) * s, (2 + (i % 3)) * s); }
  c.restore();
}

// ── #4 variant picker: cycle on the turn seed, hash fallback keeps two
// consecutive same-damage basic attacks from ever looking identical ──
const VARIANTS = 4;
function pickVariant(act) {
  let seed = Number(act && act.attackSeed);
  if (!Number.isFinite(seed)) {
    const str = `${act && act.attackerIndex}|${act && act.targetIndex}|${act && act.skillName}|${act && act.damage}`;
    seed = 7; for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  }
  return Math.abs(Math.floor(seed)) % VARIANTS;
}

// ── #3: consumable emblems (static, hand-drawn) ─────────────────────────
// kind = the item's effect string. Returns the glow colour it painted with.
function drawItemEmblem(c, kind, cx, cy, s) {
  const kindL = String(kind || '').toLowerCase();
  const isNeg = ['damage_aoe', 'aoe_damage', 'aoe_debuff_damage', 'apply_poison', 'freeze_enemy', 'percent_hp_damage'].includes(kindL);
  let glow = '#8ff0ad';
  if (kindL === 'heal' || kindL === 'team_heal') return emblemPotion(c, cx, cy, s, '#ff5f6d', '#8ff0ad');
  if (kindL === 'regen') return emblemRegen(c, cx, cy, s);
  if (kindL === 'restore_energy') return emblemEnergy(c, cx, cy, s);
  if (kindL === 'cure_status') return emblemCure(c, cx, cy, s);
  if (kindL.startsWith('buff') || ['blessing', 'shield', 'haste', 'berserk'].includes(kindL)) return emblemBuff(c, cx, cy, s, kindL);
  if (kindL === 'revive' || kindL === 'team_revive') return emblemRevive(c, cx, cy, s);
  if (kindL === 'flee' || kindL === 'bribe') return emblemSmoke(c, cx, cy, s);
  if (isNeg) return emblemBomb(c, cx, cy, s, kindL);
  return emblemPotion(c, cx, cy, s, '#ffd24a', '#ffe9b0');   // unknown consumable: golden tonic
}
function emblemPotion(c, cx, cy, s, glass, fluid) {           // round-belly flask, liquid + shine + rising bubbles
  glow(c, cx, cy, 66 * s, fluid, 0.4);
  const w = 26 * s, h = 34 * s;
  // neck + cork
  c.save(); c.translate(cx, cy);
  c.fillStyle = a2('#8a5a2a', 0.95); rr(c, -6 * s, -h / 2 - 8 * s, 12 * s, 9 * s, 2 * s); c.fill();
  c.strokeStyle = glass; c.lineWidth = 3.4 * s; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-6 * s, -h / 2 + 1 * s); c.lineTo(-6 * s, -h * 0.16); c.quadraticCurveTo(-w, -h * 0.02, -w, h * 0.18);
  c.quadraticCurveTo(-w, h / 2, 0, h / 2); c.quadraticCurveTo(w, h / 2, w, h * 0.18);
  c.quadraticCurveTo(w, -h * 0.02, 6 * s, -h * 0.16); c.lineTo(6 * s, -h / 2 + 1 * s); c.stroke();
  // liquid fill with a meniscus
  c.save(); c.beginPath(); c.moveTo(-w, h * 0.18); c.quadraticCurveTo(-w, h / 2, 0, h / 2); c.quadraticCurveTo(w, h / 2, w, h * 0.18); c.lineTo(w, h * 0.3); c.quadraticCurveTo(0, h * 0.16, -w, h * 0.3); c.closePath();
  const lg = c.createLinearGradient(0, h * 0.1, 0, h / 2); lg.addColorStop(0, a2(fluid, 0.98)); lg.addColorStop(1, a2(glass, 0.95)); c.fillStyle = lg; c.fill(); c.restore();
  // glass shine + bubbles
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(-w * 0.45, -h * 0.02, 2.6 * s, 6.5 * s, -0.5, 0, TAU); c.fill();
  c.fillStyle = a2('#ffffff', 0.65); for (const [bx, by, br] of [[-6, 8, 2.4], [4, 12, 1.8], [8, 5, 1.4]]) { c.beginPath(); c.arc(bx * s, by * s, br * s, 0, TAU); c.fill(); }
  // rising droplets above the flask
  c.fillStyle = a2(fluid, 0.8); for (const [dx, dy, r] of [[10, -h * 0.75, 2.6], [-8, -h * 0.95, 2.0], [2, -h * 1.18, 1.5]]) { c.beginPath(); c.arc(dx * s, dy * s, r * s, 0, TAU); c.fill(); }
  c.restore();
  return fluid;
}
function emblemRegen(c, cx, cy, s) {                          // salve vial + orbiting droplet ring
  emblemPotion(c, cx, cy, s, '#59d28a', '#a8ff7a');
  c.save(); c.translate(cx, cy); c.strokeStyle = a2('#a8ff7a', 0.7); c.lineWidth = 1.6 * s; c.setLineDash([3 * s, 4 * s]);
  c.beginPath(); c.ellipse(0, 4 * s, 34 * s, 12 * s, -0.35, 0, TAU); c.stroke(); c.setLineDash([]);
  c.fillStyle = a2('#a8ff7a', 0.9); for (const a of [0.4, 2.4, 4.4]) { c.beginPath(); c.arc(Math.cos(a) * 34 * s, 4 * s + Math.sin(a) * 12 * s, 2.2 * s, 0, TAU); c.fill(); }
  c.restore(); return '#a8ff7a';
}
function emblemEnergy(c, cx, cy, s) {                         // cut crystal + bolt, cold sparks
  glow(c, cx, cy, 62 * s, '#59d2ff', 0.42);
  c.save(); c.translate(cx, cy);
  c.beginPath(); c.moveTo(0, -26 * s); c.lineTo(16 * s, -8 * s); c.lineTo(9 * s, 22 * s); c.lineTo(-9 * s, 22 * s); c.lineTo(-16 * s, -8 * s); c.closePath();
  const lg = c.createLinearGradient(0, -26 * s, 0, 22 * s); lg.addColorStop(0, '#bfe9ff'); lg.addColorStop(0.55, '#59b7ff'); lg.addColorStop(1, '#1b5ac8');
  c.fillStyle = lg; c.fill(); c.lineWidth = 1.8 * s; c.strokeStyle = '#e8f7ff'; c.stroke();
  c.beginPath(); c.moveTo(0, -26 * s); c.lineTo(-3 * s, 2 * s); c.lineTo(3 * s, 2 * s); c.lineTo(0, 22 * s); c.lineTo(6 * s, -2 * s); c.lineTo(1 * s, -2 * s); c.closePath();
  c.fillStyle = '#ffffff'; c.fill();
  c.fillStyle = a2('#bfe9ff', 0.85); for (const a of [5.6, 0.6, 2.1]) { c.beginPath(); c.arc(Math.cos(a) * 30 * s, Math.sin(a) * 22 * s, 2.4 * s, 0, TAU); c.fill(); }
  c.restore(); return '#59d2ff';
}
function emblemCure(c, cx, cy, s) {                           // slim vial + dispel sparkle crosses
  glow(c, cx, cy, 60 * s, '#ffe9b0', 0.36);
  c.save(); c.translate(cx, cy);
  c.strokeStyle = '#e8d8a8'; c.lineWidth = 3 * s; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, -h4()); c.lineTo(0, 16 * s); c.stroke();
  c.beginPath(); c.moveTo(-13 * s, 18 * s); c.quadraticCurveTo(0, 26 * s, 13 * s, 18 * s); c.quadraticCurveTo(15 * s, 2 * s, 4 * s, -2 * s); c.lineTo(-4 * s, -2 * s); c.quadraticCurveTo(-15 * s, 2 * s, -13 * s, 18 * s); c.closePath();
  c.fillStyle = a2('#ffe9b0', 0.92); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.font = `bold ${11 * s}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeStyle = a2('#c9a86a', 0.9); c.lineWidth = 2.6 * s;
  for (const [sx, sy] of [[-20, -16], [19, -20], [24, 4], [-24, 6]]) { crossStar(c, sx * s, sy * s, 4.6 * s); }
  c.restore(); return '#ffe9b0';
  function h4() { return 18 * s; }
}
function emblemBuff(c, cx, cy, s, kind) {                     // tonic bottle + rising arrows in the buff's colour
  const col = /shield/.test(kind) ? '#8fb7ff' : /haste|speed/.test(kind) ? '#7dffe0' : /berserk/.test(kind) ? '#ff7a5a' : '#ffd24a';
  glow(c, cx, cy, 64 * s, col, 0.4);
  c.save(); c.translate(cx, cy);
  c.fillStyle = a2('#3a2a14', 0.92); rr(c, -12 * s, -10 * s, 24 * s, 30 * s, 5 * s); c.fill();
  c.lineWidth = 2 * s; c.strokeStyle = col; c.stroke();
  c.fillStyle = a2(col, 0.9); rr(c, -8 * s, -2 * s, 16 * s, 16 * s, 3 * s); c.fill();
  c.fillStyle = a2('#8a5a2a', 0.95); rr(c, -7 * s, -17 * s, 14 * s, 8 * s, 2 * s); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 3.2 * s; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [ax, ay] of [[-14, 6], [0, -6], [14, 6]]) {
    c.beginPath(); c.moveTo(ax * s, (ay + 14) * s); c.lineTo(ax * s, (ay - 12) * s); c.moveTo((ax - 5) * s, (ay - 6) * s); c.lineTo(ax * s, (ay - 12) * s); c.lineTo((ax + 5) * s, (ay - 6) * s); c.stroke();
  }
  c.restore(); return col;
}
function emblemRevive(c, cx, cy, s) {                         // phoenix feather + golden rays
  glow(c, cx, cy, 74 * s, '#ffd24a', 0.5);
  c.save(); c.translate(cx, cy); c.rotate(0.6);
  c.beginPath(); c.moveTo(0, 30 * s); c.quadraticCurveTo(-10 * s, -6 * s, -3 * s, -30 * s); c.quadraticCurveTo(4 * s, -8 * s, 0, 30 * s); c.closePath();
  const lg = c.createLinearGradient(0, 30 * s, 0, -30 * s); lg.addColorStop(0, '#e85a37'); lg.addColorStop(0.6, '#ffb05a'); lg.addColorStop(1, '#ffe9b0');
  c.fillStyle = lg; c.fill(); c.strokeStyle = a2('#fff2b0', 0.9); c.lineWidth = 1.4 * s; c.stroke();
  c.strokeStyle = a2('#fff2b0', 0.8); c.lineWidth = 1.2 * s;
  for (const r of [6, 14, 22]) { c.beginPath(); c.moveTo(-2 * s, (r - 22) * s); c.lineTo(-9 * s, (r - 26) * s); c.stroke(); }
  c.restore();
  c.save(); c.translate(cx, cy); c.strokeStyle = a2('#ffd24a', 0.75); c.lineWidth = 2 * s;
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.39; c.beginPath(); c.moveTo(Math.cos(a) * 26 * s, Math.sin(a) * 26 * s); c.lineTo(Math.cos(a) * 40 * s, Math.sin(a) * 40 * s); c.stroke(); }
  c.restore(); return '#ffd24a';
}
function emblemBomb(c, cx, cy, s, kind) {                     // black-powder bomb (damage items) / ice bomb for freeze
  const ice = String(kind).includes('freeze'), poison = String(kind).includes('poison');
  const col = ice ? '#7dd8ff' : poison ? '#a86bff' : '#ff7a5a';
  glow(c, cx, cy, 60 * s, col, 0.42);
  c.save(); c.translate(cx, cy);
  c.fillStyle = '#2e2632'; c.beginPath(); c.arc(0, 4 * s, 20 * s, 0, TAU); c.fill();
  c.strokeStyle = a2(col, 0.95); c.lineWidth = 2.6 * s; c.stroke();
  c.strokeStyle = a2('#ffffff', 0.35); c.lineWidth = 1.2 * s; c.beginPath(); c.arc(0, 4 * s, 15.5 * s, 0, TAU); c.stroke();
  c.fillStyle = a2('#8a5a2a', 0.95); rr(c, -5 * s, -22 * s, 10 * s, 7 * s, 2 * s); c.fill();
  c.strokeStyle = '#ffd24a'; c.lineWidth = 2.2 * s; c.beginPath(); c.moveTo(4 * s, -22 * s); c.quadraticCurveTo(14 * s, -30 * s, 9 * s, -36 * s); c.stroke();
  star(c, 5 * s, a2('#ffe9b0', 0.95)); c.save(); c.translate(9 * s, -36 * s); star(c, 5 * s, '#fff'); c.restore();
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-7 * s, -3 * s, 3.4 * s, 5.4 * s, -0.6, 0, TAU); c.fill();
  c.restore(); return col;
}
function emblemSmoke(c, cx, cy, s) {                          // smoke puff (flee / bribe decoy)
  glow(c, cx, cy, 58 * s, '#c8c4bc', 0.3);
  c.save(); c.translate(cx, cy); c.fillStyle = a2('#d8d4cc', 0.85);
  for (const [dx, dy, r] of [[-14, 4, 12], [2, -6, 15], [16, 5, 11], [0, 12, 12], [-8, 14, 9], [12, 14, 8]]) { c.beginPath(); c.arc(dx * s, dy * s, r * s, 0, TAU); c.fill(); }
  c.fillStyle = a2('#f0ece2', 0.7); for (const [dx, dy, r] of [[-2, -8, 6], [12, 0, 4.4], [-12, 2, 4.6]]) { c.beginPath(); c.arc(dx * s, dy * s, r * s, 0, TAU); c.fill(); }
  c.restore(); return '#c8c4bc';
}
function glow(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 4, x, y, r); g.addColorStop(0, a2(col, a)); g.addColorStop(1, a2(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function crossStar(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x, y + r); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x - r * 0.6, y - r * 0.6); c.lineTo(x + r * 0.6, y + r * 0.6); c.moveTo(x - r * 0.6, y + r * 0.6); c.lineTo(x + r * 0.6, y - r * 0.6); c.stroke(); }

/** act = {attackerSide, attackerIndex, targetSide, targetIndex, damage, isCrit, missed, heal, element, attackSeed, itemKind}. */
async function drawHitReaction(c, layers, anchors, act, s) {
  if (!act || !act.targetSide) return;
  const tIdx = Number(act.targetIndex) || 0;
  let cut = Array.isArray(layers && layers.cuts) ? layers.cuts.find((x) => x.side === act.targetSide && x.index === tIdx) : null;
  const an = anchors.find((x) => x.side === act.targetSide && x.index === tIdx);
  if (!an) return;
  // 🔧 "sometimes the attack effect doesn't show": a missing cutout (target just died / sprite sheet gap) used to skip the WHOLE
  // reaction. Now the slash, impact burst and number still land on the anchor; only the body-ghost tint is skipped.
  let __noBody = false;
  if (!cut || !cut.png) {
    const bw = Math.max(40, Number(an.w) || 100), bh = Math.max(60, Number(an.h) || 150);
    cut = { x: an.x - bw / 2, y: an.feetY - bh, w: bw, h: bh, png: null }; __noBody = true;
  }
  const att = anchors.find((x) => x.side === (act.attackerSide || 'player') && x.index === (Number(act.attackerIndex) || 0));
  const dir = att ? Math.sign(an.x - att.x) || 1 : (act.attackerSide === 'enemy' ? -1 : 1);   // knock-back direction (away from attacker)
  const el = ELEMENT_COLORS[String(act.element || '').toUpperCase()] || null, col = el || '#ffffff';
  const dmg = Math.floor(Number(act.damage) || 0), crit = !!act.isCrit, miss = !!act.missed, heal = !!act.heal;
  const itemKind = act.itemKind || '';
  const cx = an.x * s, cy = (an.feetY - (an.h || cut.h) * 0.52) * s, w = (an.w || cut.w) * s, h = (an.h || cut.h) * s;
  let im; try { im = __noBody ? createCanvas(Math.max(1, Math.floor(cut.w)), Math.max(1, Math.floor(cut.h))) : await loadImage(Buffer.from(cut.png, 'base64')); } catch (e) { return; }
  const tint = (rgba) => { const t = createCanvas(cut.w, cut.h), tc = t.getContext('2d'); tc.drawImage(im, 0, 0, cut.w, cut.h); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = rgba; tc.fillRect(0, 0, cut.w, cut.h); return t; };
  const drawCut = (img, dx, dy, rot, alpha) => { c.save(); c.globalAlpha = alpha; c.translate(cut.x * s + cut.w * s / 2 + dx, cut.y * s + cut.h * s + dy); c.rotate(rot); c.drawImage(img, -cut.w * s / 2, -cut.h * s, cut.w * s, cut.h * s); c.restore(); };

  if (itemKind) {
    // ── #3 consumable turn: emblem + glow over the target, no slash language ──
    // 🔧 visual pass (r8 verify render): a bare emblem vanished against the sprites
    // (the MAGE literally holds two green bottles). Seat it on a dark medallion disc
    // with a gold ring, raised to upper-chest height, so it reads on ANY sprite.
    const icy = an.feetY * s - (an.h || cut.h) * s * 0.58;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 7 * s; c.shadowOffsetY = 2 * s;
    c.beginPath(); c.arc(cx, icy, 34 * s, 0, TAU); c.fillStyle = 'rgba(10,8,14,0.84)'; c.fill(); c.restore();
    c.lineWidth = 2 * s; c.strokeStyle = 'rgba(214,174,78,0.9)'; c.beginPath(); c.arc(cx, icy, 34 * s, 0, TAU); c.stroke();
    c.lineWidth = 0.8 * s; c.strokeStyle = 'rgba(255,226,140,0.4)'; c.beginPath(); c.arc(cx, icy, 31 * s, 0, TAU); c.stroke();
    const gcol = drawItemEmblem(c, itemKind, cx, icy, s);
    if (heal) { // keep the green field glow + number for healing items
      const g = c.createRadialGradient(cx, cy, 6 * s, cx, cy, h * 0.8); g.addColorStop(0, 'rgba(120,255,170,0.42)'); g.addColorStop(1, 'rgba(120,255,170,0)'); c.fillStyle = g; c.fillRect(cx - h, cy - h, h * 2, h * 2);
    } else if (act.damage > 0) { drawCut(tint('rgba(255,40,30,0.42)'), dir * 15 * s, -2 * s, dir * 0.075, 0.95); }
  } else if (heal) { const g = c.createRadialGradient(cx, cy, 6 * s, cx, cy, h * 0.8); g.addColorStop(0, 'rgba(120,255,170,0.42)'); g.addColorStop(1, 'rgba(120,255,170,0)'); c.fillStyle = g; c.fillRect(cx - h, cy - h, h * 2, h * 2); }
  else if (miss) {
    // ── #2 the DODGE: target leans away, ghost trail at the old spot, the
    // attacker's blade whiffs through the vacated space, MISS plaque pops ──
    drawCut(im, dir * -4 * s, 0, 0, 0.16);                                    // fading ghost where the body WAS
    drawCut(im, -dir * 26 * s, -3 * s, -dir * 0.14, 0.96);                    // the dodge itself: leaning off the line
    const oldX = cx, oldY = cy;
    const ang = dir * 0.5 + (dir > 0 ? 0.0 : Math.PI);
    for (let i = 0; i < 2; i++) {                                             // the whiff: two pale arcs through empty air
      c.save(); c.translate(oldX + (i - 0.5) * 16 * s * dir, oldY - 10 * s * (i ? -1 : 1)); c.rotate(ang + (i - 0.5) * 0.22);
      c.globalAlpha = 0.62; slash(c, Math.max(h * 1.1, 100 * s), 8 * s, '#ffffff', a2(el || '#cfd8e8', 0.75)); c.restore();
    }
    for (let i = 0; i < 3; i++) streak(c, oldX + dir * (34 + i * 26) * s, oldY - 18 * s + i * 16 * s, (70 + i * 18) * s, 4 * s, el || '#cfd8e8', 0.5 - i * 0.12);
    c.fillStyle = a2(el || '#cfd8e8', 0.8);                                   // a few deflected spark chips
    for (let i = 0; i < 6; i++) { const a = -0.6 + i * 0.42, r = (30 + (i * 23 % 26)) * s; c.fillRect(oldX + Math.cos(a) * r * dir, oldY + Math.sin(a) * r * 0.6, 2.4 * s, 2.4 * s); }
  } else {
    const variant = pickVariant(act);
    drawCut(tint('rgba(255,235,225,0.55)'), 0, 0, 0, 0.35);                               // white-hot flash on the original
    drawCut(tint('rgba(255,40,30,0.42)'), dir * 15 * s, -2 * s, dir * 0.075, 0.95);       // knocked-back red copy (double image)
    slashPattern(variant, c, cx, cy, h, dir, el, crit, s);                                // #4 the cycled composition
    impactBurst(variant, c, cx, cy, dir, el, crit, s);
  }
  // damage / miss / heal number floating above the head
  // 🔧 heals read the HEAL amount (act.heal) — using act.damage showed "+0" on heal turns
  const healAmt = Math.floor(Number(act.heal) || 0);
  const label = miss ? 'MISS' : (heal ? '+' + healAmt : (dmg > 0 ? String(dmg) : ''));
  if (label) {
    const fy = an.feetY * s - h - 46 * s, size = (crit ? 40 : 30) * s;
    c.save(); c.translate(cx + dir * 6 * s, fy); c.rotate(crit ? -0.05 : 0); c.font = `bold ${size}px HudCinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 6 * s; c.strokeStyle = '#1b0f05';
    c.strokeText(label, 0, 0); c.fillStyle = miss ? '#e6e2d6' : (heal ? '#8ff0ad' : (crit ? '#ffd24a' : '#ff8a70')); c.fillText(label, 0, 0);
    if (crit && !miss && !heal) { c.font = `bold ${13 * s}px HudCinzel, serif`; c.lineWidth = 4 * s; c.strokeText('CRITICAL', 0, -size * 0.72); c.fillStyle = '#fff2b0'; c.fillText('CRITICAL', 0, -size * 0.72); }
    c.restore();
  }
}

module.exports = { drawHitReaction, slashPattern, impactBurst, slash, star, a2, streak, pickVariant, drawItemEmblem, VARIANTS };
