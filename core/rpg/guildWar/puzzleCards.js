// ============================================
// 🧩 RUINS PUZZLE GAME CARDS — 2026-10-02 owner directive
// The room intro scene shows the player standing before the encounter;
// THIS card is the second image: the actual puzzle game board, rendered
// from the seeded puzzle payload. Royal-Decree parchment language,
// glyphs restricted to the DejaVu-verified whitelist (CARD-SYSTEM §6).
// ============================================

const fs = require('fs');
const path = require('path');

// 🔤 GLYPH FIX (owner 2026-10-06 20:01Z: "glyphs don't render properly on the
// image cards"): the 52-glyph pool is U+16A0–U+16EA (Runic). Neither Cinzel
// nor IM Fell nor ANY font installed on the boxes covers the Runic block, so
// cairo drew its hexbox fallback ("16 CA" in a box — the codepoint, not the
// rune). Noto Sans Runic (OFL, bundled below) is registered here and every
// text run containing runes is drawn with it explicitly — cairo's toy API
// does not reliably cross families mid-string, so runs, not strings.
const RUNIC_RE = /[\u16A0-\u16FF]/;
const RUNIC_FONT = '"Noto Runic", "Cinzel", serif';

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
};

const KINDS = {
    sequence:  { glyph: '✥', accent: '#5B4A6B', label: 'RUNE LOCK' },
    riddle:    { glyph: '✷', accent: '#33526B', label: 'GUARDIAN RIDDLE' },
    cipher:    { glyph: '⨀', accent: '#A67C2E', label: 'SHIFTED CIPHER' },
    memory:    { glyph: '✦', accent: '#A67C2E', label: 'MEMORY MOSAIC' },
    levers:    { glyph: '✚', accent: '#4A6741', label: 'LEVER MECHANISM' },
    mapriddle: { glyph: '⚑', accent: '#4A6741', label: 'CARVED VERSE' },
};

const W = 1000, H = 640;

let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API');
        const F = path.join(__dirname, '..', '..', 'rpgasset', 'fonts');
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || head.toString('latin1') === 'OTTO' || head.toString('latin1') === 'true';
            } catch (e) { return false; }
        };
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
            ['NotoSansRunic-Regular.ttf', { family: 'Noto Runic' }],
        ];
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (isRealFont(p)) { try { registerFont(p, opts); } catch (e) {} }
        }
        _fontsReady = true;
        return true;
    } catch (e) { return false; }
}

function _wrap(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
        else line = test;
    }
    if (line) lines.push(line);
    // 💡 polish (owner §22 visual QA): a lone trailing punctuation fragment
    // (a closing quote orphaned by the wrap) must never sit on its own line —
    // pull the previous line's last word down with it.
    if (lines.length >= 2) {
        const last = lines[lines.length - 1];
        if (last.replace(/[^\p{L}\p{N}]/gu, '').length <= 2) {
            const prevWords = lines[lines.length - 2].split(' ');
            if (prevWords.length > 1) {
                const carried = prevWords.pop();
                lines[lines.length - 2] = prevWords.join(' ');
                lines[lines.length - 1] = `${carried} ${last}`;
            }
        }
    }
    return lines;
}

// split a string into {runic, text} runs so each can be measured/drawn with
// the font that actually covers it (see GLYPH FIX note at the top)
function splitRuns(text) {
    const out = [];
    for (const ch of String(text || '')) {
        const runic = RUNIC_RE.test(ch);
        const last = out[out.length - 1];
        if (last && last.runic === runic) last.text += ch;
        else out.push({ runic, text: ch });
    }
    return out;
}

function fontFor(runic, size) { return `${size}px ` + (runic ? RUNIC_FONT : '"IM Fell", serif'); }

// width of a mixed-script string under the per-run fonts
function measureMixed(ctx, text) {
    let w = 0;
    for (const run of splitRuns(text)) {
        ctx.font = fontFor(run.runic, 30);
        w += ctx.measureText(run.text).width;
    }
    return w;
}

// draw a mixed-script string at baseline y starting at x; returns end x
function drawMixed(ctx, text, x, y) {
    for (const run of splitRuns(text)) {
        ctx.font = fontFor(run.runic, 30);
        ctx.fillText(run.text, x, y);
        x += ctx.measureText(run.text).width;
    }
    return x;
}

// parse "*tokens*" out of the prompt for tile rendering
function splitEmphasis(text) {
    const parts = [];
    const re = /\*([^*]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
        if (m.index > last) parts.push({ tile: false, text: text.slice(last, m.index) });
        parts.push({ tile: true, text: m[1] });
        last = re.lastIndex;
    }
    if (last < text.length) parts.push({ tile: false, text: text.slice(last) });
    return parts.map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ').trim() })).filter((p) => p.text);
}

// renderPuzzleCard({ kind, prompt, attemptsUsed, attemptsMax, world, ring })
//   → PNG buffer (null on failure; callers fall back to text)
async function renderPuzzleCard(opts = {}) {
    try {
        if (!_ensureFonts()) return null;
        const canvas = require('canvas');
        const createCanvas = canvas.createCanvas || canvas;
        const canvasMod = require('canvas');
        const cv = (canvasMod.createCanvas || createCanvas)(W, H);
        const ctx = cv.getContext('2d');

        const kind = KINDS[opts.kind] || { glyph: '✥', accent: '#5B4A6B', label: 'PUZZLE' };

        // parchment base
        ctx.fillStyle = PAL.parchment;
        ctx.fillRect(0, 0, W, H);
        // deep blotches
        ctx.fillStyle = 'rgba(166,124,46,0.06)';
        for (const [bx, by, br] of [[140, 120, 90], [860, 170, 120], [220, 520, 130], [780, 470, 80]]) {
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
        // frame
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 5;
        ctx.strokeRect(18, 18, W - 36, H - 36);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(30, 30, W - 60, H - 60);

        // seal
        ctx.fillStyle = kind.accent;
        ctx.beginPath(); ctx.arc(W / 2, 120, 58, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(W / 2, 120, 48, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = PAL.parchment;
        ctx.font = '48px "Cinzel", serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(kind.glyph, W / 2, 124);

        // kicker + title
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '20px "IM Fell", serif';
        ctx.fillText('THE RUINS OF THE DEAD WORLD', W / 2, 46);
        ctx.fillStyle = PAL.ink;
        ctx.font = '44px "Cinzel Deco", "Cinzel", serif';
        ctx.fillText(kind.label, W / 2, 214);

        // body: split emphasis into plain lines + tile rows
        const parts = splitEmphasis(opts.prompt || '');
        // 📋 UX pass #5: the body starts a touch higher and packs tighter
        // (36px prose leading, 64px tiles) so long prompts still leave the
        // bottom band free for the rule card.
        let y = 252;
        const maxW = W - 180;
        for (const part of parts) {
            if (part.tile) {
                // tile row: big tokens (glyphs / letters / pairs like A=5)
                const tokens = part.text.split(/\s+/).filter(Boolean).slice(0, 8);
                const tileW = 84, tileH = 64;
                const gap = 16;
                const totalW = tokens.length * tileW + (tokens.length - 1) * gap;
                let tx = (W - totalW) / 2;
                for (const t of tokens) {
                    ctx.fillStyle = PAL.parchmentDeep;
                    ctx.strokeStyle = kind.accent;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(tx, y, tileW, tileH, 10);
                    else ctx.rect(tx, y, tileW, tileH);
                    ctx.fill(); ctx.stroke();
                    ctx.fillStyle = PAL.ink;
                    const label = t.length > 4 ? t.slice(0, 4) : t;
                    // GLYPH FIX: rune tiles get the runic font (Cinzel has no
                    // U+16A0 block — hexboxes on the boxes); sizes unchanged
                    if (RUNIC_RE.test(label)) ctx.font = (label.length > 2 ? '26px' : '34px') + ' ' + RUNIC_FONT;
                    else ctx.font = (label.length > 2 ? '26px' : '34px') + ' "Cinzel", serif';
                    ctx.fillText(label, tx + tileW / 2, y + tileH / 2 + 2);
                    tx += tileW + gap;
                }
                y += tileH + 16;
            } else {
                // GLYPH FIX: prompts can embed runes OUTSIDE the emphasis
                // tiles too (the "(e.g. `ᛏ ᚨ`)" example). One fillText with
                // IM Fell hexboxes them — so wrap and paint per-RUN, with the
                // runic font carrying exactly the rune characters.
                ctx.fillStyle = PAL.ink;
                ctx.textAlign = 'left';
                const words = String(part.text || '').split(/\s+/).filter(Boolean);
                const lines = [];
                let line = '';
                for (const w of words) {
                    const test = line ? line + ' ' + w : w;
                    if (measureMixed(ctx, test) > maxW && line) { lines.push(line); line = w; }
                    else line = test;
                }
                if (line) lines.push(line);
                for (const lineText of lines) { drawMixed(ctx, lineText, 90, y + 12); y += 36; }
                ctx.textAlign = 'center';
                y += 6;
            }
            if (y > H - 128) break;
        }

        // 📋 UX pass #5 (owner brief 2026-10-07): the per-puzzle RULE CARD
        // rides the board — the answer format is printed on the parchment so
        // "how do I answer this?" never needs a guess. Fit-aware: it sits
        // below the body (or in the reserved bottom band) and drops lines
        // that would collide with the footer; the `examine` DM text always
        // carries the full rule regardless.
        if (opts.rules) {
            ctx.font = 'italic 19px "IM Fell", serif';
            // canvas fonts have no emoji glyph — the 📜 becomes a tofu dot;
            // strip it here (the DM text keeps it)
            const ruleLines = _wrap(ctx, String(opts.rules).replace(/[*`_]/g, '').replace('📜', '').trim(), W - 160);
            let ry = Math.max(y + 10, H - 118);
            const fits = ruleLines.filter((_, i) => ry + i * 24 <= H - 72).length;
            ctx.fillStyle = PAL.inkSoft;
            for (const line of ruleLines.slice(0, Math.min(2, fits))) {
                ctx.fillText(line, W / 2, ry);
                ry += 24;
            }
        }

        // footer
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '24px "IM Fell", serif';
        const left = (opts.attemptsMax || 3) - (opts.attemptsUsed || 0);
        ctx.fillText(`Reply in DM - ${left} attempt${left === 1 ? '' : 's'} left - wrong answers have a cost`, W / 2, H - 66);
        ctx.font = '18px "Cinzel", serif';
        ctx.fillStyle = PAL.frame;
        ctx.fillText(`${String(opts.world || 'the ruins').toUpperCase()} - RING ${opts.ring || 1}`, W / 2, H - 38);

        return cv.toBuffer('image/png');
    } catch (e) {
        return null;
    }
}

module.exports = { renderPuzzleCard, KINDS };
