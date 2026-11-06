'use strict';
const { render, R, U } = require('./raster');
const { buildScene } = require('./scene');

const VERSION = 7;   // v7: canonical GLB beds in rooms and shop thumbnails; invalidates old procedural-bed bakes

/** state -> node-canvas Canvas (W x H). Camera auto-fits the whole footprint (annexes, loft, 2nd-floor walls). */
async function renderInterior(state, opts = {}) {
    const W = opts.W || 1500, H = opts.H || 1100;
    const scene = await buildScene(state, opts);
    const b = scene.bounds;
    const org = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1.0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [b.x0 - 0.3, b.x1 + 0.3]) for (const y of [b.y0 - 0.3, b.y1 + 0.3]) for (const z of [-0.9, b.zTop]) {
        const rx = x - org[0], ry = y - org[1], rz = z - org[2];
        const sx = rx * R[0] + ry * R[1] + rz * R[2], sy = -(rx * U[0] + ry * U[1] + rz * U[2]);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    const scale = Math.min(opts.scale || 110, (W * 0.96) / (maxX - minX), (H * 0.95) / (maxY - minY));
    const cy = (H / 2 - ((minY + maxY) / 2) * scale) / H;
    scene.camera = { scale, cy, org };
    const canvas = render(scene, { W, H, scale, origin: org, cy, ss: opts.ss || 2, bg: opts.bg === undefined ? [24, 20, 28] : opts.bg });
    // v4 ADDITIVE: expose the exact world→screen projection this render used so
    // overlays (selection grid, chevron, glow effects) can be drawn ON TOP of the
    // 3D raster without touching the rasteriser or the scene. Coordinates are in
    // the returned canvas' own pixel space (W x H), mirroring render()'s math:
    //   sx = (rx·R)·scale + W/2 ,  sy = −(rx·U)·scale + H·cy
    canvas.project = (x, y, z) => {
        const rx = x - org[0], ry = y - org[1], rz = z - org[2];
        return [(rx * R[0] + ry * R[1] + rz * R[2]) * scale + W * 0.5,
            -(rx * U[0] + ry * U[1] + rz * U[2]) * scale + H * cy];
    };
    canvas.cam = { scale, cy, org, W, H };
    // v5 ADDITIVE: selection highlight — the selected piece rendered ALONE with
    // the SAME camera onto a transparent canvas (no shadows, bg:null), so the
    // room view can composite it glowing OVER walls: pieces in annexes hidden
    // behind the main back walls, ground pieces under the loft slab, pieces
    // behind low partitions — all stay visible while selected. The rasteriser
    // and the scene build are untouched; this is a second cheap one-model pass
    // reusing the already-cached GLB.
    if (opts.hl) {
        try {
            const { buildHighlight } = require('./scene');
            const hs = await buildHighlight(opts.hl);
            if (hs) canvas.hl = render(hs, { W, H, scale, origin: org, cy, ss: opts.ss || 2, bg: null, shadows: false });
        } catch (e) { console.warn('[interior3d] highlight pass skipped:', e.message); }   // cosmetic — never fail the room
    }
    return canvas;
}

/** v5 3D shop thumb — ONE furniture piece centred on a floor tile, camera
 *  auto-fitted on its bbox, same iso basis as the rooms, transparent PNG
 *  Buffer (or null). Used by the outfitter/inventory cards. */
async function renderItemThumb(id) {
    const { buildItemScene } = require('./scene');
    const scene = await buildItemScene(id);
    if (!scene || !scene.nTri) return null;
    const W = 360, H = 360;
    const { dx, dy, dz } = scene.itemBBox;
    const org = [0, 0, dz * 0.45];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [-dx * 0.6, dx * 0.6]) for (const y of [-dy * 0.6, dy * 0.6]) for (const z of [-0.1, dz]) {
        const rx = x - org[0], ry = y - org[1], rz = z - org[2];
        const sx = rx * R[0] + ry * R[1] + rz * R[2], sy = -(rx * U[0] + ry * U[1] + rz * U[2]);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    const scale = Math.min(170, (W * 0.80) / (maxX - minX), (H * 0.80) / (maxY - minY));
    const cy = (H / 2 - ((minY + maxY) / 2) * scale) / H;
    const canvas = render(scene, { W, H, scale, origin: org, cy, ss: 2, bg: null, shadows: false });
    return canvas.toBuffer('image/png');
}

module.exports = { renderInterior, renderItemThumb, VERSION };
