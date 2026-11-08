// Summon GIF cache test: identical payload twice -> expect MISS (17-35s) then HIT (instant), byte-identical.
const goService = require('../core/utils/goImageService');
const combatImageGen = require('../core/rpg/systems/combat/combatImageGenerator');

const mkPlayer = (name, spriteIndex, hp) => ({
  name, class: { id: 'RANGER' }, level: 42, currentHP: hp, maxHp: 1925,
  stats: { hp, maxHp: 1925, energy: 777, maxEnergy: 878, def: 120 },
  energy: 777, maxEnergy: 878, adventurerRank: 'A', spriteIndex, statusEffects: [], jid: 'qa@s.whatsapp.net',
});
const mkEnemy = (name, spriteIndex, hp) => ({
  name, isEnemy: true, level: 40, currentHP: hp, maxHp: 2400,
  stats: { hp, maxHp: 2400, level: 40 }, spriteIndex, statusEffects: [],
});

(async () => {
  const players = [mkPlayer('thefirsttloser', 3, 1722)];
  const enemies = [mkEnemy('Leviathan Spawn', 27, 1786)];
  const payload = combatImageGen._buildPayload(players, enemies, { rank: 'A', floor: 0, combatType: 'PVE' });
  payload.cardId = 'ifrit';
  payload.action = combatImageGen._buildActionPayload({
    attackerSide: 'player', attackerIndex: 0, targetSide: 'enemy', targetIndex: 0,
    skillName: 'Firebomb', element: 'fire', vfx: '', damage: 640, missed: false,
  });
  let t = Date.now();
  const g1 = await goService.generateSummonCardGIF(payload);
  console.log(`RENDER1 ${g1.length}B in ${Date.now() - t}ms`);
  t = Date.now();
  const g2 = await goService.generateSummonCardGIF(payload);
  console.log(`RENDER2 ${g2.length}B in ${Date.now() - t}ms identical=${g1.equals(g2)}`);
  // different state -> must MISS (honest key check)
  const payload2 = JSON.parse(JSON.stringify(payload));
  payload2.action.damage = 777;
  t = Date.now();
  const g3 = await goService.generateSummonCardGIF(payload2);
  console.log(`RENDER3 ${g3.length}B in ${Date.now() - t}ms (different damage state)`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
