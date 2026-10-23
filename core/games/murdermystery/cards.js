// ============================================
// MURDER MYSTERY - VISUAL CARD SYSTEM
// Victorian-noir image cards rendered locally
// with node-canvas. No external services.
// Card language:
// candlelit ivory on ink, blood crimson for
// death, brass amber for the law, spectral
// pale jade for the ghost, wax seals,
// film grain, hairline frames, Playfair
// Display display type, EB Garamond body,
// Special Elite for stamps and secrets.
// ============================================

const path = require('path');
const fs = require('fs');

// Lazy canvas - the bot may never render a card; don't pay startup cost.
let _canvas = null;
function cv() {
  if (!_canvas) _canvas = require('canvas');
  return _canvas;
}

// ---------- palette ----------
const C = {
  ink: '#0d0b10',
  inkSoft: '#171320',
  ivory: '#ece2c8',
  ivoryDim: '#b3a98e',
  ivoryFaint: '#847c66',
  crimson: '#a01f31',
  crimsonHi: '#c8324a',
  crimsonDeep: '#5e1220',
  amber: '#c9a13b',
  amberHi: '#e0bd5c',
  fog: '#8b8590',
  ghost: '#9fd8c8',   // spectral jade for ghost/angel accents
  ghostHi: '#c9efe2',
};

const ASSETS = path.join(__dirname, 'assets');
const BG_DIR = path.join(ASSETS, 'bg');
const CHAR_DIR = path.join(ASSETS, 'char');

// ---------- fonts ----------
let _fontsRegistered = false;
function registerFonts() {
  if (_fontsRegistered) return;
  const { registerFont } = cv();
  const dir = path.join(ASSETS, 'fonts');
  const fonts = [
    ['PF-Black', 'PlayfairDisplay-Black.ttf'],
    ['PF-Bold', 'PlayfairDisplay-Bold.ttf'],
    ['PF-Med', 'PlayfairDisplay-Medium.ttf'],
    ['PF-MedIt', 'PlayfairDisplay-MediumItalic.ttf'],
    ['EB-Semi', 'EBGaramond-SemiBold.ttf'],
    ['EB-Reg', 'EBGaramond-Regular.ttf'],
    ['Type', 'SpecialElite-Regular.ttf'],
  ];
  for (const [name, file] of fonts) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) registerFont(p, { family: name, weight: 'normal', style: 'normal' });
  }
  _fontsRegistered = true;
}

// ---------- image cache (LRU, decoded images are heavy) ----------
const _imgCache = new Map(); // key -> Image
const IMG_CACHE_MAX = 8;

function cachePut(key, img) {
  if (_imgCache.has(key)) _imgCache.delete(key);
  _imgCache.set(key, img);
  while (_imgCache.size > IMG_CACHE_MAX) {
    const first = _imgCache.keys().next().value;
    _imgCache.delete(first);
  }
}

async function loadImageFile(file) {
  if (_imgCache.has(file)) return _imgCache.get(file);
  const { loadImage } = cv();
  const img = await loadImage(file);
  cachePut(file, img);
  return img;
}

async function loadBg(id) {
  return loadImageFile(path.join(BG_DIR, `${id}.jpg`));
}

async function loadSprite(charId) {
  return loadImageFile(path.join(CHAR_DIR, `${charId}.png`));
}

// ---------- small helpers ----------
function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out || 'I';
}

function fmtNo(n) {
  return String(n).padStart(3, '0');
}

// letter-spaced centered text
function spaced(ctx, text, cx, y, spacing, align = 'center') {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let x = align === 'center' ? cx - total / 2 : cx;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  return total;
}

function fitFont(ctx, text, font, size, maxWidth, minSize = 18) {
  let s = size;
  while (s > minSize) {
    ctx.font = `${s}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  }
  ctx.font = `${s}px ${font}`;
  return s;
}

function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 5) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

// cover-fit draw (like CSS background-size: cover)
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > r) { // source wider -> crop sides
    sw = img.height * r;
    sx = (img.width - sw) / 2;
  } else {      // source taller -> crop top/bottom (bias upward: keep ceilings)
    sh = img.width / r;
    sy = (img.height - sh) * 0.35;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// background + darkness + vignette + grain + frame
function atmosphere(ctx, W, H, opts = {}) {
  const dark = opts.dark != null ? opts.dark : 0.62;
 // darkness gradient (heavier at bottom & edges)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(10,8,14,${(dark - 0.08).toFixed(3)})`);
  g.addColorStop(0.5, `rgba(9,7,12,${dark.toFixed(3)})`);
  g.addColorStop(1, `rgba(7,5,10,${Math.min(0.95, dark + 0.16).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

 // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  grain(ctx, W, H, opts.grainAlpha != null ? opts.grainAlpha : 0.05);
  frame(ctx, W, H, opts.frameColor || 'rgba(236,226,200,0.32)');
}

// film grain - prerendered noise tile
let _grainTile = null;
function grain(ctx, W, H, alpha) {
  const { createCanvas } = cv();
  if (!_grainTile) {
    _grainTile = createCanvas(280, 280);
    const gctx = _grainTile.getContext('2d');
    const img = gctx.createImageData(280, 280);
    for (let i = 0; i < img.data.length; i += 4) {
      const val = Math.floor(Math.random() * 255);
      img.data[i] = val; img.data[i + 1] = val; img.data[i + 2] = val;
      img.data[i + 3] = Math.floor(Math.random() * 40);
    }
    gctx.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = 0; y < H; y += 280) {
    for (let x = 0; x < W; x += 280) {
      ctx.drawImage(_grainTile, x, y);
    }
  }
  ctx.restore();
}

function frame(ctx, W, H, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20.5, 20.5, W - 41, H - 41);
  ctx.lineWidth = 3;
  ctx.strokeRect(34.5, 34.5, W - 69, H - 69);
 // corner diamonds on the inner frame
  ctx.fillStyle = color;
  const d = 7;
  for (const [cx, cy] of [[34.5, 34.5], [W - 34.5, 34.5], [34.5, H - 34.5], [W - 34.5, H - 34.5]]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-d, -d, d * 2, d * 2);
    ctx.restore();
  }
  ctx.restore();
}

function ornament(ctx, cx, y, width, color = C.amber) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx - 16, y);
  ctx.moveTo(cx + 16, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();
  ctx.translate(cx, y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-5.5, -5.5, 11, 11);
  ctx.restore();
}

// footer - manor name only (games are standalone; no public counters)
function footer(ctx, W, H, manorName) {
  ctx.save();
  ctx.font = '22px EB-Semi';
  ctx.fillStyle = 'rgba(236,226,200,0.55)';
  const text = `${manorName}`;
  spaced(ctx, text, W / 2, H - 52, 3);
  ctx.restore();
}

// wax seal with icon
function seal(ctx, cx, cy, r, color, iconFn) {
  ctx.save();
 // irregular blob
  ctx.beginPath();
  const bumps = 9;
  for (let i = 0; i <= bumps; i++) {
    const ang = (i / bumps) * Math.PI * 2;
    const rr = r * (0.92 + 0.08 * Math.sin(i * 2.7 + 1.3));
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(
      cx + Math.cos(ang - Math.PI / bumps) * rr * 1.05,
      cy + Math.sin(ang - Math.PI / bumps) * rr * 1.05,
      x, y,
    );
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fill();
  ctx.shadowColor = 'transparent';
 // inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
 // highlight
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.3, r * 0.55, Math.PI * 1.05, Math.PI * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (iconFn) iconFn(ctx, cx, cy, r * 0.52);
  ctx.restore();
}

// ---------- vector icons ----------
const Icons = {
  dagger(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
 // blade
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.18, -s * 0.15);
    ctx.lineTo(0, s * 0.28);
    ctx.lineTo(-s * 0.18, -s * 0.15);
    ctx.closePath();
    ctx.fill();
 // guard
    ctx.fillRect(-s * 0.5, s * 0.28, s, s * 0.12);
 // grip
    ctx.fillRect(-s * 0.09, s * 0.4, s * 0.18, s * 0.42);
 // pommel
    ctx.beginPath();
    ctx.arc(0, s * 0.88, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  magnifier(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.arc(-s * 0.12, -s * 0.15, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.2);
    ctx.lineTo(s * 0.62, s * 0.62);
    ctx.stroke();
 // glint
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(-s * 0.12, -s * 0.15, s * 0.28, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    ctx.restore();
  },
  halo(ctx, cx, cy, s) {
 // angelic ring with rays
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.15, s * 0.72, s * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
 // rays
    ctx.lineWidth = s * 0.09;
    for (const ang of [-2.35, -1.9, -1.25, -0.8]) {
      const x1 = Math.cos(ang) * s * 0.85;
      const y1 = -s * 0.15 + Math.sin(ang) * s * 0.42;
      const x2 = Math.cos(ang) * s * 1.08;
      const y2 = -s * 0.15 + Math.sin(ang) * s * 0.55;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  },
  eye(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.72, s, 0);
    ctx.quadraticCurveTo(0, s * 0.72, -s, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  scales(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s * 0.7);
    ctx.moveTo(-s * 0.75, s * 0.7);
    ctx.lineTo(s * 0.75, s * 0.7);
    ctx.moveTo(-s * 0.85, -s * 0.55);
    ctx.lineTo(s * 0.85, -s * 0.55);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * s * 0.85, -s * 0.2, s * 0.34, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * s * 0.85, -s * 0.55);
      ctx.lineTo(side * s * 0.85, -s * 0.2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, -s, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  moon(ctx, cx, cy, s) {
 // crescent via two arcs (path subtraction with even-odd not needed: outline shape)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, s, Math.PI * 0.42, Math.PI * 1.58, false);
    ctx.arc(s * 0.42, 0, s * 0.78, Math.PI * 1.5, Math.PI * 0.5, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
 // Wave 2a role icons
  candle(ctx, cx, cy, s) {
 // veiled candle: wax column + flame + halo of smoke
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
 // wax column
    ctx.fillRect(-s * 0.28, -s * 0.1, s * 0.56, s * 0.95);
 // drips
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.44, s * 0.15, -s * 0.34, s * 0.3);
    ctx.quadraticCurveTo(-s * 0.24, s * 0.12, -s * 0.28, -s * 0.1);
    ctx.fill();
 // wick
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.1);
    ctx.lineTo(0, -s * 0.3);
    ctx.stroke();
 // flame
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.75);
    ctx.quadraticCurveTo(s * 0.28, -s * 0.42, 0, -s * 0.26);
    ctx.quadraticCurveTo(-s * 0.28, -s * 0.42, 0, -s * 0.75);
    ctx.fill();
 // smoke wisps
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.7);
    ctx.quadraticCurveTo(s * 0.2, s * 0.45, s * 0.42, s * 0.25);
    ctx.stroke();
    ctx.restore();
  },
  tray(ctx, cx, cy, s) {
 // silver salver: ellipse + pedestal + key resting on top
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.fillStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.1;
 // salver
    ctx.beginPath();
    ctx.ellipse(0, s * 0.25, s * 0.95, s * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, s * 0.2, s * 0.95, s * 0.34, 0, Math.PI, Math.PI * 2);
    ctx.fill();
 // pedestal
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.6);
    ctx.lineTo(s * 0.3, s * 0.6);
    ctx.moveTo(-s * 0.18, s * 0.9);
    ctx.lineTo(s * 0.18, s * 0.9);
    ctx.moveTo(0, s * 0.55);
    ctx.lineTo(0, s * 0.9);
    ctx.stroke();
 // key across the tray
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.arc(-s * 0.42, -s * 0.05, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.27, 0);
    ctx.lineTo(s * 0.45, 0);
    ctx.moveTo(s * 0.45, 0);
    ctx.lineTo(s * 0.45, s * 0.16);
    ctx.moveTo(s * 0.3, 0);
    ctx.lineTo(s * 0.3, s * 0.16);
    ctx.stroke();
    ctx.restore();
  },
  masks(ctx, cx, cy, s) {
 // twin theatre masks: one smiling, one grieving, overlapping
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(236,226,200,0.95)';
    ctx.lineWidth = s * 0.1;
    const mask = (ox, oy, flip) => {
      ctx.save();
      ctx.translate(ox, oy);
      if (flip) ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -s * 0.5);
      ctx.quadraticCurveTo(s * 0.46, -s * 0.56, s * 0.42, s * 0.1);
      ctx.quadraticCurveTo(s * 0.36, s * 0.62, 0, s * 0.78);
      ctx.quadraticCurveTo(-s * 0.36, s * 0.62, -s * 0.42, s * 0.1);
      ctx.quadraticCurveTo(-s * 0.46, -s * 0.56, -s * 0.42, -s * 0.5);
      ctx.closePath();
      ctx.stroke();
 // eyes
      ctx.fillStyle = 'rgba(236,226,200,0.95)';
      ctx.beginPath();
      ctx.arc(-s * 0.18, -s * 0.14, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * 0.18, -s * 0.14, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
 // mouth (arc flips between smile and grief)
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.arc(0, s * 0.3, s * 0.2, flip ? Math.PI * 1.15 : Math.PI * 0.85, flip ? Math.PI * 1.85 : Math.PI * 0.15);
      ctx.stroke();
      ctx.restore();
    };
    mask(s * 0.26, s * 0.1, true);   // grieving, behind-right
    mask(-s * 0.24, -s * 0.06, false); // smiling, front-left
    ctx.restore();
  },
};

// rotated stamp (rubber-stamp look) - optional dark plate for legibility
function stamp(ctx, text, cx, cy, w, h, color, angle = -0.12, fontSize = null, plate = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.92;
  const size = fontSize || Math.min(h * 0.52, (w * 1.7) / text.length);
  ctx.font = `${size}px Type`;
  const tw = ctx.measureText(text).width;
  const boxW = Math.max(w, tw + 44);
  if (plate) {
    ctx.fillStyle = 'rgba(12,6,10,0.42)';
    ctx.fillRect(-boxW / 2 - 8, -h / 2 - 8, boxW + 16, h + 16);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  strokeRoundedRect(ctx, -boxW / 2, -h / 2, boxW, h, 10);
  ctx.lineWidth = 1.8;
  strokeRoundedRect(ctx, -boxW / 2 + 7, -h / 2 + 7, boxW - 14, h - 14, 7);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

function strokeRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

// draw a character sprite with soft drop shadow, anchored bottom-center
async function drawSprite(ctx, charId, cx, bottomY, maxH, opts = {}) {
  const img = await loadSprite(charId);
  const scale = Math.min(maxH / img.height, (opts.maxW || 1200) / img.width);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  if (!opts.noShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
  }
  ctx.drawImage(img, cx - w / 2, bottomY - h, w, h);
  ctx.restore();
  return { w, h, top: bottomY - h };
}

// grayscale a sprite into an offscreen canvas, then draw with shadow
async function drawSpriteGray(ctx, charId, cx, bottomY, maxH, opts = {}) {
  const { createCanvas } = cv();
  const img = await loadSprite(charId);
  const scale = Math.min(maxH / img.height, (opts.maxW || 1200) / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const off = createCanvas(w, h);
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0, w, h);
  const idata = octx.getImageData(0, 0, w, h);
  const d = idata.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
 // slight cool tint for the dead
    d[i] = Math.max(0, lum - 6);
    d[i + 1] = Math.max(0, lum - 2);
    d[i + 2] = Math.min(255, lum + 8);
  }
  octx.putImageData(idata, 0, 0);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(off, cx - w / 2, bottomY - h, w, h);
  ctx.restore();
  return { w, h, top: bottomY - h };
}

// head-crop avatar in a ring (uses top of the sprite)
async function drawAvatar(ctx, charId, cx, cy, r, ringColor = C.amber) {
  const img = await loadSprite(charId);
  const srcH = img.height * 0.30;
  const srcW = srcH;
  const sx = (img.width - srcW) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#141018';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(img, sx, 0, srcW, srcH, cx - r, cy - r, r * 2, r * 2);
 // darken lower half for depth
  const g = ctx.createLinearGradient(0, cy, 0, cy + r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
 // rings
  ctx.save();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(236,226,200,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// blood splatter field around a point
function splatter(ctx, cx, cy, spread, n = 12) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * spread;
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist * 0.7;
    const r = 4 + Math.random() * 26 * (1 - dist / spread);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(140,20,35,0.5)');
    g.addColorStop(0.7, 'rgba(110,16,30,0.28)');
    g.addColorStop(1, 'rgba(90,10,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
 // two drips
  for (let i = 0; i < 2; i++) {
    const x = cx + (Math.random() - 0.5) * spread * 0.8;
    const y0 = cy + Math.random() * 40;
    const len = 60 + Math.random() * 130;
    const g = ctx.createLinearGradient(x, y0, x, y0 + len);
    g.addColorStop(0, 'rgba(140,20,35,0.4)');
    g.addColorStop(1, 'rgba(140,20,35,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 2.5, y0, 5, len);
  }
  ctx.restore();
}

// spectral fog field (ghost / guardian cards)
function fogField(ctx, W, H, color = '201,239,226', alpha = 0.16) {
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * W;
    const y = H * 0.25 + Math.random() * H * 0.75;
    const r = 120 + Math.random() * 320;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// final common wrapper - every card render returns a PNG buffer or null
async function renderCard(W, H, drawFn) {
  try {
    registerFonts();
    const { createCanvas } = cv();
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    await drawFn(ctx);
    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error(' MurderCard render error:', e.message);
    return null;
  }
}

// ============================================
// CARD SCENES
// ============================================

const LAND_W = 1600, LAND_H = 900;
const PORT_W = 900, PORT_H = 1400;

const ROLE_STYLE = {
  KILLER: { color: C.crimsonHi, word: 'THE KILLER', icon: 'dagger', sealColor: C.crimsonDeep },
  INVESTIGATOR: { color: C.amberHi, word: 'THE INVESTIGATOR', icon: 'magnifier', sealColor: '#8a6d24' },
  GUARDIAN: { color: C.ghostHi, word: 'THE GUARDIAN', icon: 'halo', sealColor: '#3c5a52' },
  MEDIUM: { color: '#b9a7e0', word: 'THE MEDIUM', icon: 'candle', sealColor: '#4a3b63' },
  BUTLER: { color: C.ivory, word: 'THE BUTLER', icon: 'tray', sealColor: '#2f3a4a' },
  ACCOMPLICE: { color: '#c99a8a', word: 'THE ACCOMPLICE', icon: 'masks', sealColor: '#5a3030' },
  CIVILIAN: { color: C.ivory, word: 'A CIVILIAN', icon: 'eye', sealColor: '#3f3b47' },
};

const ROLE_INSTRUCTIONS = {
  KILLER: 'Each night, choose a guest to eliminate - and choose the room where their body will lie. Survive the discussions. Dodge the vote.',
  INVESTIGATOR: 'Each night you may lay two guests on the scales and learn which one unsettles the house more. A lean, never a verdict. Three weighings per case.',
  GUARDIAN: 'Each night you may watch over one guest - or yourself. If the knife comes for them, you will turn it away. No one will ever know.',
  MEDIUM: 'Twice this case you may part the veil and let the dead speak. Their words reach your ear alone - the house hears only what you choose to repeat.',
  BUTLER: 'You know every corridor of this house. On the third night the manor will tell you the name behind the knife - and the killer already knows your face.',
  ACCOMPLICE: 'You cannot kill, and you carry no clue. But if the killer wins, you win with them. Nobody knows your heart - not even the killer. Steer the house astray.',
  CIVILIAN: 'You have no gift except your wits. Watch. Question. Search. Vote. Find the killer before the manor runs out of guests.',
};

// concealment dots for room rows (difficulty, shown publicly)
function concealDots(ctx, x, y, n, color, spacing = 22, r = 7) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + i * spacing, y, i < n ? r : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Game introduction - group card, manor exterior
async function renderIntro({ playerCount, manorName, openingLine, nightLine }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('manor');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.58 });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'A PARTY OF GUESTS ARRIVES', LAND_W / 2, 208, 7);

    ctx.font = '108px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 18;
    spaced(ctx, 'THE MYSTERY BEGINS', LAND_W / 2, 350, 6);
    ctx.shadowColor = 'transparent';

    ornament(ctx, LAND_W / 2, 420, 520);

    ctx.font = 'italic 42px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'center';
    ctx.fillText(openingLine, LAND_W / 2, 505);

    ctx.font = '31px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${playerCount} guests settle into ${manorName}. One of them is hiding a deadly secret.`, LAND_W / 2, 590);

    ctx.font = '31px EB-Semi';
    ctx.fillStyle = C.amber;
    ctx.fillText(nightLine, LAND_W / 2, 648);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Private role assignment - DM portrait (MANDATORY card)
async function renderRoleCard({ character, playerName, role, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('gallery');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.78 });

    const style = ROLE_STYLE[role] || ROLE_STYLE.CIVILIAN;

 // character sprite, right anchored
    await drawSprite(ctx, character.id, 620, 1240, 860);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = '26px EB-Semi';
    ctx.fillStyle = C.ivoryDim;
    spaced(ctx, manorName, 70, 128, 6, 'left');
    ctx.strokeStyle = 'rgba(236,226,200,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(70, 152);
    ctx.lineTo(560, 152);
    ctx.stroke();

 // player name
    fitFont(ctx, playerName.toUpperCase(), 'PF-Black', 62, 500);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText(playerName.toUpperCase(), 70, 240);
    ctx.shadowColor = 'transparent';

    ctx.font = '28px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText('playing the part of', 70, 292);
    ctx.font = 'italic 44px PF-MedIt';
    ctx.fillStyle = C.amber;
    ctx.fillText(character.name, 70, 344);
    ctx.font = '30px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(character.title, 70, 388);

 // role block
    ctx.font = '28px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'YOU ARE', 70, 500, 8, 'left');

    fitFont(ctx, style.word, 'PF-Black', (role === 'INVESTIGATOR' || role === 'ACCOMPLICE') ? 74 : 88, 560, 44);
    ctx.fillStyle = style.color;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(style.word, 70, 608);
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 648);
    ctx.lineTo(70 + 300, 648);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(70, 656);
    ctx.lineTo(70 + 300, 656);
    ctx.stroke();

 // instructions
    ctx.font = '31px EB-Reg';
    ctx.fillStyle = C.ivory;
    wrap(ctx, ROLE_INSTRUCTIONS[role] || ROLE_INSTRUCTIONS.CIVILIAN, 70, 716, 480, 46, 6);

 // seal
    seal(ctx, 150, 1180, 78, style.sealColor, Icons[style.icon]);

 // secret strip
    ctx.font = '26px Type';
    ctx.fillStyle = role === 'KILLER' ? C.crimsonHi : 'rgba(236,226,200,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('Your identity is secret. Tell no one.', PORT_W / 2 + 80, 1312);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Butler's third-night confidence (Wave 2a, ) - private DM card
async function renderButlerRevealCard({ butlerChar, killerChar, killerName, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('library');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.74 });

 // killer sprite, right anchored (the name behind the knife)
    await drawSprite(ctx, killerChar.id, 620, 1240, 860);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = '26px EB-Semi';
    ctx.fillStyle = C.ivoryDim;
    spaced(ctx, `${manorName} - NIGHT ${night}`, 70, 128, 6, 'left');
    ctx.strokeStyle = 'rgba(236,226,200,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(70, 152);
    ctx.lineTo(560, 152);
    ctx.stroke();

    ctx.font = '26px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'THE MANOR PAYS ITS DEBTS', 70, 240, 5, 'left');

    fitFont(ctx, 'THE NAME BEHIND', 'PF-Black', 64, 560, 40);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText('THE NAME', 70, 330);
    ctx.fillText('BEHIND', 70, 402);
    fitFont(ctx, 'THE KNIFE', 'PF-Black', 84, 560, 44);
    ctx.fillStyle = C.crimsonHi;
    ctx.fillText('THE KNIFE', 70, 500);
    ctx.shadowColor = 'transparent';

    ornament(ctx, 240, 560, 380);

    ctx.font = 'italic 38px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.fillText(killerName, 70, 648);
    ctx.font = '28px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${killerChar.name}, ${killerChar.title}`, 70, 692);

    ctx.font = '27px EB-Reg';
    ctx.fillStyle = C.ivory;
    wrap(ctx, 'The butler holds the name the house kept from you. But the killer has known YOUR name since the doors locked - spend this one carefully.', 70, 760, 480, 42, 6);

    seal(ctx, 150, 1180, 78, '#2f3a4a', Icons.tray);

    ctx.font = '26px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('A whisper between you and the dark.', PORT_W / 2 + 80, 1312);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Nightfall - group card
async function renderNightCard({ night, line, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('hallway_b');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.8 });

 // moon with glow (offscreen to cut crescent cleanly)
    const { createCanvas } = cv();
    const moonC = createCanvas(420, 420);
    const mctx = moonC.getContext('2d');
    mctx.shadowColor = 'rgba(236,226,200,0.9)';
    mctx.shadowBlur = 55;
    mctx.fillStyle = '#ece2c8';
    mctx.beginPath();
    mctx.arc(210, 210, 88, 0, Math.PI * 2);
    mctx.fill();
    mctx.shadowColor = 'transparent';
    mctx.globalCompositeOperation = 'destination-out';
    mctx.beginPath();
    mctx.arc(246, 182, 80, 0, Math.PI * 2);
    mctx.fill();
    ctx.drawImage(moonC, 1090, 40);

    ctx.textAlign = 'left';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.ivoryDim;
    spaced(ctx, 'THE MANOR SLEEPS', LAND_W / 2, 300, 8);

    ctx.font = '128px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 20;
    spaced(ctx, 'NIGHT', LAND_W / 2, 448, 22);
    ctx.shadowColor = 'transparent';

    ctx.font = '96px PF-Black';
    ctx.fillStyle = C.amber;
    spaced(ctx, roman(night), LAND_W / 2, 570, 10);

    ornament(ctx, LAND_W / 2, 630, 460);

    ctx.textAlign = 'center';
    ctx.font = 'italic 38px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.fillText(line, LAND_W / 2, 710);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Morning - group card. outcome: 'murder' | 'saved' | 'quiet'
// Includes the search-phase room list (the day's board).
async function renderMorningCard({ night, outcome, line, rooms, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('teatime');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.7 });

    const styles = {
      murder: { kicker: 'DAWN \u00B7 AFTER NIGHT ' + roman(night), head: 'A MURDER', color: C.crimsonHi, accent: C.crimson },
      saved: { kicker: 'DAWN \u00B7 AFTER NIGHT ' + roman(night), head: 'DEATH WAS CHEATED', color: C.ghostHi, accent: C.ghost },
      quiet: { kicker: 'DAWN \u00B7 AFTER NIGHT ' + roman(night), head: 'ALL ARE BREATHING', color: C.ivory, accent: C.amber },
    };
    const st = styles[outcome] || styles.quiet;

    ctx.textAlign = 'left';
    ctx.font = '28px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, st.kicker, 110, 190, 6, 'left');

    fitFont(ctx, st.head, 'PF-Black', 110, 1000, 52);
    ctx.fillStyle = st.color;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    ctx.fillText(st.head, 110, 310);
    ctx.shadowColor = 'transparent';

    ctx.font = 'italic 33px PF-MedIt';
    ctx.fillStyle = C.ivory;
    wrap(ctx, line, 110, 386, 800, 44, 2);

    if (outcome === 'murder') {
      ctx.font = '29px EB-Semi';
      ctx.fillStyle = C.amber;
      ctx.fillText('The body has not been found. The manor searches.', 110, 492);
    } else if (outcome === 'saved') {
      ctx.font = '29px EB-Semi';
      ctx.fillStyle = C.ghostHi;
      ctx.fillText('No one died last night. The manor searches all the same.', 110, 492);
    }

 // room board (right column)
    if (rooms && rooms.length) {
      ctx.font = '26px EB-Semi';
      ctx.fillStyle = C.ivoryDim;
      spaced(ctx, 'THE ROOMS OF THE MANOR', 1305, 186, 5);
      ctx.font = '22px Type';
      ctx.fillStyle = C.ivoryFaint;
      ctx.textAlign = 'right';
      ctx.fillText('one search each \u00B7 dots = difficulty', 1530, 224);
      ctx.textAlign = 'left';

      const rowH = Math.min(88, 560 / rooms.length);
      let y = 296;
      rooms.forEach((r, i) => {
        ctx.font = '34px PF-Bold';
        ctx.fillStyle = C.ivory;
        ctx.fillText(`${i + 1}.`, 1080, y);
        fitFont(ctx, r.name.replace(/^the /i, ''), 'PF-Bold', 34, 280, 22);
        ctx.fillText(r.name.replace(/^the /i, ''), 1130, y);
        concealDots(ctx, 1496, y - 10, r.conceal, C.amber, 16, 6);
        ctx.font = '22px EB-Reg';
        ctx.fillStyle = C.ivoryFaint;
        fitFont(ctx, r.hint, 'EB-Reg', 22, 340, 16);
        ctx.fillText(r.hint, 1130, y + 36);
        y += rowH;
      });
    }

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Body discovered - group card (victim + room + finder)
async function renderBodyFoundCard({ victimChar, victimName, room, finderName, method, hour, night, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg(room.id);
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.66 });

    splatter(ctx, 420, 620, 300, 16);
    await drawSpriteGray(ctx, victimChar.id, 420, 830, 600);
    stamp(ctx, 'DECEASED', 420, 190, 320, 86, 'rgba(200,50,74,0.95)', -0.1, 46);

    ctx.textAlign = 'left';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, `A BODY IS FOUND \u00B7 ${room.name.toUpperCase()}`, 800, 230, 4, 'left');

    fitFont(ctx, victimName.toUpperCase(), 'PF-Black', 92, 720, 40);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(victimName.toUpperCase(), 800, 360);
    ctx.shadowColor = 'transparent';

    ctx.font = '92px PF-Black';
    ctx.fillStyle = C.crimsonHi;
    ctx.fillText('IS DEAD', 800, 470);

    ctx.strokeStyle = 'rgba(200,50,74,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(800, 520);
    ctx.lineTo(1500, 520);
    ctx.stroke();

    ctx.font = 'italic 36px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.fillText(`${method.title}.`, 800, 590);

    ctx.font = '29px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    wrap(ctx, `${method.flavor}  The clock struck ${hour} o\u2019clock.`, 800, 648, 700, 42, 3);

    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    ctx.fillText(`Found by ${finderName}. The ghost whispers to them alone.`, 800, 760);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Ghost clue - DM portrait to the body finder
async function renderGhostClueCard({ clue, tier, victimName, room, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg(room.id);
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.86 });
    fogField(ctx, PORT_W, PORT_H, '159,216,200', 0.2);

 // spectral aura ring
    const g = ctx.createRadialGradient(PORT_W / 2, 560, 40, PORT_W / 2, 560, 330);
    g.addColorStop(0, 'rgba(159,216,200,0.22)');
    g.addColorStop(1, 'rgba(159,216,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 200, PORT_W, 760);

    ctx.textAlign = 'center';
    ctx.font = '40px Type';
    ctx.fillStyle = C.ghostHi;
    spaced(ctx, 'THE GHOST WHISPERS', PORT_W / 2, 170, 9);

    ctx.font = '46px PF-Bold';
    ctx.fillStyle = C.ivory;
    ctx.fillText(`CLUE ${roman(tier + 1)}`, PORT_W / 2, 250);

 // ghost eye motif
    ctx.save();
    ctx.globalAlpha = 0.85;
    Icons.eye(ctx, PORT_W / 2, 380, 60);
    ctx.restore();

    ctx.font = 'italic 37px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    const after = wrap(ctx, `\u201C${clue}\u201D`, 140, 520, 620, 54, 4);

    ctx.textAlign = 'center';
    ctx.font = '27px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`the ghost of ${victimName} \u00B7 found in ${room.name}`, PORT_W / 2, Math.max(after + 60, 780));

    ctx.font = '25px Type';
    ctx.fillStyle = C.ghostHi;
    ctx.fillText('Speak it. Twist it. Or keep it to yourself.', PORT_W / 2, 1310);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// ============================================
// WAVE 2c - THE HOUSE'S SEALS ("Go" on the seals pitch)
// Private find-card for a seal met on a night visit. The strongbox is drawn
// with primitives (no sprite art exists for seals); the wax seal carries the
// tier numeral. The riddle is ON the card so a screenshot alone can carry the
// puzzle. Same house language: room backdrop, atmosphere, hairline frame,
// Playfair/EB Garamond, film grain. Mellow's ask: "image cards ... locked
// safes or something".
// ============================================
function rrectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// a locked iron strongbox: body, door plate, rivets, dial, keyhole,
// padlock on a hasp, and the tier's wax seal
function drawLockedSafe(ctx, cx, cy, w, h, tier) {
  ctx.save();
 // ambient glow behind the box
  const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, w * 0.95);
  glow.addColorStop(0, 'rgba(201,161,59,0.15)');
  glow.addColorStop(1, 'rgba(201,161,59,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - w * 1.1, cy - h * 1.1, w * 2.2, h * 2.2);

  const x = cx - w / 2, y = cy - h / 2;

 // body - iron gradient
  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, '#2a2433');
  body.addColorStop(0.5, '#171320');
  body.addColorStop(1, '#0d0a11');
  rrectPath(ctx, x, y, w, h, 16);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,226,200,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

 // inner door plate
  const dx = x + 24, dy = y + 24, dw = w - 48, dh = h - 48;
  const door = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
  door.addColorStop(0, '#1d1826');
  door.addColorStop(1, '#120e18');
  rrectPath(ctx, dx, dy, dw, dh, 10);
  ctx.fillStyle = door;
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,226,200,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

 // corner rivets
  ctx.fillStyle = 'rgba(201,161,59,0.55)';
  for (const [rx, ry] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.fill();
  }

 // hinges (left edge)
  ctx.fillStyle = 'rgba(201,161,59,0.4)';
  for (const hy of [y + h * 0.26, y + h * 0.74]) {
    rrectPath(ctx, x - 5, hy - 14, 14, 28, 4);
    ctx.fill();
  }

 // dial (right of centre)
  const dxc = x + w * 0.68, dyc = y + h * 0.42, dr = h * 0.19;
  ctx.beginPath();
  ctx.arc(dxc, dyc, dr, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0910';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,161,59,0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
 // tick marks
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(dxc + Math.cos(ang) * (dr - 7), dyc + Math.sin(ang) * (dr - 7));
    ctx.lineTo(dxc + Math.cos(ang) * (dr - 2), dyc + Math.sin(ang) * (dr - 2));
    ctx.stroke();
  }
 // three spokes + hub
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(dxc, dyc);
    ctx.lineTo(dxc + Math.cos(ang) * (dr - 9), dyc + Math.sin(ang) * (dr - 9));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(dxc, dyc, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(224,189,92,0.9)';
  ctx.fill();

 // keyhole plate (below dial)
  const kx = dxc, ky = y + h * 0.74;
  rrectPath(ctx, kx - 20, ky - 22, 40, 44, 6);
  ctx.fillStyle = 'rgba(201,161,59,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,161,59,0.5)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(13,10,16,0.95)';
  ctx.beginPath();
  ctx.arc(kx, ky - 6, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(kx - 4, ky - 3);
  ctx.lineTo(kx + 4, ky - 3);
  ctx.lineTo(kx + 2, ky + 13);
  ctx.lineTo(kx - 2, ky + 13);
  ctx.closePath();
  ctx.fill();

 // tier numeral engraved, top-left of the door
  ctx.font = '30px EB-Semi';
  ctx.fillStyle = 'rgba(201,161,59,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(roman(tier), x + w * 0.24, y + h * 0.3);
  ctx.font = '16px Type';
  ctx.fillStyle = 'rgba(236,226,200,0.4)';
  ctx.fillText('SEAL', x + w * 0.24, y + h * 0.3 - 30);
  ctx.textBaseline = 'alphabetic';

 // padlock hanging off a hasp, bottom-centre of the door
  const px = cx, py = y + h - 6;
  ctx.strokeStyle = 'rgba(201,161,59,0.65)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(px, py - 26, 13, Math.PI, 0); // shackle
  ctx.stroke();
  rrectPath(ctx, px - 21, py - 26, 42, 34, 6);
  const lock = ctx.createLinearGradient(px - 21, py - 26, px + 21, py + 8);
  lock.addColorStop(0, '#3a3040');
  lock.addColorStop(1, '#191420');
  ctx.fillStyle = lock;
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,226,200,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(224,189,92,0.85)';
  ctx.beginPath();
  ctx.arc(px, py - 12, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px - 3, py - 10);
  ctx.lineTo(px + 3, py - 10);
  ctx.lineTo(px + 1.5, py - 1);
  ctx.lineTo(px - 1.5, py - 1);
  ctx.closePath();
  ctx.fill();

 // the house's wax seal, bottom-right corner of the door
  seal(ctx, x + w - 52, y + h - 46, 30, 'rgba(160,31,49,0.95)', (c2, x2, y2, s2) => {
    c2.fillStyle = 'rgba(236,226,200,0.92)';
    c2.font = `bold ${Math.round(s2 * 1.15)}px EB-Semi`;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillText(roman(tier), x2, y2 + 1);
  });

  ctx.restore();
}

async function renderSealCard({ seal, room, night, manorName }) {
  let pay = 30;
  try { pay = require('./cases').SEAL_PAY[seal.tier] || 30; } catch (e) { /* display only */ }
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg(room.id);
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.84 });
    fogField(ctx, PORT_W, PORT_H, '201,161,59', 0.09);

    ctx.textAlign = 'center';
    ctx.font = '40px Type';
    ctx.fillStyle = C.amberHi;
    spaced(ctx, 'THE HOUSE\u2019S SEALS', PORT_W / 2, 150, 9);

    ctx.font = '54px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.fillText(String(seal.name).toUpperCase(), PORT_W / 2, 226);

    ctx.font = '27px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`found in ${room.name} \u00B7 night ${night}`, PORT_W / 2, 274);

    ornament(ctx, PORT_W / 2, 318, 300);

 // the locked strongbox
    drawLockedSafe(ctx, PORT_W / 2, 560, 430, 330, seal.tier);

 // the riddle
    ctx.textAlign = 'left';
    ctx.font = 'italic 37px PF-MedIt';
    ctx.fillStyle = C.ivory;
    const after = wrap(ctx, `\u201C${seal.riddle}\u201D`, 140, 820, 620, 54, 5);

    ctx.textAlign = 'center';
    ctx.font = '27px EB-Semi';
    ctx.fillStyle = C.amber;
    ctx.fillText(`SEAL ${roman(seal.tier)} \u00B7 THE HOUSE PAYS ${pay} ZENI`, PORT_W / 2, Math.max(after + 72, 1180));

    ctx.font = '25px EB-Reg';
    ctx.fillStyle = C.ivoryFaint;
    ctx.fillText('answer with mm unlock - the manor alone will know', PORT_W / 2, Math.max(after + 114, 1222));

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Public search card - posted to the GROUP. Everyone sees who searched
// which room, and what they found (the user asked for open searches).
async function renderSearchCard({ playerChar, playerName, room, found, flavor, night, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg(room.id);
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.72 });

 // searcher sprite, left, alive (colour) - same character across all cards
    await drawSprite(ctx, playerChar.id, 380, 830, 600);
    stamp(ctx, 'THE SEARCH', 380, 175, 300, 78, 'rgba(201,161,59,0.92)', -0.08, 40);

    ctx.textAlign = 'left';
    fitFont(ctx, playerName.toUpperCase(), 'PF-Black', 74, 700, 34);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(playerName.toUpperCase(), 760, 300);
    ctx.shadowColor = 'transparent';

    ctx.font = '86px PF-Black';
    ctx.fillStyle = C.amber;
    ctx.fillText('SEARCHES', 760, 400);

    fitFont(ctx, room.name.toUpperCase(), 'PF-Black', 52, 720, 26);
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(room.name.toUpperCase(), 760, 470);

    ctx.font = '25px EB-Reg';
    ctx.fillStyle = C.ivoryFaint;
    wrap(ctx, room.hint, 760, 515, 700, 34, 2);
    concealDots(ctx, 766, 578, room.conceal, C.amber, 20, 7);

 // outcome strip
    ctx.strokeStyle = found ? 'rgba(200,50,74,0.65)' : 'rgba(236,226,200,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(760, 636);
    ctx.lineTo(1500, 636);
    ctx.stroke();

    if (found) {
      ctx.font = '64px PF-Black';
      ctx.fillStyle = C.crimsonHi;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 14;
      ctx.fillText('…AND FINDS A BODY', 760, 722);
      ctx.shadowColor = 'transparent';
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.ivoryDim;
      ctx.fillText('The ghost whispers - but to the finder alone.', 760, 780);
    } else {
      ctx.font = '56px PF-Black';
      ctx.fillStyle = C.ivory;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 14;
      ctx.fillText('…AND FINDS NOTHING', 760, 716);
      ctx.shadowColor = 'transparent';
      ctx.font = 'italic 30px PF-MedIt';
      ctx.fillStyle = C.ivoryDim;
      wrap(ctx, flavor || '', 760, 768, 700, 40, 2);
    }

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Private card to the murder victim at dawn - "you are dead"
async function renderVictimDMCard({ victimChar, victimName, room, method, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg(room.id);
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.8 });

    await drawSpriteGray(ctx, victimChar.id, PORT_W / 2, 1050, 700);
    splatter(ctx, PORT_W / 2, 1000, 240, 10);
    stamp(ctx, 'YOU ARE DEAD', PORT_W / 2, 220, 430, 96, 'rgba(200,50,74,0.95)', -0.07, 52);

    ctx.textAlign = 'center';
    ctx.font = 'italic 34px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    wrap(ctx, `The house does not know yet. Only you and your killer do.`, 150, 1150, 600, 46, 2);

    ctx.textAlign = 'center';
    ctx.font = '27px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${method.title} \u00B7 ${room.name} \u00B7 night ${roman(night)}`, PORT_W / 2, 1258);

    ctx.font = '25px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.65)';
    ctx.fillText('Your voice is lost to the living. You watch now.', PORT_W / 2, 1310);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// DM to the saved player after a guardian save
async function renderGuardianSavedCard({ savedName, dreamLine, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('bedroom_a');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.76 });
    fogField(ctx, PORT_W, PORT_H, '201,239,226', 0.14);

    ctx.textAlign = 'center';

 // halo above the bed
    ctx.save();
    ctx.strokeStyle = C.ghostHi;
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(201,239,226,0.9)';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.ellipse(PORT_W / 2, 250, 130, 44, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.font = '34px Type';
    ctx.fillStyle = C.ghostHi;
    spaced(ctx, 'YOU SHOULD BE DEAD', PORT_W / 2, 400, 7);

    ctx.font = '56px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(savedName.toUpperCase(), PORT_W / 2, 490);
    ctx.shadowColor = 'transparent';

    ctx.font = 'italic 33px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    wrap(ctx, dreamLine, 150, 590, 600, 48, 4);

    ctx.textAlign = 'center';
    ctx.font = '25px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.6)';
    ctx.fillText('Someone watched over you last night. They will not say who.', PORT_W / 2, 1310);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Killer's private room-choice card (after choosing a victim)
async function renderRoomChoiceCard({ rooms, victimName, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('hallway_a');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.84 });

    ctx.textAlign = 'center';
    ctx.font = '36px Type';
    ctx.fillStyle = C.crimsonHi;
    spaced(ctx, 'THE KNIFE IS RAISED', PORT_W / 2, 190, 8);

    ctx.font = '52px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText(`${victimName.toUpperCase()} SLEEPS`, PORT_W / 2, 270);
    ctx.shadowColor = 'transparent';

    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    ctx.fillText('Where does the body lie until morning?', PORT_W / 2, 330);

 // room rows
    const rowH = Math.min(120, 700 / Math.max(1, rooms.length));
    let y = 430;
    ctx.textAlign = 'left';
    rooms.forEach((r, i) => {
      ctx.font = '36px PF-Bold';
      ctx.fillStyle = C.amber;
      ctx.fillText(`${i + 1}.`, 110, y);
      fitFont(ctx, r.name.replace(/^the /i, ''), 'PF-Bold', 36, 400, 24);
      ctx.fillStyle = C.ivory;
      ctx.fillText(r.name.replace(/^the /i, ''), 170, y);
      ctx.font = '24px EB-Reg';
      ctx.fillStyle = C.ivoryFaint;
      fitFont(ctx, r.hint, 'EB-Reg', 24, 430, 17);
      ctx.fillText(r.hint, 170, y + 32);
      ctx.font = '22px EB-Semi';
      ctx.fillStyle = r.conceal >= 3 ? C.crimsonHi : C.ivoryDim;
      ctx.fillText(r.concealLabel, 170, y + 60);
      concealDots(ctx, 640, y + 54, r.conceal, C.amber);
      y += rowH;
    });

    ctx.textAlign = 'center';
    ctx.font = '25px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.7)';
    ctx.fillText('Hard rooms hide a body longer - but anger the ghost.', PORT_W / 2, 1310);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Private investigation result - DM portrait dossier
async function renderInvestigationCard({ subjectChar, subjectName, isKiller, flavor, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('library');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.8 });

 // dossier corner brackets
    ctx.save();
    ctx.strokeStyle = 'rgba(200,50,74,0.55)';
    ctx.lineWidth = 3;
    const b = 46, off = 58;
    for (const [x, y, dx, dy] of [[off, off, 1, 1], [PORT_W - off, off, -1, 1], [off, PORT_H - off, 1, -1], [PORT_W - off, PORT_H - off, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * b);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * b, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = '44px Type';
    ctx.fillStyle = C.crimsonHi;
    spaced(ctx, 'CONFIDENTIAL', PORT_W / 2, 170, 12);

    ctx.strokeStyle = 'rgba(200,50,74,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(160, 200);
    ctx.lineTo(PORT_W - 160, 200);
    ctx.stroke();

    ctx.font = '46px PF-Bold';
    ctx.fillStyle = C.ivory;
    ctx.fillText('INVESTIGATION REPORT', PORT_W / 2, 280);
    ctx.font = '28px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`Night ${roman(night)}`, PORT_W / 2, 330);

    await drawAvatar(ctx, subjectChar.id, PORT_W / 2, 540, 165, isKiller ? C.crimsonHi : C.amber);

    fitFont(ctx, subjectName.toUpperCase(), 'PF-Bold', 54, 640);
    ctx.fillStyle = C.ivory;
    ctx.fillText(subjectName.toUpperCase(), PORT_W / 2, 800);
    ctx.font = '29px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${subjectChar.name}, ${subjectChar.title}`, PORT_W / 2, 845);

 // verdict stamp
    stamp(ctx, isKiller ? 'THE KILLER' : 'NOT THE KILLER', PORT_W / 2, 990, 560, 120,
      isKiller ? 'rgba(200,50,74,0.95)' : 'rgba(224,189,92,0.95)', -0.06, 56);

    ctx.font = 'italic 32px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    wrap(ctx, flavor, 170, 1130, 560, 44, 2);

    ctx.textAlign = 'center';
    ctx.font = '26px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.6)';
    ctx.fillText('Say nothing. Watch everything.', PORT_W / 2, 1285);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Vote result - group card
async function renderVoteCard({ tally, skipVotes, eliminated, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('greatroom');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.72 });

    ctx.textAlign = 'center';
    Icons.scales(ctx, LAND_W / 2, 130, 44);

    ctx.font = '92px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    spaced(ctx, 'THE HOUSE HAS SPOKEN', LAND_W / 2, 292, 6);
    ctx.shadowColor = 'transparent';

    ornament(ctx, LAND_W / 2, 345, 560);

 // tally bars (left)
    const maxVotes = Math.max(1, ...tally.map((t) => t.votes));
    const rows = tally.length + (skipVotes > 0 ? 1 : 0);
    const rowH = Math.min(92, 470 / Math.max(1, rows));
    let y = 440;
    ctx.textAlign = 'left';
    for (const t of tally) {
      ctx.font = '32px EB-Semi';
      ctx.fillStyle = t.votes === maxVotes ? C.ivory : C.ivoryDim;
      ctx.fillText(t.name.toUpperCase(), 120, y - 14);
      const bw = 90 + (t.votes / maxVotes) * 500;
      ctx.fillStyle = t.votes === maxVotes ? C.crimson : 'rgba(179,169,142,0.5)';
      ctx.fillRect(120, y, bw, 16);
      ctx.strokeStyle = 'rgba(236,226,200,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(120, y, 90 + 500, 16);
      ctx.font = '34px PF-Bold';
      ctx.fillStyle = C.ivory;
      ctx.fillText(String(t.votes), 120 + 90 + 500 + 24, y + 18);
      y += rowH;
    }
    if (skipVotes > 0) {
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.fog;
      ctx.fillText('ABSTAINED', 120, y - 14);
      const bw = 90 + (skipVotes / maxVotes) * 500;
      ctx.fillStyle = 'rgba(139,133,144,0.45)';
      ctx.fillRect(120, y, bw, 16);
      ctx.font = '30px PF-Bold';
      ctx.fillStyle = C.fog;
      ctx.fillText(String(skipVotes), 120 + 90 + 500 + 24, y + 18);
    }

 // right zone
    if (eliminated) {
      await drawSpriteGray(ctx, eliminated.charId, 1180, 770, 440);
      stamp(ctx, 'BANISHED', 1180, 330, 300, 80, 'rgba(200,50,74,0.95)', -0.09, 44);
      ctx.textAlign = 'center';
      ctx.font = 'italic 30px PF-MedIt';
      ctx.fillStyle = C.ivoryDim;
      ctx.fillText(`${eliminated.name} is cast out of the manor.`, 1180, 802);
    } else {
      ctx.textAlign = 'center';
      ctx.font = 'italic 40px PF-MedIt';
      ctx.fillStyle = C.ivory;
      ctx.fillText('No one was condemned.', 1180, 560);
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.ivoryDim;
      ctx.fillText('The manor watches. The knife waits.', 1180, 635);
    }

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Final result - group card
async function renderFinalCard({ winner, killerChar, killerName, manorName, nightsSurvived, victims, survivors, closingLine }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg(winner === 'killer' ? 'drawing' : 'manor');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    if (winner === 'killer') {
 // blood-wash the room
      const g = ctx.createLinearGradient(0, 0, 0, LAND_H);
      g.addColorStop(0, 'rgba(60,8,16,0.35)');
      g.addColorStop(1, 'rgba(20,4,8,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LAND_W, LAND_H);
    }
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.7 });

    const civWin = winner !== 'killer';

    ctx.textAlign = 'left';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'THE CASE IS CLOSED', LAND_W / 2, 190, 6);

    ctx.textAlign = 'center';
    ctx.font = civWin ? '104px PF-Black' : '100px PF-Black';
    fitFont(ctx, civWin ? 'MYSTERY SOLVED' : 'THE KILLER WINS', 'PF-Black', 104, 1300, 56);
    ctx.fillStyle = civWin ? C.amberHi : C.crimsonHi;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 20;
    spaced(ctx, civWin ? 'MYSTERY SOLVED' : 'THE KILLER WINS', LAND_W / 2, 288, 8);
    ctx.shadowColor = 'transparent';

    ornament(ctx, LAND_W / 2, 352, 620, civWin ? C.amber : C.crimson);

 // killer reveal center-left
    await drawSprite(ctx, killerChar.id, 375, 848, 470);
    stamp(ctx, 'THE KILLER', 375, 585, 300, 82, 'rgba(200,50,74,0.95)', -0.08, 44);

 // right text
    ctx.textAlign = 'left';
    fitFont(ctx, killerName.toUpperCase(), 'PF-Black', 84, 700, 36);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText(killerName.toUpperCase(), 800, 500);
    ctx.shadowColor = 'transparent';
    ctx.font = '31px EB-Reg';
    ctx.fillStyle = C.amber;
    ctx.fillText(`${killerChar.name}, ${killerChar.title}`, 800, 552);

    ctx.font = '29px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    const nightsLine = `The mystery lasted ${nightsSurvived} night${nightsSurvived === 1 ? '' : 's'} \u00B7 ${victims.length} guest${victims.length === 1 ? '' : 's'} lost \u00B7 ${survivors.length} left alive.`;
    wrap(ctx, nightsLine, 800, 610, 700, 42, 2);

    if (victims.length) {
      ctx.fillStyle = C.ivoryFaint;
      ctx.fillText(`Lost: ${victims.join(', ')}.`, 800, 690);
    }

    ctx.font = 'italic 34px PF-MedIt';
    ctx.fillStyle = civWin ? C.ivory : C.crimsonHi;
    wrap(ctx, closingLine, 800, 760, 700, 46, 2);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Lobby opener - group card. The "start message" the house sees first.
async function renderLobbyCard({ manorName, playerCount, minPlayers, maxPlayers, openingLine, prefix, prize }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('manor');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.6 });

    ctx.textAlign = 'center';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'THE DOORS ARE OPEN', LAND_W / 2, 210, 8);

    fitFont(ctx, manorName, 'PF-Black', 118, 1300, 56);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 20;
    spaced(ctx, manorName, LAND_W / 2, 356, 8);
    ctx.shadowColor = 'transparent';

    ornament(ctx, LAND_W / 2, 424, 560);

    ctx.font = 'italic 40px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.fillText(openingLine, LAND_W / 2, 505);

    ctx.font = '30px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${playerCount} guest${playerCount === 1 ? '' : 's'} waiting · ${minPlayers}-${maxPlayers} seats at the table`, LAND_W / 2, 578);

 // invitation block
    ctx.font = '27px Type';
    ctx.fillStyle = C.amberHi;
    ctx.fillText(`${prefix} mm join  -  accept the invitation`, LAND_W / 2, 672);
    ctx.font = '27px Type';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`${prefix} mm start  -  begin once everyone is here`, LAND_W / 2, 722);

 // the manor's purse - the winning side claims it (no entry fee)
    if (prize != null) {
      ctx.font = '27px Type';
      ctx.fillStyle = C.amber;
      ctx.fillText(`prize  ${fmtNo(prize)} Zeni  -  claimed by the winning side`, LAND_W / 2, 778);
    }

    ctx.font = '26px Type';
    ctx.fillStyle = C.crimsonHi;
    ctx.fillText('One of the guests is hiding a knife.', LAND_W / 2, 828);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Hall of Shadows - the all-time ledger. Rows come pre-sorted and ranked:
// { rank, name, score, wins, games, winRate, tag, you }
async function renderLeaderboardCard({ manorName, rows, totalTracked }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('gallery');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.7 });

    ctx.textAlign = 'center';
    ctx.font = '27px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'THE LEDGER OF', LAND_W / 2, 118, 8);

    ctx.font = '80px PF-Black';
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    spaced(ctx, 'HALL OF SHADOWS', LAND_W / 2, 206, 6);
    ctx.shadowColor = 'transparent';

    ornament(ctx, LAND_W / 2, 258, 620);

    ctx.font = 'italic 27px PF-MedIt';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`The worthy, the lucky and the dead - ${manorName}`, LAND_W / 2, 306);

    if (!rows || !rows.length) {
      ctx.font = 'italic 40px PF-MedIt';
      ctx.fillStyle = C.ivory;
      ctx.fillText('No case has been closed yet. The ledger waits.', LAND_W / 2, 520);
      ctx.font = '26px EB-Reg';
      ctx.fillStyle = C.ivoryDim;
      ctx.fillText('Close one - and your name is written here in candlelight.', LAND_W / 2, 580);
      footer(ctx, LAND_W, LAND_H, manorName);
      return;
    }

    const rowTop = 356;
    const rowH = 47;
    ctx.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const y = rowTop + i * rowH;
      const medal = r.rank <= 3;

      ctx.font = '30px PF-Bold';
      ctx.fillStyle = medal ? C.amberHi : C.ivoryFaint;
      ctx.fillText(roman(r.rank), 132, y);

      ctx.font = '26px EB-Semi';
      ctx.fillStyle = r.you ? C.amberHi : C.ivory;
      let nm = String(r.name || 'Guest');
      if (nm.length > 20) nm = `${nm.slice(0, 19)}…`;
      ctx.fillText(`${nm.toUpperCase()}${r.you ? ' - YOU' : ''}`, 225, y);

      ctx.font = '19px EB-Reg';
      ctx.fillStyle = C.ivoryFaint;
      ctx.fillText(`${r.wins}W · ${r.games}G · ${r.winRate == null ? '-' : r.winRate + '%'}${r.tag ? ` · ${r.tag}` : ''}`, 225, y + 26);

      ctx.textAlign = 'right';
      ctx.font = '32px PF-Bold';
      ctx.fillStyle = medal ? C.amberHi : C.ivory;
      ctx.fillText(String(r.score), LAND_W - 132, y);
      ctx.textAlign = 'left';

      if (i < rows.length - 1) {
        ctx.strokeStyle = 'rgba(236,226,200,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(132, y + 37);
        ctx.lineTo(LAND_W - 132, y + 37);
        ctx.stroke();
      }
    }

    if (totalTracked > rows.length) {
      ctx.textAlign = 'center';
      ctx.font = '22px EB-Reg';
      ctx.fillStyle = C.ivoryFaint;
      ctx.fillText(`…and ${totalTracked - rows.length} more name${totalTracked - rows.length === 1 ? '' : 's'} in the ledger.`, LAND_W / 2, rowTop + rows.length * rowH + 26);
    }

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// The killer's ONE unsigned taunt per game - posted to the group, anonymous.
async function renderTauntCard({ text, night, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('drawing');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.82 });
 // blood-wash
    const g = ctx.createLinearGradient(0, 0, 0, LAND_H);
    g.addColorStop(0, 'rgba(60,8,16,0.3)');
    g.addColorStop(1, 'rgba(20,4,8,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LAND_W, LAND_H);

    ctx.textAlign = 'center';
    ctx.font = '30px Type';
    ctx.fillStyle = C.crimsonHi;
    spaced(ctx, 'AN UNSIGNED NOTE CIRCULATES', LAND_W / 2, 220, 7);

 // torn-note plate
    ctx.save();
    ctx.translate(LAND_W / 2, 470);
    ctx.rotate(-0.012);
    ctx.fillStyle = 'rgba(16,9,13,0.72)';
    ctx.fillRect(-620, -190, 1240, 380);
    ctx.strokeStyle = 'rgba(200,50,74,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-620, -190, 1240, 380);
    ctx.restore();

    ctx.font = '44px Type';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    wrap(ctx, `\u201C${text}\u201D`, 240, 380, 1120, 62, 4);

    ornament(ctx, LAND_W / 2, 700, 420, C.crimson);

    ctx.textAlign = 'center';
    ctx.font = '28px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText('It is signed by no one. Read it twice.', LAND_W / 2, 770);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Last words - posted to the group when a player dies (vote or body found).
async function renderWillCard({ playerChar, playerName, will, cause, night, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('library');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.8 });

    await drawSpriteGray(ctx, playerChar.id, PORT_W / 2, 1010, 620);

    ctx.textAlign = 'center';
    ctx.font = '40px Type';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'LAST WORDS', PORT_W / 2, 190, 10);

    fitFont(ctx, playerName.toUpperCase(), 'PF-Black', 56, 640);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText(playerName.toUpperCase(), PORT_W / 2, 262);
    ctx.shadowColor = 'transparent';

    ornament(ctx, PORT_W / 2, 306, 380, C.amber);

    ctx.font = 'italic 36px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'left';
    const after = wrap(ctx, `\u201C${will}\u201D`, 140, 1080, 620, 52, 3);

    ctx.textAlign = 'center';
    ctx.font = '25px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(cause === 'vote' ? 'read aloud as the house cast them out' : 'found folded inside their coat', PORT_W / 2, Math.max(after + 40, 1268));

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// ============================================
// EXPANDED-CASE RENDERERS (owner expansion: case generator,
// evidence assets, dossier, case report). Clue item art lives in
// assets/clues/*.jpg - real bytes, NOT LFS (jpg is outside the *.png rule).
// ============================================
const CLUE_DIR = path.join(ASSETS, 'clues');

async function loadClue(art) {
  if (!art) return null;
  const p = path.join(CLUE_DIR, art);
  if (!fs.existsSync(p)) return null;
  try { return await loadImageFile(p); } catch (e) { return null; }
}

// Character introduction (MD §7): portrait card + backstory caption,
// delivered one per 30s after the doors lock
async function renderCharacterIntroCard({ char, caption, index, total, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('gallery');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.74 });

    await drawSprite(ctx, char.id, PORT_W / 2 + 60, 1120, 760);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, `GUEST ${roman(index)} OF ${roman(total)}`, PORT_W / 2, 140, 8);

    const nm = String(char.name || 'A Guest').toUpperCase();
    fitFont(ctx, nm, 'PF-Black', 84, 700);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(nm, PORT_W / 2, 240);
    ctx.shadowColor = 'transparent';

    ctx.font = 'italic 38px PF-MedIt';
    ctx.fillStyle = C.amberHi;
    ctx.fillText(String(char.title || ''), PORT_W / 2, 300);

    ornament(ctx, PORT_W / 2, 352, 420);

    ctx.textAlign = 'left';
    ctx.font = '31px EB-Reg';
    ctx.fillStyle = C.ivory;
    wrap(ctx, String(caption || ''), 130, 1150, 640, 46, 4);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Evidence find (MD §6): item art inset + confirmed/rumour tag + line
async function renderEvidenceCard({ itemName, art, tag, line, roomName, night, manorName }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('hallway_a');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.82 });

    ctx.textAlign = 'center';
    ctx.font = '28px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, `A SEARCH OF ${String(roomName || 'the manor').toUpperCase()}`, LAND_W / 2, 150, 6);

    const label = String(itemName || 'Evidence').toUpperCase();
    fitFont(ctx, label, 'PF-Black', 74, 1150);
    ctx.fillStyle = C.ivory;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillText(label, LAND_W / 2, 240);
    ctx.shadowColor = 'transparent';

 // framed item art
    const img = await loadClue(art);
    const boxW = 560, boxH = 320, boxX = (LAND_W - boxW) / 2, boxY = 270;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.clip();
      drawCover(ctx, img, boxX, boxY, boxW, boxH);
      ctx.restore();
      ctx.strokeStyle = 'rgba(236,226,200,0.55)';
      ctx.lineWidth = 4;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }

    ctx.font = '34px Type';
    if (String(tag) === 'confirmed') {
      ctx.fillStyle = C.crimsonHi;
      spaced(ctx, '\u00b7 CONFIRMED \u00b7', LAND_W / 2, boxY + boxH + 64, 8);
    } else {
      ctx.fillStyle = C.fog;
      spaced(ctx, '\u00b7 RUMOUR - CIRCUMSTANTIAL \u00b7', LAND_W / 2, boxY + boxH + 64, 8);
    }

    ctx.font = 'italic 36px PF-MedIt';
    ctx.fillStyle = C.ivory;
    ctx.textAlign = 'center';
 // wrap() centers each line on x (textAlign is 'center' here) - x must be
 // the CARD CENTER, not a left margin, or lines spill off the left edge
    wrap(ctx, `\u201C${String(line || '')}\u201D`, LAND_W / 2, boxY + boxH + 122, 1120, 44, 3);

    ctx.font = '26px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`night ${night} \u00b7 noted by the house`, LAND_W / 2, LAND_H - 74);

    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

// Private dossier (MD §9): the player's own knowledge, rendered as notes
async function renderDossierCard({ playerName, sections, manorName }) {
  return renderCard(PORT_W, PORT_H, async (ctx) => {
    const bg = await loadBg('library');
    drawCover(ctx, bg, 0, 0, PORT_W, PORT_H);
    atmosphere(ctx, PORT_W, PORT_H, { dark: 0.84 });

    ctx.textAlign = 'center';
    ctx.font = '32px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'PRIVATE CASE DOSSIER', PORT_W / 2, 150, 8);

    const head = `${String(playerName || 'Guest').toUpperCase()}\u2019S NOTES`;
    fitFont(ctx, head, 'PF-Black', 54, 720);
    ctx.fillStyle = C.ivory;
    ctx.fillText(head, PORT_W / 2, 224);
    ornament(ctx, PORT_W / 2, 272, 420);

    let y = 344;
    ctx.textAlign = 'left';
    for (const s of sections || []) {
      if (!s || !s.lines || !s.lines.length) continue;
      ctx.font = '26px EB-Semi';
      ctx.fillStyle = C.amberHi;
      spaced(ctx, String(s.title || '').toUpperCase(), 120, y, 5, 'left');
      y += 44;
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.ivory;
      for (const ln of s.lines.slice(0, 4)) {
        y = wrap(ctx, `\u2022 ${ln}`, 130, y, 660, 38, 2) + 8;
      }
      y += 14;
      if (y > PORT_H - 200) break;
    }

    ctx.textAlign = 'center';
    ctx.font = '24px Type';
    ctx.fillStyle = 'rgba(236,226,200,0.72)';
    ctx.fillText('seen by you alone', PORT_W / 2, PORT_H - 132);

    footer(ctx, PORT_W, PORT_H, manorName);
  });
}

// Post-game case report (MD §12): the truth, revealed
async function renderCaseReportCard({ manorName, winner, motiveTitle, motiveDetail, webFrames, truthLines, killerNames }) {
  return renderCard(LAND_W, LAND_H, async (ctx) => {
    const bg = await loadBg('manor');
    drawCover(ctx, bg, 0, 0, LAND_W, LAND_H);
    atmosphere(ctx, LAND_W, LAND_H, { dark: 0.8 });

    ctx.textAlign = 'center';
    ctx.font = '30px EB-Semi';
    ctx.fillStyle = C.amber;
    spaced(ctx, 'THE CASE, EXPLAINED', LAND_W / 2, 150, 8);

    const headline = winner === 'civ' ? 'MYSTERY SOLVED' : 'THE KILLER WINS';
    fitFont(ctx, headline, 'PF-Black', 88, 1240);
    ctx.fillStyle = winner === 'civ' ? C.ivory : C.crimsonHi;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(headline, LAND_W / 2, 244);
    ctx.shadowColor = 'transparent';

    ctx.font = '30px EB-Reg';
    ctx.fillStyle = C.ivoryDim;
    ctx.fillText(`The killer${(killerNames || []).length > 1 ? 's were' : ' was'}: ${(killerNames || []).join(' & ')}`, LAND_W / 2, 304);
    ornament(ctx, LAND_W / 2, 354, 480);

    ctx.textAlign = 'left';
    let y = 434;
    ctx.font = '27px EB-Semi';
    ctx.fillStyle = C.amberHi;
    spaced(ctx, `MOTIVE - ${String(motiveTitle || '').toUpperCase()}`, 120, y, 5, 'left');
    y += 42;
    ctx.font = '29px EB-Reg';
    ctx.fillStyle = C.ivory;
    y = wrap(ctx, String(motiveDetail || ''), 130, y, 1340, 40, 2) + 18;

    if (webFrames && webFrames.length) {
      ctx.font = '27px EB-Semi';
      ctx.fillStyle = C.amberHi;
      spaced(ctx, 'THE TIES THAT BOUND THEM', 120, y, 5, 'left');
      y += 42;
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.ivory;
      for (const f of webFrames.slice(0, 3)) {
        y = wrap(ctx, `\u2022 ${f}`, 130, y, 1340, 38, 1) + 8;
      }
      y += 10;
    }
    if (truthLines && truthLines.length) {
      ctx.font = '27px EB-Semi';
      ctx.fillStyle = C.amberHi;
      spaced(ctx, 'WHAT THE EVIDENCE MEANT', 120, y, 5, 'left');
      y += 42;
      ctx.font = '28px EB-Reg';
      ctx.fillStyle = C.ivory;
      for (const t of truthLines.slice(0, 4)) {
        y = wrap(ctx, `\u2022 ${t}`, 130, y, 1340, 38, 1) + 8;
      }
    }
    footer(ctx, LAND_W, LAND_H, manorName);
  });
}

module.exports = {
  C,
  cv,
  registerFonts,
  CLUE_DIR,
  loadClue,
  renderCharacterIntroCard,
  renderEvidenceCard,
  renderDossierCard,
  renderCaseReportCard,
  loadBg,
  loadSprite,
  roman,
  fmtNo,
  spaced,
  fitFont,
  wrap,
  drawCover,
  atmosphere,
  ornament,
  footer,
  seal,
  Icons,
  stamp,
  drawSprite,
  drawSpriteGray,
  drawAvatar,
  splatter,
  fogField,
  concealDots,
  renderCard,
  renderIntro,
  renderRoleCard,
  renderNightCard,
  renderMorningCard,
  renderBodyFoundCard,
  renderGhostClueCard,
  renderSealCard,
  renderButlerRevealCard,
  renderSearchCard,
  renderLobbyCard,
  renderLeaderboardCard,
  renderTauntCard,
  renderWillCard,
  renderVictimDMCard,
  renderGuardianSavedCard,
  renderRoomChoiceCard,
  renderInvestigationCard,
  renderVoteCard,
  renderFinalCard,
  BG_DIR,
  CHAR_DIR,
};
