// QA: passive card engine + ownership. node scripts/qa_passive_cards.js
const pc = require('../core/rpg/systems/passiveCards'); const E = pc.engine; const { PASSIVE_CATALOG } = pc;
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x ? ' | ' + x : '')); if (!c) fails++; };
const mk = (loadout, o = {}) => ({ jid: 'p1', name: 'P', passiveLoadout: loadout, isDead: false, stats: Object.assign({ hp: 100, maxHp: 100, energy: 20, maxEnergy: 100 }, o.stats), statusEffects: [] });
const en = (hp = 100) => ({ name: 'Orc', isEnemy: true, spriteIndex: 0, stats: { hp, maxHp: 100 } });
const S = () => ({ roundLog: [] });
E.setLoadoutResolver((p) => p.passiveLoadout || []);
// catalog sanity
ok('20 cards, all have family+trigger+desc', Object.keys(PASSIVE_CATALOG).length === 20 && Object.values(PASSIVE_CATALOG).every((c) => c.family && c.trigger && c.desc && c.v));
// mirror guard: arms on turn 4, deflects next hit once
{ const s = S(), p = mk(['mirror_guard']), e = en(); for (let i = 0; i < 4; i++) E.onTurnStart(s, p); const r = { damage: 30, isCrit: false, wasEvaded: false }; E.onIncoming(s, e, p, r);
  const r2 = { damage: 30 }; E.onIncoming(s, e, p, r2); ok('Mirror Guard deflects exactly one hit after 4 turns', r.damage === 0 && r.deflected && r2.damage === 30); }
// phoenix
{ const s = S(), p = mk(['phoenix_feather']); p.stats.hp = 20; const r = { damage: 500 }; E.onIncoming(s, en(), p, r); ok('Phoenix Feather leaves 10% HP', 20 - r.damage === 10, 'hp left ' + (20 - r.damage));
  const r2 = { damage: 500 }; E.onIncoming(s, en(), p, r2); ok('Phoenix only once per battle', r2.damage === 500); }
// frost barrier
{ const s = S(), p = mk(['frost_barrier']); for (let i = 0; i < 3; i++) E.onTurnStart(s, p); const sh = p.statusEffects.find((x) => x.type === 'shield'); ok('Frost Barrier shield = 10% maxHP on turn 3', !!sh && sh.value === 10); }
// last stand
{ const s = S(), p = mk(['last_stand']); p.stats.hp = 25; const r = { damage: 40 }; E.onIncoming(s, en(), p, r); ok('Last Stand -25% below 30% HP', r.damage === 30); const q = mk(['last_stand']); const r2 = { damage: 40 }; E.onIncoming(S(), en(), q, r2); ok('Last Stand inactive at full HP', r2.damage === 40); }
// iron will
{ const s = S(), p = mk(['iron_will']); p.statusEffects.push({ type: 'burn', duration: 3, value: 5 }, { type: 'shield', duration: 3, value: 5 }); E.onTurnStart(s, p); E.onTurnStart(s, p);
  ok('Iron Will shaves a debuff once, never buffs', p.statusEffects[0].duration === 2 && p.statusEffects[1].duration === 3); }
// thorn
{ const s = S(), p = mk(['thorn_mantle']), e = en(50); const r = { damage: 40 }; E.onIncoming(s, e, p, r); ok('Thorn Mantle reflects 15%', e.stats.hp === 44); const e2 = en(2); E.onIncoming(S(), e2, mk(['thorn_mantle']), { damage: 400 }); ok('Thorn never kills (leaves 1 HP)', e2.stats.hp === 1); }
// emergency draught
{ const s = S(), p = mk(['emergency_draught']); p.stats.hp = 50; const r = { damage: 30 }; const o = E.onIncoming(s, en(), p, r); ok('Emergency Draught heals 15% first, once', p.stats.hp === 65 && o.length === 1 && (() => { const x = { damage: 30 }; return E.onIncoming(s, en(), p, x).length === 0; })()); }
// blood debt: basic stores, ability releases
{ const s = S(), p = mk(['blood_debt']); const a = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), a, { isAbility: false }); const b = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), b, { isAbility: true }); ok('Blood Debt: basic stores 35, next ability +35', a.damage === 100 && b.damage === 135, String(b.damage)); }
// static charge every 3rd
{ const s = S(), p = mk(['static_charge']); const d = []; for (let i = 0; i < 3; i++) { const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), r, {}); d.push(r.damage); } ok('Static Charge discharges on 3rd hit (+30)', d.join() === '100,100,130', d.join()); }
// predator
{ const s = S(), p = mk(['predators_instinct']); const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(20), r, {}); const r2 = { damage: 100, wasEvaded: false }; E.onOutgoing(S(), mk(['predators_instinct']), en(80), r2, {}); ok('Predator +30% below 25% only', r.damage === 130 && r2.damage === 100); }
// combo master
{ const s = S(), p = mk(['combo_master']); const d = []; for (let i = 0; i < 4; i++) { const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), r, {}); d.push(r.damage); } E.onOutgoing(s, p, en(), { damage: 0, wasEvaded: true }, {}); const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), r, {});
  ok('Combo Master ramps 100,106,112,118 then a miss resets', d.join() === '100,106,112,118' && r.damage === 100, d.join() + ' / ' + r.damage); }
// berserker oath trade-off
{ const s = S(), p = mk(["berserkers_oath"]); const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), r, {}); const q = { damage: 100 }; E.onIncoming(s, en(), p, q); ok("Berserker's Oath +20% dealt / +10% taken", r.damage === 120 && q.damage === 110); }
// vampiric, grave robber, hunters mark
{ const p = mk(['vampiric_charm']); p.stats.hp = 50; E.onOutgoing(S(), p, en(), { damage: 100, wasEvaded: false }, {}); ok('Vampiric Charm heals 6%', p.stats.hp === 56);
  const g = mk(['grave_robber']); g.stats.hp = 50; E.onOutgoing(S(), g, en(), { damage: 100, wasEvaded: false, isCrit: true }, {}); ok('Grave Robber +5% maxHP on crit', g.stats.hp === 55);
  const s = S(), h = mk(['hunters_mark']), e = en(); const a = { damage: 100, wasEvaded: false }, b = { damage: 100, wasEvaded: false }; E.onOutgoing(s, h, e, a, {}); E.onOutgoing(s, h, e, b, {}); ok("Hunter's Mark: first hit marks, later +12%", a.damage === 100 && b.damage === 112); }
// tactical: second wind, overcharge, focus loop, battle hymn, lucky charm
{ const p = mk(['second_wind']); E.onKill(S(), p, en()); ok('Second Wind +12 energy on kill', p.stats.energy === 32);
  const o = mk(['overcharge']); const s = S(); E.onOutgoing(s, o, en(), { damage: 50, wasEvaded: false }, { isAbility: true }); E.onOutgoing(s, o, en(), { damage: 50, wasEvaded: false }, { isAbility: true }); ok('Overcharge refunds only the first ability', o.stats.energy === 35);
  const f = mk(['focus_loop']); E.onOutgoing(S(), f, en(), { damage: 0, wasEvaded: true }, {}); ok('Focus Loop +10 energy on miss', f.stats.energy === 30);
  const h = mk(['battle_hymn']); h.stats.hp = 50; const s2 = S(); for (let i = 0; i < 5; i++) E.onTurnStart(s2, h); ok('Battle Hymn on turn 5: +8 energy +4% HP', h.stats.energy === 28 && h.stats.hp === 54);
  const l = mk(['lucky_charm']); const s3 = S(); for (let i = 0; i < 4; i++) E.onTurnStart(s3, l); const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s3, l, en(), r, {}); const r2 = { damage: 100, wasEvaded: false }; E.onOutgoing(s3, l, en(), r2, {}); ok('Lucky Charm: next attack after turn 4 is +50%, once', r.damage === 150 && r2.damage === 100); }
// synergies
{ const p = mk(['mirror_guard', 'static_charge']); const s = S(); for (let i = 0; i < 4; i++) E.onTurnStart(s, p); E.onIncoming(s, en(), p, { damage: 10 }); const r = { damage: 100, wasEvaded: false }; E.onOutgoing(s, p, en(), r, {}); ok('Synergy Mirror Guard+Static Charge: deflect charges next hit', r.damage === 130);
  const q = mk(['blood_debt', 'predators_instinct']); const s2 = S(); E.onOutgoing(s2, q, en(), { damage: 100, wasEvaded: false }, { isAbility: false }); const b = { damage: 100, wasEvaded: false }; E.onOutgoing(s2, q, en(20), b, { isAbility: true }); ok('Synergy Blood Debt+Predator: released debt x1.5 vs weak', b.damage === Math.floor(100 * 1.3) + Math.floor(35 * 1.5), String(b.damage)); }
// fx queue + silent
{ const s = S(), p = mk(["berserkers_oath", 'thorn_mantle']); E.onIncoming(s, en(50), p, { damage: 40 }); const fx = E.drainFx(s); ok('fx queue has thorn event only (oath is silent), drains to empty', fx.length === 1 && fx[0].cardId === 'thorn_mantle' && E.drainFx(s).length === 0); }
// ownership system
{ const users = { a: { level: 10, adventurerRank: 'F' } }; const eco = { getUser: (j) => users[j] || null, scheduleSave() {} }; const sys = pc.createPassiveCardSystem(eco);
  for (const id of ['mirror_guard', 'static_charge', 'thorn_mantle']) sys.grant('a', id, 'mod');
  ok('grant rejects duplicates', !sys.grant('a', 'mirror guard', 'mod').success);
  ok('rank F = 2 slots', sys.equip('a', 'mirror_guard').success && sys.equip('a', 'static').success && !sys.equip('a', 'thorn').success);
  users.a.adventurerRank = 'D'; ok('3rd slot at rank D', sys.equip('a', 'thorn').success && sys.getLoadout('a').length === 3);
  users.a.adventurerRank = 'S'; ['last_stand', 'iron_will', 'frost_barrier'].forEach((c) => sys.grant('a', c)); ['blood_debt', 'last_stand'].forEach((c) => sys.grant('a', c)); sys.equip('a', 'last_stand'); sys.equip('a', 'iron_will'); ok('rank S = 5 slots, 6th refused', sys.getLoadout('a').length === 5 && !sys.equip('a', 'frost_barrier').success && sys.slotsFor('a') === 5);
  users.a.adventurerRank = 'D'; ok('rank drop trims loadout to 3', sys.getLoadout('a').length === 3);
  users.a.adventurerRank = 'S'; sys.unequip('a', 'last_stand'); sys.unequip('a', 'iron_will'); users.a.adventurerRank = 'D';
  ok('no equip changes in combat', !sys.equip('a', 'thorn', { inCombat: true }).success && !sys.unequip('a', '1', { inCombat: true }).success);
  ok('unequip by slot + synergy text', sys.unequip('a', '3').success && sys.activeSynergies('a').length === 1);
  ok('revoke removes from loadout too', sys.revoke('a', 'mirror_guard').success && !sys.getLoadout('a').includes('mirror_guard')); }
console.log(fails ? 'FAILURES ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
