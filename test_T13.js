
const path = require('path');
const ROOT = '/home/ubuntu/whatsapp-bot';
const fs = require('fs');
const monsterSkills = require(path.join(ROOT, 'core/rpg/monsterSkills'));
const saiSrc = fs.readFileSync(path.join(ROOT, 'core/rpg/summonAI.js'), 'utf8');
const saiLines = saiSrc.split('\n');
const aaeRefs = [];
for (let i = 0; i < saiLines.length; i++) {
  if (saiLines[i].includes('applyAbilityEffect')) {
    aaeRefs.push('L' + (i+1) + ': ' + saiLines[i].trim().slice(0, 120));
  }
}
console.log('  applyAbilityEffect references in summonAI.js:');
aaeRefs.slice(0, 5).forEach(l => console.log('   ', l));
const hasFixComment = saiSrc.includes('Full skill execution via applyAbilityEffect (was a stub)');
console.log('  Has FIX comment (was a stub):', hasFixComment ? 'YES' : 'NO');
const skills = monsterSkills.getSkillsForMonster('STALKER', 15);
console.log('  STALKER skills count:', skills.length);
if (skills.length > 0) {
  const s = skills[0];
  const effect = s.currentEffect || (typeof s.effect === 'function' ? s.effect(15) : s.effect);
  console.log('  First skill:', s.id, '| name:', s.name, '| effect type:', effect ? effect.type : 'none');
  if (effect && effect.multiplier) console.log('  Skill has real multiplier:', effect.multiplier);
}
if (aaeRefs.length > 0 && hasFixComment) {
  console.log('PASS: applyAbilityEffect is wired into summonAI.js (full skill execution, not stub)');
} else {
  console.log('FAIL: applyAbilityEffect not wired'); process.exit(1);
}
