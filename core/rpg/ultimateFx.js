'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  ULTIMATE FX — sprite-sheet driven class ultimates (rewrite 2026-10-25,
//  owner: "choppy and poorly animated, not free sets taken from across the web").
//
//  The old ultimates were hand-stroked canvas lines in a 6-frame GIF. This
//  engine composites REAL pixel-art VFX frame sets (core/rpgasset/vfx: magic /
//  holy / dark / attack strips) over the battle card on a timeline
//  (charge → cast → impact → settle) with camera shake, hit-stop, zoom punch,
//  additive glow, tint, particles and a title banner, rendered at 15fps and
//  encoded to H.264 MP4 (the only lane WhatsApp plays as an animation).
//
//  renderUltimateVideo({ baseBuffer, entry, classId, name, side, palette })
//     → { mp4: Buffer, thumb: Buffer(JPEG) } | null
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createCanvas, loadImage } = require('canvas');

const DIR = path.join(__dirname, '..', 'rpgasset', 'vfx');
const W = 640, H = 480, FPS = 15;
const DURATION = 2.7;                 // seconds (incl. settle hold)
const IMPACT = 1.05;                  // seconds: the hit lands

// ── sprite sets ─────────────────────────────────────────────────────────────
const SETS = {
    lightning:  { dir: 'magic', prefix: 'Lightning', n: 11, fps: 18 },
    dark_bolt:  { dir: 'magic', prefix: 'Dark-Bolt', n: 12, fps: 16 },
    holy_burst: { dir: 'holy',  prefix: 'Holy VFX 02 ', n: 16, fps: 18 },
    holy_start: { dir: 'holy',  prefix: 'Holy VFX 01 Initial', n: 2, fps: 8 },
    holy_loop:  { dir: 'holy',  prefix: 'Holy VFX 01 Repeatable', n: 8, fps: 16 },
    holy_pillar:{ dir: 'holy',  prefix: 'Holy VFX 01 Impact', n: 7, fps: 14 },
    dark_a:     { dir: 'dark',  prefix: 'Dark VFX 1 (40x32)', n: 17, fps: 18 },
    dark_b:     { dir: 'dark',  prefix: 'Dark VFX 2 (48x64)', n: 16, fps: 16 },
    ice_shards: { strip: 'attack1.png', n: 4, fps: 8 },
    white_burst:{ strip: 'attack2.png', n: 4, fps: 10 },
    ice_beam:   { strip: 'attack3.png', n: 4, fps: 9 },
    fire_slash: { strip: 'attack5.png', n: 4, fps: 10 },
    vine_slash: { strip: 'attack6.png', n: 4, fps: 8 },
    claw:       { strip: 'attack7.png', n: 4, fps: 10 },
    // CC0 Foozle/Baldur pixel strips (48px tall) + Kenney smoke/explosion sets, see rpgasset/vfx/CREDITS.md
    necro1:     { root: 'foozle_necro_attack01.png', n: 7, fps: 12 },
    necro2:     { root: 'foozle_necro_attack02.png', n: 7, fps: 12 },
    necro3:     { root: 'foozle_necro_attack03.png', n: 12, fps: 14 },
    destroy:    { root: 'foozle_destroy.png', n: 6, fps: 12 },
    wave_big:   { root: 'foozle_wave_big.png', n: 3, fps: 8 },
    k_ground:   { kdir: 'ground_', n: 9, fps: 18, smooth: true },
    k_regular:  { kdir: 'regular_', n: 9, fps: 18, smooth: true },
    k_pixel:    { kdir: 'pixel_', n: 9, fps: 18 },
    k_simple:   { kdir: 'simple_', n: 9, fps: 18, smooth: true },
    k_sonic:    { kdir: 'sonic_', n: 9, fps: 20, smooth: true },
    k_sexp:     { kdir: 'sexp_', n: 5, fps: 12, smooth: true },
    k_flash:    { kdir: 'flash_', n: 5, fps: 14, smooth: true },
    k_puff:     { kdir: 'puff_', n: 13, fps: 16, smooth: true },
    k_bsmoke:   { kdir: 'bsmoke_', n: 13, fps: 14, smooth: true },
    k_gas:      { kdir: 'gas_', n: 5, fps: 8, smooth: true },
    // 💡 REAL-ART LAYER SETS (owner 2026-10-27: "replace all the hand made art ... with actual
    // game assets"): the layer painters swap their procedural bodies for these free packs.
    // `base` is relative to core/rpgasset/ (the merged fx/ library); `from`+`pad` support
    // zero-padded non-1-based frame numbers (fx/circle ships 010000-010027).
    // 🔥 ROUND 2 (owner 2026-10-27: "the flame... idk I don't like this these flame assets you used"):
    // fire_blast (4×96px pixel blobs), fire_bomb (15 tiny blobs) and the Fire-Wrath jets are
    // replaced with big license-clean art: Sinestesia 2D Explosion Animations (CC0), Cethiel
    // Fireball Effect (CC0) — see vfx/CREDITS.md. Same SET KEYS so recipes never change.
    fire_blast: { dir: 'fire2', prefix: 'blast_', n: 6, fps: 12, smooth: true },
    fire_bomb:  { dir: 'fire2', prefix: 'stream_', n: 6, fps: 10, smooth: true },
    fire_jet:   { dir: 'fire2', prefix: 'jet_', n: 4, fps: 8, smooth: true },
    elem_fire:  { dir: 'fire2', prefix: 'jet_', n: 4, fps: 8, smooth: true },
    // ⏳ MAGIC CLOCK (owner: "a gaint magic clock fade in adn out"): AntumDeluge clock-animation
    // tick loop + Cethiel Cosmic-Time mandala halo (both CC0), stacked in LAYERS.magicClock.
    clock_face: { dir: 'clock', prefix: 'face_', n: 12, fps: 12, smooth: true },
    clock_mandala: { dir: 'clock', prefix: 'mandala_', n: 7, fps: 10, smooth: true },
    // ☄️ REAL METEORS (owner: "the Meteor sprite for both the mage and apprentice skills are ASS"):
    // boulder = JadisGames rotating rock (CC-BY 4.0, trail drawn in code), comet = Game Developer
    // Studio high-res fire ball with its own tail (CC-BY 3.0).
    meteor_rock:{ dir: 'meteor', prefix: 'boulder_', n: 8, fps: 12, smooth: true },
    meteor_comet:{ dir: 'meteor', prefix: 'comet_', n: 6, fps: 12, smooth: true },
    // 💀 REAL SCYTHE (owner: "The reapers syth should be a real syth"): Wenrexa dark scythe (CC0).
    scythe_art: { dir: 'scythe', prefix: 'scythe', n: 1, fps: 1, smooth: true },
    // 🐉 DRAGON_LORD color-inverted wyvern (owner: "the dragon lord should have the color be inverted")
    dragon_head_inv:{ dir: 'dragon', prefix: 'dragon_', n: 6, fps: 10, smooth: true, invert: true },
    rune_circle:{ base: 'fx', dir: 'circle', prefix: '', n: 28, fps: 16, from: 10000, pad: 6, smooth: true },
    portal:     { base: 'fx', dir: 'portal1', prefix: 'portal', n: 64, fps: 20, from: 1, pad: 2, smooth: true },
    soul_orb:   { base: 'fx', dir: 'cosmic/1', prefix: 'Cosmic_', n: 5, fps: 10, from: 1, pad: 2, smooth: true },
    elem_water: { base: 'fx', dir: 'water/01', prefix: 'Water__', n: 5, fps: 10, from: 1, pad: 2, smooth: true },
    elem_light: { base: 'fx', dir: 'light', prefix: 'LightEffect_', n: 25, fps: 14, from: 1, pad: 2, smooth: true },
    elem_earth: { base: 'fx', dir: 'earth/1', prefix: 'Earth-Impact_', n: 5, fps: 10, from: 1, pad: 2, smooth: true },
    music_note: { base: 'fx', dir: 'music/purple/1', prefix: 'Music_', n: 5, fps: 10, from: 1, pad: 2, smooth: true },
    dragon_head:{ dir: 'dragon', prefix: 'dragon_', n: 6, fps: 10, smooth: true },
    robo_hand:  { dir: 'robo', prefix: 'robo_', n: 2, fps: 8, smooth: true },
};
// sets the layer painters consume directly from env.sets (preloaded once per process)
const LAYER_ART = ['rune_circle', 'portal', 'soul_orb', 'fire_jet', 'elem_fire', 'elem_water', 'elem_light', 'elem_earth', 'music_note', 'dragon_head', 'dragon_head_inv', 'robo_hand', 'claw', 'clock_face', 'clock_mandala', 'meteor_rock', 'meteor_comet', 'scythe_art'];

// 🔥 BOOT PREWARM (Task 26-R2, owner: "the new animations haven't been wired into the combat"):
// the real DRAGON_GOD cast 13:26Z rendered 16.3s on a cold image cache, blew the 9s race and fell
// back to the OLD hand-drawn GIF — the exact "preview shows new anims, combat shows old ones" report.
// Decode every set once, in the background, the moment this module loads (boot-time via the
// guildAdventure require). Promise-memoized loadSet keeps concurrent casts from double-decoding.
let _prewarmed = false;
function prewarm() {
    if (_prewarmed) return;
    _prewarmed = true;
    setImmediate(() => {
        (async () => {
            const t0 = Date.now();
            for (const nm of Object.keys(SETS)) await loadSet(nm);
            await loadSingles();
            await loadHudIcons();
            console.log('[UltFx] prewarm: ' + _frames.size + ' sets cached in ' + (Date.now() - t0) + 'ms');
        })().catch((e) => console.warn('[UltFx] prewarm failed:', e?.message || e));
    });
}
prewarm();
const LAYERS = (() => { try { return require('./ultimateFxLayers').LAYERS; } catch (e) { console.warn('[UltFx] layers unavailable:', e.message); return {}; } })();
const plates = require('./ultimatePlateCache');

// ── PLATE CACHE wiring (Task 26-R5, owner: "pre-bake them so it's really
// fast" + "some effects have to be behind the player and some on top") ──
// Per-duel pixels (combatant cutouts, the isolated focus sprite, tint/hurt
// overlays) can never be plates — they stay LIVE. Everything else paints
// self-contained fx whose geometry is pinned by the cache key, so repeat
// casts replay them as a few drawImage calls. Painters are grouped per pass
// (ground/under, air/over) into consecutive same-blend-mode runs: 'over'
// groups replay with source-over, additive groups with 'lighter' — alpha
// compositing chains are associative within a mode, so capture-vs-live stays
// pixel-faithful except where a painter mixes modes internally (vortex's
// lighter rim outside its opaque warp disk — bounded, QA-eyeballed).
const PLATE_LIVE = new Set(['hands', 'focus', 'affect', 'hurt', 'dash']);
const PLATE_NOOP = new Set(['camera', 'hidecaster']);   // logic-only tracks, consumed by the frame loop
// 🔥 26-R5 blend audit (every painter read line-by-line): only PURE-mode
// painters are plateable — a painter mixing source-over and lighter strokes
// inside one body can NEVER replay exactly from a single raster (over-after-
// add is not associative against the scene). Mixed painters (dragon's opaque
// art + additive jets, fall's boulders + jets, rift's pit + portal, eclipse's
// disk, slashes' coin/shuriken fills, magicClock, cracks, invert's
// 'difference', blackhole, elements, robohand) and every UNKNOWN layer stay
// LIVE — cheap painters get skip-markers anyway, so nothing regresses.
const LAYER_GCO = Object.assign({
    // pure additive (glow particles, light strokes, sprite(add:true) art)
    emit: 'lighter', pillar: 'lighter', rings: 'lighter', beam: 'lighter',
    crescent: 'lighter', ripple: 'lighter', tether: 'lighter', reticle: 'lighter',
    staff: 'lighter', soulflow: 'lighter', swarm: 'lighter', breath: 'lighter',
    circle: 'lighter',
    // pure source-over (vortex's ring is baked into its own raster — see layers2)
    // NOTE: scythe/dragon/fall/rift/eclipse/magicClock/slashes stay LIVE (mixed modes)
    vortex: 'over', bgfill: 'over', gears: 'over', vines: 'over',
}, JSON.parse(process.env.ULT_PLATE_GCO || '{}'));   // QA escape hatch: {"name":"live"|"lighter"|"over"}
function plateGco(tr) {
    if (!tr.layer) return tr.add ? 'lighter' : 'over';                    // fx-instance tracks (pure per track)
    if (PLATE_LIVE.has(tr.layer)) return 'live';
    if (tr.layer === 'wash') return tr.add ? 'lighter' : 'over';          // flash vs dark veil
    const g = LAYER_GCO[tr.layer];
    if (g !== 'lighter' && g !== 'over') return 'live';                   // unknown/mixed → live, never guess
    return g;
}
// per pass: consecutive plate-safe tracks with the same blend mode form one
// plate group; live tracks split groups so z-order is preserved exactly.
function buildGroups(list) {
    const groups = [];
    let cur = null;
    for (const tr of list) {
        if (!tr.layer && !tr.fx) continue;
        if (tr.layer && (PLATE_NOOP.has(tr.layer) || !LAYERS[tr.layer])) continue;
        const g = plateGco(tr);
        if (g === 'live') { groups.push({ live: tr }); cur = null; continue; }
        if (!cur || cur.mode !== g) { cur = { mode: g, tracks: [] }; groups.push(cur); }
        cur.tracks.push(tr);
    }
    return groups.filter((g) => g.live || g.tracks.length);
}
const groupMetaOf = (gs) => gs.map((g) => (g.live ? { live: 1, layer: g.live.layer } : { mode: g.mode, tracks: g.tracks.map((t) => t.layer || 'fx:' + t.fx) }));
function paintOne(ctx2, tr, o) {
    if (tr.layer) { const L = LAYERS[tr.layer]; if (L) { ctx2.save(); try { L(ctx2, tr, o.env); } catch (e) { /* a bad layer never kills the clip */ } ctx2.restore(); } }
    else drawTrackInstances(ctx2, tr, o.sets, o.A, o.time, mulberry(o.seed + o.f), o.palette);
}
// cheap alpha probe on a 4px grid — a run canvas with NO painted pixels stores
// nothing, and the replay skips it entirely (empty plates decode+blit for free otherwise)
function plateRunIsEmpty(rc, w, h) {
    try {
        const d = rc.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y += 4) {
            const row = y * w;
            for (let x = 0; x < w; x += 4) if (d[(row + x) * 4 + 3] !== 0) return false;
        }
        return true;
    } catch (e) { return false; }   // can't prove empty → store it
}
const _plateScratch = null;   // (unused — per-render scratch lives on o.scratch)
async function paintGroups(ctx, groups, o) {
    const { f, env, plateMeta, plateKey, plateCap } = o;
    const pass = o.under ? 'u' : 'o';
    for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (g.live) { paintOne(ctx, g.live, o); continue; }
        if (plateMeta) {
            const idx = plates.plateIndex(plateMeta, f, pass, gi);
            if (idx === -1) continue;   // capture proved this frame paints nothing → skip entirely
            if (idx !== undefined && idx >= 0) {
                try {
                    let img = o.imgCache.get(idx);
                    if (!img) { img = await loadImage(plates.frameFile(plateKey, idx)); o.imgCache.set(idx, img); }
                    ctx.save(); ctx.globalAlpha = 1;
                    if (o.camM) ctx.setTransform(1, 0, 0, 1, 0, 0);   // plate pixels already carry the camera (baked at capture)
                    ctx.globalCompositeOperation = g.mode === 'lighter' ? 'lighter' : 'source-over';
                    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, env.W, env.H);
                    ctx.restore();
                    continue;
                } catch (e) { /* unreadable plate → capture-paint below */ }
            }
        }
        let run = o.scratch.get(gi);
        if (!run) { run = createCanvas(env.W, env.H); o.scratch.set(gi, run); }
        const rc = run.getContext('2d');
        const paintT0 = Date.now();
        rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalAlpha = 1;
        rc.globalCompositeOperation = 'source-over';
        rc.imageSmoothingEnabled = true; rc.clearRect(0, 0, env.W, env.H);
        if (o.camM) rc.setTransform(o.camM[0], o.camM[1], o.camM[2], o.camM[3], o.camM[4], o.camM[5]);   // 📸 bake the live camera into the plate
        for (const tr of g.tracks) paintOne(rc, tr, o);
        if (plateCap) {
            plateCap.paintMs = (plateCap.paintMs || 0) + (Date.now() - paintT0);
            plateCap.paintByGroup[pass + gi] = (plateCap.paintByGroup[pass + gi] || 0) + (Date.now() - paintT0);
        }
        ctx.save(); ctx.globalAlpha = 1;
        if (o.camM) ctx.setTransform(1, 0, 0, 1, 0, 0);   // camera is baked into the plate — blit 1:1
        ctx.globalCompositeOperation = g.mode === 'lighter' ? 'lighter' : 'source-over';
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(run, 0, 0, env.W, env.H);
        ctx.restore();
        if (plateCap) {
            try {
                // 🔥 26-R5 per-group adaptive capture — decided at PERSIST time (see the
                // persist block): cheap groups (<150ms cumulative paint) replay live and
                // never cost PNG storage. The old per-frame check marked a group live on
                // its FIRST frames (cumulative still <150) and then the persist loop
                // discarded every png of that group — DRAGON_GOD ended with uniques=0 and
                // its plates NEVER persisted (every cast re-captured, zero HITs ever).
                if (plateRunIsEmpty(rc, env.W, env.H)) continue;   // fully transparent frame → store nothing, replay skips it
                plateCap.pngs.set(pass + gi + '_' + f, await run.toBuffer('image/png', { compressionLevel: 1 }));
            } catch (e) { /* skip this plate */ }
        }
    }
}
function plateGroupsDirect(ctx, groups, o) {
    for (const g of groups) {
        if (g.live) { paintOne(ctx, g.live, o); continue; }
        for (const tr of g.tracks) paintOne(ctx, tr, o);   // plates disabled → the original direct path
    }
}
// hash the base scene's DECODED pixels (not its bytes — the Go renderer's PNG
// encoding may embed nondeterminism, the battlefield pixels don't)
function basePixelHash(base) {
    try {
        const bc = createCanvas(W, H), bgc = bc.getContext('2d');
        bgc.drawImage(base, 0, 0, W, H);
        return plates.sha1(Buffer.from(bgc.getImageData(0, 0, W, H).data));
    } catch (e) { return 'nbpix'; }
}
const RECIPE_PACK = (() => { try { return require('./ultimateFxRecipes'); } catch (e) { console.warn('[UltFx] class recipes unavailable:', e.message); return null; } })();
// one plate-save job at a time — concurrent PNG-encode storms (45-class sweep /
// chained duel casts) starve the render loop and pushed a NECROMANCER capture
// to 114s in QA. Serializing keeps at most one save's encode on the loop.
let plateSaveChain = Promise.resolve();
const _singles = new Map();
async function loadSingles() {
    if (_singles.size) return _singles;
    const dir = path.join(DIR, 'kenney');
    try { for (const f of fs.readdirSync(dir)) if (/^p_.*\.png$/.test(f)) _singles.set(f.replace('.png', ''), await loadImage(path.join(dir, f))); } catch (e) { /* layers draw without sprites */ }
    return _singles;
}
const _frames = new Map();
const _tinted = new Map();

// ── ASSET MANIFEST (2026-10-27): drop-in swapping of effect art without touching code ──────────
// core/rpgasset/vfx/vfx_assets.json  { sets: {name: def}, overrides: {layer | layer@CLASS: {set, w, n, ...}} }
// See core/rpgasset/vfx/README_SWAP.md. Re-read automatically when the file changes.
const MANIFEST_PATH = path.join(DIR, 'vfx_assets.json');
let _manifest = { sets: {}, overrides: {} }, _manifestMtime = 0;
const OVERRIDABLE = new Set(['slashes', 'swarm', 'scythe', 'robohand', 'breath', 'dragon', 'tether', 'soulflow', 'elements', 'reticle', 'staff', 'ripple', 'eclipse', 'rings', 'pillar', 'crescent', 'circle', 'rift', 'cracks', 'vines', 'gears', 'blackhole', 'fall', 'emit', 'beam']);
function loadManifest() {
    try {
        const st = fs.statSync(MANIFEST_PATH);
        if (st.mtimeMs === _manifestMtime) return _manifest;
        const j = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        for (const nm of Object.keys(_manifest.sets || {})) { if (SETS[nm] && SETS[nm].__manifest) { delete SETS[nm]; _frames.delete(nm); } }
        for (const [nm, def] of Object.entries(j.sets || {})) { if (nm.startsWith('_')) continue; SETS[nm] = Object.assign({ fps: 16, n: 1 }, def, { __manifest: true }); _frames.delete(nm); }
        _manifest = { sets: j.sets || {}, overrides: j.overrides || {} };
        _manifestMtime = st.mtimeMs;
    } catch (e) { if (e && e.code !== 'ENOENT') console.warn('[UltFx] vfx_assets.json unusable:', e.message); _manifest = { sets: {}, overrides: {} }; }
    return _manifest;
}
function applyOverrides(tracks, cls) {
    const ov = loadManifest().overrides || {};
    if (!Object.keys(ov).length) return tracks;
    return tracks.map((t) => {
        if (!t.layer || !OVERRIDABLE.has(t.layer)) return t;
        const o = ov[t.layer + '@' + cls] || ov[t.layer];
        if (!o || !o.set || !SETS[o.set]) return t;
        const base = o.w || t.w || (t.R ? t.R * 2 : 0) || (t.r ? t.r * 2 : 0) || (t.len ? t.len * 1.4 : 0) || 220;
        return {
            fx: o.set, at: t.at, pos: t.pos || 'T', off: o.off || t.off, w: base, n: o.n || 1, gap: o.gap !== undefined ? o.gap : (t.gap || 0.08),
            jit: o.jit || t.jit, rot: o.rot !== undefined ? o.rot : t.rot, tint: o.tint, alpha: o.alpha, add: o.add !== false, loop: !!o.loop,
            dur: o.dur || (o.loop ? t.dur : undefined), to: o.to ? 'T' : undefined, flip: o.flip, under: t.under, spread: t.spread, fanGap: t.fanGap, _pt: t._pt,
        };
    });
}

const _framePromises = new Map();
function loadSet(name) {
    if (_frames.has(name)) return Promise.resolve(_frames.get(name));
    let p = _framePromises.get(name);
    if (p) return p;                                   // concurrent casts share one decode
    p = loadSetReal(name).then((out) => { _framePromises.delete(name); return out; },
        (e) => { _framePromises.delete(name); return []; });
    _framePromises.set(name, p);
    return p;
}
async function loadSetReal(name) {
    const def = SETS[name];
    if (!def) return [];
    const out = [];
    try {
        if (def.grid || def.files) {
            // grid: one sheet cut into cols x rows cells (row-major, `n` frames used); files: list of single frames
            if (def.files) { for (const f of def.files) out.push(await loadImage(path.join(DIR, f))); }
            else {
                const img = await loadImage(path.join(DIR, def.file)), cols = def.grid.cols || 1, rows = def.grid.rows || 1;
                const fw = Math.floor(img.width / cols), fh = Math.floor(img.height / rows), total = Math.min(def.n || cols * rows, cols * rows);
                for (let i = 0; i < total; i++) { const c = createCanvas(fw, fh); c.getContext('2d').drawImage(img, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh, 0, 0, fw, fh); out.push(c); }
            }
        } else if (def.kdir) {
            for (let i = 1; i <= def.n; i++) out.push(await loadImage(path.join(DIR, 'kenney', `${def.kdir}${i}.png`)));
        } else if (def.strip || def.root) {
            const rootBase = def.base ? path.join(DIR, '..', def.base) : DIR;
            const img = await loadImage(def.root ? path.join(rootBase, def.root) : path.join(DIR, 'attack', def.strip));
            const fw = Math.floor(img.width / def.n);
            for (let i = 0; i < def.n; i++) {
                const c = createCanvas(fw, img.height);
                c.getContext('2d').drawImage(img, i * fw, 0, fw, img.height, 0, 0, fw, img.height);
                out.push(c);
            }
        } else {
            const dirBase = def.base ? path.join(DIR, '..', def.base) : DIR;
            for (let i = 1; i <= def.n; i++) {
                const idx = (def.from === undefined ? 1 : def.from) - 1 + i;
                const tag = def.pad ? String(idx).padStart(def.pad, '0') : String(idx);
                out.push(await loadImage(path.join(dirBase, def.dir, `${def.prefix}${tag}.png`)));
            }
        }
        // 🐉 invert variant (DRAGON_LORD: "the color be inverted"): negative of every frame,
        // alpha preserved — cached like a normal set (dragon_head_inv).
        if (def.invert) {
            for (let i = 0; i < out.length; i++) {
                const c = createCanvas(out[i].width, out[i].height), g = c.getContext('2d');
                g.drawImage(out[i], 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
                for (let k = 0; k < px.length; k += 4) { px[k] = 255 - px[k]; px[k + 1] = 255 - px[k + 1]; px[k + 2] = 255 - px[k + 2]; }
                g.putImageData(d, 0, 0);
                out[i] = c;
            }
        }
    } catch (e) { out.length = 0; }
    _frames.set(name, out);
    return out;
}

function tintFrame(img, color, strength, key) {
    const k = key + '|' + color + '|' + strength;
    if (_tinted.has(k)) return _tinted.get(k);
    const c = createCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = strength;
    g.fillStyle = color;
    g.fillRect(0, 0, img.width, img.height);
    _tinted.set(k, c);
    return c;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 2);
function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── recipes ────────────────────────────────────────────────────────────────
// track: { fx, at (s), pos:'T'|'C'|'F'|[fx,fy], off:[px,py], to:'T'|'C'|[..] (travel over `dur`),
//          w (px width), dur, loop, alpha, add (additive), flip, rot, tint:[css,strength], n, jit:[jx,jy], gap (s between n) }
const RECIPES = {
    fire: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#ff7a1a', 0.35], add: true, alpha: 0.9 },
        { fx: 'fire_blast', at: IMPACT - 0.35, pos: 'T', w: 120, off: [0, -150], to: 'T', dur: 0.35, loop: true, alpha: 1 },
        { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 360, n: 3, jit: [70, 40], gap: 0.1, off: [0, 0] },
        { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 250, n: 2, jit: [30, 20], gap: 0.12, rot: [0.4, -0.7] },
        { fx: 'fire_bomb', at: IMPACT + 0.15, pos: 'T', w: 300, off: [0, -10], add: true, alpha: 0.85 },
    ],
    ice: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#59c8ff', 0.8], add: true, alpha: 0.9 },
        { fx: 'ice_beam', at: IMPACT - 0.45, pos: 'C', to: 'T', dur: 0.45, w: 220, loop: true },
        { fx: 'ice_beam', at: IMPACT, pos: 'T', w: 330, n: 2, jit: [60, 30], gap: 0.1 },
        { fx: 'ice_shards', at: IMPACT + 0.05, pos: 'T', w: 300, n: 3, jit: [70, 50], gap: 0.09 },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 260, add: true },
    ],
    slash: (p) => [
        { fx: 'white_burst', at: 0.1, pos: 'C', w: 160, dur: 0.8, add: true, alpha: 0.7, tint: [p[1], 0.6] },
        { fx: 'claw', at: IMPACT - 0.1, pos: 'T', w: 300, n: 4, jit: [50, 45], gap: 0.09, rot: [-0.5, 0.3, -0.2, 0.6] },
        { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 280, n: 2, jit: [25, 15], gap: 0.13, rot: [0.5, -0.9], tint: [p[1], 0.45] },
        { fx: 'white_burst', at: IMPACT + 0.02, pos: 'T', w: 300, add: true },
    ],
    shadow: (p) => [
        { fx: 'dark_a', at: 0.05, pos: 'C', w: 150, dur: 0.9, loop: true, alpha: 0.8 },
        { fx: 'dark_a', at: IMPACT - 0.45, pos: 'C', to: 'T', dur: 0.45, w: 150, n: 3, jit: [0, 40], gap: 0.06, loop: true },
        { fx: 'claw', at: IMPACT, pos: 'T', w: 300, n: 4, jit: [60, 50], gap: 0.08, rot: [-0.7, 0.5, -0.3, 0.8], tint: ['#9d86ff', 0.8] },
        { fx: 'dark_b', at: IMPACT + 0.05, pos: 'T', w: 300, off: [0, -20] },
    ],
    holy: (p) => [
        { fx: 'holy_start', at: 0.05, pos: 'C', w: 120, dur: 0.9, loop: true, add: true },
        { fx: 'holy_burst', at: 0.15, pos: 'C', w: 220, dur: 0.9, add: true, alpha: 0.7 },
        { fx: 'holy_pillar', at: IMPACT - 0.2, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [90, 0], gap: 0.08 },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 380, add: true },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 300, add: true },
    ],
    holySelf: (p) => [
        { fx: 'holy_burst', at: 0.05, pos: 'C', w: 330, add: true },
        { fx: 'holy_loop', at: 0.2, pos: 'C', w: 180, off: [0, -40], dur: 1.6, loop: true, add: true },
        { fx: 'holy_pillar', at: IMPACT - 0.3, pos: 'C', w: 300, off: [0, -130], n: 2, jit: [60, 0], gap: 0.12 },
        { fx: 'holy_burst', at: IMPACT, pos: 'C', w: 420, add: true, alpha: 0.9 },
    ],
    dark: (p) => [
        { fx: 'dark_b', at: 0.05, pos: 'C', w: 200, dur: 0.9, loop: true, alpha: 0.85 },
        { fx: 'dark_bolt', at: IMPACT - 0.5, pos: 'C', to: 'T', dur: 0.5, w: 210 },
        { fx: 'dark_bolt', at: IMPACT, pos: 'T', w: 340, n: 2, jit: [50, 30], gap: 0.1 },
        { fx: 'dark_b', at: IMPACT + 0.05, pos: 'T', w: 330, n: 2, jit: [60, 30], gap: 0.14, off: [0, -20] },
        { fx: 'dark_a', at: IMPACT + 0.1, pos: 'T', w: 180, n: 4, jit: [110, 70], gap: 0.07 },
    ],
    storm: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 150, dur: 0.9, tint: ['#7de7ff', 0.7], add: true },
        { fx: 'lightning', at: IMPACT - 0.35, pos: 'T', w: 300, off: [-10, -60], n: 5, jit: [95, 25], gap: 0.07 },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 320, add: true },
        { fx: 'lightning', at: IMPACT + 0.25, pos: 'T', w: 260, n: 3, jit: [80, 30], gap: 0.09 },
    ],
    nature: (p) => [
        { fx: 'vine_slash', at: 0.05, pos: 'C', w: 180, dur: 0.9, loop: true, alpha: 0.9 },
        { fx: 'vine_slash', at: IMPACT - 0.3, pos: 'T', w: 330, n: 4, jit: [70, 45], gap: 0.1, rot: [0, 0.8, -0.8, 1.6] },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 300, tint: ['#55d65b', 0.85], add: true },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 240, tint: ['#9cff7a', 0.6], add: true },
    ],
    gold: (p) => [
        { fx: 'holy_burst', at: 0.05, pos: 'C', w: 240, add: true, tint: ['#ffc531', 0.9] },
        { fx: 'holy_pillar', at: IMPACT - 0.3, pos: 'T', w: 280, off: [0, -120], n: 3, jit: [100, 0], gap: 0.07, tint: ['#ffcf3a', 0.85] },
        { fx: 'holy_burst', at: IMPACT, pos: 'T', w: 380, add: true, tint: ['#ffcf3a', 0.9] },
        { fx: 'white_burst', at: IMPACT + 0.05, pos: 'T', w: 260, add: true, tint: ['#ffe27a', 0.8] },
    ],
    cataclysm: (p) => [
        { fx: 'fire_bomb', at: 0.05, pos: 'C', off: [0, 10], w: 160, dur: 0.9, add: true },
        { fx: 'ice_shards', at: IMPACT - 0.3, pos: 'T', w: 300, n: 2, jit: [80, 40], gap: 0.1 },
        { fx: 'lightning', at: IMPACT - 0.25, pos: 'T', w: 280, n: 3, jit: [100, 20], gap: 0.08 },
        { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 400, n: 3, jit: [80, 45], gap: 0.1 },
        { fx: 'fire_bomb', at: IMPACT + 0.1, pos: 'T', w: 340, add: true },
    ],
    void: (p) => [
        { fx: 'dark_b', at: 0.0, pos: 'T', w: 260, dur: 1.0, loop: true, alpha: 0.9, off: [0, -10] },
        { fx: 'dark_b', at: 0.2, pos: 'T', w: 360, dur: 0.9, loop: true, alpha: 0.6, tint: ['#7a4cff', 0.5], add: true },
        { fx: 'dark_bolt', at: IMPACT - 0.2, pos: 'T', w: 360, n: 3, jit: [60, 40], gap: 0.09, tint: ['#9d6bff', 0.6] },
        { fx: 'white_burst', at: IMPACT, pos: 'T', w: 280, add: true, tint: ['#b794ff', 0.7] },
    ],
};

const STYLE_RECIPE = {
    FIGHTER: 'slash', WARRIOR: 'slash', SAMURAI: 'slash', SHOGUN: 'slash', BERSERKER: 'fireSlash',
    SCOUT: 'slash', ROGUE: 'shadow', NINJA: 'shadow', KAGE: 'shadow', NIGHTBLADE: 'shadow',
    APPRENTICE: 'fire', MAGE: 'fire', DRAGONSLAYER: 'fire', DRAGON_GOD: 'fire', DRAGON_LORD: 'fire', DOOMSLAYER: 'fire', WARLORD: 'fire',
    ELEMENTALIST: 'cataclysm', AVATAR: 'cataclysm',
    ACOLYTE: 'holy', PALADIN: 'holy', CLERIC: 'holy', SAINT: 'holy', DIVINE_FIST: 'holySelf', MONK: 'holySelf', ZENMASTER: 'holySelf', TEMPLAR: 'holySelf', GOD_HAND: 'holySelf',
    NECROMANCER: 'dark', WARLOCK: 'dark', LICH: 'dark', DEATH_LORD: 'dark', REAPER: 'dark', VIRTUOSO: 'dark',
    VOIDWALKER: 'void', ARCHMAGE: 'void',
    CHRONOMANCER: 'storm', TIMELORD: 'storm', ARTIFICER: 'storm', GRAND_INVENTOR: 'storm', BARD: 'ice',
    DRUID: 'nature', ARCHDRUID: 'nature',
    MERCHANT: 'gold', TYCOON: 'gold',
};
RECIPES.fireSlash = (p) => [
    ...RECIPES.slash(p).slice(0, 2),
    { fx: 'fire_blast', at: IMPACT, pos: 'T', w: 320, n: 2, jit: [60, 35], gap: 0.1 },
    { fx: 'fire_slash', at: IMPACT + 0.05, pos: 'T', w: 300, n: 2, jit: [25, 15], gap: 0.13, rot: [0.5, -0.9] },
];

// ── drawing ─────────────────────────────────────────────────────────────────
function anchor(spec, A) {
    if (Array.isArray(spec)) return [spec[0] * W, spec[1] * H];
    return A[spec] || A.T;
}

function drawTrackInstances(ctx, tr, sets, A, time, rng, palette) {
    const frames = sets[tr.fx];
    if (!frames || !frames.length) return;
    const def = SETS[tr.fx];
    const n = tr.n || 1, gap = tr.gap || 0;
    for (let i = 0; i < n; i++) {
        const t0 = tr.at + i * gap;
        const dur = tr.dur || (frames.length / def.fps);
        let lt = time - t0;
        if (lt < 0) continue;
        if (!tr.loop && lt > dur + 0.04) continue;
        if (tr.loop && tr.dur && lt > tr.dur) continue;
        // per-instance deterministic jitter
        const jr = mulberry(hash(tr.fx + i + tr.at));
        const jx = tr.jit ? (jr() - 0.5) * 2 * tr.jit[0] : 0, jy = tr.jit ? (jr() - 0.5) * 2 * tr.jit[1] : 0;
        let [px, py] = tr._pt ? [tr._pt[0], tr._pt[1]] : anchor(tr.pos, A);
        if (tr.to) {
            const [qx, qy] = tr._ptTo ? [tr._ptTo[0], tr._ptTo[1]] : anchor(tr.to, A);
            const u = easeIn(lt / (tr.dur || 0.4));
            px = px + (qx - px) * u; py = py + (qy - py) * u;
        }
        px += (tr.off ? tr.off[0] : 0) + jx; py += (tr.off ? tr.off[1] : 0) + jy;
        const fi = tr.loop ? Math.floor(lt * def.fps) % frames.length : Math.min(frames.length - 1, Math.floor(lt * def.fps * (frames.length / (dur * def.fps))));
        let img = frames[fi];
        if (tr.tint) img = tintFrame(img, tr.tint[0], tr.tint[1], tr.fx + fi);
        const w = tr.w || 200, h = w * (img.height / img.width);
        const fade = tr.loop ? 1 : Math.min(1, (dur - lt) / 0.2 + 0.2);
        const rot = Array.isArray(tr.rot) ? tr.rot[i % tr.rot.length] : (tr.rot || 0);
        ctx.save();
        // 💡 GLITCH FIX (2026-10-26, owner: "weird rectangle thing where the
        // monster was"): these fx sheets are 48-64px pixel art that get blown
        // up 3-5x on the 640x480 video - nearest-neighbour at that ratio
        // shatters the sprite into hard red/black blocks (the necro3 crown
        // read as corrupted glitch rectangles around the sinking monster).
        // Smooth every upscale; keep the sheet's own crispness at 1x / down.
        const upscaling = w > img.width * 1.5;
        ctx.imageSmoothingEnabled = upscaling || !!def.smooth;
        if (upscaling) ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = (tr.alpha !== undefined ? tr.alpha : 1) * Math.min(1, fade) * Math.min(1, lt / 0.06 + 0.25);
        if (tr.add) ctx.globalCompositeOperation = 'lighter';
        ctx.translate(px, py);
        if (rot) ctx.rotate(rot);
        if (tr.flip || (tr.to && A.T[0] < A.C[0])) ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
}

function glow(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', String(a)));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

function rgba(hex, a) {
    const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function embers(ctx, A, time, palette, seed) {
    const r = mulberry(seed);
    for (let i = 0; i < 26; i++) {
        const born = r() * (DURATION - 0.6), life = 0.7 + r() * 0.7;
        const lt = time - born; if (lt < 0 || lt > life) continue;
        const near = born < IMPACT ? A.C : A.T;
        const bx = near[0] + (r() - 0.5) * 120, by = near[1] + (r() - 0.2) * 60;
        const vx = (r() - 0.5) * 90, vy = -50 - r() * 90;
        const x = bx + vx * lt, y = by + vy * lt + 60 * lt * lt;
        const s = 3 + Math.floor(r() * 3) * 2;
        ctx.save(); ctx.globalAlpha = (1 - lt / life) * 0.9; ctx.fillStyle = palette[Math.floor(r() * 3)];
        ctx.fillRect(Math.round(x), Math.round(y), s, s); ctx.restore();
    }
}

function banner(ctx, time, name, color, lvl, maxLvl) {
    const a = Math.min(1, time / 0.2) * (time < 1.6 ? 1 : Math.max(0, 1 - (time - 1.6) / 0.35));
    if (a <= 0 || !name) return;
    const slide = (1 - easeOut(time / 0.3)) * 60;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = String(name).toUpperCase();
    const w = ctx.measureText(txt).width + 70;
    const x = W / 2 - slide, y = 54;
    ctx.fillStyle = 'rgba(6,6,14,0.62)';
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 18, y + 24); ctx.lineTo(x - w / 2, y - 24); ctx.lineTo(x + w / 2 + 18, y - 24); ctx.lineTo(x + w / 2, y + 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(txt, x, y + 1);
    ctx.fillStyle = '#fff6d6'; ctx.fillText(txt, x, y + 1);
    if (lvl && maxLvl && maxLvl > 1) {   // skill-level pips under the name
        const n = Math.min(maxLvl, 5), gap = 16, x0 = x - ((n - 1) * gap) / 2;
        for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + i * gap, y + 34, 5, 0, 7); ctx.fillStyle = i < lvl ? color : 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke(); }
    }
    ctx.restore();
}

function fallbackBase() {
    const c = createCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#171e35'); gr.addColorStop(0.63, '#32344a'); gr.addColorStop(1, '#10121f');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c;
}

// 💡 MULTI-TARGET SPRITE FX (2026-10-26, owner: "fix up the vfx for individual
// and multiple opponents - instead of pulling down a cut out of the sprite and
// the background just grab the individual or multiple enemy sprites and affect
// them"): tint a REAL fighter cutout (transparent PNG from the Go layers
// payload) with the class colour. The silhouette keeps a hint of the original
// sprite detail so the fighter still reads through the colour, and the affect
// layer composites it additively over the untouched overlay - the colour lands
// ONLY on the fighter's own pixels, never as a rectangle patch of the frame.
function tintCutout(img, hex) {
    if (!img) return null;
    try {
        const c = createCanvas(img.width, img.height), g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = hex;
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 0.45;
        g.globalCompositeOperation = 'source-over';
        g.drawImage(img, 0, 0);
        return c;
    } catch (e) { return null; }
}

// ── video HUD - medieval bottom-left plate (2026-10-26 round 2) ────────────
// Owner round 2: "simple at the bottom left, name + hp + energy, medieval rpg
// themed" - the dark-glass neo rail is GONE. The ultimate video's base frame
// is a hud:"none" battlefield, so effects can never bake over the panel; this
// painter draws the caster's plate as the FINAL pass (after flash/vignette/
// banner, outside the camera transform). Same recipe as the Go renderer's
// battle plate (box1 e1af254): walnut panel, gold trim + corner accents, the
// game's own heart.png / mana.png icons, deep red HP + mana-blue energy bars
// with numeric readouts. Bottom-left corner - sprite feet cap ~307 in video
// space, the plate starts at y=368, so it can never cover a fighter.
const _hudIcons = new Map();
async function loadHudIcons() {
    if (_hudIcons.has('set')) return _hudIcons.get('set');
    const set = { heart: null, mana: null };
    try { set.heart = await loadImage(path.join(__dirname, '..', 'rpgasset', 'ui', 'heart.png')); } catch (e) { /* fallback shape */ }
    try { set.mana = await loadImage(path.join(__dirname, '..', 'rpgasset', 'ui', 'mana.png')); } catch (e) { /* fallback shape */ }
    _hudIcons.set('set', set);
    return set;
}

function hudFitText(ctx, text, cx, y, maxW, px, color) {
    let size = px;
    while (size >= 9) {
        ctx.font = 'bold ' + Math.round(size) + 'px sans-serif';
        if (ctx.measureText(text).width <= maxW || size <= 9) break;
        size -= 1;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(text, cx + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(text, cx, y);
}

function hudRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function hudMedievalPanel(ctx, x0, y0, w, h) {
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, 'rgba(43,31,17,0.97)'); grad.addColorStop(0.55, 'rgba(29,20,9,0.98)'); grad.addColorStop(1, 'rgba(18,11,4,0.99)');
    ctx.fillStyle = grad; ctx.fillRect(x0, y0, w, h);
    // faint top sheen so the name strip reads slightly lit
    const sh = ctx.createLinearGradient(0, y0, 0, y0 + 46);
    sh.addColorStop(0, 'rgba(255,223,158,0.10)'); sh.addColorStop(1, 'rgba(255,223,158,0)');
    ctx.fillStyle = sh; ctx.fillRect(x0, y0, w, 46);
    // near-black outer frame
    ctx.strokeStyle = 'rgba(6,3,2,1)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    // gold trim + corner accents
    const tx0 = x0 + 5, ty0 = y0 + 5, tx1 = x0 + w - 5, ty1 = y0 + h - 5;
    ctx.strokeStyle = 'rgba(201,161,59,0.9)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    ctx.fillStyle = 'rgba(231,199,102,1)';
    const cl = 12, ct = 3;
    ctx.fillRect(tx0 - 1, ty0 - 1, cl, ct); ctx.fillRect(tx0 - 1, ty0 - 1, ct, cl);
    ctx.fillRect(tx1 + 1 - cl, ty0 - 1, cl, ct); ctx.fillRect(tx1 + 1 - ct, ty0 - 1, ct, cl);
    ctx.fillRect(tx0 - 1, ty1 + 1 - ct, cl, ct); ctx.fillRect(tx0 - 1, ty1 + 1 - cl, ct, cl);
    ctx.fillRect(tx1 + 1 - cl, ty1 + 1 - ct, cl, ct); ctx.fillRect(tx1 + 1 - ct, ty1 + 1 - cl, ct, cl);
}

function hudBarMedieval(ctx, x, y, w, h, pct, kind, label) {
    pct = Math.max(0, Math.min(1, pct));
    hudRoundRect(ctx, x, y, w, h, 5); ctx.fillStyle = 'rgba(16,11,6,0.95)'; ctx.fill();
    if (pct > 0) {
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        if (kind === 'hp') {
            if (pct < 0.25) { grad.addColorStop(0, '#c0392b'); grad.addColorStop(0.5, '#8f1a10'); grad.addColorStop(1, '#5c0f08'); }
            else { grad.addColorStop(0, '#d2552e'); grad.addColorStop(0.5, '#a52a18'); grad.addColorStop(1, '#6e150c'); }
        } else { grad.addColorStop(0, '#4b7fc4'); grad.addColorStop(0.5, '#2c549b'); grad.addColorStop(1, '#16315e'); }
        hudRoundRect(ctx, x, y, Math.max(w * pct, h * 0.8), h, 5); ctx.fillStyle = grad; ctx.fill();
        const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
        gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        hudRoundRect(ctx, x + 1.5, y + 1.5, Math.max(w * pct - 3, h * 0.4), h * 0.5, 4); ctx.fillStyle = gl; ctx.fill();
    }
    hudRoundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5);
    ctx.strokeStyle = 'rgba(201,161,59,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    // numeric readout (right of the bar)
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, x + w + 7, y + h / 2 + 1);
    ctx.fillStyle = '#f3ecd8'; ctx.fillText(label, x + w + 6, y + h / 2);
}

function drawVideoHud(ctx, hud, icons) {
    if (!hud || typeof hud !== 'object' || !icons) return;
    const PX = -10, PY = 368, PW = 262, PH = 118; // bottom-left corner bleed, same proportions as the Go plate
    hudMedievalPanel(ctx, PX, PY, PW, PH);
    const visCx = PX + PW / 2 + 6; // compensate the left bleed like the Go plate

    // name
    hudFitText(ctx, String(hud.name || 'Champion'), visCx, PY + 22, PW - 46, 15, '#f3ecd8');

    // gold divider with center diamond
    const dvy = PY + 39.75;
    ctx.fillStyle = 'rgba(201,161,59,0.85)'; ctx.fillRect(visCx - 106, dvy - 0.75, 212, 1.5);
    const dr = 4;
    ctx.beginPath();
    ctx.moveTo(visCx, dvy - dr); ctx.lineTo(visCx + dr, dvy); ctx.lineTo(visCx, dvy + dr); ctx.lineTo(visCx - dr, dvy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(231,199,102,1)'; ctx.fill();

    // HP row: heart icon + red bar + numerics
    if (icons.heart) {
        ctx.drawImage(icons.heart, PX + 16, PY + 46, 20, 24);
    } else {
        ctx.fillStyle = '#b3202a';
        ctx.beginPath(); ctx.arc(PX + 21, PY + 55, 5.5, 0, Math.PI * 2); ctx.arc(PX + 27, PY + 55, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(PX + 15.5, PY + 57); ctx.lineTo(PX + 24, PY + 70); ctx.lineTo(PX + 32.5, PY + 57); ctx.closePath(); ctx.fill();
    }
    hudBarMedieval(ctx, PX + 42, PY + 51, 140, 13,
        hud.maxHp > 0 ? hud.hp / hud.maxHp : 0, 'hp',
        `${Math.max(0, Math.floor(hud.hp || 0))} / ${Math.max(1, Math.floor(hud.maxHp || 1))}`);

    // Energy row: mana icon + blue bar + numerics
    if (icons.mana) {
        ctx.drawImage(icons.mana, PX + 18, PY + 74, 16, 24);
    } else {
        ctx.fillStyle = '#2f6bbf';
        ctx.beginPath(); ctx.arc(PX + 26, PY + 90, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(PX + 20.5, PY + 88); ctx.lineTo(PX + 26, PY + 76); ctx.lineTo(PX + 31.5, PY + 88); ctx.closePath(); ctx.fill();
    }
    hudBarMedieval(ctx, PX + 42, PY + 78, 140, 12,
        hud.maxEnergy > 0 ? hud.energy / hud.maxEnergy : 0, 'en',
        `${Math.max(0, Math.floor(hud.energy || 0))} / ${Math.max(1, Math.floor(hud.maxEnergy || 1))}`);
}

// ── encode ──────────────────────────────────────────────────────────────────
// 🔥 memory (26-R5): the encoder is STARTED BEFORE the frame loop and fed one
// raw frame at a time — the old frames[] accumulator held ~75MB of BGRA per
// render on a 952MB box (joker heap capped at 340MB, OOM'd twice on 10-27).
function startMp4Encoder() {
    let rejectOut, resolveOut;
    const done = new Promise((res, rej) => { resolveOut = res; rejectOut = rej; });
    const out = path.join(os.tmpdir(), `ult_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`);
    const args = ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22', '-movflags', '+faststart', '-an', out];
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '', failed = false;
    p.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
    p.on('error', (e) => { failed = true; rejectOut(e); });
    p.on('exit', (code) => {
        try {
            if (code !== 0) return rejectOut(new Error('ffmpeg exit ' + code + ': ' + err.slice(-300)));
            const b = fs.readFileSync(out); fs.unlinkSync(out); resolveOut(b);
        } catch (e) { rejectOut(e); }
    });
    return {
        async push(buf) {
            if (failed || !p.stdin.writable) return;
            try { if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r)); }
            catch (e) { failed = true; }
        },
        async abort() { failed = true; try { p.stdin.destroy(); } catch (e) {} try { p.kill('SIGKILL'); } catch (e2) {} },
        finish: () => { try { p.stdin.end(); } catch (e) {} return done; },
    };
}

// ── main ────────────────────────────────────────────────────────────────────
// 🔴 HP DROP painter (owner: "the hp bar drops"): 1:1 mimic of the Go
// drawOverheadHPBar look (dark rounded track + left→right darkred→orange
// fill, 1px inset) at the Go bars' exact geometry - enemy bars 100x12 @
// (center-50, top-15), player/duelist bars 80x10 @ (center-40, top-12),
// scaled Go-canvas → video. The track is padded 1.5px so the baked bar in
// the base scene NEVER peeks out from behind the animated repaint.
function drawVictimHpBar(ctx, x, y, w, h, pct, flashK) {
    pct = Math.max(0, Math.min(1, pct));
    const pad = 1.5, r = Math.max(1.5, 3 * (w / 100));
    ctx.save();
    hudRoundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, r);
    ctx.fillStyle = 'rgba(10,10,15,0.94)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    const ix = x + 1, iy = y + 1, ih = h - 2;
    const iw = (w - 2) * pct;
    if (iw >= 0.75) {
        const fillW = Math.max(iw, 1.5);
        const grad = ctx.createLinearGradient(ix, 0, ix + fillW, 0);
        grad.addColorStop(0, '#db1f1a'); grad.addColorStop(1, '#ffab26');
        hudRoundRect(ctx, ix, iy, fillW, ih, Math.max(1, r - 0.75));
        ctx.fillStyle = grad; ctx.fill();
        // 2-frame white hit-flash on the fill the moment the bar starts dropping
        if (flashK > 0) {
            ctx.fillStyle = `rgba(255,244,224,${(0.8 * flashK).toFixed(3)})`;
            ctx.fill();
        }
    }
    ctx.restore();
}

async function renderUltimateVideo(o) {
    const palette = o.palette && o.palette.length >= 3 ? o.palette : ['#fff1b0', '#ffcb45', '#e85a37'];
    const recipeKey = STYLE_RECIPE[String(o.classId || '').toUpperCase()] || 'fire';
    const sets = {};
    // per-class timing (Dragon God etc. run longer); default = the classic 2.7s / 1.05s
    const meta = (RECIPE_PACK && RECIPE_PACK.classMeta && RECIPE_PACK.classMeta(String(o.classId || '').toUpperCase())) || {};
    const IMP = meta.impact || IMPACT, DUR = meta.duration || DURATION;
    const classTracks = RECIPE_PACK && RECIPE_PACK.classRecipe ? RECIPE_PACK.classRecipe(String(o.classId || '').toUpperCase(), palette, { IMPACT: IMP }) : null;
    let tracks = classTracks || RECIPES[recipeKey](palette);
    // skill level -> intensity (see ultimateFxRecipes.scaleTracks); 0..1, default 0 = the original look (level 1)
    const K = Number.isFinite(Number(o.intensity)) ? Math.max(0, Math.min(1, Number(o.intensity))) : 0;
    if (RECIPE_PACK && RECIPE_PACK.scaleTracks) tracks = RECIPE_PACK.scaleTracks(tracks, K, palette, IMP);
    tracks = applyOverrides(tracks, String(o.classId || '').toUpperCase());
    // 🩶 FLAT GROUND RINGS UNDER THE FIGHTERS (owner 2026-10-28: "some of the skills
    // effects that are supposed to not overlay like the overall flat ring effects are
    // overlaying"): rings/ripple paint perspective-flattened ellipses pinned to a
    // fighter's FEET — they are ground-plane marks, so they belong to the under pass
    // (rendered before the roster) — the fighters stand ON them, never under them.
    // Stamped here in the engine so recipe-authored tracks AND the auto-added
    // level-up rings both get the z-order, whatever the recipe said.
    for (const t of tracks) if ((t.layer === 'rings' || t.layer === 'ripple') && !t.under) t.under = true;
    for (const t of tracks) {
        for (const nm of [t.fx, t.land]) if (nm && SETS[nm] && !sets[nm]) sets[nm] = await loadSet(nm);
    }
    for (const nm of LAYER_ART) if (SETS[nm] && !sets[nm]) sets[nm] = await loadSet(nm);   // layer painters' art
    const singles = await loadSingles();
    if (!Object.values(sets).some((s) => s && s.length) && !tracks.some((t) => t.layer)) return null;     // assets missing → caller falls back to the legacy renderer

    // 💡 VFX LAYERS (2026-10-26, owner VFX-alignment round): optional layered
    // base from the Go renderer - bg WITHOUT combatants + a transparent
    // combatants overlay + the isolated focus combatant + exact per-combatant
    // feet anchors. This is what makes ground fx render UNDER the fighters
    // (summon circles, army-of-dead rift) and air fx OVER them (hands, bolts),
    // with every spell origin pinned to the real sprite feet.
    let layers = null;
    let sprImg = null, focImg = null;
    if (o.layers && Buffer.isBuffer(o.layers.bg) && Buffer.isBuffer(o.layers.sprites)) {
        try { sprImg = await loadImage(o.layers.sprites); } catch (e) { sprImg = null; }
        if (sprImg && o.layers.focus) { try { focImg = await loadImage(o.layers.focus); } catch (e) { focImg = null; } }
        if (sprImg) layers = o.layers; else console.warn('[UltFx] layers payload broken (sprites undecodable) - plain base');
    }

    let base = null;
    if (layers && Buffer.isBuffer(layers.bg)) { try { base = await loadImage(layers.bg); } catch (e) { base = null; } }
    if (!base && Buffer.isBuffer(o.baseBuffer) && o.baseBuffer.length > 1000) { try { base = await loadImage(o.baseBuffer); } catch (e) { base = null; } }
    if (!base) base = fallbackBase();
    const hudIcons = o.hud && typeof o.hud === 'object' ? await loadHudIcons() : null;

    const self = o.side === 'self';
    const A = { C: [W * 0.27, H * 0.62], T: self ? [W * 0.27, H * 0.58] : [W * 0.72, H * 0.58], F: [W * 0.5, H * 0.55] };
    // 💡 VFX LAYERS: pin C/T to the REAL sprite feet ("spells starting points
    // not on the players" - the old fixed 0.27W/0.72W fractions missed the
    // caster whenever the formation moved). Go canvas -> video space scale.
    let focRect = null, casterRect = null;
    if (layers && Array.isArray(layers.anchors) && layers.anchors.length) {
        const kx = W / (Number(layers.w) || 1024), ky = H / (Number(layers.h) || 687);
        const find = (side, idx) => layers.anchors.find((v) => v && v.side === side && v.index === idx);
        const rectOf = (a) => [a.x * kx, a.feetY * ky, Math.max(24, a.w * kx), Math.max(24, a.h * ky)];
        const caster = find('player', Math.max(0, Math.floor(Number(o.casterIndex) || 0))) || find('player', 0);
        if (caster) { A.C = [caster.x * kx, caster.feetY * ky]; casterRect = rectOf(caster); }
        if (self) { A.T = A.C.slice(); }
        else {
            // 💡 PVP VFX (2026-10-26, owner: "I dont see the vfx in pvps dude"):
            // in duels the target is the OTHER DUELIST, which the Go layers
            // payload also reports as side "player". targetSide picks which
            // roster the target anchor is looked up on (PvP casts pass 'player').
            const tSide = String(o.targetSide || 'enemy');
            // focusIndex = the defender's real roster index (PvP) - targetIndex
            // 0 is the pseudo-enemy index and would anchor the wrong duelist
            const ti = Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined
                ? Math.max(0, Math.floor(Number(o.focusIndex)))
                : Math.max(0, Math.floor(Number(o.targetIndex) || 0));
            const tgt = find(tSide, ti)
                || layers.anchors.find((v) => v && v.side === tSide);
            if (tgt) { A.T = [tgt.x * kx, tgt.feetY * ky]; if (!focRect) focRect = rectOf(tgt); }
        }
        const fa = find(String(o.focusSide || String(o.targetSide || 'enemy')), Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined ? Math.max(0, Math.floor(Number(o.focusIndex))) : Math.max(0, Math.floor(Number(o.targetIndex) || 0)));
        if (fa) focRect = rectOf(fa);
    }
    // the isolated focus monster is drawn BY the hands layer while it sinks
    const sinkOwnsFocus = !!(layers && focImg && !self && tracks.some((t) => (t.layer === 'hands' && t.sink) || t.layer === 'focus'));

    // 💡 MULTI-TARGET SPRITE FX (2026-10-26, owner: "fix up the vfx for
    // individual and multiple opponents - instead of pulling down a cut out of
    // the sprite and the background just grab the individual or multiple enemy
    // sprites and affect them"): the Go layers payload now ships every fighter
    // as its own transparent cutout. Resolve the affected set - the single
    // target (the caster for self-casts), or the WHOLE enemy roster when the
    // cast is AoE - and pre-tint each REAL sprite once. The affect layer draws
    // these tinted fighters exactly over their originals every frame.
    const kxL = layers ? W / (Number(layers.w) || 1024) : 1;
    const kyL = layers ? H / (Number(layers.h) || 687) : 1;
    const tSideAll = String(o.targetSide || 'enemy');
    const casterIdxAll = Math.max(0, Math.floor(Number(o.casterIndex) || 0));
    const focusIdxAll = Number.isFinite(Number(o.focusIndex)) && o.focusIndex !== null && o.focusIndex !== undefined
        ? Math.max(0, Math.floor(Number(o.focusIndex)))
        : Math.max(0, Math.floor(Number(o.targetIndex) || 0));
    let affectList = [];
    let casterCut = null;
    let cutsAll = null;      // full roster cutouts (video space) for the shrink/hidecaster drawer
    // 🔴 HURT FLASH list (owner: "when the attack hits make the victim have a
    // hurt red flashing overlay animation"): the SAME affected cutouts, tinted
    // hurt-red, pulsed by LAYERS.hurt at the impact moment. Offensive casts
    // only - a heal/buff never reads as "hurt".
    let hurtList = [];
    if (layers && Array.isArray(layers.cuts) && layers.cuts.length) {
        const cutImgs = [];
        await Promise.all(layers.cuts.map(async (c) => {
            if (!c || !c.png) return;
            try {
                cutImgs.push({
                    side: String(c.side || ''), index: Math.floor(Number(c.index) || 0),
                    x: (Number(c.x) || 0) * kxL, y: (Number(c.y) || 0) * kyL,
                    w: Math.max(4, (Number(c.w) || 0) * kxL), h: Math.max(4, (Number(c.h) || 0) * kyL),
                    img: await loadImage(Buffer.from(c.png, 'base64')),
                });
            } catch (e) { /* a broken cutout never kills the video */ }
        }));
        cutImgs.sort((a, b) => (a.side === b.side ? a.index - b.index : a.side === 'player' ? -1 : 1));
        cutsAll = cutImgs;
        const findCut = (side, idx) => cutImgs.find((c) => c.side === side && c.index === idx);
        casterCut = findCut('player', casterIdxAll) || null;
        // the roster that gets hit: enemy side for offenses, the party for
        // self-casts; the caster is never affected by their own offense
        const roster = cutImgs.filter((c) => c.side === (self ? 'player' : tSideAll))
            .filter((c) => self || !(tSideAll === 'player' && c.index === casterIdxAll));
        let affected = [];
        if (self) affected = o.aoe ? roster.slice() : (findCut('player', casterIdxAll) ? [findCut('player', casterIdxAll)] : []);
        else if (o.aoe) affected = roster.slice();
        else {
            const fc = findCut(tSideAll, focusIdxAll) || cutImgs.find((c) => c.side === tSideAll) || null;
            if (fc) affected = [fc];
        }
        // a sinking focus is owned by the hands layer - tinting its original
        // position would ghost above the descending sprite
        if (sinkOwnsFocus) affected = affected.filter((c) => !(c.side === tSideAll && c.index === focusIdxAll));
        const tintHex = self ? '#ffe9a8' : (palette[1] || '#ffffff');
        for (const c of affected) {
            const tinted = tintCutout(c.img, tintHex);
            if (tinted) affectList.push({ x: c.x, y: c.y, w: c.w, h: c.h, tinted });
            if (!self) {
                const red = tintCutout(c.img, '#ff2222');
                if (red) hurtList.push({ x: c.x, y: c.y, w: c.w, h: c.h, tinted: red });
            }
        }
    }

    // 💡 AoE FAN (same owner quote): when the cast is AoE, every track flagged
    // spread:'enemies' is replicated per enemy anchor so meteors / arrows /
    // shards / rings / pillars / vines hit EACH opponent - not one shared
    // impact point. Single-target casts keep the focused timeline untouched.
    if (layers && o.aoe && Array.isArray(layers.anchors) && layers.anchors.length) {
        const casterIdxFan = casterIdxAll;
        const fanPts = layers.anchors
            .filter((v) => v && v.side === (self ? 'player' : tSideAll))
            .filter((v) => self || !(v.side === 'player' && v.index === casterIdxFan))
            .sort((a, b) => a.x - b.x)
            .map((a) => [a.x * kxL, a.feetY * kyL]);
        if (fanPts.length > 1) {
            const expanded = [];
            for (const tr of tracks) {
                if (tr.spread === 'enemies' && tr.layer !== 'hands') {
                    fanPts.forEach((p2, i) => {
                        const rep = Object.assign({}, tr, { _pt: p2, _ptTo: p2 });
                        if (i > 0) rep.at = (Number(tr.at) || 0) + i * (tr.fanGap || 0.06);
                        expanded.push(rep);
                    });
                } else expanded.push(tr);
            }
            tracks = expanded;
        }
    }

    // 🔴 HP DROP victims (owner: "the hp bar drops"): the overhead bars are
    // BAKED into the Go base scene at pre-hit values, so a landed ultimate
    // used to read as "nothing happened to that bar". Repaint the VICTIMS'
    // bars from the impact onward: white hit-flash, then the fill chips down
    // a proportional chunk (24-42% of the CURRENT bar, deterministic per cast
    // - real damage resolves after the video plays; the post-ult combat card
    // stays authoritative) and holds. Single-target drops the focus bar, AoE
    // drops every victim bar with the same small stagger as the impact fan.
    const victims = new Map();
    if (Array.isArray(o.targets)) {
        for (const t of o.targets) {
            const idx = Math.floor(Number(t && t.index) || 0);
            const hp = Number(t && t.hp), maxHp = Number(t && t.maxHp);
            if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0 || hp <= 0) continue;
            const pct0 = Math.max(0.02, Math.min(1, hp / maxHp));
            const rv = mulberry(hash('hpdrop' + idx + (o.classId || '') + (o.name || '')))();
            const p1 = Math.max(0.03, pct0 * (0.58 + 0.18 * rv));
            victims.set(idx, { pct0, p1 });
        }
    }
    const dropAll = !!o.aoe;

    // every ultimate gets the per-fighter impact unless the recipe ships its
    // own affect track; self-casts glow warm gold, offenses in the class colour.
    // 💡 QA round: 'hold' curve + 1.25s so the colour wash is still readable
    // on the fighters AFTER the impact fx fade (a bell at IMP was buried
    // under the explosion sprites and read as invisible; the tail now lingers
    // into the settle for a clear "this fighter was hit by THAT spell" read).
    if (layers && affectList.length && !tracks.some((t) => t.layer === 'affect')) {
        tracks.push({ layer: 'affect', at: IMP, dur: 1.25, curve: 'hold', a: self ? 0.7 : 0.9 });
    }
    // 🔴 HURT FLASH auto-track: fires on every offensive cast that has real
    // victim cutouts - flash + echo land BEFORE the class-colour wash above
    // settles, so the hit reads red first, class colour second.
    if (layers && hurtList.length && !tracks.some((t) => t.layer === 'hurt')) {
        tracks.push({ layer: 'hurt', at: IMP + 0.01, dur: 0.5, a: 0.85 });
    }
    const seed = hash((o.classId || '') + (o.name || ''));
    const total = Math.round(DUR * FPS);
    let thumb = null;
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    let sprNoCaster = null;
    // ── PLATE CACHE (26-R5, owner: "pre-bake them so it's really fast"): a
    // miss paints every effect track onto per-group transparent plates and
    // saves them in the BACKGROUND; a hit replays the stored plates and skips
    // the per-pixel track work (R3 profile: breath blits 40% + vortex warp
    // 19% of a DRAGON_GOD render). Fighters, victim HP bars, banner, HUD,
    // camera and every per-duel pixel stay live either way — so ground fx
    // stay UNDER the fighters and air fx OVER them, exactly as baked.
    const scratch = new Map();   // per-render run-canvas reuse (never shared across concurrent renders)
    const imgCache = new Map();  // unique-plate index → decoded Image (one decode per unique per render)
    const enc = startMp4Encoder();
    let plateMeta = null, plateKey = null, plateCap = null, plateSkip = false;
    const underGroups = buildGroups(tracks.filter((t) => t.under));
    const overGroups = buildGroups(tracks.filter((t) => !t.under));
    try {
        if (!plates.isDisabled()) {
            const plateBaseBuf = (layers && Buffer.isBuffer(layers.bg) && layers.bg.length > 1000) ? layers.bg
                : (Buffer.isBuffer(o.baseBuffer) && o.baseBuffer.length > 1000 ? o.baseBuffer : null);
            const anyPlatable = underGroups.some((g) => !g.live) || overGroups.some((g) => !g.live);
            if (base && anyPlatable) {   // key on the DECODED PIXELS — Go bg bytes may not be byte-stable, pixels are
                const q4 = (v) => Math.round(Number(v) / 4) * 4;
                const tracksSig = tracks.map((t) => {
                    const c = Object.assign({}, t);
                    if (c._pt) c._pt = [q4(c._pt[0]), q4(c._pt[1])];      // snap fan points to the key grid
                    if (c._ptTo) c._ptTo = [q4(c._ptTo[0]), q4(c._ptTo[1])];
                    return c;
                });
                plateKey = plates.keyFor({
                    cls: String(o.classId || ''), dur: DUR, imp: IMP, k: K, side: o.side || '', aoe: !!o.aoe,
                    pal: palette, ac: [q4(A.C[0]), q4(A.C[1])], at: [q4(A.T[0]), q4(A.T[1])],
                    base: basePixelHash(base), tracks: tracksSig, sd: String(seed),
                });
                plateMeta = plates.loadMeta(plateKey);
                if (plateMeta && plateMeta.skip) { plateMeta = null; plateSkip = true; }   // known-cheap key → direct path forever, zero capture overhead
                else if (plateMeta) {
                    // the group plan is deterministic per key — a stored meta that
                    // disagrees (older writer) must never be mis-replayed
                    if (JSON.stringify(groupMetaOf(underGroups)) !== JSON.stringify(plateMeta.under)
                        || JSON.stringify(groupMetaOf(overGroups)) !== JSON.stringify(plateMeta.over)) {
                        plateMeta = null;
                        console.warn('[UltFx] plates meta drift — recapturing', plateKey.slice(0, 8));
                    } else {
                        console.log('[UltFx] plates HIT', plateKey.slice(0, 8), 'u' + underGroups.length + '/o' + overGroups.length);
                    }
                }
                if (!plateMeta) { plateCap = plates.makeCapture(); plateCap.key = plateKey; plateCap.liveGroups = new Set(); plateCap.paintByGroup = {}; }
            }
        }
    } catch (e) { plateMeta = null; plateCap = null; console.warn('[UltFx] plates setup failed:', e?.message || e); }
    // 🎥 ACTOR SHRINK (owner 2026-10-27, REAPER: "I want um to became tiny and a gaint syth hits",
    // DRAGON_GOD: "zoom out wayy more so that the characger Sprites look small leave the dragon the
    // same size tho"): recipes push {layer:'shrink', at, dur, to} tracks and the combatant roster
    // scales down IN PLACE around each fighter's own feet — feet anchors (and therefore every
    // track origin) stay valid, the battlefield keeps its size, and the giant screen-space art
    // (scythe / dragon) towers over the tiny fighters. First active track wins (min).
    // 🔁 RESTORE (owner 2026-10-28: "as the normal world comes back the player Sprites aren't
    // sized back to normal"): the shrink now recovers — 1 → `to` over `dur`, holds tiny for
    // `hold` seconds, then eases back to 1 over `recover` so the roster is normal-sized again
    // once the world returns. First active track wins (min).
    const shrinkAt = (time) => {
        let k = 1;
        for (const tr of tracks) {
            if (tr.layer !== 'shrink' || time < tr.at) continue;
            const to = tr.to === undefined ? 0.5 : tr.to;
            const d = tr.dur || 0.4;
            const hold = tr.hold === undefined ? 0.5 : tr.hold;
            const rec = tr.recover === undefined ? 0.6 : tr.recover;
            let k2 = 1 - (1 - to) * easeOut(clamp01((time - tr.at) / d));                       // 1 → to
            const tRec0 = tr.at + d + hold;
            if (time >= tRec0 && rec > 0) k2 = to + (1 - to) * easeOut(clamp01((time - tRec0) / rec));   // to → 1
            k = Math.min(k, k2);
        }
        return k;
    };
    // draw the roster: per-fighter cutouts scaled in place (feet pinned), honoring hidecaster.
    // k===1 && !hide falls back to the exact pre-R2 single-drawImage path (all other classes).
    const drawRoster = (env, k, hide) => {
        const cutList = env.cutsAll;
        if (k >= 0.999 && !hide && cutList === null) { ctx.drawImage(sprImg, 0, 0, W, H); return; }
        if (cutList && cutList.length) {
            for (const c of cutList) {
                if (hide && casterCut && c.side === 'player' && c.index === casterIdxAll) continue;
                // 🕳️ SINK EXCLUSION (owner 2026-10-28: "the hole the necromancer skill drags
                // them into is on top of the player sprite and the enemy doesn't get pushed
                // down"): a hands-sink recipe owns the focus victim — the hands layer draws
                // it descending into the rift (over pass, clipped at the ground line). The
                // roster loop re-pinning that cutout at its natural position painted the
                // fighter permanently standing over the pit. Skip it here.
                if (sinkOwnsFocus && c.side === tSideAll && c.index === focusIdxAll) continue;
                if (k >= 0.999) { ctx.drawImage(c.img, c.x, c.y, c.w, c.h); continue; }
                const feetY = c.y + c.h, cx = c.x + c.w / 2;
                ctx.drawImage(c.img, cx - c.w * k / 2, feetY - c.h * k, c.w * k, c.h * k);
            }
        } else if (k < 0.999) {
            const px = W * 0.5, py = H * 0.72;      // roster-scale fallback around the stage floor
            ctx.save(); ctx.translate(px, py); ctx.scale(k, k); ctx.translate(-px, -py);
            ctx.drawImage(sprImg, 0, 0, W, H); ctx.restore();
        } else if (hide && sprNoCaster) {
            ctx.drawImage(sprNoCaster, 0, 0, W, H);
        } else {
            ctx.drawImage(sprImg, 0, 0, W, H);
        }
    };
    for (let f = 0; f < total; f++) {
        if (o.abort && o.abort.flag) { await enc.abort(); return { mp4: null, thumb: null, plates: 'aborted' }; }   // 🔥 26-R5: race lost → stop painting (no zombie renders)
        const time = f / FPS;
        const shrinkK = shrinkAt(time);   // 🎥 1 = normal, <1 = roster drawn tiny in place
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true;
        // camera: slow push-in while charging, punch + shake on impact, hit-stop (freeze) 2 frames
        const sinceHit = time - IMP;
        const hitStop = sinceHit >= 0 && sinceHit < 2 / FPS;
        // CAMERA-CALM (owner: "VFX background movement unnatural"): the old
        // 0.05 push + wide pan made the whole battlefield swim. Zoom stays,
        // drift is now barely-there; impact punch + shake untouched.
        // 🔎 SPOTLIGHT ZOOM (owner 2026-10-27: "when an ability is cast everything except the target gets darker
        // and it zooms in on them at the start"): a quick push-in on the target that holds through the windup,
        // relaxes after the hit. Recipes can add/subtract with {layer:'camera', at, dur, dz} tracks.
        let camDz = 0;
        for (const tr of tracks) if (tr.layer === 'camera' && time >= tr.at && time <= tr.at + tr.dur) {
            const cu = (time - tr.at) / tr.dur; camDz += (tr.dz || 0) * Math.min(easeOut(clamp01(cu / (tr.fin || 0.3))), 1 - easeIn(clamp01((cu - (1 - (tr.fout || 0.25))) / (tr.fout || 0.25))));
        }
        const baseZoom = meta.zoom === undefined ? 0.11 : meta.zoom;
        const push = (time < IMP ? easeOut(clamp01(time / 0.35)) * baseZoom : baseZoom * (1 - easeOut((sinceHit - 0.15) / 0.9))) + camDz;
        const punch = sinceHit >= 0 ? Math.max(0, 1 - sinceHit / 0.35) * 0.07 : 0;
        const zoom = 1 + push + punch;
        const shk = 1 + 0.6 * K;   // skill level -> camera punch
        const amp = hitStop ? 0 : (sinceHit >= 0 && sinceHit < 0.7 ? 16 * shk * Math.pow(1 - sinceHit / 0.7, 2) : (time < IMP ? 1.2 * shk * easeIn(time / IMP) : 0));
        const sx = Math.sin(f * 2.31 + seed) * amp, sy = Math.cos(f * 3.17 + seed) * amp * 0.6;
        const fx = A.T[0] / W, fy = A.T[1] / H;
        ctx.save();
        ctx.translate(W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18) + sx, H * (0.5 + (fy - 0.5) * 0.12) + sy);
        ctx.scale(zoom, zoom);
        ctx.translate(-W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18), -H * (0.5 + (fy - 0.5) * 0.12));
        // 📸 hand the plate painters the EXACT camera matrix (zoom+shake): plates
        // bake it into their pixels, so a replayed plate is the same vector render
        // the direct path draws — never a bitmap resample of an already-zoomed layer.
        const camM = [zoom, 0, 0, zoom,
            (W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18) + sx) - zoom * W * (self ? 0.27 : 0.5 + (fx - 0.5) * 0.18),
            (H * (0.5 + (fy - 0.5) * 0.12) + sy) - zoom * H * (0.5 + (fy - 0.5) * 0.12)];
        ctx.drawImage(base, 0, 0, W, H);
        // 💡 VFX LAYERS round (2026-10-26): layered compositing finally matches
        // real game VFX layering -
        //   bg → ground fx (UNDER) → combatants → veil → air fx (OVER).
        // Ground fx = every track flagged under:true (rune circles, rifts,
        // cracks). The isolated focus combatant is skipped here when a sink
        // recipe owns it (the hands layer draws it, sinking into the rift).
        const env = { A, time, W, H, base, self, seed, sets, spr: (n) => singles.get(n) || null,
            shrinkK, cutsAll,
            layers: !!layers, sprImg, focImg, focRect, casterRect, affectList, hurtList, casterCut, impact: IMP };
        if (env.layers) {
            const po = { f, env, sets, A, time, seed, palette, plateMeta, plateKey, plateCap, scratch, imgCache, camM };
            if (plateMeta || plateCap) await paintGroups(ctx, underGroups, Object.assign(po, { under: true }));
            else plateGroupsDirect(ctx, underGroups, Object.assign(po, { under: true }));
            // 💨 hidecaster windows (Reaper: the caster vanishes, only the scythe remains)
            // + 🎥 actor shrink (Reaper/Dragon God: the roster draws tiny in place)
            const hideNow = !!(casterCut && tracks.some((t) => (t.layer === 'hidecaster' || t.layer === 'lunge') && time >= t.at && time <= t.at + t.dur));
            if (hideNow && !sprNoCaster && sprImg && casterCut) {
                sprNoCaster = createCanvas(sprImg.width, sprImg.height);
                const sc = sprNoCaster.getContext('2d'); sc.drawImage(sprImg, 0, 0);
                sc.globalCompositeOperation = 'destination-out'; sc.drawImage(casterCut.img, casterCut.x * (sprImg.width / W), casterCut.y * (sprImg.height / H), casterCut.w * (sprImg.width / W), casterCut.h * (sprImg.height / H));
            }
            drawRoster(env, shrinkK, hideNow);
            // isolated focus combatant (scaled with the roster when shrunk — feet stay pinned).
            // With a full cutout roster the loop above already drew the focus at the same
            // anchor — the full-canvas overlay draw here would stack it twice (subtle darkening).
            if (focImg && !sinkOwnsFocus && !(cutsAll && cutsAll.length)) {
                if (shrinkK >= 0.999 || !focRect) ctx.drawImage(focImg, 0, 0, W, H);
                else {
                    const [fx0, fy0, fw0, fh0] = focRect, feetY2 = fy0 + fh0, cx2 = fx0 + fw0 / 2;
                    ctx.drawImage(focImg, cx2 - fw0 * shrinkK / 2, feetY2 - fh0 * shrinkK, fw0 * shrinkK, fh0 * shrinkK);
                }
            }
            // 🔴 HP DROP: repaint the victims' overhead bars over the baked
            // ones (exact Go geometry via anchors) BEFORE the veil so they dim
            // and shake exactly like the base scene they cover. Hidden until
            // the impact so the windup shows the untouched baked bar.
            if (victims.size && Array.isArray(layers.anchors)) {
                const fanAnchors = layers.anchors
                    .filter((v2) => v2 && v2.side === tSideAll && victims.has(Math.floor(Number(v2.index) || 0)) && (dropAll || Math.floor(Number(v2.index) || 0) === focusIdxAll))
                    .sort((a2, b2) => a2.x - b2.x);
                let vi = 0;
                for (const a2 of fanAnchors) {
                    const v = victims.get(Math.floor(Number(a2.index) || 0));
                    if (!v) continue;
                    const isPlayerSide = a2.side === 'player';
                    // bars ride the shrink so they hug the tiny sprites instead of floating
                    const bw = (isPlayerSide ? 80 : 100) * kxL * shrinkK, bh = (isPlayerSide ? 10 : 12) * kyL * shrinkK;
                    const bxc = (Number(a2.x)) * kxL - bw / 2;
                    const byc = (Number(a2.feetY) - Math.max(24, (Number(a2.h) || 0) * shrinkK)) * kyL - (isPlayerSide ? 12 : 15) * kyL * shrinkK;
                    const at = IMP + vi * 0.06;
                    vi++;
                    if (time < at) continue;
                    const du = clamp01((time - at) / 0.45);
                    const pct = v.pct0 + (v.p1 - v.pct0) * (1 - Math.pow(1 - du, 3));
                    drawVictimHpBar(ctx, bxc, byc, bw, bh, pct, time - at < 2 / FPS ? 1 : 0);
                }
            }
        }
        // dim the field while charging so effects pop; lift after the hit
        // (layered: AFTER the combatants so they dim exactly like the flat base)
        const veil = time < IMP ? 0.1 + 0.42 * easeOut(clamp01(time / 0.3)) : 0.52 * (1 - easeOut((sinceHit) / 0.7)) + 0.08;
        if (o.aoe || meta.flatVeil) { ctx.fillStyle = rgba('#05060f', veil * 0.85); ctx.fillRect(-40, -40, W + 80, H + 80); }
        else {
            // spotlight: the target stays lit, everything else darkens
            const sp = self ? A.C : A.T, spr = 110;
            const sg = ctx.createRadialGradient(sp[0], sp[1] - 55, spr * 0.55, sp[0], sp[1] - 55, spr * 2.9);
            sg.addColorStop(0, rgba('#05060f', veil * 0.12)); sg.addColorStop(1, rgba('#05060f', veil * 1.05));
            ctx.fillStyle = sg; ctx.fillRect(-40, -40, W + 80, H + 80);
        }
        // charge aura at the caster
        if (time < IMP + 0.25) {
            const k = easeIn(time / IMP);
            glow(ctx, A.C[0], A.C[1], 70 + 90 * k + Math.sin(f * 1.7) * 6, rgba(palette[1], 'A'), 0.35 + 0.45 * k);
        }
        // sprite tracks, ordered (under:true tracks already painted in the
        // ground pass above)
        const po = { f, env, sets, A, time, seed, palette, plateMeta, plateKey, plateCap, scratch, imgCache, camM };
        if (plateMeta || plateCap) await paintGroups(ctx, overGroups, Object.assign(po, { under: false }));
        else plateGroupsDirect(ctx, overGroups, Object.assign(po, { under: false }));
        // impact glow
        if (sinceHit >= 0 && sinceHit < 0.5) glow(ctx, A.T[0], A.T[1], 200 * easeOut(sinceHit / 0.25) + 40, rgba(palette[0], 'A'), 0.85 * (1 - sinceHit / 0.5));
        // 🔴 HURT FLASH fallback (no cutouts → no hurtList): same double-pulse
        // timing as LAYERS.hurt, as a red radial burn on the victim anchor so
        // the "that got HIT" read survives the plain-base lane too.
        if (!self && !hurtList.length && sinceHit >= 0 && sinceHit < 0.45) {
            // bell() lives in ultimateFxLayers - inline the sine envelope here
            const k = Math.min(1, Math.sin(Math.PI * clamp01(sinceHit / 0.15)) + 0.62 * Math.sin(Math.PI * clamp01((sinceHit - 0.2) / 0.17)));
            glow(ctx, A.T[0], A.T[1] - 26, 130, rgba('#ff2222', 'A'), 0.5 * k);
        }
        embers(ctx, A, time, palette, seed);
        ctx.restore();
        // full-screen flash frames (soft, 2 frames) + vignette
        if (sinceHit >= 0 && sinceHit < 0.07) { ctx.fillStyle = rgba(palette[0], 0.55 * (1 - sinceHit / 0.07)); ctx.fillRect(0, 0, W, H); }
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        banner(ctx, time, o.name, palette[1], o.skillLevel, o.maxLevel);
        // 💡 HUD 2026-10-26 round 2: the caster's medieval plate is the LAST
        // pass - above the flash, vignette, banner and every effect, and
        // outside the camera transform, so nothing ever covers or dims it.
        if (hudIcons) drawVideoHud(ctx, o.hud, hudIcons);
        if (f === Math.round(IMP * FPS) + 1) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
        await enc.push(canvas.toBuffer('raw'));
    }
    // ── plate persist (background — never delays the send) ────────────────
    // Adaptive: only keys whose platable paint work actually costs (≥1.2s per
    // render) keep plates — cheap-painter classes replay live and never pay
    // the plate decode/blit toll.
    let plateState = 'off';
    if (plateCap && plateKey && plateCap.pngs.size && (plateCap.paintMs || 0) >= 1500) {
        try {
            const byHash = new Map();
            const uniques = [];
            const idxOf = (buf) => {
                const h = plates.sha1(buf);
                if (!byHash.has(h)) { byHash.set(h, uniques.length); uniques.push({ buf }); }
                return byHash.get(h);
            };
            const framesPresence = [];
            // 🔥 adaptive capture, decided ONCE here with the FINAL cumulative paint
            // times: a group whose whole-render paint work is trivial (<150ms) replays
            // live (null → live paint on replay) and its captured pngs are discarded.
            const groupIsLive = (pass2, gi) => (plateCap.paintByGroup[pass2 + gi] || 0) < 150;
            for (let f2 = 0; f2 < total; f2++) {
                framesPresence.push({
                    u: underGroups.map((g, gi) => (plateCap.liveGroups.has('u' + gi) || groupIsLive('u', gi) ? null : (plateCap.pngs.get('u' + gi + '_' + f2) ? idxOf(plateCap.pngs.get('u' + gi + '_' + f2)) : -1))),
                    o: overGroups.map((g, gi) => (plateCap.liveGroups.has('o' + gi) || groupIsLive('o', gi) ? null : (plateCap.pngs.get('o' + gi + '_' + f2) ? idxOf(plateCap.pngs.get('o' + gi + '_' + f2)) : -1))),
                });
            }
            plateCap.uniques = uniques;
            plateCap.meta = { W, H, FPS, total, uniques: uniques.length, paintMs: Math.round(plateCap.paintMs), under: groupMetaOf(underGroups), over: groupMetaOf(overGroups), frames: framesPresence };
            plateState = 'captured';
            try { await plateSaveChain; } catch (e) {}   // backpressure — never hold >1 queued cap (~20MB of plate PNGs) in memory
            plateSaveChain = plateSaveChain.then(() => plates.saveCapture(plateCap)).catch(() => {});
        } catch (e) { console.warn('[UltFx] plates save skipped:', e?.message || e); }
    } else if (plateCap && plateKey && !plateSkip && !plates.isDisabled()) {
        // cheap painter → persist a skip marker so future casts take the direct
        // path with ZERO capture overhead (no probe, no PNG encode)
        try {
            plateCap.uniques = [];
            plateCap.meta = { W, H, FPS, total, skip: true, under: [], over: [], frames: [] };
            plateSaveChain = plateSaveChain.then(() => plates.saveCapture(plateCap)).catch(() => {});
        } catch (e) { /* marker is best-effort */ }
    } else if (plateMeta) plateState = 'hit';
    else if (plateSkip) plateState = 'skipped';
    if (!thumb) thumb = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    const mp4 = await enc.finish();
    return { mp4, thumb, plates: plateState };
}

module.exports = { renderUltimateVideo, _assets: { SETS, loadSet, loadManifest, OVERRIDABLE }, RECIPES, STYLE_RECIPE, W, H, FPS, DURATION, prewarm };
