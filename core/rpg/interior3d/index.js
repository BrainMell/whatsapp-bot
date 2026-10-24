'use strict';
const { render, R, U } = require('./raster');
const { buildScene } = require('./scene');

const VERSION = 1;
const CAM = { origin: [0, 0, 1.0], scale: 96 };

/** world -> output px (for overlays) */
function projector(W, H, scale = CAM.scale, origin = CAM.origin) {
    return (x, y, z) => {
        const rx = x - origin[0], ry = y - origin[1], rz = z - origin[2];
        return [(rx * R[0] + ry * R[1] + rz * R[2]) * scale + W * 0.5, -(rx * U[0] + ry * U[1] + rz * U[2]) * scale + H * 0.40];
    };
}

/** state -> node-canvas Canvas (W x H) */
async function renderInterior(state, opts = {}) {
    const W = opts.W || 1500, H = opts.H || 1100;
    const scene = await buildScene(state, opts);
    return render(scene, { W, H, scale: opts.scale || CAM.scale, origin: CAM.origin, ss: opts.ss || 2, bg: opts.bg === undefined ? [24, 20, 28] : opts.bg });
}

module.exports = { renderInterior, projector, VERSION, CAM };
