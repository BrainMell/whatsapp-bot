'use strict';
const { render, R, U } = require('./raster');
const { buildScene } = require('./scene');

const VERSION = 4;   // v4: canvas.project exposure (owner 2026-10-24 "add the moving gif we used to have
                     // for the old furniture system for this, the grid too") — old static bakes invalidated

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
    return canvas;
}

module.exports = { renderInterior, VERSION };
