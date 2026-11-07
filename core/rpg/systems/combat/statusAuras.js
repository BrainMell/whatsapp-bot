'use strict';
// 🛡️🔥☠️ Static status AURAS for the Node battle cards (owner 2026-11-07: "the shield bubble looks bad, remake it - and do the same for
// every skill whose effect lasts across encounters"). Still-image friendly: no animation, every effect is a readable SILHOUETTE that
// hugs the unit and never hides the sprite (rim-lit instead of filled, ground marks instead of overlays).
// Two passes so effects sit correctly in depth:  'ground' (before sprites: rings, puddles, roots, glows on the floor)
// and 'front' (after sprites: wards, flames, drips, bolts, halos). Unknown statuses fall back to a small buff/debuff mark.
const { rng } = require('../shared/parchment');

const TAU = Math.PI * 2;
const a2 = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function box(a, s) { const w = Math.max(30, a.w || 90) * s, h = Math.max(40, a.h || 120) * s; return { cx: a.x * s, fy: a.feetY * s, w, h, top: a.feetY * s - h, mid: a.feetY * s - h * 0.5 }; }
function groundGlow(c, b, col, alpha, k = 0.8) { c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.3); const g = c.createRadialGradient(0, 0, 2, 0, 0, b.w * k); g.addColorStop(0, a2(col, alpha)); g.addColorStop(1, a2(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, b.w * k, 0, TAU); c.fill(); c.restore(); }
function ring(c, b, col, alpha, k, lw, dash) { c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.28); c.lineWidth = lw / 0.28 * 0.5 + lw * 0.4; c.strokeStyle = a2(col, alpha); if (dash) c.setLineDash(dash); c.beginPath(); c.arc(0, 0, b.w * k, 0, TAU); c.stroke(); c.restore(); }

const GROUND = {
  shield(c, b, s) { // arcane ward circle: double ring, tick marks, rune dashes, blue floor glow
    groundGlow(c, b, '#6fb4ff', 0.34, 0.85); ring(c, b, '#9fd0ff', 0.9, 0.66, 2.4 * s); ring(c, b, '#cfe6ff', 0.55, 0.78, 1.2 * s, [4 * s, 5 * s]);
    c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.28); c.strokeStyle = 'rgba(190,225,255,0.8)'; c.lineWidth = 2 * s;
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU, r0 = b.w * 0.66, r1 = b.w * (i % 3 ? 0.72 : 0.8); c.beginPath(); c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); c.stroke(); }
    c.restore();
  },
  regen(c, b, s) { groundGlow(c, b, '#5fe88a', 0.3, 0.8); ring(c, b, '#8ff0ad', 0.75, 0.6, 2 * s); },
  blessing(c, b, s) { groundGlow(c, b, '#ffd666', 0.34, 0.85); ring(c, b, '#ffe8a0', 0.85, 0.62, 2.2 * s); ring(c, b, '#fff4cc', 0.5, 0.72, 1 * s, [3 * s, 5 * s]); },
  taunt(c, b, s) { // red aggro ring with inward chevrons
    groundGlow(c, b, '#ff5a3c', 0.3, 0.9); ring(c, b, '#ff7a5c', 0.9, 0.7, 2.6 * s);
    c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.28); c.fillStyle = 'rgba(255,110,80,0.85)';
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + 0.3; c.save(); c.rotate(an); c.translate(b.w * 0.86, 0); c.beginPath(); c.moveTo(0, 0); c.lineTo(14 * s, -10 * s); c.lineTo(14 * s, 10 * s); c.closePath(); c.rotate(0); c.fill(); c.restore(); }
    c.restore();
  },
  burn(c, b, s) { groundGlow(c, b, '#ff7a2e', 0.4, 0.8); },
  poison(c, b, s, R) { // toxic puddle
    groundGlow(c, b, '#8bd12e', 0.38, 0.85); c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.3);
    c.fillStyle = 'rgba(110,170,30,0.38)'; c.beginPath(); for (let i = 0; i < 14; i++) { const an = i / 14 * TAU, r = b.w * (0.5 + R() * 0.22); c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.closePath(); c.fill();
    c.strokeStyle = 'rgba(170,230,70,0.7)'; c.lineWidth = 2 * s; c.stroke(); c.restore();
  },
  bleed(c, b, s, R) { c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.3); c.fillStyle = 'rgba(120,10,16,0.62)'; for (let i = 0; i < 9; i++) { const an = R() * TAU, r = b.w * (0.15 + R() * 0.5), rr = (3 + R() * 7) * s; c.beginPath(); c.arc(Math.cos(an) * r, Math.sin(an) * r, rr, 0, TAU); c.fill(); } c.restore(); },
  freeze(c, b, s) { groundGlow(c, b, '#bfeaff', 0.5, 0.85); ring(c, b, '#e6f7ff', 0.85, 0.62, 2 * s); },
  slow(c, b, s) { // sludgy spiral mire
    groundGlow(c, b, '#4a6fd0', 0.32, 0.85); c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.28); c.strokeStyle = 'rgba(130,170,255,0.8)'; c.lineWidth = 2.4 * s; c.beginPath();
    for (let t = 0; t < 3.2 * Math.PI; t += 0.1) { const r = b.w * (0.12 + t * 0.075); c.lineTo(Math.cos(t) * r, Math.sin(t) * r); } c.stroke(); c.restore();
  },
  shock(c, b, s) { groundGlow(c, b, '#ffe84a', 0.36, 0.8); ring(c, b, '#fff08a', 0.75, 0.55, 1.8 * s, [8 * s, 4 * s]); },
  curse(c, b, s) { // purple hex-sigil circle
    groundGlow(c, b, '#8a4fd6', 0.4, 0.9); ring(c, b, '#b78af0', 0.9, 0.66, 2.2 * s);
    c.save(); c.translate(b.cx, b.fy); c.scale(1, 0.28); c.strokeStyle = 'rgba(200,160,255,0.85)'; c.lineWidth = 2 * s; c.beginPath();
    for (let i = 0; i < 7; i++) { const an = -Math.PI / 2 + i * 2 * Math.PI * 3 / 7, r = b.w * 0.66; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.closePath(); c.stroke(); c.restore();
  },
  vulnerability(c, b, s) { groundGlow(c, b, '#ff3a3a', 0.28, 0.75); ring(c, b, '#ff6a6a', 0.7, 0.55, 1.6 * s, [3 * s, 4 * s]); },
  weak(c, b, s) { groundGlow(c, b, '#6a7a96', 0.4, 0.8); },
  root(c, b, s, R) { // thorny roots erupting round the feet
    c.save(); c.translate(b.cx, b.fy); c.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1, x0 = side * b.w * (0.1 + R() * 0.35), len = b.h * (0.12 + R() * 0.2), cur = (R() - 0.5) * 30 * s;
      c.strokeStyle = '#3a2a14'; c.lineWidth = (5 - i * 0.3) * s; c.beginPath(); c.moveTo(x0, 4 * s); c.quadraticCurveTo(x0 + cur, -len * 0.5, x0 - side * 8 * s, -len); c.stroke();
      c.strokeStyle = '#6f8f2c'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(x0, 3 * s); c.quadraticCurveTo(x0 + cur, -len * 0.5, x0 - side * 8 * s, -len); c.stroke(); }
    c.restore();
  },
};

const FRONT = {
  shield(c, b, s, R, fx) { // rim-lit hex ward: clear interior, glowing hex-cell rim, bright crown (NOT a filled bubble)
    const rx = b.w * 0.6, ry = b.h * 0.58, cx = b.cx, cy = b.fy - b.h * 0.52;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.clip();
    const g = c.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.62, cx, cy, Math.max(rx, ry)); g.addColorStop(0, 'rgba(120,190,255,0)'); g.addColorStop(1, 'rgba(120,190,255,0.34)'); c.fillStyle = g; c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const hr = 9 * s, hw = Math.sqrt(3) * hr; c.strokeStyle = 'rgba(170,215,255,0.28)'; c.lineWidth = 1 * s;
    for (let row = -8; row < 9; row++) for (let col = -8; col < 9; col++) { const x = cx + col * hw + (row % 2 ? hw / 2 : 0), y = cy + row * hr * 1.5; const d = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2); if (d < 0.45) continue; c.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; c.lineTo(x + Math.cos(an) * hr, y + Math.sin(an) * hr); } c.closePath(); c.stroke(); }
    c.restore();
    c.save(); c.strokeStyle = 'rgba(190,225,255,0.95)'; c.lineWidth = 2.2 * s; c.shadowColor = 'rgba(120,190,255,0.8)'; c.shadowBlur = 8 * s; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.stroke(); c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3 * s; c.lineCap = 'round'; c.beginPath(); c.ellipse(cx, cy, rx * 0.9, ry * 0.9, 0, Math.PI * 1.08, Math.PI * 1.42); c.stroke(); c.restore();
    const v = Math.floor(Number(fx && fx.value) || 0); // absorb pill
    if (v > 0) { const lab = String(v), pw = Math.max(34 * s, 14 * s + lab.length * 7.5 * s), ph = 16 * s, py = b.fy + 6 * s;
      c.save(); c.beginPath(); c.moveTo(b.cx - pw / 2 + ph / 2, py); c.arcTo(b.cx + pw / 2, py, b.cx + pw / 2, py + ph, ph / 2); c.arcTo(b.cx + pw / 2, py + ph, b.cx - pw / 2, py + ph, ph / 2); c.arcTo(b.cx - pw / 2, py + ph, b.cx - pw / 2, py, ph / 2); c.arcTo(b.cx - pw / 2, py, b.cx + pw / 2, py, ph / 2); c.closePath();
      c.fillStyle = 'rgba(8,14,30,0.9)'; c.fill(); c.lineWidth = 1.4 * s; c.strokeStyle = 'rgba(160,210,255,0.95)'; c.stroke();
      c.fillStyle = '#d6eaff'; c.font = `bold ${10.5 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab, b.cx, py + ph / 2 + 0.5); c.restore(); }
  },
  regen(c, b, s, R) { // rising green plus-motes + leaf sparks
    for (let i = 0; i < 9; i++) { const x = b.cx + (R() - 0.5) * b.w * 1.1, y = b.fy - b.h * (0.1 + R() * 0.85), r = (3 + R() * 3.5) * s; c.fillStyle = a2('#7ff0a0', 0.4 + R() * 0.5);
      if (i % 3 === 0) { c.fillRect(x - r, y - r * 0.32, r * 2, r * 0.64); c.fillRect(x - r * 0.32, y - r, r * 0.64, r * 2); } else { c.beginPath(); c.arc(x, y, r * 0.5, 0, TAU); c.fill(); } }
  },
  blessing(c, b, s) { // halo + soft light beam from above
    const g = c.createLinearGradient(0, b.top - 60 * s, 0, b.fy); g.addColorStop(0, 'rgba(255,230,140,0)'); g.addColorStop(0.4, 'rgba(255,230,140,0.2)'); g.addColorStop(1, 'rgba(255,230,140,0.05)');
    c.fillStyle = g; c.beginPath(); c.moveTo(b.cx - b.w * 0.2, b.top - 60 * s); c.lineTo(b.cx + b.w * 0.2, b.top - 60 * s); c.lineTo(b.cx + b.w * 0.6, b.fy); c.lineTo(b.cx - b.w * 0.6, b.fy); c.closePath(); c.fill();
    c.save(); c.translate(b.cx, b.top - 6 * s); c.scale(1, 0.32); c.strokeStyle = '#ffe9a0'; c.lineWidth = 4.5 * s; c.shadowColor = '#ffd666'; c.shadowBlur = 10 * s; c.beginPath(); c.arc(0, 0, b.w * 0.26, 0, TAU); c.stroke(); c.restore();
  },
  taunt(c, b, s) { c.save(); c.translate(b.cx, b.top - 22 * s); c.fillStyle = '#ff6a4a'; c.strokeStyle = '#1a0a06'; c.lineWidth = 3 * s; c.font = `bold ${22 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('!', 0, 0); c.fillText('!', 0, 0); c.restore(); },
  burn(c, b, s, R) { // flame tongues licking the LEGS (owner-agent TODO box check: 6 tall tongues to 56% of the sprite read as engulfing the unit — kept to 4 short ones at the feet + sparser embers)
    for (let i = 0; i < 4; i++) { const x = b.cx + (i - 1.5) * b.w * 0.2, h = b.h * (0.14 + R() * 0.16), w = 8 * s + R() * 5 * s, y = b.fy - 2 * s;
      const g = c.createLinearGradient(0, y, 0, y - h); g.addColorStop(0, 'rgba(255,200,60,0.85)'); g.addColorStop(0.5, 'rgba(255,110,30,0.65)'); g.addColorStop(1, 'rgba(220,40,10,0)'); c.fillStyle = g;
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.5, y - h * 0.55, x + (R() - 0.5) * 6 * s, y - h); c.quadraticCurveTo(x + w * 0.5, y - h * 0.5, x + w, y); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(255,190,70,0.85)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(b.cx + (R() - 0.5) * b.w * 0.9, b.fy - b.h * (0.1 + R() * 0.5), (1 + R() * 1.6) * s, 0, TAU); c.fill(); }
  },
  poison(c, b, s, R) { // rising toxic bubbles + green tint at the feet
    for (let i = 0; i < 9; i++) { const x = b.cx + (R() - 0.5) * b.w * 0.9, y = b.fy - b.h * (0.1 + R() * 0.9), r = (2.5 + R() * 5) * s; c.fillStyle = 'rgba(150,215,50,0.25)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = 'rgba(190,240,90,0.8)'; c.lineWidth = 1.2 * s; c.stroke(); c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, TAU); c.fill(); }
  },
  bleed(c, b, s, R) { // blood drips falling from the body
    for (let i = 0; i < 6; i++) { const x = b.cx + (R() - 0.5) * b.w * 0.8, y = b.fy - b.h * (0.15 + R() * 0.7), l = (8 + R() * 14) * s; const g = c.createLinearGradient(0, y, 0, y + l); g.addColorStop(0, 'rgba(150,10,20,0.9)'); g.addColorStop(1, 'rgba(190,20,30,0.2)'); c.strokeStyle = g; c.lineWidth = 2.6 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + l); c.stroke(); c.fillStyle = 'rgba(180,15,25,0.95)'; c.beginPath(); c.arc(x, y + l, 2.5 * s, 0, TAU); c.fill(); }
  },
  freeze(c, b, s, R) { // rime wash over the legs + crystal shards
    const g = c.createLinearGradient(0, b.top, 0, b.fy); g.addColorStop(0, 'rgba(200,238,255,0.06)'); g.addColorStop(1, 'rgba(200,238,255,0.4)'); c.fillStyle = g; c.fillRect(b.cx - b.w * 0.5, b.top, b.w, b.h);
    for (let i = 0; i < 9; i++) { const side = i % 2 ? 1 : -1, x = b.cx + side * b.w * (0.12 + R() * 0.42), hgt = b.h * (0.12 + R() * 0.28), w = (5 + R() * 6) * s; c.fillStyle = 'rgba(210,244,255,0.7)'; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.2 * s; c.beginPath(); c.moveTo(x - w, b.fy); c.lineTo(x + (R() - 0.5) * 4 * s, b.fy - hgt); c.lineTo(x + w, b.fy); c.closePath(); c.fill(); c.stroke(); }
  },
  slow(c, b, s) { // heavy chain links dragging at the ankles + downward chevrons
    c.save(); c.strokeStyle = 'rgba(150,180,255,0.9)'; c.lineWidth = 2.4 * s; for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(b.cx + sd * (b.w * 0.2 + i * 9 * s), b.fy - 4 * s + i * 2 * s, 5 * s, 3.2 * s, 0, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(140,175,255,0.7)'; for (let i = 0; i < 2; i++) { const y = b.top + b.h * (0.25 + i * 0.18); c.beginPath(); c.moveTo(b.cx - 8 * s, y); c.lineTo(b.cx, y + 7 * s); c.lineTo(b.cx + 8 * s, y); c.lineTo(b.cx + 8 * s, y - 4 * s); c.lineTo(b.cx, y + 3 * s); c.lineTo(b.cx - 8 * s, y - 4 * s); c.closePath(); c.fill(); } c.restore();
  },
  shock(c, b, s, R) { // jagged forks wrapped round the body
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { let x = b.cx + (R() - 0.5) * b.w * 0.9, y = b.top + R() * b.h * 0.2; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 22 * s; y += b.h * 0.17; c.lineTo(x, y); }
      c.strokeStyle = 'rgba(255,240,110,0.45)'; c.lineWidth = 7 * s; c.stroke(); c.strokeStyle = '#fffbd0'; c.lineWidth = 2 * s; c.stroke(); }
    c.restore();
  },
  curse(c, b, s, R) { // dark violet wisps curling up + hanging chain-less rune over the head
    for (let i = 0; i < 4; i++) { const x = b.cx + (i - 1.5) * b.w * 0.24; c.strokeStyle = `rgba(150,90,220,${0.35 + R() * 0.3})`; c.lineWidth = 3.4 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, b.fy - 4 * s); c.bezierCurveTo(x - 14 * s, b.fy - b.h * 0.3, x + 14 * s, b.fy - b.h * 0.55, x, b.fy - b.h * (0.75 + R() * 0.2)); c.stroke(); }
  },
  vulnerability(c, b, s, R) { // cracked red reticle on the torso
    const cy = b.mid, r = Math.min(b.w, b.h) * 0.36; c.save(); c.strokeStyle = 'rgba(255,80,80,0.85)'; c.lineWidth = 2 * s; c.beginPath(); c.arc(b.cx, cy, r, 0, TAU); c.stroke(); c.beginPath(); c.arc(b.cx, cy, r * 0.5, 0, TAU); c.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.beginPath(); c.moveTo(b.cx + dx * r * 0.7, cy + dy * r * 0.7); c.lineTo(b.cx + dx * r * 1.3, cy + dy * r * 1.3); c.stroke(); }
    c.strokeStyle = 'rgba(255,230,230,0.9)'; c.lineWidth = 1.4 * s; c.beginPath(); c.moveTo(b.cx - r * 0.2, cy - r * 0.9); c.lineTo(b.cx + r * 0.1, cy - r * 0.3); c.lineTo(b.cx - r * 0.1, cy + r * 0.1); c.lineTo(b.cx + r * 0.25, cy + r * 0.8); c.stroke(); c.restore();
  },
  weak(c, b, s) { // sagging dark chevrons + dimmer wash on the upper body
    c.save(); const g = c.createLinearGradient(0, b.top, 0, b.mid); g.addColorStop(0, 'rgba(30,40,70,0.22)'); g.addColorStop(1, 'rgba(30,40,70,0)'); c.fillStyle = g; c.fillRect(b.cx - b.w * 0.5, b.top, b.w, b.h * 0.5);
    c.strokeStyle = 'rgba(160,175,205,0.85)'; c.lineWidth = 3 * s; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const y = b.top - 6 * s - i * 9 * s; c.beginPath(); c.moveTo(b.cx - 11 * s, y); c.lineTo(b.cx, y + 7 * s); c.lineTo(b.cx + 11 * s, y); c.globalAlpha = 1 - i * 0.28; c.stroke(); } c.restore();
  },
  root() {},
};
const ALIAS = { haste: 'regen', attack_up: 'blessing', defense_up: 'shield', aura: 'blessing', stun: 'shock', sleep: 'curse', silence: 'curse', blind: 'curse', brittle: 'freeze', wet: 'slow', oil: 'burn', drown: 'slow', charm: 'curse', infect: 'poison', doom_timer: 'curse' };
const ORDER = ['shield', 'taunt', 'blessing', 'regen', 'freeze', 'root', 'slow', 'curse', 'poison', 'bleed', 'burn', 'shock', 'vulnerability', 'weak'];

/** Draw the auras for one unit. pass: 'ground' (before sprites) or 'front' (after sprites). effects = unit.statusEffects. */
function drawAuras(c, a, effects, s, pass) {
  if (!Array.isArray(effects) || !effects.length) return;
  const table = pass === 'ground' ? GROUND : FRONT, b = box(a, s), seen = new Set(), list = [];
  for (const e of effects) { if (!e) continue; let t = String(e.type); if (!(t in GROUND) && ALIAS[t]) t = ALIAS[t]; if (!(t in GROUND) || seen.has(t)) continue; if (t === 'shield' && !(e.value === undefined || Number(e.value) > 0 || Number(e.duration) >= 900)) continue; seen.add(t); list.push([t, e]); }
  list.sort((x, y) => ORDER.indexOf(x[0]) - ORDER.indexOf(y[0]));
  for (const [t, e] of list) { const fn = table[t]; if (!fn) continue; const R = rng(Math.round(a.x * 7 + a.feetY * 3) + t.length * 101); c.save(); fn(c, b, s, R, e); c.restore(); }
}

module.exports = { drawAuras, GROUND, FRONT };
