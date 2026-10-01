// ============================================
// QUIZ IMAGE SOURCES (2026-10-01) - owner bug report §4A/§4B/§5
// Category-aware provider adapters added after the sandbox research phase
// (matrix: 40 titles x 8 categories, every candidate live-tested + vision
// graded; results + rate limits in scripts/imgresearch/).
// ============================================
// WHAT LIVES HERE (new vs the v3 resolver):
//   kitsu    - anime/manga cast. STRICT title gate: Kitsu text-search is
//              fuzzy and happily returns a DIFFERENT franchise's cast
//              (measured: "Ben 10" -> random anime cast, "Vagabond" ->
//              Tekken art). Search hits whose canonical titles do not match
//              the requested title are rejected outright.
//   steam    - games. storesearch + appdetails (header + screenshots).
//              Doubles as the DETERMINISTIC game-category probe.
//   speedrun - game cover art (embed=assets, reliable keyless).
//   itunes   - movie/TV-season artwork (poster-like entity images).
//              Doubles as the movie-category probe.
//   ddg      - DuckDuckGo images (keyless general search, LAST fallback for
//              per-record bytes). vqd-token flow, challenge(202)/429
//              cooldowns, hotlink-hostile domain denylist (measured: Fandom
//              CDN, Miraheze, TVTropes proxy all 403 from datacenter IPs),
//              dimension prefilter. Results are IDENTITY-UNVERIFIED: the
//              caller must run visionVerify before serving.
//   openverse- CC search, FINAL resort only (measured semantic drift:
//              "Casablanca" -> Moroccan pattern, "The Fall" -> autumn leaves).
//   ENTITY_DECOYS - curated same-category title pools for entity questions.
//
// EVERYTHING here returns plain records and never throws.
// ============================================

const axios = require("axios");
const visionVerify = require("./visionVerify");

const _UA = "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev)";
const _http = axios.create({ timeout: 12000, headers: { "User-Agent": _UA, "Accept": "*/*" }, validateStatus: () => true, family: 4 });

const _norm = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ── host-level cooldowns (learned from live failures) ──
const _hostCool = new Map(); // host -> untilTs
const DENYLIST = [
  /(^|\.)wikia\.nocookie\.net$/i,        // Fandom CDN: Cloudflare 403 from DC IPs
  /(^|\.)fandom\.com$/i,
  /(^|\.)miraheze\.org$/i,               // 403 hotlink block
  /mediaproxy\.tvtropes\.org$/i,         // 403 hotlink block
  /(^|\.)tvtropes\.org$/i,
  /(^|\.)uidownload\.com$/i,
  /(^|\.)pngwing\.com$/i, /(^|\.)pngegg\.com$/i, /(^|\.)pngitem\.com$/i,
  /(^|\.)kindpng\.com$/i, /(^|\.)pngkey\.com$/i,
  /(^|\.)hotpng\.com$/i, /(^|\.)pngdownload\.com$/i,
  /(^|\.)pinterest\./i,                  // 403 + auth wall
  /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i,
];
function hostOf(url) { try { return new URL(url).hostname; } catch { return ""; } }
// deterministic rejection: hotlink-hostile / auth-walled domain (negative-cache safe)
function isDenied(url) {
  const h = hostOf(url);
  return !!h && DENYLIST.some((re) => re.test(h));
}
function hostAllowed(url) {
  const h = hostOf(url);
  if (!h) return false;
  if (DENYLIST.some((re) => re.test(h))) return false;
  const until = _hostCool.get(h) || 0;
  return Date.now() >= until;
}
function noteHostFailure(url, coolMs = 10 * 60e3) {
  const h = hostOf(url);
  if (h) _hostCool.set(h, Date.now() + coolMs);
}

// ══════════════════════════════════════════
// KITSU (anime/manga cast) - strict identity gate
// ══════════════════════════════════════════
async function kitsuPool(ctx) {
  try {
    const s = await _http.get("https://kitsu.io/api/edge/anime", { params: { "filter[text]": ctx.title, "page[limit]": 3 } });
    if (s.status !== 200 || !s.data?.data?.length) return [];
    const nt = _norm(ctx.title);
    // STRICT title gate: the search hit must actually be this franchise.
    // 2026-10-01: filter AFTER normalization - CJK titles ("ベン・トー") normalize
    // to "" and `nt.includes("")` is always true, which let Kitsu's fuzzy
    // search serve a DIFFERENT franchise's cast (measured: "Ben 10" -> Ben-To
    // cast). Min length 2 also kills single-char substring noise.
    const hit = s.data.data.find((d) => {
      const t = d.attributes || {};
      const titles = [t.canonicalTitle, t.titles?.en, t.titles?.en_jp, t.titles?.ja_jp, ...(t.abbreviatedTitles || [])].map(_norm).filter((x) => x && x.length >= 2);
      return titles.some((x) => x === nt || (nt.length >= 5 && (x.includes(nt) || nt.includes(x))));
    });
    if (!hit) return [];
    const c = await _http.get(`https://kitsu.io/api/edge/anime/${hit.id}/characters`, { params: { include: "character", "page[limit]": 20 } });
    if (c.status !== 200) return [];
    const inc = c.data?.included || [];
    return inc.filter((i) => i.type === "characters").map((ch) => ({
      name: ch.attributes?.canonicalName || ch.attributes?.name,
      image_url: ch.attributes?.image?.original,
      source: "kitsu", source_id: `kitsu-${ch.id}`, confidence: 0.85, method: "cast",
    })).filter((r) => r.name && r.image_url);
  } catch { return []; }
}

// ══════════════════════════════════════════
// STEAM (games) - entity art + deterministic game probe
// ══════════════════════════════════════════
async function steamGameProbe(title) {
  try {
    const s = await _http.get("https://store.steampowered.com/api/storesearch/", { params: { term: title, l: "english", cc: "US" } });
    if (s.status !== 200 || !s.data?.items?.length) return null;
    const nt = _norm(title);
    const hit = s.data.items.find((it) => _norm(it.name) === nt) || s.data.items.find((it) => _norm(it.name).includes(nt) && nt.length >= 4) || s.data.items[0];
    return hit ? { appid: hit.id, name: hit.name, image: hit.tiny_image } : null;
  } catch { return null; }
}
async function steamEntityArt(ctx) {
  try {
    const probe = await steamGameProbe(ctx.title);
    if (!probe) return [];
    const d = await _http.get("https://store.steampowered.com/api/appdetails", { params: { appids: probe.appid, l: "english" } });
    const app = d.status === 200 && d.data?.[String(probe.appid)]?.data;
    const shots = app?.screenshots?.map((x) => x.path_thumbnail).filter(Boolean) || [];
    const urls = [app?.header_image, probe.image, ...shots.slice(0, 3)].filter(Boolean);
    if (!urls.length) return [];
    return [{
      name: ctx.title, role: "entity", entityKind: "game",
      image_url: urls[0], alt_urls: urls.slice(1, 4),
      source: "steam", source_id: `steam-${probe.appid}`, confidence: 0.9, method: "entity-art",
    }];
  } catch { return []; }
}

// ══════════════════════════════════════════
// SPEEDRUN.COM (game covers) - keyless, reliable
// ══════════════════════════════════════════
async function speedrunEntityArt(ctx) {
  try {
    const s = await _http.get("https://www.speedrun.com/api/v1/games", { params: { name: ctx.title, max: 3, embed: "assets" } });
    if (s.status !== 200 || !s.data?.data?.length) return [];
    const nt = _norm(ctx.title);
    const hit = s.data.data.find((g) => _norm(g.names?.international) === nt) || s.data.data[0];
    const u = hit?.assets?.["cover-large"]?.uri || hit?.assets?.["cover-medium"]?.uri;
    if (!u) return [];
    return [{ name: ctx.title, role: "entity", entityKind: "game", image_url: u, source: "speedrun", source_id: `src-${hit.id}`, confidence: 0.8, method: "entity-art" }];
  } catch { return []; }
}

// ══════════════════════════════════════════
// ITUNES (movie/TV artwork) - keyless poster-like entity art
// ══════════════════════════════════════════
async function itunesEntityArt(ctx) {
  try {
    const media = ctx.category === "cartoon" || ctx.category === "tv" ? "tvSeason" : "movie";
    const r = await _http.get("https://itunes.apple.com/search", { params: { term: ctx.title, media, limit: 3, country: "US" } });
    if (r.status !== 200 || !r.data?.results?.length) return [];
    const nt = _norm(ctx.title);
    const hit = r.data.results.find((x) => _norm(x.trackName || x.collectionName).includes(nt)) || r.data.results[0];
    const u = String(hit.artworkUrl100 || "").replace("100x100", "600x600");
    if (!u) return [];
    return [{ name: ctx.title, role: "entity", entityKind: media === "movie" ? "movie" : "show", image_url: u, source: "itunes", source_id: `itunes-${hit.trackId || hit.collectionId}`, confidence: 0.75, method: "entity-art" }];
  } catch { return []; }
}

// ══════════════════════════════════════════
// DUCKDUCKGO IMAGES (general search, last per-record fallback)
// vqd token -> i.js; 202/429 => module-level cooldown (anti-bot wall).
// Identity is NOT verified here - caller must vision-gate.
// ══════════════════════════════════════════
const _ddg = { vqd: new Map(), until: 0 };
async function ddgImageSearch(query, { limit = 8 } = {}) {
  if (Date.now() < _ddg.until) return [];
  try {
    let vqd = _ddg.vqd.get(query);
    if (!vqd) {
      const h = await _http.get("https://duckduckgo.com/", { params: { q: query, iax: "images", ia: "images" }, timeout: 10000 });
      const m = String(h.data || "").match(/vqd=["']?([\d-]+)["']?/);
      if (h.status === 200 && m) { vqd = m[1]; _ddg.vqd.set(query, vqd); }
      else {
        // 202 = challenge wall: back the whole source off for 10 minutes
        if (h.status === 202 || h.status === 403) _ddg.until = Date.now() + 10 * 60e3;
        return [];
      }
    }
    const r = await _http.get("https://duckduckgo.com/i.js", {
      params: { l: "us-en", o: "json", q: query, vqd, f: ",,,", p: "1" }, timeout: 10000,
    });
    if (r.status === 202 || r.status === 403 || r.status === 429) { _ddg.until = Date.now() + 10 * 60e3; return []; }
    if (r.status !== 200) return [];
    const rows = (r.data?.results || [])
      .filter((x) => x.image && (x.width || 0) >= 200 && (x.height || 0) >= 150)
      .filter((x) => hostAllowed(x.image))
      .map((x) => ({ image_url: x.image, width: x.width, height: x.height, title: x.title, source: "ddg", host: hostOf(x.image) }));
    return rows.slice(0, limit);
  } catch { return []; }
}
// per-record DDG hunt: multiple strategies, anchored on name + franchise
async function ddgRecordImages(name, franchise) {
  const queries = franchise && _norm(franchise) !== _norm(name)
    ? [`${name} ${franchise} character`, `${name} ${franchise}`, `${name} character art`]
    : [`${name} character`, `${name} official art`];
  for (const q of queries) {
    const rows = await ddgImageSearch(q, { limit: 6 });
    if (rows.length) return rows;
  }
  return [];
}

// ══════════════════════════════════════════
// OPENVERSE (CC search) - FINAL resort, vision-gate mandatory
// ══════════════════════════════════════════
async function openverseImageSearch(query, { limit = 6 } = {}) {
  try {
    const r = await _http.get("https://api.openverse.org/v1/images/", { params: { q: query, page_size: limit }, timeout: 12000 });
    if (r.status !== 200) return [];
    return (r.data?.results || [])
      .filter((x) => x.url && hostAllowed(x.url))
      .map((x) => ({ image_url: x.url, title: x.title, source: "openverse", host: hostOf(x.url) }))
      .slice(0, limit);
  } catch { return []; }
}

// ══════════════════════════════════════════
// ENTITY DECOYS - curated famous titles per category for
// "Which {movie/game/show} is this?" questions (static, no network).
// ══════════════════════════════════════════
const ENTITY_DECOYS = {
  movie: ["Inception", "The Matrix", "Titanic", "Jurassic Park", "The Godfather", "Pulp Fiction", "Forrest Gump", "The Dark Knight", "Interstellar", "Gladiator", "Avatar", "Toy Story", "The Lion King", "Back to the Future", "Terminator 2", "Alien", "The Shawshank Redemption", "Fight Club", "Saving Private Ryan", "Braveheart", "Apollo 13", "Rocky", "Jaws", "E.T.", "Home Alone", "Ghostbusters", "Die Hard", "The Terminator", "Mad Max", "Iron Man"],
  game: ["Minecraft", "Fortnite", "Elden Ring", "God of War", "The Legend of Zelda", "Super Mario", "Hollow Knight", "Dark Souls", "Sekiro", "Bloodborne", "Cyberpunk 2077", "The Witcher 3", "GTA V", "Red Dead Redemption 2", "Portal 2", "Half-Life 2", "Overwatch", "Valorant", "League of Legends", "Dota 2", "Among Us", "Rocket League", "FIFA 24", "Call of Duty", "Battlefield", "Doom", "Quake", "Tetris", "Pokémon", "Animal Crossing"],
  tv: ["Breaking Bad", "Friends", "Game of Thrones", "Stranger Things", "The Office", "The Big Bang Theory", "Sherlock", "Doctor Who", "The Walking Dead", "Better Call Saul", "The Mandalorian", "House of Cards", "Narcos", "Peaky Blinders", "Dark", "Money Heist", "The Witcher", "Wednesday", "Squid Game", "Brooklyn Nine-Nine", "How I Met Your Mother", "Suits", "Grey's Anatomy", "Prison Break", "Vikings", "The Last of Us", "Severance", "Lost", "Supernatural", "The Sopranos"],
  cartoon: ["Ben 10", "SpongeBob SquarePants", "Avatar: The Last Airbender", "Gravity Falls", "Adventure Time", "Steven Universe", "Teen Titans", "Johnny Bravo", "Dexter's Laboratory", "Courage the Cowardly Dog", "Powerpuff Girls", "Samurai Jack", "Rick and Morty", "Family Guy", "The Simpsons", "Tom and Jerry", "Looney Tunes", "Scooby-Doo", "DuckTales", "Phineas and Ferb", "Kim Possible", "Dora the Explorer", "Hey Arnold", "Rugrats", "Ed Edd n Eddy", "Codename: Kids Next Door", "Foster's Home for Imaginary Friends", "Regular Show", "Amphibia", "The Owl House"],
  anime: ["Naruto", "One Piece", "Dragon Ball", "Death Note", "Attack on Titan", "Fullmetal Alchemist", "Bleach", "Hunter x Hunter", "Demon Slayer", "Jujutsu Kaisen", "My Hero Academia", "Chainsaw Man", "Spy x Family", "Cowboy Bebop", "Neon Genesis Evangelion", "Code Geass", "Steins;Gate", "Tokyo Ghoul", "Sword Art Online", "Re:Zero", "Vinland Saga", "Dr. Stone", "Haikyuu", "Kaguya-sama", "Mob Psycho 100", "One Punch Man", "Frieren", "Bocchi the Rock", "Violet Evergarden", "Your Lie in April"],
};

// ══════════════════════════════════════════
// VISION GATE for unanchored candidates (ddg/openverse). Never throws;
// open/closed circuit handled inside visionVerify. Returns true when the
// image plausibly depicts the subject.
// ══════════════════════════════════════════
async function visionGate(buf, mime, subject, franchise = "") {
  try {
    if (!process.env.VISION_ENDPOINT) return { ok: false, decision: "unknown", reason: "no-provider" };
    const r = await visionVerify.verifySubject(buf, mime, subject, franchise);
    // visionVerify decision vocabulary: "accept" | "reject" | "unknown"
    return { ok: r?.decision === "accept", decision: r?.decision || "unknown", reason: r?.reason || "" };
  } catch { return { ok: false, decision: "unknown", reason: "gate-error" }; }
}

module.exports = {
  kitsuPool, steamGameProbe, steamEntityArt, speedrunEntityArt, itunesEntityArt,
  ddgImageSearch, ddgRecordImages, openverseImageSearch, ENTITY_DECOYS,
  visionGate, hostAllowed, isDenied, noteHostFailure, hostOf,
};
