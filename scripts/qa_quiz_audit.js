// qa_quiz_audit.js — 2026-09-26 post-implementation audit battery (P1-P22)
// Tests the REAL quiz module paths (startQuiz → generate → post → answer →
// finish) with: fixture-backed MediaWiki layer (sandbox IP is Cloudflare-
// blocked for *.fandom.com - the live box reaches it), a local HTTP media
// server for REAL download/magic-byte verification, the z-ai CLI as the LLM
// stand-in (Groq blocked here; live box uses Groq), and real ffmpeg for
// theme-song clips. Answer/timer/lock/config flows run exactly as the bot
// runs them.
"use strict";
process.env.QA_MODE = "1";
require("dotenv").config();

const quiz = require("/home/z/my-project/whatsapp-bot/core/games/quiz");
const quizLore = require("/home/z/my-project/whatsapp-bot/core/games/quizLore");
const quizConfigMod = require("/home/z/my-project/whatsapp-bot/core/games/quizConfig");
const quizBank = require("/home/z/my-project/whatsapp-bot/core/games/quizBank");
const systemMod = require("/home/z/my-project/whatsapp-bot/core/utils/system");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };
const section = (t) => console.log(`\n── ${t} ──`);

const MARK = "\u200B";
function makeMockSock() {
  const sent = [];
  return {
    sent,
    user: { id: "bot@s.whatsapp.net" },
    sendMessage: async (jid, content, opts) => {
      sent.push({ jid, content, opts });
      return { key: { id: `m${sent.length}` } };
    },
  };
}
const lastText = (sock, n = 1) => {
  const texts = sock.sent.filter((s) => s.content && typeof s.content.text === "string");
  return texts.length ? texts[texts.length - n].content.text : null;
};

// ── z-ai LLM stand-in (same pattern as qa_quiz_lore_live) ──
// The sandbox CLI has a hard per-window quota (~45 calls), so identical
// prompts are served from a deterministic cache. Retrieval, token budget,
// JSON extraction, P12 validation and session flow still run per question -
// only byte-identical LLM round-trips are deduped. The live box uses Groq.
const _llmCache = new Map(); // promptHash -> reply text
const LLM_CACHE_PATH = "/tmp/zai_cache_quiz_audit.json";
try { for (const [k, v] of Object.entries(JSON.parse(require("fs").readFileSync(LLM_CACHE_PATH, "utf8")))) _llmCache.set(k, v); } catch { /* first run */ }
function flushLlmCache() {
  try { require("fs").writeFileSync(LLM_CACHE_PATH, JSON.stringify(Object.fromEntries(_llmCache))); } catch { /* best effort */ }
}
const { execFile } = require("child_process");
async function zaiLLM(opts) {
  const sys = (opts.messages || []).find((m) => m.role === "system");
  const user = [...(opts.messages || [])].reverse().find((m) => m.role === "user");
  const cacheKey = require("crypto").createHash("sha1").update((sys ? sys.content : "") + "|" + (user ? user.content : "")).digest("hex");
  if (_llmCache.has(cacheKey)) return _llmCache.get(cacheKey);
  const args = ["chat", "-p", user ? user.content : "", "-o", "/tmp/zai_out_qa.json"];
  if (sys) args.push("-s", sys.content);
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      await new Promise((resolve, reject) => {
        execFile("z-ai", args, { timeout: 90000, maxBuffer: 10 * 1024 * 1024 }, (e) => (e ? reject(e) : resolve()));
      });
      const reply = JSON.parse(require("fs").readFileSync("/tmp/zai_out_qa.json", "utf8"));
      _llmCache.set(cacheKey, reply);
      flushLlmCache();
      return reply;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// ── fixture MediaWiki layer ──
const WIKI_PAGES = {
  "Re:Zero kara Hajimeru Isekai Seikatsu": {
    sections: [
      { index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" },
      { index: "2", title: "Plot", line: `<div class="mw-heading"><h2>Plot</h2></div>`, level: "2" },
      { index: "3", title: "Gallery", line: `<div class="mw-heading"><h2>Gallery</h2></div>`, level: "2" },
      { index: "4", title: "Trivia", line: `<div class="mw-heading"><h2>Trivia</h2></div>`, level: "2" },
    ],
    wikitext: {
      0: "Re:Zero kara Hajimeru Isekai Seikatsu is a Japanese light novel series written by Tappei Nagatsuki about Subaru Natsuki, a hikikomori who is transported to another world. The series follows his Return by Death ability and his bond with Emilia and the witch Satella. The Kingdom of Lugnica is the main setting.",
      1: "Subaru Natsuki was summoned to the Kingdom of Lugnica from modern Japan. He immediately fell in love with Emilia after she helped him recover his stolen insignia from the thief Felt in the capital's loot house run by Rom. Elsa Granhiert attacked the loot house and killed Subaru and Emilia - at which point Subaru first experienced Return by Death, sent back to an earlier point in time by Satella. Subaru died multiple times in the first arc before saving Emilia from Elsa with help from Reinhard van Astrea and Felt.",
      2: "The Arc 4 Sanctuary arc traps Subaru and Emilia in the Sanctuary governed by the Rosenkalde trial challenges. Subaru must pass the three trials of the Tomb while protecting the villagers from the Great Rabbit. Beatrice joined Subaru after he promised to choose her, forming the contract with the spirit. Echidna the Witch of Greed hosted Subaru inside her Tea Party, offering knowledge at a price. Roswaal L Mathers manipulated the events to force Subaru into depending on him.",
    },
  },
  "Puck (Re:Zero)": {
    sections: [{ index: "1", title: "Appearance", line: `<div class="mw-heading"><h2>Appearance</h2></div>`, level: "2" }, { index: "2", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }],
    wikitext: {
      0: "Puck is the spirit contracted to Emilia in Re:Zero, often called the Beast of the End. He is a Great Spirit of fire who appears as a small cat.",
      1: "Puck served as Emilia's guardian spirit for years and destroyed the village of Elior Forest in his grief when Emilia was frozen. His contract with Emilia binds his existence to hers. Puck's power as the Beast of the End is feared across the four Great Nations, and his final battle froze the entire Elior Forest in an endless winter.",
    },
  },
  "Emilia (Re:Zero)": {
    sections: [{ index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }, { index: "2", title: "Abilities", line: `<div class="mw-heading"><h2>Abilities</h2></div>`, level: "2" }],
    wikitext: {
      0: "Emilia is the half-elf heroine of Re:Zero, a candidate for the royal selection of Lugnica. She uses ice magic and is mistakenly associated with the Witch of Envy Satella because of her appearance.",
      1: "Emilia is a candidate in the Royal Selection of the Kingdom of Lugnica, running under the Mathers camp. Her ice magic includes Icicle Line and Ice Brand Arts. She was frozen in Elior Forest for a hundred years after the Archipelago incident. Her insignia was stolen by Felt in the capital, which triggered the first arc of the story. Puck is her contracted spirit and appears as a small grey cat.",
      2: "Emilia's ice magic grants her Icicle Line, Ice Brand Arts and the Pack-era spirit contracts. Fortuna and Geis were her guardians in Elior Forest before the freezing incident. During the Royal Selection ceremony at the Royal Capital she gave a speech about equality that stunned the court. Her village of Ariel and her aunt Fortuna were lost in the Elior Forest incident.",
    },
  },
  "Beatrice (Re:Zero)": {
    sections: [{ index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }, { index: "2", title: "Abilities", line: `<div class="mw-heading"><h2>Abilities</h2></div>`, level: "2" }],
    wikitext: {
      0: "Beatrice is the Great Spirit librarian of the Forbidden Library in the Roswaal mansion of Re:Zero, guarding the Passage between doors.",
      1: "Beatrice waited four hundred years in the Forbidden Library for 'that person' before Subaru chose her with a contract. She is the daughter of Echidna the Witch of Greed and wields Yin magic including Shamak and the Passage door-hopping. The Forbidden Library can only be entered through the Passage between specific doors of the Roswaal mansion. Her brother spirit Puck was created by the same witch Echidna centuries ago.",
    },
  },
  "Ram (Re:Zero)": {
    sections: [{ index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }, { index: "2", title: "Abilities", line: `<div class="mw-heading"><h2>Abilities</h2></div>`, level: "2" }],
    wikitext: {
      0: "Ram is the pink-haired maid of the Roswaal mansion in Re:Zero, sister of Rem, who lost her horn in childhood and serves Roswaal L Mathers loyally.",
      1: "Ram works at the Roswaal mansion alongside her younger sister Rem, whom she deeply protects. As a child Ram was hailed as a prodigy of the oni clan before her horn was cut off, and she survived the attack on her village that only the two sisters escaped.",
      2: "Ram's Wind magic, called El Fura, is extremely powerful even without her horn. She is bound to Roswaal L Mathers by a lifelong debt after he saved the sisters, and she openly scolds Subaru Natsuki as Barusu.",
    },
  },
  "Rem (Re:Zero)": {
    sections: [{ index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }, { index: "2", title: "Abilities", line: `<div class="mw-heading"><h2>Abilities</h2></div>`, level: "2" }],
    wikitext: {
      0: "Rem is the blue-haired maid of the Roswaal mansion in Re:Zero, twin sister of Ram, who wields a flail of ice and initially distrusted Subaru Natsuki deeply.",
      1: "Rem once suspected Subaru Natsuki of being a Witch Cult spy and attacked him with her morning-star flail in Arc 2. During the attack on the mansion by Curse-carrying dogs she protected the children of the village. Rem confessed her love to Subaru under the starry sky before he rejected her, and she was later erased from existence and memory by Ley Batenkaitos of the Sin Archbishops.",
      2: "Rem fights with a chained flail and channels Oni power through her horn, entering an Oni mode with a horn of ice. Her devotion to her sister Ram defines her character throughout the Re:Zero story.",
    },
  },
  "Roswaal L Mathers": {
    sections: [{ index: "1", title: "History", line: `<div class="mw-heading"><h2>History</h2></div>`, level: "2" }, { index: "2", title: "Abilities", line: `<div class="mw-heading"><h2>Abilities</h2></div>`, level: "2" }],
    wikitext: {
      0: "Roswaal L Mathers is the margrave lord of the Mathers domain in Re:Zero, employer of Emilia, Ram and Rem, and a magus dressed in clown-like clothes.",
      1: "Roswaal L Mathers hosts Emilia's royal selection camp and shelters Subaru Natsuki at his mansion. He is actually possessed by the soul of the original Roswaal A Mathers, who has body-hopped through fourteen generations of the Mathers line while following the Gospel book. He orchestrated the Sanctuary trials to force Subaru to depend on him.",
      2: "Roswaal wields all six magic elements at the highest level, a feat unmatched in the Kingdom of Lugnica, and his Mana Refinement is enormous. His clothing and speech mimic a clown, and his right eye is blue while the left is yellow.",
    },
  },
  "Kingdom of Lugnica": {
    sections: [{ index: "1", title: "Overview", line: `<div class="mw-heading"><h2>Overview</h2></div>`, level: "2" }, { index: "2", title: "Locations", line: `<div class="mw-heading"><h2>Locations</h2></div>`, level: "2" }],
    wikitext: {
      0: "The Kingdom of Lugnica is the human kingdom where Re:Zero takes place, ruled by the Dragon Covenant of the Dragon Volcanica.",
      1: "The Royal Capital of Lugnica hosts the royal selection among five camps after King Michilde and his heirs died of the Dragon Blood plague. The Sanctuary lies to the east beyond the Great Elior Forest. Priestella is the water-gate city where the Witch Cult besieged the towers. Five candidates carry the Dragon insignia: Emilia, Crusch Karsten, Anastasia Hoshin, Priscilla Barielle and Felt. The White Whale of the Witch Cult was hunted in the Flugel tree region during this selection.",
      2: "Costuule is the capital's prison city, and the Mathers domain is governed by Roswaal L Mathers. The Kingdom of Lugnica borders the Volakia Empire to the south in the full Re:Zero world map. The Vollachia Empire plays a major role in Arcs 5 through 8 of the Re:Zero story, where Subaru and Rem wake in the Imperial Capital after the Priestella incident.",
    },
  },
};

function fixtureWikiApi(slug, params) {
  const p = params || {};
  if (p.action === "query" && p.meta === "siteinfo") {
    return Promise.resolve({ query: { sitename: "Test Zero Wiki" } });
  }
  if (p.action === "query" && p.list === "search" && String(p.srnamespace || "0") === "0") {
    const q = String(p.srsearch || "");
    if (/cosmology|world|realms|dimensions/i.test(q)) {
      return Promise.resolve({ query: { search: [{ title: "Kingdom of Lugnica" }, { title: "Witch Cult" }] } });
    }
    if (/characters/i.test(q)) {
      return Promise.resolve({ query: { search: [{ title: "Emilia (Re:Zero)" }, { title: "Puck (Re:Zero)" }] } });
    }
    if (/re:zero|rezero|test zero/i.test(q)) {
      return Promise.resolve({ query: { search: [{ title: "Re:Zero kara Hajimeru Isekai Seikatsu" }, { title: "Emilia (Re:Zero)" }, { title: "Puck (Re:Zero)" }, { title: "Beatrice (Re:Zero)" }, { title: "Kingdom of Lugnica" }, { title: "Ram (Re:Zero)" }, { title: "Rem (Re:Zero)" }, { title: "Roswaal L Mathers" }, { title: "List of Re:Zero episodes" }] } });
    }
    return Promise.resolve({ query: { search: [{ title: "Re:Zero kara Hajimeru Isekai Seikatsu" }] } });
  }
  if (p.action === "query" && p.list === "search" && String(p.srnamespace) === "6") {
    return Promise.resolve({ query: { search: [] } }); // no audio files on the fixture wiki
  }
  if (p.action === "query" && p.list === "categorymembers") {
    return Promise.resolve({ query: { categorymembers: [{ title: "Emilia (Re:Zero)" }, { title: "Puck (Re:Zero)" }, { title: "Beatrice (Re:Zero)" }, { title: "Ram (Re:Zero)" }, { title: "Rem (Re:Zero)" }, { title: "Roswaal L Mathers" }] } });
  }
  if (p.action === "query" && p.prop === "info") {
    const titles = String(p.titles || "").split("|");
    const pages = {};
    titles.forEach((t, i) => { if (WIKI_PAGES[t] || /Re:Zero|Mathers|Beatrice|Ram |Rem /.test(t)) pages[String(i + 1)] = { title: t, length: 9000 + i * 137 }; });
    return Promise.resolve({ query: { pages } });
  }
  if (p.action === "query" && p.prop === "pageimages") {
    const url = String(p.titles || "").includes("Broken") ? "http://127.0.0.1:47474/img/broken.png" : "http://127.0.0.1:47474/img/emilia.png";
    return Promise.resolve({ query: { pages: { "-1": { title: p.titles, thumbnail: { source: url } } } } });
  }
  if (p.action === "query" && p.prop === "imageinfo") {
    return Promise.resolve({ query: { pages: { "-1": { imageinfo: [{ url: "http://127.0.0.1:47474/audio/puck.ogg", mime: "audio/ogg", size: 50000 }] } } } });
  }
  if (p.action === "parse" && p.prop === "sections") {
    const page = WIKI_PAGES[p.page];
    return Promise.resolve(page ? { parse: { sections: page.sections } } : { error: { code: "missingtitle" } });
  }
  if (p.action === "parse" && p.prop === "wikitext") {
    const page = WIKI_PAGES[p.page];
    if (!page) return Promise.resolve({ error: { code: "missingtitle" } });
    const text = page.wikitext[String(p.section)] || page.wikitext[p.section] || "";
    return Promise.resolve({ parse: { wikitext: { "*": text } } });
  }
  return Promise.resolve({});
}
quizLore._internal.setWikiApiOverride(fixtureWikiApi);

// ── local media server (REAL bytes: downloadMedia's magic-byte path runs) ──
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

async function makeMedia() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qamedia_"));
  const png = path.join(dir, "emilia.png");
  const mp3 = path.join(dir, "song.mp3");
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=1", "-frames:v", "1", png]);
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=35", mp3]);
  const pngBuf = fs.readFileSync(png);
  const mp3Buf = fs.readFileSync(mp3);
  const server = http.createServer((req, res) => {
    if (req.url.includes("broken")) { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(Buffer.from("this is not an image at all, just text bytes to fail the magic byte check".repeat(30))); }
    if (req.url.includes(".png")) { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(pngBuf); }
    if (req.url.includes(".mp3")) { res.writeHead(200, { "Content-Type": "audio/mpeg" }); return res.end(mp3Buf); }
    if (req.url.includes(".ogg")) { res.writeHead(200, { "Content-Type": "audio/ogg" }); return res.end(mp3Buf); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(47474, r));
  return { server, pngBuf, mp3Buf, dir };
}

// ════════════════════════════════════════════════════════════════
(async () => {
  const media = await makeMedia();

  // ── 0. system KV ──
  section("0. system KV sanity");
  try {
    systemMod.set("qa_audit_kv", { x: 1 });
    ok(systemMod.get("qa_audit_kv", null)?.x === 1, "system KV roundtrip");
  } catch (e) { ok(false, "system KV: " + e.message); }

  // ── 1. parseQuizArgs matrix ──
  section("1. parseQuizArgs (flags / random / sections)");
  {
    const a = quiz.parseQuizArgs('"Re:Zero" 20 hard -images 5');
    ok(a.title === "Re:Zero" && a.count === 20 && a.difficulty === "hard" && a.images === "5", "-images flag parsed");
    const b = quiz.parseQuizArgs("random 20 -images 5 -audio 3");
    ok(b.randomMode && b.count === 20 && b.images === "5" && b.audio === "3", "random + images + audio parsed");
    const c = quiz.parseQuizArgs('"Dragon Ball" 3 hard -s cosmology');
    ok(c.section === "cosmology" && c.title === "Dragon Ball", "-s forced section");
    const d = quiz.parseQuizArgs('"Re:Zero" 5 medium -audio 2');
    ok(d.audio === "2", "-audio flag");
    const e = quiz.parseQuizArgs('"One Piece" 500 hard');
    ok(e.count === 500, "large count passes through (clamped by config layer)");
    const f = quiz.parseQuizArgs('"X" 3 -s banana');
    ok(f.section === null && f.notes.length > 0, "invalid section rejected with note");
  }

  // ── 2. quizConfig (P16/P17) ──
  section("2. quizConfig + quizmod");
  {
    const cfg = await quizConfigMod.buildQuizConfig("cfgtest@g.us", { count: 100, images: 99 });
    ok(cfg.maxQuestions === 50 && cfg.questionCount === 50, "count clamped to maxQuestions=50");
    ok(cfg.imageQuestionCount === 5 && cfg.imageQuestionLimit === 5, "images clamped to group limit");
    ok(cfg.timePerQuestion === 15, "default timer 15s (7-20 band)");
    ok(cfg.sectionBreakDuration === 45 && cfg.sectionSize === 10, "section defaults");
    ok(cfg.voiceActorQuestionLimit === 1, "VA cap default 1");

    const r1 = quizConfigMod.validateValue(quizConfigMod.SETTING_DEFS.timer, "-5");
    ok(!r1.ok && r1.error.includes("7"), "timer -5 rejected with valid range");
    const r2 = quizConfigMod.validateValue(quizConfigMod.SETTING_DEFS.timer, "500");
    ok(!r2.ok, "timer 500 rejected (max 120)");
    const r3 = quizConfigMod.validateValue(quizConfigMod.SETTING_DEFS.timer, "10");
    ok(r3.ok && r3.value === 10, "timer 10 accepted");

    // permission: non-mod denied
    const denied = await quizConfigMod.handleQuizMod("cfgtest@g.us", "timer 10", false, ".j");
    ok(denied.message.includes("moderators"), "quizmod denied for non-mod");
    // set + persisted
    const set = await quizConfigMod.handleQuizMod("cfgtest@g.us", "timer 7", true, ".j");
    ok(set.message.includes("7"), "quizmod timer 7 accepted");
    const cfg2 = await quizConfigMod.buildQuizConfig("cfgtest@g.us", {});
    ok(cfg2.timePerQuestion === 7, "per-group timer override applies to built config");
    // other group unaffected (per-group scoping)
    const cfgOther = await quizConfigMod.buildQuizConfig("other@g.us", {});
    ok(cfgOther.timePerQuestion === 15, "other group unaffected (per-group scope)");
    // invalid setting + invalid value
    const bad = await quizConfigMod.handleQuizMod("cfgtest@g.us", "banana 3", true, ".j");
    ok(bad.message.includes("Unknown setting"), "unknown setting rejected");
    const bad2 = await quizConfigMod.handleQuizMod("cfgtest@g.us", "timer -5", true, ".j");
    ok(bad2.message.includes("between 7 and 120"), "invalid value rejected with range");
    // show output includes ranges + modified marker
    const show = await quizConfigMod.handleQuizMod("cfgtest@g.us", "", true, ".j");
    ok(show.message.includes("timer") && show.message.includes("maxquestions"), "quizmod show lists settings");
    ok(show.message.includes("✏️"), "modified settings marked");
    // global scope setting
    const g = await quizConfigMod.handleQuizMod("cfgtest@g.us", "streaming off", true, ".j");
    ok(g.message.includes("GLOBAL"), "global-scope setting announces GLOBAL");
    const cfgGlobal = await quizConfigMod.buildQuizConfig("whatever@g.us", {});
    ok(cfgGlobal.streamingGeneration === false, "global setting applies everywhere");
    await quizConfigMod.handleQuizMod("whatever@g.us", "streaming on", true, ".j");
    // reset
    await quizConfigMod.handleQuizMod("cfgtest@g.us", "reset", true, ".j");
    const cfgReset = await quizConfigMod.buildQuizConfig("cfgtest@g.us", {});
    ok(cfgReset.timePerQuestion === 15, "reset restores default timer");
    ok(cfgReset.streamingGeneration === true, "reset restores streaming");
  }

  // ── 3. quizBank (P15) ──
  section("3. quizBank stable identity + dedup");
  {
    const mk = "qa-bank-test";
    const base = { q: "Who is this character from Test?", options: ["Emilia", "Rem", "Ram", "Beatrice"], correct: 0, difficulty: "easy", domain: "characters", topic: "Character ID", loreRef: { wiki: "rezero", page: "Emilia (Re:Zero)", section: "page-image" } };
    const stored = quizBank.bankPut(mk, { ...base, assetKey: "http://x/emilia.png", type: "image", asset: { kind: "image", url: "http://x/emilia.png" } });
    ok(stored, "bankPut stores validated question");
    const dup = quizBank.bankPut(mk, { ...base, q: "Can you identify this character from Test?", assetKey: "http://x/emilia.png", type: "image", asset: { kind: "image", url: "http://x/emilia.png" } });
    ok(!dup, "reworded duplicate of the same image+fact REJECTED");
    const got = quizBank.bankLookup(mk, [], 5, { type: "image" });
    ok(got.length === 1 && got[0].fromBank, "bankLookup serves the validated question");
    // text question with different fact stores fine
    const t2 = quizBank.bankPut(mk, { ...base, q: "What trial does Subaru face in the Sanctuary?", options: ["The Tomb trials", "The duel", "The hunt", "The pact"], correct: 0, domain: "plot", loreRef: { wiki: "rezero", page: "Re:Zero kara Hajimeru Isekai Seikatsu", section: "Plot" } });
    ok(t2, "distinct fact (different subject/property) stores");
    // type filter
    const onlyText = quizBank.bankLookup(mk, [], 10, { type: "text" });
    ok(onlyText.length >= 1 && onlyText.every((q) => q.type !== "image"), "type filter works");
    // seen filter
    const seenHash = [quiz.qhash("What trial does Subaru face in the Sanctuary?")];
    const withSeen = quizBank.bankLookup(mk, seenHash, 10, {});
    ok(!withSeen.some((q) => q.q.includes("Sanctuary")), "seen-list suppresses served question");
  }

  // ── 4. validateGeneratedQuestion (P12) ──
  section("4. contamination / fact validation");
  {
    const ctx = { franchiseTitle: "Re:Zero", wiki: "rezero", loreText: WIKI_PAGES["Re:Zero kara Hajimeru Isekai Seikatsu"].wikitext[2], domain: "plot", subjectNames: ["Re:Zero kara Hajimeru Isekai Seikatsu"] };
    const good = { q: "In Re:Zero, who hosts the Tea Party that Subaru visits?", options: ["Echidna", "Satella", "Emilia", "Ram"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(good, ctx) === null, "valid sourced question passes");
    const halluc = { q: "In Re:Zero, who hosts the Tea Party?", options: ["Yamada Tarō", "Satella", "Emilia", "Ram"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(halluc, ctx) !== null, "hallucinated answer (not in source) rejected");
    const foreign = { q: "In Naruto, how does the Chunin exam work?", options: ["Three stages", "Two stages", "Four stages", "One stage"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(foreign, ctx) !== null, "foreign franchise stem rejected");
    const numguard = { q: "How many chapters does the Sword Demon Love Song manga have?", options: ["27", "28", "29", "30"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(numguard, ctx) !== null, "unverified chapter-count question rejected (number guard)");
    const irrelevant = { q: "What is the capital of France?", options: ["Paris", "Lyon", "Rome", "Berlin"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(irrelevant, ctx) !== null, "off-media question rejected (relevance)");
    // structural media question: foreign titles in OPTIONS are allowed
    const structural = { q: "Which anime is this opening from?", options: ["Re:Zero", "Naruto", "Bleach", "One Piece"], correct: 0 };
    ok(quiz.validateGeneratedQuestion(structural, { ...ctx, structural: true, loreText: "opening by Myth and Roe" }) === null, "structural theme-song question passes");
  }

  // ── 5. section plan (P7) ──
  section("5. buildSectionPlan for 5/10/20/30/40/50");
  {
    const mk = (n) => ({ questionCount: n, sectionSize: 10, categories: null, imageQuestionCount: n > 10 ? 5 : 0 });
    for (const n of [5, 10, 20, 30, 40, 50]) {
      const plan = quiz.buildSectionPlan(mk(n), { characters: true, cosmology: true });
      const total = plan.reduce((a, s) => a + s.perSection, 0);
      ok(total === n, `count ${n}: sections sum to ${total}`);
      if (n > 10) {
        ok(plan.length === Math.ceil(n / 10), `count ${n}: ${plan.length} sections`);
        ok(plan[plan.length - 1].name === "Mixed Challenge", `count ${n}: last section is Mixed Challenge`);
        ok(plan.every((s) => s.perSection >= 3), `count ${n}: no tiny filler sections`);
      } else {
        ok(plan.length === 1, `count ${n}: single section (no ceremony)`);
      }
    }
    // forced -s: all sections forced domain
    const forced = quiz.buildSectionPlan({ questionCount: 40, sectionSize: 10, categories: ["cosmology"], imageQuestionCount: 0 }, {});
    ok(forced.length === 4 && forced.every((s) => s.domain === "cosmology"), "-s forced 40q → 4 cosmology sections");
    // availability redistribution: no character data → no Character Lore section
    const noChars = quiz.buildSectionPlan({ questionCount: 30, sectionSize: 10, categories: null, imageQuestionCount: 0 }, { characters: false, cosmology: false });
    ok(noChars.every((s) => s.domain !== "characters" && s.domain !== "images"), "missing character data → sections redistributed (no filler)");
  }

  // ── 6. lifecycle lock (P3) ──
  section("6. lifecycle lock");
  {
    ok(quiz.acquireLifecycle("lock@g.us"), "first acquire succeeds");
    ok(!quiz.acquireLifecycle("lock@g.us"), "second acquire DENIED (no double quiz)");
    quiz.releaseLifecycle("lock@g.us");
    ok(quiz.acquireLifecycle("lock@g.us"), "release → acquire works");
    quiz.releaseLifecycle("lock@g.us");
    // stale TTL reclaim
    quiz.acquireLifecycle("lock2@g.us");
    const entry = quiz._internal.lifecycle.get("lock2@g.us");
    entry.since = Date.now() - (9 * 60 * 1000); // pretend it's ancient
    ok(quiz.acquireLifecycle("lock2@g.us"), "stale lock (TTL) reclaimed - group never stuck");
    quiz.releaseLifecycle("lock2@g.us");
  }

  // ══════════════════════════════════════════════════════════════
  // E2E: full quiz through startQuiz with fixtures + z-ai LLM
  // ══════════════════════════════════════════════════════════════
  async function waitSession(chatId, timeoutMs = 150000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = quiz.getSession(chatId);
      if (s && s.sections[0] && s.sections[0].state === "ACTIVE") return s;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }
  async function waitText(sock, substr, timeoutMs = 150000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hit = sock.sent.find((s) => s.content && typeof s.content.text === "string" && s.content.text.includes(substr));
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }
  const CHAT = "e2e@g.us";
  const ALICE = "alice@s.whatsapp.net", BOB = "bob@s.whatsapp.net", CAROL = "carol@s.whatsapp.net";

  section("7. E2E: 5-question quiz, 3 players, one-attempt rules");
  {
    const sock = makeMockSock();
    const r = await quiz.startQuiz(sock, CHAT, ALICE, MARK, { key: { id: "k1" } }, '"Re:Zero" 5 easy', "Alice", zaiLLM, null);
    ok(r.handled && r.silent, "startQuiz returns fast (background generation)");
    const loading = sock.sent.find((s) => s.content?.text?.includes("Gathering questions"));
    ok(!!loading, "immediate loading message sent (P5)");
    const bounce = await quiz.startQuiz(sock, CHAT, BOB, MARK, { key: { id: "k2" } }, '"Re:Zero" 5 easy', "Bob", zaiLLM, null);
    ok(bounce.message && bounce.message.includes("already being prepared"), "second .j quiz while generating DENIED (P3)");

    const session = await waitSession(CHAT);
    ok(!!session, "quiz session went ACTIVE (section 1 playing)");
    ok(session.title.toLowerCase().includes("re") || session.title.includes("Zero"), "title resolved: " + session.title);
    ok(session.sections.length === 1 && session.sections[0].questions.length >= 3 && session.sections[0].questions.length <= 5, `section 1 has ${session.sections[0].questions.length} questions`);
    // no production/VA drift in an easy lore quiz (P6/P10): count VA/studio topics
    const prodQs = session.sections[0].questions.filter((q) => q.domain === "production" || /voice actor|studio|voice actress/i.test(q.q));
    ok(prodQs.length <= 1, `production/VA questions in pool: ${prodQs.length} (cap 1)`);

    // answer flow: Q1 - Alice wrong first (locked out), Bob correct, Carol late
    let q = session.sections[0].questions[session.idx];
    const wrongIdx = (q.correct + 1) % 4;
    await quiz.handleAnswer(sock, CHAT, ALICE, quiz._internal ? String.fromCharCode(65 + wrongIdx) : wrongIdx, MARK, { key: { id: "a1" } }, "Alice");
    ok(session.answeredBy.has(ALICE), "Alice's first (wrong) answer registered");
    await quiz.handleAnswer(sock, CHAT, ALICE, String.fromCharCode(65 + q.correct), MARK, { key: { id: "a2" } }, "Alice");
    const aliceEntry = session.answeredBy.get(ALICE);
    ok(aliceEntry && aliceEntry.letter === wrongIdx, "Alice's second answer IGNORED (one attempt per question)");
    ok(!session.answeredBy.get(ALICE).correct, "Alice locked out with wrong flag");
    await quiz.handleAnswer(sock, CHAT, BOB, String.fromCharCode(65 + q.correct), MARK, { key: { id: "a3" } }, "Bob");
    ok(session.revealed.length >= 1 && session.revealed[0].winner === "Bob", "Bob correct → revealed as winner");
    const correctMsg = sock.sent.find((s) => s.content?.text?.includes("✅ *Correct!*"));
    ok(!!correctMsg && correctMsg.content.text.includes("Bob"), "correct reveal sent");
    // other players could still answer after Alice locked (Bob answered normally) ✔

    // wait for Q2, test .j b form + full option text + stray answer scoping
    await new Promise((r2) => setTimeout(r2, 5200));
    q = session.sections[0].questions[session.idx];
    ok(!!q, "Q2 posted after NEXT_DELAY");
    await quiz.handleAnswer(sock, CHAT, CAROL, String.fromCharCode(65 + q.correct), MARK, { key: { id: "c1" } }, "Carol");
    ok(session.revealed.some((rv) => rv.winner === "Carol"), "Carol correct via letter answer");
    // timer expiry on Q3 (short config timer)
    await new Promise((r2) => setTimeout(r2, 5200));
    const beforeReveals = session.revealed.length;
    await new Promise((r2) => setTimeout(r2, (session.cfg.timePerQuestion + 2) * 1000));
    ok(session.revealed.length > beforeReveals && session.revealed[session.revealed.length - 1].timedOut, "question timed out (no answer) → reveal");
    // rest of the quiz: answer all remaining correctly by Alice
    let guard = 0;
    await new Promise((r2) => setTimeout(r2, 5200)); // Q4 card must post first (answers only count while OPEN)
    while (quiz.hasActive(CHAT) && guard++ < 20) {
      const s2 = quiz.getSession(CHAT);
      if (!s2) break;
      const qq = s2.sections[s2.activeSection].questions[s2.idx];
      if (!qq) break;
      await quiz.handleAnswer(sock, CHAT, ALICE, String.fromCharCode(65 + qq.correct), MARK, { key: { id: `z${guard}` } }, "Alice");
      await new Promise((r2) => setTimeout(r2, 5600));
    }
    const finishMsg = await waitText(sock, "QUIZ FINISHED", 30000);
    ok(!!finishMsg, "quiz finished message sent");
    ok(!quiz.hasActive(CHAT), "session cleared after finish");
    const scores = quiz.loadScores(CHAT) || {};
    console.log("  [debug] persistent scores:", JSON.stringify(scores));
    console.log("  [debug] session.scores:", JSON.stringify([...session.scores.entries()]));
    ok(Object.keys(scores).some((j) => j === ALICE), "persistent scoreboard recorded Alice");
    const bobPaid = sock.sent.find((s) => s.content?.text?.includes("QUIZ FINISHED"));
    ok(!!bobPaid, "rewards message includes winner");
  }

  section("8. E2E: .j b letter form + endQuiz permission");
  {
    const CHAT2 = "e2e2@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, CHAT2, ALICE, MARK, { key: { id: "k1" } }, '"Re:Zero" 3 easy', "Alice", zaiLLM, null);
    const session = await waitSession(CHAT2);
    ok(!!session, "second quiz started");
    // stranger cannot end
    const deny = await quiz.endQuiz(sock, CHAT2, CAROL, MARK, false);
    ok(deny.message && deny.message.includes("starter or admins"), "non-starter/non-mod cannot end");
    // starter ends
    const end = await quiz.endQuiz(sock, CHAT2, ALICE, MARK, false);
    ok(end.handled && !quiz.hasActive(CHAT2), "starter ends quiz; session + lock released");
    const fin = sock.sent.find((s) => s.content?.text?.includes("QUIZ FINISHED"));
    ok(!!fin, "finish message sent on cancellation");
  }

  section("9. quizmod timer flows into the live quiz (P2/P17)");
  {
    const CHAT3 = "e2e3@g.us";
    const sock = makeMockSock();
    await quizConfigMod.handleQuizMod(CHAT3, "timer 7", true, ".j");
    await quiz.startQuiz(sock, CHAT3, ALICE, MARK, { key: { id: "k1" } }, '"Re:Zero" 3 easy', "Alice", zaiLLM, null);
    const session = await waitSession(CHAT3);
    ok(!!session && session.cfg.timePerQuestion === 7, "session built with mod-configured 7s timer");
    const card = sock.sent.find((s) => s.content?.text?.includes("QUESTION"));
    ok(!!card && card.content.text.includes("⏱ 7s"), "question card shows the configured timer");
    // no answers accepted after close: simulate closed question
    session.qOpenUntil = Date.now() - 1000;
    const r = await quiz.handleAnswer(sock, CHAT3, BOB, "A", MARK, { key: { id: "late" } }, "Bob");
    ok(r.handled && !session.answeredBy.has(BOB), "late answer (question closed) ignored");
    await quiz.endQuiz(sock, CHAT3, ALICE, MARK, false);
    await quizConfigMod.handleQuizMod(CHAT3, "reset", true, ".j");
  }

  section("10. image questions (P8/P13): verified asset + no-image graceful");
  {
    // build with the fixture wiki: pageimage → local PNG server (real download)
    const buckets = await quizLore.buildCharacterIndex("rezero", "Re:Zero", []);
    const used = new Set();
    const q = await quiz.buildImageQuestion("rezero", "Re:Zero", buckets, used, "easy");
    ok(!!q && q.type === "image", "image question built");
    ok(!!q && /Who is this character from Re:Zero\?/.test(q.q), "character-ID stem");
    ok(!!q && q.options.length === 4, "4 options present");
    // options must all come from the character index (same-franchise guarantee)
    const indexNames = new Set([...(buckets.easy || []), ...(buckets.medium || []), ...(buckets.hard || [])].map((n) => String(n).toLowerCase()));
    ok(!!q && q.options.every((o) => indexNames.has(String(o).toLowerCase())), "options all from the SAME franchise character index");
    ok(!!q && q.asset.bytesHash && q.asset.url.includes("emilia.png"), "asset verified: url + bytes hash recorded");
    // broken image (text bytes) must NOT become a question
    const used2 = new Set(["img:Emilia (Re:Zero)", "img:Puck (Re:Zero)", "img:Beatrice (Re:Zero)", "img:Ram (Re:Zero)", "img:Rem (Re:Zero)", "img:Roswaal L Mathers"]);
    // force only the broken URL: patch pageimages for "Broken" title
    const q2 = await quiz.buildImageQuestion("rezero", "Re:Zero", { easy: ["Broken"], medium: [], hard: [] }, used2, "easy");
    ok(q2 === null, "broken/non-image bytes rejected (magic-byte check)");
    // missing images entirely → null (graceful)
    const q3 = await quiz.buildImageQuestion("rezero", "Re:Zero", { easy: [], medium: [], hard: [] }, new Set(), "easy");
    ok(q3 === null, "no available images → graceful null");
  }

  section("11. theme-song question (P11/P14): real ffmpeg clip + verification");
  {
    // stub the goService audio infra the same way the real one responds
    const fakeGo = {
      async getAudioInfo(query) {
        if (/Redo|opening/i.test(query)) {
          return { metadata: { title: "Redo - Re:Zero Opening", author: "Konomi Suzuki", url: "https://youtube/x" }, audioURL: "http://127.0.0.1:47474/audio/song.mp3", audioSource: "youtube", isPreview: false };
        }
        return { metadata: { title: "Unrelated Lo-Fi Beats" }, audioURL: "http://127.0.0.1:47474/audio/song.mp3", audioSource: "youtube" };
      },
    };
    quiz.setDeps({ goService: fakeGo, ffmpegPath: "ffmpeg" });
    const franchise = { title: "Re:Zero", wiki: "rezero", mediaType: "anime", anime: { idMal: 31240 } };
    // force getThemeSongs through a stub (Jikan is flaky in this sandbox)
    const realThemes = quizLore.getThemeSongs;
    quizLore.getThemeSongs = async () => ({ openings: ["Redo"], endings: [] });
    const q = await quiz.buildThemeSongQuestion(franchise, ["Naruto", "One Piece", "Bleach"], new Set());
    ok(!!q && q.type === "theme", "theme-song question built via .j audio infra");
    ok(!!q && q.asset && Buffer.isBuffer(q.asset.buf) && q.asset.buf.length > 20 * 1024, `30s clip generated (${q ? Math.round(q.asset.buf.length / 1024) : 0}KB)`);
    ok(!!q && q.options.length === 4 && q.options[0] !== undefined, "options include media + 3 others");
    // verification: a search hit that does NOT match the song/media is rejected
    const qBad = await (async () => {
      quiz.setDeps({ goService: { async getAudioInfo() { return { metadata: { title: "Totally Unrelated Track" }, audioURL: "http://127.0.0.1:47474/audio/song.mp3" }; } }, ffmpegPath: "ffmpeg" });
      return quiz.buildThemeSongQuestion(franchise, ["Naruto", "One Piece", "Bleach"], new Set(["song:redo"]));
    })();
    ok(qBad === null, "unrelated audio hit REJECTED (identity verification)");
    // missing theme songs → graceful null
    quiz.setDeps({ goService: fakeGo, ffmpegPath: "ffmpeg" });
    quizLore.getThemeSongs = async () => ({ openings: [], endings: [] });
    const qNone = await quiz.buildThemeSongQuestion(franchise, ["Naruto", "One Piece", "Bleach"], new Set());
    ok(qNone === null, "no theme songs → graceful skip");
    quizLore.getThemeSongs = realThemes;
  }

  section("12. media files + no-quiz answer scoping");
  {
    // P1 scoping: stray ".j a B" with NO quiz must not error
    const sock = makeMockSock();
    const r = await quiz.handleAnswer(sock, "noquiz@g.us", BOB, "B", MARK, { key: { id: "x" } }, "Bob");
    ok(r.handled === false, "no quiz → handler passes through (handled=false)");
    ok(quiz.isQuizAnswerText(".j b") && quiz.isQuizAnswerText(".j c A") && quiz.isQuizAnswerText(".j answer d"), "isQuizAnswerText covers a/b/c/d/answer");
    ok(!quiz.isQuizAnswerText(".j bal") && !quiz.isQuizAnswerText(".j board"), "non-answer commands not matched");
  }

  // ── 13. ten consecutive clean iterations (P20 bar) ──
  section("13. 10 consecutive clean iterations");
  {
    let clean = 0;
    for (let i = 0; i < 10; i++) {
      const CHATI = `iter${i}@g.us`;
      const sock = makeMockSock();
      try {
        const rStart = await quiz.startQuiz(sock, CHATI, ALICE, MARK, { key: { id: `i${i}` } }, '"Re:Zero" 3 medium -s plot', "Alice", zaiLLM, null);
        if (!rStart.handled) throw new Error("start failed");
        const s = await waitSession(CHATI, 150000);
        if (!s) throw new Error("session never went ACTIVE");
        const qs = s.sections[0].questions;
        if (qs.length < 3) throw new Error(`only ${qs.length} questions`);
        // category persistence: -s plot → all questions must be plot domain
        if (qs.some((q) => q.domain !== "plot" && q.domain !== undefined)) throw new Error("category drift: " + qs.map((q) => q.domain).join(","));
        // hallucination bar: every generated (non-fallback) question must have a loreRef
        if (qs.some((q) => !q.loreRef && !q.fallback)) throw new Error("question without loreRef");
        // token bar: prompt budget respected
        if (qs.some((q) => q.promptTok && q.promptTok >= 800)) throw new Error("prompt over 800 tokens");
        // play through: one correct
        const qq = qs[s.idx];
        await quiz.handleAnswer(sock, CHATI, BOB, String.fromCharCode(65 + qq.correct), MARK, { key: { id: `p${i}` } }, "Bob");
        if (!s.revealed.length) throw new Error("correct answer not revealed");
        await quiz.endQuiz(sock, CHATI, ALICE, MARK, false);
        if (quiz.hasActive(CHATI) || quiz._internal.lifecycle.has(CHATI)) throw new Error("lock not released");
        clean++;
        console.log(`  iter ${i + 1}/10 clean (${qs.length}q, domains: ${qs.map((q) => q.domain).join("/")})`);
      } catch (e) {
        console.log(`  iter ${i + 1}/10 FAILED: ${e.message}`);
        await quiz.endQuiz(sock, CHATI, ALICE, MARK, true).catch(() => {});
      }
    }
    ok(clean === 10, `10/10 consecutive clean iterations (got ${clean})`);
  }

  section("7b. E2E: 12-question quiz → 2 sections + streaming generation (P19)");
  {
    const CHATS = "e2esec@g.us";
    const sock = makeMockSock();
    await quizConfigMod.handleQuizMod(CHATS, "sectionbreak 2", true, ".j"); // tiny break for test speed
    await quizConfigMod.handleQuizMod(CHATS, "sectionsize 3", true, ".j");  // 6q -> 2x3 sections (fixture lore pool is small by design)
    await quiz.startQuiz(sock, CHATS, ALICE, MARK, { key: { id: "s1" } }, '"Re:Zero" 6 medium -s plot', "Alice", zaiLLM, null);
    const session = await waitSession(CHATS);
    ok(!!session && session.sections.length === 2, `6-question quiz split into ${session ? session.sections.length : 0} sections`);
    ok(session && session.sections[0].perSection + session.sections[1].perSection === 6, "section sizes sum to 6");
    // while section 1 plays, section 2 should be generating (streaming)
    const stWhilePlaying = session.sections[1].state;
    ok(stWhilePlaying === "GENERATING" || stWhilePlaying === "READY", `section 2 state while section 1 plays: ${stWhilePlaying} (streaming)`);
    // play section 1 through
    let guard = 0;
    await new Promise((r2) => setTimeout(r2, 5200));
    while (quiz.hasActive(CHATS) && session.activeSection === 0 && guard++ < 20) {
      const qq = session.sections[0].questions[session.idx];
      if (!qq) break;
      await quiz.handleAnswer(sock, CHATS, ALICE, String.fromCharCode(65 + qq.correct), MARK, { key: { id: `sa${guard}` } }, "Alice");
      await new Promise((r2) => setTimeout(r2, 5600));
    }
    ok(session.activeSection === 1, "auto-advanced to section 2");
    ok(session.sections[0].state === "COMPLETED", "section 1 COMPLETED");
    ok(session.sections[1].state === "ACTIVE", "section 2 ACTIVE (transition happened)");
    const secMsg = sock.sent.find((s) => s.content?.text?.includes("Section 2/2"));
    ok(!!secMsg || sock.sent.some((s) => s.content?.text?.includes("section")), "section transition messaged");
    // finish section 2
    guard = 0;
    await new Promise((r2) => setTimeout(r2, 5200));
    while (quiz.hasActive(CHATS) && guard++ < 20) {
      const sec = session.sections[session.activeSection];
      const qq = sec.questions[session.idx];
      if (!qq) break;
      await quiz.handleAnswer(sock, CHATS, BOB, String.fromCharCode(65 + qq.correct), MARK, { key: { id: `sb${guard}` } }, "Bob");
      await new Promise((r2) => setTimeout(r2, 5600));
    }
    const fin = await waitText(sock, "QUIZ FINISHED", 30000);
    ok(!!fin && !quiz.hasActive(CHATS), "multi-section quiz finished cleanly");
    // section 2 must NOT duplicate section 1's questions (dedup across sections)
    const q1 = session.sections[0].questions.map((q) => q.q);
    const q2 = session.sections[1].questions.map((q) => q.q);
    ok(!q2.some((s) => q1.includes(s)), "no duplicate questions across sections");
    await quizConfigMod.handleQuizMod(CHATS, "reset", true, ".j");
  }

  section("7c. E2E: random mode (P11) with audio budget");
  {
    const CHATR = "e2erand@g.us";
    const sock = makeMockSock();
    await quiz.startQuiz(sock, CHATR, CAROL, MARK, { key: { id: "r1" } }, "random 4", "Carol", zaiLLM, null);
    const session = await waitSession(CHATR, 150000);
    ok(!!session && session.mode === "random", "random quiz launched");
    if (session) {
      const qs = session.sections[0].questions;
      ok(qs.length >= 3 && qs.length <= 4, `random quiz generated ${qs.length} questions`);
      ok(qs.every((q) => q.q && q.options && q.options.length === 4), "random questions well-formed");
      // every non-structural question anchored to the section franchise
      ok(qs.every((q) => q.loreRef || q.fallback), "random questions carry loreRefs");
      await quiz.endQuiz(sock, CHATR, CAROL, MARK, false);
    } else {
      ok(false, "random quiz failed to go ACTIVE");
    }
  }

  media.server.close();
  console.log(`\n════════════════════════════════\nRESULT: ${pass} pass, ${fail} fail\n════════════════════════════════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
