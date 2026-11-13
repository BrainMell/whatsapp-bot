'use strict';
// node core/rpg/systems/guildwar/conquest/selftest.js  — quick invariants for the conquest layer
process.env.GW_CONQUEST = '1'; const assert = require('assert');
const E = require('./engine'), B = require('./breach'), M = require('./mapgen'), G = require('./gems');
const g = M.generate(1); assert.strictEqual(g.tiles.size, 1500); assert.deepStrictEqual([...M.generate(1).tiles.keys()].slice(0, 5), [...g.tiles.keys()].slice(0, 5));
const s = E.newWar({ key: 't', seed: 3, guilds: [{ name: 'A', roles: { a: 'master' }, members: ['a', 'b'] }], now: 1e12 }); E.registerPlayer(s, 'A', 'a', 'a', 500);
assert(E.marchSolo(s, { guild: 'A', by: 'b', to: [...E.frontier(s, 'A')][0], now: 1e12 }).ok === false, 'members cannot order');
const to = [...E.frontier(s, 'A')][0]; assert(E.marchSolo(s, { guild: 'A', by: 'a', to, now: 1e12 }).ok); assert(E.locked(s, 'a'));
assert(!E.marchSolo(s, { guild: 'A', by: 'a', to, now: 1e12 }).ok, 'locked while marching');
const b = B.create({ id: 'x', tileId: to, biome: 'desert', tileName: 'T', attacker: 'A', party: [{ jid: 'a', name: 'a', power: 900 }], defence: { wall: { type: 'wood', hp: 300, max: 300 }, golems: [], turrets: [] } });
B.startRound(b); B.submit(b, 'a', 'ram', 'gate'); B.resolveRound(b); assert(b.sections.gate.hp < 120);
assert(G.rate(1).sec > G.rate(10).sec); console.log('conquest selftest ok');
