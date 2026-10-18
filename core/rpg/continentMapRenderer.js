'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CONTINENT MAP — "The Five Realms of the First World" (Royal Decree chrome)
//
//  Same parchment/ink/wax art direction as the cosmology sheets (worldMapRenderer),
//  drawn from continents.js canonical geometry. Optional guild overlay: the guild's
//  charter-stone marker (wax-red banner pin) + the member home-base hamlets near it.
//
//    renderContinentMap({ guildName, guild, memberNames })  → Buffer (PNG) | null
//    renderContinentMap()                                   → the plain atlas
//
//  Pure canvas, ~100 ms. Never throws (returns null; caller falls back to text).
// ═══════════════════════════════════════════════════════════════════════════
const WM = require('./worldMapRenderer');
const C = require('./continents');
const { PAL, W, H } = WM;

// map window inside the frame
const MX = 70, MY = 196, MW = W - 140, MH = 800;
const px = (x) => MX + x * MW;
const py = (y) => MY + y * MH;

const FILL = {
    isle:      ['#CFE0B8', '#A9C98E', '#6E9A62'],
    desert:    ['#F0D9A0', '#E2BE78', '#BE8F48'],
    tundra:    ['#F4F7F8', '#DCE7EE', '#B5C9D6'],
    highlands: ['#E7BE78', '#CE9348', '#A5622A'],
    volcanic:  ['#6A5A56', '#463836', '#2B2222'],
};

function _rng(seed) { return C.mulberry32(seed); }

function _path(ctx, pts, sx = 1, cx = 0, cy = 0) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
        const X = px(cx + (x - cx) * sx), Y = py(cy + (y - cy) * sx);
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    });
    ctx.closePath();
}

function _sea(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip();
    const g = ctx.createRadialGradient(px(0.5), py(0.5), 40, px(0.5), py(0.5), 620);
    g.addColorStop(0, 'rgba(120,168,170,0.55)');
    g.addColorStop(1, 'rgba(150,190,186,0.28)');
    ctx.fillStyle = g; ctx.fillRect(MX, MY, MW, MH);
    // swell lines
    const r = _rng(31);
    ctx.strokeStyle = 'rgba(46,110,115,0.22)'; ctx.lineWidth = 1;
    for (let i = 0; i < 170; i++) {
        const x = MX + r() * MW, y = MY + r() * MH, l = 10 + r() * 16;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + l / 2, y - 3, x + l, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.2; ctx.strokeRect(MX, MY, MW, MH);
    ctx.lineWidth = 0.8; ctx.strokeRect(MX - 6, MY - 6, MW + 12, MH + 12);
    // graticule ticks
    ctx.strokeStyle = PAL.inkSoft; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
        const x = MX + (MW * i) / 10, y = MY + (MH * i) / 10;
        ctx.beginPath(); ctx.moveTo(x, MY); ctx.lineTo(x, MY + 7); ctx.moveTo(x, MY + MH); ctx.lineTo(x, MY + MH - 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(MX, y); ctx.lineTo(MX + 7, y); ctx.moveTo(MX + MW, y); ctx.lineTo(MX + MW - 7, y); ctx.stroke();
    }
}

function _glyph(ctx, biome, x, y, r) {
    const s = 5 + r() * 4;
    ctx.save();
    if (biome === 'desert') {                       // dune arcs
        ctx.strokeStyle = 'rgba(122,78,28,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y + s, s * 1.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + s * 1.2, y + s * 1.5, s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (biome === 'tundra') {                // snowy pines
        ctx.fillStyle = 'rgba(52,84,108,0.7)';
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.lineTo(x - s * 0.7, y + s * 0.3); ctx.lineTo(x + s * 0.7, y + s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.lineTo(x - s * 0.3, y - s * 0.7); ctx.lineTo(x + s * 0.3, y - s * 0.7); ctx.closePath(); ctx.fill();
    } else if (biome === 'highlands') {             // autumn oaks
        ctx.fillStyle = r() < 0.5 ? 'rgba(150,64,22,0.75)' : 'rgba(184,104,30,0.75)';
        ctx.beginPath(); ctx.arc(x, y - s * 0.5, s * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(70,44,20,0.8)'; ctx.fillRect(x - 0.9, y, 1.8, s * 0.7);
    } else if (biome === 'volcanic') {              // cones with embers
        ctx.fillStyle = 'rgba(18,12,12,0.85)';
        ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.5); ctx.lineTo(x - s * 0.25, y - s); ctx.lineTo(x + s * 0.25, y - s); ctx.lineTo(x + s, y + s * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#E2531F'; ctx.fillRect(x - s * 0.25, y - s, s * 0.5, 2.2);
    } else {                                        // green headland trees
        ctx.fillStyle = 'rgba(46,92,52,0.7)';
        ctx.beginPath(); ctx.arc(x, y - s * 0.4, s * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(60,40,22,0.8)'; ctx.fillRect(x - 0.9, y, 1.8, s * 0.6);
    }
    ctx.restore();
}

function _drawContinent(ctx, c, hot) {
    const pts = C.polygon(c.key);
    const f = FILL[c.biome];
    // coastal shelf ripples
    ctx.save();
    for (const [sx, a] of [[1.10, 0.20], [1.05, 0.32]]) {
        _path(ctx, pts, sx, c.centre[0], c.centre[1]);
        ctx.strokeStyle = `rgba(46,110,115,${a})`; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // land body
    _path(ctx, pts);
    const g = ctx.createRadialGradient(px(c.centre[0]), py(c.centre[1]), 6, px(c.centre[0]), py(c.centre[1]), Math.max(c.rx * MW, c.ry * MH) * 1.3);
    g.addColorStop(0, f[0]); g.addColorStop(0.6, f[1]); g.addColorStop(1, f[2]);
    ctx.fillStyle = g; ctx.shadowColor = 'rgba(58,42,30,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = hot ? 3.2 : 2; ctx.strokeStyle = hot ? PAL.wax : PAL.ink; ctx.stroke();
    // glyph scatter, clipped to the land
    ctx.clip();
    const r = _rng(c.seed + 7);
    let n = Math.round(c.rx * c.ry * 2400);
    for (let i = 0; i < n * 3 && n > 0; i++) {
        const x = c.centre[0] + (r() * 2 - 1) * c.rx * 1.3, y = c.centre[1] + (r() * 2 - 1) * c.ry * 1.3;
        if (!C.inside(pts, x, y) || C.edgeDist(pts, x, y) < 0.012) continue;
        _glyph(ctx, c.biome, px(x), py(y), r);
        if (--n <= 0) break;
    }
    ctx.restore();
    if (c.biome === 'volcanic') {                   // a lava river through the Ember Fields
        ctx.save(); _path(ctx, pts); ctx.clip();
        ctx.strokeStyle = 'rgba(226,83,31,0.85)'; ctx.lineWidth = 2.6; ctx.beginPath();
        const rr = _rng(c.seed + 99);
        let x = c.centre[0] - c.rx * 0.9, y = c.centre[1] - c.ry * 0.5; ctx.moveTo(px(x), py(y));
        for (let i = 0; i < 9; i++) { x += c.rx * 0.2; y += (rr() - 0.35) * c.ry * 0.45; ctx.lineTo(px(x), py(y)); }
        ctx.stroke(); ctx.restore();
    }
}

// label with a collision list so names never sit on top of one another
function _label(ctx, placed, text, x, y, font, color, opts = {}) {
    ctx.font = font; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 8, h = opts.h || 18;
    const hit = (yy) => placed.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - yy) < (b.h + h) / 2);
    let yy = y, k = 0;
    while (hit(yy) && k < 8) { k++; yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (h + 2); }
    placed.push({ x, y: yy, w, h });
    if (opts.pill) {
        ctx.fillStyle = 'rgba(234,221,196,0.82)';
        ctx.fillRect(x - w / 2, yy - h + 4, w, h);
        ctx.strokeStyle = 'rgba(107,78,46,0.6)'; ctx.lineWidth = 0.8; ctx.strokeRect(x - w / 2 + 0.5, yy - h + 4.5, w - 1, h - 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, yy);
    return yy;
}

function _compass(ctx, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = PAL.ink; ctx.fillStyle = PAL.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.16, -r * 0.2); ctx.lineTo(-r * 0.16, -r * 0.2); ctx.closePath();
        ctx.fillStyle = i === 0 ? PAL.wax : PAL.ink; ctx.fill();
    }
    ctx.restore();
    ctx.font = '13px "Cinzel"'; ctx.fillStyle = PAL.ink; ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r * 1.25 - 5);
}

function _hamlet(ctx, x, y) {
    ctx.fillStyle = '#F4E6C4'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y + 3); ctx.lineTo(x - 4.5, y - 1.5); ctx.lineTo(x, y - 5.5); ctx.lineTo(x + 4.5, y - 1.5); ctx.lineTo(x + 4.5, y + 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
}
function _marker(ctx, x, y) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = PAL.wax; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = PAL.parchment; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 1, y + 6); ctx.lineTo(x - 1, y - 7); ctx.strokeStyle = PAL.parchment; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 1, y - 7); ctx.lineTo(x + 6, y - 4); ctx.lineTo(x - 1, y - 1); ctx.closePath(); ctx.fillStyle = PAL.parchment; ctx.fill();
    ctx.restore();
}

/**
 * @param {{guildName?:string, guild?:object, memberNames?:string[]}} [o]
 * @returns {Promise<Buffer|null>}
 */
async function renderContinentMap(o = {}) {
    try {
        const { createCanvas } = require('canvas');
        WM._ensureFonts();
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        WM._bg(ctx);

        const gName = o.guildName || null;
        const place = gName ? C.placementOf(gName, o.guild || {}) : null;
        const home = place ? C.get(place.continent) : null;

        WM._titleBlock(ctx, 'THE COSMOLOGY - THE LANDS OF THE FIRST WORLD', 'THE FIVE REALMS',
            gName ? `${gName} holds its charter-stone in ${home.name}` : 'five lands, five guild kingdoms, one drowned sea between them');

        _sea(ctx);
        for (const c of C.CONTINENTS) _drawContinent(ctx, c, home && c.key === home.key);

        const placed = [];
        // the sea at the heart of the chart
        _label(ctx, placed, C.CENTRE_SEA.name.toUpperCase(), px(C.CENTRE_SEA.at[0]), py(C.CENTRE_SEA.at[1]), 'italic 17px "IM Fell Italic"', 'rgba(30,84,90,0.9)', { h: 20 });

        // marker + hamlets first (so labels dodge them)
        let markerPx = null;
        const hamlets = [];
        if (place) {
            const names = (o.memberNames || []).slice(0, 12);
            const sites = C.baseSites(gName, o.guild || {}, Math.max(names.length - 1, 0) || ((o.guild && o.guild.members) ? Math.min((o.guild.members.length || 1) - 1, 11) : 0));
            sites.forEach((s) => hamlets.push([px(s.x), py(s.y)]));
            markerPx = [px(place.marker.x), py(place.marker.y)];
            placed.push({ x: markerPx[0], y: markerPx[1] + 4, w: 44, h: 36 });
            for (const [hx, hy] of hamlets) placed.push({ x: hx, y: hy, w: 14, h: 14 });
        }

        for (const c of C.CONTINENTS) {
            const cx = px(c.centre[0]), cy = py(c.centre[1]);
            for (const [name, ox, oy] of c.regions) {
                const rx = px(c.centre[0] + ox * c.rx), ry = py(c.centre[1] + oy * c.ry);
                ctx.fillStyle = 'rgba(58,42,30,0.55)'; ctx.beginPath(); ctx.arc(rx, ry - 14, 1.8, 0, Math.PI * 2); ctx.fill();
                _label(ctx, placed, name, rx, ry, 'italic 13px "IM Fell Italic"', c.biome === 'volcanic' ? '#F0E2C2' : PAL.ink, { h: 15 });
            }
            _label(ctx, placed, c.name.toUpperCase(), cx, cy, '17px "Cinzel"', c.ink, { pill: true, h: 22 });
        }

        if (place) {
            for (const [hx, hy] of hamlets) _hamlet(ctx, hx, hy);
            _marker(ctx, markerPx[0], markerPx[1]);
            ctx.font = '14px "Cinzel"'; ctx.textAlign = 'center';
            const label = gName.length > 22 ? gName.slice(0, 21) + '…' : gName;
            const tw = ctx.measureText(label).width + 14;
            const ly = markerPx[1] - 24;
            ctx.fillStyle = PAL.wax; ctx.fillRect(markerPx[0] - tw / 2, ly - 14, tw, 20);
            ctx.fillStyle = PAL.parchment; ctx.fillText(label, markerPx[0], ly);
        }

        _compass(ctx, MX + 62, MY + MH - 62, 30);

        // plates below the map
        const py0 = MY + MH + 24;
        if (place) {
            WM._decreePlate(ctx, 70, py0, 500, 176, `CHARTER-STONE - ${place.marker.region.toUpperCase()}`, [
                `${home.name}: ${home.epithet}`,
                `${(hamlets.length + 1)} ${hamlets.length ? 'hearths' : 'hearth'} stand within a day's walk of the stone.`,
                'Every member home base shares this land,',
                `and answers to the same sky: ${home.biome === 'isle' ? 'the coast' : home.biome}.`,
            ]);
        } else {
            WM._decreePlate(ctx, 70, py0, 500, 176, 'CHOOSE A REALM', [
                'A guild picks its land when it is founded.',
                'The stone is set at a random place in that realm,',
                'and every member base grows from the same terrain.',
                'Biomes: coast, dunes, tundra, autumn wood, ashlands.',
            ]);
        }
        WM._decreePlate(ctx, 590, py0, 340, 176, 'THE REALMS', C.CONTINENTS.map((c) => `${c.name.replace(/^The /, '')} - ${c.biome === 'isle' ? 'coast' : c.biome}`));
        WM._waxSealBig(ctx, W / 2, H - 66, 24, 'K');

        WM._frame(ctx);
        return canvas.toBuffer('image/png');
    } catch (e) {
        try { console.error('[continentMapRenderer] render failed:', e.message); } catch (_) { /* noop */ }
        return null;
    }
}

module.exports = { renderContinentMap };
