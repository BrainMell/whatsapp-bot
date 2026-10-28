// QA 2026-10-26 — card claim tag, powerscale cosmology flow, charProfile
// extraction, styleJudge heuristic + extractors. OFFLINE: no network. The
// cosmology network layer (vsb.parsePageWithSections / parseSectionText) is
// monkey-patched here; live-network QA runs separately on box2.
// Run: node qa_20261026_features.js

let pass = 0;
let fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "core", "utils");

// ---------- 1. splitCategory markers ----------
section("splitCategory: cosmology / profile / feats / normal")
const vsb = require(path.join(ROOT, "vsbFeats.js"));
let m = vsb.splitCategory("cosmology dragon ball");
ok(m.cosmology === true && m.query === "dragon ball", "marker front: cosmology dragon ball");
m = vsb.splitCategory("dragon ball cosmology");
ok(m.cosmology === true && m.query === "dragon ball", "marker back: dragon ball cosmology");
m = vsb.splitCategory("cosmo goku");
ok(m.cosmology === true && m.query === "goku", "alias cosmo front");
m = vsb.splitCategory("profile goku");
ok(m.profileMode === true && m.query === "goku", "marker front: profile goku");
m = vsb.splitCategory("goku profile");
ok(m.profileMode === true && m.query === "goku", "marker back: goku profile");
m = vsb.splitCategory("speed goku");
ok(m.category === "Speed" && m.query === "goku" && !m.cosmology && !m.profileMode, "category still works");
m = vsb.splitCategory("goku feats");
ok(m.featsOverview === true && m.query === "goku", "feats marker unchanged");
m = vsb.splitCategory("cosmology");
ok(m.cosmology === true && m.query === "", "bare cosmology marker -> empty query (usage card)");
m = vsb.splitCategory("goku");
ok(!m.cosmology && !m.profileMode && m.query === "goku", "plain query untouched");

// ---------- 2. cosmology flow (mocked network) ----------
section("cosmology two-level flow via handlePowerscaleSelection (mock parse)")
const ps = require(path.join(ROOT, "powerscale.js"));
const fixtureData = {
    name: "Dragon Ball Cosmology (Canon, Yang)",
    pageUrl: "https://vsbattles.fandom.com/wiki/User_blog:Yang/Dragon_Ball_Cosmology",
    isBlog: true,
    imageUrl: null,
    overview: "The Dragon Ball cosmology contains seven universes, a demon realm and the World of Void.",
    sections: [
        { index: "1", level: 2, line: "Macrocosm structure" },
        { index: "2", level: 2, line: "Universes 1-12" },
        { index: "3", level: 2, line: "Demon Realm" },
    ],
};
const PAGES = [
    { id: 1, title: "User blog:Yang/Dragon Ball Cosmology", name: "Dragon Ball Cosmology", isBlog: true, snippet: "cosmology writeup", url: "x" },
    { id: 2, title: "Dragon Ball (Verse)", name: "Dragon Ball (Verse)", isBlog: false, snippet: "verse page", url: "y" },
];
let secCalls = 0;
vsb.parsePageWithSections = async (title) => {
    ok(title === PAGES[0].title, `parsePageWithSections got the blog title (${title.slice(0, 40)}…)`);
    return JSON.parse(JSON.stringify(fixtureData));
};
vsb.parseSectionText = async (title, index) => {
    secCalls++;
    ok(title === fixtureData.name && ["1", "2", "3"].includes(index), `parseSectionText(${index}) uses parse title`);
    return { title, index, text: `SECTION ${index} TEXT — twelve universes each with a destroyeronaut.` };
};

const CHAT = "qa-chat-1@g.us";
ps.pendingSelections.set(CHAT, {
    phase: "pick",
    cosmology: true,
    characters: PAGES,
    category: null,
    query: "dragon ball",
    pickedId: 0,
    timestamp: Date.now(),
});

(async () => {
    // level 1: pick page 1 -> menu
    let r = await ps.handlePowerscaleSelection(CHAT, "1");
    ok(r && r.success && r.mode === "card", "level-1 pick returns a card");
    ok(r.message.includes("COSMOLOGY") && r.message.includes("*1.* 🌍 General overview"), "menu lists General overview");
    ok(r.message.includes("*2.* Macrocosm structure") && r.message.includes("*4.* Demon Realm"), "menu lists 3 specific parts (2,3,4)");
    ok(r.cosmoData && r.cosmoData.sections.length === 3, "menu carries cosmoData for session arming");

    // level 2: overview
    r = await ps.handlePowerscaleSelection(CHAT, "1");
    ok(r.success && r.message.includes("COSMOLOGY OVERVIEW"), "reply 1 = general overview card");
    ok(r.message.includes("seven universes"), "overview carries the page lead");

    // level 2: part 3 (Demon Realm = idx-2)
    r = await ps.handlePowerscaleSelection(CHAT, "4");
    ok(r.success && r.message.includes("DEMON REALM"), "reply 4 = Demon Realm section card");
    ok(r.message.includes("SECTION 3 TEXT"), "section text rides the card");
    ok(secCalls === 1, "one section fetch so far");

    // level 2: back to overview, then another part (session stays alive)
    r = await ps.handlePowerscaleSelection(CHAT, "1");
    ok(r.success && r.message.includes("COSMOLOGY OVERVIEW"), "session survives — back to overview");
    r = await ps.handlePowerscaleSelection(CHAT, "3");
    ok(r.success && r.message.includes("UNIVERSES 1-12"), "hopping between parts works");
    ok(secCalls === 2, "second section fetch cached-count check");

    // out of range
    r = await ps.handlePowerscaleSelection(CHAT, "9");
    ok(!r.success && /between 1 and 4/.test(r.error), "out-of-range part pick rejected (max=sections+1)");

    // non-cosmology regression: normal pick flow still parses characters
    vsb.parseCharacter = async () => ({
        name: "Goku", pageUrl: "u", imageUrl: null, imageUrls: [], summary: "s", keyLine: "",
        stats: new Map([["Tier", [{ variant: "", text: "2-A", rating: "2-A", feats: [], calcs: [] }]]]),
        categories: ["Tier"], isVerse: false,
    });
    const CHAT2 = "qa-chat-2@g.us";
    ps.pendingSelections.set(CHAT2, {
        phase: "pick", characters: [{ id: 1, name: "Goku", url: "u" }], category: null, query: "goku", pickedId: 0, timestamp: Date.now(),
    });
    r = await ps.handlePowerscaleSelection(CHAT2, "1");
    ok(r && r.success && r.mode === "card" && r.message.includes("POWER SCALE"), "non-cosmology pick flow unchanged");

    // ---------- 3. charProfile extraction ----------
    section("charProfile: portable infobox extraction")
    const cp = require(path.join(ROOT, "charProfile.js"));
    const FIXTURE = `<div class="mw-parser-output">
<p><aside class="portable-infobox pi-background"><h2 class="pi-title" data-source="name">Son Goku</h2>
<figure class="pi-item pi-image"><img src="https://static.wikia.nocookie.net/dragonball/images/5/50/Goku.png/revision/latest/scale-to-width-down/300" /></figure>
<div class="pi-item pi-data" data-source="alias"><h3 class="pi-data-label">Alias</h3><div class="pi-data-value">Kakarot</div></div>
<div class="pi-item pi-data" data-source="species"><h3 class="pi-data-label">Species</h3><div class="pi-data-value">Saiyan</div></div>
<div class="pi-item pi-data" data-source="status"><h3 class="pi-data-label">Status</h3><div class="pi-data-value">Alive</div></div>
<div class="pi-item pi-data" data-source="relatives"><h3 class="pi-data-label">Relatives</h3><div class="pi-data-value">Gohan (son)<br />Goten (son)</div></div>
<div class="pi-item pi-data" data-source="junk"><h3 class="pi-data-label"><span>Voiced by</span></h3><div class="pi-data-value">Masako Nozawa</div></div>
</aside>
<table class="infobox"><tr><th>Legacy Row</th><td>should be ignored when portable exists</td></tr></table>
<p>Son Goku is the main protagonist of the Dragon Ball manga series and its anime adaptations. He is a Saiyan raised on Earth.</p></div>`;
    const ex = cp.extractProfileFromHtml(FIXTURE);
    ok(ex.fields.length === 5, `portable infobox yields 5 fields (got ${ex.fields.length})`);
    ok(ex.fields.some((f) => f.label === "Alias" && f.value === "Kakarot"), "alias field parsed");
    ok(ex.fields.some((f) => f.label === "Relatives" && f.value.includes("Gohan (son) · Goten (son)")), "multi-line <br> -> ' · ' join");
    ok(ex.fields.some((f) => f.label === "Voiced by" && f.value === "Masako Nozawa"), "label with inner tags parsed");
    ok(!ex.fields.some((f) => f.label === "Legacy Row"), "legacy table ignored when portable infobox exists");
    ok((ex.imageUrl || "").includes("dragonball/images"), "infobox figure image captured");
    ok(ex.description.startsWith("Son Goku is the main protagonist"), "description = first real paragraph");

    section("charProfile: legacy infobox fallback")
    const LEGACY = `<table class="infobox"><caption>Goku</caption>
<tr><th scope="row">Alias</th><td>Kakarot</td></tr>
<tr><th scope="row">Species</th><td>Saiyan</td></tr></table>
<p>A Saiyan warrior raised on Earth who defends it from incoming threats repeatedly across sagas.</p>`;
    const ex2 = cp.extractProfileFromHtml(LEGACY);
    ok(ex2.fields.length === 2 && ex2.fields[0].label === "Alias", "legacy table rows parsed as fields");
    ok(ex2.description.startsWith("A Saiyan warrior"), "legacy path description works");

    section("charProfile: pin + dedupe + field caps")
    const pin = cp.findPinnedWiki("naruto itachi".split(" "));
    ok(pin && pin.wiki.domain === "naruto.fandom.com" && pin.name === "itachi", "pin: 'naruto itachi' -> naruto wiki + itachi");
    const pin2 = cp.findPinnedWiki("itachi from naruto".split(" "));
    ok(pin2 && pin2.wiki.domain === "naruto.fandom.com" && pin2.name === "itachi from", "franchise word stripped mid-query");
    ok(cp.findPinnedWiki("goku".split(" ")) === null, "no pin when only a name (auto-detect path)");

    // card format
    const cardMsg = cp.formatProfileCard({
        name: "Son Goku", wikiLabel: "Dragon Ball", wikiDomain: "dragonball.fandom.com",
        pageUrl: "https://dragonball.fandom.com/wiki/Son_Goku",
        imageUrl: null,
        fields: ex.fields.slice(0, 12),
        description: ex.description,
    }, "_💡 reply *2-4* to see another match_");
    ok(cardMsg.includes("*CHARACTER PROFILE*") && cardMsg.includes("Son Goku"), "profile card header + name");
    ok(cardMsg.includes("dragonball.fandom.com") && cardMsg.includes("reply *2-4*"), "wiki label + switch hint");
    ok(cardMsg.length < 3500, "card under LINE_LIMIT");

    // ---------- 4. styleJudge offline ----------
    section("styleJudge: heuristic judge + extractors")
    const sj = require(path.join(ROOT, "styleJudge.js"));
    const bodies = ["yo who tryna raid later", "LMAOOO bro that boss was NOT ready 😂😂", "im fr gonna hit level 50 today", "nah bruh the drop rate is cooked", "someone carry me pls ?"];
    const card = sj.heuristicJudge(bodies, "@Tester");
    ok(card.includes("⚖️ *STYLE JUDGE* — @Tester"), "heuristic card header + subject");
    ok(/📊 Overall: \d(\.\d)?\/10/.test(card), "score line present");
    ok(/Archetype:/.test(card) && /Verdict:/.test(card), "archetype + verdict present");
    ok(card.includes("offline judge mode"), "fallback watermark shown");
    const capsCard = sj.heuristicJudge(["WHY ARE WE YELLING", "THIS GAME IS RIGGED", "WHO MADE THIS BOSS"], "@Loud");
    ok(capsCard.includes("caps lock warrior"), "caps-heavy -> caps lock warrior archetype");

    const msg1 = { message: { extendedTextMessage: { text: "hi", contextInfo: { mentionedJid: ["123@s.whatsapp.net"], quotedMessage: { conversation: "quoted text here to judge" } } } } };
    ok(JSON.stringify(sj.extractMentionedJids(msg1)) === JSON.stringify(["123@s.whatsapp.net"]), "mention extractor (extendedText)");
    ok(sj.extractQuotedText(msg1) === "quoted text here to judge", "quoted text extractor");
    const msg2 = { message: { ephemeralMessage: { message: { imageMessage: { caption: "x", contextInfo: { mentionedJid: ["456@lid"] } } } } } };
    ok(JSON.stringify(sj.extractMentionedJids(msg2)) === JSON.stringify(["456@lid"]), "mention extractor through ephemeral wrapper");

    // LLM judge with NO env key -> null (heuristic path takes over in prod flow)
    const savedKeys = process.env.GROQ_API_KEYS;
    delete process.env.GROQ_API_KEYS;
    sj.judgeWithLLM("sample", "@X").then((llm) => {
        ok(llm === null, "no GROQ key -> judgeWithLLM returns null (heuristic takes over)");
        process.env.GROQ_API_KEYS = savedKeys;

        // ---------- 5. claim tag (string-level) ----------
        section("cardSystem: CLAIMED message tags the claimer")
        const fs = require("fs");
        const csSrc = fs.readFileSync(path.join(__dirname, "..", "..", "core", "rpg", "cardSystem.js"), "utf8");
        ok(csSrc.includes("*CLAIMED by @${economy.getDisplayName(senderJid)}*"), "CLAIMED header carries @DisplayName");
        ok(/CLAIMED by[\s\S]{0,600}mentions: \[senderJid\]/.test(csSrc), "mentions: [senderJid] rides the reply");

        console.log(`\n══════ RESULT: ${pass} passed, ${fail} failed ══════`);
        process.exit(fail ? 1 : 0);
    });
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
