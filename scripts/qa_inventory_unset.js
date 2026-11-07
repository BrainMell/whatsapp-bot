'use strict';
// Regression for the inventory duplication exploit: deleting a whole object stack must $unset the stack, not leave it in Mongo.
const e = require('../core/rpg/systems/economy/economy');
const cases = [
  ['object stack removed', { inventory: { sword: { quantity: 1 } } }, { inventory: { potion: { quantity: 3, name: 'x' }, sword: { quantity: 1 } } }, { 'inventory.potion': '' }],
  ['scalar stack removed', { inventory: { sword: 2 } }, { inventory: { potion: 3, sword: 2 } }, { 'inventory.potion': '' }],
  ['nested subtree removed', { a: { b: { c: 1 } } }, { a: { b: { c: 1 }, e: { f: 1 } } }, { 'a.e': '' }],
  ['quantity change only', { inventory: { sword: { quantity: 1 } } }, { inventory: { sword: { quantity: 2 } } }, {}],
];
let bad = 0;
for (const [name, ours, base, want] of cases) {
  const got = e.leafDiff(ours, base).unsetSet;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log('FAIL', name, JSON.stringify(got), 'want', JSON.stringify(want)); }
}
console.log(bad ? 'inventory unset QA: FAIL' : 'inventory unset QA: PASS'); process.exit(bad ? 1 : 0);
