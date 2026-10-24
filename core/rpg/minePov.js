'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  MINE POV — the underground mining result card, INSTANT by construction
//  (owner 2026-10-23: "let's make a mine card, one that takes place underground
//  with rocks and animations … have the assets saved on the repo, and have them
//  call for said assets and overlay like the fishing so that it's instant").
//
//  The ANIMATION is pre-baked and committed to the repo
//  (core/rpgasset/minepov/<loc>_<band>.mp4 + .jpg poster — baked offline by
//  scripts/bake_minepov_assets.js). This lane NEVER canvas-bakes a scene:
//
//    • base     — fs.readFileSync of the committed MP4 (microseconds)
//    • ribbon   — the loot banner alone on a transparent canvas, same
//                 structureScenes.drawBanner painter every overlay uses,
//                 cached per loot text through mediaCache
//    • final    — ONE ffmpeg pass plasters the ribbon over the base MP4
//                 (mediaConvert.mp4ToMp4Overlaid), cached per
//                 (loc, band, loot text) — every repeat mine with the same
//                 loot line is a pure disk read. If ffmpeg is unavailable the
//                 committed base MP4 ships as-is (still animated, loot rides
//                 the caption) — never a bake, never a stall.
//
//  Bands follow the location's own ore ladder (MINING_LOCATIONS weights):
//  the rarest ore in the haul → 'epic' sparkle surge, second-rarest → 'mid'
//  glints, anything else → 'low' quiet loop.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const mediaCache = require('./mediaCache');

const ASSET_DIR = path.join(__dirname, '..', 'rpgasset', 'minepov');
const GW = 480, GH = 360; // baked scene geometry (same canvas as the fish lane)

const LOCS = new Set([
    'shimmering_caves',
    'deep_vein_shafts',
    'volcanic_hollow',
    'void_fissure',
]);

const hashStr = (s) => require('./kingdom3d').hashStr(String(s || ''));

/** band for a haul, straight off the location's ore weight ladder */
function bandFor(locId, drops = {}) {
    try {
        const loc = require('./craftingSystem').getMiningLocations()[locId];
        if (!loc || !Array.isArray(loc.ores)) return 'low';
        const order = [...loc.ores].sort((a, b) => a.weight - b.weight); // rarest first
        if (order.length && drops[order[0].id]) return 'epic';
        if (order.length > 1 && drops[order[1].id]) return 'mid';
    } catch (e) { /* fall through */ }
    return 'low';
}

/** the loot ribbon ALONE on a transparent GW×GH canvas — the plaster. Task 25:
 *  the ribbon carries the haul's item portraits (lootArt) when drops rode in —
 *  same gold-rimmed slots the fish lane got. */
async function renderRibbonOverlay(ribbon) {
    const plateKey = hashStr(JSON.stringify({ head: ribbon.head, lines: ribbon.lines, drops: ribbon.drops || null }));
    return mediaCache.cached('mineribbon', `mr:${plateKey}`, async () => {
        const { createCanvas } = require('canvas');
        const scenes = require('./structureScenes');
        try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
        const cv = createCanvas(GW, GH), c2 = cv.getContext('2d');
        const spec = { head: ribbon.head, lines: ribbon.lines };
        if (ribbon.drops) {
            try {
                const art = await require('./lootArt').artForDrops(ribbon.drops);
                if (art.length) spec.art = art;
            } catch (e) { /* art is decorative */ }
        }
        if (spec.art && spec.art.length) scenes.drawLootBanner(c2, GW, GH, spec);
        else scenes.drawBanner(c2, GW, GH, spec);
        const png = cv.toBuffer('image/png');
        if (!png || png.length < 100) throw new Error('mine ribbon render failed');
        return { buffer: png, contentType: 'image/png' };
    });
}

/** committed scene — microsecond read, never a bake */
function loadBaseMp4(locId, band) {
    try {
        const buf = fs.readFileSync(path.join(ASSET_DIR, `${locId}_${band}.mp4`));
        if (buf.length > 5000) return buf;
    } catch (e) { /* missing asset */ }
    return null;
}

/** thumbnail: committed poster + ribbon composited small (canvas only) */
async function makeThumb(locId, band, overlayBuf) {
    try {
        const { createCanvas, loadImage } = require('canvas');
        const poster = await loadImage(path.join(ASSET_DIR, `${locId}_${band}.jpg`));
        const tw = 240, th = Math.round(240 * GH / GW);
        const tc = createCanvas(tw, th), tc2 = tc.getContext('2d');
        tc2.drawImage(poster, 0, 0, tw, th);
        if (overlayBuf) tc2.drawImage(await loadImage(overlayBuf), 0, 0, tw, th);
        return tc.toBuffer('image/jpeg');
    } catch (e) { return null; }
}

/**
 * renderMineCard({ loc, band?, drops?, banner? })
 *   → { buffer, contentType: 'video/mp4', thumb } | null (caller falls back to text)
 * banner: { head, lines: [...] } — drawn by the shared overlay painter.
 * The ribbon + thumb are composed OUTSIDE the big cache: mediaCache hits
 * return only {buffer, contentType}, and the phone bubble deserves its
 * thumbnail on every view — the thumb is canvas-only (committed poster +
 * cached ribbon, no ffmpeg), so re-composing it per view costs ~30ms.
 */
async function renderMineCard({ loc, band = null, drops = {}, banner = null } = {}) {
    if (!LOCS.has(loc)) return null;
    const resolvedBand = band || bandFor(loc, drops || {});
    const base = loadBaseMp4(loc, resolvedBand);
    if (!base) return null;
    const ribbon = banner && (banner.head || (banner.lines || []).length)
        ? { head: String(banner.head || 'The Mines'), lines: (banner.lines || []).slice(0, 6), drops: drops || null }
        : { head: 'The Mines', lines: [], drops: drops || null };
    const tR = Date.now();
    const overlay = await renderRibbonOverlay(ribbon); // cached per loot text
    const ribbonMs = Date.now() - tR;
    const thumb = await makeThumb(loc, resolvedBand, overlay ? overlay.buffer : null);
    const key = `mp:${loc}:${resolvedBand}:${hashStr(JSON.stringify(ribbon))}`;
    const t0 = Date.now();
    const out = await mediaCache.cached('minepov', key, async () => {
        let buffer = null, contentType = null, lane = 'mp4-overlay';
        try {
            buffer = await require('../utils/mediaConvert').mp4ToMp4Overlaid(base, overlay.buffer);
            contentType = 'video/mp4';
        } catch (e) {
            console.error('[mine-gif] ffmpeg overlay failed — shipping committed base as-is:', e.message);
        }
        if (!buffer) { lane = 'raw-base'; buffer = base; contentType = 'video/mp4'; }
        return { buffer, contentType, lane };
    });
    // parity with the fish lane's timing line — repeat hauls must read as disk
    // hits, fresh hauls show the real plaster cost (owner 2026-10-24: "make it
    // faster … the existing overlay being the only thing generated on demand")
    console.log(`[mine-gif] ${out && out.lane ? out.lane : 'disk-hit'} total=${Date.now() - t0}ms base=repo ribbon=${overlay && overlay.cached ? 'hit' : 'MISS'}/${ribbonMs}ms`);
    if (!out || !out.buffer) return null;
    return { buffer: out.buffer, contentType: out.contentType, thumb, lane: out.lane };
}

/**
 * Boot warm — index.js schedules this ~20s after start (idle, unref'd, once).
 * The overlay chain's FIRST run in a process pays the one-time tax: painter
 * module compiles, font registration, lootArt sprite reads, libx264 init —
 * measured 3.9s on Box2 before the very first card a user sees. Warming with
 * one throwaway plaster moves that tax to boot idle: after it, ANY haul is a
 * ~0.6s plaster (fresh text) or an ~80ms disk read (repeat), same as fishing.
 * Idempotent; failures are logged and non-fatal (lane falls back per call).
 */
let _warmPromise = null;
function warm() {
    if (_warmPromise) return _warmPromise;
    _warmPromise = (async () => {
        const t0 = Date.now();
        await renderMineCard({ loc: 'shimmering_caves', band: 'low', banner: { head: 'The Mines', lines: [] } });
        console.log(`[mine-gif] boot warm ${Date.now() - t0}ms — overlay chain hot`);
    })().catch((e) => console.error('[mine-gif] boot warm skipped:', e && e.message));
    return _warmPromise;
}

module.exports = { renderMineCard, bandFor, LOCS, warm };
