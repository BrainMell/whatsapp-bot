// ═══════════════════════════════════════════════════════════════════════════
//  DEAD WORLD RENDERER — the empty encounter card + the survived victory card
// ═══════════════════════════════════════════════════════════════════════════
//
//  2026-09-21 owner ticket: a regular dungeon encounter can become a Dead
//  World encounter. Nothing spawns. These two node-canvas cards are the
//  FALLBACK path only (the primary cards are rendered by the Go service,
//  same pipeline as every regular encounter card - see deadWorld.js).
//
//    renderDeadWorldScene()    the player alone in the environment, no
//                              monsters, the world visibly "off" (dimmed,
//                              desaturated, empty ground where the enemy
//                              side should be). The confusion is carried by
//                              the visual, not by text.
//    renderDeadWorldVictory()  the closing frame: same environment, light
//                              coming back, gold SURVIVED seal. No slain
//                              enemies, no kill ledger - nobody was fought.
//
//  House rules pinned by qa_dead_world.js:
//    - every text string on the cards is sanitized: no hyphens, no en or em
//      dashes (owner rule for generated encounter text)
//    - the enemy side is EMPTY on both cards, and the victory card never
//      shows a kill count, a corpse, or an enemy silhouette
//    - NO floor number anywhere (owner 2026-09-21): the plate carries the
//      dungeon name and rank only
//    - the sprite is drawn with its NATIVE facing (the way every other
//      renderer in this codebase draws it: unmirrored, facing the enemy
//      side), grounded on the floor line with a contact shadow directly
//      under the feet (owner 2026-09-21: model and shadow must match how
//      existing encounter cards render them)
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'rpgasset');
const ENV_DIR = path.join(ASSETS, 'environment');
const CARD_DIR = path.join(ENV_DIR, 'cards');
const FONT_DIR = path.join(ASSETS, 'fonts');

// Card geometry (4:3, the environment art's native ratio - same frame family
// as the battle scene cards).
const W = 720;
const H = 540;

// ─── FONTS (lazy, bot-owned only) ────────────────────────────────────────────
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        // Some font files in the repo are Git LFS pointers on fresh clones -
        // each registration is individually guarded and pointer files are
        // skipped, exactly like profileCardRenderer. Dogica Pixel Bold (a
        // real committed file) carries the pixel-font role when Pixeloid is
        // not materialized locally.
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
            ['PixeloidSans.ttf', { family: 'Pixeloid Sans' }],
            ['dogicapixelbold.otf', { family: 'Dogica Pixel Bold' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
            ['PressStart2P-Regular.ttf', { family: 'Press Start 2P' }],
        ];
        let registered = 0;
        for (const [file, opts] of regs) {
            const p = path.join(FONT_DIR, file);
            if (!isRealFont(p)) continue;
            try { registerFont(p, opts); registered++; } catch (e) { /* skip broken file */ }
        }
        if (!registered) throw new Error('no usable font files registered');
        _fontsReady = true;
        return true;
    } catch (e) {
        try { console.error('[deadWorldRenderer] font registration failed:', e.message); } catch (_) {}
        return false;
    }
}

// ─── SPRITES (same resolution discipline as the profile card) ────────────────
const _imgCache = new Map();
async function _loadImg(dir, name) {
    if (!name) return null;
    const key = `${dir}/${name}`;
    if (_imgCache.has(key)) return _imgCache.get(key);
    let out = null;
    const p = path.join(dir, name);
    try {
        // accept real PNG or JPEG bytes (skips Git LFS pointer files)
        const head = fs.existsSync(p) ? fs.readFileSync(p).slice(0, 4) : Buffer.alloc(0);
        const isPng = head.toString('hex') === '89504e47';
        const isJpg = head[0] === 0xff && head[1] === 0xd8;
        if (isPng || isJpg) {
            const { loadImage } = require('canvas');
            out = await loadImage(p);
        }
    } catch (e) { out = null; }
    _imgCache.set(key, out);
    return out;
}

/**
 * Resolve the player's full-body sprite, mirroring the profile card +
 * combat payload resolution: class -> set -> variant by spriteIndex, clean/
// re-encodes first, APPRENTICE fallback (ticket #b4f7aa parity).
 */
async function _loadPlayerSprite(classId, spriteIndex) {
    let CLASS_SPRITE_SETS = null;
    try { CLASS_SPRITE_SETS = require('./profileCardRenderer').CLASS_SPRITE_SETS; } catch (e) {}
    const cls = String(classId || 'APPRENTICE').toUpperCase() || 'APPRENTICE';
    const list = (CLASS_SPRITE_SETS && CLASS_SPRITE_SETS[cls]) || (CLASS_SPRITE_SETS && CLASS_SPRITE_SETS.APPRENTICE) || ['apprentice1.png'];
    const idx = Math.max(0, Math.floor(Number(spriteIndex) || 0));
    const ordered = [list[idx % list.length], ...list.filter((_, i) => i !== idx % list.length), 'apprentice1.png', 'Fighter1.png'];
    for (const name of ordered) {
        const img = await _loadImg(path.join(ASSETS, 'characters', 'clean'), name);
        if (img) return img;
        const img2 = await _loadImg(path.join(ASSETS, 'characters'), name);
        if (img2) return img2;
    }
    return null;
}

// ─── ENVIRONMENT ART ─────────────────────────────────────────────────────────
// Dungeon environments are keyed by the Go-side background filename that the
// run carries in state.backgroundPath. Local committed art mirrors each
// theme; anything unknown falls back to the always-present dark stone.
const ENV_CARD_ART = {
    'env1.png': 'cards/fire.jpg',            // Fire Cave
    'env2.png': 'cards/ice.jpg',             // Ice Cave
    'env3.png': 'cards/toxic.jpg',           // Toxic Cave
    'spark_3.png': 'cards/desert.jpg',       // Desert
    'spark_1.png': 'cards/forest.jpg',       // Simple Forest
    'spark_2.png': 'spark_10.png',           // Demon Castle (dark stone)
    'spark_2-night.png': 'spark_10.png',     // Void Dimension (dark stone, deeper tint)
    'spark_10.png': 'spark_10.png',          // Sci Fi City / stone interior
    'spark_8.png': 'cards/fire.jpg',         // Dragon's Lair
    'spark_1-night.png': 'spark_7.png',      // Infected Afterlife
    'spark_7.png': 'spark_7.png',            // Pre Infected Afterlife
};

async function _loadEnvArt(backgroundPath, environmentKey) {
    const base = String(backgroundPath || '').split(/[\/\\]/).pop();
    const candidates = [];
    if (base && ENV_CARD_ART[base]) candidates.push(ENV_CARD_ART[base]);
    if (environmentKey && ENV_CARD_ART[environmentKey]) candidates.push(ENV_CARD_ART[environmentKey]);
    if (base) candidates.push(base);              // the run's own asset, if committed here
    candidates.push('spark_10.png', 'cards/forest.jpg');
    for (const rel of candidates) {
        const dir = rel.startsWith('cards/') ? CARD_DIR : ENV_DIR;
        const img = await _loadImg(dir, path.basename(rel));
        if (img) return { img, rel };
    }
    return { img: null, rel: null };
}

// ─── TEXT SAFETY (owner rule: no hyphens or dashes on encounter text) ────────
function _safeText(s) {
    return String(s == null ? '' : s)
        .replace(/\u2019/g, "'")
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── SHARED PAINT HELPERS ────────────────────────────────────────────────────
function _coverFit(ctx, img, w, h) {
    if (!img) return;
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function _vignette(ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

function _frame(ctx, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 1;
    ctx.strokeRect(17, 17, w - 34, h - 34);
}

// Top-left plate: dungeon name + rank only. NO floor number (owner
// 2026-09-21: the floor must not appear in the Dead World UI).
function _plate(ctx, dungeonName, rank, opts = {}) {
    const name = _safeText(dungeonName) || 'Deep Dungeon';
    const sub = `RANK ${_safeText(rank) || 'F'}`;
    ctx.font = 'bold 17px "Dogica Pixel Bold"';
    const nameW = ctx.measureText(name.toUpperCase()).width;
    ctx.font = '13px "Dogica Pixel Bold"';
    const subW = ctx.measureText(sub).width;
    const bw = Math.max(nameW, subW) + 28;
    const bh = 52;
    ctx.fillStyle = opts.plateBg || 'rgba(10,12,18,0.72)';
    ctx.fillRect(24, 24, bw, bh);
    ctx.strokeStyle = opts.plateEdge || 'rgba(210,200,170,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24.5, 24.5, bw - 1, bh - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = opts.plateInk || '#E8E2CE';
    ctx.font = 'bold 17px "Dogica Pixel Bold"';
    ctx.fillText(name.toUpperCase(), 38, 46);
    ctx.fillStyle = opts.plateSub || 'rgba(214,206,180,0.75)';
    ctx.font = '13px "Dogica Pixel Bold"';
    ctx.fillText(sub, 38, 66);
}

// Small dust motes - the only "movement" in a world that stopped moving.
function _motes(ctx, w, h, seed, color) {
    let a = seed >>> 0;
    const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ 0; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    ctx.fillStyle = color;
    for (let i = 0; i < 14; i++) {
        const x = rnd() * w;
        const y = h * 0.25 + rnd() * h * 0.6;
        const r = 0.8 + rnd() * 1.6;
        ctx.globalAlpha = 0.12 + rnd() * 0.2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

async function _drawPlayer(ctx, opts) {
    const sprite = await _loadPlayerSprite(opts.playerClass, opts.spriteIndex);
    const groundY = Math.floor(H * 0.86);
    const px = Math.floor(W * (opts.playerX || 0.24));
    const targetH = Math.floor(H * 0.56);
    // feet land exactly on the ground line, matching how the encounter
    // renderer grounds the model; the contact shadow sits directly under
    // the feet (soft, wide, slightly offset toward the light) so the
    // character never floats (owner 2026-09-21 model/shadow fix)
    if (sprite) {
        const scale = targetH / sprite.height;
        const dw = sprite.width * scale;
        const shadowW = dw * 0.72;
        const shadowH = Math.max(9, targetH * 0.035);
        ctx.save();
        const g = ctx.createRadialGradient(px, groundY, shadowW * 0.1, px, groundY, shadowW * 0.6);
        g.addColorStop(0, 'rgba(0,0,0,0.42)');
        g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(px, groundY - shadowH * 0.2);
        ctx.scale(1, shadowH / (shadowW * 0.6));
        ctx.beginPath();
        ctx.arc(0, 0, shadowW * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
        // NATIVE facing: draw the sprite unmirrored, exactly like the
        // encounter card pipeline does - the model faces the enemy side
        // (right) on its own. Owner 2026-09-21 facing fix: the previous
        // horizontal mirror transform pointed the character the wrong way.
        ctx.save();
        ctx.drawImage(sprite, px - dw / 2, groundY - targetH, dw, targetH);
        ctx.restore();
    } else {
        // sprite failed: a standing silhouette so the card never sends empty
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(px, groundY, 46, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(16,18,26,0.9)';
        ctx.fillRect(px - 16, groundY - targetH, 32, targetH);
        ctx.beginPath();
        ctx.arc(px, groundY - targetH - 14, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// A tiny name tag under the player (same idea as the battle HUD plates).
function _nameTag(ctx, playerName) {
    const name = _safeText(playerName) || 'You';
    ctx.font = 'bold 13px "Dogica Pixel Bold"';
    const tw = ctx.measureText(name.toUpperCase()).width;
    const bx = Math.floor(W * 0.24) - tw / 2 - 10;
    const by = H * 0.86 + 12;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.fillRect(bx, by, tw + 20, 24);
    ctx.strokeStyle = 'rgba(210,200,170,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, tw + 19, 23);
    ctx.fillStyle = '#E8E2CE';
    ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase(), bx + (tw + 20) / 2, by + 17);
}

// Gold seal (Royal Decree family) - used by the victory card only.
function _seal(ctx, label, cx, cy, r) {
    ctx.save();
    // ribbon star
    ctx.fillStyle = '#A67C2E';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.86;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#C9962F';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7A5A1E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3A2A1E';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sealWord = _safeText(label).toUpperCase();
    // fit the seal word inside the inner circle: shrink until it fits
    let fontSize = Math.floor(r * 0.34);
    ctx.font = `bold ${fontSize}px "Cinzel"`;
    const maxW = r * 1.28; // inner diameter * 0.8
    while (fontSize > 10 && ctx.measureText(sealWord).width > maxW) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px "Cinzel"`;
    }
    ctx.fillText(sealWord, cx, cy);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// ─── CARD 1: THE EMPTY ENCOUNTER ─────────────────────────────────────────────
/**
 * The Dead World scene: the player alone in the dungeon environment, no
 * monsters, and the environment's COLORS INVERTED (owner 2026-09-21: "I want
 * the COLORS of the backgrounds/environments for the new encounter type to be
 * inverted"). The inversion is applied to the ENVIRONMENT LAYER ONLY, before
 * any sprite or chrome is drawn: the world reads as its own negative while
 * the living player keeps their normal colors. The old desaturation pass is
 * replaced by the inversion itself; a lighter cold dim keeps the negative
 * from glowing too brightly while staying clearly "wrong".
 */
async function renderDeadWorldScene(opts = {}) {
    try {
        if (!_ensureFonts()) return null;
        const canvas = require('canvas');
        const create = canvas.createCanvas || ((w, h) => new canvas(w, h));
        const cv = create(W, H);
        const ctx = cv.getContext('2d');

        // environment, INVERTED, then the wrongness layered over it
        const { img } = await _loadEnvArt(opts.backgroundPath, opts.environmentKey);
        if (img) {
            const env = create(W, H);
            const ectx = env.getContext('2d');
            _coverFit(ectx, img, W, H);
            // pixel-level RGB inversion (difference against white keeps alpha)
            ectx.globalCompositeOperation = 'difference';
            ectx.fillStyle = '#ffffff';
            ectx.fillRect(0, 0, W, H);
            ectx.globalCompositeOperation = 'source-over';
            ctx.drawImage(env, 0, 0);
        } else {
            ctx.fillStyle = '#14161f'; ctx.fillRect(0, 0, W, H);
        }

        // cold dim (lighter than the old pass: the inverted palette already
        // reads unmistakably wrong; drowning it in gray would hide the effect)
        ctx.fillStyle = 'rgba(24,28,40,0.28)';
        ctx.fillRect(0, 0, W, H);
        const haze = ctx.createLinearGradient(0, H * 0.45, 0, H);
        haze.addColorStop(0, 'rgba(20,24,34,0)');
        haze.addColorStop(1, 'rgba(20,24,34,0.42)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, H * 0.45, W, H * 0.55);

        // the player, alive in a floor that is not
        await _drawPlayer(ctx, opts);
        _nameTag(ctx, opts.playerName);
        _motes(ctx, W, H, 20260921, 'rgba(210,214,226,1)');
        _vignette(ctx, W, H, 0.62);

        // the absent half: nothing marks the enemy side. A faint cold edge
        // hints at the space where something should be standing.
        const cold = ctx.createLinearGradient(W * 0.55, 0, W, 0);
        cold.addColorStop(0, 'rgba(30,36,52,0)');
        cold.addColorStop(1, 'rgba(30,36,52,0.4)');
        ctx.fillStyle = cold;
        ctx.fillRect(W * 0.55, 0, W * 0.45, H);

        _plate(ctx, opts.dungeonName, opts.rank, {
            plateBg: 'rgba(8,10,16,0.78)', plateEdge: 'rgba(150,160,180,0.45)',
        });
        _frame(ctx, W, H, 'rgba(12,14,20,0.85)');

        return cv.toBuffer('image/png');
    } catch (e) {
        try { console.error('[deadWorldRenderer] scene render failed:', e.message); } catch (_) {}
        return null;
    }
}

// ─── CARD 2: THE SURVIVED VICTORY ────────────────────────────────────────────
/**
 * The closing frame: same environment, light returning, gold SURVIVED seal.
 * Deliberately shows NO enemies, NO kill ledger - the player outlasted a
 * strange encounter, they did not win a fight.
 */
async function renderDeadWorldVictory(opts = {}) {
    try {
        if (!_ensureFonts()) return null;
        const canvas = require('canvas');
        const create = canvas.createCanvas || ((w, h) => new canvas(w, h));
        const cv = create(W, H);
        const ctx = cv.getContext('2d');

        const { img } = await _loadEnvArt(opts.backgroundPath, opts.environmentKey);
        if (img) _coverFit(ctx, img, W, H);
        else { ctx.fillStyle = '#1c1a14'; ctx.fillRect(0, 0, W, H); }

        // gentle desaturation, less than the scene card: the world is easing
        try {
            ctx.globalCompositeOperation = 'saturation';
            ctx.fillStyle = 'rgba(128,128,128,0.45)';
            ctx.fillRect(0, 0, W, H);
        } catch (e) { /* ignore */ }
        try { ctx.globalCompositeOperation = 'source-over'; } catch (e) {}

        // warm light returning from above
        const warm = ctx.createLinearGradient(0, 0, 0, H);
        warm.addColorStop(0, 'rgba(255,208,130,0.30)');
        warm.addColorStop(0.55, 'rgba(255,196,110,0.12)');
        warm.addColorStop(1, 'rgba(40,34,24,0.30)');
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, W, H);

        await _drawPlayer(ctx, opts);
        _nameTag(ctx, opts.playerName);
        _motes(ctx, W, H, 20260922, 'rgba(255,232,190,1)');
        _vignette(ctx, W, H, 0.42);

        _plate(ctx, opts.dungeonName, opts.rank, {
            plateBg: 'rgba(20,16,10,0.7)', plateEdge: 'rgba(230,200,140,0.55)',
        });
        _seal(ctx, opts.sealText || 'SURVIVED', W * 0.74, H * 0.42, 74);
        _frame(ctx, W, H, 'rgba(60,44,20,0.85)');

        return cv.toBuffer('image/png');
    } catch (e) {
        try { console.error('[deadWorldRenderer] victory render failed:', e.message); } catch (_) {}
        return null;
    }
}

module.exports = { renderDeadWorldScene, renderDeadWorldVictory, ENV_CARD_ART, _safeText };
