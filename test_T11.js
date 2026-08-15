
const path = require('path');
const ROOT = '/home/ubuntu/whatsapp-bot';
const monsterSkills = require(path.join(ROOT, 'core/rpg/monsterSkills'));
const enemy = { name: 'Plaguefang', archetype: 'STALKER', level: 20, currentHP: 800, maxHP: 800,
                mana: 100, cooldowns: {}, statusEffects: [], isCharging: false,
                stats: { atk: 50, mag: 30, def: 10, spd: 22 } };
const players = [
  { name: 'Goblin', currentHP: 50, maxHP: 200, isDead: false, stats: { hp: 50, def: 5 } },
  { name: 'Orc', currentHP: 300, maxHP: 300, isDead: false, stats: { hp: 300, def: 10 } }
];
const decision = monsterSkills.evaluateAction(enemy, players, []);
if (!decision) { console.log('FAIL: evaluateAction returned null'); process.exit(1); }
console.log('  Decision:', JSON.stringify(decision).slice(0, 400));
console.log('  Action:', decision.action);
if (decision.skill) console.log('  Skill:', decision.skill.name, '| id:', decision.skill.id);
if (decision.target) console.log('  Target:', decision.target.name);
if (decision.action === 'stub' || !decision.action) {
  console.log('FAIL: decision is a stub'); process.exit(1);
}
console.log('PASS: evaluateAction returned real decision (action=' + decision.action + ')');
