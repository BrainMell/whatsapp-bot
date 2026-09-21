// ═══════════════════════════════════════════════════════════════════════════
//  WORLD MAP RENDERER — live cosmology sheets (Royal Decree chrome)
// ═══════════════════════════════════════════════════════════════════════════
//
//  2026-09-21 OWNER VISUAL REDESIGN (second pass, after the owner rejected
//  the first one as "not actually redesigned"):
//    * THE FIRST WORLD sheet is now THE COSMOLOGICAL MAP: one large circle
//      for the whole world system, quadrant lines through it, and the
//      charted worlds drawn as smaller circles FILLED WITH THEIR REAL
//      BACKGROUND ART (the game's own environment images), plus new art for
//      worlds that had none (drowned sea / storm reach / ash gardens).
//    * THE GATHERED CHART (.j world all) keeps the owner-confirmed pass-3
//      geometry (invariants below) but the First World's interior now shows
//      the same image-worlds in miniature, the Afterlife is a SMALL ORBITING
//      DOT on its own wide dashed circuit, and the floating header plates
//      are gone.
//    * THE AFTERLIFE sheet OPENS THE DOT: the night realm is drawn large
//      (the veil, the issued worlds, the shore, the ferry), so the dot on
//      the gathered chart visibly "contains" all of this.
//    * THE ABYSS funnel no longer slides under its info plates (the owner
//      called it "severely misaligned": the big rings extended to x=670
//      while the plates start at x=610, so the rings were clipped).
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
// Fonts resolve relative to this module with per-file TTF/OTF magic guards
// (LFS-pointer safe). The old hardcoded dev path is what silently broke every
// world sheet in production (ENOENT -> text fallback).
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
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

// ─── WORLD CATALOG (the charted worlds, drawn with their own skies) ──────────
// 2026-09-21 owner brief: the map's smaller circles should "contain images of
// the various existing backgrounds, along with new backgrounds for worlds that
// need them". The guild names a world only after an expedition returns, so the
// chart uses surveyor field names. Types follow the standing legend.
const CARD_ART_DIR = path.join(__dirname, '..', 'rpgasset', 'environment', 'cards');
const ENV_ART_DIR = path.join(__dirname, '..', 'rpgasset', 'environment');

const WORLD_CATALOG = [
    { key: 'ember',      name: 'the ember fields', art: 'cards/fire.jpg',    type: 'known' },
    { key: 'frost',      name: 'the frost reach',  art: 'cards/ice.jpg',     type: 'known' },
    { key: 'wildwood',   name: 'the wildwood',     art: 'cards/forest.jpg',  type: 'known' },
    { key: 'stormreach', name: 'the storm reach',  art: 'cards/storm.jpg',   type: 'known' },
    { key: 'venom',      name: 'the venom marsh',  art: 'cards/toxic.jpg',   type: 'corrupted' },
    { key: 'sunscorch',  name: 'the sunscorch',    art: 'cards/desert.jpg',  type: 'corrupted', sy: 0.30 },
    { key: 'drowned',    name: 'the drowned sea',  art: 'cards/sea.jpg',     type: 'corrupted' },
    { key: 'blackkeep',  name: 'the black keep',   art: 'spark_10.png',      type: 'dungeon', dir: 'env' },
    { key: 'ash',        name: 'the ash gardens',  art: 'cards/ash.jpg',     type: 'dungeon' },
];

const _artCache = new Map();

/** Load one environment image with a magic-byte guard (skips LFS pointers).
 *  rel is repo-relative to the environment dir ('cards/fire.jpg',
 *  'spark_10.png'). */
async function _loadArtImg(rel) {
    const key = String(rel);
    if (_artCache.has(key)) return _artCache.get(key);
    let out = null;
    try {
        const p = path.join(ENV_ART_DIR, rel);
        const head = fs.existsSync(p) ? fs.readFileSync(p).slice(0, 4) : Buffer.alloc(0);
        const ok = head.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))      // PNG
            || head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF;    // JPEG
        if (ok) out = await require('canvas').loadImage(p);
    } catch (e) { out = null; }
    _artCache.set(key, out);
    return out;
}

/** Preload every catalog sky. Missing art degrades to type-colored disks. */
async function _loadWorldArt() {
    const out = {};
    for (const w of WORLD_CATALOG) {
        const img = await _loadArtImg(w.art, w.dir);
        if (img) out[w.key] = img;
    }
    return out;
}

// ─── SEEDED SCATTER (deterministic world dots — no state) ────────────────────
function _mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Uncatalogued worlds scatter freely across ALL FOUR quadrants (invariant #3).
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

/** Royal Decree info plate: tan fill, ink border, inner hairline. */
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

/** Large wax seal (the pass-3 renders' bottom seal). */
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

/** Parchment pill under a label so it stays readable over any structure.
 *  Each line is measured in its OWN font (the old single-font measurement
 *  inflated pills to banner width). opts.lh tightens the row height. */
function _pillLabel(ctx, lines, cx, cy, font, color, opts = {}) {
    let wMax = 0;
    for (const l of lines) {
        ctx.font = (typeof l === 'object' ? l.font : font) || font;
        wMax = Math.max(wMax, ctx.measureText(typeof l === 'object' ? l.text : l).width);
    }
    ctx.font = font;
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

/** Dark plate background for the decree-dark sheets. */
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

// ─── IMAGE WORLD CIRCLES (2026-09-21 owner redesign) ─────────────────────────

/** One charted world: a small circle FILLED WITH ITS OWN BACKGROUND ART,
 *  ringed in its type color, hairline outside. The art is sampled from the
 *  upper middle of the source (the Go card art carries a dark UI bar at the
 *  bottom that must never leak into a map circle). */
function _drawWorldCircle(ctx, x, y, r, world, img, opts = {}) {
    // disk: art if we have it, else the type color
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    if (img) {
        const iw = img.width, ih = img.height;
        const srcH = ih * 0.55, srcW = srcH;
        const syBias = world.sy != null ? world.sy : 0.08;
        const sx = Math.max(0, (iw - srcW) / 2), sy = ih * syBias;
        ctx.drawImage(img, sx, sy, srcW, srcH, x - r, y - r, r * 2, r * 2);
        // rim shading so every world sits like a sphere on the chart
        const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.82, 'rgba(10,6,2,0)');
        g.addColorStop(1, 'rgba(10,6,2,0.42)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = PAL[world.type] || PAL.known;
        ctx.fill();
    }
    ctx.restore();
    // type ring + hairline (the legend's colors keep working)
    ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
    ctx.strokeStyle = PAL[world.type]; ctx.lineWidth = opts.ringW || 2.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r + 5.4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
}

/** Tiny parchment tag under a world's name: the chart's annotation language,
 *  keeps the name readable wherever the radial position meets another rim. */
function _worldTag(ctx, text, x, y) {
    ctx.font = 'italic 11.5px "IM Fell Italic"';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(250,243,224,0.85)';
    ctx.fillRect(x - w / 2, y - 11, w, 15);
    ctx.fillStyle = PAL.inkSoft; ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
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

    // the charted worlds: miniature image circles (atlas scale), rotating
    // with the disk. Falls back to the type dots when art is unavailable.
    if (opts.mini && opts.art) {
        const MINI = [
            ['ember', 0.62, 0.58], ['frost', 2.42, 0.52], ['venom', 3.72, 0.66],
            ['sunscorch', 4.92, 0.50], ['wildwood', 5.62, 0.70],
        ];
        for (const [key, ang, rad] of MINI) {
            const w = WORLD_CATALOG.find((wc) => wc.key === key);
            const lx = Math.cos(ang + theta) * rad * r;
            const ly = Math.sin(ang + theta) * rad * r;
            _drawWorldCircle(ctx, fwx + lx, fwy + ly, r * 0.115, w, opts.art[key], { ringW: 1.6 });
        }
        // a few uncatalogued dots keep the "worlds without number" texture
        ctx.font = '12px "Cinzel"';
        for (const d of _worldDots().slice(0, 9)) {
            const lx = Math.cos(d.ang + theta) * d.rad * r;
            const ly = Math.sin(d.ang + theta) * d.rad * r;
            if (MINI.some(([, a, rd]) => Math.hypot(Math.cos(a + theta) * rd - Math.cos(d.ang + theta) * d.rad, Math.sin(a + theta) * rd - Math.sin(d.ang + theta) * d.rad) < 0.24)) continue;
            ctx.beginPath(); ctx.arc(fwx + lx, fwy + ly, d.r * 0.62, 0, Math.PI * 2);
            ctx.fillStyle = PAL[d.type]; ctx.fill();
            ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.stroke();
        }
    } else {
        // scattered worlds (invariant #3: free scatter, all quadrants)
        for (const d of _worldDots()) {
            const lx = Math.cos(d.ang + theta) * d.rad * r;
            const ly = Math.sin(d.ang + theta) * d.rad * r;
            ctx.beginPath(); ctx.arc(fwx + lx, fwy + ly, d.r, 0, Math.PI * 2);
            ctx.fillStyle = PAL[d.type]; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.stroke();
        }
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

// ─── SHEET 1: FIRST WORLD (.j world) — THE COSMOLOGICAL MAP ──────────────────
// 2026-09-21 owner brief: "make it one large circle representing the overall
// world system. Draw quadrant lines through it, then place smaller circles
// throughout it to represent the different worlds. Those smaller circles
// should contain images of the various existing backgrounds, along with new
// backgrounds for worlds that need them."
//
// So the sheet IS the world now: one large circle (R=400), the co-rotating
// quadrant cross, nine charted worlds drawn as art-filled circles with their
// surveyor names, twenty-four uncharted worlds in four COMPANIES OF SIX
// (rosary, taper, chain, scatter - the owner's density order), the
// Presence at the center, the wax marker on its dashed ride, the bottom link,
// and the World Beyond boundary arcing over the whole chart (its center rests
// on the First World's bottom link - the exact pass-3 tangent geometry, seen
// from inside at the link hour).
async function renderFirstWorldSheet(t = Date.now()) {
    const art = await _loadWorldArt();
    return _render(async (ctx) => {
        _titleBlock(ctx,
            'SUB-MAP I OF IV',
            'THE FIRST WORLD',
            '"the world". the quadrants hold every kind of world');

        const cx = W / 2, cy = 660, R = 400;

        // the World Beyond boundary: a great dashed arc over the chart. Its
        // center sits on the First World's bottom link and its rim passes
        // through the world's center and its far rim - invariant #1, drawn
        // from inside at the link hour.
        ctx.save();
        ctx.beginPath(); ctx.rect(37, 37, W - 74, H - 74); ctx.clip();
        ctx.beginPath(); ctx.arc(cx, cy + R, R * 2, 0, Math.PI * 2);
        ctx.setLineDash([7, 8]);
        ctx.strokeStyle = 'rgba(58,42,30,0.4)'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        _pillLabel(ctx, [
            { text: 'THE WORLD BEYOND', font: '13px "Cinzel"', color: PAL.ink },
            { text: 'its center rests on the bottom link', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
        ], 500, 240, '13px "Cinzel"', PAL.ink, { lh: 18, bg: 'rgba(240,228,196,0.94)' });

        // the world itself
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250,243,224,0.92)'; ctx.fill();
        ctx.lineWidth = 2.8; ctx.strokeStyle = PAL.ink; ctx.stroke();

        // quadrant cross co-rotating with the live pose (invariant #3)
        const g = _liveGeometry(cx, cy, R, t);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(g.theta);
        ctx.strokeStyle = 'rgba(58,42,30,0.5)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
        ctx.restore();

        // quadrant numerals (co-rotate positions, upright text)
        ctx.font = '16px "Cinzel"'; ctx.fillStyle = 'rgba(90,70,52,0.8)'; ctx.textAlign = 'center';
        const qr = R * 0.72;
        const qpos = [[qr * 0.75, -qr * 0.75, 'I'], [-qr * 0.75, -qr * 0.75, 'II'], [-qr * 0.75, qr * 0.75, 'III'], [qr * 0.75, qr * 0.75, 'IV']];
        for (const [qx, qy, label] of qpos) {
            const rx = cx + qx * Math.cos(g.theta) - qy * Math.sin(g.theta);
            const ry = cy + qx * Math.sin(g.theta) + qy * Math.cos(g.theta);
            ctx.fillText(label, rx, ry + 5);
        }

        // ── the charted worlds: art-filled circles + surveyor names ──
        // PLACED is POLAR relative to the world's center and the whole chart
        // content CO-ROTATES with the live quadrant cross (invariant #3, the
        // same language the atlas mini worlds use). Relative geometry is
        // therefore phase-invariant: a label that is clear at one phase is
        // clear at every phase. Label = radial, just past the ring.
        const PLACED = [
            // key,          radius, angle(rad), r   labelRad
            ['ember',        242, 4.055, 46, 305],
            ['stormreach',   277, -1.201, 42, 336],
            ['frost',        224, -0.464, 40, 281],
            ['wildwood',     271, -2.985, 36, 324],
            ['venom',        220, 2.437, 40, 277],
            ['sunscorch',    207, 0.691, 44, 268],
            ['drowned',      303, 2.864, 34, 354],
            ['ash',          268, 0.0447, 32, 317],
            ['blackkeep',    96, -0.896, 28, 141],
        ];
        for (const [key, rad, ang, r, labelRad] of PLACED) {
            const w = WORLD_CATALOG.find((wc) => wc.key === key);
            const a = ang + g.theta;
            const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
            _drawWorldCircle(ctx, x, y, r, w, art[key]);
            _worldTag(ctx, w.name, cx + Math.cos(a) * labelRad, cy + Math.sin(a) * labelRad + 4);
        }

        // the marker's ride: dashed circle UNDER the worlds, wax marker at
        // the live phase on top
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.setLineDash([4, 5]); ctx.strokeStyle = PAL.waxSoft; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);

        // ── the uncharted worlds: THE COMPANY OF SIX (2026-09-21 owner
        // density order: more worlds on the map, grouped in sixes, each
        // group its own character so the chart never repeats itself).
        // All positions are polar + co-rotating (phase-invariant, like the
        // charted worlds above). Four companies, four tempers:
        //   1. THE ROSARY    - six known worlds in a perfect inner ring
        //   2. THE TAPER     - six corrupted worlds strung along the rim,
        //                      dwindling as the arc runs
        //   3. THE CHAIN     - six worlds marching a diagonal, alternating
        //                      known and dungeon-world
        //   4. THE SCATTER   - six dungeon-worlds loose near the rim
        // ──
        const _gDot = (gx, gy, gr, type) => {
            ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2);
            ctx.fillStyle = PAL[type]; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(58,42,30,0.4)'; ctx.stroke();
        };
        const gPos = (rad, ang) => [cx + Math.cos(ang + g.theta) * rad, cy + Math.sin(ang + g.theta) * rad];

        // 1. THE ROSARY - six known worlds, one perfect ring, upper inner disk
        {
            const [gx0, gy0] = gPos(200, -1.75);
            const rr = 26;
            ctx.beginPath(); ctx.arc(gx0, gy0, rr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(46,110,115,0.4)'; ctx.lineWidth = 1; ctx.stroke();
            for (let k = 0; k < 6; k++) {
                const a = -Math.PI / 2 + k * (Math.PI / 3);
                _gDot(gx0 + Math.cos(a) * rr, gy0 + Math.sin(a) * rr, 8, 'known');
            }
        }
        // 2. THE TAPER - six corrupted worlds along the upper-left rim, 9 -> 5
        {
            const a0 = -2.5, a1 = -1.7, rad = 352;
            ctx.beginPath();
            for (let k = 0; k <= 20; k++) {
                const a = a0 + (a1 - a0) * (k / 20);
                const [px, py] = gPos(rad, a);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = 'rgba(156,91,35,0.4)'; ctx.lineWidth = 1; ctx.stroke();
            for (let k = 0; k < 6; k++) {
                const f = k / 5;
                const [px, py] = gPos(rad + (k % 2 ? 8 : -6), a0 + (a1 - a0) * f);
                _gDot(px, py, 9 - f * 4, 'corrupted');
            }
        }
        // 3. THE CHAIN - six worlds marching a lower diagonal, alternating
        {
            const ang = 1.85, rads = [185, 225, 265, 300, 335, 372];
            ctx.beginPath();
            rads.forEach((rd, k) => {
                const [px, py] = gPos(rd, ang);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.lineWidth = 1; ctx.stroke();
            rads.forEach((rd, k) => {
                const [px, py] = gPos(rd, ang);
                _gDot(px, py, k % 2 ? 6.5 : 8.5, k % 2 ? 'dungeon' : 'known');
            });
        }
        // 4. THE SCATTER - six dungeon-worlds loose near the lower-right rim
        {
            const pts = [[345, 0.30, 7], [372, 0.52, 6], [336, 0.78, 8], [368, 0.98, 6], [342, 1.18, 7], [376, 1.38, 5]];
            for (const [rad, ang, r] of pts) {
                const [px, py] = gPos(rad, ang);
                _gDot(px, py, r, 'dungeon');
            }
        }

        ctx.beginPath(); ctx.arc(g.mi.x, g.mi.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = PAL.wax; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = PAL.parchment; ctx.stroke();

        // the Presence of Order at the exact center (invariant #2). The name
        // is a FIXED chip drawn at the very end of the sheet: the text is
        // horizontal, so a rotating anchor would sweep a box that the
        // co-rotating companies pass through at other phases - the old
        // rosary-through-the-label collision. The chip masks whatever the
        // live cross sends beneath it.
        ctx.beginPath(); ctx.arc(cx, cy, 21, 0, Math.PI * 2);
        ctx.fillStyle = PAL.gold; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.7)'; ctx.lineWidth = 1.3; ctx.stroke();

        // the bottom / Abyss-linking point
        ctx.beginPath(); ctx.arc(cx, cy + R, 8, 0, Math.PI * 2);
        ctx.fillStyle = PAL.wax; ctx.fill();
        if (g.atBottom) {
            ctx.font = 'italic 14px "IM Fell Italic"';
            ctx.fillStyle = PAL.ink; ctx.textAlign = 'left';
            ctx.fillText('the bottom link is engaged now', cx + 16, cy + R + 5);
        }

        // the Presence's name chip, FIXED, COMPACT (two lines) and LAST.
        // Compact + hugging the medallion keeps its footprint inside the
        // innermost sweeping band, so a passing world tag can only graze a
        // corner instead of disappearing under a full-width chip.
        _pillLabel(ctx, [
            { text: 'the Presence', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'of Order', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
        ], cx - 58, cy - 50, '11.5px "IM Fell Italic"', PAL.inkSoft, { lh: 16 });

        // ── plates ──
        _plate(ctx, 55, 1088, 430, 92, 'CHARTED WORLDS', [
            'nine skies are drawn with their worlds.',
            'the uncharted travel in company - the surveyors',
            'chart them in sixes, each company its own temper.',
        ]);
        _plate(ctx, 515, 1088, 430, 92, 'QUADRANT LAW', [
            'divisions of the First World, not borders.',
            'every quadrant holds known, corrupted, and worse.',
        ]);

        _legend(ctx, 1216);
        _centered(ctx, 'timelines are not mapped. every world holds more than the guild can chart',
            1242, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
        _liveStrip(ctx, 1272);
        _centered(ctx, '".j world" - the chart every adventurer carries',
            1352, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
        _waxSeal(ctx, 80, H - 62, 'I');
    });
}

// ─── SHEET: THE PRESENCE OF ORDER (.j world order) — the center held ────────
// 2026-09-21 owner order: "Create a map showing the Presence of Order portion
// of the cosmology." The Presence's portion is the CENTER: it sits at the
// First World's exact center (invariant #2) and moves with it - it is NOT the
// World Beyond's center. So the sheet draws:
//   * the First World's rim as the container, the quadrant law radiating
//     from the center it holds (co-rotating, invariants #2 + #3);
//   * fine order rings + tick work around the medallion - the order itself;
//   * the live wax ride and the bottom link (the same contracts as the
//     First World sheet);
//   * THE RIDE inset: the Presence drawn where it actually lives - at the
//     center of the First World riding inside the World Beyond - with the
//     boundary's own center marked and refused ("not here").
function renderPresenceOfOrderSheet(t = Date.now()) {
    return _render(async (ctx) => {
        _titleBlock(ctx,
            'THE COSMOLOGY - THE CENTER OF THE FIRST WORLD',
            'THE PRESENCE OF ORDER',
            'it holds the center, and the center holds the quadrants');

        const cx = W / 2, cy = 600, R = 330;

        // the First World's rim: the container of the Presence (light disk)
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250,243,224,0.92)'; ctx.fill();
        ctx.lineWidth = 2.8; ctx.strokeStyle = PAL.ink; ctx.stroke();

        // the order rings: fine circles around the center + tick work on the
        // outermost - the texture of the law it holds
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.clip();
        for (const [rr, al] of [[60, 0.3], [105, 0.24], [150, 0.2]]) {
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(58,42,30,${al})`; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(58,42,30,0.3)'; ctx.lineWidth = 1;
        for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 144, cy + Math.sin(a) * 144);
            ctx.lineTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
            ctx.stroke();
        }
        ctx.restore();

        // quadrant cross + numerals, CO-ROTATING with the live pose (the
        // quadrant law radiates from the center the Presence holds)
        const g = _liveGeometry(cx, cy, R, t);
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(g.theta);
        ctx.strokeStyle = 'rgba(58,42,30,0.5)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
        ctx.restore();
        ctx.font = '16px "Cinzel"'; ctx.fillStyle = 'rgba(90,70,52,0.8)'; ctx.textAlign = 'center';
        const qr = R * 0.72;
        const qpos = [[qr * 0.75, -qr * 0.75, 'I'], [-qr * 0.75, -qr * 0.75, 'II'], [-qr * 0.75, qr * 0.75, 'III'], [qr * 0.75, qr * 0.75, 'IV']];
        for (const [qx, qy, label] of qpos) {
            const rx = cx + qx * Math.cos(g.theta) - qy * Math.sin(g.theta);
            const ry = cy + qx * Math.sin(g.theta) + qy * Math.cos(g.theta);
            ctx.fillText(label, rx, ry + 5);
        }

        // a few of the worlds the order holds (type dots, co-rotating; the
        // full census lives on the First World sheet)
        const DOTS = [[195, -1.2, 7, 'known'], [238, -2.2, 6, 'corrupted'], [182, -3.4, 7, 'dungeon'],
            [262, 0.5, 6, 'known'], [214, 1.5, 7, 'corrupted'], [268, 2.5, 6, 'dungeon'],
            [196, 3.6, 7, 'known'], [248, 4.4, 6, 'corrupted'], [176, 5.3, 7, 'dungeon'],
            [276, 5.9, 6, 'known'], [158, 0.15, 5, 'corrupted'], [286, -0.9, 6, 'dungeon']];
        for (const [rad, ang, r, type] of DOTS) {
            const a = ang + g.theta;
            ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, r, 0, Math.PI * 2);
            ctx.fillStyle = PAL[type]; ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.stroke();
        }

        // the wax ride + live marker (the Presence's world moves)
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.setLineDash([4, 5]); ctx.strokeStyle = PAL.waxSoft; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);

        // the PRESENCE: gold medallion with rays at the exact center. Its
        // label is a FIXED parchment chip (not a rotating anchor): the text
        // is horizontal, so a rotating anchor would sweep a box that
        // co-rotating worlds pass through at other phases. The chip is drawn
        // LAST so anything the live quadrant cross sends beneath it stays
        // masked.
        ctx.strokeStyle = 'rgba(166,124,46,0.7)'; ctx.lineWidth = 1.2;
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
            ctx.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
            ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.fillStyle = PAL.gold; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.7)'; ctx.lineWidth = 1.3; ctx.stroke();

        // the live marker on the ride
        ctx.beginPath(); ctx.arc(g.mi.x, g.mi.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = PAL.wax; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = PAL.parchment; ctx.stroke();

        // the bottom / Abyss-linking point of the world it holds
        ctx.beginPath(); ctx.arc(cx, cy + R, 8, 0, Math.PI * 2);
        ctx.fillStyle = PAL.wax; ctx.fill();
        if (g.atBottom) {
            ctx.font = 'italic 14px "IM Fell Italic"';
            ctx.fillStyle = PAL.ink; ctx.textAlign = 'left';
            ctx.fillText('the bottom link is engaged now', cx + 16, cy + R + 5);
        }

        // the Presence's name chip, FIXED, COMPACT and LAST (masks the
        // rotating cross; small enough that a passing world dot only grazes
        // its corner)
        _pillLabel(ctx, [
            { text: 'the Presence', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'of Order', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
        ], cx - 58, cy - 50, '11.5px "IM Fell Italic"', PAL.inkSoft, { lh: 16 });

        // ── THE RIDE inset: where the Presence actually lives - at the
        // center of the First World, riding inside the World Beyond - with
        // the boundary's own center marked and refused ──
        const ix = 150, iy = 935, iR = 70;
        ctx.beginPath(); ctx.arc(ix, iy, iR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,210,178,0.5)'; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(58,42,30,0.8)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(ix, iy, iR / 2, 0, Math.PI * 2);
        ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(58,42,30,0.45)'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.setLineDash([]);
        const gi = _liveGeometry(ix, iy, iR, t);
        ctx.beginPath(); ctx.arc(gi.fwx, gi.fwy, gi.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250,243,224,0.95)'; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.beginPath(); ctx.arc(gi.fwx, gi.fwy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.gold; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = PAL.ink; ctx.stroke();
        // the World Beyond's center: where the Presence is NOT
        ctx.beginPath(); ctx.arc(ix, iy, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139,26,43,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix - 3.2, iy - 3.2); ctx.lineTo(ix + 3.2, iy + 3.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + 3.2, iy - 3.2); ctx.lineTo(ix - 3.2, iy + 3.2); ctx.stroke();
        ctx.font = '12px "Cinzel"'; ctx.fillStyle = PAL.ink; ctx.textAlign = 'center';
        ctx.fillText('THE RIDE', ix, iy + iR + 26);
        ctx.font = 'italic 11px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('it moves when the world moves -', ix, iy + iR + 44);
        ctx.fillText('one orbit: 5 real hours', ix, iy + iR + 60);
        ctx.fillStyle = PAL.wax;
        ctx.fillText('the crossed ring is the Beyond\u2019s center - not here', ix, iy + iR + 76);

        // ── plates ──
        _plate(ctx, 55, 1088, 430, 92, 'THE CENTER HELD', [
            'the Presence sits at the First World\u2019s center,',
            'not the World Beyond\u2019s. it moves when the world moves.',
        ]);
        _plate(ctx, 515, 1088, 430, 92, 'THE QUADRANT LAW', [
            'four divisions radiate from the center it holds.',
            'divisions, not borders - every quadrant holds all kinds.',
        ]);

        _legend(ctx, 1216);
        _centered(ctx, 'timelines are not mapped. every world holds more than the guild can chart',
            1242, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
        _liveStrip(ctx, 1272);
        _centered(ctx, '".j world order" - the chart of the center',
            1352, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
        _waxSeal(ctx, 80, H - 62, 'O');
    });
}

// ─── SHEET 2: WORLD BEYOND (.j world beyond) — pass3_owner_geometry ─────────
// The approved pass-3 render (submap_world_beyond.png) is the DECREE-DARK
// variant: black plate, gold rim, radial rays, the First World as a dark
// gold-lined disk riding its dashed orbit, and the big gold realm label.
//
// 2026-09-21 OWNER DENSITY/DETAIL ORDER: "a more detailed map of the world
// beyond, clearly showing the First World contained within it as a lower
// dimension." The sheet now PROVES the containment instead of just stating
// it:
//   * the dimensional boundary - a fine double gold ring just outside the
//     First World's rim, where the lower dimension ends;
//   * the tangent construction - a live radial from the boundary's center
//     through the First World: a crosshair where the near rim RESTS on the
//     Beyond's exact center, a tick where the far rim TOUCHES the outer
//     boundary (invariant #1, drawn, not only quoted);
//   * a SECTION view under the plan: the Beyond as a ground line, the First
//     World pressed into it as a shallow depression with the Presence at
//     its bottom - a lower dimension, in elevation;
//   * the realm label moved into the one pocket the live disk can never
//     occupy (anti-pose, measured), so nothing crosses the disk's rim any
//     more (the old pill rode across it at several phases).
function renderWorldBeyondSheet(t = Date.now()) {
    return _render(async (ctx) => {
        // header (the live gate IS rank S, so the design's requirement lines
        // are used verbatim)
        _spaced(ctx, 'SUB-MAP II OF IV - GOD-RANK REALM', W / 2, 88, '14px "Cinzel"', '#C9A24B', 3);
        _spaced(ctx, 'THE WORLD BEYOND', W / 2, 152, '50px "Cinzel Deco"', '#D9B95C', 4);
        ctx.strokeStyle = 'rgba(201,162,75,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(310, 178); ctx.lineTo(690, 178); ctx.stroke();
        ctx.fillStyle = PAL.wax;
        ctx.fillRect(W / 2 - 6, 170, 12, 16);
        _centered(ctx, '"j world beyond" requirement: S RANK,', 216, 'italic 16px "IM Fell Italic"', '#C9A24B');
        _centered(ctx, 'what the rank-gated viewer is told: "S Rank is required to chart the World Beyond."',
            244, 'italic 15px "IM Fell Italic"', '#9A7D3A');

        // ── the great boundary: gold rim, dark interior, radial rays ──
        const cx = W / 2, cy = 570, R = 315;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#17110B'; ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(201,162,75,0.9)'; ctx.stroke();
        // rays: thin gold hairlines from the rim fading inward (the design's
        // "vast, unchartable" texture)
        ctx.strokeStyle = 'rgba(201,162,75,0.13)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
            ctx.lineTo(cx + Math.cos(a) * (R * 0.44), cy + Math.sin(a) * (R * 0.44));
            ctx.stroke();
        }

        // the First World's orbit path around the boundary's center (R/2)
        ctx.beginPath(); ctx.arc(cx, cy, R / 2, 0, Math.PI * 2);
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = 'rgba(201,162,75,0.4)'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.setLineDash([]);

        // live geometry + the tangent construction (drawn under the disk)
        const g = _liveGeometry(cx, cy, R, t);
        const fwAng = Math.atan2(g.fwy - cy, g.fwx - cx);
        const anti = fwAng + Math.PI;
        // the live radial: from the boundary's center through the First
        // World's center out to the rim - the measuring line of invariant #1
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(201,162,75,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(fwAng) * (R - 4), cy + Math.sin(fwAng) * (R - 4));
        ctx.stroke();
        ctx.restore();
        // T2: the far-rim tick, just inside the outer boundary on the radial
        ctx.strokeStyle = 'rgba(201,162,75,0.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(fwAng) * (R - 13), cy + Math.sin(fwAng) * (R - 13));
        ctx.lineTo(cx + Math.cos(fwAng) * (R - 3), cy + Math.sin(fwAng) * (R - 3));
        ctx.stroke();

        // ── the First World, dark variant (design: gold-lined disk) ──
        _drawFirstWorldDark(ctx, g);

        // the DIMENSIONAL BOUNDARY: fine double ring just outside the rim -
        // where the lower dimension ends. Drawn over the rays, under the
        // labels; travels with the disk.
        ctx.beginPath(); ctx.arc(g.fwx, g.fwy, g.r + 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.arc(g.fwx, g.fwy, g.r + 13.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(201,162,75,0.26)'; ctx.lineWidth = 0.9; ctx.stroke();

        // T1: the boundary's exact center, where the near rim RESTS -
        // a crosshair (the 'A LOWER DIMENSION' plate names it; no floating
        // tag - the anti ray is reserved for the travelling labels)
        ctx.strokeStyle = 'rgba(201,162,75,0.9)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.stroke();

        // orbit annotation: one orbit, 5 real hours - on the anti-pose side
        // of the orbit path (the arc the disk's ±60° coverage can never
        // hide), offset perpendicular so it can never meet the travelling
        // FIRST WORLD tag on the same ray. Clockwise arrow fully outside the
        // covered arc.
        const orbR = R / 2;
        const perp = fwAng - Math.PI / 2;
        ctx.font = 'italic 13px "IM Fell Italic"'; ctx.fillStyle = '#9A7D3A'; ctx.textAlign = 'center';
        ctx.fillText('one orbit: 5 real hours',
            cx + Math.cos(anti) * (orbR + 30) + Math.cos(perp) * 44,
            cy + Math.sin(anti) * (orbR + 30) + Math.sin(perp) * 44 + 4);
        const a0 = (g.theta || 0) + 1.12, a1 = (g.theta || 0) + 1.42;
        _curveArrow(ctx,
            cx + Math.cos(a0) * orbR, cy + Math.sin(a0) * orbR,
            cx + Math.cos((a0 + a1) / 2) * (orbR * 1.16), cy + Math.sin((a0 + a1) / 2) * (orbR * 1.16),
            cx + Math.cos(a1) * orbR, cy + Math.sin(a1) * orbR,
            'rgba(201,162,75,0.75)', 1.6);

        // FIRST WORLD tag travels with the disk, just past the dimensional
        // boundary rings on the anti side (the pocket between the rings and
        // the boundary's center crosshair)
        _pillLabel(ctx, [
            { text: 'FIRST WORLD (IN ORBIT)', font: '14px "Cinzel"', color: '#D9B95C' },
        ], g.fwx + Math.cos(anti) * (g.r + 36), g.fwy + Math.sin(anti) * (g.r + 36), '14px "Cinzel"', '#D9B95C',
            { bg: 'rgba(13,9,6,0.78)', edge: 'rgba(201,162,75,0.45)' });

        // ── the realm label: FIXED, outside the great circle, directly
        // beneath it (figure-caption position). Every interior point is
        // covered by the disk at some phase (the disk spans the whole
        // radial), and the interior anti pocket is needed by the travelling
        // tag - so the realm name lives where NOTHING can ever reach it,
        // with a short leader onto the rim. ──
        ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy + R + 2); ctx.lineTo(cx, cy + R + 14); ctx.stroke();
        _pillLabel(ctx, [
            { text: 'THE WORLD BEYOND', font: '24px "Cinzel"', color: '#D9B95C' },
            { text: 'the space it does not occupy', font: 'italic 12px "IM Fell Italic"', color: 'rgba(217,185,92,0.85)' },
            { text: 'god-rank vast · above dimensionality · unnamed', font: 'italic 11.5px "IM Fell Italic"', color: '#C9A24B' },
        ], cx, cy + R + 48, '24px "Cinzel"', '#D9B95C',
            { bg: 'rgba(13,9,6,0.9)', edge: 'rgba(201,162,75,0.4)', lh: 22 });

        // ── SECTION: the same containment, in elevation. The Beyond as a
        // ground line; the First World pressed into it as a shallow
        // depression, the Presence at its bottom. ──
        const sbY = 1046;
        _spaced(ctx, 'SECTION', 152, 1014, '12px "Cinzel"', '#9A7D3A', 3);
        ctx.font = 'italic 11.5px "IM Fell Italic"'; ctx.fillStyle = '#9A7D3A'; ctx.textAlign = 'right';
        ctx.fillText('the World Beyond, in section', 848, 1014);
        // ground: fill the solid earth below the line, then the depression
        ctx.fillStyle = 'rgba(201,162,75,0.07)';
        ctx.fillRect(170, sbY, 660, 6);
        // the sag (the First World's depression), filled darker + stroked
        ctx.beginPath();
        ctx.moveTo(360, sbY);
        ctx.quadraticCurveTo(500, sbY + 88, 640, sbY);
        ctx.closePath();
        ctx.fillStyle = '#0B0805'; ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,75,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
        // ground hatching on both sides of the sag
        ctx.strokeStyle = 'rgba(201,162,75,0.4)'; ctx.lineWidth = 1;
        for (let x = 178; x <= 344; x += 14) {
            ctx.beginPath(); ctx.moveTo(x, sbY + 3); ctx.lineTo(x - 7, sbY + 12); ctx.stroke();
        }
        for (let x = 656; x <= 822; x += 14) {
            ctx.beginPath(); ctx.moveTo(x, sbY + 3); ctx.lineTo(x - 7, sbY + 12); ctx.stroke();
        }
        // the First World in section: the disk resting in the depression
        ctx.beginPath(); ctx.arc(500, sbY + 22, 24, 0, Math.PI * 2);
        ctx.fillStyle = '#1D140C'; ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,75,0.95)'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath(); ctx.arc(500, sbY + 22, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = '#C9A24B'; ctx.fill();
        // depth ticks from the ground line down to the disk's shoulder
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(468, sbY + 2); ctx.lineTo(468, sbY + 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(532, sbY + 2); ctx.lineTo(532, sbY + 30); ctx.stroke();
        ctx.setLineDash([]);
        _centered(ctx, 'the First World, held as a lower dimension', sbY + 66, 'italic 12.5px "IM Fell Italic"', '#C9A24B');

        // ── plates (design texts, tan on dark) ──
        _decreePlate(ctx, 64, 1160, 400, 132, 'A LOWER DIMENSION', [
            'the near rim rests on the Beyond\u2019s',
            'center; the far rim touches the outer',
            'boundary - the whole of it held, the',
            'way the sea holds a bubble.',
        ], { onDark: true });
        _decreePlate(ctx, 536, 1160, 400, 132, 'THE NAME', [
            'no name is written for this realm.',
            '"beyond the veil" already means',
            'GOD ascension in canon. unnamed by law.',
        ], { onDark: true });

        // seal + footer (design: no clocks strip on this sheet)
        _waxSealBig(ctx, 80, H - 74, 26, 'S');
        _centered(ctx, '"j world beyond" own sheet, own lore card · never a crop of the First World map',
            1356, 'italic 12px "IM Fell Italic"', 'rgba(201,162,75,0.55)');
    }, { dark: true });
}

/** The First World drawn in the World Beyond sheet's dark variant: gold-lined
 *  dark disk, gold quadrant cross, gold Presence, wax marker - no world dots
 *  (the design reserves the dots for the First World's own sheet). Same live
 *  geometry contract as the light variant (invariants #1-#3). */
function _drawFirstWorldDark(ctx, g) {
    const { r, fwx, fwy, theta } = g;
    ctx.beginPath(); ctx.arc(fwx, fwy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1D140C'; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(201,162,75,0.95)'; ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.arc(fwx, fwy, r - 1, 0, Math.PI * 2); ctx.clip();
    ctx.translate(fwx, fwy); ctx.rotate(theta);
    ctx.strokeStyle = 'rgba(201,162,75,0.5)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.restore();

    ctx.font = '12px "Cinzel"'; ctx.fillStyle = 'rgba(201,162,75,0.75)'; ctx.textAlign = 'center';
    const qr = r * 0.74;
    const qpos = [[qr * 0.75, -qr * 0.75, 'I'], [-qr * 0.75, -qr * 0.75, 'II'], [-qr * 0.75, qr * 0.75, 'III'], [qr * 0.75, qr * 0.75, 'IV']];
    for (const [qx, qy, label] of qpos) {
        const rx = fwx + qx * Math.cos(theta) - qy * Math.sin(theta);
        const ry = fwy + qx * Math.sin(theta) + qy * Math.cos(theta);
        ctx.fillText(label, rx, ry + 4);
    }

    // marker riding the clockwise path through the disk
    ctx.beginPath(); ctx.arc(fwx, fwy, r * 0.55, 0, Math.PI * 2);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(139,26,43,0.8)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(g.mi.x, g.mi.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#C9A24B'; ctx.stroke();

    // Presence of Order at the disk's center
    ctx.beginPath(); ctx.arc(fwx, fwy, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#C9A24B'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#0D0906'; ctx.stroke();
    ctx.beginPath(); ctx.arc(fwx, fwy, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(13,9,6,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();

    // bottom / Abyss-linking point
    ctx.beginPath(); ctx.arc(fwx, fwy + r, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wax; ctx.fill();
}

// ─── SHEET 3: AFTERLIFE (.j world afterlife) — THE OPENED DOT ────────────────
// 2026-09-21 owner brief: on the gathered chart the Afterlife is a small
// orbiting dot - "but when someone uses .j world afterlife, it should reveal
// that there is much more to it". So this sheet OPENS the dot: the night
// realm is drawn LARGE (R=272, formerly 202 - the old render wasted 40% of
// the page on empty parchment), with the veil arcs above, the field of issued
// worlds (no two alike), the two surveyor notes set into the night, the
// sighting line to one unnamable world, the scalloped shore, and the ferry
// that carries the newly dead across. Lore plates carry the unique-afterlife
// philosophy. Cosmology mechanics untouched: dashed independent orbit, live
// body, slower period, triune, unlock - invariant #5 kept.
function renderAfterlifeSheet(t = Date.now()) {
    return _render(async (ctx) => {
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

        // ── the dot reconciliation: the main structure (tiny, not to scale)
        // beside the line that says what the gathered chart does with all of
        // this ──
        const gx = 214, gy = 276;
        ctx.beginPath(); ctx.arc(gx, gy, 17, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(gx + 8, gy - 8, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        _centered(ctx, 'on the gathered chart, all of this is drawn as one dot. the dot is a lie of distance.',
            282, 'italic 15.5px "IM Fell Italic"', PAL.inkSoft);

        // ── the Afterlife's OWN orbit (dashed, independent - invariant #5) ──
        const acx = W / 2, acy = 618, aRX = 405, aRY = 272;
        _dashEllipse(ctx, acx, acy, aRX, aRY, [8, 9], PAL.afterlife, 1.8);

        // ── THE OPENED DOT: a large night circle holding one world per soul ──
        const dcx = acx, dcy = acy, dR = 272;
        const sky = ctx.createRadialGradient(dcx, dcy - 70, 24, dcx, dcy, dR + 24);
        sky.addColorStop(0, '#26303F');
        sky.addColorStop(0.62, '#1A222D');
        sky.addColorStop(1, '#0F141B');
        ctx.beginPath(); ctx.arc(dcx, dcy, dR, 0, Math.PI * 2);
        ctx.fillStyle = sky; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(166,124,46,0.9)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(dcx, dcy, dR + 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(166,124,46,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        _spaced(ctx, 'THE AFTERLIFE', dcx, dcy - dR + 48, '16px "Cinzel"', '#E8DDBF', 4);

        // the veil: two pale arcs under the title, the sky's far edge
        ctx.setLineDash([1, 4]);
        ctx.strokeStyle = 'rgba(232,221,191,0.3)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(dcx, dcy - dR + 128, 176, 34, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(dcx, dcy - dR + 150, 236, 46, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.setLineDash([]);

        // the swarm: seeded, deterministic, no two dots alike. Rejection
        // keeps the reserved zones clear (title band, veil arcs, the
        // highlighted dot + its note, the two field notes, the shore band).
        const swarm = _afterlifeSwarm();
        const HOT = { x: dcx - 92, y: dcy - 92 };   // the singled-out world
        const reserved = [
            { x: dcx, y: dcy - dR + 48, w: 170, h: 34 },      // THE AFTERLIFE
            { x: dcx, y: dcy - dR + 138, w: 300, h: 46 },     // veil arcs
            { x: HOT.x + 62, y: HOT.y - 20, w: 250, h: 30 },  // they never say...
            { x: dcx - 128, y: dcy + 44, w: 130, h: 48 },     // note: hold exactly one
            { x: dcx + 126, y: dcy + 40, w: 150, h: 48 },     // note: warmth
        ];
        const inShore = (x, y) => y > dcy + 128;           // shore band
        for (const d of swarm) {
            const x = dcx + d.dx, y = dcy + d.dy;
            if (Math.hypot(x - HOT.x, y - HOT.y) < 36) continue;
            let hit = false;
            for (const rz of reserved) {
                if (Math.abs(x - rz.x) < rz.w / 2 + 12 && Math.abs(y - rz.y) < rz.h / 2 + 10) { hit = true; break; }
            }
            if (hit || inShore(x, y)) continue;
            _drawAfterlifeWorld(ctx, x, y, d);
        }

        // two field notes, set INTO the night like surveyor annotations
        ctx.font = 'italic 12.5px "IM Fell Italic"'; ctx.fillStyle = 'rgba(232,221,191,0.85)'; ctx.textAlign = 'center';
        ctx.fillText('a world made to hold', dcx - 128, dcy + 50);
        ctx.fillText('exactly one', dcx - 128, dcy + 68);
        ctx.fillText('some arrive still holding a', dcx + 126, dcy + 46);
        ctx.fillText('warmth they cannot name', dcx + 126, dcy + 64);

        // the singled-out world + sighting line down to the shore
        _drawAfterlifeWorld(ctx, HOT.x, HOT.y, { r: 6.5, kind: 'gold', tone: '#E8C877' });
        ctx.beginPath(); ctx.arc(HOT.x, HOT.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,200,119,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(232,200,119,0.5)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(HOT.x + 5, HOT.y + 12); ctx.lineTo(dcx + 2, dcy + 158); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'italic 12px "IM Fell Italic"'; ctx.fillStyle = 'rgba(232,221,191,0.9)';
        ctx.textAlign = 'left';
        ctx.fillText('they never say which one is yours', HOT.x + 20, HOT.y - 16);

        // the shore: pillar fence falling to a scalloped shoreline across the
        // lower chord - the standing place of the living
        const shoreY = dcy + 176;
        const halfChord = Math.sqrt(dR * dR - (shoreY - dcy) * (shoreY - dcy)) - 6;
        ctx.save();
        ctx.beginPath(); ctx.arc(dcx, dcy, dR - 2, 0, Math.PI * 2); ctx.clip();
        // pillars
        ctx.strokeStyle = 'rgba(232,221,191,0.75)'; ctx.lineWidth = 1.4;
        const nP = 11;
        for (let i = 0; i < nP; i++) {
            const px = dcx - halfChord + 8 + i * ((halfChord * 2 - 16) / (nP - 1));
            ctx.beginPath(); ctx.moveTo(px, shoreY); ctx.lineTo(px, shoreY - 28); ctx.stroke();
        }
        // scalloped shoreline
        ctx.strokeStyle = 'rgba(232,200,119,0.8)'; ctx.lineWidth = 1.6;
        const nSc = 6;
        for (let k = 0; k < nSc; k++) {
            const sx = dcx - halfChord + k * ((halfChord * 2) / nSc);
            ctx.beginPath();
            ctx.arc(sx + (halfChord * 2) / (nSc * 2), shoreY, (halfChord * 2) / (nSc * 2), Math.PI, 0, false);
            ctx.stroke();
        }
        ctx.restore();

        // the ferry: the newly dead arrive by water - a dotted crossing that
        // leaves the sheet's edge, passes the veil, and ends at a small boat
        // on the shore
        ctx.save();
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = 'rgba(74,85,104,0.8)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(74, 560); ctx.quadraticCurveTo(200, 640, dcx - 132, shoreY - 10); ctx.stroke();
        ctx.setLineDash([]);
        // the boat
        const bx2 = dcx - 132, by2 = shoreY - 12;
        ctx.strokeStyle = 'rgba(232,221,191,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(bx2, by2 - 2, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx2, by2 - 3); ctx.lineTo(bx2, by2 - 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx2, by2 - 20); ctx.lineTo(bx2 + 13, by2 - 8); ctx.stroke();
        ctx.restore();
        ctx.font = 'italic 12px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft; ctx.textAlign = 'left';
        ctx.fillText('the newly dead cross by water', 84, 548);

        // shore caption BELOW the circle in ink (cream text vanishes on
        // parchment wherever the circle's chord narrows)
        ctx.font = 'italic 12.5px "IM Fell Italic"'; ctx.fillStyle = PAL.ink; ctx.textAlign = 'center';
        ctx.fillText('the shore - where the living may stand and look out', dcx, dcy + dR + 28);

        // ── the body's live position on its own circuit ──
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = acx + Math.cos(ap) * aRX, ay = acy + Math.sin(ap) * aRY;
        ctx.beginPath(); ctx.arc(ax, ay, 11, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();
        // label: the same DEDICATED CORNER LANE language as the gathered
        // chart - the pill sits in the empty corner nearest the body with a
        // dotted leader line to the marker.
        const corner = ax >= acx
            ? (ay > acy ? [856, 920] : [856, 330])
            : (ay > acy ? [144, 920] : [144, 330]);
        _pillLabel(ctx, [
            { text: 'AFTERLIFE', font: '14px "Cinzel"', color: PAL.afterlife },
            { text: 'its current position - one circuit', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
            { text: '~ 2 real-world days, all to itself', font: 'italic 11.5px "IM Fell Italic"', color: PAL.inkSoft },
        ], corner[0], corner[1], '14px "Cinzel"', PAL.afterlife, { lh: 20 });
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(74,85,104,0.7)'; ctx.lineWidth = 1.1;
        const ldx = ax - corner[0], ldy = ay - corner[1];
        const llen = Math.hypot(ldx, ldy) || 1;
        ctx.beginPath();
        ctx.moveTo(corner[0] + (ldx / llen) * 104, corner[1] + (ldy / llen) * 30);
        ctx.lineTo(ax - (ldx / llen) * 16, ay - (ldy / llen) * 16);
        ctx.stroke();
        ctx.restore();

        // slower-orbit note + curved arrow (design)
        _centered(ctx, 'its own, much slower orbit - one cycle ~ 2 real-world days - shares nothing with the First World\'s 5-hour path',
            952, 'italic 13px "IM Fell Italic"', PAL.inkSoft);
        const arrowTipA = Math.PI * 0.78;
        const atx = acx + Math.cos(arrowTipA) * aRX, aty = acy + Math.sin(arrowTipA) * aRY;
        _curveArrow(ctx, 310, 934, 352, 856, atx, aty, 'rgba(74,85,104,0.8)', 1.6);

        // ── lore plates: the unique-afterlife philosophy (owner brief) ──
        _decreePlate(ctx, 55, 992, 430, 128, 'ONE SOUL, ONE WORLD', [
            'every soul is issued its own afterlife,',
            'a world made to contain exactly one.',
            'you will not see the versions of the',
            'people you loved again.',
        ]);
        _decreePlate(ctx, 515, 992, 430, 128, 'WHAT STILL CROSSES OVER', [
            'the one who waits for you never knew',
            'them. and still, some souls arrive',
            'holding a warmth they cannot name -',
            'the worlds are not so far apart.',
        ]);

        // ── mechanics plates (design texts, kept) ──
        _decreePlate(ctx, 55, 1128, 430, 124, 'TRIUNE ALIGNMENT - EVERY 7 DAYS', [
            "afterlife position + the First World's",
            'bottom (Abyss-linking) point + the Abyss',
            '- all three aligned at once; flagged state;',
            'the consequence is still to be decided.',
        ]);
        _decreePlate(ctx, 515, 1128, 430, 124, 'UNLOCK - DEAD-SOUL FEATURE', [
            'players without the feature receive the',
            'requirement, not the map; the map',
            'refuses to render while locked.',
        ]);

        // triune announcement when the state is live now
        const tri = cosmology.triuneWindow(t);
        if (tri.aligned) {
            _centered(ctx, 'THE THREE ARE ALIGNED NOW', 1270, '15px "Cinzel"', PAL.wax);
        }

        _liveStrip(ctx, 1294);
        _waxSeal(ctx, 80, H - 62, 'V');
        _centered(ctx, '"j world afterlife" own sheet, own lore card - one charted dot, every soul its own world',
            1362, 'italic 11.5px "IM Fell Italic"', PAL.inkSoft);
    });
}

/** Deterministic swarm of unique afterlife world-dots (no two drawn alike). */
function _afterlifeSwarm() {
    const rnd = _mulberry32(20260921);
    const tones = ['#EFE3C3', '#C9A24B', '#8FA6B8', '#C9B891', '#B08D57', '#7E8CA0'];
    const kinds = ['plain', 'ring', 'moon', 'halo', 'twin', 'grain'];
    const dots = [];
    for (let i = 0; i < 64; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = Math.sqrt(rnd()) * 234;
        dots.push({
            dx: Math.cos(ang) * rad,
            dy: Math.sin(ang) * rad * 0.94,
            r: 2.6 + rnd() * 4.4,
            kind: kinds[Math.floor(rnd() * kinds.length)],
            tone: tones[Math.floor(rnd() * tones.length)],
            ringTilt: rnd() * Math.PI,
        });
    }
    return dots;
}

/** One tiny afterlife world. Every variant reads as a distinct little world. */
function _drawAfterlifeWorld(ctx, x, y, d) {
    ctx.save();
    if (d.kind === 'halo') {
        ctx.beginPath(); ctx.arc(x, y, d.r + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,221,191,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = d.tone; ctx.globalAlpha = 0.9; ctx.fill();
    ctx.globalAlpha = 1;
    if (d.kind === 'ring') {
        ctx.beginPath(); ctx.ellipse(x, y, d.r + 4, d.r * 0.55, d.ringTilt, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,221,191,0.6)'; ctx.lineWidth = 0.9; ctx.stroke();
    } else if (d.kind === 'moon') {
        ctx.beginPath(); ctx.arc(x + d.r + 3.2, y - d.r * 0.4, d.r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,221,191,0.75)'; ctx.fill();
    } else if (d.kind === 'twin') {
        ctx.beginPath(); ctx.arc(x - d.r * 1.35, y + d.r * 0.5, d.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,221,191,0.6)'; ctx.fill();
    } else if (d.kind === 'grain') {
        ctx.beginPath(); ctx.moveTo(x - d.r * 0.6, y + d.r * 0.9);
        ctx.lineTo(x + d.r * 0.6, y + d.r * 1.5);
        ctx.strokeStyle = 'rgba(232,221,191,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
}

// ─── SHEET 4: ABYSS (.j world abyss) — pass3_owner_geometry submap_abyss ────
// The decree-dark variant: black plate, gold rings descending without end,
// roman depth markers down the left margin, tan decree plates on the right,
// the wax seal 'A' and the owner's closing quote.
//
// 2026-09-21 MISALIGNMENT ROOT CAUSE (owner: "the Abyss card is still
// severely misaligned"): the old funnel was centered on x=430 with rings up
// to rx=240, so the top rings reached x=670 and slid UNDER the plates that
// start at x=610 - the funnel looked lopsided with its right side clipped.
// The funnel now owns its own column (axis x=400, widest ring rx=190, right
// edge 590), every ring is concentric on that one axis, every depth marker's
// tick touches its own ring's left edge, and the closing quote fills the
// empty corner under the plates.
function renderAbyssSheet(t = Date.now()) {
    return _render(async (ctx) => {
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
        // TEN rings so every roman depth marker (I..X) points at a real ring.
        const RX = [190, 152, 122, 97, 78, 62, 50, 40, 32, 25];
        const ringX = 400;
        let ry2 = 352;
        const ringCenters = [];
        for (const rx of RX) {
            const rh = rx * 0.36;
            if (ringCenters.length === 0) ry2 = 352 + rh; else ry2 = ry2 + 18 + rh;
            ctx.beginPath(); ctx.ellipse(ringX, ry2, rx, rh, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(201,162,75,0.85)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ringCenters.push(ry2);
        }
        // the rings continue: the count does not stop
        ctx.fillStyle = 'rgba(201,162,75,0.8)';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(ringX - 12 + i * 12, ringCenters[ringCenters.length - 1] + 40, 2.2, 0, Math.PI * 2); ctx.fill();
        }

        // ── depth markers I..X, each tick touching its own ring ──
        const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        ctx.textAlign = 'right';
        ctx.font = '14px "Cinzel"';
        ctx.fillStyle = '#9A7D3A';
        for (let i = 0; i < 10; i++) {
            const my = ringCenters[i];
            ctx.fillText(NUMERALS[i], 150, my + 5);
            ctx.strokeStyle = 'rgba(201,162,75,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(164, my); ctx.lineTo(ringX - RX[i] - 8, my); ctx.stroke();
        }
        ctx.textAlign = 'center';

        // the funnel's own footnote, set on the funnel's axis
        ctx.font = 'italic 14px "IM Fell Italic"'; ctx.fillStyle = '#9A7D3A'; ctx.textAlign = 'center';
        ctx.fillText('no floor is drawn - the rings continue,', ringX, 946);
        ctx.fillText('technically without end', ringX, 966);

        // ── the three decree plates (tan on black, right column) ──
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

        // the owner's closing quote fills the corner under the plates
        ctx.font = 'italic 19px "IM Fell Italic"'; ctx.fillStyle = '#C9A24B'; ctx.textAlign = 'center';
        ctx.fillText('"the rings do not stop.', 775, 1006);
        ctx.fillText('neither does the count."', 775, 1040);

        // wax seal
        _waxSealBig(ctx, W / 2, 1136, 40, 'A');
        _centered(ctx, '"j world abyss" own sheet, own lore card - separation from all orbital systems is the point',
            1310, 'italic 13px "IM Fell Italic"', 'rgba(201,162,75,0.55)');
    }, { dark: true });
}

// ─── SHEET 0: COSMOLOGY ATLAS (.j world all) — the gathered chart ───────────
// 2026-09-21 owner redesign: the Afterlife is a SMALL ORBITING DOT on the
// overall map (its own wide dashed circuit), the First World's interior now
// carries the same image-worlds as its own sheet in miniature, and the old
// floating header plates (NOT CHARTED / MOVEMENT INDICATOR) are gone - their
// content lives in the labels and the survey plates. The pass-3 geometry
// (invariants #1-#5) is untouched: the First World still rides tangent
// inside the World Beyond, the Abyss still descends beneath with no floor.
async function renderCosmologyAtlasSheet(t = Date.now()) {
    const art = await _loadWorldArt();
    return _render(async (ctx) => {
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
        const cx = W / 2, cy = 610, R = 295;
        // the World Beyond: the great tan disk
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#D9C49A'; ctx.fill();
        ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.ink; ctx.stroke();

        // the First World's orbital path: r = R/2, one rim grazing the disk's
        // center, the other its outer rim (invariant #1). The clockwise
        // annotation arrow needs this line to point at.
        ctx.beginPath(); ctx.arc(cx, cy, R / 2, 0, Math.PI * 2);
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = 'rgba(58,42,30,0.32)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.setLineDash([]);

        // the First World at live tangent geometry + internal structure,
        // its worlds drawn as miniature image circles (the same nine skies
        // the First World sheet charts, five legible at this scale)
        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g, { mini: true, art });

        // FW label travels with the disk (short lines stay inside r=147)
        _pillLabel(ctx, [
            { text: 'FIRST WORLD', font: '15px "Cinzel"', color: PAL.ink },
            { text: "one rim on the Beyond's center,", font: 'italic 10.5px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'the other on the outer rim', font: 'italic 10.5px "IM Fell Italic"', color: PAL.inkSoft },
        ], g.fwx, g.fwy + 54, '15px "Cinzel"', PAL.ink, { lh: 17 });

        // the Afterlife: a SMALL ORBITING DOT on its own wide dashed circuit
        // (invariant #5 - never the First World's path)
        const aRX = 418, aRY = 292;
        _dashEllipse(ctx, cx, cy, aRX, aRY, [8, 9], PAL.afterlife, 1.7);
        const ap = cosmology.alPhase(t) * Math.PI * 2 - Math.PI / 2;
        const ax = cx + Math.cos(ap) * aRX, ay = cy + Math.sin(ap) * aRY;
        ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(74,85,104,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fillStyle = PAL.parchment; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.afterlife; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = PAL.afterlife; ctx.fill();
        // label: DEDICATED CORNER LANE nearest the dot, dotted leader line
        const corner = ax >= cx
            ? (ay > cy ? [818, 892] : [818, 378])
            : (ay > cy ? [176, 892] : [176, 378]);
        _pillLabel(ctx, [
            { text: 'AFTERLIFE', font: '14px "Cinzel"', color: PAL.afterlife },
            { text: 'one small dot on its own circuit', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
            { text: '~ 2 real-world days - not the FW path', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
        ], corner[0], corner[1], '14px "Cinzel"', PAL.afterlife, { lh: 19 });
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(74,85,104,0.7)'; ctx.lineWidth = 1.1;
        const ldx = ax - corner[0], ldy = ay - corner[1];
        const llen = Math.hypot(ldx, ldy) || 1;
        ctx.beginPath();
        ctx.moveTo(corner[0] + (ldx / llen) * 100, corner[1] + (ldy / llen) * 30);
        ctx.lineTo(ax - (ldx / llen) * 15, ay - (ldy / llen) * 15);
        ctx.stroke();
        ctx.restore();

        // clockwise-orbit annotation at the left edge (design: note + arrow).
        // Drawn AFTER the corner lane so a crossing leader hides behind the
        // pill's parchment fill, never through its text.
        _pillLabel(ctx, [
            { text: 'CLOCKWISE ORBIT', font: '12px "Cinzel"', color: PAL.ink },
            { text: '5 REAL HOURS', font: '12px "Cinzel"', color: PAL.ink },
            { text: '= 5 IN-GAME DAYS', font: '12px "Cinzel"', color: PAL.ink },
        ], 128, 484, '12px "Cinzel"', PAL.ink);
        const aimA = (g.theta || 0) + 0.5;
        const tx2 = cx + Math.cos(aimA) * (R / 2), ty2 = cy + Math.sin(aimA) * (R / 2);
        _curveArrow(ctx, 186, 474, 262, 452, tx2, ty2, 'rgba(58,42,30,0.65)', 1.5);

        // WORLD BEYOND label (design: inside the great disk). ANTI-FW
        // placement: opposite the First World's live pose, so the disk and
        // this label can never overlap whatever the live phase is.
        const wbAng = Math.atan2(g.fwy - cy, g.fwx - cx) + Math.PI;
        const wbx = cx + Math.cos(wbAng) * (g.r * 1.52);
        const wby = cy + Math.sin(wbAng) * (g.r * 1.52);
        _pillLabel(ctx, [
            { text: 'WORLD BEYOND', font: '20px "Cinzel"', color: PAL.ink },
            { text: 'the space it does not occupy -', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
            { text: 'God-Rank realm, above dimensionality', font: 'italic 11px "IM Fell Italic"', color: PAL.inkSoft },
        ], wbx, wby, '20px "Cinzel"', PAL.ink, { lh: 23 });

        // ── the Abyss: dashed rings descending beneath the boundary ──
        const AB_RX = [110, 82, 61, 45, 33];
        let aby = 935;
        const bottoms = [];
        for (const rx of AB_RX) {
            const rh = rx * 0.24;
            if (bottoms.length === 0) aby = 935 + rh; else aby = aby + 8 + rh;
            _dashEllipse(ctx, 500, aby, rx, rh, [5, 6], 'rgba(58,42,30,0.55)', 1.3);
            bottoms.push(aby + rh);
        }
        ctx.fillStyle = 'rgba(58,42,30,0.5)';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(488 + i * 10, bottoms[bottoms.length - 1] + 22, 2, 0, Math.PI * 2); ctx.fill();
        }
        // THE ABYSS label block to the right of the rings (design position)
        ctx.textAlign = 'left';
        ctx.font = '16px "Cinzel"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('THE ABYSS', 648, 986);
        ctx.font = 'italic 12px "IM Fell Italic"'; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText('infinite descent - repeating rings,', 648, 1008);
        ctx.fillText('and nothing above, below, or beside -', 648, 1025);
        ctx.fillText('not a world - a separate structure', 648, 1042);
        ctx.textAlign = 'center';

        // ── legend + timelines note ──
        _legend(ctx, 1108);
        _centered(ctx, 'timelines are not mapped - every world holds infinite timeline variants (world to variant)',
            1134, 'italic 13px "IM Fell Italic"', PAL.inkSoft);

        // ── survey plates (the pass-3 sheet's bottom plates) ──
        _decreePlate(ctx, 64, 1160, 400, 104, 'SURVEY LAW', [
            "the First World's rim touches the World",
            "Beyond's center; its far rim touches the",
            'outer boundary - its radius is exactly half',
        ]);
        _decreePlate(ctx, 536, 1160, 400, 104, 'MOVEMENT', [
            'the First World orbits clockwise - one',
            'orbit: 5 real hours = 5 in-game days -',
            'the Presence of Order travels with it',
        ]);

        // live four-clocks strip + footer + seal
        _liveStrip(ctx, 1294);
        _centered(ctx, '"j world all" - the gathered chart', 1362, 'italic 12px "IM Fell Italic"', PAL.inkSoft);
        _waxSealBig(ctx, 78, 1300, 22, 'K');
    });
}

// ─── GATE CARDS (owner ticket: alignment and access failures get an IMAGE
// ─── CARD that carries the refusal visually, not just in text) ───────────────
//
//  renderAbyssMisalignedCard   the abyss gate seen from outside: the living
//                              circles above, the descent below, and the
//                              alignment link between them NOT MET. Modes:
//                              'closed' (window shut), 'unreadable' (cannot
//                              be read), 'level' (the viewer's tier is not
//                              there yet - the sheet lock).
//  renderAfterlifeLockedCard   the shore on its own circuit, the road toward
//                              it ending mid gap. The map itself is never
//                              drawn (hard contract).
//  renderWorldBeyondLockedCard the great boundary as an EMPTY gold circle -
//                              no rays, no First World, nothing to read -
//                              and the road of rank stopping mid air.
//                              2026-09-21 owner: the World Beyond is locked
//                              for everyone except the owner until the
//                              required conditions are met.
//
//  All three reuse the Royal Decree chrome of the four sheets so the refusal
//  reads as part of the same visual family.

// A large diagonal refusal stamp across the visual (kept subtle so it reads
// as a seal on the chart, not a UI error banner).
function _refusalStamp(ctx, label, opts = {}) {
    const y = opts.y || 760;
    const lw = opts.lw || 560, lh = opts.lh || 128;
    ctx.save();
    ctx.translate(opts.x != null ? opts.x : W / 2, y);
    ctx.rotate(opts.rot != null ? opts.rot : -0.16);
    ctx.fillStyle = opts.onDark ? 'rgba(139,26,43,0.22)' : 'rgba(139,26,43,0.14)';
    ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
    ctx.strokeStyle = opts.onDark ? 'rgba(178,45,58,0.85)' : 'rgba(139,26,43,0.75)';
    ctx.lineWidth = 4;
    ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-lw / 2 + 9, -lh / 2 + 9, lw - 18, lh - 18);
    ctx.font = `${opts.font || 58}px "Cinzel Deco"`;
    ctx.textAlign = 'center';
    ctx.fillStyle = opts.onDark ? 'rgba(196,74,88,0.95)' : 'rgba(139,26,43,0.88)';
    ctx.fillText(String(label || 'SEALED').toUpperCase(), 0, Math.floor(lh * 0.2));
    ctx.restore();
}

function renderAbyssMisalignedCard(opts = {}) {
    const mode = opts.mode === 'unreadable' ? 'unreadable'
        : (opts.mode === 'level' ? 'level' : 'closed');
    const t = Date.now();
    return _render(async (ctx) => {
        _titleBlock(ctx,
            mode === 'unreadable'
                ? 'THE ALIGNMENT OF THE WORLDS CANNOT BE READ'
                : 'THE WORLDS ARE NOT ALIGNED FOR THE DESCENT',
            'THE GATE IS SEALED',
            mode === 'unreadable'
                ? 'the gate does not open on a maybe'
                : (mode === 'level'
                    ? 'the abyss is not yours to enter yet'
                    : 'the abyss admits new descenters only while the window is open'));

        // the living circles (World Beyond boundary + First World, live phase)
        const cx = W / 2, cy = 372, R = 185;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,210,178,0.45)'; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.setLineDash([6, 7]);
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(58,42,30,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);
        const g = _liveGeometry(cx, cy, R, t);
        _drawFirstWorld(ctx, g, { noLinkLabel: true });
        _centered(ctx, 'THE FIRST WORLD', cy + R + 24, '15px "Cinzel"', PAL.inkSoft);

        // the alignment link between them: drawn NOT MET. A thread leaves the
        // First World's bottom link and stops in the void, short of the abyss.
        const bx = g.fwx, by = g.fwy + g.r;
        const gapY = 668;
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = 'rgba(139,26,43,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, gapY - 26); ctx.stroke();
        ctx.setLineDash([]);
        // broken end sockets that do not meet
        ctx.strokeStyle = PAL.wax; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(bx, gapY - 12, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 7, gapY); ctx.lineTo(bx + 7, gapY + 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + 7, gapY); ctx.lineTo(bx - 7, gapY + 14); ctx.stroke();
        _centered(ctx, mode === 'unreadable' ? 'THE ALIGNMENT CANNOT BE READ' : 'THE ALIGNMENT IS NOT MET',
            gapY + 44, '14px "Cinzel"', PAL.wax);

        // refusal stamp in its own band, clear of circles, link and rings
        _refusalStamp(ctx, mode === 'unreadable' ? 'UNREAD' : 'SEALED',
            { y: 792, lw: 500, lh: 96, font: 44, rot: -0.12 });

        // the descent below (short, so nothing slides under the plates)
        _centered(ctx, 'THE ABYSS', 880, '15px "Cinzel"', PAL.inkSoft);
        _drawAbyssDescent(ctx, cx, 906, 0.66, false);

        // plates
        if (mode === 'level') {
            _plate(ctx, 55, 1156, 420, 104, 'WHAT YOU NEED', [
                `level ${String(opts.unlock != null ? opts.unlock : 20)} or above.`,
                `your level: ${Math.max(0, Math.floor(opts.level || 0))}.`,
            ]);
            _plate(ctx, 525, 1156, 420, 104, 'THE WINDOW', [
                'the descent waits for no one.',
                'grow into the tier, then ask again.',
            ]);
        } else {
            _plate(ctx, 55, 1156, 420, 104, mode === 'unreadable' ? 'WHY THE SHUTTER' : 'WHY THE GATE HOLDS', [
                mode === 'unreadable'
                    ? 'the alignment of the worlds cannot be read,'
                    : 'the gate opens one hour in six,',
                mode === 'unreadable'
                    ? 'and the abyss does not open on a maybe.'
                    : 'and only while the worlds meet.',
                'those already below are not pulled out.',
            ]);
            _plate(ctx, 525, 1156, 420, 104, 'THE WINDOW', [
                mode === 'unreadable'
                    ? 'wait, and ask again soon.'
                    : `the gate opens in ${String(opts.opensInLabel || 'a while').replace(/^locked /, '')}.`,
                'entry is gated, not the descent itself.',
            ]);
        }

        // bottom strip + seal + footer (hand-placed: the plates sit lower)
        _liveStrip(ctx, 1292);
        _waxSeal(ctx, 80, H - 62, 'IV');
        _centered(ctx, 'the descent is refused, politely and completely',
            1360, 'italic 11.5px "IM Fell Italic"', PAL.inkSoft);
    });
}

function renderAfterlifeLockedCard(t = Date.now()) {
    return _render(async (ctx) => {
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
        _waxSeal(ctx, gx + 52, gy + 18, 'III');
        _centered(ctx, 'THE CROSSING IS NOT TAUGHT YET', gy + 88, '14px "Cinzel"', PAL.afterlife);

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

// ─── WORLD BEYOND LOCKED CARD (2026-09-21 owner ruling) ──────────────────────
// "The World Beyond map should be locked for everyone except the owner until
// they meet the required conditions." The boundary is drawn as an EMPTY gold
// circle on the dark plate: no rays, no First World, no interior detail of
// any kind (the locked map is never rendered). The rank road climbs from the
// bottom of the sheet and dies mid air; the LOCKED seal sits across the
// unreadable interior.
function renderWorldBeyondLockedCard(t = Date.now()) {
    return _render(async (ctx) => {
        _spaced(ctx, 'THE BOUNDARY IS NOT CHARTED FOR YOU YET', W / 2, 88, '14px "Cinzel"', '#C9A24B', 3);
        _spaced(ctx, 'THE WORLD BEYOND', W / 2, 152, '50px "Cinzel Deco"', '#D9B95C', 4);
        ctx.strokeStyle = 'rgba(201,162,75,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(310, 178); ctx.lineTo(690, 178); ctx.stroke();
        ctx.fillStyle = PAL.wax;
        ctx.fillRect(W / 2 - 6, 170, 12, 16);
        _centered(ctx, 'the road ends at the rank', 216, 'italic 16px "IM Fell Italic"', '#9A7D3A');

        // the great boundary: an empty gold circle. Nothing inside is drawn.
        const cx = W / 2, cy = 490, R = 235;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = '#17110B'; ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(201,162,75,0.9)'; ctx.stroke();
        // the First World's orbit path (structure, not map content)
        ctx.beginPath(); ctx.arc(cx, cy, R / 2, 0, Math.PI * 2);
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = 'rgba(201,162,75,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.setLineDash([]);

        _refusalStamp(ctx, 'LOCKED', { y: cy + 10, lw: 420, lh: 96, font: 42, rot: -0.13, onDark: true });

        // the rank road: gold rungs climbing from the bottom of the sheet
        // toward the boundary, dying mid air just short of its rim
        const rungs = 5;
        for (let i = 0; i < rungs; i++) {
            const ry = 950 - i * 44;                       // 950 .. 774
            const half = 14 + i * 3;                       // widens as it rises
            const fade = 0.85 - (i / (rungs - 1)) * 0.5;   // strongest at the base
            ctx.strokeStyle = `rgba(201,162,75,${fade.toFixed(2)})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx - half, ry); ctx.lineTo(cx + half, ry); ctx.stroke();
        }
        // the broken last rung: two stubs with a gap, short of the rim (725)
        ctx.strokeStyle = 'rgba(201,162,75,0.35)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 12, 744); ctx.lineTo(cx - 3, 744); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 5, 744); ctx.lineTo(cx + 13, 744); ctx.stroke();
        _centered(ctx, 'THE ROAD STOPS AT THE RANK', 996, '14px "Cinzel"', '#C9A24B');

        _decreePlate(ctx, 64, 1046, 400, 122, 'WHAT YOU NEED', [
            'adventurer rank S or above.',
            'the sheet refuses to render',
            'below it.',
        ], { onDark: true });
        _decreePlate(ctx, 536, 1046, 400, 122, 'UNTIL THEN', [
            'the boundary stays uncharted.',
            'earn the rank, ask again.',
            '',
        ], { onDark: true });

        _waxSealBig(ctx, W / 2, 1246, 26, 'S');
        _centered(ctx, 'the boundary is refused, politely and completely',
            1330, 'italic 12px "IM Fell Italic"', 'rgba(201,162,75,0.55)');
    }, { dark: true });
}

// ─── CANVAS DRIVER ───────────────────────────────────────────────────────────

async function _render(drawFn, opts = {}) {
    try {
        const { createCanvas } = require('canvas');
        _ensureFonts();
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        if (opts.dark) {
            _bgDark(ctx);
            await drawFn(ctx);
            _frameDark(ctx);
        } else {
            _bg(ctx);
            await drawFn(ctx);
            _frame(ctx);
        }
        return canvas.toBuffer('image/png');
    } catch (e) {
        try { console.error('[worldMapRenderer] render failed:', e.message); } catch (_) {}
        return null;
    }
}

module.exports = {
    renderCosmologyAtlasSheet,
    renderFirstWorldSheet,
    renderPresenceOfOrderSheet,
    renderWorldBeyondSheet,
    renderAfterlifeSheet,
    renderAbyssSheet,
    renderAbyssMisalignedCard,
    renderAfterlifeLockedCard,
    renderWorldBeyondLockedCard,
    _liveGeometry,
    _worldDots,
    _loadWorldArt,
    WORLD_CATALOG,
    PAL,
    W, H,
};

