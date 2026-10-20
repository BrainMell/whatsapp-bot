'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  LM CASTLE MARKERS — unique per-guild atlas castles, cycled (owner 2026-10-20:
//  "the castles? as markers? maybe a unique one for each guild and if the cycle
//  is up the next guild starts from the top").
//
//  The marker art is rendered from Lords Mobile model rips (Blender, transparent
//  film, atlas top-view angle). Because those are DERIVED FROM GAME ASSETS the
//  PNGs are provisioned per-box only (core/rpgasset/kingdom3d/lm_castle_*.png +
//  sidecar .json + _sh.png) and are NEVER committed (.gitignore'd). This module
//  probes for them at boot of each atlas render and injects manifest entries into
//  kingdom3d's 'top' view; on a fresh clone (no renders) every lookup degrades to
//  null and the atlas falls back to its KayKit castles — zero breakage either way.
//
//  Re-bake: scripts/render_lm_markers.py (box2, blender) + scripts/bake_lm_manifest.py.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const K = require('./kingdom3d');

const DIR = path.join(__dirname, '..', 'rpgasset', 'kingdom3d');
const COUNT = 10;

let _done = false;
function register() {
    if (_done) return;
    _done = true;
    let sprites;
    try { sprites = K.manifest().sprites; } catch (e) { return; }
    for (let i = 1; i <= COUNT; i++) {
        const name = 'lm_castle_' + String(i).padStart(2, '0');
        const png = path.join(DIR, name + '.png');
        const meta = path.join(DIR, name + '.json');
        try {
            if (!fs.existsSync(png) || !fs.existsSync(meta)) continue;
            const d = JSON.parse(fs.readFileSync(meta, 'utf8'));
            if (!d || !d.w || !d.h) continue;
            const entry = { file: name + '.png', w: d.w, h: d.h, ax: d.ax, ay: d.ay, kind: 'object' };
            if (d.shw && d.shh && fs.existsSync(path.join(DIR, name + '_sh.png'))) {
                entry.sh = { file: name + '_sh.png', w: d.shw, h: d.shh, ax: d.shw / 2, ay: d.shh * 0.55 };
            }
            sprites[name] = entry;
        } catch (e) { /* unreadable sidecar → this marker stays unregistered */ }
    }
}

/** how many LM markers are actually provisioned on this box (0 on fresh clones) */
function count() {
    register();
    const s = K.manifest().sprites;
    let n = 0;
    for (let i = 1; i <= COUNT; i++) if (s['lm_castle_' + String(i).padStart(2, '0')]) n++;
    return n;
}

/** cycle: charter order index → marker name (wraps to the top when the cycle is up), null if none */
function variantFor(index) {
    const n = count();
    if (!n) return null;
    const i = (((index % n) + n) % n) + 1;
    return 'lm_castle_' + String(i).padStart(2, '0');
}

module.exports = { register, count, variantFor, COUNT };
