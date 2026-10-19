'use strict';
// bake_uniqueness.js — owner brief 2026-10-19: bases on the SAME continent must not be twins.
// Bakes 4 player bases that all live on Skogheim (same realm biome) + 3 guilds all wildwood,
// so any remaining twin-ness shows immediately. node scripts/bake_uniqueness.js [outDir]
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/tmp/uniq';
process.env.QA_MODE = process.env.QA_MODE || '1';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = require('../core/rpg/homesteadBaseRenderer');
    const g = require('../core/rpg/guildBaseRenderer');
    const L = r.LAYOUT;
    const fixed = (lv) => [
        { type: 'house', level: lv.house, x: L.house.x, y: L.house.y },
        { type: 'mines', level: lv.mines, x: L.mines.x, y: L.mines.y },
        { type: 'pond', level: lv.pond, x: L.pond.x, y: L.pond.y },
        { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
    ];
    const plots = [{ id: 1, x: 8, y: 1 }, { id: 2, x: 13, y: 7 }, { id: 3, x: 4, y: 5 }, { id: 4, x: 2, y: 13 }].map((p) => ({ ...p, fw: 3, fh: 3 }));
    // four neighbours, ONE guild (same realm/biome guaranteed via guild realm), starter-ish loadouts
    const players = [
        ['p1_ragnar', { owner: 'Ragnar', guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood', structures: fixed({ house: 1, mines: 1, pond: 1 }), freePlots: plots }],
        ['p2_astrid', { owner: 'Astrid', guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood', structures: fixed({ house: 2, mines: 1, pond: 2 }), freePlots: plots }],
        ['p3_bjorn', { owner: 'Bjorn', guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood', structures: [...fixed({ house: 3, mines: 2, pond: 1 }), { type: 'blacksmith', level: 2, x: 8, y: 1 }], freePlots: plots.slice(1) }],
        ['p4_freydis', { owner: 'Freydis', guildName: 'Iron Wolves', guild: { continent: 'wildwood' }, continent: 'wildwood', structures: [...fixed({ house: 2, mines: 3, pond: 3 }), { type: 'medbay', level: 2, x: 13, y: 7 }], freePlots: [plots[0], plots[3]] }],
    ];
    for (const [n, st] of players) {
        const t0 = Date.now();
        const o = await r.renderBaseImage(st, { static: true });
        fs.writeFileSync(path.join(OUT, n + '.jpg'), o.buffer);
        console.log(n, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    // three guilds on the same biome
    const guilds = [
        ['g1_wolves', { name: 'Iron Wolves', level: 12, archetype: 'ADVENTURER', buildings: { hall: 5, training: 5, treasury: 5 }, memberCount: 12, memberCap: 25, emblemColor: '#a02c3c', emblemIcon: 'W', biome: 'highlands', motto: 'Steel and mead' }],
        ['g2_ledger', { name: 'Gilded Ledger', level: 9, archetype: 'MERCHANT', buildings: { hall: 4, training: 3, treasury: 5 }, memberCount: 9, memberCap: 20, emblemColor: '#b8862e', emblemIcon: 'M', biome: 'highlands', motto: 'Coin over blood' }],
        ['g3_archive', { name: 'Quiet Archive', level: 7, archetype: 'RESEARCH', buildings: { hall: 3, training: 2, treasury: 4 }, memberCount: 6, memberCap: 20, emblemColor: '#2a6a6e', emblemIcon: 'R', biome: 'highlands', motto: 'Knowledge is power' }],
    ];
    for (const [n, st] of guilds) {
        const t0 = Date.now();
        const o = await g.renderGuildBaseImage(st, { hint: '' });
        fs.writeFileSync(path.join(OUT, n + '.jpg'), o.buffer);
        console.log(n, (o.buffer.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    process.exit(0);
})().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
