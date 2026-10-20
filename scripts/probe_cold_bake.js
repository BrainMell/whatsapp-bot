'use strict';
// 47-k8c probe: how long does a COLD `.j base` / `.j guild` mp4 bake take on box hw?
// Run on box2: QA_MODE=1 CODE_VER=coldprobe-<ts> node scripts/probe_cold_bake.js
// QA_MODE puts mediaCache in /tmp (prod cache untouched); unique CODE_VER = guaranteed cold.
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/coldprobe';
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const B = require('../core/rpg/homesteadBaseRenderer');
    const G = require('../core/rpg/guildBaseRenderer');
    const L = B.LAYOUT;
    const base = {
        owner: 'probeCold',
        structures: [
            { type: 'house', level: 3, x: L.house.x, y: L.house.y },
            { type: 'mines', level: 3, x: L.mines.x, y: L.mines.y },
            { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
            { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
            { type: 'blacksmith', level: 3, x: 8, y: 1 },
            { type: 'alchemy', level: 3, x: 13, y: 7 },
            { type: 'medbay', level: 3, x: 4, y: 5 },
        ],
        freePlots: [],
    };
    const guild = {
        name: 'Probe Keep', biome: 'isle', level: 7, archetype: 'ADVENTURER',
        buildings: { hall: 4, training: 3, treasury: 2 },
        memberCount: 12, memberCap: 30, emblemColor: '#3d6fb4', emblemIcon: 'wolf', motto: 'timing probe',
    };
    for (const [label, fn] of [
        ['base cold (20f + mp4)', () => B.renderBaseImage(base)],
        ['base warm (disk hit)', () => B.renderBaseImage(base)],
        ['guild cold (20f + mp4)', () => G.renderGuildBaseImage(guild)],
        ['guild warm (disk hit)', () => G.renderGuildBaseImage(guild)],
    ]) {
        const t0 = Date.now();
        const out = await fn();
        console.log(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s  ${out.buffer.length ? (out.buffer.length / 1024).toFixed(0) + 'KB' : ''}  ${out.contentType}  cached=${!!out.cached}`);
        if (!out.cached) fs.writeFileSync(`${OUT}/${label.split(' ')[0]}.out`, out.buffer);
    }
})().catch((e) => { console.error(e.stack); process.exit(1); });
