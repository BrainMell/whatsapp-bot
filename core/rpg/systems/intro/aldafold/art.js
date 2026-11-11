'use strict';
// Aldafold intro — all the paper-cutout pieces (procedural, no bitmap assets). Figures are drawn with feet at (0,0), ~100 units tall, facing +x.
const K = require('./paperKit');
const { cutout, jitterPoly, pathPoly, pathSmooth, rng } = K;

// ---- palette (matches the logo: indigo / violet / antique gold / bone) ----------------------------------------------------
const PAL = {
  ink: '#07060d', night: '#0c0a1a', indigo: '#1a1838', indigo2: '#262452', violet: '#3b3375', mist: '#6a64a8', lilac: '#9b95d6',
  gold: '#d9b25f', goldHi: '#f3dc9a', bone: '#efe6cf', crimson: '#8a1420', blood: '#c2261f', ember: '#ff7a2a', flame: '#ffb347',
};

function bounds(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return { x0, y0, x1, y1 }; }
// Build a sprite from a local-coordinate painter. bb = bounds in local units. Returns {canvas, ax, ay, w, h}
function piece(paint, bb, opts = {}) {
  const sc = opts.scale || 1, pad = opts.pad == null ? 8 : opts.pad;
  const w = (bb.x1 - bb.x0) * sc, h = (bb.y1 - bb.y0) * sc;
  const c = cutout(w, h, (g) => { g.scale(sc, sc); g.translate(-bb.x0, -bb.y0); paint(g); }, Object.assign({ pad }, opts));
  return { canvas: c.canvas, ax: (-bb.x0) * sc + c.pad, ay: (-bb.y0) * sc + c.pad, w: c.w, h: c.h, sc };
}
function drawPiece(ctx, p, x, y, o = {}) {
  const s = o.s == null ? 1 : o.s, sx = (o.flip ? -1 : 1) * s * (o.sx == null ? 1 : o.sx), sy = s * (o.sy == null ? 1 : o.sy);
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(sx, sy);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.drawImage(p.canvas, -p.ax, -p.ay); ctx.restore();
}

// ---- tiny shape helpers -------------------------------------------------------------------------------------------------
const poly = (g, pts) => { pathPoly(g, pts); g.fill(); };
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
const thick = (g, x0, y0, x1, y1, w) => { g.save(); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore(); };
function cape(g, x0, y0, x1, y1, len, flare, sway = 0) {          // flowing cloak from shoulder line (x0..x1 at y0) down/back
  g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 - len * 0.5 - sway, y0 + 18, x0 - len - sway * 1.4, y1 - 22, x0 - len * 0.55 - flare, y1);
  g.lineTo(x0 - len * 0.15, y1 - 2); g.lineTo(x0 + 3, y1 - 10); g.quadraticCurveTo(x1 - 2, y0 + 20, x1, y0); g.closePath(); g.fill();
}

// ===================================================== WARRIORS ============================================================
// tapered limb: capsule from (x0,y0) width w0 to (x1,y1) width w1
function limb(g, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  g.beginPath(); g.moveTo(x0 + c * w0 / 2, y0 + s * w0 / 2); g.lineTo(x1 + c * w1 / 2, y1 + s * w1 / 2); g.lineTo(x1 - c * w1 / 2, y1 - s * w1 / 2); g.lineTo(x0 - c * w0 / 2, y0 - s * w0 / 2); g.closePath(); g.fill();
  g.beginPath(); g.arc(x0, y0, w0 / 2, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x1, y1, w1 / 2, 0, Math.PI * 2); g.fill();
}
const legs = (g, hipY = -50, stance = 5, boot = 1) => {           // two tapered legs with boots
  limb(g, -stance + 1, hipY, -stance - 1, -27, 9, 7); limb(g, -stance - 1, -27, -stance - 1, -4, 7, 5.5); poly(g, [[-stance - 4.5, 0], [-stance + 3.5 + boot * 3, 0], [-stance + 2.5, -5], [-stance - 3.5, -6]]);
  limb(g, stance - 1, hipY, stance + 1, -27, 9, 7); limb(g, stance + 1, -27, stance + 1, -4, 7, 5.5); poly(g, [[stance - 3.5, 0], [stance + 4.5 + boot * 3, 0], [stance + 3.5, -6], [stance - 2.5, -5]]);
};
const torso = (g, sh = 12, wa = 8, top = -80, bot = -50) => { g.beginPath(); g.moveTo(-sh, top + 2); g.quadraticCurveTo(0, top - 3, sh, top + 2); g.quadraticCurveTo(sh - 1, (top + bot) / 2, wa + 1, bot); g.lineTo(-wa - 1, bot); g.quadraticCurveTo(-sh + 1, (top + bot) / 2, -sh, top + 2); g.closePath(); g.fill(); };
const head = (g, x = 0, y = -92, r = 5.6) => { ell(g, x, y, r * 0.88, r); poly(g, [[x - 2.4, y + r - 1], [x + 2.4, y + r - 1], [x + 3, y + r + 4], [x - 3, y + r + 4]]); };
const WARRIORS = {
  knight(g) {
    cape(g, -10, -80, 10, -3, 24, 4, 2);
    legs(g); poly(g, [[-10, -48], [10, -48], [12, -62], [-12, -62]]);
    torso(g, 12.5, 8.5); ell(g, -13.5, -76, 8, 4.6, -0.5); ell(g, 13.5, -76, 8, 4.6, 0.5);
    limb(g, -13, -78, -12, -62, 6.5, 5.5); limb(g, -12, -62, -2, -58, 5.5, 5); limb(g, 13, -78, 12, -63, 6.5, 5.5); limb(g, 12, -63, 3, -57, 5.5, 5);
    head(g, 0, -92, 6.2); poly(g, [[-5.5, -97], [5.5, -97], [6, -90], [-6, -90]]);
    g.beginPath(); g.moveTo(0, -98); g.bezierCurveTo(-6, -112, -22, -108, -30, -92); g.bezierCurveTo(-18, -98, -9, -94, -6, -92); g.closePath(); g.fill();      // plume
    poly(g, [[-9, -58], [13, -58], [13, -54.5], [-9, -54.5]]); ell(g, 2, -58, 2.4, 2.4);
    poly(g, [[0.5, -54.5], [3.5, -54.5], [2, 5]]);                                                              // sword point-down
  },
  mage(g) {
    cape(g, -9, -78, 9, -2, 24, 8, 3);
    g.beginPath(); g.moveTo(-8, -76); g.quadraticCurveTo(0, -81, 8, -76); g.bezierCurveTo(10, -50, 17, -20, 20, 0); g.lineTo(-20, 0); g.bezierCurveTo(-17, -20, -10, -50, -8, -76); g.closePath(); g.fill();
    limb(g, 9, -76, 17, -62, 6, 5); limb(g, -9, -76, -12, -60, 6, 5);
    g.beginPath(); g.moveTo(-7, -80); g.bezierCurveTo(-9, -100, 2, -108, 13, -100); g.bezierCurveTo(8, -97, 8, -88, 8, -80); g.closePath(); g.fill(); ell(g, 1, -88, 5.5, 7);
    thick(g, 21, 6, 21, -104, 2.8); ell(g, 21, -112, 5.5, 5.5);
    g.beginPath(); g.moveTo(14, -120); g.quadraticCurveTo(12, -110, 17, -105); g.lineTo(17, -109); g.quadraticCurveTo(15, -113, 16, -120); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(28, -120); g.quadraticCurveTo(30, -110, 25, -105); g.lineTo(25, -109); g.quadraticCurveTo(27, -113, 26, -120); g.closePath(); g.fill();
    limb(g, 17, -62, 21, -66, 5, 4.5);
  },
  archer(g) {
    cape(g, -8, -78, 8, -2, 22, 5, 3);
    legs(g, -50, 4.5, 1); torso(g, 10, 7, -80, -50);
    g.beginPath(); g.moveTo(-6, -80); g.bezierCurveTo(-8, -102, 0, -108, 11, -100); g.bezierCurveTo(14, -90, 8, -84, 8, -80); g.closePath(); g.fill(); ell(g, 1, -91, 5.2, 6.5);
    g.save(); g.translate(-10, -74); g.rotate(-0.32); poly(g, [[-3.5, 0], [3.5, 0], [3.5, 30], [-3.5, 30]]); g.restore();
    poly(g, [[-16, -78], [-12, -84], [-9, -76]]); poly(g, [[-13, -82], [-9, -90], [-7, -80]]);
    g.save(); g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.arc(16, -66, 42, -1.0, 1.0); g.stroke(); g.lineWidth = 0.9; g.beginPath(); g.moveTo(16 + Math.cos(-1) * 42, -66 + Math.sin(-1) * 42); g.lineTo(16 + Math.cos(1) * 42, -66 + Math.sin(1) * 42); g.stroke(); g.restore();
    limb(g, 8, -77, 18, -68, 5.5, 4.8); limb(g, -6, -76, 8, -66, 5, 4.5);
  },
  brute(g) {
    cape(g, -15, -80, 15, -3, 20, 4);
    legs(g, -50, 7, 1); poly(g, [[-13, -46], [13, -46], [15, -62], [-15, -62]]);
    torso(g, 17, 11, -83, -50); ell(g, -19.5, -79, 10, 5.6, -0.45); ell(g, 19.5, -79, 10, 5.6, 0.45);
    limb(g, -19, -80, -22, -62, 9, 7); limb(g, -22, -62, -16, -50, 7, 6.5);
    head(g, 0, -95, 6.8); poly(g, [[-6.4, -100], [6.4, -100], [7, -92], [-7, -92]]);
    g.beginPath(); g.moveTo(-6, -98); g.bezierCurveTo(-14, -100, -20, -108, -17, -118); g.bezierCurveTo(-14, -110, -9, -106, -4, -104); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(6, -98); g.bezierCurveTo(14, -100, 20, -108, 17, -118); g.bezierCurveTo(14, -110, 9, -106, 4, -104); g.closePath(); g.fill();
    g.save(); g.translate(20, -78); g.rotate(0.55); limb(g, 0, 8, 0, -44, 3.4, 3.4); poly(g, [[-12, -44], [12, -44], [12, -62], [-12, -62]]); poly(g, [[-15, -49], [-12, -49], [-12, -58], [-15, -58]]); g.restore();
    limb(g, 19, -80, 24, -66, 8, 7);
  },
  rogue(g) {
    g.save(); g.translate(2, 0); g.rotate(0.1);
    cape(g, -7, -66, 7, -2, 32, 8, 6);
    limb(g, -4, -38, -9, -20, 9, 7); limb(g, -9, -20, -9, -4, 7, 5.5); poly(g, [[-13, 0], [-3, 0], [-5, -6], [-12, -6]]);
    limb(g, 5, -38, 12, -24, 9, 7); limb(g, 12, -24, 6, -4, 7, 5.5); poly(g, [[2, 0], [11, 0], [11, -6], [3, -6]]);
    torso(g, 10, 7, -68, -38); limb(g, 8, -66, 20, -52, 5.5, 4.8); limb(g, -8, -66, -16, -50, 5.5, 4.8);
    g.beginPath(); g.moveTo(-6, -68); g.bezierCurveTo(-8, -86, 2, -92, 10, -86); g.bezierCurveTo(12, -76, 8, -72, 8, -68); g.closePath(); g.fill(); ell(g, 3, -77, 5, 6.5);
    g.beginPath(); g.moveTo(-6, -74); g.bezierCurveTo(-26, -74, -34, -64, -48, -70); g.bezierCurveTo(-34, -60, -24, -64, -6, -68); g.closePath(); g.fill();
    poly(g, [[19, -54], [38, -46], [36, -42], [18, -49]]); poly(g, [[37, -47], [52, -50], [38, -43]]);
    poly(g, [[-15, -52], [-30, -42], [-28, -38], [-14, -47]]); poly(g, [[-29, -41], [-40, -36], [-28, -37]]);
    g.restore();
  },
  maiden(g) {
    g.beginPath(); g.moveTo(-5, -90); g.bezierCurveTo(-22, -86, -26, -62, -20, -42); g.bezierCurveTo(-14, -60, -10, -72, -4, -82); g.closePath(); g.fill();   // braid
    legs(g, -50, 4.5, 1); g.beginPath(); g.moveTo(-10, -48); g.lineTo(10, -48); g.lineTo(13, -34); g.lineTo(-13, -34); g.closePath(); g.fill();
    torso(g, 10.5, 7.5, -80, -48); ell(g, -12, -77, 7, 4, -0.5); ell(g, 12, -77, 7, 4, 0.5);
    head(g, 0, -91, 5.6); poly(g, [[-5, -96], [5, -96], [5.5, -89], [-5.5, -89]]);
    g.beginPath(); g.moveTo(-5, -96); g.quadraticCurveTo(-18, -104, -24, -98); g.quadraticCurveTo(-14, -97, -6, -92); g.fill();
    g.beginPath(); g.moveTo(5, -96); g.quadraticCurveTo(18, -104, 24, -98); g.quadraticCurveTo(14, -97, 6, -92); g.fill();
    ell(g, 17, -58, 15, 15); limb(g, 11, -78, 14, -64, 6, 5);
    g.save(); g.translate(-14, -66); g.rotate(-0.55); limb(g, 0, 22, 0, -34, 3.2, 3.2); g.beginPath(); g.moveTo(1.6, -34); g.quadraticCurveTo(18, -40, 16, -20); g.quadraticCurveTo(10, -25, 1.6, -21); g.fill(); g.restore();
    limb(g, -11, -78, -14, -64, 6, 5);
  },
  bearer(g) {
    cape(g, -10, -80, 10, -3, 22, 5, 2);
    legs(g); poly(g, [[-10, -48], [10, -48], [12, -62], [-12, -62]]); torso(g, 12.5, 8.5);
    ell(g, -13.5, -76, 8, 4.6, -0.5); ell(g, 13.5, -76, 8, 4.6, 0.5); limb(g, 13, -78, 16, -62, 6.5, 5.5);
    head(g, 0, -92, 6.2); poly(g, [[-5.5, -97], [5.5, -97], [6, -90], [-6, -90]]);
    g.beginPath(); g.moveTo(0, -98); g.lineTo(-3, -107); g.lineTo(3, -107); g.closePath(); g.fill();
    thick(g, 17, 6, 17, -150, 2.6); g.beginPath(); g.moveTo(17, -160); g.lineTo(21, -148); g.lineTo(13, -148); g.closePath(); g.fill();
    limb(g, -13, -78, -10, -62, 6.5, 5.5);
  },
};
const WARRIOR_BOUNDS = {
  knight: { x0: -40, y0: -114, x1: 22, y1: 8 }, mage: { x0: -26, y0: -124, x1: 36, y1: 6 }, archer: { x0: -26, y0: -100, x1: 62, y1: 6 }, brute: { x0: -34, y0: -118, x1: 46, y1: 6 },
  rogue: { x0: -52, y0: -86, x1: 46, y1: 6 }, maiden: { x0: -28, y0: -112, x1: 40, y1: 6 }, bearer: { x0: -34, y0: -164, x1: 30, y1: 8 },
};
function warrior(kind, o = {}) {
  const scale = o.scale || 2.2;
  return piece(WARRIORS[kind], WARRIOR_BOUNDS[kind], { scale, color: o.color || PAL.ink, top: o.top || '#14122a', edgeColor: o.edgeColor || '#6f69b5', edgeA: o.edgeA == null ? 0.6 : o.edgeA, shadow: o.shadow, seed: o.seed || 1 });
}

// ===================================================== CREATURES (Chaos) ====================================================
const CREATURES = {
  hound(g) {                                                                       // hunched horned beast on all fours-ish
    g.beginPath(); g.moveTo(-34, -30); g.bezierCurveTo(-30, -52, -6, -60, 14, -52); g.bezierCurveTo(26, -48, 34, -44, 44, -50); g.lineTo(52, -44); g.lineTo(46, -34); g.lineTo(38, -30); g.bezierCurveTo(24, -26, 6, -22, -6, -22); g.bezierCurveTo(-18, -22, -28, -22, -34, -30); g.closePath(); g.fill();
    for (let i = 0; i < 7; i++) poly(g, [[-24 + i * 8, -52 + Math.abs(i - 3) * 2], [-20 + i * 8, -66 - (i % 2) * 6], [-15 + i * 8, -53]]);   // spine spikes
    poly(g, [[-30, -28], [-22, -28], [-26, 0], [-34, 0]]); poly(g, [[-8, -24], [0, -24], [-2, 0], [-10, 0]]); poly(g, [[22, -28], [30, -28], [28, 0], [20, 0]]); poly(g, [[38, -32], [46, -34], [52, 0], [44, 0]]);
    poly(g, [[-34, 0], [-22, 0], [-28, -4]]); poly(g, [[44, 0], [58, 0], [52, -4]]);
    g.beginPath(); g.moveTo(48, -50); g.quadraticCurveTo(52, -66, 60, -72); g.quadraticCurveTo(56, -60, 58, -48); g.fill();    // horn
    g.beginPath(); g.moveTo(42, -52); g.quadraticCurveTo(40, -70, 32, -76); g.quadraticCurveTo(38, -62, 38, -50); g.fill();
    g.beginPath(); g.moveTo(-34, -34); g.bezierCurveTo(-52, -38, -60, -26, -70, -34); g.bezierCurveTo(-60, -22, -48, -26, -34, -26); g.closePath(); g.fill();    // tail
  },
  stalker(g) {                                                                     // tall spindly antlered thing
    poly(g, [[-5, 0], [-2, 0], [0, -50], [-6, -52]]); poly(g, [[2, 0], [6, 0], [7, -52], [1, -50]]);
    g.beginPath(); g.moveTo(-8, -50); g.lineTo(8, -50); g.lineTo(6, -96); g.lineTo(-6, -96); g.closePath(); g.fill();
    poly(g, [[-8, -92], [-30, -60], [-34, -20], [-30, -18], [-24, -58], [-6, -80]]); poly(g, [[8, -92], [30, -60], [36, -20], [32, -18], [26, -56], [6, -80]]);
    poly(g, [[-34, -20], [-40, 0], [-36, 0], [-30, -18]]); poly(g, [[36, -20], [42, 0], [38, 0], [32, -18]]);
    ell(g, 0, -106, 7, 9);
    const antler = (sx) => { g.save(); g.scale(sx, 1); g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(4, -112); g.quadraticCurveTo(16, -124, 14, -146); g.moveTo(10, -122); g.lineTo(22, -126); g.moveTo(14, -134); g.lineTo(24, -144); g.moveTo(14, -146); g.lineTo(10, -158); g.stroke(); g.restore(); };
    antler(1); antler(-1);
  },
  maw(g) {                                                                         // writhing tentacled mass
    ell(g, 0, -34, 34, 30);
    const r = rng(11);
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9, x = Math.cos(a) * 30, y = -26 + Math.sin(a) * 26; g.save(); g.lineWidth = 7 - i % 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x * 0.5, -22); g.bezierCurveTo(x * 1.6, y - 20, x * 2.0 + (r() - 0.5) * 30, y - 50 - r() * 20, x * 1.7 + (r() - 0.5) * 40, y - 70 - r() * 30); g.stroke(); g.restore(); }
    for (let i = 0; i < 6; i++) { g.save(); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); const x = -26 + i * 10; g.moveTo(x, -10); g.bezierCurveTo(x + (r() - 0.5) * 30, 0, x + (r() - 0.5) * 40, 8, x + (r() - 0.5) * 36, 16); g.stroke(); g.restore(); }
  },
  winged_body(g) {
    ell(g, 0, -20, 9, 15); ell(g, 0, -42, 8, 8);
    poly(g, [[-6, -48], [-12, -64], [-3, -50]]); poly(g, [[6, -48], [12, -64], [3, -50]]);
    g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(10, 10, 4, 22); g.lineTo(0, 12); g.closePath(); g.fill();
  },
  wing(g) {                                                                        // right wing, pivot at (0,0), extends +x
    g.beginPath(); g.moveTo(0, 0); g.lineTo(34, -34); g.quadraticCurveTo(44, -30, 52, -42); g.quadraticCurveTo(54, -20, 70, -22); g.quadraticCurveTo(66, -6, 82, 0); g.quadraticCurveTo(56, 4, 48, 20); g.quadraticCurveTo(32, 8, 20, 22); g.quadraticCurveTo(14, 12, 0, 8); g.closePath(); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(2, 2); g.lineTo(34, -30); g.moveTo(2, 4); g.lineTo(52, -38); g.moveTo(2, 4); g.lineTo(70, -18); g.moveTo(2, 5); g.lineTo(80, -2); g.stroke(); g.restore();
  },
};
const CREATURE_BOUNDS = { hound: { x0: -74, y0: -80, x1: 66, y1: 6 }, stalker: { x0: -44, y0: -162, x1: 46, y1: 4 }, maw: { x0: -80, y0: -150, x1: 80, y1: 22 }, winged_body: { x0: -16, y0: -66, x1: 16, y1: 24 }, wing: { x0: -2, y0: -48, x1: 86, y1: 26 } };
function creature(kind, o = {}) {
  return piece(CREATURES[kind], CREATURE_BOUNDS[kind], { scale: o.scale || 1.6, color: o.color || '#0a0509', top: o.top || '#1a0a10', edgeColor: o.edgeColor || '#8a2a3a', edgeA: 0.55, seed: o.seed || 3, shadow: o.shadow });
}

// ===================================================== LANDSCAPE LAYERS ==================================================
// Torn-edge ridge: wide strip with rolling/jagged skyline. returns piece anchored at (0, bottom) with ay=bottom so y=0 is the baseline.
function ridge(w, h, seed, o = {}) {
  const r = rng(seed), pts = [[0, h + 20]]; let y = h * (o.base == null ? 0.5 : o.base);
  const n = Math.round(w / (o.step || 18));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w; y += (r() - 0.5) * (o.rough || 24); y += (h * (o.base == null ? 0.5 : o.base) - y) * 0.12;
    if (o.peaks && r() < o.peaks) y -= r() * (o.peakH || 40);
    pts.push([x, clamp01(y, 0, h)]);
  }
  pts.push([w, h + 20]);
  const sm = jitterPoly(pts, seed + 5, o.tear == null ? 1.1 : o.tear, 9);
  const c = cutout(w, h + 20, (g) => { pathPoly(g, sm); g.fill(); }, { pad: 10, color: o.color, top: o.top, edgeColor: o.edgeColor, edgeA: o.edgeA, seed, shadow: o.shadow || { dx: 0, dy: -3, blur: 7, a: 0.55 }, grain: o.grain });
  return { canvas: c.canvas, ax: c.pad, ay: c.pad + h + 20, w: c.w, h: c.h };
}
const clamp01 = (v, a, b) => Math.max(a, Math.min(b, v));

function forest(w, h, seed, o = {}) {                                                // row of conifer silhouettes
  const r = rng(seed);
  const c = cutout(w, h, (g) => {
    g.beginPath(); g.rect(0, h - 6, w, 8); g.fill();
    for (let x = -10; x < w + 10; x += 6 + r() * 12) {
      const th = h * (0.45 + r() * 0.55), tw = 8 + r() * 10, tiers = 3 + Math.floor(r() * 3);
      g.beginPath(); g.moveTo(x, h - th);
      for (let t = 1; t <= tiers; t++) { const ty = h - th + (th * t) / tiers; g.lineTo(x + (tw * t) / tiers, ty - 2); g.lineTo(x + (tw * (t - 0.4)) / tiers, ty - 2); }
      g.lineTo(x + tw * 0.2, h); g.lineTo(x - tw * 0.2, h);
      for (let t = tiers; t >= 1; t--) { const ty = h - th + (th * t) / tiers; g.lineTo(x - (tw * (t - 0.4)) / tiers, ty - 2); g.lineTo(x - (tw * t) / tiers, ty - 2); }
      g.closePath(); g.fill();
    }
  }, { pad: 8, color: o.color, top: o.top, edgeColor: o.edgeColor, edgeA: o.edgeA, seed, shadow: o.shadow || { dx: 0, dy: -2, blur: 5, a: 0.5 } });
  return { canvas: c.canvas, ax: c.pad, ay: c.pad + h, w: c.w, h: c.h };
}

// Castle — split into pieces so the great tower can collapse. All local coords: ground at y=0, centred on x=0.
function castleBody(g) {
  const tw = (x, w, h, roof) => { poly(g, [[x - w / 2, 0], [x + w / 2, 0], [x + w / 2, -h], [x - w / 2, -h]]); poly(g, [[x - w / 2 - 3, -h], [x + w / 2 + 3, -h], [x, -h - roof]]); };
  poly(g, [[-120, 0], [120, 0], [120, -46], [-120, -46]]);
  for (let x = -118; x < 118; x += 16) poly(g, [[x, -46], [x + 9, -46], [x + 9, -53], [x, -53]]);            // crenellations
  tw(-92, 26, 92, 40); tw(-58, 22, 118, 46); tw(58, 22, 124, 48); tw(92, 28, 98, 42); tw(-24, 16, 80, 30); tw(24, 16, 84, 32);
  poly(g, [[-30, -46], [30, -46], [30, -100], [-30, -100]]);
}
function castleTower(g) {                                                                                       // the tall keep (separate piece)
  poly(g, [[-20, 0], [20, 0], [18, -150], [-18, -150]]); poly(g, [[-26, -150], [26, -150], [0, -214]]); poly(g, [[-24, -110], [24, -110], [22, -118], [-22, -118]]);
  g.beginPath(); g.moveTo(0, -214); g.lineTo(0, -240); g.lineWidth = 2; g.stroke();
}
function castle(o = {}) {
  const body = piece(castleBody, { x0: -128, y0: -190, x1: 128, y1: 6 }, { scale: o.scale || 1.5, color: o.color, top: o.top, edgeColor: o.edgeColor, edgeA: 0.5, seed: 21, shadow: { dx: 0, dy: -2, blur: 6, a: 0.5 } });
  const tower = piece(castleTower, { x0: -34, y0: -252, x1: 34, y1: 6 }, { scale: o.scale || 1.5, color: o.color, top: o.top, edgeColor: o.edgeColor, edgeA: 0.5, seed: 22, shadow: { dx: 0, dy: -2, blur: 6, a: 0.5 } });
  // lit windows (positions in local castle units)
  const windows = [[-92, -62], [-58, -92], [58, -96], [92, -70], [-24, -56], [24, -60], [0, -80], [0, -150], [-58, -52], [58, -50]];
  return { body, tower, windows, scale: o.scale || 1.5 };
}
function brokenKeep(g) {                                                                                         // stump left standing after the collapse
  poly(g, [[-20, 0], [20, 0], [18, -62], [10, -70], [4, -58], [-4, -76], [-12, -60], [-18, -66]]);
}
function brokenKeepPiece(o = {}) { return piece(brokenKeep, { x0: -30, y0: -90, x1: 30, y1: 6 }, { scale: o.scale || 1.5, color: o.color, top: o.top, edgeColor: o.edgeColor, edgeA: 0.5, seed: 23 }); }

function deadTree(seed, h = 170, o = {}) {
  const r = rng(seed);
  return piece((g) => {
    const branch = (x, y, a, len, w, d) => { if (d > 5) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.save(); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); g.restore(); branch(x2, y2, a - 0.4 - r() * 0.4, len * 0.74, w * 0.68, d + 1); if (r() < 0.9) branch(x2, y2, a + 0.4 + r() * 0.5, len * 0.7, w * 0.64, d + 1); };
    branch(0, 0, -Math.PI / 2 + (r() - 0.5) * 0.2, h * 0.34, 9, 0);
  }, { x0: -h * 0.7, y0: -h * 1.05, x1: h * 0.7, y1: 8 }, { scale: 1, color: o.color || PAL.ink, top: o.top, edgeColor: o.edgeColor, seed });
}

function rocks(w, h, seed, o = {}) {                                                                              // foreground crags
  const r = rng(seed);
  const c = cutout(w, h, (g) => {
    g.beginPath(); g.moveTo(0, h);
    let x = 0; while (x < w) { const sw = 30 + r() * 70, ph = h * (0.25 + r() * 0.75); g.lineTo(x + sw * 0.2, h - ph * 0.5); g.lineTo(x + sw * 0.5, h - ph); g.lineTo(x + sw * 0.8, h - ph * 0.6); g.lineTo(x + sw, h - ph * 0.2); x += sw; }
    g.lineTo(w, h); g.closePath(); g.fill();
  }, { pad: 8, color: o.color || '#050409', top: o.top || '#0e0c1c', edgeColor: o.edgeColor || '#5a54a0', edgeA: 0.5, seed, shadow: { dx: 0, dy: -3, blur: 8, a: 0.6 } });
  return { canvas: c.canvas, ax: c.pad, ay: c.pad + h, w: c.w, h: c.h };
}
function grass(w, h, seed, o = {}) {
  const r = rng(seed);
  const c = cutout(w, h, (g) => {
    g.beginPath(); g.rect(0, h - 5, w, 6); g.fill();
    for (let x = 0; x < w; x += 3 + r() * 5) { const bh = h * (0.3 + r() * 0.7), lean = (r() - 0.5) * 10; g.beginPath(); g.moveTo(x - 2, h); g.quadraticCurveTo(x + lean * 0.3, h - bh * 0.6, x + lean, h - bh); g.quadraticCurveTo(x + lean * 0.3 + 2, h - bh * 0.5, x + 2, h); g.closePath(); g.fill(); }
  }, { pad: 6, color: o.color || '#030208', top: o.top || '#07050f', edge: false, seed, shadow: false });
  return { canvas: c.canvas, ax: c.pad, ay: c.pad + h, w: c.w, h: c.h };
}
function cloudStrip(w, h, seed, o = {}) {
  const r = rng(seed);
  const c = cutout(w, h, (g) => {
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x < w; x += 20) { const bh = h * (0.3 + r() * 0.5); g.quadraticCurveTo(x + 10, h - bh * 1.5, x + 20, h - bh * (0.3 + r() * 0.5)); }
    g.lineTo(w, h); g.closePath(); g.fill();
    for (let i = 0; i < 6; i++) { ell(g, r() * w, h * (0.55 + r() * 0.3), 30 + r() * 60, 6 + r() * 10); }
  }, { pad: 10, color: o.color || '#2a2755', top: o.top || '#4a4585', edgeColor: o.edgeColor || '#a39ee0', edgeA: o.edgeA == null ? 0.35 : o.edgeA, seed, shadow: { dx: 0, dy: 3, blur: 9, a: 0.35 } });
  return { canvas: c.canvas, ax: c.pad, ay: c.pad + h, w: c.w, h: c.h };
}
function flameShape(g, h, seed) {                                                                                // one paper flame, base at (0,0)
  const r = rng(seed); g.beginPath(); g.moveTo(-h * 0.22, 0); g.bezierCurveTo(-h * 0.3, -h * 0.35, -h * 0.05, -h * 0.5, -h * 0.1, -h * 0.75 - r() * 6); g.bezierCurveTo(h * 0.1, -h * 0.55, h * 0.04, -h * 0.9, h * 0.05, -h);
  g.bezierCurveTo(h * 0.2, -h * 0.65, h * 0.38, -h * 0.4, h * 0.22, 0); g.closePath(); g.fill();
}
function flame(h, seed, colors) {
  const outer = piece((g) => flameShape(g, h, seed), { x0: -h * 0.4, y0: -h * 1.05, x1: h * 0.4, y1: 4 }, { scale: 1, color: colors[0], top: colors[1], edgeColor: colors[2], edgeA: 0.4, seed, shadow: false, pad: 4 });
  const inner = piece((g) => flameShape(g, h * 0.62, seed + 1), { x0: -h * 0.3, y0: -h * 0.7, x1: h * 0.3, y1: 4 }, { scale: 1, color: colors[3], top: colors[4], edge: false, seed, shadow: false, pad: 4 });
  return { outer, inner };
}

// Colossus: a giant antlered silhouette only partly visible beyond the horizon.
function colossus(o = {}) {
  return piece((g) => {
    g.beginPath(); g.arc(0, -168, 70, Math.PI * 1.04, Math.PI * 1.96); g.lineWidth = 7; g.stroke();                                                     // halo ring behind the head
    g.beginPath(); g.moveTo(-150, 0); g.bezierCurveTo(-150, -40, -110, -64, -62, -84); g.bezierCurveTo(-46, -108, -34, -136, -22, -168); g.bezierCurveTo(-12, -200, 12, -200, 22, -168);
    g.bezierCurveTo(34, -136, 46, -108, 62, -84); g.bezierCurveTo(110, -64, 150, -40, 150, 0); g.closePath(); g.fill();                                  // cloak + hood
    const horn = (sx) => { g.save(); g.scale(sx, 1); g.lineCap = 'round'; g.lineWidth = 11; g.beginPath(); g.moveTo(16, -190); g.bezierCurveTo(46, -214, 40, -262, 74, -292); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(40, -232); g.lineTo(78, -240); g.moveTo(46, -258); g.lineTo(76, -276); g.moveTo(74, -292); g.lineTo(66, -318); g.stroke(); g.restore(); };
    horn(1); horn(-1);
  }, { x0: -160, y0: -330, x1: 160, y1: 6 }, { scale: o.scale || 2, color: o.color || '#1a1540', top: o.top || '#2c2460', edgeColor: '#8f7fe0', edgeA: 0.5, seed: 31, shadow: false });
}

module.exports = { PAL, piece, drawPiece, warrior, creature, ridge, forest, castle, brokenKeepPiece, deadTree, rocks, grass, cloudStrip, flame, colossus, WARRIORS, CREATURES, ell, poly };
