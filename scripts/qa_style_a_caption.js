// QA harness — Style A WAR LOG generateTurnCaption + toggle (no DB, no network).
// Run: node scripts/qa_style_a_caption.js
let combatIntegration;
try {
  combatIntegration = require('../core/rpg/combatIntegration');
} catch (e) {
  console.error('LOAD FAIL:', e.message);
  process.exit(1);
}
const { generateTurnCaption, warlogRow, warlogHP, warlogBlock, WARLOG_DIV, WARLOG_NAME_W, WARLOG_HP_W, isWarLogOff, setWarLogOff } = combatIntegration;

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

// ─── Case 1: merged narration path (logs ON, default) ───
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
console.log('--- CASE 1: merged narration (logs ON) ---\n' + c1 + '\n');

const fenceParts = c1.split('```');
check('header is WAR LOG · TURN 18', c1.startsWith('⚔️ *WAR LOG* · TURN 18\n'));
check('exactly one mono fence (2 fence marks)', fenceParts.length === 3);
const inner = fenceParts[1].split('\n');
check('dead party member has † mark', inner.some(l => l.startsWith('†') && l.includes('0/9,000')));
check('dead enemy has † mark', inner.filter(l => l.startsWith('†')).length === 2);
check('NO HP bars in grid (owner tweak)', !c1.includes('█') && !c1.includes('░'));
check('NO energy readout (owner tweak)', !c1.includes('⚡'));
check('divider inside fence', inner.some(l => l === WARLOG_DIV));
check('action lines use » prefix', inner.filter(l => l.startsWith('» ')).length === 4);
check('no markup asterisks inside fence', !fenceParts[1].includes('*'));
check('no Style C glyphs (🆚/▰/▱/↳)', !c1.includes('🆚') && !c1.includes('▰') && !c1.includes('▱') && !c1.includes('↳'));
// alignment: grid rows (before divider) must be exactly 27 cols (prefix1+name12+sp+HP13)
const divIdx = inner.indexOf(WARLOG_DIV);
const gridOnly = inner.slice(0, divIdx).filter(l => l.length > 0 && !l.startsWith('⚡'));
check(`all ${gridOnly.length} grid rows exactly 27 chars`, gridOnly.every(l => l.length === 27));

// ─── Case 2: PREMIUM mode (toggle OFF via turnInfo.warLog=false) ───
const c2 = generateTurnCaption(players, enemies, { ...ti1, warLog: false });
console.log('--- CASE 2: premium mode (logs OFF) ---\n' + c2 + '\n');
check('premium caption is bare turn header', c2 === '⚔️ *TURN 18*');
check('premium has no fence/grid/narration', !c2.includes('```') && !c2.includes('»') && !c2.includes('WAR LOG'));

// ─── Case 3: structured fallback (no actionLog) ───
const ti3 = {
  turnNumber: 4,
  actor: { name: 'Bob', isEnemy: false, equipment: { main_hand: { name: 'Sunfire Blade' } } },
  action: { name: 'Basic Attack' },
  damage: 1200, isCrit: false, missed: false, effects: [],
};
const c3 = generateTurnCaption([players[0]], [enemies[0]], ti3);
check('fallback verb SLASHES (sword)', c3.includes('SLASHES with'));
check('fallback dmg line »', c3.includes('» 💥 1,200 damage!'));

// ─── Case 4: 12-line log → capped at 8 + more ───
const ti4 = { turnNumber: 22, actor: players[0], action: { name: 'Chaos Chain' }, actionLog: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`) };
const c4 = generateTurnCaption(players, enemies, ti4);
const arrows = (c4.match(/» /g) || []).length;
check(`cap: ${arrows} » lines (expect 9 = 8 + "+4 more")`, arrows === 9 && c4.includes('+4 more'));

// ─── Case 5: hostile inputs + extreme widths ───
const c5row1 = warlogRow(' ', 'Bad`Name*X_y', 999999, 1234567);
const c5row2 = warlogRow('†', 'VOID CORRUPTED', 0, 9999999);
check('backtick stripped (fence safety)', !c5row1.includes('`'));
check('asterisk stripped', !c5row1.includes('*'));
check('underscore preserved', c5row1.includes('X_y'));
check('huge HP no-commas fallback, row ≤ 28', c5row1.length <= 28 && c5row1.includes('999999/1234567'));
check('long name truncated, dead row = 27', c5row2.length === 27 && c5row2.startsWith('†VOID CORRUPT'));

// ─── Case 6: WAR LOG toggle round-trip (in-memory cache, no DB needed) ───
const TCHAT = 'qa-toggle-chat@s.whatsapp.net';
const before = isWarLogOff(TCHAT);
const nowOn = setWarLogOff(TCHAT, !before);
check('toggle flips state', isWarLogOff(TCHAT) === !before && nowOn === before);
const ti6a = { ...ti1, warLog: !isWarLogOff(TCHAT) };
check('flag derives from toggle (off ⇒ premium)', generateTurnCaption(players, enemies, ti6a).includes('TURN 18') && !generateTurnCaption(players, enemies, ti6a).includes('```'));
setWarLogOff(TCHAT, before); // restore
check('toggle restores', isWarLogOff(TCHAT) === before);
check('empty chatId defaults to logs ON', isWarLogOff('') === false);

// ─── Case 7: geometry ───
check('warlogHP field = 13', warlogHP(12818, 14255) === '12,818/14,255' && warlogHP(12818, 14255).length === WARLOG_HP_W);
check('warlogHP zero-pad', warlogHP(0, 9000) === '      0/9,000');
check('warlogBlock drops null lines', warlogBlock(['a', null, 'b']) === '```\na\nb\n```');
check('name width constant = 12', WARLOG_NAME_W === 12);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
