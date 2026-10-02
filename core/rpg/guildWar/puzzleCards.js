// ============================================
// 🧩 RUINS PUZZLE GAME CARDS — 2026-10-02 owner directive
// The room intro scene shows the player standing before the encounter;
// THIS card is the second image: the actual puzzle game board, rendered
// from the seeded puzzle payload. Royal-Decree parchment language,
// glyphs restricted to the DejaVu-verified whitelist (CARD-SYSTEM §6).
// ============================================

const fs = require('fs');
const path = require('path');

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
    return lines;
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
        let y = 264;
        const maxW = W - 180;
        for (const part of parts) {
            if (part.tile) {
                // tile row: big tokens (glyphs / letters / pairs like A=5)
                const tokens = part.text.split(/\s+/).filter(Boolean).slice(0, 8);
                const tileW = 84, tileH = 72;
                const gap = 12;
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
                    ctx.font = (label.length > 2 ? '28px' : '38px') + ' "Cinzel", serif';
                    ctx.fillText(label, tx + tileW / 2, y + tileH / 2 + 2);
                    tx += tileW + gap;
                }
                y += tileH + 20;
            } else {
                ctx.fillStyle = PAL.ink;
                ctx.font = '30px "IM Fell", serif';
                ctx.textAlign = 'left';
                const lines = _wrap(ctx, part.text, maxW);
                for (const line of lines) { ctx.fillText(line, 90, y + 12); y += 40; }
                ctx.textAlign = 'center';
                y += 8;
            }
            if (y > H - 128) break;
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
