// ============================================
// 💎 ABILITY INSPECTION + RUNE CODEX CARDS (2026-10-11, v2 redesign 2026-10-12)
// ============================================
// Owner brief (rune_ability_asset_integration_v2.md):
//   * `.j abilities <num|id|name>`  -> FULL redesign (not a re-skin): the
//     skill's v3 artwork is the visual centerpiece on a riveted art plate,
//     with a stat medallion rail (energy / cooldown / power), the real
//     effect + description, the unlock requirement, and the skill's REAL
//     rune sockets (runeSystem slot rules: T1=1, T2=2, T3+=3). Socketed
//     runes render their TIER-specific v3 art.
//   * `.j rune list [page]`         -> paginated RUNE CODEX image card:
//     8 rune plates per page, tier-specific art, real names/desc/effects
//     from runeSystem.RUNE_TYPES. Text fallback preserved on any failure.
// Family look = the r5 RPG board set (dark walnut, double gold frame,
// parchment text, Cinzel + IM Fell). Falls back to null on ANY failure -
// callers keep their text paths.
//
// Renders go through renderQueue.run (owner queue rule 2026-10-08) and
// degrade to text on memory pressure (EQUEUEFULL/EMEM).

const path = require('path');
const fs = require('fs');

let _canvas = null;
function getCanvas() {
  if (!_canvas) _canvas = require('canvas');
  return _canvas;
}

// ── fonts (same RPG set navCard/roomScene use) ──
let _fontsReady = false;
function ensureFonts() {
  if (_fontsReady) return true;
  try {
    const canvas = getCanvas();
    const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
    if (!registerFont) return false;
    const F = path.join(__dirname, '..', 'rpgasset', 'fonts');
    const isRealFont = (p) => {
      try {
        if (!fs.existsSync(p)) return false;
        const head = fs.readFileSync(p).slice(0, 4);
        return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || head.toString('latin1') === 'OTTO' || head.toString('latin1') === 'true';
      } catch (e) { return false; }
    };
    const regs = [
      ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
      ['CinzelDecorative-Bold.ttf', { family: 'Cinzel Deco B' }],
      ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
      ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
      ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
    ];
    for (const [file, opts] of regs) {
      const p = path.join(F, file);
      if (isRealFont(p)) { try { registerFont(p, opts); } catch (e) {} }
    }
    _fontsReady = true;
    return true;
  } catch (e) {
    return false;
  }
}

// ── palette (r5 board family) ──
const C = {
  walnut: '#150e08',
  plank: 'rgba(255, 220, 160, 0.04)',
  frame: '#d6aa52',
  frameDim: 'rgba(170, 130, 60, 0.63)',
  panel: '#241a10',
  panelEdge: 'rgba(214, 170, 82, 0.35)',
  gold: '#d6aa52',
  goldBright: '#f0d9a8',
  text: '#f0d9a8',
  muted: '#b39b6e',
  dim: '#7a6440',
  ink: '#1a1208',
  socketRing: '#c8a050',
  socketHole: '#0d0906',
  good: '#8fd18a',
};
const TIER_ACCENT = {
  1: '#9aa7b5',
  2: '#58b368',
  3: '#4f9fe8',
  4: '#e0b34d',
};
function tierAccent(tier, opts = {}) {
  if (opts.ascended) return '#b06df0';
  return TIER_ACCENT[Math.min(4, Math.max(1, tier | 0))] || TIER_ACCENT[1];
}
function tierLabel(tier, opts = {}) {
  if (opts.ascended) return 'ASCENDED';
  const t = Math.min(4, Math.max(1, tier | 0));
  if (t === 4 || opts.ultimate) return 'TIER 4 · ULTIMATE';
  return `TIER ${t}`;
}

// ── small helpers ──
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintBoard(ctx, W, H) {
  ctx.fillStyle = C.walnut;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.plank;
  ctx.lineWidth = 1;
  for (let y = 60; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.strokeStyle = C.frame;
  ctx.lineWidth = 4;
  roundRect(ctx, 14, 14, W - 28, H - 28, 14); ctx.stroke();
  ctx.strokeStyle = C.frameDim;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 10); ctx.stroke();
}

function fitText(ctx, text, maxWidth, startSize, font) {
  let size = startSize;
  ctx.font = `${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > 9) {
    size -= 1;
    ctx.font = `${size}px ${font}`;
  }
  return size;
}

function wrapText(ctx, text, maxw) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (ctx.measureText(cand).width > maxw && line) { lines.push(line); line = w; }
    else line = cand;
  }
  if (line) lines.push(line);
  return lines;
}

function rivet(ctx, x, y, r = 5) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = C.frame; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(x - 1.4, y - 1.4, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 236, 190, 0.85)'; ctx.fill();
}

function divider(ctx, x0, x1, y, alpha = 0.4) {
  const mid = (x0 + x1) / 2;
  ctx.strokeStyle = `rgba(214, 170, 82, ${alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(mid - 12, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mid + 12, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mid, y - 5); ctx.lineTo(mid + 5, y); ctx.lineTo(mid, y + 5); ctx.lineTo(mid - 5, y);
  ctx.closePath();
  ctx.fillStyle = `rgba(214, 170, 82, ${Math.min(1, alpha + 0.25)})`; ctx.fill();
}

/**
 * Draw artwork contain-fit inside a circle, pixel-crisp on upscale.
 */
function drawArtInCircle(ctx, img, cx, cy, r) {
  if (!img) return false;
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const scale = Math.min((r * 2 * 0.92) / iw, (r * 2 * 0.92) / ih);
  const w = iw * scale, h = ih * scale;
  ctx.imageSmoothingEnabled = scale < 1;   // crisp when upscaling pixel art
  try {
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } catch (e) { /* defensive */ }
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  return true;
}

function drawArtInRect(ctx, img, x, y, w, h, pad = 0) {
  if (!img) return false;
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return false;
  const scale = Math.min((w - pad * 2) / iw, (h - pad * 2) / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.imageSmoothingEnabled = scale < 1;
  try {
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } catch (e) { /* defensive */ }
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  return true;
}

// rune tier ring colors
const TIER_RING = {
  LESSER: '#8a8f98',
  NORMAL: '#58b368',
  GREATER: '#4f9fe8',
  ABYSSAL: '#b06df0',
};

/**
 * One rune socket: filled (TIER-specific rune art + tier ring) or empty
 * (engraved hole).
 */
async function drawSocket(ctx, cx, cy, r, rune, assets) {
  ctx.save();
  // socket housing
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0906'; ctx.fill();
  ctx.strokeStyle = C.frameDim; ctx.lineWidth = 2; ctx.stroke();

  let art = null;
  if (rune && assets) {
    try { art = await assets.getRuneArt(rune.type, rune.tier); } catch (e) { art = null; }
  }
  if (rune && art) {
    const ring = TIER_RING[rune.tier] || C.socketRing;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#171008'; ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = 2.5; ctx.stroke();
    drawArtInCircle(ctx, art, cx, cy, r - 3);
  } else if (rune) {
    // rune equipped but art missing -> glyph disc
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1c130a'; ctx.fill();
    ctx.strokeStyle = TIER_RING[rune.tier] || C.socketRing; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = C.goldBright;
    ctx.font = `${Math.round(r * 0.95)}px Cinzel`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('◆', cx, cy + 1);
  } else {
    // empty socket
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = C.socketHole; ctx.fill();
    ctx.strokeStyle = 'rgba(200, 160, 80, 0.55)'; ctx.lineWidth = 2; ctx.stroke();
    // inner bevel hint
    ctx.beginPath(); ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120, 90, 40, 0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(214, 170, 82, 0.5)';
    ctx.font = `${Math.round(r * 0.9)}px Cinzel`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', cx, cy + 1);
  }
  ctx.restore();
}

function levelPips(ctx, cx, cy, cur, max, accent) {
  const maxPips = Math.min(Math.max(max, 1), 7);
  const curPips = Math.min(cur, maxPips);
  const gap = 24;
  const total = (maxPips - 1) * gap;
  const startX = cx - total / 2;
  for (let i = 0; i < maxPips; i++) {
    const px = startX + i * gap;
    if (i < curPips) {
      ctx.beginPath(); ctx.arc(px, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = accent; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(24, 16, 10, 0.85)'; ctx.fill();
      ctx.strokeStyle = 'rgba(170, 130, 60, 0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }
}

const _rq = () => require('../utils/renderQueue');

// ═══════════════════════════════════════════════════════════════
//  CARD 1 — ABILITY INSPECTION  (720 x 1120, v2 full redesign)
//  Identity: riveted art plate centerpiece + stat medallion rail.
// ═══════════════════════════════════════════════════════════════
/**
 * payload = {
 *   nickname, className, classId, rank,
 *   skill: { id, name, tier, maxLevel, isUltimate, isAscended },
 *   level: <learned level>, desc: <tree flavor line>,
 *   effectText: <short line>, requiresText: <unlock req or null>,
 *   energy, cooldown, damageLine,
 *   sockets: [ {type, tier, runeId} | null, ... ]  // length = slot count
 *   skillIdHint: <string shown in the footer>
 * }
 */
async function renderAbilityInspectCard(payload) {
  try {
    const assets = require('./skillAssets');
    const canvas = getCanvas();
    ensureFonts();
    const W = 720, H = 1120;
    return await _rq().run('abilityInspect', async () => {
      const { createCanvas } = canvas;
      const cv = createCanvas(W, H);
      const ctx = cv.getContext('2d');
      paintBoard(ctx, W, H);

      const skill = payload.skill || {};
      const accent = tierAccent(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate });

      // ── header: owner line + name banner ──
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.muted;
      ctx.font = '15px Cinzel';
      ctx.fillText(`${String(payload.nickname || 'Adventurer').slice(0, 24)}  ·  ${String(payload.className || '').toUpperCase()}${payload.rank ? `  ·  RANK ${String(payload.rank).toUpperCase()}` : ''}`, W / 2, 62);

      const name = String(skill.name || 'Unknown Skill');
      fitText(ctx, name, 560, 38, '"Cinzel Deco"');
      ctx.fillStyle = C.goldBright;
      ctx.fillText(name, W / 2, 106);

      const tl = tierLabel(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate });
      ctx.font = '16px Cinzel';
      ctx.fillStyle = accent;
      ctx.fillText(`◆ ${tl} ◆`, W / 2, 134);
      divider(ctx, 120, W - 120, 152, 0.45);

      // ── ART CENTERPIECE: riveted plate ──
      const ax = 56, ay = 172, aw = W - 112, ah = 300;
      // glow
      const grad = ctx.createRadialGradient(W / 2, ay + ah / 2, 40, W / 2, ay + ah / 2, aw * 0.62);
      grad.addColorStop(0, 'rgba(240, 217, 168, 0.14)');
      grad.addColorStop(1, 'rgba(240, 217, 168, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(ax - 30, ay - 30, aw + 60, ah + 60);
      // housing
      roundRect(ctx, ax, ay, aw, ah, 12);
      ctx.fillStyle = '#0d0906'; ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.stroke();
      roundRect(ctx, ax + 7, ay + 7, aw - 14, ah - 14, 9);
      ctx.strokeStyle = 'rgba(214, 170, 82, 0.5)'; ctx.lineWidth = 1.6; ctx.stroke();
      for (const [rx, ry] of [[ax + 4, ay + 4], [ax + aw - 4, ay + 4], [ax + 4, ay + ah - 4], [ax + aw - 4, ay + ah - 4]]) {
        rivet(ctx, rx, ry, 5.5);
      }

      let art = null;
      try { art = await assets.getSkillArt(skill, payload.classId); } catch (e) { art = null; }
      if (!drawArtInRect(ctx, art, ax + 4, ay + 4, aw - 8, ah - 8, 14)) {
        // fallback: initials medallion (Go SKILLUP family look)
        const initials = String(skill.name || '?')
          .split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
        ctx.fillStyle = C.goldBright;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '84px "Cinzel Deco"';
        ctx.fillText(initials, W / 2, ay + ah / 2 - 6);
        ctx.textBaseline = 'alphabetic';
      }

      // ── level pips + count ──
      levelPips(ctx, W / 2, 506, payload.level || 0, skill.maxLevel || 1, accent);
      ctx.font = '14px Cinzel';
      ctx.fillStyle = C.muted;
      ctx.fillText(`LEVEL ${payload.level || 0} / ${skill.maxLevel || 1}`, W / 2, 532);

      // ── stat medallion rail: ENERGY / COOLDOWN / POWER ──
      const stats = [
        { label: 'ENERGY', value: String(payload.energy ?? '—'), glyph: '✦' },
        { label: 'COOLDOWN', value: payload.cooldown ? `${payload.cooldown} TNT` : 'NONE', glyph: '◌' },
        { label: 'POWER', value: String(payload.damageLine || '—'), glyph: '⚔' },
      ];
      const mw = 190, mh = 86, gap = 22;
      const mx0 = (W - (mw * 3 + gap * 2)) / 2;
      const my = 556;
      stats.forEach((s, i) => {
        const x = mx0 + i * (mw + gap);
        roundRect(ctx, x, my, mw, mh, 10);
        ctx.fillStyle = C.panel; ctx.fill();
        ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = '13px Cinzel';
        ctx.fillStyle = C.gold;
        ctx.fillText(`${s.glyph} ${s.label}`, x + mw / 2, my + 26);
        fitText(ctx, s.value, mw - 28, 26, '"Cinzel Deco B"');
        ctx.fillStyle = C.text;
        ctx.fillText(s.value, x + mw / 2, my + 62);
      });

      // ── effect + description panel ──
      const px = 46, pw = W - 92;
      const py = 668, ph = 176;
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.fillStyle = C.panel; ctx.fill();
      ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '14px Cinzel';
      ctx.fillStyle = C.gold;
      ctx.fillText('EFFECT', px + 24, py + 30);
      ctx.font = '16px "IM Fell"';
      ctx.fillStyle = C.text;
      const effLines = wrapText(ctx, payload.effectText || '—', pw - 52).slice(0, 2);
      effLines.forEach((l, i) => ctx.fillText(l, px + 24, py + 56 + i * 22));
      ctx.strokeStyle = 'rgba(214, 170, 82, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 18, py + effLines.length * 22 + 66); ctx.lineTo(px + pw - 18, py + effLines.length * 22 + 66); ctx.stroke();
      ctx.font = '15px "IM Fell Italic"';
      ctx.fillStyle = C.muted;
      const descLines = wrapText(ctx, payload.desc || '', pw - 52).slice(0, 2);
      descLines.forEach((l, i) => ctx.fillText(l, px + 24, py + effLines.length * 22 + 92 + i * 21));

      // ── unlock requirement ──
      const reqY = py + ph + 34;
      ctx.textAlign = 'center';
      ctx.font = '15px Cinzel';
      ctx.fillStyle = payload.requiresText ? C.goldBright : C.dim;
      ctx.fillText(payload.requiresText ? `⛭ REQUIRES  ·  ${payload.requiresText}` : '⛭ REQUIREMENT  ·  NONE — INNATE', W / 2, reqY);

      // ── rune sockets panel ──
      const sockets = Array.isArray(payload.sockets) ? payload.sockets : [];
      const sy = reqY + 16;
      const sh = 212;
      roundRect(ctx, px, sy, pw, sh, 10);
      ctx.fillStyle = C.panel; ctx.fill();
      ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '16px Cinzel';
      ctx.fillStyle = C.gold;
      const used = sockets.filter(Boolean).length;
      ctx.fillText('RUNE SOCKETS', px + 24, sy + 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = used > 0 ? C.good : C.muted;
      ctx.fillText(`${used} / ${sockets.length}`, px + pw - 24, sy + 34);

      const n = sockets.length;
      const sr = n <= 2 ? 50 : n === 3 ? 44 : 36;
      const sgap = sr * 2 + 34;
      const totalW = (n - 1) * sgap;
      const sx0 = W / 2 - totalW / 2;
      ctx.textAlign = 'center';
      for (let i = 0; i < n; i++) {
        const sx = sx0 + i * sgap;
        await drawSocket(ctx, sx, sy + 108, sr, sockets[i], assets);
        const rn = sockets[i];
        if (rn) {
          ctx.font = '13px Cinzel';
          ctx.fillStyle = C.text;
          ctx.fillText(String(rn.type || '').replace(/_/g, ' ').slice(0, 18), sx, sy + 178);
          ctx.font = '12px Cinzel';
          ctx.fillStyle = TIER_RING[rn.tier] || C.muted;
          ctx.fillText(String(rn.tier || '').toUpperCase(), sx, sy + 196);
        } else {
          ctx.font = '12px Cinzel';
          ctx.fillStyle = C.dim;
          ctx.fillText('EMPTY', sx, sy + 184);
        }
      }

      // ── footer ──
      ctx.textAlign = 'center';
      ctx.font = '15px "IM Fell Italic"';
      ctx.fillStyle = C.muted;
      const hint = payload.skillIdHint
        ? `socket a rune:  .j rune socket <rune> ${payload.skillIdHint}`
        : 'socket a rune:  .j rune socket <rune> <skillId>';
      ctx.fillText(hint, W / 2, H - 40);

      return cv.toBuffer('image/jpeg', { quality: 0.92 });
    });
  } catch (e) {
    console.error('[abilityCards] inspect render failed:', e?.message || e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  CARD 1b — RUNE CODEX  (paginated `.j rune list [page]`)
//  8 rune plates per page (2 cols x 4 rows), tier art, real data.
// ═══════════════════════════════════════════════════════════════
/**
 * payload = {
 *   page, totalPages, totalRunes,
 *   runes: [ { type, name, desc, category, tierArt } ]  // <= 8, real data
 * }
 */
async function renderRuneListCard(payload) {
  try {
    const assets = require('./skillAssets');
    const canvas = getCanvas();
    ensureFonts();
    const rows = Array.isArray(payload.runes) ? payload.runes.slice(0, 8) : [];
    const W = 720;
    const H = 236 + 4 * 178 + 92;
    return await _rq().run('runeCodex', async () => {
      const { createCanvas } = canvas;
      const cv = createCanvas(W, H);
      const ctx = cv.getContext('2d');
      paintBoard(ctx, W, H);

      // header
      ctx.textAlign = 'center';
      ctx.fillStyle = C.goldBright;
      ctx.font = '32px "Cinzel Deco"';
      ctx.fillText('RUNE CODEX', W / 2, 72);
      ctx.font = '15px Cinzel';
      ctx.fillStyle = C.muted;
      ctx.fillText(`PAGE ${payload.page || 1} OF ${payload.totalPages || 1}  ·  ${payload.totalRunes || rows.length} RUNE TYPES`, W / 2, 98);
      divider(ctx, 150, W - 150, 118, 0.4);

      // plates: 2 cols x up to 4 rows
      const cw = 312, ch = 162, gx = 20, gy = 16;
      const x0 = (W - cw * 2 - gx) / 2;
      const y0 = 140;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const col = i % 2, row = Math.floor(i / 2);
        const x = x0 + col * (cw + gx);
        const y = y0 + row * (ch + gy);
        roundRect(ctx, x, y, cw, ch, 10);
        ctx.fillStyle = C.panel; ctx.fill();
        ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
        rivet(ctx, x + 10, y + 10, 3.5);
        rivet(ctx, x + cw - 10, y + 10, 3.5);

        // art medallion (tier art)
        const mr = 44, mcx = x + 58, mcy = y + ch / 2 + 4;
        ctx.beginPath(); ctx.arc(mcx, mcy, mr + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0d0906'; ctx.fill();
        ctx.strokeStyle = C.frameDim; ctx.lineWidth = 2; ctx.stroke();
        let art = null;
        try { art = await assets.getRuneArt(r.type, 'NORMAL'); } catch (e) { art = null; }
        if (art) drawArtInCircle(ctx, art, mcx, mcy, mr);
        else {
          ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, Math.PI * 2);
          ctx.fillStyle = '#1c130a'; ctx.fill();
          ctx.fillStyle = C.goldBright;
          ctx.font = '30px Cinzel';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('◆', mcx, mcy);
          ctx.textBaseline = 'alphabetic';
        }

        // name + category
        ctx.textAlign = 'left';
        const nm = String(r.name || r.type || 'Rune').replace(/ Rune$/, '');
        const fsNm = fitText(ctx, nm, cw - 108, 20, '"Cinzel Deco B"');
        ctx.fillStyle = C.goldBright;
        ctx.fillText(nm, x + 116, y + 32);
        ctx.font = '11px Cinzel';
        ctx.fillStyle = C.muted;
        ctx.fillText(String(r.category || '').toUpperCase(), x + 116, y + 50);

        // desc (real text)
        ctx.font = '13px "IM Fell"';
        ctx.fillStyle = C.text;
        const dLines = wrapText(ctx, r.desc || '', cw - 132).slice(0, 3);
        dLines.forEach((l, li) => ctx.fillText(l, x + 116, y + 74 + li * 17));

        // tier chip
        ctx.font = '11px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillStyle = r.tierArt ? C.good : C.dim;
        ctx.fillText(r.tierArt ? '◆ 4 TIER ARTS' : '◆ SINGLE ART', x + 58, y + ch - 14);
        ctx.textAlign = 'left';
      }

      // footer
      ctx.textAlign = 'center';
      ctx.font = '14px "IM Fell Italic"';
      ctx.fillStyle = C.muted;
      ctx.fillText(`Lesser ◆ Normal ◆ Greater ◆ Abyssal   —   socket: .j rune socket <rune> <skillId>`, W / 2, H - 44);
      const nx = (payload.page || 1) < (payload.totalPages || 1) ? (payload.page || 1) + 1 : null;
      if (nx) {
        ctx.font = '14px Cinzel';
        ctx.fillStyle = C.gold;
        ctx.fillText(`next page:  .j rune list ${nx}`, W / 2, H - 66);
      }

      return cv.toBuffer('image/jpeg', { quality: 0.92 });
    });
  } catch (e) {
    console.error('[abilityCards] rune codex render failed:', e?.message || e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  CARD 2 — RUNE SOCKET BOARD  (720 x dynamic, max 12 rows)
// ═══════════════════════════════════════════════════════════════
/**
 * payload = {
 *   nickname, className, rank,
 *   rows: [ { skill: {id,name,tier,maxLevel,isUltimate,isAscended}, level,
 *             sockets: [ {type,tier,runeId}|null, ... ] } ],   // max 12
 *   totalSocketed, totalSlots, omitted: <int skills not shown>
 * }
 */
async function renderRuneSocketsCard(payload) {
  try {
    const assets = require('./skillAssets');
    const canvas = getCanvas();
    ensureFonts();
    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 12) : [];
    const rowH = 104;
    const H = 250 + rows.length * rowH + 96;
    const W = 720;
    return await _rq().run('runeSocketBoard', async () => {
      const { createCanvas } = canvas;
      const cv = createCanvas(W, H);
      const ctx = cv.getContext('2d');
      paintBoard(ctx, W, H);

      // header
      ctx.textAlign = 'center';
      ctx.fillStyle = C.goldBright;
      ctx.font = '30px "Cinzel Deco"';
      ctx.fillText('RUNE SOCKET BOARD', W / 2, 74);
      ctx.font = '15px Cinzel';
      ctx.fillStyle = C.muted;
      ctx.fillText(`${String(payload.nickname || 'Adventurer').slice(0, 24)}  ·  ${String(payload.className || '').toUpperCase()}${payload.rank ? `  ·  RANK ${String(payload.rank).toUpperCase()}` : ''}`, W / 2, 102);
      ctx.font = '16px Cinzel';
      ctx.fillStyle = (payload.totalSocketed || 0) > 0 ? C.good : C.muted;
      ctx.fillText(`${payload.totalSocketed || 0} RUNES SOCKETED  ·  ${payload.totalSlots || 0} SLOTS ACROSS ${rows.length} SKILL${rows.length === 1 ? '' : 'S'}`, W / 2, 130);

      let y = 178;
      for (const row of rows) {
        const skill = row.skill || {};
        const accent = tierAccent(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate });
        // row plate
        roundRect(ctx, 40, y, W - 80, rowH - 12, 9);
        ctx.fillStyle = C.panel; ctx.fill();
        ctx.strokeStyle = 'rgba(214, 170, 82, 0.22)'; ctx.lineWidth = 1.5; ctx.stroke();

        // skill thumb in framed square
        const th = rowH - 34;
        const tx = 56, ty = y + 11;
        roundRect(ctx, tx - 4, ty - 4, th + 8, th + 8, 7);
        ctx.fillStyle = '#0f0a05'; ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
        let art = null;
        try { art = await assets.getSkillArt(skill, payload.classId); } catch (e) { art = null; }
        if (!drawArtInRect(ctx, art, tx, ty, th, th, 6)) {
          ctx.fillStyle = C.goldBright;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = '20px "Cinzel Deco"';
          ctx.fillText(String(skill.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), tx + th / 2, ty + th / 2);
          ctx.textBaseline = 'alphabetic';
        }

        // name + level
        ctx.textAlign = 'left';
        ctx.font = '19px "Cinzel Deco B"';
        ctx.fillStyle = C.text;
        const nm = String(skill.name || 'Skill');
        const maxNm = 250;
        const fs2 = fitText(ctx, nm, maxNm, 19, '"Cinzel Deco B"');
        ctx.fillText(nm, tx + th + 14, ty + 24);
        ctx.font = '13px Cinzel';
        ctx.fillStyle = C.muted;
        ctx.fillText(`Lv ${row.level || 0}/${skill.maxLevel || 1}  ·  ${tierLabel(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate })}`, tx + th + 14, ty + 44);

        // sockets (right side)
        const sockets = Array.isArray(row.sockets) ? row.sockets : [];
        const n = sockets.length;
        const sr = 24;
        const sgap = sr * 2 + 14;
        const totalW = (n - 1) * sgap;
        const sx0 = W - 66 - totalW;
        for (let i = 0; i < n; i++) {
          await drawSocket(ctx, sx0 + i * sgap, y + rowH / 2 - 6, sr, sockets[i], assets);
        }
        y += rowH;
      }

      // footer
      ctx.textAlign = 'center';
      ctx.font = '15px "IM Fell Italic"';
      ctx.fillStyle = C.muted;
      const extra = payload.omitted > 0 ? `  ·  +${payload.omitted} more skills with sockets` : '';
      ctx.fillText(`inspect a skill:  .j abilities <number | id | name>${extra}`, W / 2, H - 44);

      return cv.toBuffer('image/jpeg', { quality: 0.92 });
    });
  } catch (e) {
    console.error('[abilityCards] socket board render failed:', e?.message || e);
    return null;
  }
}

module.exports = { renderAbilityInspectCard, renderRuneListCard, renderRuneSocketsCard, tierAccent, tierLabel };
