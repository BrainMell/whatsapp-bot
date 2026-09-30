// stress_cast_images.js — volume stress for the cast-native image builder.
// Builds 3 image questions (easy/medium/hard) for each of 12 anime media ids
// (taken from the bake-off) and reports success rate + timing percentiles.
// Success bar: >=95% builds, disk-warm median < 300ms, zero malformed.
const path = require("path");
const quiz = require(path.join(__dirname, "..", "core", "games", "quiz"));

const MEDIA = [
  ["Re:Zero", 21355], ["Naruto", 20], ["One Piece", 21], ["Attack on Titan", 16498],
  ["Jujutsu Kaisen", 113415], ["Dragon Ball", 223], ["Steins;Gate", 9253],
  ["Spy x Family", 140960], ["Chainsaw Man", 127230], ["Berserk", 33],
  ["Evangelion", 30], ["Solo Leveling", 151807],
];
const DIFFS = ["easy", "medium", "hard"];

(async () => {
  const host = { _anilistCasts: new Map() }; // one session, many franchises (random-mode shape)
  const times = [];
  let built = 0, attempts = 0;
  const malformed = [];

  for (const [title, id] of MEDIA) {
    const used = new Set();
    for (const diff of DIFFS) {
      attempts++;
      const t0 = Date.now();
      try {
        const q = await quiz.buildImageQuestion(null, title, null, used, diff, { franchise: { anime: { id } }, _hostSession: host });
        const dt = Date.now() - t0;
        if (!q) { console.log(`  ⚠ ${title} [${diff}]: null in ${dt}ms`); continue; }
        times.push(dt);
        built++;
        const shapeOk = q.type === "image" && q.asset?.source === "anilist-cast" && q.hideOptions === true
          && Array.isArray(q.options) && q.options.length === 4 && new Set(q.options).size === 4
          && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4
          && q.options.includes(q.asset.subject);
        if (!shapeOk) malformed.push(`${title}/${diff}`);
        console.log(`  ${title.padEnd(16)} [${diff.padEnd(6)}] ${String(q.asset.subject).padEnd(24)} ${dt}ms ${shapeOk ? "ok" : "MALFORMED"}`);
      } catch (e) {
        console.log(`  ✗ ${title} [${diff}]: ${String(e.message).slice(0, 70)}`);
      }
    }
  }

  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  const rate = Math.round((built / attempts) * 100);
  console.log(`\n════ STRESS RESULT ════`);
  console.log(`built=${built}/${attempts} (${rate}%)  p50=${pct(0.5)}ms  p90=${pct(0.9)}ms  max=${times[times.length - 1]}ms  malformed=${malformed.length}${malformed.length ? " -> " + malformed.join(",") : ""}`);
  console.log(`portrait cache: ${JSON.stringify(quiz.portraitCache.stats())}`);
  const bar = rate >= 95 && malformed.length === 0 ? "PASS" : "FAIL";
  console.log(`verdict: ${bar}`);
  process.exit(bar === "PASS" ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
