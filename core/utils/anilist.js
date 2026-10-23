/**
 * anilist.js - AniList GraphQL client for all anime discovery commands.
 *
 * 💡 FIX 2026-10-11: api.jikan.moe became TCP-unreachable from BOTH boxes AND
 * the wider internet (Hetzner edge blackholes; bot logs show the whole
 * `.j anime *` suite timing out). characterResolver already proved AniList is
 * reachable from both boxes (its adapter has been live for months), so the
 * entire anime suite now runs on AniList GraphQL (free, no key, POST-only,
 * 90 req/min - comfortably above our traffic).
 *
 * Every fetcher NORMALIZES to the Jikan v4 item shape the handlers and the
 * two numeric-selection blocks already consume:
 *   { title, title_english, score, rank, synopsis, episodes, year, type,
 *     status, url, members, favorites, images: { jpg: { large_image_url } } }
 * - so rendering code stays byte-identical and only the fetch swaps.
 */

const axios = require("axios");
const { LRUCache } = require("lru-cache");

const ANILIST_URL = "https://graphql.anilist.co";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 wa-jake-anime/1.0";

// -- response cache (AniList rate limit is 90/min - cache keeps us far under) --
const cache = new LRUCache({ max: 300, ttl: 1000 * 60 * 10 });

// -- GraphQL core -------------------------------------------------------------
async function gql(query, variables = {}, timeoutMs = 15000) {
  const body = { query, variables };
  const { data } = await axios.post(ANILIST_URL, body, {
    timeout: timeoutMs,
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
 // AniList answers 200 even for GraphQL-level errors - validate below.
    validateStatus: (s) => s < 500,
  });
  if (data?.errors?.length) {
    throw new Error(data.errors[0]?.message || "AniList GraphQL error");
  }
  return data?.data;
}

// -- Jikan-shape normalization ------------------------------------------------
function stripHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:i|b|em|strong|p|span|div)[^>]*>/gi, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Jikan scores are 0-10; AniList averageScore is 0-100.
function normScore(avg) {
  if (avg == null) return null;
  return Math.round(avg) / 10;
}

function normMedia(m) {
  if (!m) return null;
  const title =
    m.title?.romaji || m.title?.english || m.title?.native || "Unknown";
  return {
 // Jikan-compat fields (consumed by engine handlers + selection blocks)
    title,
    title_english: m.title?.english || null,
    score: normScore(m.averageScore),
    rank: m.rankings?.find((r) => r.type === "RATED" && r.allTime)?.rank || null,
    synopsis: stripHtml(m.description),
    episodes: m.episodes,
    year: m.seasonYear || m.startDate?.year || null,
    type: m.format === "TV" ? "TV" : m.format === "TV_SHORT" ? "TV" : m.format || "TV",
    status: m.status === "RELEASING" ? "Currently Airing" : m.status === "FINISHED" ? "Finished Airing" : m.status === "NOT_YET_RELEASED" ? "Not yet aired" : (m.status || ""),
    url: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    members: m.popularity,
    favorites: m.favourites,
    genres: m.genres || [],
    season: m.season ? String(m.season).toLowerCase() : null,
 // raw escape hatch
    _raw: m,
    images: {
      jpg: {
        large_image_url: m.coverImage?.large || m.coverImage?.medium || m.bannerImage || null,
        image_url: m.coverImage?.medium || m.coverImage?.large || null,
      },
    },
  };
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  averageScore
  episodes
  description(asHtml: false)
  seasonYear
  season
  format
  status
  siteUrl
  popularity
  favourites
  genres
  rankings { rank type allTime }
  coverImage { large medium extraLarge }
  bannerImage
`;

// -- fetchers (each returns an array of normalized items unless noted) --------
async function searchAnime(query, perPage = 15) {
  const key = `al:search:${query.toLowerCase()}:${perPage}`;
  if (cache.has(key)) return cache.get(key);
  const data = await gql(
    `query ($q: String, $n: Int) {
      Page(page: 1, perPage: $n) {
        media(type: ANIME, search: $q, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { q: query, n: perPage },
  );
  const list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (list.length) cache.set(key, list);
  return list;
}

async function trending(perPage = 20) {
  const key = `al:trending:${perPage}`;
  if (cache.has(key)) return cache.get(key);
  const data = await gql(
    `query ($n: Int) {
      Page(page: 1, perPage: $n) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { n: perPage },
  );
  const list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (list.length) cache.set(key, list);
  return list;
}

function currentSeason() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  let season = "WINTER";
  if (m >= 3 && m <= 5) season = "SPRING";
  else if (m >= 6 && m <= 8) season = "SUMMER";
  else if (m >= 9 && m <= 11) season = "FALL";
  return { season, year: y };
}

function nextSeason() {
  const { season, year } = currentSeason();
  const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const i = order.indexOf(season);
  if (i === 3) return { season: "WINTER", year: year + 1 };
  return { season: order[i + 1], year };
}

async function airing(perPage = 20) {
 // Jikan "seasons/now" ≈ this season, currently releasing, popular first.
  const { season, year } = currentSeason();
  const key = `al:airing:${season}${year}:${perPage}`;
  if (cache.has(key)) return cache.get(key);
  let data = await gql(
    `query ($s: MediaSeason, $y: Int, $n: Int) {
      Page(page: 1, perPage: $n) {
        media(type: ANIME, season: $s, seasonYear: $y, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { s: season, y: year, n: perPage },
  ).catch(() => null);
  let list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (!list.length) {
 // season boundary safety net: anything releasing right now
    data = await gql(
      `query ($n: Int) {
        Page(page: 1, perPage: $n) {
          media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { n: perPage },
    );
    list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  }
  if (list.length) cache.set(key, list);
  return list;
}

async function upcoming(perPage = 15) {
  const { season, year } = nextSeason();
  const key = `al:upcoming:${season}${year}:${perPage}`;
  if (cache.has(key)) return cache.get(key);
  const data = await gql(
    `query ($s: MediaSeason, $y: Int, $n: Int) {
      Page(page: 1, perPage: $n) {
        media(type: ANIME, season: $s, seasonYear: $y, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { s: season, y: year, n: perPage },
  ).catch(() => null);
  let list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (!list.length) {
    const data2 = await gql(
      `query ($n: Int) {
        Page(page: 1, perPage: $n) {
          media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
        }
      }`,
      { n: perPage },
    );
    list = (data2?.Page?.media || []).map(normMedia).filter(Boolean);
  }
  if (list.length) cache.set(key, list);
  return list;
}

async function top(perPage = 25) {
  const key = `al:top:${perPage}`;
  if (cache.has(key)) return cache.get(key);
  const data = await gql(
    `query ($n: Int) {
      Page(page: 1, perPage: $n) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { n: perPage },
  );
  const list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (list.length) cache.set(key, list);
  return list;
}

async function randomAnime() {
 // AniList has no server-side random - sample a random slice of the
 // popularity-ordered catalog and pick one item from it.
  const page = 1 + Math.floor(Math.random() * 120);
  const data = await gql(
    `query ($p: Int) {
      Page(page: $p, perPage: 50) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { p: page },
  );
  const list = (data?.Page?.media || []).map(normMedia).filter(Boolean);
  if (!list.length) throw new Error("Random pick came back empty");
  return list[Math.floor(Math.random() * list.length)];
}

async function studioAnime(name, perPage = 15) {
  const key = `al:studio:${name.toLowerCase()}:${perPage}`;
  if (cache.has(key)) return cache.get(key);
 // UPDATE: real studio search - the old Jikan handler searched anime by
 // the studio's NAME (wrong data). AniList has a first-class Studio entity.
  const data = await gql(
    `query ($s: String, $n: Int) {
      Studio(search: $s) {
        name
        media(perPage: $n, sort: POPULARITY_DESC, isMain: true) {
          nodes { ${MEDIA_FIELDS} }
        }
      }
    }`,
    { s: name, n: perPage },
  );
  const st = data?.Studio;
  if (!st) return [];
  const list = (st.media?.nodes || []).map(normMedia).filter(Boolean);
  if (list.length) cache.set(key, list);
  return list;
}

// -- watch-link resolver (replaces dead anikai.to) ----------------------------
// anikai.to's DNS is gone (ERR_NAME_NOT_RESOLVED from both boxes, its domain
 // was parked) and the Node-side resolver also had a broken cheerio selector
// ('aref*=...'). Watch links now come from AniList's own externalLinks, which
// lists the OFFICIAL streaming pages (Crunchyroll, Netflix, etc.) per anime.
const STREAMING_SITES = [
  "crunchyroll", "netflix", "hulu", "funimation", "amazon", "prime video",
  "disney", "bilibili", "hidive", "muse asia", "muse", "netflix anime",
  "iq.com", "wetv", "viki", "ani-one", "ani-one asia", "tencent",
  "youtube", "hbo max", "max", "adn", "animation digital network",
];

async function getWatchLink(title) {
  if (!title) return null;
  const key = `al:watch:${title.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const data = await gql(
      `query ($q: String) {
        Media(type: ANIME, search: $q) {
          siteUrl
          externalLinks { site url type }
        }
      }`,
      { q: title },
      10000,
    );
    const media = data?.Media;
    let link = media?.siteUrl || null;
    if (media?.externalLinks?.length) {
      const streaming = media.externalLinks.find(
        (l) =>
          l.type === "STREAMING" &&
          STREAMING_SITES.some((s) => (l.site || "").toLowerCase().includes(s)),
      );
      link = streaming?.url || media.externalLinks[0]?.url || link;
    }
    if (link) {
      cache.set(key, link, { ttl: 1000 * 60 * 60 * 24 });
      return link;
    }
  } catch (err) {
    console.error("[AniList] watch-link resolve failed:", err.message);
  }
 // Last resort: AniList search page (always resolves)
  return `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`;
}

module.exports = {
  searchAnime,
  trending,
  airing,
  upcoming,
  top,
  randomAnime,
  studioAnime,
  getWatchLink,
  normMedia,
  stripHtml,
 // aliases for Jikan-era call sites
  getAnikaiBestMatch: getWatchLink, // compat alias - old name, new engine
};
