// FX-PASS 2026-11-08 unit tests — buildAnimationAction regressions + new fx coverage
const ci = require('../core/rpg/systems/combat/combatIntegration');
const P = [{ name: 'Loki' }], E = [{ name: 'Inferno', isEnemy: true, stats: { hp: 5 } }, { name: 'Ember', isEnemy: true, stats: { hp: 9 } }];
let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const o = { _allPlayers: P, _allEnemies: E, summons: [] };

// ── pre-existing behaviour must not regress ──
let a = ci.buildAnimationAction({ actor: P[0], target: E[1], action: { name: 'Basic Attack' }, damage: 40, turnNumber: 3 }, o);
ck('hit resolves enemy 1', a && a.targetSide === 'enemy' && a.targetIndex === 1 && a.damage === 40);
a = ci.buildAnimationAction({ actor: P[0], target: E[1], missed: true, action: { name: 'Missed Attack' } }, o);
ck('miss with target', a && a.missed && a.targetSide === 'enemy' && a.targetIndex === 1);
a = ci.buildAnimationAction({ actor: P[0], target: null, action: { name: 'Missed Attack' } }, o);
ck('miss WITHOUT target still shows a dodge', a && a.missed && a.targetSide === 'enemy');
const ghost = { name: 'Ember', stats: { hp: 9 } };
a = ci.buildAnimationAction({ actor: P[0], target: ghost, action: { name: 'Basic Attack' }, damage: 7 }, o);
ck('flag-less target found on the right side', a && a.targetSide === 'enemy' && a.targetIndex === 1);

// ── FX-PASS 2026-11-08 ──
a = ci.buildAnimationAction({ actor: P[0], target: P[0], action: { name: 'Full Restore' }, healing: 320, turnNumber: 48 }, o);
ck('Full Restore heal actionable (was killed by "rest" substring)', a && Number(a.heal) === 320 && !a.missed);
a = ci.buildAnimationAction({ actor: P[0], target: null, action: { name: 'Defend' }, turnNumber: 51 }, o);
ck('Defend -> guard act on the guarder', a && a.kind === 'guard' && a.targetSide === 'player' && a.targetIndex === 0 && a.damage === 0);
a = ci.buildAnimationAction({ actor: E[0], target: null, action: { name: 'Rest' }, turnNumber: 52 }, o);
ck('plain Rest still skipped', a === null);
a = ci.buildAnimationAction({ actor: E[0], target: null, action: { name: 'Charging' }, turnNumber: 53 }, o);
ck('Charging still skipped', a === null);
a = ci.buildAnimationAction({ actor: E[0], target: P[0], action: { name: 'Flee' }, turnNumber: 54 }, o);
ck('Flee still skipped', a === null);
a = ci.buildAnimationAction({ actor: P[0], target: E[0], action: { name: 'Quick Shot' }, damage: 12, actionLog: ['Loki fires a Quick Shot — it misses Ember'], turnNumber: 52 }, o);
ck('log-text miss now sets the dodge', a && a.missed === true);
a = ci.buildAnimationAction({ actor: P[0], target: E[0], action: { name: 'Quick Shot' }, damage: 12, actionLog: ['the arrow dismisses itself'], turnNumber: 53 }, o);
ck('log word "dismiss" never counts as a miss', a && a.missed === false);
a = ci.buildAnimationAction({ actor: E[0], target: P[0], action: { name: 'Annihilation' }, damage: 900, turnNumber: 31 }, o);
ck('Annihilation tagged ult + dark element', a && a.ult === true && a.element === 'dark');
a = ci.buildAnimationAction({ actor: P[0], target: E[0], action: { name: 'Basic Attack' }, damage: 10, turnNumber: 5 }, o);
ck('basic attack not tagged ult', a && !a.ult);

process.exit(bad ? 1 : 0);
