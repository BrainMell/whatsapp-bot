// ═══════════════════════════════════════════════════════════════════════════
//  WORLD MAP RENDERER — live cosmology sheets (Royal Decree chrome)
// ═══════════════════════════════════════════════════════════════════════════
//
//  IMPLEMENTATION of implementation/world_map.md §2/§4/§5 (pass 3 geometry)
//  rendered LIVE with node-canvas (same in-repo renderer family as
//  summonRosterRenderer.js — no Go-service changes required).
//
//  RENDER INVARIANTS (cosmology_orbits.md §5 — violating any breaks the
//  owner-confirmed cosmology):
//    1. r_FirstWorld == R_WorldBeyond / 2, internally tangent (one side at
//       the WB's exact center, the opposite side on its outer circumference)
//    2. Presence of Order at the FIRST WORLD's center, co-moving
//    3. Quadrant cross co-rotates with the First World; worlds scatter
//       freely across all four quadrants
//    4. Abyss rings shrink downward; no floor; no orbit
//    5. Afterlife orbit is its own path (independent period), never drawn
//       as a marker on the First World's orbit
//    6. Timelines never appear as map regions
//
//  All sheet text is ASCII-safe (cardstyle.Sanitize discipline). The `╒ ╛`
//  lore framing is chat-text-only and never appears on a map.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const cosmology = require('./cosmology');

// ─── PALETTE (matched to the approved pass-3 renders) ────────────────────────
const PAL = {
    parchment: '#EADDC4',
    parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E',
    inkSoft: '#5A4634',
    frame: '#A67C2E',
    wax: '#8B1A2B',
    waxSoft: 'rgba(139,26,43,0.45)',
    gold: '#A67C2E',
    goldSoft: 'rgba(166,124,46,0.5)',
    known: '#2E6E73',
    corrupted: '#9C5B23',
    dungeon: '#8B1A2B',
    afterlife: '#4A5568',
    plate: 'rgba(58,42,30,0.06)',
};

const W = 1000;
const H = 1400;

// ─── FONT REGISTRATION (lazy; bot-owned fonts only) ─────────────────────────
// 💡 ROOT-CAUSE FIX (same bug as soulReaderRenderer.js, owner 2026-09-21):
// the font dir was hardcoded to the dev sandbox path. Production
// (/home/ubuntu/whatsapp-bot per ecosystem.config.js) threw ENOENT, so EVERY
// world sheet silently fell back to text on the Oracle box. Fonts now resolve
// relative to this module with per-file LFS guards (deadWorldRenderer pattern).
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        // canvas 3.x in-repo exposes registerFont (same API summonRosterRenderer.js uses)
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        const F = path.join(__dirname, '..', 'rpgasset', 'fonts');
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))   // TTF
                    || head.toString('latin1') === 'OTTO'                    // OTF
                    || head.toString('latin1') === 'true';
            } catch (e) { return false; }
        };
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['CinzelDecorative-Bold.ttf', { family: 'Cinzel Deco B' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ];
        let registered = 0;
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (!isRealFont(p)) continue;
            try { registerFont(p, opts); registered++; } catch (e) { /* skip broken file */ }
        }
        if (!registered) throw new Error('no usable font files registered');
        _fontsReady = true;
        return true;
    } catch (e) {
        try { console.error('[worldMapRenderer] font registration failed:', e.message); } catch (_) {}
        return false;
    }
}

// ─── SEEDED SCATTER (deterministic world dots — no state) ────────────────────
function _mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Worlds scatter freely across ALL FOUR quadrants (invariant #3). Fixed seed
// so every render shows the same atlas (a chart, not noise).
function _worldDots(seed = 20260917) {
    const rnd = _mulberry32(seed);
    const dots = [];
    for (let i = 0; i < 19; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = Math.sqrt(rnd()) * 0.88;
        const typeRoll = rnd();
        const type = typeRoll < 0.45 ? 'known' : (typeRoll < 0.75 ? 'corrupted' : 'dungeon');
        dots.push({ ang, rad, type, r: 7 + rnd() * 6 });
    }
    return dots;
}

// ─── CHROME HELPERS ──────────────────────────────────────────────────────────

function _bg(ctx) {
    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    const rnd = _mulberry32(7);
    ctx.fillStyle = PAL.parchmentDeep;
    for (let i = 0; i < 9; i++) {
        const x = rnd() * W, y = rnd() * H, r = 60 + rnd() * 130;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function _frame(ctx) {
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 2;
    const t = 16;
    [[36, 36, 1, 1], [W - 36, 36, -1, 1], [36, H - 36, 1, -1], [W - 36, H - 36, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t);
        ctx.stroke();
    });
}

function _centered(ctx, text, y, font, color) {
    ctx.font = font;
    ctx.fillStyle = color || PAL.ink;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y);
}

function _plate(ctx, x, y, w, h, heading, bodyLines) {
    ctx.fillStyle = PAL.plate;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.ink;
    let ty = y + 24;
    if (heading) {
        ctx.font = '16px "Cinzel"';
        ctx.fillText(heading, x + w / 2, ty);
        ty += 24;
    }
    ctx.font = '15px "IM Fell"';
    ctx.fillStyle = PAL.inkSoft;
    for (const line of bodyLines) {
        ctx.fillText(line, x + w / 2, ty);
        ty += 20;
    }
}

function _titleBlock(ctx, kicker, title, subtitle) {
    _centered(ctx, kicker, 78, '15px "Cinzel"', PAL.inkSoft);
    _centered(ctx, title, 124, '44px "Cinzel Deco"', PAL.ink);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 130, 144); ctx.lineTo(W / 2 + 130, 144); ctx.stroke();
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(W / 2 - 5, 138, 10, 12);
    if (subtitle) _centered(ctx, subtitle, 172, 'italic 16px "IM Fell Italic"', PAL.inkSoft);
}

function _legend(ctx, y) {
    const items = [
        ['KNOWN', PAL.known], ['CORRUPTED', PAL.corrupted], ['DUNGEON-WORLDS', PAL.dungeon],
    ];
    ctx.font = '14px "Cinzel"';
    let total = items.reduce((s, [t]) => s + ctx.measureText(t).width + 46, 0);
    let x = W / 2 - total / 2;
    ctx.textAlign = 'left';
    for (const [t, c] of items) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x + 7, y - 5, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = PAL.ink;
        ctx.fillText(t, x + 22, y);
        x += ctx.measureText(t).width + 46;
    }
    ctx.textAlign = 'center';
}

function _waxSeal(ctx, x, y, letter) {
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(234,221,196,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '16px "Cinzel Deco"';
    ctx.fillStyle = PAL.parchment;
    ctx.textAlign = 'center';
    ctx.fillText(letter || 'K', x, y + 6);
}

// ─── PASS-3 DESIGN HELPERS (world_map/pass3_owner_geometry) ─────────────────

/** Letter-spaced centered text (canvas has no letterSpacing API). */
function _spaced(ctx, text, cx, y, font, color, gap = 3) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    let total = 0;
    const widths = [];
    for (const ch of String(text)) {
        const w = ctx.measureText(ch).width;
        widths.push(w);
        total += w + gap;
    }
    total -= gap;
    let x = cx - total / 2;
    let i = 0;
    for (const ch of String(text)) {
        ctx.fillText(ch, x, y);
        x += widths[i] + gap;
        i++;
    }
    ctx.textAlign = 'center';
}

/** Royal Decree info plate: tan fill, ink border, inner hairline (the pass-3
 *  renders' plate style - visibly framed, unlike the old tint-only plate). */
function _decreePlate(ctx, x, y, w, h, heading, bodyLines, opts = {}) {
    const fill = opts.fill || (opts.onDark ? '#E4D3A9' : 'rgba(233,215,171,0.92)');
    const edge = opts.edge || (opts.onDark ? 'rgba(166,124,46,0.75)' : 'rgba(107,78,46,0.8)');
    const headInk = opts.headInk || (opts.onDark ? '#7A5A1E' : PAL.ink);
    const bodyInk = opts.bodyInk || (opts.onDark ? '#3A2A1E' : PAL.inkSoft);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
    ctx.textAlign = 'center';
    let ty = y + 27;
    if (heading) {
        ctx.font = '15px "Cinzel"';
        ctx.fillStyle = headInk;
        ctx.fillText(heading, x + w / 2, ty);
        ty += 25;
    }
    ctx.font = '14px "IM Fell"';
    ctx.fillStyle = bodyInk;
    for (const line of bodyLines) {
        if (line) ctx.fillText(line, x + w / 2, ty);
        ty += 20;
    }
}

/** Large wax seal (the pass-3 renders' bottom seal): dark red disk, inner
 *  ring, cream letter. */
function _waxSealBig(ctx, cx, cy, r, letter) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,20,30,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(234,221,196,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = `${Math.floor(r * 0.62)}px "Cinzel Deco"`;
    ctx.fillStyle = PAL.parchment;
    ctx.textAlign = 'center';
    ctx.fillText(String(letter || 'K'), cx, cy + r * 0.22);
}

/** Dashed ellipse stroke. */
function _dashEllipse(ctx, cx, cy, rx, ry, dash, color, lw) {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.setLineDash([]);
}

/** Curved annotation arrow with a small triangular head. */
function _curveArrow(ctx, x0, y0, cxp, cyp, x1, y1, color, lw = 1.6) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cxp, cyp, x1, y1);
    ctx.stroke();
    // head oriented along the end tangent
    const dx = x1 - cxp, dy = y1 - cyp;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const s = 9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * s - uy * s * 0.55, y1 - uy * s + ux * s * 0.55);
    ctx.lineTo(x1 - ux * s + uy * s * 0.55, y1 - uy * s - ux * s * 0.55);
    ctx.closePath();
    ctx.fill();
}

/** Parchment pill under a label so it stays readable over any structure. */
function _pillLabel(ctx, lines, cx, cy, font, color, opts = {}) {
    ctx.font = font;
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l.text || l).width));
    const lh = opts.lh || (parseInt(font, 10) + 7);
    const h = lines.length * lh + 10;
    const w = wMax + 18;
    ctx.fillStyle = opts.bg || 'rgba(240,228,196,0.88)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = opts.edge || 'rgba(107,78,46,0.4)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
    ctx.textAlign = 'center';
    let ty = cy - h / 2 + 8 + parseInt(font, 10) - 2;
    for (const l of lines) {
        ctx.font = (typeof l === 'object' ? l.font : font) || font;
        ctx.fillStyle = (typeof l === 'object' ? l.color : undefined) || color;
        ctx.fillText(typeof l === 'object' ? l.text : l, cx, ty);
        ty += lh;
    }
}

/** Dark plate background for the Abyss sheet (decree-dark variant). */
function _bgDark(ctx) {
    ctx.fillStyle = '#0D0906';
    ctx.fillRect(0, 0, W, H);
}

/** Gold frame with the corner crosses the dark sheets use. */
function _frameDark(ctx) {
    ctx.strokeStyle = 'rgba(166,124,46,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(46, 46, W - 92, H - 92);
    // corner crosses extending past the outer rule
    ctx.strokeStyle = 'rgba(166,124,46,0.7)';
    ctx.lineWidth = 1.4;
    const crosses = [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]];
    for (const [x, y] of crosses) {
        ctx.beginPath();
        ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
        ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
        ctx.stroke();
    }
}

/** Footer live-status strip (four clocks, always live). */
function _liveStrip(ctx, y) {
    const lines = cosmology.statusLines();
    ctx.font = '14px "IM Fell"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.textAlign = 'center';
    let ty = y;
    for (const line of lines) { ctx.fillText(line, W / 2, ty); ty += 17; }
    return ty;
}

/** Unified bottom stack (collision-free rows):
 *  legend 1196 | timelines 1222 | live strip 1256.. | footer 1344,
 *  wax seal pinned bottom-left like the approved atlas. */
function _bottomStack(ctx, opts = {}) {
    if (opts.legend !== false) {
        _legend(ctx, 1196);
        _centered(ctx, 'timelines are not mapped. every world holds more than the guild can chart',
            1222, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
    }
    if (opts.note) {
        _centered(ctx, opts.note, 1196, 'italic 14px "IM Fell Italic"', PAL.inkSoft);
    }
    _liveStrip(ctx, 1256);
    if (opts.footer) {
        _centered(ctx, opts.footer, 1344, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
    }
    _waxSeal(ctx, 80, H - 62, opts.seal || 'K');
}

// ─── SHARED GEOMETRY BLOCK ───────────────────────────────────────────────────

function _liveGeometry(cx, cy, R, t = Date.now()) {
    const r = R * cosmology.FW_TO_WB_RADIUS_RATIO;          // invariant #1
    const off = cosmology.fwCenterOffset(t, R);             // clockwise offset
    const fwx = cx + off.dx, fwy = cy + off.dy;
    const mi = cosmology.movementIndicator(t, r, fwx, fwy); // rides through FW
    return { R, r, cx, cy, fwx, fwy, theta: off.theta, mi, atBottom: cosmology.fwAtBottom(t), t };
}

function _drawFirstWorld(ctx, g, opts = {}) {
    const { r, fwx, fwy, theta } = g;

    // FW disk
    ctx.beginPath(); ctx.arc(fwx, fwy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250,243,224,0.92)'; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.ink; ctx.stroke();

    // quadrant cross CO-ROTATING with the FW (invariant #3)
    ctx.save();
    ctx.beginPath(); ctx.arc(fwx, fwy, r - 1, 0, Math.PI * 2); ctx.clip();
    ctx.translate(fwx, fwy); ctx.rotate(theta);
    ctx.strokeStyle = 'rgba(58,42,30,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.restore();

    // quadrant labels (co-rotate positions, upright text)
    ctx.font = '13px "Cinzel"'; ctx.fillStyle = 'rgba(90,70,52,0.85)'; ctx.textAlign = 'center';
    const qr = r * 0.72;
    const qpos = [[qr * 0.75, -qr * 0.75, 'I'], [-qr * 0.75, -qr * 0.75, 'II'], [-qr * 0.75, qr * 0.75, 'III'], [qr * 0.75, qr * 0.75, 'IV']];
    for (const [qx, qy, label] of qpos) {
        const rx = fwx + qx * Math.cos(theta) - qy * Math.sin(theta);
        const ry = fwy + qx * Math.sin(theta) + qy * Math.cos(theta);
        ctx.fillText(label, rx, ry + 4);
    }

    // scattered worlds (invariant #3: free scatter, all quadrants)
    for (const d of _worldDots()) {
        const lx = Math.cos(d.ang + theta) * d.rad * r;
        const ly = Math.sin(d.ang + theta) * d.rad * r;
        ctx.beginPath(); ctx.arc(fwx + lx, fwy + ly, d.r, 0, Math.PI * 2);
        ctx.fillStyle = PAL[d.type]; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.stroke();
    }

    // movement indicator: wax marker riding clockwise THROUGH the FW,
    // top -> right -> bottom, reaching the bottom link as the orbit completes
    ctx.beginPath(); ctx.arc(fwx, fwy, r * 0.55, 0, Math.PI * 2);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = PAL.waxSoft; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(g.mi.x, g.mi.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = PAL.parchment; ctx.stroke();

    // Presence of Order at the FIRST WORLD's center (invariant #2)
    ctx.beginPath(); ctx.arc(fwx, fwy, 15, 0, Math.PI * 2);
    ctx.fillStyle = PAL.gold; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(fwx, fwy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58,42,30,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();

    // bottom / Abyss-linking point of the First World
    const bx = fwx, by = fwy + r;
    ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
    if (g.atBottom && !opts.noLinkLabel) {
        ctx.font = 'italic 14px "IM Fell Italic"';
        ctx.fillStyle = PAL.ink; ctx.textAlign = 'left';
        ctx.fillText('the bottom link is engaged now', bx + 14, by + 4);
    }
}

function _drawAbyssDescent(ctx, x, yTop, scale = 1, label = true) {
    // Repeating rings shrinking as they descend, continuing without end (invariant #4)
    let y = yTop;
    let rw = 150 * scale;
    for (let i = 0; i < 5; i++) {
        const rh = rw * 0.22;
        ctx.beginPath(); ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(58,42,30,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.setLineDash([]);
        if (label) {
            ctx.font = '13px "Cinzel"'; ctx.fillStyle = PAL.inkSoft; ctx.textAlign = 'left';
            const numeral = ['I', 'II', 'III', 'IV', 'V'][i];
            ctx.fillText(numeral, x + rw + 12, y + 4);
        }
        y += rh * 2 + 34 * scale;
        rw *= 0.72;
    }
    ctx.fillStyle = 'rgba(58,42,30,0.5)';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(x - 10 + i * 10, y + 6, 2, 0, Math.PI * 2); ctx.fill();
    }
}

// ─── SHEET 1: FIRST WORLD (.j world) ─────────────────────────────────────────
function renderFirstWorldSheet(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'SUB-MAP I OF IV',
            'THE FIRST WORLD',
            '"the world". the quadrants hold every kind of world');

        // WB ghost circle (the First World rides INSIDE the World Beyond)
        const cx = W / 2, cy = 640, R = 350;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.setLineDash([6, 7]); ctx.strokeStyle = 'rgba(58,42,30,0.45)';
        ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);

        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g);

        // info plates (clear of the WB circle: at plate bottom y=308 the
        // circle spans x 389-611; plates end at 375 / start at 625)
        _plate(ctx, 55, 200, 320, 108, 'PRESENCE OF ORDER', [
            'sits at the exact center of the First World,',
            'and moves with it. It held the world',
            'after the Sundering.',
        ]);
        _plate(ctx, 625, 200, 320, 108, 'THE MARKER', [
            'a wax marker rides the crossing.',
            'guild surveyors set their calendars by it.',
        ]);
        _plate(ctx, 55, 1050, 390, 108, 'QUADRANT LAW', [
            'divisions of the First World, not borders.',
            'every quadrant holds known worlds,',
            'corrupted worlds, and worse.',
        ]);
        _plate(ctx, 555, 1050, 390, 108, 'DUNGEON-WORLDS', [
            'worlds fully consumed by Chaos.',
            'no two expeditions report the same one.',
        ]);

        _bottomStack(ctx, {
            seal: 'I',
            footer: '".j world" - the chart every adventurer carries',
        });
    });
}

// ─── SHEET 2: WORLD BEYOND (.j world beyond) ─────────────────────────────────
function renderWorldBeyondSheet(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'SUB-MAP II OF IV',
            'THE WORLD BEYOND',
            'the outermost boundary, above ordinary dimensionality');

        const cx = W / 2, cy = 640, R = 350;
        // WB solid boundary - the space inside the boundary not occupied by FW
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,210,178,0.55)'; ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = PAL.ink; ctx.stroke();

        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g, { noLinkLabel: true });

        _plate(ctx, 55, 200, 320, 108, 'NOT CHARTED', [
            'the god-rank realm is not named on any',
            'guild chart. Those who know, do not say;',
            'those who say, do not know.',
        ]);
        _plate(ctx, 625, 200, 320, 108, 'THE MEASURE', [
            'the First World\'s rim touches this center;',
            'its far rim touches the outer edge.',
        ]);

        _centered(ctx, 'WORLD BEYOND', cy + R - 80, '26px "Cinzel"', PAL.ink);
        ctx.font = 'italic 15px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('the space it does not occupy. the chart will not name it', cx, cy + R - 54);

        _bottomStack(ctx, {
            legend: false,
            seal: 'II',
            footer: '".j world beyond" - the outer chart',
        });
    });
}

// ─── SHEET 3: AFTERLIFE (.j world afterlife) — pass3_owner_geometry ────────
// IMPLEMENTATION of "THE SHORE BEYOND THE VEIL": the Afterlife as the shore
// oval (pillar fence falling to a scalloped shoreline) at the center of its
// own wide dashed orbit, the body's live position marked on that orbit, the
// main-structure glyph, the slower-orbit annotation, and the triune + unlock
// plates. Independent orbital calculation - never merged with the 5-hour
// cycle (invariant #5). Unlock: the dead-soul reading (`.j kills`) or staff.
function renderAfterlifeSheet(t = Date.now()) {
    return _render((ctx) => {
        // header
        _spaced(ctx, 'SUB-MAP III OF IV - INDEPENDENT ORBITAL BODY', W / 2, 84, '14px "Cinzel"', PAL.inkSoft, 2);
        _spaced(ctx, 'THE SHORE BEYOND THE VEIL', W / 2, 148, '42px "Cinzel Deco"', PAL.ink, 2);
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2 - 230, 172); ctx.lineTo(W / 2 + 230, 172); ctx.stroke();
        ctx.fillStyle = PAL.wax;
        ctx.fillRect(W / 2 - 5, 164, 10, 14);

        // requirement + what the gated viewer is told (design lines)
        _centered(ctx, '"j world afterlife" requirement: the dead-soul feature must already be unlocked',
            208, 'italic 16px "IM Fell Italic"', PAL.inkSoft);
        _centered(ctx, 'what the gated viewer is told: "Unlock the reading of dead souls to see this shore."',
            236, 'italic 16px "IM Fell Italic"', PAL.inkSoft);

        // main-structure glyph (not to scale), top right
        ctx.beginPath(); ctx.arc(802, 330, 54, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.arc(826, 298, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.textAlign = 'right';
        ctx.font = 'italic 12.5px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('the main structure (not to scale)', 942, 414);
        ctx.textAlign = 'center';

        // the Afterlife's own orbit: wide navy dashed ellipse
        const acx = W / 2, acy = 620, aRX = 340, aRY = 185;
        _dashEllipse(ctx, acx, acy, aRX, aRY, [8, 9], PAL.afterlife, 1.8);

        // the shore: the Afterlife itself (pillar fence + scalloped shoreline)
        ctx.beginPath(); ctx.ellipse(acx, acy, 130, 76, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#F6EEDA'; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.ellipse(acx, acy, 129, 75, 0, 0, Math.PI * 2); ctx.clip();
        _spaced(ctx, 'THE AFTERLIFE', acx, acy - 38, '15px "Cinzel"', PAL.ink, 2);
        ctx.strokeStyle = 'rgba(74,85,104,0.75)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i <= 8; i++) {
            const px = acx - 104 + i * 26;
            ctx.beginPath(); ctx.moveTo(px, acy - 24); ctx.lineTo(px, acy + 42); ctx.stroke();
        }
        // scalloped shoreline across the oval
        ctx.strokeStyle = 'rgba(74,85,104,0.85)';
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 4; k++) {
            const sx = acx - 104 + k * 57;
            ctx.beginPath(); ctx.arc(sx + 28.5, acy + 42, 28.5, Math.PI, 0, false); ctx.stroke();
        }
        ctx.restore();

        _centered(ctx, 'dead souls arrive here - the shoreline the living may stand at',
            acy + 112, 'italic 14px "IM Fell Italic"', PAL.inkSoft);

        // the body's live position on its own circuit
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = acx + Math.cos(ap) * aRX, ay = acy + Math.sin(ap) * aRY;
        ctx.beginPath(); ctx.arc(ax, ay, 11, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();
        const aRight = ax >= acx;
        ctx.textAlign = aRight ? 'right' : 'left';
        const mx = ax + (aRight ? -18 : 18);
        ctx.font = 'italic 12.5px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('its current position', mx, ay - 8);
        ctx.fillText('(computed whenever asked)', mx, ay + 9);
        ctx.textAlign = 'center';

        // slower-orbit annotation (design: curved arrow from the lower left)
        _centered(ctx, 'its own, much slower orbit - one cycle', 952, 'italic 13.5px "IM Fell Italic"', PAL.inkSoft);
        _centered(ctx, '~ 2 real-world days - shares nothing', 971, 'italic 13.5px "IM Fell Italic"', PAL.inkSoft);
        _centered(ctx, "with the First World's 5-hour path", 990, 'italic 13.5px "IM Fell Italic"', PAL.inkSoft);
        const arrowTipA = Math.PI * 0.78; // lower-left of the ellipse
        const atx = acx + Math.cos(arrowTipA) * aRX, aty = acy + Math.sin(arrowTipA) * aRY;
        _curveArrow(ctx, 322, 936, 352, 828, atx, aty, 'rgba(74,85,104,0.8)', 1.6);

        // triune + unlock plates (design texts)
        _decreePlate(ctx, 55, 1040, 430, 124, 'TRIUNE ALIGNMENT - EVERY 7 DAYS', [
            "afterlife position + the First World's",
            "bottom (Abyss-linking) point + the Abyss",
            '- all three aligned at once; flagged state;',
            'the consequence is still to be decided.',
        ]);
        _decreePlate(ctx, 515, 1040, 430, 124, 'UNLOCK - DEAD-SOUL FEATURE', [
            'players without the feature receive the',
            'requirement, not the map; the map',
            'refuses to render while locked.',
        ]);

        // triune announcement when the state is live now
        const tri = cosmology.triuneWindow(t);
        if (tri.aligned) {
            _centered(ctx, 'THE THREE ARE ALIGNED NOW', 1192, '15px "Cinzel"', PAL.wax);
        }

        _liveStrip(ctx, 1224);
        _waxSealBig(ctx, W / 2, 1320, 22, 'V');
        _centered(ctx, '"j world afterlife" own sheet, own lore card - independent orbital calculation - never merged with the 5-hour cycle',
            1362, 'italic 11.5px "IM Fell Italic"', PAL.inkSoft);
    });
}

// ─── SHEET 4: ABYSS (.j world abyss) — pass3_owner_geometry submap_abyss ────
// The decree-dark variant: black plate, gold rings descending without end,
// roman depth markers down the left margin, tan decree plates on the right,
// the wax seal 'A' and the owner's closing quote. Separation from every
// orbital system IS the point of the sheet (design footer), so no orbit
// appears here and the rings never end at a floor.
function renderAbyssSheet(t = Date.now()) {
    return _render((ctx) => {
        // header
        _spaced(ctx, 'SUB-MAP IV OF IV - INFINITE DESCENT', W / 2, 92, '15px "Cinzel"', '#C9A24B', 3);
        _spaced(ctx, 'THE ABYSS', W / 2, 162, '56px "Cinzel Deco"', '#D9B95C', 4);
        _spaced(ctx, 'DEPTHS', W / 2, 192, '18px "Cinzel"', '#9A7D3A', 8);
        ctx.strokeStyle = 'rgba(201,162,75,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(320, 216); ctx.lineTo(680, 216); ctx.stroke();
        ctx.fillStyle = PAL.wax;
        ctx.fillRect(W / 2 - 6, 208, 12, 16);

        // requirement + live gate line
        _centered(ctx, '"j world abyss" requirement: level 20 - a configurable unlock',
            252, 'italic 17px "IM Fell Italic"', '#C9A24B');
        _centered(ctx, cosmology.abyssGateLine(t), 282, '14px "IM Fell"', '#9A7D3A');

        // ── the rings: solid gold, shrinking as they descend, no floor ──
        const RX = [220, 165, 124, 92, 68, 50, 37, 27];
        const ringX = 430;
        let ry2 = 330;
        const ringBottoms = [];
        for (const rx of RX) {
            const rh = rx * 0.36;
            if (ringBottoms.length === 0) ry2 = 330 + rh; else ry2 = ry2 + 12 + rh;
            ctx.beginPath(); ctx.ellipse(ringX, ry2, rx, rh, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(201,162,75,0.85)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ringBottoms.push(ry2 + rh);
        }
        // the rings continue: the count does not stop
        ctx.fillStyle = 'rgba(201,162,75,0.8)';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(ringX - 12 + i * 12, ringBottoms[ringBottoms.length - 1] + 32, 2.2, 0, Math.PI * 2); ctx.fill();
        }

        // ── depth markers I..X down the left margin ──
        const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        ctx.textAlign = 'right';
        ctx.font = '14px "Cinzel"';
        ctx.fillStyle = '#9A7D3A';
        for (let i = 0; i < 10; i++) {
            const my = 356 + i * 63;
            ctx.fillText(NUMERALS[i], 148, my + 5);
            ctx.strokeStyle = 'rgba(201,162,75,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(162, my); ctx.lineTo(204, my); ctx.stroke();
        }
        ctx.textAlign = 'center';

        // ── the three decree plates (tan on black, drawn over the top ring) ──
        _decreePlate(ctx, 610, 330, 330, 186, 'THE ABYSS DOES NOT ORBIT', [
            'it descends beneath the main structure -',
            "no share in the First World's 5-hour",
            "path, none in the Afterlife's 2-day one.",
            '',
            'access cycle: universal, 6 real hours',
            '(5 h locked + 1 h entry window - entry',
            'only; those inside may remain).',
        ], { onDark: true });
        _decreePlate(ctx, 610, 556, 330, 186, 'RELATION TO THE FIRST WORLD', [
            "the First World's bottom point links to",
            'the Abyss once per 5-hour orbit -',
            'routine. the Afterlife joins that line',
            'only once every 7 days (triune).',
            '',
            'every dungeon entry opens a NEW',
            'consumed world - endless.',
        ], { onDark: true });
        _decreePlate(ctx, 610, 782, 330, 140, 'UNLOCK - CONFIGURABLE TIER', [
            'level 20 - a configurable constant.',
            'the sheet refuses to render while',
            'locked, and names the requirement',
            'instead.',
        ], { onDark: true });

        _centered(ctx, 'no floor is drawn - the rings continue, technically without end',
            1084, 'italic 15px "IM Fell Italic"', '#9A7D3A');

        // wax seal + the owner's closing line
        _waxSealBig(ctx, W / 2, 1166, 40, 'A');
        _centered(ctx, '"the rings do not stop. neither does the count."',
            1248, 'italic 19px "IM Fell Italic"', '#C9A24B');
        _centered(ctx, '"j world abyss" own sheet, own lore card - separation from all orbital systems is the point',
            1332, 'italic 13px "IM Fell Italic"', 'rgba(201,162,75,0.55)');
    }, { dark: true });
}

// ─── SHEET 0: COSMOLOGY ATLAS (.j world all) — pass3_owner_geometry ────────
// IMPLEMENTATION of the owner-confirmed KOSMION survey sheet: the World
// Beyond as the great tan disk, the First World inside it at the EXACT
// tangent geometry (radius = half, one rim on the WB's center, the other on
// its boundary - invariant #1) at its LIVE clockwise position, the wax marker
// riding the red dashed path inside it, the Afterlife on its OWN dashed
// orbit (never the First World's path - invariant #5), the Abyss as dashed
// rings descending beneath (invariant #4), the legend, and the survey plates.
// Only the visual layout changed; the four clocks stay four systems.
function renderCosmologyAtlasSheet(t = Date.now()) {
    return _render((ctx) => {
        // ── header (KOSMION survey sheet) ──
        _spaced(ctx, 'COSMOLOGICAL SURVEY - THE FIRST WORLD - THE WORLD BEYOND - THE AFTERLIFE - THE ABYSS',
            W / 2, 84, '11px "Cinzel"', PAL.inkSoft, 1.2);
        _spaced(ctx, 'KOSMION', W / 2, 148, '54px "Cinzel Deco"', PAL.ink, 6);
        ctx.strokeStyle = PAL.frame;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2 - 240, 172); ctx.lineTo(W / 2 + 240, 172); ctx.stroke();
        ctx.fillStyle = PAL.wax;
        ctx.fillRect(W / 2 - 5, 164, 10, 14);
        _centered(ctx, 'every chart the guild holds, gathered on one page',
            200, 'italic 16px "IM Fell Italic"', PAL.inkSoft);

        // ── the living circles ──
        const cx = W / 2, cy = 585, R = 270;
        // the World Beyond: the great tan disk
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#D9C49A'; ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.ink; ctx.stroke();

        // the First World at live tangent geometry + all internal structure
        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g);

        // FW labels travel with the disk (design: title + geometry notes inside)
        _pillLabel(ctx, [
            { text: 'FIRST WORLD', font: '16px "Cinzel"', color: PAL.ink },
            { text: "one side touches the World Beyond's center,", font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'the other its outer rim', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
        ], g.fwx, g.fwy + 62, '16px "Cinzel"', PAL.ink);

        // the Afterlife's OWN orbit (dashed, drawn beyond the boundary)
        const aR = 318;
        _dashEllipse(ctx, cx, cy, aR, aR, [8, 9], PAL.afterlife, 1.8);
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = cx + Math.cos(ap) * aR, ay = cy + Math.sin(ap) * aR;
        ctx.beginPath(); ctx.arc(ax, ay, 12, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();
        // label switches sides so it never runs off the sheet; flips above the
        // marker when the body rides the lower arc (keeps the abyss rings clear)
        const aRight = ax >= cx;
        const aBelow = ay > cy;
        ctx.textAlign = aRight ? 'right' : 'left';
        const lx = ax + (aRight ? -20 : 20);
        ctx.font = '15px "Cinzel"'; ctx.fillStyle = PAL.afterlife;
        ctx.fillText('AFTERLIFE', lx, aBelow ? ay - 52 : ay - 6);
        ctx.font = 'italic 11.5px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('independent orbit - one circuit ~ 2 real-world days,', lx, aBelow ? ay - 33 : ay + 13);
        ctx.fillText("not the First World's path", lx, aBelow ? ay - 17 : ay + 29);
        ctx.textAlign = 'center';

        // header plates (drawn after the orbit so the dashed circle passes
        // behind them, exactly like the pass-3 sheet)
        _decreePlate(ctx, 55, 218, 305, 114, 'NOT CHARTED', [
            "the Afterlife's orbit is drawn as its own",
            "path - it shares nothing with the First",
            "World's",
        ]);
        _decreePlate(ctx, 640, 218, 305, 114, 'MOVEMENT INDICATOR', [
            'a small wax marker rides the First World',
            "and reaches its Abyss-link at orbit's",
            'end',
        ]);

        // clockwise-orbit annotation at the left edge (design: note + arrow)
        _pillLabel(ctx, [
            { text: 'CLOCKWISE ORBIT', font: '12px "Cinzel"', color: PAL.ink },
            { text: '5 REAL HOURS', font: '12px "Cinzel"', color: PAL.ink },
            { text: '= 5 IN-GAME DAYS', font: '12px "Cinzel"', color: PAL.ink },
        ], 150, 464, '12px "Cinzel"', PAL.ink);
        // arrow toward the FW's orbital path (radius R/2 around the WB center),
        // aimed just ahead of the live position (clockwise = angle grows)
        const aimA = (g.theta || 0) + 0.5;
        const tx2 = cx + Math.cos(aimA) * (R / 2), ty2 = cy + Math.sin(aimA) * (R / 2);
        _curveArrow(ctx, 205, 452, 290, 430, tx2, ty2, 'rgba(58,42,30,0.65)', 1.5);

        // WORLD BEYOND label inside the great disk (design: lower-left)
        _pillLabel(ctx, [
            { text: 'WORLD BEYOND', font: '21px "Cinzel"', color: PAL.ink },
            { text: 'the space it does not occupy - God-Rank realm,', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'above ordinary dimensionality', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
        ], 372, 762, '21px "Cinzel"', PAL.ink);

        // ── the Abyss: dashed rings descending beneath the boundary ──
        const AB_RX = [130, 95, 70, 51, 38, 28];
        let aby = 905;
        const bottoms = [];
        for (const rx of AB_RX) {
            const rh = rx * 0.24;
            if (bottoms.length === 0) aby = 905 + rh; else aby = aby + 6 + rh;
            _dashEllipse(ctx, 430, aby, rx, rh, [5, 6], 'rgba(58,42,30,0.55)', 1.3);
            bottoms.push(aby + rh);
        }
        ctx.fillStyle = 'rgba(58,42,30,0.5)';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(418 + i * 10, bottoms[bottoms.length - 1] + 24, 2, 0, Math.PI * 2); ctx.fill();
        }
        // THE ABYSS label block to the right of the rings (design position)
        ctx.textAlign = 'left';
        ctx.font = '16px "Cinzel"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('THE ABYSS', 668, 952);
        ctx.font = 'italic 12px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('infinite descent - repeating rings,', 668, 974);
        ctx.fillText('and nothing above, below, or beside -', 668, 991);
        ctx.fillText('not a world - a separate structure', 668, 1008);
        ctx.textAlign = 'center';

        // ── legend + timelines note ──
        _legend(ctx, 1102);
        _centered(ctx, 'timelines are not mapped - every world holds infinite timeline variants (world to variant)',
            1128, 'italic 13px "IM Fell Italic"', PAL.inkSoft);

        // ── survey plates (the pass-3 sheet's bottom plates) ──
        _decreePlate(ctx, 64, 1154, 400, 104, 'SURVEY LAW', [
            "the First World's rim touches the World",
            "Beyond's center; its far rim touches the",
            'outer boundary - its radius is exactly half',
        ]);
        _decreePlate(ctx, 536, 1154, 400, 104, 'MOVEMENT', [
            'the First World orbits clockwise - one',
            'orbit: 5 real hours = 5 in-game days -',
            'the Presence of Order travels with it',
        ]);

        // live four-clocks strip + footer + seal
        _liveStrip(ctx, 1290);
        _centered(ctx, '"j world all" - the gathered chart', 1362, 'italic 12px "IM Fell Italic"', PAL.inkSoft);
        _waxSealBig(ctx, 78, 1300, 22, 'K');
    });
}

// ─── GATE CARDS (2026-09-21 owner ticket: alignment and access failures get
// ─── an IMAGE CARD that carries the refusal visually, not just in text) ──────
//
//  renderAbyssMisalignedCard  the abyss gate seen from outside: the living
//                             circles above, the descent below, and the
//                             alignment link between them NOT met. Two
//                             variants: 'closed' (the worlds are simply not
//                             aligned for the descent right now) and
//                             'unreadable' (the alignment cannot be read at
//                             all, so the gate fails closed).
//  renderAfterlifeLockedCard  the shore on its own circuit, the road toward
//                             it ending mid gap. The requirement (the
//                             reading of dead souls) is stated in a plate;
//                             the map itself is never drawn (hard contract:
//                             a locked map is never rendered).
//
//  Both reuse the Royal Decree chrome of the four sheets so the refusal
//  reads as part of the same visual family. Text on the cards is minimal;
//  the situation is carried by the drawing.

// A large diagonal refusal stamp across the visual (kept subtle so it reads
// as a seal on the chart, not a UI error banner). Position/size overridable
// so it never covers the card's key link work.
function _refusalStamp(ctx, label, opts = {}) {
    const y = opts.y || 760;
    const lw = opts.lw || 560, lh = opts.lh || 128;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate(opts.rot != null ? opts.rot : -0.16);
    ctx.fillStyle = 'rgba(139,26,43,0.14)';
    ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
    ctx.strokeStyle = 'rgba(139,26,43,0.75)';
    ctx.lineWidth = 4;
    ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-lw / 2 + 9, -lh / 2 + 9, lw - 18, lh - 18);
    ctx.font = `${opts.font || 58}px "Cinzel Deco"`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(139,26,43,0.88)';
    ctx.fillText(String(label || 'SEALED').toUpperCase(), 0, Math.floor(lh * 0.2));
    ctx.restore();
}

function renderAbyssMisalignedCard(opts = {}) {
    const mode = opts.mode === 'unreadable' ? 'unreadable' : 'closed';
    const t = Date.now();
    return _render((ctx) => {
        _titleBlock(ctx,
            mode === 'unreadable'
                ? 'THE ALIGNMENT OF THE WORLDS CANNOT BE READ'
                : 'THE WORLDS ARE NOT ALIGNED FOR THE DESCENT',
            'THE GATE IS SEALED',
            mode === 'unreadable'
                ? 'the gate does not open on a maybe'
                : 'the abyss admits new descenters only while the window is open');

        // the living circles (World Beyond boundary + First World, live phase)
        const cx = W / 2, cy = 430, R = 210;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,210,178,0.45)'; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.setLineDash([6, 7]);
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);
        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g, { noLinkLabel: true });
        _centered(ctx, 'THE FIRST WORLD', cy + R + 26, '15px "Cinzel"', PAL.inkSoft);

        // the alignment link between them: drawn NOT MET. A thread leaves the
        // First World's bottom link and stops in the void, short of the abyss.
        const bx = g.fwx, by = g.fwy + g.r;
        const gapY = 736;
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = 'rgba(139,26,43,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, gapY - 24); ctx.stroke();
        ctx.setLineDash([]);
        // broken end sockets that do not meet
        ctx.strokeStyle = PAL.wax; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(bx, gapY - 10, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 7, gapY + 2); ctx.lineTo(bx + 7, gapY + 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + 7, gapY + 2); ctx.lineTo(bx - 7, gapY + 16); ctx.stroke();
        _centered(ctx, mode === 'unreadable' ? 'THE ALIGNMENT CANNOT BE READ' : 'THE ALIGNMENT IS NOT MET',
            gapY + 46, '14px "Cinzel"', PAL.wax);

        // the descent below (kept clear of the link labels)
        _centered(ctx, 'THE ABYSS', 832, '15px "Cinzel"', PAL.inkSoft);
        _drawAbyssDescent(ctx, cx, 858, 0.85);

        // refusal stamp across the descent band (clear of link + labels)
        _refusalStamp(ctx, mode === 'unreadable' ? 'UNREAD' : 'SEALED', { y: 938, lw: 470, lh: 104, font: 46, rot: -0.12 });

        _plate(ctx, 55, 1020, 420, 118, mode === 'unreadable' ? 'WHY THE SHUTTER' : 'WHY THE GATE HOLDS', [
            mode === 'unreadable'
                ? 'the alignment of the worlds cannot be read,'
                : 'the gate opens one hour in six,',
            mode === 'unreadable'
                ? 'and the abyss does not open on a maybe.'
                : 'and only while the worlds meet.',
            'those already below are not pulled out.',
        ]);
        _plate(ctx, 525, 1020, 420, 118, 'THE WINDOW', [
            mode === 'unreadable'
                ? 'wait, and ask again soon.'
                : `the gate opens in ${String(opts.opensInLabel || 'a while').replace(/^locked /, '')}.`,
            'entry is gated, not the descent itself.',
        ]);

        _bottomStack(ctx, {
            legend: false,
            seal: 'IV',
            footer: 'the descent is refused, politely and completely',
        });
    });
}

function renderAfterlifeLockedCard(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'THE SHORE IS NOT DRAWN FOR YOU YET',
            'THE AFTERLIFE',
            'the road is missing its crossing');

        // the afterlife on its own circuit (invariant #5), far and unreachable
        const acx = W / 2, acy = 470, aR = 235;
        ctx.beginPath(); ctx.arc(acx, acy, aR, 0, Math.PI * 2);
        ctx.setLineDash([7, 8]); ctx.strokeStyle = PAL.afterlife; ctx.lineWidth = 1.8;
        ctx.stroke(); ctx.setLineDash([]);
        _centered(ctx, 'THE AFTERLIFE ORBIT', acy - aR + 74, '16px "Cinzel"', PAL.afterlife);
        ctx.font = 'italic 14px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('it rides its own circuit, sharing nothing with the First World', acx, acy - aR + 100);
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = acx + Math.cos(ap) * aR, ay = acy + Math.sin(ap) * aR;
        ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();

        // the refusal stamp sits in the orbit's empty center, like a mark on
        // a chart the surveyor declined to finish
        _refusalStamp(ctx, 'LOCKED', { y: acy + 30, lw: 430, lh: 100, font: 44, rot: -0.14 });

        // the road: it leaves the viewer's side and stops mid gap
        const startX = 250, startY = 950;
        const endX = 450, endY = 768;
        ctx.setLineDash([2, 7]);
        ctx.strokeStyle = 'rgba(74,85,104,0.85)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.setLineDash([]);
        // the crossing that is missing: a closed gate glyph where the road dies
        const gx = endX + 44, gy = endY - 26;
        ctx.strokeStyle = PAL.afterlife; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(gx - 16, gy + 18); ctx.lineTo(gx - 16, gy - 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx + 16, gy + 18); ctx.lineTo(gx + 16, gy - 18); ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath(); ctx.moveTo(gx - 16, gy + i * 7); ctx.lineTo(gx + 16, gy + i * 7); ctx.stroke();
        }
        _waxSeal(ctx, gx + 44, gy + 32, 'III');
        _centered(ctx, 'THE CROSSING IS NOT TAUGHT YET', gy + 62, '14px "Cinzel"', PAL.afterlife);

        _plate(ctx, 55, 1020, 420, 118, 'WHAT YOU NEED', [
            'the reading of dead souls.',
            'the guild does not yet teach it.',
        ]);
        _plate(ctx, 525, 1020, 420, 118, 'UNTIL THEN', [
            'the shore stays undrawn.',
            'a locked map is never rendered.',
        ]);

        _bottomStack(ctx, {
            legend: false,
            seal: 'III',
            footer: 'the shore is refused, politely and completely',
        });
    });
}

// ─── CANVAS DRIVER ───────────────────────────────────────────────────────────

function _render(drawFn, opts = {}) {
    try {
        const { createCanvas } = require('canvas');
        _ensureFonts();
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        if (opts.dark) {
            _bgDark(ctx);
            drawFn(ctx);
            _frameDark(ctx);
        } else {
            _bg(ctx);
            drawFn(ctx);
            _frame(ctx);
        }
        return Promise.resolve(canvas.toBuffer('image/png'));
    } catch (e) {
        try { console.error('[worldMapRenderer] render failed:', e.message); } catch (_) {}
        return Promise.resolve(null);
    }
}

module.exports = {
    renderCosmologyAtlasSheet,
    renderFirstWorldSheet,
    renderWorldBeyondSheet,
    renderAfterlifeSheet,
    renderAbyssSheet,
    renderAbyssMisalignedCard,
    renderAfterlifeLockedCard,
    _liveGeometry,
    _worldDots,
    PAL,
    W, H,
};
