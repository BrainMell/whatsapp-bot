'use strict';
// 🃏 PASSIVE CARD ENGINE — pure trigger logic. Cards fire AUTOMATICALLY (no turn cost). The combat code calls 5 hooks:
//   resetBattle(state)                              battle start
//   onTurnStart(state, player)                      the player's turn begins  (turn counters, regen, cleanse)
//   onOutgoing(state, attacker, target, res, opts)  the player hit/missed an enemy (damage mods, crit/miss/combo/lifesteal)
//   onIncoming(state, attacker, target, res)        an enemy hit the player (deflect, shield, lethal save, reflect, reduce)
//   onKill(state, player, enemy)                    the player's side killed an enemy
// Every hook returns an array of EVENTS {jid, cardId, family, name, icon, text} (also queued on state.passiveFx for the
// renderer: drainFx(state)). `res` = {damage,isCrit,wasEvaded}; hooks mutate res.damage in place. Nothing here touches I/O.
const { PASSIVE_CATALOG, SYNERGIES } = require('./catalog');
const NEG = new Set(['burn', 'poison', 'bleed', 'stun', 'freeze', 'slow', 'weak', 'silence', 'shock', 'sleep', 'charm', 'curse', 'drown', 'petrify']);
let _resolver = (p) => (p && Array.isArray(p.passiveLoadout) ? p.passiveLoadout : []);
let _slotsResolver = () => 2;
function setSlotsResolver(fn) { if (typeof fn === 'function') _slotsResolver = fn; }
function slotsOf(p) { try { return Math.max(1, Math.min(5, Number(_slotsResolver(p)) || 2)); } catch (e) { return 2; } }
function setLoadoutResolver(fn) { if (typeof fn === 'function') _resolver = fn; }

const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const maxHpOf = (t) => Math.max(1, num(t && t.stats && (t.stats.maxHp || t.stats.hp), 1));
const hpOf = (t) => num(t && t.stats && t.stats.hp, num(t && t.currentHP));
function setHp(t, v) { const mx = maxHpOf(t); t.stats.hp = Math.max(0, Math.min(mx, Math.floor(v))); t.currentHP = t.stats.hp; }
function healBy(t, v) { if (!t || !t.stats || v <= 0) return 0; const b = hpOf(t); setHp(t, b + v); return hpOf(t) - b; }
function energyBy(t, v) { if (!t || !t.stats || t.stats.maxEnergy == null || v <= 0) return 0; const b = num(t.stats.energy); t.stats.energy = Math.min(num(t.stats.maxEnergy), b + v); return t.stats.energy - b; }
function addShield(t, v, dur = 2) { if (!t) return; if (!t.statusEffects) t.statusEffects = []; const ex = t.statusEffects.find((e) => e.type === 'shield'); if (ex) { ex.value = num(ex.value) + v; ex.duration = Math.max(num(ex.duration), dur); } else t.statusEffects.push({ type: 'shield', duration: dur, value: v }); }

function stateOf(state, player) {
  if (!state) return null;
  if (!state.passiveCards) state.passiveCards = {};
  const jid = String(player && (player.jid || player.name) || '');
  let st = state.passiveCards[jid];
  if (!st) {
    const ids = (_resolver(player) || []).filter((id) => PASSIVE_CATALOG[id]);
    st = state.passiveCards[jid] = { ids: Array.from(new Set(ids)), turns: 0, hits: 0, combo: 0, debt: 0, used: {}, armed: false, marked: {}, seen: {}, staticBoost: 0, nextBonus: 0, jid };
  }
  return st;
}
const has = (st, id) => !!st && st.ids.includes(id);
function ev(state, st, id, text, extra) {
  const c = PASSIVE_CATALOG[id]; const e = Object.assign({ jid: st.jid, cardId: id, family: c.family, name: c.name, icon: c.icon, text }, extra || {});
  if (state) { if (!state.passiveFx) state.passiveFx = []; if (!c.silent) state.passiveFx.push(e); if (state.roundLog && Array.isArray(state.roundLog) && text) state.roundLog.push(`🃏 ${c.icon} *${c.name}* — ${text}`); }
  return e;
}
function resetBattle(state) { if (state) { state.passiveCards = {}; state.passiveFx = []; } }
function drainFx(state) { const f = (state && state.passiveFx) || []; if (state) state.passiveFx = []; return f; }
const synergy = (st, a, b) => has(st, a) && has(st, b);

function onTurnStart(state, player) {
  const st = stateOf(state, player); const out = []; if (!st || !st.ids.length || (player && player.isDead)) return out;
  st.turns++;
  const every = (id) => { const v = PASSIVE_CATALOG[id].v.every; return has(st, id) && st.turns % v === 0; };
  if (every('mirror_guard')) { st.armed = true; ev(state, st, 'mirror_guard', 'a mirror ward forms — the next hit will be deflected', { phase: 'armed', quiet: true }); }
  if (every('frost_barrier')) {
    const sh = Math.max(1, Math.round(maxHpOf(player) * PASSIVE_CATALOG.frost_barrier.v.shieldPct / 100)); addShield(player, sh);
    out.push(ev(state, st, 'frost_barrier', `a frost shield absorbs ${sh} damage`, { value: sh }));
    if (synergy(st, 'frost_barrier', 'iron_will')) { const n = shave(player, true); if (n) out.push(ev(state, st, 'iron_will', `Frost Barrier cleansed ${n} debuff turn(s)`, { synergy: true })); }
  }
  if (every('battle_hymn')) { const c = PASSIVE_CATALOG.battle_hymn.v; const e = energyBy(player, c.energy), h = healBy(player, Math.round(maxHpOf(player) * c.healPct / 100)); out.push(ev(state, st, 'battle_hymn', `+${e} energy, +${h} HP`, { value: e })); }
  if (every('lucky_charm')) { st.nextBonus = PASSIVE_CATALOG.lucky_charm.v.bonusPct; ev(state, st, 'lucky_charm', 'fortune smiles — your next attack lands +50%', { phase: 'armed', quiet: true }); }
  if (has(st, 'iron_will') && !synergy(st, 'frost_barrier', 'iron_will')) { const n = shave(player, false); if (n) out.push(ev(state, st, 'iron_will', `shaved ${n} turn(s) off your debuffs`, { value: n })); }
  else if (has(st, 'iron_will')) shave(player, false);
  return out;
}
function shave(player, force) {
  let n = 0; for (const e of (player && player.statusEffects) || []) { if (!NEG.has(String(e.type)) || num(e.duration) <= 1) continue; if (e._ironShaved && !force) continue; e.duration -= 1; e._ironShaved = true; n++; } return n;
}

// player -> enemy hit. res.damage may be rewritten. isAbility from calculateDamage.
function onOutgoing(state, attacker, target, res, opts) {
  const st = stateOf(state, attacker); const out = []; if (!st || !st.ids.length || !res) return out; opts = opts || {};
  if (res.wasEvaded) {
    if (has(st, 'combo_master') && st.combo > 0) st.combo = 0;
    if (has(st, 'focus_loop')) { const e = energyBy(attacker, PASSIVE_CATALOG.focus_loop.v.energy); if (e) out.push(ev(state, st, 'focus_loop', `a miss refocuses you: +${e} energy`, { value: e })); }
    return out;
  }
  let d = num(res.damage); if (d <= 0) return out;
  const base = d; let mult = 1; const tHp = hpOf(target) / maxHpOf(target);
  if (has(st, 'berserkers_oath')) mult *= 1 + PASSIVE_CATALOG.berserkers_oath.v.dealPct / 100;
  if (has(st, 'combo_master')) { const c = PASSIVE_CATALOG.combo_master.v; if (st.combo > 0) mult *= 1 + (st.combo * c.stepPct) / 100; if (st.combo < c.max) { st.combo++; if (st.combo === c.max) out.push(ev(state, st, 'combo_master', 'combo at MAX — +30% damage', { value: 30 })); } }
  const key = String(target && (target.id || target.name) || '?') + ':' + (target && target.spriteIndex != null ? target.spriteIndex : '');
  if (has(st, 'hunters_mark')) { if (st.marked[key]) mult *= 1 + PASSIVE_CATALOG.hunters_mark.v.bonusPct / 100; else { st.marked[key] = true; out.push(ev(state, st, 'hunters_mark', `${target && target.name || 'the enemy'} is marked`, {})); } }
  const weak = tHp < PASSIVE_CATALOG.predators_instinct.v.belowPct / 100;
  if (has(st, 'predators_instinct') && weak) { mult *= 1 + PASSIVE_CATALOG.predators_instinct.v.bonusPct / 100; if (!st.seen[key]) { st.seen[key] = true; out.push(ev(state, st, 'predators_instinct', 'the weakened prey is exposed: +30% damage', { value: 30 })); } }
  if (st.nextBonus > 0) { mult *= 1 + st.nextBonus / 100; out.push(ev(state, st, 'lucky_charm', `fortune lands: +${st.nextBonus}% damage`, { value: st.nextBonus })); st.nextBonus = 0; }
  d = Math.floor(d * mult);
  if (has(st, 'blood_debt')) {
    if (opts.isAbility && st.debt > 0) { let rel = st.debt; if (synergy(st, 'blood_debt', 'predators_instinct') && weak) rel = Math.floor(rel * 1.5); d += rel; out.push(ev(state, st, 'blood_debt', `released ${rel} stored damage`, { value: rel })); st.debt = 0; }
    else if (!opts.isAbility) st.debt += Math.floor(base * PASSIVE_CATALOG.blood_debt.v.storePct / 100);
  }
  if (has(st, 'static_charge')) {
    st.hits++; const c = PASSIVE_CATALOG.static_charge.v;
    if (st.hits >= c.every) { st.hits = 0; const b = Math.max(1, Math.floor(base * c.bonusPct / 100)); d += b; out.push(ev(state, st, 'static_charge', `lightning discharges for +${b}`, { value: b })); }
  }
  if (has(st, 'overcharge') && opts.isAbility && !st.used.overcharge) { st.used.overcharge = true; const e = energyBy(attacker, PASSIVE_CATALOG.overcharge.v.energy); out.push(ev(state, st, 'overcharge', `first ability refunded ${e} energy`, { value: e })); }
  res.damage = Math.max(1, d);
  if (has(st, 'vampiric_charm')) { const h = healBy(attacker, Math.max(1, Math.floor(res.damage * PASSIVE_CATALOG.vampiric_charm.v.pct / 100))); if (h) out.push(ev(state, st, 'vampiric_charm', `drained ${h} HP`, { value: h })); }
  if (res.isCrit && has(st, 'grave_robber')) { const h = healBy(attacker, Math.round(maxHpOf(attacker) * PASSIVE_CATALOG.grave_robber.v.healPct / 100)); if (h) out.push(ev(state, st, 'grave_robber', `the crit restored ${h} HP`, { value: h })); }
  return out;
}

// enemy -> player hit (res.damage is what the caller is about to subtract from target.stats.hp)
function onIncoming(state, attacker, target, res) {
  const st = stateOf(state, target); const out = []; if (!st || !st.ids.length || !res || res.wasEvaded) return out;
  let d = num(res.damage); if (d <= 0) return out;
  if (st.armed && has(st, 'mirror_guard')) { st.armed = false; res.damage = 0; res.deflected = true; out.push(ev(state, st, 'mirror_guard', `deflected ${d} damage`, { value: d }));
    if (synergy(st, 'mirror_guard', 'static_charge')) { st.hits = Math.max(st.hits, PASSIVE_CATALOG.static_charge.v.every - 1); out.push(ev(state, st, 'static_charge', 'the deflection charges your next hit', { synergy: true, quiet: true })); }
    return out; }
  const hp = hpOf(target), mx = maxHpOf(target);
  if (has(st, 'berserkers_oath')) d = Math.floor(d * (1 + PASSIVE_CATALOG.berserkers_oath.v.takePct / 100));
  if (has(st, 'last_stand') && hp / mx < PASSIVE_CATALOG.last_stand.v.belowPct / 100) { d = Math.floor(d * (1 - PASSIVE_CATALOG.last_stand.v.reducePct / 100)); if (!st.used.lastStand) { st.used.lastStand = true; out.push(ev(state, st, 'last_stand', 'cornered — damage reduced by 25%', { value: 25 })); } }
  if (has(st, 'emergency_draught') && !st.used.draught && hp - d < mx * PASSIVE_CATALOG.emergency_draught.v.belowPct / 100 && hp - d > 0) { st.used.draught = true; const h = healBy(target, Math.round(mx * PASSIVE_CATALOG.emergency_draught.v.healPct / 100)); out.push(ev(state, st, 'emergency_draught', `an emergency draught restores ${h} HP`, { value: h })); }
  if (has(st, 'phoenix_feather') && !st.used.phoenix && hpOf(target) - d <= 0) { st.used.phoenix = true; const keep = Math.max(1, Math.ceil(mx * PASSIVE_CATALOG.phoenix_feather.v.hpPct / 100)); d = Math.max(0, hpOf(target) - keep); out.push(ev(state, st, 'phoenix_feather', `rebirth! survived at ${keep} HP`, { value: keep })); }
  res.damage = Math.max(d > 0 ? 1 : 0, d);
  if (has(st, 'thorn_mantle') && res.damage > 0 && attacker && attacker.stats) { const r = Math.floor(res.damage * PASSIVE_CATALOG.thorn_mantle.v.reflectPct / 100); const room = Math.max(0, hpOf(attacker) - 1); const rr = Math.min(r, room); if (rr > 0) { setHp(attacker, hpOf(attacker) - rr); out.push(ev(state, st, 'thorn_mantle', `thorns reflect ${rr} damage`, { value: rr })); } }
  return out;
}

function onKill(state, player, enemy) {
  const st = stateOf(state, player); const out = []; if (!st || !st.ids.length) return out;
  if (has(st, 'second_wind')) { const e = energyBy(player, PASSIVE_CATALOG.second_wind.v.energy); if (e) out.push(ev(state, st, 'second_wind', `the kill restores ${e} energy`, { value: e })); }
  return out;
}
function loadoutOf(p) { return (_resolver(p) || []).filter((id) => PASSIVE_CATALOG[id]); }
module.exports = { setSlotsResolver, slotsOf, loadoutOf, setLoadoutResolver, resetBattle, drainFx, onTurnStart, onOutgoing, onIncoming, onKill, stateOf, SYNERGIES };
