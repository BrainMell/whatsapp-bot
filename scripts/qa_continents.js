'use strict';
// qa_continents.js — invariants for the realm layer:  node scripts/qa_continents.js
const C = require('../core/rpg/continents');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const names = Array.from({ length: 300 }, (_, i) => `Guild ${i} ${(i * 7919).toString(36)}`);
const seen = new Set();
for (const c of C.CONTINENTS) {
    const pts = C.polygon(c.key);
    ok(pts.every(([x, y]) => x > 0.02 && x < 0.98 && y > 0.02 && y < 0.98), `${c.key} polygon inside the chart`);
    ok(C.inside(pts, c.centre[0], c.centre[1]), `${c.key} centre is land`);
    for (const [n, ox, oy] of c.regions) ok(C.inside(pts, c.centre[0] + ox * c.rx, c.centre[1] + oy * c.ry), `${c.key} region ${n} on land`);
}
// no two realms overlap
for (const a of C.CONTINENTS) for (const b of C.CONTINENTS) if (a.key < b.key) {
    const pa = C.polygon(a.key), pb = C.polygon(b.key);
    ok(!pa.some(([x, y]) => C.inside(pb, x, y)) && !pb.some(([x, y]) => C.inside(pa, x, y)), `${a.key}/${b.key} overlap`);
}
for (const n of names) for (const c of C.CONTINENTS) {
    const a = C.markerFor(n, c.key), b = C.markerFor(n, c.key);
    ok(JSON.stringify(a) === JSON.stringify(b), 'marker deterministic');
    ok(C.inside(C.polygon(c.key), a.x, a.y), `marker on land ${n}/${c.key}`);
    seen.add(`${c.key}:${a.x},${a.y}`);
    for (const s of C.baseSites(n, { continent: c.key, members: [] }, 6)) ok(C.inside(C.polygon(c.key), s.x, s.y), `hamlet on land ${n}/${c.key}`);
}
ok(seen.size > names.length * 5 * 0.98, `markers spread (${seen.size})`);
for (const [q, k] of [['desert', 'sunscorch'], ['the frost reach', 'frostreach'], ['ember', 'emberfields'], ['wildwood', 'wildwood'], ['storm', 'stormreach'], ['lava', 'emberfields'],
    // 2026-10-18 Norse rename: new names resolve…
    ['stormheim', 'stormreach'], ['solheim', 'sunscorch'], ['rimeheim', 'frostreach'], ['skogheim', 'wildwood'], ['eldheim', 'emberfields'],
    ['rime', 'frostreach'], ['skog', 'wildwood'], ['sol', 'sunscorch'], ['eld', 'emberfields'],
    // …old surveyor names STILL resolve (stored guilds)
    ['the storm reach', 'stormreach'], ['sunscorch', 'sunscorch'], ['the ember fields', 'emberfields']]) ok((C.find(q) || {}).key === k, `find(${q})`);
for (const t of ['ADVENTURER', 'MERCHANT', 'RESEARCH']) ok(C.find(t) === null, `archetype ${t} must not parse as a realm`);
ok(C.biomeOf({ name: 'x', continent: 'wildwood' }) === 'highlands', 'continent → biome (old key)');
ok(C.biomeOf({ name: 'x', continent: 'skogheim' }) === 'highlands', 'continent → biome (new name)');
ok(C.get('THE FROST REACH') && C.get('the frost reach').key === 'frostreach', 'get() legacy name');
ok(C.get('Rimeheim').key === 'frostreach', 'get() new name');
ok(C.baseBiome({ owner: 'solo' }) === C.defaultFor('solo').biome, 'solo base default');
ok(C.baseBiome({ owner: 'a', guildName: 'G', guild: { continent: 'sunscorch' } }) === 'desert', 'member base follows guild realm');
ok(C.PLANET && C.PLANET.name === 'Aldafold', 'planet named');
console.log(fail ? `${fail} FAILED` : 'continents QA: all checks passed'); process.exit(fail ? 1 : 0);
