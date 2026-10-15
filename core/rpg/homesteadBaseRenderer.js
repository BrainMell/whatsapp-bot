'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD BASE RENDERER — outdoor isometric base hub (Sections 6/7/10)
//  16x16 outdoor map: grass terrain, fixed zones (mines rock, pond water,
//  fenced hunting grounds), expansion plots, upgradeable structures drawn
//  1:1 with the SAME shadow engine as the room (isoShadow.js) so both views
//  share one light model and one grounding law.
//  Animated: water shimmer, chimney/forge smoke, gate torch, fireflies.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const isoShadow = require('./isoShadow');

const SS = 2;
const TW = 64, TH = 32;
const N = 16;                 // base tiles per side
const ART_W = 1240, ART_H = 850;
const OX = ART_W / 2;
const OY = 150;
const FRAMES = 14, FRAME_MS = 110;

const ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

let STRUCT_DEF = null;
function structures() {
    if (!STRUCT_DEF) {
        try { STRUCT_DEF = JSON.parse(fs.readFileSync(path.join(ASSETS, 'structures.json'), 'utf8')); }
        catch (e) { STRUCT_DEF = { structures: [] }; }
    }
    return STRUCT_DEF;
}
function structDef(type) { return structures().structures.find((s) => s.id === type); }

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        for (const [f, o] of [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ]) {
            const p = path.join(FONTS, f);
            if (fs.existsSync(p)) { try { registerFont(p, o); } catch (e) { /* skip */ } }
        }
        fontsReady = true;
        return true;
    } catch (e) { return false; }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const _img = new Map();
async function img(file) {
    if (_img.has(file)) return _img.get(file);
    let out = null;
    try { out = await require('canvas').loadImage(path.join(ASSETS, file)); } catch (e) { out = null; }
    _img.set(file, out);
    return out;
}

function isoX(x, y) { return OX + (x - y) * (TW / 2); }
function isoY(x, y) { return OY + (x + y) * (TH / 2); }
function footCenter(x, y, fw, fh) {
    return { x: isoX(x + fw / 2, y + fh / 2), y: isoY(x + fw / 2, y + fh / 2) };
}
function anchorOf(x, y, fw, fh) {
    const c = footCenter(x, y, fw, fh);
    return { cx: c.x, ay: c.y + (fw + fh) * (TH / 4) - TH / 2 + 2 };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── LAYOUT (must match baseBuilder.js LAYOUT) ──
const LAYOUT = {
    N,
    house: { x: 6, y: 6, fw: 3, fh: 3 },
    mines: { x: 1, y: 1, fw: 2, fh: 2, zone: { x: 0, y: 0, fw: 5, fh: 4 } },
    pond: { x: 12, y: 1, fw: 2, fh: 2, zone: { x: 11, y: 0, fw: 5, fh: 4 } },
    hunting: { x: 3, y: 7, fw: 2, fh: 2, zone: { x: 0, y: 5, fw: 4, fh: 8 }, fenceCol: 4 },
    paths: [[13, 13], [12, 12], [11, 11], [10, 10], [9, 9], [10, 11], [10, 12], [9, 12], [11, 9], [12, 9], [12, 8], [4, 9], [4, 10], [5, 9], [5, 10], [3, 10], [3, 11], [2, 12]],
};

function inZone(z, x, y) { return x >= z.x && x < z.x + z.fw && y >= z.y && y < z.y + z.fh; }

// ═══════════════════════════════════════════════════════════════════════════
// ONE FRAME
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    ensureFonts();
    const canvas = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.imageSmoothingEnabled = false;

    const seed = hashStr(state.owner || 'base');

    // ── sky + soft sun glow (daytime outdoor) ──
    const sky = ctx.createLinearGradient(0, 0, 0, ART_H);
    sky.addColorStop(0, '#8fb8d9');
    sky.addColorStop(0.45, '#b8d4e4');
    sky.addColorStop(1, '#57452e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, ART_W, ART_H);
    const sun = ctx.createRadialGradient(180, 90, 10, 180, 90, 260);
    sun.addColorStop(0, 'rgba(255,238,190,0.85)');
    sun.addColorStop(1, 'rgba(255,238,190,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, ART_W, 420);

    // clouds (drifting, frame-driven)
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const cd = (frame / FRAMES) * 40;
    for (const [bx, by, s] of [[220, 90, 1.2], [760, 60, 0.9], [1040, 130, 1.05]]) {
        const cx2 = ((bx + cd * s) % (ART_W + 260)) - 130;
        ctx.beginPath();
        ctx.ellipse(cx2, by, 60 * s, 16 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 + 34 * s, by - 8 * s, 36 * s, 13 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 - 30 * s, by - 4 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── terrain ──
    const grass = ['base_grass_a.png', 'base_grass_b.png', 'base_grass_c.png'];
    const waterF = frame % 4 < 2 ? 'base_water_0.png' : 'base_water_1.png';
    for (let sum = 0; sum <= 2 * (N - 1); sum++) {
        for (let x = Math.max(0, sum - N + 1); x <= Math.min(N - 1, sum); x++) {
            const y = sum - x;
            const r = mulberry32(seed + x * 131 + y * 17)();
            let tile;
            if (inZone(LAYOUT.mines.zone, x, y)) tile = r < 0.85 ? 'base_rock.png' : 'base_grass_c.png';
            else if (inZone(LAYOUT.pond.zone, x, y)) tile = r < 0.92 ? waterF : 'base_grass_c.png';
            else if ((LAYOUT.paths || []).some(([px, py]) => px === x && py === y)) tile = 'base_path.png';
            else tile = r < 0.06 ? 'base_grass_flowers.png' : grass[Math.floor(r * 3) % 3];
            const timg = await img(tile);
            if (timg) ctx.drawImage(timg, isoX(x, y) - TW / 2, isoY(x, y) - TH / 2);
        }
    }
    // map edge rim
    ctx.strokeStyle = 'rgba(40,28,14,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(isoX(0, N), isoY(0, N));
    ctx.lineTo(isoX(N, N), isoY(N, N));
    ctx.lineTo(isoX(N, 0), isoY(N, 0));
    ctx.stroke();

    // ── hunting grounds fence (east boundary, gate gap) ──
    const fenceImg = await img('base_fence.png');
    if (fenceImg) {
        const z = LAYOUT.hunting;
        for (let yy = z.zone.y; yy < z.zone.y + z.zone.fh; yy++) {
            if (yy >= z.y && yy < z.y + z.fh) continue; // gate gap
            ctx.drawImage(fenceImg, isoX(z.fenceCol, yy) - 32, isoY(z.fenceCol, yy) - 14);
        }
        // north run of the fence (along x, at y = zone.y)
        for (let xx = 0; xx < z.zone.fw; xx++) {
            ctx.drawImage(fenceImg, isoX(xx + 0.5, z.zone.y) - 33, isoY(xx + 0.5, z.zone.y) - 30);
        }
    }
    // trees + props inside hunting zone and scattered (avoid used cells)
    const treeImg = await img('base_tree_oak.png');
    const pineImg = await img('base_tree_pine.png');
    const bushImg = await img('base_bush.png');
    const boulderImg = await img('base_boulder.png');
    const props = [];
    const used = new Set();
    for (const st of state.structures || []) {
        const d = structDef(st.type);
        if (!d) continue;
        for (let ix = 0; ix < d.fw; ix++) for (let iy = 0; iy < d.fh; iy++) used.add(`${st.x + ix},${st.y + iy}`);
    }
    for (let yy = LAYOUT.hunting.zone.y; yy < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; yy++) {
        for (let xx = LAYOUT.hunting.zone.x; xx < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; xx++) {
            if (used.has(`${xx},${yy}`)) continue;
            const r = mulberry32(seed + xx * 31 + yy * 7)();
            if (r < 0.30) props.push({ img: r < 0.12 ? treeImg : pineImg, x: isoX(xx + 0.3 + r, yy + 0.5), y: isoY(xx + 0.3 + r, yy + 0.5) + 10 });
            else if (r < 0.42 && bushImg) props.push({ img: bushImg, x: isoX(xx + 0.5, yy + 0.5), y: isoY(xx + 0.5, yy + 0.5) + 8 });
        }
    }
    for (let i = 0; i < 7; i++) {
        const r1 = mulberry32(seed + 500 + i)(), r2 = mulberry32(seed + 900 + i)();
        const xx = 5 + Math.floor(r1 * 10), yy = 4 + Math.floor(r2 * 11);
        if (used.has(`${xx},${yy}`)) continue;
        if ((LAYOUT.paths || []).some(([px, py]) => px === xx && py === yy)) continue;
        if (r1 < 0.5 && bushImg) props.push({ img: bushImg, x: isoX(xx + 0.5, yy + 0.5), y: isoY(xx + 0.5, yy + 0.5) + 8 });
        else if (boulderImg && r1 > 0.8) props.push({ img: boulderImg, x: isoX(xx + 0.5, yy + 0.5), y: isoY(xx + 0.5, yy + 0.5) + 8 });
    }

    // ── plot markers for free expansion plots ──
    const plotImg = await img('base_plot_marker.png');
    for (const plot of state.freePlots || []) {
        if (!plotImg) break;
        const c = footCenter(plot.x, plot.y, 3, 3);
        const bob = Math.sin((frame / FRAMES) * Math.PI * 2 + plot.id) * 1.2;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(plotImg, c.x - plotImg.width / 2, isoY(plot.x + 1, plot.y + 1) - plotImg.height / 2 + bob);
        ctx.font = '15px Medieval, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(35,25,12,0.9)';
        ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1, plot.y + 1) + 5 + bob);
        ctx.fillStyle = '#f2e2b8';
        ctx.fillText(`PLOT ${plot.id}`, c.x, isoY(plot.x + 1, plot.y + 1) + 4 + bob);
        ctx.restore();
    }

    // ── structures: back→front depth sort ──
    const structs = (state.structures || [])
        .map((st) => ({ ...st, def: structDef(st.type) }))
        .filter((st) => st.def)
        .sort((a, b) => (a.x + a.y) - (b.x + b.y));

    const drawn = [];
    for (const st of structs) {
        const lv = st.def.levels.find((l) => l.level === st.level) || st.def.levels[0];
        const spr = await img(`${lv.sprite}.png`);
        if (!spr) continue;
        const { cx, ay } = anchorOf(st.x, st.y, st.def.fw, st.def.fh);
        drawn.push({ st, spr, cx, ay, w: spr.width, h: spr.height, lv });
    }

    // props behind structures merge into the same depth pass (props have no footprint)
    const drawables = [
        ...props.map((p) => ({ kind: 'prop', x: p.x, y: p.y, img: p.img })),
        ...drawn.map((d) => ({ kind: 'struct', ...d })),
    ].sort((a, b) => (a.y) - (b.y));

    // shadows first (floor level)
    for (const d of drawables) {
        if (d.kind === 'prop') {
            if (d.img && d.img.height > 26) {
                isoShadow.drawItemShadow(ctx, { img: d.img, key: `prop${d.x}|${d.y}`, scale: 1, ax: d.x, ay: d.y + 2, alpha: 0.8 });
            }
            continue;
        }
        isoShadow.drawItemShadow(ctx, {
            img: d.spr, key: `${d.st.type}_${d.st.level}`, scale: 1,
            ax: d.cx, ay: d.ay, alpha: 1,
        });
    }
    // sprites
    for (const d of drawables) {
        if (d.kind === 'prop') {
            ctx.drawImage(d.img, d.x - d.img.width / 2, d.y - d.img.height);
            continue;
        }
        ctx.drawImage(d.spr, d.cx - d.w / 2, d.ay - d.h);
    }

    // ── animations ──
    // gate torch flicker
    const gate = structs.find((s) => s.type === 'hunting');
    if (gate) {
        const fl = Math.sin(frame * 1.9) * 0.5 + 0.5;
        const gx = isoX(gate.x + 1.9, gate.y), gy = isoY(gate.x + 1.9, gate.y) - 66;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const R = 22 + fl * 6;
        const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, R);
        g.addColorStop(0, 'rgba(255,190,90,0.5)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    // chimney/forge smoke: house L2+, smithy L2+
    const t = frame / FRAMES;
    for (const d of drawn) {
        let smokes = 0, sxo = 0, syo = 0;
        if (d.st.type === 'house' && d.st.level >= 2) { smokes = 3; sxo = 40; syo = -d.h + 14; }
        if (d.st.type === 'blacksmith' && d.st.level >= 2) { smokes = 4; sxo = 52; syo = -d.h + 30; }
        if (!smokes) continue;
        ctx.save();
        for (let i = 0; i < smokes; i++) {
            const ph = (t + i / smokes) % 1;
            ctx.globalAlpha = 0.30 * (1 - ph);
            ctx.fillStyle = '#e8e4da';
            ctx.beginPath();
            ctx.ellipse(d.cx + sxo + Math.sin(ph * 5 + i) * 8, d.ay + syo - ph * 44, 4 + ph * 10, 3 + ph * 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    // pond sparkle + alchemy sparks
    const pond = structs.find((s) => s.type === 'pond');
    if (pond && pond.level >= 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sp = (t * 3) % 1;
        ctx.globalAlpha = 0.6 * (1 - sp);
        ctx.fillStyle = '#dff6fa';
        ctx.beginPath(); ctx.arc(pond.cx + Math.sin(t * 6.28) * 20, pond.ay - 30 - sp * 24, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    const alch = structs.find((s) => s.type === 'alchemy');
    if (alch) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const ph = (t + i / 3) % 1;
            ctx.globalAlpha = 0.5 * (1 - ph);
            ctx.fillStyle = '#aef0b8';
            ctx.beginPath(); ctx.arc(alch.cx + 70 + Math.sin(ph * 9 + i * 2) * 10, alch.ay - 8 - ph * 30, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    // fireflies (dusk ambience near grass)
    ctx.save();
    for (let i = 0; i < 6; i++) {
        const r1 = mulberry32(seed + 3000 + i)();
        const ph = (t + r1) % 1;
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(OX + (r1 - 0.5) * 700, OY + 300 + (i % 3) * 90 - ph * 26, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(OX, OY + 340, 380, OX, OY + 340, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,6,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, ART_W, ART_H);

    drawHud(ctx, state, opts);
    return canvas.toBuffer('image/png');
}

// ── HUD plate ──
function drawHud(ctx, state, opts) {
    const H = 132, Wp = ART_W - 60;
    const x0 = 30, y0 = ART_H - H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.88)';
    roundRect(ctx, x0, y0, Wp, H, 14);
    ctx.fill();
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, H - 8, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, H - 18, 8);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(String(state.owner || 'Adventurer').slice(0, 22), x0 + 26, y0 + 38);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`The base of ${state.owner}`, x0 + 26, y0 + 64);

    const count = (state.structures || []).length;
    ctx.textAlign = 'center';
    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${count}`, x0 + Wp - 250, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('STRUCTURES', x0 + Wp - 250, y0 + 62);

    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${(state.freePlots || []).length}`, x0 + Wp - 90, y0 + 38);
    ctx.font = '14px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('FREE PLOTS', x0 + Wp - 90, y0 + 62);

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    ctx.fillText(opts.hint || 'base build <type> [plot]  •  base upgrade <type|#>  •  base house 1  •  base info', x0 + Wp / 2, y0 + H - 26);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: base animation (WhatsApp GIF = mp4) with PNG fallback
// ═══════════════════════════════════════════════════════════════════════════
async function encodeFramesToMp4(frames) {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg'); } catch (e) { /* engine sets it too */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    frames.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b));
    const out = path.join(tmp, 'base.mp4');
    try {
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmp, 'f%03d.png'))
                .inputOptions(['-framerate', `${1000 / FRAME_MS}`])
                .outputOptions([
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                    '-movflags', '+faststart', '-an', '-y',
                ])
                .output(out)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        return fs.readFileSync(out);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.owner, state.structures, state.freePlots, opts.hint || '']));
}

async function renderBaseImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const frames = [];
    for (let f = 0; f < FRAMES; f++) frames.push(await renderFrame(state, f, opts));
    let out = { buffer: frames[0], contentType: 'image/png' };
    try {
        const mp4 = await encodeFramesToMp4(frames);
        if (mp4 && mp4.length > 1000) out = { buffer: mp4, contentType: 'video/mp4' };
    } catch (e) {
        console.error('[baseRenderer] mp4 encode failed, PNG fallback:', e.message);
    }
    if (_renderCache.size > 120) _renderCache.clear();
    _renderCache.set(key, { ...out, ts: Date.now() });
    return out;
}

module.exports = { LAYOUT, N, FRAMES, renderFrame, renderBaseImage, encodeFramesToMp4, structDef, structures };
