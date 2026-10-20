// QA harness — Style A WAR LOG generateTurnCaption (no DB, no network).
// Run: node scripts/qa_style_a_caption.js
let combatIntegration;
try {
  combatIntegration = require('../core/rpg/combatIntegration');
} catch (e) {
  console.error('LOAD FAIL:', e.message);
  process.exit(1);
}
const { generateTurnCaption, warlogRow, warlogHP, warlogBlock, WARLOG_DIV, WARLOG_NAME_W, WARLOG_HP_W } = combatIntegration;

let fails = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) fails++;
};

const players = [
  { name: 'PINK DILDO', class: { icon: '🧑' }, stats: { hp: 12818, maxHp: 14255, energy: 8669, maxEnergy: 9859 } },
  { name: 'Chipmunk Lady', class: { icon: '🐿️' }, stats: { hp: 0, maxHp: 9000, energy: 500, maxEnergy: 1000 } },
];
const enemies = [
  { name: 'GLOOM BRUTE', stats: { hp: 3233, maxHp: 18854 } },
  { name: 'VOID WISP', stats: { hp: 0, maxHp: 8000 } },
];

// ─── Case 1: merged narration path (the one-message-per-turn path) ───
const ti1 = {
  turnNumber: 18,
  actor: players[0],
  action: { name: 'Corpse Explosion' },
  actionLog: [
    'PINK DILDO: uses Corpse Explosion!',
    'VOID CORRUPTED takes 7,866 damage! CRITICAL!',
    'OVERKILL! +50 Zeni bonus!',
    'GLOOM BRUTE defeated!',
  ],
  damage: 7866, isCrit: true,
};
const c1 = generateTurnCaption(players, enemies, ti1);
console.log('--- CASE 1: merged narration ---\n' + c1 + '\n');

const fenceParts = c1.split('```');
check('header is WAR LOG · TURN 18', c1.startsWith('⚔️ *WAR LOG* · TURN 18\n'));
check('exactly one mono fence (2 fence marks)', fenceParts.length === 3);
const inner = fenceParts[1].split('\n');
const gridRows = inner.filter(l => l.startsWith(' ') || l.startsWith('†') || l.startsWith('>'));
check('dead party member has † mark + empty bar', inner.some(l => l.startsWith('†') && l.includes('[░░░░░░░░]')));
check('dead enemy has † mark', inner.filter(l => l.startsWith('†')).length === 2);
check('alive fighter bar [█...░] (89.9% → 7/8 filled)', inner.some(l => l.includes('[███████░]') && l.includes('PINK DILDO')));
check('EN flow line present', inner.some(l => l.startsWith('⚡ EN') === false && l.startsWith('⚡') && l.includes('88%')));
check('divider inside fence', inner.some(l => l === WARLOG_DIV));
check('action lines use » prefix', inner.filter(l => l.startsWith('» ')).length === 4);
check('no markup asterisks inside fence', !fenceParts[1].includes('*'));
check('no Style C glyphs (🆚/▰/▱/↳)', !c1.includes('🆚') && !c1.includes('▰') && !c1.includes('▱') && !c1.includes('↳'));
check('no emoji inside aligned grid rows', gridRows.every(l => /^.\S/.test(l) || l.startsWith('†')));
// alignment: every pure grid row (before divider) must be exactly 38 chars
const divIdx = inner.indexOf(WARLOG_DIV);
const gridOnly = inner.slice(0, divIdx).filter(l => l.length > 0 && !l.startsWith('⚡'));
check(`all ${gridOnly.length} grid rows exactly 38 chars`, gridOnly.every(l => l.length === 38));
check('HP columns right-aligned (col 27..39 digits/slash)', gridOnly.every(l => /^.{26}\s*[\d,]+\/[\d,]+$/.test(l) || l[26] !== ' '));

// ─── Case 2: structured fallback (no actionLog) ───
const ti2 = {
  turnNumber: 4,
  actor: { name: 'Bob', isEnemy: false, equipment: { main_hand: { name: 'Sunfire Blade' } } },
  action: { name: 'Basic Attack' },
  damage: 1200, isCrit: false, missed: false, effects: [],
};
const c2 = generateTurnCaption([players[0]], [enemies[0]], ti2);
console.log('--- CASE 2: fallback ---\n' + c2 + '\n');
check('fallback verb SLASHES (sword)', c2.includes('SLASHES with'));
check('fallback dmg line »', c2.includes('» 💥 1,200 damage!'));

// ─── Case 3: 12-line log → capped at 8 + more ───
const ti3 = { turnNumber: 22, actor: players[0], action: { name: 'Chaos Chain' }, actionLog: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`) };
const c3 = generateTurnCaption(players, enemies, ti3);
const arrows = (c3.match(/» /g) || []).length;
check(`cap: ${arrows} » lines (expect 9 = 8 + "+4 more")`, arrows === 9 && c3.includes('+4 more'));

// ─── Case 4: fence-safety + extreme widths ───
const c4row1 = warlogRow(' ', 'Bad`Name*X_y', 999999, 1234567);   // backtick/asterisk + 6-digit HP
const c4row2 = warlogRow('†', 'VOID CORRUPTED', 0, 9999999);
console.log('--- CASE 4: hostile inputs ---\n' + c4row1 + '\n' + c4row2);
check('backtick stripped (fence safety)', !c4row1.includes('`'));
check('asterisk stripped', !c4row1.includes('*'));
check('underscore preserved (names like Killer_King)', c4row1.includes('X_y'));
check('huge HP falls back to no-commas, stays ≤ 40', c4row1.length <= 40 && c4row1.includes('999999/1234567'));
check('long name truncated to grid width', c4row2.length === 38 && c4row2.startsWith('†VOID CORRUPT'));

// ─── Case 5: fence wrapper ───
const b5 = warlogBlock(['a', null, 'b']);
check('warlogBlock drops null lines', b5 === '```\na\nb\n```');

// ─── Case 6: HP field geometry ───
check('warlogHP pads to 13 (no pad needed at 13)', warlogHP(12818, 14255) === '12,818/14,255' && warlogHP(12818, 14255).length === WARLOG_HP_W);
check('warlogHP zero-pad', warlogHP(0, 9000) === '      0/9,000');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
