#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 🛡️ QA: MOD MENU ACCURACY PASS (2026-09-19)
// ═══════════════════════════════════════════════════════════════════════
// The mod menu shipped 2026-09-10 listed commands that don't exist
// (`.j mod updateall` - real form is `.j updateall`) and missed whole
// families (issues/testers, cards moderation, owner tools). This suite
// pins the menu to reality:
//
//   1. DISPATCH CHECK  - every menu entry must correspond to a real
//      dispatch site: console entries -> adminConsole.js `sub === 'x'`,
//      standalone -> engine.js / cardSystem.js / opsCheckCommands.js
//      (primaryCmd ===, case, or `${prefix} <cmd>` template literals).
//   2. CONSISTENCY     - usage starts with cmd; console flag ⇔ usage
//      begins with "mod "; no duplicate cmd keys.
//   3. CAPTION BUDGET  - every renderable view (main grid, all category
//      views, explain for every command) must stay under the WhatsApp
//      1024-char caption limit, with banner + worst-case tip included.
//
// Run: node scripts/qa_mod_menu.js   (exit 1 on any failure)
// ═══════════════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const { MOD_MENU, MOD_TIPS, findStandalone } = require("../core/utils/modMenuData");

const ROOT = path.join(__dirname, "..");
let failures = 0;
const fail = (msg) => { failures++; console.log("  ❌ " + msg); };
const pass = (msg) => console.log("  ✅ " + msg);

// ── Load dispatch sources ──────────────────────────────────────────────
const SRC = {
  engine: fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8"),
  adminConsole: fs.readFileSync(path.join(ROOT, "core/commands/adminConsole.js"), "utf8"),
  cardSystem: fs.readFileSync(path.join(ROOT, "core/rpg/cardSystem.js"), "utf8"),
  opsCheck: fs.readFileSync(path.join(ROOT, "core/commands/opsCheckCommands.js"), "utf8"),
};
const ALL_SRC = SRC.engine + SRC.cardSystem + SRC.opsCheck;

// Harvest dispatch tokens: `primaryCmd === "x"`, `case 'x'`, and the
// literal that follows an interpolated prefix inside backtick matchers
// (e.g. startsWith(`${botConfig.getPrefix().toLowerCase()} issues`)).
const TOKENS = new Set();
function harvest(src) {
  const patterns = [
    /primaryCmd\s*===\s*["']([^"']+)["']/g,
    /case\s+["']([^"']+)["']/g,
    /\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\}\s*((?:[a-z0-9_]+\s+){0,2}[a-z0-9_]+)/g,
    /\$\{prefix\}\s*((?:[a-z0-9_]+\s+){0,2}[a-z0-9_]+)/g,
    /\$\{P\}\s*((?:[a-z0-9_]+\s+){0,2}[a-z0-9_]+)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) TOKENS.add(m[1].trim().toLowerCase());
  }
}
harvest(SRC.engine);
harvest(SRC.cardSystem);
harvest(SRC.opsCheck);

function dispatchExists(cmd) {
  const base = cmd.split(" ")[0];
  if (TOKENS.has(cmd.toLowerCase())) return "exact";
  if (cmd.includes(" ") && ALL_SRC.includes(cmd)) return "raw-multiword";
  if (TOKENS.has(base)) return "base-token";
  // exact-form dispatches like `${prefix} welcome on` register the full
  // phrase, not the bare word - accept a token that starts with "base "
  for (const t of TOKENS) if (t.startsWith(base + " ")) return "phrase-token";
  return null;
}

// ── 1. CONSISTENCY ─────────────────────────────────────────────────────
console.log("\n📋 CONSISTENCY");
const seen = new Set();
let entryCount = 0;
for (const [catKey, cat] of Object.entries(MOD_MENU)) {
  for (const c of cat.commands) {
    entryCount++;
    if (seen.has(c.cmd)) fail(`duplicate cmd key: ${c.cmd}`);
    seen.add(c.cmd);
    // For console entries the usage is "mod <cmd> ..." - strip the prefix
    // before comparing with the lookup key.
    const form = c.console ? c.usage.replace(/^mod\s+/, "") : c.usage;
    if (!form.startsWith(c.cmd))
      fail(`${c.cmd}: usage "${c.usage}" does not carry the command`, );
    if (!!c.console !== c.usage.startsWith("mod "))
      fail(`${c.cmd}: console flag (${!!c.console}) contradicts usage form "${c.usage}"`);
    if (!c.desc || c.desc.length < 8) fail(`${c.cmd}: desc missing/too short`);
  }
}
if (failures === 0) pass(`${entryCount} entries, no dupes, usage forms consistent`);

// ── 2. DISPATCH CHECK ──────────────────────────────────────────────────
console.log("\n📋 DISPATCH CHECK (menu vs real code)");
let checked = 0;
for (const [catKey, cat] of Object.entries(MOD_MENU)) {
  for (const c of cat.commands) {
    checked++;
    if (c.console) {
      const sub = c.cmd.split(" ")[0];
      if (!new RegExp(`sub\\s*===\\s*['"]${sub}['"]`).test(SRC.adminConsole))
        fail(`[console] ${c.cmd}: no "sub === '${sub}'" in adminConsole.js`);
    } else {
      const how = dispatchExists(c.cmd);
      if (!how) fail(`[standalone] ${c.cmd}: no dispatch site found in engine/cardSystem/opsCheck`);
    }
  }
}
if (failures === 0) pass(`all ${checked} entries trace to a dispatch site`);

// ── 3. REDIRECT HELPER ─────────────────────────────────────────────────
console.log("\n📋 REDIRECT HELPER (findStandalone)");
const redirectCases = [
  [["spawn", "Mega"], true, "card tool redirects"],
  [["updateall", "hi"], true, "broadcast redirects"],
  [["warn", "@u"], true, "group tool redirects"],
  [["rank", "toggleperm", "3"], true, "multiword rank redirects"],
  [["eshop", "deck", "approve", "5"], true, "multiword eshop redirects"],
  [["sandbox", "on"], false, "console sub does NOT redirect"],
  [["setlevel", "50"], false, "console sub does NOT redirect"],
  [["enemy", "setstat", "x"], false, "console sub does NOT redirect"],
  [["totalgarbage"], false, "unknown does NOT redirect"],
  [[], false, "empty args safe"],
];
for (const [args, expected, label] of redirectCases) {
  const got = !!findStandalone(args);
  if (got === expected) pass(label);
  else fail(`${label}: expected ${expected}, got ${got}`);
}

// ── 4. CAPTION BUDGET (WhatsApp 1024) ──────────────────────────────────
console.log("\n📋 CAPTION BUDGET (limit 1024, banner + worst-case tip included)");
const PREFIX = ".j";
const banner = (t) => `┏━━━━━━━━━━━━━━━┓\n┃   ${t}\n┗━━━━━━━━━━━━━━━┛`;
const worstTip = MOD_TIPS.reduce((a, b) => (b.length > a.length ? b : a))
  .replaceAll("{p}", PREFIX);
const LIMIT = 1024;

function checkView(label, text) {
  if (text.length > LIMIT) fail(`${label}: ${text.length} chars > ${LIMIT}`);
  else pass(`${label}: ${text.length} chars`);
}

// Main grid (owner sees all 9 categories, 2-col rows)
let mainMsg = banner("🛡️ *MOD TERMINAL*") + `\n *Version 9.9.9* \n *By mellow* \n\n`;
mainMsg += `_Your permissions: 👑 Owner_\n\n*Prefix:* ${PREFIX}\n\n`;
mainMsg += `📂 *Mod Categories* - type \`${PREFIX} mod <name>\` to open:\n\n`;
const allCats = Object.entries(MOD_MENU);
for (let i = 0; i < allCats.length; i += 2) {
  const c1 = `\`${allCats[i][1].emoji} ${allCats[i][1].name}\``.padEnd(24);
  const c2 = allCats[i + 1] ? `\`${allCats[i + 1][1].emoji} ${allCats[i + 1][1].name}\`` : "";
  mainMsg += `${c1} ${c2}\n`;
}
mainMsg += `\n➤ Type \`${PREFIX} mod <CATEGORY>\` to see its commands.`;
mainMsg += `\n➤ Type \`${PREFIX} mod <command>\` for details.\n\n💡 *Tip:* ${worstTip}`;
checkView("main grid", mainMsg);

// Category views (ticket #b4f818: labels are the SHORT action word `c.cmd`,
// not the full usage path - matches engine.js sendModMenu's category render)
for (const [catKey, cat] of Object.entries(MOD_MENU)) {
  let msg = banner(`${cat.emoji} ${cat.name.toUpperCase()} - MOD`) + `\n\n`;
  for (const c of cat.commands) msg += `➤ \`${c.cmd}\`\n`;
  msg += `\n➤ Type \`${PREFIX} mod <command>\` for details.`;
  msg += `\n➤ Type \`${PREFIX} mod\` to go back.`;
  checkView(`category ${catKey}`, msg);
}

// Explain views (every entry, with example + worst tip)
let worstExplain = 0, worstExplainCmd = "";
for (const [, cat] of Object.entries(MOD_MENU)) {
  for (const c of cat.commands) {
    let msg = banner(`${cat.emoji} BOTNAME`) + `\n\n`;
    msg += `*Command:* \`${PREFIX} ${c.usage}\`\n\n`;
    msg += `*Description:*\n${c.desc}\n\n`;
    if (c.eg) msg += `*Example:*\n\`${PREFIX} ${c.eg}\`\n\n`;
    msg += `*Category:* ${cat.name}\n\n💡 *Tip:* ${worstTip}`;
    if (msg.length > worstExplain) { worstExplain = msg.length; worstExplainCmd = c.cmd; }
    if (msg.length > LIMIT) fail(`explain ${c.cmd}: ${msg.length} chars > ${LIMIT}`);
  }
}
pass(`all explain views ok (worst: ${worstExplainCmd} at ${worstExplain} chars)`);

// ── 5. NO GHOST FORMS ──────────────────────────────────────────────────
console.log("\n📋 NO GHOST FORMS");
const ghost = ["modupdate", "mod updateall", "mod spawn", "mod warn", "mod ban", "mod eshop", "mod event", "testergc"];
let ghostHits = [];
const menuText = JSON.stringify(MOD_MENU) + MOD_TIPS.join(" ");
for (const g of ghost) if (menuText.includes(g)) ghostHits.push(g);
if (ghostHits.length === 0) pass("no invented/ghost command forms in menu data");
else fail(`ghost forms present: ${ghostHits.join(", ")}`);

// ── Summary ────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
if (failures > 0) {
  console.log(`❌ MOD MENU QA: ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log(`✅ MOD MENU QA: all checks passed (${entryCount} entries, ${Object.keys(MOD_MENU).length} categories)`);
}
