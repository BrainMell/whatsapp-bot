// Render all four world-map sheets to PNG files for visual QA.
// Usage: node scripts/render_world_maps.js [outdir]
const path = require('path');
const fs = require('fs');

const renderer = require('../core/rpg/worldMapRenderer');

(async () => {
    const out = process.argv[2] || path.join(__dirname, 'worldmap_qa');
    fs.mkdirSync(out, { recursive: true });

    const sheets = [
        ['atlas_all', () => renderer.renderCosmologyAtlasSheet()],
        ['first_world', () => renderer.renderFirstWorldSheet()],
        ['presence_of_order', () => renderer.renderPresenceOfOrderSheet()],
        ['world_beyond', () => renderer.renderWorldBeyondSheet()],
        ['afterlife', () => renderer.renderAfterlifeSheet()],
        ['abyss', () => renderer.renderAbyssSheet()],
    ];

    for (const [name, fn] of sheets) {
        const buf = await fn();
        if (!buf) { console.error(`✗ ${name}: render returned null`); continue; }
        const file = path.join(out, `${name}.png`);
        fs.writeFileSync(file, buf);
        console.log(`✓ ${name}: ${buf.length} bytes -> ${file}`);
    }
    console.log('done');
    process.exit(0);
})();
