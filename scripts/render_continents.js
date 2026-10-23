'use strict';
// node scripts/render_continents.js [outDir] - atlas + sample guild pins
const fs = require('fs'); const out = process.argv[2] || '/tmp/continents'; fs.mkdirSync(out, { recursive: true });
const R = require('../core/rpg/continentMapRenderer'); const C = require('../core/rpg/continents');
(async () => {
    fs.writeFileSync(out + '/atlas.jpg', await R.renderContinentMap());
    for (const [i, c] of C.CONTINENTS.entries()) {
        const t = Date.now();
        const b = await R.renderContinentMap({ guildName: ['Iron Wolves', 'Gilded Ledger', 'Quiet Archive', 'Ash Covenant', 'Tide Wardens'][i], guild: { continent: c.key, emblem: { color: ['#a02c3c', '#2f6fb0', '#3b8f57', '#8a4fb0', '#d08a1e'][i], icon: '' }, members: new Array(6 + i).fill(0) } });
        fs.writeFileSync(`${out}/pin_${c.key}.jpg`, b); console.log(c.key, (b.length / 1024 | 0) + 'KB', Date.now() - t + 'ms');
    }
})();
