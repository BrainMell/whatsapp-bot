// Phase sweep: render the live sheets at 7 orbit phases so collisions that
// only appear at certain rotations get seen (the FW/WB/Presence interiors
// co-rotate; horizontal text does not).
'use strict';
const path = require('path');
const fs = require('fs');
const renderer = require('../core/rpg/worldMapRenderer');
const cosmology = require('../core/rpg/cosmology');

(async () => {
    const out = process.argv[2] || path.join(__dirname, 'worldmap_sweep');
    fs.mkdirSync(out, { recursive: true });
    const T0 = cosmology.T0;
    const H5 = 5 * 3600 * 1000; // one full FW orbit
    const sheets = [
        ['fw', () => renderer.renderFirstWorldSheet(t)],
        ['wb', () => renderer.renderWorldBeyondSheet(t)],
        ['po', () => renderer.renderPresenceOfOrderSheet(t)],
        ['atlas', () => renderer.renderCosmologyAtlasSheet(t)],
    ];
    for (let k = 0; k < 7; k++) {
        var t = T0 + Math.round((k / 7) * H5);
        for (const [name, fn] of sheets) {
            const buf = await fn();
            if (!buf) { console.error(`✗ ${name} @${k}: null`); continue; }
            fs.writeFileSync(path.join(out, `${name}_p${k}.png`), buf);
        }
        console.log(`✓ phase ${k} (theta ${(k / 7).toFixed(2)} of orbit) rendered`);
    }
    console.log('done');
    process.exit(0);
})();
