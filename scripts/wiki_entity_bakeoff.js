// ============================================
// WIKIPEDIA ENTITY IMAGE BAKEOFF (2026-09-30)
// ============================================
// The image system must cover MOVIES + GAMES + TV, not just anime.
// Fandom CDN is Cloudflare-403 from this box (proven again today), so the
// candidate primary source for non-anime franchises is the WIKIPEDIA ENTITY
// GRAPH: canonical article per character -> pageimages thumb ->
// upload.wikimedia.org download -> production imageGate.
//
// This harness measures REAL coverage on Box 1: for every non-anime franchise
// in the quiz RANDOM_POOL, resolve a curated battery of canonical character
// articles, batch-fetch pageimages, download thumbs, pixel-gate with the
// production gate, and report per-franchise verified counts.
//
// Run on Box 1:  node scripts/wiki_entity_bakeoff.js [--gate] [--min 200]
//   --gate   run the production imageGate (default: magic bytes + sharp stats)
// ============================================

const https = require("https");

// ── curated canonical article titles per franchise ──
// (exact titles; the API resolves redirects, so minor variants are fine)
const BATTERY = {
  // ── movies / tv / comics / cartoons ──
  batman: ["Batman", "Joker (character)", "Robin (character)", "Catwoman", "Batgirl", "Nightwing", "Penguin (character)", "Riddler", "Two-Face", "Bane (DC Comics)", "Harley Quinn", "Ra's al Ghul", "Poison Ivy (character)", "Mr. Freeze"],
  marvel: ["Iron Man", "Captain America", "Thor (Marvel Comics)", "Hulk", "Black Widow (Natasha Romanova)", "Spider-Man", "Doctor Strange", "Thanos", "Loki (Marvel Comics)", "Black Panther (character)", "Daredevil (Marvel Comics character)", "Ant-Man (Scott Lang)", "Wolverine"],
  dc: ["Superman", "Wonder Woman", "The Flash", "Green Lantern", "Aquaman", "Cyborg (comics)", "Lex Luthor", "Darkseid", "Green Arrow", "Supergirl", "Shazam (wizard)", "Black Adam"],
  starwars: ["Darth Vader", "Luke Skywalker", "Leia Organa", "Han Solo", "Yoda", "Obi-Wan Kenobi", "Palpatine", "Boba Fett", "R2-D2", "C-3PO", "Chewbacca", "Anakin Skywalker", "Rey (Star Wars)", "Kylo Ren", "Jabba the Hutt"],
  startrek: ["James T. Kirk", "Spock", "Leonard McCoy", "Jean-Luc Picard", "Data (Star Trek)", "William Riker", "Worf", "Kathryn Janeway", "Benjamin Sisko", "Q (Star Trek)", "Seven of Nine", "Deanna Troi"],
  harrypotter: ["Harry Potter", "Hermione Granger", "Ron Weasley", "Albus Dumbledore", "Lord Voldemort", "Severus Snape", "Rubeus Hagrid", "Draco Malfoy", "Sirius Black", "Dobby (Harry Potter)", "Neville Longbottom", "Luna Lovegood", "Bellatrix Lestrange", "Ginny Weasley"],
  lotr: ["Frodo Baggins", "Gandalf", "Aragorn", "Legolas", "Gimli (Middle-earth)", "Gollum", "Samwise Gamgee", "Saruman", "Sauron", "Boromir", "Galadriel", "Elrond", "Éowyn", "Treebeard"],
  avatar: ["Aang", "Katara", "Sokka", "Toph Beifong", "Zuko", "Iroh", "Azula", "Ozai (Avatar: The Last Airbender)", "Korra", "Appa (Avatar: The Last Airbender)"],
  spongebob: ["SpongeBob SquarePants (character)", "Patrick Star", "Squidward Tentacles", "Eugene H. Krabs", "Sandy Cheeks", "Plankton and Karen", "Mrs. Puff", "Pearl Krabs", "Squilliam Fancyson"],
  strangerthings: ["Eleven (Stranger Things)", "Mike Wheeler", "Dustin Henderson", "Will Byers", "Lucas Sinclair", "Jim Hopper (Stranger Things)", "Joyce Byers", "Nancy Wheeler", "Steve Harrington", "Max Mayfield", "Demogorgon (Stranger Things)", "Billy Hargrove"],
  breakingbad: ["Walter White (Breaking Bad)", "Jesse Pinkman", "Skyler White", "Walter White Jr.", "Hank Schrader", "Marie Schrader", "Saul Goodman", "Gus Fring", "Mike Ehrmantraut"],
  gameofthrones: ["Ned Stark", "Jon Snow (character)", "Daenerys Targaryen", "Tyrion Lannister", "Cersei Lannister", "Jaime Lannister", "Arya Stark", "Sansa Stark", "Joffrey Baratheon", "Theon Greyjoy", "Sandor Clegane", "Tywin Lannister", "Brienne of Tarth", "Petyr Baelish"],
  gravityfalls: ["Dipper Pines", "Mabel Pines", "Stan Pines", "Bill Cipher", "Ford Pines", "Soos Ramirez", "Wendy Corduroy", "Pacifica Northwest"],
  adventuretime: ["Finn the Human", "Jake the Dog", "Princess Bubblegum", "Marceline the Vampire Queen", "Ice King", "BMO", "Lady Rainicorn", "Lumpy Space Princess"],
  "steven-universe": ["Steven Universe (character)", "Garnet (Steven Universe)", "Amethyst (Steven Universe)", "Pearl (Steven Universe)", "Connie Maheswaran", "Peridot (Steven Universe)", "Lapis Lazuli (Steven Universe)", "Greg Universe"],
  teentitans: ["Robin (character)", "Starfire (Teen Titans)", "Raven (DC Comics)", "Cyborg (comics)", "Beast Boy", "Terra (comics)", "Deathstroke"],
  ben10: ["Ben Tennyson", "Gwen Tennyson", "Vilgax", "Kevin Levin"],
  // ── games ──
  eldenring: ["Melina (Elden Ring)", "Ranni the Witch", "Malenia, Blade of Miquella", "Radahn", "Godrick the Grafted", "Rya (Elden Ring)", "Blaidd", "Iron Fist Alexander"],
  darksouls: ["Solaire of Astora", "Gwyn, Lord of Cinder", "Chosen Undead", "Artorias the Abysswalker", "Ornstein and Smough", "Gravelord Nito"],
  sekiro: ["Wolf (Sekiro)", "Genichiro Ashina", "Isshin Ashina", "Lady Butterfly"],
  bloodborne: ["Hunter (Bloodborne)", "Gehrman", "Lady Maria", "Micolash, Host of the Nightmare"],
  zelda: ["Link (The Legend of Zelda)", "Princess Zelda", "Ganon", "Navi (The Legend of Zelda)", "Midna", "Sheik", "Impa", "Ghirahim", "Skull Kid", "Princess Ruto"],
  minecraft: ["Steve (Minecraft)", "Creeper (Minecraft)", "Enderman", "Alex (Minecraft)", "Piglin", "Villager (Minecraft)", "Wither", "Ender Dragon"],
  gta: ["Carl Johnson (Grand Theft Auto)", "Niko Bellic", "Trevor Philips", "Michael De Santa", "Franklin Clinton", "Tommy Vercetti"],
  godofwar: ["Kratos (God of War)", "Atreus (God of War)", "Zeus (God of War)", "Baldur (God of War)", "Mimir (God of War)", "Freya (God of War)"],
  witcher: ["Geralt of Rivia", "Yennefer of Vengerberg", "Ciri", "Triss Merigold", "Vesemir", "Emhyr var Emreis", "Eredin Bréacc Glas"],
  finalfantasy: ["Cloud Strife", "Sephiroth (Final Fantasy)", "Tifa Lockhart", "Aerith Gainsborough", "Squall Leonhart", "Zidane Tribal", "Yuna (Final Fantasy)", "Lightning (Final Fantasy)", "Noctis Lucis Caelum", "Kefka Palazzo"],
  pokemon: ["Pikachu", "Charizard", "Bulbasaur", "Squirtle", "Mewtwo", "Mew (Pokémon)", "Eevee", "Snorlax", "Gengar", "Lucario", "Gyarados", "Jigglypuff", "Psyduck", "Greninja", "Mimikyu"],
  "genshin-impact": ["Traveler (Genshin Impact)", "Paimon (Genshin Impact)", "Zhongli", "Venti (Genshin Impact)", "Raiden Shogun"],
  leagueoflegends: ["Jinx (League of Legends)", "Vi (League of Legends)", "Caitlyn (League of Legends)", "Ahri", "Ekko", "Viego", "Lux (League of Legends)"],
  cyberpunk: ["Johnny Silverhand", "V (Cyberpunk 2077)", "Adam Smasher", "Alt Cunningham"],
  fortnite: ["Jonesy (Fortnite)", "Peely"],
  "among-us": ["Crewmate (Among Us)"],
};

// ── tiny fetch helpers (no bot deps; keep the harness standalone) ──
const UA = "WAQuizBot/1.0 (https://example.org; quiz image verification) axios-like";

// search-fallback qualifier per franchise (only used when the exact article
// title misses) - keeps the search entity-anchored to THIS franchise
const FRANCHISE_QUALIFIER = {
  batman: "Batman", marvel: "Marvel", dc: "DC Comics", starwars: "Star Wars",
  startrek: "Star Trek", harrypotter: "Harry Potter", lotr: "Lord of the Rings",
  avatar: "Avatar The Last Airbender", spongebob: "SpongeBob",
  strangerthings: "Stranger Things", breakingbad: "Breaking Bad",
  gameofthrones: "Game of Thrones", gravityfalls: "Gravity Falls",
  adventuretime: "Adventure Time", "steven-universe": "Steven Universe",
  teentitans: "Teen Titans", ben10: "Ben 10", eldenring: "Elden Ring",
  darksouls: "Dark Souls", sekiro: "Sekiro", bloodborne: "Bloodborne",
  zelda: "The Legend of Zelda", minecraft: "Minecraft",
  gta: "Grand Theft Auto", godofwar: "God of War", witcher: "The Witcher",
  finalfantasy: "Final Fantasy", pokemon: "Pokemon",
  "genshin-impact": "Genshin Impact", leagueoflegends: "League of Legends",
  cyberpunk: "Cyberpunk 2077", fortnite: "Fortnite", "among-us": "Among Us",
};

function httpGet(url, { asBuffer = false, headers = {}, retries = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const u = new URL(url);
      const req = https.get(u, {
        headers: { "User-Agent": UA, Accept: "*/*", ...headers },
        timeout: 20000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, u).toString();
          res.resume();
          httpGet(next, { asBuffer, headers, retries: 0 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode !== 200) {
            if ((res.statusCode === 429 || res.statusCode >= 500) && n < retries) {
              return setTimeout(() => attempt(n + 1), 1500 * (n + 1) + Math.random() * 600);
            }
            return reject(new Error(`HTTP ${res.statusCode} (${buf.length}b)`));
          }
          resolve(asBuffer ? buf : JSON.parse(buf.toString("utf8")));
        });
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", (e) => { if (n < retries) setTimeout(() => attempt(n + 1), 1200 * (n + 1)); else reject(e); });
    };
    attempt(0);
  });
}

function magicOk(b) {
  return (b[0] === 0xff && b[1] === 0xd8)
    || (b[0] === 0x89 && b[1] === 0x50)
    || (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP");
}

// strip utm junk; use the API-returned URL AS-IS otherwise (it is already a
// valid thumb or a small original - self-constructed thumb paths 400/404)
function cleanThumbUrl(src) {
  if (!src) return null;
  return src.split("?")[0];
}

// paced downloader: upload.wikimedia 429-throttles bursts.
// max 2 in flight + min gap, generous backoff on 429/5xx.
let _inflight = 0;
const _waiters = [];
let _lastDl = 0;
let _lastApi = 0;
function _slot() {
  if (_inflight < 2) { _inflight++; return Promise.resolve(); }
  return new Promise((r) => _waiters.push(r));
}
function _free() { _inflight--; const w = _waiters.shift(); if (w) { _inflight++; w(); } }
async function dlImage(url) {
  await _slot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const gap = Date.now() - _lastDl;
      if (gap < 220) await new Promise((r) => setTimeout(r, 220 - gap));
      _lastDl = Date.now();
      try {
        return await httpGet(url, { asBuffer: true });
      } catch (e) {
        const msg = e.message || "";
        if (/HTTP 429|HTTP 5/.test(msg) && attempt < 3) {
          await new Promise((r) => setTimeout(r, [1200, 2500, 4000][attempt] + Math.random() * 500));
          continue;
        }
        throw e;
      }
    }
    throw new Error("unreachable");
  } finally { _free(); }
}

async function pageimagesBatch(titles) {
  // pace the API itself: >=350ms between batch calls + 429 retry inside httpGet
  const gap = Date.now() - _lastApi;
  if (gap < 350) await new Promise((r) => setTimeout(r, 350 - gap));
  _lastApi = Date.now();
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "pageimages|pageprops", ppprop: "disambiguation",
    piprop: "thumbnail", pithumbsize: "640",
    pilicense: "any", // 💡 copyrighted character art (fair use) - default 'free' hides it
    titles: titles.join("|"),
  });
  const data = await httpGet(`https://en.wikipedia.org/w/api.php?${params}`);
  const byTitle = new Map();
  const disambig = new Set();
  for (const p of data?.query?.pages || []) {
    byTitle.set(p.title, p.thumbnail?.source || null);
    if (p.pageprops?.disambiguation) disambig.add(p.title);
  }
  const redirectMap = new Map();
  for (const r of data?.query?.redirects || []) redirectMap.set(r.from, r.to);
  return { byTitle, redirectMap, disambig };
}

// fallback: resolve ONE title via Wikipedia article search (entity-anchored:
// name + optional franchise qualifier -> canonical article, still page-image)
// returns { url, article } so callers can apply an identity-consistency check
async function searchResolve(title, qualifier) {
  const q = [title, qualifier].filter(Boolean).join(" ");
  const gap = Date.now() - _lastApi;
  if (gap < 350) await new Promise((r) => setTimeout(r, 350 - gap));
  _lastApi = Date.now();
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "pageimages", piprop: "thumbnail", pithumbsize: "640", pilicense: "any",
    generator: "search", gsrsearch: q, gsrnamespace: "0", gsrlimit: "3",
  });
  try {
    const data = await httpGet(`https://en.wikipedia.org/w/api.php?${params}`);
    const pages = (data?.query?.pages || []).filter((p) => p.thumbnail?.source && !p.pageprops?.disambiguation);
    pages.sort((a, b) => (a.index || 99) - (b.index || 99));
    const top = pages[0];
    return top ? { url: top.thumbnail.source, article: top.title } : null;
  } catch { return null; }
}

// IDENTITY GATE for search-resolved images: the hit is only trusted when the
// character's name actually surfaces in the article title or image filename.
// (Searching "Melina Elden Ring" may land on the franchise article whose lead
// image is BOX ART - showing that for a Melina question would be wrong.)
function identityOk(name, article, imgUrl) {
  const toks = name.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
  if (!toks.length) return true;
  const hay = `${article || ""} ${decodeURIComponent(imgUrl || "").split("/").pop()}`.toLowerCase().replace(/_/g, " ");
  return toks.some((t) => hay.includes(t));
}
const STOP = new Set(["the", "character", "game", "movie", "film", "tv", "series", "and", "from"]);

async function gateBytes(buf, useGate, min) {
  if (!buf || buf.length < 1200 || !magicOk(buf)) return { ok: false, reason: "magic/trunc" };
  if (!useGate) return { ok: true, reason: "magic-only" };
  try {
    const imageGate = require("/home/ubuntu/whatsapp-bot/core/utils/imageGate");
    const g = await imageGate.inspectImageBuffer(buf, { minW: min, minH: min, label: "bakeoff" });
    return g.ok ? { ok: true } : { ok: false, reason: g.reason || "gate-reject" };
  } catch (e) {
    return { ok: false, reason: `gate-crash:${e.message}` };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const useGate = !args.includes("--no-gate");
  const min = parseInt((args.find((a) => a.startsWith("--min")) || "").split("=")[1] || "150", 10) || 150;

  const totals = { franchises: 0, attempted: 0, found: 0, gated: 0 };
  const report = [];
  const searchAudit = [];
  const t0 = Date.now();

  for (const [fr, titles] of Object.entries(BATTERY)) {
    totals.franchises++;
    const res = { fr, chars: titles.length, resolved: 0, downloaded: 0, gated: 0, fails: [] };
    // batch in chunks of 20 titles (API limit 50; keep small)
    const byTitle = new Map();
    const redirectMap = new Map();
    let disambig = new Set();
    for (let i = 0; i < titles.length; i += 20) {
      const chunk = titles.slice(i, i + 20);
      try {
        const r = await pageimagesBatch(chunk);
        for (const [k, v] of r.byTitle) byTitle.set(k, v);
        for (const [k, v] of r.redirectMap) redirectMap.set(k, v);
        disambig = new Set([...disambig, ...r.disambig]);
      } catch (e) {
        res.fails.push(`api:${e.message}`);
      }
    }
    // download + gate thumbs, limited concurrency. Search fallback only for
    // misses (disambig pages / no image) - entity-anchored, not keyword hunt.
    const qualifier = FRANCHISE_QUALIFIER[fr] || null;
    const dlQueue = [];
    for (const t of titles) {
      const resolved = redirectMap.get(t) || t;
      let src = byTitle.has(t) ? byTitle.get(t) : byTitle.get(resolved);
      if (!src) {
        // article missing OR exists without a usable pageimage (incl. disambig
        // collisions) -> one entity-anchored search fallback (name+franchise)
        const sr = await searchResolve(t.replace(/\s*\([^)]*\)\s*$/, ""), qualifier).catch(() => null);
        if (sr && identityOk(t, sr.article, sr.url)) {
          src = sr.url;
          res.fails.push(`${t}:via-search[${sr.article}]`);
          searchAudit.push(`${fr}\t${t}\t->\t${sr.article}\t${decodeURIComponent(sr.url).split("/").pop()}`);
        } else if (sr) {
          res.fails.push(`${t}:identity-reject[${sr.article}]`);
        }
      }
      if (!src) { res.fails.push(`${t}:no-article-image`); continue; }
      res.resolved++;
      const url = cleanThumbUrl(src);
      dlQueue.push((async () => {
        try {
          const buf = await dlImage(url);
          res.downloaded++;
          const g = await gateBytes(buf, useGate, min);
          if (g.ok) res.gated++;
          else res.fails.push(`${t}:gate:${g.reason}`);
        } catch (e) {
          res.fails.push(`${t}:dl:${e.message.slice(0, 40)}`);
        }
      })());
    }
    await Promise.all(dlQueue);
    totals.attempted += titles.length;
    totals.found += res.resolved;
    totals.gated += res.gated;
    report.push(res);
    const pct = titles.length ? Math.round((res.gated / titles.length) * 100) : 0;
    console.log(`${fr.padEnd(16)} chars=${String(titles.length).padStart(2)} resolved=${String(res.resolved).padStart(2)} gated=${String(res.gated).padStart(2)} (${String(pct).padStart(3)}%)`);
    if (res.fails.length && process.argv.includes("-v")) res.fails.forEach((f) => console.log(`    ! ${f}`));
  }

  console.log("\n==== TOTALS ====");
  console.log(`franchises=${totals.franchises} chars=${totals.attempted} resolved=${totals.found} gated=${totals.gated}`);
  console.log(`gate=${useGate ? "production imageGate" : "magic-bytes"} min=${min} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const full = report.filter((r) => r.gated >= 6).length;
  const some = report.filter((r) => r.gated >= 3 && r.gated < 6).length;
  const poor = report.filter((r) => r.gated < 3).length;
  console.log(`strong (>=6 imgs): ${full} | weak (3-5): ${some} | unusable (<3): ${poor}`);
  if (searchAudit.length) {
    console.log("\n==== SEARCH-RESOLVED IDENTITY AUDIT ====");
    searchAudit.forEach((l) => console.log("  " + l));
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
