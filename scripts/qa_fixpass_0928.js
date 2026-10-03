// Focused tests for the 2026-09-28 fix pass:
//   1. buildRandomMixedPlan: random mode mixes logos/songs/images/lore
//   2. wikipediaImage relevance anchor (title-token overlap + collage reject)
//   3. antinude exemption: functions are CALLED, not truthiness-checked;
//      2026-09-28 owner directive (refined): group ADMINS are subject to
//      antinude; General Mods, GC owner and the bot owner remain exempt
//   4. visionVerify: breaker + shrink fail-open behavior (no provider in sandbox)
process.chdir(__dirname + "/..");

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

(async () => {
  // ── 1. random mixed plan ──
  console.log("\n[1] buildRandomMixedPlan");
  const quiz = require("../core/games/quiz.js");
  const plan = (cfg, avail) => quiz.buildSectionPlan(Object.assign({ questionCount: 20, sectionSize: 10, difficulty: "medium", imageQuestionCount: 0, audioQuestionCount: 0, randomMode: true }, cfg), avail || { characters: true, cosmology: true });
  let p = plan();
  t("random 20 uses the mixed plan", p.some((s) => s.domain === "logos") && p.some((s) => s.domain === "song"));
  const total = p.reduce((a, s) => a + s.perSection, 0);
  t(`plan totals 20 questions (got ${total})`, total === 20);
  const logosN = p.find((s) => s.domain === "logos").perSection;
  const songN = p.find((s) => s.domain === "song").perSection;
  t(`logo share sane 3..6 (got ${logosN})`, logosN >= 3 && logosN <= 6);
  t(`song share sane 3..5 (got ${songN})`, songN >= 3 && songN <= 5);
  const loreN = p.filter((s) => ["plot", "characters", "cosmology", "mixed", "production"].includes(s.domain)).reduce((a, s) => a + s.perSection, 0);
  t(`lore keeps >=40% (got ${loreN})`, loreN >= Math.ceil(20 * 0.4));
  t("first section is logos (fast start)", p[0].domain === "logos");
  t("picture round present when characters available", p.some((s) => s.domain === "images"));
  t("sections ordered logos -> lore -> song", p.findIndex((s) => s.domain === "song") > 0);
  // no characters -> no picture round, still totals 20
  p = plan({}, { characters: false, cosmology: true });
  t("no picture round without characters", !p.some((s) => s.domain === "images"));
  t("no-characters plan still totals 20", p.reduce((a, s) => a + s.perSection, 0) === 20);
  // -images flag respected exactly
  p = plan({ imageQuestionCount: 5 });
  t("-images 5 honored in mixed plan", p.find((s) => s.domain === "images")?.perSection === 5);
  t("flagged plan still totals 20", p.reduce((a, s) => a + s.perSection, 0) === 20);
  // small random quiz: unchanged single-section behaviour
  p = plan({ questionCount: 7 });
  t("random <9 questions stays simple (no logos section)", !p.some((s) => s.domain === "logos"));
  // franchise mode unaffected
  p = quiz.buildSectionPlan({ questionCount: 20, sectionSize: 10, difficulty: "medium", imageQuestionCount: 0, audioQuestionCount: 0, randomMode: false }, { characters: true });
  t("franchise mode plan has no media sections", !p.some((s) => s.domain === "logos" || s.domain === "song"));
  t("franchise mode plan totals 20", p.reduce((a, s) => a + s.perSection, 0) === 20);

  // ── 2. wikipediaImage relevance anchor ──
  console.log("\n[2] wikipediaImage relevance (LIVE network)");
  const quizLore = require("../core/games/quizLore.js");
  // the two documented production failures must NOT come back
  const dogman = await quizLore.wikipediaImage("Dogman Hunter x Hunter", 700, "files");
  t("Dogman no longer resolves to the KXM collage", !dogman || !/kxm/i.test(dogman.page || ""));
  if (dogman) console.log(`      -> files mode gave: ${dogman.page}`);
  const aldo = await quizLore.wikipediaImage("Aldo The Crystal Trap zelda", 700, "article");
  t("Aldo (Crystal Trap) no longer resolves to greyhound dog-show", !aldo || !/greyhound/i.test(aldo.page || ""));
  if (aldo) console.log(`      -> article mode gave: ${aldo.page}`);
  // sanity: a REAL subject still resolves
  const goku = await quizLore.wikipediaImage("Goku Dragon Ball", 700, "article");
  t("Goku still resolves via wikipedia article", !!goku && !!goku.url);
  if (goku) console.log(`      -> article mode gave: ${goku.page}`);

  // ── 3. antinude exemption semantics ──
  console.log("\n[3] antinude exemption checks");
  const antinude = require("../core/utils/antinude.js");
  const fakeSock = { sendMessage: async () => ({}) };
  const fakeSettings = { antinude: true, antinudeThreshold: 0.45, antinudeAction: "warn" };
  const baseCtx = (over) => Object.assign({
    chatId: "120363409013549791@g.us",
    senderJid: "999999@s.whatsapp.net",
    senderIsAdmin: false, isOwner: false,
    isGlobalMod: () => false, isGcOwner: () => false,
  }, over);
  const msgWithImage = { key: { fromMe: false, participant: "999999@s.whatsapp.net" }, message: { imageMessage: { mimetype: "image/jpeg", url: "x" } } };
  // with download failing fast (fake url), the KEY assertion: we reach the
  // download path (logged), never the exemption skip
  const origLog = console.log;
  const lines = [];
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({}));
  console.log = origLog;
  t("non-exempt sender is NOT skipped (reaches download)", !lines.some((l) => l.includes("sender exempt")));
  t("non-exempt path logged a download failure instead", lines.some((l) => /download failed|skipped|scanned/.test(l)));
  lines.length = 0;
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({ senderIsAdmin: true }));
  console.log = origLog;
  t("group ADMIN is NOT exempt (2026-09-28 directive)", !lines.some((l) => l.includes("sender exempt")));
  t("admin path reaches download/scan, not the skip", lines.some((l) => /download failed|skipped|scanned/.test(l)));
  lines.length = 0;
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({ isGlobalMod: () => true }));
  console.log = origLog;
  t("isGlobalMod FUNCTION returning true exempts (mods keep immunity)", lines.some((l) => l.includes("sender exempt")));
  lines.length = 0;
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({ isGcOwner: () => true }));
  console.log = origLog;
  t("isGcOwner FUNCTION returning true exempts (GC owner keeps immunity)", lines.some((l) => l.includes("sender exempt")));
  lines.length = 0;
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({ isOwner: true }));
  console.log = origLog;
  t("bot OWNER is exempt (skipped before download)", lines.some((l) => l.includes("sender exempt (mod/owner)")));
  lines.length = 0;
  console.log = (...a) => { lines.push(a.join(" ")); };
  await antinude.handleAntinude(fakeSock, msgWithImage, fakeSettings, () => 0, () => 0, baseCtx({ isGlobalMod: () => false, isGcOwner: () => false }));
  console.log = origLog;
  t("functions returning false no longer exempt everyone", !lines.some((l) => l.includes("sender exempt")));

  // ── 4. gif/webp videoMessage extraction ──
  console.log("\n[4] extractImageMedia gif-as-videoMessage");
  const gifMsg = { message: { videoMessage: { mimetype: "image/gif", url: "x" } } };
  const ext = antinude.extractImageMedia(gifMsg);
  t("gif videoMessage detected as asticker", ext && ext.type === "asticker" && ext.dlType === "video");
  const webpMsg = { message: { videoMessage: { mimetype: "image/webp", url: "x" } } };
  const ext2 = antinude.extractImageMedia(webpMsg);
  t("webp videoMessage detected as asticker", ext2 && ext2.type === "asticker");
  const mp4Msg = { message: { videoMessage: { mimetype: "video/mp4", url: "x" } } };
  const ext3 = antinude.extractImageMedia(mp4Msg);
  t("video/mp4 still a video", ext3 && ext3.type === "video");

  console.log(`\nRESULT: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("SUITE ERR", e); process.exit(1); });
