/**
 * QA: quote sticker renderer (`.j s` on a text message)
 * Run from repo root:  node scripts/qa_quote_sticker.js
 * Outputs sample PNGs to temp/qa_quote/ for visual inspection.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log("  ✓", label);
  } else {
    fail++;
    console.log("  ✗ FAIL:", label);
  }
}

const qs = require("../core/utils/quoteSticker");

(async () => {
  console.log("════ 1. emoji tokenizer ════");
  const toks = qs.parseEmojiRuns("hi 😀🔥🇳🇬👍🏻 and 👨‍👩‍👧‍👦 1️⃣ ❤️ plain");
  const emojis = toks.filter((t) => t.type === "emoji").map((t) => t.value);
  ok(emojis.length === 7, `7 emoji tokens found (got ${emojis.length}: ${emojis.join(" ")})`);
  ok(emojis.includes("🇳🇬"), "flag pair kept as one token");
  ok(emojis.includes("👍🏻"), "skin tone kept as one token");
  ok(emojis.includes("👨‍👩‍👧‍👦"), "ZWJ family kept as one token");
  ok(emojis.includes("1️⃣"), "keycap kept as one token");
  ok(toks.some((t) => t.type === "text" && t.value.includes("plain")), "plain text preserved");
  ok(qs.parseEmojiRuns("no emoji here").every((t) => t.type === "text"), "no false positives on plain text");

  console.log("════ 2. twemoji codepoints ════");
  const [full, stripped] = qs.emojiCodepoints("❤️");
  ok(full === "2764-fe0f" && stripped === "2764", `❤️ -> ${full} / ${stripped}`);
  const [, f2] = qs.emojiCodepoints("😀");
  ok(f2 === "1f600", `😀 -> ${f2}`);

  console.log("════ 3. text wrapping ════");
  const canvasMod = require("canvas");
  const { createCanvas } = canvasMod;
  const c = createCanvas(10, 10);
  const ctx = c.getContext("2d");
  const measure = (tokens) => {
    ctx.font = '28px "QuoteSans", "DejaVu Sans", sans-serif';
    let w = 0;
    for (const t of tokens) w += t.type === "emoji" ? 28 * 1.18 : ctx.measureText(t.value).width;
    return w;
  };
  const maxW = 342 - 22 * 2; // bubble 342, pad 22
  const wrapped = qs.wrapTokens(["the quick brown fox jumps over the lazy dog again and again"], maxW, measure);
  ok(wrapped.length >= 2, `long sentence wraps into ${wrapped.length} lines`);
  let allFit = true;
  for (const ln of wrapped) {
    const w = measure(ln.flat());
 // trailing spaces are cosmetic-only; exclude them from the fit check
    const noTrailing = [...ln];
    while (noTrailing.length && /^\s+$/.test(noTrailing[noTrailing.length - 1].value)) noTrailing.pop();
    if (measure(noTrailing) > maxW + 1) allFit = false;
  }
  ok(allFit, "every wrapped line fits within maxW");
  const giant = qs.wrapTokens(["A".repeat(80)], maxW, measure);
  ok(giant.length >= 2, `giant word hard-split into ${giant.length} lines`);
  ok(qs.wrapTokens([""], maxW, measure).length === 0, "empty line -> no lines");

  console.log("════ 4. pfp stub server ════");
 // tiny JPEG served locally so fetchPfp+axios+loadImage path is exercised
  const sharp = require("sharp");
  const pfpJpg = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 155, g: 89, b: 182 } },
  })
    .jpeg()
    .toBuffer();
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(pfpJpg);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const fakeSock = {
    profilePictureUrl: async () => `http://127.0.0.1:${port}/pfp.jpg`,
  };

  console.log("════ 5. render samples ════");
  const outDir = path.join(__dirname, "..", "temp", "qa_quote");
  fs.mkdirSync(outDir, { recursive: true });
  async function renderAndCheck(name, opts) {
    const buf = await qs.renderQuoteSticker(opts);
    const p = path.join(outDir, `${name}.png`);
    fs.writeFileSync(p, buf);
    const meta = await sharp(buf).metadata();
    ok(meta.width === 512 && meta.height === 512, `${name}: 512×512 (${meta.width}×${meta.height})`);
    ok(meta.hasAlpha === true, `${name}: transparent background`);
    ok(buf.length > 3000, `${name}: non-trivial size (${Math.round(buf.length / 1024)}KB)`);
    return buf;
  }
  await renderAndCheck("s1_mister_e", {
    text: "I like guys",
    name: "Mister E",
    jid: "234801234567@s.whatsapp.net",
    sock: fakeSock,
    dark: false,
  });
  await renderAndCheck("s2_long", {
    text:
      "This is a much longer message that should wrap across several lines inside the bubble. " +
      "The renderer has to shrink the font and keep everything inside 512 pixels without " +
      "overflowing the canvas. Second paragraph after a blank line.\n" +
      "New line after explicit newline, plus a supercalifragilisticexpialidociousandunbreakableword at the end.",
    name: "Onion(Esther/Adiosa)",
    jid: "234809876543@s.whatsapp.net",
    sock: null,
    dark: false,
  });
  await renderAndCheck("s3_emoji", {
    text: "Good morning 🔥💯 the package arrived 😀🇳🇬 thank you 👍🏻👍🏿 ❤️‍🔥 1️⃣2️⃣3️⃣ 👨‍👩‍👧‍👦",
    name: "Schtrödinger ✝",
    jid: "2349036406265@s.whatsapp.net",
    sock: null,
    dark: false,
  });
  await renderAndCheck("s4_dark", {
    text: "dark theme bubble for night owls 🌙",
    name: "thehollow ✝",
    jid: "2347076192459@s.whatsapp.net",
    sock: fakeSock,
    dark: true,
  });
  await renderAndCheck("s5_noname", {
    text: "who am i? no jid, no pushname, unknown user",
    name: null,
    jid: null,
    sock: null,
    dark: false,
  });
  await renderAndCheck("s6_longname", {
    text: "short text, absurdly long display name that must be ellipsized inside the bubble width",
    name: "ExtremelyLongWhatsAppDisplayNameThatWontFitAnywhereAtAll Believe Me",
    jid: "15551234567@s.whatsapp.net",
    sock: null,
    dark: false,
  });

  srv.close();
  console.log(`\n════ RESULT: ${pass} pass, ${fail} fail ════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
