// Card audit 2026-11-09: node scripts/qa_card_audit.js [outDir]
// Renders the Node battle card for: basic hit, MISS, lifesteal hit (heal+damage), player AoE skill, ult AoE — through the REAL
// combatIntegration.buildAnimationAction + combatCardNode.renderNodeCard, with synthetic Go-layers from repo sprites. Asserts the action flags.
const { createCanvas, loadImage } = require('canvas'); const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'core', 'rpgasset'); const out = process.argv[2] || '/tmp/card_audit'; fs.mkdirSync(out, { recursive: true });
const ci = require('../core/rpg/systems/combat/combatIntegration'); const node = require('../core/rpg/systems/combat/combatCardNode');
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x ? ' | ' + x : '')); if (!c) fails++; };
async function cutOf(file, x, feet, h, side, index) {
  const im = await loadImage(path.join(A, 'characters', file)); const w = Math.round(im.width * h / im.height);
  const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
  return { cut: { side, index, x: x - w / 2, y: feet - h, w, h, png: c.toBuffer('image/png').toString('base64') }, anchor: { side, index, x, feetY: feet, w, h } };
}
const unit = (name, hp, o = {}) => Object.assign({ name, level: 8, currentHP: hp, maxHp: 100, stats: { hp, maxHp: 100, energy: 50, maxEnergy: 100 }, class: { id: 'FIGHTER', name: 'Fighter' } }, o);
(async () => {
  const bgc = createCanvas(1024, 687); bgc.getContext('2d').drawImage(await loadImage(path.join(A, 'backgrounds', 'background1.png')), 0, 0, 1024, 687);
  const bgBuf = bgc.toBuffer('image/png');
  const cs = [await cutOf('Paladin (1).png', 260, 560, 200, 'player', 0), await cutOf('Rogue (2).png', 380, 600, 190, 'player', 1),
    await cutOf('DoomSlayer1.png', 650, 540, 210, 'enemy', 0), await cutOf('Monk.png', 780, 575, 200, 'enemy', 1), await cutOf('Berserker2.png', 900, 560, 210, 'enemy', 2)];
  const sprites = createCanvas(1024, 687), sg = sprites.getContext('2d'); for (const c of cs) sg.drawImage(await loadImage(Buffer.from(c.cut.png, 'base64')), c.cut.x, c.cut.y, c.cut.w, c.cut.h);
  const layers = { success: true, w: 1024, h: 687, bg: bgBuf, sprites: sprites.toBuffer('image/png'), cuts: cs.map((c) => c.cut), anchors: cs.map((c) => c.anchor) };
  const api = { buildPayload: () => ({}), generateCombatLayers: async () => layers };
  const players = [unit('Mellow', 90), unit('Ally', 80, { class: { id: 'ROGUE', name: 'Rogue' } })];
  const enemies = [unit('Drake', 70, { isEnemy: true }), unit('Monk', 60, { isEnemy: true }), unit('Brute', 55, { isEnemy: true })];
  const base = (o) => Object.assign({ actor: players[0], target: enemies[0], damage: 24, turnNumber: 3, action: { name: 'Slash', type: 'attack' } }, o);
  const opts = { _allPlayers: players, _allEnemies: enemies, summons: [] };
  const cases = [
    ['1_basic_hit', base({}), (a) => !a.missed && a.damage === 24 && !a.heal],
    ['2_miss', base({ missed: true, damage: 0 }), (a) => a.missed === true],
    ['3_hit_with_dodge_text_in_log', base({ actionLog: ['Brute dodged the arrow', 'Mellow hits Drake for 24'] }), (a) => a.missed === false && a.damage === 24],
    ['4_lifesteal_hit', base({ healing: 12 }), (a) => a.heal === 0 && a.damage === 24],
    ['5_player_aoe_skill', base({ action: { name: 'Whirlwind', type: 'aoe' }, damage: 31 }), (a) => a.aoe === true && !a.ult],
    ['6_player_aoe_targeting_flag', base({ action: { name: 'Quake', targeting: 'AOE_LARGE', effect: () => ({ type: 'damage' }) }, damage: 31 }), (a) => a.aoe === true],
    ['7_single_target_skill_not_aoe', base({ action: { name: 'Pierce', type: 'attack' }, damage: 40 }), (a) => a.aoe === false],
    ['8_enemy_ult_aoe', { actor: enemies[0], target: players[0], damage: 55, turnNumber: 5, action: { name: 'Annihilation', type: 'aoe' } }, (a) => a.ult === true && a.aoe === true],
    ['9_pure_heal_turn', base({ damage: 0, healing: 20, target: players[0], actor: players[1], action: { name: 'Mend', type: 'heal' } }), (a) => a.heal === 20],
  ];
  for (const [name, turn, check] of cases) {
    const act = ci.buildAnimationAction(turn, opts);
    ok(name + ' action flags', !!act && check(act), act ? JSON.stringify({ missed: act.missed, dmg: act.damage, heal: act.heal, aoe: act.aoe, ult: act.ult }) : 'null');
    const card = await node.renderNodeCard(players, enemies, { action: act, rank: 'F', floor: 0, combatType: 'PVE' }, api);
    ok(name + ' renders', !!card); if (card) fs.writeFileSync(path.join(out, name + '.' + (Buffer.isBuffer(card) ? 'png' : 'png')), Buffer.isBuffer(card) ? card : (card.buffer || card.png || Buffer.from('')));
  }
  console.log(fails ? 'FAILURES: ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
