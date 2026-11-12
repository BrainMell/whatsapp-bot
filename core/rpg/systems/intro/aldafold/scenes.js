'use strict';
// The six movements of the Aldafold registration cinematic + logo reveal. Everything is layered paper cut-outs with parallax.
const path = require('path');
const K = require('./paperKit');
const A = require('./art');
const TL = require('./timeline');
const { drawText, fonts } = require('./typography');
const { createCanvas, loadImage } = require('canvas');
const { clamp, lerp, smooth, smoother, easeOut, easeIn, seg, mix, rgba, rng, vignette, filmGrain } = K;
const { PAL, drawPiece } = A;
const W = TL.W, H = TL.H, CX = W / 2, CY = H / 2;
const M = TL.moments, S = TL.scenes;

// ---- helpers ----------------------------------------------------------------------------------------------------------
function glow(ctx, x, y, r, color, a = 1, comp = 'lighter') {
  ctx.save(); ctx.globalCompositeOperation = comp; const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.35, rgba(color, a * 0.35)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function fog(ctx, y, h, color, a, drift = 0) {                                // horizontal mist band
  const g = ctx.createLinearGradient(0, y - h, 0, y + h); g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, rgba(color, a)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.fillRect(0, y - h, W, h * 2);
}
function sky(ctx, stops) { const g = ctx.createLinearGradient(0, 0, 0, H); stops.forEach(([p, c]) => g.addColorStop(p, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
function wisps(ctx, t, color, a, y0 = 150) { for (let i = 0; i < 5; i++) { const x = ((i * 230 + t * (4 + i)) % (W + 400)) - 200, y = y0 + i * 26 + Math.sin(t * 0.3 + i) * 5; const g = ctx.createRadialGradient(x, y, 0, x, y, 190); g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0)); ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.14); ctx.translate(0, -y); ctx.fillStyle = g; ctx.fillRect(x - 190, y - 190, 380, 380); ctx.restore(); } }
function dipBlack(ctx, a) { if (a <= 0) return; ctx.fillStyle = `rgba(2,1,6,${clamp(a)})`; ctx.fillRect(0, 0, W, H); }
function sceneDip(t, [a, b], fin = 1.0, fout = 1.0) { return 1 - smooth(seg(t, a, a + fin)) * (1 - smooth(seg(t, b - fout, b))); }   // 1 = fully black

class Particles {
  constructor(n, seed, o = {}) { const r = rng(seed); this.o = o; this.p = Array.from({ length: n }, () => ({ x: r() * W * 1.2, y: r() * H, vx: (r() - 0.5) * (o.vx || 12) + (o.drift || 0), vy: (o.vy || -20) * (0.5 + r()), s: 0.6 + r() * (o.size || 1.6), ph: r() * 6.28, par: 0.3 + r() * 1.0 })); }
  draw(ctx, t, cam, color = '#ffb347', a = 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of this.p) {
      let x = (q.x + q.vx * t - cam.x * q.par) % (W * 1.2); if (x < 0) x += W * 1.2; let y = (q.y + q.vy * t) % H; if (y < 0) y += H;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + q.ph); ctx.fillStyle = rgba(color, a * (0.35 + 0.65 * tw)); ctx.beginPath(); ctx.arc(x - 40, y, q.s, 0, 6.283); ctx.fill();
      if (this.o.halo) glow(ctx, x - 40, y, q.s * 5, color, 0.18 * a * tw);
    }
    ctx.restore();
  }
}

class Stage {
  constructor(ctx, cam, t) { this.ctx = ctx; this.cam = cam; this.t = t; }
  put(p, x, y, par = 1, o = {}) {
    const c = this.cam, s = 1 + (c.z - 1) * par, bt = Math.floor(this.t * 8), j = o.nojit ? 0 : 0.9;
    const jx = Math.sin(bt * 12.9898 + (o.seed || 0) * 4.1) * j, jy = Math.cos(bt * 78.233 + (o.seed || 0) * 2.3) * j;
    const px = CX + (x - CX - c.x * par) * s + jx, py = CY + (y - CY - c.y * par) * s + jy;
    drawPiece(this.ctx, p, px, py, Object.assign({}, o, { s: (o.s == null ? 1 : o.s) * s })); return [px, py, s];
  }
  pt(x, y, par) { const c = this.cam, s = 1 + (c.z - 1) * par; return [CX + (x - CX - c.x * par) * s, CY + (y - CY - c.y * par) * s, s]; }
}

// ---- real engravings (Gustave Doré, public domain originals; layers from jumpjack/divina-commedia-animata) ------------------
// "Moonlit etching": engraving luminance becomes opacity of a pale tint, so the ink drops out onto our sky and only the lit lines remain.
const ART_DIR = path.join(__dirname, '..', '..', '..', '..', 'rpgasset', 'intro', 'art');
function etch(img, w, tint, gain = 1.15, feather = 0.18, keepAlpha = false, duo = null) {
  const h = Math.round(w * img.height / img.width), c = createCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data, T = K.hex(tint);
  for (let i = 0; i < d.length; i += 4) {
    const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, al = keepAlpha ? d[i + 3] / 255 : 1;
    if (duo) { const D = K.hex(duo); d[i] = D[0] + (T[0] - D[0]) * L; d[i + 1] = D[1] + (T[1] - D[1]) * L; d[i + 2] = D[2] + (T[2] - D[2]) * L; d[i + 3] = Math.round(255 * al); continue; }   // solid duotone (ink -> tint)
    d[i] = T[0]; d[i + 1] = T[1]; d[i + 2] = T[2]; d[i + 3] = Math.round(255 * Math.min(1, Math.pow(L, 1.5) * gain) * al);
  }
  g.putImageData(im, 0, 0);
  if (feather > 0) {                                                            // soft vignette so the plate melts into the scene instead of showing a rectangle
    g.globalCompositeOperation = 'destination-in'; const m = createCanvas(w, h), mg = m.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, w, h);
    mg.globalCompositeOperation = 'destination-out';
    for (const [x0, y0, x1, y1] of [[0, 0, w * feather, 0], [w, 0, w * (1 - feather), 0], [0, 0, 0, h * feather], [0, h, 0, h * (1 - feather)]]) { const gr = mg.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = gr; mg.fillRect(0, 0, w, h); }
    g.drawImage(m, 0, 0); g.globalCompositeOperation = 'source-over';
  }
  return { canvas: c, w, h, ax: w / 2, ay: h };
}

// ---- asset bank (built once) --------------------------------------------------------------------------------------------
function buildAssets() {
  fonts();
  const a = {};
  const ink = '#07060d';
  a.warriors = {}; ['knight', 'mage', 'archer', 'brute', 'rogue', 'maiden', 'bearer'].forEach((k, i) => { a.warriors[k] = A.warrior(k, { scale: 2.1, seed: i + 1 }); });
  a.warriorsLit = {};
  for (const k of Object.keys(a.warriors)) {                                   // gold-lit twins for the blessing / rim light
    const p = a.warriors[k], c = createCanvas(p.w, p.h), g = c.getContext('2d'); g.drawImage(p.canvas, 0, 0); g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, p.h); gr.addColorStop(0, 'rgba(255,230,160,0.95)'); gr.addColorStop(1, 'rgba(255,160,60,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, p.w, p.h); a.warriorsLit[k] = Object.assign({}, p, { canvas: c });
  }
  // distant army figures (tiny)
  a.tiny = {}; ['knight', 'bearer', 'archer'].forEach((k) => { a.tiny[k] = A.warrior(k, { scale: 0.55, color: '#120a1c', top: '#1d1230', edgeA: 0.3, shadow: false }); });
  a.creatures = { hound: A.creature('hound', { scale: 1.35 }), stalker: A.creature('stalker', { scale: 1.3 }), maw: A.creature('maw', { scale: 1.5 }), body: A.creature('winged_body', { scale: 1.1 }), wing: A.creature('wing', { scale: 1.1 }) };
  a.tinyCreatures = { hound: A.creature('hound', { scale: 0.45, shadow: false }), stalker: A.creature('stalker', { scale: 0.42, shadow: false }) };
  // landscape for the Realm
  a.rFar = A.ridge(1700, 150, 5, { color: '#2a2660', top: '#3d3880', base: 0.55, peaks: 0.12, peakH: 55, rough: 26 });
  a.rMid = A.ridge(1700, 130, 8, { color: '#1b1844', top: '#2a2662', base: 0.5, rough: 20 });
  a.castle = A.castle({ scale: 1.25, color: '#15123a', top: '#262358', edgeColor: '#8b86d0' });
  a.keep = A.brokenKeepPiece({ scale: 1.25, color: '#15123a', top: '#262358', edgeColor: '#8b86d0' });
  a.forestA = A.forest(1700, 95, 9, { color: '#0d0b22', top: '#14113a' });
  a.forestB = A.forest(1700, 70, 13, { color: '#07061a', top: '#0c0a26' });
  a.hillNear = A.ridge(1800, 120, 15, { color: '#0a0818', top: '#120f2a', base: 0.4, rough: 16 });
  a.cliff = A.rocks(420, 190, 33, {}); a.tree = A.deadTree(6, 190); a.grassF = A.grass(1900, 52, 41);
  a.clouds = [A.cloudStrip(1100, 60, 51, { color: '#2a2860', top: '#413b86' }), A.cloudStrip(1000, 50, 52, { color: '#23204f', top: '#37327a' })];
  a.flames = [0, 1, 2, 3].map((i) => A.flame(46 + i * 14, 70 + i, ['#c2261f', '#ff7a2a', '#ffd27a', '#ffb347', '#fff1b0']));
  // the crest the warriors stand on (scenes C & F)
  a.crest = A.ridge(1500, 120, 61, { color: '#08060f', top: '#120f24', base: 0.28, rough: 9, edgeColor: '#a08a60', edgeA: 0.5 });
  a.crestFar = A.ridge(1700, 140, 62, { color: '#7a5a88', top: '#9a7098', base: 0.45, rough: 16, peaks: 0.1 });
  a.fieldRidge = A.ridge(1700, 90, 63, { color: '#5a4268', top: '#74557a', base: 0.5, rough: 10 });
  a.rocksF = A.rocks(900, 120, 71, {}); a.grassG = A.grass(1900, 62, 72);
  // horizon (Fate) — receding ridges
  a.horizon = [0, 1, 2, 3, 4, 5, 6].map((i) => A.ridge(1800, 110 - i * 6, 80 + i, { color: mix('#0f0c24', '#4a4390', i / 6), top: mix('#17133a', '#6a63b4', i / 6), base: 0.5, rough: 14 - i, peaks: i > 3 ? 0.1 : 0.04, peakH: 36 }));
  a.colossus = A.colossus({ scale: 1.5, color: '#1a1540', top: '#2c2460' });
  a.crag = A.rocks(620, 150, 90, { color: '#04030a', top: '#0b0919' });
  a.logo = null; a.charon = null; a.winged = null;
  a.artPromise = Promise.all([
    loadImage(path.join(ART_DIR, 'dore_charon.jpg')).then((im) => { a.charon = etch(im, 600, '#c9bdf2', 1.25, 0.22); }),
    loadImage(path.join(ART_DIR, 'dore_winged.png')).then((im) => { a.winged = etch(im, 700, '#d2c2fa', 1, 0, true, '#3a2c78'); }),
  ]).catch(() => {});                                                           // missing art just falls back to the hand-cut pieces
  a.logoPromise = loadImage(path.join(__dirname, '..', '..', '..', '..', 'rpgasset', 'intro', 'aldafold_logo.png')).then((im) => { a.logo = im; });
  a.dust = new Particles(46, 5, { vy: -8, vx: 6, size: 1.3 }); a.embers = new Particles(70, 6, { vy: -42, vx: 16, size: 1.9, halo: true });
  a.ash = new Particles(80, 7, { vy: 22, vx: -14, size: 1.5 }); a.motes = new Particles(60, 8, { vy: -16, vx: 4, size: 1.4, halo: true });
  a.stars = (() => { const r = rng(99); return Array.from({ length: 90 }, () => ({ x: r() * W * 1.3, y: r() * H * 0.55, s: 0.4 + r() * 1.2, ph: r() * 6 })); })();
  return a;
}

// ---- shared bits ------------------------------------------------------------------------------------------------------------
function drawStars(ctx, a, t, cam, alpha = 1, par = 0.05) {
  ctx.save(); for (const s of a.stars) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + s.ph)); ctx.fillStyle = `rgba(230,225,255,${alpha * tw * 0.8})`; ctx.fillRect(((s.x - cam.x * par) % (W * 1.3)) - 20, s.y, s.s, s.s); } ctx.restore();
}
function moon(ctx, x, y, r, tint, halo) {                                               // paper moon disc with crater cut-outs
  glow(ctx, x, y, r * 3.4, halo, 0.5); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r); g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle = 'rgba(60,50,110,0.22)'; [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.12], [0.35, -0.35, 0.1]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 6.283); ctx.fill(); }); ctx.restore();
}
function banner(ctx, x, y, w, h, t, color, trim, seed = 0) {                      // animated cloth hanging from a pole top at (x,y), streaming to the right
  const wave = (u) => Math.sin(t * 3.2 + u * 5 + seed) * (3 + u * 7);
  ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 0; i <= 12; i++) { const u = i / 12; ctx.lineTo(x + u * w, y + wave(u) + u * 4); }
  for (let i = 12; i >= 0; i--) { const u = i / 12; ctx.lineTo(x + u * w * (1 - 0.0) - (i === 12 ? 12 : 0), y + h * (1 - u * 0.28) + wave(u) + u * 4); }
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + w * 0.38, y + h * 0.46 + wave(0.38), h * 0.14, 0, 6.283); ctx.fill(); ctx.restore();
}
function godRays(ctx, x, y, t, a, color, n = 9, len = 900, spread = 0.2) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i - (n - 1) / 2) * spread * 1.1 + Math.sin(t * 0.25 + i) * 0.03, wdt = 0.05 + 0.03 * Math.sin(t * 0.6 + i * 2);
    const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.addColorStop(0, rgba(color, a * 0.5)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang - wdt) * len, y + Math.sin(ang - wdt) * len); ctx.lineTo(x + Math.cos(ang + wdt) * len, y + Math.sin(ang + wdt) * len); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function sigil(ctx, x, y, R, t, a, ringA = 1) {                                    // Order's sigil — rotating gold rings, runes and star
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,222,150,${a})`; ctx.fillStyle = `rgba(255,222,150,${a})`; ctx.shadowColor = 'rgba(255,200,100,0.9)'; ctx.shadowBlur = 14;
  [[R, 2.4, 0], [R * 0.86, 1.2, 0], [R * 0.52, 1.6, 0], [R * 0.3, 1.4, 0]].forEach(([r, w]) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke(); });
  ctx.shadowBlur = 6; ctx.font = `${Math.round(R * 0.11)}px AldRunic, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'; ctx.save(); ctx.rotate(t * 0.18); for (let i = 0; i < 24; i++) { ctx.save(); ctx.rotate((i / 24) * 6.283); ctx.translate(0, -R * 0.93); ctx.fillText(runes[i], 0, 0); ctx.restore(); } ctx.restore();
  ctx.save(); ctx.rotate(-t * 0.28); ctx.lineWidth = 1.5; for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = (i / 3) * 6.283 + k * Math.PI / 3 - Math.PI / 2; const px = Math.cos(an) * R * 0.52, py = Math.sin(an) * R * 0.52; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.stroke(); } ctx.restore();
  ctx.save(); ctx.rotate(t * 0.4); for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(R * 0.3, 0); ctx.lineTo(R * 0.86, 0); ctx.lineWidth = 0.8; ctx.stroke(); } ctx.restore();
  ctx.restore();
  glow(ctx, x, y, R * 1.7, '#ffd98a', 0.55 * a);
}
const flick = (t, s = 0) => 0.75 + 0.25 * Math.sin(t * 17 + s) * Math.sin(t * 9.3 + s * 2) + 0.1 * Math.sin(t * 31 + s);

// ============================================================ SCENE 1 — THE AGE OF CHAOS =====================================================
function sceneRealm(ctx, a, t) {
  const [t0, t1] = S.realm, n = seg(t, t0, t1);
  const chaos = smooth(seg(t, M.chaosArrive, M.chaosArrive + 3.2)), fire = smooth(seg(t, 10.5, 14)), ruin = seg(t, M.collapseStart, M.collapseImpact + 1.5);
  const shake = t > M.collapseImpact ? Math.exp(-(t - M.collapseImpact) * 2.4) * 6 : (t > M.collapseStart ? 1.2 : 0), sx = Math.sin(t * 61) * shake, sy = Math.cos(t * 53) * shake;
  const cam = { x: lerp(-70, 90, easeOut(n * 0.9)) + sx, y: lerp(18, -4, n) + sy, z: lerp(1.0, 1.16, n) };
  const st = new Stage(ctx, cam, t);
  sky(ctx, [[0, mix('#0d0b2c', '#1a0508', chaos)], [0.5, mix('#3a2f78', '#5a1214', chaos)], [0.78, mix('#8a6fb0', '#c4451c', chaos)], [1, mix('#c9a0b8', '#e8782a', chaos)]]);
  drawStars(ctx, a, t, cam, 1 - chaos * 0.7);
  moon(ctx, 640 - cam.x * 0.04, 118 - cam.y * 0.04, 52, [mix('#f4efe0', '#ff9a74', chaos), mix('#cfc7e8', '#a82a24', chaos)], mix('#9b95d6', '#d8321e', chaos));
  a.clouds.forEach((c, i) => { st.put(c, ((i * 520 + t * (6 + i * 4)) % 1700) - 300, 205 + i * 34, 0.12 + i * 0.05, { nojit: true, alpha: 0.9 }); });
  // far + mid ridges, castle
  st.put(a.rFar, -420, 340, 0.18, { seed: 1 });
  fog(ctx, 285, 40, mix('#8a7fd0', '#d8501e', chaos), 0.35);
  const cx = 660, cy = 356;                                                                   // castle ground point on the mid ridge
  const [kx, ky, ks] = st.put(a.castle.body, cx, cy, 0.32, { seed: 3 });
  // collapse of the keep: it tips, drops, and leaves a stump + dust
  const tilt = easeIn(seg(t, M.collapseStart, M.collapseImpact)) * 0.95, fall = easeIn(seg(t, M.collapseStart + 0.6, M.collapseImpact + 0.3)) * 70, gone = seg(t, M.collapseImpact + 0.2, M.collapseImpact + 1.2);
  if (ruin < 1 || gone < 1) { ctx.save(); ctx.globalAlpha = 1 - smooth(gone); st.put(a.castle.tower, cx, cy - fall * 0.2, 0.32, { seed: 4, rot: tilt, nojit: tilt > 0 }); ctx.restore(); }
  if (t > M.collapseImpact) st.put(a.keep, cx, cy, 0.32, { seed: 5 });
  // windows: warm candle-light that turns to fire
  const wl = a.castle.windows; wl.forEach(([wx, wy], i) => { if (i === 7 && t > M.collapseImpact) return; const [px, py] = st.pt(cx + wx * a.castle.scale, cy + wy * a.castle.scale, 0.32); const on = smooth(seg(t, 3 + i * 0.25, 4.2 + i * 0.25)); const col = chaos > 0.5 ? '#ff7a2a' : '#ffd98a'; ctx.fillStyle = rgba(col, on * (0.6 + 0.4 * flick(t, i))); ctx.fillRect(px - 2 * ks, py - 3 * ks, 4 * ks, 6 * ks); glow(ctx, px, py, 18 * ks, col, 0.35 * on); });
  // flames on the keep
  if (fire > 0) [[-70, -52], [-40, -90], [60, -96], [90, -62], [-8, -80]].forEach(([fx, fy], i) => {
    if (i === 4 && t > M.collapseImpact + 0.2) return; const f = a.flames[i % 4], k = fire * (0.8 + 0.3 * flick(t, i * 3));
    st.put(f.outer, cx + fx * a.castle.scale, cy + fy * a.castle.scale + 6, 0.32, { sx: k * 0.9, sy: k * (1 + 0.2 * Math.sin(t * 9 + i)), nojit: true, seed: i }); st.put(f.inner, cx + fx * a.castle.scale, cy + fy * a.castle.scale + 6, 0.32, { sx: k * 0.9, sy: k * (1 + 0.2 * Math.sin(t * 9 + i)), nojit: true });
  });
  if (fire > 0) { const [gx, gy] = st.pt(cx, cy - 80, 0.32); glow(ctx, gx, gy, 220, '#ff6a20', 0.5 * fire * flick(t)); }
  // dust cloud + smoke of the collapse
  if (t > M.collapseStart + 1) { const d = seg(t, M.collapseImpact, M.collapseImpact + 5), [dx, dy] = st.pt(cx, cy - 12, 0.32); ctx.save(); for (let i = 0; i < 9; i++) { const r2 = 30 + d * 120 + i * 7, ox = (i - 4) * 28 * (0.5 + d), oy = -d * 80 * (0.4 + (i % 3) * 0.3); ctx.fillStyle = `rgba(${60 + i * 6},${40 + i * 3},${52 + i * 3},${(1 - d) * 0.22})`; ctx.beginPath(); ctx.arc(dx + ox, dy + oy, r2 * 0.6, 0, 6.283); ctx.fill(); } ctx.restore(); }
  st.put(a.rMid, -380, 392, 0.32, { seed: 2 });                                              // mid ridge hides the castle's footing
  fog(ctx, 330, 50, mix('#6a64a8', '#7a2a1a', chaos), 0.3);
  // forest ridge A
  st.put(a.forestA, -420, 392, 0.5, { seed: 6 });
  // the horde (right → left): hounds, stalkers, winged fiends, a maw
  const horde = [['hound', 0, 0.52, 0], ['stalker', 1.1, 0.5, 1], ['hound', 1.8, 0.5, 2], ['maw', 2.5, 0.46, 3], ['hound', 3.3, 0.55, 4], ['stalker', 4.2, 0.48, 5], ['hound', 5.0, 0.54, 6], ['hound', 5.9, 0.5, 7]];
  horde.forEach(([k, d, par, i]) => {
    const tt = t - (M.chaosArrive - 0.4 + d * 0.55); if (tt < 0) return; const spd = k === 'maw' ? 22 : k === 'stalker' ? 32 : 46, x = 1120 + i * 14 - tt * spd, by = 372 + (i % 3) * 4, bob = Math.abs(Math.sin(tt * (k === 'hound' ? 7 : 3.2) + i)) * (k === 'hound' ? 5 : 3);
    const p = a.creatures[k], [px, py, s] = st.put(p, x, by - bob, 0.32, { seed: 10 + i, flip: true, s: 1.0, rot: Math.sin(tt * 4 + i) * 0.03 });
    const eye = k === 'hound' ? [-50, -46] : k === 'stalker' ? [0, -106] : [0, -36]; const ks = (k === 'maw' ? 1.5 : k === 'stalker' ? 1.3 : 1.35) * 1.0 * s, ex = px - eye[0] * ks, ey = py + eye[1] * ks;
    glow(ctx, ex, ey, 11 * s, '#ff2a1a', 0.9 * chaos + 0.1); ctx.save(); ctx.fillStyle = '#ff6a4a'; ctx.fillRect(ex - 2 * s, ey - s, 4 * s, 2 * s); ctx.restore();
  });
  for (let i = 0; i < 5; i++) {                                                               // winged fiends across the red sky
    const tt = t - (M.chaosArrive + 0.4 + i * 0.9); if (tt < 0) continue; const x = 1000 - tt * (58 + i * 5) + i * 110, y = 96 + (i % 3) * 52 + Math.sin(tt * 1.6 + i) * 14, fl = Math.sin(tt * 9 + i) * 0.5;
    const [px, py, s] = st.put(a.creatures.body, x, y, 0.28, { seed: 20 + i, s: 0.5 }); st.put(a.creatures.wing, x, y - 4, 0.28, { rot: -0.25 + fl, s: 0.5, seed: 21 }); st.put(a.creatures.wing, x, y - 4, 0.28, { rot: 0.25 - fl, flip: true, s: 0.5, seed: 22 });
    glow(ctx, px, py - 20 * s, 5, '#ff3a22', 0.8);
  }
  ctx.fillStyle = '#09071a'; ctx.fillRect(0, 392, W, H - 392);                           // solid ground so no sky ever peeks under the forests
  st.put(a.forestB, -420, 430, 0.7, { seed: 7 });
  ctx.fillStyle = '#07061a'; ctx.fillRect(0, 430, W, H - 430);
  st.put(a.hillNear, -450, 520, 0.85, { seed: 8 });
  // foreground: cliff, dead tree, lone watcher
  st.put(a.cliff, -60, 520, 1.15, { seed: 9 }); st.put(a.tree, 90, 462, 1.15, { seed: 10, rot: Math.sin(t * 0.7) * 0.01, nojit: true });
  st.put(a.warriors.knight, 150, 452, 1.15, { s: 0.52, seed: 11, rot: Math.sin(t * 0.9) * 0.01, nojit: true });
  const [lx, ly] = st.pt(150, 458 - 90, 1.15); glow(ctx, lx, ly, 70, '#ffb070', 0.22 * fire);
  st.put(a.grassF, -480, 540, 1.35, { nojit: true });
  a.ash.draw(ctx, t, cam, '#e8c8b0', chaos * 0.55); a.embers.draw(ctx, t, cam, '#ff8a3a', fire * 0.9); a.dust.draw(ctx, t, cam, '#c8c0f0', (1 - chaos) * 0.5);
  // chaos tint over everything
  ctx.fillStyle = rgba('#5a0a10', 0.22 * chaos); ctx.fillRect(0, 0, W, H);
  dipBlack(ctx, sceneDip(t, S.realm, 2.2, 1.2));
}

// ============================================================ SCENE 2 — THE BLESSING OF ORDER ================================================
function sceneOrder(ctx, a, t) {
  const [t0, t1] = S.order, n = seg(t, t0, t1), bless = smooth(seg(t, M.blessing - 0.4, M.blessing + 1.2)), appear = smooth(seg(t, M.orderSigil - 0.6, M.orderSigil + 2.6));
  const tiltDown = easeOut(seg(t, M.orderSigil + 1, M.blessing));
  const cam = { x: lerp(40, -30, n), y: lerp(-70, 28, tiltDown) + Math.sin(t * 0.5) * 2, z: lerp(1.04, 1.0, n) };
  const st = new Stage(ctx, cam, t);
  sky(ctx, [[0, '#050410'], [0.6, mix('#0d0b24', '#2a2260', bless * 0.8)], [1, mix('#141030', '#8a6a9a', bless * 0.7)]]);
  drawStars(ctx, a, t, cam, 0.9, 0.04);
  // the thread of light on the horizon → opens into a sigil
  const hz = 330 - cam.y * 0.3; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const hl = smooth(seg(t, t0 + 0.6, M.orderSigil)); const hg = ctx.createLinearGradient(0, hz - 30, 0, hz + 30); hg.addColorStop(0, 'rgba(255,214,140,0)'); hg.addColorStop(0.5, `rgba(255,214,140,${0.5 * hl})`); hg.addColorStop(1, 'rgba(255,214,140,0)'); ctx.fillStyle = hg; ctx.fillRect(0, hz - 30, W, 60); ctx.restore();
  // far ridges
  st.put(a.rFar, -420, 395, 0.15, { seed: 31, alpha: 0.9 }); st.put(a.rMid, -380, 420, 0.3, { seed: 32 });
  // sigil high in the sky
  const sx = CX - cam.x * 0.2, sy = 118 - cam.y * 0.35, R = 108 * (0.2 + 0.8 * easeOut(appear));
  godRays(ctx, sx, sy, t, 0.5 * appear, '#ffdf9a', 11, 760, 0.18);
  if (appear > 0.01) sigil(ctx, sx, sy, R, t, appear);
  // beams of Order down onto the chosen
  const chosen = [['knight', 210, 1.0], ['mage', 320, 1.04], ['archer', 428, 1.0], ['brute', 538, 1.04], ['maiden', 646, 1.0]];
  const beamP = smooth(seg(t, M.orderSigil + 2.0, M.blessing)), ground = 430;
  chosen.forEach(([k, x], i) => {
    const bx = x - cam.x * 1.0, tipY = lerp(sy, ground - 70 + (-cam.y), beamP), spread = 14 + 8 * bless;
    if (beamP > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(sx, sy, bx, tipY); g.addColorStop(0, `rgba(255,224,150,${0.5 * beamP})`); g.addColorStop(1, `rgba(255,224,150,${0.12 + 0.5 * bless})`); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 5 + (i - 2) * 6, sy + 8); ctx.lineTo(sx + 5 + (i - 2) * 6, sy + 8); ctx.lineTo(bx + spread, tipY); ctx.lineTo(bx - spread, tipY); ctx.closePath(); ctx.fill(); ctx.restore(); }
  });
  // foreground crag stage with the chosen few
  st.put(a.crag, -80, 540, 1.0, { seed: 33 }); st.put(a.crag, 360, 546, 1.0, { seed: 34, flip: true });
  chosen.forEach(([k, x, sc], i) => {
    const lit = smooth(seg(t, M.blessing - 0.1 + i * 0.08, M.blessing + 1.0 + i * 0.08)), rise = easeOut(seg(t, t0 + 2, t0 + 4 + i * 0.4)), bob = Math.sin(t * 1.1 + i) * 0.8;
    const [px, py, s] = st.put(a.warriors[k], x, 452 + (1 - rise) * 40 + bob, 1.0, { s: 0.6 * sc, seed: 40 + i, nojit: true });
    ctx.save(); ctx.globalAlpha = lit; drawPiece(ctx, a.warriorsLit[k], px, py, { s: 0.6 * sc * s }); ctx.restore();
    if (lit > 0.01) { const hh = a.warriors[k].ay * 0.6 * sc * s; glow(ctx, px, py - hh * 0.55, 90, '#ffd98a', 0.5 * lit); const ey = py - hh * (k === 'brute' ? 0.84 : 0.8); glow(ctx, px + 2, ey, 9, '#fff4c8', lit); }
  });
  // blessing impact: flash + shockwave ring
  const sw = seg(t, M.blessing, M.blessing + 1.8); if (sw > 0 && sw < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,230,170,${(1 - sw) * 0.8})`; ctx.lineWidth = 3 + 8 * (1 - sw); ctx.beginPath(); ctx.ellipse(CX, 438, 80 + sw * 700, 14 + sw * 90, 0, 0, 6.283); ctx.stroke(); ctx.restore(); }
  const fl = Math.exp(-Math.max(0, t - M.blessing) * 4) * (t >= M.blessing ? 1 : 0); if (fl > 0.01) { ctx.fillStyle = `rgba(255,236,190,${fl * 0.7})`; ctx.fillRect(0, 0, W, H); }
  a.motes.draw(ctx, t, cam, '#ffdc90', 0.4 + 0.6 * bless); a.dust.draw(ctx, t, cam, '#d8d0ff', 0.3);
  st.put(a.grassG, -480, 505, 1.3, { nojit: true });
  dipBlack(ctx, sceneDip(t, S.order, 0.9, 0.9));
}

// ============================================================ SCENE 3 — THE WARRIORS OF ALDAFOLD ==============================================
const LINEUP = [['bearer', 96, 1.0, 0.0, '#7a1a2a'], ['rogue', 188, 0.84, 0.5], ['brute', 282, 1.0, 1.0], ['archer', 366, 0.9, 1.5], ['knight', 427, 1.14, 2.2], ['mage', 500, 0.94, 1.8], ['maiden', 578, 0.96, 1.3], ['brute', 668, 0.9, 0.8], ['bearer', 762, 1.0, 0.3, '#2a2a7a']];
function drawBattlefield(ctx, a, t, st, glowC) {
  st.put(a.crestFar, -420, 330, 0.12, { seed: 51 });
  // armies clashing in the valley — rows of tiny figures + sparks + smoke
  st.put(a.fieldRidge, -420, 368, 0.22, { seed: 52 });
  const r = rng(404);
  for (let i = 0; i < 26; i++) {
    const xx = 120 + r() * 700, yy = 346 + r() * 10, side = i % 2, k = ['knight', 'bearer', 'archer'][i % 3]; const adv = Math.sin(t * 0.9 + i) * 3;
    ctx.save(); if (side) ctx.globalAlpha = 0.9; st.put(a.tiny[k], xx + adv, yy, 0.22, { s: 1, seed: i, flip: !!side, nojit: true }); ctx.restore();
  }
  for (let i = 0; i < 5; i++) { const [px, py] = st.pt(160 + i * 150, 340, 0.22); const f = a.flames[i % 4]; st.put(f.outer, 160 + i * 150, 344, 0.22, { s: 0.55, sx: 0.8 + 0.2 * Math.sin(t * 8 + i), nojit: true }); st.put(f.inner, 160 + i * 150, 344, 0.22, { s: 0.55, nojit: true }); glow(ctx, px, py - 12, 40, '#ff7a2a', 0.3 * flick(t, i)); }
  for (let i = 0; i < 9; i++) { const [px, py] = st.pt(100 + i * 85 + Math.sin(t * 2 + i) * 6, 340, 0.22); if (Math.sin(t * 5 + i * 2.1) > 0.7) glow(ctx, px, py - 6, 14, '#ffe6a0', 0.9); }
  fog(ctx, 352, 28, glowC, 0.4);
  ctx.save(); for (let i = 0; i < 4; i++) { const sm = (t * 8 + i * 70) % 300; ctx.fillStyle = `rgba(40,26,52,${0.2 * (1 - sm / 300)})`; ctx.beginPath(); ctx.arc(180 + i * 190 - cam0(st).x * 0.2, 340 - sm * 0.6, 20 + sm * 0.18, 0, 6.283); ctx.fill(); } ctx.restore();
}
const cam0 = (st) => st.cam;
function sceneWarriors(ctx, a, t) {
  const [t0, t1] = S.warriors, n = seg(t, t0, t1), push = smooth(seg(t, M.unison - 0.5, M.unison + 1.5));
  const cam = { x: lerp(-30, 24, n), y: lerp(24, -6, easeOut(n)), z: lerp(1.0, 1.1, n) + push * 0.02 };
  const st = new Stage(ctx, cam, t);
  const sunX = CX + 4 - cam.x * 0.05, sunY = 300 - cam.y * 0.08;
  sky(ctx, [[0, '#1c1442'], [0.4, '#6a3f7a'], [0.7, '#e0814a'], [1, '#f6c27a']]);
  glow(ctx, sunX, sunY, 360, '#ffcf80', 0.8); ctx.save(); ctx.fillStyle = '#ffe9b8'; ctx.beginPath(); ctx.arc(sunX, sunY, 54, 0, 6.283); ctx.fill(); ctx.restore();
  wisps(ctx, t, '#f0b4a0', 0.28, 140);
  godRays(ctx, sunX, sunY, t, 0.38, '#ffd890', 11, 820, 0.2);
  drawBattlefield(ctx, a, t, st, '#f0b070');
  // the crest + warriors rising into place
  st.put(a.crest, -380, 470, 0.9, { seed: 53 });
  LINEUP.forEach(([k, x, sc, ph, flag], i) => {
    const rise = easeOut(seg(t, t0 + 1.2 + i * 0.5, t0 + 3.3 + i * 0.5)), unison = Math.exp(-Math.abs(t - M.unison) * 6) * 6, bob = Math.sin(t * 1.4 + ph) * 0.8;
    const by = 442 + (1 - rise) * 110 - unison + bob, [px, py, s] = st.put(a.warriors[k], x, by, 0.9, { s: 0.7 * sc, seed: 60 + i, nojit: true, rot: Math.sin(t * 1.1 + ph) * 0.008 });
    ctx.save(); ctx.globalAlpha = 0.07 * rise; drawPiece(ctx, a.warriorsLit[k], px, py, { s: 0.7 * sc * s }); ctx.restore();       // warm rim from the low sun
    if (k === 'bearer') { banner(ctx, px + 17 * 2.1 * 0.7 * sc * s * 0.5 + 6, py - 158 * 2.1 * 0.7 * sc * s * 0.9 + 6, 70 * s, 44 * s, t, flag, '#d9b25f', i); }
    if (k === 'mage' && t > M.orb) { const mx = px + 21 * 2.1 * 0.7 * sc * s, my = py - 112 * 2.1 * 0.7 * sc * s; glow(ctx, mx, my, 50 * (1 + 0.3 * Math.sin(t * 7)), '#9fe0ff', 0.9 * smooth(seg(t, M.orb, M.orb + 1))); }
  });
  st.put(a.rocksF, -250, 520, 1.2, { seed: 70, nojit: true }); st.put(a.grassG, -480, 508, 1.35, { nojit: true });
  a.embers.draw(ctx, t, cam, '#ffb347', 0.9); a.dust.draw(ctx, t, cam, '#ffe0b0', 0.5);
  ctx.fillStyle = rgba('#ff9a50', 0.08); ctx.fillRect(0, 0, W, H);
  dipBlack(ctx, sceneDip(t, S.warriors, 0.9, 0.7));
}

// ============================================================ SCENE 4 — THE QUESTION ==========================================================
function sceneQuestion(ctx, a, t) {
  const [t0, t1] = S.question, n = seg(t, t0, t1), dread = smooth(seg(t, M.question - 1.5, t1));
  const cam = { x: Math.sin(n * 2) * 6, y: lerp(0, -12, n), z: lerp(1.0, 1.08, easeOut(n)) };
  const st = new Stage(ctx, cam, t);
  sky(ctx, [[0, '#06050f'], [0.55, mix('#14112b', '#1c1236', dread)], [1, '#241c3c']]);
  drawStars(ctx, a, t, cam, 0.35);
  fog(ctx, 330, 80, '#6a64a8', 0.16); st.put(a.rFar, -420, 380, 0.15, { seed: 81, alpha: 0.6 });
  // the paper wall behind the hero — his SHADOW is wrong
  const hx = CX, ground = 436, gl = 0.5 + 0.5 * flick(t * 0.7), wrong = smooth(seg(t, M.bell1, M.question + 1.5));
  glow(ctx, hx - 150, 300, 380, mix('#ffd98a', '#9a7af0', dread), 0.42 * gl);
  { // the shadow-figure: a taller, antlered, long-armed echo cast to the right
    const sh = a.warriors.knight, sc = 1.0 + wrong * 0.55, sxp = hx + 120 + wrong * 80 - cam.x * 0.5;
    ctx.save(); ctx.globalAlpha = 0.5 + 0.35 * wrong; const c = createCanvas(sh.w, sh.h), g = c.getContext('2d'); g.drawImage(sh.canvas, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = mix('#241a4a', '#3a1a5a', wrong); g.fillRect(0, 0, sh.w, sh.h);
    drawPiece(ctx, Object.assign({}, sh, { canvas: c }), sxp, ground + 20, { s: sc * 1.22, sy: 1 + wrong * 0.38, sx: 1 - wrong * 0.1, rot: -0.02 + Math.sin(t * 0.8) * 0.01 }); ctx.restore();
    ctx.save(); ctx.globalAlpha = wrong * 0.9; ctx.strokeStyle = '#2d1f55'; ctx.lineCap = 'round'; ctx.lineWidth = 7;                                  // antlers on the shadow's head
    const ax = sxp - 3 * sc, ay = ground + 20 - 92 * 1.22 * sc * 2.1 * (1 + wrong * 0.38) * 0.98; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + sgn * 34, ay - 40, ax + sgn * 26, ay - 90); ctx.moveTo(ax + sgn * 22, ay - 44); ctx.lineTo(ax + sgn * 56, ay - 62); ctx.stroke(); } ctx.restore();
  }
  if (a.charon) { const rv = smooth(seg(t, t0 + 0.8, t0 + 4)), pan = lerp(0, 0.5, n), pc = a.charon; ctx.save(); ctx.globalAlpha = 0.62 * rv * (1 - 0.25 * wrong); drawPiece(ctx, pc, 640 - cam.x * 0.2, 60 + pc.h * (0.68 + pan * 0.0) - pan * (pc.h - 400) * 0.9 + 20, { s: 1.0 + 0.06 * n }); ctx.restore(); glow(ctx, 640, 330, 220, '#7a5ad0', 0.12 * rv); }
  st.put(a.fieldRidge, -420, 470, 0.5, { seed: 82, alpha: 0.85 });
  // the hero, alone, haloed
  const rise = easeOut(seg(t, t0 + 0.5, t0 + 2.6)), flicker = flick(t, 3);
  glow(ctx, hx - 20, 310, 150, mix('#ffd98a', '#a28aff', dread), 0.5 * flicker * rise);
  const [px, py, s] = st.put(a.warriors.knight, hx - 24, ground + (1 - rise) * 40, 1.0, { s: 1.12, seed: 83, nojit: true, rot: Math.sin(t * 0.9) * 0.006 });
  ctx.save(); ctx.globalAlpha = 0.08 + 0.06 * flicker; drawPiece(ctx, a.warriorsLit.knight, px, py, { s: 1.12 * s }); ctx.restore();
  // bell-toll ripples
  [M.bell1, M.question, M.bell2].forEach((bt) => { const r = seg(t, bt, bt + 2.4); if (r > 0 && r < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(190,170,255,${(1 - r) * 0.5})`; ctx.lineWidth = 2 + 6 * (1 - r); ctx.beginPath(); ctx.arc(px, py - 170, 40 + r * 520, 0, 6.283); ctx.stroke(); ctx.restore(); } });
  st.put(a.rocksF, -250, 540, 1.2, { seed: 84 }); st.put(a.grassG, -480, 515, 1.4, { nojit: true });
  a.dust.draw(ctx, t, cam, '#b8aef0', 0.45); a.motes.draw(ctx, t, cam, mix('#ffd98a', '#a28aff', dread), 0.35);
  ctx.fillStyle = rgba('#0a0818', 0.25 + 0.25 * dread); ctx.fillRect(0, 0, W, H);
  dipBlack(ctx, sceneDip(t, S.question, 0.9, 0.9));
}

// ============================================================ SCENE 5 — THE UNWRITTEN FATE ====================================================
function sceneFate(ctx, a, t) {
  const [t0, t1] = S.fate, n = seg(t, t0, t1), reveal = easeOut(seg(t, 68.0, 75.2)), eyes = smooth(seg(t, M.eyes - 0.3, M.eyes + 1.6));
  const cam = { x: lerp(-20, 30, n), y: lerp(40, -26, easeOut(n)), z: lerp(1.0, 1.1, n) };
  const st = new Stage(ctx, cam, t);
  const lt = (t > M.lightning && t < M.lightning + 0.5) ? (Math.random() < 0 ? 0 : Math.max(0, Math.sin((t - M.lightning) * 30) * 0.8)) : 0;
  sky(ctx, [[0, mix('#07050f', '#2a2060', lt)], [0.5, mix('#1a1240', '#5a4aa0', lt)], [0.78, '#5b3f86'], [1, '#9a78a8']]);
  drawStars(ctx, a, t, cam, 0.8, 0.03);
  const hy = 318 - cam.y * 0.1; glow(ctx, CX, hy, 520, '#b48ad8', 0.3 + 0.3 * lt);
  // colossus behind the far ridges: rises as the fog parts
  if (a.winged) { const [wx, wy, ws] = st.pt(CX + 40, 400 + (1 - reveal) * 230, 0.1); ctx.save(); ctx.globalAlpha = 0.85 * reveal + 0.1; drawPiece(ctx, a.winged, wx, wy, { s: 0.92 * ws }); ctx.restore(); glow(ctx, wx, wy - 150 * ws, 160 * ws, '#8a5ae0', 0.18 * reveal);
    for (const sg of [-1, 1]) { const ex = wx + sg * 13 * ws, ey = wy - 0.5 * a.winged.h * 0.92 * ws; glow(ctx, ex, ey, 22 * ws, '#a070ff', 0.95 * eyes); ctx.save(); ctx.globalAlpha = eyes; ctx.fillStyle = '#efe4ff'; ctx.fillRect(ex - 5 * ws, ey - 1.6 * ws, 10 * ws, 3 * ws); ctx.restore(); } }
  else st.put(a.colossus, 560, 360 + (1 - reveal) * 170, 0.1, { seed: 91, alpha: 0.95, nojit: true, s: 1.1 });
  if (!a.winged) { const [ex, ey, es] = st.pt(560, 360 + (1 - reveal) * 170, 0.1), kk = 1.5 * es; for (const sg of [-1, 1]) { glow(ctx, ex + sg * 13 * kk, ey - 150 * kk, 26 * es, '#a070ff', 0.95 * eyes); ctx.save(); ctx.globalAlpha = eyes; ctx.fillStyle = '#efe4ff'; ctx.fillRect(ex + sg * 13 * kk - 7 * es, ey - 151 * kk, 14 * es, 3.4 * es); ctx.restore(); } }
  a.horizon.slice().reverse().forEach((r, i) => { const k = 6 - i, par = 0.1 + k * 0.1, y = 330 + k * 22 + 60; st.put(r, -450 + (k % 2) * 40, y, par, { seed: 92 + k, nojit: k < 3 }); fog(ctx, y - 70, 32, mix('#6a5aa8', '#a090d0', k / 6), 0.18 + 0.05 * (6 - k)); });
  // the watchers: our warriors, tiny, at the edge of the known world
  st.put(a.crag, -140, 560, 1.0, { seed: 99 });
  [['knight', 120], ['mage', 170], ['archer', 222], ['maiden', 70]].forEach(([k, x], i) => st.put(a.warriors[k], x, 462 + Math.sin(t + i) * 0.5, 1.0, { s: 0.6 + (i % 2) * 0.03, seed: 100 + i, nojit: true }));
  for (let i = 0; i < 6; i++) { const bx = (700 - t * (24 + i * 3) + i * 90) % 900, by = 150 + i * 22 + Math.sin(t * 2 + i) * 6; ctx.save(); ctx.strokeStyle = 'rgba(8,6,16,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); const f = Math.sin(t * 8 + i) * 4; ctx.moveTo(bx - 7, by - f); ctx.quadraticCurveTo(bx - 3, by - 5, bx, by); ctx.quadraticCurveTo(bx + 3, by - 5, bx + 7, by - f); ctx.stroke(); ctx.restore(); }
  fog(ctx, 400, 70, '#7a6ab8', 0.2); a.dust.draw(ctx, t, cam, '#c0b4f0', 0.5); a.ash.draw(ctx, t, cam, '#a090d0', 0.25);
  if (lt > 0.02) { ctx.fillStyle = `rgba(190,170,255,${lt * 0.35})`; ctx.fillRect(0, 0, W, H); }
  dipBlack(ctx, sceneDip(t, S.fate, 0.9, 0.8));
}

// ============================================================ SCENE 6 — THE FINAL DECLARATION =================================================
function sceneFinal(ctx, a, t) {
  const [t0, t1] = S.final, n = seg(t, t0, t1), crest = smooth(seg(t, M.shout1, M.shout1 + 3)), flash = smooth(seg(t, M.flash - 1.4, M.flash));
  const cam = { x: lerp(20, -10, n), y: lerp(14, -22, easeOut(n)), z: lerp(1.16, 1.0, easeOut(n)) };
  const st = new Stage(ctx, cam, t);
  const sunX = CX, sunY = lerp(380, 250, easeOut(n));
  sky(ctx, [[0, mix('#14103a', '#3a2a7a', crest)], [0.5, mix('#4a2f70', '#d27a56', crest)], [0.8, mix('#c26a4a', '#ffd48a', crest)], [1, '#fff0c8']]);
  glow(ctx, sunX, sunY, 520, '#fff0c0', 0.9); glow(ctx, sunX, sunY, 220, '#ffffff', 0.7); ctx.save(); ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(sunX, sunY, 64 + 6 * Math.sin(t * 1.5), 0, 6.283); ctx.fill(); ctx.restore();
  godRays(ctx, sunX, sunY, t, 0.55 + 0.25 * crest, '#fff0c0', 15, 980, 0.17);
  wisps(ctx, t, '#ffe2b8', 0.3, 160);
  st.put(a.crestFar, -420, 345, 0.12, { seed: 111, alpha: 0.9 }); fog(ctx, 350, 36, '#ffd8a0', 0.4); st.put(a.fieldRidge, -420, 384, 0.22, { seed: 112 });
  st.put(a.crest, -380, 470, 0.9, { seed: 113 });
  LINEUP.forEach(([k, x, sc, ph, flag], i) => {
    const bob = Math.sin(t * 1.6 + ph) * 1.0 + Math.max(0, Math.exp(-Math.abs(t - M.shout1) * 5)) * -6 + Math.max(0, Math.exp(-Math.abs(t - M.shout2) * 5)) * -6;
    const [px, py, s] = st.put(a.warriors[k], x, 444 + bob, 0.9, { s: 0.74 * sc, seed: 120 + i, nojit: true, rot: Math.sin(t * 1.2 + ph) * 0.006 });
    ctx.save(); ctx.globalAlpha = 0.06; drawPiece(ctx, a.warriorsLit[k], px, py, { s: 0.74 * sc * s }); ctx.restore();
    if (k === 'bearer') banner(ctx, px + 20 * s, py - 292 * 0.74 * sc * s * 0.62, 78 * s, 48 * s, t * 1.3, flag, '#d9b25f', i);
  });
  st.put(a.rocksF, -250, 522, 1.2, { seed: 114, nojit: true }); st.put(a.grassG, -480, 508, 1.35, { nojit: true });
  a.embers.draw(ctx, t, cam, '#ffd28a', 1.0); a.motes.draw(ctx, t, cam, '#fff0c0', 0.8);
  if (flash > 0) { ctx.fillStyle = `rgba(255,248,225,${flash})`; ctx.fillRect(0, 0, W, H); }
  dipBlack(ctx, sceneDip(t, [S.final[0], 9999], 0.9, 0));
}

// ============================================================ LOGO REVEAL =====================================================================
function sceneLogo(ctx, a, t) {
  const [t0, t1] = S.logo, local = t - t0, reveal = smoother(seg(t, M.logo - 0.4, M.logo + 2.8)), end = smooth(seg(t, t1 - 1.6, t1));
  const cam = { x: 0, y: 0, z: 1 }, st = new Stage(ctx, cam, t);
  sky(ctx, [[0, '#07050f'], [0.6, '#15113a'], [1, '#2a2060']]);
  drawStars(ctx, a, t, cam, 0.7, 0.02); glow(ctx, CX, CY - 10, 460, '#6a5ac0', 0.34 * reveal); glow(ctx, CX, CY, 240, '#ffd98a', 0.25 * reveal);
  // the settling light-white after the flash
  const wash = 1 - smooth(seg(t, t0, t0 + 1.8)); if (wash > 0) { ctx.fillStyle = `rgba(255,248,225,${wash})`; ctx.fillRect(0, 0, W, H); }
  st.put(a.horizon[3], -450, 470, 0.0, { nojit: true, alpha: 0.5 * reveal }); st.put(a.horizon[1], -450, 500, 0.0, { nojit: true, alpha: 0.7 * reveal });
  if (a.logo) {
    const lw = 430, lh = lw * a.logo.height / a.logo.width, sc = lerp(1.06, 1.0, smoother(seg(t, M.logo - 0.4, t1))), c = createCanvas(Math.ceil(lw), Math.ceil(lh)), g = c.getContext('2d'); g.drawImage(a.logo, 0, 0, lw, lh);
    // a slow gold light-sweep clipped to the logo's own pixels
    const sw = seg(t, M.logo + 0.8, M.logo + 3.8); if (sw > 0 && sw < 1) { g.globalCompositeOperation = 'source-atop'; const sx = lerp(-lw * 0.3, lw * 1.3, sw), gr = g.createLinearGradient(sx - 70, 0, sx + 70, 60); gr.addColorStop(0, 'rgba(255,240,190,0)'); gr.addColorStop(0.5, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, lw, lh); }
    ctx.save(); ctx.translate(CX, CY - 4); ctx.scale(sc, sc); ctx.globalAlpha = reveal * (1 - end); ctx.shadowColor = 'rgba(120,100,230,0.55)'; ctx.shadowBlur = 30; ctx.drawImage(c, -lw / 2, -lh / 2); ctx.restore();
  }
  a.motes.draw(ctx, t, cam, '#ffe0a0', 0.8 * reveal * (1 - end)); a.dust.draw(ctx, t, cam, '#b8aef0', 0.35);
  dipBlack(ctx, end);
}

// ============================================================ MASTER ==========================================================================
function renderFrame(ctx, a, t, frame) {
  ctx.save(); ctx.fillStyle = '#020106'; ctx.fillRect(0, 0, W, H);
  const inS = (s) => t >= s[0] - 0.001 && t < s[1];
  if (t < S.realm[0]) { sky(ctx, [[0, '#020106'], [1, '#050310']]); a.dust.draw(ctx, t, { x: 0, y: 0 }, '#8a82c8', 0.35 * smooth(seg(t, 0.6, 2))); }
  else if (inS(S.realm)) sceneRealm(ctx, a, t); else if (inS(S.order)) sceneOrder(ctx, a, t); else if (inS(S.warriors)) sceneWarriors(ctx, a, t);
  else if (inS(S.question)) sceneQuestion(ctx, a, t); else if (inS(S.fate)) sceneFate(ctx, a, t); else if (inS(S.final)) sceneFinal(ctx, a, t); else sceneLogo(ctx, a, t);
  // cinematic finish: vignette, grain, letterbox, and the typography on top
  const logoPhase = t >= S.logo[0]; vignette(ctx, W, H, logoPhase ? 0.5 : 0.62, 0.42); filmGrain(ctx, W, H, frame, 0.09);
  if (!logoPhase) drawText(ctx, W, H, TL.text, t, frame);
  ctx.restore();
}
module.exports = { buildAssets, renderFrame };
