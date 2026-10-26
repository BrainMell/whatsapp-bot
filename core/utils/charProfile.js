// ===============================================
// CHARPROFILE.JS - Fandom character profile mode
// 2026-10-26 (owner brief): "add a character profile mode that shows basic
// info on a character using fandom wiki".
//
//   .j charprofile <name>            -> auto-detect the wiki, profile card
//   .j charprofile naruto itachi     -> pin the franchise first (faster)
//   .j powerscale profile <name>     -> same mode, powerscale entry point
//   reply a number                   -> pick between wiki/article matches
//
// Data: per-wiki MediaWiki API (api.php action=parse) - the SAME access path
// vsbFeats already proves works from both boxes (static.wikia images still
// relayed through wsrv.nl because the CDN 403s datacenter IPs).
// Extracts the PORTABLE INFOBOX (labels+values), falls back to legacy
// <table class="infobox"> rows. No LLM, no scraping of api.fandom.com
// (Cloudflare-challenged from datacenter IPs - verified 2026-10-26).
// ===============================================

const axios = require("axios");
const https = require("https");
const vsb = require("./vsbFeats");

const UA = "WA-Bot/1.0 (charprofile; fandom wiki profiles)";
// IPv4-only: the boxes resolve AAAA but have no v6 egress (vsbFeats finding)
const V4_AGENT = new https.Agent({ family: 4, keepAlive: true });

const SEP = "━━━━━━━━━━━━━━━━━━━━";
const LINE_LIMIT = 3500;

// ---------- wiki registry ----------
// Tier 1 = franchises people actually ask for first; searched in every
// auto-detect round. Tier 2 only runs when tier 1 finds nothing strong, so
// a typical lookup costs ~12 tiny API calls, not 30.
const WIKIS = [
    // tier 1
    { domain: "dragonball.fandom.com", aliases: ["dragon ball", "dragonball", "dbz", "db", "db super", "dragon ball super", "gt"], label: "Dragon Ball" },
    { domain: "naruto.fandom.com", aliases: ["naruto", "boruto"], label: "Naruto" },
    { domain: "onepiece.fandom.com", aliases: ["one piece", "op"], label: "One Piece" },
    { domain: "bleach.fandom.com", aliases: ["bleach"], label: "Bleach" },
    { domain: "dc.fandom.com", aliases: ["dc", "dceu", "dc comics", "batman"], label: "DC" },
    { domain: "marvel.fandom.com", aliases: ["marvel", "mcu", "avengers"], label: "Marvel" },
    { domain: "myheroacademia.fandom.com", aliases: ["mha", "my hero academia", "boku no hero", "bnha"], label: "My Hero Academia" },
    { domain: "jujutsu-kaisen.fandom.com", aliases: ["jjk", "jujutsu kaisen"], label: "Jujutsu Kaisen" },
    { domain: "kimetsu-no-yaiba.fandom.com", aliases: ["demon slayer", "kimetsu", "kimetsu no yaiba"], label: "Demon Slayer" },
    { domain: "attackontitan.fandom.com", aliases: ["aot", "attack on titan", "shingeki", "snk"], label: "Attack on Titan" },
    { domain: "pokemon.fandom.com", aliases: ["pokemon", "pokémon", "pkmn"], label: "Pokémon" },
    { domain: "starwars.fandom.com", aliases: ["star wars", "sw", "jedi"], label: "Star Wars" },
    // tier 2
    { domain: "harrypotter.fandom.com", aliases: ["harry potter", "hogwarts", "hp"], label: "Harry Potter" },
    { domain: "lotr.fandom.com", aliases: ["lotr", "lord of the rings", "middle earth"], label: "Lord of the Rings" },
    { domain: "avatar.fandom.com", aliases: ["avatar", "atla", "korra", "avatar the last airbender"], label: "Avatar" },
    { domain: "gameofthrones.fandom.com", aliases: ["got", "game of thrones", "asoiaf"], label: "Game of Thrones" },
    { domain: "fairytail.fandom.com", aliases: ["fairy tail", "fairytail"], label: "Fairy Tail" },
    { domain: "hunterxhunter.fandom.com", aliases: ["hxh", "hunter x hunter", "hunterxhunter"], label: "Hunter x Hunter" },
    { domain: "onepunchman.fandom.com", aliases: ["opm", "one punch man", "onepunchman"], label: "One Punch Man" },
    { domain: "swordartonline.fandom.com", aliases: ["sao", "sword art online"], label: "Sword Art Online" },
    { domain: "tokyoghoul.fandom.com", aliases: ["tokyo ghoul", "tg"], label: "Tokyo Ghoul" },
    { domain: "genshin-impact.fandom.com", aliases: ["genshin", "genshin impact"], label: "Genshin Impact" },
    { domain: "leagueoflegends.fandom.com", aliases: ["lol", "league", "league of legends"], label: "League of Legends" },
    { domain: "overwatch.fandom.com", aliases: ["overwatch", "ow"], label: "Overwatch" },
    { domain: "danganronpa.fandom.com", aliases: ["danganronpa", "dr"], label: "Danganronpa" },
    { domain: "chainsaw-man.fandom.com", aliases: ["csm", "chainsaw man"], label: "Chainsaw Man" },
    { domain: "solo-leveling.fandom.com", aliases: ["solo leveling", "sololeveling"], label: "Solo Leveling" },
    { domain: "berserk.fandom.com", aliases: ["berserk"], label: "Berserk" },
    { domain: "steven-universe.fandom.com", aliases: ["su", "steven universe"], label: "Steven Universe" },
    { domain: "percyjackson.fandom.com", aliases: ["pj", "percy jackson"], label: "Percy Jackson" },
];
const TIER1_COUNT = 12;

// alias lookup: token span (longest first) -> wiki
// 💡 FIX (QA 2026-10-26): the span scan previously capped at
// `start + take <= tokens.length - 1`, which made the LAST token of the
// query unreachable — "itachi from naruto" could never pin the naruto wiki
// because "naruto" sits at the end. Bounds now cover the full query; a span
// that consumes EVERY token (".j charprofile naruto") still falls through to
// auto-detect because the remaining character name would be empty.
function findPinnedWiki(tokens) {
    for (let take = Math.min(3, tokens.length); take >= 1; take--) {
        for (let start = 0; start + take <= tokens.length; start++) {
            const span = tokens.slice(start, start + take).join(" ").toLowerCase();
            for (const w of WIKIS) {
                if (w.aliases.includes(span)) {
                    const rest = tokens.slice(0, start).concat(tokens.slice(start + take)).join(" ").trim();
                    // "naruto itachi" / "itachi naruto" both pin; the franchise
                    // words are removed wherever they sit
                    if (rest) return { wiki: w, name: rest };
                }
            }
        }
    }
    return null;
}

// ---------- MW helpers (per-wiki api.php) ----------

function wikiApi(domain, params, timeoutMs = 12000) {
    return axios
        .get(`https://${domain}/api.php`, {
            params: { format: "json", formatversion: 2, ...params },
            timeout: timeoutMs,
            headers: { "User-Agent": UA },
            httpAgent: V4_AGENT,
            httpsAgent: V4_AGENT,
            maxRedirects: 5,
            validateStatus: (s) => s === 200,
        })
        .then((r) => r.data);
}

function decodeEntities(s) {
    return String(s || "")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;|&#x27;/g, "'")
        .replace(/\s+/g, " ");
}

function htmlToText(html) {
    return decodeEntities(
        String(html || "")
            .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<ruby>([\s\S]*?)<\/ruby>/gi, "$1")
            .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, "")
            .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
            .replace(/<br\s*\/?>/gi, " · ")
            .replace(/<[^>]+>/g, " ")
    )
        .replace(/\s*·\s*(?:\s*·\s*)+/g, " · ")
        .replace(/\s+/g, " ")
        .trim();
}

// ---------- wiki auto-detect ----------

async function searchOneWiki(domain, name) {
    const data = await wikiApi(domain, {
        action: "query",
        list: "search",
        srsearch: name,
        srlimit: 3,
        srnamespace: 0,
    });
    return (data.query && data.query.search) || [];
}

function scoreTitle(title, name) {
    const t = title.toLowerCase();
    const n = name.toLowerCase().trim();
    if (t === n) return 100;
    if (t.startsWith(`${n} `) || t.startsWith(`${n},`) || t.startsWith(`${n}(`)) return 88;
    if (t.replace(/\(.*\)/, "").trim() === n) return 90;
    if (t.includes(n)) return 62;
    return 0;
}

/**
 * Cross-wiki detection. Tier 1 first; tier 2 only if tier 1 has no hit
 * scoring >= 62. Returns [{ wiki, title, snippet, score }] sorted best-first.
 */
async function detectWiki(name) {
    const runTier = async (tier) => {
        // tier 1 = first TIER1_COUNT wikis; tier 2 = the REST ONLY (re-running
        // tier 1 would double the API calls for zero new information)
        const wikis = tier === 1 ? WIKIS.slice(0, TIER1_COUNT) : WIKIS.slice(TIER1_COUNT);
        const results = await Promise.allSettled(
            wikis.map(async (w) => {
                const hits = await searchOneWiki(w.domain, name);
                let best = null;
                for (const h of hits) {
                    const sc = scoreTitle(h.title, name);
                    if (sc > 0 && (!best || sc > best.score)) {
                        best = { wiki: w, title: h.title, snippet: htmlToText(h.snippet || "").slice(0, 130), score: sc };
                    }
                }
                return best;
            })
        );
        return results
            .filter((r) => r.status === "fulfilled" && r.value)
            .map((r) => r.value)
            .sort((a, b) => b.score - a.score);
    };

    const tier1 = await runTier(1);
    if (tier1.length) return tier1;
    try {
        return await runTier(2);
    } catch (e) {
        console.log(`[CharProfile] tier-2 detect failed: ${e.message}`);
        return [];
    }
}

// ---------- page parse -> profile ----------

// field display priority (normalized labels); unlisted fields follow in page order
const FIELD_PRIORITY = [
    "real name", "birth name", "full name", "name",
    "alias", "aliases", "nickname", "nicknames",
    "species", "race",
    "gender", "sex",
    "age",
    "birthday", "date of birth", "born",
    "status",
    "height", "weight",
    "occupation", "occupations", "affiliation", "affiliations", "team", "teams",
    "relatives", "family", "family and friends", "relationships",
    "home", "homeworld", "origin", "residence", "home planet", "hometown",
    "debut", "first appearance", "first app", "manga debut", "anime debut", "appeared in",
    "voiced by", "japanese voice", "english voice", "voice actor", "seiyuu",
    "creator", "created by",
    "eye color", "hair color", "blood type",
    "ability", "abilities", "power", "powers", "skills", "weapons", "equipment",
];

function normalizeLabel(label) {
    return htmlToText(label).toLowerCase().replace(/[:\s]+$/, "").replace(/\s+/g, " ").trim();
}

function fieldPriority(label) {
    const i = FIELD_PRIORITY.indexOf(normalizeLabel(label));
    return i === -1 ? 500 : i;
}

/**
 * PURE extraction (QA feeds fixture HTML): page HTML -> { fields, imageUrl, description }.
 * Portable infobox first, legacy table fallback, description = first real paragraph.
 */
function extractProfileFromHtml(html) {
    const fields = [];
    const seen = new Set();
    const push = (label, value) => {
        const l = htmlToText(label).trim();
        const v = htmlToText(value).trim();
        if (!l || !v || v.length < 1) return;
        if (l.length > 40 || v.length > 260) return;
        const key = l.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        fields.push({ label: l.replace(/\s+/g, " "), value: v });
    };

    // --- portable infobox (<aside class="portable-infobox">) ---
    const asideM = html.match(/<aside[^>]*class="[^"]*portable-infobox[^"]*"[\s\S]*?<\/aside>/i);
    if (asideM) {
        const aside = asideM[0];
        const itemRe = /<h3[^>]*class="[^"]*pi-data-label[^"]*"[^>]*>([\s\S]*?)<\/h3>\s*<div[^>]*class="[^"]*pi-data-value[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let m;
        while ((m = itemRe.exec(aside)) !== null) push(m[1], m[2]);
        // tabbed groups ("pi-smart-data-label/value") missed by the strict pair regex
        const smartRe = /<h3[^>]*class="[^"]*pi-smart-data-label[^"]*"[^>]*>([\s\S]*?)<\/h3>\s*<div[^>]*class="[^"]*pi-smart-data-value[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        while ((m = smartRe.exec(aside)) !== null) push(m[1], m[2]);
    }

    // --- legacy infobox table fallback ---
    if (!fields.length) {
        const tableM = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[\s\S]*?<\/table>/i);
        if (tableM) {
            const rowRe = /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
            let m;
            while ((m = rowRe.exec(tableM[0])) !== null) push(m[1], m[2]);
        }
    }

    // --- image: first infobox figure / article image ---
    let imageUrl = null;
    const scoped = asideM ? asideM[0] : html;
    const imgM =
        scoped.match(/<figure[^>]*>[\s\S]*?<img[^>]*src="(https:\/\/static\.wikia\.nocookie\.net[^"]+)"/i) ||
        scoped.match(/<img[^>]*src="(https:\/\/static\.wikia\.nocookie\.net[^"]+\/scale-to-width-down\/[^"]+)"/i) ||
        html.match(/<figure[^>]*>[\s\S]*?<img[^>]*src="(https:\/\/static\.wikia\.nocookie\.net[^"]+)"/i);
    if (imgM) imageUrl = imgM[1];

    // --- description: first real paragraph outside infobox/table markup ---
    const stripped = html
        .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
        .replace(/<table[\s\S]*?<\/table>/gi, " ");
    let description = "";
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let p;
    while ((p = pRe.exec(stripped)) !== null) {
        const t = htmlToText(p[1]);
        if (t.length >= 60) {
            description = t.slice(0, 420);
            break;
        }
    }

    return { fields, imageUrl, description };
}

const PROFILE_CACHE = new Map(); // "domain::title" -> { at, data }
const CACHE_TTL = 30 * 60 * 1000;

async function parseProfile(wiki, title) {
    const key = `${wiki.domain}::${title}`;
    const cached = PROFILE_CACHE.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

    const data = await wikiApi(wiki.domain, { action: "parse", page: title, prop: "text", redirects: 1 }, 20000);
    if (!data || !data.parse || !data.parse.text) return null;

    const realTitle = data.parse.title || title;
    const extracted = extractProfileFromHtml(data.parse.text);
    extracted.fields.sort((a, b) => fieldPriority(a.label) - fieldPriority(b.label));

    const out = {
        name: realTitle,
        wikiDomain: wiki.domain,
        wikiLabel: wiki.label,
        pageUrl: `https://${wiki.domain}/wiki/${encodeURIComponent(realTitle).replace(/%28/g, "(").replace(/%29/g, ")")}`,
        imageUrl: extracted.imageUrl,
        fields: extracted.fields.slice(0, 12),
        description: extracted.description,
    };
    PROFILE_CACHE.set(key, { at: Date.now(), data: out });
    if (PROFILE_CACHE.size > 80) {
        const oldest = PROFILE_CACHE.keys().next().value;
        PROFILE_CACHE.delete(oldest);
    }
    return out;
}

// ---------- formatting ----------

const FIELD_ICONS = [
    [/^(real name|birth name|full name)/, "📛"],
    [/^(alias|aliases|nickname)/, "🎭"],
    [/^(species|race)/, "🧬"],
    [/^gender/, "🚻"],
    [/^age\b/, "⏳"],
    [/^(birthday|date of birth|born)/, "🎂"],
    [/^status/, "📍"],
    [/^height/, "📏"],
    [/^weight/, "⚖️"],
    [/^occupation/, "⚔️"],
    [/^affiliation|^team/, "🛡️"],
    [/^relatives|^family/, "👪"],
    [/^(home|origin|residence|hometown)/, "🏠"],
    [/debut|first appearance|appeared in/, "🎬"],
    [/voiced|seiyuu|voice/, "🎙️"],
    [/^creator|^created by/, "✍️"],
    [/eye color/, "👁️"],
    [/hair color/, "💈"],
    [/blood type/, "🩸"],
    [/^(ability|abilities|power|powers|skills)/, "✨"],
    [/^(weapons|equipment)/, "🗡️"],
];

function fieldIcon(label) {
    const l = label.toLowerCase();
    for (const [re, icon] of FIELD_ICONS) if (re.test(l)) return icon;
    return "▪️";
}

function formatProfileCard(profile, autoPickHint) {
    const lines = [];
    lines.push(`🪪 *CHARACTER PROFILE*`);
    lines.push(`*${profile.name}*`);
    lines.push(`🌐 _${profile.wikiLabel} — ${profile.wikiDomain}_`);
    lines.push(SEP);
    for (const f of profile.fields) {
        lines.push(`${fieldIcon(f.label)} *${f.label}:* ${f.value.length > 150 ? `${f.value.slice(0, 149).trimEnd()}…` : f.value}`);
    }
    if (!profile.fields.length) lines.push(`_No infobox found on this page._`);
    if (profile.description) {
        lines.push("");
        lines.push(`📖 _${profile.description}_`);
    }
    lines.push(SEP);
    lines.push(`🔗 ${profile.pageUrl.replace(/^https?:\/\//, "")}`);
    if (autoPickHint) lines.push(autoPickHint);
    return lines.join("\n").slice(0, LINE_LIMIT);
}

function formatMatchList(name, candidates) {
    const lines = [];
    lines.push(`🪪 *${candidates.length} Fandom match${candidates.length > 1 ? "es" : ""} for "${name.slice(0, 40)}"*`);
    lines.push("");
    candidates.slice(0, 10).forEach((c, i) => {
        lines.push(`*${i + 1}.* ${c.title.slice(0, 60)} — _${c.wiki.label}_`);
    });
    lines.push("");
    lines.push(`_Reply with a *number* (1-${Math.min(candidates.length, 10)}) within 5 minutes._`);
    return lines.join("\n");
}

// ---------- pending pick sessions ----------

const pendingProfiles = new Map(); // chatId -> session
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000;

function touchSession(s) {
    s.timestamp = Date.now();
}

function armAutoClear(chatId) {
    setTimeout(() => {
        const s = pendingProfiles.get(chatId);
        if (s && Date.now() - s.timestamp >= SELECTION_TIMEOUT_MS - 1000) {
            pendingProfiles.delete(chatId);
        }
    }, SELECTION_TIMEOUT_MS);
}

function hasPendingSelection(chatId) {
    const s = pendingProfiles.get(chatId);
    if (!s) return false;
    if (Date.now() - s.timestamp > SELECTION_TIMEOUT_MS) {
        pendingProfiles.delete(chatId);
        return false;
    }
    return true;
}

function profileCardResult(profile, session) {
    const others = session && session.candidates && session.candidates.length > 1
        ? `_💡 reply *2-${Math.min(session.candidates.length, 10)}* to see another match_`
        : null;
    return {
        success: true,
        mode: "card",
        name: profile.name,
        pageUrl: profile.pageUrl,
        imageUrl: profile.imageUrl,
        imageUrls: [],
        message: formatProfileCard(profile, others),
        detail: null,
        autoPickHint: null,
        data: null, // no VS stat map — sendCard's compactCaption guards on this
    };
}

/**
 * Numeric reply router for profile sessions.
 * @returns {Promise<Object|null>} null when no pending session
 */
async function handleProfileSelection(chatId, selection) {
    const session = pendingProfiles.get(chatId);
    if (!session) return null;

    if (Date.now() - session.timestamp > SELECTION_TIMEOUT_MS) {
        pendingProfiles.delete(chatId);
        return { success: false, error: "Selection timed out — search again!" };
    }
    touchSession(session);

    const idx = parseInt(selection, 10);

    // 💡 RACE (powerscale pattern): a number typed while the wiki search is
    // still running gets BUFFERED and auto-applied when the candidates land.
    if (session.phase === "searching") {
        if (!isNaN(idx) && idx >= 1 && idx <= 10) {
            session.bufferedPick = idx;
            session.timestamp = Date.now();
            console.log(`[CharProfile] pick buffered (search in flight): chat=${chatId} n=${idx}`);
            return { success: true, mode: "buffered" };
        }
        return { success: false, error: "Still searching — one moment, then reply with your number." };
    }

    const max = Math.min(session.candidates ? session.candidates.length : 10, 10);
    if (isNaN(idx) || idx < 1 || idx > max) {
        return { success: false, error: `Pick a number between 1 and ${max}.` };
    }

    const chosen = session.candidates[idx - 1];
    session.pickedId = idx;
    console.log(`[CharProfile] numeric pick: chat=${chatId} n=${idx} -> "${chosen.title}" (${chosen.wiki.domain})`);

    const profile = await parseProfile(chosen.wiki, chosen.title).catch((e) => {
        console.log(`[CharProfile] parse failed: ${chosen.title}@${chosen.wiki.domain}: ${e.message}`);
        return null;
    });
    if (!profile) {
        return { success: false, error: `Failed to load *${chosen.title}* from ${chosen.wiki.label}. Try another number.` };
    }
    session.phase = "view";
    session.profile = profile;
    session.data = profile;
    return profileCardResult(profile, session);
}

// ---------- entry ----------

/**
 * Handle ".j charprofile ..." / ".j powerscale profile ..." end-to-end.
 * @param {Object} ctx { sock, chatId, msgKey, raw, botMarker, prefix }
 */
async function runCharProfileCommand(ctx) {
    const { sock, chatId, msgKey, botMarker } = ctx;
    const react = (t) => sock.sendMessage(chatId, { react: { text: t, key: msgKey } }).catch(() => {});

    const raw = String(ctx.raw || "").trim();
    if (!raw) {
        const lines = [
            "🪪 *CHARACTER PROFILE*",
            SEP,
            `*charprofile <name>* — basic info from the matching Fandom wiki`,
            `*charprofile <franchise> <name>* — pin the wiki (e.g. *charprofile naruto itachi*)`,
            "",
            `*Franchises:* dragon ball · naruto · one piece · bleach · dc · marvel · mha · jjk · demon slayer · aot · pokemon · star wars · and more`,
            `_alias:_ *powerscale profile <name>* _works too_`,
            SEP,
            `🌐 fandom.com`,
        ];
        return sock.sendMessage(chatId, { text: `${botMarker}${lines.join("\n")}` });
    }

    // arm a searching session FIRST (buffer early numbers, powerscale-style)
    pendingProfiles.set(chatId, { phase: "searching", raw, timestamp: Date.now() });
    armAutoClear(chatId);

    await react("🔍");
    await sock.sendMessage(chatId, {
        text: `${botMarker}🪪 *Fandom profile* — searching for _"${raw.slice(0, 40)}"_…`,
    });

    // pin / detect
    let candidates = [];
    const tokens = raw.split(/\s+/);
    const pinned = findPinnedWiki(tokens);
    try {
        if (pinned) {
            const hits = await searchOneWiki(pinned.wiki.domain, pinned.name);
            candidates = hits
                .map((h) => ({ wiki: pinned.wiki, title: h.title, snippet: htmlToText(h.snippet || "").slice(0, 130), score: scoreTitle(h.title, pinned.name) }))
                .filter((c) => c.score > 0)
                .sort((a, b) => b.score - a.score);
            console.log(`[CharProfile] pinned wiki ${pinned.wiki.domain} for "${pinned.name}" -> ${candidates.length} hits`);
        } else {
            candidates = await detectWiki(raw);
            console.log(`[CharProfile] auto-detect "${raw}" -> ${candidates.length} candidates across wikis`);
        }
    } catch (e) {
        console.error("[CharProfile] detect failed:", e.message);
        pendingProfiles.delete(chatId);
        await react("❌");
        return sock.sendMessage(chatId, { text: `${botMarker}❌ Fandom lookup failed — try again in a moment.` });
    }

    if (!candidates.length) {
        pendingProfiles.delete(chatId);
        await react("❌");
        return sock.sendMessage(chatId, {
            text: `${botMarker}❌ Couldn't find *${raw.slice(0, 40)}* on any major Fandom wiki.\n_Try pinning the franchise: *charprofile naruto itachi*_`,
        });
    }

    const applyPick = async (n) => {
        const chosen = candidates[n - 1];
        const profile = await parseProfile(chosen.wiki, chosen.title).catch(() => null);
        if (!profile) return null;
        const session = pendingProfiles.get(chatId);
        if (session) {
            session.phase = "view";
            session.candidates = candidates;
            session.profile = profile;
            session.pickedId = n;
            session.timestamp = Date.now();
        } else {
            pendingProfiles.set(chatId, {
                phase: "view",
                candidates,
                profile,
                pickedId: n,
                timestamp: Date.now(),
            });
            armAutoClear(chatId);
        }
        return profileCardResult(profile, session);
    };

    // single strong match (or single match at all) -> straight to the card
    if (candidates.length === 1 || candidates[0].score >= 88) {
        const result = await applyPick(1);
        if (result) {
            await react("🪪");
            await sendProfileCard(sock, chatId, botMarker, result);
            await react("✅");
            return;
        }
        // fall through to the list when the top pick fails to parse
    }

    // ambiguous -> numbered list (numbers keep working via engine hook)
    const session = pendingProfiles.get(chatId);
    if (session) {
        session.phase = "pick";
        session.candidates = candidates;
        session.timestamp = Date.now();
    } else {
        pendingProfiles.set(chatId, { phase: "pick", candidates, timestamp: Date.now() });
        armAutoClear(chatId);
    }

    // a number typed mid-search applies instantly (powerscale race pattern)
    const bp = session && session.bufferedPick;
    if (bp && bp >= 1 && bp <= Math.min(candidates.length, 10)) {
        delete session.bufferedPick;
        const result = await applyPick(bp);
        if (result) {
            console.log(`[CharProfile] buffered pick applied: chat=${chatId} n=${bp}`);
            await react("🪪");
            await sendProfileCard(sock, chatId, botMarker, result);
            await react("✅");
            return;
        }
    }

    await react("📋");
    return sock.sendMessage(chatId, { text: `${botMarker}${formatMatchList(raw, candidates)}` });
}

async function sendProfileCard(sock, chatId, botMarker, result) {
    let imagePayload = null;
    if (result.imageUrl) {
        imagePayload = await vsb.fetchImageBuffer(result.imageUrl, 640);
    }
    const fullText = `${botMarker}${result.message}`;
    if (imagePayload) {
        try {
            if (fullText.length <= 1000) {
                await sock.sendMessage(chatId, { image: imagePayload.buffer, caption: fullText });
            } else {
                // WA caption cap — compact header next to the image, the full
                // profile card follows as a text bubble (nothing gets lost)
                const header = fullText.split("\n").slice(0, 4).join("\n");
                await sock.sendMessage(chatId, { image: imagePayload.buffer, caption: header.slice(0, 1000) });
                await sock.sendMessage(chatId, { text: fullText.slice(0, 3500) });
            }
            return;
        } catch (e) {
            console.log(`[CharProfile] image send failed (${e.message}) - falling back to text`);
        }
    }
    await sock.sendMessage(chatId, { text: fullText.slice(0, 6000) });
}

module.exports = {
    runCharProfileCommand,
    handleProfileSelection,
    hasPendingSelection,
    // internals exposed for QA
    pendingProfiles,
    WIKIS,
    detectWiki,
    extractProfileFromHtml,
    findPinnedWiki,
    parseProfile,
    formatProfileCard,
    formatMatchList,
    SELECTION_TIMEOUT_MS,
};
