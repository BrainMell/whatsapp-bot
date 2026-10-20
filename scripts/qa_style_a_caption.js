// QA harness — Style A WAR LOG v2 (owner tweak: HP totals OUT, premium keeps
// damage) — generateTurnCaption + toggle + compactCombatText. No DB, no net.
// Run: node scripts/qa_style_a_caption.js
let combatIntegration;
try {
  combatIntegration = require('../core/rpg/combatIntegration');
} catch (e) {
  console.error('LOAD FAIL:', e.message);
  process.exit(1);
}
const { generateTurnCaption, warlogRow, warlogHP, warlogBlock, WARLOG_DIV, WARLOG_NAME_W, WARLOG_HP_W, isWarLogOff, setWarLogOff, compactCombatText } = combatIntegration;

let fails = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) fails++;
};
// HP-total pattern: "12,818/14,255" — the thing the owner banned.
const HP_PAIR = /\d[\d,]*\/\d[\d,]*/;

const players = [
  { name: 'PINK DILDO', class: { icon: '🧑' }, stats: { hp: 12818, maxHp: 14255, energy: 8669, maxEnergy: 9859 } },
  { name: 'Chipmunk Lady', class: { icon: '🐿️' }, stats: { hp: 0, maxHp: 9000, energy: 500, maxEnergy: 1000 } },
];
const enemies = [
  { name: 'GLOOM BRUTE', stats: { hp: 3233, maxHp: 18854 } },
  { name: 'VOID WISP', stats: { hp: 0, maxHp: 8000 } },
];

// ─── Case 1: merged narration path (logs ON, default) — effects only ───
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
console.log('--- CASE 1: war log, effects only (logs ON) ---\n' + c1 + '\n');

const fenceParts = c1.split('```');
check('header is WAR LOG · TURN 18', c1.startsWith('⚔️ *WAR LOG* · TURN 18\n'));
check('exactly one mono fence (2 fence marks)', fenceParts.length === 3);
const inner = fenceParts[1].split('\n').filter(l => l.length > 0);
check('NO HP totals anywhere (owner tweak v2)', !HP_PAIR.test(c1));
check('NO grid rows — party/enemy HP lines gone', !inner.some(l => l.includes('PINK DILDO') && !l.startsWith('» ')));
check('NO bars/energy/† grid glyphs', !c1.includes('█') && !c1.includes('░') && !c1.includes('⚡') && !c1.includes('†'));
check('NO divider (rows gone → no separator)', !inner.some(l => l === WARLOG_DIV));
check('all 4 action lines use » prefix inside fence', inner.length === 4 && inner.every(l => l.startsWith('» ')));
check('narration keeps the effects (defeated/overkill/crit)', c1.includes('Corpse Explosion') && c1.includes('defeated') && c1.includes('OVERKILL'));
check('no markup asterisks inside fence', !fenceParts[1].includes('*'));
check('no Style C glyphs (🆚/▰/▱/↳)', !c1.includes('🆚') && !c1.includes('▰') && !c1.includes('▱') && !c1.includes('↳'));

// ─── Case 2: PREMIUM mode (warLog=false) — owner's v3 sketch format ───
const c2 = generateTurnCaption(players, enemies, { ...ti1, warLog: false });
console.log('--- CASE 2: premium (logs OFF) — sketch format ---\n' + c2 + '\n');
check('premium = header + used + DAMAGE + defeat', c2 === '⚔️ *TURN 18*\n🧑 PINK DILDO used Corpse Explosion\n-7,866 DAMAGE 💢\nGLOOM BRUTE defeated!');
check('premium has no fence/grid/prose', !c2.includes('```') && !c2.includes('»') && !c2.includes('WAR LOG'));

// Case 2b: AoE across BOTH enemies — one summed -DAMAGE line
const ti2b = { ...ti1, actionLog: ['PINK DILDO: uses Corpse Explosion!', 'VOID CORRUPTED takes 7,866 damage!', 'GLOOM BRUTE takes 2,500 damage!'], isCrit: false };
const c2b = generateTurnCaption(players, enemies, { ...ti2b, warLog: false });
check('AoE damage summed (−10,366 DAMAGE)', c2b === '⚔️ *TURN 18*\n🧑 PINK DILDO used Corpse Explosion\n-10,366 DAMAGE');

// Case 2c: heal-only turn — +N HP, no damage line
const c2c = generateTurnCaption(players, enemies, { turnNumber: 7, actor: players[0], action: { name: 'Heal' }, actionLog: ['PINK DILDO: uses Heal!', '💚 +500 HP restored!'], warLog: false });
check('heal turn shows +N HP', c2c === '⚔️ *TURN 7*\n🧑 PINK DILDO used Heal\n+500 HP');

// Case 2d: miss turn — MISS marker
const c2d = generateTurnCaption(players, enemies, { turnNumber: 9, actor: players[0], action: { name: 'Basic Attack' }, actionLog: ['💨 MISS! The attack whiffed!'], warLog: false });
check('missed turn shows 💨 MISS', c2d === '⚔️ *TURN 9*\n🧑 PINK DILDO used Basic Attack\n💨 MISS');

// Case 2e: defeat via 'has fallen' wording rides through with emoji intact
const ti2e = { ...ti1, actionLog: ['PINK DILDO: uses Judgment!', 'VOID CORRUPTED takes 7,866 damage!', '💀 Crystal Corrupted has been defeated!'], damage: 7866, isCrit: false };
const c2e = generateTurnCaption(players, enemies, { ...ti2e, warLog: false });
check('has-been-defeated line preserved', c2e.endsWith('💀 Crystal Corrupted has been defeated!'));

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
check('fallback also HP-free', !HP_PAIR.test(c3));

// ─── Case 4: 12-line log → capped at 8 + more ───
const ti4 = { turnNumber: 22, actor: players[0], action: { name: 'Chaos Chain' }, actionLog: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`) };
const c4 = generateTurnCaption(players, enemies, ti4);
const arrows = (c4.match(/» /g) || []).length;
check(`cap: ${arrows} » lines (expect 9 = 8 + "+4 more")`, arrows === 9 && c4.includes('+4 more'));

// ─── Case 5: hostile inputs — name-only rows ───
const c5row1 = warlogRow(' ', 'Bad`Name*X_y', 999999, 1234567);
const c5row2 = warlogRow('†', 'VOID CORRUPTED', 0, 9999999);
check('backtick stripped (fence safety)', !c5row1.includes('`'));
check('asterisk stripped', !c5row1.includes('*'));
check('underscore preserved', c5row1.includes('X_y'));
check('HP args ignored — name-only row', c5row1 === ' BadNameX_y' && !/\d/.test(c5row1));
check('dead prefix + long name truncated', c5row2 === '†VOID CORRUPT');

// ─── Case 6: WAR LOG toggle round-trip (in-memory cache, no DB needed) ───
const TCHAT = 'qa-toggle-chat@s.whatsapp.net';
const before = isWarLogOff(TCHAT);
const nowOn = setWarLogOff(TCHAT, !before);
check('toggle flips state', isWarLogOff(TCHAT) === !before && nowOn === before);
const ti6a = { ...ti1, warLog: !isWarLogOff(TCHAT) };
check('flag derives from toggle (off ⇒ premium)', generateTurnCaption(players, enemies, ti6a).startsWith('⚔️ *TURN 18*') && !generateTurnCaption(players, enemies, ti6a).includes('```'));
setWarLogOff(TCHAT, before); // restore
check('toggle restores', isWarLogOff(TCHAT) === before);
check('empty chatId defaults to logs ON', isWarLogOff('') === false);

// ─── Case 7: geometry helpers (kept for PvP/start-card callers) ───
check('warlogHP field = 13', warlogHP(12818, 14255) === '12,818/14,255' && warlogHP(12818, 14255).length === WARLOG_HP_W);
check('warlogBlock drops null lines', warlogBlock(['a', null, 'b']) === '```\na\nb\n```');
check('name width constant = 12', WARLOG_NAME_W === 12);

// ─── Case 8: compactCombatText (premium enemy sends) ───
const x1 = compactCombatText('👾 *GLOOM BRUTE* attacks Mellow-San for 💥 1,204 damage! (CRIT!)');
console.log('--- CASE 8: compactCombatText ---');
console.log('attack  → ' + x1);
check('attack line → actor → target 💥 N DMG 💢', x1 === '👾 GLOOM BRUTE → Mellow-San 💥 1,204 DMG 💢');

const x2 = compactCombatText('👾 GLOOM BRUTE uses *Earthquake*!\n\n💥 👾 Mellow-San takes 2,331 damage! 💥 *CRITICAL HIT!*\n💀 Mellow-San has been defeated!');
console.log('skill   → ' + x2.split('\n').join(' ⏎ '));
const x2lines = x2.split('\n');
check('skill opener kept (uses Earthquake)', x2lines[0] === '👾 GLOOM BRUTE uses *Earthquake*!');
check('no double 💥 on takes-line', x2lines[1] === '💥 👾 Mellow-San 2,331 DMG 💢');
check('kill line passes through', x2lines[2] === '💀 Mellow-San has been defeated!');

const x3 = compactCombatText('👾 *VOID WISP* attacks Bob but 💨 MISSES!');
check('attack miss line', x3 === '👾 VOID WISP → Bob 💨 MISS');

const x4 = compactCombatText('🔥 GLOOM BRUTE takes 15 burn damage!\n🌵 THORNS! Mellow reflects 61 damage back!\n⚡ *OVERKILL!* +50 Zeni execution bonus!');
console.log('mixed   → ' + x4.split('\n').join(' ⏎ '));
const x4lines = x4.split('\n');
check('DOT tick compacted (burn damage)', x4lines[0] === '💥 🔥 GLOOM BRUTE 15 DMG');
check('effect prose passes through (thorns)', x4lines[1] === '🌵 THORNS! Mellow reflects 61 damage back!');
check('overkill line passes through', x4lines[2] === '⚡ *OVERKILL!* +50 Zeni execution bonus!');

const x5 = compactCombatText('🛡️ Guardian intercepts 500 damage for Mellow-San!\n\n');
check('intercept line untouched, blanks dropped', x5 === '🛡️ Guardian intercepts 500 damage for Mellow-San!');

const x6 = compactCombatText('⚔️↩️ COUNTER! Mellow retaliates for 350 damage!');
check('counter line untouched (effect)', x6 === '⚔️↩️ COUNTER! Mellow retaliates for 350 damage!');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
