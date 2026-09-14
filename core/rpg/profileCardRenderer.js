// ============================================
// 🎨 PROFILE CARD RENDERER v6 — 10 owner-approved styles
// ============================================
// The 10 approved mock designs (5x "v1 set" + 5x "v2 set") are baked into
// static backgrounds (core/rpgasset/ui/styles/bg_1..10.png) by
// scripts/bake_profile_bgs.py, together with layouts.json — the single
// source of truth for every dynamic field (positions/fonts/colors).
// This renderer composites: bg → dynamic ops → portrait → done.
// Owners pick a style with `<prefix> cardstyle <1-10>`; RPG Mods pick the
// server-wide default with `<prefix> setdefaultcard <1-10>`.
//
// Style catalogue:
//   1 Stonekeep      2 Golden Arcanum   3 Retro Court    4 Woodmere
//   5 Emblem Noir    6 Holo Gacha       7 Royal Decree (DEFAULT)
//   8 Neon Arcade    9 Rune Monolith   10 Crimson Court

const path = require('path');
const fs = require('fs');

let _canvas = null;
function getCanvas() { if (!_canvas) _canvas = require('canvas'); return _canvas; }

const FONTS_DIR = path.join(__dirname, '..', 'rpgasset', 'fonts');
const STYLES_DIR = path.join(__dirname, '..', 'rpgasset', 'ui', 'styles');
const CHAR_DIR = path.join(__dirname, '..', 'rpgasset', 'characters');
const FONT_REG = 'Pixeloid Sans';
const FONT_BOLD = 'Dogica Pixel Bold';

let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;
  try {
    const { registerFont } = getCanvas();
    const regs = [
      ['PixeloidSans.ttf', { family: FONT_REG }],
      ['dogicapixelbold.otf', { family: FONT_BOLD }],
      ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
      ['CinzelDecorative-Bold.ttf', { family: 'Cinzel Decorative', weight: 'bold' }],
      ['CinzelDecorative-Black.ttf', { family: 'Cinzel Dec Black' }],
      ['IMFellEnglish-Regular.ttf', { family: 'IM Fell English' }],
      ['IMFellEnglish-Italic.ttf', { family: 'IM Fell English', style: 'italic' }],
      ['MedievalSharp.ttf', { family: 'MedievalSharp' }],
      ['PressStart2P-Regular.ttf', { family: 'Press Start 2P' }],
    ];
    for (const [file, opts] of regs) {
      const p = path.join(FONTS_DIR, file);
      if (fs.existsSync(p)) { try { registerFont(p, opts); } catch (e) {} }
    }
  } catch (e) {}
}

const FONT_FNS = {
  cinzel: s => `${s}px "Cinzel"`,
  cinzel_dec_b: s => `bold ${s}px "Cinzel Decorative"`,
  cinzel_dec_black: s => `${s}px "Cinzel Dec Black"`,
  medsharp: s => `${s}px "MedievalSharp"`,
  imfell: s => `${s}px "IM Fell English"`,
  imfell_i: s => `italic ${s}px "IM Fell English"`,
  ps2p: s => `${s}px "Press Start 2P"`,
  dogica_b: s => `${s}px "${FONT_BOLD}"`,
  pixeloid: s => `${s}px "${FONT_REG}"`,
};

// 💡 OWNER PICK 2026-09-11: Royal Decree is the main card.
const DEFAULT_STYLE = 7; // Royal Decree — baked-in fallback

// Runtime default — RPG Mods can switch it with `<prefix> setdefaultcard <1-10>`.
// Stored under a `_shared_` system key (same pattern as _shared_rpg_mods) so it
// survives restarts and is shared by every bot instance. Falls back to the
// baked-in DEFAULT_STYLE when the key is unset or out of range.
const RUNTIME_DEFAULT_KEY = '_shared_default_card_style';
function getDefaultStyle() {
  try {
    const n = parseInt(require('../utils/system').get(RUNTIME_DEFAULT_KEY, null), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  } catch (e) {}
  return DEFAULT_STYLE;
}

let _layouts = null;
function getLayouts() {
  if (_layouts) return _layouts;
  try { _layouts = JSON.parse(fs.readFileSync(path.join(STYLES_DIR, 'layouts.json'), 'utf8')); }
  catch (e) { _layouts = {}; }
  return _layouts;
}

// 💡 Manual reload support (`<prefix> reloadservers`): drop every module-level
// cache so layouts.json / bg art / extra icons / class sprites are re-read
// from disk on the next render. Fonts stay registered (registerFont is
// process-global and idempotent). Called by the engine's reload command.
function clearCaches() {
  _layouts = null;
  _imgCache.clear();
  _sheetCache.clear();
}

const _imgCache = new Map();
async function loadImg(dir, name) {
  const key = `${dir}/${name}`;
  if (_imgCache.has(key)) return _imgCache.get(key);
  const { loadImage } = getCanvas();
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) { _imgCache.set(key, null); return null; }
  try {
    const img = await loadImage(p);
    _imgCache.set(key, img);
    return img;
  } catch (e) { _imgCache.set(key, null); return null; }
}
const loadBg = n => loadImg(STYLES_DIR, `bg_${n}.png`);
async function loadExtra(n) {
  // style assets live in styles/ or styles/extra/
  return (await loadImg(STYLES_DIR, n)) || (await loadImg(path.join(STYLES_DIR, 'extra'), n));
}
async function loadChar(n) {
  // clean/ holds node-canvas-compatible re-encodes; fall back to the original
  return (await loadImg(path.join(CHAR_DIR, 'clean'), n)) || (await loadImg(CHAR_DIR, n));
}

// Class → full-body sprite (files resolved via loadChar: clean/ copy first).
// NOTE: spaces in the original asset names are replaced with '_' in clean/.
const CLASS_SPRITES = {
  FIGHTER: 'Fighter1.png', WARRIOR: 'warrior1.png', BERSERKER: 'Berserker1.png',
  PALADIN: 'Paladin_(1).png', ROGUE: 'Rogue_(1).png', NINJA: 'ninja_(1).png',
  MONK: 'Monk.png', MAGE: 'archmage_(1).png', ARCHMAGE: 'archmage_(6).png',
  WARLOCK: 'voidwalker_(1).png', VOIDWALKER: 'voidwalker_(5).png',
  CLERIC: 'cleric_(1).png', SAINT: 'saint_(1).png', DRUID: 'druid_(1).png',
  NECROMANCER: 'necromancer.png', LICH: 'lich.png',
  TYCOON: 'tycoon.png', MERCHANT: 'merchant.png', SCOUT: 'scout1.png',
  RANGER: 'scout1.png', APPRENTICE: 'apprentice1.png'
};

// ------------------------------------------------------------------ utils
function roundRectPath(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setAnchor(ctx, anchor) {
  const [h, v] = anchor;
  ctx.textAlign = h === 'm' ? 'center' : (h === 'r' ? 'right' : 'left');
  ctx.textBaseline = v === 'm' ? 'middle' : (v === 'a' ? 'top' : 'alphabetic');
}

function hexToRgba(hex, a = 255) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const al = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : a;
  return `rgba(${r},${g},${b},${(al / 255).toFixed(3)})`;
}

function fitFont(ctx, fontKey, size, text, maxW, minSize = 10) {
  if (!maxW) return size;
  let s = size;
  ctx.font = FONT_FNS[fontKey](s);
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = FONT_FNS[fontKey](s);
  }
  return s;
}

function drawText(ctx, { x, y, s, font, size, color, anchor = 'mm', maxW, shadow, glow, stroke }) {
  size = fitFont(ctx, font, size, s, maxW);
  ctx.font = FONT_FNS[font](size);
  setAnchor(ctx, anchor);
  if (shadow) {
    ctx.fillStyle = shadow.color;
    ctx.fillText(s, x + (shadow.off || 2), y + (shadow.off || 2));
  }
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow.color; ctx.shadowBlur = glow.r;
    ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.fillText(s, x, y);
    ctx.restore();
    return size;
  }
  if (stroke) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.w; ctx.strokeStyle = stroke.color;
    ctx.strokeText(s, x, y);
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  return size;
}

function coverDraw(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function silhouetteOf(spriteImg) {
  const { createCanvas } = getCanvas();
  const c = createCanvas(spriteImg.width, spriteImg.height);
  const cx = c.getContext('2d');
  cx.drawImage(spriteImg, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = '#0a0b10';
  cx.fillRect(0, 0, c.width, c.height);
  return c;
}

// ------------------------------------------------------------------ data
const STAT_MAX = { hp: 5000, atk: 500, def: 500, mag: 500, spd: 500, luck: 500 };
function statVal(stats, key) {
  const v = {
    hp: stats?.hp, atk: stats?.atk, def: stats?.def, mag: stats?.mag,
    spd: stats?.spd, luck: stats?.luck, crit: stats?.crit, eva: stats?.evasion
  }[key];
  const num = Number(v);
  if (!Number.isFinite(num)) return key === 'crit' || key === 'eva' ? '0%' : '0';
  if (key === 'crit' || key === 'eva') return `${Math.round(num)}%`;
  return `${Math.round(num).toLocaleString('en-US')}`;
}
function statFrac(stats, key) {
  const max = STAT_MAX[key];
  if (!max) return 0;
  const num = Number({ hp: stats?.hp, atk: stats?.atk, def: stats?.def, mag: stats?.mag, spd: stats?.spd, luck: stats?.luck }[key]);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num / max));
}

function buildCardData(params) {
  const { user, classData, stats, level, rank } = params;
  const nickname = user?.nickname || '';
  const waName = user?.profile?.whatsappName || '';
  // 💡 Owner rule: an unregistered player's card shows THEIR WHATSAPP NAME,
  // never the generic "Adventurer".
  let displayName = nickname && nickname !== 'Adventurer' ? nickname : '';
  if (!displayName && waName) displayName = waName;
  if (!displayName && nickname) displayName = nickname;
  if (!displayName) displayName = 'Adventurer';
  const zeni = Math.max(0, Math.round((Number(user?.wallet) || 0) + (Number(user?.bank) || 0)));
  const pw = Math.max(0, Number(user?.pvpWins) || 0);
  const pl = Math.max(0, Number(user?.pvpLosses) || 0);
  const cls = (classData?.name || 'Adventurer');
  // 💡 Owner rule 2026-09-14: XP is never shown as a bare percentage — the
  // card must also show the actual XP requirement (progress / needed).
  const pct = Math.round(params.xpPercent || 0);
  const cur = Number(params.xpCurrent), need = Number(params.xpNeeded);
  const XPX = Number.isFinite(cur) && Number.isFinite(need)
    ? `${pct}% · ${fmtCompact(cur)}/${fmtCompact(need)}`
    : `${pct}%`;
  return {
    NAME: displayName,
    CLS: cls.toUpperCase(),
    CLST: cls,
    LV: String(level || 1),
    RANK: String(rank || 'F'),
    RANKX: `${rank || 'F'} RANK`,
    ZENI: zeni.toLocaleString('en-US'),
    PVPD: `${pw}W — ${pl}L`,
    PVPA: `${pw}W - ${pl}L`,
    PVPH: `${pw}W-${pl}L`,
    XP: String(pct),
    XPX,
    GUILD: params.guildName || '',
    // 💡 OWNER RULE: cards show "[guild title] of [guild name]". The caller
    // resolves the title (custom title, else guild role). Defensive default
    // keeps the sentence grammatical if a caller passes a name but no title.
    GTITLE: params.guildTitle || (params.guildName ? 'Member' : ''),
  };
}

// compact XP numbers for card rows: 12,400 -> 12.4K, 3,240,000 -> 3.2M
function fmtCompact(n) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

function resolveTokens(tpl, D) {
  return tpl
    .replace(/\{V_([a-z]+)\}/g, (_, k) => statVal(D._stats, k))
    .replace(/\{(\w+)\}/g, (_, k) => (D[k] !== undefined ? D[k] : `{${k}}`));
}

// ------------------------------------------------------------------ portrait
async function drawPortrait(ctx, spec, art) {
  if (!spec) return;
  const pfpImg = art.pfpImg, spriteImg = art.spriteImg;
  const shp = spec.shape;

  if (shp === 'free') {
    if (pfpImg && spec.pfpClip) {
      const c = spec.pfpClip;
      ctx.save(); roundRectPath(ctx, c.x, c.y, c.w, c.h, c.r || 8); ctx.clip();
      coverDraw(ctx, pfpImg, c.x, c.y, c.w, c.h);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(212,175,55,0.8)'; ctx.lineWidth = 2;
      roundRectPath(ctx, c.x, c.y, c.w, c.h, c.r || 8); ctx.stroke();
      ctx.restore();
    } else if (spriteImg) {
      const s = spec.spriteH / spriteImg.height;
      const dw = spriteImg.width * s;
      ctx.drawImage(spriteImg, spec.cx - dw / 2, spec.top, dw, spec.spriteH);
    } else {
      hoodSilhouette(ctx, spec.cx, spec.top + spec.spriteH * 0.5, spec.spriteH * 0.42);
    }
    return;
  }

  if (shp === 'circle') {
    const { cx, cy, r } = spec;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (pfpImg) {
      coverDraw(ctx, pfpImg, cx - r, cy - r, r * 2, r * 2);
    } else if (spriteImg) {
      const img = spec.silhouette ? await silhouetteOf(spriteImg) : spriteImg;
      const s = spec.spriteH / img.height;
      const dw = img.width * s, dh = spec.spriteH;
      let dy;
      if (spec.mode === 'center') dy = cy - dh / 2 + (spec.dy || 0);
      else dy = cy + r - (spec.pad || 12) - dh;
      ctx.drawImage(img, cx - dw / 2, dy, dw, dh);
    } else {
      hoodSilhouette(ctx, cx, cy + r * 0.15, r * 0.72);
    }
    ctx.restore();
    return;
  }

  if (shp === 'rect' || shp === 'window') {
    const { x, y, w, h } = spec;
    if (pfpImg) {
      ctx.save(); roundRectPath(ctx, x, y, w, h, shp === 'window' ? 10 : 6); ctx.clip();
      coverDraw(ctx, pfpImg, x, y, w, h);
      ctx.restore();
    }
    if (spriteImg && !pfpImg) {
      if (shp === 'window' && spec.spriteFree) {
        const f = spec.spriteFree;
        const s = f.h / spriteImg.height;
        const dw = spriteImg.width * s;
        ctx.drawImage(spriteImg, f.cx - dw / 2, f.bottom - f.h, dw, f.h);
      } else {
        ctx.save(); roundRectPath(ctx, x, y, w, h, 6); ctx.clip();
        const s = spec.spriteH / spriteImg.height;
        const dw = spriteImg.width * s, dh = spec.spriteH;
        ctx.drawImage(spriteImg, x + (w - dw) / 2, y + h - (spec.pad || 12) - dh, dw, dh);
        ctx.restore();
      }
    } else if (!pfpImg && !spriteImg && shp === 'rect') {
      ctx.save(); roundRectPath(ctx, x, y, w, h, 6); ctx.clip();
      hoodSilhouette(ctx, x + w / 2, y + h * 0.55, h * 0.36);
      ctx.restore();
    }
    return;
  }

  if (shp === 'diamond') {
    const { cx, cy, r } = spec;
    const dia = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
    ctx.save();
    ctx.beginPath();
    dia.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath(); ctx.clip();
    if (pfpImg) coverDraw(ctx, pfpImg, cx - r, cy - r, r * 2, r * 2);
    else if (spriteImg) {
      const s = spec.spriteH / spriteImg.height;
      const dw = spriteImg.width * s, dh = spec.spriteH;
      ctx.drawImage(spriteImg, cx - dw / 2, cy + r - (spec.pad || 24) - dh, dw, dh);
    } else hoodSilhouette(ctx, cx, cy + r * 0.1, r * 0.6);
    ctx.restore();
    return;
  }

  if (shp === 'arch') {
    const { x0, y0, x1, y1 } = spec;
    const r = (x1 - x0) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0 + r);
    ctx.ellipse(x0 + r, y0 + r, r, r, 0, Math.PI, 0);
    ctx.lineTo(x1, y1); ctx.lineTo(x0, y1);
    ctx.closePath(); ctx.clip();
    if (pfpImg) coverDraw(ctx, pfpImg, x0, y0, x1 - x0, y1 - y0);
    else if (spriteImg) {
      const s = spec.spriteH / spriteImg.height;
      const dw = spriteImg.width * s, dh = spec.spriteH;
      ctx.drawImage(spriteImg, (x0 + x1) / 2 - dw / 2, y1 - (spec.pad || 10) - dh, dw, dh);
    } else hoodSilhouette(ctx, (x0 + x1) / 2, y1 - (y1 - y0) * 0.42, (y1 - y0) * 0.36);
    ctx.restore();
    return;
  }
}

function hoodSilhouette(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.45, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.28, r * 0.55, Math.PI, 0); ctx.fill();
}

// ------------------------------------------------------------------ ops
async function runOps(ctx, ops, D, styleId) {
  for (const op of ops || []) {
    try {
      if (op.needs === 'guild' && !D.GUILD) continue;
      switch (op.op) {
        case 'text': {
          let s = resolveTokens(op.s, D);
          if (op.s.includes('{GUILD}') && !D.GUILD && op.fallback) s = resolveTokens(op.fallback, D);
          if (s.includes('{')) {
            if (op.fallback) s = resolveTokens(op.fallback, D);
            if (s.includes('{')) continue;
          }
          if (!s) continue;
          let o = { x: op.x, y: op.y, s, font: op.font, size: op.size, color: op.color, anchor: op.anchor, maxW: op.maxW, shadow: op.shadow, glow: op.glow, stroke: op.stroke };
          if (op.dots) drawDots(ctx, op, s, D);
          drawText(ctx, o);
          break;
        }
        case 'join': {
          const parts = (op.parts || [])
            .filter(p => !(p.needs === 'guild' && !D.GUILD))
            .map(p => resolveTokens(p.t, D))
            .filter(Boolean);
          if (!parts.length) break;
          drawText(ctx, { x: op.x, y: op.y, s: parts.join(op.sep || ' · '), font: op.font, size: op.size, color: op.color, anchor: op.anchor || 'mm', maxW: op.maxW });
          break;
        }
        case 'barfill': {
          const frac = statFrac(D._stats, op.key);
          const fw = Math.max(op.h, op.w * frac);
          const grad = ctx.createLinearGradient(op.x, 0, op.x + fw, 0);
          grad.addColorStop(0, op.c1); grad.addColorStop(1, op.c2);
          ctx.save();
          roundRectPath(ctx, op.x, op.y, fw, op.h, op.h / 2); ctx.clip();
          ctx.fillStyle = grad;
          ctx.fillRect(op.x, op.y, fw, op.h);
          ctx.restore();
          break;
        }
        case 'pillfill': {
          const frac = statFrac(D._stats, op.key);
          const fw = Math.max(30, (op.w - 14) * frac);
          ctx.save();
          roundRectPath(ctx, op.x + 7, op.y + 7, fw, op.h - 14, 11); ctx.clip();
          ctx.fillStyle = op.color;
          ctx.fillRect(op.x + 7, op.y + 7, fw, op.h - 14);
          ctx.restore();
          break;
        }
        case 'rpgfills': {
          for (const it of op.items || []) {
            const img = await loadExtra(it.img);
            if (!img) continue;
            const frac = statFrac(D._stats, it.key);
            const fw = Math.max(10, (150 - 30) * frac);
            ctx.drawImage(img, 492, it.y, fw, 11);
          }
          break;
        }
        case 'statvals': {
          for (const v of op.vals || []) {
            const s = (v.prefix || '') + statVal(D._stats, v.key);
            if (v.dots) drawDots(ctx, v, s, D);
            drawText(ctx, { x: v.x, y: v.y, s, font: v.font, size: v.size, color: v.color, anchor: v.anchor, maxW: v.maxW, glow: v.glow, shadow: v.shadow });
          }
          break;
        }
        case 'facts1': {
          const rows = [
            ['icon_coin.png', 'ZENI', D.ZENI],
            ['icon_bow.png', 'PVP', D.PVPA],
          ];
          if (D.GUILD) rows.push(['icon_armor.png', 'GUILD', D.GUILD]);
          rows.push(['icon_gemred.png', 'XP', D.XPX]);
          let fy = 250;
          for (const [icon, label, val] of rows) {
            const ic = await loadExtra(icon);
            if (ic) ctx.drawImage(ic, 440 - 30, fy + 27 - 30, 60, 60);
            drawText(ctx, { x: 486, y: fy, s: label, font: 'cinzel', size: 22, color: '#aab2c4', anchor: 'la' });
            drawText(ctx, { x: 486, y: fy + 30, s: val, font: 'dogica_b', size: 28, color: '#eee6d2', anchor: 'la', maxW: 246 });
            fy += 102;
          }
          break;
        }
        case 'seal': {
          ctx.save();
          ctx.translate(op.x, op.y);
          ctx.rotate(((op.rot || 0) * Math.PI) / 180);
          drawText(ctx, { x: 0, y: 0, s: D.RANK, font: op.font, size: op.size, color: op.color, anchor: 'mm', maxW: 84 });
          ctx.restore();
          break;
        }
        case 'zenipill6': {
          const zt = `${D.ZENI}  ZENI`;
          const size = fitFont(ctx, 'dogica_b', 28, zt, 400);
          ctx.font = FONT_FNS.dogica_b(size);
          const zw = ctx.measureText(zt).width;
          const x0 = 400 - zw / 2 - 46, y0 = 1014, x1 = 400 + zw / 2 + 46, y1 = 1062;
          ctx.save();
          ctx.fillStyle = 'rgba(24,14,44,0.842)';
          roundRectPath(ctx, x0, y0, x1 - x0, y1 - y0, 16); ctx.fill();
          ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2;
          roundRectPath(ctx, x0, y0, x1 - x0, y1 - y0, 16); ctx.stroke();
          ctx.restore();
          const coin = await loadExtra('coin.png');
          if (coin) ctx.drawImage(coin, Math.round(400 - zw / 2 - 34), 1016, 44, 44);
          drawText(ctx, { x: 414, y: 1038, s: zt, font: 'dogica_b', size: 28, color: '#f6d670', anchor: 'mm' });
          break;
        }
        case 'coinzeni': {
          const s = resolveTokens(op.s, D);
          const size = fitFont(ctx, op.font, op.size, s, 460);
          ctx.font = FONT_FNS[op.font](size);
          const zw = ctx.measureText(s).width;
          if (op.icon) {
            const coin = await loadExtra(`${op.icon}.png`);
            if (coin) ctx.drawImage(coin, Math.round(400 - zw / 2 + op.coinDx), op.coinY, op.iconSize, op.iconSize);
          }
          drawText(ctx, { x: 400 + op.textDx, y: op.textY, s, font: op.font, size: op.size, color: op.color, anchor: 'mm' });
          break;
        }
        case 'crystal': {
          const cr = await loadExtra('crystal.png');
          if (cr) {
            const h = op.h || 92;
            const w = cr.width * (h / cr.height);
            ctx.drawImage(cr, op.cx - w / 2, op.cy - h / 2, w, h);
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`[profileCardRenderer] op ${op && op.op} failed (style ${styleId}):`, e.message);
    }
  }
}

function drawDots(ctx, item, valueStr, D) {
  const dots = item.dots;
  let startX;
  if (dots.fromLabel) {
    ctx.font = FONT_FNS[dots.fromLabelFont || 'cinzel'](dots.fromLabelSize || 26);
    startX = (dots.fromX || 384) + ctx.measureText(dots.fromLabel).width + 14;
  } else startX = dots.fromX || 0;
  ctx.font = FONT_FNS[item.font](item.size);
  const endX = item.x - ctx.measureText(valueStr).width - 14;
  ctx.fillStyle = dots.color || '#6e583a';
  const cy = item.y + 9.2, r = dots.r || 1.2;
  for (let xx = startX; xx < endX; xx += 8) {
    ctx.beginPath(); ctx.arc(xx + r, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ------------------------------------------------------------------ main
async function renderProfileCard(params) {
  const runtimeDefault = getDefaultStyle();
  let styleId = parseInt(params.style, 10);
  if (!Number.isFinite(styleId) || styleId < 1 || styleId > 10) styleId = runtimeDefault;
  const layouts = getLayouts();
  if (!layouts[String(styleId)]) styleId = runtimeDefault;
  let bg = await loadBg(styleId);
  if (!bg && styleId !== runtimeDefault) { styleId = runtimeDefault; bg = await loadBg(styleId); }
  const layout = layouts[String(styleId)];
  if (!layout || !bg) throw new Error(`profile styles missing (style ${styleId})`);

  ensureFonts();
  const { createCanvas } = getCanvas();
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bg, 0, 0);

  const D = buildCardData(params);
  D._stats = params.stats || {};
  const lay = layout;

  // Portrait art: pfp → class sprite → hood fallback
  let pfpImg = null;
  if (params.pfpBuffer) {
    try { pfpImg = await getCanvas().loadImage(params.pfpBuffer); } catch (e) { pfpImg = null; }
  }
  let spriteImg = null;
  if (!pfpImg) {
    const spriteFile = CLASS_SPRITES[(params.classData?.name || '').toUpperCase()] || 'apprentice1.png';
    spriteImg = await loadChar(spriteFile);
    if (!spriteImg) spriteImg = await loadChar('apprentice1.png');
  }
  await drawPortrait(ctx, lay.portrait, { pfpImg, spriteImg });

  await runOps(ctx, lay.ops, D, styleId);

  return canvas.toBuffer('image/png');
}

// ------------------------------------------------- style pickers sheet (.j cardstyle)
// 💡 cache is keyed by the highlighted style — the sheet marks BOTH the
// viewer's current pick AND the server default, so a single-slot cache
// would render stale highlights for everyone after the first viewer.
const _sheetCache = new Map();
async function renderStyleSheet(currentStyle) {
  const defStyle = getDefaultStyle();
  const cacheKey = `${currentStyle}|${defStyle}`;
  if (_sheetCache.has(cacheKey)) return _sheetCache.get(cacheKey);
  ensureFonts();
  const layouts = getLayouts();
  const { createCanvas } = getCanvas();
  const tw = 288, th = 396, gap = 22, cols = 5;
  const rows = 2;
  const W = cols * tw + (cols + 1) * gap;
  const H = rows * (th + 54) + (rows + 1) * gap;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#141824'); bgGrad.addColorStop(1, '#0b0d14');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(212,175,55,0.55)'; ctx.lineWidth = 3;
  roundRectPath(ctx, 10, 10, W - 20, H - 20, 18); ctx.stroke();

  ctx.textBaseline = 'middle';
  for (let i = 1; i <= 10; i++) {
    const col = (i - 1) % cols, row = Math.floor((i - 1) / cols);
    const x = gap + col * (tw + gap), y = gap + row * (th + 54 + gap);
    const bg = await loadBg(i);
    if (bg) ctx.drawImage(bg, x, y, tw, th);
    else { ctx.fillStyle = '#222'; ctx.fillRect(x, y, tw, th); }
    const cur = i === currentStyle;
    ctx.strokeStyle = cur ? '#f6d670' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = cur ? 5 : 2;
    roundRectPath(ctx, x, y, tw, th, 8); ctx.stroke();
    // number chip
    ctx.fillStyle = cur ? '#f6d670' : '#d4af37';
    ctx.beginPath(); ctx.arc(x + 26, y + 26, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.font = `bold 19px "${FONT_BOLD}"`; ctx.textAlign = 'center';
    ctx.fillText(String(i), x + 26, y + 27);
    // name
    const name = (layouts[String(i)] && layouts[String(i)].name) || `Style ${i}`;
    ctx.fillStyle = cur ? '#f6d670' : '#cfc6ae';
    ctx.font = `16px "Cinzel"`;
    let nm = name;
    while (ctx.measureText(nm).width > tw && nm.length > 4) nm = nm.slice(0, -1);
    ctx.fillText(nm, x + tw / 2, y + th + 26);
    if (i === defStyle) {
      ctx.fillStyle = 'rgba(246,214,112,0.75)';
      ctx.font = `11px "${FONT_REG}"`;
      ctx.fillText('DEFAULT', x + tw / 2, y + th + 45);
    }
  }
  const buf = canvas.toBuffer('image/png');
  // keep the map bounded: drop stale keys once it grows past a few renders
  if (_sheetCache.size > 12) _sheetCache.clear();
  _sheetCache.set(cacheKey, buf);
  return buf;
}

// Legacy exports kept for backward compatibility
const RANK_COLORS = { F: '#9E9E9E', E: '#8D6E63', D: '#795548', C: '#558B2F', B: '#2E7D32', A: '#1565C0', S: '#7B1FA2', SS: '#C2185B', SSS: '#E65100', GOD: '#FFD700', DRAGON: '#FF6F00' };
const RANK_GRADIENTS = {};
const STAT_COLORS = { hp: '#F44336', atk: '#FF9800', def: '#2196F3', mag: '#9C27B0', spd: '#4CAF50', luck: '#FFEB3B', crit: '#FF6F00', evasion: '#00BCD4' };
const EQUIP_RARITY = {
  COMMON: { border: '#9E9E9E', tint: 'rgba(158,158,158,0.1)', label: 'C' },
  UNCOMMON: { border: '#4CAF50', tint: 'rgba(76,175,80,0.12)', label: 'U' },
  RARE: { border: '#2196F3', tint: 'rgba(33,150,243,0.14)', label: 'R' },
  EPIC: { border: '#9C27B0', tint: 'rgba(156,39,176,0.14)', label: 'E' },
  LEGENDARY: { border: '#FF9800', tint: 'rgba(255,152,0,0.17)', label: 'L' },
  MYTHIC: { border: '#E91E63', tint: 'rgba(233,30,99,0.17)', label: 'M' }
};
const EQUIPMENT_SLOTS = [
  { key: 'main_hand', label: 'Weapon', short: 'WPN', icon: 'sword.png' },
  { key: 'off_hand', label: 'Off-Hand', short: 'OFF', icon: 'shield.png' },
  { key: 'armor', label: 'Armor', short: 'ARM', icon: 'armor.png' },
  { key: 'helmet', label: 'Helmet', short: 'HLM', icon: 'helmet.png' },
  { key: 'gloves', label: 'Gloves', short: 'GLV', icon: 'gloves.png' },
  { key: 'boots', label: 'Boots', short: 'BTS', icon: 'boots.png' },
  { key: 'ring', label: 'Ring', short: 'RNG', icon: 'ring.png' },
  { key: 'amulet', label: 'Amulet', short: 'AML', icon: 'amulet.png' },
  { key: 'cloak', label: 'Cloak', short: 'CLK', icon: 'cloak.png' }
];


// 💡 REDESIGN 2026-09-15 v2 (owner feedback: "completely redesign a unique
// card … dont reuse"). The allocate card no longer borrows anything from the
// profile deck — no bg_7 bake, no Royal Decree fonts/palette. It is drawn
// entirely in code as its own identity: THE SOUL FORGE (obsidian + gold +
// arcane teal), MedievalSharp-led type, rune-circle watermark, starfield.
const SOUL = {
  bgTop: '#0b0d16',
  bgMid: '#191233',
  bgBot: '#0b0d16',
  gold: '#c9a227',
  goldBright: '#e8c766',
  goldDim: '#a8945f',
  teal: '#7fe8dc',
  tealSoft: '#9fe8df',
  ink: '#efe6d0',
};

function allocFmtGain(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '+1';
  const r = Math.round(n * 10) / 10;
  return `+${String(r)}`;
}

// gold dot leaders (dark-card geometry — not the parchment card's)
function soulDots(ctx, startX, endX, y, a) {
  if (endX - startX < 12) return;
  ctx.save();
  ctx.fillStyle = `rgba(201,162,39,${a})`;
  for (let xx = startX; xx < endX; xx += 9) {
    ctx.beginPath(); ctx.arc(xx, y, 1.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// four-point sparkle
function soulSparkle(ctx, x, y, s, a) {
  ctx.save();
  ctx.fillStyle = `rgba(232,199,102,${a})`;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.22, y - s * 0.22);
  ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.22, y + s * 0.22);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.22, y + s * 0.22);
  ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.22, y - s * 0.22);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// small filled diamond
function soulDiamond(ctx, x, y, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// L-shaped corner bracket (bright gold)
function soulBracket(ctx, x, y, dx, dy, len, w) {
  ctx.save();
  ctx.strokeStyle = SOUL.goldBright;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + dx * len, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + dy * len);
  ctx.stroke();
  ctx.restore();
}

async function renderAllocateCard(params) {
  const {
    availablePoints = 0, invested = {}, perPoint = {},
    tier = 'STARTER', className = 'Adventurer', prefix = '.'
  } = params;

  ensureFonts();
  const { createCanvas } = getCanvas();
  const W = 800, H = 1100;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cx = Math.round(W / 2);

  // ── 1. Background: obsidian-indigo gradient + arcane glow + starfield ──
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SOUL.bgTop);
  g.addColorStop(0.42, SOUL.bgMid);
  g.addColorStop(1, SOUL.bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(cx, 300, 40, cx, 300, 330);
  glow.addColorStop(0, 'rgba(111,224,210,0.10)');
  glow.addColorStop(1, 'rgba(111,224,210,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // deterministic starfield (seeded LCG — identical card every render)
  let seed = 20260915;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 110; i++) {
    const sx = rnd() * W, sy = rnd() * (H * 0.97), sr = 0.6 + rnd() * 1.6;
    const teal = rnd() < 0.3;
    ctx.fillStyle = teal ? `rgba(127,232,220,${(0.08 + rnd() * 0.30).toFixed(3)})`
      : `rgba(232,199,102,${(0.07 + rnd() * 0.28).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }
  [[140, 244, 7], [662, 204, 6], [118, 566, 6], [692, 526, 7], [176, 902, 6], [636, 880, 6], [400, 62, 7], [540, 130, 5], [252, 120, 5]]
    .forEach(([x, y, s]) => soulSparkle(ctx, x, y, s, 0.38));

  // ── 2. Rune-circle watermark behind the hero number ──
  ctx.save();
  ctx.strokeStyle = 'rgba(201,162,39,0.14)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, 302, 162, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, 302, 148, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 24; i++) { // tick marks between the two rings
    const ang = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 148, 302 + Math.sin(ang) * 148);
    ctx.lineTo(cx + Math.cos(ang) * 162, 302 + Math.sin(ang) * 162);
    ctx.stroke();
  }
  ctx.setLineDash([6, 9]);
  ctx.beginPath(); ctx.arc(cx, 302, 116, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  [[0, -162], [162, 0], [0, 162], [-162, 0]].forEach(([ox, oy]) =>
    soulDiamond(ctx, cx + ox, 302 + oy, 5, 'rgba(201,162,39,0.35)'));
  ctx.strokeStyle = 'rgba(127,232,220,0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, 302, 176, -0.7, 0.85); ctx.stroke();
  ctx.restore();

  // ── 3. Vignette ──
  const vg = ctx.createRadialGradient(cx, 540, 240, cx, 540, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.40)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // ── 4. Gold frame: double border + brackets + diamonds ──
  ctx.save();
  ctx.strokeStyle = SOUL.gold;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(16.5, 16.5, W - 33, H - 33);
  ctx.strokeStyle = 'rgba(201,162,39,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(27.5, 27.5, W - 55, H - 55);
  ctx.restore();
  const BR = 34;
  soulBracket(ctx, 16, 16, 1, 1, BR, 3);
  soulBracket(ctx, W - 16, 16, -1, 1, BR, 3);
  soulBracket(ctx, 16, H - 16, 1, -1, BR, 3);
  soulBracket(ctx, W - 16, H - 16, -1, -1, BR, 3);
  soulDiamond(ctx, cx, 16, 9, SOUL.gold);
  soulDiamond(ctx, cx, H - 16, 9, SOUL.gold);
  ctx.fillStyle = 'rgba(201,162,39,0.7)';
  ctx.beginPath(); ctx.arc(cx - 20, 16, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 20, 16, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - 20, H - 16, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 20, H - 16, 2.4, 0, Math.PI * 2); ctx.fill();

  // ── 5. Title block ──
  drawText(ctx, {
    x: cx, y: 100, s: 'SOUL FORGE', font: 'medsharp',
    size: 64, color: SOUL.goldBright, maxW: 600,
    glow: { color: 'rgba(232,199,102,0.40)', r: 20 },
  });
  drawText(ctx, {
    x: cx, y: 142, s: 'A T T R I B U T E   A L L O C A T I O N', font: 'cinzel',
    size: 20, color: SOUL.goldDim, maxW: 640,
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(201,162,39,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(150, 168.5); ctx.lineTo(306, 168.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(494, 168.5); ctx.lineTo(650, 168.5); ctx.stroke();
  ctx.restore();
  soulDiamond(ctx, cx, 168, 4, 'rgba(201,162,39,0.8)');
  drawText(ctx, {
    x: cx, y: 194, s: `${className}  ·  ${String(tier).toLowerCase()} tier`, font: 'cinzel',
    size: 17, color: 'rgba(168,148,95,0.9)', maxW: 560,
  });

  // ── 6. Hero: unspent points ──
  drawText(ctx, {
    x: cx, y: 234, s: 'UNSPENT POINTS', font: 'cinzel',
    size: 19, color: SOUL.goldDim,
  });
  const heroNum = String(Math.max(0, Math.round(Number(availablePoints) || 0)));
  drawText(ctx, {
    x: cx, y: 322, s: heroNum, font: 'medsharp',
    size: heroNum.length >= 4 ? 108 : 132, color: SOUL.teal, maxW: 420,
    glow: { color: 'rgba(111,224,210,0.50)', r: 26 },
  });

  // ── 7. Ledger panel ──
  const PX = 70, PW = 660, PY = 424, PH = 512;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.strokeStyle = 'rgba(201,162,39,0.30)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, PX, PY, PW, PH, 16);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  drawText(ctx, {
    x: cx, y: PY + 32, s: 'THE SEVEN PATHS', font: 'medsharp',
    size: 25, color: SOUL.goldBright,
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(201,162,39,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PX + 190, PY + 52.5); ctx.lineTo(PX + PW - 190, PY + 52.5); ctx.stroke();
  ctx.restore();
  soulDiamond(ctx, cx, PY + 52, 3.5, SOUL.gold);

  const ROWS = [
    ['HP', 'HEALTH'], ['ATK', 'ATTACK'], ['DEF', 'DEFENSE'], ['MAG', 'MAGIC'],
    ['SPD', 'SPEED'], ['LUCK', 'LUCK'], ['CRIT', 'CRIT'],
  ];
  const rowY0 = PY + 82, rowH = 52;
  let totalInvested = 0;
  ROWS.forEach(([code, name], i) => {
    const y = rowY0 + i * rowH + rowH / 2;
    // element-style chip
    ctx.save();
    ctx.fillStyle = 'rgba(127,232,220,0.07)';
    ctx.strokeStyle = 'rgba(127,232,220,0.40)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, 96, y - 15, 46, 30, 8);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    drawText(ctx, { x: 119, y, s: code, font: 'cinzel', size: 16, color: SOUL.tealSoft });
    // stat name
    drawText(ctx, { x: 158, y, s: name, font: 'medsharp', size: 27, color: SOUL.ink, anchor: 'lm', maxW: 190 });
    // invested tally
    const inv = Math.max(0, Math.round(Number(invested[code.toLowerCase()]) || 0));
    totalInvested += inv;
    let dotsFrom = 368;
    if (inv > 0) {
      const tally = `${inv} invested`;
      drawText(ctx, { x: 356, y, s: tally, font: 'cinzel', size: 15, color: 'rgba(168,148,95,0.95)', anchor: 'lm' });
      dotsFrom = 356 + ctx.measureText(tally).width + 14;
    }
    // gain per point
    const valStr = allocFmtGain(perPoint[code] || 1);
    ctx.font = FONT_FNS.medsharp(30);
    const vw = ctx.measureText(valStr).width;
    soulDots(ctx, dotsFrom, 704 - vw - 12, y, 0.45);
    drawText(ctx, { x: 704, y, s: valStr, font: 'medsharp', size: 30, color: SOUL.teal, anchor: 'rm' });
    if (i < ROWS.length - 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(201,162,39,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PX + 26, rowY0 + (i + 1) * rowH + 0.5); ctx.lineTo(PX + PW - 26, rowY0 + (i + 1) * rowH + 0.5); ctx.stroke();
      ctx.restore();
    }
  });

  // SPENT summary row
  const spentSepY = rowY0 + ROWS.length * rowH;
  ctx.save();
  ctx.strokeStyle = 'rgba(201,162,39,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PX + 26, spentSepY + 0.5); ctx.lineTo(PX + PW - 26, spentSepY + 0.5); ctx.stroke();
  ctx.restore();
  const spentY = spentSepY + 30;
  const spentVal = `${Math.round(totalInvested).toLocaleString('en-US')} pts`;
  drawText(ctx, { x: 158, y: spentY, s: 'SPENT', font: 'medsharp', size: 24, color: SOUL.goldDim, anchor: 'lm' });
  ctx.font = FONT_FNS.medsharp(26);
  const spentW = ctx.measureText(spentVal).width;
  soulDots(ctx, 368, 704 - spentW - 12, spentY, 0.45);
  drawText(ctx, { x: 704, y: spentY, s: spentVal, font: 'medsharp', size: 26, color: SOUL.goldBright, anchor: 'rm' });

  // ── 8. Soft-cap note ──
  drawText(ctx, {
    x: cx, y: 954, s: 'Half value per point after heavy single-stat investment', font: 'medsharp',
    size: 21, color: 'rgba(168,148,95,0.95)', maxW: 640,
  });

  // ── 9. CTA pill ──
  ctx.save();
  ctx.fillStyle = 'rgba(201,162,39,0.10)';
  ctx.strokeStyle = SOUL.gold;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, 150, 976, 500, 66, 33);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  drawText(ctx, {
    x: cx, y: 1002, s: `${prefix} allocate <stat> [amount]`, font: 'medsharp',
    size: 28, color: SOUL.goldBright, maxW: 460,
  });
  drawText(ctx, {
    x: cx, y: 1028, s: `e.g.  ${prefix} allocate atk 5   ·   ${prefix} allocate hp 3`, font: 'cinzel',
    size: 15, color: SOUL.goldDim, maxW: 460,
  });

  // ── 10. Footer ──
  drawText(ctx, {
    x: cx, y: 1056, s: 'spent points are permanent — choose wisely', font: 'medsharp',
    size: 17, color: 'rgba(168,148,95,0.75)',
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderProfileCard, renderAllocateCard, renderStyleSheet, clearCaches, DEFAULT_STYLE, getDefaultStyle, RANK_COLORS, RANK_GRADIENTS, STAT_COLORS, EQUIP_RARITY, EQUIPMENT_SLOTS };
