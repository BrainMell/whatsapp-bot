// research_quiz.js - REAL Jikan (MyAnimeList) API experiments for the quiz system
"use strict";
const axios = require("axios");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" };

const client = axios.create({ baseURL: "https://api.jikan.moe/v4", headers: UA, timeout: 20000, family: 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Jikan policy: 3 req/sec, 60 req/min - pace at 1.1s to stay safe
const pace = () => sleep(1100);

async function searchAnime(q, limit = 5) {
  const r = await client.get("/anime", { params: { q, limit, order_by: "members", sort: "desc" } });
  return (r.data.data || []).map((a) => ({ id: a.mal_id, title: a.title, titleEng: a.title_english, type: a.type, eps: a.episodes, score: a.score, year: a.year, members: a.members, synopsis: (a.synopsis || "").slice(0, 120) }));
}

async function animeFull(id) {
  const r = await client.get(`/anime/${id}/full`);
  const a = r.data.data;
  return { id: a.mal_id, title: a.title, titles: [a.title, a.title_english, ...(a.titles || []).map((t) => t.title)], eps: a.episodes, score: a.score, year: a.year, studio: (a.studios || []).map((s) => s.name), genres: (a.genres || []).map((g) => g.name), synopsisLen: (a.synopsis || "").length, characters: a.characters ? a.characters.length : "n/a" };
}

async function animeCharacters(id) {
  const r = await client.get(`/anime/${id}/characters`);
  return (r.data.data || []).slice(0, 8).map((c) => ({ name: c.character.name, malId: c.character.mal_id, role: c.role, va: c.voices && c.voices[0] ? c.voices[0].person.name : null, favorites: c.favorites }));
}

(async () => {
  console.log("=== JIKAN SEARCH: title resolution ===");
  const searches = [
    ["Fullmetal Alchemist Brotherhood", "exact-ish popular title"],
    ["fmab", "abbreviation"],
    ["naruto", "ambiguous franchise"],
    ["sword art online", "multi-season franchise"],
    ["Xyzzy Nonexistent Anime QQQ", "nonexistent"],
    ["evangelion", "short vague title"],
  ];
  for (const [q, note] of searches) {
    try {
      const res = await searchAnime(q, 5);
      console.log(`  "${q}" (${note}): ${res.length} hits`);
      res.slice(0, 4).forEach((a) => console.log(`    #${a.id} "${a.title}" eng="${a.titleEng}" ${a.type} eps=${a.eps} score=${a.score} y=${a.year} members=${a.members}`));
    } catch (e) { console.log(`  "${q}": ERROR ${e.response?.status || e.code} ${e.message.slice(0, 60)}`); }
    await pace();
  }

  console.log("=== JIKAN FULL: ground truth for questions ===");
  try {
    const full = await animeFull(5114); // FMA Brotherhood
    console.log(`  #5114: ${JSON.stringify(full, null, 1).slice(0, 600)}`);
  } catch (e) { console.log(`  full(5114): ERROR ${e.response?.status || e.message.slice(0, 60)}`); }
  await pace();

  console.log("=== JIKAN CHARACTERS: question material ===");
  try {
    const chars = await animeCharacters(5114);
    chars.forEach((c) => console.log(`  ${c.name} (role=${c.role}, va=${c.va}, fav=${c.favorites})`));
  } catch (e) { console.log(`  chars(5114): ERROR ${e.response?.status || e.message.slice(0, 60)}`); }
  await pace();

  console.log("=== EDGE: rate-limit behavior (3 rapid) ===");
  for (let i = 0; i < 3; i++) {
    try { const r = await client.get("/anime", { params: { q: "test" + i, limit: 1 } }); console.log(`  rapid#${i}: OK ${r.status}`); }
    catch (e) { console.log(`  rapid#${i}: ${e.response?.status || e.code}`); }
    await sleep(150);
  }
  console.log("=== EDGE: bogus id / deleted id ===");
  try { await client.get("/anime/999999999/full"); console.log("  bogus id: 200?!"); }
  catch (e) { console.log(`  bogus id: ${e.response?.status} ${JSON.stringify(e.response?.data || {}).slice(0, 80)}`); }
  await pace();
  console.log("=== EDGE: retry after 504 ===");
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try { const r = await client.get("/anime", { params: { q: "attack on titan", limit: 1 } }); console.log(`  attempt#${i + 1}: OK ${r.status} top=${r.data.data[0].title}`); ok = true; }
    catch (e) { console.log(`  attempt#${i + 1}: ${e.response?.status || e.code}`); await sleep(2500); }
  }
  console.log("\nJIKAN RESEARCH DONE");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
