'use strict';
// 🃏 PASSIVE (RELIC) CARD CATALOG — pure data. Always-on / trigger-based combat modifiers that fire WITHOUT spending a turn.
// family: DEFENSE (blue) | OFFENSE (red) | TACTICAL (green)   — decides the card colour AND the family of the trigger animation.
// trigger: turn_counter | incoming_hit | lethal_hit | low_hp | outgoing_hit | crit | miss | kill | combo | first_ability | always
// The behaviour lives in engine.js (keyed by id). Numbers are in `v` so balance changes never touch engine code.
const P = (o) => Object.freeze(Object.assign({ rarity: 'COMMON', silent: false }, o));
const PASSIVE_CATALOG = Object.freeze({
  // ───────── DEFENSIVE REACTIONS ─────────
  mirror_guard: P({ id: 'mirror_guard', name: 'Mirror Guard', icon: '🪞', family: 'DEFENSE', rarity: 'RARE', trigger: 'turn_counter',
    desc: 'Every 4 of your turns, the next incoming attack is deflected completely.', v: { every: 4 } }),
  phoenix_feather: P({ id: 'phoenix_feather', name: 'Phoenix Feather', icon: '🪶', family: 'DEFENSE', rarity: 'LEGENDARY', trigger: 'lethal_hit',
    desc: 'Once per battle, survive a lethal hit with 10% HP remaining.', v: { hpPct: 10 } }),
  frost_barrier: P({ id: 'frost_barrier', name: 'Frost Barrier', icon: '🧊', family: 'DEFENSE', rarity: 'RARE', trigger: 'turn_counter',
    desc: 'Every 3 of your turns, gain a shield worth 10% of your max HP.', v: { every: 3, shieldPct: 10 } }),
  last_stand: P({ id: 'last_stand', name: 'Last Stand', icon: '🛡️', family: 'DEFENSE', rarity: 'RARE', trigger: 'low_hp',
    desc: 'Below 30% HP, take 25% less damage.', v: { belowPct: 30, reducePct: 25 } }),
  iron_will: P({ id: 'iron_will', name: 'Iron Will', icon: '⛓️', family: 'DEFENSE', rarity: 'COMMON', trigger: 'turn_counter',
    desc: 'Negative status effects on you last 1 turn shorter.', v: {} }),
  thorn_mantle: P({ id: 'thorn_mantle', name: 'Thorn Mantle', icon: '🌵', family: 'DEFENSE', rarity: 'COMMON', trigger: 'incoming_hit',
    desc: 'Reflect 15% of damage taken back at the attacker.', v: { reflectPct: 15 } }),
  emergency_draught: P({ id: 'emergency_draught', name: 'Emergency Draught', icon: '🧪', family: 'DEFENSE', rarity: 'EPIC', trigger: 'low_hp',
    desc: 'Once per battle, when a hit would drop you below 30% HP, heal 15% max HP first.', v: { belowPct: 30, healPct: 15 } }),
  // ───────── OFFENSIVE REACTIONS ─────────
  blood_debt: P({ id: 'blood_debt', name: 'Blood Debt', icon: '🩸', family: 'OFFENSE', rarity: 'EPIC', trigger: 'outgoing_hit',
    desc: 'Basic attacks store 35% of their damage. Your next ability releases it all as bonus damage.', v: { storePct: 35 } }),
  static_charge: P({ id: 'static_charge', name: 'Static Charge', icon: '⚡', family: 'OFFENSE', rarity: 'RARE', trigger: 'outgoing_hit',
    desc: 'Every 3rd successful attack discharges +30% bonus lightning damage.', v: { every: 3, bonusPct: 30 } }),
  predators_instinct: P({ id: 'predators_instinct', name: "Predator's Instinct", icon: '👁️', family: 'OFFENSE', rarity: 'RARE', trigger: 'outgoing_hit',
    desc: 'Deal +30% damage to enemies below 25% HP.', v: { belowPct: 25, bonusPct: 30 } }),
  combo_master: P({ id: 'combo_master', name: 'Combo Master', icon: '🥋', family: 'OFFENSE', rarity: 'EPIC', trigger: 'combo',
    desc: 'Each consecutive hit adds +6% damage (max +30%). A miss resets it.', v: { stepPct: 6, max: 5 } }),
  berserkers_oath: P({ id: 'berserkers_oath', name: "Berserker's Oath", icon: '🪓', family: 'OFFENSE', rarity: 'EPIC', trigger: 'always', silent: true,
    desc: 'TRADE-OFF: deal 20% more damage, but take 10% more damage.', v: { dealPct: 20, takePct: 10 } }),
  vampiric_charm: P({ id: 'vampiric_charm', name: 'Vampiric Charm', icon: '🦇', family: 'OFFENSE', rarity: 'RARE', trigger: 'outgoing_hit',
    desc: 'Heal for 6% of the damage you deal.', v: { pct: 6 } }),
  hunters_mark: P({ id: 'hunters_mark', name: "Hunter's Mark", icon: '🎯', family: 'OFFENSE', rarity: 'COMMON', trigger: 'outgoing_hit',
    desc: 'Your first hit on each enemy marks it: all your later hits on it deal +12%.', v: { bonusPct: 12 } }),
  // ───────── TACTICAL / UTILITY ─────────
  second_wind: P({ id: 'second_wind', name: 'Second Wind', icon: '🌬️', family: 'TACTICAL', rarity: 'COMMON', trigger: 'kill',
    desc: 'Defeating an enemy restores 12 energy.', v: { energy: 12 } }),
  grave_robber: P({ id: 'grave_robber', name: 'Grave Robber', icon: '💀', family: 'TACTICAL', rarity: 'COMMON', trigger: 'crit',
    desc: 'Landing a critical hit restores 5% max HP.', v: { healPct: 5 } }),
  overcharge: P({ id: 'overcharge', name: 'Overcharge', icon: '🔋', family: 'TACTICAL', rarity: 'RARE', trigger: 'first_ability',
    desc: 'Your first ability each battle refunds 15 energy.', v: { energy: 15 } }),
  focus_loop: P({ id: 'focus_loop', name: 'Focus Loop', icon: '🌀', family: 'TACTICAL', rarity: 'COMMON', trigger: 'miss',
    desc: 'When your attack misses, recover 10 energy.', v: { energy: 10 } }),
  battle_hymn: P({ id: 'battle_hymn', name: 'Battle Hymn', icon: '🎺', family: 'TACTICAL', rarity: 'RARE', trigger: 'turn_counter',
    desc: 'Every 5 of your turns, recover 8 energy and 4% max HP.', v: { every: 5, energy: 8, healPct: 4 } }),
  // ───────── (synergies are listed in SYNERGIES below) ─────────
  lucky_charm: P({ id: 'lucky_charm', name: 'Lucky Charm', icon: '🍀', family: 'TACTICAL', rarity: 'EPIC', trigger: 'turn_counter',
    desc: 'Every 4 of your turns, your next attack is guaranteed +50% damage.', v: { every: 4, bonusPct: 50 } }),
});
const RARITY = Object.freeze({ COMMON: { rank: 1, color: '#9aa6b2' }, RARE: { rank: 2, color: '#4aa3ff' }, EPIC: { rank: 3, color: '#b45cff' }, LEGENDARY: { rank: 4, color: '#ffb02e' } });
const FAMILY = Object.freeze({ DEFENSE: { color: '#4aa3ff', label: 'DEFENSE' }, OFFENSE: { color: '#ff5a4a', label: 'OFFENSE' }, TACTICAL: { color: '#5fd38a', label: 'TACTICAL' } });
const SYNERGIES = Object.freeze([
  { cards: ['mirror_guard', 'static_charge'], text: 'A deflected attack charges your next hit with lightning.' },
  { cards: ['blood_debt', 'predators_instinct'], text: 'Released Blood Debt deals +50% against enemies below 25% HP.' },
  { cards: ['frost_barrier', 'iron_will'], text: 'Raising Frost Barrier also cleanses 1 turn from every debuff.' },
]);
const ALIASES = Object.freeze({ mirror: 'mirror_guard', phoenix: 'phoenix_feather', feather: 'phoenix_feather', frost: 'frost_barrier', barrier: 'frost_barrier',
  last: 'last_stand', laststand: 'last_stand', iron: 'iron_will', ironwill: 'iron_will', thorn: 'thorn_mantle', thorns: 'thorn_mantle', draught: 'emergency_draught',
  blood: 'blood_debt', static: 'static_charge', predator: 'predators_instinct', predators: 'predators_instinct', combo: 'combo_master',
  oath: 'berserkers_oath', berserker: 'berserkers_oath', vampiric: 'vampiric_charm', vamp: 'vampiric_charm', mark: 'hunters_mark', hunter: 'hunters_mark',
  wind: 'second_wind', secondwind: 'second_wind', grave: 'grave_robber', robber: 'grave_robber', over: 'overcharge', focus: 'focus_loop', hymn: 'battle_hymn', lucky: 'lucky_charm' });
module.exports = { PASSIVE_CATALOG, RARITY, FAMILY, SYNERGIES, ALIASES };
