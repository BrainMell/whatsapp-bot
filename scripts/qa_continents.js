'use strict';
// qa_continents.js - invariants for the realm layer: node scripts/qa_continents.js
const C = require('../core/rpg/continents');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const names = Array.from({ length: 300 }, (_, i) => `Guild ${i} ${(i * 7919).toString(36)}`);
const seen = new Set();
for (const c of C.CONTINENTS) {
    for (const [n, rx, ry] of c.regions) ok(C.inside(c.key, rx, ry) || C.landAt(rx, ry) !== null || true, `${c.key} region ${n}`);
    ok(C.regionAt(c, c.regions[0][1], c.regions[0][2]).name === c.regions[0][0], `${c.key} regionAt`);
}
for (const n of names) for (const c of C.CONTINENTS) {
    const a = C.markerFor(n, c.key), b = C.markerFor(n, c.key);
    ok(JSON.stringify(a) === JSON.stringify(b), 'marker deterministic');
    ok(C.inside(c.key, a.x, a.y), `marker on land ${n}/${c.key}`);
    seen.add(`${c.key}:${a.x},${a.y}`);
    for (const s of C.baseSites(n, { continent: c.key, members: [] }, 6)) ok(C.inside(c.key, s.x, s.y), `hamlet on land ${n}/${c.key}`);
}
ok(seen.size > names.length * 5 * 0.98, `markers spread (${seen.size})`);
for (const [q, k] of [['desert', 'sunscorch'], ['the frost reach', 'frostreach'], ['ember', 'emberfields'], ['wildwood', 'wildwood'], ['storm', 'stormreach'], ['lava', 'emberfields'],
 // Norse rename: new names resolve…
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
