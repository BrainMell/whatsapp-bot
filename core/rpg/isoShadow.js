'use strict';
// ===========================================================================
// ISO SHADOW ENGINE - written from scratch for the homestead/base builders
// ("scrap the current shadow implementation and redo it
// from scratch - research how to implement convincing shadows in 2D iso")
// ===========================================================================
// RESEARCH → DESIGN (what actually makes iso shadows read as "grounded"):
// 1. ONE key light, consistently placed. The room sprite set is internally
// shaded with light from the UPPER-LEFT (CC0 furniture faces, and the
// procedural walls already brighten the same side). Multi-source shadows
// (4 wall torches + hearth) stack into mud, so torches/hearth stay ACCENT
// lights (their additive glow pools) - the cast-shadow law follows the
// single key light. This is the standard stylized-interior compromise.
// 2. Cast shadows must LIE ON THE FLOOR PLANE. In 2:1 iso the floor squashes
// verticals by TH/TW = 0.5, so a shadow is the sprite's own silhouette
// squashed to 0.5 and marched along the light's ground direction. A shadow
// shape that is NOT derived from the sprite silhouette is exactly what
// produced the old "detached puddle under some pieces, completely hidden
// under others" bug - generic rhombi/ellipses cannot fit every sprite.
// 3. The GROUNDING contact is a tight dark band right under the base line
// (ambient occlusion), not the cast shadow. Soft cast + hard-ish contact
// is what makes objects sit, in every 2D game that fakes it well.
// 4. Soft edges without ctx.filter (node-canvas 3.2.3 doesn't expose it):
// the silhouette is captured at 1/3 resolution and drawn back up with
// smoothing ON - a cheap box-blur that gives genuine soft penumbrae.
// SHADOW COLOR is warm dark (torch-lit interior), never pure black.
// ===========================================================================

const { createCanvas } = require('canvas');

// Key light → cast-shadow ground direction. Down-RIGHT along the +x grid
// axis: screen direction (2,1)/√5 ≈ (0.894, 0.447). Per 1px of sprite
// height the shadow marches LEN px along that direction.
const LIGHT = {
    dirX: 0.894,
    dirY: 0.447,
    len: 0.52,          // shadow length per unit of sprite height
    squash: 0.5,        // floor-plane squash (TH/TW)
 // march passes: [distance multiplier, alpha] - near→far, fading out
    passes: [[0.10, 0.26], [0.38, 0.17], [0.70, 0.10], [1.05, 0.05]],
    contact: { rxScale: 0.46, ry: 5.2, inner: 0.62, alphaOuter: 0.16, alphaInner: 0.30 },
    color: '#140b05',
};

// silhouette cache: key → { small canvas, w, h }
const _sil = new Map();

function silhouette(img, key) {
    const hit = _sil.get(key);
    if (hit) return hit;
 // capture alpha at 1/3 res (soft when upscaled), fill with shadow color
    const w = Math.max(1, Math.round(img.width / 3));
    const h = Math.max(1, Math.round(img.height / 3));
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = LIGHT.color;
    ctx.fillRect(0, 0, w, h);
    const rec = { cv, w: img.width, h: img.height };
    if (_sil.size > 300) _sil.clear();
    _sil.set(key, rec);
    return rec;
}

/**
 * Draw the full shadow stack for one furniture/structure sprite.
 *   ctx      - target context (already in art-px space)
 *   img      - the sprite Image
 *   key      - stable cache key (e.g. item id + flip state)
 *   ax, ay   - sprite BASE anchor: sprite is drawn at (ax - w/2, ay - h)
 *   scale    - draw scale (2 for room furniture, 1 for base structures)
 *   flip     - mirror horizontally (must match the sprite draw)
 *   alpha    - master alpha (pop-in fade)
 * Returns nothing. Skips cleanly if img is missing.
 */
function drawItemShadow(ctx, { img, key, ax, ay, scale = 2, flip = false, alpha = 1 }) {
    if (!img || !img.width) return;
    const sil = silhouette(img, key);
    const w = sil.w * scale, h = sil.h * scale;

    ctx.save();
    if (flip) { ctx.translate(ax * 2, 0); ctx.scale(-1, 1); ctx.translate(-ax, 0); }

 // -- 1. cast shadow: squashed silhouette marching along the light dir --
    const sqh = h * LIGHT.squash;
    for (const [mult, a] of LIGHT.passes) {
        const t = h * LIGHT.len * mult;
        const sx = ax + LIGHT.dirX * t - w / 2;
        const sy = ay + LIGHT.dirY * t - sqh;
        ctx.globalAlpha = alpha * a;
        ctx.imageSmoothingEnabled = true;   // soften this pass only
        ctx.drawImage(sil.cv, sx, sy, w, sqh);
        ctx.imageSmoothingEnabled = false;
    }

 // -- 2. contact AO: tight dark band hugging the base line --
    const rx = w * LIGHT.contact.rxScale;
    ctx.globalAlpha = alpha * LIGHT.contact.alphaOuter;
    ctx.fillStyle = LIGHT.color;
    ctx.beginPath();
    ctx.ellipse(ax, ay - 1, rx, LIGHT.contact.ry * (scale / 2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * LIGHT.contact.alphaInner;
    ctx.beginPath();
    ctx.ellipse(ax, ay - 1, rx * LIGHT.contact.inner, LIGHT.contact.ry * (scale / 2) * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
}

/** Floors/rugs lay flat - nothing to cast. Walls are vertical-plane items. */
function needsShadow(layer) { return layer === 'item' || layer === 'structure'; }

function clearCache() { _sil.clear(); }

module.exports = { LIGHT, drawItemShadow, needsShadow, clearCache };
