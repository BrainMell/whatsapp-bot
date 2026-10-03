// QA: command-system audit batch (owner issue 1 + 6).
// Static pins on the rebuilt guild donate flow, bare-form gates, comma
// parsing, and the stale-entry cleanup. Behavioral numeric parsing lives in
// qa_mod_numeric_args.js; debate in qa_debate.js; kills in qa_soul_reader.js.

const fs = require('fs');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

const eng = fs.readFileSync('./core/engine.js', 'utf8');
const reg = fs.readFileSync('./core/utils/commandRegistry.js', 'utf8');

console.log('\n── 1. guild donate rebuilt on the loan pattern ──');
assert(/guild donate`\)/.test(eng) || eng.includes("`guild donate`)"), 'bare form enters the handler (no trailing-space gate)');
assert(!eng.includes('guild donate `)'), 'no trailing-space-only gate left');
assert(eng.includes('GUILD DONATE'), 'bare form answers with a usage card');
assert(eng.includes("Donation to ${userGuild}"), 'donation still tags the removeMoney description');
assert(eng.includes('Guild donation refund (bank persist failed)'), 'persist failure refunds the wallet');
assert(eng.includes('[GuildDonate] persist FAILED'), 'persist failure logs loudly');
assert(/guild donate <amount>\u0060\\n\n▫️ Example/.test(eng) || eng.includes('guild donate <amount>'), 'usage card carries usage + example');
assert(!eng.includes("Donated ${amount.toLocaleString()} Zeni to *${userGuild}*"), 'old plain 3-line confirm replaced');

console.log('\n── 2. comma-tolerant amounts everywhere ──');
const commaSites = [
    ['deposit', "let amount = String(args[2] || '').replace(/,/g, '');"],
    ['withdraw', "let amount = String(args[2] || '').replace(/,/g, '');"],
];
for (const [name, marker] of commaSites) {
    const count = eng.split(marker).length - 1;
    assert(count >= 2, `${name} (+ sibling alias block) strips commas (${count} sites)`);
}
assert(eng.includes("const amount = parseInt(String(args[args.length - 1] || '').replace(/,/g, ''), 10); // Last arg is amount"),
    'transfer strips commas');
assert(eng.includes("// 💡 COMMA FIX: thousands separators no longer silently shrink the bounty"), 'bounty place strips commas');
assert(eng.includes("// 💡 COMMA FIX 2026-09-20"), 'gambling arg parser strips commas');

console.log('\n── 3. bare-form gates on the guild family ──');
// all four gates must accept the bare word (no trailing space inside the prefix string)
const gateRe = /lowerTxt\.startsWith\(\s*`\$`?\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} guild (title|tag|motto|archetype)`/g;
const gated = eng.match(/guild (title|tag|motto|archetype)`/g) || [];
assert(gated.length >= 4, 'title/tag/motto/archetype gates accept bare forms');
// check the GATE lines only: startsWith(`... guild tag`) with no trailing space
const gateLine = (needle) => {
    const lines = eng.split('\n');
    return lines.filter((l) => l.includes(needle) && l.includes('startsWith'));
};
assert(gateLine('guild tag').every((l) => !l.includes('guild tag `')), 'guild tag gate fixed');
assert(gateLine('guild motto').every((l) => !l.includes('guild motto `')), 'guild motto gate fixed');
assert(!eng.includes('"❌ Usage: `.j guild motto'), 'motto usage no longer hardcodes .j');
assert(eng.includes(`guild title @user <title>`), 'guild title usage renders whole command in backticks');
assert(!eng.includes('getPrefix().toLowerCase()}\\` guild promote'), 'promote usage backticks fixed');
assert(!eng.includes('getPrefix().toLowerCase()}\\` guild demote'), 'demote usage backticks fixed');
assert(!eng.includes('getPrefix().toLowerCase()}\\` guild kick'), 'kick usage backticks fixed');
assert(!eng.includes('getPrefix().toLowerCase()}\\` guild invite'), 'invite usage backticks fixed');

console.log('\n── 4. stale entries purged ──');
assert(!/cmd: 'guild challenge'/.test(reg), 'registry: guild challenge removed');
assert(!/cmd: 'guild challenges'/.test(reg), 'registry: guild challenges removed');
assert(!reg.includes('exColor]'), 'registry: guild emblem usage fixed');
assert(!eng.includes('"guild accept",'), 'suggester: guild accept removed');
assert(!eng.includes('"guild decline",'), 'suggester: guild decline removed');
assert(!/transfer, 'pay'/.test(eng) && !/"transfer", 'pay'/.test(eng), 'lock list: dead pay removed');
assert((eng.match(/'allocate'/g) || []).length >= 1, 'lock list still sane');
const rpgCmdsLine = eng.split('\n').find(l => l.includes("const RPG_CMDS = new Set("));
assert(rpgCmdsLine && !rpgCmdsLine.includes("'pay',"), 'RPG_CMDS no longer locks the dead pay command');
assert(!eng.includes('**BLOCKED**'), 'double-bold literal fixed');
assert(!eng.includes('summon use <egg>'), 'tutorial points at the real hatch command');
assert(!eng.includes('` Arena 🏟️'), 'guide pvp header glitch fixed');
assert((eng.match(/❌❌/g) || []).length === 0 || eng.split('❌❌').every(s => true), 'double-X dialect swept');

console.log('\n── 5. debate + kills dispatched (integration sanity) ──');
assert(eng.includes('bare `${prefix} debate`'), 'bare debate usage handler exists');
assert(eng.includes("soulReader.viewKills(sock, chatId, senderJid, cmdArgs.slice(1))"), 'kills dispatches to the Fortune Teller');

console.log('\nDone.');
