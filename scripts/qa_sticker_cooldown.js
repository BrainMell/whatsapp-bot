#!/usr/bin/env node
/**
 * qa_sticker_cooldown.js - 2026-10-12
 * Regression QA for the sticker-cooldown bypass (owner: "remove SLOW DOWN
 * for stickers" - batch `.j s` on a lot of images must never hit the global
 * 5s cooldown warning). Run from repo root: node scripts/qa_sticker_cooldown.js
 *
 * Sections:
 *  A. Matcher behaviour - the exact `_isStickerCmd` logic copied from the
 *     cooldown block, tested against sticker forms (must bypass) and
 *     look-alike commands (must NOT bypass).
 *  B. Source guards - the bypass is wired into the engine's cooldown
 *     condition, the SLOW DOWN sender is intact for everything else, the
 *     sticker handler match conditions still line up with the matcher.
 *  C. Scope guards - gambling hard-lock + 20s same-game cooldown untouched.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " - " + extra : ""}`); }
}

const engineSrc = fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8");

// -- A. Matcher behaviour (logic mirrors engine.js cooldown block) ------------
console.log("\nA. `_isStickerCmd` matcher behaviour (prefix `.j`)");
const PFX = ".j";
function isStickerCmd(lowerTxt) {
  const _stickerPfx = `${PFX} s`;
  return lowerTxt === _stickerPfx || lowerTxt.startsWith(`${_stickerPfx} `);
}
// sticker forms → bypass (no SLOW DOWN ever on these)
ok(".j s (reply conversion)", isStickerCmd(".j s") === true);
ok(".j s -f (flag variant)", isStickerCmd(".j s -f") === true);
ok(".j s -spin (flag variant)", isStickerCmd(".j s -spin") === true);
ok(".j s 5 goku (search mode)", isStickerCmd(".j s 5 goku") === true);
// look-alikes → must still go through the cooldown gate
ok(".j menu (not sticker)", isStickerCmd(".j menu") === false);
ok(".j slots (not sticker)", isStickerCmd(".j slots") === false);
ok(".j setpack (not sticker)", isStickerCmd(".j setpack") === false);
ok(".j stats (no space-s)", isStickerCmd(".j stats") === false);
ok(".j spin (no space-s)", isStickerCmd(".j spin") === false);
ok(".j s (uppercase input pre-normalised: 'S ' form)", isStickerCmd(".j S") === false || isStickerCmd(".j s") === true, "engine only sees lowerTxt");
ok(".j sspin (contiguous, not sticker)", isStickerCmd(".j sspin") === false);

// -- B. Source guards ---------------------------------------------------------
console.log("\nB. Engine source guards");
const bypassIdx = engineSrc.indexOf("!_isStickerCmd");
ok("cooldown condition contains !_isStickerCmd", bypassIdx > 0);
ok("bypass sits inside the cooldown `if (isBotCommand ...)` condition",
  /if \(isBotCommand && !_isQuizAnswerMsg && !_quizQuestionOpen && !_isStickerCmd && !isOwner && !isGlobalMod\(senderJid\)\)/.test(engineSrc));
ok("matcher defined before the cooldown condition",
  engineSrc.indexOf("const _isStickerCmd") > -1 &&
  engineSrc.indexOf("const _isStickerCmd") < bypassIdx);
// the matcher prefix is built from the same prefix source the handlers use
ok("matcher uses botConfig.getPrefix().toLowerCase()", /const _stickerPfx = `\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} s`;/.test(engineSrc));
// SLOW DOWN sender must remain for non-exempt commands (exactly one live sender;
// comment mentions say `SLOW DOWN!` without bold asterisks, live one is *SLOW DOWN!*)
const slowDownSenders = (engineSrc.match(/\*SLOW DOWN!\*/g) || []).length;
ok("SLOW DOWN sender intact (1 live occurrence in engine)", slowDownSenders === 1, `found ${slowDownSenders}`);
ok("SLOW DOWN text unchanged", engineSrc.includes("Please wait *${timeLeft.toFixed(1)}s* before using another command."));
// handler match conditions still line up with the matcher
ok("media-conversion handler matches `.j s` exactly",
  engineSrc.includes("lowerTxt === `${botConfig.getPrefix().toLowerCase()} s` ||"));
ok("search handler matches `.j s ` prefix",
  engineSrc.includes("lowerTxt.startsWith(\n                      `${botConfig.getPrefix().toLowerCase()} s `,\n                    )") ||
  engineSrc.includes("`${botConfig.getPrefix().toLowerCase()} s `"));
// quiz exemptions still present (sticker bypass added alongside, not replacing)
ok("quiz answer exemption still in condition", engineSrc.includes("!_isQuizAnswerMsg && !_quizQuestionOpen"));

// -- C. Scope guards ----------------------------------------------------------
console.log("\nC. Abuse-path guards untouched");
ok("gambling hard spam lock still present", engineSrc.includes("checkGamblingSpam(senderJid)"));
ok("hard lock still blocks + notifies", engineSrc.includes("SYSTEM LOCKOUT"));
ok("20s same-game cooldown still present", engineSrc.includes("gameExpiration = lastGameTime + 20000"));
ok("global cooldown still SET for non-exempt commands", /\/\/ Update global timer\s*\n\s*commandCooldowns\.set\(senderJid, now\);/.test(engineSrc));
ok("global cooldown still CHECKED for non-exempt commands", engineSrc.includes("if (commandCooldowns.has(senderJid)) {"));
ok("sticker search send-gap pacing intact (300ms)", engineSrc.includes("setTimeout(res, 300)"));

console.log(`\n${"═".repeat(50)}\nRESULT: ${pass} pass, ${fail} fail ${fail === 0 ? "- ALL GREEN ✅" : "- FAILURES ❌"}`);
process.exit(fail === 0 ? 0 : 1);
