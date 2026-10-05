// ============================================
// 📜 RUINS END CARDS — royal-decree parchment, themed to the Ruins
// Owner directive 2026-10-05: the war's victory/defeat images were still
// the default Go VICTORY/DEFEAT portraits — replace them with the ROYAL
// DECREE style (old-looking parchment paper, the same general text style
// and presentation as the decree kit) specifically themed around the
// Ruins. Same kit as noticeCard.js (parchment + Cinzel/IM Fell + double
// frame + wax seal), with a carved-stone header band and the dead-world
// flavour lines. Rendered fully in Node — the Go microservice is not
// involved, matching the rest of the war presentation.
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
};
const W = 1000, H = 700;

let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        const F = path.join(__dirname, '..', '..', 'rpgasset', 'fonts');
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))
                    || head.toString('latin1') === 'OTTO' || head.toString('latin1') === 'true';
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
            if (isRealFont(p)) { try { registerFont(p, opts); } catch (e) { /* skip */ } }
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

// stone blotches for the header band (the Ruins' dead-world masonry)
function _stoneBand(ctx, y0, y1, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, y0 + 40 + (i % 3) * 55, 90, 32, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    // faint moss creeps along the band's lower edge
    ctx.fillStyle = 'rgba(90,110,60,0.28)';
    for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.ellipse(60 + i * 135, y1 - 6, 46, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// the ruined arch motif — a broken stone arch etched beside the seal
function _ruinedArch(ctx, cx, baseY, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, baseY);
    ctx.lineTo(cx - s * 0.9, baseY - s * 0.7);
    ctx.quadraticCurveTo(cx - s * 0.75, baseY - s * 1.5, cx, baseY - s * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.9, baseY);
    ctx.lineTo(cx + s * 0.9, baseY - s * 0.55);
    ctx.stroke();                                     // broken right pillar
    ctx.lineWidth = 3;
    ctx.beginPath();                                   // fallen capstone chunk
    ctx.moveTo(cx + s * 0.55, baseY - s * 0.12);
    ctx.lineTo(cx + s * 0.95, baseY - s * 0.28);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {                      // rubble dots
        ctx.beginPath();
        ctx.arc(cx + s * (0.25 + i * 0.28), baseY - 4, 2.4, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ── main render: { victory, playerName, guildName, roomLabel, chamberKey,
//    gp, relicNames, lives, worldName } → PNG buffer ──
async function renderRuinsEndCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    const victory = !!opts.victory;

    // parchment + age stains (the decree kit's paper)
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

    // ── carved-stone header band ──
    const BAND_H = 208;
    _stoneBand(ctx, 0, BAND_H, victory ? '#2F3527' : '#3B2428');
    ctx.textAlign = 'center';
    ctx.fillStyle = victory ? '#B9A44C' : '#C99A8C';
    ctx.font = '15px "Cinzel"';
    ctx.fillText(victory ? 'FIELD REPORT · THE RUINS OF A DEAD WORLD' : 'THE GUILD ASSOCIATION REGRETS TO REPORT', W / 2, 52);
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '40px "Cinzel Deco"';
    const title = victory ? 'VICTORY' : 'DEFEAT';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '6px';
        ctx.fillText(title, W / 2, 116);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText(title.split('').join('\u2009'), W / 2, 116);
    }
    ctx.font = 'italic 17px "IM Fell Italic"';
    ctx.fillStyle = victory ? '#D9C87C' : '#D9AF9F';
    ctx.fillText(victory ? 'the chamber is yours' : 'the Ruins claim another', W / 2, 146);
    ctx.strokeStyle = victory ? '#B9A44C' : '#C99A8C';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 150, 172); ctx.lineTo(W / 2 + 150, 172); ctx.stroke();
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(W / 2 - 5, 166, 10, 12);

    // etched arch motif in the band corners
    _ruinedArch(ctx, 108, BAND_H - 34, 46, 'rgba(233,220,196,0.5)');
    _ruinedArch(ctx, W - 108, BAND_H - 34, 46, 'rgba(233,220,196,0.5)');

    // ── decree frame below the band ──
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(30, BAND_H + 16, W - 60, H - BAND_H - 62);
    ctx.lineWidth = 1;
    ctx.strokeRect(42, BAND_H + 28, W - 84, H - BAND_H - 86);

    // ── body (IM Fell, decree voice) ──
    ctx.textAlign = 'left';
    ctx.font = '20px "IM Fell"';
    ctx.fillStyle = PAL.ink;
    const who = opts.playerName || 'The champion';
    const guild = opts.guildName ? ` of ${opts.guildName}` : '';
    const room = opts.roomLabel || 'chamber';
    const body = victory
        ? `${who}${guild} fought through the ${room} of the Ruins and stood when the dust settled. Its spoils are sealed to their name by this decree, and the way onward stands open.`
        : `${who}${guild} fell in the ${room} of the Ruins. The Association's wards carried them back to the chamber where they first deployed. The war does not wait - the fallen may rise and walk again.`;
    const lines = _wrap(ctx, body, W - 220).slice(0, 6);
    let ty = BAND_H + 78;
    for (const line of lines) { ctx.fillText(line, 110, ty); ty += 31; }

    // ── war-ledger strip (stat rows, same treatment as the decree strips) ──
    const stripY = H - 226;
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, stripY, W - 180, 96);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, stripY, W - 180, 96);
    const cells = [
        ['GUILD POINTS', String(opts.gp ?? 0)],
        ['CHAMBER', String(opts.chamberKey || '-')],
        ['RELICS CARRIED', String((opts.relicNames || []).length)],
        ['LIVES LEFT', String(opts.lives ?? 0)],
    ];
    const cw = (W - 180) / 4;
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
        const cx0 = 90 + cw * i + cw / 2;
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '13px "Cinzel"';
        ctx.fillText(cells[i][0], cx0, stripY + 34);
        ctx.fillStyle = victory ? PAL.ink : PAL.wax;
        ctx.font = 'bold 24px "Cinzel"';
        ctx.fillText(cells[i][1], cx0, stripY + 70);
        if (i) {
            ctx.strokeStyle = 'rgba(166,124,46,0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(90 + cw * i, stripY + 10);
            ctx.lineTo(90 + cw * i, stripY + 86);
            ctx.stroke();
        }
    }

    // carried relic names (one italic line, truncated)
    ctx.textAlign = 'left';
    const relicLine = (opts.relicNames || []).length
        ? `carried: ${opts.relicNames.slice(0, 3).join(', ')}${opts.relicNames.length > 3 ? `, and ${opts.relicNames.length - 3} more` : ''}`
        : 'carried: nothing of the old world';
    ctx.font = 'italic 14px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText(relicLine, 110, H - 104);

    // ── wax seal (cracked on defeat) ──
    const sx = W - 104, sy = H - 92;
    ctx.fillStyle = PAL.wax;
    ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '26px "Cinzel Deco"';
    ctx.textAlign = 'center';
    ctx.fillText('GA', sx, sy + 10);
    if (!victory) {
        // the seal cracks when the champion falls
        ctx.strokeStyle = 'rgba(24,10,12,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - 30, sy - 26);
        ctx.lineTo(sx - 8, sy - 4);
        ctx.lineTo(sx - 18, sy + 8);
        ctx.lineTo(sx + 6, sy + 30);
        ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText(victory ? 'Let the dead world remember their names.' : 'The way onward is not closed. Rest, and return.', 110, H - 56);

    return c.toBuffer('image/png');
}

module.exports = { renderRuinsEndCard };
