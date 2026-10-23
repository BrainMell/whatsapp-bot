#!/usr/bin/env node
/** cardctx.js - print switch-case context for given commands in cardSystem.js */
const fs = require('fs');
const lines = fs.readFileSync('/home/z/my-project/repo/core/rpg/cardSystem.js', 'utf8').split('\n');
const targets = process.argv.slice(2);
for (const t of targets) {
  const re = new RegExp(`case ['"]${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  lines.forEach((ln, i) => {
    if (re.test(ln)) {
      console.log(`\n===== ${t} @ line ${i + 1} =====`);
      for (let j = i; j < Math.min(lines.length, i + 5); j++) {
        console.log(`${j + 1}: ${lines[j].trimEnd().slice(0, 160)}`);
      }
    }
  });
}
