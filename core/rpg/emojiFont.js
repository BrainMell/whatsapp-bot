'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  emojiFont.js — ship a real emoji font with the repo (2026-10-20)
// ═══════════════════════════════════════════════════════════════════════════
//  OWNER BUG: "some emoji emblems show on the various maps as weird number
//  boxes". Root cause: every map renderer drew guild emblem emoji through a
//  Latin font stack (`"Noto Sans", sans-serif`). "Noto Sans" does not exist
//  on the render boxes — fontconfig substitutes DejaVu Sans, which covers a
//  handful of BMP symbols (⚜ ⚔ render!) but has NO astral emoji, so canvas
//  drew the codepoint as a hex NUMBER BOX (👁 → [01F441]). Box2 — the only
//  box with a paired bot right now — has ZERO emoji fonts installed; Box1
//  happened to have one, which is why the bug looked box-dependent.
//
//  FIX, two layers:
//    1. Ship Noto Emoji (monochrome, OFL) in core/rpgasset/fonts and register
//       it per-process here — draw sites become independent of system fonts.
//       .gitattributes carries a -filter exception: `git reset --hard` deploys
//       must NEVER re-stub this file as an LFS pointer (same trap as the
//       runic font, which hexboxed rune tiles the exact same way).
//    2. The same TTF is installed system-wide on both boxes (deploy step), so
//       any canvas draw NOT going through this helper still resolves a real
//       emoji glyph via fontconfig fallback.
//
//  Monochrome was a deliberate pick: node-canvas/FreeType cannot tint CBDT
//  color bitmaps with fillStyle, and the game's heraldry wants single-colour
//  glyphs anyway (cream on shield, gold on parchment).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const FONT_PATH = path.join(__dirname, '..', 'rpgasset', 'fonts', 'NotoEmoji-Regular.ttf');
const FAMILY = 'Noto Emoji';
// Extended_Pictographic covers every emoji base char; VS16 / ZWJ / keycap cap
// are forced into the emoji run so multi-codepoint sequences stay together.
const PICTO_RE = /\p{Extended_Pictographic}/u;
const JOINERS = new Set(['\uFE0F', '\u200D', '\u20E3']);

let _state = 0; // 0 = untried, 1 = registered, -1 = failed
function ensureEmojiFont() {
    if (_state !== 0) return _state === 1;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        const head = fs.readFileSync(FONT_PATH).slice(0, 4);
        const real = head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))   // TTF
            || head.toString('latin1') === 'OTTO'                          // OTF
            || head.toString('latin1') === 'true';
        if (!real) throw new Error('emoji font file missing or LFS-stubbed');
        registerFont(FONT_PATH, { family: FAMILY });
        _state = 1;
    } catch (e) {
        _state = -1;
        try { console.error('[emojiFont] registration failed:', e.message); } catch (_) { /* noop */ }
    }
    return _state === 1;
}

function hasPictographic(s) { return PICTO_RE.test(String(s || '')); }

// Font string for a glyph that MAY be emoji: use the shipped emoji family
// when the string carries pictographs and the font registered; otherwise the
// caller's base stack is returned untouched (ASCII initials etc.).
function emojiFont(str, px, base) {
    const b = base || '"Noto Sans", sans-serif';
    return hasPictographic(str) && ensureEmojiFont()
        ? `${Math.round(px)}px "${FAMILY}"`
        : `${Math.round(px)}px ${b}`;
}

// Draw a possibly-mixed string ("🐉 Pyro") advancing across emoji/text runs,
// each with the right family. Honours ctx.textAlign center/right by
// measuring the whole string first. Returns the total advance width.
// Pure-text strings take the plain fillText path (zero behaviour change).
function fillTextMixed(ctx, str, x, y) {
    const s = String(str == null ? '' : str);
    if (!hasPictographic(s) || !ensureEmojiFont()) {
        ctx.fillText(s, x, y);
        return ctx.measureText(s).width;
    }
    const m = /(\d+(\.\d+)?)px/.exec(ctx.font);
    const px = m ? m[1] : '16';
    const runs = [];
    let cur = '', curP = null;
    for (const ch of s) {
        const p = PICTO_RE.test(ch) || JOINERS.has(ch);
        if (curP === null || p === curP) { cur += ch; curP = p; }
        else { runs.push([cur, curP]); cur = ch; curP = p; }
    }
    if (cur) runs.push([cur, curP]);
    const baseFont = ctx.font;
    const runFont = (p) => (p ? `${px}px "${FAMILY}"` : baseFont);
    let total = 0;
    const widths = runs.map(([t, p]) => {
        ctx.font = runFont(p);
        const w = ctx.measureText(t).width;
        total += w;
        return w;
    });
    let sx = x;
    if (ctx.textAlign === 'center') sx = x - total / 2;
    else if (ctx.textAlign === 'right') sx = x - total;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let cx = sx;
    runs.forEach(([t, p], i) => {
        ctx.font = runFont(p);
        ctx.fillText(t, cx, y);
        cx += widths[i];
    });
    ctx.font = baseFont;
    ctx.textAlign = prevAlign;
    return total;
}

module.exports = { ensureEmojiFont, hasPictographic, emojiFont, fillTextMixed, FAMILY, FONT_PATH };
