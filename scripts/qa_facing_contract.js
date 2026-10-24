'use strict';
// Dependency-free guard for the approved player-facing contract.
// Run: node scripts/qa_facing_contract.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'abyssScene.js'), 'utf8');
let pass = 0, fail = 0;
function check(condition, label) {
  if (condition) { pass++; console.log('✅ ' + label); }
  else { fail++; console.error('❌ ' + label); }
}
const leftStart = src.indexOf('const PLAYER_ART_FACES_LEFT = new Set([');
const neverStart = src.indexOf('const PLAYER_ART_FACES_NEVER = new Set([');
const leftTable = leftStart >= 0 && neverStart > leftStart ? src.slice(leftStart, neverStart) : '';
const neverEnd = src.indexOf('function playerFaceKey(', neverStart);
const neverTable = neverStart >= 0 && neverEnd > neverStart ? src.slice(neverStart, neverEnd) : '';
check(leftTable.includes('"cleric (3).png"'), 'approved native-left cleric asset remains in the LEFT flip table');
check(neverTable.includes('"necromancer.png"'), 'approved frontal necromancer remains in the NEVER-flip table');
check(src.includes('if (PLAYER_ART_FACES_NEVER.has(k)) return false')
  && src.includes('return PLAYER_ART_FACES_LEFT.has(k)'), 'audited per-file tables still control player flipping');
check(src.includes('const ENEMY_RENDER_SCALE = 1.2;')
  && src.includes('perspH(BOSS_GY) * 2.05 * ENEMY_RENDER_SCALE')
  && src.includes("* (m.kind === 'wild' ? 1.18 : 1.12) * ENEMY_RENDER_SCALE"),
  'bosses and regular monsters use the 20% rendered-size multiplier');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
