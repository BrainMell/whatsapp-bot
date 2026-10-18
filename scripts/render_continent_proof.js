// Render the continent atlas (plain + guild overlay) to PNG for visual QA.
// Usage: node scripts/render_continent_proof.js [outdir]
const fs = require('fs');
const path = require('path');

const cmr = require('../core/rpg/continentMapRenderer');

(async () => {
    const out = process.argv[2] || path.join(__dirname, 'continent_qa');
    fs.mkdirSync(out, { recursive: true });

    let t = Date.now();
    const plain = await cmr.renderContinentMap({});
    fs.writeFileSync(path.join(out, 'atlas_plain.png'), plain);
    console.log(`plain: ${plain.length} bytes in ${Date.now() - t} ms`);

    t = Date.now();
    const guild = await cmr.renderContinentMap({ guildName: 'Iron Wolves', guild: { continent: 'emberfields', members: [{}, {}, {}, {}, {}] } });
    fs.writeFileSync(path.join(out, 'atlas_guild.png'), guild);
    console.log(`guild: ${guild.length} bytes in ${Date.now() - t} ms`);
    process.exit(0);
})().catch((e) => { console.error('proof failed:', e.message); process.exit(1); });
