// ============================================
// ⚔️ CLASS ULTIMATE VFX — 45 hand-tuned signature animations
// Uses the repository's existing canvas + pure-JS GIF encoder.
// The GIF is shown before applyAbilityEffect changes HP; regular combat
// resolution then applies the real mechanics and sends the refreshed scene.
// ============================================

'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { encodeGif } = require('../utils/gif89a');

const W = 480;
const H = 360;
// ⚔️ FIX 2026-10-24 (owner: 'charging an attack and the next message is
// literally just an image card with the enemy gone'): 8 frames + the pure-JS
// GIF encode blew the 8s race on busy boxes (RenderQ piling up mid-cast), so
// the GIF silently degraded to the text fallback and the next card the player
// saw was the post-kill war log with the dead enemy hidden. 6 frames keeps the
// animation readable and leaves headroom under render pressure.
const FRAME_COUNT = 6;
const FRAME_DELAY_MS = 200;
// ⚔️ FIX 2026-10-24 round 2 (owner: 'still doesn't work... just an image card'):
// the previous overlay was technically delivered but read as a STATIC card —
// thin strokes + near-identical frames at phone size. Timeline analysis of the
// real 18:23 cast (7s gap < texts+8s-timeout, zero wedge warns) proves the GIF
// WAS sent; the content just didn't read as an ultimate. So: screen shake +
// zoom-punch + buildup dim + 1-frame warm flash (enemy silhouette returns the
// very next frame — 'enemy gone' stays impossible) + hit-tint settle frame.
const IMPACT_FRAME = 3;
const GIF_PLAYBACK_MS = 2700;
const PALETTE = {
  FIGHTER: ['#fff1b0', '#ffcb45', '#e85a37'],
  SCOUT: ['#e7f6ff', '#6edcff', '#6574ff'],
  APPRENTICE: ['#fff0a8', '#ff763b', '#b52c5b'],
  ACOLYTE: ['#fff9d8', '#ffe479', '#fffdf3'],
  WARRIOR: ['#ffe3a1', '#ed7c35', '#a93228'],
  ROGUE: ['#f0f1ff', '#aaa6ff', '#4940a5'],
  MAGE: ['#d8fbff', '#6de9ff', '#4175ff'],
  BERSERKER: ['#ffb0a5', '#ff3e3e', '#741c31'],
  PALADIN: ['#fffbd2', '#ffdb63', '#fff3bd'],
  NECROMANCER: ['#c5ffc9', '#4bf09d', '#126e68'],
  CHRONOMANCER: ['#e6e9ff', '#96bfff', '#7164ff'],
  MERCHANT: ['#fff4a6', '#ffcf35', '#b87923'],
  CLERIC: ['#fffef0', '#ffd978', '#fff5c4'],
  NINJA: ['#eff1ff', '#a8a0ff', '#302c64'],
  MONK: ['#fff2b8', '#ffba58', '#ffec9f'],
  DRAGONSLAYER: ['#fff2a3', '#ff7d35', '#b72d28'],
  ELEMENTALIST: ['#c9fff9', '#70e8ff', '#9c73ff'],
  WARLORD: ['#ffe9a1', '#e4a043', '#aa2b30'],
  DOOMSLAYER: ['#ffc79a', '#ff5d32', '#6d142c'],
  AVATAR: ['#fff3c4', '#91f1ff', '#d688ff'],
  WARLOCK: ['#e9caff', '#b363ff', '#481b73'],
  DRUID: ['#d4ffb9', '#78df68', '#27754d'],
  ARTIFICER: ['#d5ffff', '#52d8da', '#ffca65'],
  BARD: ['#ffe3f4', '#ff91d3', '#7d8dff'],
  SAMURAI: ['#fff0cc', '#ffb35c', '#e94e52'],
  LICH: ['#d7e8ff', '#8f95ff', '#32275f'],
  TIMELORD: ['#e7faff', '#79e4ff', '#a887ff'],
  SAINT: ['#fffef1', '#ffeb89', '#f3fbff'],
  ARCHDRUID: ['#e7ffbf', '#a7e96e', '#39895a'],
  TYCOON: ['#fff2a1', '#ffd32c', '#ed8d22'],
  ARCHMAGE: ['#ddcbff', '#a181ff', '#46e9ff'],
  VOIDWALKER: ['#e6d9ff', '#a56aff', '#17112f'],
  TEMPLAR: ['#fff9d8', '#ffd65c', '#fffbec'],
  NIGHTBLADE: ['#e3e8ff', '#a0a9ff', '#292345'],
  ZENMASTER: ['#fff3c4', '#8de3ff', '#eab7ff'],
  DRAGON_GOD: ['#fff0a3', '#ff8c3c', '#e94c5d'],
  DRAGON_LORD: ['#fff2ad', '#ffae48', '#bf4030'],
  SHOGUN: ['#fff0d2', '#ffd17e', '#b9283d'],
  KAGE: ['#e4e5ff', '#999cff', '#272344'],
  VIRTUOSO: ['#fae2ff', '#da86ff', '#4d3179'],
  GRAND_INVENTOR: ['#e3ffff', '#7deaff', '#ffca5e'],
  DIVINE_FIST: ['#fff1b2', '#ffa95c', '#f9e4a0'],
  REAPER: ['#e7efff', '#a2b7d8', '#5b638a'],
  GOD_HAND: ['#fff5ca', '#f7d37a', '#a0e6d6'],
  DEATH_LORD: ['#d9fff0', '#62e8c3', '#663e91']
};

// One real skill per class. These IDs are defined in core/rpg/skillTree.js.
// Similar IDs intentionally remain class-scoped (for example FIGHTER/execute
// and WARRIOR/execute), so only the matching class gets this special animation.
const SIGNATURE_SKILLS = Object.freeze({
  FIGHTER: { id: 'execute', style: 'fighter_execute', side: 'enemy' },
  SCOUT: { id: 'assassinate', style: 'scout_assassinate', side: 'enemy' },
  APPRENTICE: { id: 'meteor', style: 'apprentice_meteor', side: 'enemy' },
  ACOLYTE: { id: 'divine_judgment', style: 'acolyte_judgment', side: 'enemy' },
  WARRIOR: { id: 'execute', style: 'warrior_execute', side: 'enemy' },
  ROGUE: { id: 'assassinate', style: 'rogue_assassinate', side: 'enemy' },
  MAGE: { id: 'meteor', style: 'mage_meteor', side: 'enemy' },
  BERSERKER: { id: 'last_stand', style: 'berserker_last_stand', side: 'enemy' },
  PALADIN: { id: 'divine_judgment', style: 'paladin_judgment', side: 'enemy' },
  NECROMANCER: { id: 'army_of_dead', style: 'necromancer_army', side: 'enemy' },
  CHRONOMANCER: { id: 'time_stop', style: 'chronomancer_stop', side: 'enemy' },
  MERCHANT: { id: 'money_rain', style: 'merchant_rain', side: 'enemy' },
  CLERIC: { id: 'divine_wrath', style: 'cleric_wrath', side: 'enemy' },
  NINJA: { id: 'final_eclipse', style: 'ninja_eclipse', side: 'enemy' },
  MONK: { id: 'enlightenment', style: 'monk_enlightenment', side: 'self' },
  DRAGONSLAYER: { id: 'dragonfall', style: 'dragonslayer_fall', side: 'enemy' },
  ELEMENTALIST: { id: 'elemental_cataclysm', style: 'elemental_cataclysm', side: 'enemy' },
  WARLORD: { id: 'total_war', style: 'warlord_total_war', side: 'enemy' },
  DOOMSLAYER: { id: 'crucible', style: 'doomslayer_crucible', side: 'enemy' },
  AVATAR: { id: 'universal_cataclysm', style: 'avatar_cataclysm', side: 'enemy' },
  WARLOCK: { id: 'soul_harvest', style: 'warlock_soul_harvest', side: 'enemy' },
  DRUID: { id: 'thorn_surge', style: 'druid_thorn_surge', side: 'enemy' },
  ARTIFICER: { id: 'omega_protocol', style: 'artificer_omega', side: 'enemy' },
  BARD: { id: 'crescendo', style: 'bard_crescendo', side: 'enemy' },
  SAMURAI: { id: 'seven_cuts', style: 'samurai_seven_cuts', side: 'enemy' },
  LICH: { id: 'apocalypse_nova', style: 'lich_apocalypse', side: 'enemy' },
  TIMELORD: { id: 'paradox_wave', style: 'timelord_paradox', side: 'enemy' },
  SAINT: { id: 'heavenly_wrath', style: 'saint_wrath', side: 'enemy' },
  ARCHDRUID: { id: 'ancient_growth', style: 'archdruid_growth', side: 'enemy' },
  TYCOON: { id: 'zeni_storm', style: 'tycoon_zeni', side: 'enemy' },
  ARCHMAGE: { id: 'singularity', style: 'archmage_singularity', side: 'enemy' },
  VOIDWALKER: { id: 'oblivion', style: 'voidwalker_oblivion', side: 'enemy' },
  TEMPLAR: { id: 'heavenly_sanctuary', style: 'templar_sanctuary', side: 'self' },
  NIGHTBLADE: { id: 'eclipse', style: 'nightblade_eclipse', side: 'enemy' },
  ZENMASTER: { id: 'one_with_universe', style: 'zenmaster_universe', side: 'self' },
  DRAGON_GOD: { id: 'apocalypse_wing', style: 'dragon_god_wing', side: 'enemy' },
  DRAGON_LORD: { id: 'flight_of_the_wyrms', style: 'dragon_lord_wyrms', side: 'enemy' },
  SHOGUN: { id: 'empire_strike', style: 'shogun_empire', side: 'enemy' },
  KAGE: { id: 'thousand_shadows', style: 'kage_shadows', side: 'enemy' },
  VIRTUOSO: { id: 'requiem_of_the_void', style: 'virtuoso_requiem', side: 'enemy' },
  GRAND_INVENTOR: { id: 'orbital_strike', style: 'grand_inventor_orbital', side: 'enemy' },
  DIVINE_FIST: { id: 'eight_gates', style: 'divine_fist_gates', side: 'self' },
  REAPER: { id: 'grim_reaping', style: 'reaper_grim', side: 'enemy' },
  GOD_HAND: { id: 'meditation', style: 'god_hand_meditation', side: 'self' },
  DEATH_LORD: { id: 'soul_tether', style: 'death_lord_tether', side: 'enemy' }
});

function getSignature(classId, skillId) {
  const entry = SIGNATURE_SKILLS[String(classId || '').toUpperCase()];
  return entry && entry.id === String(skillId || '').toLowerCase() ? entry : null;
}

// ⚔️ CROSS-CLASS ULTIMATE RESOLUTION (2026-10-26, owner: "animated sprite not
// triggering for others" + "make sure the multiple ultimate skills people get
// transfer across evolution, so someone like a lich has multiple ultimates"):
// the old gate animated ONLY the current class's single hand-mapped signature,
// so every ultimate inherited from an earlier class (a LICH casting the
// NECROMANCER army_of_dead) resolved silently with no animation. Resolution
// order: (1) exact hand-tuned entry for the current class, (2) the OWNING
// class of a mapped signature with the same skill id (inherited ults keep
// their authentic recipe + palette), (3) ANY skill flagged isUltimate gets a
// derived entry (side inferred from the effect shape), (4) null -> no anim.
const SIGNATURE_BY_SKILL = (() => {
  const idx = {};
  for (const [cls, entry] of Object.entries(SIGNATURE_SKILLS)) {
    if (entry && entry.id && !idx[entry.id]) idx[entry.id] = { classId: cls, entry };
  }
  return idx;
})();

function deriveSide(ability) {
  try {
    if (String(ability.targeting || '').toUpperCase() === 'SELF') return 'self';
    const eff = typeof ability.effect === 'function'
      ? ability.effect(ability.skillLevel || ability.level || 1)
      : (ability.effects || ability.effect || {});
    const blob = JSON.stringify(eff || {});
    const offensive = /multiplier|"aoe"|"dot"|lifesteal|drain/i.test(blob);
    const support = /\b(heal|regen|shield|cleanse|buff|mana|energy|revive)\b/i.test(blob);
    if (support && !offensive) return 'self';
  } catch (e) { /* fall through to the enemy-side default */ }
  return 'enemy';
}

function resolveSignature(classId, ability) {
  const cid = String(classId || '').toUpperCase();
  const skillId = String((ability && ability.id) || '').toLowerCase();
  const mapped = getSignature(cid, skillId);
  if (mapped) return { ...mapped, ownerClass: cid };
  const owner = SIGNATURE_BY_SKILL[skillId];
  if (owner) return { ...owner.entry, ownerClass: owner.classId };
  if (!ability || ability.isUltimate !== true) return null;
  return { id: skillId, style: 'derived', side: deriveSide(ability), ownerClass: cid, derived: true };
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function raceTimeout(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => { timer = setTimeout(resolve, ms, null); })
  ]).finally(() => clearTimeout(timer));
}
function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  return null;
}

async function getBattleBackground(state, player, ability, target) {
  const turnInfo = {
    actor: player,
    action: { name: ability.name || 'Ultimate' },
    target: target || null,
    damage: 0,
    effects: [],
    turnNumber: state.turnCount || 1
  };
  try {
    let scene;
    if (state.mode === 'RUINS' && state.ruinsMeta) {
      scene = await raceTimeout(
        require('./guildWar/battleScene').renderBattleImage(state, { phase: 'TURN', turnInfo }),
        5000
      );
    } else if (state.isAbyss === true) {
      scene = await raceTimeout(
        require('./abyssScene').renderAbyssCombat(state, { phase: 'TURN', turnInfo }),
        5000
      );
    } else {
      scene = await raceTimeout(
        require('./combatIntegration').generateCombatScene(state.players || [], state.enemies || [], 'TURN', {
          turnInfo,
          backgroundPath: state.backgroundPath || null,
          rank: state.dungeonRank || null,
          floor: state.isAbyss ? state.abyssFloor : 0,
          summons: state.summons || []
        }),
        5500
      );
    }
    if (!scene || !scene.success) return null;
    const direct = asBuffer(scene.buffer);
    if (direct && scene.mimeType !== 'video/mp4') return direct;
    if (scene.imagePath && fs.existsSync(scene.imagePath)) {
      return fs.readFileSync(scene.imagePath);
    }
  } catch (err) {
    console.warn('[SkillVFX] pre-hit scene unavailable:', err?.message || err);
  }
  return null;
}

function fallbackBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#171e35');
  g.addColorStop(0.63, '#32344a');
  g.addColorStop(1, '#10121f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#202438';
  for (let i = 0; i < 9; i++) {
    const x = i * 64;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.58);
    ctx.lineTo(x + 30, H * 0.41 + (i % 3) * 8);
    ctx.lineTo(x + 64, H * 0.58);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#48404a';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.strokeStyle = '#77605b';
  ctx.lineWidth = 2;
  for (let y = H * 0.81; y < H; y += 15) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, H * 0.78); ctx.lineTo(x - 12, H); ctx.stroke();
  }
  // Simple grounded silhouettes only used when the normal scene renderer fails.
  ctx.fillStyle = '#11131d';
  ctx.fillRect(75, 191, 25, 70); ctx.fillRect(69, 211, 38, 8);
  ctx.beginPath(); ctx.arc(87, 181, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(355, 191, 32, 70); ctx.fillRect(349, 213, 44, 8);
  ctx.beginPath(); ctx.arc(371, 179, 18, 0, Math.PI * 2); ctx.fill();
}

function strokeLine(ctx, pts, color, width, alpha = 1) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}
function fillPoly(ctx, pts, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function ring(ctx, x, y, rx, ry, color, width, alpha = 1, start = 0, end = Math.PI * 2) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, start, end);
  ctx.stroke();
  ctx.restore();
}
function burst(ctx, x, y, radius, inner, color, alpha = 1, spikes = 12, rot = 0) {
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (Math.PI * 2 * i) / (spikes * 2);
    const r = i % 2 ? inner : radius;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  fillPoly(ctx, pts, color, alpha);
}
function drawPixelSpark(ctx, x, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.max(2, Math.round(size)), Math.max(2, Math.round(size)));
  ctx.fillRect(Math.round(x - size * 1.4), Math.round(y - 1), Math.max(1, Math.round(size * 0.7)), 2);
  ctx.restore();
}
function drawHand(ctx, x, baseY, rise, color, alpha = 1, size = 1) {
  const y = baseY - rise;
  const w = 12 * size;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#211c2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.lineTo(x - w * 0.75, y + 18 * size);
  ctx.lineTo(x - w * 0.7, y - 1 * size);
  ctx.lineTo(x - w * 0.42, y + 12 * size);
  ctx.lineTo(x - w * 0.26, y - 15 * size);
  ctx.lineTo(x - w * 0.02, y + 9 * size);
  ctx.lineTo(x + w * 0.15, y - 19 * size);
  ctx.lineTo(x + w * 0.34, y + 9 * size);
  ctx.lineTo(x + w * 0.58, y - 8 * size);
  ctx.lineTo(x + w * 0.72, y + 13 * size);
  ctx.lineTo(x + w, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function drawSickle(ctx, x, y, size, color, alpha) {
  strokeLine(ctx, [[x - 36 * size, y + 43 * size], [x - 2 * size, y - 17 * size], [x + 20 * size, y - 43 * size]], '#282636', 7 * size, alpha);
  strokeLine(ctx, [[x + 20 * size, y - 43 * size], [x + 5 * size, y - 51 * size], [x - 12 * size, y - 46 * size], [x - 24 * size, y - 31 * size]], color, 7 * size, alpha);
  strokeLine(ctx, [[x - 22 * size, y - 29 * size], [x - 7 * size, y - 44 * size], [x + 9 * size, y - 47 * size]], '#fff1d4', 2 * size, alpha);
}

function drawEffect(ctx, entry, t, frame, targetSide, ax) {
  const colors = PALETTE[entry.classId] || ['#fff0b0', '#ffbd57', '#e94b53'];
  const a = colors[0], b = colors[1], c = colors[2];
  // 💡 VFX LAYERS 2026-10-26: ax = { self:[x,y], enemy:[x,y] } real sprite-feet
  // anchors (renderer-provided). Falls back to the legacy fractions when absent
  // - fixes "spell starting points not on the players" in the GIF lane too.
  const selfX = ax && ax.self ? ax.self[0] : W * 0.25, selfY = ax && ax.self ? ax.self[1] : H * 0.53;
  const enemyX = ax && ax.enemy ? ax.enemy[0] : W * 0.72, enemyY = ax && ax.enemy ? ax.enemy[1] : H * 0.55;
  const tx = targetSide === 'self' ? selfX : enemyX;
  const ty = targetSide === 'self' ? selfY : enemyY;
  const k = Math.sin(Math.PI * t);
  const p = t * 1.0;
  const impact = Math.max(0, Math.min(1, (t - 0.56) / 0.44));
  const base = H * 0.78;
  const f = frame + 1;

  // The frame sequence is hand-drawn with class-specific shape, trajectory,
  // palette and impact timing. These are overlays on the live pre-hit scene.
  switch (entry.style) {
    case 'fighter_execute':
      strokeLine(ctx, [[selfX + 8, selfY - 62], [W * 0.44, selfY - 20], [tx - 22, ty + 4]], a, 18, k);
      strokeLine(ctx, [[selfX + 16, selfY - 48], [W * 0.44, selfY - 7], [tx - 12, ty + 5]], b, 6, k);
      if (impact) { burst(ctx, tx, ty, 55 * impact, 18 * impact, b, impact, 13, p); ring(ctx, tx, ty, 28 * impact, 12 * impact, a, 4, impact); }
      break;
    case 'scout_assassinate':
      strokeLine(ctx, [[selfX, selfY - 32], [selfX + 42, selfY - 42], [tx - 20, ty - 8]], a, 4, k);
      for (let i = 0; i < 3; i++) strokeLine(ctx, [[tx - 55 + i * 12, ty - 37 + i * 28], [tx + 18 + i * 5, ty + 18 - i * 22]], i === 1 ? '#fff' : b, 7, impact);
      burst(ctx, tx, ty, 28 * impact, 5, c, impact, 8, f);
      break;
    case 'apprentice_meteor':
      strokeLine(ctx, [[W * 0.44, -10 + p * 120], [W * 0.51, 15 + p * 100], [tx - 10, ty - 80 + p * 62]], c, 18, 0.8);
      burst(ctx, tx - 10, ty - 80 + p * 62, 25 + 8 * k, 11, b, 1, 8, f);
      if (impact) { burst(ctx, tx, ty, 62 * impact, 18 * impact, b, impact, 10, f); ring(ctx, tx, ty, 55 * impact, 19 * impact, a, 5, impact); }
      break;
    case 'acolyte_judgment':
      ring(ctx, tx, ty + 42, 45 + 32 * k, 14 + 8 * k, b, 4, k);
      fillPoly(ctx, [[tx - 15, -8], [tx + 10, -8], [tx + 24, ty + 20], [tx - 5, ty + 20]], a, 0.55 + impact * 0.4);
      strokeLine(ctx, [[tx - 1, -4], [tx + 2, ty + 48]], '#fffef2', 12 + 9 * k, 0.7);
      burst(ctx, tx, ty + 30, 30 * impact, 10, a, impact, 8, p);
      break;
    case 'warrior_execute':
      ring(ctx, tx, base - 5, 20 + 50 * t, 6 + 18 * t, b, 7, 0.8);
      strokeLine(ctx, [[selfX, ty + 4], [W * 0.45, ty + 12], [tx + 8, ty - 4]], a, 13, k);
      for (let i = 0; i < 5; i++) strokeLine(ctx, [[tx - 32 + i * 12, ty - 50], [tx - 14 + i * 12, ty + 22]], c, 3, impact);
      break;
    case 'rogue_assassinate':
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = 'rgba(18,12,35,0.75)'; ctx.fillRect(selfX + t * 140, selfY - 55, 30, 84); ctx.restore();
      strokeLine(ctx, [[selfX + t * 150, selfY - 48], [tx - 12, ty + 6]], a, 5, k);
      strokeLine(ctx, [[tx - 40, ty - 28], [tx + 27, ty + 26]], b, 10, impact);
      strokeLine(ctx, [[tx - 38, ty + 25], [tx + 35, ty - 24]], c, 7, impact);
      break;
    case 'mage_meteor':
      ring(ctx, tx, ty, 13 + 35 * t, 13 + 35 * t, a, 3, k);
      burst(ctx, W * 0.46 + t * 70, -14 + t * (ty + 8), 24 + 8 * k, 13, c, 1, 7, f);
      strokeLine(ctx, [[W * 0.46 + t * 70, -14 + t * (ty + 8)], [tx, ty]], a, 5, k);
      if (impact) { burst(ctx, tx, ty, 60 * impact, 20, b, impact, 12, p); for (let i = 0; i < 6; i++) drawPixelSpark(ctx, tx + Math.cos(i) * 30 * impact, ty + Math.sin(i) * 24 * impact, 8, a, impact); }
      break;
    case 'berserker_last_stand':
      ring(ctx, tx, base - 3, 20 + 56 * t, 8 + 20 * t, c, 8, k);
      for (let i = 0; i < 9; i++) {
        const x = tx + Math.cos(i * 0.7 + p) * (12 + 40 * t);
        const y = base - Math.abs(Math.sin(i * 0.8 + p)) * (14 + 44 * t);
        fillPoly(ctx, [[x, y - 23], [x + 9, y + 7], [x - 8, y + 2]], i % 2 ? b : c, k);
      }
      burst(ctx, tx, ty, 18 + 40 * impact, 8, b, impact, 11, p);
      break;
    case 'paladin_judgment':
      ring(ctx, tx, ty, 55 + 15 * k, 27 + 8 * k, a, 4, 0.85);
      strokeLine(ctx, [[tx, ty - 74], [tx, ty + 32]], a, 9, k);
      strokeLine(ctx, [[tx - 46, ty - 35], [tx - 21, ty - 12], [tx - 7, ty - 24]], b, 6, k);
      strokeLine(ctx, [[tx + 7, ty - 24], [tx + 24, ty - 12], [tx + 48, ty - 36]], b, 6, k);
      burst(ctx, tx, ty + 16, 37 * impact, 9, a, impact, 10, p);
      break;
    case 'necromancer_army':
      for (let i = 0; i < 5; i++) drawHand(ctx, tx - 54 + i * 26, base + 2, (t * 94 + i * 7) * Math.min(1, t * 1.7), i % 2 ? a : b, 0.95, 0.6 + (i % 3) * 0.12);
      ring(ctx, tx, base - 5, 15 + 44 * k, 6 + 13 * k, c, 4, 0.8);
      break;
    case 'chronomancer_stop':
      for (let i = 0; i < 4; i++) {
        ring(ctx, tx, ty, 22 + i * 15 + 8 * k, 18 + i * 8, i % 2 ? a : b, 3, 0.82, p * 4 + i, p * 4 + i + Math.PI * 1.45);
        const ang = p * 5 + i * Math.PI / 2;
        drawPixelSpark(ctx, tx + Math.cos(ang) * (27 + i * 14), ty + Math.sin(ang) * (21 + i * 7), 7, i % 2 ? c : a);
      }
      if (impact) { strokeLine(ctx, [[tx - 72, ty - 42], [tx - 28, ty], [tx - 72, ty + 43]], a, 5, impact); strokeLine(ctx, [[tx + 72, ty - 42], [tx + 28, ty], [tx + 72, ty + 43]], b, 5, impact); }
      break;
    case 'merchant_rain':
      for (let i = 0; i < 18; i++) {
        const x = ((i * 31 + f * 11) % (W - 30)) + 15;
        const y = ((i * 23 + f * 29) % 300);
        ring(ctx, x, y, 5 + (i % 3), 7 + (i % 3), i % 2 ? a : b, 3, 0.9);
        strokeLine(ctx, [[x, y - 5], [x - 2, y + 5]], c, 1.5, 0.8);
      }
      burst(ctx, tx, ty, 25 + 28 * impact, 12, a, impact, 8, f);
      break;
    case 'tycoon_zeni':
      for (let i = 0; i < 9; i++) {
        const ang = p * 2 + i * Math.PI * 2 / 9;
        const rr = 24 + 38 * t;
        const x = tx + Math.cos(ang) * rr;
        const y = ty + Math.sin(ang) * rr * 0.6;
        ring(ctx, x, y, 7 + (i % 3), 9 + (i % 3), a, 3, 0.95);
        ctx.save(); ctx.globalAlpha = Math.max(0.2, k); ctx.fillStyle = b;
        ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('Z', x, y + 4); ctx.restore();
      }
      ring(ctx, tx, ty, 22 + 48 * t, 12 + 24 * t, a, 4, k);
      burst(ctx, tx, ty, 28 * impact, 10, b, impact, 8, f);
      break;
    case 'cleric_wrath':
      strokeLine(ctx, [[tx - 80, 0], [tx - 20, ty - 36], [tx + 12, ty + 4]], a, 12, k);
      strokeLine(ctx, [[tx - 74, 0], [tx - 16, ty - 34], [tx + 12, ty + 4]], '#fff', 4, k);
      ring(ctx, tx, ty + 28, 42 + 20 * impact, 12 + 5 * impact, b, 4, impact);
      burst(ctx, tx, ty + 4, 32 * impact, 10, a, impact, 9, p);
      break;
    case 'ninja_eclipse':
      ctx.save(); ctx.globalAlpha = 0.9 * k; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(tx, ty, 33 + 9 * impact, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.9 * k; ctx.fillStyle = '#090b1c'; ctx.beginPath(); ctx.arc(tx + 17 * k, ty - 10 * k, 28 + 6 * impact, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      strokeLine(ctx, [[selfX, selfY], [selfX + 65 * t, selfY - 25], [tx - 30, ty + 3]], a, 5, k);
      for (let i = 0; i < 4; i++) {
        const ang = p * 7 + i * Math.PI / 2;
        const x = tx + Math.cos(ang) * 40, y = ty + Math.sin(ang) * 27;
        strokeLine(ctx, [[x - 10, y - 10], [x + 10, y + 10]], a, 5, impact);
        strokeLine(ctx, [[x - 10, y + 10], [x + 10, y - 10]], b, 5, impact);
      }
      break;
    case 'nightblade_eclipse':
      ring(ctx, tx, ty, 47 + 14 * k, 23 + 8 * k, c, 6, 0.95, p * 4, p * 4 + Math.PI * 1.7);
      ring(ctx, tx, ty, 34 + 12 * k, 44 + 12 * k, b, 4, 0.8, -p * 3, -p * 3 + Math.PI * 1.6);
      strokeLine(ctx, [[selfX + 10, selfY - 18], [tx - 48, ty - 37], [tx - 4, ty - 8], [tx + 43, ty + 29]], a, 5, k);
      burst(ctx, tx, ty, 25 * impact, 8, c, impact, 6, p);
      break;
    case 'monk_enlightenment':
    case 'god_hand_meditation':
      for (let i = 0; i < 5; i++) ring(ctx, tx, ty, 17 + i * 12 + 8 * k, 12 + i * 7 + 5 * k, i % 2 ? a : b, i === 0 ? 6 : 2, 0.8, p * 2 + i, p * 2 + i + Math.PI * 1.65);
      if (entry.style === 'god_hand_meditation') {
        strokeLine(ctx, [[tx - 20, ty + 36], [tx - 8, ty + 9], [tx - 1, ty + 20], [tx + 8, ty + 3], [tx + 21, ty + 35]], a, 8, k);
      } else {
        strokeLine(ctx, [[selfX - 20, selfY], [selfX - 40, selfY - 23], [selfX - 12, selfY - 15]], a, 8, k);
        strokeLine(ctx, [[selfX + 20, selfY], [selfX + 40, selfY - 23], [selfX + 12, selfY - 15]], b, 8, k);
      }
      burst(ctx, tx, ty, 28 * impact, 10, a, impact, 8, f);
      break;
    case 'dragonslayer_fall':
    case 'dragon_god_wing':
    case 'dragon_lord_wyrms':
      if (entry.style === 'dragonslayer_fall') {
        fillPoly(ctx, [[tx - 46, -8 + p * 70], [tx + 17, -8 + p * 70], [tx + 5, ty + 15], [tx - 18, ty + 15]], c, 0.75);
        strokeLine(ctx, [[tx - 12, -4 + p * 65], [tx + 3, ty + 11]], a, 10, 0.9);
      } else if (entry.style === 'dragon_god_wing') {
        fillPoly(ctx, [[tx, ty - 45], [tx - 70, ty - 76], [tx - 38, ty - 24], [tx - 58, ty - 9], [tx - 13, ty - 4]], b, k);
        fillPoly(ctx, [[tx + 2, ty - 45], [tx + 70, ty - 76], [tx + 38, ty - 24], [tx + 58, ty - 9], [tx + 14, ty - 4]], c, k);
      } else {
        for (let i = 0; i < 3; i++) strokeLine(ctx, [[tx - 90 + i * 15, ty - 46 + i * 17], [tx - 42, ty - 54 + i * 16], [tx + 8, ty - 22 + i * 14], [tx + 46, ty + 10]], i % 2 ? b : c, 9 - i, k);
      }
      if (impact) { burst(ctx, tx, ty + 18, 58 * impact, 19, b, impact, 12, f); for (let i = 0; i < 8; i++) drawPixelSpark(ctx, tx + Math.cos(i) * 44 * impact, ty + Math.sin(i) * 30 * impact, 8, a, impact); }
      break;
    case 'elemental_cataclysm':
    case 'avatar_cataclysm':
      for (let i = 0; i < 4; i++) {
        const ang = p * 4 + i * Math.PI / 2;
        const r = 30 + 20 * k;
        const x = tx + Math.cos(ang) * r, y = ty + Math.sin(ang) * r;
        if (entry.style === 'elemental_cataclysm') {
          if (i === 0) burst(ctx, x, y, 15, 6, a, 1, 6, ang);
          else if (i === 1) ring(ctx, x, y, 10, 10, b, 5, 1);
          else if (i === 2) strokeLine(ctx, [[x - 10, y - 10], [x + 10, y + 10]], c, 5);
          else fillPoly(ctx, [[x, y - 13], [x + 10, y + 9], [x - 10, y + 9]], a);
        } else burst(ctx, x, y, 20, 9, i % 2 ? b : c, 1, 7, ang);
      }
      ring(ctx, tx, ty, 20 + 46 * t, 20 + 25 * t, a, 4, k);
      if (impact) burst(ctx, tx, ty, 70 * impact, 24, b, impact, 16, f);
      break;
    case 'warlord_total_war':
      for (let i = 0; i < 5; i++) {
        const x = tx - 65 + i * 31;
        strokeLine(ctx, [[x, base], [x, base - 78 - 16 * Math.sin(i + p * 4)]], c, 5, k);
        fillPoly(ctx, [[x, base - 75], [x + 25, base - 64], [x, base - 52]], i % 2 ? b : a, k);
        strokeLine(ctx, [[x - 6, ty - 40 + i * 15], [x + 14, ty + 16]], a, 4, impact);
      }
      ring(ctx, tx, base - 4, 24 + 52 * t, 6 + 15 * t, b, 5, k);
      break;
    case 'doomslayer_crucible':
      ring(ctx, tx, base - 15, 22 + 47 * t, 13 + 17 * t, c, 6, k);
      ring(ctx, tx, base - 15, 40 * t, 22 * t, b, 3, k, p * 4, p * 4 + Math.PI * 1.7);
      for (let i = 0; i < 8; i++) {
        const x = tx + Math.cos(i * Math.PI / 4) * (15 + 36 * t);
        const y = base - 12 - Math.abs(Math.sin(i * Math.PI / 4)) * (20 + 40 * t);
        fillPoly(ctx, [[x - 5, y + 8], [x, y - 17], [x + 6, y + 3]], i % 2 ? b : c, k);
      }
      break;
    case 'warlock_soul_harvest':
    case 'death_lord_tether':
      strokeLine(ctx, [[selfX + 10, selfY - 12], [W * 0.44, ty - 55 * k], [tx, ty]], b, 5, k);
      strokeLine(ctx, [[selfX + 10, selfY - 12], [W * 0.44, ty - 55 * k], [tx, ty]], a, 2, k);
      if (entry.style === 'death_lord_tether') {
        for (let i = 0; i < 7; i++) {
          const x = selfX + 32 + (tx - selfX - 32) * i / 7;
          const y = ty - 14 * Math.sin(i * 2 + p * 5);
          ring(ctx, x, y, 5, 5, c, 3, k);
        }
      } else {
        // The soul silhouette is visibly pulled out of the target and toward the caster.
        const sx = tx - p * 85, sy = ty - 24 - 45 * k;
        ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = a;
        ctx.beginPath(); ctx.arc(sx, sy - 11, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(sx - 5, sy - 3, 10, 22);
        fillPoly(ctx, [[sx - 5, sy + 7], [sx - 18, sy + 20], [sx - 7, sy + 17]], a, k);
        fillPoly(ctx, [[sx + 5, sy + 7], [sx + 18, sy + 20], [sx + 7, sy + 17]], a, k);
        ctx.restore();
      }
      burst(ctx, tx, ty, 28 * impact, 10, c, impact, 8, f);
      break;
    case 'druid_thorn_surge':
    case 'archdruid_growth':
      for (let i = 0; i < 6; i++) {
        const x = tx - 64 + i * 26;
        const rise = (H * 0.28 + 12 * Math.sin(i + p * 5)) * t;
        strokeLine(ctx, [[x - 8, base], [x, base - rise * 0.45], [x + (i % 2 ? 12 : -12), base - rise]], i % 2 ? b : a, 6, k);
        fillPoly(ctx, [[x, base - rise], [x + 15, base - rise - 7], [x + 7, base - rise + 8]], c, k);
        fillPoly(ctx, [[x, base - rise * 0.6], [x - 16, base - rise * 0.6 - 5], [x - 7, base - rise * 0.6 + 7]], a, k);
      }
      ring(ctx, tx, base - 3, 20 + 40 * t, 6 + 13 * t, b, 3, k);
      break;
    case 'artificer_omega':
    case 'grand_inventor_orbital':
      for (let i = 0; i < 3; i++) {
        const rr = 25 + i * 19 + 8 * k;
        ring(ctx, tx, ty, rr, rr * 0.55, i % 2 ? b : a, 2.5, 0.8, p * 3 + i, p * 3 + i + Math.PI * 1.6);
        const ang = p * 6 + i * Math.PI * 2 / 3;
        drawPixelSpark(ctx, tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr * 0.55, 8, c);
      }
      if (entry.style === 'grand_inventor_orbital') {
        fillPoly(ctx, [[tx - 8, 0], [tx + 8, 0], [tx + 22, ty], [tx - 22, ty]], b, 0.55 + impact * 0.4);
        strokeLine(ctx, [[tx, 0], [tx, ty + 35]], a, 7, k);
      } else {
        strokeLine(ctx, [[selfX, selfY - 10], [W * 0.45, selfY - 10], [tx, ty]], c, 8, k);
        strokeLine(ctx, [[selfX, selfY - 10], [W * 0.45, selfY - 10], [tx, ty]], '#fff', 2, k);
      }
      break;
    case 'bard_crescendo':
    case 'virtuoso_requiem':
      for (let i = 0; i < 5; i++) {
        const radius = 15 + i * 11 + 30 * t;
        ring(ctx, tx, ty, radius, radius * (entry.style === 'bard_crescendo' ? 0.42 : 0.8), i % 2 ? b : a, 3, k, -0.4 + p, Math.PI * 1.5 + p);
        const nx = tx + Math.sin(i * 2 + p * 4) * (radius + 5);
        const ny = ty + Math.cos(i * 1.3 + p * 4) * (radius * 0.55);
        drawPixelSpark(ctx, nx, ny, 7, c, k);
      }
      if (entry.style === 'virtuoso_requiem') {
        for (let i = 0; i < 3; i++) { ring(ctx, tx - 34 + i * 34, ty + 16, 9, 13, c, 3, k); strokeLine(ctx, [[tx - 25 + i * 34, ty + 16], [tx - 25 + i * 34, ty - 20]], a, 3, k); }
      }
      break;
    case 'samurai_seven_cuts':
      for (let i = 0; i < 7; i++) {
        const q = Math.max(0, Math.min(1, t * 1.45 - i * 0.08));
        strokeLine(ctx, [[tx - 45 + i * 4, ty - 55 + i * 12], [tx + 38 - i * 5, ty - 25 + i * 12]], i % 2 ? a : b, 8 - (i % 3), q);
        strokeLine(ctx, [[tx - 36 + i * 3, ty - 54 + i * 12], [tx + 32 - i * 4, ty - 26 + i * 12]], '#fff5dc', 2, q);
      }
      burst(ctx, tx, ty, 26 * impact, 8, c, impact, 9, p);
      break;
    case 'lich_apocalypse':
      ctx.save(); ctx.globalAlpha = 0.7 * k; ctx.fillStyle = '#10101c'; ctx.beginPath(); ctx.arc(tx, ty, 25 + 35 * t, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ring(ctx, tx, ty, 35 + 30 * k, 35 + 30 * k, b, 4, k, p * 5, p * 5 + Math.PI * 1.8);
      burst(ctx, tx, ty, 30 + 40 * impact, 13, c, impact, 12, p);
      for (let i = 0; i < 2; i++) { drawPixelSpark(ctx, tx - 8 + i * 16, ty - 1, 5, a, k); }
      break;
    case 'timelord_paradox':
      for (let i = 0; i < 4; i++) {
        const ox = (i - 1.5) * 14 * k;
        ring(ctx, tx + ox, ty, 24 + i * 12, 34 - i * 3, i % 2 ? b : a, 2, 0.7, p * 5 + i, p * 5 + i + Math.PI * 1.25);
        strokeLine(ctx, [[tx - 64 + i * 30, ty - 53], [tx + 52 - i * 30, ty + 49]], c, 3, k);
      }
      break;
    case 'saint_wrath':
      fillPoly(ctx, [[tx, -5], [tx - 9, ty - 18], [tx + 9, ty - 18]], a, 0.9);
      strokeLine(ctx, [[tx, -5], [tx, ty + 51]], '#fff', 12, k);
      fillPoly(ctx, [[tx, ty - 30], [tx - 67, ty - 63], [tx - 35, ty - 21], [tx - 8, ty - 5]], b, k);
      fillPoly(ctx, [[tx, ty - 30], [tx + 67, ty - 63], [tx + 35, ty - 21], [tx + 8, ty - 5]], b, k);
      ring(ctx, tx, ty + 34, 42 + 15 * impact, 12, a, 4, impact);
      break;
    case 'archmage_singularity':
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#080a22'; ctx.beginPath(); ctx.arc(tx, ty, 12 + 24 * t, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      for (let i = 0; i < 5; i++) {
        const ang = p * 7 + i * Math.PI * 2 / 5;
        const rr = 27 + i * 8;
        drawPixelSpark(ctx, tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr * 0.62, 8, i % 2 ? b : a, 1);
      }
      ring(ctx, tx, ty, 30 + 12 * k, 21 + 9 * k, c, 4, k, p * 5, p * 5 + Math.PI * 1.7);
      break;
    case 'voidwalker_oblivion':
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * k; ctx.fillStyle = '#080610'; ctx.beginPath(); ctx.ellipse(tx, ty, 23 + 34 * t, 33 + 24 * t, p, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ring(ctx, tx, ty, 43 + 25 * k, 26 + 12 * k, c, 4, k, p * 5, p * 5 + Math.PI * 1.55);
      strokeLine(ctx, [[tx - 60, ty - 60], [tx - 13, ty - 12], [tx - 45, ty + 33], [tx + 8, ty + 4], [tx + 60, ty + 55]], b, 6, k);
      break;
    case 'templar_sanctuary':
      ring(ctx, tx, ty, 45 + 6 * k, 49 + 6 * k, a, 6, 0.9);
      ring(ctx, tx, ty, 28 + 7 * k, 31 + 6 * k, b, 3, k);
      fillPoly(ctx, [[tx, ty - 30], [tx + 23, ty - 18], [tx + 18, ty + 13], [tx, ty + 29], [tx - 18, ty + 13], [tx - 23, ty - 18]], c, 0.55 + impact * 0.2);
      strokeLine(ctx, [[tx, ty - 23], [tx, ty + 20]], '#fff', 4, k);
      strokeLine(ctx, [[tx - 14, ty - 2], [tx + 14, ty - 2]], '#fff', 4, k);
      break;
    case 'zenmaster_universe':
      for (let i = 0; i < 7; i++) {
        const ang = p * 3 + i * Math.PI * 2 / 7;
        const rr = 15 + i * 5;
        const x = tx + Math.cos(ang) * rr, y = ty + Math.sin(ang) * rr * 0.7;
        ring(ctx, x, y, 7 + 4 * k, 7 + 4 * k, i % 2 ? a : b, 2, 0.9);
        drawPixelSpark(ctx, x, y, 5, c, k);
      }
      ring(ctx, tx, ty, 42 + 22 * impact, 27 + 11 * impact, a, 4, impact);
      break;
    case 'shogun_empire':
      strokeLine(ctx, [[selfX, selfY - 30], [tx - 25, ty - 30]], a, 8, k);
      strokeLine(ctx, [[tx - 2, ty - 68], [tx - 2, ty + 18]], c, 5, k);
      fillPoly(ctx, [[tx, ty - 65], [tx + 33, ty - 48], [tx, ty - 31]], b, k);
      strokeLine(ctx, [[tx - 60, ty - 40], [tx + 58, ty + 35]], a, 8, impact);
      strokeLine(ctx, [[tx - 52, ty + 35], [tx + 62, ty - 40]], '#fff', 4, impact);
      break;
    case 'kage_shadows':
      for (let i = 0; i < 4; i++) {
        const ox = (i - 1.5) * 30 * (1 - t);
        ctx.save(); ctx.globalAlpha = 0.3 + 0.17 * i; ctx.fillStyle = c;
        ctx.fillRect(tx + ox - 7, ty - 40, 14, 63);
        ctx.beginPath(); ctx.arc(tx + ox, ty - 46, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      for (let i = 0; i < 6; i++) strokeLine(ctx, [[tx - 66 + i * 9, ty - 44], [tx + 25 - i * 3, ty + 34]], i % 2 ? a : b, 4, impact);
      break;
    case 'divine_fist_gates':
      for (let i = 0; i < 8; i++) {
        const radius = 12 + i * 7 + 25 * t;
        ring(ctx, tx, ty, radius, radius * 0.65, i % 2 ? a : b, 3, k, p * 4 + i * 0.2, p * 4 + i * 0.2 + Math.PI * 1.7);
      }
      if (impact) burst(ctx, tx, ty, 50 * impact, 16, c, impact, 12, f);
      break;
    case 'reaper_grim':
      drawSickle(ctx, tx, ty + 8, 0.75 + 0.35 * k, b, k);
      strokeLine(ctx, [[tx - 58, ty + 35], [tx - 6, ty - 35], [tx + 46, ty + 23]], a, 4, impact);
      ring(ctx, tx, ty, 35 + 24 * impact, 16 + 10 * impact, c, 3, impact);
      break;
    default:
      // Signature fallback stays animated, but does not replace any mapped style:
      // a class-specific rotating crest, projectile streaks and an impact burst.
      ring(ctx, tx, ty, 25 + 40 * t, 20 + 20 * t, a, 4, k, p * 5, p * 5 + Math.PI * 1.6);
      strokeLine(ctx, [[selfX, selfY], [selfX + (tx - selfX) * t, selfY + (ty - selfY) * t]], b, 8, k);
      burst(ctx, tx, ty, 35 * impact, 12, c, impact, 10, f);
  }

  // Shared impact pixels make every signature effect land on a readable hit.
  if (t > 0.68) {
    for (let i = 0; i < 7; i++) {
      const ang = i * Math.PI * 2 / 7 + f * 0.4;
      const rr = 16 + (t - 0.68) * 95;
      drawPixelSpark(ctx, tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr * 0.62, 5 + (i % 2) * 3, i % 2 ? a : b, Math.min(1, (t - 0.68) * 3.2));
    }
  }
}

async function renderSignatureGif(state, player, ability, entry, target, baseSceneBuffer, frameSink, layers, casterIndex, targetSide, focusIndex) {
  // ⚔️ FIX 2026-10-24: prefer the CACHED scene the player is already looking
  // at (stashed on the combat state by guildAdventure at every card send).
  // The old path re-rendered a full Go card mid-cast, which both cost 0.2-1.3s
  // of the 8s budget and raced the busy Go engine; the cache is instant and
  // always shows the enemy exactly as last seen (pre-hit).
  let baseBuffer = (Buffer.isBuffer(baseSceneBuffer) && baseSceneBuffer.length > 1000)
    ? baseSceneBuffer
    : await getBattleBackground(state, player, ability, target);
  let baseImage = null;
  if (baseBuffer) {
    try { baseImage = await loadImage(baseBuffer); } catch (e) { baseImage = null; }
  }
  // 💡 VFX LAYERS 2026-10-26: when the layered payload exists, flatten
  // bg + combatants (+ isolated focus) into one base so the GIF fallback shows
  // the exact same battlefield the mp4 lane used.
  let ax = null;
  if (layers && Buffer.isBuffer(layers.bg) && Buffer.isBuffer(layers.sprites)) {
    try {
      const bgI = await loadImage(layers.bg);
      const spI = await loadImage(layers.sprites);
      const flat = createCanvas(bgI.width, bgI.height);
      const fg = flat.getContext('2d');
      fg.drawImage(bgI, 0, 0);
      fg.drawImage(spI, 0, 0);
      if (layers.focus) { try { fg.drawImage(await loadImage(layers.focus), 0, 0); } catch (e2) {} }
      baseImage = flat;
      if (Array.isArray(layers.anchors) && layers.anchors.length) {
        const kx = W / (Number(layers.w) || 1024), ky = H / (Number(layers.h) || 687);
        const find = (side, idx) => layers.anchors.find((v) => v && v.side === side && v.index === idx);
        const ca = find('player', Math.max(0, Math.floor(Number(casterIndex) || 0))) || find('player', 0);
        // 💡 PVP VFX: the target can be the other DUELIST (side "player") -
        // targetSide picks the roster (defaults to "enemy" for raids) and
        // focusIndex carries the defender's real roster index (PvP only).
        const tSide = String(targetSide || 'enemy');
        const ti = Number.isFinite(Number(focusIndex)) ? Math.max(0, Math.floor(Number(focusIndex))) : Math.max(0, Math.floor(Number(target && target.index) || 0));
        const ta = find(tSide, ti) || layers.anchors.find((v) => v && v.side === tSide);
        ax = {
          self: ca ? [ca.x * kx, ca.feetY * ky] : null,
          enemy: ta ? [ta.x * kx, ta.feetY * ky] : null,
        };
      }
    } catch (e) { /* keep the plain base */ }
  }
  const frames = [];
  const classId = String(player.class?.id || player.classId || '').toUpperCase();
  for (let i = 0; i < FRAME_COUNT; i++) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const t = i / (FRAME_COUNT - 1);
    const k = Math.sin(Math.PI * t);
    // 💥 screen shake + zoom punch — the 'this is an ANIMATION' read at phone size
    const shakeAmp = i === IMPACT_FRAME ? 10 : (i === IMPACT_FRAME + 1 ? 6 : (i === FRAME_COUNT - 1 ? 0 : 1.5 + k * 2));
    const dx = Math.sin(i * 2.9 + 0.7) * shakeAmp;
    const dy = Math.cos(i * 3.7) * shakeAmp * 0.5;
    const zoom = 1 + 0.09 * k;
    if (baseImage) {
      ctx.save();
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.scale(zoom, zoom);
      ctx.drawImage(baseImage, -W / 2, -H / 2, W, H);
      ctx.restore();
    } else {
      fallbackBackground(ctx);
    }
    // 🌑 buildup dims the field so the impact pops; settle keeps a light veil
    const veil = i < IMPACT_FRAME ? (0.26 + 0.06 * i) : (i === IMPACT_FRAME ? 0.10 : (i === IMPACT_FRAME + 1 ? 0.16 : 0.24));
    ctx.fillStyle = 'rgba(4, 5, 13, ' + veil + ')';
    ctx.fillRect(0, 0, W, H);
    // ⚡ ONE warm flash frame at impact (never two — silhouette returns next
    // frame, so the GIF can never read as 'enemy vanished')
    if (i === IMPACT_FRAME) {
      ctx.fillStyle = 'rgba(255, 243, 205, 0.78)';
      ctx.fillRect(0, 0, W, H);
    } else if (i === IMPACT_FRAME + 1) {
      ctx.fillStyle = 'rgba(255, 210, 110, 0.20)';
      ctx.fillRect(0, 0, W, H);
    }
    // class overlay — scaled up around the target anchor on impact frames
    // (💡 VFX LAYERS: anchors pinned to the real sprite feet when available)
    const tx = ax && ax[entry.side === 'self' ? 'self' : 'enemy'] ? ax[entry.side === 'self' ? 'self' : 'enemy'][0] : (entry.side === 'self' ? W * 0.25 : W * 0.72);
    const ty = ax && ax[entry.side === 'self' ? 'self' : 'enemy'] ? ax[entry.side === 'self' ? 'self' : 'enemy'][1] : (entry.side === 'self' ? H * 0.53 : H * 0.55);
    const oScale = i >= IMPACT_FRAME ? 1.5 : 1 + 0.15 * k;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(oScale, oScale);
    ctx.translate(-tx, -ty);
    drawEffect(ctx, { ...entry, classId }, t, i, entry.side, ax);
    ctx.restore();
    // 🩸 settle frame: hit-tint + cracks linger on the target so the last
    // thing the eye keeps is 'that thing got HIT'
    if (i === FRAME_COUNT - 1 && baseImage) {
      const grad = ctx.createRadialGradient(tx, ty, 6, tx, ty, 78);
      grad.addColorStop(0, 'rgba(160, 20, 20, 0.34)');
      grad.addColorStop(1, 'rgba(160, 20, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(tx - 80, ty - 80, 160, 160);
      for (let ci = 0; ci < 3; ci++) {
        const ang = 0.5 + ci * 1.05;
        strokeLine(ctx, [[tx + Math.cos(ang) * 14, ty + Math.sin(ang) * 10], [tx + Math.cos(ang) * (46 + ci * 10), ty + Math.sin(ang) * (34 + ci * 8)]], '#1c0b12', 3, 0.85);
      }
    }
    if (typeof frameSink === 'function') { try { frameSink(i, canvas); } catch (e) {} }
    // Quantize each frame to 4 bits per channel so the repo's small GIF encoder
    // keeps combat art recognizable instead of carrying millions of near-colors.
    const raw = ctx.getImageData(0, 0, W, H).data;
    const rgba = Buffer.from(raw);
    for (let p = 0; p < rgba.length; p += 4) {
      rgba[p] = Math.round(rgba[p] / 17) * 17;
      rgba[p + 1] = Math.round(rgba[p + 1] / 17) * 17;
      rgba[p + 2] = Math.round(rgba[p + 2] / 17) * 17;
    }
    frames.push(rgba);
  }
  return encodeGif({ width: W, height: H, frames, delayMs: FRAME_DELAY_MS, loop: 1 });
}

async function animateUltimate(options = {}) {
  const state = options.state;
  const player = options.player;
  const ability = options.ability;
  if (!state || !player || !ability || player.isEnemy || player.isSummon) return false;
  const classId = String(player.class?.id || player.classId || '').toUpperCase();
  const entry = resolveSignature(classId, ability);
  const isCombatContext = state.inCombat === true || String(state.phase || '').toUpperCase() === 'COMBAT';
  if (!entry || !isCombatContext) return false;

  const liveEnemies = (state.enemies || []).filter((e) => e && !e.isDead && Number(e.currentHP ?? e.stats?.hp ?? 1) > 0);
  const requestedIndex = Number.isFinite(Number(options.targetIndex)) ? Number(options.targetIndex) : -1;
  const target = liveEnemies.find((e) => e && Number(e.index) === requestedIndex)
    || (requestedIndex >= 0 && state.enemies ? state.enemies[requestedIndex] : null)
    || liveEnemies[0]
    || null;
  // 🔴 HIT REACTION HP (owner 2026-10-26: "the hp bar drops"): pre-hit HP of
  // every live victim, keyed to the Go anchors' index convention so the video
  // can chip the overhead bars down at the impact moment. In PvP duels the
  // defender arrives as pseudo-enemy index 0 but anchors on the PLAYER roster
  // at focusIndex - rekey entry 0 there so the bar lands on the right duelist.
  const _tSide = String(options.targetSide || 'enemy');
  const _focusIdx = Number.isFinite(Number(options.focusIndex)) ? Math.max(0, Math.floor(Number(options.focusIndex))) : null;
  const victimStats = liveEnemies.map((e, i) => ({
    index: (_tSide === 'player' && _focusIdx !== null && i === 0)
      ? _focusIdx
      : Math.max(0, Math.floor(Number(e.index) || 0)),
    hp: Math.max(0, Math.floor(Number(e.currentHP ?? e.hp ?? e.stats?.hp ?? 0))),
    maxHp: Math.max(1, Math.floor(Number(e.stats?.maxHp ?? e.maxHp ?? e.stats?.hp ?? 1))),
  }));
  // ⚔️ FIX 2026-10-24: enemy-side signatures with NO live enemy target would
  // render an empty battlefield (the reported 'image card with the enemy
  // gone'). Skip the whole animation and let the normal resolution proceed.
  if (entry.side === 'enemy' && !target) {
    console.log('[SkillVFX] skip ' + classId + '/' + ability.id + ' — enemy-side ult with no live target');
    return false;
  }
  const sendText = typeof options.sendText === 'function' ? options.sendText : async () => {};
  const sendGif = typeof options.sendGif === 'function' ? options.sendGif : async () => ({ ok: false });
  const name = ability.name || entry.id.replace(/_/g, ' ');
  const icon = player.class?.icon || '⚔️';
  const messages = [
    '🔮 *ULTIMATE CHARGING* 🔮\n' + icon + ' *' + (player.name || 'The champion') + '* begins channeling *' + name + '*...\n_The air begins to tremble._',
    '⚡ *POWER RISING* ⚡\n*' + name + '* is gathering overwhelming energy.\n_The battlefield starts to distort._',
    '💥 *ALMOST READY* 💥\n*' + name + '* is about to be unleashed!\n_Prepare for impact._'
  ];
  try {
    for (let i = 0; i < messages.length; i++) {
      await sendText(messages[i]);
      if (i < messages.length - 1) await wait(i === 0 ? 400 : 450);
    }
    const cacheHit = Buffer.isBuffer(options.baseSceneBuffer) && options.baseSceneBuffer.length > 1000;
    console.log('[SkillVFX] cast ' + classId + '/' + ability.id + ' entry=' + entry.style + ' cache=' + (cacheHit ? 'hit' : 'miss') + ' target=' + (target && (target.name || target.id) || 'enemy'));
    const renderT0 = Date.now();
    // 2026-10-25: sprite-sheet engine first (real VFX frames, 15fps MP4); the
    // legacy hand-drawn GIF renderer stays as the fallback.
    let vid = null;
    // ⚔️ inherited ults render with the OWNING class's recipe + palette
    const fxClass = String(entry.ownerClass || classId).toUpperCase();
    try {
      vid = await raceTimeout(require('./ultimateFx').renderUltimateVideo({
        baseBuffer: options.baseSceneBuffer, classId: fxClass, name, side: entry.side, palette: PALETTE[fxClass] || PALETTE[classId],
        // 💡 HUD 2026-10-26: the video draws its own left HUD rail as the FINAL
        // pass (above every effect) from the caster's live combat data.
        hud: options.hudData || null,
        // 💡 VFX LAYERS 2026-10-26: layered base (bg + combatants overlay +
        // isolated focus target + real feet anchors) - ground fx under the
        // fighters, air fx over them, spell origins on the actual sprites.
        layers: options.layers || null,
        casterIndex: Number.isFinite(Number(options.casterIndex)) ? Number(options.casterIndex) : 0,
        targetIndex: Number(target && target.index),
        // 💡 PVP VFX (2026-10-26, owner: "I dont see the vfx in pvps dude"):
        // duel targets are the other duelist - Go anchors report them as side
        // "player", so the target anchor lookup must switch rosters.
        targetSide: String(options.targetSide || 'enemy'),
        // the defender's index on the PLAYER roster (PvP only) - targetIndex 0
        // is the pseudo-enemy index and would anchor the wrong duelist
        focusIndex: Number.isFinite(Number(options.focusIndex)) ? Number(options.focusIndex) : undefined,
        // 💡 MULTI-TARGET (2026-10-26, owner: "grab the individual or multiple
        // enemy sprites and affect them"): AoE casts fan the impact tracks per
        // enemy anchor and tint the WHOLE enemy roster, not just the focus
        aoe: !!options.aoe,
        // 🔴 HIT REACTION (owner: "hurt red flashing overlay + the hp bar drops"):
        // pre-hit per-victim HP for the animated overhead-bar chip
        targets: victimStats
      }), 9000);
    } catch (e) { console.warn('[SkillVFX] sprite engine failed:', e?.message || e); }
    const gif = vid && vid.mp4 ? vid.mp4 : await raceTimeout(
      renderSignatureGif(state, player, ability, entry, target, options.baseSceneBuffer, null, options.layers || null, options.casterIndex, options.targetSide, options.focusIndex),
      8000
    );
    if (gif && Buffer.isBuffer(gif) && gif.length > 100) {
      console.log('[SkillVFX] ' + (vid && vid.mp4 ? 'sprite mp4 ' : 'gif ') + gif.length + 'B in ' + (Date.now() - renderT0) + 'ms');
      const mediaResult = await sendGif(gif, '💥 *' + name + '* UNLEASHED!', vid && vid.thumb ? { thumb: vid.thumb } : null);
      console.log('[SkillVFX] send ok=' + (mediaResult && mediaResult.ok !== false) + ' late=' + Boolean(mediaResult && mediaResult.late));
      if (mediaResult && mediaResult.ok !== false) await wait(GIF_PLAYBACK_MS);
      else await wait(350);
    } else {
      console.warn('[SkillVFX] render null/timeout after 8s — text fallback for ' + classId + '/' + ability.id);
      await sendText('💥 *' + name + '* is unleashed!');
    }
    return true;
  } catch (err) {
    console.warn('[SkillVFX] ultimate animation failed for ' + classId + '/' + ability.id + ':', err?.message || err);
    return false;
  }
}

// 💡 PVP VFX (2026-10-26, owner: "I dont see the vfx in pvps dude"): shared
// bounded media sender for ultimate videos - the exact recipe the PVE cast
// site uses in guildAdventure (finished H.264 MP4 straight to the video lane,
// raw GIF -> MP4 via the shared converters, JPEG still fallback, text last
// resort; every send raced so a wedged socket can never freeze the duel turn).
// Exported so PvP duels reuse it instead of duplicating the 60 lines.
function makeUltimateSender(sock, chatId) {
  const sendText = async (text) => {
    try { await sock.sendMessage(chatId, { text }); } catch (e) {
      console.warn('[SkillVFX] charge text send failed:', e?.message || e);
    }
  };
  const sendGif = async (buffer, caption, extra) => {
    try {
      // sprite engine hands over a finished H.264 MP4 (+ JPEG thumb): send as-is
      if (Buffer.isBuffer(buffer) && buffer.length > 500 && buffer.toString('latin1', 4, 8) === 'ftyp') {
        const pl = { video: buffer, mimetype: 'video/mp4', caption, gifPlayback: true };
        if (extra && Buffer.isBuffer(extra.thumb)) pl.jpegThumbnail = extra.thumb;
        return { ok: true, result: await sock.sendMessage(chatId, pl) };
      }
      // WhatsApp's GIF-style video lane requires H.264 MP4 bytes, not a raw
      // GIF in the video field - same converters the summon/reaction/fishing
      // animations already use.
      const gif89a = require('../utils/gif89a');
      const { gifToMp4Even } = require('../utils/mediaConvert');
      if (!gif89a.isGifBuffer(buffer)) throw new Error('renderer did not return a valid GIF buffer');
      const mp4Buffer = await gifToMp4Even(buffer);
      const jpegThumbnail = gif89a.firstFrameJpeg(buffer);
      if (!Buffer.isBuffer(mp4Buffer) || mp4Buffer.length < 500 ||
          mp4Buffer.toString('latin1', 4, 8) !== 'ftyp') {
        throw new Error('GIF conversion did not produce a valid MP4');
      }
      const payload = { video: mp4Buffer, mimetype: 'video/mp4', caption, gifPlayback: true };
      if (Buffer.isBuffer(jpegThumbnail) && jpegThumbnail.length > 500) payload.jpegThumbnail = jpegThumbnail;
      console.log(`[SkillVFX] converted ultimate GIF ${buffer.length}B → MP4 ${mp4Buffer.length}B`);
      return { ok: true, result: await sock.sendMessage(chatId, payload) };
    } catch (convertError) {
      console.error('[SkillVFX] GIF→MP4 failed:', convertError?.message || convertError);
      // Still show the rendered first frame if transcoding fails.
      try {
        const gif89a = require('../utils/gif89a');
        const still = gif89a.firstFrameJpeg(buffer);
        if (Buffer.isBuffer(still) && still.length > 100) {
          return { ok: true, result: await sock.sendMessage(chatId, {
            image: still, caption: caption + '\n_(Animation unavailable on this server.)_' }) };
        }
      } catch (stillErr) { /* fall through to text */ }
      try { await sock.sendMessage(chatId, { text: '⚠️ The ultimate animation could not be encoded. The skill will still resolve normally.' }); } catch (e) {}
      return { ok: false };
    }
  };
  return { sendText, sendGif };
}

module.exports = {
  SIGNATURE_SKILLS,
  getSignature,
  resolveSignature,
  animateUltimate,
  makeUltimateSender,
  renderSignatureGif,
  GIF_PLAYBACK_MS,
  FRAME_COUNT
};
