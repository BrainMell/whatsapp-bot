// Hit / miss must always resolve a target for the card painter: node scripts/qa_attack_action.js
const ci = require('../core/rpg/systems/combat/combatIntegration');
const P = [{ name: 'Loki' }], E = [{ name: 'Inferno', isEnemy: true, stats: { hp: 5 } }, { name: 'Ember', isEnemy: true, stats: { hp: 9 } }];
let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const o = { _allPlayers: P, _allEnemies: E, summons: [] };
let a = ci.buildAnimationAction({ actor: P[0], target: E[1], action: { name: 'Basic Attack' }, damage: 40, turnNumber: 3 }, o);
ck('hit resolves enemy 1', a && a.targetSide === 'enemy' && a.targetIndex === 1 && a.damage === 40);
a = ci.buildAnimationAction({ actor: P[0], target: E[1], missed: true, action: { name: 'Missed Attack' } }, o);
ck('miss with target', a && a.missed && a.targetSide === 'enemy' && a.targetIndex === 1);
a = ci.buildAnimationAction({ actor: P[0], target: null, action: { name: 'Missed Attack' } }, o);
ck('miss WITHOUT target still shows a dodge', a && a.missed && a.targetSide === 'enemy');
const ghost = { name: 'Ember', stats: { hp: 9 } };   // flag-less target object (old failure: searched on the wrong side)
a = ci.buildAnimationAction({ actor: P[0], target: ghost, action: { name: 'Basic Attack' }, damage: 7 }, o);
ck('flag-less target found on the right side', a && a.targetSide === 'enemy' && a.targetIndex === 1);
process.exit(bad ? 1 : 0);
