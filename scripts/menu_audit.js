#!/usr/bin/env node
/**
 * menu_audit.js - extract REAL dispatch surface of engine.js and diff vs
 * commandRegistry (regular menu) + modMenuData (mod menu).
 * Usage: node scripts/menu_audit.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(ROOT, 'core/engine.js'), 'utf8');

// -- 1. Extract primaryCmd === "x" literals from CURRENT engine source --
const primaryLiterals = new Set();
const re1 = /primaryCmd\s*===\s*["']([a-z0-9 +_.!?-]+)["']/gi;
let mm;
while ((mm = re1.exec(engine))) primaryLiterals.add(mm[1].toLowerCase());

// -- 2. Extract sub-command dispatch: primaryCmd === "p" && cmdArgs[1] === "s" --
// Rough scan: find `cmdArgs[1] === "x"` and `sub === "x"` literals per primary block is
// too fragile; instead collect cmdArgs[1] literals globally and join with known generic primaries.
const subLiterals = new Set();
const re2 = /(?:cmdArgs\[1\]|sub)\s*===\s*["']([a-z0-9 +_.!?-]+)["']/gi;
while ((mm = re2.exec(engine))) subLiterals.add(mm[1].toLowerCase());

// Generic primaries that use subcommands:
const GENERIC = ['guild','gw','war','quiz','rune','abyss','raid','bounty','summon','market','ludo','murder','wordle','anime','deck','event','rank','title','cards','eshop','t2deck','cardstyle','spawn','mode','test','chess','move','solo','mine','shop','auction','bug','issues','invest','stocks','loot','rpg','mod'];
const multiword = new Set();
for (const g of GENERIC) {
  if (!primaryLiterals.has(g)) continue;
  for (const s of subLiterals) {
    if (s.includes(' ')) continue; // already multiword
    multiword.add(`${g} ${s}`);
  }
}

// -- 3. Load both menus --
const REG = require(path.join(ROOT, 'core/utils/commandRegistry'));
const { MOD_MENU } = require(path.join(ROOT, 'core/utils/modMenuData'));

const regCmds = new Map(); // cmd -> categories[]
for (const [cat, arr] of Object.entries(REG)) for (const c of arr) {
  if (!regCmds.has(c.cmd)) regCmds.set(c.cmd, []);
  regCmds.get(c.cmd).push(cat);
}
const modCmds = new Map(); // command string -> categories
for (const [cat, v] of Object.entries(MOD_MENU)) for (const c of (v.commands||[])) {
  const name = typeof c === 'string' ? c : c.cmd;
  if (!modCmds.has(name)) modCmds.set(name, []);
  modCmds.get(name).push(cat);
}

// -- 4. Report --
const allMenuCmds = new Set([...regCmds.keys(), ...modCmds.keys()]);
const engineSet = new Set([...primaryLiterals, ...multiword]);

const missingFromMenus = [...engineSet].filter(c => !allMenuCmds.has(c)).sort();
const missingFromRegular = [...engineSet].filter(c => !regCmds.has(c) && modCmds.has(c)).sort();
const deadInMenu = [...allMenuCmds].filter(c => {
  if (engineSet.has(c)) return false;
  const first = c.split(' ')[0];
  return !engineSet.has(first) && !GENERIC.includes(first);
}).sort();

console.log('=== ENGINE-HANDLED, ABSENT FROM BOTH MENUS ===');
missingFromMenus.forEach(c => console.log('  ' + c));
console.log(`\n=== ENGINE-HANDLED, ONLY IN MOD MENU (missing from regular) ===`);
missingFromRegular.forEach(c => console.log('  ' + c + '  [' + modCmds.get(c).join(',') + ']'));
console.log(`\n=== IN MENUS BUT NO ENGINE DISPATCH FOUND (verify manually) ===`);
deadInMenu.forEach(c => console.log('  ' + c + (regCmds.has(c) ? '  [reg:' + regCmds.get(c).join(',') + ']' : '  [mod:' + modCmds.get(c).join(',') + ']')));
console.log(`\ncounts: engine=${engineSet.size} regular=${regCmds.size} mod=${modCmds.size}`);
