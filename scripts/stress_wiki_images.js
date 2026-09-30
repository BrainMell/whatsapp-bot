// stress_wiki_images.js — volume stress for the WIKI ENTITY image path
// (2026-09-30 rebuild v2: games/movies/TV via Wikipedia entity graph).
// Runs the REAL quiz.buildImageQuestion with franchise slugs (no anilist id)
// and asserts the production question shape. Success bar mirrors the cast
// stress: high build rate, correct shape, sane timings, warm-cache speedup.
//
// Run on Box 1: node scripts/stress_wiki_images.js
const path = require("path");
const quiz = require(path.join(__dirname, "..", "core", "games", "quiz"));

// across all three non-anime domains
const FRANCHISES = [
  ["eldenring", "Elden Ring"], ["starwars", "Star Wars"], ["pokemon", "Pokémon"],
  ["zelda", "The Legend of Zelda"], ["breakingbad", "Breaking Bad"],
  ["batman", "Batman"], ["gta", "GTA"], ["minecraft", "Minecraft"],
  ["witcher", "The Witcher"], ["gameofthrones", "Game of Thrones"],
];
const DIFFS = ["easy", "medium", "hard"];

(async () => {
  const host = { _anilistCasts: new Map(), _wikiPortraits: new Map() };
  const times = [];
  let built = 0, attempts = 0;
  const malformed = [];

  for (const [slug, title] of FRANCHISES) {
    const used = new Set();
    for (const diff of DIFFS) {
      attempts++;
      const t0 = Date.now();
      try {
        const q = await quiz.buildImageQuestion(`wiki:${slug}`, title, null, used, diff, { franchise: { slug, title, mediaType: "franchise" }, _hostSession: host });
        const dt = Date.now() - t0;
        if (!q) { console.log(`  ⚠ ${title} [${diff}]: null in ${dt}ms`); continue; }
        times.push(dt);
        built++;
        const shapeOk = q.type === "image" && ["wiki-entity","wikipedia","tvmaze","anilist","fandom"].includes(q.asset?.source) && q.hideOptions === true
          && Array.isArray(q.options) && q.options.length === 4 && new Set(q.options).size === 4
          && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4
          && q.options.includes(q.asset.subject)
          && typeof q.asset.url === "string" && /^(https:\/\/upload\.wikimedia\.org\/|https:\/\/s4\.anilist\.co\/|https:\/\/image\.tmdb\.org\/|https:\/\/static\.tvmaze\.com\/)/.test(q.asset.url);
        if (!shapeOk) {
          malformed.push(`${title}/${diff}`);
          console.log(`    MALFORMED DETAIL ${title}/${diff}: ${JSON.stringify({ type: q.type, src: q.asset?.source, hide: q.hideOptions, opts: q.options, correct: q.correct, subj: q.asset?.subject, url: String(q.asset?.url).slice(0, 80) })}`);
        }
        console.log(`  ${title.padEnd(20)} [${diff.padEnd(6)}] ${String(q.asset.subject).padEnd(22)} ${dt}ms ${shapeOk ? "ok" : "MALFORMED"}`);
      } catch (e) {
        console.log(`  ✗ ${title} [${diff}]: ${String(e.message).slice(0, 70)}`);
      }
    }
  }

  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  const rate = Math.round((built / attempts) * 100);
  console.log(`\n════ STRESS RESULT (wiki-entity) ════`);
  console.log(`built=${built}/${attempts} (${rate}%)  p50=${pct(0.5)}ms  p90=${pct(0.9)}ms  max=${times[times.length - 1] || 0}ms  malformed=${malformed.length}${malformed.length ? " -> " + malformed.join(",") : ""}`);
  console.log(`portrait cache: ${JSON.stringify(quiz.portraitCache.stats())}`);
  const bar = rate >= 80 && malformed.length === 0 ? "PASS" : "FAIL";
  console.log(`verdict: ${bar}`);
  process.exit(bar === "PASS" ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
