'use strict';
// Headless multi-model isometric rasteriser (port of scripts/homestead3d/iso3d.py).
// visibility z-buffer -> sun shadow map (2x2 PCF) -> per-pixel textured Lambert.
// Z is up. Camera looks toward (-x,+y): far walls are x=-W/2 (left) and y=+D/2 (right).
const EL = 33 * Math.PI / 180;
const S2 = Math.SQRT1_2;
const R = [S2, S2, 0];
const D = [-Math.cos(EL) * S2, Math.cos(EL) * S2, -Math.sin(EL)];
const U = [R[1] * D[2] - R[2] * D[1], R[2] * D[0] - R[0] * D[2], R[0] * D[1] - R[1] * D[0]];
let SUN = [-0.38, -0.62, 0.69];
{ const l = Math.hypot(...SUN); SUN = SUN.map((v) => v / l); }
const SR = (() => { const c = [SUN[1], -SUN[0], 0]; const l = Math.hypot(...c); return c.map((v) => v / l); })();   // up x sun
const SU = [SUN[1] * SR[2] - SUN[2] * SR[1], SUN[2] * SR[0] - SUN[0] * SR[2], SUN[0] * SR[1] - SUN[1] * SR[0]];

class Scene {
    constructor() { this.v = []; this.uv = []; this.m = []; this.mats = []; this.nTri = 0; }

    _mat(color, tex) { this.mats.push({ color, tex }); return this.mats.length - 1; }

    /** model = loadGLB() result; opts: pos, yaw(deg), scale (num|[sx,sy,sz]), tint, tintWhite, clip, zmin, mirror */
    addModel(model, o = {}) {
        const pos = o.pos || [0, 0, 0];
        const sc = Array.isArray(o.scale) ? o.scale : [o.scale || 1, o.scale || 1, o.sz || o.scale || 1];
        const yr = (o.yaw || 0) * Math.PI / 180, c = Math.cos(yr), s = Math.sin(yr);
        for (const part of model.parts) {
            const n = part.tris.length / 9;
            const out = new Float32Array(n * 9), ouv = [];
            const keep = [];
            for (let t = 0; t < n; t++) {
                let cx = 0, cy = 0, zmax = -Infinity;
                for (let k = 0; k < 3; k++) {
                    const x = part.tris[t * 9 + k * 3] * sc[0], y = part.tris[t * 9 + k * 3 + 1] * sc[1], z = part.tris[t * 9 + k * 3 + 2] * sc[2];
                    const wx = x * c - y * s + pos[0], wy = x * s + y * c + pos[1], wz = z + pos[2];
                    out[t * 9 + k * 3] = wx; out[t * 9 + k * 3 + 1] = wy; out[t * 9 + k * 3 + 2] = wz;
                    cx += wx / 3; cy += wy / 3; if (wz > zmax) zmax = wz;
                }
                if (o.zmin !== undefined && zmax <= o.zmin) continue;
                if (o.clip && (cx < o.clip[0] || cx > o.clip[1] || cy < o.clip[2] || cy > o.clip[3])) continue;
                keep.push(t);
            }
            if (!keep.length) continue;
            let col = part.color.slice();
            if (o.tintWhite && Math.min(...col) > 0.7) col = col.map((v, i) => v * o.tintWhite[i]);
            if (o.tint) col = col.map((v, i) => v * o.tint[i]);
            const mi = this._mat(col, part.tex);
            const tv = new Float32Array(keep.length * 9), tu = new Float32Array(keep.length * 6);
            keep.forEach((t, i) => { tv.set(out.subarray(t * 9, t * 9 + 9), i * 9); tu.set(part.uv.subarray(t * 6, t * 6 + 6), i * 6); });
            this.v.push(tv); this.uv.push(tu); this.m.push({ mi, n: keep.length });
            this.nTri += keep.length;
        }
        return this;
    }

    addBox(center, size, color, yaw = 0, tint = null) {
        const [cx, cy, cz] = center, hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
        const yr = yaw * Math.PI / 180, co = Math.cos(yr), si = Math.sin(yr);
        const sg = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        const P = sg.map(([a, b, d]) => { const x = a * hx, y = b * hy; return [x * co - y * si + cx, x * si + y * co + cy, d * hz + cz]; });
        const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
        const tv = new Float32Array(12 * 9);
        let i = 0;
        for (const [a, b, d, e] of quads) for (const tri of [[a, b, d], [a, d, e]]) for (const k of tri) { tv.set(P[k], i * 3); i++; }
        let col = color.map((v) => (v > 1 ? v / 255 : v));
        if (tint) col = col.map((v, k) => v * tint[k]);
        const mi = this._mat(col, null);
        this.v.push(tv); this.uv.push(new Float32Array(12 * 6)); this.m.push({ mi, n: 12 });
        this.nTri += 12;
        return this;
    }

    finalize() {
        const n = this.nTri;
        this.V = new Float32Array(n * 9); this.UV = new Float32Array(n * 6); this.M = new Int32Array(n);
        let o = 0;
        this.v.forEach((tv, i) => {
            this.V.set(tv, o * 9); this.UV.set(this.uv[i], o * 6);
            for (let k = 0; k < this.m[i].n; k++) this.M[o + k] = this.m[i].mi;
            o += this.m[i].n;
        });
        this.N = new Float32Array(n * 3);
        for (let t = 0; t < n; t++) {
            const v = this.V, b = t * 9;
            const ax = v[b + 3] - v[b], ay = v[b + 4] - v[b + 1], az = v[b + 5] - v[b + 2];
            const bx = v[b + 6] - v[b], by = v[b + 7] - v[b + 1], bz = v[b + 8] - v[b + 2];
            let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const l = Math.hypot(nx, ny, nz) || 1;
            this.N[t * 3] = nx / l; this.N[t * 3 + 1] = ny / l; this.N[t * 3 + 2] = nz / l;
        }
        this.v = this.uv = this.m = null;
        return this;
    }
}

function project(sceneV, n, fn) {
    const P = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
        const x = sceneV[t * 9 + k * 3], y = sceneV[t * 9 + k * 3 + 1], z = sceneV[t * 9 + k * 3 + 2];
        const r = fn(x, y, z);
        P[t * 9 + k * 3] = r[0]; P[t * 9 + k * 3 + 1] = r[1]; P[t * 9 + k * 3 + 2] = r[2];
    }
    return P;
}

function rasterIds(P, n, w, h, wantIds) {
    const zb = new Float32Array(w * h).fill(Infinity);
    const ib = wantIds ? new Int32Array(w * h).fill(-1) : null;
    for (let t = 0; t < n; t++) {
        const b = t * 9;
        const x0v = P[b], y0v = P[b + 1], z0 = P[b + 2], x1v = P[b + 3], y1v = P[b + 4], z1 = P[b + 5], x2v = P[b + 6], y2v = P[b + 7], z2 = P[b + 8];
        const minX = Math.max(Math.floor(Math.min(x0v, x1v, x2v)), 0), maxX = Math.min(Math.ceil(Math.max(x0v, x1v, x2v)), w - 1);
        const minY = Math.max(Math.floor(Math.min(y0v, y1v, y2v)), 0), maxY = Math.min(Math.ceil(Math.max(y0v, y1v, y2v)), h - 1);
        if (maxX < minX || maxY < minY) continue;
        const d = (y1v - y2v) * (x0v - x2v) + (x2v - x1v) * (y0v - y2v);
        if (Math.abs(d) < 1e-9) continue;
        const id = 1 / d;
        for (let y = minY; y <= maxY; y++) {
            const py = y + 0.5;
            for (let x = minX; x <= maxX; x++) {
                const px = x + 0.5;
                const l0 = ((y1v - y2v) * (px - x2v) + (x2v - x1v) * (py - y2v)) * id;
                if (l0 < -1e-6) continue;
                const l1 = ((y2v - y0v) * (px - x2v) + (x0v - x2v) * (py - y2v)) * id;
                if (l1 < -1e-6) continue;
                const l2 = 1 - l0 - l1;
                if (l2 < -1e-6) continue;
                const z = l0 * z0 + l1 * z1 + l2 * z2;
                const i = y * w + x;
                if (z < zb[i]) { zb[i] = z; if (ib) ib[i] = t; }
            }
        }
    }
    return { zb, ib };
}

/**
 * render(scene, { W,H, scale(px/m), origin:[x,y,z], ss, ambient, diffuse, shadows, bg })
 * -> node-canvas Canvas W x H
 */
function render(scene, o = {}) {
    const { createCanvas } = require('canvas');
    const W = o.W || 1400, H = o.H || 1200, ss = o.ss || 2;
    const w = W * ss, h = H * ss, sc = (o.scale || 135) * ss;
    const org = o.origin || [0, 0, 0];
    const ambient = o.ambient !== undefined ? o.ambient : 0.98, diffuse = o.diffuse !== undefined ? o.diffuse : 0.5;
    const warm = o.warm || [1.0, 0.93, 0.82], cool = o.cool || [0.94, 0.93, 0.96];
    const bg = o.bg === null ? null : (o.bg || [18, 20, 26]);
    const n = scene.nTri;
    const V = scene.V;

    const P = project(V, n, (x, y, z) => {
        const rx = x - org[0], ry = y - org[1], rz = z - org[2];
        return [(rx * R[0] + ry * R[1] + rz * R[2]) * sc + w * 0.5,
            -(rx * U[0] + ry * U[1] + rz * U[2]) * sc + h * (o.cy !== undefined ? o.cy : 0.40),
            rx * D[0] + ry * D[1] + rz * D[2]];
    });
    const { zb, ib } = rasterIds(P, n, w, h, true);

    // shadow map
    let zl = null, res = 0;
    const lsc = sc * 0.9;
    if (o.shadows !== false) {
        res = Math.floor(Math.max(w, h) * 0.9);
        const PL = project(V, n, (x, y, z) => {
            const rx = x - org[0], ry = y - org[1], rz = z - org[2];
            return [(rx * SR[0] + ry * SR[1] + rz * SR[2]) * lsc + res * 0.5,
                -(rx * SU[0] + ry * SU[1] + rz * SU[2]) * lsc + res * 0.5,
                -(rx * SUN[0] + ry * SUN[1] + rz * SUN[2])];
        });
        zl = rasterIds(PL, n, res, res, false).zb;
    }

    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        if (bg) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255; }
    }
    const mats = scene.mats;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const t = ib[i];
            if (t < 0) continue;
            const b = t * 9;
            const x0v = P[b], y0v = P[b + 1], x1v = P[b + 3], y1v = P[b + 4], x2v = P[b + 6], y2v = P[b + 7];
            const d = (y1v - y2v) * (x0v - x2v) + (x2v - x1v) * (y0v - y2v);
            const px = x + 0.5, py = y + 0.5;
            const l0 = ((y1v - y2v) * (px - x2v) + (x2v - x1v) * (py - y2v)) / d;
            const l1 = ((y2v - y0v) * (px - x2v) + (x0v - x2v) * (py - y2v)) / d;
            const l2 = 1 - l0 - l1;
            const wx = l0 * V[b] + l1 * V[b + 3] + l2 * V[b + 6];
            const wy = l0 * V[b + 1] + l1 * V[b + 4] + l2 * V[b + 7];
            const wz = l0 * V[b + 2] + l1 * V[b + 5] + l2 * V[b + 8];
            const mt = mats[scene.M[t]];
            let r = mt.color[0], g = mt.color[1], bl = mt.color[2];
            if (mt.tex) {
                const u = l0 * scene.UV[t * 6] + l1 * scene.UV[t * 6 + 2] + l2 * scene.UV[t * 6 + 4];
                const v = l0 * scene.UV[t * 6 + 1] + l1 * scene.UV[t * 6 + 3] + l2 * scene.UV[t * 6 + 5];
                const tw = mt.tex.w, th = mt.tex.h;
                const tx = Math.min(tw - 1, Math.max(0, Math.round((((u % 1) + 1) % 1) * (tw - 1))));
                const ty = Math.min(th - 1, Math.max(0, Math.round((((1 - v) % 1 + 1) % 1) * (th - 1))));
                const ti = (ty * tw + tx) * 4;
                const k = 1.08 / 255;
                r *= mt.tex.data[ti] * k; g *= mt.tex.data[ti + 1] * k; bl *= mt.tex.data[ti + 2] * k;
            }
            let nx = scene.N[t * 3], ny = scene.N[t * 3 + 1], nz = scene.N[t * 3 + 2];
            if (nx * D[0] + ny * D[1] + nz * D[2] > 0) { nx = -nx; ny = -ny; nz = -nz; }
            const lam = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
            let lit = 1;
            if (zl && lam > 0) {
                const rx = wx - org[0], ry = wy - org[1], rz = wz - org[2];
                const lx = (rx * SR[0] + ry * SR[1] + rz * SR[2]) * lsc + res * 0.5;
                const ly = -(rx * SU[0] + ry * SU[1] + rz * SU[2]) * lsc + res * 0.5;
                const ld = -(rx * SUN[0] + ry * SUN[1] + rz * SUN[2]) - 0.045;
                let sum = 0, cnt = 0;
                for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
                    const ix = Math.min(res - 1, Math.max(0, Math.floor(lx) + ox)), iy = Math.min(res - 1, Math.max(0, Math.floor(ly) + oy));
                    sum += zl[iy * res + ix] < ld ? 0 : 1; cnt++;
                }
                lit = sum / cnt;
            } else if (lam <= 0) lit = 0;
            const sky = 0.65 + 0.35 * Math.max(0, nz);
            const ao = Math.min(1, Math.max(0.8, 0.8 + 0.2 * Math.min(1, Math.max(0, (wz - org[2]) / 0.5 + 0.0))));
            const a = ambient * sky, dd = diffuse * lam * lit;
            const lr = cool[0] * a + warm[0] * dd, lg = cool[1] * a + warm[1] * dd, lb = cool[2] * a + warm[2] * dd;
            out[i * 4] = Math.min(255, r * lr * ao * 255);
            out[i * 4 + 1] = Math.min(255, g * lg * ao * 255);
            out[i * 4 + 2] = Math.min(255, bl * lb * ao * 255);
            out[i * 4 + 3] = 255;
        }
    }
    const big = createCanvas(w, h);
    big.getContext('2d').putImageData(new (require('canvas').ImageData)(out, w, h), 0, 0);
    if (ss === 1) return big;
    const fin = createCanvas(W, H);
    const g = fin.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(big, 0, 0, W, H);
    return fin;
}

module.exports = { Scene, render, EL, R, U, D };
