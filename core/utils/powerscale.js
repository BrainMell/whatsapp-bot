// ===============================================
// POWERSCALE.JS - VS Battles powerscale flow
// 2026-10-18 REWRITE (owner brief: better output style, working character
// image, reliable per-category feat lookups):
//   .j powerscale <name>              -> fancy card + character image
//   .j powerscale speed <name>        -> pick list first, then SPEED FEATS card
//   .j powerscale goku speed          -> same, category after the name
//   .j power scale <name>             -> spaced typo now routes here too
//   reply a number                     -> pick character (or switch after card)
// Data: MediaWiki API direct parse (vsbFeats) - full justifications + calc
// links; Go service kept only as search fallback. Images relayed via wsrv.nl
// because static.wikia 403-blocks both boxes (see vsbFeats.js header).
// ===============================================

const goService = require("./goImageService");
const vsb = require("./vsbFeats");

// single-token alias per category for footers/usage ("attack potency" -> ap)
const CATEGORY_SHORT = {
    Tier: "tier",
    "Attack Potency": "ap",
    Speed: "speed",
    Durability: "dur",
    Stamina: "stam",
    Range: "range",
    "Striking Strength": "strike",
    "Lifting Strength": "lift",
    Intelligence: "intel",
    "Standard Equipment": "gear",
    Weaknesses: "weak",
    "Powers and Abilities": "hax",
    "Notable Techniques": "techniques",
    Key: "key",
};

// Pending interactions: chatId -> session
const pendingSelections = new Map();
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const SEP = "━━━━━━━━━━━━━━━━━━━━";
const LINE_LIMIT = 3500; // hard cap for any text body (WhatsApp-safe)

function now() {
    return Date.now();
}

function touch(session) {
    session.timestamp = now();
}

function clearPending(chatId) {
    pendingSelections.delete(chatId);
}

function armAutoClear(chatId) {
    setTimeout(() => {
        const s = pendingSelections.get(chatId);
        if (s && now() - s.timestamp >= SELECTION_TIMEOUT_MS - 1000) {
            pendingSelections.delete(chatId);
        }
    }, SELECTION_TIMEOUT_MS);
}

// ---------- formatting helpers ----------

function clip(s, n) {
    const t = String(s || "").trim();
    if (t.length <= n) return t;
    return `${t.slice(0, n - 1).trimEnd()}…`;
}

function fmtName(data) {
    return data.name || "Unknown";
}

function shortUrl(u) {
    return String(u || "").replace(/^https?:\/\/(www\.)?/, "");
}

// one stat line for the full card: "🏃 *Speed:* Massively FTL+ (+4 feats)"
function statLine(label, entries) {
    if (!entries || !entries.length) return null;
    const e = entries[0];
    const icon = vsb.CATEGORY_ICONS[label] || "▫️";
    const short = label === "Attack Potency" ? "AP" : label === "Standard Equipment" ? "Gear" : label === "Intelligence" ? "Intel" : label === "Striking Strength" ? "Striking" : label === "Lifting Strength" ? "Lifting" : label;
    const extras = [];
    if (e.feats && e.feats.length) extras.push(`+${e.feats.length} feat${e.feats.length > 1 ? "s" : ""}`);
    if (e.calcs && e.calcs.length) extras.push(`${e.calcs.length} calc${e.calcs.length > 1 ? "s" : ""}`);
    const more = entries.length > 1 ? ` · ${entries.length - 1} more variant${entries.length - 1 > 1 ? "s" : ""}` : "";
    const extra = extras.length ? ` _(${extras.join(", ")})_` : "";
    return `${icon} *${short}:* ${clip(e.rating || e.text, 120)}${extra}${more}`;
}

const FULL_CARD_ORDER = [
    "Tier",
    "Attack Potency",
    "Speed",
    "Durability",
    "Striking Strength",
    "Lifting Strength",
    "Stamina",
    "Range",
    "Intelligence",
    "Standard Equipment",
    "Weaknesses",
];

/**
 * Full card - compact (used as image caption)
 */
function formatFullCard(data) {
    const lines = [];
    lines.push(`⚖️ *POWER SCALE*`);
    lines.push(`*${fmtName(data)}*`);
    lines.push(SEP);
    const shown = [];
    for (const label of FULL_CARD_ORDER) {
        const entries = data.stats.get(label);
        const line = statLine(label, entries);
        if (line) {
            lines.push(line);
            shown.push(label);
        }
    }
    if (data.keyLine) lines.push(`🧩 *Keys:* ${clip(data.keyLine, 90)}`);
    if (!shown.length) lines.push(`_No standard stat block found on this page._`);
    lines.push(SEP);
    lines.push(`🔗 ${shortUrl(data.pageUrl)}`);
    lines.push(`_💡 .${global.__PS_PREFIX || "j"} powerscale speed ${clip(fmtName(data), 30)} → speed feats_`);
    return lines.join("\n");
}

/**
 * Full detail message - the meat (sent as text right after the caption)
 */
function formatFullDetail(data) {
    const lines = [];
    lines.push(`📜 *${fmtName(data).toUpperCase()} — FULL STATS*`);
    lines.push("");
    for (const label of FULL_CARD_ORDER) {
        const entries = data.stats.get(label);
        if (!entries || !entries.length) continue;
        const icon = vsb.CATEGORY_ICONS[label] || "▫️";
        const e = entries[0];
        lines.push(`${icon} *${label}*${entries[0].variant ? ` _(${clip(entries[0].variant, 40)})_` : ""}`);
        lines.push(clip(e.rating || e.text, 400));
        for (const f of (e.feats || []).slice(0, 4)) lines.push(`  • ${clip(f, 220)}`);
        for (const c of (e.calcs || []).slice(0, 2)) lines.push(`  📄 calc: ${clip(c.title, 90)}`);
        lines.push("");
        if (lines.join("\n").length > LINE_LIMIT) {
            lines.push(`_…truncated — reply a category name like_ *speed* _for a focused dump_`);
            break;
        }
    }
    if (data.summary) lines.push(`📖 _${clip(data.summary, 300)}_`);
    return lines.join("\n").slice(0, LINE_LIMIT);
}

/**
 * Category deep-dive: ALL variants of one category with feats + calcs
 */
function formatCategoryCard(data, category) {
    const entries = data.stats.get(category) || [];
    const icon = vsb.CATEGORY_ICONS[category] || "🔎";
    const lines = [];
    lines.push(`${icon} *${category.toUpperCase()} — ${fmtName(data).toUpperCase()}*`);
    lines.push(SEP);
    if (!entries.length) {
        lines.push(`_No *${category}* stat found on this page._`);
        const near = data.categories.filter((c) => FULL_CARD_ORDER.includes(c)).slice(0, 8);
        if (near.length) {
            lines.push("");
            lines.push(`_Available stats:_ ${near.join(" · ")}`);
        }
        lines.push(SEP);
        lines.push(`🔗 ${shortUrl(data.pageUrl)}`);
        return lines.join("\n");
    }
    const show = entries.slice(0, 3);
    show.forEach((e, i) => {
        if (i > 0) lines.push("");
        if (entries.length > 1) lines.push(`*${e.variant || `Variant ${i + 1}`}*`);
        lines.push(`${icon} *Rating:* ${clip(e.rating || e.text, 350)}`);
        const feats = e.feats || [];
        if (feats.length) {
            lines.push(`*Feats:*`);
            feats.slice(0, 5).forEach((f) => lines.push(`• ${clip(f, 230)}`));
        }
        (e.calcs || []).slice(0, 2).forEach((c) => lines.push(`📄 calc: ${clip(c.title, 90)}`));
    });
    if (entries.length > show.length) {
        lines.push("");
        lines.push(`_+${entries.length - show.length} more variant(s) not shown._`);
    }
    lines.push(SEP);
    // quick-menu of other categories present
    const others = FULL_CARD_ORDER.filter((c) => c !== category && data.stats.has(c)).slice(0, 8);
    if (others.length) {
        lines.push(`_Other stats:_ ${others.map((c) => `*${CATEGORY_SHORT[c] || c.toLowerCase()}*`).join(" · ")}`);
        lines.push(`_e.g._ *.${global.__PS_PREFIX || "j"} powerscale ${CATEGORY_SHORT[others[0]] || others[0].toLowerCase()} ${clip(fmtName(data), 28)}*`);
    }
    return lines.join("\n").slice(0, LINE_LIMIT);
}

/**
 * Search results list (kept from the old flow, restyled)
 */
function formatListMessage(query, characters, category) {
    const lines = [];
    lines.push(`🔍 *${characters.length} match${characters.length > 1 ? "es" : ""} for "${clip(query, 40)}"*`);
    if (category) lines.push(`_category locked: *${category}* — pick a character to see their ${category.toLowerCase()}_`);
    lines.push("");
    characters.slice(0, 10).forEach((c) => lines.push(`*${c.id}.* ${clip(c.name, 60)}`));
    lines.push("");
    lines.push(`_Reply with a *number* (1-${Math.min(characters.length, 10)}) within 5 minutes._`);
    return lines.join("\n");
}

// ---------- data resolution (MW first, Go fallback) ----------

async function searchWithFallback(query) {
    try {
        const chars = await vsb.searchCharacters(query, 10);
        if (chars && chars.length) return chars;
    } catch (e) {
        console.log(`[Powerscale] MW search failed (${e.message}), trying Go service`);
    }
    try {
        const data = await goService.searchPowerscale(query);
        if (data && data.characters && data.characters.length) return data.characters;
    } catch (e) {
        console.log(`[Powerscale] Go search failed too: ${e.message}`);
    }
    return [];
}

async function parseWithFallback(character) {
    // primary: direct MediaWiki parse (feats + reliable, no 60s hangs)
    try {
        const data = await vsb.parseCharacter(character.url);
        if (data && data.stats && data.stats.size > 0) return data;
        if (data && data.isVerse) return data; // verse page: handled gracefully by caller
    } catch (e) {
        console.log(`[Powerscale] MW parse failed (${e.message}), trying Go service`);
    }
    // fallback: Go service (no feats, but better than nothing)
    try {
        const go = await goService.fetchPowerscalePage(character.url);
        if (go && go.stats) {
            const stats = new Map();
            for (const [k, v] of Object.entries(go.stats)) {
                if (v) stats.set(k, [{ variant: "", text: String(v), rating: String(v), feats: [], calcs: [] }]);
            }
            return {
                name: go.name,
                pageUrl: go.pageUrl || character.url,
                imageUrl: go.imageUrl,
                imageUrls: [],
                summary: go.summary || "",
                keyLine: "",
                stats,
                categories: [...stats.keys()],
                isVerse: false,
            };
        }
    } catch (e) {
        console.log(`[Powerscale] Go fetch failed too: ${e.message}`);
    }
    return null;
}

// ---------- entry: run the whole command ----------

/**
 * Handle ".j powerscale ..." end-to-end (search/list/auto-pick/card/image).
 * @param {Object} ctx { sock, chatId, msgKey, raw, botMarker, prefix }
 * @returns {Promise<void>}
 */
async function runPowerscaleCommand(ctx) {
    const { sock, chatId, msgKey, botMarker } = ctx;
    global.__PS_PREFIX = String(ctx.prefix || "j").replace(/^\./, "");
    const react = (t) => sock.sendMessage(chatId, { react: { text: t, key: msgKey } }).catch(() => {});

    const { category, featsOverview, query } = vsb.splitCategory(ctx.raw);

    if (!query) {
        return sendUsageCard(sock, chatId, botMarker);
    }

    await react("🔍");
    await sock.sendMessage(chatId, {
        text: `${botMarker}🔍 *VS Battles* — searching _"${clip(query, 40)}"_${category ? ` · category *${category}*` : ""}…`,
    });

    let result;
    try {
        result = await resolveFlow(query, category, featsOverview);
    } catch (err) {
        console.error("[Powerscale] resolveFlow failed:", err.message);
        await react("❌");
        return sock.sendMessage(chatId, { text: `${botMarker}❌ VS Battles lookup failed — try again in a moment.` });
    }

    if (!result.success) {
        await react("❌");
        return sock.sendMessage(chatId, { text: `${botMarker}❌ ${result.error}` });
    }

    if (result.mode === "list") {
        // register pick session so numeric replies select a character
        pendingSelections.set(chatId, {
            phase: "pick",
            characters: result.characters,
            category: category || null,
            query,
            pickedId: 0,
            timestamp: now(),
        });
        armAutoClear(chatId);
        await react("📋");
        return sock.sendMessage(chatId, { text: `${botMarker}${result.message}` });
    }

    // mode === "card" — remember the search so numeric replies can switch
    // characters while the session is fresh ("picked #1 — reply 2-9 ...")
    if (result.characters && result.characters.length > 1) {
        pendingSelections.set(chatId, {
            phase: "view",
            characters: result.characters,
            data: result.data,
            category: category || null,
            query,
            pickedId: result.pickedId || 1,
            timestamp: now(),
        });
        armAutoClear(chatId);
    }

    await react("⚖️");
    await sendCard(sock, chatId, botMarker, result);
    await react("✅");
}

async function sendUsageCard(sock, chatId, botMarker) {
    const lines = [
        "⚖️ *POWERSCALE*",
        SEP,
        `*powerscale <name>* — full stat card + image`,
        `*powerscale speed <name>* — speed feats (pick from matches first)`,
        "",
        `*Categories:* tier · ap · speed · dur · strike · lift · stam · range · intel · gear · weakness · hax · techniques`,
        `_category can go before OR after the name_`,
        `_spaced_ *power scale <name>* _works too_`,
        SEP,
        `🔗 vsbattles.fandom.com`,
    ];
    return sock.sendMessage(chatId, { text: `${botMarker}${lines.join("\n")}` });
}

/**
 * Resolve a query into: list mode, or a ready card.
 */
async function resolveFlow(query, category, featsOverview) {
    const characters = await searchWithFallback(query);
    if (!characters.length) {
        return { success: false, error: `No VS Battles results for "${clip(query, 40)}". Check the spelling?` };
    }

    // Mellow rule (2026-10-18): NEVER auto-pick when several characters match —
    // category/feats queries included ("randomly selecting a character won't
    // work, which is why we had that system in the first place"). Always show
    // the numbered pick list; the ONLY auto-pick case is a single result.
    const autoPick = characters.length === 1;

    if (!autoPick) {
        return { success: true, mode: "list", message: formatListMessage(query, characters, category), characters };
    }

    const data = await parseWithFallback(top);
    if (!data) {
        return { success: false, error: `Found *${top.name}* but the page parse failed. Try another result: reply 1-${characters.length}.` };
    }
    return buildCardResult({ characters, data, category: category || null, featsOverview, pickedId: top.id });
}

/**
 * Build { mode:'card', ... } payload from parsed data.
 * featsOverview=true -> compact menu card listing which stats exist.
 */
function buildCardResult({ characters, data, category, featsOverview, pickedId }) {
    const base = {
        success: true,
        mode: "card",
        name: data.name,
        pageUrl: data.pageUrl,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        characters,
        pickedId: pickedId || 1,
        category: category || null,
        autoPickHint:
            characters.length > 1
                ? `_picked #${pickedId || 1} — reply *2-${Math.min(characters.length, 10)}* for another match_`
                : null,
    };
    if (featsOverview || (data.isVerse && (!category || !data.stats.has(category)))) {
        const lines = [];
        lines.push(`⚖️ *${fmtName(data).toUpperCase()}*${data.isVerse ? " _ (no standard stat block — verse/item page)_" : ""}`);
        lines.push(SEP);
        const cats = FULL_CARD_ORDER.filter((c) => data.stats.has(c));
        if (cats.length) {
            lines.push(`*Stats on this page:*`);
            for (const c of cats) {
                const e = data.stats.get(c)[0];
                lines.push(`${vsb.CATEGORY_ICONS[c] || "▫️"} *${c}:* ${clip(e.rating || e.text, 100)}`);
            }
            lines.push("");
            lines.push(`_Drill in:_ *powerscale ${cats[0].split(" ")[0].toLowerCase()} ${clip(fmtName(data), 28)}*`);
        } else if (data.summary) {
            lines.push(`📖 ${clip(data.summary, 500)}`);
        } else {
            lines.push(`_Nothing powerscale-shaped on this page._`);
        }
        lines.push(SEP);
        lines.push(`🔗 ${shortUrl(data.pageUrl)}`);
        base.message = lines.join("\n").slice(0, LINE_LIMIT);
        base.detail = null;
        return base;
    }
    if (category) {
        base.message = formatCategoryCard(data, category);
        base.detail = null;
        base.data = data;
        return base;
    }
    base.message = formatFullCard(data);
    base.detail = formatFullDetail(data);
    base.data = data;
    return base;
}

// ---------- card sender (image via relay chain) ----------

async function sendCard(sock, chatId, botMarker, result) {
    let imagePayload = null;
    const candidates = [result.imageUrl, ...(result.imageUrls || [])].filter(Boolean).slice(0, 3);
    for (const url of candidates) {
        const got = await vsb.fetchImageBuffer(url, 640);
        if (got) {
            imagePayload = got;
            break;
        }
    }

    // WA caption cap is 1024 chars - compact the caption when the card is long
    let caption = `${botMarker}${result.message}`;
    if (imagePayload && caption.length > 1000) {
        caption = compactCaption(result, botMarker);
    }
    if (imagePayload) {
        try {
            await sock.sendMessage(chatId, { image: imagePayload.buffer, caption });
            if (result.detail) {
                await sock.sendMessage(chatId, { text: `${botMarker}${result.detail}` });
            }
            if (result.autoPickHint) {
                await sock.sendMessage(chatId, { text: `${botMarker}${result.autoPickHint}` });
            }
            return;
        } catch (e) {
            console.log(`[Powerscale] image send failed (${e.message}) - falling back to text`);
        }
    }
    // text-only (image unavailable or send failed)
    const text = result.detail
        ? `${result.message}\n${SEP}\n${result.detail}`
        : result.message;
    await sock.sendMessage(chatId, { text: `${botMarker}${text}`.slice(0, 6000) });
    if (result.autoPickHint) {
        await sock.sendMessage(chatId, { text: `${botMarker}${result.autoPickHint}` });
    }
}

// short caption used when the full card doesn't fit next to an image
function compactCaption(result, botMarker) {
    const data = result.data;
    const lines = [];
    lines.push("⚖️ *POWER SCALE*");
    lines.push(`*${fmtName(data)}*`);
    lines.push(SEP);
    for (const label of ["Tier", "Attack Potency", "Speed", "Durability"]) {
        const e = (data.stats.get(label) || [])[0];
        if (e) {
            const icon = vsb.CATEGORY_ICONS[label] || "▫️";
            const short = label === "Attack Potency" ? "AP" : label;
            lines.push(`${icon} *${short}:* ${clip(e.rating || e.text, 100)}`);
        }
    }
    lines.push(SEP);
    lines.push("💬 full stat block in the next message");
    return `${botMarker}${lines.join("\n")}`.slice(0, 1000);
}

// ---------- numeric selection flow ----------

/**
 * Numeric reply router.
 *  - phase "pick": user picked a character from the search list
 *  - phase "view": user wants a DIFFERENT character from the last search
 * @returns {Promise<Object|null>} null when no pending session
 */
async function handlePowerscaleSelection(chatId, selection) {
    const session = pendingSelections.get(chatId);
    if (!session) return null;

    if (now() - session.timestamp > SELECTION_TIMEOUT_MS) {
        clearPending(chatId);
        return { success: false, error: "Selection timed out — search again!" };
    }
    touch(session);

    const idx = parseInt(selection, 10);
    if (isNaN(idx) || idx < 1 || idx > Math.min(session.characters.length, 10)) {
        return {
            success: false,
            error: `Pick a number between 1 and ${Math.min(session.characters.length, 10)}.`,
        };
    }

    const chosen = session.characters[idx - 1];
    session.pickedId = idx;

    // already showing this exact character? just re-prompt category usage
    if (session.phase === "view" && session.data && session.data.name === chosen.name) {
        return { success: true, mode: "card", ...buildCardResult(session) };
    }

    const data = await parseWithFallback(chosen);
    if (!data) {
        return { success: false, error: `Failed to parse *${chosen.name}*. Try another number.` };
    }
    session.phase = "view";
    session.data = data;
    session.name = chosen.name;
    return buildCardResult({ characters: session.characters, data, category: session.category, pickedId: idx });
}

function hasPendingSelection(chatId) {
    const s = pendingSelections.get(chatId);
    if (!s) return false;
    if (now() - s.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return false;
    }
    return true;
}

module.exports = {
    getPowerScale,
    handlePowerscaleSelection,
    hasPendingSelection,
    runPowerscaleCommand,
    buildCardResult,
    sendCard,
    resolveFlow,
    // internals exposed for QA
    pendingSelections,
    SELECTION_TIMEOUT_MS,
    // legacy stubs (other modules may require these)
    searchVSB,
    scrapeVSBPage,
    formatPowerScale,
};

// ---------- legacy API (kept compatible) ----------

async function getPowerScale(characterName, chatId) {
    try {
        const { category, featsOverview, query } = vsb.splitCategory(characterName);
        const q = query || characterName;
        if (!q) return { success: false, error: "Usage: powerscale <name>" };

        const characters = await searchWithFallback(q);
        if (!characters.length) {
            return { success: false, error: `No results found for "${characterName}"` };
        }
        pendingSelections.set(chatId, {
            phase: "pick",
            characters,
            category: category || null,
            query: q,
            timestamp: now(),
        });
        armAutoClear(chatId);
        return { success: true, message: formatListMessage(q, characters, category), isPending: true };
    } catch (error) {
        console.error("[Powerscale] Search failed:", error.message);
        return { success: false, error: error.message };
    }
}

async function searchVSB(name) {
    return [{ name, url: "" }];
}
async function scrapeVSBPage(url) {
    return {};
}
function formatPowerScale(name, stats, url) {
    return "";
}
