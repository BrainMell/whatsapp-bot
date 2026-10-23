#!/usr/bin/env node
'use strict';
// visual QA - render full-res samples of every new surface to /tmp
const fs = require('fs');
const path = require('path');
const outDir = '/tmp/qa21';
fs.mkdirSync(outDir, { recursive: true });
const { createCanvas } = require('canvas');

(async () => {
    const dockPov = require('../core/rpg/dockPov');
    const huntPov = require('../core/rpg/huntPov');
    const dayNight = require('../core/rpg/dayNight');

 // 1) pond stills at card scale (like .j base pond) across phases
    for (const phase of ['day', 'dawn', 'golden', 'dusk', 'night']) {
        const cv = createCanvas(960, 720), c2 = cv.getContext('2d');
        dockPov.paintStill(c2, 960, 720, { lvl: 2, biome: 'isle', phase });
        fs.writeFileSync(`${outDir}/pond_${phase}.png`, cv.toBuffer('image/png'));
    }
 // 2) pond GIF catch with plate (day + night)
    const g1 = await dockPov.renderFishingGif({ biome: 'isle', lvl: 1, band: 'epic', drops: { crystal_koi: 1, raw_fish: 2 }, phase: 'day' });
    fs.writeFileSync(`${outDir}/pond_gif_epic_day.gif`, g1.buffer);
    const g2 = await dockPov.renderFishingGif({ biome: 'isle', lvl: 2, band: 'mid', drops: { silver_carp: 1 }, phase: 'night' });
    fs.writeFileSync(`${outDir}/pond_gif_mid_night.gif`, g2.buffer);
 // 3) biome washes
    for (const b of ['desert', 'tundra', 'volcanic']) {
        const cv = createCanvas(480, 360), c2 = cv.getContext('2d');
        dockPov.paintStill(c2, 480, 360, { lvl: 1, biome: b, phase: 'day' });
        fs.writeFileSync(`${outDir}/pond_biome_${b}.png`, cv.toBuffer('image/png'));
    }
 // 4) hunt GIFs + stills
    const h1 = await huntPov.renderHuntGif({ biome: 'isle', lvl: 2, band: 'epic', drops: { stag_antler: 1, venison: 2 }, phase: 'day' });
    fs.writeFileSync(`${outDir}/hunt_gif_epic_day.gif`, h1.buffer);
    const h2 = await huntPov.renderHuntGif({ biome: 'isle', lvl: 1, band: 'low', drops: { rabbit_pelt: 2 }, phase: 'night' });
    fs.writeFileSync(`${outDir}/hunt_gif_low_night.gif`, h2.buffer);
    const hv = createCanvas(960, 720), hv2 = hv.getContext('2d');
    await huntPov.paintStill(hv2, 960, 720, { biome: 'isle', lvl: 3, phase: 'day' });
    fs.writeFileSync(`${outDir}/hunt_still_day.png`, hv.toBuffer('image/png'));
    const hvn = createCanvas(960, 720), hvn2 = hvn.getContext('2d');
    await huntPov.paintStill(hvn2, 960, 720, { biome: 'isle', lvl: 3, phase: 'night' });
    fs.writeFileSync(`${outDir}/hunt_still_night.png`, hvn.toBuffer('image/png'));
 // 5) structure cards day vs night (blacksmith + mines)
    const ss = require('../core/rpg/structureScenes');
    for (const [t, ph, nm] of [['blacksmith', 'day', 'bs_day'], ['blacksmith', 'night', 'bs_night'], ['mines', 'night', 'mines_night'], ['alchemy', 'dusk', 'alch_dusk'], ['pond', 'day', 'pondview_day'], ['pond', 'night', 'pondview_night'], ['hunting', 'day', 'huntview_day'], ['hunting', 'night', 'huntview_night']]) {
        const r = await ss.renderStructureCard({ type: t, level: 2, biome: 'isle', phase: ph, spec: { title: t.toUpperCase(), subtitle: 'QA' } });
        fs.writeFileSync(`${outDir}/card_${nm}.jpg`, r.buffer);
    }
    console.log('phaseAt sanity:', ['0','6','12','18','19','23'].map(h => `${h}h=${dayNight.phaseAt(new Date(Date.UTC(2026, 9, 21, Number(h))))}`));
    console.log('WROTE', fs.readdirSync(outDir).length, 'files to', outDir);

 // 6) the 3D base map day vs night (homestead renderer)
    const R = require('../core/rpg/homesteadBaseRenderer');
    const state = {
        owner: 'QA21', biome: 'isle',
        structures: [
            { type: 'house', x: 10, y: 6, level: 3 }, { type: 'blacksmith', x: 13, y: 5, level: 3 },
            { type: 'medbay', x: 12, y: 10, level: 2 }, { type: 'alchemy', x: 4, y: 5, level: 2 },
            { type: 'mines', x: 1, y: 1, level: 2 }, { type: 'pond', x: 12, y: 1, level: 3 },
            { type: 'hunting', x: 2, y: 10, level: 2 },
        ],
        freePlots: [{ id: 1, x: 2, y: 13, fw: 3, fh: 3 }],
    };
    for (const ph of ['day', 'night']) {
        const out = await R.renderBaseImage(state, { static: true, phase: ph });
        fs.writeFileSync(`${outDir}/base3d_${ph}.jpg`, out.buffer);
    }
 // 7) guild grounds day vs night
    const G = require('../core/rpg/guildBaseRenderer');
    const gs = { name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER', buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W', biome: 'highlands', continent: 'wildwood' };
    for (const ph of ['day', 'night']) {
        const out = await G.renderGuildBaseImage(gs, { static: true, phase: ph });
        fs.writeFileSync(`${outDir}/guild3d_${ph}.jpg`, out.buffer);
    }
 // 8) the world atlas day vs night
    const atlas = require('../core/rpg/worldAtlasRenderer');
    for (const ph of ['day', 'night']) {
        const buf = await atlas.renderWorldAtlas({ guilds: [{ name: 'Iron Wolves', marker: { x: 0.42, y: 0.4 }, hall: 5, members: 12, color: '#a02c3c', type: 'W', realm: 'wildwood' }], phase: ph });
        if (buf) fs.writeFileSync(`${outDir}/atlas_${ph}.jpg`, buf);
    }
    console.log('WROTE', fs.readdirSync(outDir).length, 'files (final) to', outDir);
})().catch((e) => { console.error('QA FAILED:', e); process.exit(1); });
