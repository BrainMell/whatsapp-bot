'use strict';
// proof: node scripts/render_atlas.js [outDir] [nGuilds] → world atlas with demo guilds on all five realms
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/atlas', N = parseInt(process.argv[3] || '14', 10);
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const { renderWorldAtlas } = require('../core/rpg/worldAtlasRenderer');
    const C = require('../core/rpg/continents');
    const names = ['Iron Wolves', 'Dune Walkers', 'Frost Kin', 'Ember Court', 'Gull Watch', 'Amber Oaks', 'The Last Lantern', 'Slag Smiths', 'Salt Marchers', 'Bone Road Riders', 'Whitefast Wardens', 'Millrace Union', 'Cinder Pact', 'Mirage Guild', 'Thunderhead', 'Hundred Oaks'];
    const icons = ['W', '🐺', '❄', '🔥', '⚓', '🍂', '🕯', '⚒', '🌊', '💀', '🛡', '🌾', '🌋', '☀', '⚡', '🌳'];
    const colors = ['#a02c3c', '#d9a441', '#3a78c4', '#e0561e', '#2a8f8a', '#b8651e', '#8b5aa8', '#5a5a66'];
    const guilds = [];
    for (let i = 0; i < N; i++) {
        const c = C.CONTINENTS[i % 5];
        guilds.push({ name: names[i], continent: c.key, type: ['ADVENTURER', 'MERCHANT', 'RESEARCH'][i % 3], emblem: { icon: icons[i], color: colors[i % colors.length] },
            members: [{ joinedAt: new Date(Date.now() - (N - i) * 86400000).toISOString() }].concat(new Array(1 + (i * 3) % 14).fill('x')), buildings: { hall: { level: 1 + (i * 2) % 5 } } });
    }
    const t0 = Date.now();
    const buf = await renderWorldAtlas({ guilds, highlight: names[0] });
    console.log('atlas', buf ? (buf.length / 1024).toFixed(0) + 'KB' : 'NULL', (Date.now() - t0) + 'ms');
    if (buf) fs.writeFileSync(OUT + '/atlas.jpg', buf);
    const t1 = Date.now(); await renderWorldAtlas({ guilds, highlight: names[0] }); console.log('memo hit', Date.now() - t1, 'ms');
    const empty = await renderWorldAtlas({ guilds: [] }); if (empty) fs.writeFileSync(OUT + '/atlas_empty.jpg', empty);
})().catch((e) => { console.error(e.stack); process.exit(1); });
