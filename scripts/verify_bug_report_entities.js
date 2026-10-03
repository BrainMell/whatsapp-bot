#!/usr/bin/env node
// Owner bug report 2026-10-01: live verification of the named failing
// entities through the REAL production path (detectCategory -> buildPool ->
// pickImageQuestion). Run: node scripts/verify_bug_report_entities.js
const resolver = require("../core/utils/characterResolver");
const quizGame = require("../core/games/quiz");

try { quizGame.setDeps({}); } catch (e) { console.log("setDeps warn:", e.message); }

const CASES = [
  // [title, expectedCategory] - owner bug report named entities first
  ["Ben 10", "cartoon"],
  ["Apollo 9", "movie"],       // owner-named; whichever media it truly is, must NOT be broken
  ["Elden Ring", "game"],
  ["Naruto", "anime"],
  ["The Last of Us", "tv"],
  ["Hollow Knight", "game"],   // previous complaint
  ["Squid Game", "tv"],        // picks=0 in sandbox regression (env artifact)
];

function close(a, b) {
  return a === b || (a === "other" && b) ? true : false;
}

(async () => {
  const results = [];
  for (const [title, expected] of CASES) {
    const session = { _test: `verify-${title}-${Date.now()}` };
    const usedKeys = new Set();
    try {
      const t0 = Date.now();
      const cat = await resolver.detectCategory(title);
      const pool = await resolver.buildPool({ title, sessionRef: session, category: cat });
      const withImages = pool.records.filter((r) => r.image_url).length;
      const picks = [];
      for (let i = 0; i < 3; i++) {
        const q = await resolver.pickImageQuestion({
          title, category: pool.category, difficulty: "easy",
          usedKeys, sessionRef: session, count: 3,
        }).catch((e) => { console.log(`   pick err: ${e.message}`); return null; });
        if (!q) break;
        picks.push(q);
      }
      const ms = Date.now() - t0;
      const catOk = cat === expected || expected === "other" ? true : (cat !== "other" && cat === expected);
      results.push({ title, cat, expected, catOk, pool: pool.records.length, withImages, picks: picks.map((q) => `${q.asset.subject}[${q._resolver.source}/${q._resolver.method}]`), ms });
      console.log(`\n== ${title}: cat=${cat} (expected ${expected}) pool=${pool.records.length} img=${withImages} picks=${picks.length} (${ms}ms)`);
      for (const p of picks) console.log(`   - ${p.asset.subject} [${p._resolver.source}/${p._resolver.method}] "${p.q}"`);
    } catch (e) {
      results.push({ title, error: e.message });
      console.log(`\n== ${title}: ERROR ${e.message}`);
    }
  }
  console.log("\n===== VERIFY SUMMARY =====");
  for (const r of results) {
    const line = r.error ? `${r.title}: ERROR ${r.error}`
      : `${r.title}: cat=${r.cat}${r.catOk ? "" : "(MISMATCH exp " + r.expected + ")"} pool=${r.pool} img=${r.withImages} picks=${r.picks.length}`;
    console.log(line);
  }
  process.exit(0);
})();
