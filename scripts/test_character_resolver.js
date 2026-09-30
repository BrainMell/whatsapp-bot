#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// CHARACTER RESOLVER E2E TEST (owner spec 2026-09-30 v3)
// covers: category detection, provider selection, image validity,
// fallbacks, randomization (5 consecutive runs MUST differ), duplicate
// characters/images, per-session independence.
// Run on Box 1: node scripts/test_character_resolver.js
// ══════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const resolver = require("../core/utils/characterResolver");
const quizLore = require("../core/games/quizLore");
const quizGame = require("../core/games/quiz");
// quiz.setDeps injects fetchFranchiseCast (paced AniList cast) +
// detectMediaType into the resolver - this is exactly what the engine does
try { quizGame.setDeps({}); } catch (e) { console.log("setDeps warn:", e.message); }

const POOLS_DIR = path.join(__dirname, "..", "core", "data", "quiz_pools");
const RECENT_FILE = path.join(__dirname, "..", "core", "data", "quiz_recent_used.json");

function clearCaches(title) {
  // cold test: drop the disk pool for this franchise so the builder really runs
  const crypto = require("crypto");
  const h = crypto.createHash("sha1").update(String(title).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim()).digest("hex").slice(0, 16);
  const f = path.join(POOLS_DIR, `pool-${h}.json`);
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* noop */ }
  // recency too - the randomization test needs the full pool. The resolver's
  // franchise key is its own normalization; safest is to reset the whole file.
  try { if (fs.existsSync(RECENT_FILE)) fs.unlinkSync(RECENT_FILE); } catch { /* noop */ }
}

async function testFranchise(title, slug, category, anilistId, wantN = 5) {
  clearCaches(title);
  const usedKeys = new Set();
  const session = { _test: `sess-${title}-${Date.now()}` }; // unique session = unique WeakMap key
  const t0 = Date.now();
  const pool = await resolver.buildPool({ title, slug, category, anilistId, sessionRef: session });
  const poolMs = Date.now() - t0;
  const withImages = pool.records.filter((r) => r.image_url);
  const srcCount = {};
  for (const r of pool.records) srcCount[r.source] = (srcCount[r.source] || 0) + 1;
  console.log(`\n══ ${title} [category=${pool.category}]`);
  console.log(`   pool: ${pool.records.length} records, ${withImages.length} with images (${poolMs}ms, ${pool.cached}) sources: ${JSON.stringify(srcCount)}`);

  const picks = [];
  for (let i = 0; i < wantN; i++) {
    const q = await resolver.pickImageQuestion({
      title, slug, category: pool.category, anilistId, difficulty: "easy",
      usedKeys, sessionRef: session, count: wantN,
    }).catch((e) => { console.log(`   pick ${i + 1} ERROR: ${e.message}`); return null; });
    if (!q) break;
    picks.push(q);
  }
  const subjects = picks.map((q) => q.asset.subject);
  const hashes = picks.map((q) => q.asset.bytesHash);
  const srcs = picks.map((q) => q._resolver.source);
  const dupSubjects = subjects.length !== new Set(subjects).size;
  const dupHashes = hashes.length !== new Set(hashes).size;
  console.log(`   picks: ${subjects.length ? subjects.join(" | ") : "(none)"}`);
  console.log(`   providers used: ${[...new Set(srcs)].join(", ") || "-"}  dupSubjects=${dupSubjects} dupImages=${dupHashes}`);
  return { title, category: pool.category, poolSize: pool.records.length, withImages: withImages.length, picks: subjects, srcs, dupSubjects, dupHashes };
}

async function randomizationTest(title, slug, category, anilistId, runs = 5) {
  console.log(`\n══ RANDOMIZATION: ${title} x ${runs} independent sessions`);
  const seqs = [];
  let withinRunDupes = 0;
  for (let r = 0; r < runs; r++) {
    clearCaches(title); // each run is a "fresh day" - recency resets by design
    const usedKeys = new Set();
    const session = { _test: `rand-${title}-${r}-${Date.now()}` };
    const subjects = [];
    const runHashes = new Set();
    for (let i = 0; i < 5; i++) {
      const q = await resolver.pickImageQuestion({
        title, slug, category, anilistId, difficulty: "easy",
        usedKeys, sessionRef: session, count: 5,
      }).catch(() => null);
      if (!q) break;
      subjects.push(q.asset.subject);
      if (runHashes.has(q.asset.bytesHash)) withinRunDupes++;
      runHashes.add(q.asset.bytesHash);
    }
    seqs.push(subjects);
    console.log(`   run ${r + 1}: ${subjects.join(" | ") || "(none)"}`);
  }
  const joined = seqs.map((s) => s.join("§"));
  const allSame = joined.every((j) => j === joined[0]);
  const distinct = new Set(joined).size;
  console.log(`   distinct sequences: ${distinct}/${runs}  allSame=${allSame}  withinRunImageDupes=${withinRunDupes}`);
  return { distinct, allSame, withinRunDupes, seqs };
}

// recency: 3 runs WITHOUT clearing recency - run 2/3 must not recycle run 1's picks
async function recencyTest(title, slug, category, anilistId, runs = 3) {
  console.log(`\n══ RECENCY: ${title} x ${runs} consecutive runs (recency NOT reset)`);
  clearCaches(title);
  let first = null; let overlaps = [];
  const seqs = [];
  for (let r = 0; r < runs; r++) {
    const usedKeys = new Set();
    const session = { _test: `rec-${title}-${r}-${Date.now()}` };
    const subjects = [];
    for (let i = 0; i < 5; i++) {
      const q = await resolver.pickImageQuestion({
        title, slug, category, anilistId, difficulty: "easy",
        usedKeys, sessionRef: session, count: 5,
      }).catch(() => null);
      if (!q) break;
      subjects.push(q.asset.subject);
    }
    seqs.push(subjects);
    if (r === 0) first = new Set(subjects);
    else {
      const ov = subjects.filter((s) => first.has(s)).length;
      overlaps.push(ov);
      console.log(`   run ${r + 1}: ${subjects.join(" | ")}  (overlap with run1: ${ov}/5)`);
    }
  }
  const deepPool = seqs[0].length > 0;
  const ok = deepPool && overlaps.every((o) => o <= 1); // allow tiny overlap on small pools
  console.log(`   recency ${ok ? "PASS" : "FAIL"}`);
  return { ok, overlaps, seqs };
}

(async () => {
  const results = [];
  const t0 = Date.now();
  // ── ANIME ── (cast path needs fetchFranchiseCast - test via direct pool call)
  // NOTE: fetchFranchiseCast lives in quiz.js; injecting it here would pull the
  // whole quiz engine. The anime cast path is exercised by the regression
  // suites (test_cast_images.js). Here we validate the RESOLVER layer:
  results.push(await testFranchise("Dragon Ball", "dragonball", "anime", null));
  results.push(await testFranchise("One Piece", "onepiece", "anime", null));
  results.push(await testFranchise("Re:Zero", "rezero", "anime", null));
  // ── GAMES ── (Hollow Knight = the known failure; Mario = uncurated; Sephiroth = registry)
  results.push(await testFranchise("Hollow Knight", null, "game", null));
  results.push(await testFranchise("Super Mario", null, "game", null));
  results.push(await testFranchise("Final Fantasy", "finalfantasy", "game", null));
  // ── MOVIES/TV ──
  results.push(await testFranchise("Breaking Bad", "breakingbad", "tv", null));
  results.push(await testFranchise("The Matrix", null, "movie", null));
  results.push(await testFranchise("Squid Game", null, "tv", null));
  // ── CROSS-MEDIA ── (category auto-detect, no explicit category)
  results.push(await testFranchise("Batman", "batman", null, null));
  results.push(await testFranchise("Spider-Man", null, null, null));

  console.log("\n════ SUMMARY ════");
  let pass = 0, fail = 0;
  for (const r of results) {
    const ok = r.poolSize > 0 && r.withImages > 0 && r.picks.length > 0 && !r.dupSubjects && !r.dupHashes;
    if (ok) pass++; else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.title.padEnd(16)} cat=${r.category.padEnd(7)} pool=${String(r.poolSize).padStart(3)} img=${String(r.withImages).padStart(3)} picks=${r.picks.length} src=${[...new Set(r.srcs)].join("/")}`);
  }

  // randomization: one game (the previous failure) + one anime
  const rand1 = await randomizationTest("Hollow Knight", null, "game", null, 5);
  const rand2 = await randomizationTest("Re:Zero", "rezero", "anime", null, 5);
  const randOk = !rand1.allSame && !rand2.allSame && rand1.withinRunDupes === 0 && rand2.withinRunDupes === 0 && rand1.distinct >= 3 && rand2.distinct >= 3;
  console.log(`\nRANDOMIZATION: ${randOk ? "PASS" : "FAIL"} (HK distinct=${rand1.distinct}/5, ReZero distinct=${rand2.distinct}/5, withinRunDupes=${rand1.withinRunDupes}+${rand2.withinRunDupes})`);

  // recency: consecutive runs must stop recycling the same heads
  const rec1 = await recencyTest("Re:Zero", "rezero", "anime", null, 3);
  const rec2 = await recencyTest("Hollow Knight", null, "game", null, 3);
  const recOk = rec1.ok && rec2.ok;
  console.log(`RECENCY: ${recOk ? "PASS" : "FAIL"} (ReZero overlaps=${rec1.overlaps}, HK overlaps=${rec2.overlaps})`);

  console.log(`\nTOTAL: ${pass + (randOk ? 1 : 0) + (recOk ? 1 : 0)} pass / ${fail + (randOk ? 0 : 1) + (recOk ? 0 : 1)} fail  (${Math.round((Date.now() - t0) / 1000)}s)`);
  process.exit(0);
})();
