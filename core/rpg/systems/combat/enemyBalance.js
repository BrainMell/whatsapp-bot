'use strict';
// ENEMY BALANCE v2 — anchors dungeon enemy ATK and HP to a *reference adventurer* of the party's level, so danger
// is a consistent fraction of a player's health at every rank instead of whatever the old rank multipliers happened to produce.
//
// Why: player HP/DEF grow superlinearly (growth doubles every 15 levels, plus DR up to 65%) while enemy ATK grew ~linearly,
// so by C-rank a regular mob hit for 0.2-0.4% of a player's HP (pure nibbling) and bosses hit for ~0.1%.
// F/E ranks were the well-tuned reference: mobs hit for a few %, bosses can take a big chunk or one-shot an underprepared player.
//
// Design targets, stated per FIGHT (not per hit) so they hold whether a rank sends 1 mob or 8:
//   trash fight  : a reference adventurer loses ~LOSS_TRASH of max HP over a regular encounter   (so 7-10 encounters need healing/tactics)
//   elite fight  : ~LOSS_ELITE
//   boss fight   : ~LOSS_BOSS of max HP over the whole fight, with boss skills (x2.5-4.5 of a basic hit) landing as real spikes
// Per-hit damage is DERIVED from those targets and the number of mobs / fight length at each rank, not a flat multiplier.
// HP is set from the reference adventurer's damage output so fights last a consistent number of actions
//   (mob ~2 reference actions, elite ~4, boss ~10 — short enough for a WhatsApp fight to stay watchable).
// The reference adventurer includes typical gear (hp/atk/def x (1 + 0.016*level)), calibrated to a live L50 A-rank player (~8000 HP).
//
// v2 only RAISES enemy ATK/MAG vs legacy and only TRIMS HP from D-rank up; F/E stay exactly as tuned.
// Kill switch: ENEMY_BALANCE_V2=0 restores the legacy rank-multiplier scaling exactly.
// Re-run `node scripts/sim_enemy_balance.js` after touching any constant here.

const T = {
  LOSS_TRASH: 0.12, LOSS_ELITE: 0.18, LOSS_BOSS: 0.9,
  MOB_ACTIONS: 2.0, ELITE_ACTIONS: 4, BOSS_ACTIONS: 10,
  SKILL_MOB: 1.3, SKILL_BOSS: 2.3,   // average enemy skill multiplier (mobs mostly basic-attack, bosses mix big skills)
  BOSS_ATTACKS_PER_ROUND: 1.2, BOSS_HIT_CAP: 0.12,
  ACTION_MULT: 2.0,            // reference player's average skill multiplier vs a basic ATK hit
  MIN_REL: 0.6, MAX_REL: 1.7,  // template-to-template variety kept within this band
};
const RANK_BONUS = (rankIdx) => 1 + rankIdx * 0.20;   // mirrors calculateDamage()'s adventurer-rank damage bonus (F=1.0 .. SSS=2.6)

// dungeon difficulty value (DUNGEON_RANKS[*].difficulty) -> rank index F=0 .. SSS=8
function rankIndexFor(diff) {
  const d = Number(diff) || 0;
  return d <= 1.0 ? 0 : d <= 2.0 ? 1 : d <= 4 ? 2 : d <= 7 ? 3 : d <= 13 ? 4 : d <= 25 ? 5 : d <= 50 ? 6 : d <= 77 ? 7 : 8;
}
// a low-level player carried into a high-rank dungeon still meets rank-appropriate enemies
const RANK_MIN_LEVEL = [1, 8, 15, 25, 35, 45, 60, 75, 85];
const RANK_RAMP = 0.03;   // each rank is a touch scarier per hit on top of the level anchor (F 1.00x .. SSS 1.24x)
function effLevel(avgLevel, rankIdx) { return Math.max(avgLevel || 1, RANK_MIN_LEVEL[rankIdx] || 1); }
const RANK_FIGHTS = [2, 3, 6, 6, 7, 8, 9, 10, 12];          // regular fights before the boss (DUNGEON_RANKS encounters - 1)
const RANK_MOBS = [1.5, 3, 3, 3.5, 4, 4.5, 5, 5.5, 6.5];   // avg mobs per regular fight (DUNGEON_RANKS min/max)
const peff = (p) => Math.pow(Math.max(1, p), 0.85);              // a bigger party kills faster and spreads the damage; this keeps per-player danger ~constant (slightly kinder)
const partyHp = (p) => 1 + (Math.max(1, p) - 1) * 0.45;         // ...and enemies are tankier per extra player (was +20%)
// basic-hit fraction of reference max HP so the FIGHT costs the targeted share of HP
function hitFrac(kind, rankIdx, partySize = 1, kScale = 1) {   // kScale<1: enemy HP was already lower than target, fights are shorter -> hit harder
  const p = peff(partySize), ph = partyHp(partySize), ramp = 1 + RANK_RAMP * rankIdx;
  if (kind === 'BOSS') { const pb = Math.max(1, partySize), rounds = T.BOSS_ACTIONS * kScale * ph / pb; return Math.min(T.BOSS_HIT_CAP + 0.02 * (pb - 1), (T.LOSS_BOSS * pb) / (rounds * T.SKILL_BOSS * T.BOSS_ATTACKS_PER_ROUND) * ramp); }   // cap: a x4.5 skill stays under ~55% of a reference player's HP — spikes, not one-shots
  const n = kind === 'ELITE' ? 2 : RANK_MOBS[rankIdx] || 3;
  // live fights are short: players cleave (AoE, summons, passives), so a fight lasts ~2 + n/4 rounds with ~70% of the mobs still swinging on average
  const rounds = (2 + 0.25 * n) * ph / p * kScale * (kind === 'ELITE' ? 1.5 : 1), attacks = n * rounds * 0.7 / p;
  const loss = kind === 'ELITE' ? T.LOSS_ELITE : Math.min(T.LOSS_TRASH, 0.85 / (RANK_FIGHTS[rankIdx] || 6));   // long dungeons shave per-fight loss so full-run attrition stays survivable
  return (loss / (attacks * T.SKILL_MOB)) * ramp;
}
const actionsFor = (kind) => (kind === 'BOSS' ? T.BOSS_ACTIONS : kind === 'ELITE' ? T.ELITE_ACTIONS : T.MOB_ACTIONS);

const enabled = () => process.env.ENEMY_BALANCE_V2 !== '0';

// reference adventurer: class-averaged growth, no gear (gear/skills make real players tougher = a genuine reward)
function reference(level) {
  const L = Math.max(1, Math.floor(level || 1)), f = 1 + Math.floor(L / 15), n = L - 1;
  const pts = n * 3 / 3;                                   // ~3 stat points/level spread over hp/atk/def
  const hp = 110 + Math.floor(15 * f * 1.2 * n) + pts * 15;
  const atk = 9 + Math.floor(2.5 * f * 1.1 * n) + pts * 3;
  const def = 7 + Math.floor(2.0 * f * 1.0 * n) + pts * 2;
  const mag = 9 + Math.floor(2.5 * f * 1.2 * n) + pts * 3;
  const g = 1 + 0.016 * L;                                  // typical gear/runes (live L50 A-rank player ~8000 HP)
  const H = hp * g, D = def * g, Mg = mag * g;
  return { level: L, hp: H, atk: atk * g, def: D, mag: Mg, dr: Math.min(65, D * 0.55) };
}
// fraction of raw enemy attack that lands on the reference player (physical and magical paths averaged, DR applied)
function passRate(ref) {
  const phys = 100 / (100 + ref.def), magic = 100 / (100 + ref.mag * 0.5);
  return ((phys + magic) / 2) * (1 - ref.dr / 100);
}
// ATK an enemy needs so its basic hit lands for `hitFrac` of the reference player's HP
function atkFor(level, hit) {
  const ref = reference(level);
  return Math.max(1, Math.round((hit * ref.hp) / passRate(ref)));
}
// HP an enemy needs to take `actions` reference actions to kill (target DEF = its own, already level-scaled)
function hpFor(level, actions, rankIdx, enemyDef = 0) {
  const ref = reference(level);
  const action = ref.atk * T.ACTION_MULT * RANK_BONUS(rankIdx) * (100 / (100 + (enemyDef || 0)));
  return Math.max(10, Math.round(action * actions));
}
const clampRel = (r) => Math.max(T.MIN_REL, Math.min(T.MAX_REL, r || 1));

module.exports = { T, peff, partyHp, rankIndexFor, effLevel, hitFrac, actionsFor, enabled, reference, passRate, atkFor, hpFor, clampRel, RANK_BONUS };
