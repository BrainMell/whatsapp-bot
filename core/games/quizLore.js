// ============================================
// QUIZ LORE ENGINE (2026-09-25 overhaul)
// Fandom/MediaWiki-powered lore retrieval for .j quiz.
//
// Design (per owner spec):
//  - Questions test the SHOW/GAME/COMIC's story, characters, lore, events,
//    abilities, cosmology and worldbuilding - NOT production trivia.
//  - Primary source: the franchise's Fandom wiki via the MediaWiki API,
//    targeted SECTION retrieval (never whole-page dumps).
//  - Weighted domains: 45% plot, 35% characters, 15% cosmology/powerscaling,
//    5% production. -s/--section forces 100% of one domain.
//  - Images/audio are NOT separate categories: they spawn dynamically from
//    whatever lore section was chosen, only when a REAL asset exists.
//  - Character popularity bucketing (easy = famous, hard = obscure).
//  - RAG: the model receives ONLY the retrieved section, hard-capped under
//    800 input tokens. Answers must be supported by the source.
// ============================================

const axios = require("axios");
const crypto = require("crypto");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhatsAppQuizBot/1.0";
const _http = axios.create({
  timeout: 15000,
  family: 4,
  headers: { "User-Agent": UA, Accept: "application/json" },
});

// ── token budget (hard cap) ──
// ~4 chars per token for English wiki prose; context + instructions + system
// must stay under 800. 2400 chars context ≈ 600 tok leaves ~200 for framing.
const CTX_CHAR_LIMIT = 2400;

// ── domain weights (spec: 45/35/15/5) ──
const DOMAIN_WEIGHTS = [
  { domain: "plot", weight: 45 },
  { domain: "characters", weight: 35 },
  { domain: "cosmology", weight: 15 },
  { domain: "production", weight: 5 },
];

const SECTION_ALIASES = {
  plot: "plot", story: "plot", events: "plot", event: "plot", lore: "plot",
  characters: "characters", character: "characters", char: "characters", chars: "characters",
  cosmology: "cosmology", world: "cosmology", worldbuilding: "cosmology", world_building: "cosmology", realms: "cosmology",
  powerscaling: "powerscaling", scaling: "powerscaling", tiering: "powerscaling", tiers: "powerscaling", vsbattles: "powerscaling",
  production: "production", meta: "production", trivia: "production", studios: "production",
};

// curated franchise -> fandom slug map (the common requests resolve instantly)
const KNOWN_WIKIS = {
  "re:zero": "rezero", rezero: "rezero", "re zero": "rezero", "starting life in another world": "rezero",
  "dragon ball": "dragonball", dbz: "dragonball", "dragon ball z": "dragonball", "dragon ball super": "dragonball",
  naruto: "naruto", "naruto shippuden": "naruto", boruto: "naruto",
  "one piece": "onepiece", op: "onepiece",
  "attack on titan": "attackontitan", aot: "attackontitan", shingeki: "attackontitan",
  "jujutsu kaisen": "jujutsu-kaisen", jjk: "jujutsu-kaisen",
  "demon slayer": "kimetsu-no-yaiba", "kimetsu no yaiba": "kimetsu-no-yaiba",
  "fullmetal alchemist": "fma", fmab: "fma", "fullmetal alchemist brotherhood": "fma",
  "my hero academia": "myheroacademia", mha: "myheroacademia", boku: "myheroacademia",
  "death note": "deathnote", "spy x family": "spyxfamily", spychfamily: "spyxfamily",
  "chainsaw man": "chainsawman", "bleach": "bleach", "hunter x hunter": "hunterxhunter", hxh: "hunterxhunter",
  "sword art online": "swordartonline", sao: "swordartonline", "steins gate": "steins-gate",
  "code geass": "codegeass", "tokyo ghoul": "tokyoghoul", "vinland saga": "vinlandsaga",
  "mob psycho": "mob-psycho-100", "mob psycho 100": "mob-psycho-100", "one punch man": "onepunchman", opm: "onepunchman",
  "solo leveling": "solo-leveling", "mushoku tensei": "mushoku-tensei", "made in abyss": "madeinabyss",
  "black clover": "blackclover", "dr stone": "dr-stone", "fire force": "fire-force", "konosuba": "konosuba",
  "seven deadly sins": "nanatsu-no-taizai", "fairy tail": "fairytail",
  batman: "batman", "bruce wayne": "batman", joker: "batman",
  "elden ring": "eldenring", eldenring: "eldenring", nightreign: "eldenring",
  "dark souls": "darksouls", "sekiro": "sekiro", "bloodborne": "bloodborne",
  minecraft: "minecraft", "gta": "gta", "grand theft auto": "gta",
  "harry potter": "harrypotter", hogwarts: "harrypotter",
  "lord of the rings": "lotr", lotr: "lotr", "the hobbit": "lotr",
  "star wars": "starwars", "star trek": "startrek",
  marvel: "marvel", "avengers": "marvel", "spider-man": "marvel", spiderman: "marvel",
  dc: "dc", "superman": "dc", "wonder woman": "dc",
  "god of war": "godofwar", zelda: "zelda", "breath of the wild": "zelda", "tears of the kingdom": "zelda",
  "final fantasy": "finalfantasy", "final fantasy vii": "finalfantasy", "ff7": "finalfantasy",
  pokemon: "pokemon", "pokémon": "pokemon", "genshin impact": "gensin-impact", genshin: "gensin-impact",
  "league of legends": "leagueoflegends", lol: "leagueoflegends", "world of warcraft": "wowwiki", wow: "wowwiki",
  "attack on titan game": "attackontitan", fortnite: "fortnite", "among us": "among-us",
  "jujutsu": "jujutsu-kaisen", "berserk": "berserk", "vagabond": "vagabond", "evangelion": "evangelion",
  "neon genesis evangelion": "evangelion", "cowboy bebop": "cowboybebop", "cyberpunk": "cyberpunk",
  "the witcher": "witcher", witcher: "witcher", "cyberpunk 2077": "cyberpunk",
  "hajime no ippo": "hajimenoippo", "kaiju no 8": "kaiju-no-8", "dandadan": "dandadan",
  // western cartoons / TV / movies (P22): multi-series continuities must
  // resolve to ONE wiki so reboots don't blend (ben10 wiki covers all series)
  "ben 10": "ben10", ben10: "ben10", "ben ten": "ben10", "ben 10 alien force": "ben10", "ben 10 omniverse": "ben10",
  "spongebob": "spongebob", "spongebob squarepants": "spongebob",
  "avatar": "avatar", "avatar the last airbender": "avatar", "korra": "avatar",
  "teen titans": "teentitans", "adventure time": "adventuretime", "regular show": "regularshow",
  "gravity falls": "gravityfalls", "steven universe": "steven-universe", "amphibia": "amphibia",
  "the owl house": "the-owl-house", "phineas and ferb": "phineasandferb", "kim possible": "kimpossible",
  "danny phantom": "dannyphantom", "fairly oddparents": "fairlyoddparents", "jimmy neutron": "jimmyneutron",
  "star wars": "starwars", "marvel cinematic universe": "marvelcinematicuniverse", "mcu": "marvelcinematicuniverse",
  "inception": "inception", "interstellar": "interstellar", "the dark knight": "batman", "oppenheimer": "oppenheimer",
  "stranger things": "strangerthings", "breaking bad": "breakingbad", "game of thrones": "gameofthrones",
};

// pages/sections that are never lore (spec section 3 list + common wiki noise)
const JUNK_SECTION_RE = /^(gallery|references?|notes?|external links?|navigation|site navigation|see also|trivia|appearance[s]?|appearances|credits|sources|quotes|merchandise|media|site nav|links|categories|footnotes|citation needed|navboxes|in other media|criticism|influences|cultural impact|legacy|conception and creation|creation and conception|creation|development|production|release|reception|promotion|music|voice cast|cast|voice actors|english cast|staff|episodes?|chapters?|volumes?|anime|manga|video games?|live action|films?|adaptations?|episode previews?|previews?|next episode|openings?|endings?|eyecatch(er)?s?|theme songs?|soundtracks?|polls?|fan art|awards?)/i;
// lore-friendly section names, preferred for plot/characters
const LORE_SECTION_HINTS = /^(history|plot|story|synopsis|biography|background|past|personality|abilities?|powers? and abilities|skills?|relationships?|backstory|character|overview|role|summary|profile|equipment|authorities?|magic|techniques?| feats?|conflicts?|battles?|wars?|events?|arc[sd]?|description|nature|characteristics?|physiology|anatomy|society|culture|government|military|economy|geography|religion|species|races?|factions?|organizations?|terminology|concept)$/i;

// ════════════════════════════════════════════
// LOW-LEVEL MEDIAWIKI CLIENT (with per-wiki TTL cache)
// ════════════════════════════════════════════

const _wikiCache = new Map(); // url -> { ts, data }
let _wikiApiOverride = null; // test/QA hook
const WIKI_CACHE_TTL = 10 * 60 * 1000;

async function wikiApi(slug, params) {
  // test hook: QA harnesses stub the network layer here (null = real path)
  if (_wikiApiOverride) return _wikiApiOverride(slug, params);
  const qs = new URLSearchParams({ format: "json", ...params }).toString();
  const url = `https://${slug}.fandom.com/api.php?${qs}`;
  const hit = _wikiCache.get(url);
  if (hit && Date.now() - hit.ts < WIKI_CACHE_TTL) return hit.data;
  const r = await _http.get(url);
  const data = r.data;
  if (data && data.error) throw new Error(`wiki api: ${data.error.code}`);
  _wikiCache.set(url, { ts: Date.now(), data });
  if (_wikiCache.size > 400) {
    const first = _wikiCache.keys().next().value;
    _wikiCache.delete(first);
  }
  return data;
}

// ── wiki resolution ──
function slugify(t) {
  return String(t || "").toLowerCase().trim()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

async function wikiExists(slug) {
  try {
    await wikiApi(slug, { action: "query", meta: "siteinfo", siprop: "sitename" });
    return true;
  } catch {
    return false;
  }
}

// resolve a user-typed franchise title to a fandom wiki slug
async function resolveWiki(title) {
  const norm = slugify(title);
  if (!norm) return null;
  // 1. curated map (exact + prefix)
  if (KNOWN_WIKIS[norm]) return KNOWN_WIKIS[norm];
  for (const [k, v] of Object.entries(KNOWN_WIKIS)) {
    if (norm.length >= 4 && (norm.startsWith(k) || k.startsWith(norm))) return v;
  }
  // 2. slug guesses, longest first
  const guesses = [...new Set([
    norm.replace(/\s+/g, ""),
    norm.replace(/\s+/g, "-"),
    norm.split(" ")[0],
    norm.replace(/[^a-z0-9]/g, ""),
  ])].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const g of guesses) {
    if (g.length < 3) continue;
    if (await wikiExists(g)) return g;
  }
  return null;
}

// ════════════════════════════════════════════
// WIKITEXT CLEANING (nested-template safe)
// ════════════════════════════════════════════

function cleanWikitext(wt) {
  let s = String(wt || "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<ref[^>]*\/>/gi, " ");
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ");
  // tables (nested-safe: innermost first)
  let prev;
  do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, " "); } while (s !== prev);
  do { prev = s; s = s.replace(/\{\|[^{}]*?\|\}/g, " "); } while (s !== prev);
  s = s.replace(/<[^>]+>/g, " ");
  // wiki links [[a|b]] -> b, [[a]] -> a
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");
  // external links [url text] -> text
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/\S+\]/g, " ");
  s = s.replace(/'''?/g, "");
  s = s.replace(/^=+\s*/gm, "").replace(/\s*=+$/gm, "");
  s = s.replace(/^[:#*]{1,3}\s*/gm, "");
  s = s.replace(/^[-]{4,}$/gm, " ");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#039;|&#39;/g, "'").replace(/&mdash;/g, "-");
  s = s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !/^[|}!]/.test(l)).join(" ");
  return s.replace(/\s{2,}/g, " ").trim();
}

function fitContext(text, limit = CTX_CHAR_LIMIT) {
  const s = String(text || "");
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > limit * 0.6 ? cut.slice(0, lastStop + 1) : cut) + " …";
}

function estTokens(s) {
  return Math.ceil(String(s || "").length / 4);
}

// ════════════════════════════════════════════
// SECTION RETRIEVAL
// ════════════════════════════════════════════

function filterSections(sections, domain) {
  // production questions WANT development/production/release sections
  const junkRe = domain === "production" ? JUNK_SECTION_RE : JUNK_SECTION_RE;
  void junkRe;
  return (sections || [])
    .filter((s) => s && Number(s.index) > 0 && s.line)
    .map((s) => ({ ...s, title: String(s.line).replace(/<[^>]+>/g, "").trim() }))
    .filter((s) => {
      const t = s.title.toLowerCase();
      if (domain === "production") {
        // keep production-ish, drop pure lore noise like huge subsections of plot
        return /^(development|production|creation|conception|release|reception|background|writing|design|production process|inspiration|publication|broadcast|distribution|voice cast|cast|music|development and production)/i.test(t);
      }
      if (domain === "characters") {
        if (JUNK_SECTION_RE.test(t)) return false;
        return /^(history|plot|story|biography|background|past|personality|abilities?|powers? and abilities|skills?|relationships?|backstory|equipment|authorities?|magic|techniques?|appearance and personality|character overview|summary|profile)/i.test(t) || LORE_SECTION_HINTS.test(t);
      }
      if (domain === "cosmology" || domain === "powerscaling") {
        if (JUNK_SECTION_RE.test(t)) return false;
        return true; // cosmology pages are nearly all lore - keep everything
      }
      // plot: keep broad lore sections
      if (JUNK_SECTION_RE.test(t)) return false;
      return true;
    });
}

// pick a lore-rich page for a domain via wiki search
async function findPageForDomain(slug, franchiseTitle, domain, difficulty) {
  // plot easy/medium: the franchise's MAIN page synopsis/history is the right
  // pool (search alone surfaces spin-offs like "Re:IF" - a hard-only deep cut)
  if (domain === "plot" && difficulty !== "hard") {
    for (const main of [franchiseTitle]) {
      try {
        const secs = await wikiApi(slug, { action: "parse", prop: "sections", page: main, format: "json" });
        const lore = filterSections(secs?.parse?.sections || [], "plot");
        if (lore.length) return main;
      } catch { /* main page missing - fall through to search */ }
    }
  }
  const queries = [];
  if (domain === "plot") queries.push(`${franchiseTitle} plot`, `${franchiseTitle} story`, `${franchiseTitle} history`, franchiseTitle);
  else if (domain === "characters") queries.push(`${franchiseTitle} characters`, franchiseTitle);
  else if (domain === "cosmology") queries.push(`${franchiseTitle} cosmology`, `${franchiseTitle} world`, `${franchiseTitle} universe`, `${franchiseTitle} locations`, `${franchiseTitle} terminology`);
  else if (domain === "powerscaling") queries.push(`${franchiseTitle} powerscaling`, `${franchiseTitle} tiering`, `${franchiseTitle} cosmology`);
  else if (domain === "production") queries.push(`${franchiseTitle} production`, `${franchiseTitle} development`, franchiseTitle);

  for (const q of queries) {
    let res;
    try {
      res = await wikiApi(slug, { action: "query", list: "search", srsearch: q, srlimit: 10, srnamespace: 0 });
    } catch {
      continue;
    }
    const hits = (res?.query?.search || []).map((h) => h.title);
    if (!hits.length) continue;
    // drop obvious junk pages
    const pageHits = hits.filter((t) => !/^(list of|category:|template:|forum:|user:|blog:|gallery of)/i.test(t) && !/(disambiguation|episode list|chapter list|image gallery)$/i.test(t));
    const pool = pageHits.length ? pageHits : hits;
    // search order is relevance - bias toward the top, randomize a little.
    // hard difficulty digs deeper into the result list (obscure pages).
    const depth = difficulty === "hard" ? Math.min(pool.length, 8) : difficulty === "medium" ? Math.min(pool.length, 5) : Math.min(pool.length, 3);
    const idx = Math.floor(Math.random() * depth);
    return pool[idx];
  }
  return null;
}

// retrieve ONE cleaned lore chunk for a domain
// returns { text, page, section, tok } or null
async function retrieveLore(slug, franchiseTitle, domain, difficulty, usedKeys = new Set()) {
  const page = await findPageForDomain(slug, franchiseTitle, domain, difficulty);
  if (!page) return null;
  let sectionsData;
  try {
    sectionsData = await wikiApi(slug, { action: "parse", prop: "sections", page, format: "json" });
  } catch {
    return null;
  }
  const secs = filterSections(sectionsData?.parse?.sections || [], domain);
  if (!secs.length && domain !== "production") {
    // page has no usable sections - fall back to the intro (section 0)
    try {
      const intro = await wikiApi(slug, { action: "parse", prop: "wikitext", page, section: 0, format: "json" });
      const text = cleanWikitext(intro?.parse?.wikitext?.["*"] || "");
      if (text.length > 200) {
        const key = `${slug}:${page}:intro`;
        if (!usedKeys.has(key)) {
          usedKeys.add(key);
          const fitted = fitContext(text);
          return { text: fitted, page, section: "intro", tok: estTokens(fitted) };
        }
      }
    } catch { /* fallthrough */ }
    return null;
  }
  // shuffle candidate sections, try up to 4 until we get a usable chunk
  const shuffled = secs.sort(() => Math.random() - 0.5).slice(0, 4);
  for (const s of shuffled) {
    const key = `${slug}:${page}:${s.index}`;
    if (usedKeys.has(key)) continue;
    try {
      const d = await wikiApi(slug, { action: "parse", prop: "wikitext", page, section: s.index, format: "json" });
      const text = cleanWikitext(d?.parse?.wikitext?.["*"] || "");
      if (text.length < 220) continue; // too thin to build a good question
      usedKeys.add(key);
      const fitted = fitContext(text);
      return { text: fitted, page, section: s.title, tok: estTokens(fitted) };
    } catch { continue; }
  }
  return null;
}

// ════════════════════════════════════════════
// CHARACTER POPULARITY INDEX (spec section 8)
// easy = top 10% most popular, medium = 10-40%, hard = 40%+ / obscure.
// Popularity sources, best first: AniList favourites (anime), then the wiki's
// own page length as a proxy (major characters have long pages), then role
// categories. The index is cached per wiki for the process lifetime.
// ════════════════════════════════════════════

const _charIndexCache = new Map(); // slug -> { ts, buckets }
const CHAR_INDEX_TTL = 60 * 60 * 1000;

async function listCategoryMembers(slug, category, limit = 120) {
  try {
    const d = await wikiApi(slug, {
      action: "query", list: "categorymembers",
      cmtitle: category.startsWith("Category:") ? category : `Category:${category}`,
      cmlimit: Math.min(limit, 500), cmnamespace: 0,
    });
    return (d?.query?.categorymembers || []).map((m) => m.title);
  } catch {
    return [];
  }
}

async function buildCharacterIndex(slug, franchiseTitle, animeCharacters = []) {
  const cached = _charIndexCache.get(slug);
  if (cached && Date.now() - cached.ts < CHAR_INDEX_TTL) return cached.buckets;

  // 1. AniList-ranked characters (anime only) - favourites are the strongest signal
  const anilist = animeCharacters
    .filter((c) => c && c.name)
    .map((c) => ({ page: c.name, fav: c.favourites || 0, role: c.role }));

  // 2. wiki character pages (games/comics and everything else)
  const wikiNames = new Set();
  for (const cat of ["Characters", "Protagonists", "Antagonists", "Supporting Characters"]) {
    for (const t of await listCategoryMembers(slug, cat, 100)) wikiNames.add(t);
  }
  // also search results for "<franchise> characters" pages provide names
  let wikiList = [...wikiNames];

  // fetch page length for the wiki names in batches (major = long pages)
  const lengths = new Map();
  const batch = wikiList.slice(0, 60);
  for (let i = 0; i < batch.length; i += 20) {
    const chunk = batch.slice(i, i + 20);
    try {
      const d = await wikiApi(slug, {
        action: "query", prop: "info", titles: chunk.join("|"), format: "json",
      });
      const pages = Object.values(d?.query?.pages || {});
      for (const p of pages) {
        if (p && p.title && !("missing" in p)) lengths.set(p.title, p.length || 0);
      }
    } catch { /* lengths optional */ }
  }

  // rank: AniList entries by favourites desc first, then wiki entries by length desc
  const ranked = [];
  const alNames = new Set(anilist.map((c) => c.page.toLowerCase()));
  for (const c of anilist) ranked.push({ page: c.page, score: Math.log10(c.fav + 1) * 100 + (c.role === "main" ? 40 : 0), src: "anilist" });
  for (const t of wikiList) {
    if (alNames.has(t.toLowerCase())) continue;
    if (/(list of|category:|fanon|sprite|gallery|concept art)/i.test(t)) continue;
    ranked.push({ page: t, score: Math.log10((lengths.get(t) || 400) + 1) * 20, src: "wiki" });
  }
  ranked.sort((a, b) => b.score - a.score);

  // buckets per spec: easy top 10%, medium 10-40%, hard 40%+ (min 1 per bucket)
  const n = ranked.length;
  const eCut = Math.max(1, Math.floor(n * 0.10));
  const mCut = Math.max(eCut + 1, Math.floor(n * 0.40));
  const buckets = {
    easy: ranked.slice(0, eCut).map((r) => r.page),
    medium: ranked.slice(eCut, mCut).map((r) => r.page),
    hard: ranked.slice(mCut).map((r) => r.page),
  };
  if (!buckets.easy.length) buckets.easy = buckets.medium.length ? [...buckets.medium.slice(0, 2)] : [...buckets.hard.slice(0, 2)];
  if (!buckets.medium.length) buckets.medium = [...buckets.easy];
  if (!buckets.hard.length) buckets.hard = [...buckets.medium];
  _charIndexCache.set(slug, { ts: Date.now(), buckets });
  return buckets;
}

function pickCharacterPage(buckets, difficulty) {
  const pool = (buckets && buckets[difficulty] && buckets[difficulty].length)
    ? buckets[difficulty]
    : [...(buckets?.medium || []), ...(buckets?.easy || []), ...(buckets?.hard || [])];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function retrieveCharacterLore(slug, charPage, difficulty, usedKeys = new Set()) {
  if (!charPage) return null;
  let sectionsData;
  try {
    sectionsData = await wikiApi(slug, { action: "parse", prop: "sections", page: charPage, format: "json" });
  } catch {
    return null;
  }
  const secs = filterSections(sectionsData?.parse?.sections || [], "characters");
  if (!secs.length) return null;
  // easy: bias to History/Personality (well-known); hard: Abilities/Equipment/specific subsections
  let pool = secs;
  if (difficulty === "easy") {
    const pref = secs.filter((s) => /^(history|plot|story|biography|personality|background|summary)/i.test(s.title));
    if (pref.length) pool = pref;
  } else if (difficulty === "hard") {
    const pref = secs.filter((s) => /^(abilities|powers|equipment|authorities|magic|techniques|skills|intelligence|weapons|relationships)/i.test(s.title) || s.level >= 3);
    if (pref.length) pool = pref;
  }
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 4);
  for (const s of shuffled) {
    const key = `${slug}:${charPage}:${s.index}`;
    if (usedKeys.has(key)) continue;
    try {
      const d = await wikiApi(slug, { action: "parse", prop: "wikitext", page: charPage, section: s.index, format: "json" });
      const text = cleanWikitext(d?.parse?.wikitext?.["*"] || "");
      if (text.length < 220) continue;
      usedKeys.add(key);
      const fitted = fitContext(text);
      return { text: fitted, page: charPage, section: s.title, tok: estTokens(fitted) };
    } catch { continue; }
  }
  return null;
}

// cosmology: dedicated retrieval path over cosmology-ish pages (spec section 9)
const COSMOLOGY_PAGE_RE = /(cosmology|world ?building|world building|terminology|dimensional tiering|tiering system|universe|multiverse|realms?|afterlife|power system|magic system|cosmic hierarchy|macrocosm|dimensions?)/i;

async function retrieveCosmologyLore(slug, franchiseTitle, difficulty, usedKeys = new Set(), domain = "cosmology") {
  // find cosmology pages by title search
  let candidates = [];
  try {
    const d = await wikiApi(slug, {
      action: "query", list: "search",
      srsearch: `intitle:${domain === "powerscaling" ? "tiering" : "cosmology"} ${franchiseTitle}`,
      srnamespace: 0, srlimit: 8,
    });
    candidates = (d?.query?.search || []).map((s) => s.title);
  } catch { /* fallthrough */ }
  if (domain === "cosmology" && !candidates.length) {
    for (const q of [`${franchiseTitle} world`, `${franchiseTitle} universe`, `${franchiseTitle} terminology`, `${franchiseTitle} locations`]) {
      try {
        const d = await wikiApi(slug, { action: "query", list: "search", srsearch: q, srnamespace: 0, srlimit: 6 });
        candidates = (d?.query?.search || []).map((s) => s.title);
        if (candidates.length) break;
      } catch { continue; }
    }
  }
  // keep pages that look cosmology-ish (or any lore page when nothing matches)
  const good = candidates.filter((t) => COSMOLOGY_PAGE_RE.test(t) || !domain);
  const pool = (good.length ? good : candidates).filter((t) => !/disambiguation/i.test(t));
  // for powerscaling on a home wiki with nothing, fall back to the generic lore search
  if (!pool.length) return retrieveLore(slug, franchiseTitle, domain, difficulty, usedKeys);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  for (const page of shuffled.slice(0, 3)) {
    const lore = await retrieveLore(slug, page, domain, difficulty, usedKeys);
    if (lore) return lore;
  }
  return null;
}

// ════════════════════════════════════════════
// MEDIA EXTRACTION (spec sections 6 & 7)
// Images and audio are NOT question categories: they attach to whatever lore
// was chosen, ONLY when a real, verified asset exists. Otherwise text.
// ════════════════════════════════════════════

async function resolveFileUrl(slug, fileTitle, thumbwidth = 800) {
  try {
    const d = await wikiApi(slug, {
      action: "query", titles: fileTitle, prop: "imageinfo",
      iiprop: "url|mime|size", iiurlwidth: thumbwidth,
    });
    const page = Object.values(d?.query?.pages || {})[0];
    const info = page?.imageinfo && page.imageinfo[0];
    if (!info) return null;
    return {
      url: info.thumburl || info.url,
      mime: info.mime,
      size: info.size || 0,
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
    };
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════
// MEDIA TYPE DETECTION + MULTI-SOURCE POOL (2026-09-26 audit - P22)
// The anime pipeline used to assume anime-shaped sources for everything.
// Movies, TV shows (incl. western cartoons like Ben 10) and games must go
// through the SAME validation pipeline with sources appropriate to the
// media type. Wikipedia is added to the source pool as a CROSS-CHECK
// source (never blindly trusted - its facts pass the same fact checks).
// ════════════════════════════════════════════

const _mediaTypeCache = new Map(); // query -> { ts, mediaType, meta }

// Best-effort media classification for a user query.
// Order of evidence: TMDb-free path -> TVMaze (TV, free) -> Wikipedia
// (film/TV/comics disambiguation) -> wiki existence + AniList format.
// Returns { mediaType, meta? } - mediaType in
// anime | manga | movie | tv | game | comic | franchise.
async function detectMediaType(query) {
  const q = String(query || "").trim();
  if (!q) return { mediaType: "franchise" };
  const hit = _mediaTypeCache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < 60 * 60 * 1000) return { mediaType: hit.mediaType, meta: hit.meta };

  const result = { mediaType: "franchise", meta: null };
  // 1) TVMaze singlesearch - strong signal for live-action/animated TV
  try {
    const r = await _http.get("https://api.tvmaze.com/singlesearch/shows", { params: { q }, timeout: 8000 });
    if (r.data && r.data.name && String(r.data.name).toLowerCase().replace(/[^a-z0-9]/g, "").includes(q.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6))) {
      result.mediaType = "tv";
      result.meta = { source: "tvmaze", id: r.data.id, title: r.data.name, premiered: r.data.premiered, genres: r.data.genres || [], summary: String(r.data.summary || "").replace(/<[^>]+>/g, "").slice(0, 500) };
    }
  } catch { /* not a TV show (or unreachable) */ }
  // 2) Wikipedia REST summary - film / comic / game signal from the lead sentence
  if (result.mediaType === "franchise") {
    const wiki = await wikipediaSummary(q).catch(() => null);
    if (wiki && wiki.extract) {
      const lead = wiki.extract.toLowerCase();
      if (/:\s*.*\b(film|movie)\b/.test(lead.slice(0, 300)) || /\b\d{4} (film|animated film)\b/.test(lead.slice(0, 300))) {
        result.mediaType = "movie";
        result.meta = { source: "wikipedia", title: wiki.title, extract: wiki.extract.slice(0, 500) };
      } else if (/\btelevision series\b|\btv series\b|\banimated series\b|\bweb series\b/.test(lead.slice(0, 300))) {
        result.mediaType = "tv";
        result.meta = { source: "wikipedia", title: wiki.title, extract: wiki.extract.slice(0, 500) };
      } else if (/\bmanga\b|\blight novel\b/.test(lead.slice(0, 300))) {
        result.mediaType = "manga";
      } else if (/\bvideo game\b|\brpg\b|\baction-adventure game\b/.test(lead.slice(0, 300))) {
        result.mediaType = "game";
      } else if (/\bcomic\b|\bgraphic novel\b|\bsuperhero\b/.test(lead.slice(0, 300))) {
        result.mediaType = "comic";
      }
    }
  }
  _mediaTypeCache.set(q.toLowerCase(), { ts: Date.now(), ...result });
  return result;
}

// Wikipedia REST API (action=query JSON, browserless). Used for:
//  - movie/TV lead facts when no Fandom wiki exists
//  - cross-referencing a generated answer during fact validation (P12/P22)
const _wpCache = new Map();
async function wikipediaSummary(title, lang = "en") {
  const key = `${lang}:${String(title || "").toLowerCase()}`;
  const hit = _wpCache.get(key);
  if (hit && Date.now() - hit.ts < 30 * 60 * 1000) return hit.data;
  try {
    const r = await _http.get(`https://${lang}.wikipedia.org/w/api.php`, {
      params: {
        action: "query", format: "json", formatversion: 2,
        titles: title, prop: "extracts", exintro: 1, explaintext: 1, redirects: 1,
      },
      timeout: 10000,
    });
    const page = (r.data?.query?.pages || [])[0];
    if (!page || page.missing) return null;
    const entry = { ts: Date.now(), data: { title: page.title, extract: String(page.extract || "").slice(0, 2000) } };
    _wpCache.set(key, entry);
    if (_wpCache.size > 150) _wpCache.delete(_wpCache.keys().next().value);
    return entry.data;
  } catch {
    return null;
  }
}

// TVMaze "show" lookup (free, no key) - TV show fact fallback (P22)
async function tvmazeLookup(title) {
  try {
    const r = await _http.get("https://api.tvmaze.com/singlesearch/shows", { params: { q: title }, timeout: 8000 });
    if (!r.data || !r.data.name) return null;
    return {
      source: "tvmaze", id: r.data.id, title: r.data.name,
      premiered: r.data.premiered || null, ended: r.data.ended || null,
      genres: (r.data.genres || []).slice(0, 5),
      network: r.data.network?.name || r.data.webChannel?.name || null,
      summary: String(r.data.summary || "").replace(/<[^>]+>/g, "").slice(0, 600),
    };
  } catch {
    return null;
  }
}

// Theme/OP/ED song names for a media (P11). Anime: Jikan /anime/{id}/full
// exposes theme.openings / theme.endings straight from MAL. Non-anime media
// returns [] (theme-song questions then skip gracefully).
// P27: song lists are STATIC per anime - cached 24h per id (Jikan allows
// ~3 req/min per IP and the whole box shares it; uncached calls 429-storm and
// silently yield no theme songs). One gentle retry covers transient 429s.
const _themeCache = new Map(); // idMal -> { ts, songs }
const THEME_CACHE_TTL = 24 * 60 * 60 * 1000;

// shared parser (Go service + direct Jikan payloads share the shape)
function parseThemePayload(data) {
  const th = data?.data?.theme || {};
  const openings = (th.openings || []).map((s) => String(s).replace(/^"\s*/, "").replace(/"\s*$/, "").replace(/\s*by\s+.+$/i, "").trim()).filter(Boolean);
  const endings = (th.endings || []).map((s) => String(s).replace(/^"\s*/, "").replace(/"\s*$/, "").replace(/\s*by\s+.+$/i, "").trim()).filter(Boolean);
  return { openings, endings };
}

async function getThemeSongs(mediaType, animeId, opts = {}) {
  try {
    if (mediaType === "anime" && animeId) {
      const idMal = parseInt(animeId, 10);
      if (Number.isInteger(idMal) && idMal > 0) {
        const hit = _themeCache.get(idMal);
        if (hit && Date.now() - hit.ts < THEME_CACHE_TTL) return hit.songs;
        let songs = { openings: [], endings: [] };
        // P28: prefer the Go service (Node->Jikan is CDN-blocked on some
        // networks: measured 504 x5 while curl/Go pass); direct axios is the
        // fallback so the quiz still works without the Go service.
        if (opts.goService && typeof opts.goService.getThemeSongs === "function") {
          songs = await opts.goService.getThemeSongs(idMal).catch(() => null) || { openings: [], endings: [] };
        }
        if (!songs.openings.length && !songs.endings.length) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const r = await _http.get(`https://api.jikan.moe/v4/anime/${idMal}/full`, { timeout: 10000 });
              songs = parseThemePayload(r.data);
              if (songs.openings.length || songs.endings.length) break;
            } catch (e) {
              if (attempt === 1) break;
            }
            await new Promise((res) => setTimeout(res, 1500)); // gentle Jikan pacing
          }
        }
        if (songs.openings.length || songs.endings.length) {
          _themeCache.set(idMal, { ts: Date.now(), songs });
        }
        return songs;
      }
    }
  } catch { /* fall through */ }
  return { openings: [], endings: [] };
}

// infobox/main image of a page (very relevant for character questions)
async function getPageImage(slug, page) {
  try {
    const d = await wikiApi(slug, {
      action: "query", prop: "pageimages", piprop: "thumbnail",
      titles: page, pithumbsize: 700,
    });
    const p = Object.values(d?.query?.pages || {})[0];
    const url = p?.thumbnail?.source;
    if (!url) return null;
    return { url, mime: /\.png/i.test(url) ? "image/png" : "image/jpeg" };
  } catch {
    return null;
  }
}

// download + verify a media asset (magic-byte check, size cap)
async function downloadMedia(url, kind = "image") {
  // https required; plain http only for loopback (local dev/QA media server)
  if (!url || (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url))) return null;
  try {
    const r = await _http.get(url, { responseType: "arraybuffer", timeout: 20000, maxContentLength: 6 * 1024 * 1024 });
    const buf = Buffer.from(r.data);
    if (buf.length < 1024) return null;
    const b = buf;
    let ok = false;
    if (kind === "image") {
      ok = (b[0] === 0xff && b[1] === 0xd8)                    // jpeg
        || (b[0] === 0x89 && b[1] === 0x50)                    // png
        || (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP"); // webp
    } else if (kind === "audio") {
      ok = (b.slice(0, 4).toString() === "OggS")               // ogg
        || (b.slice(0, 3).toString() === "ID3")                // mp3
        || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);          // mp3 raw
    }
    if (!ok) return null;
    const mime = kind === "image"
      ? (b[0] === 0x89 ? "image/png" : (b.slice(8, 12).toString() === "WEBP" ? "image/webp" : "image/jpeg"))
      : (b.slice(0, 4).toString() === "OggS" ? "audio/ogg" : "audio/mpeg");
    return { buf, mime };
  } catch {
    return null;
  }
}

// opportunistic audio hunt for a character/page (rare on Fandom - optional)
async function findAudioForPage(slug, page) {
  const first = String(page || "").split(/[(/]/)[0].trim();
  if (!first) return null;
  for (const q of [`intitle:.ogg ${first}`, `intitle:.mp3 ${first}`]) {
    try {
      const d = await wikiApi(slug, { action: "query", list: "search", srsearch: q, srnamespace: 6, srlimit: 5 });
      const hits = (d?.query?.search || []).map((s) => s.title);
      for (const h of hits) {
        const info = await resolveFileUrl(slug, h, 0);
        if (info && /^audio\//.test(info.mime) && info.size < 4 * 1024 * 1024) {
          const dl = await downloadMedia(info.url, "audio");
          if (dl) return { file: h, ...dl };
        }
      }
    } catch { continue; }
  }
  return null;
}

// ════════════════════════════════════════════
// RAG QUESTION GENERATION (spec section 12)
// Model receives ONLY the retrieved lore. Input hard-capped < 800 tokens.
// ════════════════════════════════════════════

const DOMAIN_LABELS = {
  plot: "Plot Events / Story Lore",
  characters: "Character Lore & Backstory",
  cosmology: "Cosmology, Worldbuilding & Realms",
  powerscaling: "Powerscaling & Power Systems",
  production: "Production / Meta Trivia",
};

const DIFF_INSTRUCTIONS = {
  easy: "EASY: ask a core fact any casual fan knows - major events, famous characters, iconic abilities. Keep it simple.",
  medium: "MEDIUM: ask about well-known arcs, secondary characters, notable backstories or specific abilities.",
  hard: "HARD: ask a deep-cut question - a specific detail, exact name/number/place, obscure character, mechanic or precise event found in the source. It must be genuinely difficult for a casual fan (NOT a voice-actor question).",
};

function normalizeLLMReply(reply) {
  // engine's smartGroqCall returns the raw Groq response object; other clients
  // may return text. Accept: string | {choices:[{message:{content}}]} | {content}
  if (reply == null) return null;
  if (typeof reply === "string") return reply;
  if (typeof reply === "object") {
    if (typeof reply.content === "string") return reply.content;
    const c = reply.choices && reply.choices[0];
    if (c && c.message && typeof c.message.content === "string") return c.message.content;
    if (c && typeof c.text === "string") return c.text;
  }
  return null;
}

function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* scan */ }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

// coerce a generated question into the runtime shape; null = reject
function coerceOne(obj, difficulty, domain) {
  if (!obj || typeof obj !== "object") return null;
  const stem = String(obj.question || obj.q || "").trim();
  if (stem.length < 15 || stem.length > 320) return null;
  let opts = obj.options;
  if (Array.isArray(opts)) opts = opts.map((o) => String(o || "").trim());
  else if (opts && typeof opts === "object") opts = ["A", "B", "C", "D"].map((k) => String(opts[k] || "").trim());
  else return null;
  opts = opts.filter(Boolean).slice(0, 4);
  if (opts.length !== 4) return null;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return null;
  if (opts.some((o) => o.length > 80)) return null;
  let ans = String(obj.answer ?? obj.correct ?? "").trim().toUpperCase();
  let idx = "ABCD".includes(ans) ? "ABCD".indexOf(ans) : parseInt(ans, 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) return null;
  return {
    q: stem, options: opts, correct: idx, difficulty,
    topic: String(obj.topic || DOMAIN_LABELS[domain] || "Lore").slice(0, 28),
    domain,
  };
}

// generate ONE lore question. callLLM = injected (engine smartGroqCall / tests).
// lore = { text, page, section, tok }. Returns { question, promptTok } or null.
async function generateLoreQuestion(callLLM, franchiseTitle, lore, domain, difficulty, warn = null, attempt = 0) {
  if (typeof callLLM !== "function" || !lore || !lore.text) return null;
  const sourceLabel = `${franchiseTitle}${lore.page ? ` - wiki: ${lore.page}` : ""}${lore.section && lore.section !== "intro" ? ` / section: ${lore.section}` : ""}`;
  const system = "You write multiple-choice quiz questions from a SUPPLIED source. You output ONLY valid JSON. Never invent facts.";
  // varied framing per retry: identical retries reproduce identical priors;
  // rotating the angle (event -> place/object -> number/name) keeps retries
  // diverse and steers the model back into the supplied source
  const ANGLES = [
    "Ask about an EVENT, action or outcome that is explicitly described in the SOURCE.",
    "Ask about a PLACE, object or concept that is named in the SOURCE.",
    "Ask about a NUMBER, duration, name or relationship that is stated in the SOURCE.",
  ];
  const user = [
    `Write ONE ${difficulty} multiple-choice quiz question about "${franchiseTitle}".`,
    `Domain: ${DOMAIN_LABELS[domain] || domain}.`,
    DIFF_INSTRUCTIONS[difficulty] || DIFF_INSTRUCTIONS.medium,
    ANGLES[attempt % ANGLES.length],
    domain === "production"
      ? "Production domain: ask about studios, voice cast, dates or production facts found in the source."
      : "Do NOT ask about voice actors, studios, release dates or other production trivia.",
    ...(warn ? [`WARNING - your previous answer was REJECTED: ${warn}. Ask about a DIFFERENT fact that appears word-for-word in the SOURCE below, and make sure the correct answer text appears in the SOURCE.`] : []),
    "The question and the correct answer MUST be directly supported by the SOURCE below. Distractors must be plausible but clearly wrong to someone who knows the source.",
    "CRITICAL: use ONLY facts written in the SOURCE text - never rely on your own knowledge of the franchise. If the SOURCE does not clearly contain the answer to a question you could ask, reply {\"skip\":true} instead of inventing anything.",
    "Answer options must be short (under 80 characters). Do not use \"all of the above\" or trick wording.",
    "",
    `SOURCE (${sourceLabel}):`,
    lore.text,
    "",
    "Reply with ONLY this JSON shape: {\"question\":\"...\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"answer\":\"A\"|\"B\"|\"C\"|\"D\"}",
  ].join("\n");

  const promptTok = estTokens(system) + estTokens(user);
  if (promptTok >= 800) return null; // hard budget guard

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLLM({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: attempt === 0 ? 0.55 : 0.3,
        max_tokens: 420,
        response_format: { type: "json_object" },
      });
      const text = normalizeLLMReply(raw);
      const parsed = extractJson(text);
      // model may honour the source-only instruction by skipping
      if (parsed && parsed.skip) {
        console.log("[QuizLore] model skipped (source lacked a questionable fact)");
        return null;
      }
      const q = coerceOne(parsed, difficulty, domain);
      if (q) return { question: q, promptTok };
      console.log(`[QuizLore] malformed model reply (attempt ${attempt + 1}):`, String(text || "").slice(0, 80));
    } catch (e) {
      console.log(`[QuizLore] LLM call failed (attempt ${attempt + 1}):`, e?.message?.slice(0, 90));
    }
  }
  return null;
}

// ════════════════════════════════════════════
// QUESTION PLAN (spec section 4 weights)
// ════════════════════════════════════════════

function buildQuestionPlan(count, difficulty, sectionOverride = null) {
  if (sectionOverride) return Array(count).fill(sectionOverride);
  const total = DOMAIN_WEIGHTS.reduce((a, w) => a + w.weight, 0);
  const plan = [];
  for (let i = 0; i < count; i++) {
    let roll = crypto.randomInt(0, total);
    let picked = "plot";
    for (const w of DOMAIN_WEIGHTS) {
      if (roll < w.weight) { picked = w.domain; break; }
      roll -= w.weight;
    }
    // split the 15% cosmology bucket: powerscaling alternates in naturally
    if (picked === "cosmology" && crypto.randomInt(0, 2) === 1) picked = "powerscaling";
    plan.push(picked);
  }
  // guarantee genuine variety: no 3 identical domains in a row when avoidable
  for (let i = 2; i < plan.length; i++) {
    if (plan[i] === plan[i - 1] && plan[i] === plan[i - 2] && count >= 4) {
      const alt = plan[i] === "plot" ? "characters" : "plot";
      plan[i] = alt;
    }
  }
  return plan;
}

module.exports = {
  // constants
  DOMAIN_WEIGHTS, SECTION_ALIASES, CTX_CHAR_LIMIT,
  // wiki layer
  resolveWiki, wikiExists, wikiApi, slugify,
  // lore layer
  cleanWikitext, fitContext, estTokens, filterSections, retrieveLore, findPageForDomain,
  // characters + media + generation
  buildCharacterIndex, pickCharacterPage, retrieveCharacterLore, retrieveCosmologyLore,
  getPageImage, resolveFileUrl, downloadMedia, findAudioForPage,
  generateLoreQuestion, buildQuestionPlan,
  // media-type + multi-source pool (P22)
  detectMediaType, wikipediaSummary, tvmazeLookup, getThemeSongs,
  // helpers exposed for tests
  normalizeLLMReply, extractJson, coerceOne,
  _internal: { _wikiCache, KNOWN_WIKIS, JUNK_SECTION_RE, _charIndexCache, setWikiApiOverride(fn) { _wikiApiOverride = fn; }, },
};
