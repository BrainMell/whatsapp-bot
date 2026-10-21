#!/usr/bin/env node
'use strict';
// Task 22 visual QA — restored pond (no girl, moving water, swimming fish),
// vector herd, established banners. Renders everything to
// /home/z/my-project/download/qa22/ for frame-by-frame eyeballing.
const fs = require('fs');
const path = require('path');
const outDir = '/home/z/my-project/download/qa22';
fs.mkdirSync(outDir, { recursive: true });
const { createCanvas } = require('canvas');

(async () => {
    const dockPov = require('../core/rpg/dockPov');
    const huntPov = require('../core/rpg/huntPov');
    const dayNight = require('../core/rpg/dayNight');
    const { GifCodec } = require('gifwrap');
    const { PNG } = require('pngjs');

    // 1) pond stills across phases (viewer card look)
    for (const phase of ['day', 'dawn', 'golden', 'dusk', 'night']) {
        const cv = createCanvas(960, 720), c2 = cv.getContext('2d');
        dockPov.paintStill(c2, 960, 720, { lvl: 2, biome: 'isle', phase });
        fs.writeFileSync(`${outDir}/pond_${phase}.png`, cv.toBuffer('image/png'));
    }
    // 2) biome washes
    for (const b of ['desert', 'tundra', 'volcanic']) {
        const cv = createCanvas(480, 360), c2 = cv.getContext('2d');
        dockPov.paintStill(c2, 480, 360, { lvl: 1, biome: b, phase: 'day' });
        fs.writeFileSync(`${outDir}/pond_biome_${b}.png`, cv.toBuffer('image/png'));
    }
    // 3) catch GIFs (banner styles) + frame dumps for motion inspection
    const codec = new GifCodec();
    async function dumpGif(file, tag, frames) {
        const g = await codec.decodeGif(fs.readFileSync(file));
        for (const i of frames) {
            const b = g.frames[Math.min(i, g.frames.length - 1)].bitmap;
            fs.writeFileSync(`${outDir}/${tag}_f${i}.png`, PNG.sync.write({ width: b.width, height: b.height, data: b.data }));
        }
        return g.frames.length;
    }
    const g1 = await dockPov.renderFishingGif({ biome: 'isle', lvl: 1, band: 'epic', drops: { crystal_koi: 1, raw_fish: 2 }, phase: 'day', banner: { head: 'Catch of the day', lines: ['1× Crystal Koi — EPIC · sells 1,800Z', '2× Pond Minnow — COMMON · sells 40Z', '+1,880 ZENI'] } });
    fs.writeFileSync(`${outDir}/pond_gif_epic_day.gif`, g1.buffer);
    await dumpGif(`${outDir}/pond_gif_epic_day.gif`, 'pond', [0, 4, 8, 12, 15]);
    const g2 = await dockPov.renderFishingGif({ biome: 'isle', lvl: 2, band: 'low', drops: { raw_fish: 1 }, phase: 'night' });
    fs.writeFileSync(`${outDir}/pond_gif_low_night.gif`, g2.buffer);
    await dumpGif(`${outDir}/pond_gif_low_night.gif`, 'pondnight', [2, 15]);
    // 4) hunt GIFs + stills
    const h1 = await huntPov.renderHuntGif({ biome: 'isle', lvl: 2, band: 'epic', drops: { stag_antler: 1, venison: 2 }, phase: 'day', banner: { head: 'The hunt returns', lines: ['1× Stag Antler — EPIC · sells 2,000Z', '2× Venison Haunch — UNCOMMON · sells 160Z', '+2,320 ZENI'] } });
    fs.writeFileSync(`${outDir}/hunt_gif_epic_day.gif`, h1.buffer);
    await dumpGif(`${outDir}/hunt_gif_epic_day.gif`, 'hunt', [4, 15]);
    const h2 = await huntPov.renderHuntGif({ biome: 'isle', lvl: 1, band: 'low', drops: { rabbit_pelt: 2 }, phase: 'night' });
    fs.writeFileSync(`${outDir}/hunt_gif_low_night.gif`, h2.buffer);
    await dumpGif(`${outDir}/hunt_gif_low_night.gif`, 'huntnight', [15]);
    for (const [ph, nm] of [['day', 'day'], ['night', 'night']]) {
        const hv = createCanvas(960, 720), hv2 = hv.getContext('2d');
        await huntPov.paintStill(hv2, 960, 720, { biome: 'isle', lvl: 3, phase: ph });
        fs.writeFileSync(`${outDir}/hunt_still_${nm}.png`, hv.toBuffer('image/png'));
    }
    // 5) biome herd sanity (volcanic + tundra stills)
    for (const b of ['volcanic', 'tundra']) {
        const hv = createCanvas(480, 360), hv2 = hv.getContext('2d');
        await huntPov.paintStill(hv2, 480, 360, { biome: b, lvl: 2, phase: 'day' });
        fs.writeFileSync(`${outDir}/hunt_biome_${b}.png`, hv.toBuffer('image/png'));
    }
    // 6) REGRESSION: structure card + 3D base + atlas day/night (banner refactor must not change cards)
    const ss = require('../core/rpg/structureScenes');
    const r = await ss.renderStructureCard({ type: 'mines', level: 2, biome: 'isle', phase: 'day', spec: { title: 'THE MINES', subtitle: 'Lv 2 · pickaxe ready', banner: { head: 'MINING RESULT', lines: ['2× Copper Ore — COMMON · sells 12Z', '+64 ZENI'] } } });
    fs.writeFileSync(`${outDir}/card_mines_result.jpg`, r.buffer);
    console.log('phase sanity:', ['0', '6', '12', '18', '23'].map(h => `${h}h=${dayNight.phaseAt(new Date(Date.UTC(2026, 9, 21, Number(h))))}`).join(' '));
    console.log('WROTE', fs.readdirSync(outDir).length, 'files to', outDir);
})().catch((e) => { console.error('RENDER QA FAILED:', e); process.exit(1); });
