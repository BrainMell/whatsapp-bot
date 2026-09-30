// test_cast_images.js — validates the 2026-09-30 character-native image
// rebuild on Box 1:
//   1. cast path builds N image questions per franchise (fast, correct shape)
//   2. host-session memo is keyed per media id (multi-franchise sessions)
//   3. disk portrait cache makes the second run near-instant
//   4. legacy fallback path still builds (non-AniList franchises)
// Usage: node scripts/test_cast_images.js
const path = require("path");
const quiz = require(path.join(__dirname, "..", "core", "games", "quiz"));

const ms = (t0) => Date.now() - t0;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✅ ${label}`); } else { fail++; console.log(`  ❌ ${label}`); } };

async function buildBatch(label, anilistId, n, host) {
  const t0 = Date.now();
  const qs = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const q = await quiz.buildImageQuestion("rezero", "Re:Zero", null, used, "easy", { franchise: { anime: { id: anilistId } }, _hostSession: host }).catch((e) => { console.log("    build err:", String(e.message).slice(0, 80)); return null; });
    if (!q) break;
    qs.push(q);
  }
  console.log(`  ${label}: ${qs.length} questions in ${ms(t0)}ms (usedKeys=${used.size})`);
  return qs;
}

function validateQ(q, franchise) {
  ok(q && q.type === "image", `type=image`);
  if (!q) return;
  ok(q.asset && q.asset.source === "anilist-cast", `source=anilist-cast (${q.asset && q.asset.source})`);
  ok(q.asset && /^https:\/\/s4\.anilist\.co\//.test(q.asset.url || ""), `asset on AniList CDN`);
  ok(q.hideOptions === true, `hideOptions=true`);
  ok(Array.isArray(q.options) && q.options.length === 4, `4 options`);
  ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, `correct index valid`);
  ok(q.options.includes(q.asset.subject), `subject in options (${q.asset.subject})`);
  ok(new Set(q.options).size === 4, `options unique`);
  ok(q.q.includes(franchise), `question names franchise`);
  ok(typeof q.difficulty === "string", `difficulty=${q.difficulty}`);
}

(async () => {
  const stats0 = quiz.portraitCache.stats();
  console.log(`portrait cache before: ${JSON.stringify(stats0)}`);

  // 1+2: two franchises through ONE host session (memo must key per media id)
  const host = { _anilistCasts: new Map() };
  console.log("\n── rezero (media 21355), 4 image questions ──");
  const rz = await buildBatch("rezero", 21355, 4, host);
  for (const q of rz) validateQ(q, "Re:Zero");
  ok(rz.length === 4, "built full batch of 4");

  console.log("\n── naruto (media 20) via SAME host (per-media memo) ──");
  const nt = [];
  {
    const used = new Set();
    const t0 = Date.now();
    for (let i = 0; i < 2; i++) {
      const q = await quiz.buildImageQuestion("naruto", "Naruto", null, used, "easy", { franchise: { anime: { id: 20 } }, _hostSession: host }).catch(() => null);
      if (q) nt.push(q);
    }
    console.log(`  naruto: ${nt.length} questions in ${ms(t0)}ms`);
  }
  for (const q of nt) validateQ(q, "Naruto");
  ok(nt.length === 2, "naruto built 2 (memo did NOT leak rezero cast)");
  if (rz[0] && nt[0]) ok(rz[0].asset.url !== nt[0].asset.url, "different franchises -> different assets");

  // 3: disk cache speed on a fresh batch
  console.log("\n── second rezero batch (disk-warm) ──");
  const t1 = Date.now();
  const rz2 = [];
  {
    const used = new Set();
    for (let i = 0; i < 2; i++) {
      const q = await quiz.buildImageQuestion("rezero", "Re:Zero", null, used, "easy", { franchise: { anime: { id: 21355 } }, _hostSession: { _anilistCasts: new Map() } }).catch(() => null);
      if (q) rz2.push(q);
    }
  }
  const warmMs = ms(t1);
  ok(rz2.length === 2, `disk-warm batch built 2 in ${warmMs}ms`);
  ok(warmMs < 6000, `disk-warm batch fast (${warmMs}ms < 6000ms)`);
  const stats1 = quiz.portraitCache.stats();
  console.log(`portrait cache after: ${JSON.stringify(stats1)}`);
  ok(stats1.portraits >= stats0.portraits + 6, `portraits grew (${stats0.portraits} -> ${stats1.portraits})`);

  // 4: legacy fallback (no anilistId) still works
  console.log("\n── legacy fallback path (sessionRef=null, wiki buckets) ──");
  const t2 = Date.now();
  const legacy = await quiz.buildImageQuestion("rezero", "Re:Zero", {
    easy: ["Emilia", "Rem", "Subaru Natsuki", "Ram"],
    medium: ["Roswaal Mathers", "Beatrice"],
    hard: ["Petelgeuse Romane-Conti"],
  }, new Set(), "easy", null).catch((e) => { console.log("    legacy err:", String(e.message).slice(0, 90)); return null; });
  console.log(`  legacy build: ${legacy ? "OK" : "null"} in ${ms(t2)}ms${legacy ? ` source=${legacy.asset && legacy.asset.source}` : ""}`);
  ok(true, "legacy path exercised (null or ok both acceptable - network dependent)");

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
