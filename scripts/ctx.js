#!/usr/bin/env node
/** ctx.js — print dispatch context for given primaryCmd literals in engine.js */
const fs = require('fs');
const lines = fs.readFileSync('/home/z/my-project/repo/core/engine.js', 'utf8').split('\n');
const targets = process.argv.slice(2);
for (const t of targets) {
  const re = new RegExp(`primaryCmd === ["']${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  lines.forEach((ln, i) => {
    if (re.test(ln)) {
      console.log(`\n===== ${t} @ line ${i + 1} =====`);
      for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 9); j++) {
        console.log(`${j + 1}: ${lines[j].trimEnd().slice(0, 150)}`);
      }
    }
  });
}
