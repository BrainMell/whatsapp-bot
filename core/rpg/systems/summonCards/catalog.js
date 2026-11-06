'use strict';
// 🃏 SUMMON CARD CATALOG (deck-builder style). Pure data - add a card by adding an entry.
// type:   ATTACK (red) | SKILL (blue) | POWER (violet)
// target: 'enemy' (pick one) | 'all' (every living enemy) | 'self' | 'party'
// effects (resolved in index.js):
//   {kind:'damage', mult, stat?:'mag'|'atk', dmgType?:'magic'|'physical'}   damage to the card's enemy targets
//   {kind:'status', type, duration, value}                                  status on the card's enemy targets
//   {kind:'drain', pct}                                                     heal caster for pct of damage dealt
//   {kind:'shield', mult, duration?}      absorb shield = caster def*mult (+mag) on self/party
//   {kind:'heal', mult}                   heal = caster mag*mult on self/party
//   {kind:'buff', type, duration, value}  status on self/party (haste/regen/blessing/berserk...)
//   {kind:'taunt', duration}              every living enemy is forced onto the caster
//   {kind:'energy', amount}               refund energy to the caster
// art: file in core/rpgasset/summons/sparklinlabs_abyss (or summons/) used until a <id>.png appears in core/rpgasset/summoncards/
const C = (o) => Object.freeze(Object.assign({ effects: [], cooldownTurns: 3, target: 'enemy' }, o));

const CARD_CATALOG = Object.freeze({
  // ── LEGENDARY ──────────────────────────────────────────────
  ifrit: C({ id: 'ifrit', name: 'Ifrit', icon: '🔥', element: 'FIRE', rarity: 'LEGENDARY', type: 'ATTACK', art: '../ifrit_fire.png',
    abilityName: 'Inferno Rend', energyCost: 30, cooldownTurns: 3, vfx: 'Fire-bomb', sprite: 'ifrit_fire.png',
    effects: [{ kind: 'damage', mult: 1.75 }, { kind: 'status', type: 'burn', duration: 2, value: 14 }],
    description: 'Deal 175% magic damage. Burn the target for 2 turns.' }),
  leviathan: C({ id: 'leviathan', name: 'Leviathan', icon: '🌊', element: 'WATER', rarity: 'LEGENDARY', type: 'ATTACK', art: '../leviathan_water.png',
    abilityName: 'Tidal Prison', energyCost: 36, cooldownTurns: 4, vfx: 'Lightning', sprite: 'leviathan_water.png',
    effects: [{ kind: 'damage', mult: 1.55 }, { kind: 'status', type: 'slow', duration: 2, value: 25 }],
    description: 'Deal 155% magic damage. Slow the target for 2 turns.' }),
  shiva: C({ id: 'shiva', name: 'Shiva', icon: '❄️', element: 'ICE', rarity: 'LEGENDARY', type: 'ATTACK', art: '../shiva_ice.png',
    abilityName: 'Absolute Zero', energyCost: 42, cooldownTurns: 5, vfx: 'Holy VFX 02', sprite: 'shiva_ice.png',
    effects: [{ kind: 'damage', mult: 1.45 }, { kind: 'status', type: 'freeze', duration: 1, value: 0 }],
    description: 'Deal 145% magic damage. Freeze the target for 1 turn.' }),
  // ── RARE ───────────────────────────────────────────────────
  pyraxis: C({ id: 'pyraxis', name: 'Pyraxis', icon: '🐉', element: 'FIRE', rarity: 'RARE', type: 'ATTACK', art: 'dragon.png', target: 'all',
    abilityName: 'Dragonfire Sweep', energyCost: 48, cooldownTurns: 5, vfx: 'Fire-bomb',
    effects: [{ kind: 'damage', mult: 1.05 }, { kind: 'status', type: 'burn', duration: 2, value: 12 }],
    description: 'Deal 105% damage to ALL enemies. Burn them for 2 turns.' }),
  colossus: C({ id: 'colossus', name: 'Colossus', icon: '🗿', element: 'EARTH', rarity: 'RARE', type: 'SKILL', art: 'giant.png', target: 'party',
    abilityName: 'Stone Bulwark', energyCost: 34, cooldownTurns: 4, vfx: 'Holy VFX 02',
    effects: [{ kind: 'shield', mult: 2.2, duration: 3 }, { kind: 'taunt', duration: 1 }],
    description: 'Shield the whole party. Enemies are forced to hit you for 1 turn.' }),
  frostbeard: C({ id: 'frostbeard', name: 'Frostbeard', icon: '🦣', element: 'ICE', rarity: 'RARE', type: 'ATTACK', art: 'yeti.png',
    abilityName: 'Avalanche Roar', energyCost: 38, cooldownTurns: 4, vfx: 'Holy VFX 02',
    effects: [{ kind: 'damage', mult: 1.6, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'slow', duration: 2, value: 30 }],
    description: 'Deal 160% physical damage. Slow the target for 2 turns.' }),
  nauticus: C({ id: 'nauticus', name: 'Nauticus', icon: '🛸', element: 'LIGHTNING', rarity: 'RARE', type: 'ATTACK', art: 'ship_squid.png',
    abilityName: 'Arc Lance', energyCost: 40, cooldownTurns: 5, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.5 }, { kind: 'status', type: 'shock', duration: 2, value: 12 }],
    description: 'Deal 150% damage. Shock the target for 2 turns.' }),
  starnail: C({ id: 'starnail', name: 'Starnail', icon: '💎', element: 'EARTH', rarity: 'RARE', type: 'ATTACK', art: 'starnail.png',
    abilityName: 'Meteor Shard', energyCost: 44, cooldownTurns: 5, vfx: 'Fire-bomb',
    effects: [{ kind: 'damage', mult: 2.3, stat: 'atk', dmgType: 'physical' }],
    description: 'Deal 230% physical damage. Hits like the meteor it carries.' }),
  fireguard: C({ id: 'fireguard', name: 'Fire Guard', icon: '🔥', element: 'FIRE', rarity: 'RARE', type: 'SKILL', art: 'fireguard.png', target: 'self',
    abilityName: 'Molten Aegis', energyCost: 30, cooldownTurns: 4, vfx: 'Fire-bomb',
    effects: [{ kind: 'shield', mult: 3.0, duration: 3 }, { kind: 'taunt', duration: 2 }],
    description: 'Gain a heavy shield. Enemies are forced to hit you for 2 turns.' }),
  tidalmaw: C({ id: 'tidalmaw', name: 'Tidalmaw', icon: '🪸', element: 'WATER', rarity: 'RARE', type: 'ATTACK', art: 'tidalmaw.png',
    abilityName: 'Undertow Grasp', energyCost: 36, cooldownTurns: 4, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.2 }, { kind: 'status', type: 'root', duration: 2, value: 0 }],
    description: 'Deal 120% damage. Root the target for 2 turns.' }),
  // ── UNCOMMON ───────────────────────────────────────────────
  lumenmoth: C({ id: 'lumenmoth', name: 'Lumenmoth', icon: '🦋', element: 'LIGHT', rarity: 'UNCOMMON', type: 'SKILL', art: 'lumenmoth.png', target: 'party',
    abilityName: 'Guiding Light', energyCost: 34, cooldownTurns: 4, vfx: 'Holy VFX 02',
    effects: [{ kind: 'heal', mult: 1.1 }, { kind: 'buff', type: 'blessing', duration: 2, value: 20 }],
    description: 'Heal the whole party. Bless them for 2 turns.' }),
  rexor: C({ id: 'rexor', name: 'Rexor', icon: '🦖', element: 'BEAST', rarity: 'UNCOMMON', type: 'ATTACK', art: 'dino.png',
    abilityName: 'Crushing Jaws', energyCost: 30, cooldownTurns: 3, vfx: 'Fire-bomb',
    effects: [{ kind: 'damage', mult: 1.9, stat: 'atk', dmgType: 'physical' }],
    description: 'Deal 190% physical damage.' }),
  krakenling: C({ id: 'krakenling', name: 'Krakenling', icon: '🐙', element: 'WATER', rarity: 'UNCOMMON', type: 'ATTACK', art: 'octopus.png',
    abilityName: 'Tentacle Crush', energyCost: 28, cooldownTurns: 3, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.4, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'slow', duration: 1, value: 20 }],
    description: 'Deal 140% physical damage. Slow the target for 1 turn.' }),
  trickbox: C({ id: 'trickbox', name: 'Trickbox', icon: '🎁', element: 'ARCANE', rarity: 'UNCOMMON', type: 'SKILL', art: 'mimic.png',
    abilityName: 'Cursed Lure', energyCost: 24, cooldownTurns: 3, vfx: 'Holy VFX 02',
    effects: [{ kind: 'status', type: 'vulnerability', duration: 3, value: 25 }, { kind: 'status', type: 'weak', duration: 3, value: 20 }, { kind: 'energy', amount: 10 }],
    description: 'Make the target Vulnerable and Weakened for 3 turns. Refund 10 energy.' }),
  emberwick: C({ id: 'emberwick', name: 'Emberwick', icon: '🕯️', element: 'FIRE', rarity: 'UNCOMMON', type: 'POWER', art: 'emberwick.png', target: 'self',
    abilityName: 'Candle Ward', energyCost: 26, cooldownTurns: 4, vfx: 'Fire-bomb',
    effects: [{ kind: 'shield', mult: 1.6, duration: 3 }, { kind: 'buff', type: 'regen', duration: 3, value: 14 }],
    description: 'Gain a shield and regenerate health for 3 turns.' }),
  skitterswarm: C({ id: 'skitterswarm', name: 'Skitterswarm', icon: '🪲', element: 'PLAGUE', rarity: 'UNCOMMON', type: 'ATTACK', art: 'skitterswarm.png', target: 'all',
    abilityName: 'Swarm Surge', energyCost: 32, cooldownTurns: 4, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 0.75, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'bleed', duration: 2, value: 10 }],
    description: 'Deal 75% damage to ALL enemies. Make them bleed for 2 turns.' }),
  // ── COMMON ─────────────────────────────────────────────────
  nocturne: C({ id: 'nocturne', name: 'Nocturne', icon: '🦇', element: 'SHADOW', rarity: 'COMMON', type: 'ATTACK', art: 'bat.png',
    abilityName: 'Night Drain', energyCost: 18, cooldownTurns: 2, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.2 }, { kind: 'drain', pct: 0.5 }],
    description: 'Deal 120% damage. Heal for half the damage dealt.' }),
  tuskgore: C({ id: 'tuskgore', name: 'Tuskgore', icon: '🐗', element: 'EARTH', rarity: 'COMMON', type: 'ATTACK', art: 'boar.png',
    abilityName: 'Bonebreaker Charge', energyCost: 20, cooldownTurns: 2, vfx: 'Fire-bomb',
    effects: [{ kind: 'damage', mult: 1.45, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'bleed', duration: 2, value: 10 }],
    description: 'Deal 145% physical damage. Cause bleeding for 2 turns.' }),
  wraithveil: C({ id: 'wraithveil', name: 'Wraithveil', icon: '👻', element: 'SHADOW', rarity: 'COMMON', type: 'SKILL', art: 'ghost.png',
    abilityName: 'Spectral Hex', energyCost: 20, cooldownTurns: 2, vfx: 'Holy VFX 02',
    effects: [{ kind: 'status', type: 'curse', duration: 3, value: 20 }, { kind: 'status', type: 'weak', duration: 2, value: 15 }],
    description: 'Curse and Weaken the target for a few turns.' }),
  sporelord: C({ id: 'sporelord', name: 'Sporelord', icon: '🍄', element: 'NATURE', rarity: 'COMMON', type: 'ATTACK', art: 'mushroom.png',
    abilityName: 'Toxic Spores', energyCost: 18, cooldownTurns: 2, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 0.9 }, { kind: 'status', type: 'poison', duration: 3, value: 12 }],
    description: 'Deal 90% damage. Poison the target for 3 turns.' }),
  vipertongue: C({ id: 'vipertongue', name: 'Vipertongue', icon: '🐍', element: 'POISON', rarity: 'COMMON', type: 'ATTACK', art: 'snake.png',
    abilityName: 'Lightning Strike', energyCost: 16, cooldownTurns: 2, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.3, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'poison', duration: 2, value: 10 }],
    description: 'Deal 130% physical damage. Poison the target for 2 turns.' }),
  gelatrix: C({ id: 'gelatrix', name: 'Gelatrix', icon: '🟢', element: 'NATURE', rarity: 'COMMON', type: 'SKILL', art: 'slime.png', target: 'self',
    abilityName: 'Gel Wall', energyCost: 16, cooldownTurns: 2, vfx: 'Holy VFX 02',
    effects: [{ kind: 'shield', mult: 1.4, duration: 2 }, { kind: 'heal', mult: 0.5 }],
    description: 'Gain a shield and heal a little.' }),
  frostpeep: C({ id: 'frostpeep', name: 'Frostpeep', icon: '❄️', element: 'ICE', rarity: 'COMMON', type: 'ATTACK', art: 'frostpeep.png',
    abilityName: 'Chill Peck', energyCost: 16, cooldownTurns: 2, vfx: 'Holy VFX 02',
    effects: [{ kind: 'damage', mult: 1.1 }, { kind: 'status', type: 'slow', duration: 2, value: 20 }],
    description: 'Deal 110% damage. Slow the target for 2 turns.' }),
  plaguefang: C({ id: 'plaguefang', name: 'Plaguefang', icon: '🐺', element: 'PLAGUE', rarity: 'COMMON', type: 'ATTACK', art: 'plaguefang.png',
    abilityName: 'Rotting Bite', energyCost: 18, cooldownTurns: 2, vfx: 'Lightning',
    effects: [{ kind: 'damage', mult: 1.2, stat: 'atk', dmgType: 'physical' }, { kind: 'status', type: 'poison', duration: 3, value: 8 }, { kind: 'status', type: 'bleed', duration: 2, value: 8 }],
    description: 'Deal 120% physical damage. Poison and bleed the target.' }),
  boglurk: C({ id: 'boglurk', name: 'Boglurk', icon: '🟫', element: 'NATURE', rarity: 'COMMON', type: 'POWER', art: 'boglurk.png', target: 'self',
    abilityName: 'Rooted Stance', energyCost: 18, cooldownTurns: 3, vfx: 'Holy VFX 02',
    effects: [{ kind: 'shield', mult: 1.8, duration: 3 }, { kind: 'buff', type: 'regen', duration: 2, value: 10 }],
    description: 'Gain a shield and regenerate for 2 turns.' }),
});

const CARD_ALIASES = Object.freeze({
  flame: 'ifrit', fire: 'ifrit', inferno: 'ifrit', tide: 'leviathan', water: 'leviathan', ice: 'shiva', frost: 'shiva',
  dragon: 'pyraxis', giant: 'colossus', yeti: 'frostbeard', squid: 'nauticus', crystal: 'starnail', dino: 'rexor',
  octopus: 'krakenling', mimic: 'trickbox', moth: 'lumenmoth', bat: 'nocturne', boar: 'tuskgore', ghost: 'wraithveil',
  mushroom: 'sporelord', snake: 'vipertongue', slime: 'gelatrix', chick: 'frostpeep', jackal: 'plaguefang', swarm: 'skitterswarm',
});

const RARITY = Object.freeze({
  COMMON:    { label: 'COMMON',    color: '#b9bec7', glow: '#8d949f', rank: 0 },
  UNCOMMON:  { label: 'UNCOMMON',  color: '#5fd38a', glow: '#2e9b5b', rank: 1 },
  RARE:      { label: 'RARE',      color: '#59a8ff', glow: '#2d6fd1', rank: 2 },
  LEGENDARY: { label: 'LEGENDARY', color: '#ffc94a', glow: '#d98a12', rank: 3 },
});
const TYPE_STYLE = Object.freeze({
  ATTACK: { label: 'ATTACK', a: '#c0392b', b: '#7a1a14' },
  SKILL:  { label: 'SKILL',  a: '#2f7fd1', b: '#164a8a' },
  POWER:  { label: 'POWER',  a: '#8e4fd1', b: '#4d2287' },
});
const ELEMENT_COLORS = Object.freeze({
  FIRE: '#ff7a2e', WATER: '#3aa0ff', ICE: '#8fe3ff', EARTH: '#b08a4f', LIGHT: '#fff0a0', LIGHTNING: '#ffe84a',
  SHADOW: '#9a6bd6', NATURE: '#5fd35f', POISON: '#9acd32', PLAGUE: '#9fbf3a', BEAST: '#d98c4a', ARCANE: '#d66bd6',
});

module.exports = { CARD_CATALOG, CARD_ALIASES, RARITY, TYPE_STYLE, ELEMENT_COLORS };
