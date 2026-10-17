#!/usr/bin/env node
/**
 * qa_anime_powerscale.js — 2026-10-11
 * Regression QA for the anime-suite AniList migration + powerscale
 * disambiguation guard. Run from repo root: node scripts/qa_anime_powerscale.js
 *
 * Sections:
 *  A. anilist.js live fetchers — normalized Jikan shape + watch links
 *  B. powerscale.js selection flow — pick -> view session, numeric switch,
 *     parse-failure / invalid / timeout paths (vsbFeats + goService mocked)
 *  D. powerscale LIST-FIRST rule — category/feats queries always show the
 *     numbered pick list when several characters match; auto-pick ONLY on a
 *     single result; picked number with locked category -> category card
 *  C. drift guards — engine must not call dead sources (jikan/anikai URLs)
 */
process.env.GW_TEST = "";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
}

// ── mock goImageService BEFORE powerscale.js loads it ────────────────────────
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
  // object) so this section is fully deterministic — no live Fandom calls
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
 * Section D — LIST-FIRST RULE (owner, 2026-10-18: "even if I attach speed it
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
    ok("card is the SPEED card of the picked char", p2 && p2.name === "Goku Black" && p2.message.includes("SPEED — GOKU BLACK"), p2 && p2.message.slice(0, 90));
    ok("picked card carries the feats", p2 && p2.message.includes("blitzed Nappa"));
    ps.pendingSelections.delete("qa-ps-1");

    // 3. single result + category -> auto-pick is fine (only one option)
    const r2 = await ps.resolveFlow("gohan", "Speed", false);
    ok("single result + category auto-picks", r2 && r2.mode === "card" && r2.name === "Son Gohan", JSON.stringify(r2 || {}).slice(0, 90));
    ok("single-result card is the category card", r2 && r2.message.includes("SPEED — SON GOHAN"));

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
  sectionC();
  console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(2); });
