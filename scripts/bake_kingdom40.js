'use strict';
// bake_kingdom40.js — Task 40: guild v7 KINGDOM layout proof
// (owner msg 1561155345102151774: castle centred, kingdom paths, banner
// floating on top of the castle). Bakes 4 static cards on a forest seed.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || '/tmp/kingdom40';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const iso = require('../core/rpg/isoOutlands');
    let forestName = null;
    for (let i = 0; i < 50000 && !forestName; i++) {
        if (iso.biomeOf('Gil' + i) === 'forest') forestName = 'Gil' + i;
    }
    console.log('forest seed:', forestName);
    const guild = require('../core/rpg/guildBaseRenderer');
    const gState = (o) => ({
        name: forestName, level: o.lvl || 5, archetype: o.arch || 'ADVENTURER',
        buildings: o.b || { hall: 5, training: 3, treasury: 5 },
        memberCount: o.m ?? 5, memberCap: 25,
        emblemColor: o.col || '#a02c3c', emblemIcon: o.icon || 'V', motto: 'Steel and mead',
    });
    const shots = [
        ['card_l5', gState({})],
        ['card_merchant', gState({ arch: 'MERCHANT', col: '#b8862e', icon: 'M', b: { hall: 4, training: 2, treasury: 4 }, m: 3 })],
        ['card_starter', gState({ lvl: 1, b: { hall: 0, training: 0, treasury: 0 }, m: 0 })],
    ];
    for (const [name, st] of shots) {
        const t0 = Date.now();
        const out = await guild.renderGuildBaseImage(st, {});
        fs.writeFileSync(path.join(OUT, `${name}.jpg`), out.buffer);
        console.log(`${name}: ${(out.buffer.length / 1048576).toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    console.log('done');
    process.exit(0);
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
