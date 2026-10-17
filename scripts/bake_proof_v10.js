'use strict';
// bake_proof_v10.js — FOREST PATCH LAW + SHUTDOWN FIX proof (owner 2026-10-17
// v91 stack: "too many trees inside" + "the yellow circled parts look like a
// natural forest of sorts just like how sometimes some sides generate water,
// not just green trees at the edges of the fence" + ".j base shuts down???").
// Bakes base + guild across ALL 4 biomes, plus a full ANIMATED bake with
// timing (the shutdown fix: raw frames skip 13 sync PNG encodes).
const fs = require('fs');
const path = require('path');
const guild = require('../core/rpg/guildBaseRenderer');
const base = require('../core/rpg/homesteadBaseRenderer');
const outlands = require('../core/rpg/isoOutlands');

const OUT = process.env.PROOF_OUT || '/tmp/proof_v10';
fs.mkdirSync(OUT, { recursive: true });

const gState = (name) => ({
    name, level: 15, archetype: 'ADVENTURER',
    buildings: { hall: 5, training: 3, treasury: 5 },
    memberCount: 5, memberCap: 25,
    emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
});

const baseState = (owner) => ({
    owner,
    structures: [
        { uid: 'h', type: 'house', level: 1, x: 6, y: 7 },
        { uid: 'm', type: 'mines', level: 1, x: 1, y: 1 },
        { uid: 'p', type: 'pond', level: 1, x: 12, y: 1 },
        { uid: 'hu', type: 'hunting', level: 1, x: 3, y: 8 },
    ],
    freePlots: [{ x: 3, y: 12, id: 1 }, { x: 11, y: 12, id: 2 }],
});

const CANDIDATES = ['Niflheim', 'Aria', 'Stone Watch', 'Mistfall', 'Emberhold', 'Thornwick', 'Saltmere', 'Duskfen', 'Greywatch', 'Fernhollow', 'Ashvale', 'Cragmoor'];
const byBiome = {};
for (const n of CANDIDATES) {
    const b = outlands.biomeOf(n);
    if (!byBiome[b]) byBiome[b] = n;
}

const toBuf = (o) => Buffer.isBuffer(o) ? o
    : (o instanceof ArrayBuffer ? Buffer.from(o)
        : (o && o.buffer ? Buffer.from(o.buffer) : o));

(async () => {
    const t0 = Date.now();
    console.log('biome picks:', JSON.stringify(byBiome));
    // one base per biome
    for (const [b, name] of Object.entries(byBiome)) {
        const buf = toBuf(await base.renderBaseImage(baseState(name), { static: true }));
        fs.writeFileSync(path.join(OUT, `v10_base_${b}.png`), buf);
        console.log(`v10_base_${b}.png (${name})`, (buf.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    // guild: forest + coast (the two critiqued looks)
    for (const b of ['forest', 'coast']) {
        const name = byBiome[b] || 'Mistfall';
        const buf = toBuf(await guild.renderFrame(gState(name), 0, { static: true }));
        fs.writeFileSync(path.join(OUT, `v10_guild_${b}.png`), buf);
        console.log(`v10_guild_${b}.png (${name})`, (buf.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
    }
    // ANIMATED BAKE TIMING — the shutdown fix proof: a full 14-frame mp4 bake
    const tb = Date.now();
    const anim = await base.renderBaseImage(baseState('PatchTest' + Date.now()), {});  // fresh seed = cache miss
    console.log('ANIMATED base bake:', Date.now() - tb + 'ms,', anim.contentType, (anim.buffer.length / 1024).toFixed(0) + 'KB');
    const tg = Date.now();
    const ganim = await guild.renderGuildBaseImage({ ...gState('PatchGuild' + Date.now()) }, { static: false });
    console.log('ANIMATED guild bake:', Date.now() - tg + 'ms,', ganim.contentType, (ganim.buffer.length / 1024).toFixed(0) + 'KB');
    console.log('DONE ->', OUT, 'total', Date.now() - t0 + 'ms');
    process.exit(0);
})().catch((e) => { console.error('PROOF FAIL:', e); process.exit(1); });
