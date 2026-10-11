// ============================================
// 💎 ABILITY INSPECTION + RUNE SOCKET CARDS (2026-10-11)
// ============================================
// Owner brief (rune_sockets_ability_inspection_overhaul.md):
//   * `.j abilities <num|id|name>`  -> stylised RPG skill-inspection card:
//     dedicated skill artwork, name + level, evolution/tier, rune sockets
//     (equipped runes render their art, unfilled sockets render empty),
//     stats + effect text. Socket count follows the REAL slot rules
//     (runeSystem.getSkillSlotCount: T1=1, T2=2, T3+=3).
//   * `.j rune sockets`             -> board card listing the player's skills
//     with their sockets (equipped art / empty slots).
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

function drawArtInRect(ctx, img, x, y, w, h) {
  if (!img) return false;
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return false;
  const scale = Math.min(w / iw, h / ih);
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
 * One rune socket: filled (rune art + tier ring) or empty (engraved hole).
 */
async function drawSocket(ctx, cx, cy, r, rune, assets) {
  ctx.save();
  // socket housing
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0906'; ctx.fill();
  ctx.strokeStyle = C.frameDim; ctx.lineWidth = 2; ctx.stroke();

  let art = null;
  if (rune && assets) {
    try { art = await assets.getRuneArt(rune.type); } catch (e) { art = null; }
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
//  CARD 1 — ABILITY INSPECTION  (720 x 1250)
// ═══════════════════════════════════════════════════════════════
/**
 * payload = {
 *   nickname, className, rank,
 *   skill: { id, name, tier, maxLevel, isUltimate, isAscended },
 *   level: <learned level>, effectText: <short line>,
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
    const W = 720, H = 1250;
    return await _rq().run('abilityInspect', async () => {
      const { createCanvas } = canvas;
      const cv = createCanvas(W, H);
      const ctx = cv.getContext('2d');
      paintBoard(ctx, W, H);

      const skill = payload.skill || {};
      const accent = tierAccent(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate });

      // ── header ──
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.muted;
      ctx.font = '16px Cinzel';
      ctx.fillText('A B I L I T Y   I N S P E C T I O N', W / 2, 62);
      ctx.fillStyle = C.gold;
      ctx.font = '15px Cinzel';
      ctx.fillText(`${String(payload.nickname || 'Adventurer').slice(0, 24)}  ·  ${String(payload.className || '').toUpperCase()}${payload.rank ? `  ·  RANK ${String(payload.rank).toUpperCase()}` : ''}`, W / 2, 88);

      // ── art medallion ──
      const mcx = W / 2, mcy = 300, mr = 148;
      // aura glow
      const grad = ctx.createRadialGradient(mcx, mcy, mr * 0.4, mcx, mcy, mr * 1.45);
      grad.addColorStop(0, 'rgba(240, 217, 168, 0.16)');
      grad.addColorStop(1, 'rgba(240, 217, 168, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(mcx - mr * 1.5, mcy - mr * 1.5, mr * 3, mr * 3);
      // housing
      ctx.beginPath(); ctx.arc(mcx, mcy, mr + 8, 0, Math.PI * 2);
      ctx.fillStyle = '#0f0a05'; ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath(); ctx.arc(mcx, mcy, mr - 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

      let art = null;
      try { art = await assets.getSkillArt(skill); } catch (e) { art = null; }
      if (!drawArtInCircle(ctx, art, mcx, mcy, mr - 10)) {
        // fallback: initials medallion (Go SKILLUP family look)
        const initials = String(skill.name || '?')
          .split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
        ctx.fillStyle = C.goldBright;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '84px "Cinzel Deco"';
        ctx.fillText(initials, mcx, mcy - 6);
        ctx.textBaseline = 'alphabetic';
      }

      // ── name + tier ──
      ctx.textAlign = 'center';
      const name = String(skill.name || 'Unknown Skill');
      fitText(ctx, name, 560, 34, '"Cinzel Deco"');
      ctx.fillStyle = C.goldBright;
      ctx.fillText(name, W / 2, 512);

      const tl = tierLabel(skill.tier, { ascended: skill.isAscended, ultimate: skill.isUltimate });
      ctx.font = '17px Cinzel';
      ctx.fillStyle = accent;
      ctx.fillText(tl, W / 2, 542);

      levelPips(ctx, W / 2, 578, payload.level || 0, skill.maxLevel || 1, accent);
      ctx.font = '14px Cinzel';
      ctx.fillStyle = C.muted;
      ctx.fillText(`LEVEL ${payload.level || 0} / ${skill.maxLevel || 1}`, W / 2, 604);

      // ── stats panel ──
      const px = 46, pw = W - 92;
      roundRect(ctx, px, 626, pw, 190, 10);
      ctx.fillStyle = C.panel; ctx.fill();
      ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();

      ctx.textAlign = 'left';
      const statY = 668;
      const rowGap = 40;
      ctx.font = '17px Cinzel';
      ctx.fillStyle = C.gold;
      ctx.fillText('ENERGY', px + 26, statY);
      ctx.fillText('COOLDOWN', px + 26, statY + rowGap);
      ctx.fillText('POWER', px + 26, statY + rowGap * 2);
      ctx.font = '19px "IM Fell"';
      ctx.fillStyle = C.text;
      ctx.fillText(String(payload.energy ?? '—'), px + 190, statY);
      ctx.fillText(payload.cooldown ? `${payload.cooldown} turns` : 'None', px + 190, statY + rowGap);
      ctx.fillText(String(payload.damageLine || '—'), px + 190, statY + rowGap * 2);

      // divider + effect text
      ctx.strokeStyle = 'rgba(214, 170, 82, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 18, statY + rowGap * 2 + 16); ctx.lineTo(px + pw - 18, statY + rowGap * 2 + 16); ctx.stroke();
      ctx.font = '16px "IM Fell"';
      ctx.fillStyle = C.muted;
      const eff = String(payload.effectText || '');
      // wrap to 2 lines
      const wrap = (t, maxw) => {
        const words = t.split(/\s+/); const lines = []; let line = '';
        for (const w of words) {
          const cand = line ? `${line} ${w}` : w;
          if (ctx.measureText(cand).width > maxw && line) { lines.push(line); line = w; }
          else line = cand;
        }
        if (line) lines.push(line);
        return lines;
      };
      const lines = wrap(eff, pw - 52).slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(l, px + 26, statY + rowGap * 2 + 42 + i * 22));

      // ── rune sockets panel ──
      const sockets = Array.isArray(payload.sockets) ? payload.sockets : [];
      const sy = 848;
      roundRect(ctx, px, sy, pw, 240, 10);
      ctx.fillStyle = C.panel; ctx.fill();
      ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '17px Cinzel';
      ctx.fillStyle = C.gold;
      const used = sockets.filter(Boolean).length;
      ctx.fillText('RUNE SOCKETS', px + 26, sy + 38);
      ctx.textAlign = 'right';
      ctx.fillStyle = used > 0 ? C.good : C.muted;
      ctx.fillText(`${used} / ${sockets.length}`, px + pw - 26, sy + 38);

      const n = sockets.length;
      const sr = n <= 2 ? 52 : n === 3 ? 46 : 38;
      const sgap = sr * 2 + 34;
      const totalW = (n - 1) * sgap;
      const sx0 = W / 2 - totalW / 2;
      ctx.textAlign = 'center';
      for (let i = 0; i < n; i++) {
        const sx = sx0 + i * sgap;
        await drawSocket(ctx, sx, sy + 128, sr, sockets[i], assets);
        const rn = sockets[i];
        if (rn) {
          ctx.font = '13px Cinzel';
          ctx.fillStyle = C.text;
          ctx.fillText(String(rn.type || '').replace(/_/g, ' '), sx, sy + 204);
          ctx.font = '12px Cinzel';
          ctx.fillStyle = TIER_RING[rn.tier] || C.muted;
          ctx.fillText(String(rn.tier || '').toUpperCase(), sx, sy + 222);
        } else {
          ctx.font = '12px Cinzel';
          ctx.fillStyle = C.dim;
          ctx.fillText('EMPTY', sx, sy + 210);
        }
      }

      // ── footer ──
      ctx.textAlign = 'center';
      ctx.font = '15px "IM Fell Italic"';
      ctx.fillStyle = C.muted;
      const hint = payload.skillIdHint
        ? `socket a rune:  .j rune socket <rune> ${payload.skillIdHint}`
        : 'socket a rune:  .j rune socket <rune> <skillId>';
      ctx.fillText(hint, W / 2, H - 46);

      return cv.toBuffer('image/jpeg', { quality: 0.92 });
    });
  } catch (e) {
    console.error('[abilityCards] inspect render failed:', e?.message || e);
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
        try { art = await assets.getSkillArt(skill); } catch (e) { art = null; }
        if (!drawArtInRect(ctx, art, tx, ty, th, th)) {
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
        let shown = nm;
        if (ctx.measureText(nm).width > maxNm) {
          while (nm.length > 4 && ctx.measureText(nm + '…').width > maxNm) {
            // shrink via fit below
            break;
          }
          shown = nm;
        }
        const fs2 = fitText(ctx, shown, maxNm, 19, '"Cinzel Deco B"');
        ctx.fillStyle = C.text;
        ctx.fillText(shown, tx + th + 14, ty + 24);
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

module.exports = { renderAbilityInspectCard, renderRuneSocketsCard, tierAccent, tierLabel };
