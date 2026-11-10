// QA: the REAL guildAdventure.calculateDamage wrapper fires passive cards (player->enemy and enemy->player), respects PASSIVE_CARDS=0.
const ga = require('../core/rpg/systems/adventures/guildAdventure'); const { calculateDamage, gameStates, scopedKey } = ga._passiveTest; const E = require('../core/rpg/systems/passiveCards').engine;
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x ? ' | ' + x : '')); if (!c) fails++; };
E.setLoadoutResolver((p) => p.passiveLoadout || []);
const mkP = (lo) => ({ jid: 'u1', name: 'Hero', passiveLoadout: lo, level: 20, stats: { hp: 100, maxHp: 100, atk: 50, def: 10, energy: 50, maxEnergy: 100, crit: 0, evasion: 0 }, statusEffects: [], buffs: [], equipment: {}, class: { id: 'FIGHTER' } });
const mkE = () => ({ id: 'GOBLIN', name: 'Goblin', isEnemy: true, spriteIndex: 0, stats: { hp: 400, maxHp: 400, atk: 30, def: 5, evasion: 0, crit: 0 }, statusEffects: [], buffs: [] });
const key = 'qa-chat'; const st = { chatId: key, players: [], enemies: [], roundLog: [], inCombat: true }; gameStates.set(scopedKey(key), st);
let rolled = 0;
for (let i = 0; i < 40; i++) { const p = mkP(['berserkers_oath']), e = mkE(); st.passiveCards = {}; const r = calculateDamage(p, e, 100, 'physical', 'PHYSICAL', key, false); if (!r.wasEvaded) { rolled++; } }
// berserker's oath should make damage > no-card baseline on average
const avg = (lo, side) => { let tot = 0, n = 0; for (let i = 0; i < 300; i++) { st.passiveCards = {}; const p = mkP(lo), e = mkE(); const r = side === 'out' ? calculateDamage(p, e, 100, 'physical', 'PHYSICAL', key, false) : calculateDamage(e, p, 100, 'physical', 'PHYSICAL', key, false); if (!r.wasEvaded) { tot += r.damage; n++; } } return tot / n; };
const base = avg([], 'out'), oath = avg(['berserkers_oath'], 'out');
ok("wrapper: Berserker's Oath raises player damage ~+20%", oath / base > 1.12 && oath / base < 1.30, (oath / base).toFixed(3));
const inBase = avg([], 'in'), inOath = avg(['berserkers_oath'], 'in'); ok("wrapper: Oath raises damage TAKEN ~+10%", inOath / inBase > 1.05 && inOath / inBase < 1.17, (inOath / inBase).toFixed(3));
// mirror guard deflect through the real function
{ st.passiveCards = {}; const p = mkP(['mirror_guard']), e = mkE(); for (let i = 0; i < 4; i++) E.onTurnStart(st, p); let r; for (let i = 0; i < 20; i++) { r = calculateDamage(e, p, 100, 'physical', 'PHYSICAL', key, false); if (r.deflected) break; st.passiveCards['u1'].armed = true; } ok('wrapper: Mirror Guard deflect zeroes real enemy hit', r && r.deflected === true && r.damage === 0); }
// phoenix through real function
{ st.passiveCards = {}; const p = mkP(['phoenix_feather']); p.stats.hp = 15; let r; for (let i = 0; i < 30; i++) { r = calculateDamage({ ...mkE(), stats: { hp: 99, maxHp: 99, atk: 999, def: 0, evasion: 0, crit: 0 } }, p, 999, 'physical', 'PHYSICAL', key, false); if (!r.wasEvaded) break; } ok('wrapper: Phoenix Feather saves from a lethal real hit', !r.wasEvaded && 15 - r.damage >= 1, String(r.damage)); }
// kill switch
process.env.PASSIVE_CARDS = '0'; { const b = avg(['berserkers_oath'], 'out'); ok('PASSIVE_CARDS=0 disables hooks', Math.abs(b / base - 1) < 0.08, (b / base).toFixed(3)); } delete process.env.PASSIVE_CARDS;
// summons / no state never crash
ok('no state / no chatId never throws', (() => { try { calculateDamage(mkP(['mirror_guard']), mkE(), 50, 'physical', 'PHYSICAL', null, false); calculateDamage(mkP([]), mkE(), 50, 'physical', 'PHYSICAL', 'missing-chat', false); return true; } catch (e) { return false; } })());
console.log(fails ? 'FAILURES ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
