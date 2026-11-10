// QA: skill tree trim — no dangling requires, removed ids gone, passives gone, refund migration correct + idempotent
const st = require('../core/rpg/systems/characters/skillTree.js'); let fails = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x ? ' | ' + x : '')); if (!c) fails++; };
const T = st.SKILL_TREES; let total = 0; const dang = [], pass = [];
for (const [c, cls] of Object.entries(T)) { if (!cls.trees) continue; const ids = new Set(); for (const t of Object.values(cls.trees)) for (const k of Object.keys(t.skills || {})) ids.add(k);
  for (const t of Object.values(cls.trees)) for (const [k, sk] of Object.entries(t.skills || {})) { total++; for (const r of Object.keys(sk.requires || {})) if (!ids.has(r)) dang.push(c + ':' + k + '->' + r);
    let eff = null; try { eff = typeof sk.effect === 'function' ? sk.effect(1) : sk.effect; } catch (e) {} if (sk.passive === true || (eff && eff.type === 'passive')) pass.push(c + ':' + k); } }
ok('no dangling requires', dang.length === 0, dang.join(','));
ok('no passive skills left in any tree', pass.length === 0, pass.join(','));
ok('skill count trimmed (272 -> ~249)', total >= 240 && total <= 255, String(total));
const shared = []; for (const id of st.REMOVED_SKILL_IDS) { let found = false; for (const cls of Object.values(T)) for (const t of Object.values(cls.trees || {})) if (t.skills && t.skills[id]) found = true; if (found) shared.push(id); }
ok('removed ids absent from every tree except known shared ids', shared.every((x) => x === 'divine_shield'), shared.join(','));
const ac = { skills: { divine_shield: 2 }, skillPoints: 0 }; st.migrateRemovedSkills(ac, 'ACOLYTE'); ok('shared id refunded for ACOLYTE lineage (no ghost level)', !('divine_shield' in ac.skills) && ac.skillPoints === 2, JSON.stringify(ac));
const u = { skills: { slash: 3, warriors_resolve: 2, war_stomp: 1, arcane_missiles: 4, martyrdom: 1 }, skillSpend: { arcane_missiles: 6 }, skillPoints: 5 };
const r = st.migrateRemovedSkills(u);
ok('refund = ledger where present else levels (2+1+6+1=10)', r.refunded === 10 && u.skillPoints === 15, JSON.stringify({ r: r.refunded, sp: u.skillPoints }));
ok('removed skills dropped, others kept', !('warriors_resolve' in u.skills) && !('arcane_missiles' in u.skills) && u.skills.slash === 3);
const r2 = st.migrateRemovedSkills(u); ok('idempotent (second pass refunds 0)', r2.refunded === 0 && u.skillPoints === 15);
const u2 = { skills: { slash: 1 } }; ok('ensureSkillPointsInitialized signals save after a refund', st.ensureSkillPointsInitialized({ skills: { martyrdom: 2 }, skillPoints: 0 }, 'ACOLYTE', 10) === true);
console.log(fails ? 'FAILURES ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
