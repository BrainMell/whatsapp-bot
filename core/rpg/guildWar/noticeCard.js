// ============================================
// 📜 GUILD ASSOCIATION OFFICIAL NOTICE — Guild War Overhaul 2026-10-03
// Formal letter-style card for war announcements / Alignment notices /
// major world events. Clones the Royal Decree kit (worldMapRenderer style).
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
    plate: 'rgba(58,42,30,0.06)',
};
const W = 1000, H = 700;

let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API');
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
    const words = String(text).split(/\s+/);
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

// render(text, {title, kicker}) → PNG buffer
async function renderNotice(text, opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.parchmentDeep;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(100 + i * 210, 120 + (i % 3) * 200, 110, 70, i, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // double frame + corner marks (decree style)
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

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '16px "Cinzel"';
    ctx.fillText(opts.kicker || 'BY DECREE OF THE GUILD ASSOCIATION', W / 2, 100);
    ctx.fillStyle = PAL.ink;
    ctx.font = '36px "Cinzel Deco"';
    ctx.fillText(opts.title || 'OFFICIAL NOTICE', W / 2, 152);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 150, 176); ctx.lineTo(W / 2 + 150, 176); ctx.stroke();
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(W / 2 - 5, 170, 10, 12);

    // body (wrapped, IM Fell)
    ctx.font = '20px "IM Fell"';
    ctx.fillStyle = PAL.ink;
    ctx.textAlign = 'left';
    const lines = _wrap(ctx, text, W - 220);
    let ty = 240;
    for (const line of lines.slice(0, 12)) {
        ctx.fillText(line, 110, ty);
        ty += 32;
    }

    // wax seal
    ctx.fillStyle = PAL.wax;
    ctx.beginPath(); ctx.arc(W - 130, H - 120, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '26px "Cinzel Deco"';
    ctx.textAlign = 'center';
    ctx.fillText('GA', W - 130, H - 110);

    ctx.textAlign = 'left';
    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText('Let all guilds take heed.', 110, H - 80);

    return c.toBuffer('image/png');
}

module.exports = { renderNotice };
