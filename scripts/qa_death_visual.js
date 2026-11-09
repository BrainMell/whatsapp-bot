#!/usr/bin/env node
// VISUAL QA harness for death stills — REAL Go layers, REAL compositing.
// Renders one still per kind + a group kill, writes /tmp/deathqa/*.png and a
// contact sheet /tmp/deathqa/sheet.png. Run on the box (needs the renderer).
const path = require('path');
const fs = require('fs');
const REPO = '/home/ubuntu/whatsapp-bot';
const { createCanvas, loadImage } = require(path.join(REPO, 'node_modules/canvas'));
const ga = require(path.join(REPO, 'core/rpg/systems/adventures/guildAdventure.js'));
const ds = require(path.join(REPO, 'core/rpg/systems/combat/deathStill.js'));

const CASES = [
  { tag: 'FIRE', enemy: { name: 'Hellfire Demon', element: 'fire', isBoss: true, rank: 'BOSS' }, spriteIndex: 0 },
  { tag: 'ICE', enemy: { name: 'Frost Yeti', element: 'ice', isBoss: false, rank: 'normal' }, spriteIndex: 1 },
  { tag: 'WATER', enemy: { name: 'Tide Kraken', element: 'water', isBoss: false, rank: 'normal' }, spriteIndex: 2 },
  { tag: 'VOID', enemy: { name: 'Void Wraith', element: 'dark', isBoss: true, rank: 'BOSS' }, spriteIndex: 3 },
  { tag: 'EARTH', enemy: { name: 'Stone Golem', element: 'earth', isBoss: false, rank: 'normal' }, spriteIndex: 4 },
  { tag: 'DUST', enemy: { name: 'Cave Beast', element: 'dust', isBoss: false, rank: 'normal' }, spriteIndex: 5 },
];

function mkPlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: ['Loki', 'Ren', 'Mira'][i], jid: `p${i}@s.whatsapp.net`, isDead: false,
    currentHP: 7900 - i * 900, stats: { hp: 7900, maxHp: 7900, energy: 3960, maxEnergy: 3960 },
    spriteIndex: i, level: 40, adventurerRank: 'F',
  }));
}
function mkEnemy(def, i) {
  const e = def.enemy || def;   // harness cases nest the enemy under .enemy
  return {
    ...e, isEnemy: true, side: 'enemy', justDied: true, isDead: true, currentHP: 0,
    stats: { hp: 0, maxHp: 4200 }, spriteIndex: e.spriteIndex ?? (i % 6),
  };
}
function mkState(enemies) {
  return {
    chatId: 'qa-death-visual@g.us', mode: 'DUNGEON', isAbyss: false, dungeonRank: 'F',
    combatGen: 1, turnCount: 3, inCombat: true,
    players: mkPlayers(enemies.length > 2 ? 3 : 1),
    enemies, _lastTurnLog: ['⚔️ Loki unleashes OBELISK BREAK for 4,211!', '» Hellfire Demon is destroyed!'],
    timers: {}, backgroundPath: undefined,
  };
}

(async () => {
  fs.mkdirSync('/tmp/deathqa', { recursive: true });
  const outs = [];
  for (const c of CASES) {
    const state = mkState([mkEnemy(c, 0)]);
    const layers = await ga._deathTest._deathScene(state);
    if (!layers) { console.log(`${c.tag}: LAYERS NULL`); continue; }
    const r = await ds.renderDeathStill({
      layers, picks: [{ enemy: state.enemies[0], targetIndex: 0 }],
      deadIdx: new Set(), chrome: ga._deathTest._deathChrome(state),
    });
    if (!r || !r.image) { console.log(`${c.tag}: RENDER NULL`); continue; }
    fs.writeFileSync(`/tmp/deathqa/${c.tag}.png`, r.image);
    outs.push({ tag: c.tag, buf: r.image });
    console.log(`${c.tag}: ok kind=${r.kind} boss=${r.boss} ${Math.round(r.image.length / 1024)}KB`);
  }
  // group kill: 3 enemies, one beat
  {
    const grp = [
      mkEnemy({ name: 'Ember Imp', element: 'fire', rank: 'normal', spriteIndex: 0 }, 0),
      mkEnemy({ name: 'Ember Imp', element: 'fire', rank: 'normal', spriteIndex: 0 }, 1),
      mkEnemy({ name: 'Hellfire Demon', element: 'fire', isBoss: true, rank: 'BOSS', spriteIndex: 0 }, 2),
    ];
    const state = mkState(grp);
    const layers = await ga._deathTest._deathScene(state);
    if (layers) {
      const r = await ds.renderDeathStill({
        layers,
        picks: grp.map((e, i) => ({ enemy: e, targetIndex: i })),
        deadIdx: new Set(), chrome: ga._deathTest._deathChrome(state),
      });
      if (r && r.image) { fs.writeFileSync('/tmp/deathqa/GROUP.png', r.image); outs.push({ tag: 'GROUP', buf: r.image }); console.log(`GROUP: ok kind=${r.kind} x${r.group.length}`); }
    }
  }
  // contact sheet: 2 columns
  const CW = 640, CH = 480, COLS = 2;
  const rows = Math.ceil(outs.length / COLS);
  const sheet = createCanvas(CW * COLS, CH * rows);
  const sc = sheet.getContext('2d');
  sc.fillStyle = '#20242c'; sc.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < outs.length; i++) {
    const img = await loadImage(outs[i].buf);
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
    sc.drawImage(img, x, y);
    sc.fillStyle = 'rgba(0,0,0,0.65)'; sc.fillRect(x, y, 120, 26);
    sc.fillStyle = '#fff'; sc.font = 'bold 16px sans-serif'; sc.fillText(outs[i].tag, x + 8, y + 19);
  }
  fs.writeFileSync('/tmp/deathqa/sheet.png', sheet.toBuffer('image/png'));
  console.log(`SHEET: ${outs.length} panels -> /tmp/deathqa/sheet.png`);
  process.exit(0);
})().catch((e) => { console.error('VISUAL QA CRASH', e && e.stack || e); process.exit(1); });
