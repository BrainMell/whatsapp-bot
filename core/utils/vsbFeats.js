// ===============================================
// VSBFEATS.JS - VS Battles Wiki direct integration
// (MediaWiki API parse layer for powerscale)
//
// WHY THIS EXISTS (2026-10-18, owner brief):
// 1. Character images: static.wikia.nocookie.net 403-blocks datacenter IPs
//    (verified on both boxes - every UA/variant). The old engine fetch could
//    NEVER work. Fix: relay through wsrv.nl (IPv4 forced - the boxes have no
//    working v6 egress), which fetches server-side and re-serves as JPEG.
// 2. Feats: the Go service strips the parenthetical justifications from the
//    stat values (Maki's real Speed value carries "(Can cut and dodge rubber
//    bullets)" etc; Go returned the bare rating). The MediaWiki parse gives
//    the FULL value incl. feats + User_blog calc links -> per-category
//    deep-dives (.j powerscale speed goku) are now possible and reliable.
// ===============================================

const axios = require("axios");
const https = require("https");

const MW_API = "https://vsbattles.fandom.com/api.php";
const UA = "WA-Bot/1.0 (powerscale; +https://vsbattles.fandom.com)";

// IPv4-only agents: the boxes resolve AAAA but have no v6 egress (probed
// 2026-10-18 - wsrv/weserv timed out until -4 was forced).
const V4_AGENT = new https.Agent({ family: 4, keepAlive: true });

// ---------- tiny HTML utils ----------

function decodeEntities(s) {
    return String(s || "")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;|&#x27;/g, "'")
        .replace(/&#95;/g, "_");
}

// strip tags, keep link text, drop <sup> citations and hidden elements
function htmlToText(html) {
    return decodeEntities(
        String(html || "")
            .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, " ") // [Statistical Values 1] refs
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<ruby>([\s\S]*?)<\/ruby>/gi, "$1") // kanji ruby -> base text
            .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, "")
            .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1") // keep anchor text
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
    ).trim();
}

// ---------- category resolution ----------

const CATEGORY_ALIASES = {
    tier: "Tier",
    "attack potency": "Attack Potency",
    ap: "Attack Potency",
    attack: "Attack Potency",
    potency: "Attack Potency",
    offense: "Attack Potency",
    speed: "Speed",
    spd: "Speed",
    durability: "Durability",
    dur: "Durability",
    tank: "Durability",
    defense: "Durability",
    stamina: "Stamina",
    stam: "Stamina",
    energy: "Stamina",
    range: "Range",
    "striking strength": "Striking Strength",
    strike: "Striking Strength",
    striking: "Striking Strength",
    "lifting strength": "Lifting Strength",
    lift: "Lifting Strength",
    lifting: "Lifting Strength",
    intelligence: "Intelligence",
    intel: "Intelligence",
    iq: "Intelligence",
    brain: "Intelligence",
    mind: "Intelligence",
    equipment: "Standard Equipment",
    gear: "Standard Equipment",
    weapon: "Standard Equipment",
    weapons: "Standard Equipment",
    equip: "Standard Equipment",
    "standard equipment": "Standard Equipment",
    weakness: "Weaknesses",
    weaknesses: "Weaknesses",
    weak: "Weaknesses",
    powers: "Powers and Abilities",
    abilities: "Powers and Abilities",
    hax: "Powers and Abilities",
    "powers and abilities": "Powers and Abilities",
    techniques: "Notable Techniques",
    techniques1: "Notable Techniques",
    attacks: "Notable Techniques",
    moves: "Notable Techniques",
    key: "Key",
    keys: "Key",
    versions: "Key",
};

const CATEGORY_ICONS = {
    Tier: "🏅",
    "Attack Potency": "💥",
    Speed: "🏃",
    Durability: "🛡️",
    Stamina: "🔋",
    Range: "📡",
    "Striking Strength": "💪",
    "Lifting Strength": "🏋️",
    Intelligence: "🧠",
    "Standard Equipment": "🎒",
    Weaknesses: "⚠️",
    "Powers and Abilities": "✨",
    "Notable Techniques": "🥋",
    Key: "🧩",
};

/**
 * Split a raw command tail into { category, query }.
 * Accepts category in front ("speed goku") or at the back ("goku speed").
 * "feats" alone is NOT a category - it just means show the overview menu.
 * @returns {{category: string|null, query: string}}
 */
function splitCategory(raw) {
    const text = String(raw || "").trim();
    if (!text) return { category: null, query: "" };
    const tokens = text.split(/\s+/);
    // 1) "feats <name>" / "<name> feats" -> overview mode marker, not a category
    if (tokens.length > 1 && tokens[0].toLowerCase() === "feats") {
        return { category: null, featsOverview: true, query: tokens.slice(1).join(" ") };
    }
    if (tokens.length > 1 && tokens[tokens.length - 1].toLowerCase() === "feats") {
        return { category: null, featsOverview: true, query: tokens.slice(0, -1).join(" ") };
    }
    // 2) multi-word category first ("attack potency goku")
    for (const take of [3, 2]) {
        if (tokens.length > take) {
            const head = tokens.slice(0, take).join(" ").toLowerCase();
            if (CATEGORY_ALIASES[head]) {
                return { category: CATEGORY_ALIASES[head], query: tokens.slice(take).join(" ") };
            }
            const tail = tokens.slice(-take).join(" ").toLowerCase();
            if (CATEGORY_ALIASES[tail]) {
                return { category: CATEGORY_ALIASES[tail], query: tokens.slice(0, -take).join(" ") };
            }
        }
    }
    // 3) single-word category at either end (never eat the whole query)
    if (tokens.length > 1) {
        const first = tokens[0].toLowerCase();
        if (CATEGORY_ALIASES[first]) {
            return { category: CATEGORY_ALIASES[first], query: tokens.slice(1).join(" ") };
        }
        const last = tokens[tokens.length - 1].toLowerCase();
        if (CATEGORY_ALIASES[last]) {
            return { category: CATEGORY_ALIASES[last], query: tokens.slice(0, -1).join(" ") };
        }
    }
    return { category: null, query: text };
}

// ---------- MediaWiki API layer ----------

async function mwRequest(params, timeoutMs = 30000) {
    const res = await axios.get(MW_API, {
        params: { format: "json", formatversion: 2, ...params },
        timeout: timeoutMs,
        headers: { "User-Agent": UA },
        httpAgent: V4_AGENT,
        httpsAgent: V4_AGENT,
        maxRedirects: 5,
        validateStatus: (s) => s === 200,
    });
    return res.data;
}

/**
 * Wiki search. Returns [{ id, name, url }] (same shape the Go service gives).
 */
async function searchCharacters(query, limit = 10) {
    const data = await mwRequest({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: Math.min(limit, 20),
        srnamespace: 0,
    });
    const hits = (data.query && data.query.search) || [];
    return hits.map((h, i) => ({
        id: i + 1,
        name: h.title,
        url: `https://vsbattles.fandom.com/wiki/${encodeURIComponent(h.title).replace(/%28/g, "(").replace(/%29/g, ")")}`,
    }));
}

// ---------- page parse + cache ----------

const PAGE_CACHE = new Map(); // url -> { at, data }
const PAGE_CACHE_TTL = 30 * 60 * 1000; // 30 min
const PAGE_CACHE_MAX = 60;

function cacheGet(url) {
    const e = PAGE_CACHE.get(url);
    if (!e) return null;
    if (Date.now() - e.at > PAGE_CACHE_TTL) {
        PAGE_CACHE.delete(url);
        return null;
    }
    return e.data;
}

function cachePut(url, data) {
    if (PAGE_CACHE.size >= PAGE_CACHE_MAX) {
        const oldest = PAGE_CACHE.keys().next().value;
        PAGE_CACHE.delete(oldest);
    }
    PAGE_CACHE.set(url, { at: Date.now(), data });
}

// universal stat paragraph: <p[any attrs]><b>[<a ...>]Label[:][</a>][:]</b> value</p>
// colon may sit inside the anchor ("<a>Tier:</a></b>", Nightwing style) or
// outside it ("<a>Speed</a>:</b>", Maki style)
const STAT_P_RE = /<p[^>]*>\s*<b>\s*(?:<a[^>]*>)?([\s\S]{2,48}?)(?:<\/a>\s*:\s*<\/b>|:\s*<\/a>\s*<\/b>|:\s*<\/b>)([\s\S]*?)<\/p>/g;

// tab labels (keys/variants): <div class="wds-tabs__tab-label">...</div>
const TAB_LABEL_RE = /<div class="wds-tabs__tab-label"[^>]*>([\s\S]*?)<\/div>/g;

/**
 * Parse one character page into structured data.
 * @param {string} pageUrl - full wiki URL (or /wiki/Title)
 * @returns {Object|null} { name, pageUrl, imageUrl, imageUrls, summary, keyLine,
 *   stats: Map<label, Array<{variant, text, rating, feats[], calcs[]}>>,
 *   categories: string[], isVerse: boolean }
 */
async function parseCharacter(pageUrl) {
    const urlKey = pageUrl;
    const cached = cacheGet(urlKey);
    if (cached) return cached;

    const title = decodeURIComponent(String(pageUrl).split("/wiki/").pop() || "")
        .replace(/_/g, " ")
        .trim();
    if (!title) return null;

    const data = await mwRequest(
        { action: "parse", page: title, prop: "text", redirects: 1 },
        45000
    );
    if (!data || !data.parse || !data.parse.text) return null;

    const html = data.parse.text;
    const out = {
        name: data.parse.title || title,
        pageUrl: `https://vsbattles.fandom.com/wiki/${String(data.parse.title || title).replace(/ /g, "_")}`,
        imageUrl: null,
        imageUrls: [],
        summary: "",
        keyLine: "",
        stats: new Map(),
        categories: [],
        isVerse: false,
    };

    // -- summary: first <p> after the Summary heading --
    const sumIdx = html.search(/<h2><span class="mw-headline" id="Summary">/);
    if (sumIdx > -1) {
        const after = html.slice(sumIdx, sumIdx + 6000);
        const p = after.match(/<p>([\s\S]*?)<\/p>/);
        if (p) {
            out.summary = htmlToText(p[1]).slice(0, 320);
        }
    }

    // -- Powers and Stats block --
    const psIdx = html.search(/<h2><span class="mw-headline" id="Powers_and_Stats">/);
    const psBlock = psIdx > -1 ? html.slice(psIdx, psIdx + 300000) : "";
    const nextH2 = psBlock.slice(20).search(/<h2><span class="mw-headline"/);
    const block = nextH2 > -1 ? psBlock.slice(0, nextH2 + 20) : psBlock;

    // character image: first file figure in the page (P&S tabs carry renders)
    const imgRe = /<figure[^>]*>[\s\S]*?<img[^>]*src="(https:\/\/static\.wikia\.nocookie\.net[^"]+)"[^>]*>/i;
    const imgMatch = html.match(imgRe);
    if (imgMatch) {
        out.imageUrl = imgMatch[1];
        // also collect other renders from the first two tab contents for fallback
        const all = [...html.matchAll(/src="(https:\/\/static\.wikia\.nocookie\.net[^"]+\/scale-to-width-down\/\d+[^"]*)"/g)].map((m) => m[1]);
        out.imageUrls = [...new Set(all)].slice(0, 4);
    }

    if (!block) {
        // verse / item / disambiguation pages have no P&S section
        out.isVerse = true;
        cachePut(urlKey, out);
        return out;
    }

    // -- tab labels in order (variant names) --
    const tabLabels = [...block.matchAll(TAB_LABEL_RE)].map((m) =>
        htmlToText(m[1]).replace(/▾|▸/g, "").trim()
    );

    // canonical Key line - parsed FIRST so pipe-style per-key values can be
    // split into named variants ("Incomplete HR | Complete HR" style pages)
    const keyP = block.match(/<p[^>]*>\s*<b>\s*(?:<a[^>]*>)?Key(?:<\/a>\s*:\s*<\/b>|:\s*<\/a>\s*<\/b>|:\s*<\/b>)([\s\S]*?)<\/p>/);
    if (keyP) out.keyLine = htmlToText(keyP[1]).slice(0, 160);
    const keyNames = out.keyLine
        ? out.keyLine.split(/\s*\|\s*/).map((k) => k.trim()).filter(Boolean)
        : [];

    // -- walk stat paragraphs --
    // variant attribution strategy:
    //   multi-key pages (Key line lists N keys): the Nth occurrence of a stat
    //   label maps to the Nth key (VSBW repeats the stat set per key block).
    //   single-key pages: nearest preceding tab label (outfit tabs etc).
    const stats = new Map(); // label -> [{variant, text, calcs}]
    const occurrence = new Map(); // label -> count seen so far
    let m;
    STAT_P_RE.lastIndex = 0;
    while ((m = STAT_P_RE.exec(block)) !== null) {
        const label = htmlToText(m[1]).trim().replace(/:$/, "");
        const rawHtml = m[2] !== undefined ? m[2] : "";
        if (!label || !rawHtml) continue;
        const labelCanon = label.replace(/\s+/g, " ").trim();

        let tabVariant = "";
        if (keyNames.length <= 1) {
            // nearest preceding tab label (single-key pages only)
            let before = 0;
            let re = /<div class="wds-tabs__tab-label"/g;
            let mm;
            while ((mm = re.exec(block)) !== null) {
                if (mm.index < m.index) before++;
                else break;
            }
            tabVariant = before > 0 && tabLabels[before - 1] ? tabLabels[before - 1] : "";
        }

        // per-key pipe split (Maki-style compact pages)
        let segments = [rawHtml];
        let segVariants = [tabVariant];
        if (keyNames.length > 1 && labelCanon !== "Key") {
            const occ = occurrence.get(labelCanon) || 0;
            const parts = splitTopLevelPipes(rawHtml).map((p) => p.trim()).filter((p) => htmlToText(p).length > 0);
            if (parts.length === keyNames.length) {
                // compact merged-value style: segments = keys
                segments = parts;
                segVariants = keyNames;
            } else {
                // separate paragraph per key block: occurrence-index mapping
                segVariants = [occ < keyNames.length ? keyNames[occ] : ""];
            }
            occurrence.set(labelCanon, occ + 1);
        }

        for (let si = 0; si < segments.length; si++) {
            const segHtml = segments[si];
            // calcs: User_blog links with anchor text
            const calcs = [];
            const calcRe = /<a[^>]*href="(\/wiki\/User_blog:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            let cm;
            while ((cm = calcRe.exec(segHtml)) !== null) {
                const t = htmlToText(cm[2]).trim();
                if (t) calcs.push({ title: t.slice(0, 80), url: `https://vsbattles.fandom.com${cm[1].split("#")[0]}` });
                if (calcs.length >= 3) break;
            }
            const text = htmlToText(segHtml);
            if (!text) continue;
            if (!stats.has(labelCanon)) stats.set(labelCanon, []);
            stats.get(labelCanon).push({ variant: segVariants[si] || "", text, calcs });
        }
    }

    // build rating/feats per entry + Notable Techniques from <h3> section
    for (const [label, entries] of stats) {
        out.categories.push(label);
        for (const e of entries) {
            const parsed = splitRatingAndFeats(e.text);
            e.rating = parsed.rating;
            e.feats = parsed.feats;
        }
    }

    // Notable Attacks/Techniques h3 section (category "Notable Techniques")
    const natIdx = html.search(/<h3><span class="mw-headline" id="(?:Notable_Attacks.2FTechniques|Notable_Techniques)"/);
    if (natIdx > -1) {
        const seg = html.slice(natIdx, natIdx + 60000);
        const endM = seg.slice(30).search(/<h[23]><span class="mw-headline"/);
        const natText = htmlToText(seg.slice(0, endM > -1 ? endM + 30 : undefined));
        if (natText.length > 40) {
            stats.set("Notable Techniques", [
                { variant: "", text: natText.slice(0, 2400), rating: "", feats: natText.split(/(?<=[.;])\s+(?=[A-Z(])/).slice(0, 8).map((s) => s.trim()), calcs: [] },
            ]);
            out.categories.push("Notable Techniques");
        }
    }

    out.stats = stats;
    cachePut(urlKey, out);
    return out;
}

/**
 * "Subsonic travel speed (six months on Snake Way), Supersonic+ with Nimbus (flew X)" ->
 *   { rating: "Subsonic travel speed, Supersonic+ with Nimbus", feats: ["six months...", "flew X"] }
 */
function splitRatingAndFeats(text) {
    const t = String(text || "").trim();
    const feats = [];
    const rating = t.replace(/\(([^()]*)\)/g, (all, inner) => {
        const clean = inner.trim().replace(/^[:;\s]+|[:;\s]+$/g, "");
        if (clean && clean.length > 3) feats.push(clean.slice(0, 300));
        return " ";
    });
    return {
        rating: rating
            .replace(/\s+/g, " ")
            .replace(/\s+,/g, ",")
            .replace(/^[\s,;|]+|[\s,;|]+$/g, "")
            .trim(),
        feats: feats.slice(0, 8),
    };
}

/**
 * Split raw HTML on TOP-LEVEL pipes only ("Incomplete | Complete" per-key
 * values are the standard VSBW compact form). Pipes inside parens, brackets
 * or HTML tags never split.
 */
function splitTopLevelPipes(html) {
    const parts = [];
    let depth = 0;
    let cur = "";
    let inTag = false;
    for (let i = 0; i < html.length; i++) {
        const ch = html[i];
        if (ch === "<") inTag = true;
        if (ch === ">") {
            inTag = false;
            cur += ch;
            continue;
        }
        if (inTag) {
            cur += ch;
            continue;
        }
        if (ch === "(" || ch === "[") depth++;
        if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
        if (ch === "|" && depth === 0) {
            parts.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    parts.push(cur);
    return parts;
}

// ---------- image relay ----------

/**
 * Fetch a character image as a sendable JPEG.
 * static.wikia 403s datacenter IPs -> relay via wsrv.nl / images.weserv.nl
 * (IPv4 forced; the boxes have no v6 egress). Falls back to a direct fetch
 * (works if Fandom ever unblocks, e.g. local dev).
 * @returns {Promise<{buffer, mimetype}|null>}
 */
async function fetchImageBuffer(imageUrl, width = 640) {
    if (!imageUrl) return null;
    const bare = String(imageUrl).replace(/^https?:\/\//, "");
    const relays = [
        `https://wsrv.nl/?url=${encodeURIComponent(bare)}&w=${width}&output=jpg&q=88`,
        `https://images.weserv.nl/?url=${encodeURIComponent(bare)}&w=${width}&output=jpg&q=88`,
    ];
    for (const url of relays) {
        try {
            const res = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 25000,
                maxRedirects: 5,
                headers: { "User-Agent": UA },
                httpAgent: V4_AGENT,
                httpsAgent: V4_AGENT,
            });
            const buf = Buffer.from(res.data);
            if (buf.length > 3000 && isImageMagic(buf)) {
                const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg";
                return { buffer: buf, mimetype: mime };
            }
        } catch (e) {
            console.log(`[vsbFeats] relay miss (${url.slice(8, 24)}...): ${e.message}`);
        }
    }
    // last resort: direct (dev machines / unblocked networks)
    try {
        const res = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 15000,
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", Referer: "https://vsbattles.fandom.com/" },
            httpAgent: V4_AGENT,
            httpsAgent: V4_AGENT,
        });
        const buf = Buffer.from(res.data);
        if (buf.length > 3000 && isImageMagic(buf)) {
            return { buffer: buf, mimetype: buf[0] === 0xff ? "image/jpeg" : "image/png" };
        }
    } catch (e) {
        console.log(`[vsbFeats] direct fetch failed: ${e.message}`);
    }
    return null;
}

function isImageMagic(buf) {
    if (!buf || buf.length < 8) return false;
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const webp = buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
    const gif = buf.slice(0, 3).toString("ascii") === "GIF";
    return jpeg || png || webp || gif;
}

module.exports = {
    splitCategory,
    searchCharacters,
    parseCharacter,
    fetchImageBuffer,
    splitRatingAndFeats,
    splitTopLevelPipes,
    CATEGORY_ALIASES,
    CATEGORY_ICONS,
    htmlToText,
    PAGE_CACHE,
};
