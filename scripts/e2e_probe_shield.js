#!/usr/bin/env node
/* Probe: why did one ability-shield sample take 1 damage? Dump outliers. */
try { require('dotenv').config(); } catch (e) {}
require('../db')();
const ga = require('../core/rpg/guildAdventure');
const mkAttacker = () => ({ jid: 'e2e-enemy', isEnemy: true, name: 'E2E Brute', stats: { atk: 50, def: 10, mag: 0, spd: 10, luck: 0, hp: 9000, maxHp: 9000 }, statusEffects: [], equipment: {} });
const mkTarget = (shields) => ({ jid: '19998887761@s.whatsapp.net', isEnemy: false, name: 'E2E Hero', id: 'hero', stats: { atk: 10, def: 5, mag: 0, spd: 10, luck: 0, hp: 5000, maxHp: 5000, dmgReduction: 0, evasion: 0 }, statusEffects: shields, equipment: {} });
setTimeout(() => {
  const nz = [];
  let raws = [];
  for (let i = 0; i < 200; i++) {
    const sh = [{ type: 'shield', name: 'Ability', duration: 2, value: 999999, source: 'skill', icon: 'x' }];
    const r = ga.calculateDamage(mkAttacker(), mkTarget(sh), 500, 'physical', 'PHYSICAL', null, false);
    if (r.damage !== 0) nz.push(r);
    const rr = ga.calculateDamage(mkAttacker(), mkTarget(null), 500, 'physical', 'PHYSICAL', null, false);
    raws.push(rr.damage);
  }
  raws.sort((a, b) => a - b);
  console.log(`raw: min=${raws[0]} max=${raws[raws.length - 1]} median=${raws[100]}`);
  console.log(`ability-shield non-zero hits: ${nz.length} / 200`);
  nz.slice(0, 10).forEach(r => console.log('  nonzero:', JSON.stringify(r)));
  process.exit(0);
}, 3000);
