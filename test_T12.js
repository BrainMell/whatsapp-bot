
const path = require('path');
const ROOT = '/home/ubuntu/whatsapp-bot';
const fs = require('fs');
const summonAI = require(path.join(ROOT, 'core/rpg/summonAI'));
const saiSrc = fs.readFileSync(path.join(ROOT, 'core/rpg/summonAI.js'), 'utf8');
const exportsMatch = saiSrc.match(/module\.exports\s*=\s*\{([^}]+)\}/);
const exportedNames = exportsMatch ? exportsMatch[1] : '';
const hasPerfInExports = exportedNames.includes('performSummonAction');
console.log('  summonAI exports performSummonAction:', hasPerfInExports ? 'YES' : 'NO');
const gaSrc = fs.readFileSync(path.join(ROOT, 'core/rpg/guildAdventure.js'), 'utf8');
const gaLines = gaSrc.split('\n');
const callSites = [];
for (let i = 0; i < gaLines.length; i++) {
  if (gaLines[i].includes('performSummonAction') &&
      !gaLines[i].includes('async function') &&
      !gaLines[i].trim().startsWith('//')) {
    callSites.push('L' + (i+1) + ': ' + gaLines[i].trim().slice(0, 120));
  }
}
console.log('  performSummonAction call sites in guildAdventure.js:');
callSites.slice(0, 5).forEach(l => console.log('   ', l));
if (callSites.length > 0 && hasPerfInExports) {
  console.log('PASS: performSummonAction is wired into guildAdventure.js (real code path)');
} else {
  console.log('FAIL: performSummonAction not wired'); process.exit(1);
}
