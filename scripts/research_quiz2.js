// research_quiz2.js - AniList GraphQL experiments (candidate primary for quiz title resolution)
"use strict";
const axios = require("axios");

const AL = axios.create({ baseURL: "https://graphql.anilist.co", timeout: 20000, family: 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await AL.post("", { query, variables });
  return r.data.data;
}

const SEARCH_Q = `
query ($search: String, $limit: Int) {
  Page(page: 1, perPage: $limit) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id idMal
      title { romaji english native }
      synonyms
      episodes averageScore popularity seasonYear
      format status
      genres
      studios(isMain: true) { nodes { name } }
      description(asHtml: false)
    }
  }
}`;

const CHARS_Q = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    title { romaji english }
    characters(perPage: 10, sort: [ROLE, FAVOURITES_DESC]) {
      edges { role voiceActors(language: JAPANESE) { name { full } } node { name { full } favourites } }
    }
  }
}`;

(async () => {
  console.log("=== ANILIST SEARCH ===");
  for (const [q, note] of [["Fullmetal Alchemist Brotherhood", "exact-ish"], ["fmab", "abbreviation"], ["naruto", "franchise"], ["sword art online", "multi-season"], ["Xyzzy Nonexistent Anime QQQ", "nonexistent"], ["evangelion", "vague"]]) {
    try {
      const d = await gql(SEARCH_Q, { search: q, limit: 5 });
      const med = d.Page.media || [];
      console.log(`  "${q}" (${note}): ${med.length} hits`);
      med.slice(0, 4).forEach((m) => console.log(`    #${m.id} (mal ${m.idMal}) "${m.title.romaji}" eng="${m.title.english}" ${m.format} eps=${m.episodes} score=${m.averageScore} pop=${m.popularity} y=${m.seasonYear} studio=${(m.studios.nodes[0] || {}).name || "?"} syn=${(m.description || "").length}ch synonyms=${(m.synonyms || []).length}`));
    } catch (e) {
      console.log(`  "${q}": ERROR ${e.response?.status || e.code} ${JSON.stringify(e.response?.data?.errors || "").slice(0, 120)}`);
    }
    await sleep(1300); // AniList: 90 req/min -> pace >700ms
  }

  console.log("=== ANILIST CHARACTERS (ground truth for questions) ===");
  try {
    const d = await gql(CHARS_Q, { id: 5114 });
    const edges = d.Media.characters.edges || [];
    console.log(`  "${d.Media.title.romaji}" characters: ${edges.length}`);
    edges.slice(0, 8).forEach((e) => console.log(`    ${e.node.name.full} role=${e.role} fav=${e.node.favourites} va=${e.voiceActors[0] ? e.voiceActors[0].name.full : "-"}`));
  } catch (e) { console.log(`  chars: ERROR ${e.response?.status || e.message.slice(0, 80)}`); }
  await sleep(1300);

  console.log("=== EDGE: rate limit probe (5 rapid) ===");
  for (let i = 0; i < 5; i++) {
    try { await gql(SEARCH_Q, { search: "test" + i, limit: 1 }); console.log(`  rapid#${i}: OK`); }
    catch (e) { console.log(`  rapid#${i}: ${e.response?.status} ${JSON.stringify(e.response?.data?.errors || "").slice(0, 100)}`); }
    await sleep(120);
  }
  console.log("\nANILIST RESEARCH DONE");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
