// ═══════════════════════════════════════════════════════════════════════════
//  SOUL READER RENDERER — the Fortune Teller's cards (`.j kills`)
// ═══════════════════════════════════════════════════════════════════════════
//  Implements the owner-designed Fortune Teller cards from the lore update
//  (rpg_worldbuilding_design_pass/image_cards/fortune_teller/):
//    · LOCKED   → "THE VEILWARD READING"  — THE SIGHT requirement checklist
//    · UNLOCKED → "SOULS BEYOND THE VEIL" — THE LEDGER OF WHAT YOU SENT
//
//  The design package's art slot carried no art ("art slots point at the
//  research"), so the live card fills that space with the READING itself:
//  the teller's line, set as an italic quote under a drawn veil-and-stars
//  ornament. No external assets, same in-repo node-canvas renderer family
//  as worldMapRenderer.js / summonRosterRenderer.js.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const W = 950;
const H = 1500;

// ─── PALETTE (matched to the designed cards) ────────────────────────────────
const PAL = {
    bg: '#221812',            // deep brown-black
    bgWarm: '#2C2018',
    gold: '#C9A24B',
    goldBright: '#E8C877',
    goldDim: 'rgba(201,162,75,0.55)',
    goldFaint: 'rgba(201,162,75,0.22)',
    cream: '#EFE3C3',
    creamSoft: 'rgba(239,227,195,0.72)',
    panel: '#EFE3C3',         // ledger/sight panel
    panelInk: '#2E2318',
    panelInkSoft: '#5A4634',
    panelLine: 'rgba(46,35,24,0.35)',
    red: '#A93226',
    dark: '#1C130D',
};

// ─── FONTS (lazy; bot-owned only) ───────────────────────────────────────────
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        const F = '/home/z/my-project/whatsapp-bot/core/rpgasset/fonts/';
        registerFont(F + 'CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' });
        registerFont(F + 'CinzelDecorative-Bold.ttf', { family: 'Cinzel Deco B' });
        registerFont(F + 'Cinzel-Variable.ttf', { family: 'Cinzel' });
        registerFont(F + 'IMFellEnglish-Regular.ttf', { family: 'IM Fell' });
        registerFont(F + 'IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' });
        _fontsReady = true;
        return true;
    } catch (e) {
        try { console.error('[soulReaderRenderer] font registration failed:', e.message); } catch (_) {}
        return false;
    }
}

// ─── LOW-LEVEL HELPERS ──────────────────────────────────────────────────────

function _bg(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, PAL.bgWarm);
    grad.addColorStop(0.5, PAL.bg);
    grad.addColorStop(1, '#1A110C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // faint vignette frame
    ctx.strokeStyle = PAL.goldFaint;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.strokeStyle = PAL.goldDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, W - 52, H - 52);
}

/** Pointed-edge gold banner plate (the designed header). */
function _banner(ctx, y, h, text) {
    const notch = 26;
    const x0 = 60, x1 = W - 60;
    ctx.beginPath();
    ctx.moveTo(x0 + notch, y);
    ctx.lineTo(x1 - notch, y);
    ctx.lineTo(x1, y + h / 2);
    ctx.lineTo(x1 - notch, y + h);
    ctx.lineTo(x0 + notch, y + h);
    ctx.lineTo(x0, y + h / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#4A3620');
    grad.addColorStop(0.5, '#38281A');
    grad.addColorStop(1, '#2E2015');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = PAL.goldDim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // inner hairline
    ctx.strokeStyle = PAL.goldFaint;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 14, y + 8, (x1 - x0) - 28, h - 16);

    // letter-spaced gold serif title
    ctx.fillStyle = PAL.goldBright;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    _spacedText(ctx, text.toUpperCase(), W / 2, y + h / 2 + 1, '40px "Cinzel Deco"', 6);
    ctx.textBaseline = 'alphabetic';
}

/** Dark rounded sub-banner pill with gold border + spaced small caps. */
function _subBanner(ctx, y, text) {
    const h = 56;
    const w = 560;
    const x = (W - w) / 2;
    _roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = PAL.dark;
    ctx.fill();
    ctx.strokeStyle = PAL.goldDim;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = PAL.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    _spacedText(ctx, text.toUpperCase(), W / 2, y + h / 2, '20px "Cinzel"', 5);
    ctx.textBaseline = 'alphabetic';
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Draw text with manual letter-spacing (canvas has no letterSpacing API). */
function _spacedText(ctx, text, cx, y, font, gap) {
    ctx.font = font;
    let total = 0;
    const widths = [];
    for (const ch of text) {
        const w = ctx.measureText(ch).width;
        widths.push(w);
        total += w + gap;
    }
    total -= gap;
    let x = cx - total / 2;
    let i = 0;
    for (const ch of text) {
        ctx.fillText(ch, x + widths[i] / 2, y);
        x += widths[i] + gap;
        i++;
    }
}

function _wordWrap(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// ─── THE READING PANEL (fills the design's art slot with the teller's line) ──

function _veilOrnament(ctx, cy) {
    // thin gold crescent + scattered stars, drawn (no assets)
    ctx.save();
    ctx.strokeStyle = PAL.goldDim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(W / 2, cy, 74, Math.PI * 0.28, Math.PI * 1.72);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, cy, 88, Math.PI * 0.36, Math.PI * 1.64);
    ctx.stroke();
    // stars
    const stars = [[W / 2 - 150, cy - 40, 2.2], [W / 2 + 145, cy - 55, 1.8], [W / 2 + 170, cy + 25, 1.4], [W / 2 - 175, cy + 30, 1.6], [W / 2, cy - 120, 1.7]];
    ctx.fillStyle = PAL.gold;
    for (const [x, y, r] of stars) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function _readingPanel(ctx, y, h, line) {
    // dark panel
    const x = 60, w = W - 120;
    _roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.strokeStyle = PAL.goldFaint;
    ctx.lineWidth = 1;
    ctx.stroke();

    _veilOrnament(ctx, y + h * 0.30);

    // the reading itself — italic cream, centered block
    ctx.font = 'italic 27px "IM Fell Italic"';
    const lines = _wordWrap(ctx, line, w - 130);
    const lh = 40;
    let ty = y + h / 2 - ((lines.length - 1) * lh) / 2 + 70;
    ctx.fillStyle = PAL.cream;
    ctx.textAlign = 'center';
    for (const l of lines) {
        ctx.fillText(l, W / 2, ty);
        ty += lh;
    }
    // kicker under the quote
    _spacedText(ctx, 'TODAY’S READING', W / 2, y + h - 34, '15px "Cinzel"', 4);
}

// ─── LOCKED CARD — THE VEILWARD READING ─────────────────────────────────────

/**
 * Render the locked Fortune Teller card (THE SIGHT checklist).
 * @param {object} s { level, levelOk, bestFloor, floorOk, feePaid, feeAmount, feeOk }
 * @returns {Promise<Buffer|null>}
 */
async function renderLockedCard(s) {
    if (!_ensureFonts()) return null;
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    _bg(ctx);
    _banner(ctx, 44, 110, 'The Veilward Reading');
    _subBanner(ctx, 178, 'The Soul Reader');
    _readingPanel(ctx, 262, 420,
        'The veil parts for no one’s schedule, dear. Meet the sight’s three doors, and the count is yours.');

    // ── THE SIGHT panel ──
    const px = 60, pw = W - 120, py = 712, ph = 560;
    _roundRect(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = PAL.panel;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.panelInk;
    _spacedText(ctx, 'THE SIGHT', W / 2, py + 52, '24px "Cinzel"', 6);
    ctx.strokeStyle = PAL.panelLine;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 36, py + 74);
    ctx.lineTo(px + pw - 36, py + 74);
    ctx.stroke();

    const rows = [
        [`REACH LEVEL 40`, s.levelOk, `your level: ${s.level}`],
        [`FACE THE DEEP FLOORS`, s.floorOk, `deepest descent: ${s.bestFloor ? 'floor ' + s.bestFloor : 'none yet'}  (need floor 31)`],
        [`PAY THE READER'S FEE`, s.feeOk, s.feePaid ? 'the debt of three coins is settled' : `three coins - ${s.feeAmount.toLocaleString()} Zeni  ( \`${'kills pay'}\` )`],
    ];
    let ry = py + 130;
    for (const [label, ok, sub] of rows) {
        // circle marker: filled gold when met, hollow when not
        ctx.beginPath();
        ctx.arc(px + 62, ry - 8, 11, 0, Math.PI * 2);
        if (ok) { ctx.fillStyle = PAL.gold; ctx.fill(); }
        else { ctx.strokeStyle = PAL.panelInkSoft; ctx.lineWidth = 2; ctx.stroke(); }
        if (ok) {
            ctx.strokeStyle = PAL.panel;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 56, ry - 8);
            ctx.lineTo(px + 60.5, ry - 3);
            ctx.lineTo(px + 69, ry - 14);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = ok ? PAL.panelInk : PAL.panelInkSoft;
        ctx.font = '26px "Cinzel"';
        ctx.fillText(label, px + 96, ry);
        ctx.font = 'italic 19px "IM Fell Italic"';
        ctx.fillStyle = PAL.panelInkSoft;
        ctx.fillText(sub, px + 96, ry + 30);
        ry += 96;
    }

    // usage hint (how to pay) — small, subtle
    ctx.font = 'italic 18px "IM Fell Italic"';
    ctx.fillStyle = PAL.panelInkSoft;
    ctx.textAlign = 'center';
    ctx.fillText('bring the three coins to the reader and the veil opens', W / 2, py + ph - 96);

    // LOCKED pill
    const pillY = py + ph - 66;
    _roundRect(ctx, px + 24, pillY, pw - 48, 46, 23);
    ctx.fillStyle = PAL.dark;
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    _spacedText(ctx, 'LOCKED — REQUIREMENTS UNMET', W / 2, pillY + 24, '18px "Cinzel"', 3);
    ctx.textBaseline = 'alphabetic';

    _sealX(ctx, 86, H - 86);
    return c.toBuffer('image/png');
}

// ─── UNLOCKED CARD — SOULS BEYOND THE VEIL ──────────────────────────────────

/**
 * Render the unlocked ledger card (THE LEDGER OF WHAT YOU SENT).
 * @param {object} s { rows:[{label,value}], accent:{label,value}, tellerLine }
 * @returns {Promise<Buffer|null>}
 */
async function renderLedgerCard(s) {
    if (!_ensureFonts()) return null;
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    _bg(ctx);
    _banner(ctx, 44, 110, 'Souls Beyond the Veil');
    _subBanner(ctx, 178, 'Reader · The Count');
    _readingPanel(ctx, 262, 400, s.tellerLine);

    // ── LEDGER panel ──
    const px = 60, pw = W - 120, py = 692, ph = 660;
    _roundRect(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = PAL.panel;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.panelInk;
    _spacedText(ctx, 'THE LEDGER OF WHAT YOU SENT', W / 2, py + 52, '24px "Cinzel"', 5);
    ctx.strokeStyle = PAL.panelLine;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 36, py + 74);
    ctx.lineTo(px + pw - 36, py + 74);
    ctx.stroke();

    const max = Math.max(1, ...s.rows.map((r) => r.value));
    const barX = px + 330;
    const barW = pw - 330 - 170;
    let ry = py + 128;
    const rowH = 78;
    for (const row of s.rows) {
        ctx.textAlign = 'left';
        ctx.font = '24px "Cinzel"';
        ctx.fillStyle = PAL.panelInk;
        ctx.fillText(row.label, px + 40, ry + 8);
        // track + fill
        _roundRect(ctx, barX, ry - 12, barW, 20, 10);
        ctx.fillStyle = 'rgba(46,35,24,0.16)';
        ctx.fill();
        const fill = Math.max(row.value > 0 ? 26 : 0, (row.value / max) * barW);
        if (fill > 0) {
            _roundRect(ctx, barX, ry - 12, fill, 20, 10);
            ctx.fillStyle = PAL.gold;
            ctx.fill();
        }
        ctx.textAlign = 'right';
        ctx.font = '26px "Cinzel Deco B"';
        ctx.fillStyle = PAL.panelInk;
        ctx.fillText(row.value.toLocaleString(), px + pw - 44, ry + 9);
        ry += rowH;
    }

    // red accent row (deepest descent)
    ctx.beginPath();
    ctx.moveTo(px + 36, ry - 2);
    ctx.lineTo(px + pw - 36, ry - 2);
    ctx.strokeStyle = PAL.panelLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '23px "Cinzel"';
    ctx.fillStyle = PAL.panelInkSoft;
    ctx.fillText(s.accent.label, px + 40, ry + 40);
    ctx.textAlign = 'right';
    ctx.font = '27px "Cinzel Deco B"';
    ctx.fillStyle = PAL.red;
    ctx.fillText(s.accent.value, px + pw - 44, ry + 41);

    // pill
    const pillY = py + ph - 66;
    _roundRect(ctx, px + 24, pillY, pw - 48, 46, 23);
    ctx.fillStyle = PAL.dark;
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    _spacedText(ctx, 'COUNT CURRENT AS OF TODAY', W / 2, pillY + 24, '18px "Cinzel"', 3);
    ctx.textBaseline = 'alphabetic';

    _sealX(ctx, 86, H - 86);
    return c.toBuffer('image/png');
}

/** Red circular seal with an X (the designed signature). */
function _sealX(ctx, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = PAL.red; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239,227,195,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.font = '24px "Cinzel Deco B"';
    ctx.fillStyle = PAL.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', x, y + 1);
    ctx.textBaseline = 'alphabetic';
}

module.exports = { renderLockedCard, renderLedgerCard, PAL, W, H };
