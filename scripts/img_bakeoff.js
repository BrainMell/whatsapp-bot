// img_bakeoff.js v2 — rate-limit-aware empirical bake-off for the quiz image
// system replacement. ONE AniList cast query per franchise (shared by both
// candidate sources), 429 backoff, error bodies logged, spacing between
// franchises. Sources compared:
//   A) AniList character-native portraits (image.large / extraLarge)
//   B) Fandom wiki pageimage thumbnail (current prod primary) — baseline
//   C) Jikan probe (2 calls total, known 504)
// Usage: node scripts/img_bakeoff.js [sleepBetweenFranchiseMs]
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { inspectImageBuffer } = require(path.join(__dirname, "..", "core", "utils", "imageGate"));

const SLEEP = parseInt(process.argv[2] || "3000", 10);
const http = axios.create({ timeout: 20000, family: 4, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" } });

const FRANCHISES = [
  { slug: "rezero", al: "Re:Zero", fandom: "rezero" },
  { slug: "naruto", al: "Naruto", fandom: "naruto" },
  { slug: "onepiece", al: "One Piece", fandom: "onepiece" },
  { slug: "attackontitan", al: "Attack on Titan", fandom: "attackontitan" },
  { slug: "jujutsu-kaisen", al: "Jujutsu Kaisen", fandom: "jujutsu-kaisen" },
  { slug: "dragonball", al: "Dragon Ball", fandom: "dragonball" },
  { slug: "steins-gate", al: "Steins;Gate", fandom: "steins-gate" },
  { slug: "spyxfamily", al: "Spy x Family", fandom: "spy-x-family" },
  { slug: "chainsawman", al: "Chainsaw Man", fandom: "chainsaw-man" },
  { slug: "berserk", al: "Berserk", fandom: "berserk" },
  { slug: "evangelion", al: "Neon Genesis Evangelion", fandom: "evangelion" },
  { slug: "solo-leveling", al: "Solo Leveling", fandom: "solo-leveling" },
];

const CAST_Q = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id title { romaji }
    characters(perPage: 50, sort: [ROLE, FAVOURITES_DESC]) {
      edges { role node { id name { full } favourites image { large } } }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// one cast query per franchise, 429-aware (up to 3 tries, exponential backoff)
async function getCast(f) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      const r = await http.post("https://graphql.anilist.co", { query: CAST_Q, variables: { search: f.al } });
      return { cast: r.data?.data?.Media?.characters?.edges || [], id: r.data?.data?.Media?.id, ms: Date.now() - t0 };
    } catch (e) {
      const status = e.response?.status;
      const body = typeof e.response?.data === "string" ? e.response.data.slice(0, 160) : JSON.stringify(e.response?.data || {}).slice(0, 160);
      console.log(`  [${f.slug}] cast try${attempt} status=${status} ms=${Date.now() - t0} body=${body}`);
      if (status === 429 && attempt < 3) { await sleep(attempt * 15000); continue; }
      if (attempt === 3) return { cast: [], error: `${status || "ERR"}: ${body}` };
      await sleep(2000);
    }
  }
  return { cast: [], error: "unreachable" };
}

async function dl(url) {
  const r = await http.get(url, { responseType: "arraybuffer", maxContentLength: 8 * 1024 * 1024 });
  return Buffer.from(r.data);
}
const ms = (t0) => Date.now() - t0;
const pick5 = (edges) => {
  const withImg = edges.filter((e) => e.node?.image && e.node.name?.full);
  const mains = withImg.filter((e) => e.role === "MAIN");
  const pool = mains.length >= 5 ? mains : withImg;
  const idx = [0, Math.floor(pool.length * 0.25), Math.floor(pool.length * 0.5), Math.floor(pool.length * 0.75), pool.length - 1];
  return [...new Set(idx)].map((i) => pool[i]).filter(Boolean).slice(0, 5);
};

async function gateOne(label, url) {
  const t1 = Date.now();
  try {
    const buf = await dl(url);
    const gate = await inspectImageBuffer(buf, { minW: 200, minH: 200, label }).catch((e2) => ({ ok: false, reason: `gate:${String(e2.message).slice(0, 30)}` }));
    return { ok: !!gate.ok, ms: ms(t1), kb: Math.round(buf.length / 1024), w: gate.width || 0, h: gate.height || 0, why: gate.reason };
  } catch (err) {
    return { ok: false, ms: ms(t1), why: `dl:${String(err.message).slice(0, 40)}` };
  }
}

(async () => {
  const out = [];
  for (const f of FRANCHISES) {
    console.log(`\n▶ ${f.slug} (${f.al})`);
    const { cast, id, ms: castMs, error } = await getCast(f);
    if (error || !cast.length) { console.log(`  cast FAILED: ${error}`); out.push({ franchise: f.slug, castError: error }); await sleep(SLEEP); continue; }
    const picks = pick5(cast);
    console.log(`  cast ok: media=${id} edges=${cast.length} castMs=${castMs} picks=${picks.map((p) => p.node.name.full).join(" | ")}`);
    const entry = { franchise: f.slug, castMs, castSize: cast.length, anilist: [], fandom: [] };

    for (const p of picks) {
      const node = p.node;
      // A: AniList CDN portraits (CharacterImage only exposes `large`)
      for (const kind of ["large"]) {
        const url = node.image?.[kind];
        if (!url) { entry.anilist.push({ name: node.name.full, kind, ok: false, why: "no-url" }); continue; }
        const r = await gateOne(`al:${f.slug}:${node.name.full}`.slice(0, 60), url);
        entry.anilist.push({ name: node.name.full, kind, ...r });
      }
      // B: Fandom thumbnail for the same subject
      try {
        const api = await http.get(`https://${f.fandom}.fandom.com/api.php`, {
          params: { action: "query", titles: node.name.full, prop: "pageimages", piprop: "thumbnail", pithumbsize: 650, format: "json", redirects: 1 },
        });
        const page = Object.values(api.data?.query?.pages || {})[0];
        const thumb = page?.thumbnail?.source;
        if (!thumb) entry.fandom.push({ name: node.name.full, ok: false, why: "no-thumbnail" });
        else { const r = await gateOne(`fd:${f.slug}:${node.name.full}`.slice(0, 60), thumb); entry.fandom.push({ name: node.name.full, ...r }); }
      } catch (err) {
        entry.fandom.push({ name: node.name.full, ok: false, why: `err:${String(err.message).slice(0, 40)}` });
      }
      await sleep(400);
    }
    out.push(entry);
    await sleep(SLEEP);
  }

  // Jikan single probe
  console.log("\n▶ jikan probe");
  let jikan = { status: "?" };
  try { const r = await http.get("https://api.jikan.moe/v4/characters", { params: { q: "naruto", limit: 1 } }); jikan = { status: r.status, rows: (r.data?.data || []).length }; }
  catch (e) { jikan = { status: e.response?.status || "ERR", why: String(e.message).slice(0, 60) }; }

  // summary
  const stats = (rows) => {
    const ok = rows.filter((r) => r.ok);
    const px = ok.map((r) => (r.w || 0) * (r.h || 0)).sort((a, b) => a - b);
    const mss = ok.map((r) => r.ms || 0).sort((a, b) => a - b);
    const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : 0);
    return `${ok.length}/${rows.length} ok  medMs=${med(mss)}  medPx=${med(px)}  fails=${JSON.stringify(rows.filter((r) => !r.ok).reduce((acc, r) => { const k = (r.why || "?").split(":")[0]; acc[k] = (acc[k] || 0) + 1; return acc; }, {}))}`;
  };
  console.log("\n══════ SUMMARY ══════");
  const alRows = out.flatMap((o) => o.anilist || []);
  const alLg = alRows.filter((r) => r.kind === "large");
  const alXl = alRows.filter((r) => r.kind === "extraLarge");
  const fdRows = out.flatMap((o) => o.fandom || []);
  console.log(`AniList large      : ${stats(alLg)}`);
  console.log(`AniList extraLarge : ${stats(alXl)}`);
  console.log(`Fandom thumbnail   : ${stats(fdRows)}`);
  console.log(`Jikan probe        : ${JSON.stringify(jikan)}`);

  fs.writeFileSync(path.join(__dirname, "img_bakeoff_results.json"), JSON.stringify({ out, jikan }, null, 2));
  console.log("\nresults -> scripts/img_bakeoff_results.json");
})().catch((e) => { console.error("BAKEOFF FATAL", e); process.exit(1); });
