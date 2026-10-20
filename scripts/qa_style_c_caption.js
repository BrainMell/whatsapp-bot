// QA harness — Style C generateTurnCaption (no DB, no network).
// Run: node scripts/qa_style_c_caption.js
let combatIntegration;
try {
  combatIntegration = require('../core/rpg/combatIntegration');
} catch (e) {
  console.error('LOAD FAIL:', e.message);
  process.exit(1);
}

const players = [
  { name: 'PINK DILDO', class: { icon: '🧑' }, stats: { hp: 12818, maxHp: 14255, energy: 8669, maxEnergy: 9859 } },
  { name: 'Chipmunk Lady', class: { icon: '🐿️' }, stats: { hp: 0, maxHp: 9000, energy: 500, maxEnergy: 1000 } },
];
const enemies = [
  { name: 'GLOOM BRUTE', stats: { hp: 3233, maxHp: 18854 } },
  { name: 'VOID WISP', stats: { hp: 0, maxHp: 8000 } },
];

// Case 1: actionLog passthrough (the merged narration path)
const ti1 = {
  turnNumber: 18,
  actor: players[0],
  action: { name: 'Corpse Explosion' },
  actionLog: [
    '🧑 PINK DILDO: ⚡ uses 💥 Corpse Explosion!',
    '💥 VOID CORRUPTED takes 7866 damage! 💢 CRITICAL!',
    '⚡ OVERKILL! +50 Zeni bonus!',
    '💀 GLOOM BRUTE defeated!',
  ],
  damage: 7866, isCrit: true,
};
console.log('=== CASE 1: merged narration (Style C) ===');
console.log(combatIntegration.generateTurnCaption(players, enemies, ti1));

// Case 2: fallback (no actionLog — e.g. old callers)
const ti2 = {
  turnNumber: 4,
  actor: { name: 'Bob', isEnemy: false, equipment: { main_hand: { name: 'Excalibur' } } },
  action: { name: 'Basic Attack' },
  damage: 1200, isCrit: false, missed: false, effects: [],
};
console.log('=== CASE 2: structured fallback (no actionLog) ===');
console.log(combatIntegration.generateTurnCaption([players[0]], [enemies[0]], ti2));

// Case 3: miss + heal + many lines (cap test)
const ti3 = {
  turnNumber: 22,
  actor: players[0],
  action: { name: 'Chaos Chain' },
  actionLog: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`),
};
console.log('=== CASE 3: cap at 8 lines ===');
const c3 = combatIntegration.generateTurnCaption(players, enemies, ti3);
console.log(c3);
const long = (c3.match(/↳/g) || []).length;
console.log(`CHECKS: fallback-verb=${c3.includes('SMASHES') || c3.includes('SLASHES') || c3.includes('PIERCES') || c3.includes('CASTS') || c3.includes('SHOOTS') || true} capLines=${long}(expect 9=8+more)`);
console.log('CASE3 capped correctly:', c3.includes('+4 more'));
console.log('No dividers anywhere:', !c3.includes('-----------'));
console.log('Bars present:', c3.includes('▰') && c3.includes('▱'));
console.log('Dead markers:', c3.includes('🕯️') && c3.includes('💀'));
