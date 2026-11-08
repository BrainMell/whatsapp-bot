// Layers cache: repeat turns / HP changes hit cache, deaths and roster changes miss, in-flight dedupe, failure not cached, retry, isolation.
const assert = require('assert');
const goService = require('../core/utils/goImageService');
let calls = 0, failNext = 0, delay = 30;
goService.generateCombatLayers = async () => { calls++; await new Promise((r) => setTimeout(r, delay)); if (failNext > 0) { failNext--; throw new Error('boom'); } return { image: Buffer.from('bg').toString('base64'), sprites: Buffer.from('sp').toString('base64'), anchors: [{ side: 'player', index: 0 }], cuts: [{ side: 'enemy', index: 0 }], w: 1024, h: 687 }; };
const gen = require('../core/rpg/systems/combat/combatImageGenerator');
const P = (hp) => [{ name: 'A', class: 'FIGHTER', level: 5, currentHP: hp, stats: { hp, maxHp: 100, energy: 50, maxEnergy: 100 } }];
const E = (hp) => [{ name: 'Orc', currentHP: hp, stats: { hp, maxHp: 80 } }];
(async () => {
  const o = { hud: 'none-clean', combatType: 'PVE' };
  const a = await gen.generateCombatLayers(P(100), E(80), o); assert(a && a.success); assert.strictEqual(calls, 1);
  await gen.generateCombatLayers(P(40), E(10), o); assert.strictEqual(calls, 1, 'HP change must hit cache');
  await gen.generateCombatLayers(P(40), E(0), o); assert.strictEqual(calls, 2, 'enemy death must miss');
  await gen.generateCombatLayers(P(40), E(0), o); assert.strictEqual(calls, 2);
  await gen.generateCombatLayers(P(40), E(80), { ...o, backgroundPath: 'x/env2.png' }); assert.strictEqual(calls, 3, 'bg change must miss');
  const [x, y] = await Promise.all([gen.generateCombatLayers(P(1), [{ name: 'Z', currentHP: 5, stats: { maxHp: 5 } }], o), gen.generateCombatLayers(P(9), [{ name: 'Z', currentHP: 3, stats: { maxHp: 5 } }], o)]);
  assert.strictEqual(calls, 4, 'in-flight dedupe'); x.cuts.length = 0; x.anchors.push({});
  const z = await gen.generateCombatLayers(P(5), [{ name: 'Z', currentHP: 2, stats: { maxHp: 5 } }], o); assert.strictEqual(z.cuts.length, 1, 'callers cannot corrupt cache'); assert.strictEqual(z.anchors.length, 1);
  failNext = 1; const r = await gen.generateCombatLayers(P(5), [{ name: 'F', currentHP: 2, stats: { maxHp: 5 } }], o); assert(r && r.success, 'single failure retried'); 
  failNext = 9; const n = await gen.generateCombatLayers(P(5), [{ name: 'G', currentHP: 2, stats: { maxHp: 5 } }], o); assert.strictEqual(n, null); failNext = 0; const c0 = calls;
  const n2 = await gen.generateCombatLayers(P(5), [{ name: 'G', currentHP: 2, stats: { maxHp: 5 } }], o); assert(n2 && calls > c0, 'failure is not cached');
  console.log('layers cache QA: PASS (go calls', calls + ')'); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
