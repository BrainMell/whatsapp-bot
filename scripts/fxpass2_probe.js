// probe bar geometry: anchors, s, name widths — why doesn't the noName guard skip 'mellow'?
const { generateCombatLayers } = require('../core/rpg/systems/combat/combatImageGenerator');
const hud = require('../core/rpg/systems/combat/combatHud');
const { createCanvas } = require('canvas');

const mk = (name, spriteIndex, hp) => ({
  name, class: { id: 'RANGER' }, level: 42, currentHP: hp, maxHp: 1925,
  stats: { hp, maxHp: 1925, energy: 857, maxEnergy: 878, def: 120 },
  energy: 857, maxEnergy: 878, adventurerRank: 'A', spriteIndex, statusEffects: [], jid: 'qa@s.whatsapp.net',
});
const mkE = (name, spriteIndex, hp) => ({
  name, isEnemy: true, level: 40, currentHP: hp, maxHp: 2400,
  stats: { hp, maxHp: 2400, level: 40 }, spriteIndex, statusEffects: [],
});

(async () => {
  const players = [mk('thefirsttloser', 3, 1045), mk('mellow', 7, 1620), mk('vet', 12, 300)];
  const enemies = [mkE('Leviathan Spawn', 27, 2400), mkE('Leviathan Spawn', 27, 1786)];
  const layers = await generateCombatLayers(players, enemies, { combatType: 'PVE', rank: 'A', floor: 0, summons: [], hud: 'none-clean', bypassQueue: true });
  const W = layers.w, H = layers.h, s = W / hud.DW;
  console.log(`W=${W} H=${H} DW=${hud.DW} s=${s.toFixed(3)}`);
  const cv = createCanvas(10, 10), c = cv.getContext('2d');
  for (const a of layers.anchors) {
    c.font = `bold ${12 * s}px sans-serif`;
    const nm = a.side === 'enemy' ? enemies[a.index].name : players[a.index].name;
    const w = c.measureText(nm).width;
    console.log(`${a.side}[${a.index}] "${nm}" x=${a.x.toFixed(1)} feetY=${a.feetY} w=${a.w} h=${a.h} nameW=${w.toFixed(1)} startXS=${(a.x * s - w / 2).toFixed(1)} endXS=${(a.x * s + w / 2).toFixed(1)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
