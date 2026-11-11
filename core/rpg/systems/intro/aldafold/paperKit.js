'use strict';
// Paper-cutout toolkit for the Aldafold intro: seeded RNG, torn-edge shapes, layered "paper" sprites with shadow + edge light, grain.
const { createCanvas } = require('canvas');

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t) => Math.pow(clamp(t), 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 progress of t inside [a,b]
const hex = (h) => { if (/^rgb/.test(h)) return h.match(/[\d.]+/g).slice(0, 3).map(Number); h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const mix = (a, b, t) => { const A = typeof a === 'string' ? hex(a) : a, B = typeof b === 'string' ? hex(b) : b; return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };
const rgba = (c, a) => { const A = typeof c === 'string' ? hex(c) : c; return `rgba(${A[0]},${A[1]},${A[2]},${a})`; };

// ---- shared paper grain (tileable-ish noise, built once) -------------------------------------------------------------
let _grain = null;
function grainTile() {
  if (_grain) return _grain;
  const S = 256, c = createCanvas(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), r = rng(777);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (r() - 0.5) * 70 + (r() - 0.5) * 30;       // fine grain
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  // long paper fibres
  g.globalAlpha = 0.07; g.strokeStyle = '#fff'; g.lineWidth = 1;
  for (let i = 0; i < 120; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, l = 6 + r() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  g.globalAlpha = 0.06; g.strokeStyle = '#000';
  for (let i = 0; i < 120; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, l = 6 + r() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  _grain = c; return c;
}
// multiply paper grain onto whatever is already painted in `ctx` (limited to existing alpha via source-atop)
function applyGrain(ctx, w, h, strength = 0.35, offX = 0, offY = 0) {
  // multiply grain ONLY where the piece has pixels (transparent areas must stay transparent)
  const t = grainTile(), tmp = createCanvas(w, h), tg = tmp.getContext('2d');
  tg.translate(-offX, -offY); tg.fillStyle = tg.createPattern(t, 'repeat'); tg.fillRect(offX, offY, w + 256, h + 256); tg.setTransform(1, 0, 0, 1, 0, 0);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(ctx.canvas, 0, 0);
  ctx.save(); ctx.globalAlpha = strength; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(tmp, 0, 0); ctx.restore();
}

// ---- torn edges ------------------------------------------------------------------------------------------------------
// Walk a polyline and add small deterministic jitter so scissor/torn paper edges read as hand-cut.
function jitterPoly(pts, seed, amt = 1.2, step = 7) {
  const r = rng(seed), out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const t = k / n; out.push([a[0] + dx * t + (r() - 0.5) * amt * 2, a[1] + dy * t + (r() - 0.5) * amt * 2]); }
  }
  return out;
}
function pathPoly(ctx, pts, close = true) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); }
// smooth (Catmull-Rom) through points
function pathSmooth(ctx, pts, close = true, k = 0.5) {
  const n = pts.length; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  const P = (i) => pts[(i + n) % n];
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = close ? P(i - 1) : pts[Math.max(0, i - 1)], p1 = P(i), p2 = close ? P(i + 1) : pts[Math.min(n - 1, i + 1)], p3 = close ? P(i + 2) : pts[Math.min(n - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 3 * 2, p1[1] + (p2[1] - p0[1]) * k / 3 * 2, p2[0] - (p3[0] - p1[0]) * k / 3 * 2, p2[1] - (p3[1] - p1[1]) * k / 3 * 2, p2[0], p2[1]);
  }
  if (close) ctx.closePath();
}

// ---- cutout: render a shape-painting callback into its own canvas as a lit paper piece ---------------------------------
// paint(ctx) must fill the silhouette with ANY opaque colour; we then re-colour (gradient), add the lit edge + grain.
// opts: {w,h,pad,color,top,edge,edgeA,grain,shadow:{dx,dy,blur,a}}
function cutout(w, h, paint, opts = {}) {
  const pad = opts.pad == null ? 8 : opts.pad, W = Math.ceil(w + pad * 2), H = Math.ceil(h + pad * 2);
  const shape = createCanvas(W, H), sg = shape.getContext('2d'); sg.translate(pad, pad); sg.fillStyle = '#000'; paint(sg);
  const out = createCanvas(W, H), g = out.getContext('2d');
  if (opts.shadow !== false) {
    const sh = opts.shadow || { dx: 3, dy: 4, blur: 5, a: 0.5 };
    const sc = createCanvas(W, H), s2 = sc.getContext('2d'); s2.drawImage(shape, 0, 0);
    s2.globalCompositeOperation = 'source-in'; s2.fillStyle = '#000'; s2.fillRect(0, 0, W, H);
    g.save(); g.shadowColor = `rgba(0,0,0,${sh.a})`; g.shadowBlur = sh.blur; g.shadowOffsetX = sh.dx; g.shadowOffsetY = sh.dy; g.drawImage(sc, 0, 0); g.restore();
  }
  // body colour with vertical gradient
  const body = createCanvas(W, H), b = body.getContext('2d'); b.drawImage(shape, 0, 0); b.globalCompositeOperation = 'source-in';
  const gr = b.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, opts.top || opts.color || '#1a1a2e'); gr.addColorStop(1, opts.color || '#0e0e1a'); b.fillStyle = gr; b.fillRect(0, 0, W, H);
  if (opts.detail) { b.globalCompositeOperation = 'source-atop'; b.save(); b.translate(pad, pad); opts.detail(b); b.restore(); }
  applyGrain(b, W, H, opts.grain == null ? 0.4 : opts.grain, Math.floor((opts.seed || 0) * 13) % 200, Math.floor((opts.seed || 0) * 29) % 200);
  g.drawImage(body, 0, 0);
  // lit paper edge (upper-left thickness): shape shifted down-right punched out of itself
  if (opts.edge !== false) {
    const e = createCanvas(W, H), eg = e.getContext('2d'); eg.drawImage(shape, 0, 0); eg.globalCompositeOperation = 'destination-out'; eg.drawImage(shape, 1.4, 1.6);
    eg.globalCompositeOperation = 'source-in'; eg.fillStyle = opts.edgeColor || '#8b86c8'; eg.fillRect(0, 0, W, H);
    g.globalAlpha = opts.edgeA == null ? 0.55 : opts.edgeA; g.drawImage(e, 0, 0); g.globalAlpha = 1;
  }
  return { canvas: out, w: W, h: H, pad };
}

// vignette + film grain overlay helpers for the final pass
function vignette(ctx, W, H, a = 0.65, inner = 0.45) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function filmGrain(ctx, W, H, frame, a = 0.07) {
  const t = grainTile(), ox = (frame * 53) % 256, oy = (frame * 97) % 256;
  ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(t, 'repeat'); ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(ox, oy, W, H); ctx.restore();
}

module.exports = { createCanvas, rng, clamp, lerp, smooth, smoother, easeOut, easeIn, seg, mix, rgba, hex, grainTile, applyGrain, jitterPoly, pathPoly, pathSmooth, cutout, vignette, filmGrain };
