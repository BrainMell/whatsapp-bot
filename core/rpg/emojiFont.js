'use strict';
// ===========================================================================
// emojiFont.js - emoji-aware canvas text helpers (color, not hexcode)
// ===========================================================================
// OWNER BUG 1 (10:47Z): "some emoji emblems show on the various
// maps as weird number boxes" - map renderers drew emblem emoji through a
// "Noto Sans" stack that doesn't exist on the boxes; fontconfig substituted
// DejaVu (covers but no astral emoji) and canvas painted raw codepoints
// as HEX NUMBER BOXES ( → [01F441]).
// OWNER BUG 2 (11:31Z, this file): "Use colors not hex code cus
// who tf knows hex codes dude?" - the first fix shipped monochrome Noto
// Emoji. Owner wants the familiar COLORED emoji. On-box probes the same
// day proved canvas 3.2.3 can never draw colored emoji from fonts: emoji
// glyph resolution bypasses registerFont entirely, and CBDT color bitmaps
// come out as alpha-mask silhouettes tinted by fillStyle (red fill → solid
// red silhouette, zero native hues).
// So emoji runs are now painted as COLOR BITMAPS: core/rpg/emojiBitmap.js
// and we ctx.drawImage them at text metrics (baseline-true placement, same
// 1.245em advance the mono font had). fillStyle is intentionally ignored
// for emoji runs - that IS the feature. The monochrome font remains the
// fallback (color font missing/corrupt), and the system-wide install
// (deploy step) still covers canvas draws that don't go through here.
// ===========================================================================
const fs = require('fs');
const path = require('path');
const eb = require('./emojiBitmap');

const FONT_PATH = path.join(__dirname, '..', 'rpgasset', 'fonts', 'NotoEmoji-Regular.ttf');
const COLOR_FONT_PATH = path.join(__dirname, '..', 'rpgasset', 'fonts', 'NotoColorEmoji.ttf');
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

let _colorState = 0; // 0 = untried, 1 = parsed, -1 = failed
function colorEmojiReady() {
    if (_colorState !== 0) return _colorState === 1;
    _colorState = eb.ready(COLOR_FONT_PATH) ? 1 : -1;
    return _colorState === 1;
}

function imageCtor() {
    try { return require('canvas').Image || null; } catch (_) { return null; }
}

function hasPictographic(s) { return PICTO_RE.test(String(s || '')); }

// Font string for a glyph that MAY be emoji: use the shipped emoji family
// when the string carries pictographs and the font registered; otherwise the
// caller's base stack is returned untouched (ASCII initials etc.).
// NOTE: with the color bitmap pipeline active this only steers the mono
// FALLBACK path (and pure-text measure); bitmap draws set their own metrics.
function emojiFont(str, px, base) {
    const b = base || '"Noto Sans", sans-serif';
    return hasPictographic(str) && ensureEmojiFont()
        ? `${Math.round(px)}px "${FAMILY}"`
        : `${Math.round(px)}px ${b}`;
}

// Draw a possibly-mixed string (" Pyro") advancing across emoji/text runs,
// each with the right rendering path: emoji runs paint as color bitmaps via
// emojiBitmap (fallback: shipped mono family), text runs keep ctx.font.
// Honours ctx.textAlign center/right by measuring the whole string first,
// and ctx.textBaseline for bitmap placement. Returns the total advance width.
// Pure-text strings take the plain fillText path (zero behaviour change).
function fillTextMixed(ctx, str, x, y) {
    const s = String(str == null ? '' : str);
    if (!hasPictographic(s)) {
        ctx.fillText(s, x, y);
        return ctx.measureText(s).width;
    }
    const m = /(\d+(\.\d+)?)px/.exec(ctx.font);
    const px = m ? parseFloat(m[1]) : 16;
    const color = colorEmojiReady();
    const img = color ? imageCtor() : null;
    const runs = color ? eb.splitRuns(s) : monoRuns(s);
    const baseFont = ctx.font;

    const widths = runs.map(([t, e]) => {
        if (e && color) return eb.measure(t, px);
        ctx.font = e ? `${Math.round(px)}px "${FAMILY}"` : baseFont;
        return ctx.measureText(t).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);

    let sx = x;
    if (ctx.textAlign === 'center') sx = x - total / 2;
    else if (ctx.textAlign === 'right') sx = x - total;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let cx = sx;
    runs.forEach(([t, e], i) => {
        if (e && color && img) {
            cx += eb.draw(ctx, t, cx, y, px, img);
        } else {
            ctx.font = e ? `${Math.round(px)}px "${FAMILY}"` : baseFont;
            ctx.fillText(t, cx, y);
            cx += widths[i];
        }
    });
    ctx.font = baseFont;
    ctx.textAlign = prevAlign;
    return total;
}

// Fallback run split (mono path - same semantics as the 51b3a8e version).
function monoRuns(s) {
    const runs = [];
    let cur = '', curP = null;
    for (const ch of s) {
        const p = PICTO_RE.test(ch) || JOINERS.has(ch);
        if (curP === null || p === curP) { cur += ch; curP = p; }
        else { runs.push([cur, curP]); cur = ch; curP = p; }
    }
    if (cur) runs.push([cur, curP]);
    return runs;
}

module.exports = {
    ensureEmojiFont, colorEmojiReady, hasPictographic, emojiFont, fillTextMixed,
    FAMILY, FONT_PATH, COLOR_FONT_PATH
};
