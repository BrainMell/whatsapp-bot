// ============================================
// 🧭 RUINS NAVIGATION CARDS — Guild War Overhaul 2026-10-03
// Owner directive: "make the ruins navigation reactive and visual."
// Two node-canvas cards in the Guild War parchment kit:
//   renderRoomTypeCard - shown on EVERY room entry BEFORE the scene image:
//     a bold "what kind of place is this" card (type seal + flavour + hint).
//   renderNavCard - shown whenever an encounter resolves (and on `paths`):
//     a compass layout with ARROWS for each direction, showing where the
//     player can go next - no more walls of exit text.
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
    you: '#8B1A2B', open: '#3E6B3E', fog: '#8A7B63', sealed: '#7A6A58',
};

// Type metadata: label + glyph + accent, used by both cards.
const TYPES = {
    empty:     { label: 'QUIET HALL',      glyph: '🌫️', accent: '#7A6A58', hint: 'The way is clear.' },
    combat:    { label: 'ENEMY PATROL',    glyph: '⚔️', accent: '#8B1A2B', hint: 'Enemies bar the way - fight to pass.' },
    coop:      { label: 'GUARDIAN PACK',   glyph: '🤝', accent: '#8B1A2B', hint: 'A pack blocks the hall - allies may fight it together.' },
    core:      { label: 'THE WORLD CORE',  glyph: '🌍', accent: '#4A2A8A', hint: 'The heart of the dead world - a guardian bars the way.' },
    puzzle:    { label: 'SEALED MECHANISM', glyph: '🧩', accent: '#2E5E8A', hint: 'Answer the mechanism to unseal the door.' },
    discovery: { label: 'BURIED CACHE',    glyph: '🔍', accent: '#3E6B3E', hint: 'Something is buried here - dig it up.' },
    reward:    { label: 'OLD-WORLD VAULT', glyph: '💠', accent: '#8A6A1E', hint: 'An untouched vault - claim what lies within.' },
    hazard:    { label: 'TRAPPED PASSAGE', glyph: '☠️', accent: '#8A4A1E', hint: 'Danger ahead - cross carefully.' },
    lore:      { label: 'INSCRIBED HALL',  glyph: '📖', accent: '#5A4634', hint: 'Old words cover these walls.' },
    secret:    { label: 'HIDDEN CHAMBER',  glyph: '✨', accent: '#8A1E6A', hint: 'A hidden chamber - great power, great risk.' },
    anomaly:   { label: 'WORLD-THIN HALL', glyph: '🌀', accent: '#1E6A8A', hint: 'Reality thins here - touch at your peril.' },
    landmark:  { label: 'LANDMARK',        glyph: '🗿', accent: '#4A6A8A', hint: 'A marker of the old world - record it.' },
};
function typeMeta(kind) {
    return TYPES[kind] || { label: String(kind || 'UNKNOWN').toUpperCase(), glyph: '❓', accent: '#5A4634', hint: '' };
}

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

function _parchmentBase(ctx, W, H) {
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
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.lineWidth = 1;
    ctx.strokeRect(42, 42, W - 84, H - 84);
}

// ── ROOM TYPE CARD ────────────────────────────────────────────────────────
// opts: { roomType, world, ring, boss, variant, landmarkName, cleared, prefix }
async function renderRoomTypeCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const W = 1000, H = 520;
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    _parchmentBase(ctx, W, H);

    const meta = typeMeta(opts.roomType);
    const label = opts.landmarkName ? String(opts.landmarkName).toUpperCase() : meta.label;

    // accent type strip
    ctx.fillStyle = meta.accent;
    ctx.fillRect(0, 96, W, 8);

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '17px "Cinzel"';
    const kicker = `${(opts.world || 'the ruins').toUpperCase()} - RING ${Math.max(1, Math.round((opts.ring || 0) * 4) + 1)}`;
    ctx.fillText(kicker, W / 2, 78);

    // big glyph
    ctx.font = '96px serif';
    ctx.fillText(meta.glyph, W / 2, 220);

    // type title
    ctx.fillStyle = PAL.ink;
    ctx.font = '44px "Cinzel Deco"';
    const title = label.length > 22 ? label.split('').join('\u2009') : label;
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '2px';
        ctx.fillText(title, W / 2, 290);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText(title, W / 2, 290);
    }

    // flavour line(s) - only when there IS distinct body text (avoids
    // duplicating the generic hint as both body and red strip)
    ctx.font = '21px "IM Fell"';
    ctx.fillStyle = PAL.inkSoft;
    const body = opts.body || null;
    let ty = 340;
    if (body) {
        for (const line of _wrap(ctx, body, W - 240).slice(0, 3)) {
            ctx.fillText(line, W / 2, ty);
            ty += 30;
        }
    }

    // status / action strip
    if (opts.cleared) {
        ctx.fillStyle = PAL.open;
        ctx.font = '20px "Cinzel"';
        ctx.fillText('ALREADY RESOLVED - THE WAY IS CLEAR', W / 2, ty + 26);
    }

    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '16px "IM Fell Italic"';
    ctx.fillText('the room reveals itself as you enter', W / 2, H - 58);
    if (opts.prefix) {
        ctx.font = '15px "Cinzel"';
        ctx.fillText(`dm me  "${opts.prefix} look"  to study this chamber`, W / 2, H - 38);
    }

    return c.toBuffer('image/png');
}

// ── NAVIGATION CARD ───────────────────────────────────────────────────────
// opts: { exits: [{rel, arrow, edge, known, kind, cleared}], roomType, world, prefix }
async function renderNavCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const W = 1000, H = 880;
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    _parchmentBase(ctx, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '16px "Cinzel"';
    ctx.fillText((opts.world || 'THE RUINS').toUpperCase(), W / 2, 76);
    ctx.fillStyle = PAL.ink;
    ctx.font = '38px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText('CHOOSE YOUR PATH', W / 2, 120);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText('CHOOSE YOUR PATH'.split('').join('\u2009'), W / 2, 120);
    }
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 142); ctx.lineTo(W / 2 + 170, 142); ctx.stroke();

    // compass layout: up / right / down / left panels around a center seal
    const cx = W / 2, cy = 490;
    const off = 228;
    const slots = { forward: [cx, cy - off], right: [cx + off, cy], back: [cx, cy + off], left: [cx - off, cy] };
    const exits = Array.isArray(opts.exits) ? opts.exits : [];
    const PW = 250, PH = 158; // panel size

    const byRel = {};
    for (const e of exits) byRel[e.rel] = e;

    for (const rel of ['forward', 'right', 'back', 'left']) {
        const e = byRel[rel];
        const [px, py] = slots[rel];
        // panel plate
        ctx.fillStyle = 'rgba(58,42,30,0.07)';
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(px - PW / 2, py - PH / 2, PW, PH, 14) : ctx.rect(px - PW / 2, py - PH / 2, PW, PH);
        ctx.fill(); ctx.stroke();

        // direction name (with arrow) INSIDE the panel top - no outside
        // labels, so nothing can collide with the card title.
        const dirLabels = { forward: '▲ FORWARD (w)', right: '▶ RIGHT (d)', back: '▼ BACK (s)', left: '◀ LEFT (a)' };
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '16px "Cinzel"';
        ctx.fillText(dirLabels[rel], px, py - 48);

        if (!e || !e.edge) {
            // sealed wall
            ctx.fillStyle = PAL.sealed;
            ctx.font = '36px serif';
            ctx.fillText('✖', px, py + 2);
            ctx.font = '19px "Cinzel"';
            ctx.fillText('SEALED', px, py + 32);
            ctx.font = '14px "IM Fell Italic"';
            ctx.fillText('no passage this way', px, py + 54);
        } else {
            const meta = typeMeta(e.kind);
            const known = !!e.known;
            if (known) {
                ctx.font = '32px serif';
                ctx.fillText(meta.glyph, px, py - 2);
                ctx.fillStyle = meta.accent;
                ctx.font = '17px "Cinzel"';
                const lbl = meta.label.length > 18 ? meta.label.slice(0, 17) + '…' : meta.label;
                ctx.fillText(lbl, px, py + 28);
                ctx.fillStyle = e.cleared ? PAL.open : PAL.wax;
                ctx.font = '13px "IM Fell Italic"';
                ctx.fillText(e.cleared ? 'already cleared' : 'awaiting a hero', px, py + 50);
            } else {
                ctx.fillStyle = PAL.fog;
                ctx.font = '30px serif';
                ctx.fillText('🌫️', px, py - 2);
                ctx.font = '17px "Cinzel"';
                ctx.fillText('UNCHARTED', px, py + 28);
                ctx.font = '13px "IM Fell Italic"';
                ctx.fillText('darkness beyond', px, py + 50);
            }
        }
    }

    // center medallion - you are here
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.fillStyle = PAL.you;
    ctx.fill();
    ctx.strokeStyle = PAL.parchment;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = PAL.parchment;
    ctx.font = '20px "Cinzel Deco"';
    ctx.fillText('YOU', cx, cy - 8);
    ctx.fillText('ARE', cx, cy + 14);
    ctx.fillText('HERE', cx, cy + 36);
    const curMeta = typeMeta(opts.roomType);
    ctx.fillStyle = PAL.ink;
    ctx.font = '16px "Cinzel"';
    ctx.fillText(`this room: ${curMeta.label}`, cx, cy + 108);

    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '17px "IM Fell"';
    const pfx = opts.prefix || '.';
    ctx.fillText(`dm me  "move forward" / "w" / "a" / "s" / "d"  - or "paths" to see this again`, W / 2, H - 62);

    return c.toBuffer('image/png');
}

module.exports = { renderRoomTypeCard, renderNavCard, typeMeta, TYPES };
