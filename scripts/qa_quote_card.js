#!/usr/bin/env node
/**
 * qa_quote_card.js - 2026-10-12
 * Regression QA for `.j quote <text>` (owner: "Make a .j qoute that takes
 * the text that follows and turns it into text over an appropriate image").
 * Run from repo root: node scripts/qa_quote_card.js
 *
 * Sections:
 *  A. Parsing - author attribution (--by / -by / -by), case + newline
 *     preservation, empty-author handling.
 *  B. Background keyword picker - stopwords, 4-word cap, 60-char cap,
 *     fallbacks.
 *  C. Renderer - real canvas renders (offline, gradient + supplied photo),
 *     PNG output sanity, length guards, emoji stripping (tofu protection).
 *  D. Engine wiring - require, handler, with-args dispatch ordered BEFORE
 *     the bare random-quote block, `qoute` alias, case-preserving text
 *     source (cleanTxt), senderJid passed explicitly (scope fix), registry
 *     entry, bare random-quote path intact.
 *  D2. Scope trap - the quote dispatch lives OUTSIDE the prefix-dispatch
 *     block, so it must NEVER reference primaryCmd/cmdArgs/currentPrefix
 *     (owner screenshot 10:51Z: "primaryCmd is not defined" broke every
 *     command dispatched after the quote block).
 *  E. Scope guards - cooldown untouched for quote, sticker bypass matcher
 *     unchanged.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " - " + extra : ""}`); }
}

const quoteCard = require(path.join(ROOT, "core/utils/quoteCard"));
const engineSrc = fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8");
const regSrc = fs.readFileSync(path.join(ROOT, "core/utils/commandRegistry.js"), "utf8");

(async () => {
// -- A. Parsing ---------------------------------------------------------------
console.log("\nA. parseQuoteInput");
let r = quoteCard.parseQuoteInput("Be water my friend --by Bruce Lee");
ok("--by attribution", r.text === "Be water my friend" && r.author === "Bruce Lee", JSON.stringify(r));
r = quoteCard.parseQuoteInput("Stay hungry stay foolish \u2014by Steve Jobs");
ok("\u2014by (em-dash) attribution", r.text === "Stay hungry stay foolish" && r.author === "Steve Jobs", JSON.stringify(r));
r = quoteCard.parseQuoteInput("less is more \u2013by Mies");
ok("\u2013by (en-dash) attribution", r.text === "less is more" && r.author === "Mies", JSON.stringify(r));
r = quoteCard.parseQuoteInput("The night is darkest just before the dawn");
ok("no author → text untouched", r.text === "The night is darkest just before the dawn" && r.author === "", JSON.stringify(r));
r = quoteCard.parseQuoteInput("Don't Count The Days --by The Rock");
ok("capitalization preserved", r.text === "Don't Count The Days" && r.author === "The Rock", JSON.stringify(r));
r = quoteCard.parseQuoteInput("hello --by   ");
ok("empty author ignored (flag stays in text)", r.author === "" && r.text === "hello --by", JSON.stringify(r));
r = quoteCard.parseQuoteInput("  leading and trailing   ");
ok("trims whitespace", r.text === "leading and trailing", JSON.stringify(r));
r = quoteCard.parseQuoteInput("line one\nline two");
ok("hard newline preserved", r.text === "line one\nline two", JSON.stringify(r));
ok("null input safe", quoteCard.parseQuoteInput(null).text === "");

// -- B. Background keyword picker ---------------------------------------------
console.log("\nB. pickBackgroundQuery");
let q = quoteCard.pickBackgroundQuery("The only thing we have to fear is fear itself");
ok("stopwords dropped", q === "fear fear itself" || q === "thing fear fear itself", q);
ok("≤4 words", q.split(" ").length <= 4, q);
q = quoteCard.pickBackgroundQuery("hello, world! (testing) punctuation...");
ok("punctuation stripped", !/[,!()]/.test(q), q);
ok("≤60 chars", quoteCard.pickBackgroundQuery("word ").repeat(1).length <= 60);
q = quoteCard.pickBackgroundQuery("the a of and to is");
ok("all-stopwords falls back to raw words", q.length > 0 && q.split(" ").length <= 4, q);
ok("empty input → fallback", quoteCard.pickBackgroundQuery("") === "aesthetic landscape");
ok("null input → fallback", quoteCard.pickBackgroundQuery(null) === "aesthetic landscape");
q = quoteCard.pickBackgroundQuery("sunrise over the mountains and the valley below the clouds forever");
ok("long input capped at 60 chars", q.length <= 60, q);

// -- C. Renderer (real canvas, offline) ---------------------------------------
console.log("\nC. renderQuoteCard");
const strip = quoteCard.stripEmoji("Hello \u{1F30D} world! \u{1F600} \u2192 \u2713 \uFE0F");
ok("emoji stripped", !/\u{1F30D}|\u{1F600}|\uFE0F/u.test(strip), JSON.stringify(strip));
ok("arrows/math kept (DejaVu coverage)", strip.includes("\u2192") && strip.includes("\u2713"), JSON.stringify(strip));

const buf1 = await quoteCard.renderQuoteCard({ text: "The night is darkest just before the dawn. But I promise you, the dawn is coming.", author: "Harvey Dent" });
ok("gradient render → PNG magic", buf1.slice(1, 4).toString() === "PNG");
ok("gradient render non-trivial size", buf1.length > 20000, `${buf1.length} bytes`);

// synthetic photo bg (gradient PNG as a stand-in for a Pinterest download)
const canvas = require(path.join(ROOT, "node_modules/canvas"));
const c = canvas.createCanvas(640, 480);
const ctx = c.getContext("2d");
const g = ctx.createLinearGradient(0, 0, 640, 480);
g.addColorStop(0, "#3b5998"); g.addColorStop(1, "#8b5a2b");
ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
const fakePhoto = c.toBuffer("image/png");
const buf2 = await quoteCard.renderQuoteCard({ text: "Be water, my friend.\nEmpty your mind.", author: "Bruce Lee", bgBuffer: fakePhoto });
ok("photo-bg render → PNG magic", buf2.slice(1, 4).toString() === "PNG");
ok("hard newline renders as 2 lines (no throw)", Buffer.isBuffer(buf2) && buf2.length > 20000);

const long300 = "word ".repeat(60).trim(); // exactly 300 chars
let threw = false;
try { await quoteCard.renderQuoteCard({ text: long300 }); } catch (e) { threw = true; }
ok("exactly 300 chars renders (boundary)", !threw);
threw = false;
try { await quoteCard.renderQuoteCard({ text: long300 + " x" }); } catch (e) { threw = true; }
ok("301 chars throws", threw);
threw = false;
try { await quoteCard.renderQuoteCard({ text: "\u{1F600}\u{1F600}" }); } catch (e) { threw = true; }
ok("emoji-only text throws (empty after strip)", threw);
threw = false;
try { await quoteCard.renderQuoteCard({ text: "" }); } catch (e) { threw = true; }
ok("empty text throws", threw);
ok("MAX_TEXT exported as 300", quoteCard.MAX_TEXT === 300);

// -- D. Engine wiring ---------------------------------------------------------
console.log("\nD. Engine wiring (source guards)");
ok("quoteCard required in engine", engineSrc.includes('require("./utils/quoteCard")'));
ok("handler defined", engineSrc.includes("async function handleQuoteImageCommand(sock, chatId, rawText, m, senderJid)"));
ok("with-args dispatch via lowerTxt startsWith (quote)", /lowerTxt\.startsWith\(\s*`\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} quote `/.test(engineSrc));
ok("with-args dispatch via lowerTxt startsWith (qoute)", /lowerTxt\.startsWith\(\s*`\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} qoute `/.test(engineSrc));
ok("trailing-space startsWith implies args present", engineSrc.includes("} quote `,") || /} quote `/.test(engineSrc));
ok("text source is cleanTxt (case/newlines preserved)", /const qRaw = cleanTxt\s*\n\s*\.substring\(botConfig\.getPrefix\(\)\.length\)/.test(engineSrc));
ok("senderJid passed explicitly (storage.run scope fix)", /handleQuoteImageCommand\(\s*sock,\s*chatId,\s*qRaw,\s*m,\s*senderJid,?\s*\)/.test(engineSrc));

// order: with-args dispatch must appear BEFORE the bare random-quote block
const cardIdx = engineSrc.indexOf("Quote CARD - `.j quote <text>");
const bareIdx = engineSrc.indexOf("// Quote Command (NEW)");
ok("with-args dispatch sits before bare quote block", cardIdx > -1 && bareIdx > -1 && cardIdx < bareIdx, `card@${cardIdx} bare@${bareIdx}`);

ok("bare random-quote path still exact-match", engineSrc.includes("lowerTxt === `${botConfig.getPrefix().toLowerCase()} quote` ||"));
ok("bare random-quote qoute alias added", engineSrc.includes("lowerTxt === `${botConfig.getPrefix().toLowerCase()} qoute`"));
ok("bare path still hits dummyjson API first", engineSrc.includes("https://dummyjson.com/quotes/random"));
ok("bare path still awards progression", /Quote Command \(NEW\)[\s\S]{0,3000}awardProgression\(senderJid, chatId\);/.test(engineSrc));

ok("registry: quote entry updated for card mode", /cmd: 'quote', desc: 'Random famous quote - or add your own text/.test(regSrc));
ok("registry: usage shows [text] and [--by author]", regSrc.includes("usage: 'quote [text] [--by author]'"));
ok("engine sends PNG as image (not document)", /image: sendBuf,/.test(engineSrc));
ok("JPEG conversion at send path (2.4MB PNG → ~340KB)", /require\("sharp"\)\(png\)\.jpeg\(\{ quality: 88 \}\)/.test(engineSrc));
ok("JPEG conversion has PNG fallback", /jpeg conversion failed, sending PNG/.test(engineSrc));
ok("15s upload-hang guard on quote card send", engineSrc.includes("quote card upload timed out after 15000ms"));
ok("background search uses quote's own words (appropriate image)", engineSrc.includes("quoteCard.pickBackgroundQuery(qText)"));
ok("bg failure falls back to gradient (never dead)", /bg search failed, gradient fallback/.test(engineSrc));

// -- D2. Scope trap (owner screenshot 10:51Z) --------------------
console.log("\nD2. Scope trap: dispatch block must use ONLY storage.run-scope vars");
{
  const blockStart = engineSrc.indexOf("// 🖋️ Quote CARD -");
  const blockEnd = engineSrc.indexOf("// Quote Command (NEW)");
  ok("quote dispatch block located", blockStart > -1 && blockEnd > blockStart);
  if (blockStart > -1 && blockEnd > blockStart) {
    const block = engineSrc.slice(blockStart, blockEnd);
    const code = block.replace(/^\s*\/\/.*$/gm, ""); // strip comments, keep code
    ok("NO primaryCmd in dispatch code", !/\bprimaryCmd\b/.test(code), "out of scope here → ReferenceError");
    ok("NO cmdArgs in dispatch code", !/\bcmdArgs\b/.test(code), "out of scope here → ReferenceError");
    ok("NO currentPrefix in dispatch code", !/\bcurrentPrefix\b/.test(code), "not proven in scope - use botConfig.getPrefix()");
    ok("dispatch uses lowerTxt (proven in scope)", /\blowerTxt\b/.test(code));
    ok("dispatch uses cleanTxt (same scope as lowerTxt)", /\bcleanTxt\b/.test(code));
    ok("handler still takes senderJid as param (not outer-scope lookup)",
      engineSrc.includes("async function handleQuoteImageCommand(sock, chatId, rawText, m, senderJid)"));
  }
}

// -- E. Scope guards ----------------------------------------------------------
console.log("\nE. Scope guards (cooldown / sticker bypass untouched)");
ok("sticker bypass matcher unchanged (still ` s` prefix only)", engineSrc.includes("const _stickerPfx = `${botConfig.getPrefix().toLowerCase()} s`;"));
ok("quote NOT added to cooldown bypass", !/_isStickerCmd[^;]*quote/.test(engineSrc) && !/quote[^;]*_isStickerCmd/.test(engineSrc));
ok("global cooldown check intact", engineSrc.includes("if (commandCooldowns.has(senderJid)) {"));
ok("gambling hard lock intact", engineSrc.includes("checkGamblingSpam(senderJid)"));

console.log(`\n${"═".repeat(50)}\nRESULT: ${pass} pass, ${fail} fail ${fail === 0 ? "- ALL GREEN ✅" : "- FAILURES ❌"}`);
process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
