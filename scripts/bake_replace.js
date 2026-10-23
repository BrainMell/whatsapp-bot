'use strict';
// bake_replace.js - "the old one should move into the ground as the new
// one comes in if there is an existing building" + "the entrance for the player base is
// wierd and turned the wrong way". Bakes:
// - REPLACE mp4s: UPGRADE celebrates that pass prev - the replaced building's main sprite
// sinks into the ground (clipped at its base line) while the new one falls in
// - FRESH-build mp4 (regression: prev 0 - plot now keeps its dirt pad during the fall)
// - GATE cards: static bases across owner seeds - the stone gatehouse must span its
// palisade gap with the passage on the road (sprite yaw = minus the edge tangent)
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/tmp/replace';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const L = r.LAYOUT;
    const plots = [{ id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }].map((p) => ({ ...p, fw: 3, fh: 3 }));
    const mkState = (owner) => ({ owner, guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood',
        structures: [
            { type: 'house', level: 3, x: L.house.x, y: L.house.y },
            { type: 'mines', level: 2, x: L.mines.x, y: L.mines.y },
            { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
            { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
            { type: 'blacksmith', level: 2, x: 8, y: 1 },
        ], freePlots: plots });
    let t0 = Date.now();
 // 1) fresh build (prev 0 - regression of the approved 47-e look, plot keeps its dirt pad)
    let o = await r.renderBaseImage(mkState('Landing Test'), { static: false, celebrate: { type: 'house', x: L.house.x, y: L.house.y, level: 3, prev: 0 }, hint: 'The Manor rises!' });
    fs.writeFileSync(path.join(OUT, 'fresh_house.mp4'), o.buffer);
    console.log('fresh_house', (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
 // 2) house L2 -> L3: the old manor sinks while the bigger one drops in
    t0 = Date.now();
    o = await r.renderBaseImage(mkState('Landing Test'), { static: false, celebrate: { type: 'house', x: L.house.x, y: L.house.y, level: 3, prev: 2 }, hint: 'The Manor is now a Keep!' });
    fs.writeFileSync(path.join(OUT, 'replace_house.mp4'), o.buffer);
    console.log('replace_house', (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
 // 3) mines L1 -> L2: cave mouth sinks, timber mine falls (dedicated models, clearest read)
    t0 = Date.now();
    o = await r.renderBaseImage(mkState('Landing Test'), { static: false, celebrate: { type: 'mines', x: L.mines.x, y: L.mines.y, level: 2, prev: 1 }, hint: 'The Timber Mine rises!' });
    fs.writeFileSync(path.join(OUT, 'replace_mines.mp4'), o.buffer);
    console.log('replace_mines', (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
 // 4) guild hall L3 -> L4: barracks sinks, castle falls (top view)
    t0 = Date.now();
    const gstate = { name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER', buildings: { hall: 4, training: 4, treasury: 5 }, memberCount: 12, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W', biome: 'highlands', motto: 'Steel and mead' };
    const o2 = await g.renderGuildBaseImage(gstate, { static: false, celebrate: { building: 'hall', prev: 3 }, hint: 'HALL rises!' });
    fs.writeFileSync(path.join(OUT, 'guild_replace.mp4'), o2.buffer);
    console.log('guild_replace', (o2.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
 // 5) gate cards: the entrance must sit IN its palisade gap, passage on the street
    const { createCanvas, loadImage } = require('canvas');
    for (const owner of ['Aegir', 'Bjorn', 'Freydis', 'Ragnar']) {
        t0 = Date.now();
        const st = mkState(owner);
        const card = await r.renderBaseImage(st, { static: true });
        fs.writeFileSync(path.join(OUT, `gate_${owner}.png`), card.buffer);
        const img = await loadImage(card.buffer);                       // zoom: bottom band where the palisade gate sits
        const cv = createCanvas(img.width, Math.round(img.height * 0.45));
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, Math.round(img.height * 0.55), img.width, cv.height, 0, 0, img.width, cv.height);
        fs.writeFileSync(path.join(OUT, `gate_${owner}_zoom.png`), cv.toBuffer('image/png'));
        console.log('gate_' + owner, (card.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
