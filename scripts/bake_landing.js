'use strict';
// bake_landing.js - "the building should fall in and when it touches
// down it should be a confetti explosion from that source". Bakes landing-celebrate mp4s:
// player house Lv3 falls onto its plot + guild hall (castle) falls onto the citadel.
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/tmp/land';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const L = r.LAYOUT;
    const structures = [
        { type: 'house', level: 3, x: L.house.x, y: L.house.y },
        { type: 'mines', level: 2, x: L.mines.x, y: L.mines.y },
        { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
        { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
        { type: 'blacksmith', level: 2, x: 8, y: 1 },
    ];
    const plots = [{ id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }].map((p) => ({ ...p, fw: 3, fh: 3 }));
    const state = { owner: 'Landing Test', guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood', structures, freePlots: plots };
    let t0 = Date.now();
    const o = await r.renderBaseImage(state, { static: false, celebrate: { type: 'house', x: L.house.x, y: L.house.y, level: 3 }, hint: 'The Manor rises!' });
    fs.writeFileSync(path.join(OUT, 'base_land.mp4'), o.buffer);
    console.log('base_land', (o.buffer.length / 1024).toFixed(0) + 'KB', o.contentType, Date.now() - t0 + 'ms');
    t0 = Date.now();
    const gstate = { name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER', buildings: { hall: 5, training: 4, treasury: 5 }, memberCount: 12, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W', biome: 'highlands', motto: 'Steel and mead' };
    const o2 = await g.renderGuildBaseImage(gstate, { static: false, celebrate: { building: 'hall' }, hint: 'HALL rises!' });
    fs.writeFileSync(path.join(OUT, 'guild_land.mp4'), o2.buffer);
    console.log('guild_land', (o2.buffer.length / 1024).toFixed(0) + 'KB', o2.contentType, Date.now() - t0 + 'ms');
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
