#!/usr/bin/env node
// GHOST-PROBE: prove drawDeadSprite's 14%-alpha pass really contributes pixels.
// Renders the WATER case twice: A = real enemy cut, B = same layers but the
// enemy-0 cut replaced by a solid magenta 32x32. If the ghost pass draws,
// the fall region MUST differ between A and B (different ghost content).
// If A and B are pixel-identical there, the ghost is a silent no-op.
const path = require('path');
const REPO = '/home/ubuntu/whatsapp-bot';
const fs = require('fs');
const ga = require(path.join(REPO, 'core/rpg/systems/adventures/guildAdventure.js'));
const ds = require(path.join(REPO, 'core/rpg/systems/combat/deathStill.js'));
const { createCanvas } = require(path.join(REPO, 'node_modules/canvas'));

(async () => {
  const enemy = { name: 'Tide Kraken', element: 'water', isBoss: false, rank: 'normal',
    isEnemy: true, side: 'enemy', justDied: true, isDead: true, currentHP: 0,
    stats: { hp: 0, maxHp: 4200 }, spriteIndex: 2 };
  const state = { chatId: 'qa-ghost@g.us', mode: 'DUNGEON', isAbyss: false, dungeonRank: 'F',
    combatGen: 1, turnCount: 3, inCombat: true,
    players: [{ name: 'Loki', jid: 'p0@s.whatsapp.net', isDead: false, currentHP: 7900,
      stats: { hp: 7900, maxHp: 7900, energy: 3960, maxEnergy: 3960 }, spriteIndex: 0, level: 40, adventurerRank: 'F' }],
    enemies: [enemy], _lastTurnLog: ['⚔️ Loki unleashes OBELISK BREAK for 4,211!'], timers: {} };
  const layers = await ga._deathTest._deathScene(state);
  if (!layers) { console.log('PROBE: layers null'); process.exit(1); }
  const opts = (lay) => ({ layers: lay, picks: [{ enemy, targetIndex: 0 }], deadIdx: new Set(), chrome: ga._deathTest._deathChrome(state) });
  const A = await ds.renderDeathStill(opts(layers));
  // magenta stand-in cut
  const cv = createCanvas(32, 32), cx = cv.getContext('2d');
  cx.fillStyle = 'magenta'; cx.fillRect(0, 0, 32, 32);
  const layersB = { ...layers, cuts: (layers.cuts || []).map((x) => (x && x.side === 'enemy' && Number(x.index) === 0) ? { ...x, png: cv.toBuffer('image/png').toString('base64') } : x) };
  const B = await ds.renderDeathStill(opts(layersB));
  fs.writeFileSync('/tmp/deathqa/probe_A.png', A.image);
  fs.writeFileSync('/tmp/deathqa/probe_B.png', B.image);
  console.log(`PROBE: A=${A.image.length}B B=${B.image.length}B written`);
  process.exit(0);
})().catch((e) => { console.error('PROBE CRASH', e && e.stack || e); process.exit(1); });
