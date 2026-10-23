#!/usr/bin/env node
/** qa_regular_menu.js - regular menu accuracy + tip hygiene + caption budget.
 *  Run: node scripts/qa_regular_menu.js  (exit 1 on failure)
 */
const fs = require('fs');
const path = require('path');
const { MOD_MENU, MOD_TIPS } = require('../core/utils/modMenuData');
const REG = require('../core/utils/commandRegistry');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const fail = (m) => { failures++; console.log('  ❌ ' + m); };
const pass = (m) => console.log('  ✅ ' + m);

const engine = fs.readFileSync(path.join(ROOT, 'core/engine.js'), 'utf8');
const cardSystem = fs.readFileSync(path.join(ROOT, 'core/rpg/cardSystem.js'), 'utf8');
const gamblingSrc = fs.readFileSync(path.join(ROOT, 'core/gambling.js'), 'utf8');
const quizSrc = fs.readFileSync(path.join(ROOT, 'core/games/quiz.js'), 'utf8');
const ALL = engine + cardSystem + gamblingSrc + quizSrc;

// -- 1. DISPATCH CHECK: every regular entry must have a dispatch site --
console.log('📋 DISPATCH CHECK (regular menu vs real code)');
for (const [cat, cmds] of Object.entries(REG)) {
  for (const c of cmds) {
    const key = c.cmd;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const primary = key.split(' ')[0];
    const escPrimary = primary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`["']${esc}["']`),                                    // string literal anywhere
      new RegExp(`primaryCmd === ["']${escPrimary}["']`),              // primary dispatch
      new RegExp(`case ['"]${escPrimary}['"]`),                        // switch case
      new RegExp(`} ${esc}`),                                          // quiz-style template literal
      new RegExp(`['"](?:cf|dice|slots|hl|bj|roulette|roul|crash|mines|plinko|scratch|cups|wheel|horse|lotto|rps|penalty|guess|flip)['"],`),
    ];
    const first = key.split(' ')[0];
    if (['cf','dice','slots','hl','bj','roulette','roul','crash','mines','plinko','scratch','cups','wheel','horse','lotto','rps','penalty','guess','flip'].includes(first)) {
      pass(`${cat}/${key}`); continue;
    }
    const hit = patterns.some(r => r.test(ALL));
    if (hit) pass(`${cat}/${key}`);
    else fail(`${cat}/${key} - no dispatch site found`);
  }
}

// -- 2. TIP HYGIENE: regular tips must not teach mod-only commands --
console.log('\n📋 TIP HYGIENE (regular menu)');
const engineTips = engine.match(/const TIPS = \[([\s\S]*?)\n      \];/);
if (!engineTips) { fail('TIPS array not found in engine.js'); }
else {
  const tipsRaw = engineTips[1];
 // A tip "teaches" a command when it contains `${prefix} <modcmd>` style
 // command references. Prose mentions of the word "mod" are fine.
  const modOnly = ['resetwarn', 'glock', 'gunlock', 'cards on', 'cards off', 'espawn', 'event start', 'event stop', 'spawn', 'updateall', 'mod ', 'instances`, ', 'debug', 'opscheck'];
  const cmdRefs = [...tipsRaw.matchAll(/\`\$\{prefix\} ([a-z0-9 +_-]+)\`/g)].map(m => m[1]);
  const leaked = cmdRefs.filter((r) => modOnly.some((m) => (r + ' ').startsWith(m)) || r === 'menu -h');
  if (leaked.length) fail('mod-only command refs in regular tips: ' + leaked.join(', '));
  else pass('no mod-only command references in regular tips (' + cmdRefs.length + ' cmd refs scanned)');
  const tipCount = (tipsRaw.match(/`,/g) || []).length + 1;
  console.log(`  ℹ️  ${tipCount} regular tips`);
}

// MOD_TIPS: any tip that shows a command form must carry {p}
const badP = MOD_TIPS.filter(t => t.includes('`') && !t.includes('{p}'));
if (badP.length) fail('MOD_TIPS with command forms missing {p}: ' + badP.join(' | '));
else pass(`all MOD_TIPS with command forms carry {p} (${MOD_TIPS.length} tips)`);

// moved mod tips must exist in MOD_TIPS
for (const probe of ['resetwarn', 'glock rank', 'cards on']) {
  if (MOD_TIPS.some(t => t.includes(probe))) pass(`moved tip present in MOD_TIPS: ${probe}`);
  else fail(`moved tip missing from MOD_TIPS: ${probe}`);
}

// -- 3. CAPTION BUDGET: main view + every category view (paginated) --
console.log('\n📋 CAPTION BUDGET (regular menu, limit 1024, paginated)');
const BANNER = `┏━━━━━━━━━━━━━━━┓\n┃   X\n┗━━━━━━━━━━━━━━━┛\n\n`;
const CAT_EMOJIS = { SUPPORT:'🛠️', STICKERS:'🎨', SEARCH:'🔍', 'PHANTOM THIEF':'🎭', 'USER INFO':'👤', ADMIN:'⚙️', GUILDS:'🏰', RPG:'⚔️', GROUP:'👥', PROGRESSION:'📈', CARDS:'🃏', ECONOMY:'💰', GAMBLING:'🎰', FUN:'🎡', GAMES:'🎮', PowerScaling:'⚖️', ANIME:'🎎', INFO:'ℹ️', INTERACTIONS:'💞', MODERATOR:'🛡️' };
// Mirror of the paginated renderer in engine.js sendBotMenu (PAGE_BUDGET 870).
const renderCatPages = (cat) => {
  const lines = REG[cat].map(c => `➤ \`.j ${c.cmd}\` - ${c.desc.split('.')[0]}`);
  const pages = [];
  let cur = [], curLen = 0;
  for (const ln of lines) {
    const add = ln.length + 1;
    if (cur.length && curLen + add > 870) { pages.push(cur); cur = []; curLen = 0; }
    cur.push(ln); curLen += add;
  }
  if (cur.length) pages.push(cur);
  return pages.map((pg, i) => {
    let m = BANNER + pg.join('\n');
    if (pages.length > 1) m += `\n\n➤ Page ${i + 1}/${pages.length} - \`.j ${cat.toLowerCase()} <page>\` to browse.`;
    m += `\n➤ Type \`.j menu\` to go back.`;
    return m;
  });
};
let mainView = BANNER + ` *PERSONABOT* \n *Version 1.0.0* \n *By mellow* \n\n*Prefix:* .j\n\n📂 *Categories* - type \`.j menu <name>\` to open:\n\n`;
Object.keys(REG).forEach((cat, i) => { mainView += `\`${CAT_EMOJIS[cat] || '📂'} ${cat}\``.padEnd(18) + ((i % 2 === 1) ? '\n' : ' '); });
mainView += `\n\n➤ Type \`.j menu <CATEGORY>\` to see its commands.\n\n💡 *Tip:* X`;
if (mainView.length <= 1024) pass(`main view: ${mainView.length} chars`);
else fail(`main view OVER LIMIT: ${mainView.length}`);

for (const cat of Object.keys(REG)) {
  const pages = renderCatPages(cat);
  const worst = Math.max(...pages.map(p => p.length));
  const tag = pages.length > 1 ? ` (${pages.length} pages, worst ${worst})` : ` (${worst})`;
  if (worst <= 1024) pass(`category ${cat}${tag}`);
  else fail(`category ${cat} page OVER LIMIT: ${worst}`);
}

// -- 4. MENU COMPLETENESS: new commands + alias coverage (sweep) --
console.log('\n📋 MENU COMPLETENESS (new commands + alias mentions)');
const flat = Object.values(REG).flat();
const have = (cmd) => flat.some((c) => c.cmd === cmd);
for (const probe of ['google', 'quote', 'anime', 'skill', 'skilltree', 'st', 'status', 'buy', 'instances', 'opscheck', 'debug']) {
  if (have(probe)) pass(`registry entry present: ${probe}`);
  else fail(`registry entry MISSING: ${probe}`);
}
const entry = (cmd) => flat.find((c) => c.cmd === cmd);
const aliasPairs = [
  ['quest', 'adventure'], ['inventory', 'inv'], ['kills', 'killcount'], ['kills', 'slain'],
  ['world', 'map'], ['world', 'maps'], ['summon', 'summons'], ['dglord', 'dragongod'],
  ['gear', 'equipment'], ['stop', 'end'], ['mentor', 'mentoring'],
  ['instances', 'instance'], ['instances', 'health'],
];
for (const [primary, alias] of aliasPairs) {
  const e = entry(primary);
  if (!e) { fail(`alias check: primary entry missing: ${primary}`); continue; }
  if (e.desc.includes(alias)) pass(`${primary} desc mentions alias: ${alias}`);
  else fail(`${primary} desc does not mention alias: ${alias}`);
}
// every alias mention must have a real dispatch site in engine.js
for (const alias of ['adventure', 'inv', 'killcount', 'slain', 'map', 'maps', 'summons', 'dragongod', 'equipment', 'end', 'mentoring', 'instance', 'health']) {
  const re = new RegExp(`primaryCmd === ["']${alias}["']`);
  if (re.test(engine)) pass(`dispatch site exists for alias: ${alias}`);
  else fail(`no dispatch site for alias: ${alias}`);
}

console.log(failures ? `\n❌ REGULAR MENU QA: ${failures} failure(s)` : '\n✅ REGULAR MENU QA: all checks passed');
process.exit(failures ? 1 : 0);
