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
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        // canvas 3.x in-repo exposes registerFont (same API summonRosterRenderer.js uses)
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        const F = '/home/z/my-project/whatsapp-bot/core/rpgasset/fonts/';
        registerFont(F + 'CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' });
        registerFont(F + 'Cinzel-Variable.ttf', { family: 'Cinzel' });
        registerFont(F + 'IMFellEnglish-Regular.ttf', { family: 'IM Fell' });
        registerFont(F + 'IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' });
        registerFont(F + 'MedievalSharp.ttf', { family: 'Medieval' });
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

// ─── SHEET 3: AFTERLIFE (.j world afterlife) ─────────────────────────────────
function renderAfterlifeSheet(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'SUB-MAP III OF IV',
            'THE AFTERLIFE',
            'it rides its own circuit, sharing nothing with the First World\'s path');

        // small FW/WB reference (top)
        const cx = W / 2, cy = 380, R = 200;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.setLineDash([6, 7]); ctx.strokeStyle = 'rgba(58,42,30,0.4)'; ctx.lineWidth = 1.4;
        ctx.stroke(); ctx.setLineDash([]);
        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g, { noLinkLabel: true });

        // AFTERLIFE ORBIT - its own path (invariant #5), drawn separately
        const acx = W / 2, acy = 640, aR = 260;
        ctx.beginPath(); ctx.arc(acx, acy, aR, 0, Math.PI * 2);
        ctx.setLineDash([7, 8]); ctx.strokeStyle = PAL.afterlife; ctx.lineWidth = 1.8;
        ctx.stroke(); ctx.setLineDash([]);

        // afterlife body at its OWN phase
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = acx + Math.cos(ap) * aR, ay = acy + Math.sin(ap) * aR;
        ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();

        _centered(ctx, 'AFTERLIFE ORBIT', acy - 6, '16px "Cinzel"', PAL.afterlife);
        ctx.font = 'italic 14px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('a circuit of its own, on a schedule the guild has not charted', acx, acy + 18);

        _plate(ctx, 55, 950, 420, 108, 'THE SHORE', [
            'the reading of dead souls is the only road here.',
            'without it, the shore stays undrawn.',
        ]);
        _plate(ctx, 525, 950, 420, 108, 'THE THREE', [
            'some nights, the afterlife, the First World\'s',
            'bottom link, and the abyss below are found aligned.',
            'what that means is not yet written.',
        ]);

        // triune beam when aligned (wax-red, distinct from the routine link)
        const tri = cosmology.triuneWindow(t);
        if (tri.aligned) {
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(W / 2, 1130);
            ctx.strokeStyle = PAL.wax; ctx.lineWidth = 3; ctx.stroke();
            _centered(ctx, 'THE THREE ARE ALIGNED NOW', 1148, '15px "Cinzel"', PAL.wax);
        }

        _bottomStack(ctx, {
            legend: false,
            seal: 'III',
            footer: '".j world afterlife" - the shore chart',
        });
    });
}

// ─── SHEET 4: ABYSS (.j world abyss) ─────────────────────────────────────────
function renderAbyssSheet(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'SUB-MAP IV OF IV - THE DESCENT THAT DOES NOT ORBIT',
            'THE ABYSS',
            'rings upon rings, shrinking as they descend, without end');

        _centered(ctx, 'THE LIVING CIRCLES LIE ABOVE. THE ABYSS DOES NOT ORBIT THEM.',
            208, '13px "Cinzel"', PAL.inkSoft);

        _drawAbyssDescent(ctx, W / 2, 290, 1.0);

        const win = cosmology.abyssWindow(t);
        _plate(ctx, 55, 880, 420, 108, 'THE GATE', [
            'it opens for a while, then shuts.',
            'it does not shut for anyone already inside.',
        ]);
        _plate(ctx, 525, 880, 420, 108, 'BELOW', [
            'the rings continue past the last one drawn.',
            'expeditions stop numbering them.',
        ]);

        // LIVE gate status seal
        ctx.beginPath(); ctx.arc(W / 2, 1092, 64, 0, Math.PI * 2);
        ctx.fillStyle = win.open ? 'rgba(139,26,43,0.12)' : 'rgba(58,42,30,0.10)';
        ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = win.open ? PAL.wax : PAL.inkSoft; ctx.stroke();
        _centered(ctx, win.open ? 'GATE OPEN' : 'GATE LOCKED', 1086, '15px "Cinzel"', win.open ? PAL.wax : PAL.inkSoft);
        _centered(ctx, win.label.toUpperCase(), 1108, '14px "IM Fell"', PAL.inkSoft);

        _bottomStack(ctx, {
            legend: false,
            note: 'the abyss is not a region of any map. it is a separate structure beneath the circles',
            seal: 'IV',
            footer: '".j world abyss" - the deep chart',
        });
    });
}

// ─── SHEET 0: COSMOLOGY ATLAS (.j world all) ────────────────────────────────
// All four charts on one page: the living circles (World Beyond + First
// World, live geometry), the Afterlife's own circuit, and the Abyss descent.
// The four clocks stay separate systems - each body is drawn at ITS OWN
// live phase, nothing is merged into one clock.
function renderCosmologyAtlasSheet(t = Date.now()) {
    return _render((ctx) => {
        _titleBlock(ctx,
            'SUB-MAPS I-IV COMBINED',
            'THE COSMOLOGY',
            'every chart the guild holds, gathered on one page');

        // living circles (World Beyond boundary + First World inside), top half
        // (cy/R chosen so the WB top clears the title block's subtitle at y=172)
        const cx = W / 2, cy = 480, R = 250;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,210,178,0.45)'; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();

        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g);

        // labels: parchment pill underlay keeps them readable over dots/lines
        const _pill = (text, x, y, font, color) => {
            ctx.font = font;
            const w = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(234,221,196,0.85)';
            ctx.fillRect(x - w / 2 - 10, y - 15, w + 20, 22);
            _centered(ctx, text, y, font, color);
        };
        _pill('WORLD BEYOND', cx, cy - R - 16, '15px "Cinzel"', PAL.inkSoft);
        _pill('FIRST WORLD', cx, cy + 58, '18px "Cinzel"', PAL.ink);

        // Afterlife circuit (its own path, its own phase) - lower left
        const acx = 300, acy = 920, aR = 150;
        ctx.beginPath(); ctx.arc(acx, acy, aR, 0, Math.PI * 2);
        ctx.setLineDash([7, 8]); ctx.strokeStyle = PAL.afterlife; ctx.lineWidth = 1.8;
        ctx.stroke(); ctx.setLineDash([]);
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = acx + Math.cos(ap) * aR, ay = acy + Math.sin(ap) * aR;
        ctx.beginPath(); ctx.arc(ax, ay, 12, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();
        _pill('AFTERLIFE', acx, acy - 4, '14px "Cinzel"', PAL.afterlife);
        _pill('a circuit of its own', acx, acy + 18, 'italic 12px "IM Fell Italic"', PAL.inkSoft);

        // Abyss descent (does not orbit) - lower right
        _drawAbyssDescent(ctx, 700, 810, 0.72);
        _pill('THE ABYSS', 700, 772, '14px "Cinzel"', PAL.inkSoft);
        _pill('beneath, not around', 700, 1092, 'italic 12px "IM Fell Italic"', PAL.inkSoft);

        // triune alignment beam when it happens to be now
        const tri = cosmology.triuneWindow(t);
        if (tri.aligned) {
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(g.fwx, g.fwy + g.r);
            ctx.strokeStyle = PAL.wax; ctx.lineWidth = 2.4; ctx.stroke();
            _centered(ctx, 'THE THREE ARE ALIGNED NOW', 1130, '14px "Cinzel"', PAL.wax);
        }

        _bottomStack(ctx, {
            seal: 'I-IV',
            footer: '".j world all" - the gathered chart',
        });
    });
}

// ─── CANVAS DRIVER ───────────────────────────────────────────────────────────

function _render(drawFn) {
    try {
        const { createCanvas } = require('canvas');
        _ensureFonts();
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        _bg(ctx);
        drawFn(ctx);
        _frame(ctx);
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
    _liveGeometry,
    _worldDots,
    PAL,
    W, H,
};
