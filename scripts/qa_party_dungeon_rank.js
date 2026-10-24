'use strict';
const { resolvePartyDungeonRank } = require('../core/rpg/partyDungeonRank');
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log('✅ '+label); }
  else { fail++; console.error('❌ '+label+': expected '+JSON.stringify(expected)+', got '+JSON.stringify(actual)); }
}
let r = resolvePartyDungeonRank(['S','F']);
eq(r.newRank,'E','one high + one low is one rank above the low member');
eq(r.basisRank,'F','mixed party safety basis is the lowest rank');
eq(r.mixed,true,'mixed group gets a warning');
r = resolvePartyDungeonRank(['SSS','SSS','F']);
eq(r.newRank,'E','high-rank majority cannot drag F-rank member into high content');
r = resolvePartyDungeonRank(['B','C']);
eq(r.newRank,'D','rank ties choose the lower tier, then one rank above it');
eq(r.commonRank,'C','common-rank diagnostic ties choose lower tier');
r = resolvePartyDungeonRank(['B','B','B']);
eq(r.newRank,'A','uniform groups retain one-rank-above progression');
eq(r.mixed,false,'uniform group is not marked mixed');
r = resolvePartyDungeonRank(['SSS','SSS']);
eq(r.newRank,'SSS','top normal rank remains capped at SSS');
eq(resolvePartyDungeonRank(['DRAGON','GOD']),null,'special ranks are excluded from normal ladder');
r = resolvePartyDungeonRank(['A','F'],{total:3});
eq(r.total,3,'warning can use the full roster denominator');
console.log('\n'+pass+' passed, '+fail+' failed');
if (fail) process.exitCode = 1;
