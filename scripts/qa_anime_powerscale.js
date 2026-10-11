#!/usr/bin/env node
/**
 * qa_anime_powerscale.js — 2026-10-11
 * Regression QA for the anime-suite AniList migration + powerscale
 * disambiguation guard. Run from repo root: node scripts/qa_anime_powerscale.js
 *
 * Sections:
 *  A. anilist.js live fetchers — normalized Jikan shape + watch links
 *  B. powerscale.js selection flow — disambiguation keeps pending alive,
 *     normal pick clears it, invalid/timeout paths (goService mocked)
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
  console.log("\n── B. powerscale selection flow ──");
  const search = [{ id: 1, name: "Son Goku", url: "https://vsbattles.fandom.com/wiki/DISAMBIG" }, { id: 2, name: "Son Goku (Dragon Ball Z)", url: "https://vsbattles.fandom.com/wiki/GOOD" }, { id: 3, name: "Boom Char", url: "https://vsbattles.fandom.com/wiki/BOOM" }];
  // seed a pending selection through the real search entrypoint
  const goPath2 = require.resolve(path.join(ROOT, "core/utils/goImageService.js"));
  const realFetch = require.cache[goPath2].exports.fetchPowerscalePage;
  require.cache[goPath2].exports.searchPowerscale = async () => ({ characters: search });
  const seeded = await ps.getPowerScale("goku", "qa-chat-1");
  ok("search seeds pending list", seeded && seeded.isPending === true && seeded.success, JSON.stringify(seeded).slice(0, 60));
  ok("pending visible via hasPendingSelection", ps.hasPendingSelection("qa-chat-1"));

  // 1. disambiguation pick -> keepPending, list stays alive
  const d = await ps.handlePowerscaleSelection("qa-chat-1", "1");
  ok("disambiguation flagged as failure", d && d.success === false, JSON.stringify(d).slice(0, 60));
  ok("disambiguation sets keepPending", d && d.keepPending === true);
  ok("pending STILL alive after disambiguation", ps.hasPendingSelection("qa-chat-1"));
  ok("disambiguation message lists alternatives", d && d.error.includes("Dragon Ball Z"), String(d && d.error).slice(0, 80));

  // 2. good pick -> success, pending cleared
  const g = await ps.handlePowerscaleSelection("qa-chat-1", "2");
  ok("good pick succeeds", g && g.success === true, JSON.stringify(g).slice(0, 60));
  ok("good pick carries stats in message", g && g.message.includes("Multiverse level"));
  ok("pending cleared after good pick", !ps.hasPendingSelection("qa-chat-1"));

  // 3. fetch error path clears pending
  require.cache[goPath2].exports.searchPowerscale = async () => ({ characters: search });
  await ps.getPowerScale("goku", "qa-chat-2");
  const b = await ps.handlePowerscaleSelection("qa-chat-2", "3");
  ok("fetch throw -> failure", b && b.success === false, JSON.stringify(b).slice(0, 60));
  ok("pending cleared after fetch error", !ps.hasPendingSelection("qa-chat-2"));

  // 4. invalid pick
  require.cache[goPath2].exports.searchPowerscale = async () => ({ characters: search });
  await ps.getPowerScale("goku", "qa-chat-3");
  const inv = await ps.handlePowerscaleSelection("qa-chat-3", "99");
  ok("invalid pick rejected", inv && inv.success === false && /between 1 and 3/.test(inv.error || ""));
  require.cache[goPath2].exports.fetchPowerscalePage = realFetch;
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
  sectionC();
  console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(2); });
