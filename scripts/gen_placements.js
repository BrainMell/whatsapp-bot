#!/usr/bin/env node
'use strict';
// Emits placement JSON for the PIL preview renderer — uses the SAME pure
// modules (isoOutlands, isoForest.islandForest) and the same placement math
// the renderers use, so previews match the bot 1:1.
// usage: gen_placements.js <base|guild> <seedStr> <stateJsonFile>
const path = require('path');
const REPO = '/home/z/my-project/repos/whatsapp-bot';
const isoOutlands = require(path.join(REPO, 'core/rpg/isoOutlands.js'));
const isoForest = require(path.join(REPO, 'core/rpg/isoForest.js'));

const kind = process.argv[2] || 'base';
const seedStr = process.argv[3] || 'player1';
const stateFile = process.argv[4];
let state = {};
try { state = JSON.parse(require('fs').readFileSync(stateFile, 'utf8')); } catch (e) {}

const N = 16, P = 3, M = 12;
const OX = 620, OY = 150, TW = 64, TH = 32;
const isoX = (x, y) => OX + (x - y) * (TW / 2);
const isoY = (x, y) => OY + (x + y) * (TH / 2);

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

let occupied = new Set(), paths = [], hot = [], plotCells = new Set(), structFoots = [], garnish = [];
const outlands = isoOutlands.outlandProps({ seedStr, N, P, isoX, isoY, M });

if (kind === 'base') {
    const hs = require(path.join(REPO, 'core/rpg/homesteadBaseRenderer.js'));
    const LAYOUT = hs.LAYOUT;
    const inZone = (z, x, y) => x >= z.x && x < z.x + z.fw && y >= z.y && y < z.y + z.fh;
    const structDef = hs.structDef;
    for (const st of state.structures || []) {
        const d = structDef(st.type);
        if (!d) continue;
        for (let ix = 0; ix < d.fw; ix++) for (let iy = 0; iy < d.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
        structFoots.push([st.x, st.y, d.fw, d.fh]);
    }
    const usedMargin = new Set(occupied);
    for (const key of occupied) {
        const [sx, sy] = key.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) usedMargin.add(`${sx + dx},${sy + dy}`);
    }
    occupied = usedMargin;
    for (const plot of state.freePlots || []) {
        for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${plot.x + ix},${plot.y + iy}`);
    }
    {
        const h = LAYOUT.house;
        for (let xx = h.x - 1; xx <= h.x + h.fw; xx++) {
            for (let yy = h.y - 1; yy <= h.y + h.fh; yy++) {
                if (xx >= h.x && xx < h.x + h.fw && yy >= h.y && yy < h.y + h.fh) continue;
                hot.push([xx, yy]);
            }
        }
        for (let xx = LAYOUT.hunting.zone.x; xx < LAYOUT.hunting.zone.x + LAYOUT.hunting.zone.fw; xx++) {
            for (let yy = LAYOUT.hunting.zone.y; yy < LAYOUT.hunting.zone.y + LAYOUT.hunting.zone.fh; yy++) hot.push([xx, yy]);
        }
    }
    paths = LAYOUT.paths || [];
    // zone garnish (mines boulders / pond reeds) — port of renderFrame block
    const seed = hashStr(state.owner || 'base');
    const gRnd = mulberry32(seed + 4711);
    const zoneFree = (x, y) => {
        for (const st of state.structures || []) {
            const d = structDef(st.type);
            if (!d) continue;
            if (x >= st.x - 1 && x < st.x + d.fw + 1 && y >= st.y - 1 && y < st.y + d.fh + 1) return false;
        }
        return !(paths || []).some(([px2, py2]) => px2 === x && py2 === y);
    };
    const mz = LAYOUT.mines.zone, pz = LAYOUT.pond.zone;
    for (let i = 0; i < 6; i++) {
        const gx = mz.x + Math.floor(gRnd() * mz.fw), gy = mz.y + Math.floor(gRnd() * mz.fh);
        if (zoneFree(gx, gy)) garnish.push({ file: gRnd() < 0.6 ? 'px_boulder.png' : 'px_rock.png', x: isoX(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 30, y: isoY(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 14, sc: 1 });
    }
    for (let i = 0; i < 5; i++) {
        const gx = pz.x + Math.floor(gRnd() * pz.fw), gy = pz.y + Math.floor(gRnd() * pz.fh);
        if (zoneFree(gx, gy)) garnish.push({ file: gRnd() < 0.55 ? 'px_fern.png' : 'px_bush_a.png', x: isoX(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 30, y: isoY(gx + 0.5, gy + 0.5) + (gRnd() - 0.5) * 14, sc: 1 });
    }
    var forestProps = isoForest.islandForest({ seed: hashStr(state.owner || 'base'), N, isoX, isoY, occupied, paths, hot, plotCells, margin: false, haze: false, structFoots });
} else {
    const g = require(path.join(REPO, 'core/rpg/guildBaseRenderer.js'));
    for (const st of Object.values(g.GUILD_STRUCTS)) {
        for (let ix = -1; ix <= st.fw; ix++) for (let iy = -1; iy <= st.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
        structFoots.push([st.x, st.y, st.fw, st.fh]);
    }
    paths = g.PATHS;
    for (const [px, py] of g.COTTAGE_SLOTS) { occupied.add(`${px},${py}`); occupied.add(`${px},${py - 1}`); }
    for (let ax = 11; ax <= 12; ax++) occupied.add(`${ax},10`);
    for (const plot of g.GUILD_PLOTS) {
        for (let ix = -1; ix < 4; ix++) for (let iy = -1; iy < 4; iy++) plotCells.add(`${plot.x + ix},${plot.y + iy}`);
    }
    {
        const hall = g.GUILD_STRUCTS.hall;
        for (let hx = hall.x - 1; hx <= hall.x + hall.fw; hx++) {
            for (let hy = hall.y - 1; hy <= hall.y + hall.fh; hy++) {
                if (hx >= hall.x && hx < hall.x + hall.fw && hy >= hall.y && hy < hall.y + hall.fh) continue;
                hot.push([hx, hy]);
            }
        }
    }
    forestProps = isoForest.islandForest({ seed: hashStr(state.name || 'guild'), N, isoX, isoY, occupied, paths, hot, plotCells, margin: false, haze: false, structFoots });
}

const fence = isoForest.fenceRing(N, isoX, isoY, kind === 'base' ? [[5, N - 1 + P]] : [[-P, 8]], P);
process.stdout.write(JSON.stringify({
    biome: outlands.biome,
    wildTiles: outlands.tiles,
    outlandProps: outlands.props,
    forestProps,
    garnish,
    fence,
}));
