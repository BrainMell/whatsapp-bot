// ============================================
// ⚔️ RUINS ENCOUNTER CARDS — Guild War Overhaul 2026-10-03
// One decree-style card per ruins encounter type (and per battle variant),
// cloned from the Royal Decree kit (noticeCard/worldMapRenderer pattern).
// DejaVu-verified glyph whitelist ONLY (CARD-SYSTEM §6 — emoji have zero
// coverage in the box fonts): ⚔ ✥ ⚑ ◈ ☠ ✺ ✚ ✦ ✷ ▲ ⨀
// Text fallbacks stay in the callers — a failed render must never block play.
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
};

// per-type accent + glyph (all glyphs inside the verified whitelist)
const TYPES = {
    combat:    { glyph: '⚔', accent: '#8B1A2B', label: 'GUARDED CHAMBER' },
    puzzle:    { glyph: '✥', accent: '#5B4A6B', label: 'SEALED MECHANISM' },
    discovery: { glyph: '✚', accent: '#4A6741', label: 'BURIED CACHE' },
    reward:    { glyph: '◈', accent: '#A67C2E', label: 'OLD-WORLD VAULT' },
    hazard:    { glyph: '☠', accent: '#5A4634', label: 'TRAPPED PASSAGE' },
    lore:      { glyph: '✷', accent: '#33526B', label: 'INSCRIBED HALL' },
    secret:    { glyph: '✦', accent: '#A67C2E', label: 'HIDDEN CHAMBER' },
    anomaly:   { glyph: '▲', accent: '#33526B', label: 'WORLD-THIN HALL' },
    landmark:  { glyph: '⚑', accent: '#4A6741', label: 'LANDMARK' },
    coop:      { glyph: '✺', accent: '#33526B', label: 'GUARDIAN PACK' },
    core:      { glyph: '⨀', accent: '#8B1A2B', label: 'THE WORLD CORE' },
};

const W = 1000, H = 560;

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

// renderRoomCard({ type, variant, title, body, actionHint, world, ring, boss, danger })
//   → PNG buffer (never throws into the caller on font/render trouble: returns null)
async function renderRoomCard(opts = {}) {
    try {
        _ensureFonts();
        const canvas = require('canvas');
        const spec = TYPES[opts.type] || { glyph: '◈', accent: '#A67C2E', label: 'CHAMBER' };
        const variant = opts.variant && (opts.variant.name || opts.variant.label) ? opts.variant : null;

        const c = canvas.createCanvas(W, H);
        const ctx = c.getContext('2d');

        // parchment + blotches
        ctx.fillStyle = PAL.parchment;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = PAL.parchmentDeep;
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse(100 + i * 210, 100 + (i % 3) * 180, 110, 70, i, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // double frame + corner marks
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(30, 30, W - 60, H - 60);
        ctx.lineWidth = 1;
        ctx.strokeRect(42, 42, W - 84, H - 84);
        ctx.lineWidth = 2;
        const t = 18;
        [[42, 42, 1, 1], [W - 42, 42, -1, 1], [42, H - 42, 1, -1], [W - 42, H - 42, -1, -1]].forEach(([x, y, sx, sy]) => {
            ctx.beginPath();
            ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t);
            ctx.stroke();
        });

        // kicker
        ctx.textAlign = 'center';
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '15px "Cinzel"';
        ctx.fillText('THE RUINS OF THE DEAD WORLD', W / 2, 88);

        // accent seal with glyph
        ctx.fillStyle = spec.accent;
        ctx.beginPath();
        ctx.arc(W / 2, 175, 52, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = PAL.parchment;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, 175, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = PAL.parchment;
        ctx.font = '52px "Cinzel"';
        ctx.fillText(spec.glyph, W / 2, 195);

        // title (type label, or explicit override e.g. landmark names)
        const title = String(opts.title || spec.label).toUpperCase();
        ctx.fillStyle = PAL.ink;
        ctx.font = '30px "Cinzel Deco"';
        if ('letterSpacing' in ctx) {
            ctx.letterSpacing = '2px';
            ctx.fillText(title, W / 2, 275);
            ctx.letterSpacing = '0px';
        } else {
            ctx.fillText(title.split('').join('\u2009'), W / 2, 275);
        }

        // variant subtitle strip (battle adjustments) — wax red for dangerous ones
        if (variant) {
            const sub = `${variant.name} · ${variant.note}`;
            ctx.font = '17px "IM Fell Italic"';
            const wSub = Math.min(ctx.measureText(sub).width + 44, W - 200);
            ctx.fillStyle = variant.danger ? PAL.wax : PAL.inkSoft;
            ctx.fillRect(W / 2 - wSub / 2, 296, wSub, 30);
            ctx.fillStyle = PAL.parchment;
            ctx.fillText(sub, W / 2, 317);
        }

        // body (wrapped IM Fell, max 4 lines)
        ctx.textAlign = 'left';
        ctx.font = '21px "IM Fell"';
        ctx.fillStyle = PAL.ink;
        const lines = _wrap(ctx, opts.body || '', W - 220).slice(0, 4);
        let ty = variant ? 386 : 360;
        for (const line of lines) { ctx.fillText(line, 110, ty); ty += 32; }

        // action hint footer (what to type)
        if (opts.actionHint) {
            ctx.textAlign = 'center';
            ctx.font = '19px "IM Fell"';
            ctx.fillStyle = PAL.inkSoft;
            const hint = _wrap(ctx, opts.actionHint, W - 240).slice(0, 2);
            let hy = variant ? 486 : 470;
            for (const line of hint) { ctx.fillText(line, W / 2, hy); hy += 26; }
        }

        // room meta footer
        ctx.textAlign = 'center';
        ctx.font = '14px "Cinzel"';
        ctx.fillStyle = PAL.inkSoft;
        const meta = [
            opts.world ? String(opts.world).toUpperCase() : null,
            opts.boss ? 'GUARDIAN WITHIN' : null,
            opts.ring != null ? `RING ${opts.ring}` : null,
        ].filter(Boolean).join('   ·   ');
        if (meta) ctx.fillText(meta, W / 2, H - 52);

        return c.toBuffer('image/png');
    } catch (e) {
        console.error('[GW] encounter card render failed:', e?.message);
        return null;
    }
}

// compact card for a carried-relic announcement / duel challenge
async function renderBannerCard({ glyph = '◈', title, body, accent = '#A67C2E' } = {}) {
    try {
        _ensureFonts();
        const canvas = require('canvas');
        const c = canvas.createCanvas(900, 300);
        const ctx = c.getContext('2d');
        ctx.fillStyle = PAL.parchment;
        ctx.fillRect(0, 0, 900, 300);
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(24, 24, 852, 252);
        ctx.fillStyle = accent;
        ctx.font = '44px "Cinzel"';
        ctx.textAlign = 'center';
        ctx.fillText(glyph, 450, 105);
        ctx.fillStyle = PAL.ink;
        ctx.font = '28px "Cinzel Deco"';
        if ('letterSpacing' in ctx) { ctx.letterSpacing = '2px'; ctx.fillText(String(title || '').toUpperCase(), 450, 165); ctx.letterSpacing = '0px'; }
        else ctx.fillText(String(title || '').split('').join('\u2009'), 450, 165);
        ctx.font = '19px "IM Fell"';
        ctx.fillStyle = PAL.inkSoft;
        const lines = _wrap(ctx, body || '', 760).slice(0, 3);
        let ty = 205;
        for (const line of lines) { ctx.fillText(line, 450, ty); ty += 26; }
        return c.toBuffer('image/png');
    } catch (e) {
        return null;
    }
}

module.exports = { renderRoomCard, renderBannerCard, TYPES };
