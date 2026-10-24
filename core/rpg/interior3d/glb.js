'use strict';
// Minimal GLB (glTF 2.0 binary) reader for the interior renderer.
// Returns triangle soups per material, node transforms applied. Z is UP in the
// house-builder pack (models were exported raw from a z-up DCC), so coordinates
// are NOT converted. No dependencies beyond node-canvas (for texture decode).
const fs = require('fs');

const _cache = new Map();

function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mat4Mul(a, b) {                       // column-major, a*b
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
    }
    return o;
}
function nodeMatrix(n) {
    if (n.matrix) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [
        (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0,
        (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0,
        (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1,
    ];
}

const COMP = { 5120: [1, Int8Array], 5121: [1, Uint8Array], 5122: [2, Int16Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(gltf, bin, idx) {
    const a = gltf.accessors[idx];
    const bv = gltf.bufferViews[a.bufferView];
    const [csz, Arr] = COMP[a.componentType];
    const n = NCOMP[a.type];
    const stride = bv.byteStride || csz * n;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Arr(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
        const off = base + i * stride + k * csz;
        let v;
        switch (a.componentType) {
            case 5126: v = dv.getFloat32(off, true); break;
            case 5125: v = dv.getUint32(off, true); break;
            case 5123: v = dv.getUint16(off, true); break;
            case 5121: v = dv.getUint8(off); break;
            case 5122: v = dv.getInt16(off, true); break;
            default: v = dv.getInt8(off);
        }
        out[i * n + k] = v;
    }
    return out;
}

async function decodeImage(gltf, bin, imgIdx) {
    const im = gltf.images[imgIdx];
    const bv = gltf.bufferViews[im.bufferView];
    const buf = Buffer.from(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
    try {
        const { loadImage, createCanvas } = require('canvas');
        const img = await loadImage(buf);
        const c = createCanvas(img.width, img.height);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height);
        return { w: img.width, h: img.height, data: d.data };
    } catch (e) { return null; }
}

/** -> { parts: [{ tris: Float32Array(n*9), uv: Float32Array(n*6), color:[r,g,b] 0..1, tex:{w,h,data}|null }], bounds } */
async function loadGLB(file) {
    if (_cache.has(file)) return _cache.get(file);
    const p = (async () => {
        const b = fs.readFileSync(file);
        if (b.readUInt32LE(0) !== 0x46546C67) throw new Error('not a GLB: ' + file);
        let off = 12, json = null, bin = null;
        while (off < b.length) {
            const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
            const body = b.subarray(off + 8, off + 8 + len);
            if (type === 0x4E4F534A) json = JSON.parse(body.toString('utf8'));
            else if (type === 0x004E4942) bin = body;
            off += 8 + len;
        }
        const texCache = new Map();
        const parts = [];
        const walk = async (ni, parent) => {
            const n = json.nodes[ni];
            const m = mat4Mul(parent, nodeMatrix(n));
            if (n.mesh !== undefined) {
                for (const prim of json.meshes[n.mesh].primitives) {
                    if (prim.mode !== undefined && prim.mode !== 4) continue;
                    const pos = readAccessor(json, bin, prim.attributes.POSITION);
                    const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
                    const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
                    const nt = idx.length / 3;
                    const tris = new Float32Array(nt * 9), tuv = new Float32Array(nt * 6);
                    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
                        const vi = idx[t * 3 + k];
                        const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
                        tris[t * 9 + k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
                        tris[t * 9 + k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                        tris[t * 9 + k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
                        if (uv) { tuv[t * 6 + k * 2] = uv[vi * 2]; tuv[t * 6 + k * 2 + 1] = uv[vi * 2 + 1]; }
                    }
                    let color = [0.6, 0.6, 0.6], tex = null;
                    const mat = prim.material !== undefined ? json.materials[prim.material] : null;
                    const pbr = mat && mat.pbrMetallicRoughness;
                    if (pbr && pbr.baseColorFactor) color = pbr.baseColorFactor.slice(0, 3);
                    if (pbr && pbr.baseColorTexture && uv) {
                        const ti = pbr.baseColorTexture.index;
                        const src = json.textures[ti].source;
                        if (!texCache.has(src)) texCache.set(src, await decodeImage(json, bin, src));
                        tex = texCache.get(src);
                    }
                    parts.push({ tris, uv: tuv, color, tex });
                }
            }
            for (const c of n.children || []) await walk(c, m);
        };
        const scene = json.scenes[json.scene || 0];
        for (const r of scene.nodes) await walk(r, mat4Identity());
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (const pt of parts) for (let i = 0; i < pt.tris.length; i += 3) for (let k = 0; k < 3; k++) {
            mn[k] = Math.min(mn[k], pt.tris[i + k]); mx[k] = Math.max(mx[k], pt.tris[i + k]);
        }
        return { parts, min: mn, max: mx };
    })();
    _cache.set(file, p);
    p.catch(() => _cache.delete(file));
    return p;
}

module.exports = { loadGLB };
