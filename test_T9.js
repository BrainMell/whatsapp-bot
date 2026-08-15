
const path = require('path');
const ROOT = '/home/ubuntu/whatsapp-bot';
const fs = require('fs');
const scSrc = fs.readFileSync(path.join(ROOT, 'core/commands/summonCommands.js'), 'utf8');
const eggSrc = fs.readFileSync(path.join(ROOT, 'core/rpg/summonEggSystem.js'), 'utf8');
const hasHatchExport = eggSrc.includes('hatchEgg') && /module\.exports/.test(eggSrc);
console.log('  summonEggSystem.js exports hatchEgg:', hasHatchExport ? 'YES' : 'NO');
const hasHatchCall = scSrc.includes('summonEggSystem.hatchEgg') || scSrc.includes('hatchEgg(');
console.log('  summonCommands.js calls hatchEgg:', hasHatchCall ? 'YES' : 'NO');
const scLines = scSrc.split('\n');
for (let i = 0; i < scLines.length; i++) {
  if (scLines[i].includes('hatchEgg')) {
    console.log('  Call site: summonCommands.js L' + (i+1) + ':', scLines[i].trim().slice(0, 120));
    break;
  }
}
if (hasHatchExport && hasHatchCall) {
  console.log('PASS: egg flow code path is wired (hatchEgg exported + called from summonCommands)');
} else {
  console.log('FAIL: egg flow not wired'); process.exit(1);
}
