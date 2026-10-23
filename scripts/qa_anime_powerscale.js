#!/usr/bin/env node
/**
 * qa_anime_powerscale.js - 2026-10-11
 * Regression QA for the anime-suite AniList migration + powerscale
 * disambiguation guard. Run from repo root: node scripts/qa_anime_powerscale.js
 *
 * Sections:
 *  A. anilist.js live fetchers - normalized Jikan shape + watch links
 *  B. powerscale.js selection flow - pick -> view session, numeric switch,
 *     parse-failure / invalid / timeout paths (vsbFeats + goService mocked)
 *  D. powerscale LIST-FIRST rule - category/feats queries always show the
 *     numbered pick list when several characters match; auto-pick ONLY on a
 *     single result; picked number with locked category -> category card
 *  E. powerscale stat markup variants - DCEU <p><br/> paragraphs (the
 *     "No Attack Potency found" bug), Maki/Nightwing colon styles, Key line
 *  F. powerscale buffered pick - numbers typed while the search is still
 *     running are held and auto-applied when the results land (race fix)
 *  C. drift guards - engine must not call dead sources (jikan/anikai URLs)
 */
process.env.GW_TEST = "";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " - " + extra : ""}`); }
}

// -- mock goImageService BEFORE powerscale.js loads it ------------------------
const goPath = require.resolve(path.join(ROOT, "core/utils/goImageService.js"));
const calls = { fetchPage: [] };
require.cache[goPath] = {
  id: goPath, filename: goPath, loaded: true, exports: {
    fetchPowerscalePage: async (url) => {
      calls.fetchPage.push(url);
      if (url.includes("DISAMBIG")) {
        return { name: "Son Goku", imageUrl: "", summary: "This article is a disambiguation page for Son Goku", stats: {}, pageUrl: url, isDisambiguation: true };
      }
      if (url.includes("BOOM")) throw new Error("socket hang up");
      return {
        name: "Naruto Uzumaki", imageUrl: "https://static.wikia.nocookie.net/x.jpg",
        summary: "Naruto Uzumaki is a shinobi.", stats: { Tier: "2-B", "Attack Potency": "Multiverse level" },
        pageUrl: url,
      };
    },
  },
};

const ps = require(path.join(ROOT, "core/utils/powerscale.js"));

async function sectionA() {
  console.log("\n── A. anilist.js live fetchers ──");
  const al = require(path.join(ROOT, "core/utils/anilist.js"));
  try {
    const s = await al.searchAnime("naruto", 3);
    ok("searchAnime returns results", s.length >= 1);
    const a = s[0];
    ok("search item normalized shape", a && typeof a.title === "string" && a.url && a.images && typeof a.images.jpg.large_image_url === "string" && a.images.jpg.large_image_url.startsWith("http"), JSON.stringify(a && a.images).slice(0, 80));
    ok("score normalized to 0-10 scale", a.score == null || a.score <= 10, String(a.score));
  } catch (e) { ok("searchAnime live", false, e.message); }

  for (const [name, fn, n] of [
    ["trending", () => al.trending(10), 10],
    ["airing", () => al.airing(10), 10],
    ["upcoming", () => al.upcoming(10), 10],
    ["top", () => al.top(10), 10],
  ]) {
    try {
      const list = await fn();
      ok(`${name} returns items`, list.length > 0, `got ${list.length}`);
      ok(`${name} items normalized`, list.every((x) => x.title && x.url), "missing title/url");
    } catch (e) { ok(`${name} live`, false, e.message); }
  }

  try {
    const st = await al.studioAnime("Bones", 5);
    ok("studioAnime finds studio works", st.length > 0, `got ${st.length}`);
  } catch (e) { ok("studioAnime live", false, e.message); }

  try {
    const r = await al.randomAnime();
    ok("randomAnime returns one item", !!(r && r.title && r.url));
  } catch (e) { ok("randomAnime live", false, e.message); }

  try {
    const w = await al.getWatchLink("Naruto");
    ok("watch link resolves to a real URL", /^https?:\/\//.test(w || ""), String(w));
    ok("watch link prefers official streaming/anilist", /crunchyroll|netflix|anilist|hulu|prime|bilibili/i.test(w || ""), String(w));
  } catch (e) { ok("getWatchLink live", false, e.message); }

  ok("normScore 87 -> 8.7", al.normMedia && require(path.join(ROOT, "core/utils/anilist.js")).searchAnime === al.searchAnime, "module identity");
  const nm = al.stripHtml("<b>Hello</b> &amp; <br/>world&quot;s");
  ok("stripHtml handles entities+breaks", nm === "Hello & \nworld\"s", JSON.stringify(nm));
}

async function sectionB() {
  console.log("\n── B. powerscale selection flow (pick -> view, switch, timeout) ──");
 // stub vsbFeats network fns IN PLACE (powerscale.js holds the same module
 // object) so this section is fully deterministic - no live Fandom calls
  const vsbPath = require.resolve(path.join(ROOT, "core/utils/vsbFeats.js"));
  const vsb = require(vsbPath);
  const savedB = { searchCharacters: vsb.searchCharacters, parseCharacter: vsb.parseCharacter };
  const CHARS = [
    { id: 1, name: "Son Goku (Dragon Ball Z)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Z)" },
    { id: 2, name: "Goku Black", url: "https://vsbattles.fandom.com/wiki/Goku_Black" },
    { id: 3, name: "Son Goku (Dragon Ball Super)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Super)" },
  ];
  vsb.searchCharacters = async (q) => (/goku/i.test(String(q)) ? CHARS : []);
  vsb.parseCharacter = async (url) => {
    if (url.includes("BOOM")) throw new Error("socket hang up");
    const nm = url.includes("Black") ? "Goku Black" : url.includes("Super") ? "Son Goku (Dragon Ball Super)" : "Son Goku (Dragon Ball Z)";
    return {
      name: nm, pageUrl: url, imageUrl: "", imageUrls: [], summary: "", keyLine: "",
      stats: new Map([
        ["Tier", [{ variant: "", text: "2-B", rating: "2-B", feats: [], calcs: [] }]],
        ["Attack Potency", [{ variant: "", text: "Multiverse level", rating: "Multiverse level", feats: [], calcs: [] }]],
      ]),
      categories: ["Tier", "Attack Potency"], isVerse: false,
    };
  };
  try {
 // seed a pending pick session directly (deterministic)
    ps.pendingSelections.set("qa-chat-1", { phase: "pick", characters: CHARS, category: null, query: "goku", pickedId: 0, timestamp: Date.now() });
    ok("pending visible via hasPendingSelection", ps.hasPendingSelection("qa-chat-1"));

 // 1. good pick -> success card, session flips to view (stays alive for switching)
    const g = await ps.handlePowerscaleSelection("qa-chat-1", "1");
    ok("good pick succeeds", g && g.success === true && g.mode === "card", JSON.stringify(g).slice(0, 80));
    ok("good pick carries stats in message", g && g.message.includes("Multiverse level"));
    ok("session stays alive in view mode (for switching)", ps.hasPendingSelection("qa-chat-1"));

 // 2. numeric switch while viewing -> card for the other character
    const g2 = await ps.handlePowerscaleSelection("qa-chat-1", "2");
    ok("numeric switch works", g2 && g2.success === true && g2.mode === "card" && g2.name === "Goku Black", JSON.stringify(g2 || {}).slice(0, 80));

 // 3. parse failure on the picked char -> failure, session survives for retry
    const oldData = ps.pendingSelections.get("qa-chat-1").data;
    ps.pendingSelections.get("qa-chat-1").data = null; // force re-parse path
    vsb.parseCharacter = async () => { throw new Error("socket hang up"); };
    const goPath3 = require.resolve(path.join(ROOT, "core/utils/goImageService.js"));
    const savedGo = require.cache[goPath3].exports.fetchPowerscalePage;
    require.cache[goPath3].exports.fetchPowerscalePage = async () => { throw new Error("socket hang up"); };
    const b = await ps.handlePowerscaleSelection("qa-chat-1", "3");
    require.cache[goPath3].exports.fetchPowerscalePage = savedGo;
    ok("fetch throw -> failure", b && b.success === false, JSON.stringify(b).slice(0, 60));
    ok("session survives fetch error for retry", ps.hasPendingSelection("qa-chat-1"));

 // 4. invalid pick
    ps.pendingSelections.get("qa-chat-1").data = oldData;
    const inv = await ps.handlePowerscaleSelection("qa-chat-1", "99");
    ok("invalid pick rejected", inv && inv.success === false && /between 1 and 3/.test(inv.error || ""));

 // 5. timeout path
    ps.pendingSelections.get("qa-chat-1").timestamp = Date.now() - (ps.SELECTION_TIMEOUT_MS + 1000);
    const t = await ps.handlePowerscaleSelection("qa-chat-1", "1");
    ok("timed-out pick rejected", t && t.success === false && /timed out/i.test(t.error || ""));
    ok("timeout clears session", !ps.hasPendingSelection("qa-chat-1"));
  } finally {
    vsb.searchCharacters = savedB.searchCharacters;
    vsb.parseCharacter = savedB.parseCharacter;
    ps.pendingSelections.delete("qa-chat-1");
  }
}

/**
 * Section D - LIST-FIRST RULE (owner, 2026-10-18: "even if I attach speed it
 * should still pull up the list of possible options ... randomly selecting a
 * character won't work which is why we had that system in the first place").
 * Category/feats queries must NEVER auto-pick while several matches exist;
 * auto-pick is allowed ONLY for a single search result.
 */
async function sectionD() {
  console.log("\n── D. powerscale list-first rule (category queries never auto-pick) ──");
  const vsbPath = require.resolve(path.join(ROOT, "core/utils/vsbFeats.js"));
  const vsb = require(vsbPath);
  const savedD = { searchCharacters: vsb.searchCharacters, parseCharacter: vsb.parseCharacter, fetchImageBuffer: vsb.fetchImageBuffer };
  const MULTI = [
    { id: 1, name: "Son Goku (Dragon Ball Z)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Z)" },
    { id: 2, name: "Goku Black", url: "https://vsbattles.fandom.com/wiki/Goku_Black" },
    { id: 3, name: "Son Goku (Dragon Ball Super)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Super)" },
  ];
  vsb.searchCharacters = async (q) => {
    const s = String(q).toLowerCase();
    if (s.includes("goku")) return MULTI;
    if (s.includes("gohan")) return [{ id: 1, name: "Son Gohan", url: "https://vsbattles.fandom.com/wiki/Son_Gohan" }];
    return [];
  };
  vsb.parseCharacter = async (url) => {
    const nm = url.includes("Black") ? "Goku Black" : url.includes("Gohan") ? "Son Gohan" : "Son Goku (Dragon Ball Z)";
    return {
      name: nm, pageUrl: url, imageUrl: "", imageUrls: [], summary: "", keyLine: "",
      stats: new Map([["Speed", [{ variant: "Base", text: "Supersonic (blitzed Nappa)", rating: "Supersonic", feats: ["Casually dodged and blitzed Nappa"], calcs: [] }]]]),
      categories: ["Speed"], isVerse: false,
    };
  };
  vsb.fetchImageBuffer = async () => null;
  try {
 // 1. multi-match + category -> LIST, never a card
    const r1 = await ps.resolveFlow("goku", "Speed", false);
    ok("multi-match + category stays a list", r1 && r1.mode === "list", JSON.stringify(r1 || {}).slice(0, 90));
    ok("list shows every match", r1 && r1.characters && r1.characters.length === 3);
    ok("list locks the category", r1 && /category locked: \*Speed\*/.test(r1.message), r1 && r1.message.slice(0, 90));
    ok("list shows the numeric pick prompt", r1 && /Reply with a \*number\*/.test(r1.message));
    ok("no stale auto-pick hint in list", r1 && !r1.message.includes("auto-pick"));

 // 2. picking a number with the category locked -> SPEED card for THAT char
    ps.pendingSelections.set("qa-ps-1", { phase: "pick", characters: r1.characters, category: "Speed", query: "goku", pickedId: 0, timestamp: Date.now() });
    const p2 = await ps.handlePowerscaleSelection("qa-ps-1", "2");
    ok("pick#2 with category locked -> card", p2 && p2.success === true && p2.mode === "card", JSON.stringify(p2 || {}).slice(0, 90));
    ok("card is the SPEED card of the picked char", p2 && p2.name === "Goku Black" && p2.message.includes("SPEED - GOKU BLACK"), p2 && p2.message.slice(0, 90));
    ok("picked card carries the feats", p2 && p2.message.includes("blitzed Nappa"));
    ps.pendingSelections.delete("qa-ps-1");

 // 3. single result + category -> auto-pick is fine (only one option)
    const r2 = await ps.resolveFlow("gohan", "Speed", false);
    ok("single result + category auto-picks", r2 && r2.mode === "card" && r2.name === "Son Gohan", JSON.stringify(r2 || {}).slice(0, 90));
    ok("single-result card is the category card", r2 && r2.message.includes("SPEED - SON GOHAN"));

 // 4. feats overview + multi-match -> also stays a list
    const r3 = await ps.resolveFlow("goku", null, true);
    ok("feats overview multi-match stays a list", r3 && r3.mode === "list");
  } finally {
    vsb.searchCharacters = savedD.searchCharacters;
    vsb.parseCharacter = savedD.parseCharacter;
    vsb.fetchImageBuffer = savedD.fetchImageBuffer;
    ps.pendingSelections.delete("qa-ps-1");
  }
}

/**
 * Section E - STAT PARAGRAPH MARKUP VARIANTS (pure, no network).
 * Owner incident 2026-10-18: ".j powerscale ap superman" → "No Attack Potency
 * stat found" - DCEU-style pages open the stat paragraph with <p><br /> and
 * the old STAT_P_RE only allowed whitespace, silently skipping AP (and any
 * other stat with that prefix) on the whole page.
 */
async function sectionE() {
  console.log("\n── E. powerscale stat markup variants (extractStatsFromHtml) ──");
  const vsb = require(path.join(ROOT, "core/utils/vsbFeats.js"));
  const PSH = `<h2><span class="mw-headline" id="Powers_and_Stats">Powers and Stats</span></h2>`;

 // DCEU Superman style: <p><br /> before EVERY stat + Key line with <br>
  const dceu = vsb.extractStatsFromHtml(`${PSH}
<p><br />
<b><a href="/wiki/Key" title="Key">Key</a>:</b> Pre-Resurrection | Post-Resurrection</p>
<p><br />
<b><a href="/wiki/Attack_Potency" title="Attack Potency">Attack Potency</a>:</b> <b>Town level+</b> (Can fight those who harm him. <a href="/wiki/User_blog:X/Cloud">Moved a part of a cloud</a>), up to at least <b>Brown Dwarf level</b>, likely <b>Small Star level+</b> (Grew stronger over time)</p>
<p><br />
<b><a href="/wiki/Attack_Potency" title="Attack Potency">Attack Potency</a>:</b> <b>Small Town level</b> (Weakened after resurrection)</p>
<p><b><a href="/wiki/Speed" title="Speed">Speed</a>:</b> at least <b>Relativistic+</b> (Flew from the Moon to Earth in moments)</p>`);
  ok("DCEU: Attack Potency no longer skipped", dceu.stats.has("Attack Potency"), [...dceu.stats.keys()].join(","));
  ok("DCEU: AP has 2 key variants", (dceu.stats.get("Attack Potency") || []).length === 2);
  ok("DCEU: AP variant names from Key line", (dceu.stats.get("Attack Potency") || [])[0].variant === "Pre-Resurrection" && (dceu.stats.get("Attack Potency") || [])[1].variant === "Post-Resurrection");
  ok("DCEU: AP rating keeps multi-bold values", /Town level\+.*Brown Dwarf level.*Small Star level\+/.test((dceu.stats.get("Attack Potency") || [])[0].rating || ""));
  ok("DCEU: AP feats extracted from parens", ((dceu.stats.get("Attack Potency") || [])[0].feats || []).some((f) => f.includes("Moved a part of a cloud")));
  ok("DCEU: AP calc link captured", ((dceu.stats.get("Attack Potency") || [])[0].calcs || []).length === 1);
  ok("DCEU: Key line parsed with <br> prefix", dceu.keyLine === "Pre-Resurrection | Post-Resurrection", JSON.stringify(dceu.keyLine));
  ok("DCEU: plain <p><b> Speed still parses", dceu.stats.has("Speed") && /Relativistic\+/.test(dceu.stats.get("Speed")[0].rating));

 // Maki style: colon outside the anchor; Nightwing style: colon inside the anchor
  const maki = vsb.extractStatsFromHtml(`${PSH}
<p><b><a href="/wiki/Speed" title="Speed">Speed</a>:</b> Subsonic (Can cut and dodge rubber bullets)</p>`);
  ok("Maki style: colon-outside-anchor parses", maki.stats.has("Speed") && maki.stats.get("Speed")[0].rating.includes("Subsonic"));
  const nightwing = vsb.extractStatsFromHtml(`${PSH}
<p><b><a href="/wiki/Tier" title="Tier">Tier:</a></b> 9-A</p>`);
  ok("Nightwing style: colon-inside-anchor parses", nightwing.stats.has("Tier") && nightwing.stats.get("Tier")[0].rating === "9-A");

 // <br> without space + self-closing variants
  const tight = vsb.extractStatsFromHtml(`${PSH}
<p><br/><b>Tier:</b> 2-B</p>`);
  ok("tight <br/> variant parses", tight.stats.has("Tier") && tight.stats.get("Tier")[0].rating === "2-B");

 // verse pages still detected
  const verse = vsb.extractStatsFromHtml(`<h2><span class="mw-headline" id="Summary">Summary</span></h2><p>A verse page.</p>`);
  ok("verse page detection intact", verse.isVerse === true && verse.stats.size === 0);
}

/**
 * Section F - BUFFERED PICK (race fix e2e).
 * Owner incident 2026-10-18: Mellow typed "1" 2s BEFORE the 10-match list
 * landed (search ~15-19s) - the number died silently. Now the searching
 * session holds it and auto-applies when the results arrive.
 */
async function sectionF() {
  console.log("\n── F. powerscale buffered pick (search-in-flight race) ──");
  const vsbPath = require.resolve(path.join(ROOT, "core/utils/vsbFeats.js"));
  const vsb = require(vsbPath);
  const savedF = { searchCharacters: vsb.searchCharacters, parseCharacter: vsb.parseCharacter, fetchImageBuffer: vsb.fetchImageBuffer };
  const MULTI = [
    { id: 1, name: "Son Goku (Dragon Ball Z)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Z)" },
    { id: 2, name: "Goku Black", url: "https://vsbattles.fandom.com/wiki/Goku_Black" },
    { id: 3, name: "Son Goku (Dragon Ball Super)", url: "https://vsbattles.fandom.com/wiki/Son_Goku_(Dragon_Ball_Super)" },
  ];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  vsb.searchCharacters = async () => { await delay(150); return MULTI; }; // slow search = race window
  vsb.parseCharacter = async (url) => {
    const nm = url.includes("Black") ? "Goku Black" : "Son Goku (Dragon Ball Z)";
    return {
      name: nm, pageUrl: url, imageUrl: "", imageUrls: [], summary: "", keyLine: "",
      stats: new Map([["Speed", [{ variant: "Base", text: "Supersonic (blitzed Nappa)", rating: "Supersonic", feats: ["Casually dodged and blitzed Nappa"], calcs: [] }]]]),
      categories: ["Speed"], isVerse: false,
    };
  };
  vsb.fetchImageBuffer = async () => null;

  const CHAT = "qa-ps-buffered";
  try {
    ps.pendingSelections.delete(CHAT);
    const sends = [];
    const sock = { sendMessage: async (_c, content) => { sends.push(content); return {}; } };

 // 1. number typed MID-SEARCH gets buffered, then auto-applies
    const cmdPromise = ps.runPowerscaleCommand({ sock, chatId: CHAT, msgKey: { id: "m1" }, raw: "speed goku", botMarker: "", prefix: "j" });
    await delay(30); // search still in flight
    const duringSearch = await ps.handlePowerscaleSelection(CHAT, "2");
    ok("mid-search number is accepted+buffered", duringSearch && duringSearch.success === true && duringSearch.mode === "buffered", JSON.stringify(duringSearch || {}).slice(0, 80));
    await cmdPromise;
    const texts = sends.map((s) => s.text || s.caption || "");
    ok("card for the PICKED char arrives (no list)", texts.some((t) => t.includes("SPEED - GOKU BLACK")), texts.join("||").slice(0, 200));
    ok("list is skipped when a pick was buffered", !texts.some((t) => t.includes("matches for")));
    ok("session survives in view mode (for switching)", ps.hasPendingSelection(CHAT));
    ps.pendingSelections.delete(CHAT);

 // 2. out-of-range buffered number → list shown with a note
    ps.pendingSelections.delete(CHAT);
    const sends2 = [];
    const sock2 = { sendMessage: async (_c, content) => { sends2.push(content); return {}; } };
    const cmd2 = ps.runPowerscaleCommand({ sock: sock2, chatId: CHAT, msgKey: { id: "m2" }, raw: "speed goku", botMarker: "", prefix: "j" });
    await delay(30);
    const during2 = await ps.handlePowerscaleSelection(CHAT, "9"); // only 3 matches
    ok("out-of-range mid-search number also buffered", during2 && during2.mode === "buffered");
    await cmd2;
    const texts2 = sends2.map((s) => s.text || "");
    ok("fallback shows the list", texts2.some((t) => t.includes("matches for")));
    ok("fallback explains the invalid pick", texts2.some((t) => t.includes("earlier reply *9*")));
    ps.pendingSelections.delete(CHAT);

 // 3. search failure clears the session (numbers stop being swallowed)
    ps.pendingSelections.delete(CHAT);
    vsb.searchCharacters = async () => { await delay(20); throw new Error("network dead"); };
    const sends3 = [];
    const sock3 = { sendMessage: async (_c, content) => { sends3.push(content); return {}; } };
    await ps.runPowerscaleCommand({ sock: sock3, chatId: CHAT, msgKey: { id: "m3" }, raw: "speed goku", botMarker: "", prefix: "j" });
    ok("failed search clears the session", !ps.hasPendingSelection(CHAT));
    ok("failed search reports the error", sends3.some((s) => (s.text || "").includes("lookup failed")));
    ps.pendingSelections.delete(CHAT);
  } finally {
    vsb.searchCharacters = savedF.searchCharacters;
    vsb.parseCharacter = savedF.parseCharacter;
    vsb.fetchImageBuffer = savedF.fetchImageBuffer;
    ps.pendingSelections.delete("qa-ps-buffered");
  }
}

function sectionC() {
  console.log("\n── C. drift guards ──");
  const fs = require("fs");
  const engine = fs.readFileSync(path.join(ROOT, "core/engine.js"), "utf8");
  ok("engine has no live jikan URL calls", !/axios\.get\(\s*[`"']https:\/\/api\.jikan\.moe/.test(engine) && !/get\(\s*\n?\s*[`"']https:\/\/api\.jikan\.moe/.test(engine));
  ok("engine has no anikai.to URL building", !/anikai\.to/.test(engine.replace(/\/\/[^\n]*anikai\.to[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  const anilistSrc = fs.readFileSync(path.join(ROOT, "core/utils/anilist.js"), "utf8");
  ok("anilist module exports all 8 fetchers", ["searchAnime", "trending", "airing", "upcoming", "top", "randomAnime", "studioAnime", "getWatchLink"].every((f) => anilistSrc.includes(f)));
  const scraperNote = fs.readFileSync(path.join(ROOT, "core/utils/anilist.js"), "utf8").includes("graphql.anilist.co");
  ok("anilist endpoint pinned", scraperNote);
}

(async () => {
  console.log("═══ qa_anime_powerscale ═══");
  await sectionA();
  await sectionB();
  await sectionD();
  await sectionE();
  await sectionF();
  sectionC();
  console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(2); });
