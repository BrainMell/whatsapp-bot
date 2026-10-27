'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  ULTIMATE PLATE CACHE — geometry-keyed ground/air effect plates (Task 26-R5,
//  owner: "pre-bake them so it's really fast" + "some effects have to be behind
//  the player and some on top").
//
//  WHY NOT A SIMPLE PER-CLASS VIDEO: every ultimate is composited around the
//  REAL duel — spells pin to the fighters' actual sprite feet, the roster is
//  cut out of that duel's scene, victim HP bars repaint per cast, and ground
//  fx render UNDER the fighters while air fx render OVER them. A static clip
//  would freeze the wrong arena/avatars and break that layering.
//
//  WHAT THIS DOES: ultimateFx paints its effect tracks onto transparent
//  PLATES (world-space, per composite-mode group) during a normal render and
//  stores them on disk, keyed by EVERYTHING the plates depend on: class
//  recipe + palette + skill intensity + side/aoe + quantized caster/target
//  anchors + fan points + the base-scene bytes (vortex/bgfill bake warped
//  scene pixels!) + a content-hash of the VFX render code. Repeat casts with
//  the same geometry replay the plates with a handful of drawImage calls and
//  skip the per-pixel track work entirely (the R3 profile: breath blits 40%,
//  vortex warp 19% of a DRAGON_GOD render). Fighters, HP bars, name banner,
//  HUD, camera and every per-duel pixel stay live, so behind/over layering is
//  bit-identical by construction.
//
//  Storage: ~/.cache/ult-plates/<key>/{meta.json, f###_g#.png}, LRU-capped.
//  ULT_PLATES=0 disables; ULT_PLATE_DIR / ULT_PLATE_CAP_MB / ULT_PLATE_VER
//  override for QA. Any read/write failure degrades to live rendering.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.ULT_PLATE_DIR || path.join(os.homedir(), '.cache', 'ult-plates');
const CAP_BYTES = Math.max(64, Number(process.env.ULT_PLATE_CAP_MB) || 1536) * 1024 * 1024;
let disabled = process.env.ULT_PLATES === '0';

// VER: content-hash of the VFX render code + the asset-swap manifest — any
// code/art deploy invalidates every plate automatically (mediaCache CODE_VER
// pattern, learned 2026-10-20: stale disk hits can mask art changes).
let VER = 'v1';
try {
    const rpg = __dirname;
    const files = ['ultimateFx.js', 'ultimateFxRecipes.js', 'ultimateFxLayers.js', 'ultimateFxLayers2.js', 'ultimatePlateCache.js']
        .map((f) => path.join(rpg, f)).concat([path.join(rpg, '..', 'rpgasset', 'vfx', 'vfx_assets.json')]);
    const h = crypto.createHash('sha1');
    for (const f of files) { try { h.update(fs.readFileSync(f)); } catch (e) { /* optional */ } }
    VER = `p${h.digest('hex').slice(0, 10)}`;
} catch (e) { /* keeps 'v1' */
}
if (process.env.ULT_PLATE_VER) VER = process.env.ULT_PLATE_VER;

function sha1(buf) {
    try { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16); } catch (e) { return 'nobuf'; }
}

function keyFor(parts) {
    const h = crypto.createHash('sha1');
    h.update(VER);
    h.update('\u0000');
    h.update(JSON.stringify(parts));
    return h.digest('hex').slice(0, 20);
}

const dirFor = (key) => path.join(ROOT, key);
// plates are DEDUPED by content: identical consecutive frames (before a track
// starts, after it fades, static holds) share one u<i>.png — the replay decodes
// each unique plate once per render
const frameFile = (key, idx) => path.join(dirFor(key), `u${idx}.png`);

function loadMeta(key) {
    if (disabled) return null;
    try {
        const meta = JSON.parse(fs.readFileSync(path.join(dirFor(key), 'meta.json'), 'utf8'));
        if (!meta || meta.W !== 640 || meta.H !== 480 || !Array.isArray(meta.under) || !Array.isArray(meta.over) || !Array.isArray(meta.frames)) return null;
        return meta;
    } catch (e) { return null; }
}

// returns the unique-plate index for (frame, pass, group): >= 0 → replay file,
// -1 → capture proved this frame paints nothing (skip), undefined → missing (live fallback)
function plateIndex(meta, f, pass, g) {
    const fr = meta && meta.frames && meta.frames[f];
    if (!fr || !fr[pass] || !Array.isArray(fr[pass])) return undefined;
    const v = fr[pass][g];
    return typeof v === 'number' ? v : undefined;
}

function makeCapture() { return { key: null, meta: null, pngs: new Map() }; }

// Fire-and-forget (called without await from the render tail): writes the
// deduped unique PNGs (u<i>.png, rects live in meta) + meta LAST so a crash
// mid-write leaves no loadable half-set.
async function saveCapture(cap) {
    if (disabled || !cap || !cap.key || !cap.meta) return;
    if (!cap.meta.skip && (!Array.isArray(cap.uniques) || !cap.uniques.length)) return;
    const dir = dirFor(cap.key);
    const tmp = path.join(ROOT, `.tmp-${process.pid}-${Date.now()}.png`);
    try {
        fs.mkdirSync(dir, { recursive: true });
        for (let i = 0; i < cap.uniques.length; i++) {
            fs.writeFileSync(tmp, cap.uniques[i].buf);
            fs.renameSync(tmp, path.join(dir, `u${i}.png`));
        }
        try { fs.unlinkSync(tmp); } catch (e) {}
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(cap.meta));
        prune();
    } catch (e) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e2) {}
        // hard environment failures stop future attempts; transient ones don't
        if (['ENOSPC', 'EACCES', 'EROFS', 'EDQUOT'].includes(e.code)) disabled = true;
    }
}

function dirSize(d) {
    let s = 0;
    for (const f of fs.readdirSync(d)) { try { s += fs.statSync(path.join(d, f)).size; } catch (e) {} }
    return s;
}

function prune() {
    try {
        const entries = [];
        for (const k of fs.readdirSync(ROOT)) {
            const d = path.join(ROOT, k);
            try {
                if (!fs.statSync(d).isDirectory()) continue;
                entries.push({ d, m: fs.statSync(d).mtimeMs, bytes: dirSize(d) });
            } catch (e) {}
        }
        let total = entries.reduce((s, e) => s + e.bytes, 0);
        if (total <= CAP_BYTES) return;
        entries.sort((a, b) => a.m - b.m);   // oldest first
        for (const e of entries) {
            if (total <= CAP_BYTES * 0.8) break;
            fs.rmSync(e.d, { recursive: true, force: true });
            total -= e.bytes;
        }
    } catch (e) {}
}

module.exports = { VER, sha1, keyFor, loadMeta, frameFile, plateIndex, makeCapture, saveCapture, isDisabled: () => disabled, ROOT };
